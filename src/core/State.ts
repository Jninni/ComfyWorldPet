import { DEFAULT_LOOK } from "../entities/characterModels";
import type { SpeciesId } from "../data/species";
import type { ResourceId, BuildableId } from "../data/items";
import type { FishId } from "../data/fishing";
import type { IngredientId, FoodId, DyeId, CropId, BuffId, Garment, CafeOrder } from "../data/crafting";

export interface PlayerLookState {
  skin: string;
  hair: string;
  outfit: string;
  hat: string;
  style?: string;
  outfit2?: string;
  accessory?: string;
  accessoryColor?: string;
}

export interface OwnedCritter {
  uid: number;
  species: SpeciesId;
  variant: 0 | 1;
  name: string;
  inParty: boolean;
  friendship: number;
  /** experience from adventuring together (levels 1–10) */
  xp?: number;
  /** petting builds bond; every 5 bond = +1 friendship heart */
  bond?: number;
  /** seconds spent in your party */
  together?: number;
}

export interface QuestState {
  stage: number;
  progress: number;
  done: boolean;
}

export interface GardenBed {
  crop: CropId | null;
  /** Date.now() when planted */
  plantedAt: number;
  watered: boolean;
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
  // ---- v2: cooking, gardening, sewing ----
  ingredients: Record<IngredientId, number>;
  foods: Partial<Record<FoodId, number>>;
  dyes: Partial<Record<DyeId, number>>;
  garden: GardenBed[];
  /** buff → expiry (Date.now() ms) or remaining uses for "cozy" */
  buffs: Partial<Record<BuffId, number>>;
  skills: { cooking?: boolean; sewing?: boolean; gardening?: boolean };
  wardrobe: Garment[];
  nextGarmentUid: number;
  orders: CafeOrder[];
  ordersRefreshAt: number;
  // ---- v3: fishing ----
  fishLog: Partial<Record<FishId, { count: number; best: number }>>;
}

export const PARTY_MAX = 3;
const KEY = "cwp.save.v1";

export function newState(): GameState {
  return {
    version: 3,
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
    ingredients: { wheat: 0, carrot: 0, strawberry: 0, pumpkin: 0, apple: 0, mushroom: 0, honey: 0, fish: 0 },
    foods: {},
    dyes: {},
    garden: [0, 1, 2, 3].map(() => ({ crop: null, plantedAt: 0, watered: false })),
    buffs: {},
    skills: {},
    wardrobe: [],
    nextGarmentUid: 1,
    orders: [],
    ordersRefreshAt: 0,
    fishLog: {},
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
    // older saves simply lack the newer fields: fill them with defaults (never drop progress)
    return {
      ...base,
      ...s,
      version: 3,
      look: { ...base.look, ...s.look },
      resources: { ...base.resources, ...s.resources },
      ingredients: { ...base.ingredients, ...(s.ingredients ?? {}) },
      skills: { ...(s.skills ?? {}) },
      garden: s.garden?.length ? s.garden : base.garden,
    };
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
