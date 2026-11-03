/**
 * Sound effects, jingles, minigame notes and critter voices.
 * All builders take a destination channel (sfx dry + reverb send) and a start time,
 * so they work identically in a live AudioContext and an OfflineAudioContext.
 */
import { Ch, Ctx, Wave, clamp, filter, gainNode, makeChannel, mtof, noiseSrc, nyq, osc, perc } from "./core";
import { INSTS, InstName, kick, wood, shaker, padChord } from "./instruments";
import { MINIGAME_KEY } from "./songs";

export type SfxName =
  | "click" | "confirm" | "back" | "step" | "talk" | "pop" | "sparkle" | "success" | "fail"
  | "heart" | "whoosh" | "door" | "pickup" | "coin" | "jump" | "splash" | "chime" | "levelup"
  | "build" | "tame" | "bubble" | "countdown" | "go" | "miss" | "quest";
export type JingleName = "victory" | "newfriend" | "questdone" | "fanfare";

export interface SfxOut {
  ctx: Ctx;
  dry: AudioNode;
  rev: AudioNode;
}

const R = Math.random;
const rr = (a: number, b: number) => a + R() * (b - a);

/** one-shot channel for an sfx: volume + pan + reverb send */
function chan(o: SfxOut, vol: number, rev = 0.15, pan = 0): Ch {
  return makeChannel(o.ctx, o.dry, o.rev, { gain: vol, rev, pan });
}

interface ToneOpts {
  type?: Wave;
  f: number;
  /** end frequency (exponential glide over `glide` s) */
  f2?: number;
  glide?: number;
  a?: number;
  d: number;
  peak: number;
  /** vibrato [rateHz, depthCents] */
  vib?: [number, number];
  lp?: number;
}
function tone(ch: Ch, t: number, o: ToneOpts): number {
  const { ctx } = ch;
  const g = gainNode(ctx);
  const end = perc(g.gain, t, o.peak, o.a ?? 0.004, o.d);
  const s = osc(ctx, o.type ?? "sine", o.f, t, end);
  s.frequency.setValueAtTime(o.f, t);
  if (o.f2) s.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide ?? o.d * 0.5));
  if (o.vib) {
    const l = osc(ctx, "sine", o.vib[0], t, end);
    const lg = gainNode(ctx, o.vib[1]);
    l.connect(lg).connect(s.detune);
  }
  let src: AudioNode = s;
  if (o.lp) src = src.connect(filter(ctx, "lowpass", o.lp, 0.5));
  src.connect(g).connect(ch.in);
  return end;
}

interface NoiseOpts {
  type?: BiquadFilterType;
  f: number;
  f2?: number;
  glide?: number;
  q?: number;
  a?: number;
  d: number;
  peak: number;
}
function noise(ch: Ch, t: number, o: NoiseOpts): number {
  const { ctx } = ch;
  const g = gainNode(ctx);
  const end = perc(g.gain, t, o.peak, o.a ?? 0.003, o.d);
  const n = noiseSrc(ctx, t, end);
  const f = filter(ctx, o.type ?? "bandpass", o.f, o.q ?? 1);
  if (o.f2) {
    f.frequency.setValueAtTime(nyq(ctx, o.f), t);
    f.frequency.exponentialRampToValueAtTime(nyq(ctx, o.f2), t + (o.glide ?? o.d * 0.6));
  }
  n.connect(f).connect(g).connect(ch.in);
  return end;
}

/** play a melodic instrument note at a frequency multiplier */
function inst(name: InstName, ch: Ch, t: number, midi: number, p: number, vel: number, dur = 0.3) {
  INSTS[name](ch, t, midi + 12 * Math.log2(p), dur, vel);
}

const C5 = 72;

// ---------------------------------------------------------------- sfx
type SfxFn = (o: SfxOut, t: number, p: number, v: number) => void;

