/**
 * Overworld props kit — procedural, vertex-coloured, plush/sticker style.
 *
 * Every `addX(b, …)` function ADDS shapes into the caller's Batch (so a whole zone merges into a
 * handful of draw calls) and returns world-space collider(s) where it makes sense.
 *
 * ─── Batches & materials ──────────────────────────────────────────────────────────────────────
 * Props can route parts into up to three batches:
 *   main   – solid stuff (trunks, canopies, rocks, wood, stone)      → toon, outline 0.04
 *   leaves – small swaying foliage (flowers, reeds, grass tufts)     → toon + wind, thin outline
 *   glow   – self-lit parts (lamp bulbs, crystals, glow-shroom caps) → toon + emissive, no shadow cast
 *
 * Easiest: `const pb = makePropBatches(scene, "meadow")`, add props to `pb.main`, then `pb.build()`.
 * The companions are linked to `pb.main`, so `addTree(pb.main, …)` automatically puts glow/leaf
 * parts in the right batch. Without companions everything falls back into the main batch.
 *
 * Manual equivalent:
 *   main.build({ outline: 0.04 })
 *   leaves.build(LEAVES_BUILD)   // { wind: 0.035, outline: 0.022, rim: 0.25 }
 *   glow.build(GLOW_BUILD)       // { emissive: "#a8a8a8", rim: 0.35, outline: 0.03, castShadow: false }
 * and pass `{ leaves, glow }` in PropOpts (or call linkBatches(main, { leaves, glow })).
 * NOTE: never pass `parent` inside build() opts (it ends up in the material cache key → JSON cycle);
 * set `mesh.parent` afterwards.
 *
 * Orientation: rotY uses Babylon's left-handed Y rotation: local +X → world (cos r, 0, -sin r).
 * "Front" of signs / benches / wells / cave mouths / gates is local -Z (faces the default camera
 * which sits at -Z looking +Z).
 */
import {
  Mesh,
  MeshBuilder,
  VertexData,
  VertexBuffer,
  Vector3,
  Quaternion,
  TransformNode,
  Color3,
  type Scene,
} from "@babylonjs/core";
import {
  Batch,
  softCyl,
  lathe,
  cone,
  torus,
  disc,
  scallopRug,
  paint,
  finishMesh,
  fixWinding,
  type V3,
  type ColorLike,
  type BuildOpts,
  type ShapeOpts,
} from "../render/Shapes";
import { col, mixCol, jitterCol, rng } from "../render/Palette";
import { toonMat } from "../render/Toon";
import type { Collider } from "../core/types";

/* ================================================================== */
/* Options, batches                                                    */
/* ================================================================== */

export interface PropOpts {
  scale?: number;
  rotY?: number;
  seed?: number;
  /** ground height (world) */
  y?: number;
  color?: string;
  /** swaying foliage batch (see header) */
  leaves?: Batch;
  /** emissive batch (see header) */
  glow?: Batch;
}

/** Recommended build options for each batch. */
export const MAIN_BUILD: BuildOpts = { outline: 0.04 };
export const LEAVES_BUILD: BuildOpts = { wind: 0.035, outline: 0.022, rim: 0.25 };
export const GLOW_BUILD: BuildOpts = { emissive: "#a8a8a8", rim: 0.35, outline: 0.03, castShadow: false };

const companions = new WeakMap<Batch, { leaves?: Batch; glow?: Batch }>();

/** Register companion batches so props added to `main` route foliage / glow parts automatically. */
export function linkBatches(main: Batch, c: { leaves?: Batch; glow?: Batch }) {
  companions.set(main, c);
}

export interface PropBatches {
  main: Batch;
  leaves: Batch;
  glow: Batch;
  /** Builds all three with the recommended materials; returns the non-empty meshes. */
  build(parent?: TransformNode | null, opts?: { main?: BuildOpts; leaves?: BuildOpts; glow?: BuildOpts }): Mesh[];
}

export function makePropBatches(scene: Scene, name = "props"): PropBatches {
  const main = new Batch(scene, name);
  const leaves = new Batch(scene, name + "_leaves");
  const glow = new Batch(scene, name + "_glow");
  linkBatches(main, { leaves, glow });
  return {
    main,
    leaves,
    glow,
    build(parent, opts = {}) {
      const out: Mesh[] = [];
      const a = main.build({ ...MAIN_BUILD, ...opts.main });
      const l = leaves.build({ ...LEAVES_BUILD, ...opts.leaves });
      const g = glow.build({ ...GLOW_BUILD, ...opts.glow });
      for (const m of [a, l, g]) {
        if (!m) continue;
        if (parent) m.parent = parent;
        out.push(m);
      }
      return out;
    },
  };
}

/* ================================================================== */
/* Internal helpers                                                    */
/* ================================================================== */

const TAU = Math.PI * 2;
const ZERO: V3 = [0, 0, 0];

function hashSeed(x: number, z: number): number {
  let h = Math.imul(Math.floor(x * 97.13) | 0, 73856093) ^ Math.imul(Math.floor(z * 53.71) | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Darken toward plum ink (k 0..1). */
function dk(c: ColorLike, k: number): Color3 {
  return mixCol(c as string | Color3, "#4a3a52", k);
}
/** Lighten toward cream white (k 0..1). */
function lt(c: ColorLike, k: number): Color3 {
  return mixCol(c as string | Color3, "#fffdf8", k);
}

/** Euler that rotates local +Y onto direction n (n need not be normalized). */
function alignY(nx: number, ny: number, nz: number): V3 {
  const l = Math.hypot(nx, ny, nz) || 1;
  return [Math.acos(Math.max(-1, Math.min(1, ny / l))), Math.atan2(nx, nz), 0];
}

/** Strip UVs and paint, so custom-built meshes can merge with Shapes meshes. */
function prep(m: Mesh, top: ColorLike, bottom?: ColorLike): Mesh {
  for (const k of [VertexBuffer.UVKind, VertexBuffer.UV2Kind, VertexBuffer.TangentKind]) {
    if (m.isVerticesDataPresent(k)) m.removeVerticesData(k);
  }
  paint(m, top, bottom);
  return m;
}

function customMesh(scene: Scene, name: string, pos: number[], ref: number[], idx: number[], normals: number[] | null, o: ShapeOpts): Mesh {
  fixWinding(pos, idx, ref);
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  if (!normals) {
    normals = [];
    VertexData.ComputeNormals(pos, idx, normals);
  }
  vd.normals = normals;
  const m = new Mesh(o.name ?? name, scene);
  vd.applyToMesh(m);
  paint(m, o.color ?? "#ffffff", o.bottom);
  if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.scale !== undefined) {
    if (typeof o.scale === "number") m.scaling.setAll(o.scale);
    else m.scaling.set(o.scale[0], o.scale[1], o.scale[2]);
  }
  return m;
}

/**
 * Lean shared-vertex ellipsoid (≈ 1/3 the vertices of MeshBuilder spheres at similar smoothness).
 * `seg` mirrors Shapes.blob's segments: 4 → 14 verts, 6 → 42, 8 → 80, 10 → 128.
 */
export function elb(scene: Scene, rx: number, ry: number, rz: number, o: ShapeOpts = {}, seg = 8): Mesh {
  const rings = Math.max(3, Math.min(10, seg - 1));
  const segs = Math.max(5, Math.min(18, Math.round(seg * 1.6)));
  const pos: number[] = [],
    nrm: number[] = [],
    idx: number[] = [];
  const push = (x: number, y: number, z: number) => {
    pos.push(x * rx, y * ry, z * rz);
    const nx = x / rx,
      ny = y / ry,
      nz = z / rz;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.push(nx / l, ny / l, nz / l);
  };
  push(0, -1, 0);
  for (let i = 1; i < rings; i++) {
    const th = -Math.PI / 2 + (i / rings) * Math.PI;
    const cy = Math.sin(th),
      cr = Math.cos(th);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * TAU + (i % 2) * (Math.PI / segs);
      push(Math.cos(a) * cr, cy, Math.sin(a) * cr);
    }
  }
  push(0, 1, 0);
  const top = pos.length / 3 - 1;
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segs));
  for (let i = 0; i < rings - 2; i++) {
    const a0 = 1 + i * segs,
      b0 = 1 + (i + 1) * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      // staggered rings: pick the diagonal that follows the offset
      if (i % 2 === 0) idx.push(a0 + j, b0 + j, a0 + j1, a0 + j1, b0 + j, b0 + j1);
      else idx.push(a0 + j, b0 + j, b0 + j1, a0 + j, b0 + j1, a0 + j1);
    }
  }
  const last = 1 + (rings - 2) * segs;
  for (let j = 0; j < segs; j++) idx.push(top, last + j, last + ((j + 1) % segs));
  return customMesh(scene, "elb", pos, nrm, idx, nrm, o);
}

export function sph(scene: Scene, r: number, o: ShapeOpts = {}, seg = 8): Mesh {
  return elb(scene, r, r, r, o, seg);
}

/**
 * Lean rounded box (34 shared verts vs ~300 for Shapes.softBox): flat faces, rounded edges.
 */
export function rbox(scene: Scene, w: number, h: number, d: number, o: ShapeOpts = {}, radius = 0.08, _steps = 1): Mesh {
  const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const hx = w / 2,
    hy = h / 2,
    hz = d / 2;
  const ix = hx - r,
    iz = hz - r;
  const pos: number[] = [],
    nrm: number[] = [],
    idx: number[] = [];
  // levels: [y, ring offset (0..1 of r), normal y]
  const levels: [number, number, number][] = [
    [-hy, 0.42, -0.86],
    [-hy + r, 1, 0],
    [hy - r, 1, 0],
    [hy, 0.42, 0.86],
  ];
  const corners: [number, number][] = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  pos.push(0, -hy, 0);
  nrm.push(0, -1, 0);
  for (const [y, k, ny] of levels) {
    const hk = Math.sqrt(Math.max(0, 1 - ny * ny));
    for (let c = 0; c < 4; c++) {
      const [sx, sz] = corners[c];
      // two points per corner: along the x-face then along the z-face (counter-clockwise)
      const pts: [number, number, number, number][] =
        c % 2 === 0
          ? [
              [sx * (ix + r * k), sz * iz, sx, 0],
              [sx * ix, sz * (iz + r * k), 0, sz],
            ]
          : [
              [sx * ix, sz * (iz + r * k), 0, sz],
              [sx * (ix + r * k), sz * iz, sx, 0],
            ];
      for (const [px, pz, nx, nz] of pts) {
        pos.push(px, y, pz);
        nrm.push(nx * hk, ny, nz * hk);
      }
    }
  }
  pos.push(0, hy, 0);
  nrm.push(0, 1, 0);
  const R = 8;
  for (let j = 0; j < R; j++) idx.push(0, 1 + j, 1 + ((j + 1) % R));
  for (let l = 0; l < levels.length - 1; l++) {
    const a0 = 1 + l * R,
      b0 = 1 + (l + 1) * R;
    for (let j = 0; j < R; j++) {
      const j1 = (j + 1) % R;
      idx.push(a0 + j, b0 + j, a0 + j1, a0 + j1, b0 + j, b0 + j1);
    }
  }
  const top = pos.length / 3 - 1;
  const lt0 = 1 + (levels.length - 1) * R;
  for (let j = 0; j < R; j++) idx.push(top, lt0 + j, lt0 + ((j + 1) % R));
  return customMesh(scene, "rbox", pos, nrm, idx, nrm, o);
}

/** Flat flower head: n rounded petals (star outline), thin, facing +Y. ~4n+2 verts. */
export function petals(scene: Scene, r: number, n: number, o: ShapeOpts = {}, thick = 0.02, inner = 0.55): Mesh {
  const pos: number[] = [],
    ref: number[] = [],
    idx: number[] = [];
  const N = n * 2;
  pos.push(0, thick, 0);
  ref.push(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const rr = i % 2 === 0 ? r : r * inner;
    pos.push(Math.cos(a) * rr, thick * (i % 2 === 0 ? 0.6 : 1), Math.sin(a) * rr);
    ref.push(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3);
    pos.push(Math.cos(a) * rr * 0.97, 0, Math.sin(a) * rr * 0.97);
    ref.push(Math.cos(a), -0.6, Math.sin(a));
  }
  pos.push(0, 0, 0);
  ref.push(0, -1, 0);
  const bot = pos.length / 3 - 1;
  for (let i = 0; i < N; i++) {
    const t0 = 1 + i * 2,
      b0 = t0 + 1,
      t1 = 1 + ((i + 1) % N) * 2,
      b1 = t1 + 1;
    idx.push(0, t1, t0, t0, t1, b0, b0, t1, b1, bot, b0, b1);
  }
  return customMesh(scene, "petals", pos, ref, idx, null, o);
}

/** Thin tapered stem (4-sided soft prism, 20 verts). Base at origin. */
function stemMesh(scene: Scene, h: number, r: number, color: ColorLike): Mesh {
  return lathe(
    scene,
    [
      [0, 0],
      [r, 0],
      [r * 0.75, h],
      [0, h],
    ],
    { color },
    4,
  );
}

function tube(scene: Scene, path: Vector3[], radius: number, color: ColorLike, tess = 7): Mesh {
  const m = MeshBuilder.CreateTube("tube", { path, radius, tessellation: tess, cap: Mesh.CAP_ALL }, scene);
  return prep(m, color);
}

type Ball = [number, number, number, number];

