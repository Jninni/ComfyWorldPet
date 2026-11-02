/**
 * Building kit: thin sugar over render/Shapes for authoring big merged static scenes.
 *
 * - Everything is authored in a local "build space" (optionally nested in temporary frames),
 *   collected into per-material Batches and merged into a handful of draw calls at the end.
 * - Final meshes are parented to the building's root TransformNode (which carries world pos/rot).
 */
import {
  Mesh,
  MeshBuilder,
  VertexData,
  VertexBuffer,
  Vector3,
  Color3,
  Quaternion,
  Matrix,
  TransformNode,
  type Scene,
  type Material,
} from "@babylonjs/core";
import { Batch, ball, blob, softBox, softCyl, cone, torus, capsule, disc, lathe, scallopRug, fixWinding, paint, finishMesh, type BuildOpts, type ColorLike } from "../../render/Shapes";
import { col } from "../../render/Palette";
import { toonMat } from "../../render/Toon";

export type V3 = [number, number, number];
export type P2 = [number, number];

export interface SO {
  rot?: V3;
  /** align local +Y to this direction (overrides rot) */
  up?: V3;
  bottom?: ColorLike;
  key?: string;
  scale?: V3 | number;
  seg?: number;
}

/* ------------------------------------------------------------------ */
/* generic mesh prep                                                    */
/* ------------------------------------------------------------------ */

function strip(m: Mesh) {
  for (const k of [VertexBuffer.UVKind, VertexBuffer.UV2Kind, VertexBuffer.TangentKind]) {
    if (m.isVerticesDataPresent(k)) m.removeVerticesData(k);
  }
}

export function quatUp(n: V3): Quaternion {
  const v = new Vector3(n[0], n[1], n[2]).normalize();
  const up = Vector3.Up();
  const d = Vector3.Dot(up, v);
  if (d > 0.9999) return Quaternion.Identity();
  if (d < -0.9999) return Quaternion.RotationAxis(Vector3.Right(), Math.PI);
  const axis = Vector3.Cross(up, v).normalize();
  return Quaternion.RotationAxis(axis, Math.acos(d));
}

function place(m: Mesh, pos: V3, color: ColorLike, o: SO) {
  strip(m);
  paint(m, color, o.bottom);
  m.position.set(pos[0], pos[1], pos[2]);
  if (o.up) m.rotationQuaternion = quatUp(o.up);
  else if (o.rot) m.rotationQuaternion = Quaternion.FromEulerAngles(o.rot[0], o.rot[1], o.rot[2]);
  if (o.scale !== undefined) {
    if (typeof o.scale === "number") m.scaling.setAll(o.scale);
    else m.scaling.set(o.scale[0], o.scale[1], o.scale[2]);
  }
}

function fromData(scene: Scene, name: string, positions: number[], indices: number[], ref: number[]): Mesh {
  fixWinding(positions, indices, ref);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  const m = new Mesh(name, scene);
  vd.applyToMesh(m);
  return m;
}

/* ------------------------------------------------------------------ */
/* 2D outlines                                                          */
/* ------------------------------------------------------------------ */

export function circlePts(r: number, n = 20, ry = r): P2[] {
  const o: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    o.push([Math.cos(a) * r, Math.sin(a) * ry]);
  }
  return o;
}

/** chubby heart, about `size` wide, centred on its area */
export function heartPts(size: number, n = 28): P2[] {
  const o: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    o.push([(x / 34) * size, ((y + 2) / 34) * size]);
  }
  return o;
}

/** chubby rounded star */
export function starPts(rOut: number, rIn: number, points = 5, n = 50): P2[] {
  const o: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const f = Math.pow((1 + Math.cos(points * a)) / 2, 1.4);
    const r = rIn + (rOut - rIn) * f;
    o.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  return o;
}

/** rect with round top: width w, total height h, bottom at y=0 */
export function archPts(w: number, h: number, n = 12): P2[] {
  const r = w / 2;
  const o: P2[] = [];
  o.push([r, 0]);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    o.push([Math.cos(a) * r, h - r + Math.sin(a) * r]);
  }
  o.push([-r, 0]);
  // a couple of points along the bottom so caps triangulate nicely
  o.push([-r / 3, 0], [r / 3, 0]);
  return o;
}

/** "U" tab: rect hanging down with round bottom; top at y=0, bottom at -h */
export function tabPts(w: number, h: number, n = 10): P2[] {
  return archPts(w, h, n).map(([x, y]) => [x, -y] as P2);
}

