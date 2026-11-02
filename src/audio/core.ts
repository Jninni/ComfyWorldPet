/**
 * Low-level WebAudio helpers shared by instruments, sequencer and sfx.
 * Everything here works on any BaseAudioContext so the same graph builders can
 * render into an OfflineAudioContext for testing.
 */
export type Ctx = BaseAudioContext;

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** keep a filter frequency inside (0, ~0.45·fs) so automation never gets clamped */
export const nyq = (ctx: BaseAudioContext, f: number) => clamp(f, 10, ctx.sampleRate * 0.45);
export const cents = (c: number) => Math.pow(2, c / 1200);

/** small deterministic PRNG (mulberry32) so loops/tests can be reproducible */
export type Rng = () => number;
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- caches
const noiseCache = new WeakMap<Ctx, AudioBuffer>();
/** 2 s of white noise (mono), cached per context */
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    const len = Math.floor(ctx.sampleRate * 2);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = makeRng(1234);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** a looping noise source started at a random offset */
export function noiseSrc(ctx: Ctx, t: number, stopAt: number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.start(t, Math.random() * 1.8);
  s.stop(stopAt);
  return s;
}

const waveCache = new WeakMap<Ctx, Map<string, PeriodicWave>>();
const WAVES: Record<string, number[]> = {
  // soft, rounded harmonic series (warm pad / ocarina body)
  warm: [0, 1, 0.42, 0.2, 0.11, 0.06, 0.035, 0.02, 0.01],
  // round bass with a little 2nd/3rd harmonic so it reads on tablet speakers
  bass: [0, 1, 0.55, 0.28, 0.1, 0.04],
  // marimba: fundamental + strong 4th partial + a hint of 10th (mallet)
  marimba: [0, 1, 0, 0.04, 0.38, 0, 0, 0, 0, 0, 0.07],
  // e-piano: strong fundamental, a little 2nd/3rd (filtered over time)
  epiano: [0, 1, 0.5, 0.18, 0.1, 0.05, 0.03],
  // kalimba tine overtones (approximate the ~6x inharmonic partial with near-harmonics)
  kalimba: [0, 0.2, 0, 0, 0, 0.5, 0.7, 0.2],
  // gentle reed-ish (used for critter voices / e-piano body)
  reed: [0, 1, 0.3, 0.32, 0.12, 0.1, 0.04, 0.03],
};
export function wave(ctx: Ctx, name: keyof typeof WAVES | string): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) waveCache.set(ctx, (m = new Map()));
  let w = m.get(name);
  if (!w) {
    const amps = WAVES[name] ?? WAVES.warm;
    const real = new Float32Array(amps.length);
    const imag = new Float32Array(amps);
    w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    m.set(name, w);
  }
  return w;
}

export type Wave = OscillatorType | "warm" | "bass" | "marimba" | "reed" | "epiano" | "kalimba";
export function osc(ctx: Ctx, type: Wave, f: number, t: number, stopAt: number): OscillatorNode {
  const o = ctx.createOscillator();
  if (type in WAVES) o.setPeriodicWave(wave(ctx, type));
  else o.type = type as OscillatorType;
  o.frequency.value = f;
  o.start(t);
  o.stop(stopAt);
  return o;
}

export function gainNode(ctx: Ctx, v = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

export function filter(ctx: Ctx, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = nyq(ctx, f);
  b.Q.value = q;
  return b;
}

// ---------------------------------------------------------------- envelopes
/** percussive envelope: 0 → peak (linear, `a` s) → exponential decay to silence over `d` s. returns end time */
export function perc(p: AudioParam, t: number, peak: number, a: number, d: number): number {
  a = Math.max(0.002, a);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(0, t + a, d / 6.5);
  return t + a + d * 1.25;
}

/** sustained envelope. returns end time (after release) */
export function adsr(p: AudioParam, t: number, peak: number, a: number, d: number, s: number, dur: number, r: number): number {
  a = Math.max(0.003, a);
  r = Math.max(0.02, r);
  const rel = Math.max(t + a, t + dur);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (rel > t + a) p.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
  p.setTargetAtTime(0, rel, r / 4.5);
  return rel + r * 1.6;
}

/** ramp a param from whatever it currently is, cancelling scheduled automation without a jump */
export function rampTo(p: AudioParam, ctx: Ctx, target: number, dur: number, at?: number) {
  const t = Math.max(at ?? ctx.currentTime, ctx.currentTime);
  const anyP = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof anyP.cancelAndHoldAtTime === "function") {
    anyP.cancelAndHoldAtTime(t);
  } else {
    const v = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
  }
  p.linearRampToValueAtTime(target, t + Math.max(0.01, dur));
}

// ---------------------------------------------------------------- channels
/** a destination for instrument voices: `in` → pan → dry, and → reverb send */
export interface Ch {
  ctx: Ctx;
  in: AudioNode;
  dispose(): void;
}

export function makeChannel(ctx: Ctx, dry: AudioNode, rev: AudioNode | null, o: { gain?: number; pan?: number; rev?: number } = {}): Ch {
  const input = gainNode(ctx, o.gain ?? 1);
  const nodes: AudioNode[] = [input];
  let out: AudioNode = input;
  if (o.pan && typeof (ctx as BaseAudioContext).createStereoPanner === "function") {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(o.pan, -1, 1);
    input.connect(p);
    out = p;
    nodes.push(p);
  }
  out.connect(dry);
  if (rev && (o.rev ?? 0) > 0) {
    const s = gainNode(ctx, o.rev);
    out.connect(s);
    s.connect(rev);
    nodes.push(s);
  }
  return {
    ctx,
    in: input,
    dispose() {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already gone */
        }
      }
    },
  };
}