/** Local placement helper: origin + rotY + uniform scale + seeded rng + batch routing. */
class Kit {
  scene: Scene;
  main: Batch;
  leaves: Batch;
  glow: Batch;
  s: number;
  rot: number;
  y: number;
  c: number;
  sn: number;
  r: () => number;
  constructor(
    b: Batch,
    public x: number,
    public z: number,
    o: PropOpts = {},
  ) {
    const comp = companions.get(b);
    this.scene = b.scene;
    this.main = b;
    this.leaves = o.leaves ?? comp?.leaves ?? b;
    this.glow = o.glow ?? comp?.glow ?? b;
    this.s = o.scale ?? 1;
    this.rot = o.rotY ?? 0;
    this.y = o.y ?? 0;
    this.c = Math.cos(this.rot);
    this.sn = Math.sin(this.rot);
    this.r = rng(o.seed ?? hashSeed(x, z));
  }
  rand(a: number, b: number) {
    return a + (b - a) * this.r();
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.r() * arr.length) % arr.length];
  }
  wx(lx: number, lz: number) {
    const X = lx * this.s,
      Z = lz * this.s;
    return this.x + X * this.c + Z * this.sn;
  }
  wz(lx: number, lz: number) {
    const X = lx * this.s,
      Z = lz * this.s;
    return this.z - X * this.sn + Z * this.c;
  }
  w(lx: number, ly: number, lz: number) {
    return new Vector3(this.wx(lx, lz), this.y + ly * this.s, this.wz(lx, lz));
  }
  put<T extends Mesh>(m: T, p: V3, rot: V3 = ZERO, scl: V3 | number = 1, to: Batch = this.main): T {
    m.position.copyFrom(this.w(p[0], p[1], p[2]));
    m.rotationQuaternion = Quaternion.FromEulerAngles(rot[0], rot[1] + this.rot, rot[2]);
    if (typeof scl === "number") m.scaling.setAll(scl * this.s);
    else m.scaling.set(scl[0] * this.s, scl[1] * this.s, scl[2] * this.s);
    to.add(m);
    return m;
  }
  ball(r: number, p: V3, color: ColorLike, bottom?: ColorLike, seg = 8, to?: Batch) {
    return this.put(sph(this.scene, r, { color, bottom }, seg), p, ZERO, 1, to);
  }
  blob(rx: number, ry: number, rz: number, p: V3, color: ColorLike, bottom?: ColorLike, rot: V3 = ZERO, seg = 8, to?: Batch) {
    return this.put(elb(this.scene, rx, ry, rz, { color, bottom }, seg), p, rot, 1, to);
  }
  circle(lx: number, lz: number, r: number): Collider {
    return { kind: "circle", x: this.wx(lx, lz), z: this.wz(lx, lz), r: r * this.s };
  }
  /** Colliders along a local segment (box if axis aligned in world, else a chain of circles). */
  segment(ax: number, az: number, bx: number, bz: number, half: number): Collider[] {
    const x1 = this.wx(ax, az),
      z1 = this.wz(ax, az),
      x2 = this.wx(bx, bz),
      z2 = this.wz(bx, bz);
    return segColliders(x1, z1, x2, z2, half * this.s);
  }
}

function segColliders(x1: number, z1: number, x2: number, z2: number, half: number): Collider[] {
  const dx = x2 - x1,
    dz = z2 - z1;
  const L = Math.hypot(dx, dz);
  if (Math.abs(dx) < 0.02 * L || Math.abs(dz) < 0.02 * L) {
    return [
      {
        kind: "box",
        minX: Math.min(x1, x2) - half,
        maxX: Math.max(x1, x2) + half,
        minZ: Math.min(z1, z2) - half,
        maxZ: Math.max(z1, z2) + half,
      },
    ];
  }
  const n = Math.max(1, Math.ceil(L / (half * 1.4)));
  const out: Collider[] = [];
  for (let i = 0; i <= n; i++) out.push({ kind: "circle", x: x1 + (dx * i) / n, z: z1 + (dz * i) / n, r: half });
  return out;
}

/** Fluffy clustered-ball canopy. Returns the balls (local coords) for surface queries. */
function canopy(k: Kit, cx: number, cy: number, cz: number, R: number, n: number, top: ColorLike, bot: ColorLike, seg = 10): Ball[] {
  const balls: Ball[] = [[cx, cy, cz, R]];
  const a0 = k.rand(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + k.rand(-0.3, 0.3);
    const rr = R * k.rand(0.58, 0.74);
    const d = R * k.rand(0.62, 0.8);
    balls.push([cx + Math.cos(a) * d, cy + R * k.rand(-0.32, 0.12), cz + Math.sin(a) * d, rr]);
  }
  const nt = 2;
  for (let i = 0; i < nt; i++) {
    const a = a0 + i * Math.PI + 0.7;
    balls.push([cx + Math.cos(a) * R * 0.35, cy + R * k.rand(0.45, 0.62), cz + Math.sin(a) * R * 0.35, R * k.rand(0.55, 0.66)]);
  }
  for (const [x, y, z, r] of balls) {
    k.blob(r, r * 0.93, r, [x, y, z], jitterCol(top, 0.035, k.r), jitterCol(bot, 0.03, k.r), [0, k.rand(0, 6), 0], seg);
  }
  return balls;
}

/** March from c along dir until outside all balls → a point on the cluster surface. */
function surf(balls: Ball[], c: V3, dir: V3, sink = 0.05): { p: V3; n: V3 } {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  let t = 0;
  for (; t < 8; t += 0.04) {
    const p: V3 = [c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t];
    let inside = false;
    for (const b of balls) {
      const dx = p[0] - b[0],
        dy = (p[1] - b[1]) / 0.93,
        dz = p[2] - b[2];
      if (dx * dx + dy * dy + dz * dz < b[3] * b[3]) {
        inside = true;
        break;
      }
    }
    if (!inside) break;
  }
  t = Math.max(0, t - sink);
  return { p: [c[0] + d[0] * t, c[1] + d[1] * t, c[2] + d[2] * t], n: d };
}

/** Tapered soft trunk with root flare. */
function trunk(k: Kit, H: number, rBase: number, color: ColorLike = "wood", bottom: ColorLike = "woodDeep") {
  const r = rBase;
  k.put(
    lathe(
      k.scene,
      [
        [0, 0],
        [r * 1.55, 0],
        [r * 1.45, 0.06],
        [r * 1.12, 0.2],
        [r, 0.45],
        [r * 0.86, H * 0.75],
        [r * 0.78, H],
        [0, H + 0.02],
      ],
      { color: jitterCol(color, 0.03, k.r), bottom },
      10,
    ),
    ZERO,
    [0, k.rand(0, 6), 0],
  );
  // little roots
  const n = 3;
  const a0 = k.rand(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    k.blob(r * 0.55, r * 0.32, r * 0.95, [Math.cos(a) * r * 1.2, 0.04, Math.sin(a) * r * 1.2], bottom, undefined, [0, Math.PI / 2 - a, 0], 6);
  }
}

/** Simple heart (two balls + cone) facing local -Z. */
function heart(k: Kit, p: V3, size: number, color: ColorLike, to?: Batch, rotY = 0) {
  const s = size;
  const c = Math.cos(rotY),
    sn = Math.sin(rotY);
  const off = (x: number, y: number): V3 => [p[0] + x * c, p[1] + y, p[2] - x * sn];
  k.put(elb(k.scene, s * 0.36, s * 0.36, s * 0.2, { color }, 7), off(-s * 0.27, s * 0.12), [0, rotY, 0], 1, to);
  k.put(elb(k.scene, s * 0.36, s * 0.36, s * 0.2, { color }, 7), off(s * 0.27, s * 0.12), [0, rotY, 0], 1, to);
  k.put(cone(k.scene, s * 0.62, s * 0.42, { color }, 8), off(0, -s * 0.06), [Math.PI, rotY, 0], [1, 1, 0.48], to);
}

/** Tiny 5-petal flower head oriented along n (local) at p. */
function blossomDot(k: Kit, p: V3, n: V3, r: number, petal: ColorLike, center: ColorLike, to?: Batch) {
  const rot = alignY(n[0], n[1], n[2]);
  k.put(petals(k.scene, r, 5, { color: petal }, r * 0.35, 0.6), p, rot, 1, to);
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  k.put(sph(k.scene, r * 0.38, { color: center }, 4), [p[0] + (n[0] / l) * r * 0.3, p[1] + (n[1] / l) * r * 0.3, p[2] + (n[2] / l) * r * 0.3], ZERO, 1, to);
}

/* ================================================================== */
/* Trees                                                               */
/* ================================================================== */

export type TreeKind = "round" | "pine" | "blossom" | "fruit" | "willow" | "mushroomTree";

export function addTree(b: Batch, x: number, z: number, kind: TreeKind, o: PropOpts = {}): Collider {
  const k = new Kit(b, x, z, o);
  const s = k.s;
  switch (kind) {
    case "round": {
      trunk(k, 1.9, 0.21);
      const top = o.color ?? k.pick(["leafLight", "#bfe89a", "#a8e08e"]);
      canopy(k, 0, 2.55, 0, 1.3, 6, top, "leafDeep");
      return k.circle(0, 0, 0.42);
    }
    case "blossom": {
      trunk(k, 1.85, 0.2, "#d9b08a", "woodDark");
      const top = o.color ?? k.pick(["#ffd3e2", "#ffc7dc", "#fbd0ea"]);
      const balls = canopy(k, 0, 2.5, 0, 1.3, 6, top, "#ec97b8");
      for (let i = 0; i < 14; i++) {
        const a = k.rand(0, TAU),
          yy = k.rand(-0.1, 0.9);
        const { p, n } = surf(balls, [0, 2.5, 0], [Math.cos(a), yy, Math.sin(a)], 0.03);
        blossomDot(k, p, n, 0.11, k.pick(["white", "#fff0f6", "#ffe1ee"]), "butterDeep");
      }
      // fallen petals
      for (let i = 0; i < 9; i++) {
        const a = k.rand(0, TAU),
          d = k.rand(0.7, 1.8);
        k.blob(0.07, 0.015, 0.05, [Math.cos(a) * d, 0.02, Math.sin(a) * d], k.pick(["pink", "#ffd3e2", "white"]), undefined, [0, k.rand(0, 6), 0], 4);
      }
      return k.circle(0, 0, 0.4);
    }
    case "fruit": {
      trunk(k, 1.85, 0.22);
      const top = o.color ?? "#b2e392";
      const balls = canopy(k, 0, 2.5, 0, 1.32, 6, top, "leafDeep");
      const fruitCol = k.pick(["red", "coral", "#ffb38a"]);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * TAU + k.rand(-0.2, 0.2),
          yy = k.rand(-0.45, 0.55);
        const { p, n } = surf(balls, [0, 2.5, 0], [Math.cos(a), yy, Math.sin(a)], 0.07);
        const fr = 0.13;
        k.ball(fr, [p[0] + n[0] * 0.04, p[1] + n[1] * 0.04, p[2] + n[2] * 0.04], jitterCol(fruitCol, 0.04, k.r), dk(fruitCol, 0.15), 6);
        k.blob(0.06, 0.02, 0.035, [p[0] + n[0] * 0.04 + 0.03, p[1] + fr * 0.95, p[2] + n[2] * 0.04], "leafDeep", undefined, [0, k.rand(0, 6), 0.4], 4);
      }
      for (let i = 0; i < 2; i++) {
        const a = k.rand(0, TAU),
          d = k.rand(0.8, 1.5);
        k.ball(0.13, [Math.cos(a) * d, 0.11, Math.sin(a) * d], fruitCol, dk(fruitCol, 0.15), 6);
      }
      return k.circle(0, 0, 0.42);
    }
    case "pine": {
      k.put(softCyl(k.scene, 0.8, 0.16, 0.24, { color: "wood", bottom: "woodDeep" }, 0.05, 9), ZERO);
      const top = o.color ?? "#9ad9a6";
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const y0 = 0.55 + i * 0.82;
        const r = 1.45 - i * 0.29;
        const h = 1.25 - i * 0.08;
        k.put(
          lathe(
            k.scene,
            [
              [0, y0 - 0.12],
              [r * 0.72, y0 - 0.1],
              [r * 0.97, y0],
              [r, y0 + 0.09],
              [r * 0.8, y0 + h * 0.3],
              [r * 0.45, y0 + h * 0.7],
              [r * 0.12, y0 + h * 0.97],
              [0, y0 + h],
            ],
            { color: jitterCol(top, 0.03, k.r), bottom: jitterCol("#4f9e78", 0.03, k.r) },
            11,
          ),
          ZERO,
          [0, k.rand(0, 6), 0],
        );
      }
      k.put(petals(k.scene, 0.26, 5, { color: "butter", bottom: "butterDeep" }, 0.09, 0.48), [0, 0.55 + tiers * 0.82 + 0.38, 0.02], [-Math.PI / 2, 0, 0]);
      return k.circle(0, 0, 0.45);
    }
    case "willow": {
      trunk(k, 1.9, 0.25, "#dcb894", "woodDeep");
      const top = o.color ?? "#c6ecaa";
      const balls = canopy(k, 0, 2.9, 0, 1.25, 6, top, "#87cf8e");
      void balls;
      const n = 13;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + k.rand(-0.15, 0.15);
        const d = k.rand(1.2, 1.45);
        const len = k.rand(1.2, 1.8);
        const yTop = 2.75 + k.rand(-0.1, 0.15);
        k.put(
          elb(k.scene, 0.17, len / 2, 0.13, { color: jitterCol("#bfe8a6", 0.03, k.r), bottom: "#86cf9a" }, 6),
          [Math.cos(a) * d, yTop - len / 2, Math.sin(a) * d],
          [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12],
        );
        if (k.r() < 0.5) k.ball(0.06, [Math.cos(a) * (d + 0.14), yTop - len * k.rand(0.4, 0.8), Math.sin(a) * (d + 0.14)], k.pick(["lilac", "pink", "white"]), undefined, 4);
      }
      return k.circle(0, 0, 0.45);
    }
    case "mushroomTree": {
      const capCol = o.color ?? k.pick(["#f48aa6", "#f7a0b8", "#c6a4f0", "#ff9f8f"]);
      k.put(
        lathe(
          k.scene,
          [
            [0, 0],
            [0.5, 0],
            [0.46, 0.08],
            [0.36, 0.3],
            [0.3, 0.9],
            [0.32, 1.6],
            [0.42, 2.2],
            [0, 2.25],
          ],
          { color: "cream", bottom: "#f1dcc4" },
          12,
        ),
        ZERO,
      );
      // skirt ring
      k.put(torus(k.scene, 0.36, 0.1, { color: "white" }, 14), [0, 1.45, 0], [0.05, 0, 0.04], [1, 0.7, 1]);
      // gills underside
      k.put(lathe(k.scene, [[0, 2.12], [1.55, 2.24], [1.55, 2.3], [0, 2.3]], { color: "#ffe9e0" }, 18), ZERO);
      // cap dome
      const R = 1.75,
        cy = 2.25;
      k.put(
        lathe(
          k.scene,
          [
            [0, cy + 1.1],
            [0.55, cy + 1.05],
            [1.1, cy + 0.82],
            [1.5, cy + 0.48],
            [1.74, cy + 0.15],
            [1.72, cy + 0.02],
            [1.55, cy - 0.02],
            [0, cy + 0.05],
          ],
          { color: lt(capCol, 0.18), bottom: dk(capCol, 0.08) },
          18,
        ),
        ZERO,
      );
      // spots on cap (ellipsoid approx)
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + k.rand(-0.25, 0.25);
        const el = i === 0 ? 1.45 : k.rand(0.35, 0.95);
        const nx = Math.cos(a) * Math.cos(el),
          ny = Math.sin(el),
          nz = Math.sin(a) * Math.cos(el);
        // ellipsoid R x 1.1 x R
        const px = nx * R * 0.97,
          py = cy + ny * 1.07,
          pz = nz * R * 0.97;
        const sr = i === 0 ? 0.26 : k.rand(0.14, 0.24);
        k.put(elb(k.scene, sr, 0.05, sr, { color: "white" }, 7), [px, py, pz], alignY(nx / R, ny / 1.1, nz / R));
      }
      return k.circle(0, 0, 0.5);
    }
  }
}

