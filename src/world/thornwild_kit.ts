/**
 * Thornwild prop kit — small procedural builders shared by the Thornwild zone and its overworld gate.
 * Everything adds shapes into caller-owned Batches (merged later) unless it returns its own Mesh.
 * Coordinates passed in are WORLD coordinates.
 */
import { Mesh, MeshBuilder, VertexData, VertexBuffer, Vector3, Quaternion, Matrix, Color3, type Scene } from "@babylonjs/core";
import { Batch, lathe, softCyl, paint, fixWinding, type ColorLike, type V3 } from "../render/Shapes";
import { col, mixCol, jitterCol } from "../render/Palette";
import { elb, sph, rbox, petals } from "./props";
import type { Collider } from "../core/types";

export const TAU = Math.PI * 2;

export const smooth01 = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** Strip UVs/tangents so custom meshes merge with Shapes meshes (position / normal / color only). */
export function strip(m: Mesh): Mesh {
  for (const k of [VertexBuffer.UVKind, VertexBuffer.UV2Kind, VertexBuffer.TangentKind]) {
    if (m.isVerticesDataPresent(k)) m.removeVerticesData(k);
  }
  return m;
}

/** Euler that rotates local +Y onto direction n. */
export function alignY(nx: number, ny: number, nz: number): V3 {
  const l = Math.hypot(nx, ny, nz) || 1;
  return [Math.acos(Math.max(-1, Math.min(1, ny / l))), Math.atan2(nx, nz), 0];
}

export function quatY(nx: number, ny: number, nz: number, spin = 0): Quaternion {
  const [a, b] = alignY(nx, ny, nz);
  return Quaternion.FromEulerAngles(a, b, 0).multiply(Quaternion.FromEulerAngles(0, spin, 0));
}

/** Tapered tube along a path; radius(t) with t = 0..1 along the path. Vertex-painted by height. */
export function tubeMesh(scene: Scene, path: Vector3[], radius: (t: number) => number, top: ColorLike, bottom?: ColorLike, tess = 6): Mesh {
  const n = path.length;
  const m = MeshBuilder.CreateTube("twTube", { path, radiusFunction: (i: number) => Math.max(0.004, radius(i / (n - 1))), tessellation: tess, cap: Mesh.CAP_ALL }, scene);
  strip(m);
  paint(m, top, bottom);
  return m;
}

export function at<T extends Mesh>(m: T, x: number, y: number, z: number, rot?: V3): T {
  m.position.set(x, y, z);
  if (rot) m.rotationQuaternion = Quaternion.FromEulerAngles(rot[0], rot[1], rot[2]);
  return m;
}

/** Custom mesh from raw arrays (winding fixed against reference normals). */
export function rawMesh(scene: Scene, name: string, pos: number[], ref: number[], idx: number[], colors: number[]): Mesh {
  fixWinding(pos, idx, ref);
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = idx;
  const nrm: number[] = [];
  VertexData.ComputeNormals(pos, idx, nrm);
  vd.normals = nrm;
  vd.colors = colors;
  const m = new Mesh(name, scene);
  vd.applyToMesh(m);
  return m;
}

/* ------------------------------------------------------------------ */
/* Local placer (rotY + offset), like props' Kit                       */
/* ------------------------------------------------------------------ */

export class Placer {
  c: number;
  s: number;
  constructor(
    public scene: Scene,
    public x: number,
    public y: number,
    public z: number,
    public rot = 0,
  ) {
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
  }
  wx(lx: number, lz: number) {
    return this.x + lx * this.c + lz * this.s;
  }
  wz(lx: number, lz: number) {
    return this.z - lx * this.s + lz * this.c;
  }
  put<T extends Mesh>(b: Batch, m: T, p: V3, rot: V3 = [0, 0, 0], scl: V3 | number = 1): T {
    m.position.set(this.wx(p[0], p[2]), this.y + p[1], this.wz(p[0], p[2]));
    m.rotationQuaternion = Quaternion.FromEulerAngles(rot[0], rot[1] + this.rot, rot[2]);
    if (typeof scl === "number") m.scaling.setAll(scl);
    else m.scaling.set(scl[0], scl[1], scl[2]);
    b.add(m);
    return m;
  }
  circle(lx: number, lz: number, r: number): Collider {
    return { kind: "circle", x: this.wx(lx, lz), z: this.wz(lx, lz), r };
  }
}