// ---------------------------------------------------------------- reverb
/** procedural stereo room/hall impulse response: diffuse noise, exponential decay, darker tail */
export function makeImpulse(ctx: Ctx, seconds = 2.8, rt60 = 2.4): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const k = 6.9 / rt60;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const r = makeRng(77 + c * 911);
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const n = r() * 2 - 1;
      // brightness falls over time -> high frequencies decay faster (natural, soft)
      const a = 0.08 + 0.62 * Math.exp(-t * 1.6);
      lp += a * (n - lp);
      lp2 += a * (lp - lp2);
      const fadeIn = t < 0.012 ? t / 0.012 : 1;
      const fadeOut = i > len - sr * 0.1 ? (len - i) / (sr * 0.1) : 1;
      d[i] = (lp * 0.6 + lp2 * 0.6) * Math.exp(-k * t) * fadeIn * fadeOut;
    }
  }
  // normalise energy
  let e = 0;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) e += d[i] * d[i];
  }
  const s = 1 / Math.sqrt(e / 2 + 1e-9);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] *= s;
  }
  return buf;
}

// ---------------------------------------------------------------- mix bus
export interface Mix {
  ctx: Ctx;
  /** music tracks connect their dry out here */
  musicIn: GainNode;
  /** music reverb sends */
  musicRevIn: GainNode;
  /** sfx / jingles / voices */
  sfxIn: GainNode;
  sfxRevIn: GainNode;
  setVolumes(music: number, sfx: number, smooth?: boolean): void;
  /** briefly lower the music (for jingles) */
  duck(at: number, hold: number, depth?: number): void;
  dispose(): void;
}

/** perceptual slider → gain */
export const volCurve = (v: number) => {
  v = clamp(v, 0, 1);
  return v * Math.sqrt(v);
};

export function createMix(ctx: Ctx, musicVol: number, sfxVol: number, destination?: AudioNode): Mix {
  const musicIn = gainNode(ctx, 1);
  const musicRevIn = gainNode(ctx, 1);
  const sfxIn = gainNode(ctx, 1);
  const sfxRevIn = gainNode(ctx, 1);
  const duckDry = gainNode(ctx, 1);
  const duckRev = gainNode(ctx, 1);
  const mVol = gainNode(ctx, volCurve(musicVol));
  const mRevVol = gainNode(ctx, volCurve(musicVol));
  const sVol = gainNode(ctx, volCurve(sfxVol));
  const sRevVol = gainNode(ctx, volCurve(sfxVol));

  const masterIn = gainNode(ctx, 1);
  // shared reverb
  const revIn = gainNode(ctx, 1);
  const preDelay = ctx.createDelay(0.1);
  preDelay.delayTime.value = 0.022;
  const revHp = filter(ctx, "highpass", 220, 0.6);
  const conv = ctx.createConvolver();
  conv.normalize = false;
  conv.buffer = makeImpulse(ctx);
  const revOut = gainNode(ctx, 0.28);
  revIn.connect(preDelay).connect(revHp).connect(conv).connect(revOut).connect(masterIn);

  musicIn.connect(duckDry).connect(mVol).connect(masterIn);
  musicRevIn.connect(duckRev).connect(mRevVol).connect(revIn);
  sfxIn.connect(sVol).connect(masterIn);
  sfxRevIn.connect(sRevVol).connect(revIn);

  // master: subsonic/DC cut → gentle air softening → glue compressor → limiter
  const hp = filter(ctx, "highpass", 30, 0.7);
  const shelf = filter(ctx, "highshelf", 7000, 0.7);
  shelf.gain.value = -2.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 14;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.015;
  comp.release.value = 0.3;
  const makeup = gainNode(ctx, 1.3);
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -5;
  lim.knee.value = 2;
  lim.ratio.value = 20;
  lim.attack.value = 0.002;
  lim.release.value = 0.12;
  const out = gainNode(ctx, 0.85);
  masterIn.connect(hp).connect(shelf).connect(comp).connect(makeup).connect(lim).connect(out).connect(destination ?? ctx.destination);

  const all: AudioNode[] = [musicIn, musicRevIn, sfxIn, sfxRevIn, duckDry, duckRev, mVol, mRevVol, sVol, sRevVol, masterIn, revIn, preDelay, revHp, conv, revOut, hp, shelf, comp, makeup, lim, out];

  return {
    ctx,
    musicIn,
    musicRevIn,
    sfxIn,
    sfxRevIn,
    setVolumes(m, s, smooth = true) {
      const d = smooth ? 0.08 : 0.01;
      rampTo(mVol.gain, ctx, volCurve(m), d);
      rampTo(mRevVol.gain, ctx, volCurve(m), d);
      rampTo(sVol.gain, ctx, volCurve(s), d);
      rampTo(sRevVol.gain, ctx, volCurve(s), d);
    },
    duck(at, hold, depth = 0.3) {
      for (const g of [duckDry, duckRev]) {
        rampTo(g.gain, ctx, depth, 0.12, at);
        g.gain.setValueAtTime(depth, at + 0.12 + hold);
        g.gain.linearRampToValueAtTime(1, at + 0.12 + hold + 1.0);
      }
    },
    dispose() {
      for (const n of all) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