export const SFX: Record<SfxName, SfxFn> = {
  click(o, t, p, v) {
    const ch = chan(o, v * 3, 0.05);
    tone(ch, t, { type: "triangle", f: 1650 * p, f2: 1250 * p, glide: 0.02, a: 0.001, d: 0.045, peak: 0.22, lp: 5000 });
    noise(ch, t, { type: "highpass", f: 6000, d: 0.012, peak: 0.04, a: 0.001 });
  },
  confirm(o, t, p, v) {
    const ch = chan(o, v, 0.15);
    inst("marimba", ch, t, C5 + 7, p, 0.75);
    inst("musicbox", ch, t + 0.075, C5 + 12, p, 0.75);
    inst("marimba", ch, t + 0.075, C5 + 12, p, 0.55);
  },
  back(o, t, p, v) {
    const ch = chan(o, v, 0.12);
    inst("marimba", ch, t, C5 + 7, p, 0.65);
    inst("marimba", ch, t + 0.075, C5, p, 0.6);
  },
  step(o, t, p, v) {
    const ch = chan(o, v * 2.5 * rr(0.75, 1), 0.02, rr(-0.2, 0.2));
    noise(ch, t, { type: "bandpass", f: rr(1800, 3200) * p, q: 0.9, a: 0.004, d: rr(0.04, 0.07), peak: 0.16 });
    noise(ch, t, { type: "lowpass", f: 700 * p, q: 0.7, a: 0.003, d: 0.05, peak: 0.12 });
    tone(ch, t, { f: rr(150, 190) * p, f2: 90 * p, glide: 0.04, a: 0.003, d: 0.06, peak: 0.12 });
  },
  talk(o, t, p, v) {
    const ch = chan(o, v * 3, 0.06);
    const f = rr(480, 720) * p;
    tone(ch, t, { type: "reed", f, f2: f * rr(0.9, 1.15), glide: 0.05, a: 0.006, d: 0.075, peak: 0.2, lp: 2600 });
    tone(ch, t, { type: "sine", f: f * 2, a: 0.004, d: 0.04, peak: 0.04 });
  },
  pop(o, t, p, v) {
    const ch = chan(o, v * 3, 0.1);
    tone(ch, t, { f: 380 * p, f2: 1300 * p, glide: 0.035, a: 0.002, d: 0.07, peak: 0.32 });
    noise(ch, t, { type: "highpass", f: 3000, a: 0.001, d: 0.015, peak: 0.06 });
  },
  sparkle(o, t, p, v) {
    const ch = chan(o, v, 0.45, rr(-0.2, 0.2));
    const notes = [0, 4, 7, 9, 12, 16, 19];
    const base = 84 + 12 * Math.log2(p);
    notes.forEach((n, i) => {
      if (i > 0 && R() < 0.2) return;
      INSTS.bell(ch, t + i * 0.035 + rr(0, 0.01), base + n, 0.2, 0.35 + 0.1 * (i % 2));
    });
    noise(ch, t, { type: "highpass", f: 7000, a: 0.05, d: 0.5, peak: 0.035 });
  },
  success(o, t, p, v) {
    const ch = chan(o, v, 0.22);
    [0, 4, 7, 12].forEach((n, i) => {
      inst("marimba", ch, t + i * 0.08, C5 + n, p, 0.7);
      if (i === 3) inst("bell", ch, t + i * 0.08, C5 + 12 + n, p, 0.5);
    });
  },
  fail(o, t, p, v) {
    // soft sympathetic "aww" – two gentle downward sighs
    const ch = chan(o, v, 0.2);
    tone(ch, t, { type: "warm", f: 660 * p, f2: 600 * p, glide: 0.18, a: 0.03, d: 0.3, peak: 0.2, vib: [5, 14], lp: 2400 });
    tone(ch, t + 0.2, { type: "warm", f: 560 * p, f2: 440 * p, glide: 0.45, a: 0.04, d: 0.55, peak: 0.2, vib: [5, 18], lp: 2000 });
  },
  heart(o, t, p, v) {
    const ch = chan(o, v, 0.3);
    tone(ch, t, { f: 520 * p, f2: 880 * p, glide: 0.12, a: 0.01, d: 0.25, peak: 0.12, vib: [9, 25] });
    [4, 7, 12].forEach((n, i) => inst("musicbox", ch, t + 0.05 + i * 0.06, 84 + n, p, 0.6));
  },
  whoosh(o, t, p, v) {
    const { ctx } = o;
    const ch = chan(o, v * 1.8, 0.12);
    const g = gainNode(ctx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.14);
    g.gain.setTargetAtTime(0, t + 0.16, 0.07);
    const n = noiseSrc(ctx, t, t + 0.6);
    const bp = filter(ctx, "bandpass", 500 * p, 1.4);
    bp.frequency.setValueAtTime(450 * p, t);
    bp.frequency.exponentialRampToValueAtTime(2000 * p, t + 0.15);
    bp.frequency.exponentialRampToValueAtTime(700 * p, t + 0.45);
    let last: AudioNode = n.connect(bp);
    if (typeof ctx.createStereoPanner === "function") {
      const pn = ctx.createStereoPanner();
      pn.pan.setValueAtTime(-0.6, t);
      pn.pan.linearRampToValueAtTime(0.6, t + 0.4);
      last = last.connect(pn);
    }
    last.connect(g).connect(ch.in);
  },
  door(o, t, p, v) {
    const ch = chan(o, v, 0.18);
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.11;
      tone(ch, tt, { f: 210 * p, f2: 170 * p, glide: 0.05, a: 0.002, d: 0.12, peak: 0.3 });
      tone(ch, tt, { type: "triangle", f: 480 * p, a: 0.001, d: 0.05, peak: 0.12 });
      noise(ch, tt, { type: "bandpass", f: 1100 * p, q: 2.5, a: 0.001, d: 0.06, peak: 0.12 });
    }
    // creak-lite: soft wobbling resonance
    tone(ch, t + 0.25, { type: "sawtooth", f: 240 * p, f2: 300 * p, glide: 0.3, a: 0.06, d: 0.35, peak: 0.025, vib: [14, 60], lp: 1400 });
  },
  pickup(o, t, p, v) {
    const ch = chan(o, v * 1.7, 0.2);
    tone(ch, t, { f: 600 * p, f2: 1200 * p, glide: 0.06, a: 0.003, d: 0.12, peak: 0.2 });
    inst("bell", ch, t + 0.05, 91, p, 0.5);
  },
  coin(o, t, p, v) {
    const ch = chan(o, v, 0.18);
    inst("musicbox", ch, t, 83, p, 0.8);
    inst("musicbox", ch, t + 0.07, 88, p, 0.95);
    tone(ch, t + 0.07, { type: "triangle", f: mtof(88) * p, a: 0.002, d: 0.25, peak: 0.06 });
  },
  jump(o, t, p, v) {
    const ch = chan(o, v * 2, 0.08);
    tone(ch, t, { type: "triangle", f: 210 * p, f2: 560 * p, glide: 0.14, a: 0.004, d: 0.28, peak: 0.26, vib: [16, 70], lp: 2500 });
    tone(ch, t, { f: 420 * p, f2: 1120 * p, glide: 0.14, a: 0.004, d: 0.18, peak: 0.06 });
  },
  splash(o, t, p, v) {
    const ch = chan(o, v * 1.8, 0.25);
    noise(ch, t, { type: "lowpass", f: 3500 * p, f2: 500 * p, glide: 0.3, q: 0.6, a: 0.008, d: 0.4, peak: 0.28 });
    noise(ch, t, { type: "highpass", f: 4500, a: 0.004, d: 0.18, peak: 0.08 });
    for (let i = 0; i < 4; i++) {
      const f = rr(900, 1900) * p;
      tone(ch, t + 0.04 + i * rr(0.04, 0.09), { f, f2: f * 1.9, glide: 0.04, a: 0.002, d: 0.08, peak: 0.12 });
    }
  },
  chime(o, t, p, v) {
    const ch = chan(o, v, 0.5);
    [79, 84, 88, 91].forEach((m, i) => inst("bell", ch, t + i * 0.06 + rr(0, 0.02), m, p, 0.55));
  },
  levelup(o, t, p, v) {
    const ch = chan(o, v, 0.3);
    [0, 2, 4, 7, 9, 12].forEach((n, i) => inst("marimba", ch, t + i * 0.065, C5 + n, p, 0.7));
    const tt = t + 6 * 0.065;
    [12, 16, 19, 24].forEach((n) => inst("bell", ch, tt, C5 + n, p, 0.45));
    [0, 4, 7].forEach((n, i) => inst("musicbox", ch, tt + 0.12 + i * 0.05, 96 + n, p, 0.35));
    noise(ch, tt, { type: "highpass", f: 7500, a: 0.08, d: 0.7, peak: 0.03 });
  },
  build(o, t, p, v) {
    const ch = chan(o, v, 0.15);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.15;
      wood(ch, tt, 0.9, rr(700, 760) * p);
      tone(ch, tt, { f: 170 * p, f2: 120 * p, glide: 0.04, a: 0.002, d: 0.07, peak: 0.18 });
      noise(ch, tt, { type: "bandpass", f: 1800, q: 1.5, a: 0.001, d: 0.04, peak: 0.08 });
    }
    SFX.sparkle(o, t + 0.5, p, v * 0.8);
  },
  tame(o, t, p, v) {
    const ch = chan(o, v, 0.5);
    const notes = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    notes.forEach((n, i) => INSTS.bell(ch, t + i * 0.045, 72 + n + 12 * Math.log2(p), 0.2, 0.35 + i * 0.02));
    padChord(ch, t, [60, 64, 67, 71].map((m) => m + 12 * Math.log2(p)), 0.8, 0.9, 1.2);
    noise(ch, t + 0.3, { type: "highpass", f: 6500, a: 0.2, d: 1.0, peak: 0.04 });
    inst("musicbox", ch, t + 0.55, 91, p, 0.7);
  },
  bubble(o, t, p, v) {
    const ch = chan(o, v * 2.5, 0.2, rr(-0.3, 0.3));
    const f = rr(280, 360) * p;
    tone(ch, t, { f, f2: f * 2.8, glide: 0.06, a: 0.003, d: 0.09, peak: 0.22 });
    const f2 = f * rr(1.3, 1.6);
    tone(ch, t + rr(0.06, 0.1), { f: f2, f2: f2 * 2.5, glide: 0.05, a: 0.003, d: 0.07, peak: 0.14 });
  },
  countdown(o, t, p, v) {
    const ch = chan(o, v * 1.6, 0.1);
    wood(ch, t, 1, 1050 * p);
    inst("musicbox", ch, t, 79, p, 0.6);
  },
  go(o, t, p, v) {
    const ch = chan(o, v, 0.2);
    tone(ch, t, { type: "triangle", f: 500 * p, f2: 1000 * p, glide: 0.08, a: 0.004, d: 0.15, peak: 0.14, lp: 3000 });
    [84, 88, 91].forEach((m) => inst("bell", ch, t + 0.05, m, p, 0.55));
    [72, 76, 79].forEach((m) => inst("marimba", ch, t + 0.05, m, p, 0.6));
  },
  miss(o, t, p, v) {
    const ch = chan(o, v * 1.6, 0.05);
    tone(ch, t, { f: 150 * p, f2: 70 * p, glide: 0.12, a: 0.004, d: 0.18, peak: 0.35 });
    tone(ch, t, { type: "triangle", f: 260 * p, f2: 170 * p, glide: 0.1, a: 0.004, d: 0.12, peak: 0.12, lp: 900 });
    noise(ch, t, { type: "lowpass", f: 600, a: 0.003, d: 0.08, peak: 0.12 });
  },
  quest(o, t, p, v) {
    const ch = chan(o, v, 0.35);
    inst("bell", ch, t, 79, p, 0.6);
    inst("bell", ch, t + 0.11, 86, p, 0.65);
    inst("musicbox", ch, t + 0.11, 86, p, 0.4);
  },
};

