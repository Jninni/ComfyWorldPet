/**
 * The Thornwild — the first "dangerous" zone: a twilight bramble forest with three Gloomy arenas,
 * campfire checkpoints and a boss clearing. Follow camera, like the Crystal Cave.
 *
 * Layout (local, +Z = north / away from camera), walkable ≈ 62 x 61 m:
 *
 *   entrance trail (south) → Camp (campfire, tent, signpost)
 *     → NW path → Arena 0 (west) → north path → Checkpoint 0 campfire
 *     → Arena 1 (north-west) → east path → Checkpoint 1 campfire
 *     → south-east path → Arena 2 (centre) → east path → Checkpoint 2 campfire
 *     → north approach → [boss gate] → Boss clearing (north-east, r 11) with the throne-stump & treasure
 *
 * Built in WORLD coordinates (origin added); all meshes are parented to `root` (identity transform).
 * No point lights: warm/glow light pools are baked into the floor's vertex colours.
 *
 * Cleansing: `cleanse(f)` (0 gloomy → 1 cleansed) lerps material tints (brambles → green hedges, bark → warm wood,
 * canopies → green / blossom pink), the floor colours (indigo moss → meadow grass & sandy trail), retracts the
 * thin-instanced thorns, pops up a thin-instanced flower field, fades mist + gloomy motes and fades in
 * golden sparkles + butterflies. Pair with `cleansedLighting` (see `lerpLighting`).
 */
import { Mesh, MeshBuilder, TransformNode, Vector3, VertexBuffer, Color3, Quaternion, type Scene } from "@babylonjs/core";
import { Batch, finishMesh, lathe, scallopRug, softCyl } from "../render/Shapes";
import { col, mixCol, jitterCol, rng } from "../render/Palette";
import { toonMat } from "../render/Toon";
import type { StageLighting } from "../render/Stage";
import type { Collider, InteriorDef } from "../core/types";
import { elb, addRock, addLog, addStump, addFlowerPatch, makeMotes, linkBatches, LEAVES_BUILD } from "./props";
import {
  TAU,
  smooth01,
  at,
  tubeMesh,
  quatY,
  alignY,
  InstSet,
  type InstItem,
  thornMesh,
  flowerMesh,
  butterflyMesh,
  addTwistedTree,
  addGloomShroom,
  addBigShroom,
  addCampfire,
  addIconSign,
  addTent,
  SHROOM_LIGHT,
  type ShroomHue,
} from "./thornwild_kit";

export { buildThornGate, type ThornGate } from "./thornwild_gate";

/* ================================================================== */
/* Lighting                                                            */
/* ================================================================== */

/** Moody twilight: indigo/plum fog, low warm-magenta sun. */
export const THORN_LIGHT: StageLighting = {
  sky: "#a89ae4",
  ground: "#3d2f5e",
  hemi: 0.66,
  sun: "#ffa6c9",
  sunI: 0.62,
  sunDir: [0.5, -0.62, 0.6],
  fog: "#433563",
  fogDensity: 0.0145,
  clear: "#2a2145",
  skyTop: "#2a2145",
  skyHorizon: "#5a4278",
};

/** Cleansed: warm sunny pastel afternoon. */
export const THORN_CLEAN_LIGHT: StageLighting = {
  sky: "#f6efff",
  ground: "#d9c8b4",
  hemi: 0.64,
  sun: "#fff0d8",
  sunI: 0.98,
  sunDir: [-0.5, -1, 0.45],
  fog: "#f7e4ef",
  fogDensity: 0.0055,
  clear: "#cfe6fb",
  skyTop: "#a9d4f5",
  skyHorizon: "#fbe0ef",
};

/** Blend two StageLightings (for the cleanse transition). */
export function lerpLighting(a: StageLighting, b: StageLighting, f: number): StageLighting {
  const c = (x: string, y: string) => mixCol(x, y, f).toHexString();
  const l = (x: number, y: number) => x + (y - x) * f;
  const d: [number, number, number] = [l(a.sunDir[0], b.sunDir[0]), l(a.sunDir[1], b.sunDir[1]), l(a.sunDir[2], b.sunDir[2])];
  return {
    sky: c(a.sky, b.sky),
    ground: c(a.ground, b.ground),
    hemi: l(a.hemi, b.hemi),
    sun: c(a.sun, b.sun),
    sunI: l(a.sunI, b.sunI),
    sunDir: d,
    fog: c(a.fog, b.fog),
    fogDensity: l(a.fogDensity, b.fogDensity),
    clear: c(a.clear, b.clear),
    skyTop: c(a.skyTop, b.skyTop),
    skyHorizon: c(a.skyHorizon, b.skyHorizon),
  };
}

/* ================================================================== */
/* Layout                                                              */
/* ================================================================== */

type Shape = { x1: number; z1: number; x2: number; z2: number; r: number; trail: boolean };
const cap = (x1: number, z1: number, x2: number, z2: number, r: number): Shape => ({ x1, z1, x2, z2, r, trail: true });
const circ = (x: number, z: number, r: number): Shape => ({ x1: x, z1: z, x2: x, z2: z, r, trail: false });

const CAMP = { x: 0, z: -24, r: 5.6 };
const ARENAS = [
  { x: -19, z: -13, r: 7 },
  { x: -15, z: 18, r: 7 },
  { x: 7, z: -3, r: 7 },
];
const CHECKS = [
  { x: -25, z: 3.5, r: 3.6 },
  { x: -1, z: 14, r: 3.6 },
  { x: 23, z: -11, r: 3.6 },
];
const BOSS = { x: 22, z: 15, r: 11 };
/** boss gate line (local): spans the arena neck */
const GATE = { x: 22.5, z: 3.9, half: 2.9 };
const THRONE = { x: 22, z: 23.2 };

const SHAPES: Shape[] = [
  cap(0, -35.5, 0, -27, 2.4), // entrance trail
  circ(CAMP.x, CAMP.z, CAMP.r),
  cap(-3, -21, -12, -16, 2.3), // → arena 0
  circ(ARENAS[0].x, ARENAS[0].z, ARENAS[0].r),
  cap(-22, -7, -25, 1, 2.3), // → checkpoint 0
  circ(CHECKS[0].x, CHECKS[0].z, CHECKS[0].r),
  cap(-24, 6, -20, 12.5, 2.3), // → arena 1
  circ(ARENAS[1].x, ARENAS[1].z, ARENAS[1].r),
  cap(-8.5, 17.5, -3.5, 15, 2.3), // → checkpoint 1
  circ(CHECKS[1].x, CHECKS[1].z, CHECKS[1].r),
  cap(0, 11, 4, 3.5, 2.3), // → arena 2
  circ(ARENAS[2].x, ARENAS[2].z, ARENAS[2].r),
  cap(13, -6, 20, -10, 2.3), // → checkpoint 2
  circ(CHECKS[2].x, CHECKS[2].z, CHECKS[2].r),
  cap(23, -8, 22.5, 3.4, 2.4), // boss approach
  circ(BOSS.x, BOSS.z, BOSS.r),
];