/* ------------------------------------------------------------------ */
/* Thin-instance sets (thorns that retract, flowers that pop, mist…)    */
/* ------------------------------------------------------------------ */

export interface InstItem {
  x: number;
  y: number;
  z: number;
  q: Quaternion;
  s: number;
  /** extra non-uniform y scale */
  sy?: number;
  c?: Color3;
  /** stagger / phase 0..1 */
  k: number;
}

const _m = new Matrix();
const _s = new Vector3();
const _p = new Vector3();

export class InstSet {
  mats: Float32Array;
  constructor(
    public mesh: Mesh,
    public items: InstItem[],
    colors: boolean,
  ) {
    this.mats = new Float32Array(Math.max(1, items.length) * 16);
    this.write(() => 1);
    mesh.thinInstanceSetBuffer("matrix", this.mats, 16, false);
    if (colors) {
      const c = new Float32Array(Math.max(1, items.length) * 4);
      items.forEach((it, i) => {
        const cc = it.c ?? Color3.White();
        c.set([cc.r, cc.g, cc.b, 1], i * 4);
      });
      mesh.thinInstanceSetBuffer("color", c, 4, true);
    }
    mesh.thinInstanceRefreshBoundingInfo(false);
  }
  /** scale(it) multiplies each instance's size; offset(it, out) may move it. */
  write(scale: (it: InstItem, i: number) => number, offset?: (it: InstItem, i: number, out: Vector3) => void) {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const k = Math.max(1e-4, scale(it, i)) * it.s;
      _s.set(k, k * (it.sy ?? 1), k);
      _p.set(it.x, it.y, it.z);
      if (offset) offset(it, i, _p);
      Matrix.ComposeToRef(_s, it.q, _p, _m);
      _m.copyToArray(this.mats, i * 16);
    }
  }
  apply(scale: (it: InstItem, i: number) => number, offset?: (it: InstItem, i: number, out: Vector3) => void) {
    this.write(scale, offset);
    this.mesh.thinInstanceBufferUpdated("matrix");
  }
}

/** Rounded bramble thorn, base at origin pointing +Y (~0.28 tall). */
export function thornMesh(scene: Scene, name = "thorn"): Mesh {
  const m = lathe(
    scene,
    [
      [0, -0.07],
      [0.088, -0.07],
      [0.085, 0.03],
      [0.056, 0.14],
      [0.03, 0.23],
      [0.012, 0.268],
      [0, 0.275],
    ],
    { color: "#fff6fb", bottom: "#d3b2de", name },
    6,
  );
  return m;
}

/** Pastel flower head (white petals, butter centre) facing +Y; tint with instance colour. */
export function flowerMesh(scene: Scene): Mesh {
  const p = petals(scene, 0.16, 5, { color: "#ffffff" }, 0.035, 0.55);
  p.position.y = 0.06;
  const c = sph(scene, 0.06, { color: "#ffe9a0" }, 5);
  c.position.y = 0.1;
  c.scaling.y = 0.6;
  const st = elb(scene, 0.03, 0.06, 0.03, { color: "#9fe08f" }, 4);
  st.position.y = 0.02;
  const lf = elb(scene, 0.09, 0.015, 0.045, { color: "#a9e695" }, 5);
  lf.position.set(0.09, 0.02, 0);
  lf.rotation.z = 0.25;
  const m = Mesh.MergeMeshes([p, c, st, lf], true, true, undefined, false, false)!;
  m.name = "thornFlower";
  return m;
}

