/**
 * Synth voices. Every voice builds a tiny node graph for one note, with
 * click-free envelopes, and lets the sources stop themselves (nodes are then GC'd).
 */
import { Ch, clamp, filter, gainNode, mtof, noiseSrc, nyq, osc, perc, adsr, cents } from "./core";

export type InstName = "marimba" | "kalimba" | "musicbox" | "bell" | "flute" | "bass" | "epiano" | "drop" | "pluck";
export type DrumName = "kick" | "wood" | "shaker" | "brush" | "tick";
export type InstFn = (ch: Ch, t: number, midi: number, dur: number, vel: number) => void;

const rnd = (a: number) => (Math.random() * 2 - 1) * a;

/** soft wooden marimba: harmonic body with a fast-decaying 4th partial (via closing lowpass) */
export function marimba(ch: Ch, t: number, m: number, _dur: number, vel: number) {
  const { ctx } = ch;
  const f = mtof(m);
  const decay = clamp(1.5 - (m - 48) * 0.024, 0.32, 1.4);
  const g = gainNode(ctx);
  const end = perc(g.gain, t, 0.34 * vel, 0.003, decay);
  const lp = filter(ctx, "lowpass", Math.min(f * 11, 14000), 0.5);
  lp.frequency.setValueAtTime(nyq(ctx, f * 11), t);
  lp.frequency.setTargetAtTime(nyq(ctx, f * 2.2), t + 0.004, 0.035);
  const o = osc(ctx, "marimba", f, t, end);
  o.connect(lp).connect(g).connect(ch.in);
}

/** kalimba: sine tine with a quick inharmonic "tink" and a slight pitch settle */
export function kalimba(ch: Ch, t: number, m: number, _dur: number, vel: number) {
  const { ctx } = ch;
  const f = mtof(m);
  const decay = clamp(1.7 - (m - 55) * 0.025, 0.5, 1.7);
  const g = gainNode(ctx);
  const end = perc(g.gain, t, 0.3 * vel, 0.003, decay);
  const o = osc(ctx, "sine", f * 1.006, t, end);
  o.frequency.setTargetAtTime(f, t, 0.02);
  o.connect(g).connect(ch.in);
  // metallic tine partials, gone within ~0.2 s
  const tk = osc(ctx, "kalimba", f, t, t + 0.25);
  const tg = gainNode(ctx);
  perc(tg.gain, t, 0.09 * vel, 0.002, 0.2);
  tk.connect(tg).connect(ch.in);
}

/** light pluck (kalimba-ish but shorter & softer) used for comping */
export function pluck(ch: Ch, t: number, m: number, _dur: number, vel: number) {
  const { ctx } = ch;
  const f = mtof(m);
  const g = gainNode(ctx);
  const end = perc(g.gain, t, 0.22 * vel, 0.004, clamp(0.9 - (m - 60) * 0.015, 0.3, 0.9));
  const o = osc(ctx, "triangle", f, t, end);
  const lp = filter(ctx, "lowpass", f * 6, 0.4);
  lp.frequency.setTargetAtTime(nyq(ctx, f * 2), t, 0.05);
  o.connect(lp).connect(g).connect(ch.in);
}

/** music box: bright FM onset settling into a pure tone, plus a soft octave partial */
export function musicbox(ch: Ch, t: number, m: number, _dur: number, vel: number) {
  const { ctx } = ch;
  const f = mtof(m);
  const decay = clamp(2.4 - (m - 70) * 0.035, 0.8, 2.4);
  const g = gainNode(ctx);
  const end = perc(g.gain, t, 0.24 * vel, 0.002, decay);
  const o = osc(ctx, "sine", f, t, end);
  const mod = osc(ctx, "sine", nyq(ctx, f * 4), t, t + 0.5);
  const mg = gainNode(ctx);
  mg.gain.setValueAtTime(f * 1.4, t);
  mg.gain.setTargetAtTime(0, t, 0.05);
  mod.connect(mg).connect(o.frequency);
  o.connect(g).connect(ch.in);
  const o2 = osc(ctx, "sine", f * 2.003, t, t + decay * 0.6);
  const g2 = gainNode(ctx);
  perc(g2.gain, t, 0.06 * vel, 0.002, decay * 0.45);
  o2.connect(g2).connect(ch.in);
}