/* ================================================================== */
/* Bushes & flowers                                                    */
/* ================================================================== */

export function addBush(b: Batch, x: number, z: number, o: PropOpts & { flowers?: boolean } = {}): Collider {
  const k = new Kit(b, x, z, o);
  const top = o.color ?? k.pick(["leafLight", "#b9e79d", "#a6dd8e"]);
  const balls: Ball[] = [];
  const n = 4;
  const a0 = k.rand(0, TAU);
  balls.push([0, 0.48, 0, 0.58]);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + k.rand(-0.3, 0.3);
    balls.push([Math.cos(a) * 0.42, 0.34 + k.rand(-0.05, 0.08), Math.sin(a) * 0.42, k.rand(0.36, 0.46)]);
  }
  for (const [bx, by, bz, r] of balls) {
    k.blob(r, r * 0.88, r, [bx, by, bz], jitterCol(top, 0.035, k.r), "leafDeep", [0, k.rand(0, 6), 0], 8);
  }
  if (o.flowers) {
    const pc = k.pick(["pink", "white", "butter", "lilac", "#ffc2d6"]);
    for (let i = 0; i < 9; i++) {
      const a = k.rand(0, TAU);
      const { p, n: nn } = surf(balls, [0, 0.35, 0], [Math.cos(a), k.rand(0.1, 1.1), Math.sin(a)], 0.02);
      blossomDot(k, p, nn, 0.085, pc, "butterDeep");
    }
  }
  return k.circle(0, 0, 0.72);
}

type FlowerKind = "tulip" | "daisy" | "sunflower" | "bell" | "rose";

function flower(k: Kit, kind: FlowerKind, lx: number, lz: number, color: ColorLike, to: Batch) {
  const stem: ColorLike = "#79c26f";
  const tip = (h: number): V3 => [lx, h, lz];
  switch (kind) {
    case "daisy": {
      const h = k.rand(0.22, 0.34);
      k.put(stemMesh(k.scene, h, 0.018, stem), [lx, 0, lz], ZERO, 1, to);
      const tilt: V3 = [k.rand(-0.35, 0.05), k.rand(0, TAU), 0];
      k.put(petals(k.scene, 0.09, 6, { color: color }, 0.022), tip(h), tilt, 1, to);
      k.put(elb(k.scene, 0.032, 0.022, 0.032, { color: "butterDeep" }, 5), [lx, h + 0.025, lz], tilt, 1, to);
      break;
    }
    case "tulip": {
      const h = k.rand(0.26, 0.38);
      k.put(stemMesh(k.scene, h, 0.02, stem), [lx, 0, lz], ZERO, 1, to);
      k.put(elb(k.scene, 0.05, 0.13, 0.02, { color: "leaf", bottom: "leafDeep" }, 5), [lx + 0.03, 0.1, lz], [0, k.rand(0, 6), 0.35], 1, to);
      k.put(
        lathe(
          k.scene,
          [
            [0, 0],
            [0.05, 0.012],
            [0.072, 0.06],
            [0.066, 0.12],
            [0.04, 0.15],
            [0.015, 0.13],
            [0, 0.12],
          ],
          { color: lt(color, 0.12), bottom: dk(color, 0.08) },
          6,
        ),
        [lx, h - 0.02, lz],
        [0, k.rand(0, 1), 0],
        1,
        to,
      );
      break;
    }
    case "sunflower": {
      const h = k.rand(0.5, 0.68);
      k.put(stemMesh(k.scene, h, 0.026, stem), [lx, 0, lz], ZERO, 1, to);
      k.put(elb(k.scene, 0.09, 0.02, 0.05, { color: "leaf" }, 5), [lx + 0.06, h * 0.45, lz], [0, k.rand(0, 6), 0.4], 1, to);
      const tilt: V3 = [-0.55 + k.rand(-0.15, 0.15), k.rand(-0.6, 0.6), 0];
      k.put(petals(k.scene, 0.15, 10, { color: color }, 0.025, 0.72), [lx, h, lz], tilt, 1, to);
      k.put(elb(k.scene, 0.065, 0.03, 0.065, { color: "#b07a52" }, 6), [lx, h + 0.02, lz - 0.01], tilt, 1, to);
      break;
    }
    case "bell": {
      const h = k.rand(0.28, 0.4);
      k.put(stemMesh(k.scene, h, 0.016, stem), [lx, 0, lz], ZERO, 1, to);
      for (let i = 0; i < 3; i++) {
        k.put(sph(k.scene, 0.045 - i * 0.008, { color: i === 0 ? color : lt(color, 0.2 * i) }, 5), [lx, h - 0.1 + i * 0.07, lz], ZERO, 1, to);
      }
      break;
    }
    case "rose": {
      const h = k.rand(0.2, 0.3);
      k.put(stemMesh(k.scene, h, 0.02, stem), [lx, 0, lz], ZERO, 1, to);
      k.put(elb(k.scene, 0.075, 0.055, 0.075, { color: color, bottom: dk(color, 0.1) }, 6), [lx, h + 0.03, lz], ZERO, 1, to);
      k.put(torus(k.scene, 0.04, 0.025, { color: lt(color, 0.25) }, 8), [lx, h + 0.075, lz], ZERO, 1, to);
      break;
    }
  }
}

const FLOWER_PAL = ["pink", "#ffd0e0", "butter", "lilac", "peach", "white", "#c9e4ff", "#f7a8c4"];

export function addFlowerPatch(b: Batch, x: number, z: number, radius: number, o: PropOpts & { palette?: string[]; density?: number } = {}): void {
  const k = new Kit(b, x, z, { ...o, scale: 1 });
  const pal = o.palette ?? FLOWER_PAL;
  const to = k.leaves;
  const n = Math.max(3, Math.round(radius * radius * Math.PI * (o.density ?? 6)));
  const kinds: FlowerKind[] = ["tulip", "daisy", "daisy", "tulip", "bell", "rose", "sunflower"];
  // patch theme: 2 kinds dominate for a cohesive look
  const kA = k.pick(kinds),
    kB = k.pick(kinds);
  const cA = k.pick(pal),
    cB = k.pick(pal);
  for (let i = 0; i < n; i++) {
    const a = k.rand(0, TAU);
    const d = Math.sqrt(k.r()) * radius;
    const lx = Math.cos(a) * d,
      lz = Math.sin(a) * d;
    const roll = k.r();
    const kind = roll < 0.42 ? kA : roll < 0.8 ? kB : k.pick(kinds);
    const c = roll < 0.42 ? cA : roll < 0.8 ? cB : k.pick(pal);
    flower(k, kind, lx, lz, kind === "sunflower" ? "butterDeep" : kind === "daisy" && k.r() < 0.5 ? "white" : c, to);
  }
  // a few leafy clumps to anchor the patch
  const nl = Math.max(2, Math.round(n / 5));
  for (let i = 0; i < nl; i++) {
    const a = k.rand(0, TAU),
      d = Math.sqrt(k.r()) * radius * 0.9;
    k.blob(k.rand(0.1, 0.16), 0.07, k.rand(0.1, 0.16), [Math.cos(a) * d, 0.03, Math.sin(a) * d], "leaf", "leafDeep", [0, k.rand(0, 6), 0], 6, to);
  }
}

/* ================================================================== */
/* Rocks, crystals, mushrooms                                          */
/* ================================================================== */

const STONE_COLS = ["#e1d8ee", "#d9cdef", "#f0d6e2", "#d3e6df", "#e6e0d4", "#cfdcf0"];

export function addRock(b: Batch, x: number, z: number, o: PropOpts & { moss?: boolean } = {}): Collider {
  const k = new Kit(b, x, z, o);
  const c = o.color ?? k.pick(STONE_COLS);
  const rot: V3 = [k.rand(-0.15, 0.15), k.rand(0, TAU), k.rand(-0.15, 0.15)];
  k.blob(0.55, 0.42, 0.48, [0, 0.26, 0], jitterCol(c, 0.03, k.r), dk(c, 0.22), rot, 8);
  const n = 1 + Math.floor(k.r() * 2);
  let maxR = 0.55;
  for (let i = 0; i < n; i++) {
    const a = k.rand(0, TAU),
      d = k.rand(0.45, 0.6);
    const r = k.rand(0.22, 0.32);
    maxR = Math.max(maxR, d + r);
    k.blob(r, r * 0.75, r * 0.9, [Math.cos(a) * d, r * 0.5, Math.sin(a) * d], jitterCol(c, 0.04, k.r), dk(c, 0.2), [0, k.rand(0, 6), 0], 7);
  }
  if (o.moss ?? k.r() < 0.45) {
    k.blob(0.36, 0.1, 0.3, [0.04, 0.6, -0.02], "moss", "leafDeep", [0.1, k.rand(0, 6), 0], 7);
  }
  return k.circle(0, 0, Math.min(0.75, maxR * 0.85));
}

const CRYSTAL_COLS: Record<string, [string, string]> = {
  lavender: ["#f3e6ff", "#a98ae6"],
  pink: ["#ffe4f0", "#ef8fb8"],
  sky: ["#e6f6ff", "#7fbde9"],
  mint: ["#e4fff3", "#6fd0aa"],
};

/** One soft-faceted crystal shard (hex lathe). Local origin at base. */
function shard(k: Kit, p: V3, h: number, r: number, top: ColorLike, bot: ColorLike, rot: V3, to: Batch) {
  k.put(
    lathe(
      k.scene,
      [
        [0, -0.1],
        [r * 0.85, -0.1],
        [r, h * 0.1],
        [r * 0.96, h * 0.66],
        [r * 0.3, h * 0.95],
        [0, h],
      ],
      { color: top, bottom: bot },
      6,
    ),
    p,
    rot,
    1,
    to,
  );
}

export function addCrystal(b: Batch, x: number, z: number, o: PropOpts & { hue?: "lavender" | "pink" | "sky" | "mint"; base?: boolean } = {}): Collider {
  const k = new Kit(b, x, z, o);
  const hue = o.hue ?? (k.pick(["lavender", "pink", "sky", "mint"]) as "lavender");
  const [top, bot] = CRYSTAL_COLS[hue];
  const tc = o.color ?? top;
  if (o.base ?? true) {
    k.blob(0.55, 0.22, 0.5, [0, 0.08, 0], k.pick(["#d3c4ea", "#c8b8e6", "#ddd2ee"]), "#a796c8", [0, k.rand(0, 6), 0], 7);
  }
  shard(k, [0, 0.1, 0], k.rand(1.1, 1.4), 0.24, tc, bot, [0.08, k.rand(0, 6), 0.05], k.glow);
  const n = 3 + Math.floor(k.r() * 2);
  const a0 = k.rand(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + k.rand(-0.3, 0.3);
    const tilt = k.rand(0.35, 0.6);
    shard(k, [Math.cos(a) * 0.22, 0.08, Math.sin(a) * 0.22], k.rand(0.45, 0.8), k.rand(0.11, 0.16), tc, bot, [tilt * Math.sin(a), k.rand(0, 6) * 0, -tilt * Math.cos(a)], k.glow);
  }
  return k.circle(0, 0, 0.55);
}

