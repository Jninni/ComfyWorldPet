/**
 * Offline rendering + analysis helpers (dev sound board & tools/test-audio.mjs).
 * Not imported by the game itself, so it stays out of the main bundle.
 */
import { Mix, createMix } from "./core";
import { SongPlayer, Song, tokens } from "./sequencer";
import { SONGS, SongId } from "./songs";
import { JingleName, SFX, SfxName, playJingle, playNote, playVoice, JINGLE_LENGTH } from "./sfx";

export const DEFAULT_VOL = { music: 0.6, sfx: 0.8 };

type OAC = typeof OfflineAudioContext;
function offlineCtor(): OAC {
  const w = window as unknown as { OfflineAudioContext?: OAC; webkitOfflineAudioContext?: OAC };
  const C = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!C) throw new Error("no OfflineAudioContext");
  return C;
}

export async function renderOffline(
  seconds: number,
  build: (mix: Mix, ctx: OfflineAudioContext) => void,
  sr = 44100,
  vol = DEFAULT_VOL,
): Promise<AudioBuffer> {
  const C = offlineCtor();
  const ctx = new C(2, Math.ceil(seconds * sr), sr);
  const mix = createMix(ctx, vol.music, vol.sfx);
  build(mix, ctx);
  return ctx.startRendering();
}

export function renderMusic(id: SongId, seconds = 8, seed = 1, sr = 44100): Promise<AudioBuffer> {
  return renderOffline(
    seconds,
    (mix, ctx) => {
      const p = new SongPlayer(ctx, SONGS[id], { dry: mix.musicIn, rev: mix.musicRevIn }, 0.02, 0.01, seed);
      p.scheduleUntil(seconds);
    },
    sr,
  );
}

/** RMS (dB) of consecutive windows – used to check long renders never drop out or swell */
export function windowDb(buf: AudioBuffer, win = 10): number[] {
  const n = Math.floor(buf.sampleRate * win);
  const out: number[] = [];
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let s = 0; s + n <= buf.length; s += n) {
    let e = 0;
    for (const d of chans) for (let i = s; i < s + n; i++) e += d[i] * d[i];
    out.push(20 * Math.log10(Math.sqrt(e / (n * chans.length)) + 1e-9));
  }
  return out;
}

/** worst case: full volumes, busy track + a jingle (with ducking) + a burst of sfx and voices on top */
export function renderStress(id: SongId, seconds = 8): Promise<AudioBuffer> {
  return renderOffline(
    seconds,
    (mix, ctx) => {
      const p = new SongPlayer(ctx, SONGS[id], { dry: mix.musicIn, rev: mix.musicRevIn }, 0.02, 0.01, 5);
      p.scheduleUntil(seconds);
      const o = sfxOut(mix);
      const ids = Object.keys(SFX) as SfxName[];
      ids.forEach((s, i) => SFX[s](o, 0.5 + i * 0.12, 1, 1));
      mix.duck(4, JINGLE_LENGTH("victory"), 0.25);
      playJingle(o, "victory", 4.08, 1);
      playVoice(o, "ribbit", "happy", 4.3, 1);
      playVoice(o, "mochi", "happy", 4.6, 1);
    },
    44100,
    { music: 1, sfx: 1 },
  );
}

const sfxOut = (mix: Mix) => ({ ctx: mix.ctx, dry: mix.sfxIn, rev: mix.sfxRevIn });

export function renderSfx(id: SfxName, seconds = 2.5): Promise<AudioBuffer> {
  return renderOffline(seconds, (mix) => SFX[id](sfxOut(mix), 0.02, 1, 1));
}
export function renderJingle(id: JingleName): Promise<AudioBuffer> {
  return renderOffline(JINGLE_LENGTH(id) + 2.5, (mix) => playJingle(sfxOut(mix), id, 0.02, 1));
}
export function renderVoice(species: string, mood: "happy" | "curious" | "sad"): Promise<AudioBuffer> {
  return renderOffline(1.2, (mix) => playVoice(sfxOut(mix), species, mood, 0.02, 1));
}
export function renderNotes(instrument: "bell" | "marimba" | "flute"): Promise<AudioBuffer> {
  return renderOffline(12 * 0.25 + 2, (mix) => {
    for (let i = 0; i < 12; i++) playNote(sfxOut(mix), i, instrument, 0.02 + i * 0.25, 1);
  });
}

/** a reel of many one-shots spaced out (for human audition) */
export function renderReel(items: ((mix: Mix, t: number) => void)[], gap: number): Promise<AudioBuffer> {
  return renderOffline(items.length * gap + 2, (mix) => items.forEach((f, i) => f(mix, 0.05 + i * gap)));
}
export const reelSfx = (ids: SfxName[], gap = 1.2) => renderReel(ids.map((id) => (mix: Mix, t: number) => SFX[id](sfxOut(mix), t, 1, 1)), gap);
export const reelVoices = (species: string[], gap = 0.7) =>
  renderReel(
    species.flatMap((s) => (["happy", "curious", "sad"] as const).map((m) => (mix: Mix, t: number) => playVoice(sfxOut(mix), s, m, t, 1))),
    gap,
  );
export const reelJingles = (ids: JingleName[]) => renderReel(ids.map((id) => (mix: Mix, t: number) => playJingle(sfxOut(mix), id, t, 1)), 4.5);