export function roundRectPts(w: number, h: number, r: number, n = 4): P2[] {
  const o: P2[] = [];
  const hx = w / 2 - r,
    hy = h / 2 - r;
  const corners: [number, number, number][] = [
    [hx, hy, 0],
    [-hx, hy, Math.PI / 2],
    [-hx, -hy, Math.PI],
    [hx, -hy, (Math.PI * 3) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return o;
}

/** strip of length len, height h (y from 0..h) with `count` round scallops hanging below y=0 */
export function scallopPts(len: number, h: number, count: number, n = 6): P2[] {
  const o: P2[] = [];
  const r = len / count / 2;
  o.push([len / 2, h]);
  o.push([-len / 2, h]);
  for (let c = 0; c < count; c++) {
    const cx = -len / 2 + r + c * 2 * r;
    for (let i = c === 0 ? 0 : 1; i <= n; i++) {
      const a = Math.PI + (i / n) * Math.PI;
      o.push([cx + Math.cos(a) * r, Math.sin(a) * r * 0.9]);
    }
  }
  return o;
}

export function polyPts(pts: P2[]): P2[] {
  return pts;
}

/* ------------------------------------------------------------------ */
/* puff: rounded extrusion of a 2D outline (in XY, facing -Z)           */
/* ------------------------------------------------------------------ */

export interface PuffOpts {
  bevel?: number;
  bulge?: number;
  steps?: number;
  /** collapse caps onto this segment instead of the centroid (for long strips) */
  spine?: [P2, P2];
  /** only build the front half (flat back sits on a wall) */
  front?: boolean;
}

export function puffMesh(scene: Scene, pts: P2[], depth: number, po: PuffOpts = {}): Mesh {
  const h = depth / 2;
  const b = Math.min(po.bevel ?? h, h);
  const bulge = po.bulge ?? 0;
  const S = po.steps ?? 3;
  const N = pts.length;
  let cx = 0,
    cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= N;
  cy /= N;
  const spine = po.spine;
  const q: P2[] = [];
  const dist: number[] = [];
  const dir: P2[] = [];
  for (const [x, y] of pts) {
    let qx = cx,
      qy = cy;
    if (spine) {
      const [a, bb] = spine;
      const ex = bb[0] - a[0],
        ey = bb[1] - a[1];
      const L = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / L));
      qx = a[0] + ex * t;
      qy = a[1] + ey * t;
    }
    const dx = x - qx,
      dy = y - qy;
    const d = Math.hypot(dx, dy) || 1e-5;
    q.push([qx, qy]);
    dist.push(d);
    dir.push([dx / d, dy / d]);
  }
  type Ring = { inset: number; frac: number; z: number; nz: number };
  const front: Ring[] = [];
  for (let k = 1; k <= S; k++) {
    const phi = (k / S) * (Math.PI / 2);
    front.push({ inset: b * (1 - Math.cos(phi)), frac: 0, z: h - b + b * Math.sin(phi), nz: Math.sin(phi) });
  }
  front.push({ inset: b, frac: 0.55, z: h + bulge * 0.7, nz: 1 });
  const rings: Ring[] = [];
  if (!po.front) for (let i = front.length - 1; i >= 0; i--) rings.push({ ...front[i], z: -front[i].z, nz: -front[i].nz });
  if (po.front) rings.push({ inset: 0, frac: 0, z: 0, nz: 0 });
  else if (h - b > 1e-4) rings.push({ inset: 0, frac: 0, z: -(h - b), nz: 0 });
  rings.push({ inset: 0, frac: 0, z: h - b, nz: 0 });
  rings.push(...front);

  const P: number[] = [];
  const R: number[] = [];
  const I: number[] = [];
  for (const rg of rings) {
    for (let i = 0; i < N; i++) {
      const D = Math.max(0, dist[i] - rg.inset) * (1 - rg.frac);
      const x = q[i][0] + dir[i][0] * D,
        y = q[i][1] + dir[i][1] * D;
      P.push(x, y, -rg.z); // front (+z in ring space) faces -Z
      const s = 1 - Math.abs(rg.nz);
      R.push(dir[i][0] * s, dir[i][1] * s, -rg.nz);
    }
  }
  const NR = rings.length;
  for (let r = 0; r < NR - 1; r++) {
    for (let i = 0; i < N; i++) {
      const a = r * N + i,
        bb = r * N + ((i + 1) % N),
        c = (r + 1) * N + i,
        d = (r + 1) * N + ((i + 1) % N);
      I.push(a, c, bb, bb, c, d);
    }
  }
  // caps
  const capEnds: { ring: number; z: number; sgn: number }[] = [{ ring: NR - 1, z: h + bulge, sgn: 1 }];
  if (!po.front) capEnds.push({ ring: 0, z: -(h + bulge), sgn: -1 });
  for (const ce of capEnds) {
    if (!spine) {
      const c = P.length / 3;
      P.push(cx, cy, -ce.z);
      R.push(0, 0, -ce.sgn);
      for (let i = 0; i < N; i++) I.push(c, ce.ring * N + i, ce.ring * N + ((i + 1) % N));
    } else {
      const base = P.length / 3;
      for (let i = 0; i < N; i++) {
        P.push(q[i][0], q[i][1], -ce.z);
        R.push(0, 0, -ce.sgn);
      }
      for (let i = 0; i < N; i++) {
        const a = ce.ring * N + i,
          bb = ce.ring * N + ((i + 1) % N),
          c = base + i,
          d = base + ((i + 1) % N);
        I.push(a, c, bb, bb, c, d);
      }
    }
  }
  return fromData(scene, "puff", P, I, R);
}

