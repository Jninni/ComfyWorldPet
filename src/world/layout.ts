import type { ZoneId } from "../data/species";

/** World layout: x = east, z = north. Camera looks north from the south. */

export const WORLD = { minX: -130, maxX: 140, minZ: -50, maxZ: 140 };

export interface Ellipse {
  cx: number;
  cz: number;
  rx: number;
  rz: number;
}

/** Walkable lowlands; everything outside rises into soft hills. */
export const ZONE_SHAPES: { zone: ZoneId | "link"; e: Ellipse }[] = [
  { zone: "village", e: { cx: 8, cz: -1, rx: 56, rz: 32 } },
  { zone: "meadow", e: { cx: 0, cz: 80, rx: 50, rz: 40 } },
  { zone: "woods", e: { cx: -86, cz: 32, rx: 32, rz: 56 } },
  { zone: "pond", e: { cx: 100, cz: 26, rx: 30, rz: 36 } },
  { zone: "link", e: { cx: 0, cz: 34, rx: 9, rz: 12 } },
  { zone: "link", e: { cx: -51, cz: 6, rx: 9, rz: 6 } },
  { zone: "link", e: { cx: 67, cz: 6, rx: 8, rz: 6 } },
  { zone: "link", e: { cx: -46, cz: 72, rx: 16, rz: 10 } },
  { zone: "link", e: { cx: -42, cz: 106, rx: 13, rz: 11 } },
];

export const POND: Ellipse = { cx: 104, cz: 28, rx: 18, rz: 15 };

export function ellipseD(e: Ellipse, x: number, z: number) {
  const dx = (x - e.cx) / e.rx,
    dz = (z - e.cz) / e.rz;
  return Math.sqrt(dx * dx + dz * dz);
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** cheap value noise */
function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx),
    uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm(x: number, z: number) {
  return vnoise(x, z) * 0.6 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.1;
}

/** min normalised ellipse distance over walkable shapes (<1 inside) */
export function walkField(x: number, z: number) {
  let m = 99;
  for (const s of ZONE_SHAPES) m = Math.min(m, ellipseD(s.e, x, z));
  // wobble the border so it doesn't look like ellipses
  return m + (fbm(x * 0.08, z * 0.08) - 0.5) * 0.18;
}

/** Terrain height. */
export function heightAt(x: number, z: number): number {
  const w = walkField(x, z);
  let h = smooth(0.92, 1.35, w) * 7.5 + smooth(1.35, 2.2, w) * 6;
  h += (fbm(x * 0.05 + 3, z * 0.05) - 0.5) * 0.35 * (0.3 + smooth(0.9, 1.2, w));
  const p = ellipseD(POND, x, z);
  h -= smooth(1.15, 0.55, p) * 1.6;
  return h;
}

export const WATER_Y = -0.45;

export function isWater(x: number, z: number) {
  return ellipseD(POND, x, z) < 0.93;
}

export function zoneAt(x: number, z: number): ZoneId {
  if (x < -52 || (z > 60 && x < -54)) return "woods";
  if (z > 36) return "meadow";
  if (x > 67) return "pond";
  return "village";
}

/** Footpaths (polylines) painted on the ground and kept free of props. */
export const PATHS: { pts: [number, number][]; w: number }[] = [
  // north road: plaza → gate → meadow
  { pts: [[0, 6], [0, 20], [0, 32], [2, 46], [-2, 62], [4, 80], [0, 98]], w: 3.4 },
  // west road: plaza → woods
  { pts: [[-6, 0], [-22, 1], [-38, 4], [-51, 6], [-64, 12], [-78, 26], [-86, 42]], w: 3.2 },
  // east road: plaza → haven → pond
  { pts: [[6, 0], [20, 2], [34, 3], [50, 4], [67, 6], [76, 12], [82, 20]], w: 3.2 },
  // south lane to home & sewing
  { pts: [[0, -6], [-4, -12], [-16, -15]], w: 2.4 },
  { pts: [[0, -6], [6, -12], [16, -15]], w: 2.4 },
  // meadow → cave
  { pts: [[-2, 90], [-18, 98], [-32, 104], [-42, 110]], w: 2.6 },
  // meadow → woods shortcut
  { pts: [[-6, 66], [-30, 70], [-52, 70], [-70, 66]], w: 2.4 },
  // woods loop
  { pts: [[-86, 42], [-94, 58], [-86, 74], [-70, 66]], w: 2.2 },
  // pond ring
  { pts: [[82, 20], [84, 36], [96, 46], [112, 47]], w: 2.2 },
];