/** Little butterfly (wings white, tint per instance), body along +Z. */
export function butterflyMesh(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  for (const sx of [-1, 1]) {
    const w1 = elb(scene, 0.13, 0.012, 0.1, { color: "#ffffff" }, 5);
    w1.position.set(sx * 0.12, 0, 0.04);
    w1.rotation.y = sx * 0.35;
    const w2 = elb(scene, 0.09, 0.012, 0.075, { color: "#fff4fa" }, 5);
    w2.position.set(sx * 0.085, -0.005, -0.08);
    w2.rotation.y = -sx * 0.4;
    parts.push(w1, w2);
  }
  parts.push(elb(scene, 0.025, 0.025, 0.11, { color: "#6d5a78" }, 4));
  const m = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
  m.name = "thornButterfly";
  return m;
}

/* ------------------------------------------------------------------ */
/* Twisted spooky tree                                                 */
/* ------------------------------------------------------------------ */

export interface TreeTargets {
  bark: Batch;
  canopy: Batch[];
  glow: Batch;
}

/**
 * Purple-grey twisted tree with curly branch tips, droopy canopy puffs and a couple of glowing lantern-berries.
 * Bark / canopy vertex colours are light neutrals: the batches' materials carry the tint (so cleanse can recolour).
 */
export function addTwistedTree(scene: Scene, t: TreeTargets, x: number, y: number, z: number, s: number, r: () => number, maxH = 99): Collider {
  const rand = (a: number, b: number) => a + (b - a) * r();
  const H = Math.min(3.3 * s * rand(0.9, 1.15), Math.max(1.6, maxH - 1.1 * s));
  const ph = rand(0, TAU);
  const lean = rand(0.2, 0.55) * s;
  const la = rand(0, TAU);
  const trunkPts: Vector3[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    trunkPts.push(
      new Vector3(
        x + Math.sin(u * 3.0 + ph) * 0.28 * s * u + Math.cos(la) * lean * u * u,
        y + u * H - 0.05,
        z + Math.cos(u * 2.6 + ph) * 0.24 * s * u + Math.sin(la) * lean * u * u,
      ),
    );
  }
  const R0 = 0.3 * s;
  t.bark.add(tubeMesh(scene, trunkPts, (u) => R0 * (1 - 0.62 * u) * (u < 0.15 ? 1 + (0.15 - u) * 4 : 1), jitterCol("#ffffff", 0.03, r), "#b8b0c4", 7));
  // roots
  const a0 = rand(0, TAU);
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i / 3) * TAU + rand(-0.3, 0.3);
    const m = elb(scene, R0 * 0.55, R0 * 0.35, R0 * 1.15, { color: "#e6e0ee", bottom: "#a8a0b6" }, 5);
    at(m, x + Math.cos(a) * R0 * 1.25, y + 0.04, z + Math.sin(a) * R0 * 1.25, [0, Math.PI / 2 - a, 0]);
    t.bark.add(m);
  }
  const canopyB = t.canopy[Math.floor(r() * t.canopy.length) % t.canopy.length];
  const top = trunkPts[N];
  const ends: Vector3[] = [];
  const nb = 3;
  const ba0 = rand(0, TAU);
  for (let b = 0; b < nb; b++) {
    const u0 = rand(0.55, 0.85);
    const i0 = Math.min(N - 1, Math.floor(u0 * N));
    const base = trunkPts[i0];
    const a = ba0 + (b / nb) * TAU + rand(-0.4, 0.4);
    const L = rand(1.0, 1.5) * s;
    const pts: Vector3[] = [];
    const M = 6;
    for (let j = 0; j <= M; j++) {
      const u = j / M;
      const out = L * u;
      pts.push(new Vector3(base.x + Math.cos(a) * out + Math.sin(u * 4 + b) * 0.06, base.y + out * 0.55 - out * out * 0.12 / s, base.z + Math.sin(a) * out + Math.cos(u * 4 + b) * 0.06));
    }
    // curly tip: a little spiral hook
    const tip = pts[M];
    const curl = 0.16 * s;
    for (let j = 1; j <= 4; j++) {
      const q = (j / 4) * Math.PI * 1.3;
      pts.push(new Vector3(tip.x + Math.cos(a) * Math.sin(q) * curl, tip.y + (1 - Math.cos(q)) * curl, tip.z + Math.sin(a) * Math.sin(q) * curl));
    }
    t.bark.add(tubeMesh(scene, pts, (u) => 0.11 * s * (1 - 0.8 * u), "#f4f0f8", "#c4bccf", 5));
    ends.push(pts[M]);
  }
  // droopy canopy puffs
  const puffs: [Vector3, number][] = [[new Vector3(top.x, top.y + 0.35 * s, top.z), rand(0.95, 1.15) * s]];
  for (const e of ends) if (r() < 0.75) puffs.push([new Vector3(e.x, e.y + 0.25 * s, e.z), rand(0.6, 0.82) * s]);
  for (const [p, rr] of puffs) {
    const m = elb(scene, rr, rr * 0.72, rr, { color: jitterCol("#ffffff", 0.04, r), bottom: "#9890a8" }, 7);
    at(m, p.x, p.y, p.z, [0, rand(0, 6), 0]);
    canopyB.add(m);
  }
  // lantern-berries hanging under the canopy
  const nl = r() < 0.65 ? 2 : 1;
  for (let i = 0; i < nl; i++) {
    const [p, rr] = puffs[Math.floor(r() * puffs.length)];
    const a = rand(0, TAU);
    const hx = p.x + Math.cos(a) * rr * 0.55,
      hz = p.z + Math.sin(a) * rr * 0.55;
    const hy = p.y - rr * 0.55;
    const len = rand(0.25, 0.45) * s;
    t.bark.add(at(softCyl(scene, len, 0.012, 0.012, { color: "#d8cfe2" }, 0.004, 4), hx, hy - len, hz));
    const c = r() < 0.6 ? ["#fff0b8", "#ffb35c"] : ["#ffd8f4", "#f07ad0"];
    t.glow.add(at(elb(scene, 0.1 * s, 0.12 * s, 0.1 * s, { color: c[0], bottom: c[1] }, 6), hx, hy - len - 0.08 * s, hz));
  }
  return { kind: "circle", x, z, r: 0.42 * s };
}

