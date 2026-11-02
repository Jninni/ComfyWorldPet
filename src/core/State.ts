import { DEFAULT_LOOK } from "../entities/characterModels";
import type { SpeciesId } from "../data/species";
import type { ResourceId, BuildableId } from "../data/items";

export interface PlayerLookState {
  skin: string;
  hair: string;
  outfit: string;
  hat: string;
}

export interface OwnedCritter {
  uid: number;
  species: SpeciesId;
  variant: 0 | 1;
  name: string;
  inParty: boolean;
  friendship: number;
}

export interface QuestState {
  stage: number;
  progress: number;
  done: boolean;
}

export interface GameState {
  version: number;
  playerName: string;
  look: PlayerLookState;
  location: { where: string; x: number; z: number; rot: number };
  resources: Record<ResourceId, number>;
  keyItems: Record<string, number>;
  critters: OwnedCritter[];
  nextUid: number;
  seen: SpeciesId[];
  quests: Record<string, QuestState>;
  flags: Record<string, boolean | number>;
  plots: (BuildableId | null)[];
  hats: string[];
  playTime: number;
  /** collected one-off pickups (yarn balls, treasure chests…) */
  taken: string[];
}

export const PARTY_MAX = 3;
const KEY = "cwp.save.v1";

export function newState(): GameState {
  return {
    version: 1,
    playerName: "Sunny",
    look: { ...DEFAULT_LOOK },
    location: { where: "home", x: 0, z: 0, rot: 0 },
    resources: { twig: 0, petal: 0, pebble: 0, berry: 0, crystal: 0 },
    keyItems: {},
    critters: [],
    nextUid: 1,
    seen: [],
    quests: {},
    flags: {},
    plots: [null, null, null, null, null, null],
    hats: ["none"],
    playTime: 0,
    taken: [],
  };
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    const base = newState();
    return { ...base, ...s, resources: { ...base.resources, ...s.resources } };
  } catch {
    return null;
  }
}

export function saveState(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable (private mode) – the game still runs */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