export function addMushroom(b: Batch, x: number, z: number, o: PropOpts = {}): void {
  const k = new Kit(b, x, z, o);
  const capCol = o.color ?? k.pick(["red", "#f48aa6", "#c6a4f0", "#ffb38a", "#f7a0b8"]);
  const n = k.r() < 0.6 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const s = i === 0 ? 1 : k.rand(0.5, 0.7);
    const ox = i === 0 ? 0 : k.rand(0.18, 0.26) * (k.r() < 0.5 ? -1 : 1),
      oz = i === 0 ? 0 : k.rand(-0.15, 0.15);
    const h = 0.26 * s,
      R = 0.2 * s;
    k.put(
      lathe(
        k.scene,
        [
          [0, 0],
          [0.075 * s, 0],
          [0.06 * s, h * 0.5],
          [0.055 * s, h],
          [0, h],
        ],
        { color: "cream", bottom: "#f1dcc4" },
        8,
      ),
      [ox, 0, oz],
    );
    k.put(
      lathe(
        k.scene,
        [
          [0, h + R * 0.75],
          [R * 0.55, h + R * 0.68],
          [R * 0.92, h + R * 0.35],
          [R, h + R * 0.06],
          [R * 0.85, h - 0.01],
          [0, h + 0.01],
        ],
        { color: lt(capCol, 0.12), bottom: dk(capCol, 0.1) },
        10,
      ),
      [ox, 0, oz],
      [k.rand(-0.15, 0.15), 0, k.rand(-0.15, 0.15)],
    );
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * TAU + k.rand(-0.3, 0.3);
      const el = j === 0 ? 1.4 : 0.6;
      const nx = Math.cos(a) * Math.cos(el),
        ny = Math.sin(el),
        nz = Math.sin(a) * Math.cos(el);
      k.put(elb(k.scene, 0.045 * s, 0.012 * s, 0.045 * s, { color: "white" }, 5), [ox + nx * R * 0.95, h + ny * R * 0.72, oz + nz * R * 0.95], alignY(nx, ny * 1.3, nz));
    }
  }
}

/** Bioluminescent mushroom cluster (caps go into the glow batch). */
export function addGlowShroom(b: Batch, x: number, z: number, o: PropOpts & { hue?: "mint" | "sky" | "pink" | "lavender" } = {}): void {
  const k = new Kit(b, x, z, o);
  const capCols: Record<string, [string, string]> = {
    mint: ["#d8fff0", "#7fe0bf"],
    sky: ["#e0f4ff", "#86c8f2"],
    pink: ["#ffe0ee", "#f39cc4"],
    lavender: ["#f0e4ff", "#b796ee"],
  };
  const [ct, cb] = capCols[o.hue ?? k.pick(["mint", "sky", "pink", "lavender"])];
  const n = 2 + Math.floor(k.r() * 3);
  for (let i = 0; i < n; i++) {
    const a = k.rand(0, TAU),
      d = i === 0 ? 0 : k.rand(0.18, 0.38);
    const s = i === 0 ? 1 : k.rand(0.45, 0.75);
    const ox = Math.cos(a) * d,
      oz = Math.sin(a) * d;
    const h = 0.42 * s,
      R = 0.2 * s;
    const lean: V3 = [k.rand(-0.2, 0.2), 0, k.rand(-0.2, 0.2)];
    k.put(
      lathe(
        k.scene,
        [
          [0, 0],
          [0.05 * s, 0],
          [0.04 * s, h * 0.6],
          [0.045 * s, h],
          [0, h],
        ],
        { color: "#f1e8ff", bottom: "#b9a8d8" },
        7,
      ),
      [ox, 0, oz],
      lean,
    );
    const top: V3 = [ox + Math.sin(lean[2]) * -h, h * Math.cos(lean[0]), oz + Math.sin(lean[0]) * h];
    k.put(
      lathe(
        k.scene,
        [
          [0, R * 0.62],
          [R * 0.6, R * 0.55],
          [R, R * 0.1],
          [R * 0.9, -0.01],
          [0, 0.02],
        ],
        { color: ct, bottom: cb },
        9,
      ),
      top,
      lean,
      1,
      k.glow,
    );
  }
}

export function addLilyPad(b: Batch, x: number, z: number, o: PropOpts & { flower?: boolean } = {}): void {
  const k = new Kit(b, x, z, o);
  const r = k.rand(0.42, 0.58);
  const pad = o.color ?? k.pick(["#9fdc8e", "#a8e2a0", "#94d39a"]);
  const rot = k.rand(0, TAU);
  k.put(scallopRug(k.scene, r, 7, { color: lt(pad, 0.1), bottom: dk(pad, 0.12) }, 0.05), [0, 0.0, 0], [0, rot, 0], [1, 1, 1]);
  // notch (a dark wedge reads as the classic lily-pad cut)
  k.put(cone(k.scene, r * 0.55, 0.06, { color: dk(pad, 0.25) }, 4), [Math.cos(rot) * r * 0.62, 0.035, -Math.sin(rot) * r * 0.62], [Math.PI / 2, rot - Math.PI / 2, 0], [1, 1, 0.25]);
  if (o.flower) {
    const pc = k.pick(["#ffc6da", "#ffd9e6", "#fbe7ff"]);
    const cx = k.rand(-0.1, 0.1),
      cz = k.rand(-0.1, 0.1);
    for (let ring = 0; ring < 2; ring++) {
      const np = ring === 0 ? 7 : 5;
      for (let i = 0; i < np; i++) {
        const a = (i / np) * TAU + ring * 0.4;
        const tilt = ring === 0 ? 0.95 : 0.45;
        const pr = ring === 0 ? 0.17 : 0.13;
        // pitch leans the petal's long (Y) axis toward +Z, yaw turns that toward (cos a, sin a)
        k.put(
          elb(k.scene, 0.07, pr * 0.62, 0.04, { color: ring === 0 ? pc : lt(pc, 0.35), bottom: ring === 0 ? "pinkDeep" : pc }, 6),
          [cx + Math.cos(a) * 0.07, 0.1 + ring * 0.03, cz + Math.sin(a) * 0.07],
          [tilt, Math.atan2(Math.cos(a), Math.sin(a)), 0],
        );
      }
    }
    k.ball(0.05, [cx, 0.13, cz], "butter", "butterDeep", 6);
  }
}

export function addReeds(b: Batch, x: number, z: number, o: PropOpts = {}): void {
  const k = new Kit(b, x, z, o);
  const to = k.leaves;
  const n = 6 + Math.floor(k.r() * 4);
  for (let i = 0; i < n; i++) {
    const a = k.rand(0, TAU),
      d = k.rand(0, 0.35);
    const h = k.rand(0.7, 1.25);
    k.put(
      cone(k.scene, h, 0.05, { color: jitterCol("#a5dc8a", 0.04, k.r), bottom: "#5fae73" }, 5),
      [Math.cos(a) * d, 0, Math.sin(a) * d],
      [k.rand(-0.18, 0.18), k.rand(0, 6), k.rand(-0.18, 0.18)],
      [1, 1, 0.45],
      to,
    );
  }
  const nc = 2 + Math.floor(k.r() * 2);
  for (let i = 0; i < nc; i++) {
    const a = k.rand(0, TAU),
      d = k.rand(0.05, 0.3);
    const h = k.rand(1.0, 1.35);
    const px = Math.cos(a) * d,
      pz = Math.sin(a) * d;
    k.put(stemMesh(k.scene, h, 0.02, "#7cc277"), [px, 0, pz], ZERO, 1, to);
    k.put(elb(k.scene, 0.05, 0.14, 0.05, { color: "#b07a52", bottom: "#93603f" }, 5), [px, h - 0.12, pz], ZERO, 1, to);
    k.put(stemMesh(k.scene, 0.12, 0.01, "#7cc277"), [px, h + 0.02, pz], ZERO, 1, to);
  }
}

/* ================================================================== */
/* Wood things                                                         */
/* ================================================================== */

export function addStump(b: Batch, x: number, z: number, o: PropOpts = {}): Collider {
  const k = new Kit(b, x, z, o);
  const c = o.color ?? "wood";
  k.put(
    lathe(
      k.scene,
      [
        [0, 0],
        [0.6, 0],
        [0.55, 0.07],
        [0.45, 0.2],
        [0.4, 0.45],
        [0.4, 0.55],
        [0, 0.56],
      ],
      { color: c, bottom: "woodDeep" },
      11,
    ),
    ZERO,
    [0, k.rand(0, 6), 0],
  );
  k.put(disc(k.scene, 0.36, 0.03, { color: "woodLight" }, 14), [0, 0.54, 0]);
  k.put(torus(k.scene, 0.2, 0.025, { color: "#e3bf94" }, 14), [0, 0.565, 0], ZERO, [1, 0.3, 1]);
  k.ball(0.04, [0, 0.57, 0], "#e3bf94", undefined, 4);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + k.rand(-0.3, 0.3);
    k.blob(0.2, 0.12, 0.34, [Math.cos(a) * 0.48, 0.05, Math.sin(a) * 0.48], c, "woodDeep", [0, Math.PI / 2 - a, 0], 6);
  }
  if (k.r() < 0.7) addMushroom(b, k.wx(0.5, -0.25), k.wz(0.5, -0.25), { scale: 0.6 * k.s, y: k.y, seed: k.r() * 1e9, leaves: k.leaves, glow: k.glow });
  return k.circle(0, 0, 0.55);
}

export function addLog(b: Batch, x: number, z: number, o: PropOpts & { length?: number } = {}): Collider[] {
  const k = new Kit(b, x, z, o);
  const L = o.length ?? 2;
  const r = 0.3;
  const c = o.color ?? "wood";
  k.put(softCyl(k.scene, L, r, r * 1.05, { color: c, bottom: "woodDeep" }, 0.08, 12), [-L / 2, r, 0], [0, 0, -Math.PI / 2]);
  // end caps (rings)
  for (const sx of [-1, 1]) {
    k.put(disc(k.scene, r * 0.78, 0.02, { color: "woodLight" }, 12), [sx * (L / 2 + 0.005), r, 0], [0, 0, Math.PI / 2]);
    k.put(torus(k.scene, r * 0.42, 0.02, { color: "#e3bf94" }, 12), [sx * (L / 2 + 0.02), r, 0], [0, 0, Math.PI / 2], [1, 0.3, 1]);
  }
  k.blob(0.42, 0.1, 0.26, [k.rand(-0.3, 0.3), r * 2 - 0.02, 0], "moss", "leafDeep", [0, 0, 0], 7);
  k.blob(0.05, 0.14, 0.03, [L * 0.3, r * 2 + 0.05, 0.05], "leafLight", undefined, [0.2, 0, 0.3], 4);
  if (k.r() < 0.6) addMushroom(b, k.wx(-L * 0.2, -0.38), k.wz(-L * 0.2, -0.38), { scale: 0.55 * k.s, y: k.y, seed: k.r() * 1e9 });
  return k.segment(-L / 2, 0, L / 2, 0, r + 0.08);
}

export function addBench(b: Batch, x: number, z: number, o: PropOpts = {}): Collider[] {
  const k = new Kit(b, x, z, o);
  const W = 1.6;
  const seat = o.color ?? "woodLight";
  const leg: ColorLike = "#a993dc";
  for (const sx of [-1, 1]) {
    k.put(rbox(k.scene, 0.12, 0.42, 0.44, { color: leg, bottom: dk(leg, 0.15) }, 0.05, 2), [sx * (W / 2 - 0.15), 0.21, 0]);
    k.put(rbox(k.scene, 0.1, 0.62, 0.1, { color: leg }, 0.04, 2), [sx * (W / 2 - 0.15), 0.62, 0.22], [-0.12, 0, 0]);
    k.ball(0.08, [sx * (W / 2 - 0.15), 0.96, 0.26], "pink", "pinkDeep", 6);
  }
  for (let i = 0; i < 3; i++) {
    k.put(rbox(k.scene, W, 0.08, 0.15, { color: jitterCol(seat, 0.03, k.r), bottom: "wood" }, 0.035, 2), [0, 0.46, -0.17 + i * 0.165]);
  }
  for (let i = 0; i < 2; i++) {
    k.put(rbox(k.scene, W * 0.96, 0.14, 0.06, { color: jitterCol(seat, 0.03, k.r), bottom: "wood" }, 0.03, 2), [0, 0.66 + i * 0.2, 0.26 + i * 0.025], [-0.12, 0, 0]);
  }
  heart(k, [0, 0.77, 0.21], 0.14, "pinkDeep", undefined);
  return k.segment(-W / 2 + 0.1, 0.02, W / 2 - 0.1, 0.02, 0.3);
}