/** thin flat decal: front fan + short side wall (2N+1 verts), facing -Z, back at z=0 */
export function decalMesh(scene: Scene, pts: P2[], t = 0.01): Mesh {
  const N = pts.length;
  let cx = 0,
    cy = 0;
  for (const p of pts) {
    cx += p[0] / N;
    cy += p[1] / N;
  }
  const P: number[] = [];
  const R: number[] = [];
  const I: number[] = [];
  for (const [x, y] of pts) {
    P.push(x, y, 0);
    R.push(x - cx, y - cy, 0);
  }
  for (const [x, y] of pts) {
    P.push(x, y, -t);
    R.push((x - cx) * 0.2, (y - cy) * 0.2, -1);
  }
  P.push(cx, cy, -t);
  R.push(0, 0, -1);
  const c = 2 * N;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    I.push(i, j, N + i, N + i, j, N + j);
    I.push(c, N + i, N + j);
  }
  fixWinding(P, I, R);
  const vd = new VertexData();
  vd.positions = P;
  vd.indices = I;
  const nr: number[] = [];
  for (let i = 0; i < P.length / 3; i++) nr.push(0, 0, -1);
  vd.normals = nr;
  const m = new Mesh("decal", scene);
  vd.applyToMesh(m);
  return m;
}

/* ------------------------------------------------------------------ */
/* revolve with angle-dependent profile                                 */
/* ------------------------------------------------------------------ */

/** profile(a) returns [r, y] points ordered bottom-centre → top-centre (like a lathe). x=r·cos a, z=r·sin a */
export function revolveMesh(scene: Scene, profile: (a: number) => P2[], segA = 32): Mesh {
  const P: number[] = [];
  const R: number[] = [];
  const I: number[] = [];
  let M = 0;
  for (let i = 0; i < segA; i++) {
    const a = (i / segA) * Math.PI * 2;
    const pr = profile(a);
    M = pr.length;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    for (let j = 0; j < M; j++) {
      const [r, y] = pr[j];
      P.push(r * ca, y, r * sa);
      const p0 = pr[Math.max(0, j - 1)],
        p1 = pr[Math.min(M - 1, j + 1)];
      const dr = p1[0] - p0[0],
        dy = p1[1] - p0[1];
      R.push(dy * ca, -dr, dy * sa);
    }
  }
  for (let i = 0; i < segA; i++) {
    const i2 = (i + 1) % segA;
    for (let j = 0; j < M - 1; j++) {
      const a = i * M + j,
        b = i2 * M + j,
        c = i * M + j + 1,
        d = i2 * M + j + 1;
      I.push(a, b, c, c, b, d);
    }
  }
  return fromData(scene, "revolve", P, I, R);
}

/* ------------------------------------------------------------------ */
/* Kit                                                                  */
/* ------------------------------------------------------------------ */

/** outline width of the "main" key: things resting on main-outlined surfaces should sit this much higher */
export const OL = 0.035;

export const DEFAULT_KEYS: Record<string, BuildOpts> = {
  main: { outline: 0.035 },
  fine: { outline: 0.02 },
  flat: { outline: false },
  shell: { outline: 0.045, castShadow: false },
  floor: { outline: false, castShadow: false },
  glow: { outline: 0.025, emissive: "#ffe2a8", castShadow: false },
  glowSoft: { outline: 0.03, emissive: "#6e5e4c", castShadow: false },
  glass: { outline: false, emissive: "#58708a", castShadow: false },
  wall: { outline: false, castShadow: false },
  sway: { outline: 0.022, wind: 0.014 },
  fluffy: { outline: 0.03, rim: 0.45 },
};