// ---------------------------------------------------------------- jingles
type Ev = [beat: number, inst: InstName | "pad" | "kick" | "shaker", midi: number | number[], len: number, vel: number];
interface Jingle {
  bpm: number;
  ev: Ev[];
}
const J: Record<JingleName, Jingle> = {
  victory: {
    bpm: 150,
    ev: [
      [0, "marimba", 67, 0.5, 0.8], [0.5, "marimba", 72, 0.5, 0.8], [1, "marimba", 76, 0.5, 0.85], [1.5, "marimba", 79, 0.5, 0.9],
      [2, "flute", 76, 0.5, 0.8], [2.5, "flute", 79, 1, 0.9], [3.5, "flute", 84, 2.5, 1],
      [3.5, "bell", 84, 2, 0.6], [3.5, "pad", [60, 64, 67, 72], 3, 0.9], [3.5, "kick", 0, 0, 0.6],
      [3.5, "bass", 48, 2, 0.8], [4.5, "musicbox", 91, 1, 0.4], [5, "musicbox", 96, 1, 0.35],
      [2, "kick", 0, 0, 0.5], [1, "shaker", 0, 0, 0.6], [1.5, "shaker", 0, 0, 0.6], [2.5, "shaker", 0, 0, 0.6], [3, "shaker", 0, 0, 0.6],
    ],
  },
  newfriend: {
    bpm: 112,
    ev: [
      [0, "musicbox", 76, 1, 0.8], [0.5, "musicbox", 79, 1, 0.8], [1, "musicbox", 84, 1, 0.85], [1.5, "musicbox", 83, 0.5, 0.75],
      [2, "musicbox", 84, 1, 0.8], [2.5, "musicbox", 88, 2, 0.95],
      [0, "pad", [60, 64, 67], 2, 0.8], [2, "pad", [65, 69, 72], 1, 0.8], [2.5, "pad", [60, 64, 67, 71], 3, 0.8],
      [0, "bass", 48, 1.8, 0.6], [2, "bass", 41, 0.5, 0.6], [2.5, "bass", 48, 2.5, 0.6],
      ...[0, 1, 2, 3, 4, 5, 6].map((i): Ev => [2.5 + i * 0.12, "bell", [84, 86, 88, 91, 93, 96, 100][i], 0.5, 0.35]),
    ],
  },
  questdone: {
    bpm: 140,
    ev: [
      [0, "marimba", 72, 0.5, 0.8], [0.5, "marimba", 76, 0.5, 0.8], [1, "marimba", 79, 0.5, 0.85],
      [1.5, "marimba", 84, 1.5, 0.95], [1.5, "bell", 84, 1.5, 0.55], [1.5, "bell", 88, 1.5, 0.45],
      [1.5, "pad", [60, 64, 67, 72], 1.6, 0.8], [1.5, "bass", 48, 1.5, 0.7],
    ],
  },
  fanfare: {
    bpm: 132,
    ev: [
      [0, "flute", 67, 0.3, 0.85], [0.33, "flute", 67, 0.3, 0.85], [0.66, "flute", 67, 0.3, 0.85], [1, "flute", 72, 1.4, 1],
      [0, "marimba", 55, 0.5, 0.6], [1, "marimba", 60, 0.5, 0.7],
      [2.5, "flute", 70, 0.4, 0.85], [3, "flute", 74, 0.4, 0.9], [3.5, "flute", 79, 2, 1],
      [3.5, "bell", 79, 2, 0.5], [3.5, "pad", [60, 64, 67, 72], 2.5, 0.85], [3.5, "bass", 48, 2, 0.75],
      [1, "pad", [60, 64, 67], 1.5, 0.7], [2.5, "pad", [58, 62, 65], 1, 0.7], [2.5, "bass", 46, 1, 0.65], [1, "bass", 48, 1.4, 0.65],
      [1, "kick", 0, 0, 0.5], [3.5, "kick", 0, 0, 0.6],
    ],
  },
};

