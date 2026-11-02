/**
 * Audio facade: procedural WebAudio music, jingles, sfx and critter voices.
 * No audio assets – everything is synthesised (see core/instruments/sequencer/songs/sfx).
 *
 * Every method is a safe no-op until `unlock()` is called from a user gesture;
 * the most recently requested music track is remembered and starts on unlock.
 */
import { Mix, clamp, createMix } from "./core";
import { SongPlayer } from "./sequencer";
import { SONGS } from "./songs";
import { JINGLE_LENGTH, SFX, playJingle, playNote, playVoice, SfxOut } from "./sfx";

export type SfxId =
  | "click" | "confirm" | "back" | "step" | "talk" | "pop" | "sparkle" | "success" | "fail"
  | "heart" | "whoosh" | "door" | "pickup" | "coin" | "jump" | "splash" | "chime" | "levelup"
  | "build" | "tame" | "bubble" | "countdown" | "go" | "miss" | "quest";

export type MusicId = "title" | "village" | "meadow" | "woods" | "pond" | "cave" | "interior" | "minigame" | "none";

export type JingleId = "victory" | "newfriend" | "questdone" | "fanfare";

export interface AudioApi {
  /** must be called from a user gesture (first tap / key) to unlock WebAudio */
  unlock(): void;
  music(id: MusicId): void;
  sfx(id: SfxId, opts?: { pitch?: number; volume?: number }): void;
  jingle(id: JingleId): void;
  /** melodic note for minigames: index in a happy pentatonic scale (0..11), optional instrument */
  note(i: number, instrument?: "bell" | "marimba" | "flute"): void;
  /** cute critter voice chirp */
  voice(species: string, mood?: "happy" | "curious" | "sad"): void;
  setVolumes(music: number, sfx: number): void;
  readonly musicVolume: number;
  readonly sfxVolume: number;
}

const STORE_KEY = "cwp.audio";
const CROSSFADE = 1.5;
const LOOKAHEAD = 0.35;
const TICK_MS = 50;
const SFX_GAP_MS = 40;

type Ctor = typeof AudioContext;

function loadVolumes(): { music: number; sfx: number } {
  const def = { music: 0.6, sfx: 0.8 };
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
    if (raw) {
      const j = JSON.parse(raw);
      return {
        music: typeof j.music === "number" ? clamp(j.music, 0, 1) : def.music,
        sfx: typeof j.sfx === "number" ? clamp(j.sfx, 0, 1) : def.sfx,
      };
    }
  } catch {
    /* ignore */
  }
  return def;
}

/** old prefixed WebKit returns undefined from connect(); our graph code chains connect() calls */
function patchLegacyConnect() {
  const proto = (window as unknown as { AudioNode?: { prototype: Record<string, unknown> } }).AudioNode?.prototype;
  if (!proto || proto.__cwpChain) return;
  const orig = proto.connect as (this: AudioNode, ...a: unknown[]) => unknown;
  proto.connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
    const r = orig.call(this, dest, ...rest);
    return r ?? dest;
  };
  proto.__cwpChain = true;
}