/* ------------------------------------------------------------------ */
/* Glowing gloom mushrooms                                             */
/* ------------------------------------------------------------------ */

export type ShroomHue = "amber" | "magenta" | "violet";
export const SHROOM_COLS: Record<ShroomHue, [string, string]> = {
  amber: ["#ffeab0", "#ff9b52"],
  magenta: ["#ffd6f3", "#e25cc4"],
  violet: ["#efdcff", "#a070f0"],
};
export const SHROOM_LIGHT: Record<ShroomHue, string> = { amber: "#ffc27a", magenta: "#f59ae0", violet: "#c7a2ff" };

/** Cluster of glowing mushrooms; stems → main, caps & spots → glow. */
export function addGloomShroom(scene: Scene, main: Batch, glow: Batch, x: number, y: number, z: number, s: number, hue: ShroomHue, r: () => number) {
  const rand = (a: number, b: number) => a + (b - a) * r();
  const [ct, cb] = SHROOM_COLS[hue];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU),
      d = i === 0 ? 0 : rand(0.2, 0.42) * s;
    const ss = (i === 0 ? 1 : rand(0.45, 0.72)) * s;
    const px = x + Math.cos(a) * d,
      pz = z + Math.sin(a) * d;
    const h = 0.46 * ss,
      R = 0.24 * ss;
    const lx = rand(-0.18, 0.18),
      lz = rand(-0.18, 0.18);
    main.add(
      at(
        lathe(
          scene,
          [
            [0, 0],
            [0.065 * ss, 0],
            [0.05 * ss, h * 0.55],
            [0.055 * ss, h],
            [0, h],
          ],
          { color: "#f3ecf8", bottom: "#a597bf" },
          6,
        ),
        px,
        y,
        pz,
        [lx, 0, lz],
      ),
    );
    const tipV = new Vector3(0, h, 0).rotateByQuaternionToRef(Quaternion.FromEulerAngles(lx, 0, lz), new Vector3());
    const tx = px + tipV.x,
      ty = y + tipV.y,
      tz = pz + tipV.z;
    glow.add(
      at(
        lathe(
          scene,
          [
            [0, R * 0.72],
            [R * 0.6, R * 0.64],
            [R * 0.95, R * 0.28],
            [R, R * 0.04],
            [R * 0.86, -0.02],
            [0, 0.02],
          ],
          { color: ct, bottom: cb },
          9,
        ),
        tx,
        ty,
        tz,
        [lx, 0, lz],
      ),
    );
    if (i === 0) {
      for (let j = 0; j < 3; j++) {
        const sa = (j / 3) * TAU + rand(0, 1);
        const el = j === 0 ? 1.35 : 0.7;
        const nx = Math.cos(sa) * Math.cos(el),
          ny = Math.sin(el),
          nz = Math.sin(sa) * Math.cos(el);
        const sp = elb(scene, 0.045 * ss, 0.012 * ss, 0.045 * ss, { color: "#fffaf0" }, 4);
        at(sp, tx + nx * R * 0.9, ty + ny * R * 0.7, tz + nz * R * 0.9, alignY(nx, ny * 1.3, nz));
        glow.add(sp);
      }
    }
  }
}