export function addSign(b: Batch, x: number, z: number, o: PropOpts & { arrow?: boolean } = {}): Collider {
  const k = new Kit(b, x, z, o);
  const board = o.color ?? "woodLight";
  k.put(rbox(k.scene, 0.13, 1.25, 0.13, { color: "wood", bottom: "woodDeep" }, 0.05, 2), [0, 0.62, 0.02]);
  if (o.arrow) {
    k.put(rbox(k.scene, 0.95, 0.36, 0.09, { color: board, bottom: "wood" }, 0.06, 2), [0.2, 1.0, -0.06]);
    k.put(cone(k.scene, 0.3, 0.23, { color: board }, 4), [0.67, 1.0, -0.06], [0, Math.PI / 4, -Math.PI / 2], [1, 1, 0.42]);
    k.put(rbox(k.scene, 0.55, 0.05, 0.02, { color: "woodDeep" }, 0.02, 1), [0.15, 1.0, -0.115]);
  } else {
    k.put(rbox(k.scene, 1.0, 0.58, 0.09, { color: board, bottom: "wood" }, 0.07, 2), [0, 1.0, -0.06]);
    k.put(rbox(k.scene, 0.6, 0.05, 0.02, { color: "woodDeep" }, 0.02, 1), [0.08, 1.06, -0.115]);
    k.put(rbox(k.scene, 0.45, 0.05, 0.02, { color: "woodDeep" }, 0.02, 1), [0.0, 0.94, -0.115]);
    heart(k, [-0.32, 1.06, -0.12], 0.16, "pinkDeep");
  }
  k.ball(0.09, [0, 1.3, 0.02], "pink", "pinkDeep", 6);
  // grass tuft at base
  k.blob(0.18, 0.08, 0.16, [0.05, 0.03, 0.02], "leaf", "leafDeep", ZERO, 6);
  return k.circle(0, 0, 0.25);
}

export function addFence(b: Batch, x1: number, z1: number, x2: number, z2: number, o: PropOpts = {}): Collider[] {
  const dx = x2 - x1,
    dz = z2 - z1;
  const L = Math.hypot(dx, dz);
  if (L < 0.05) return [];
  const k = new Kit(b, x1, z1, { ...o, rotY: Math.atan2(-dz, dx), scale: 1 });
  const picket = o.color ?? "cream";
  const rail: ColorLike = "woodLight";
  const nSeg = Math.max(1, Math.round(L / 1.8));
  const seg = L / nSeg;
  for (let i = 0; i <= nSeg; i++) {
    const px = i * seg;
    k.put(rbox(k.scene, 0.17, 0.92, 0.17, { color: "wood", bottom: "woodDeep" }, 0.05, 2), [px, 0.46, 0]);
    k.ball(0.11, [px, 0.96, 0], "pink", "pinkDeep", 7);
  }
  for (const ry of [0.32, 0.62]) {
    k.put(rbox(k.scene, L, 0.08, 0.05, { color: rail, bottom: "wood" }, 0.025, 1), [L / 2, ry, 0.06]);
  }
  for (let i = 0; i < nSeg; i++) {
    const np = Math.max(2, Math.round((seg - 0.2) / 0.24));
    for (let j = 0; j < np; j++) {
      const px = i * seg + 0.1 + ((j + 0.5) * (seg - 0.2)) / np;
      const h = 0.74 + k.rand(-0.03, 0.03);
      const pc = jitterCol(picket, 0.02, k.r);
      k.put(rbox(k.scene, 0.13, h, 0.05, { color: pc, bottom: "#efe2cf" }, 0.025, 1), [px, h / 2, 0]);
      k.put(elb(k.scene, 0.065, 0.065, 0.025, { color: pc }, 6), [px, h, 0]);
    }
  }
  return segColliders(x1, z1, x2, z2, 0.14);
}

/* ================================================================== */
/* Lamps, well, fountain, bridge                                       */
/* ================================================================== */

export function addLamp(b: Batch, x: number, z: number, o: PropOpts & { bulb?: string } = {}): { collider: Collider; lightPos: Vector3 } {
  const k = new Kit(b, x, z, o);
  const metal = o.color ?? "#8c79b5";
  const bulb = o.bulb ?? "#fff1c2";
  k.put(softCyl(k.scene, 0.22, 0.2, 0.26, { color: metal, bottom: dk(metal, 0.2) }, 0.06, 12), ZERO);
  k.put(softCyl(k.scene, 0.12, 0.13, 0.16, { color: lt(metal, 0.1) }, 0.04, 10), [0, 0.2, 0]);
  k.put(softCyl(k.scene, 1.95, 0.05, 0.07, { color: metal, bottom: dk(metal, 0.1) }, 0.02, 8), [0, 0.3, 0]);
  k.put(torus(k.scene, 0.08, 0.04, { color: "butterDeep" }, 12), [0, 1.2, 0]);
  // little curl ornaments
  for (const sx of [-1, 1]) {
    k.put(torus(k.scene, 0.09, 0.03, { color: metal }, 10), [sx * 0.13, 1.92, 0], [Math.PI / 2, 0, 0]);
  }
  // lantern
  const ly = 2.25;
  k.put(softCyl(k.scene, 0.07, 0.17, 0.12, { color: metal }, 0.03, 10), [0, ly - 0.25, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    k.put(rbox(k.scene, 0.035, 0.38, 0.035, { color: metal }, 0.015, 1), [Math.cos(a) * 0.17, ly - 0.02, Math.sin(a) * 0.17]);
  }
  k.put(sph(k.scene, 0.16, { color: bulb, bottom: "#ffd98a" }, 10), [0, ly - 0.02, 0], ZERO, [1, 1.15, 1], k.glow);
  k.put(
    lathe(
      k.scene,
      [
        [0, 0.28],
        [0.06, 0.26],
        [0.18, 0.12],
        [0.28, 0.02],
        [0.26, -0.02],
        [0, 0],
      ],
      { color: "pinkDeep", bottom: "#d77898" },
      12,
    ),
    [0, ly + 0.17, 0],
  );
  k.ball(0.06, [0, ly + 0.48, 0], "butter", "butterDeep", 6);
  return { collider: k.circle(0, 0, 0.26), lightPos: k.w(0, ly, 0) };
}

export function addWell(b: Batch, x: number, z: number, o: PropOpts = {}): Collider {
  const k = new Kit(b, x, z, o);
  const roof = o.color ?? "#f48aa6";
  k.put(
    lathe(
      k.scene,
      [
        [0.62, 0.78],
        [0.6, 0.1],
        [0.62, 0],
        [0.92, 0],
        [0.95, 0.1],
        [0.92, 0.72],
        [0.88, 0.8],
        [0.66, 0.82],
      ],
      { color: "#e6dcf2", bottom: "#b7a9cf" },
      18,
    ),
    ZERO,
  );
  // cobble stones
  const nS = 13;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < nS; i++) {
      const a = ((i + row * 0.5) / nS) * TAU;
      k.blob(0.2, 0.15, 0.1, [Math.cos(a) * 0.93, 0.22 + row * 0.32, Math.sin(a) * 0.93], jitterCol(k.pick(STONE_COLS), 0.03, k.r), undefined, [0, Math.PI / 2 - a, 0], 5);
    }
  }
  k.put(disc(k.scene, 0.62, 0.04, { color: "#7fc4ea" }, 16), [0, 0.6, 0], ZERO, 1, k.glow);
  // posts & roof
  for (const sx of [-1, 1]) {
    k.put(rbox(k.scene, 0.14, 1.6, 0.14, { color: "wood", bottom: "woodDeep" }, 0.05, 2), [sx * 0.78, 0.8 + 0.4, 0]);
  }
  k.put(softCyl(k.scene, 1.4, 0.05, 0.05, { color: "woodDeep" }, 0.02, 8), [-0.7, 1.45, 0], [0, 0, -Math.PI / 2]);
  k.put(softCyl(k.scene, 0.55, 0.012, 0.012, { color: "#d8c3a0" }, 0.005, 4), [0, 0.9, 0]);
  k.put(softCyl(k.scene, 0.2, 0.12, 0.1, { color: "woodLight", bottom: "wood" }, 0.03, 10), [0, 0.72, 0]);
  k.put(torus(k.scene, 0.1, 0.02, { color: "woodDeep" }, 10), [0, 0.92, 0], [0, 0, Math.PI / 2], [1, 1, 1]);
  for (const sz of [-1, 1]) {
    k.put(rbox(k.scene, 1.95, 0.08, 0.72, { color: roof, bottom: dk(roof, 0.12) }, 0.04, 2), [0, 2.1, sz * 0.3], [sz * 0.62, 0, 0]);
  }
  k.put(softCyl(k.scene, 2.0, 0.07, 0.07, { color: "cream" }, 0.03, 8), [-1.0, 2.33, 0], [0, 0, -Math.PI / 2]);
  heart(k, [0, 2.12, -0.52], 0.2, "cream");
  return k.circle(0, 0, 0.98);
}

export interface FountainResult {
  colliders: Collider[];
  /** water surfaces & streams (own material, slightly self-lit). Already finished & added to the scene. */
  water: Mesh;
  /** call each frame for the bobbing spout */
  update(t: number): void;
}

/** Tiered plaza fountain (~4.3 m across, ~3 m tall). Water is returned as a separate mesh. */
export function addFountain(b: Batch, x: number, z: number, o: PropOpts = {}): FountainResult {
  const k = new Kit(b, x, z, o);
  const stone = o.color ?? "#ece4f6";
  const stoneDeep = "#b8aacf";
  const wb = new Batch(k.scene, "fountainWater");
  // basin
  k.put(
    lathe(
      k.scene,
      [
        [1.8, 0.62],
        [1.78, 0.12],
        [1.7, 0.05],
        [2.05, 0],
        [2.18, 0.08],
        [2.2, 0.55],
        [2.12, 0.66],
        [1.85, 0.68],
      ],
      { color: stone, bottom: stoneDeep },
      28,
    ),
    ZERO,
  );
  k.put(disc(k.scene, 1.8, 0.06, { color: "#9ccbe6" }, 20), [0, 0.03, 0]);
  // rim tiles
  const nT = 16;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * TAU;
    k.blob(0.14, 0.06, 0.1, [Math.cos(a) * 2.0, 0.67, Math.sin(a) * 2.0], i % 2 ? "#ffd0e0" : "#cdeedd", undefined, [0, Math.PI / 2 - a, 0], 5);
  }
  // base step (soft paved ring)
  k.put(disc(k.scene, 2.5, 0.08, { color: "#efe6f7", bottom: "#d4c8e4" }, 28), [0, -0.03, 0]);
  const nPave = 22;
  for (let i = 0; i < nPave; i++) {
    const a = (i / nPave) * TAU + 0.07;
    k.blob(0.2, 0.04, 0.13, [Math.cos(a) * 2.36, 0.04, Math.sin(a) * 2.36], i % 3 === 0 ? "#f6dbe7" : "#e6ddf2", undefined, [0, Math.PI / 2 - a, 0], 5);
  }
  // pedestal 1
  k.put(
    lathe(
      k.scene,
      [
        [0, 0],
        [0.55, 0],
        [0.45, 0.15],
        [0.28, 0.4],
        [0.24, 0.9],
        [0.3, 1.08],
        [0, 1.1],
      ],
      { color: stone, bottom: stoneDeep },
      14,
    ),
    ZERO,
  );
  // bowl 1
  const by = 1.05;
  k.put(
    lathe(
      k.scene,
      [
        [0.15, by - 0.02],
        [0.55, by + 0.04],
        [0.95, by + 0.22],
        [1.1, by + 0.38],
        [1.06, by + 0.46],
        [0.94, by + 0.44],
        [0.6, by + 0.35],
        [0, by + 0.33],
      ],
      { color: stone, bottom: stoneDeep },
      22,
    ),
    ZERO,
  );
  // pedestal 2 + bowl 2
  k.put(softCyl(k.scene, 0.7, 0.14, 0.2, { color: stone, bottom: stoneDeep }, 0.05, 12), [0, by + 0.3, 0]);
  const b2 = by + 0.95;
  k.put(
    lathe(
      k.scene,
      [
        [0.1, b2 - 0.02],
        [0.35, b2 + 0.03],
        [0.55, b2 + 0.16],
        [0.6, b2 + 0.26],
        [0.56, b2 + 0.31],
        [0.48, b2 + 0.29],
        [0, b2 + 0.22],
      ],
      { color: stone, bottom: stoneDeep },
      18,
    ),
    ZERO,
  );
  // heart topper
  k.put(softCyl(k.scene, 0.25, 0.06, 0.1, { color: stone }, 0.03, 10), [0, b2 + 0.22, 0]);
  heart(k, [0, b2 + 0.66, 0], 0.32, "#f7a0b8", undefined, 0);
  heart(k, [0, b2 + 0.66, 0], 0.32, "#f7a0b8", undefined, Math.PI / 2);

  // ---- water (separate mesh)
  const wTop: ColorLike = "#c4ecfb";
  const wBot: ColorLike = "#8fd0ef";
  k.put(disc(k.scene, 1.79, 0.05, { color: "#a9def5" }, 28), [0, 0.47, 0], ZERO, 1, wb);
  k.put(disc(k.scene, 1.0, 0.04, { color: "#a9def5" }, 22), [0, by + 0.4, 0], ZERO, 1, wb);
  k.put(disc(k.scene, 0.55, 0.04, { color: "#a9def5" }, 16), [0, b2 + 0.26, 0], ZERO, 1, wb);
  // arching streams: rim → lower pool
  const arc = (r0: number, y0: number, r1: number, y1: number, a: number, rad: number) => {
    const path: Vector3[] = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      const rr = r0 + (r1 - r0) * Math.sin(t * Math.PI * 0.5);
      const yy = y0 + 0.08 * Math.sin(t * Math.PI) + (y1 - y0) * t * t;
      path.push(new Vector3(Math.cos(a) * rr, yy, Math.sin(a) * rr));
    }
    const m = MeshBuilder.CreateTube("stream", { path, radius: rad, tessellation: 6, cap: Mesh.CAP_ALL, radiusFunction: (i) => rad * (0.8 + 0.4 * (i / 7)) }, k.scene);
    k.put(prep(m, wTop, wBot), ZERO, ZERO, 1, wb);
  };
  const nStream = 8;
  for (let i = 0; i < nStream; i++) {
    const a = (i / nStream) * TAU + 0.2;
    arc(1.08, by + 0.44, 1.45, 0.48, a, 0.05);
    k.put(torus(k.scene, 0.13, 0.035, { color: "#e6f7ff" }, 10), [Math.cos(a) * 1.45, 0.5, Math.sin(a) * 1.45], ZERO, [1, 0.4, 1], wb);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.6;
    arc(0.6, b2 + 0.3, 0.86, by + 0.42, a, 0.04);
  }
  const water = wb.build({
    material: toonMat(k.scene, { name: "propWater", emissive: "#6f7f8c", rim: 0.45, specular: 0.25 }),
    outline: 0.03,
    outlineColor: "#6fa9d6",
    castShadow: false,
  })!;
  // spout plume (separate so it can bob)
  const plume = lathe(
    k.scene,
    [
      [0, 0],
      [0.09, 0.02],
      [0.13, 0.1],
      [0.1, 0.22],
      [0.04, 0.3],
      [0, 0.32],
    ],
    { color: "#eef9ff", bottom: "#a9def5" },
    10,
  );
  plume.scaling.setAll(k.s);
  // four tiny jets bubbling up around the heart
  const jets: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const j = i === 0 ? plume : (plume.clone("jet") as Mesh);
    j.position.copyFrom(k.w(Math.cos(a) * 0.3, b2 + 0.24, Math.sin(a) * 0.3));
    jets.push(j);
  }
  for (const j of jets) finishMesh(j, k.scene, { material: water.material!, outline: 0.02, outlineColor: "#6fa9d6", castShadow: false });
  jets.forEach((j) => (j.parent = water));
  // jets are children of water (water mesh is at identity), so their positions stay world-space
  return {
    colliders: [k.circle(0, 0, 2.25)],
    water,
    update(t: number) {
      for (let i = 0; i < jets.length; i++) {
        const s = k.s * (1 + 0.12 * Math.sin(t * 5 + i * 1.7));
        jets[i].scaling.set(k.s, s, k.s);
      }
    },
  };
}

