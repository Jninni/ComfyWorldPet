/**
 * Data-driven song player with bar-ahead look-ahead scheduling.
 * Songs are described in scale degrees (see songs.ts); each loop ("pass") gets a
 * freshly varied plan: ornamented melodies, alternate chords/instruments/patterns,
 * layers dropping in and out.
 */
import { Ch, Ctx, Rng, makeChannel, makeRng, gainNode, rampTo } from "./core";
import { DRUMS, DrumName, INSTS, InstName, padChord, wood } from "./instruments";

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

export type LayerKind = "lead" | "arp" | "comp" | "bass" | "pad" | "drums" | "sparkle";

export interface Layer {
  kind: LayerKind;
  inst?: InstName;
  vel?: number;
  pan?: number;
  /** reverb send (0..1) */
  rev?: number;
  /** semitone offset (lead: melody octave) */
  oct?: number;
  /** register floor (arp/comp/pad/sparkle) */
  low?: number;
  high?: number;
  /** patterns (arp/comp/bass tokens; first is the "composed" one) */
  pats?: string[];
  /** drum pattern variants: per-drum strings of x/o/. (one char per step) */
  drums?: Partial<Record<DrumName, string>>[];
  /** drum fill used sometimes on the last bar of a section */
  fill?: Partial<Record<DrumName, string>>;
  density?: number;
  /** restrict to these section names */
  only?: string[];
  /** never in these section names */
  skip?: string[];
  /** first pass this layer may play in */
  minPass?: number;
  /** chance (on passes >= 1) that this layer plays in a given section */
  prob?: number;
  /** alternate instrument chosen with altProb on passes >= 1 (or forced per section via altIn) */
  alt?: InstName;
  /** level for the alternate instrument (replaces `vel`) */
  altVel?: number;
  altProb?: number;
  altIn?: string[];
  legato?: number;
  /** pad brightness multiplier */
  bright?: number;
  /** woodblock pitch for drums layer */
  woodHz?: number;
}

export interface Section {
  name: string;
  /** chords per bar: "deg[:opts]" opts: 7 (add 7th), 9 (add 9th), s (sus4), 2 (sus2) */
  chords: string[];
  /** melody tokens: degree numbers (0 = key root, 7 = octave), "-" hold, "." rest, "|" ignored. # / b suffix = accidental */
  mel?: string;
  /** chord substitutions that may be used on later passes */
  alt?: string[];
  /** only on the first pass (intros) */
  once?: boolean;
}

export interface Song {
  key: number;
  scale: number[];
  bpm: number;
  beats: number;
  /** steps per beat (2 = eighths, 4 = sixteenths) */
  div: number;
  swing: number;
  /** master gain for this track (loudness balancing) */
  gain: number;
  /** reverb multiplier for this track */
  rev: number;
  sections: Section[];
  layers: Layer[];
}

// ---------------------------------------------------------------- parsing helpers
export function degToMidi(song: Song, deg: number, acc = 0): number {
  const n = song.scale.length;
  const o = Math.floor(deg / n);
  const i = ((deg % n) + n) % n;
  return song.key + o * 12 + song.scale[i] + acc;
}

export interface Chord {
  root: number;
  degs: number[];
  name: string;
}
export function parseChord(s: string): Chord {
  const [r, opts = ""] = s.split(":");
  const root = parseInt(r, 10) || 0;
  let degs = [root, root + 2, root + 4];
  if (opts.includes("s")) degs[1] = root + 3;
  if (opts.includes("2")) degs[1] = root + 1;
  if (opts.includes("7")) degs.push(root + 6);
  if (opts.includes("9")) degs.push(root + 8);
  degs = degs.map((d) => d);
  return { root, degs, name: s };
}

export interface MelNote {
  step: number;
  len: number;
  deg: number;
  acc: number;
  grace?: boolean;
}

export function tokens(s: string): string[] {
  return s.split(/\s+/).filter((x) => x && x !== "|");
}

export function parseMel(s: string): MelNote[] {
  const out: MelNote[] = [];
  let cur: MelNote | null = null;
  tokens(s).forEach((tk, step) => {
    if (tk === "-") {
      if (cur) cur.len++;
      return;
    }
    if (tk === ".") {
      cur = null;
      return;
    }
    let acc = 0;
    let body = tk;
    if (body.endsWith("#")) {
      acc = 1;
      body = body.slice(0, -1);
    } else if (body.endsWith("b") && body.length > 1) {
      acc = -1;
      body = body.slice(0, -1);
    }
    const deg = parseInt(body, 10);
    if (Number.isNaN(deg)) {
      cur = null;
      return;
    }
    cur = { step, len: 1, deg, acc };
    out.push(cur);
  });
  return out;
}