/** Tall landmark mushroom (≈2–2.6 m). Returns its collider. */
export function addBigShroom(scene: Scene, main: Batch, glow: Batch, x: number, y: number, z: number, s: number, hue: ShroomHue, r: () => number): Collider {
  const rand = (a: number, b: number) => a + (b - a) * r();
  const h = rand(1.9, 2.4) * s;
  const lean = rand(-0.12, 0.12);
  main.add(
    at(
      lathe(
        scene,
        [
          [0, 0],
          [0.4 * s, 0],
          [0.3 * s, 0.25 * s],
          [0.21 * s, h * 0.6],
          [0.25 * s, h],
          [0, h + 0.05],
        ],
        { color: "#f1e8f8", bottom: "#9d8fba" },
        9,
      ),
      x,
      y,
      z,
      [lean, 0, 0],
    ),
  );
  const [ct, cb] = SHROOM_COLS[hue];
  const R = rand(1.0, 1.25) * s;
  const tipV = new Vector3(0, h, 0).rotateByQuaternionToRef(Quaternion.FromEulerAngles(lean, 0, 0), new Vector3());
  const cx = x + tipV.x,
    cy = y + tipV.y - 0.05,
    cz = z + tipV.z;
  glow.add(
    at(
      lathe(
        scene,
        [
          [0, R * 0.72],
          [R * 0.55, R * 0.64],
          [R * 0.92, R * 0.3],
          [R, R * 0.05],
          [R * 0.88, -0.04],
          [0, 0.02],
        ],
        { color: ct, bottom: cb },
        14,
      ),
      cx,
      cy,
      cz,
      [lean, 0, 0],
    ),
  );
  for (let j = 0; j < 7; j++) {
    const a = (j / 7) * TAU + rand(-0.2, 0.2),
      el = j === 0 ? 1.45 : rand(0.45, 0.95);
    const nx = Math.cos(a) * Math.cos(el),
      ny = Math.sin(el),
      nz = Math.sin(a) * Math.cos(el);
    const sp = elb(scene, 0.13 * s, 0.03 * s, 0.13 * s, { color: "#fffaf2" }, 5);
    at(sp, cx + nx * R * 0.95, cy + ny * R * 0.68, cz + nz * R * 0.95, alignY(nx, ny * 1.3, nz));
    glow.add(sp);
  }
  return { kind: "circle", x, z, r: 0.45 * s };
}