export class Kit {
  readonly scene: Scene;
  readonly root: TransformNode;
  private batches = new Map<string, Batch>();
  private keys: Record<string, BuildOpts>;
  private frames: TransformNode[] = [];
  private stack: (TransformNode | null)[] = [null];
  private redirect: Batch | null = null;
  readonly meshes: Mesh[] = [];

  constructor(scene: Scene, root: TransformNode) {
    this.scene = scene;
    this.root = root;
    this.keys = { ...DEFAULT_KEYS };
  }

  defKey(key: string, opts: BuildOpts) {
    this.keys[key] = opts;
  }

  get parent() {
    return this.stack[this.stack.length - 1];
  }

  /** temporary frame (disposed after build). rot = Euler or a rotY number */
  frame(pos: V3, rot: V3 | number = 0, scale?: number): TransformNode {
    const n = new TransformNode("kf", this.scene);
    n.parent = this.parent;
    n.position.set(pos[0], pos[1], pos[2]);
    if (typeof rot === "number") n.rotation.y = rot;
    else n.rotationQuaternion = Quaternion.FromEulerAngles(rot[0], rot[1], rot[2]);
    if (scale !== undefined) n.scaling.setAll(scale);
    this.frames.push(n);
    return n;
  }

  /** frame from explicit axes (must be orthonormal, right-handed) */
  frameAxes(pos: V3, x: V3, y: V3, z: V3): TransformNode {
    const n = new TransformNode("kf", this.scene);
    n.parent = this.parent;
    n.position.set(pos[0], pos[1], pos[2]);
    n.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(new Vector3(...x), new Vector3(...y), new Vector3(...z));
    this.frames.push(n);
    return n;
  }

  /** run fn with shapes authored inside a frame */
  at(f: TransformNode | V3, fn: () => void, rot: V3 | number = 0) {
    const node = f instanceof TransformNode ? f : this.frame(f, rot);
    this.stack.push(node);
    try {
      fn();
    } finally {
      this.stack.pop();
    }
  }

  add<T extends Mesh>(m: T, key = "main"): T {
    m.parent = this.parent;
    if (this.redirect) this.redirect.add(m);
    else {
      let b = this.batches.get(key);
      if (!b) {
        b = new Batch(this.scene, key);
        this.batches.set(key, b);
      }
      b.add(m);
    }
    return m;
  }

  private put(m: Mesh, pos: V3, color: ColorLike, o: SO): Mesh {
    place(m, pos, color, o);
    return this.add(m, o.key ?? "main");
  }

