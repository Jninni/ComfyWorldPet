import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

/**
 * Comfy pastel palette, sampled from the sticker-diorama reference art.
 * All colours are in gamma space (what you'd pick in a paint program).
 */
export const PAL = {
  // outlines & ink
  ink: "#4a3a52",
  inkSoft: "#6d5a78",

  // walls / big surfaces
  lavender: "#cdb9f0",
  lavenderDeep: "#a993dc",
  lilac: "#e3d6fa",
  sky: "#bfe0f6",
  skyDeep: "#8fc3ea",
  mint: "#bfe9d6",
  mintDeep: "#8fd4b5",
  butter: "#fbe7a1",
  butterDeep: "#f5cf6b",
  cream: "#fff6e6",
  white: "#fffdf8",
  peach: "#ffd3b5",
  pink: "#f8b9cb",
  pinkDeep: "#ef8fab",
  rose: "#f47a9a",
  coral: "#ff9f8f",
  red: "#f0727a",

  // wood
  wood: "#e8c49a",
  woodLight: "#f2d7b4",
  woodDeep: "#c99a6b",
  woodDark: "#a3754d",

  // nature
  leaf: "#8fd27a",
  leafLight: "#b6e59a",
  leafDeep: "#5fb46a",
  leafDark: "#3f8f58",
  grass: "#a9de8c",
  grassLight: "#c4ec9f",
  grassDeep: "#86c97a",
  moss: "#9ccf87",
  stone: "#d9d4e3",
  stoneDeep: "#b4aec4",
  stoneDark: "#8e88a3",
  sand: "#f6e3bd",
  path: "#f1dcb6",
  pathDeep: "#e3c69b",
  water: "#9fd7f0",
  waterDeep: "#6fb9e2",

  // accents
  sun: "#ffe066",
  orange: "#ffb766",
  teal: "#7fd6cf",
  purple: "#b48ce6",
  brown: "#b98a6a",
  black: "#3b3043",
  crystal: "#c8a8ff",
  crystalGlow: "#f0d4ff",
} as const;

export type PalKey = keyof typeof PAL;

const cache = new Map<string, Color3>();

/** Accepts a palette key, a hex string or a Color3 and returns a Color3. */
export function col(c: PalKey | string | Color3): Color3 {
  if (c instanceof Color3) return c;
  const hex = (PAL as Record<string, string>)[c] ?? c;
  let v = cache.get(hex);
  if (!v) {
    v = Color3.FromHexString(hex);
    cache.set(hex, v);
  }
  return v;
}

export function col4(c: PalKey | string | Color3, a = 1): Color4 {
  const c3 = col(c);
  return new Color4(c3.r, c3.g, c3.b, a);
}

/** Lerp between two colours (gamma space). */
export function mixCol(a: PalKey | string | Color3, b: PalKey | string | Color3, t: number): Color3 {
  return Color3.Lerp(col(a), col(b), t);
}

/** Slight random variation of a colour, for organic-looking repeats. */
export function jitterCol(c: PalKey | string | Color3, amount = 0.05, rnd: () => number = Math.random): Color3 {
  const b = col(c);
  const j = () => (rnd() - 0.5) * 2 * amount;
  const d = j();
  return new Color3(
    Math.min(1, Math.max(0, b.r + d + j() * 0.3)),
    Math.min(1, Math.max(0, b.g + d + j() * 0.3)),
    Math.min(1, Math.max(0, b.b + d + j() * 0.3)),
  );
}

/** Deterministic PRNG (mulberry32) so the world looks identical every run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