/* ------------------------------------------------------------------ */
/* Campfire                                                            */
/* ------------------------------------------------------------------ */

/** Stone ring + teepee logs + embers (into main/warm). Returns a separate flame mesh (unfinished, base at fire). */
export function addCampfire(scene: Scene, main: Batch, warm: Batch, x: number, y: number, z: number, r: () => number): { flame: Mesh; collider: Collider } {
  const rand = (a: number, b: number) => a + (b - a) * r();
  main.add(at(elb(scene, 0.62, 0.05, 0.62, { color: "#5a4766", bottom: "#3f3149" }, 7), x, y + 0.01, z));
  const ns = 9;
  for (let i = 0; i < ns; i++) {
    const a = (i / ns) * TAU + rand(-0.1, 0.1);
    const m = elb(scene, rand(0.2, 0.25), rand(0.13, 0.17), rand(0.17, 0.2), { color: jitterCol("#e2d8ee", 0.03, r), bottom: "#9c8fb6" }, 6);
    at(m, x + Math.cos(a) * 0.68, y + 0.08, z + Math.sin(a) * 0.68, [0, -a, 0]);
    main.add(m);
  }
  const nl = 4;
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * TAU + 0.4;
    const bx = Math.cos(a) * 0.42,
      bz = Math.sin(a) * 0.42;
    const dir: V3 = [-bx * 0.85, 0.6, -bz * 0.85];
    const L = Math.hypot(dir[0], dir[1], dir[2]);
    const log = softCyl(scene, L, 0.065, 0.085, { color: "#c99a6b", bottom: "#8f6a4a" }, 0.03, 7);
    at(log, x + bx, y + 0.02, z + bz, alignY(dir[0], dir[1], dir[2]));
    main.add(log);
  }
  for (let i = 0; i < 6; i++) {
    const a = rand(0, TAU),
      d = rand(0.1, 0.42);
    warm.add(at(elb(scene, rand(0.05, 0.08), 0.04, rand(0.05, 0.08), { color: r() < 0.5 ? "#ffb35c" : "#ff8a5c" }, 4), x + Math.cos(a) * d, y + 0.05, z + Math.sin(a) * d));
  }
  // flame: outer orange, inner butter, two licks
  const parts: Mesh[] = [];
  const flameProf = (w: number, h: number): [number, number][] => [
    [0, 0],
    [0.28 * w, 0.04 * h],
    [0.34 * w, 0.22 * h],
    [0.27 * w, 0.48 * h],
    [0.13 * w, 0.78 * h],
    [0.03 * w, 0.97 * h],
    [0, h],
  ];
  parts.push(lathe(scene, flameProf(1, 1.0), { color: "#ffd36b", bottom: "#ff7a4a" }, 9));
  const inner = lathe(scene, flameProf(0.62, 0.66), { color: "#fffbe0", bottom: "#ffe08a" }, 8);
  inner.position.set(0, 0.02, -0.08);
  parts.push(inner);
  for (const sx of [-1, 1]) {
    const lick = lathe(scene, flameProf(0.45, 0.55), { color: "#ffc35e", bottom: "#ff7a4a" }, 7);
    lick.position.set(sx * 0.2, 0.0, 0.04);
    lick.rotation.z = -sx * 0.35;
    parts.push(lick);
  }
  const flame = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
  flame.name = "thornFlame";
  flame.position.set(x, y + 0.1, z);
  return { flame, collider: { kind: "circle", x, z, r: 0.8 } };
}

/* ------------------------------------------------------------------ */
/* Icon signs (no text)                                                */
/* ------------------------------------------------------------------ */