export const PLAZA = { x: 0, z: 0, r: 8.5 };

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax,
    vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export function nearPath(x: number, z: number, pad = 0): boolean {
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + pad) return true;
  for (const p of PATHS) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i],
        [bx, bz] = p.pts[i + 1];
      if (distToSegment(x, z, ax, az, bx, bz) < p.w / 2 + pad) return true;
    }
  }
  return false;
}

/** Key locations */
/**
 * Raised ledges (heights in metres above the ground at their centre). A normal jump reaches ~1.2 m, Puffbun ~1.7 m,
 * a double jump (Chirpy / unicorn) ~2.1 m and the giant frog ~2.3 m — so 1.85 m needs "double-jump class" moves.
 * Stacks: later steps sit on top of earlier ones.
 */
export interface LedgeSpot {
  id: string;
  name: string;
  x: number;
  z: number;
  steps: { r: number; h: number }[];
  reward: { kind: string; n: number }[];
}
export const LEDGES: LedgeSpot[] = [
  { id: "sunnymesa", name: "Sunny Mesa", x: 30, z: 68, steps: [{ r: 3.4, h: 1.85 }], reward: [{ kind: "dye_rose", n: 2 }, { kind: "dye_sunflower", n: 2 }, { kind: "dye_lavender", n: 2 }, { kind: "crystal", n: 2 }] },
  { id: "mossytower", name: "Mossy Tower", x: -102, z: 18, steps: [{ r: 5.2, h: 1.0 }, { r: 2.8, h: 2.9 }], reward: [{ kind: "crystal", n: 5 }, { kind: "lure", n: 1 }, { kind: "dye_mint", n: 2 }] },
  { id: "heronrock", name: "Heron Rock", x: 124, z: 18, steps: [{ r: 3.0, h: 1.85 }], reward: [{ kind: "dye_bluebell", n: 3 }, { kind: "pebble", n: 4 }, { kind: "cookie", n: 3 }] },
  { id: "lookout", name: "Lookout Stump", x: -38, z: -8, steps: [{ r: 3.0, h: 1.85 }], reward: [{ kind: "petal", n: 6 }, { kind: "cookie", n: 3 }, { kind: "dye_poppy", n: 2 }] },
];

export const LOC: {
  buildings: Record<string, { x: number; z: number; rot: number }>;
  gateNorth: { x: number; z: number };
  gateWest: { x: number; z: number };
  gateEast: { x: number; z: number };
  caveMouth: { x: number; z: number };
  plots: { x: number; z: number }[];
  spawnStart: { x: number; z: number };
  garden: { x: number; z: number }[];
  crumbs: [number, number][];
  thiefNest: [number, number];
  thornGate: { x: number; z: number };
  unicornGlade: { x: number; z: number };
} = {
  buildings: {
    home: { x: -17, z: -19, rot: 0 },
    sewing: { x: 17, z: -19, rot: 0 },
    teahouse: { x: -16, z: 12, rot: 0 },
    library: { x: 0, z: 19, rot: 0 },
    flowershop: { x: 16, z: 12, rot: 0 },
    workshop: { x: 40, z: 15, rot: 0 },
    bakery: { x: 28, z: 12, rot: 0 },
  },
  gateNorth: { x: 0, z: 34 },
  gateWest: { x: -51, z: 6 },
  gateEast: { x: 67, z: 6 },
  caveMouth: { x: -43, z: 115 },
  plots: [
    { x: 28, z: -7 },
    { x: 37, z: -7 },
    { x: 46, z: -7 },
    { x: 28, z: -16 },
    { x: 37, z: -16 },
    { x: 46, z: -16 },
  ],
  spawnStart: { x: -17, z: -14 },
  // the player's veggie garden, just west of the cottage
  garden: [
    { x: -27, z: -16.5 },
    { x: -23.6, z: -16.5 },
    { x: -27, z: -12.6 },
    { x: -23.6, z: -12.6 },
  ],
  // pastry-thief crumb trail: from the bakery, through the plaza, out the west gate into Mossy Woods
  crumbs: [
    [21, 5],
    [10, 3.5],
    [-6, 3],
    [-22, 3],
    [-38, 5.5],
    [-56, 9],
    [-68, 17],
    [-80, 29],
    [-89, 41],
  ],
  thiefNest: [-95, 50],
  // the dangerous Thornwild opens up north-east of Whisper Meadow after the main story
  thornGate: { x: 24, z: 108 },
  // a shy unicorn appears here once the Thornwild is safe again
  unicornGlade: { x: -26, z: 92 },
};