export function addBridge(b: Batch, x: number, z: number, length: number, rotY: number, o: PropOpts & { width?: number } = {}): Collider[] {
  const k = new Kit(b, x, z, { ...o, rotY });
  const L = length;
  const W = o.width ?? 1.9;
  const arch = (t: number) => 0.05 + 0.1 * (1 - t * t); // t in -1..1
  const n = Math.max(4, Math.round(L / 0.3));
  const pw = L / n;
  for (let i = 0; i < n; i++) {
    const px = -L / 2 + (i + 0.5) * pw;
    const y = arch(px / (L / 2));
    k.put(rbox(k.scene, pw * 0.9, 0.09, W, { color: jitterCol(i % 2 ? "woodLight" : "wood", 0.035, k.r), bottom: "wood" }, 0.035, 1), [px, y, 0], [0, 0, 0]);
  }
  for (const sz of [-1, 1]) {
    k.put(rbox(k.scene, L * 1.02, 0.14, 0.16, { color: "woodDeep" }, 0.05, 1), [0, 0.0, sz * (W / 2 - 0.25)]);
  }
  // rails
  const nPost = Math.max(2, Math.round(L / 1.25) + 1);
  for (const sz of [-1, 1]) {
    const zz = sz * (W / 2 - 0.02);
    const path: Vector3[] = [];
    for (let i = 0; i < nPost; i++) {
      const px = -L / 2 + 0.1 + (i * (L - 0.2)) / (nPost - 1);
      const y = arch(px / (L / 2));
      k.put(rbox(k.scene, 0.13, 0.78, 0.13, { color: "wood", bottom: "woodDeep" }, 0.04, 2), [px, y + 0.34, zz]);
      k.ball(0.085, [px, y + 0.78, zz], "pink", "pinkDeep", 6);
    }
    for (let i = 0; i <= 10; i++) {
      const px = -L / 2 + 0.1 + (i / 10) * (L - 0.2);
      path.push(new Vector3(px, arch(px / (L / 2)) + 0.62, zz));
    }
    const m = tube(k.scene, path, 0.045, "woodLight", 6);
    k.put(m, ZERO);
    // flower garland dots
    for (let i = 1; i < nPost - 1; i++) {
      const px = -L / 2 + 0.1 + ((i - 0.5) * (L - 0.2)) / (nPost - 1);
      k.ball(0.06, [px, arch(px / (L / 2)) + 0.58, zz - sz * 0.03], k.pick(["pink", "butter", "lilac"]), undefined, 5);
    }
  }
  return [...k.segment(-L / 2, -(W / 2 - 0.02), L / 2, -(W / 2 - 0.02), 0.12), ...k.segment(-L / 2, W / 2 - 0.02, L / 2, W / 2 - 0.02, 0.12)];
}

/* ================================================================== */
/* Terrain features: cliffs, cave mouth                                */
/* ================================================================== */

function smooth01(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

const ROCK_TOP = "#dccbf2";
const ROCK_MID = "#c7b2e8";
const ROCK_BOT = "#a891d0";
const GRASS_TOP = "#b0e290";
const GRASS_LIP = "#8fd27a";

/** A strand of ivy hanging from (x, top, z) down a wall whose outward normal is (nx, nz). */
function ivy(k: Kit, x: number, z: number, nx: number, nz: number, top: number, wallDist: (y: number) => number, count: number) {
  const yaw = Math.atan2(nx, nz);
  const px = -nz,
    pz = nx; // along wall
  let sway = 0;
  for (let j = 0; j < count; j++) {
    const vy = top - 0.04 - j * 0.19;
    const u = wallDist(vy) + 0.05;
    sway += k.rand(-0.04, 0.04);
    const side = j % 2 === 0 ? 1 : -1;
    const lx = x + nx * u + px * (sway + side * 0.07),
      lz = z + nz * u + pz * (sway + side * 0.07);
    const sz = 0.1 + 0.03 * Math.sin(j * 1.3) - j * 0.006;
    // leaf: flattened against the wall, tilted alternately
    k.blob(sz, sz * 0.8, 0.03, [lx, vy, lz], jitterCol(j % 3 === 0 ? "leafLight" : "leaf", 0.04, k.r), "leafDeep", [0.15, yaw, side * 0.6], 5);
  }
  if (k.r() < 0.35) {
    const vy = top - 0.04 - count * 0.19;
    const u = wallDist(vy) + 0.07;
    k.ball(0.05, [x + nx * u + px * sway, vy + 0.05, z + nz * u + pz * sway], k.pick(["pink", "lilac", "butter", "white"]), undefined, 4);
  }
}

/**
 * Chunky soft rock/earth wall with a grassy cap following a polyline (world XZ points).
 * Symmetric about the line; thickness ≈ max(1.3, 0.45·height) each side.
 * Pass `closed: true` for a loop. Returns circle colliders along the line.
 */
export function addCliff(b: Batch, points: [number, number][], height: number, o: PropOpts & { thickness?: number; closed?: boolean; decor?: boolean } = {}): Collider[] {
  return rockMass(b, points, height, o, false);
}

/**
 * Solid grassy plateau / hill: the closed polygon `points` (world XZ, any winding) is the footprint
 * edge; the rock face bulges out ≈0.25·T beyond it and the top is a flat grassy cap at `height`.
 * Returns circle colliders along the edge (interior is not filled — keep spawns outside).
 */
export function addMesa(b: Batch, points: [number, number][], height: number, o: PropOpts & { thickness?: number; decor?: boolean } = {}): Collider[] {
  return rockMass(b, points, height, { ...o, closed: true }, true);
}

function rockMass(b: Batch, points: [number, number][], height: number, o: PropOpts & { thickness?: number; closed?: boolean; decor?: boolean }, mesa: boolean): Collider[] {
  if (points.length < 2) return [];
  const k = new Kit(b, points[0][0], points[0][1], { ...o, rotY: 0, scale: 1 });
  const closed = mesa || !!o.closed;
  const H = height;
  const T = o.thickness ?? (mesa ? Math.max(1.0, H * 0.32) : Math.max(1.3, H * 0.45));
  // outward sign for mesa (left normal points inward for a CCW polygon)
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i],
      [bx, bz] = points[(i + 1) % points.length];
    area += ax * bz - bx * az;
  }
  const outSign = mesa ? (area > 0 ? -1 : 1) : 1;
  // ---- resample
  const src = closed ? [...points, points[0]] : points;
  const samp: [number, number, number][] = []; // x, z, arc length
  const step = 0.7;
  let acc = 0;
  for (let i = 0; i < src.length - 1; i++) {
    const [ax, az] = src[i],
      [bx, bz] = src[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / step));
    for (let j = 0; j < n; j++) samp.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n, acc + (L * j) / n]);
    acc += L;
  }
  if (!closed) samp.push([src[src.length - 1][0], src[src.length - 1][1], acc]);
  const total = acc;
  // smooth corners a little (twice)
  let sm = samp;
  for (let pass = 0; pass < 2; pass++) {
    const prev = sm;
    sm = prev.map((p, i) => {
      if (!closed && (i === 0 || i === prev.length - 1)) return p;
      const a = prev[(i - 1 + prev.length) % prev.length],
        c = prev[(i + 1) % prev.length];
      return [(a[0] + p[0] * 2 + c[0]) / 4, (a[1] + p[1] * 2 + c[1]) / 4, p[2]] as [number, number, number];
    });
  }
  const N = sm.length;
  const seedOff = k.rand(0, 100);
  // profile: [u (×T, + = outward/left side), v (×H), colourKey 0-2 rock, 3 lip, 4 grass]
  type Prof = [number, number, number];
  const lip = (s: number) => 0.84 + 0.035 * Math.sin(s * 2.3 + seedOff) + 0.02 * Math.sin(s * 5.1 + seedOff * 2);
  const profFor = (s: number): Prof[] => {
    const lv = lip(s);
    const half: Prof[] = [
      [1.1, -0.12, 0],
      [1.06, 0.0, 0],
      [1.0, 0.2, 0],
      [1.03, 0.42, 1],
      [0.95, 0.64, 2],
      [0.9, lv - 0.04, 2],
      [0.92, lv, 3], // grass lip (crisp edge)
      [0.86, lv + 0.08, 4],
      [0.62, 1.0, 4],
      [0.3, 1.05, 4],
    ];
    if (mesa) return half.map(([u, v, c]) => [u - 0.85, v, c] as Prof);
    const full: Prof[] = [...half];
    full.push([0, 1.06, 4]);
    for (let i = half.length - 1; i >= 0; i--) full.push([-half[i][0], half[i][1], half[i][2]]);
    return full;
  };
  const P = profFor(0).length;
  const pos: number[] = [];
  const ref: number[] = [];
  const colors: number[] = [];
  const idx: number[] = [];
  const cRock = [col(ROCK_BOT), col(ROCK_MID), col(ROCK_TOP)];
  // boulder-ish bulges: soft bumps along s, modulated in v so faces read as stacked rounded rocks
  const lumpy = (s: number, v: number, side: number) => {
    const ph = seedOff + side * 2.1;
    const col1 = Math.pow(0.5 + 0.5 * Math.sin(s * 1.9 + ph), 1.6);
    const col2 = Math.pow(0.5 + 0.5 * Math.sin(s * 3.7 + ph * 1.3 + v * 2.2), 2);
    const tier = 0.5 + 0.5 * Math.sin(v * 8.5 + Math.sin(s * 0.8 + ph) * 1.5);
    return 0.86 + 0.2 * col1 + 0.1 * col2 + 0.07 * tier;
  };
  type RP = { x: number; z: number; s: number; tx: number; tz: number; nx: number; nz: number; f: number; cap: number };
  const ringPts: RP[] = [];
  for (let i = 0; i < N; i++) {
    const p = sm[i];
    const a = sm[closed ? (i - 1 + N) % N : Math.max(0, i - 1)],
      c = sm[closed ? (i + 1) % N : Math.min(N - 1, i + 1)];
    let tx = c[0] - a[0],
      tz = c[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const f = closed ? 1 : smooth01(Math.min(p[2], total - p[2]) / Math.min(1.6, total / 2));
    ringPts.push({ x: p[0], z: p[1], s: p[2], tx, tz, nx: -tz * outSign, nz: tx * outSign, f, cap: 0 });
  }
  if (!closed) {
    const a = ringPts[0],
      z = ringPts[N - 1];
    ringPts.unshift({ ...a, x: a.x - a.tx * T * 0.45, z: a.z - a.tz * T * 0.45, s: a.s - 0.5, f: 0, cap: 1 });
    ringPts.push({ ...z, x: z.x + z.tx * T * 0.45, z: z.z + z.tz * T * 0.45, s: z.s + 0.5, f: 0, cap: 1 });
  }
  let cx = 0,
    cz = 0;
  for (const rp of ringPts) {
    const { nx, nz } = rp;
    cx += rp.x / ringPts.length;
    cz += rp.z / ringPts.length;
    const prof = profFor(rp.s);
    const tScale = 0.45 + 0.55 * rp.f;
    const hScale = 0.55 + 0.45 * rp.f;
    for (const [u, v, ck] of prof) {
      const side = u >= 0 || mesa ? 0 : 1;
      let uu: number;
      if (mesa) {
        const ub = u + 0.85; // distance from the inner line
        uu = (ck < 3 ? ub * lumpy(rp.s, v, 0) : ub * (1 + 0.04 * Math.sin(rp.s * 2))) - 0.85;
        uu *= T;
      } else {
        uu = u * T * tScale;
        if (ck < 3) uu *= lumpy(rp.s, v, side);
        else uu *= 1 + 0.04 * Math.sin(rp.s * 2 + side * 3);
      }
      let vv = v * H * (mesa ? 1 : hScale);
      if (rp.cap) {
        uu = u * T * 0.15;
        vv = Math.min(v, 1) * H * 0.4;
      }
      pos.push(rp.x + nx * uu, k.y + vv, rp.z + nz * uu);
      ref.push(nx * (mesa ? u + 1 : u), v - 0.45, nz * (mesa ? u + 1 : u));
      let c: Color3;
      if (ck >= 3) {
        const inner = mesa ? Math.min(1, (0.85 - (u + 0.85)) * 3 + 0.4) : Math.min(1, (1 - Math.abs(u)) * 1.6);
        c = ck === 3 ? col(GRASS_LIP) : Color3.Lerp(col(GRASS_LIP), col(GRASS_TOP), Math.max(0, inner));
      } else {
        const band = 0.5 + 0.5 * Math.sin(v * 13 + Math.sin(rp.s * 0.6 + seedOff) * 1.2);
        const t = Math.max(0, Math.min(1, v / 0.8));
        c = t < 0.5 ? Color3.Lerp(cRock[0], cRock[1], t * 2) : Color3.Lerp(cRock[1], cRock[2], (t - 0.5) * 2);
        c = Color3.Lerp(c, mixCol(c, "#f6d6ec", 0.7), band * 0.3 * t);
        // crevices (where the wall dips in) get a soft plum tint
        const lmp = lumpy(rp.s, v, side);
        c = Color3.Lerp(c, mixCol(c, "#8a6fb8", 0.55), Math.max(0, Math.min(1, (1.02 - lmp) / 0.16)) * 0.8);
      }
      colors.push(c.r, c.g, c.b, 1);
    }
  }
  const R = ringPts.length;
  const ringCount = closed ? R : R - 1;
  for (let i = 0; i < ringCount; i++) {
    const i2 = (i + 1) % R;
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j,
        bb = i * P + j + 1,
        c = i2 * P + j,
        d = i2 * P + j + 1;
      idx.push(a, c, bb, bb, c, d);
    }
  }
  if (mesa) {
    // flat grassy cap: fan from centroid to the innermost profile ring
    const ci = pos.length / 3;
    pos.push(cx, k.y + H * 1.07, cz);
    ref.push(0, 1, 0);
    const g = col(GRASS_TOP);
    colors.push(g.r, g.g, g.b, 1);
    for (let i = 0; i < R; i++) {
      const i2 = (i + 1) % R;
      idx.push(ci, i * P + P - 1, i2 * P + P - 1);
    }
  }
  fixWinding(pos, idx, ref);
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  vd.normals = normals;
  vd.colors = colors;
  const m = new Mesh(mesa ? "mesa" : "cliff", k.scene);
  vd.applyToMesh(m);
  b.add(m);

  // ---- colliders & decor
  const cols: Collider[] = [];
  const decor = o.decor ?? true;
  for (let i = 0; i < N; i++) {
    const rp = ringPts[closed ? i : i + 1];
    const { nx, nz } = rp;
    if (i % 2 === 0 || i === N - 1) {
      if (mesa) cols.push({ kind: "circle", x: rp.x - nx * T * 0.35, z: rp.z - nz * T * 0.35, r: T * 1.0 });
      else cols.push({ kind: "circle", x: rp.x, z: rp.z, r: T * (0.5 + 0.5 * rp.f) * 1.02 });
    }
    if (!decor || rp.f < 0.5) continue;
    const hh = H * (mesa ? 1 : 0.55 + 0.45 * rp.f);
    const topOff = () => (mesa ? k.rand(-1.6, -0.3) * T : k.rand(-0.5, 0.5) * T);
    // grass tufts / flowers on top
    if (k.r() < 0.35) {
      const off = topOff();
      k.put(
        elb(k.scene, k.rand(0.25, 0.4), k.rand(0.14, 0.2), k.rand(0.25, 0.35), { color: jitterCol(GRASS_TOP, 0.04, k.r), bottom: GRASS_LIP }, 6),
        [rp.x - k.x + nx * off, hh * 1.04, rp.z - k.z + nz * off],
        [0, k.rand(0, 6), 0],
      );
    }
    if (k.r() < 0.18) {
      const off = topOff();
      blossomDot(k, [rp.x + nx * off - k.x, hh * 1.06 + 0.03, rp.z + nz * off - k.z], [0, 1, 0], 0.09, k.pick(["pink", "white", "butter", "lilac"]), "butterDeep", k.leaves);
    }
    // hanging ivy down the face(s)
    for (const side of mesa ? [1] : [1, -1]) {
      if (k.r() > 0.32) continue;
      const wall = mesa
        ? (vy: number) => T * ((0.85 + 0.07) * lumpy(rp.s, vy / H, 0) - 0.85) * 0.98
        : (vy: number) => T * (0.45 + 0.55 * rp.f) * lumpy(rp.s, vy / H, side < 0 ? 1 : 0) * 0.98;
      ivy(k, rp.x - k.x, rp.z - k.z, nx * side, nz * side, lip(rp.s) * hh, wall, 2 + Math.floor(k.r() * 5));
    }
    // base boulders
    if (k.r() < 0.12) {
      const side = mesa ? 1 : k.r() < 0.5 ? 1 : -1;
      const uu = T * (mesa ? 0.32 : 1.12) * side;
      const r = k.rand(0.35, 0.6);
      k.blob(r, r * 0.75, r, [rp.x - k.x + nx * uu, r * 0.4, rp.z - k.z + nz * uu], jitterCol(ROCK_MID, 0.03, k.r), ROCK_BOT, [0, k.rand(0, 6), 0], 7);
    }
  }
  return cols;
}