/** all midi notes of a chord's pitch classes inside [low, low+span) ascending */
export function chordTones(song: Song, ch: Chord, low: number, span = 36): number[] {
  const pcs = new Set(ch.degs.map((d) => ((degToMidi(song, d) % 12) + 12) % 12));
  const out: number[] = [];
  for (let m = low; m < low + span; m++) if (pcs.has(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

export function bassRoot(song: Song, deg: number): number {
  let m = degToMidi(song, deg);
  while (m >= 52) m -= 12;
  while (m < 40) m += 12;
  return m;
}

// ---------------------------------------------------------------- variation
function varyMelody(src: MelNote[], r: Rng, pass: number): MelNote[] {
  if (pass === 0) return src.map((n) => ({ ...n }));
  const out: MelNote[] = [];
  const maxDeg = Math.max(...src.map((n) => n.deg), 0);
  const octUp = r() < 0.2 && maxDeg + 7 <= 14 ? 7 : 0;
  for (let i = 0; i < src.length; i++) {
    const n = { ...src[i], deg: src[i].deg + octUp };
    const next = src[i + 1];
    const gapOk = next && next.step === src[i].step + src[i].len;
    const x = r();
    if (gapOk && n.len >= 2 && Math.abs(next.deg - src[i].deg) === 2 && x < 0.35) {
      // passing tone
      const half = Math.floor(n.len / 2);
      out.push({ ...n, len: n.len - half });
      out.push({ step: n.step + n.len - half, len: half, deg: (src[i].deg + next.deg) / 2 + octUp, acc: 0 });
      continue;
    }
    if (n.len >= 2 && x > 0.86) {
      // rhythmic repeat
      const half = Math.floor(n.len / 2);
      out.push({ ...n, len: n.len - half });
      out.push({ ...n, step: n.step + n.len - half, len: half });
      continue;
    }
    if (i > 0 && r() < 0.1) n.grace = true;
    out.push(n);
  }
  return out;
}

// ---------------------------------------------------------------- plan
interface LayerPlan {
  on: boolean;
  inst: InstName;
  pat: number;
  /** note velocity multiplier (alternate instrument level compensation) */
  vm: number;
}
interface SectionPlan {
  sec: Section;
  chords: Chord[];
  mel: MelNote[];
  layers: LayerPlan[];
}

export interface TrackOut {
  dry: AudioNode;
  rev: AudioNode;
}

export class SongPlayer {
  readonly ctx: Ctx;
  readonly song: Song;
  private r: Rng;
  private out: GainNode;
  private revOut: GainNode;
  private chans: Ch[];
  private plan: SectionPlan[] = [];
  private pass = 0;
  private secIdx = 0;
  private barInSec = 0;
  private nextBar: number;
  private stepDur: number;
  private spb: number;
  private stopAt = Infinity;
  private melCache = new Map<Section, MelNote[]>();
  /** global bar counter (for debugging/tests) */
  bar = 0;

  constructor(ctx: Ctx, song: Song, dest: TrackOut, startAt: number, fadeIn = 1.5, seed = (Math.random() * 1e9) | 0) {
    this.ctx = ctx;
    this.song = song;
    this.r = makeRng(seed);
    this.out = gainNode(ctx, 0);
    this.revOut = gainNode(ctx, 0);
    this.out.connect(dest.dry);
    this.revOut.connect(dest.rev);
    const g = song.gain;
    const t0 = Math.max(ctx.currentTime, startAt);
    for (const p of [this.out.gain, this.revOut.gain]) {
      p.setValueAtTime(0, t0);
      p.linearRampToValueAtTime(g * (p === this.revOut.gain ? song.rev : 1), t0 + Math.max(0.01, fadeIn));
    }
    this.chans = song.layers.map((l) =>
      makeChannel(ctx, this.out, this.revOut, { pan: l.pan ?? 0, rev: l.rev ?? 0.2, gain: l.vel ?? 1 }),
    );
    this.stepDur = 60 / song.bpm / song.div;
    this.spb = song.beats * song.div;
    this.nextBar = startAt;
    this.buildPlan();
  }

  get barDur() {
    return this.stepDur * this.spb;
  }

  /** schedule every bar that starts before `until` */
  scheduleUntil(until: number) {
    // if the clock jumped far ahead (e.g. throttled timer), re-anchor rather than piling up late notes
    if (this.nextBar < this.ctx.currentTime - 0.05) {
      const missed = Math.ceil((this.ctx.currentTime + 0.05 - this.nextBar) / this.barDur);
      for (let i = 0; i < missed; i++) this.advance();
      this.nextBar += missed * this.barDur;
    }
    while (this.nextBar < until && this.nextBar < this.stopAt) {
      this.scheduleBar(this.nextBar);
      this.nextBar += this.barDur;
      this.advance();
    }
  }

  fadeOut(dur: number) {
    const t = this.ctx.currentTime;
    rampTo(this.out.gain, this.ctx, 0, dur, t);
    rampTo(this.revOut.gain, this.ctx, 0, dur, t);
    this.stopAt = t + dur;
  }

  /** true once faded out and safe to dispose */
  get finished() {
    return this.ctx.currentTime > this.stopAt + 0.1;
  }

  dispose() {
    for (const c of this.chans) c.dispose();
    try {
      this.out.disconnect();
      this.revOut.disconnect();
    } catch {
      /* ignore */
    }
  }

  // --------------------------------------------------------------
  private advance() {
    this.bar++;
    this.barInSec++;
    if (this.barInSec >= this.plan[this.secIdx].chords.length) {
      this.barInSec = 0;
      this.secIdx++;
      if (this.secIdx >= this.plan.length) {
        this.pass++;
        this.secIdx = 0;
        this.buildPlan();
      }
    }
  }

  private buildPlan() {
    const { song, r, pass } = this;
    const secs = song.sections.filter((s) => pass === 0 || !s.once);
    this.plan = secs.map((sec) => {
      const chordsSrc = pass > 0 && sec.alt && r() < 0.35 ? sec.alt : sec.chords;
      let base = this.melCache.get(sec);
      if (!base) this.melCache.set(sec, (base = sec.mel ? parseMel(sec.mel) : []));
      const layers = song.layers.map((l): LayerPlan => {
        let on = true;
        if (l.only && !l.only.includes(sec.name)) on = false;
        if (l.skip && l.skip.includes(sec.name)) on = false;
        if ((l.minPass ?? 0) > pass) on = false;
        if (on && pass > 0 && l.prob !== undefined && r() > l.prob) on = false;
        let inst = l.inst ?? "marimba";
        let vm = 1;
        if (l.alt && ((l.altIn && l.altIn.includes(sec.name) && pass > 0) || (pass > 0 && r() < (l.altProb ?? 0)))) {
          inst = l.alt;
          vm = (l.altVel ?? l.vel ?? 1) / (l.vel ?? 1);
        }
        const nPats = l.pats?.length ?? l.drums?.length ?? 1;
        const pat = pass === 0 ? 0 : Math.floor(r() * nPats);
        return { on, inst, pat, vm };
      });
      return { sec, chords: chordsSrc.map(parseChord), mel: varyMelody(base, r, pass), layers };
    });
  }

  private stepTime(t0: number, step: number) {
    const sw = step % 2 === 1 ? this.song.swing * this.stepDur : 0;
    return t0 + step * this.stepDur + sw;
  }

  private hum() {
    return (this.r() - 0.5) * 0.01;
  }
  private vm = 1;
  private hv(v: number) {
    return v * this.vm * (0.9 + this.r() * 0.18);
  }

  private scheduleBar(t0: number) {
    const { song, r, spb, stepDur } = this;
    const sp = this.plan[this.secIdx];
    const bi = this.barInSec;
    const chord = sp.chords[bi];
    const nextChord = sp.chords[bi + 1] ?? this.plan[(this.secIdx + 1) % this.plan.length]?.chords[0] ?? chord;
    const lastBarOfSec = bi === sp.chords.length - 1;

    song.layers.forEach((l, li) => {
      const lp = sp.layers[li];
      if (!lp.on) return;
      const ch = this.chans[li];
      const play = INSTS[lp.inst];
      this.vm = lp.vm;
      switch (l.kind) {
        case "lead": {
          const from = bi * spb;
          for (const n of sp.mel) {
            if (n.step < from || n.step >= from + spb) continue;
            const s = n.step - from;
            const t = this.stepTime(t0, s) + this.hum();
            const m = degToMidi(song, n.deg, n.acc) + (l.oct ?? 12);
            const accent = s % song.div === 0 ? 1 : 0.85;
            const dur = n.len * stepDur * (l.legato ?? 0.92);
            if (n.grace && t - 0.06 > t0 - 0.05) play(ch, t - 0.055, degToMidi(song, n.deg + 1) + (l.oct ?? 12), 0.06, 0.45 * lp.vm);
            play(ch, t, m, dur, this.hv(accent));
          }
          break;
        }
        case "arp": {
          const tones = chordTones(song, chord, l.low ?? 60);
          const pat = tokens(l.pats![lp.pat]);
          let cur: { s: number; i: number; len: number } | null = null;
          const notes: { s: number; i: number; len: number }[] = [];
          for (let s = 0; s < spb; s++) {
            const tk = pat[s % pat.length];
            if (tk === "-") {
              if (cur) cur.len++;
            } else if (tk === ".") cur = null;
            else notes.push((cur = { s, i: parseInt(tk, 10) || 0, len: 1 }));
          }
          for (const n of notes) {
            if (song.div >= 4 && this.pass > 0 && r() < 0.06) continue; // occasional breath
            const m = tones[Math.min(n.i, tones.length - 1)];
            play(ch, this.stepTime(t0, n.s) + this.hum(), m, n.len * stepDur, this.hv(n.s % song.div === 0 ? 1 : 0.8));
          }
          break;
        }
        case "comp": {
          const tones = chordTones(song, chord, l.low ?? 58).slice(0, Math.min(4, chord.degs.length));
          const pat = tokens(l.pats![lp.pat]);
          for (let s = 0; s < spb; s++) {
            const tk = pat[s % pat.length];
            if (tk !== "x" && tk !== "o") continue;
            let len = 1;
            while (pat[(s + len) % pat.length] === "-" && s + len < spb) len++;
            const t = this.stepTime(t0, s) + this.hum();
            const v = this.hv(tk === "x" ? 1 : 0.6);
            tones.forEach((m, k) => play(ch, t + k * 0.012, m, len * stepDur, v));
          }
          break;
        }
        case "bass": {
          const root = bassRoot(song, chord.root);
          const fifth = root + (degToMidi(song, chord.root + 4) - degToMidi(song, chord.root));
          const third = root + (degToMidi(song, chord.degs[1]) - degToMidi(song, chord.root));
          const nRoot = bassRoot(song, nextChord.root);
          const pat = tokens(l.pats![lp.pat]);
          for (let s = 0; s < spb; s++) {
            const tk = pat[s % pat.length];
            if (tk === "-" || tk === ".") continue;
            let len = 1;
            while (pat[(s + len) % pat.length] === "-" && s + len < spb) len++;
            let m = root;
            if (tk === "5") m = fifth;
            else if (tk === "8") m = root + 12;
            else if (tk === "3") m = third;
            else if (tk === "a") {
              // diatonic approach into next bar's root
              const below = bassRoot(song, nextChord.root - 1);
              m = Math.abs(below - root) < 7 ? below : nRoot + 2;
            }
            play(ch, this.stepTime(t0, s) + this.hum(), m, len * stepDur * 0.9, this.hv(s === 0 ? 1 : 0.85));
          }
          break;
        }
        case "pad": {
          // hold through repeated chords
          if (bi > 0 && sp.chords[bi - 1].name === chord.name) break;
          let run = 1;
          while (bi + run < sp.chords.length && sp.chords[bi + run].name === chord.name) run++;
          const tones = chordTones(song, chord, l.low ?? 52).slice(0, Math.min(4, chord.degs.length));
          padChord(ch, t0, tones, run * this.barDur + 0.05, 1, l.bright ?? 1);
          break;
        }
        case "drums": {
          const useFill = lastBarOfSec && l.fill && this.pass > 0 && r() < 0.4;
          const pats = useFill ? l.fill! : l.drums![lp.pat];
          for (const [name, p] of Object.entries(pats) as [DrumName, string][]) {
            const steps = p.replace(/\s+/g, "");
            const fn = DRUMS[name];
            for (let s = 0; s < spb; s++) {
              const c = steps[s % steps.length];
              if (c !== "x" && c !== "o") continue;
              if (name === "shaker" && this.pass > 0 && r() < 0.08) continue;
              const v = this.hv(c === "x" ? 1 : 0.55);
              const t = this.stepTime(t0, s) + this.hum();
              if (name === "wood") wood(ch, t, v, l.woodHz ?? 1150);
              else fn(ch, t, v);
            }
          }
          break;
        }
        case "sparkle": {
          const tones = chordTones(song, chord, l.low ?? 84, (l.high ?? 100) - (l.low ?? 84));
          if (!tones.length) break;
          for (let s = 0; s < spb; s++) {
            if (r() >= (l.density ?? 0.05)) continue;
            const m = tones[Math.floor(r() * tones.length)];
            play(ch, this.stepTime(t0, s) + this.hum(), m, stepDur, 0.35 + r() * 0.45);
          }
          break;
        }
      }
    });
  }
}
