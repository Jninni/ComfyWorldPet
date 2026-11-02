/**
 * Audio facade (STUB – to be replaced by the procedural WebAudio implementation).
 * Keep this exact public API.
 */
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

const noop = () => {};
export const audio: AudioApi = {
  unlock: noop,
  music: noop,
  sfx: noop,
  jingle: noop,
  note: noop,
  voice: noop,
  setVolumes: noop,
  musicVolume: 0.6,
  sfxVolume: 0.8,
};