/**
 * Arched rocky cave entrance set into a grassy hillside. Opening faces local -Z.
 * `entrance` is the trigger point just inside the dark mouth (walk into it to enter).
 */
export function addCaveMouth(b: Batch, x: number, z: number, rotY: number, o: PropOpts = {}): { colliders: Collider[]; entrance: Vector3 } {
  const k = new Kit(b, x, z, { ...o, rotY });
  // hillside plateau behind the mouth
  const poly: [number, number][] = [
    [-4.2, 0.4],
    [-2.0, 0.25],
    [0, 0.55],
    [2.0, 0.25],
    [4.2, 0.4],
    [5.0, 2.8],
    [3.8, 5.4],
    [0, 6.2],
    [-3.8, 5.4],
    [-5.0, 2.8],
  ];
  addMesa(
    b,
    poly.map(([px, pz]) => [k.wx(px, pz), k.wz(px, pz)] as [number, number]),
    3.4 * k.s,
    { y: k.y, seed: k.r() * 1e9, leaves: k.leaves, glow: k.glow, thickness: 1.15 * k.s },
  );
  // dark void (layered for depth)
  k.put(disc(k.scene, 1.6, 0.1, { color: "#3a2a48" }, 22), [0, 0.0, -0.02], [Math.PI / 2, 0, 0], [1, 1, 1.32]);
  k.put(disc(k.scene, 1.3, 0.1, { color: "#2a1d36" }, 20), [0, 0.0, 0.1], [Math.PI / 2, 0, 0], [1, 1, 1.32]);
  k.put(disc(k.scene, 0.95, 0.1, { color: "#1d1426" }, 18), [0, 0.0, 0.2], [Math.PI / 2, 0, 0], [1, 1, 1.32]);
  // floor lip
  k.blob(1.4, 0.06, 0.45, [0, 0.02, -0.2], "#6e5a86", "#4d3d62", ZERO, 8);
  // arch stones
  const nA = 9;
  for (let i = 0; i < nA; i++) {
    const a = Math.PI * (i / (nA - 1));
    const R = 1.75;
    const r = i === Math.floor(nA / 2) ? 0.56 : k.rand(0.44, 0.52);
    k.blob(r, r * 0.92, r * 0.75, [Math.cos(a) * R, Math.sin(a) * R * 1.3 + 0.05, -0.15], jitterCol(k.pick(["#e3d9f2", "#ddd0ef", "#eadff3", "#f1dde8"]), 0.02, k.r), "#b9a8d6", [0, 0, a], 8);
  }
  // keystone heart
  heart(k, [0, 1.75 * 1.3 + 0.08, -0.62], 0.34, "#f7a0b8");
  // hanging vines from the arch
  for (let i = 0; i < 6; i++) {
    const vx = -1.1 + (i / 5) * 2.2 + k.rand(-0.1, 0.1);
    const topY = Math.sqrt(Math.max(0, 1.75 * 1.75 - vx * vx)) * 1.3 - 0.3;
    const len = 2 + Math.floor(k.r() * 4);
    for (let j = 0; j < len; j++) {
      const sd = j % 2 ? 1 : -1;
      k.blob(0.1, 0.08, 0.03, [vx + sd * 0.05 + Math.sin(j * 1.7 + i) * 0.03, topY - j * 0.17, -0.5], jitterCol(j % 3 ? "leaf" : "leafLight", 0.03, k.r), "leafDeep", [0, 0, sd * 0.6], 5);
    }
    if (k.r() < 0.5) k.ball(0.05, [vx, topY - len * 0.17 + 0.03, -0.55], k.pick(["pink", "lilac", "butter"]), undefined, 4);
  }
  // crystals flanking
  addCrystal(b, k.wx(-2.6, -0.6), k.wz(-2.6, -0.6), { scale: 0.75 * k.s, y: k.y, hue: "lavender", glow: k.glow, rotY: rotY + 0.3 });
  addCrystal(b, k.wx(2.5, -0.7), k.wz(2.5, -0.7), { scale: 0.55 * k.s, y: k.y, hue: "pink", glow: k.glow, rotY: rotY - 0.4 });
  // rocks & tufts at feet
  k.blob(0.4, 0.26, 0.36, [-1.9, 0.1, -0.75], "#d9cdef", ROCK_BOT, ZERO, 7);
  addMushroom(b, k.wx(1.5, -1.0), k.wz(1.5, -1.0), { y: k.y, scale: 0.8 * k.s, color: "#c6a4f0" });
  const colliders: Collider[] = [
    k.circle(0, 3.4, 3.1),
    k.circle(-3.3, 2.0, 2.0),
    k.circle(3.3, 2.0, 2.0),
    k.circle(-1.85, -0.1, 0.5),
    k.circle(1.85, -0.1, 0.5),
    k.circle(-2.6, -0.6, 0.5),
    k.circle(2.5, -0.7, 0.42),
  ];
  return { colliders, entrance: k.w(0, 0, -0.75) };
}

/* ================================================================== */
/* Gate (standalone so it can be hidden / opened)                      */
/* ================================================================== */

export interface GateResult {
  root: TransformNode;
  /** blocks the opening; drop it from your collider list when the gate opens */
  blocker: Collider[];
  /** the two posts (always solid) */
  posts: Collider[];
  /** 0 = closed, 1 = doors swung fully open (away from -Z) */
  setOpen(f: number): void;
  dispose(): void;
}