/** Grumpy little Gloomy face icon on a board, facing local -Z at (lx, ly, lz). */
function gloomyIcon(p: Placer, b: Batch, lx: number, ly: number, lz: number, s: number) {
  const sc = p.scene;
  const dark = "#5b3f86";
  p.put(b, elb(sc, 0.17 * s, 0.14 * s, 0.035, { color: "#6e4f9c", bottom: dark }, 7), [lx, ly, lz]);
  for (const [ox, oy, rr] of [
    [-0.13, 0.08, 0.075],
    [0.0, 0.13, 0.085],
    [0.13, 0.08, 0.075],
  ] as V3[])
    p.put(b, elb(sc, rr * s, rr * s, 0.03, { color: "#6e4f9c" }, 5), [lx + ox * s, ly + oy * s, lz + 0.005]);
  for (const sx of [-1, 1]) {
    p.put(b, elb(sc, 0.04 * s, 0.05 * s, 0.015, { color: "#ffffff" }, 5), [lx + sx * 0.06 * s, ly + 0.01 * s, lz - 0.035]);
    p.put(b, elb(sc, 0.018 * s, 0.024 * s, 0.01, { color: "#2e2140" }, 4), [lx + sx * 0.055 * s, ly - 0.0 * s, lz - 0.05]);
    // grumpy brow
    p.put(b, rbox(sc, 0.07 * s, 0.018 * s, 0.015, { color: "#2e2140" }, 0.008), [lx + sx * 0.062 * s, ly + 0.07 * s, lz - 0.045], [0, 0, sx * 0.35]);
    // cheeks
    p.put(b, elb(sc, 0.022 * s, 0.015 * s, 0.008, { color: "#f39cc4" }, 4), [lx + sx * 0.11 * s, ly - 0.04 * s, lz - 0.04]);
  }
}

export type SignKind = "gloomy" | "warning" | "home";

/** Wooden signpost with icon boards (gloomy arrow, warning triangle, or home heart). Front faces local -Z. */
export function addIconSign(scene: Scene, b: Batch, x: number, y: number, z: number, rotY: number, kind: SignKind): Collider {
  const p = new Placer(scene, x, y, z, rotY);
  p.put(b, rbox(scene, 0.13, 1.45, 0.13, { color: "#c99a6b", bottom: "#8f6a4a" }, 0.05), [0, 0.72, 0.03]);
  p.put(b, elb(scene, 0.2, 0.08, 0.18, { color: "#8a7aa0", bottom: "#5e5076" }, 6), [0, 0.03, 0.03]);
  if (kind === "warning") {
    // triangle board (rounded) with a plum "!"
    const tri = softCyl(scene, 0.08, 0.5, 0.5, { color: "#fff0a8", bottom: "#f5cf6b" }, 0.04, 3);
    p.put(b, tri, [0, 1.25, -0.05], [-Math.PI / 2, 0, Math.PI / 2 + Math.PI / 6 + Math.PI / 3]);
    const rim = softCyl(scene, 0.06, 0.58, 0.58, { color: "#ef8fab", bottom: "#d97a9c" }, 0.03, 3);
    p.put(b, rim, [0, 1.25, -0.0], [-Math.PI / 2, 0, Math.PI / 2 + Math.PI / 6 + Math.PI / 3]);
    p.put(b, rbox(scene, 0.07, 0.24, 0.03, { color: "#5b3f86" }, 0.03), [0, 1.3, -0.14]);
    p.put(b, elb(scene, 0.045, 0.045, 0.02, { color: "#5b3f86" }, 5), [0, 1.12, -0.14]);
    // round board below with the gloomy face
    p.put(b, softCyl(scene, 0.07, 0.27, 0.27, { color: "#f3e6ff", bottom: "#d8c4f0" }, 0.03, 14), [0, 0.68, -0.05], [-Math.PI / 2, 0, 0]);
    gloomyIcon(p, b, 0, 0.68, -0.13, 1.05);
  } else {
    const dir = kind === "home" ? -1 : 1;
    const bc = kind === "home" ? ["#fff6e6", "#f2d7b4"] : ["#f2d7b4", "#e8c49a"];
    p.put(b, rbox(scene, 0.95, 0.42, 0.09, { color: bc[0], bottom: bc[1] }, 0.07), [dir * 0.18, 1.12, -0.06]);
    const tip = softCyl(scene, 0.09, 0.27, 0.27, { color: bc[0], bottom: bc[1] }, 0.03, 3);
    p.put(b, tip, [dir * 0.66, 1.12, -0.06], [-Math.PI / 2, 0, dir > 0 ? Math.PI / 2 + Math.PI / 6 + Math.PI : Math.PI / 2 + Math.PI / 6]);
    if (kind === "gloomy") gloomyIcon(p, b, dir * 0.12, 1.12, -0.12, 0.95);
    else {
      for (const sx of [-1, 1]) p.put(b, elb(scene, 0.07, 0.07, 0.025, { color: "#f47a9a" }, 6), [dir * 0.18 + sx * 0.055, 1.15, -0.12]);
      p.put(b, softCyl(scene, 0.03, 0.09, 0.09, { color: "#f47a9a" }, 0.01, 4), [dir * 0.18, 1.07, -0.12], [-Math.PI / 2, 0, Math.PI / 4]);
    }
  }
  p.put(b, elb(scene, 0.08, 0.08, 0.08, { color: "#f8b9cb", bottom: "#ef8fab" }, 6), [0, 1.48, 0.03]);
  return p.circle(0, 0.02, 0.28);
}