/** plays a jingle, returns its length in seconds */
export function playJingle(o: SfxOut, id: JingleName, t: number, v: number): number {
  const j = J[id];
  const beat = 60 / j.bpm;
  const ch = chan(o, v * 0.8, 0.3);
  let end = 0;
  for (const [b, name, m, len, vel] of j.ev) {
    const tt = t + b * beat;
    const dur = len * beat;
    end = Math.max(end, b * beat + dur);
    if (name === "pad") padChord(ch, tt, m as number[], dur, vel);
    else if (name === "kick") kick(ch, tt, vel);
    else if (name === "shaker") shaker(ch, tt, vel);
    else for (const mm of Array.isArray(m) ? m : [m]) INSTS[name](ch, tt, mm, dur, vel);
  }
  return end;
}

export const JINGLE_LENGTH = (id: JingleName) => {
  const j = J[id];
  return Math.max(...j.ev.map((e) => e[0] + e[3])) * (60 / j.bpm);
};

// ---------------------------------------------------------------- minigame notes
const PENTA = [0, 2, 4, 7, 9];
/** happy major pentatonic from G4, in the minigame track's key (C) */
export function noteMidi(i: number): number {
  i = Math.round(i);
  // 0 = G4: G A C D E | G A C D E | G A ...
  const idx = i + 3; // offset so 0 lands on G (index 3 of C-pentatonic)
  const o = Math.floor(idx / 5);
  const k = ((idx % 5) + 5) % 5;
  return MINIGAME_KEY + o * 12 + PENTA[k];
}