// ---------------------------------------------------------------- analysis
export interface Stats {
  peak: number;
  rms: number;
  rmsDb: number;
  /** loudest 100 ms window RMS */
  maxWinRms: number;
  maxWinDb: number;
  dc: number;
  nan: number;
  /** fraction of 100 ms windows below -60 dBFS */
  silentFrac: number;
  /** largest sample-to-sample jump (click detector) */
  maxJump: number;
  /** energy fraction below ~250 Hz / above ~5 kHz (rough tonal balance; high = harsh/hissy) */
  loFrac: number;
  hiFrac: number;
  /** RMS (dB) through a ~250 Hz 2-pole highpass: rough "tablet speaker" loudness */
  spkDb: number;
  seconds: number;
}
const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));

export function analyze(buf: AudioBuffer, activeOnly = false): Stats {
  const n = buf.length;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  let peak = 0;
  let sum = 0;
  let sumSq = 0;
  let nan = 0;
  let maxJump = 0;
  const win = Math.floor(buf.sampleRate * 0.1);
  let winSq = 0;
  let winCount = 0;
  let windows = 0;
  let silent = 0;
  let maxWin = 0;
  let activeSq = 0;
  let activeN = 0;
  const kLo = 1 - Math.exp((-2 * Math.PI * 250) / buf.sampleRate);
  const kHi = 1 - Math.exp((-2 * Math.PI * 5000) / buf.sampleRate);
  let lpLo = 0;
  let lpHi = 0;
  let eAll = 0;
  let eLo = 0;
  let eHi = 0;
  const kSp = 1 - Math.exp((-2 * Math.PI * 250) / buf.sampleRate);
  let sp1 = 0;
  let sp2 = 0;
  let eSp = 0;
  for (let i = 0; i < n; i++) {
    let mono = 0;
    for (const d of chans) mono += Number.isFinite(d[i]) ? d[i] : 0;
    mono /= chans.length;
    lpLo += kLo * (mono - lpLo);
    lpHi += kHi * (mono - lpHi);
    eAll += mono * mono;
    eLo += lpLo * lpLo;
    eHi += (mono - lpHi) * (mono - lpHi);
    sp1 += kSp * (mono - sp1);
    const h1 = mono - sp1;
    sp2 += kSp * (h1 - sp2);
    const h2 = h1 - sp2;
    eSp += h2 * h2;
    let frameSq = 0;
    for (const d of chans) {
      const x = d[i];
      if (!Number.isFinite(x)) {
        nan++;
        continue;
      }
      const ax = Math.abs(x);
      if (ax > peak) peak = ax;
      sum += x;
      sumSq += x * x;
      frameSq += x * x;
      if (i > 0) {
        const j = Math.abs(x - d[i - 1]);
        if (j > maxJump) maxJump = j;
      }
    }
    winSq += frameSq / chans.length;
    winCount++;
    if (winCount === win) {
      const r = Math.sqrt(winSq / win);
      windows++;
      if (r < 0.001) silent++;
      else {
        activeSq += winSq;
        activeN += win;
      }
      if (r > maxWin) maxWin = r;
      winSq = 0;
      winCount = 0;
    }
  }
  const total = n * chans.length;
  const rms = activeOnly ? Math.sqrt(activeSq / Math.max(1, activeN)) : Math.sqrt(sumSq / total);
  return {
    peak,
    rms,
    rmsDb: db(rms),
    maxWinRms: maxWin,
    maxWinDb: db(maxWin),
    dc: sum / total,
    nan,
    silentFrac: windows ? silent / windows : 1,
    maxJump,
    loFrac: eLo / Math.max(1e-12, eAll),
    hiFrac: eHi / Math.max(1e-12, eAll),
    spkDb: db(Math.sqrt(eSp / Math.max(1, n))),
    seconds: buf.duration,
  };
}

// ---------------------------------------------------------------- wav
export function toWav(buf: AudioBuffer): Uint8Array {
  const nch = buf.numberOfChannels;
  const n = buf.length;
  const bytes = 44 + n * nch * 2;
  const dv = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  dv.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, nch, true);
  dv.setUint32(24, buf.sampleRate, true);
  dv.setUint32(28, buf.sampleRate * nch * 2, true);
  dv.setUint16(32, nch * 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, n * nch * 2, true);
  const chans = Array.from({ length: nch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nch; c++) {
      const x = Math.max(-1, Math.min(1, chans[c][i] || 0));
      dv.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      o += 2;
    }
  return new Uint8Array(dv.buffer);
}

export function toBase64(u8: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode(...u8.subarray(i, i + CH));
  return btoa(s);
}

// ---------------------------------------------------------------- song data lint
/** checks that melody/pattern lengths line up with bars; returns problems */
export function lintSongs(): string[] {
  const out: string[] = [];
  for (const [id, song] of Object.entries(SONGS) as [string, Song][]) {
    const spb = song.beats * song.div;
    for (const s of song.sections) {
      if (s.mel) {
        const n = tokens(s.mel).length;
        if (n !== s.chords.length * spb) out.push(`${id}.${s.name}: melody has ${n} steps, expected ${s.chords.length * spb}`);
      }
      if (s.alt && s.alt.length !== s.chords.length) out.push(`${id}.${s.name}: alt chord count mismatch`);
    }
    for (const l of song.layers) {
      for (const p of l.pats ?? []) if (tokens(p).length !== spb) out.push(`${id}.${l.kind}: pattern "${p}" has ${tokens(p).length} steps, expected ${spb}`);
      for (const d of [...(l.drums ?? []), ...(l.fill ? [l.fill] : [])])
        for (const [k, p] of Object.entries(d)) if (p.replace(/\s+/g, "").length !== spb) out.push(`${id}.drums.${k}: "${p}" length != ${spb}`);
    }
  }
  return out;
}