  box(w: number, h: number, d: number, pos: V3, color: ColorLike, o: SO & { r?: number; steps?: number } = {}) {
    return this.put(softBox(this.scene, w, h, d, {}, o.r ?? Math.min(0.08, w / 4, h / 4, d / 4), o.steps ?? 2), pos, color, o);
  }
  /** plain (hard-edged) box — cheap; for un-outlined floors/tiles */
  plainBox(w: number, h: number, d: number, pos: V3, color: ColorLike, o: SO = {}) {
    const m = MeshBuilder.CreateBox("pbox", { width: w, height: h, depth: d }, this.scene);
    return this.put(m, pos, color, { key: "floor", ...o });
  }
  /** flat decal facing -Z (front at z=-t) */
  decal(pts: P2[], pos: V3, color: ColorLike, o: SO & { t?: number } = {}) {
    return this.put(decalMesh(this.scene, pts, o.t ?? 0.01), pos, color, { key: "flat", ...o });
  }
  ball(r: number, pos: V3, color: ColorLike, o: SO = {}) {
    return this.put(ball(this.scene, r, {}, o.seg ?? 8), pos, color, o);
  }
  blob(rx: number, ry: number, rz: number, pos: V3, color: ColorLike, o: SO = {}) {
    return this.put(blob(this.scene, rx, ry, rz, {}, o.seg ?? 8), pos, color, o);
  }
  /** soft cylinder standing on pos (bottom at pos.y) */
  cyl(h: number, rTop: number, rBot: number, pos: V3, color: ColorLike, o: SO & { bevel?: number } = {}) {
    return this.put(softCyl(this.scene, h, rTop, rBot, {}, o.bevel ?? Math.min(0.04, h / 3), o.seg ?? 14), pos, color, o);
  }
  /** cylinder centred on pos, axis along local Y */
  rod(len: number, r: number, pos: V3, color: ColorLike, o: SO = {}) {
    const m = softCyl(this.scene, len, r, r, {}, Math.min(r * 0.4, len / 3), o.seg ?? 8);
    m.bakeTransformIntoVertices(Matrix.Translation(0, -len / 2, 0));
    return this.put(m, pos, color, o);
  }
  cone(h: number, r: number, pos: V3, color: ColorLike, o: SO = {}) {
    return this.put(cone(this.scene, h, r, {}, o.seg ?? 12), pos, color, o);
  }
  torus(r: number, thick: number, pos: V3, color: ColorLike, o: SO = {}) {
    return this.put(torus(this.scene, r, thick, {}, o.seg ?? 16), pos, color, o);
  }
  capsule(h: number, r: number, pos: V3, color: ColorLike, o: SO = {}) {
    const m = MeshBuilder.CreateCapsule("cap", { height: h, radius: r, tessellation: o.seg ?? 10, subdivisions: 1, capSubdivisions: 4 }, this.scene);
    return this.put(m, pos, color, o);
  }
  disc(r: number, thick: number, pos: V3, color: ColorLike, o: SO = {}) {
    return this.put(disc(this.scene, r, thick, {}, o.seg ?? 18), pos, color, o);
  }
  lathe(profile: P2[], pos: V3, color: ColorLike, o: SO = {}) {
    return this.put(lathe(this.scene, profile, {}, o.seg ?? 14), pos, color, o);
  }
  rug(r: number, bumps: number, pos: V3, color: ColorLike, o: SO & { thick?: number } = {}) {
    return this.put(scallopRug(this.scene, r, bumps, {}, o.thick ?? 0.05), pos, color, o);
  }
  puff(pts: P2[], depth: number, pos: V3, color: ColorLike, o: SO & PuffOpts = {}) {
    return this.put(puffMesh(this.scene, pts, depth, o), pos, color, o);
  }
  revolve(profile: (a: number) => P2[], pos: V3, color: ColorLike, o: SO & { segA?: number } = {}) {
    return this.put(revolveMesh(this.scene, profile, o.segA ?? 32), pos, color, o);
  }
  tube(path: V3[], r: number, color: ColorLike, o: SO & { tess?: number } = {}) {
    const m = MeshBuilder.CreateTube("tube", { path: path.map((p) => new Vector3(...p)), radius: r, tessellation: o.tess ?? 6, cap: Mesh.CAP_ALL }, this.scene);
    return this.put(m, [0, 0, 0], color, o);
  }
  /** paint a mesh with a per-vertex colour function (local coords) */
  paintFn(m: Mesh, fn: (x: number, y: number, z: number) => Color3) {
    const pos = m.getVerticesData(VertexBuffer.PositionKind)!;
    const n = pos.length / 3;
    const c = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const cc = fn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      c[i * 4] = cc.r;
      c[i * 4 + 1] = cc.g;
      c[i * 4 + 2] = cc.b;
      c[i * 4 + 3] = 1;
    }
    m.setVerticesData(VertexBuffer.ColorKind, c, false, 4);
    return m;
  }

  /** Build a separately-animatable mesh from whatever fn() adds. Pivot (build-space) is set if given. */
  anim(name: string, opts: BuildOpts, fn: () => void, pivot?: V3): Mesh | null {
    const prev = this.redirect;
    const b = new Batch(this.scene, name);
    this.redirect = b;
    try {
      fn();
    } finally {
      this.redirect = prev;
    }
    this.syncFrames();
    for (const m of b.meshes) m.computeWorldMatrix(true);
    const m = b.build(opts);
    if (!m) return null;
    m.parent = this.root;
    if (pivot) m.setPivotPoint(new Vector3(...pivot));
    this.meshes.push(m);
    return m;
  }

  /** build all batches and clean up temporary frames */
  private syncFrames() {
    for (const f of this.frames) f.computeWorldMatrix(true);
  }

  build(): Mesh[] {
    this.syncFrames();
    for (const [key, b] of this.batches) {
      for (const m of b.meshes) m.computeWorldMatrix(true);
      const m = b.build(this.keys[key] ?? DEFAULT_KEYS.main);
      if (m) {
        m.parent = this.root;
        m.isPickable = false;
        this.meshes.push(m);
      }
    }
    this.batches.clear();
    for (const f of this.frames) f.dispose();
    this.frames = [];
    return this.meshes;
  }
}

/** a unique material (so it can be animated without touching shared cached materials) */
export function uniqueMat(scene: Scene, name: string, opts: { emissive?: string; wind?: number; rim?: number } = {}): Material {
  return toonMat(scene, { ...opts, name });
}

export { col, finishMesh };