export function playNote(o: SfxOut, i: number, instrument: "bell" | "marimba" | "flute", t: number, v: number) {
  const ch = chan(o, v, instrument === "marimba" ? 0.15 : 0.3);
  const m = noteMidi(i);
  if (instrument === "flute") INSTS.flute(ch, t, m, 0.32, 0.6);
  else if (instrument === "bell") {
    INSTS.bell(ch, t, m, 0.5, 0.85);
    INSTS.musicbox(ch, t, m + 12, 0.5, 0.25);
  } else INSTS.marimba(ch, t, m, 0.4, 0.95);
}

// ---------------------------------------------------------------- critter voices
interface Syl {
  /** pitch multiplier relative to species base */
  p: number;
  /** duration */
  d: number;
  /** gap after */
  g: number;
}
interface VoiceDef {
  f: number;
  wave: Wave;
  syl: Syl[];
  /** relative glide per syllable (end/start) */
  glide: number;
  /** trill/flutter [rateHz, depthCents] */
  trill?: [number, number];
  lp?: number;
  /** formant bandpass (nasal / mouthy) */
  formant?: number;
  /** breathy noise layer level */
  breath?: number;
  /** croak amplitude modulation rate */
  am?: number;
  rev?: number;
  gain?: number;
  /** breathy "puff" noise burst before the first syllable (level) */
  puff?: number;
  /** tiny ember crackles sprinkled over the call (level) */
  crackle?: number;
  /** sparkly bell arpeggio layered on top (velocity) */
  chime?: number;
}
const VOICES: Record<string, VoiceDef> = {
  puffbun: { f: 1150, wave: "sine", syl: [{ p: 1, d: 0.07, g: 0.05 }, { p: 1.12, d: 0.09, g: 0 }], glide: 1.15, breath: 0.04, gain: 1.1 },
  chirpy: { f: 2100, wave: "sine", syl: [{ p: 1, d: 0.05, g: 0.03 }, { p: 1.15, d: 0.05, g: 0.03 }, { p: 1.05, d: 0.11, g: 0 }], glide: 1.25, trill: [26, 90], gain: 0.85 },
  fennix: { f: 780, wave: "reed", syl: [{ p: 1.1, d: 0.06, g: 0.06 }, { p: 1, d: 0.13, g: 0 }], glide: 1.3, lp: 2600, formant: 1500 },
  hoglet: { f: 470, wave: "triangle", syl: [{ p: 1, d: 0.06, g: 0.04 }, { p: 1.08, d: 0.06, g: 0.04 }, { p: 1.15, d: 0.08, g: 0 }], glide: 1.1, breath: 0.12, lp: 1800 },
  shroomy: { f: 520, wave: "sine", syl: [{ p: 1, d: 0.1, g: 0.06 }, { p: 1.33, d: 0.14, g: 0 }], glide: 1.5, trill: [7, 40], gain: 1.15 },
  ribbit: { f: 230, wave: "reed", syl: [{ p: 1, d: 0.09, g: 0.05 }, { p: 1.25, d: 0.12, g: 0 }], glide: 1.08, am: 32, lp: 1400, formant: 800, gain: 1.2 },
  duckling: { f: 1700, wave: "triangle", syl: [{ p: 1, d: 0.08, g: 0.07 }, { p: 1.04, d: 0.09, g: 0 }], glide: 0.86, lp: 3500, formant: 2200 },
  glowbat: { f: 1900, wave: "sine", syl: [{ p: 1, d: 0.04, g: 0.035 }, { p: 1.1, d: 0.04, g: 0.035 }, { p: 1.2, d: 0.05, g: 0 }], glide: 1.2, trill: [35, 60], rev: 0.5, gain: 0.8 },
  molly: { f: 380, wave: "warm", syl: [{ p: 1, d: 0.12, g: 0.05 }, { p: 1.12, d: 0.18, g: 0 }], glide: 1.06, trill: [6, 20], lp: 1600, gain: 1.2 },
  // red panda: a breathy little "huff" then squeaky twittering chirps (the huff-quack)
  redpanda: { f: 1250, wave: "triangle", syl: [{ p: 0.78, d: 0.05, g: 0.035 }, { p: 1.12, d: 0.045, g: 0.025 }, { p: 1.28, d: 0.07, g: 0 }], glide: 1.16, trill: [28, 70], breath: 0.1, lp: 3600, formant: 1800, gain: 0.85 },
  mochi: { f: 700, wave: "reed", syl: [{ p: 1, d: 0.2, g: 0 }], glide: 1.35, lp: 2200, formant: 1300, trill: [6, 25] },
  // pony: a soft wobbly whinny falling into a little "hu-hu-hu" nicker
  pony: { f: 640, wave: "reed", syl: [{ p: 1.3, d: 0.2, g: 0.035 }, { p: 0.86, d: 0.05, g: 0.028 }, { p: 0.83, d: 0.05, g: 0.028 }, { p: 0.8, d: 0.06, g: 0 }], glide: 0.82, trill: [11, 85], lp: 2400, formant: 1200, breath: 0.06, gain: 0.85 },
  // unicorn: a lighter, airier whinny wrapped in a twinkly bell arpeggio
  unicorn: { f: 880, wave: "triangle", syl: [{ p: 1.25, d: 0.18, g: 0.03 }, { p: 0.95, d: 0.05, g: 0.025 }, { p: 0.9, d: 0.065, g: 0 }], glide: 0.85, trill: [10, 70], lp: 3600, breath: 0.03, rev: 0.4, chime: 0.55, gain: 0.85 },
  // emberling: a squeaky little puff of smoke with ember crackles
  emberling: { f: 1350, wave: "triangle", syl: [{ p: 1, d: 0.07, g: 0.04 }, { p: 1.22, d: 0.1, g: 0 }], glide: 1.25, lp: 3800, formant: 2000, puff: 0.09, crackle: 0.045, gain: 0.85 },
  // roarlet: a tiny, brave, squeaky "rrrawr" (rolling AM on the r)
  roarlet: { f: 600, wave: "reed", syl: [{ p: 1.08, d: 0.07, g: 0 }, { p: 1, d: 0.17, g: 0 }], glide: 0.8, am: 36, trill: [7, 40], lp: 2800, formant: 1400, breath: 0.05, gain: 1.2 },
  // shellby: a slow, gentle hum that ends in a soft "boop"
  shellby: { f: 270, wave: "sine", syl: [{ p: 1, d: 0.26, g: 0.08 }, { p: 1.26, d: 0.12, g: 0 }], glide: 1.03, trill: [4.5, 18], lp: 1300, rev: 0.25, gain: 0.95 },
  generic: { f: 900, wave: "triangle", syl: [{ p: 1, d: 0.08, g: 0.05 }, { p: 1.12, d: 0.1, g: 0 }], glide: 1.2, lp: 3000 },
};
export const VOICE_SPECIES = Object.keys(VOICES).filter((k) => k !== "generic");