/** glassy FM chime bell */
export function bell(ch: Ch, t: number, m: number, _dur: number, vel: number) {
  const { ctx } = ch;
  const f = mtof(m);
  const decay = clamp(3.2 - (m - 70) * 0.05, 1.0, 3.2);
  const g = gainNode(ctx);
  const end = perc(g.gain, t, 0.2 * vel, 0.002, decay);
  const o = osc(ctx, "sine", f, t, end);
  const mod = osc(ctx, "sine", nyq(ctx, f * 3.5), t, end);
  const mg = gainNode(ctx);
  mg.gain.setValueAtTime(f * 1.6, t);
  mg.gain.setTargetAtTime(f * 0.15, t, decay * 0.18);
  mod.connect(mg).connect(o.frequency);
  o.connect(g).connect(ch.in);
}

/** breathy flute / ocarina lead with delayed vibrato and a breath puff */
export function flute(ch: Ch, t: number, m: number, dur: number, vel: number) {
  const { ctx } = ch;
  const f = mtof(m);
  dur = Math.max(0.12, dur);
  const g = gainNode(ctx);
  const end = adsr(g.gain, t, 0.26 * vel, 0.055, 0.2, 0.78, dur, 0.18);
  const lp = filter(ctx, "lowpass", f * 3.2, 0.3);
  const o1 = osc(ctx, "triangle", f, t, end);
  const o2 = osc(ctx, "sine", f, t, end);
  const o2g = gainNode(ctx, 0.6);
  // delayed vibrato
  const lfo = osc(ctx, "sine", 5.1 + rnd(0.3), t, end);
  const lg = gainNode(ctx);
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(0, t + Math.min(0.25, dur * 0.5));
  lg.gain.linearRampToValueAtTime(dur > 0.4 ? 13 : 5, t + Math.min(0.7, dur));
  lfo.connect(lg);
  lg.connect(o1.detune);
  lg.connect(o2.detune);
  // tiny scoop into the note
  o1.detune.setValueAtTime(-30, t);
  o1.detune.linearRampToValueAtTime(0, t + 0.06);
  o2.detune.setValueAtTime(-30, t);
  o2.detune.linearRampToValueAtTime(0, t + 0.06);
  o1.connect(lp);
  o2.connect(o2g).connect(lp);
  lp.connect(g).connect(ch.in);
  // breath
  const n = noiseSrc(ctx, t, end);
  const bp = filter(ctx, "bandpass", Math.min(f * 2, 9000), 1.2);
  const ng = gainNode(ctx);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.05 * vel, t + 0.03);
  ng.gain.setTargetAtTime(0.012 * vel, t + 0.03, 0.06);
  ng.gain.setTargetAtTime(0, t + dur, 0.05);
  n.connect(bp).connect(ng).connect(ch.in);
}

/** round soft bass */
export function bass(ch: Ch, t: number, m: number, dur: number, vel: number) {
  const { ctx } = ch;
  const f = mtof(m);
  const g = gainNode(ctx);
  const end = adsr(g.gain, t, 0.32 * vel, 0.012, 0.25, 0.62, Math.max(0.1, dur), 0.12);
  const lp = filter(ctx, "lowpass", f * 6, 0.6);
  lp.frequency.setValueAtTime(nyq(ctx, f * 6), t);
  lp.frequency.setTargetAtTime(nyq(ctx, f * 2.6), t + 0.01, 0.08);
  const o = osc(ctx, "bass", f, t, end);
  o.connect(lp).connect(g).connect(ch.in);
}

/** soft electric piano (lo-fi keys): bright bark on the attack mellowing to a round tone, plus a tine ping */
export function epiano(ch: Ch, t: number, m: number, dur: number, vel: number) {
  const { ctx } = ch;
  const f = mtof(m);
  const g = gainNode(ctx);
  const end = adsr(g.gain, t, 0.22 * vel, 0.004, 1.1, 0.3, Math.max(0.2, dur), 0.35);
  const o = osc(ctx, "epiano", f, t, end);
  const lp = filter(ctx, "lowpass", Math.min(f * 7, 12000), 0.4);
  lp.frequency.setValueAtTime(nyq(ctx, f * (4 + 4 * vel)), t);
  lp.frequency.setTargetAtTime(nyq(ctx, f * 1.6), t + 0.005, 0.3);
  o.connect(lp).connect(g).connect(ch.in);
  const tine = osc(ctx, "sine", nyq(ctx, f * 7.1), t, t + 0.2);
  const tg = gainNode(ctx);
  perc(tg.gain, t, 0.02 * vel, 0.002, 0.12);
  tine.connect(tg).connect(ch.in);
}