/** Cute wooden arch gate with a heart sign; opening spans local X (width ≈ 2.8 m), front faces -Z. */
export function addGate(scene: Scene, x: number, z: number, o: PropOpts & { width?: number } = {}): GateResult {
  const W = o.width ?? 2.8;
  const root = new TransformNode("gate", scene);
  root.position.set(x, o.y ?? 0, z);
  root.rotation.y = o.rotY ?? 0;
  if (o.scale) root.scaling.setAll(o.scale);
  const fb = new Batch(scene, "gateFrame");
  const k = new Kit(fb, 0, 0, { seed: o.seed ?? hashSeed(x, z) });
  const hx = W / 2 + 0.12;
  for (const sx of [-1, 1]) {
    k.put(rbox(scene, 0.3, 2.3, 0.3, { color: "wood", bottom: "woodDeep" }, 0.08, 2), [sx * hx, 1.15, 0]);
    k.ball(0.17, [sx * hx, 2.36, 0], "pink", "pinkDeep", 8);
    k.blob(0.3, 0.12, 0.3, [sx * hx, 0.05, 0], "leaf", "leafDeep", ZERO, 6);
  }
  const path: Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = Math.PI * t;
    path.push(new Vector3(-Math.cos(a) * hx, 2.15 + Math.sin(a) * 0.7, 0));
  }
  k.put(tube(scene, path, 0.11, "woodLight", 8), ZERO);
  // flowery vine along the arch
  for (let i = 1; i < 16; i++) {
    const p = path[i];
    k.blob(0.12, 0.09, 0.1, [p.x, p.y + 0.06, -0.06], jitterCol(i % 2 ? "leaf" : "leafLight", 0.03, k.r), undefined, [0, 0, k.rand(0, 3)], 5);
    if (i % 3 === 1) blossomDot(k, [p.x, p.y + 0.1, -0.16], [0, 0.4, -1], 0.08, k.pick(["pink", "butter", "white", "lilac"]), "butterDeep");
  }
  // hanging heart sign
  for (const sx of [-1, 1]) k.put(softCyl(scene, 0.45, 0.012, 0.012, { color: "woodDeep" }, 0.005, 4), [sx * 0.22, 2.4, -0.02]);
  k.put(rbox(scene, 0.85, 0.48, 0.08, { color: "cream", bottom: "#f3e3cf" }, 0.08, 2), [0, 2.25, -0.03]);
  heart(k, [0, 2.27, -0.09], 0.3, "#f48aa6");
  const frame = fb.build({ outline: 0.04 })!;
  frame.parent = root;
  // doors
  const doors: TransformNode[] = [];
  const dw = W / 2 - 0.02;
  for (const sx of [-1, 1]) {
    const pivot = new TransformNode("gateHinge", scene);
    pivot.parent = root;
    pivot.position.set(sx * (W / 2), 0, 0);
    const db = new Batch(scene, "gateDoor");
    const dk2 = new Kit(db, 0, 0, { seed: 7 + sx });
    const np = 5;
    for (let j = 0; j < np; j++) {
      const px = -sx * (0.12 + ((j + 0.5) * (dw - 0.16)) / np);
      const h = 1.05 + 0.18 * Math.sin(((j + 0.5) / np) * Math.PI * 0.5 + (sx > 0 ? 0 : Math.PI * 0.5)) * 0;
      const hh = sx < 0 ? 0.95 + 0.25 * ((j + 0.5) / np) : 0.95 + 0.25 * (1 - (j + 0.5) / np);
      void h;
      dk2.put(rbox(scene, 0.17, hh, 0.06, { color: "cream", bottom: "#efe2cf" }, 0.03, 1), [px, 0.12 + hh / 2, 0]);
      dk2.put(elb(scene, 0.085, 0.085, 0.03, { color: "cream" }, 6), [px, 0.12 + hh, 0]);
    }
    for (const ry of [0.42, 0.85]) dk2.put(rbox(scene, dw - 0.1, 0.1, 0.06, { color: "woodLight", bottom: "wood" }, 0.03, 1), [-sx * (dw / 2 + 0.02), ry, 0.06]);
    const door = db.build({ outline: 0.035 })!;
    door.parent = pivot;
    doors.push(pivot);
  }
  const s = o.scale ?? 1;
  const kw = new Kit(new Batch(scene), x, z, { rotY: o.rotY, scale: s });
  return {
    root,
    blocker: kw.segment(-W / 2, 0, W / 2, 0, 0.2),
    posts: [kw.circle(-hx, 0, 0.3), kw.circle(hx, 0, 0.3)],
    setOpen(f: number) {
      const a = smooth01(f) * 1.85;
      doors[0].rotation.y = a;
      doors[1].rotation.y = -a;
    },
    dispose() {
      root.dispose(false, false);
    },
  };
}

/* ================================================================== */
/* Grass field & motes (thin instances)                                */
/* ================================================================== */

function grassTuftData(r: () => number): VertexData {
  const pos: number[] = [];
  const nrm: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  const base = col("#9fd884"),
    tipA = col("#c8efa4"),
    tipB = col("#d9f5b4");
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * TAU + r() * 0.6;
    const d = 0.03 + r() * 0.05;
    const bx = Math.cos(a) * d,
      bz = Math.sin(a) * d;
    const h = 0.2 + r() * 0.16;
    const w = 0.05 + r() * 0.02;
    const lean = 0.06 + r() * 0.08;
    // blade faces perpendicular to its radial direction
    const px = -Math.sin(a),
      pz = Math.cos(a);
    const lx = Math.cos(a) * lean,
      lz = Math.sin(a) * lean;
    const v0 = pos.length / 3;
    const pts: [number, number, number][] = [
      [bx - px * w, 0, bz - pz * w],
      [bx + px * w, 0, bz + pz * w],
      [bx - px * w * 0.6 + lx * 0.5, h * 0.55, bz - pz * w * 0.6 + lz * 0.5],
      [bx + px * w * 0.6 + lx * 0.5, h * 0.55, bz + pz * w * 0.6 + lz * 0.5],
      [bx + lx, h, bz + lz],
    ];
    const tip = r() < 0.5 ? tipA : tipB;
    pts.forEach(([x, y, z], j) => {
      pos.push(x, y, z);
      // soft up-facing normals → evenly lit, sticker-flat grass
      nrm.push(Math.cos(a) * 0.35, 0.93, Math.sin(a) * 0.35);
      const t = j < 2 ? 0 : j < 4 ? 0.55 : 1;
      const c = Color3.Lerp(base, tip, t);
      colr.push(c.r, c.g, c.b, 1);
    });
    idx.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3, v0 + 2, v0 + 4, v0 + 3);
  }
  const vd = new VertexData();
  vd.positions = pos;
  vd.normals = nrm;
  vd.colors = colr;
  vd.indices = idx;
  return vd;
}

function tinyFlowerData(): VertexData {
  // stem blade + 5-petal star head + centre, all flat-ish
  const pos: number[] = [];
  const nrm: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  const add = (x: number, y: number, z: number, c: Color3) => {
    pos.push(x, y, z);
    nrm.push(0, 1, 0);
    colr.push(c.r, c.g, c.b, 1);
    return pos.length / 3 - 1;
  };
  const g = col("#86c97a");
  const h = 0.3;
  const s0 = add(-0.012, 0, 0, g),
    s1 = add(0.012, 0, 0, g),
    s2 = add(0, h, 0, g);
  idx.push(s0, s2, s1);
  const s3 = add(0, 0, -0.012, g),
    s4 = add(0, 0, 0.012, g);
  idx.push(s3, s2, s4);
  const white = col("#ffffff"),
    centre = col("#ffe27a");
  const c0 = add(0, h + 0.012, 0, centre);
  const P = 5;
  const ring: number[] = [];
  for (let i = 0; i < P * 2; i++) {
    const a = (i / (P * 2)) * TAU;
    const rr = i % 2 === 0 ? 0.075 : 0.032;
    ring.push(add(Math.cos(a) * rr, h + (i % 2 === 0 ? 0.008 : 0.004), Math.sin(a) * rr, white));
  }
  for (let i = 0; i < ring.length; i++) idx.push(c0, ring[(i + 1) % ring.length], ring[i]);
  const vd = new VertexData();
  vd.positions = pos;
  vd.normals = nrm;
  vd.colors = colr;
  vd.indices = idx;
  return vd;
}

/**
 * Thin-instanced grass tufts (+ ~8% tiny flowers as a child mesh). One draw call each.
 * density = tufts per m² (0.4–1 recommended on tablets). `exclude(x,z)` → true to skip (paths, water, buildings).
 * Material: dedicated toon with wind 0.22, double-sided, no outline, receives shadows.
 */
export function makeGrassField(
  scene: Scene,
  area: { minX: number; maxX: number; minZ: number; maxZ: number },
  density: number,
  exclude: (x: number, z: number) => boolean,
  seed = 1234,
  y = 0,
): Mesh {
  const r = rng(seed);
  const grass = new Mesh("grassField", scene);
  grassTuftData(rng(seed + 1)).applyToMesh(grass);
  const mat = toonMat(scene, { name: "grassFieldMat", wind: 0.22, rim: 0.1, shade: 0.82 });
  mat.backFaceCulling = false;
  const fl = new Mesh("grassFlowers", scene);
  tinyFlowerData().applyToMesh(fl);
  const fmat = toonMat(scene, { name: "grassFlowerMat", wind: 0.22, rim: 0.12, shade: 0.85 });
  fmat.backFaceCulling = false;

  const W = area.maxX - area.minX,
    D = area.maxZ - area.minZ;
  const n = Math.round(W * D * density);
  const gm: number[] = [],
    gc: number[] = [],
    fm: number[] = [],
    fc: number[] = [];
  const fpal = ["#ffd0e0", "#ffffff", "#fff0a8", "#e6d6ff", "#cfe8ff", "#ffc6b0"].map((h) => col(h));
  // jittered clumps: tufts cluster a little for a natural look
  for (let i = 0; i < n; i++) {
    const px = area.minX + r() * W,
      pz = area.minZ + r() * D;
    if (exclude(px, pz)) continue;
    const s = 0.75 + r() * 0.6;
    const a = r() * TAU;
    const c = Math.cos(a) * s,
      sn = Math.sin(a) * s;
    if (r() < 0.085) {
      const fs = 0.8 + r() * 0.5;
      fm.push(fs, 0, 0, 0, 0, fs, 0, 0, 0, 0, fs, 0, px, y, pz, 1);
      const fcol = fpal[Math.floor(r() * fpal.length)];
      fc.push(fcol.r, fcol.g, fcol.b, 1);
      continue;
    }
    // rotation about Y (left-handed: [c,0,-s; 0,1,0; s,0,c])
    gm.push(c, 0, -sn, 0, 0, s * (0.85 + r() * 0.4), 0, 0, sn, 0, c, 0, px, y, pz, 1);
    const tint = 0.93 + r() * 0.1;
    gc.push(tint, tint * (0.98 + r() * 0.04), tint * (0.96 + r() * 0.06), 1);
  }
  grass.thinInstanceSetBuffer("matrix", new Float32Array(gm), 16, true);
  grass.thinInstanceSetBuffer("color", new Float32Array(gc), 4, true);
  grass.thinInstanceRefreshBoundingInfo(false);
  finishMesh(grass, scene, { material: mat, outline: false, castShadow: false, receiveShadow: true });
  grass.isPickable = false;
  if (fm.length) {
    fl.thinInstanceSetBuffer("matrix", new Float32Array(fm), 16, true);
    fl.thinInstanceSetBuffer("color", new Float32Array(fc), 4, true);
    fl.thinInstanceRefreshBoundingInfo(false);
    finishMesh(fl, scene, { material: fmat, outline: false, castShadow: false, receiveShadow: true });
    fl.isPickable = false;
    fl.parent = grass;
  } else fl.dispose();
  return grass;
}

export interface Motes {
  mesh: Mesh;
  /** call per frame with elapsed seconds */
  update(t: number): void;
}

/**
 * Floating glowing motes / fireflies (thin instances, unlit glow material).
 * Points drift around their home positions inside `area` between y0 and y1.
 */
export function makeMotes(
  scene: Scene,
  area: { minX: number; maxX: number; minZ: number; maxZ: number },
  count: number,
  o: { y0?: number; y1?: number; size?: number; colors?: string[]; seed?: number; accept?: (x: number, z: number) => boolean } = {},
): Motes {
  const r = rng(o.seed ?? 99);
  const mesh = sph(scene, 1, { color: "#ffffff", name: "motes" }, 4);
  const y0 = o.y0 ?? 0.4,
    y1 = o.y1 ?? 2.4;
  const size = o.size ?? 0.06;
  const pal = (o.colors ?? ["#fff6c8", "#f6e0ff", "#d8f6ff", "#ffe0f0"]).map((h) => col(h));
  const homes: number[] = [];
  let tries = 0;
  while (homes.length / 5 < count && tries++ < count * 30) {
    const x = area.minX + r() * (area.maxX - area.minX),
      z = area.minZ + r() * (area.maxZ - area.minZ);
    if (o.accept && !o.accept(x, z)) continue;
    homes.push(x, y0 + r() * (y1 - y0), z, r() * TAU, 0.5 + r() * 0.8);
  }
  const n = homes.length / 5;
  const mats = new Float32Array(n * 16);
  const cols = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = pal[i % pal.length];
    cols.set([c.r, c.g, c.b, 1], i * 4);
  }
  const write = (t: number) => {
    for (let i = 0; i < n; i++) {
      const hx = homes[i * 5],
        hy = homes[i * 5 + 1],
        hz = homes[i * 5 + 2],
        ph = homes[i * 5 + 3],
        sp = homes[i * 5 + 4];
      const tw = 0.55 + 0.45 * Math.sin(t * 2.3 * sp + ph * 3);
      const s = size * tw;
      const o16 = i * 16;
      mats[o16] = s;
      mats[o16 + 5] = s;
      mats[o16 + 10] = s;
      mats[o16 + 15] = 1;
      mats[o16 + 12] = hx + Math.sin(t * 0.5 * sp + ph) * 0.6;
      mats[o16 + 13] = hy + Math.sin(t * 0.8 * sp + ph * 2) * 0.35;
      mats[o16 + 14] = hz + Math.cos(t * 0.45 * sp + ph * 1.3) * 0.6;
    }
  };
  write(0);
  mesh.thinInstanceSetBuffer("matrix", mats, 16, false);
  mesh.thinInstanceSetBuffer("color", cols, 4, true);
  mesh.alwaysSelectAsActiveMesh = true;
  finishMesh(mesh, scene, { material: toonMat(scene, { name: "moteGlow", emissive: "#ffffff", rim: 0 }), outline: false, castShadow: false, receiveShadow: false });
  mesh.isPickable = false;
  return {
    mesh,
    update(t: number) {
      write(t);
      mesh.thinInstanceBufferUpdated("matrix");
    },
  };
}
