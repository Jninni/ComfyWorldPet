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
export const LOC = {
  buildings: {
    home: { x: -17, z: -19, rot: 0 },
    sewing: { x: 17, z: -19, rot: 0 },
    teahouse: { x: -16, z: 12, rot: 0 },
    library: { x: 0, z: 19, rot: 0 },
    flowershop: { x: 16, z: 12, rot: 0 },
    workshop: { x: 40, z: 15, rot: 0 },
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
};