function shapeD(s: Shape, x: number, z: number) {
  const dx = s.x2 - s.x1,
    dz = s.z2 - s.z1;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((x - s.x1) * dx + (z - s.z1) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return s.r - Math.hypot(x - (s.x1 + dx * t), z - (s.z1 + dz * t));
}

/** signed distance to walkable floor (local coords): > 0 inside. */
export function thornSdfLocal(x: number, z: number): number {
  let best = -1e9;
  for (const s of SHAPES) {
    const d = shapeD(s, x, z);
    if (d > best) best = d;
  }
  return best;
}
const sdf = thornSdfLocal;
function trailD(x: number, z: number): number {
  let best = -1e9;
  for (const s of SHAPES) if (s.trail) best = Math.max(best, shapeD(s, x, z));
  return best;
}

/** arena enemy ring: [angle deg, radius] */
const ENEMY_RING: [number, number][][] = [
  [
    [0, 4.6],
    [50, 4.2],
    [100, 4.5],
    [150, 3.4],
    [-50, 4.2],
    [-110, 4.5],
  ],
  [
    [-20, 4.4],
    [35, 4.0],
    [145, 4.2],
    [-160, 3.8],
    [-100, 4.5],
    [-55, 2.6],
  ],
  [
    [10, 4.4],
    [65, 4.2],
    [165, 4.4],
    [-145, 4.2],
    [-45, 4.0],
    [120, 2.4],
  ],
];

const SPOTS: Record<string, [number, number]> = {
  camp: [0.4, -24.8],
  checkpoint_0: [-24.4, 2.4],
  checkpoint_1: [-1.2, 13.2],
  checkpoint_2: [22.4, -10.6],
  arena_0: [ARENAS[0].x, ARENAS[0].z],
  arena_1: [ARENAS[1].x, ARENAS[1].z],
  arena_2: [ARENAS[2].x, ARENAS[2].z],
  guardian_0: [-24.4, -13.8],
  guardian_1: [-15.6, 23.3],
  guardian_2: [6.3, -8.4],
  boss: [BOSS.x, BOSS.z + 1.4],
  boss_gate: [GATE.x, GATE.z],
  treasure: [THRONE.x, THRONE.z - 2.9],
  res_0: [-8.0, -18.6],
  res_1: [-23.2, -2.0],
  res_2: [-21.0, 9.6],
  res_3: [-5.4, 16.6],
  res_4: [2.6, 6.8],
  res_5: [16.6, -8.4],
  heart_0: [-23.4, 5.4],
  heart_1: [-10.4, 20.6],
  heart_2: [20.8, -12.4],
  heart_3: [21.4, -2.0],
};
ARENAS.forEach((a, ai) =>
  ENEMY_RING[ai].forEach(([deg, rr], j) => {
    const t = (deg * Math.PI) / 180;
    SPOTS[`enemy_${ai * 6 + j}`] = [a.x + Math.cos(t) * rr, a.z + Math.sin(t) * rr];
  }),
);

/** campfire centres (local); the matching respawn spot is next to each */
const FIRES: [number, number][] = [
  [2.4, -23.2], // camp
  [-26.7, 4.3], // checkpoint 0
  [0.9, 15.6], // checkpoint 1
  [24.5, -12.4], // checkpoint 2
];

const SPAWN: [number, number] = [0, -30.2];
const EXIT: [number, number] = [0, -33.4];

export interface ThornwildDef extends InteriorDef {
  /** colliders that seal the boss clearing; NOT in `colliders` — add/remove them yourself during the fight */
  bossGate: Collider[];
  /** raise (true) / sink (false) the bramble wall visuals at the boss entrance (animated in update) */
  setBossGate(closed: boolean): void;
  /** campfire centres (world). spots camp / checkpoint_0..2 are the respawn points beside fires 0..3 */
  campfires: Vector3[];
  arenas: { center: Vector3; radius: number }[];
  bossArena: { center: Vector3; radius: number };
  /** signed distance to the walkable floor (world xz), > 0 inside */
  sdf(x: number, z: number): number;
}

/* ================================================================== */
/* Builder                                                             */
/* ================================================================== */

export function buildThornwild(scene: Scene, origin: Vector3): ThornwildDef {
  const ox = origin.x,
    oy = origin.y,
    oz = origin.z;
  const r = rng(717171);
  const rand = (a: number, b: number) => a + (b - a) * r();
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length) % a.length];
  const root = new TransformNode("thornwild", scene);
  const W = (lx: number, lz: number) => new Vector3(ox + lx, oy, oz + lz);

  // ---- batches: static (fixed colours) vs. tinted (material colour changes on cleanse)
  const main = new Batch(scene, "thornMain"); // stones, wood, campfires, signs
  const leaves = new Batch(scene, "thornLeaves"); // swaying static foliage (camp flowers)
  const glow = new Batch(scene, "thornGlow"); // amber / magenta mushroom caps (pulse)
  const warm = new Batch(scene, "thornWarm"); // lantern & ember glow (steady)
  const gloomGlow = new Batch(scene, "thornGloomGlow"); // throne cracks (magenta → gold on cleanse)
  const bramble = new Batch(scene, "thornBramble"); // bramble mounds (tinted)
  const vines = new Batch(scene, "thornVines"); // tendrils, hanging vines, ferns (tinted, sway)
  const bark = new Batch(scene, "thornBark"); // trunks, branches, throne (tinted)
  const canopyA = new Batch(scene, "thornCanopyA"); // → green
  const canopyB = new Batch(scene, "thornCanopyB"); // → blossom pink
  linkBatches(main, { leaves, glow });
  const colliders: Collider[] = [];
  const trees = { bark, canopy: [canopyA, canopyB, canopyA], glow: warm };

  const reserved: [number, number][] = [...Object.values(SPOTS), SPAWN, EXIT, ...FIRES];
  const isFree = (lx: number, lz: number, rad: number) => reserved.every(([sx, sz]) => Math.hypot(sx - lx, sz - lz) > rad);
  const grad = (x: number, z: number): [number, number] => {
    const e = 0.4;
    const gx = sdf(x + e, z) - sdf(x - e, z),
      gz = sdf(x, z + e) - sdf(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  };
  /** metres north until walkable floor (line-of-sight helper for the follow camera) */
  const northGap = (lx: number, lz: number) => {
    for (let q = 0.4; q <= 9; q += 0.5) if (sdf(lx, lz + q) > 0.2) return q;
    return 99;
  };
  /** max height an object may have at (lx,lz) with north footprint `rad` without hiding the player */
  const losCap = (lx: number, lz: number, rad = 0) => {
    const dN = Math.min(northGap(lx - rad * 0.6, lz), northGap(lx, lz), northGap(lx + rad * 0.6, lz));
    return dN >= 99 ? 99 : 0.6 + 0.7 * Math.max(0, dN - rad);
  };

  // thin-instance items gathered while building
  const thornItems: InstItem[] = [];
  const flowerItems: InstItem[] = [];
  const flowerPal = ["#ffd0e0", "#ffffff", "#fff0a8", "#e6d6ff", "#cfe8ff", "#ffc6b0", "#ffb8d0", "#d9f5b4"].map((h) => col(h));
  const addThorn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, s: number) =>
    thornItems.push({ x, y, z, q: quatY(nx, ny, nz, r() * 6), s, k: r() });
  const addFlower = (lx: number, y: number, lz: number, s = 1) =>
    flowerItems.push({ x: ox + lx, y, z: oz + lz, q: Quaternion.FromEulerAngles(rand(-0.15, 0.15), rand(0, TAU), rand(-0.15, 0.15)), s: s * rand(0.75, 1.25), c: pick(flowerPal), k: r() });

  // light pools baked into the floor: [x, z, gloomColour, radius, strength]
  const pools: [number, number, Color3, number, number][] = [];
  for (const [fx, fz] of FIRES) pools.push([fx, fz, col("#ffb870"), 5.2, 0.95]);
  pools.push([THRONE.x, THRONE.z - 0.5, col("#d86ad0"), 5.5, 0.8]);

  // ------------------------------------------------------------------ glow mushrooms (decided early for light pools)
  const shroomSpots: [number, number, ShroomHue, number][] = [];
  {
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 36; tries++) {
      const lx = rand(-29, 33),
        lz = rand(-34, 26);
      const d = sdf(lx, lz);
      if (d < 0.15 || d > 0.85 || !isFree(lx, lz, 1.9)) continue;
      if (Math.hypot(lx - CAMP.x, lz - CAMP.z) < CAMP.r + 0.5 && r() < 0.6) continue;
      if (shroomSpots.some(([x, z]) => Math.hypot(x - lx, z - lz) < 2.6)) continue;
      const hue: ShroomHue = r() < 0.58 ? "amber" : "magenta";
      shroomSpots.push([lx, lz, hue, rand(0.8, 1.25)]);
      placed++;
    }
  }
  for (const [x, z, h, s] of shroomSpots) pools.push([x, z, col(SHROOM_LIGHT[h]), 1.9 * s, 0.75]);
  const bigShrooms: [number, number, ShroomHue, number][] = [
    [-4.2, -20.2, "amber", 0.9], // camp, by the NW exit
    [19.0, 5.4, "magenta", 1.0], // flanking the boss gate
    [26.2, 5.0, "magenta", 0.95],
    [-27.6, 5.9, "amber", 0.85], // checkpoint 0
    [-23.6, -17.9, "magenta", 1.0], // arena 0
    [-10.6, 22.4, "amber", 0.9], // arena 1
    [11.6, 1.6, "amber", 0.9], // arena 2
  ];
  for (const [x, z, h] of bigShrooms) pools.push([x, z, col(SHROOM_LIGHT[h]), 3.4, 0.85]);
  reserved.push(...bigShrooms.map(([x, z]) => [x, z] as [number, number]));

  // ------------------------------------------------------------------ floor (two colour sets: gloomy / cleansed)
  const GX0 = -50,
    GX1 = 54,
    GZ0 = -46,
    GZ1 = 48;
  const ground = MeshBuilder.CreateGround("thornFloor", { width: GX1 - GX0, height: GZ1 - GZ0, subdivisions: 92, updatable: true }, scene);
  ground.removeVerticesData(VertexBuffer.UVKind);
  let cGloom: Float32Array, cClean: Float32Array, cMix: Float32Array;
  {
    const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
    const n = pos.length / 3;
    cGloom = new Float32Array(n * 4);
    cClean = new Float32Array(n * 4);
    cMix = new Float32Array(n * 4);
    const G = {
      floor: col("#6b7393"),
      floorIn: col("#7d88a6"),
      edge: col("#41466a"),
      out: col("#262842"),
      trail: col("#ab9fbe"),
      stain: col("#4d4870"),
      camp: col("#a898b2"),
      ring: col("#a7b0cc"),
      spill: col("#dcc8cc"),
    };
    const C = {
      floor: col("#a6dc8a"),
      floorIn: col("#c2eb9e"),
      edge: col("#7fbf78"),
      out: col("#5d9f68"),
      trail: col("#f1dcb6"),
      stain: col("#d4f2b0"),
      camp: col("#f6e3bd"),
      ring: col("#ffe0ea"),
      spill: col("#fff3d8"),
    };
    const cx = (GX0 + GX1) / 2,
      cz = (GZ0 + GZ1) / 2;
    for (let i = 0; i < n; i++) {
      const lx = pos[i * 3] + cx,
        lz = pos[i * 3 + 2] + cz;
      const d = sdf(lx, lz);
      const noise = 0.5 + 0.5 * Math.sin(lx * 0.7 + Math.sin(lz * 0.55) * 2) * Math.cos(lz * 0.63 - lx * 0.27);
      const td = trailD(lx, lz);
      const paint = (P: typeof G, gloom: boolean): Color3 => {
        let cc: Color3;
        if (d > 0) cc = Color3.Lerp(P.floor, P.floorIn, Math.min(1, d / 2.5) * (0.55 + 0.45 * noise));
        else {
          cc = Color3.Lerp(P.floor, P.edge, Math.min(1, -d / 1.2));
          if (d < -1.2) cc = Color3.Lerp(cc, P.out, Math.min(1, (-d - 1.2) / 3.5) * (0.8 + 0.2 * noise));
        }
        // sandy trail down the middle of the paths
        if (td > 0.7 && d > 0) {
          const wob = Math.sin(lx * 1.3 + lz * 0.9) * 0.2;
          cc = Color3.Lerp(cc, P.trail, Math.min(1, (td - 0.7 + wob) / 0.8) * 0.75);
        }
        // arenas: soft stained centre + a pale ring marking the clearing
        for (const a of ARENAS) {
          const rr = Math.hypot(lx - a.x, lz - a.z);
          if (rr < a.r + 0.5) {
            if (rr < 3.4) cc = Color3.Lerp(cc, P.stain, (1 - rr / 3.4) * (gloom ? 0.6 : 0.5));
            const ring = Math.abs(rr - (a.r - 1.25));
            if (ring < 0.32) cc = Color3.Lerp(cc, P.ring, (1 - ring / 0.32) * 0.55);
          }
        }
        // boss clearing: gloomy spiral (sunny meadow when cleansed)
        {
          const rr = Math.hypot(lx - BOSS.x, lz - BOSS.z);
          if (rr < BOSS.r) {
            const ang = Math.atan2(lz - BOSS.z, lx - BOSS.x);
            const v = 0.5 + 0.5 * Math.sin(ang * 3 + rr * 0.85);
            const k = Math.max(0, 1 - rr / (BOSS.r - 1)) * (gloom ? 0.55 : 0.3);
            cc = Color3.Lerp(cc, gloom ? P.stain : col("#fff0b0"), k * (gloom ? v : 1 - rr / BOSS.r));
            const ring = Math.abs(rr - (BOSS.r - 1.4));
            if (ring < 0.4) cc = Color3.Lerp(cc, P.ring, (1 - ring / 0.4) * 0.6);
          }
        }
        // camp: warmer, cosier floor
        {
          const rr = Math.hypot(lx - CAMP.x, lz - CAMP.z);
          if (rr < CAMP.r + 0.5) cc = Color3.Lerp(cc, P.camp, Math.max(0, 1 - rr / (CAMP.r + 0.5)) * 0.55);
        }
        // daylight spilling in along the entrance trail
        if (lz < -29) {
          const k = Math.min(1, (-29 - lz) / 7) * Math.max(0, 1 - Math.abs(lx) / (3 + Math.max(0, -33 - lz) * 0.8));
          cc = Color3.Lerp(cc, P.spill, Math.min(1, k * 1.05));
        }
        // baked glow pools
        for (const [px, pz, pc, pr, ps] of pools) {
          const dd = Math.hypot(lx - px, lz - pz);
          if (dd < pr) {
            const k = 1 - dd / pr;
            cc = Color3.Lerp(cc, gloom ? mixCol(cc, pc, 0.85) : mixCol(cc, "#fff4d0", 0.4), k * k * (gloom ? ps : ps * 0.35));
          }
        }
        return cc;
      };
      const g = paint(G, true),
        c = paint(C, false);
      cGloom.set([g.r, g.g, g.b, 1], i * 4);
      cClean.set([c.r, c.g, c.b, 1], i * 4);
      pos[i * 3] = lx + ox;
      pos[i * 3 + 1] = oy;
      pos[i * 3 + 2] = lz + oz;
    }
    cMix.set(cGloom);
    ground.setVerticesData(VertexBuffer.PositionKind, pos);
    ground.setVerticesData(VertexBuffer.ColorKind, cMix, true, 4);
    ground.createNormals(false);
    ground.refreshBoundingInfo();
  }
  finishMesh(ground, scene, { outline: false, castShadow: false, rim: 0.04 });
  ground.parent = root;
  ground.isPickable = false;

  // ------------------------------------------------------------------ bramble walls
  const moundCols = ["#ffffff", "#f3ecff", "#fff1f7", "#ecefff"];
  const cell = 1.3;
  const fronts: { x: number; z: number; h: number; r: number; gx: number; gz: number }[] = [];
  for (let gz = -44; gz <= 42; gz += cell) {
    for (let gx = -46; gx <= 50; gx += cell) {
      const lx = gx + rand(-0.3, 0.3),
        lz = gz + rand(-0.3, 0.3);
      const d = sdf(lx, lz);
      if (d > -0.35 || d < -3.0) continue;
      // keep the trail mouth open to the meadow
      if (lz < -33.5 && Math.abs(lx) < 2.0 + (-33.5 - lz) * 0.9) continue;
      const [dx, dzz] = grad(lx, lz); // toward the floor
      const camSide = Math.max(0, Math.min(1, (dzz + 0.15) / 0.8));
      const cap0 = losCap(lx, lz);
      const tall = Math.min((1.9 + Math.min(1.3, -d * 0.5)) * (1 - camSide * 0.45) + rand(-0.25, 0.35), cap0 + rand(-0.1, 0.15));
      const rad = rand(0.85, 1.25) * (1 - camSide * 0.15);
      const h1 = Math.min(tall, 1.25 + rand(-0.2, 0.25));
      const base = jitterCol(pick(moundCols), 0.025, r);
      const bot = col("#8d8398");
      const back = d < -1.9;
      const m1 = elb(scene, rad, h1 * 0.62, rad * rand(0.85, 1.0), { color: base, bottom: bot }, back ? 5 : 6);
      m1.position.set(ox + lx, oy + h1 * 0.38, oz + lz);
      bramble.add(m1);
      let topY = h1,
        tx = lx,
        tz = lz,
        tr = rad;
      const surf: [number, number, number, number, number, number][] = [[lx, h1 * 0.38, lz, rad, h1 * 0.62, rad]];
      if (tall > h1 + 0.35 && (!back || r() < 0.5)) {
        const h2 = tall - h1 * 0.55;
        const r2 = rad * rand(0.66, 0.82);
        tx = lx + rand(-0.2, 0.2) - dx * 0.25;
        tz = lz + rand(-0.2, 0.2) - dzz * 0.25;
        const cy = h1 * 0.6 + h2 * 0.42;
        const m2 = elb(scene, r2, h2 * 0.55, r2, { color: base, bottom: Color3.Lerp(bot, base, 0.5) }, back ? 5 : 6);
        m2.position.set(ox + tx, oy + cy, oz + tz);
        bramble.add(m2);
        topY = cy + h2 * 0.55;
        tr = r2;
        surf.push([tx, cy, tz, r2, h2 * 0.55, r2]);
      }
      // rounded thorns on visible faces (toward the floor & up)
      if (d > -2.2) {
        const nT = 4 + Math.floor(r() * 3);
        for (let j = 0; j < nT; j++) {
          const [sx, sy, sz, rx, ry, rz] = surf[Math.floor(r() * surf.length)];
          const ba = Math.atan2(dzz, dx);
          const a = ba + (r() < 0.5 ? -1 : 1) * rand(0.55, 1.6);
          let el = rand(0.05, 1.05);
          // thorns aimed at the camera (-Z) read as dots: tilt those upward so their cone shows
          if (Math.sin(a) < -0.35) el = Math.max(el, 0.95 + 0.4 * (-Math.sin(a) - 0.35));
          const ux = Math.cos(a) * Math.cos(el),
            uy = Math.sin(el),
            uz = Math.sin(a) * Math.cos(el);
          const px = sx + ux * rx * 0.97,
            py = sy + uy * ry * 0.97,
            pz = sz + uz * rz * 0.97;
          if (py < 0.15) continue;
          addThorn(ox + px, oy + py, oz + pz, ux / rx, uy / ry, uz / rz, rand(1.2, 1.8) * (1 - camSide * 0.25));
        }
      }
      // flowers waiting on top (shown when cleansed)
      if (r() < 0.55) addFlower(tx + rand(-0.3, 0.3) * tr, oy + topY - 0.06, tz + rand(-0.3, 0.3) * tr, 1.05);
      if (d > -1.8) {
        colliders.push({ kind: "circle", x: ox + lx, z: oz + lz, r: rad * 0.92 });
        fronts.push({ x: lx, z: lz, h: topY, r: rad, gx: dx, gz: dzz });
      }
    }
  }

  // ------------------------------------------------------------------ wall decor: tendrils, arches, hanging vines, shrooms
  for (const wf of fronts) {
    const facing = wf.gz < -0.35;
    const roll = r();
    if (roll < 0.16 && wf.h > 1.0) {
      // curly tendril rising from the top (sways)
      const bx = wf.x - wf.gx * 0.2,
        bz = wf.z - wf.gz * 0.2;
      const a = Math.atan2(wf.gz, wf.gx) + rand(-0.8, 0.8);
      const L = Math.min(rand(0.7, 1.1), Math.max(0.4, losCap(bx, bz) - wf.h));
      const pts: Vector3[] = [];
      for (let j = 0; j <= 6; j++) {
        const u = j / 6;
        pts.push(new Vector3(ox + bx + Math.cos(a) * u * 0.35, oy + wf.h - 0.15 + u * L, oz + bz + Math.sin(a) * u * 0.35));
      }
      const tip = pts[6];
      const cr = 0.16;
      for (let j = 1; j <= 6; j++) {
        const q = (j / 6) * Math.PI * 1.6;
        pts.push(new Vector3(tip.x + Math.cos(a) * Math.sin(q) * cr, tip.y + (1 - Math.cos(q)) * cr * 0.9 - (j / 6) * 0.05, tip.z + Math.sin(a) * Math.sin(q) * cr));
      }
      vines.add(tubeMesh(scene, pts, (u) => 0.085 * (1 - 0.7 * u), "#ffffff", "#c8bed4", 5));
      const lf = elb(scene, 0.13, 0.03, 0.07, { color: "#f6f0ff" }, 5);
      const mid = pts[4];
      at(lf, mid.x + 0.06, mid.y, mid.z, [0.3, a, 0.4]);
      vines.add(lf);
      addThorn(pts[2].x, pts[2].y, pts[2].z, Math.cos(a + 1.6), 0.4, Math.sin(a + 1.6), 0.6);
      addThorn(pts[5].x, pts[5].y, pts[5].z, Math.cos(a - 1.6), 0.5, Math.sin(a - 1.6), 0.55);
    } else if (roll < 0.3 && wf.h > 1.0) {
      // thick thorny bramble arch looping out of the wall
      const ta = Math.atan2(wf.gz, wf.gx) + Math.PI / 2;
      const half = rand(0.6, 0.9);
      const H = Math.min(rand(0.9, 1.3), losCap(wf.x, wf.z) - 0.1);
      if (H > 0.6) {
        const pts: Vector3[] = [];
        for (let j = 0; j <= 8; j++) {
          const u = j / 8;
          const s = (u * 2 - 1) * half;
          const bulge = wf.r * (0.75 + 0.25 * Math.sin(u * Math.PI));
          pts.push(new Vector3(ox + wf.x + Math.cos(ta) * s + wf.gx * bulge, oy + Math.sin(u * Math.PI) * H, oz + wf.z + Math.sin(ta) * s + wf.gz * bulge));
        }
        bramble.add(tubeMesh(scene, pts, (u) => 0.12 * (1 - 0.3 * Math.sin(u * Math.PI)), "#ffffff", "#b0a6bc", 6));
        for (const j of [2, 4, 6]) {
          const p = pts[j];
          addThorn(p.x, p.y + 0.08, p.z, wf.gx * 0.3, 1, wf.gz * 0.3, 0.75);
        }
      }
    }
    if (facing && wf.h > 1.7 && r() < 0.3) {
      // hanging leafy vine down the camera-facing face
      const n = 3 + Math.floor(r() * 5);
      const fx = wf.x + wf.gx * wf.r * 0.9,
        fz = wf.z + wf.gz * wf.r * 0.9;
      let sw = 0;
      for (let j = 0; j < n; j++) {
        const y = wf.h - 0.3 - j * 0.21;
        if (y < 0.35) break;
        sw += rand(-0.05, 0.05);
        const sd = j % 2 ? 1 : -1;
        const leaf = elb(scene, 0.11, 0.08, 0.03, { color: j % 3 ? "#ffffff" : "#efe6ff", bottom: "#c4b8d2" }, 5);
        leaf.position.set(ox + fx + sw + sd * 0.06, oy + y, oz + fz - 0.05);
        leaf.rotation.set(0.15, 0, sd * 0.6);
        vines.add(leaf);
        if (j === n - 1 && r() < 0.5) {
          const berry = elb(scene, 0.06, 0.06, 0.06, { color: pick(["#ffe6a8", "#ffd0f2"]) }, 4);
          berry.position.set(ox + fx + sw, oy + y - 0.11, oz + fz - 0.08);
          warm.add(berry);
        }
      }
    }
    if (r() < 0.035 && wf.h > 1.0) addGloomShroom(scene, main, glow, ox + wf.x - wf.gx * 0.15, oy + wf.h - 0.1, oz + wf.z - wf.gz * 0.15, 0.75, pick(["amber", "magenta"] as const), r);
  }

  // ------------------------------------------------------------------ outer forest: twisted trees & dark canopy
  const cand: { lx: number; lz: number; d: number; s: number; capT: number }[] = [];
  {
    const cellO = 2.5;
    for (let gz = -46; gz <= 46; gz += cellO) {
      for (let gx = -50; gx <= 54; gx += cellO) {
        const lx = gx + rand(-0.6, 0.6),
          lz = gz + rand(-0.6, 0.6);
        const d = sdf(lx, lz);
        if (d > -2.6 || d < -16) continue;
        if (lz < -34 && Math.abs(lx) < 4 + (-34 - lz)) continue;
        if (d < -10 && r() < 0.45) continue;
        const s = rand(0.85, 1.25);
        const capT = losCap(lx, lz, 1.2 * s);
        if (d > -7 && capT > 3.4 && r() < 0.5) {
          cand.push({ lx, lz, d, s, capT });
          continue;
        }
        // dark canopy puff / bramble mass (filler), height limited for the camera
        const rr = rand(1.3, 1.9);
        const capM = losCap(lx, lz, rr);
        const h = Math.min(rand(1.6, 2.8), capM);
        if (h < 0.5) continue;
        if (h > 2.0 && r() < 0.6) {
          const m = elb(scene, rr, Math.min(rr * 0.75, h * 0.5), rr, { color: jitterCol(pick(moundCols), 0.03, r), bottom: "#8f88a0" }, d > -6 ? 6 : 5);
          m.position.set(ox + lx, oy + h - Math.min(rr * 0.75, h * 0.5), oz + lz);
          pick([canopyA, canopyB, canopyA]).add(m);
          // a hint of trunk under the canopy
          if (d > -6) bark.add(at(softCyl(scene, h * 0.6, 0.16, 0.24, { color: "#f0ecf4", bottom: "#b0a8bc" }, 0.04, 5), ox + lx, oy, oz + lz));
        } else {
          const m = elb(scene, rr, h * 0.6, rr * 0.9, { color: jitterCol(pick(moundCols), 0.03, r), bottom: "#8d8398" }, 5);
          m.position.set(ox + lx, oy + h * 0.4, oz + lz);
          bramble.add(m);
        }
      }
    }
  }

  // twisted trees: an even pick over all candidates (≤ 48), the rest become canopy puffs
  {
    const chosen: { lx: number; lz: number }[] = [];
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [cand[i], cand[j]] = [cand[j], cand[i]];
    }
    for (const c of cand) {
      if (chosen.length < 42 && chosen.every((o) => Math.hypot(o.lx - c.lx, o.lz - c.lz) > 3.6)) {
        addTwistedTree(scene, trees, ox + c.lx, oy, oz + c.lz, c.s, r, c.capT);
        chosen.push(c);
      } else {
        const rr = rand(1.3, 1.8);
        const h = Math.min(rand(1.8, 2.8), losCap(c.lx, c.lz, rr));
        const m = elb(scene, rr, Math.min(rr * 0.75, h * 0.5), rr, { color: jitterCol(pick(moundCols), 0.03, r), bottom: "#8f88a0" }, 6);
        m.position.set(ox + c.lx, oy + h - Math.min(rr * 0.75, h * 0.5), oz + c.lz);
        pick([canopyA, canopyB, canopyA]).add(m);
      }
    }
  }

  // ------------------------------------------------------------------ floor dressing: stepping stones, ferns, shrooms, rocks, stumps
  // stepping stones along trails
  for (const s of SHAPES) {
    if (!s.trail) continue;
    const L = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const nx = -(s.z2 - s.z1) / L,
      nz = (s.x2 - s.x1) / L;
    for (let u = 0.8; u < L - 0.4; u += 1.55) {
      const t = u / L;
      const side = (Math.floor(u / 1.55) % 2 ? 1 : -1) * rand(0.25, 0.45);
      const px = s.x1 + (s.x2 - s.x1) * t + nx * side,
        pz = s.z1 + (s.z2 - s.z1) * t + nz * side;
      if (sdf(px, pz) < 1.0 || !isFree(px, pz, 0.7)) continue;
      const st = elb(scene, rand(0.32, 0.42), 0.06, rand(0.26, 0.34), { color: jitterCol("#e6dcf0", 0.03, r), bottom: "#a99cc0" }, 5);
      at(st, ox + px, oy + 0.02, oz + pz, [0, rand(0, 6), 0]);
      main.add(st);
    }
  }
  // fern / grass tufts at floor edges (tinted → green, sway)
  for (let i = 0; i < 320; i++) {
    const lx = rand(-30, 34),
      lz = rand(-35, 27);
    const d = sdf(lx, lz);
    if (d < -0.2 || d > 0.9 || !isFree(lx, lz, 1.3)) continue;
    const nb = 3 + Math.floor(r() * 2);
    const a0 = rand(0, TAU);
    for (let j = 0; j < nb; j++) {
      const a = a0 + (j / nb) * TAU;
      const bl = elb(scene, 0.05, 0.22, 0.03, { color: "#ffffff", bottom: "#b4aac2" }, 4);
      at(bl, ox + lx + Math.cos(a) * 0.08, oy + 0.15, oz + lz + Math.sin(a) * 0.08, [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
      vines.add(bl);
    }
    if (r() < 0.45) addFlower(lx + rand(-0.4, 0.4), oy, lz + rand(-0.4, 0.4), 0.95);
  }
  // cleansed flower meadow: arenas, boss clearing, path edges
  for (let i = 0; i < 1500; i++) {
    const lx = rand(-30, 34),
      lz = rand(-35, 27);
    const d = sdf(lx, lz);
    if (d < 0.1) continue;
    if (d > 1.6 && trailD(lx, lz) > 0.6 && r() < 0.8) continue; // keep the trails mostly clear
    if (!isFree(lx, lz, 0.6)) continue;
    // little clumps of 1–3
    const n = 1 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) addFlower(lx + rand(-0.35, 0.35), oy, lz + rand(-0.35, 0.35), rand(1.15, 1.6));
  }
  // glow shroom clusters
  for (const [x, z, h, s] of shroomSpots) addGloomShroom(scene, main, glow, ox + x, oy, oz + z, s, h, r);
  for (const [x, z, h, s] of bigShrooms) colliders.push(addBigShroom(scene, main, glow, ox + x, oy, oz + z, s, h, r));
  // mossy rocks & stumps near edges of big clearings
  {
    let placed = 0;
    for (let tries = 0; tries < 600 && placed < 18; tries++) {
      const lx = rand(-29, 33),
        lz = rand(-34, 26);
      const d = sdf(lx, lz);
      if (d < 0.35 || d > 1.2 || !isFree(lx, lz, 2.4)) continue;
      if (trailD(lx, lz) > -0.2) continue; // keep narrow paths clear
      if (Math.hypot(lx - BOSS.x, lz - BOSS.z) < BOSS.r - 2.6) continue;
      placed++;
      if (r() < 0.6) colliders.push(addRock(main, ox + lx, oz + lz, { y: oy, scale: rand(0.55, 0.85), color: pick(["#b9a6dc", "#a998cf", "#c3b3e2"]), moss: true, seed: 900 + placed }));
      else {
        // twisted dead stump (tinted bark)
        const h = rand(0.5, 0.8);
        bark.add(at(lathe(scene, [[0, 0], [0.5, 0], [0.42, 0.12], [0.34, h * 0.8], [0.3, h], [0, h]], { color: "#f4f0f8", bottom: "#b4acc0" }, 9), ox + lx, oy, oz + lz));
        bark.add(at(elb(scene, 0.27, 0.05, 0.27, { color: "#ffffff" }, 6), ox + lx, oy + h, oz + lz));
        for (let j = 0; j < 3; j++) {
          const a = (j / 3) * TAU + rand(0, 1);
          bark.add(at(elb(scene, 0.14, 0.09, 0.3, { color: "#ece6f2", bottom: "#a8a0b6" }, 5), ox + lx + Math.cos(a) * 0.42, oy + 0.04, oz + lz + Math.sin(a) * 0.42, [0, Math.PI / 2 - a, 0]));
        }
        addThorn(ox + lx + 0.2, oy + h * 0.7, oz + lz - 0.2, 0.7, 0.3, -0.7, 0.8);
        colliders.push({ kind: "circle", x: ox + lx, z: oz + lz, r: 0.45 });
      }
    }
  }

  // ------------------------------------------------------------------ camp: campfire, tent, logs, signpost, cosy flowers
  const flames: Mesh[] = [];
  const campfires: Vector3[] = [];
  FIRES.forEach(([fx, fz]) => {
    const cf = addCampfire(scene, main, warm, ox + fx, oy, oz + fz, r);
    flames.push(cf.flame);
    colliders.push(cf.collider);
    campfires.push(W(fx, fz));
  });
  colliders.push(addTent(scene, main, warm, ox + 3.4, oy, oz - 19.9, -0.5));
  colliders.push(...addLog(main, ox + 4.6, oz - 23.9, { y: oy, rotY: Math.PI / 2 + 0.2, length: 1.5, seed: 41 }));
  colliders.push(addStump(main, ox + 0.9, oz - 21.6, { y: oy, scale: 0.75, seed: 42 }));
  colliders.push(addIconSign(scene, main, ox - 2.5, oy, oz - 27.8, -0.15, "gloomy", true));
  addFlowerPatch(main, ox - 2.6, oz - 25.4, 0.7, { y: oy, palette: ["white", "butter", "pink"], density: 5, seed: 51 });
  addFlowerPatch(main, ox + 4.4, oz - 26.0, 0.7, { y: oy, palette: ["white", "lilac", "pink"], density: 5, seed: 52 });
  addFlowerPatch(main, ox - 1.9, oz - 33.8, 0.8, { y: oy, palette: ["white", "butter", "pink"], density: 5, seed: 53 });
  addFlowerPatch(main, ox + 2.0, oz - 34.4, 0.7, { y: oy, palette: ["white", "butter", "lilac"], density: 5, seed: 54 });
  // checkpoint logs (a cosy seat at each fire)
  const seat = (fi: number, seed: number) => {
    const [fx, fz] = FIRES[fi];
    const [sx, sz] = SPOTS[fi === 0 ? "camp" : `checkpoint_${fi - 1}`];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const px = fx + Math.cos(a) * 1.7,
        pz = fz + Math.sin(a) * 1.7;
      const ex = Math.abs(Math.sin(a)) * 0.65,
        ez = Math.abs(Math.cos(a)) * 0.65; // log runs tangentially
      if (sdf(px, pz) < 0.9 || sdf(px + ex, pz + ez) < 0.6 || sdf(px - ex, pz - ez) < 0.6) continue;
      if (Math.hypot(px - sx, pz - sz) < 1.6) continue;
      if (!SHAPES.every((sh) => sh.trail === false || shapeD(sh, px, pz) < 1.2)) continue; // not across the trail centre
      colliders.push(...addLog(main, ox + px, oz + pz, { y: oy, rotY: -a + Math.PI / 2, length: 1.3, seed }));
      return;
    }
  };
  seat(1, 61);
  seat(2, 62);
  seat(3, 63);
  // a little lantern post at each checkpoint
  for (const [i, a] of [
    [1, 2.2],
    [2, 2.2],
    [3, 1.0],
  ] as [number, number][]) {
    const [fx, fz] = FIRES[i];
    const px = fx + Math.cos(a) * 1.6,
      pz = fz + Math.sin(a) * 1.6;
    if (sdf(px, pz) < 0.4) continue;
    main.add(at(softCyl(scene, 1.4, 0.05, 0.06, { color: "#a3754d" }, 0.02, 6), ox + px, oy, oz + pz));
    warm.add(at(elb(scene, 0.15, 0.19, 0.15, { color: "#fff3c0", bottom: "#ffc76b" }, 6), ox + px, oy + 1.52, oz + pz));
    main.add(at(lathe(scene, [[0, 0.2], [0.22, 0.02], [0.2, -0.02], [0, 0]], { color: "#ef8fab" }, 10), ox + px, oy + 1.68, oz + pz));
    colliders.push({ kind: "circle", x: ox + px, z: oz + pz, r: 0.2 });
  }

  // ------------------------------------------------------------------ guardian nooks: mossy stones half-ring + thorn cage
  (["guardian_0", "guardian_1", "guardian_2"] as const).forEach((k, i) => {
    const [gx, gz] = SPOTS[k];
    const a = ARENAS[i];
    const back = Math.atan2(gz - a.z, gx - a.x); // away from the arena centre
    main.add(at(scallopRug(scene, 0.95, 9, { color: "#a9d9a0", bottom: "#7fbf78" }, 0.05), ox + gx, oy + 0.005, oz + gz));
    for (let j = 0; j < 5; j++) {
      const t = back + (j / 4 - 0.5) * Math.PI * 1.25;
      const px = gx + Math.cos(t) * 1.35,
        pz = gz + Math.sin(t) * 1.35;
      const s = rand(0.28, 0.36);
      const st = elb(scene, s, s * 0.85, s * 0.9, { color: jitterCol("#d6cbe8", 0.03, r), bottom: "#9286ad" }, 6);
      at(st, ox + px, oy + s * 0.6, oz + pz, [0, rand(0, 6), 0]);
      main.add(st);
      main.add(at(elb(scene, s * 0.8, s * 0.25, s * 0.7, { color: "#a6d99a", bottom: "#6fae72" }, 6), ox + px, oy + s * 1.2, oz + pz));
      colliders.push({ kind: "circle", x: ox + px, z: oz + pz, r: s });
    }
    // ring of thorns around the critter (retract when cleansed)
    for (let j = 0; j < 12; j++) {
      const t = (j / 12) * TAU;
      addThorn(ox + gx + Math.cos(t) * 0.85, oy + 0.02, oz + gz + Math.sin(t) * 0.85, Math.cos(t) * 0.35, 1, Math.sin(t) * 0.35, rand(1.3, 1.7));
    }
  });

  // ------------------------------------------------------------------ boss clearing: throne-stump, treasure dais
  {
    const tx = ox + THRONE.x,
      tz = oz + THRONE.z;
    bark.add(
      at(
        lathe(
          scene,
          [
            [0, 0],
            [2.0, 0],
            [1.72, 0.2],
            [1.46, 0.58],
            [1.4, 1.2],
            [1.5, 1.38],
            [0, 1.4],
          ],
          { color: "#f0eaf6", bottom: "#9d94ad" },
          14,
        ),
        tx,
        oy,
        tz,
        [0, 0.3, 0.04],
      ),
    );
    // hollow seat
    bark.add(at(elb(scene, 1.1, 0.08, 1.0, { color: "#a89eb8" }, 8), tx, oy + 1.38, tz - 0.05));
    gloomGlow.add(at(elb(scene, 0.82, 0.06, 0.72, { color: "#ff9ee6", bottom: "#c050b0" }, 8), tx, oy + 1.43, tz - 0.05));
    // crooked back spikes (behind the seat, curling tips)
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.2 + (i / 4) * 0.6); // arc on the north side
      const bx = tx + Math.cos(a) * 1.1,
        bz = tz + Math.sin(a) * 0.85;
      const H = (i === 2 ? 3.8 : i % 2 ? 3.1 : 2.4) + rand(-0.15, 0.15);
      const lean = (a - Math.PI / 2) * -0.6;
      const pts: Vector3[] = [];
      for (let j = 0; j <= 7; j++) {
        const u = j / 7;
        pts.push(new Vector3(bx + Math.sin(u * 3 + i) * 0.12 + lean * u * u * 0.9, oy + 0.9 + u * H, bz + Math.cos(u * 2.5 + i) * 0.1 + u * 0.2));
      }
      const tp = pts[7];
      for (let j = 1; j <= 4; j++) {
        const q = (j / 4) * Math.PI * 1.4;
        pts.push(new Vector3(tp.x + Math.sign(lean || 1) * Math.sin(q) * 0.22, tp.y + (1 - Math.cos(q)) * 0.2, tp.z - Math.sin(q) * 0.05));
      }
      bark.add(tubeMesh(scene, pts, (u) => 0.3 * (1 - 0.82 * u), "#f4eef8", "#a49bb4", 7));
      for (const j of [2, 4, 6]) addThorn(pts[j].x, pts[j].y, pts[j].z - 0.15, rand(-0.4, 0.4), 0.25, -1, 1.1);
    }
    // roots spreading over the floor
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.2;
      const m = elb(scene, 0.42, 0.22, 1.05, { color: "#e8e2ee", bottom: "#9d94ad" }, 6);
      at(m, tx + Math.cos(a) * 2.0, oy + 0.06, tz + Math.sin(a) * 2.0, [0, Math.PI / 2 - a, 0]);
      bark.add(m);
    }
    // glowing cracks on the front
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.42;
      const m = elb(scene, 0.06, rand(0.2, 0.32), 0.04, { color: "#ffc8f0", bottom: "#e060c8" }, 5);
      at(m, tx + Math.cos(a) * 1.48, oy + rand(0.5, 0.95), tz + Math.sin(a) * 1.48, [0, Math.PI / 2 - a, rand(-0.4, 0.4)]);
      gloomGlow.add(m);
    }
    colliders.push({ kind: "circle", x: tx, z: tz, r: 1.95 });
    colliders.push({ kind: "circle", x: tx - 1.6, z: tz + 0.6, r: 0.8 }, { kind: "circle", x: tx + 1.6, z: tz + 0.6, r: 0.8 });
    // treasure dais
    const [qx, qz] = SPOTS.treasure;
    main.add(at(scallopRug(scene, 1.3, 12, { color: "#d6cbe8", bottom: "#a99cc0" }, 0.06), ox + qx, oy + 0.005, oz + qz));
    main.add(at(scallopRug(scene, 0.9, 10, { color: "#efe6fa" }, 0.08), ox + qx, oy + 0.01, oz + qz));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      warm.add(at(elb(scene, 0.09, 0.07, 0.09, { color: "#fff4b8", bottom: "#ffd56b" }, 5), ox + qx + Math.cos(a) * 1.55, oy + 0.05, oz + qz + Math.sin(a) * 1.55));
    }
  }

  // ------------------------------------------------------------------ boss gate (bramble wall that rises from the ground)
  const gateNode = new TransformNode("thornBossGate", scene);
  gateNode.parent = root;
  const gateMeshes: Mesh[] = [];
  {
    const gb = new Batch(scene, "thornBossGateVines");
    const gt = new Batch(scene, "thornBossGateThorns");
    const gx0 = GATE.x - GATE.half,
      gx1 = GATE.x + GATE.half;
    for (let s = 0; s < 7; s++) {
      const pts: Vector3[] = [];
      const yb = 0.2 + s * 0.2;
      const zOff = (s % 3) * 0.22 - 0.22;
      for (let j = 0; j <= 16; j++) {
        const u = j / 16;
        const lx = gx0 + (gx1 - gx0) * u;
        const y = yb + Math.sin(u * Math.PI * 3 + s * 1.3) * 0.3 + Math.sin(u * Math.PI) * 0.12;
        pts.push(new Vector3(lx, Math.max(0.12, y), zOff + Math.cos(u * Math.PI * 4 + s) * 0.16));
      }
      gb.add(tubeMesh(scene, pts, () => 0.15 - s * 0.01, "#8f6fb0", "#5c4478", 6));
      for (let j = 1; j < 16; j += 2) {
        const p = pts[j];
        const a = (j * 2.4 + s * 1.7) % TAU;
        const th = thornMesh(scene);
        at(th, p.x, p.y, p.z - 0.12, alignY(Math.cos(a) * 0.7, Math.sin(a) * 0.7 + 0.3, -1));
        th.scaling.setAll(1.35);
        gt.add(th);
      }
    }
    // a few curly tendrils on top
    for (let k = 0; k < 4; k++) {
      const bx = gx0 + 0.8 + k * ((gx1 - gx0 - 1.6) / 3);
      const pts: Vector3[] = [];
      for (let j = 0; j <= 4; j++) pts.push(new Vector3(bx + j * 0.05, 1.3 + j * 0.12, 0));
      const tp = pts[4];
      for (let j = 1; j <= 5; j++) {
        const q = (j / 5) * Math.PI * 1.6;
        pts.push(new Vector3(tp.x + Math.sin(q) * 0.16, tp.y + (1 - Math.cos(q)) * 0.15, 0));
      }
      gb.add(tubeMesh(scene, pts, (u) => 0.07 * (1 - 0.6 * u), "#a084c2", "#6b4f8f", 5));
    }
    for (const sx of [gx0, gx1]) gb.add(at(elb(scene, 0.75, 1.05, 0.75, { color: "#8f6fb0", bottom: "#4a3866" }, 7), sx, 0.55, 0));
    const vm = gb.build({ material: toonMat(scene, { name: "thornGateVineMat", rim: 0.25 }), outline: 0.04 });
    const tm = gt.build({ material: toonMat(scene, { name: "thornGateThornMat", rim: 0.3 }), outline: 0.03 });
    for (const m of [vm, tm]) {
      if (!m) continue;
      m.parent = gateNode;
      m.isPickable = false;
      gateMeshes.push(m);
    }
    gateNode.position.set(ox, oy, oz + GATE.z);
  }
  const bossGate: Collider[] = [{ kind: "box", minX: ox + GATE.x - GATE.half - 0.2, maxX: ox + GATE.x + GATE.half + 0.2, minZ: oz + GATE.z - 0.5, maxZ: oz + GATE.z + 0.5 }];
  let gateK = 0,
    gateTarget = 0;
  const GATE_SINK = -2.4;
  const placeGate = () => {
    const e = smooth01(gateK);
    gateNode.position.y = oy + GATE_SINK * (1 - e);
    gateNode.scaling.set(1, 0.35 + 0.65 * e, 1);
    gateNode.setEnabled(gateK > 0.001);
  };
  placeGate();

  // ------------------------------------------------------------------ build batches
  const tint = {
    bramble: [col("#6e5a7c"), col("#86cf78")],
    vines: [col("#86aaa8"), col("#9fdc84")],
    bark: [col("#9a8fae"), col("#d9b08a")],
    canopyA: [col("#434d7c"), col("#a8e08e")],
    canopyB: [col("#544578"), col("#ffc2d8")],
    thorn: [col("#fff1e6"), col("#c9f0b0")],
  } as const;
  const tm = (name: string, o: { rim?: number; wind?: number; emissive?: string } = {}) => {
    const m = toonMat(scene, { name, rim: o.rim ?? 0.22, wind: o.wind, emissive: o.emissive });
    return m;
  };
  const mats = {
    bramble: tm("thornBrambleMat", { rim: 0.3 }),
    vines: tm("thornVinesMat", { rim: 0.3, wind: 0.05 }),
    bark: tm("thornBarkMat", { rim: 0.25 }),
    canopyA: tm("thornCanopyAMat", { rim: 0.32 }),
    canopyB: tm("thornCanopyBMat", { rim: 0.32 }),
    thorn: tm("thornThornMat", { rim: 0.3, emissive: "#3a2c34" }),
    glow: tm("thornGlowMat", { emissive: "#b8b8b8", rim: 0.35 }),
    warm: tm("thornWarmMat", { emissive: "#d8d8d8", rim: 0.3 }),
    gloomGlow: tm("thornGloomGlowMat", { emissive: "#e0e0e0", rim: 0.3 }),
    flame: tm("thornFlameMat", { emissive: "#f0f0f0", rim: 0.2 }),
    flower: toonMat(scene, { name: "thornFlowerMat", rim: 0.2, shade: 0.85 }),
  };
  const setTints = (f: number) => {
    for (const k of ["bramble", "vines", "bark", "canopyA", "canopyB", "thorn"] as const) {
      Color3.LerpToRef(tint[k][0], tint[k][1], f, mats[k].diffuseColor);
    }
  };
  setTints(0);

  const finish = (m: Mesh | null) => {
    if (!m) return;
    m.parent = root;
    m.isPickable = false;
  };
  finish(main.build({ outline: 0.04 }));
  finish(leaves.build({ ...LEAVES_BUILD }));
  finish(glow.build({ material: mats.glow, outline: 0.03, castShadow: false }));
  finish(warm.build({ material: mats.warm, outline: 0.03, castShadow: false }));
  finish(gloomGlow.build({ material: mats.gloomGlow, outline: 0.03, castShadow: false }));
  finish(bramble.build({ material: mats.bramble, outline: 0.045 }));
  finish(vines.build({ material: mats.vines, outline: 0.025 }));
  finish(bark.build({ material: mats.bark, outline: 0.04 }));
  finish(canopyA.build({ material: mats.canopyA, outline: 0.045 }));
  finish(canopyB.build({ material: mats.canopyB, outline: 0.045 }));
  for (const fl of flames) {
    finishMesh(fl, scene, { material: mats.flame, outline: 0.03, outlineColor: "#c8603a", castShadow: false, receiveShadow: false });
    fl.parent = root;
    fl.isPickable = false;
  }

  // thin-instanced thorns (retract on cleanse)
  const thornM = thornMesh(scene, "thornInst");
  const thorns = new InstSet(thornM, thornItems, false);
  finishMesh(thornM, scene, { material: mats.thorn, outline: 0.025, castShadow: true });
  finish(thornM);
  // thin-instanced flowers (pop up on cleanse)
  const flowerM = flowerMesh(scene);
  const flowers = new InstSet(flowerM, flowerItems, true);
  finishMesh(flowerM, scene, { material: mats.flower, outline: 0.018, castShadow: false });
  finish(flowerM);
  flowers.apply(() => 0);
  flowerM.setEnabled(false);

  // ------------------------------------------------------------------ mist (thin instances, alpha)
  const mistItems: InstItem[] = [];
  {
    const addMist = (lx: number, lz: number, s: number) => mistItems.push({ x: ox + lx, y: oy + rand(0.02, 0.2), z: oz + lz, q: Quaternion.FromEulerAngles(0, rand(-0.5, 0.5), 0), s: s * 0.9, sy: rand(0.8, 1.2), k: r() });
    for (const a of [...ARENAS, { x: BOSS.x, z: BOSS.z, r: BOSS.r }]) {
      const n = a.r > 8 ? 9 : 4;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU + rand(-0.3, 0.3),
          d = rand(0.55, 1.0) * (a.r - 1.2);
        addMist(a.x + Math.cos(t) * d, a.z + Math.sin(t) * d, rand(1.4, 2.2));
      }
    }
    let tries = 0;
    while (mistItems.length < 50 && tries++ < 800) {
      const lx = rand(-29, 33),
        lz = rand(-28, 26);
      const d = sdf(lx, lz);
      if (d < -0.5 || d > 2.0 || Math.hypot(lx - CAMP.x, lz - CAMP.z) < CAMP.r + 2) continue;
      addMist(lx, lz, rand(1.3, 2.2));
    }
  }
  const mistM = elb(scene, 1.5, 0.3, 0.85, { color: "#ffffff", name: "thornMist" }, 10);
  {
    // soft edges: vertex alpha fades to 0 toward the equator
    const p = mistM.getVerticesData(VertexBuffer.PositionKind)!;
    const c = mistM.getVerticesData(VertexBuffer.ColorKind)!;
    for (let i = 0; i < p.length / 3; i++) {
      const yy = Math.max(0, p[i * 3 + 1] / 0.3);
      c[i * 4 + 3] = Math.pow(yy, 1.6);
    }
    mistM.setVerticesData(VertexBuffer.ColorKind, c, false, 4);
    mistM.hasVertexAlpha = true;
  }
  const mistMat = toonMat(scene, { name: "thornMistMat", emissive: "#6a5c94", rim: 0, alpha: 0.3 });
  mistMat.diffuseColor = col("#b4a2dc");
  mistMat.disableDepthWrite = true;
  const mist = new InstSet(mistM, mistItems, false);
  finishMesh(mistM, scene, { material: mistMat, outline: false, castShadow: false, receiveShadow: false });
  finish(mistM);
  mistM.alwaysSelectAsActiveMesh = true;
  const driftMist = (t: number) =>
    mist.apply(
      (it) => 1 + 0.08 * Math.sin(t * 0.6 + it.k * 20),
      (it, _i, p) => {
        const sp = 0.6 + it.k * 0.6;
        p.x += Math.sin(t * 0.16 * sp + it.k * 30) * 1.1;
        p.z += Math.cos(t * 0.13 * sp + it.k * 17) * 0.9;
      },
    );

  // ------------------------------------------------------------------ motes: gloomy wisps / cleansed sparkles + butterflies
  const accept = (x: number, z: number) => sdf(x - ox, z - oz) > 0.4;
  const area = { minX: ox - 30, maxX: ox + 34, minZ: oz - 34, maxZ: oz + 27 };
  const gloomMotes = makeMotes(scene, area, 110, { y0: oy + 0.3, y1: oy + 2.6, size: 0.07, seed: 31, colors: ["#c9a2ff", "#ff9ad8", "#a98cff", "#ffc2ef", "#ffd59a"], accept });
  gloomMotes.mesh.parent = root;
  const sparkles = makeMotes(scene, area, 120, { y0: oy + 0.3, y1: oy + 3.0, size: 0.06, seed: 32, colors: ["#fff3b0", "#ffffff", "#ffe0ee", "#fff8d8", "#d8fff0"], accept });
  sparkles.mesh.parent = root;
  sparkles.mesh.setEnabled(false);
  const bflyItems: InstItem[] = [];
  {
    const bpal = ["#ffd0e0", "#fff0a8", "#cfe8ff", "#e6d6ff", "#ffffff", "#ffc6b0"].map((h) => col(h));
    let tries = 0;
    while (bflyItems.length < 26 && tries++ < 500) {
      const lx = rand(-28, 32),
        lz = rand(-32, 25);
      if (sdf(lx, lz) < 1.0) continue;
      bflyItems.push({ x: ox + lx, y: oy + rand(0.7, 1.6), z: oz + lz, q: Quaternion.Identity(), s: rand(0.8, 1.15), c: pick(bpal), k: r() });
    }
  }
  const bflyM = butterflyMesh(scene);
  const bflies = new InstSet(bflyM, bflyItems, true);
  finishMesh(bflyM, scene, { material: tm("thornButterflyMat", { rim: 0.25, emissive: "#303030" }), outline: 0.015, castShadow: false });
  finish(bflyM);
  bflyM.alwaysSelectAsActiveMesh = true;
  bflyM.setEnabled(false);
  const qTmp = new Quaternion();
  const flyButterflies = (t: number, f: number) => {
    const items = bflies.items;
    for (const it of items) {
      const sp = 0.5 + it.k;
      const yaw = Math.atan2(Math.cos(t * 0.5 * sp + it.k * 9) * 0.5, -Math.sin(t * 0.35 * sp + it.k * 13) * 0.6);
      Quaternion.FromEulerAnglesToRef(0, yaw, 0, qTmp);
      it.q.copyFrom(qTmp);
    }
    const mats16 = bflies.mats;
    bflies.write(
      () => f,
      (it, _i, p) => {
        const sp = 0.5 + it.k;
        p.x += Math.sin(t * 0.5 * sp + it.k * 9) * 1.4;
        p.z += Math.cos(t * 0.35 * sp + it.k * 13) * 1.2;
        p.y += Math.sin(t * 1.3 + it.k * 7) * 0.2;
      },
    );
    // wing flap: squash local X of each instance matrix
    for (let i = 0; i < items.length; i++) {
      const fl = 0.25 + 0.75 * Math.abs(Math.cos(t * 11 * (0.8 + items[i].k * 0.4) + items[i].k * 20));
      mats16[i * 16] *= fl;
      mats16[i * 16 + 1] *= fl;
      mats16[i * 16 + 2] *= fl;
    }
    bflyM.thinInstanceBufferUpdated("matrix");
  };

  // ------------------------------------------------------------------ spots & def
  const spots: Record<string, Vector3> = {};
  for (const [k, [x, z]] of Object.entries(SPOTS)) spots[k] = W(x, z);
  const spawn = W(SPAWN[0], SPAWN[1]);

  let cleanF = -1;
  const baseGlow = new Color3(0.7, 0.7, 0.7);
  const gloomCrack = col("#ffffff"),
    cleanCrack = col("#fff0a0");
  const cleanse = (fIn: number) => {
    const f = Math.max(0, Math.min(1, fIn));
    if (Math.abs(f - cleanF) < 0.002) return;
    cleanF = f;
    setTints(smooth01(f * 1.15));
    for (let i = 0; i < cMix.length; i++) cMix[i] = cGloom[i] + (cClean[i] - cGloom[i]) * f;
    ground.updateVerticesData(VertexBuffer.ColorKind, cMix);
    // thorns retract (staggered), flowers pop (staggered)
    thorns.apply((it) => 1 - smooth01(f * 1.6 - it.k * 0.6));
    thornM.setEnabled(f < 0.999);
    flowers.apply((it) => {
      const g = smooth01((f - 0.15 - it.k * 0.45) * 3.2);
      return g * (1 + 0.25 * Math.sin(g * Math.PI)); // tiny overshoot "pop"
    });
    flowerM.setEnabled(f > 0.15);
    mistM.visibility = 1 - smooth01(f * 1.4);
    mistM.setEnabled(f < 0.7);
    gloomMotes.mesh.visibility = 1 - smooth01(f * 1.5);
    gloomMotes.mesh.setEnabled(f < 0.66);
    sparkles.mesh.setEnabled(f > 0.2);
    sparkles.mesh.visibility = smooth01((f - 0.2) * 2);
    bflyM.setEnabled(f > 0.35);
    Color3.LerpToRef(gloomCrack, cleanCrack, f, mats.gloomGlow.emissiveColor);
    Color3.LerpToRef(col("#a070c0"), col("#ffe9b0"), f, mats.gloomGlow.diffuseColor);
  };
  cleanse(0);

  const def: ThornwildDef = {
    id: "thornwild",
    root,
    bounds: { minX: ox - 29.2, maxX: ox + 33.4, minZ: oz - 34.9, maxZ: oz + 26.4 },
    colliders,
    spawn,
    exit: { pos: W(EXIT[0], EXIT[1]), radius: 1.5 },
    spots,
    camera: { alpha: -Math.PI / 2, beta: 0.92, radius: 22, target: spawn.clone(), follow: true },
    lighting: THORN_LIGHT,
    cleansedLighting: THORN_CLEAN_LIGHT,
    dangerous: true,
    cleanse,
    bossGate,
    setBossGate(closed: boolean) {
      gateTarget = closed ? 1 : 0;
      if (closed) gateNode.setEnabled(true);
    },
    campfires,
    arenas: ARENAS.map((a) => ({ center: W(a.x, a.z), radius: a.r })),
    bossArena: { center: W(BOSS.x, BOSS.z), radius: BOSS.r },
    sdf: (x: number, z: number) => sdf(x - ox, z - oz),
    update(dt: number, t: number) {
      // glow shrooms breathe; campfires flicker
      const pa = 0.5 + 0.5 * Math.sin(t * 1.3);
      mats.glow.emissiveColor.copyFrom(baseGlow).scaleInPlace(0.85 + 0.25 * pa);
      mats.flame.emissiveColor.setAll(0.88 + 0.08 * Math.sin(t * 13.1) + 0.05 * Math.sin(t * 7.3));
      flames.forEach((fl, i) => {
        const w = Math.sin(t * 9.7 + i * 2.1) * 0.5 + Math.sin(t * 15.3 + i) * 0.5;
        fl.scaling.set(1 + 0.05 * w, 1 + 0.12 * Math.sin(t * 8.3 + i * 1.7) + 0.05 * w, 1 - 0.04 * w);
        fl.rotation.y = t * 0.6 + i;
        fl.rotation.z = 0.05 * Math.sin(t * 5.1 + i * 3);
      });
      if (mistM.isEnabled()) driftMist(t);
      if (gloomMotes.mesh.isEnabled()) gloomMotes.update(t * 0.6);
      if (sparkles.mesh.isEnabled()) sparkles.update(t);
      if (bflyM.isEnabled()) flyButterflies(t, smooth01((cleanF - 0.35) * 2.5));
      // boss gate tween
      if (gateK !== gateTarget) {
        gateK = gateTarget > gateK ? Math.min(gateTarget, gateK + dt * 1.4) : Math.max(gateTarget, gateK - dt * 1.0);
        placeGate();
      }
    },
  };
  return def;
}