class AudioEngine implements AudioApi {
  private ctx: AudioContext | null = null;
  private mix: Mix | null = null;
  private vol = loadVolumes();
  private wanted: MusicId = "none";
  private playing: MusicId = "none";
  private player: SongPlayer | null = null;
  private fading: SongPlayer[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSfx = new Map<string, number>();
  private listening = false;
  private resuming = false;

  get musicVolume() {
    return this.vol.music;
  }
  get sfxVolume() {
    return this.vol.sfx;
  }

  unlock(): void {
    try {
      if (this.ctx) {
        this.resume();
        return;
      }
      const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
      const C = w.AudioContext ?? w.webkitAudioContext;
      if (!C) return;
      if (!w.AudioContext) patchLegacyConnect();
      // iOS 17+: let WebAudio play even with the ringer switch on silent
      try {
        const nav = navigator as Navigator & { audioSession?: { type: string } };
        if (nav.audioSession) nav.audioSession.type = "playback";
      } catch {
        /* ignore */
      }
      let ctx: AudioContext;
      try {
        ctx = new C({ latencyHint: "interactive" });
      } catch {
        ctx = new C();
      }
      this.ctx = ctx;
      this.mix = createMix(ctx, this.vol.music, this.vol.sfx);
      // iOS unlock: play a tiny silent buffer inside the gesture
      try {
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      } catch {
        /* ignore */
      }
      this.resume();
      this.attachListeners();
      this.startMusic(this.wanted);
    } catch (e) {
      console.warn("[audio] unlock failed", e);
    }
  }

  music(id: MusicId): void {
    if (id === this.wanted) return;
    this.wanted = id;
    if (!this.ctx) return;
    try {
      this.startMusic(id);
    } catch (e) {
      console.warn("[audio] music failed", e);
    }
  }

  sfx(id: SfxId, opts?: { pitch?: number; volume?: number }): void {
    const out = this.out();
    if (!out || !this.gate(id, SFX_GAP_MS)) return;
    const fn = SFX[id];
    if (!fn) return;
    try {
      const detune = Math.pow(2, ((Math.random() * 2 - 1) * 18) / 1200);
      const p = clamp(opts?.pitch ?? 1, 0.25, 4) * detune;
      const v = clamp(opts?.volume ?? 1, 0, 2);
      fn(out, this.ctx!.currentTime + 0.01, p, v);
    } catch (e) {
      console.warn("[audio] sfx failed", id, e);
    }
  }

  jingle(id: JingleId): void {
    const out = this.out();
    if (!out || !this.gate("jingle:" + id, 300)) return;
    try {
      const t = this.ctx!.currentTime + 0.03;
      this.mix!.duck(t - 0.03, JINGLE_LENGTH(id), 0.25);
      playJingle(out, id, t + 0.08, 1);
    } catch (e) {
      console.warn("[audio] jingle failed", id, e);
    }
  }

  note(i: number, instrument: "bell" | "marimba" | "flute" = "bell"): void {
    const out = this.out();
    if (!out || !Number.isFinite(i) || !this.gate("note:" + i + instrument, 25)) return;
    try {
      playNote(out, i, instrument, this.ctx!.currentTime + 0.005, 1);
    } catch (e) {
      console.warn("[audio] note failed", e);
    }
  }

  voice(species: string, mood: "happy" | "curious" | "sad" = "happy"): void {
    const out = this.out();
    if (!out || !this.gate("voice:" + species, 90)) return;
    try {
      playVoice(out, String(species), mood, this.ctx!.currentTime + 0.01, 1);
    } catch (e) {
      console.warn("[audio] voice failed", e);
    }
  }

  setVolumes(music: number, sfx: number): void {
    const m = Number.isFinite(music) ? clamp(music, 0, 1) : this.vol.music;
    const s = Number.isFinite(sfx) ? clamp(sfx, 0, 1) : this.vol.sfx;
    this.vol = { music: m, sfx: s };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.vol));
    } catch {
      /* private mode etc. */
    }
    try {
      this.mix?.setVolumes(m, s);
    } catch {
      /* ignore */
    }
  }

  /** debug info for the dev sound board / tests (not part of AudioApi) */
  debug() {
    return {
      state: this.ctx?.state ?? "locked",
      wanted: this.wanted,
      playing: this.playing,
      fading: this.fading.length,
      time: this.ctx?.currentTime ?? 0,
    };
  }

  // ------------------------------------------------------------ internals
  private out(): SfxOut | null {
    const ctx = this.ctx;
    if (!ctx || !this.mix) return null;
    // allow sounds requested in the same gesture that unlocked (resume is async), but not while backgrounded
    if (ctx.state !== "running" && !(this.resuming && !(typeof document !== "undefined" && document.hidden))) return null;
    return { ctx, dry: this.mix.sfxIn, rev: this.mix.sfxRevIn };
  }

  private gate(key: string, ms: number): boolean {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const last = this.lastSfx.get(key) ?? -1e9;
    if (now - last < ms) return false;
    this.lastSfx.set(key, now);
    return true;
  }

  private startMusic(id: MusicId) {
    const ctx = this.ctx;
    const mix = this.mix;
    if (!ctx || !mix || id === this.playing) return;
    if (this.player) {
      this.player.fadeOut(CROSSFADE);
      this.fading.push(this.player);
      this.player = null;
    }
    this.playing = id;
    if (id !== "none" && SONGS[id]) {
      const t = ctx.currentTime + 0.06;
      this.player = new SongPlayer(ctx, SONGS[id], { dry: mix.musicIn, rev: mix.musicRevIn }, t, CROSSFADE);
      this.player.scheduleUntil(ctx.currentTime + LOOKAHEAD);
    }
    this.ensureTimer();
  }

  private ensureTimer() {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (ctx.state === "running") {
        const until = ctx.currentTime + LOOKAHEAD;
        this.player?.scheduleUntil(until);
        for (const p of this.fading) p.scheduleUntil(until);
      }
      this.fading = this.fading.filter((p) => {
        if (!p.finished) return true;
        p.dispose();
        return false;
      });
      if (!this.player && !this.fading.length && this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    } catch (e) {
      console.warn("[audio] tick failed", e);
    }
  }

  private resume() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (ctx.state !== "running") {
      this.resuming = true;
      ctx
        .resume()
        .catch(() => {})
        .finally(() => {
          this.resuming = false;
        });
    }
  }

  private attachListeners() {
    if (this.listening || typeof document === "undefined") return;
    this.listening = true;
    document.addEventListener("visibilitychange", () => {
      const ctx = this.ctx;
      if (!ctx) return;
      if (document.hidden) {
        if (ctx.state === "running") ctx.suspend().catch(() => {});
      } else {
        this.resume();
      }
    });
    // iOS/iPadOS: contexts get "interrupted" (calls, Siri, lock screen) and need a gesture to resume
    const kick = () => this.resume();
    for (const ev of ["touchend", "pointerdown", "keydown", "mousedown"]) {
      document.addEventListener(ev, kick, { passive: true, capture: true });
    }
    window.addEventListener("pageshow", kick);
    window.addEventListener("focus", kick);
  }
}

const engine = new AudioEngine();

export const audio: AudioApi = engine;

/** dev/test helper (not part of AudioApi) */
export const audioDebug = () => engine.debug();