/** water droplet "plip" */
export function drop(ch: Ch, t: number, m: number, _dur: number, vel: number) {
  const { ctx } = ch;
  const f = mtof(m);
  const g = gainNode(ctx);
  const end = perc(g.gain, t, 0.22 * vel, 0.002, 0.13);
  const o = osc(ctx, "sine", f, t, end);
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 2.1, t + 0.05);
  o.connect(g).connect(ch.in);
}

export const INSTS: Record<InstName, InstFn> = { marimba, kalimba, musicbox, bell, flute, bass, epiano, drop, pluck };

/** warm detuned pad chord, one filter + vca shared by all notes */
export function padChord(ch: Ch, t: number, midis: number[], dur: number, vel: number, bright = 1) {
  const { ctx } = ch;
  const g = gainNode(ctx);
  const n = midis.length || 1;
  const end = adsr(g.gain, t, (0.15 * vel) / Math.sqrt(n), 0.7, 0.8, 0.75, dur, 1.3);
  const lp = filter(ctx, "lowpass", 500 * bright, 0.5);
  lp.frequency.setValueAtTime(450 * bright, t);
  lp.frequency.linearRampToValueAtTime(1500 * bright, t + 0.8);
  lp.frequency.setTargetAtTime(1000 * bright, t + 0.8, 0.8);
  for (const m of midis) {
    const f = mtof(m);
    for (const d of [-7, 7]) {
      const o = osc(ctx, "warm", f * cents(d + rnd(2)), t, end);
      o.connect(lp);
    }
  }
  lp.connect(g).connect(ch.in);
}

// ---------------------------------------------------------------- percussion
export function kick(ch: Ch, t: number, vel: number) {
  const { ctx } = ch;
  const g = gainNode(ctx);
  const end = perc(g.gain, t, 0.55 * vel, 0.003, 0.32);
  const o = osc(ctx, "sine", 140, t, end);
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
  o.connect(g).connect(ch.in);
  // soft "knock" so it reads on small speakers
  const k = osc(ctx, "triangle", 260, t, t + 0.08);
  k.frequency.setValueAtTime(260, t);
  k.frequency.exponentialRampToValueAtTime(130, t + 0.05);
  const kg = gainNode(ctx);
  perc(kg.gain, t, 0.12 * vel, 0.002, 0.06);
  k.connect(kg).connect(ch.in);
}

export function wood(ch: Ch, t: number, vel: number, f = 1150) {
  const { ctx } = ch;
  const g = gainNode(ctx);
  const end = perc(g.gain, t, 0.22 * vel, 0.001, 0.09);
  const o = osc(ctx, "sine", f * 1.08, t, end);
  o.frequency.setTargetAtTime(f, t, 0.008);
  const bp = filter(ctx, "bandpass", f, 3);
  const o2 = osc(ctx, "triangle", f * 2.6, t, t + 0.05);
  const g2 = gainNode(ctx);
  perc(g2.gain, t, 0.06 * vel, 0.001, 0.03);
  o.connect(g).connect(ch.in);
  o2.connect(bp).connect(g2).connect(ch.in);
}

export function shaker(ch: Ch, t: number, vel: number) {
  const { ctx } = ch;
  const g = gainNode(ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.1 * vel, t + 0.012);
  g.gain.setTargetAtTime(0, t + 0.014, 0.022);
  const n = noiseSrc(ctx, t, t + 0.16);
  const bp = filter(ctx, "bandpass", 8000, 0.9);
  n.connect(bp).connect(g).connect(ch.in);
}

export function brush(ch: Ch, t: number, vel: number) {
  const { ctx } = ch;
  const g = gainNode(ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.14 * vel, t + 0.01);
  g.gain.setTargetAtTime(0, t + 0.012, 0.05);
  const n = noiseSrc(ctx, t, t + 0.35);
  const bp = filter(ctx, "bandpass", 2600, 0.6);
  n.connect(bp).connect(g).connect(ch.in);
  const b = osc(ctx, "triangle", 210, t, t + 0.1);
  const bg = gainNode(ctx);
  perc(bg.gain, t, 0.07 * vel, 0.002, 0.07);
  b.connect(bg).connect(ch.in);
}

export function tick(ch: Ch, t: number, vel: number) {
  const { ctx } = ch;
  const g = gainNode(ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07 * vel, t + 0.002);
  g.gain.setTargetAtTime(0, t + 0.003, 0.012);
  const n = noiseSrc(ctx, t, t + 0.08);
  const hp = filter(ctx, "highpass", 8000, 0.7);
  n.connect(hp).connect(g).connect(ch.in);
}

export const DRUMS: Record<DrumName, (ch: Ch, t: number, vel: number) => void> = { kick, wood, shaker, brush, tick };