export function playVoice(o: SfxOut, species: string, mood: "happy" | "curious" | "sad", t: number, v: number) {
  const def = VOICES[species] ?? VOICES.generic;
  const { ctx } = o;
  const ch = chan(o, v * (def.gain ?? 1), def.rev ?? 0.15, rr(-0.15, 0.15));
  const base = def.f * rr(0.94, 1.06) * (mood === "sad" ? 0.86 : 1);
  const slow = mood === "sad" ? 1.35 : 1;
  let tt = t;
  if (def.puff) {
    noise(ch, t, { type: "bandpass", f: 2400, f2: 700, glide: 0.09, q: 0.9, a: 0.01, d: 0.1, peak: def.puff });
    tt += 0.06;
  }
  if (def.crackle) {
    for (let i = 0; i < 7; i++) noise(ch, t + 0.03 + R() * 0.32, { type: "highpass", f: 2500 + R() * 3500, a: 0.001, d: 0.008 + R() * 0.012, peak: def.crackle * rr(0.6, 1.3) });
  }
  if (def.chime) {
    const up = mood === "sad" ? [12, 7, 4, 0] : mood === "curious" ? [0, 7, 4, 12] : [0, 4, 7, 12];
    const m0 = 86 + (mood === "sad" ? -3 : 0);
    up.forEach((n, i) => INSTS.bell(ch, t + 0.04 + i * 0.055 * slow, m0 + n, 0.3, def.chime! * (1 - i * 0.12)));
    noise(ch, t, { type: "highpass", f: 7500, a: 0.04, d: 0.35, peak: 0.02 * def.chime });
  }
  def.syl.forEach((s, i) => {
    const last = i === def.syl.length - 1;
    const d = s.d * slow;
    let f0 = base * s.p;
    let f1 = f0 * def.glide;
    if (mood === "happy") {
      f1 = f0 * Math.max(def.glide, 1.18) * (last ? 1.12 : 1);
    } else if (mood === "sad") {
      f0 *= 1.06;
      f1 = f0 * 0.74;
    } else {
      // curious: wobble then a questioning rise on the last syllable
      f1 = last ? f0 * 1.35 : f0 * 0.97;
    }
    const g = gainNode(ctx);
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(0.28, tt + Math.min(0.015, d * 0.3));
    g.gain.setTargetAtTime(0.22, tt + 0.015, d * 0.4);
    g.gain.setTargetAtTime(0, tt + d * 0.8, d * 0.18);
    const end = tt + d + 0.12;
    const s0 = osc(ctx, def.wave, f0, tt, end);
    s0.frequency.setValueAtTime(f0, tt);
    if (mood === "curious" && !last) {
      s0.frequency.linearRampToValueAtTime(f0 * 1.08, tt + d * 0.35);
      s0.frequency.linearRampToValueAtTime(f1, tt + d);
    } else {
      s0.frequency.exponentialRampToValueAtTime(f1, tt + d);
    }
    const trill = def.trill ?? (mood === "curious" ? [9, 35] : undefined);
    if (trill) {
      const l = osc(ctx, "sine", trill[0], tt, end);
      const lg = gainNode(ctx, trill[1] * (mood === "curious" ? 1.4 : 1));
      l.connect(lg).connect(s0.detune);
    }
    let src: AudioNode = s0;
    if (def.lp) src = src.connect(filter(ctx, "lowpass", def.lp, 0.6));
    if (def.formant) {
      const bp = filter(ctx, "peaking", def.formant, 2);
      bp.gain.value = 6;
      src = src.connect(bp);
    }
    if (def.am) {
      const am = gainNode(ctx, 0.6);
      const l = osc(ctx, "sine", def.am, tt, end);
      const lg = gainNode(ctx, 0.4);
      l.connect(lg).connect(am.gain);
      src = src.connect(am);
    }
    src.connect(g).connect(ch.in);
    if (def.breath) {
      noise(ch, tt, { type: "bandpass", f: clamp(f0 * 3, 500, 8000), q: 1.2, a: 0.01, d: d * 0.9, peak: def.breath });
    }
    tt += d + s.g * slow;
  });
}