/** Cosy little A-frame tent (striped pastel canvas). Front (opening) faces local -Z. */
export function addTent(scene: Scene, b: Batch, warm: Batch, x: number, y: number, z: number, rotY: number): Collider {
  const p = new Placer(scene, x, y, z, rotY);
  const D = 1.9,
    W = 1.1,
    H = 1.35;
  const slope = Math.atan2(W, H);
  const len = Math.hypot(W, H);
  for (const sx of [-1, 1]) {
    const stripes = 3;
    for (let i = 0; i < stripes; i++) {
      const c = i % 2 ? ["#fff6e6", "#f3e3cf"] : ["#f8b9cb", "#ef8fab"];
      const pz = -D / 2 + (i + 0.5) * (D / stripes);
      p.put(b, rbox(scene, 0.07, len, D / stripes + 0.005, { color: c[0], bottom: c[1] }, 0.03), [sx * W * 0.5, H * 0.5, pz], [0, 0, sx * slope]);
    }
  }
  p.put(b, rbox(scene, 0.09, 0.09, D + 0.25, { color: "#c99a6b" }, 0.04), [0, H + 0.02, 0]);
  // dark door flap gap + little glowing lantern
  const door = rawTri(scene, W * 0.78, H * 0.82, "#6d5a78");
  p.put(b, door, [0, 0.0, -D / 2 + 0.06]);
  p.put(b, softCyl(scene, 0.9, 0.025, 0.025, { color: "#a3754d" }, 0.01, 5), [-W - 0.15, 0, -D / 2 - 0.1]);
  p.put(warm, elb(scene, 0.1, 0.13, 0.1, { color: "#fff3c0", bottom: "#ffc76b" }, 6), [-W - 0.15, 0.98, -D / 2 - 0.1]);
  p.put(b, elb(scene, 0.12, 0.04, 0.12, { color: "#ef8fab" }, 6), [-W - 0.15, 1.12, -D / 2 - 0.1]);
  return p.circle(0, 0, 1.15);
}

function rawTri(scene: Scene, w: number, h: number, c: string): Mesh {
  const cc = col(c);
  const t = 0.03;
  const pos = [-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0, -w / 2, 0, t, w / 2, 0, t, 0, h, t];
  const ref = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const idx = [0, 1, 2, 3, 5, 4];
  const colors: number[] = [];
  for (let i = 0; i < 6; i++) colors.push(cc.r, cc.g, cc.b, 1);
  return rawMesh(scene, "tentDoor", pos, ref, idx, colors);
}

export function mixHex(a: string, b: string, f: number): string {
  return mixCol(a, b, f).toHexString();
}
