import {
  Mesh,
  MeshBuilder,
  VertexData,
  VertexBuffer,
  Vector3,
  Color3,
  Quaternion,
  TransformNode,
  type Scene,
  type Material,
} from "@babylonjs/core";
import { col, type PalKey } from "./Palette";
import { toonMat, type ToonOpts } from "./Toon";

export type ColorLike = PalKey | string | Color3;
export type V3 = [number, number, number];

export interface ShapeOpts {
  pos?: V3;
  rot?: V3;
  scale?: V3 | number;
  color?: ColorLike;
  /** vertical gradient: bottom colour (color is top). */
  bottom?: ColorLike;
  parent?: TransformNode | null;
  name?: string;
}

/* ------------------------------------------------------------------ */
/* Vertex colour painting                                              */
/* ------------------------------------------------------------------ */

export function paint(mesh: Mesh, top: ColorLike, bottom?: ColorLike): Mesh {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const n = pos.length / 3;
  const colors = new Float32Array(n * 4);
  const ct = col(top);
  const cb = bottom ? col(bottom) : ct;
  let minY = Infinity,
    maxY = -Infinity;
  if (bottom) {
    for (let i = 0; i < n; i++) {
      const y = pos[i * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const span = Math.max(1e-5, maxY - minY);
  for (let i = 0; i < n; i++) {
    let c = ct;
    if (bottom) {
      const t = (pos[i * 3 + 1] - minY) / span;
      const s = t * t * (3 - 2 * t);
      colors[i * 4] = cb.r + (ct.r - cb.r) * s;
      colors[i * 4 + 1] = cb.g + (ct.g - cb.g) * s;
      colors[i * 4 + 2] = cb.b + (ct.b - cb.b) * s;
    } else {
      colors[i * 4] = c.r;
      colors[i * 4 + 1] = c.g;
      colors[i * 4 + 2] = c.b;
    }
    colors[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  return mesh;
}

function applyOpts(mesh: Mesh, o: ShapeOpts): Mesh {
  // keep a uniform attribute set (position/normal/color) so anything can be merged
  for (const k of [VertexBuffer.UVKind, VertexBuffer.UV2Kind, VertexBuffer.TangentKind]) {
    if (mesh.isVerticesDataPresent(k)) mesh.removeVerticesData(k);
  }
  if (o.color !== undefined) paint(mesh, o.color, o.bottom);
  else if (!mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) paint(mesh, "#ffffff");
  if (o.pos) mesh.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rot) mesh.rotationQuaternion = Quaternion.FromEulerAngles(o.rot[0], o.rot[1], o.rot[2]);
  if (o.scale !== undefined) {
    if (typeof o.scale === "number") mesh.scaling.setAll(o.scale);
    else mesh.scaling.set(o.scale[0], o.scale[1], o.scale[2]);
  }
  if (o.parent) mesh.parent = o.parent;
  return mesh;
}

/** Make every triangle's winding agree with the supplied reference normals (Babylon = clockwise front). */
export function fixWinding(p: ArrayLike<number>, idx: number[], ref: ArrayLike<number>) {
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3,
      b = idx[t + 1] * 3,
      c = idx[t + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const rx = ref[a] + ref[b] + ref[c],
      ry = ref[a + 1] + ref[b + 1] + ref[c + 1],
      rz = ref[a + 2] + ref[b + 2] + ref[c + 2];
    // Babylon's default (left-handed, clockwise) front faces have cross(u,v) opposite to the normal
    if (nx * rx + ny * ry + nz * rz > 0) {
      const tmp = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = tmp;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Primitive builders (all smooth-normalled so outlines don't crack)   */
/* ------------------------------------------------------------------ */

export function ball(scene: Scene, radius: number, o: ShapeOpts = {}, segments = 12): Mesh {
  const m = MeshBuilder.CreateSphere(o.name ?? "ball", { diameter: radius * 2, segments }, scene);
  return applyOpts(m, o);
}

/** Ellipsoid: radii rx, ry, rz. */
export function blob(scene: Scene, rx: number, ry: number, rz: number, o: ShapeOpts = {}, segments = 12): Mesh {
  const m = MeshBuilder.CreateSphere(o.name ?? "blob", { diameterX: rx * 2, diameterY: ry * 2, diameterZ: rz * 2, segments }, scene);
  return applyOpts(m, o);
}

function axisSamples(half: number, r: number, steps: number, mid: number): number[] {
  const inner = Math.max(0, half - r);
  const out: number[] = [];
  for (let k = 0; k <= steps; k++) out.push(-inner - r * Math.cos((k / steps) * (Math.PI / 2)));
  for (let k = 1; k < mid; k++) out.push(-inner + (2 * inner * k) / mid);
  for (let k = steps; k >= 0; k--) out.push(inner + r * Math.cos((k / steps) * (Math.PI / 2)));
  // dedupe when inner ~ 0
  return out.filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > 1e-5);
}

/** Rounded ("soft") box centred at origin with smooth normals. */
export function softBox(scene: Scene, w: number, h: number, d: number, o: ShapeOpts = {}, radius = 0.12, steps = 3): Mesh {
  const r = Math.min(radius, w / 2, h / 2, d / 2);
  const hx = w / 2,
    hy = h / 2,
    hz = d / 2;
  const ix = hx - r,
    iy = hy - r,
    iz = hz - r;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const sx = axisSamples(hx, r, steps, 2);
  const sy = axisSamples(hy, r, steps, 2);
  const sz = axisSamples(hz, r, steps, 2);

  const face = (axis: 0 | 1 | 2, sign: 1 | -1) => {
    const ua = axis === 0 ? 2 : 0;
    const va = axis === 1 ? 2 : 1;
    const us = [sx, sy, sz][ua];
    const vs = [sx, sy, sz][va];
    const half = [hx, hy, hz];
    const base = positions.length / 3;
    for (let j = 0; j < vs.length; j++) {
      for (let i = 0; i < us.length; i++) {
        const p = [0, 0, 0];
        p[axis] = half[axis] * sign;
        p[ua] = us[i];
        p[va] = vs[j];
        const c = [Math.max(-ix, Math.min(ix, p[0])), Math.max(-iy, Math.min(iy, p[1])), Math.max(-iz, Math.min(iz, p[2]))];
        let nx = p[0] - c[0],
          ny = p[1] - c[1],
          nz = p[2] - c[2];
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        positions.push(c[0] + nx * r, c[1] + ny * r, c[2] + nz * r);
        normals.push(nx, ny, nz);
      }
    }
    const W = us.length;
    for (let j = 0; j < vs.length - 1; j++) {
      for (let i = 0; i < W - 1; i++) {
        const a = base + j * W + i;
        const b = a + 1;
        const c2 = a + W;
        const d2 = c2 + 1;
        indices.push(a, c2, b, b, c2, d2);
      }
    }
  };
  face(0, 1);
  face(0, -1);
  face(1, 1);
  face(1, -1);
  face(2, 1);
  face(2, -1);

  fixWinding(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.indices = indices;
  const m = new Mesh(o.name ?? "softBox", scene);
  vd.applyToMesh(m);
  return applyOpts(m, o);
}

/**
 * Lathe a profile of [radius, y] points around Y. Smooth normals.
 * Use for pots, cups, trunks, mushroom caps, lamps…
 */
export function lathe(scene: Scene, profile: [number, number][], o: ShapeOpts = {}, tess = 16, closed = true): Mesh {
  const shape = profile.map(([r, y]) => new Vector3(Math.max(r, 0.0001), y, 0));
  const m = MeshBuilder.CreateLathe(o.name ?? "lathe", { shape, tessellation: tess, closed, sideOrientation: Mesh.DEFAULTSIDE }, scene);
  return applyOpts(m, o);
}

/** Rounded cylinder (soft edges). */
export function softCyl(scene: Scene, h: number, rTop: number, rBot: number, o: ShapeOpts = {}, bevel = 0.06, tess = 18): Mesh {
  const b = Math.min(bevel, h / 2, rTop, rBot);
  const prof: [number, number][] = [
    [0, 0],
    [rBot - b, 0],
    [rBot - b * 0.3, b * 0.3],
    [rBot, b],
    [rTop, h - b],
    [rTop - b * 0.3, h - b * 0.3],
    [rTop - b, h],
    [0, h],
  ];
  return lathe(scene, prof, o, tess);
}

export function cone(scene: Scene, h: number, r: number, o: ShapeOpts = {}, tess = 14): Mesh {
  const prof: [number, number][] = [
    [0, 0],
    [r * 0.92, 0],
    [r, h * 0.05],
    [r * 0.04, h],
    [0, h],
  ];
  return lathe(scene, prof, o, tess);
}

export function torus(scene: Scene, radius: number, thickness: number, o: ShapeOpts = {}, tess = 20): Mesh {
  const m = MeshBuilder.CreateTorus(o.name ?? "torus", { diameter: radius * 2, thickness: thickness, tessellation: tess }, scene);
  return applyOpts(m, o);
}

export function capsule(scene: Scene, h: number, r: number, o: ShapeOpts = {}): Mesh {
  const m = MeshBuilder.CreateCapsule(o.name ?? "capsule", { height: h, radius: r, tessellation: 12, subdivisions: 2, capSubdivisions: 5 }, scene);
  return applyOpts(m, o);
}

/** Thin flat round tile (soft disc with rounded rim) – rugs, lily pads, cheeks. */
export function disc(scene: Scene, r: number, thick = 0.04, o: ShapeOpts = {}, tess = 20): Mesh {
  return softCyl(scene, thick, r, r, o, thick * 0.5, tess);
}

/** Flat plane (single-sided by default). */
export function plane(scene: Scene, w: number, h: number, o: ShapeOpts = {}, doubleSided = false): Mesh {
  const m = MeshBuilder.CreatePlane(o.name ?? "plane", { width: w, height: h, sideOrientation: doubleSided ? Mesh.DOUBLESIDE : Mesh.DEFAULTSIDE }, scene);
  return applyOpts(m, o);
}

/** Scalloped (wavy-edged) disc/rug like the fluffy rugs in the reference. */
export function scallopRug(scene: Scene, r: number, bumps: number, o: ShapeOpts = {}, thick = 0.05): Mesh {
  const prof: [number, number][] = [];
  const pts: number[] = [];
  const idx: number[] = [];
  const N = bumps * 6;
  pts.push(0, thick, 0);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (1 + 0.07 * Math.cos(a * bumps));
    pts.push(Math.cos(a) * rr, thick, Math.sin(a) * rr);
    pts.push(Math.cos(a) * rr * 1.02, 0, Math.sin(a) * rr * 1.02);
  }
  for (let i = 0; i < N; i++) {
    const t0 = 1 + i * 2,
      b0 = t0 + 1,
      t1 = t0 + 2,
      b1 = t0 + 3;
    idx.push(0, t1, t0);
    idx.push(t0, t1, b0, b0, t1, b1);
  }
  void prof;
  const ref: number[] = [];
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i + 1] > thick * 0.5) ref.push(0, 1, 0);
    else {
      const l = Math.hypot(pts[i], pts[i + 2]) || 1;
      ref.push(pts[i] / l, 0, pts[i + 2] / l);
    }
  }
  fixWinding(pts, idx, ref);
  const vd = new VertexData();
  vd.positions = pts;
  vd.indices = idx;
  const normals: number[] = [];
  VertexData.ComputeNormals(pts, idx, normals);
  vd.normals = normals;
  const m = new Mesh(o.name ?? "rug", scene);
  vd.applyToMesh(m);
  return applyOpts(m, o);
}

/* ------------------------------------------------------------------ */
/* Batching                                                            */
/* ------------------------------------------------------------------ */

export interface BuildOpts extends ToonOpts {
  outline?: number | false;
  outlineColor?: ColorLike;
  castShadow?: boolean;
  receiveShadow?: boolean;
  material?: Material;
  parent?: TransformNode | null;
}

export type ShadowHook = (mesh: Mesh, cast: boolean, receive: boolean) => void;
let shadowHook: ShadowHook | null = null;
export function setShadowHook(h: ShadowHook | null) {
  shadowHook = h;
}

export function finishMesh(m: Mesh, scene: Scene, b: BuildOpts = {}) {
  m.material = b.material ?? toonMat(scene, b);
  if (b.outline !== false) {
    m.renderOutline = true;
    m.outlineWidth = b.outline ?? 0.035;
    m.outlineColor = col(b.outlineColor ?? "ink");
  }
  if (b.parent) m.parent = b.parent;
  shadowHook?.(m, b.castShadow ?? true, b.receiveShadow ?? true);
}

/**
 * Collect many coloured shapes and merge them into a single draw call.
 */
export class Batch {
  meshes: Mesh[] = [];
  constructor(public scene: Scene, public name = "batch") {}
  add<T extends Mesh>(m: T): T {
    this.meshes.push(m);
    return m;
  }
  get count() {
    return this.meshes.length;
  }
  build(b: BuildOpts = {}): Mesh | null {
    if (!this.meshes.length) return null;
    const m = Mesh.MergeMeshes(this.meshes, true, true, undefined, false, false);
    this.meshes = [];
    if (!m) return null;
    m.name = this.name;
    finishMesh(m, this.scene, b);
    m.freezeNormals();
    return m;
  }
}

/** Group: merge but keep result as a node you can animate (e.g. a critter's ear). */
export function merge(scene: Scene, meshes: Mesh[], name: string, b: BuildOpts = {}): Mesh {
  const m = meshes.length === 1 ? meshes[0] : Mesh.MergeMeshes(meshes, true, true, undefined, false, false)!;
  m.name = name;
  finishMesh(m, scene, b);
  return m;
}

export function v3(a: V3): Vector3 {
  return new Vector3(a[0], a[1], a[2]);
}
