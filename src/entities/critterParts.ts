/**
 * critterParts — geometry helpers for the procedural plush critters.
 *
 * Everything is authored in "rig space": origin at the critter's feet, +Y up, facing +Z.
 * `Kit.part()` merges a list of shapes and re-pivots the result so it can be parented
 * under an animated node (ear, tail, wing…), keeping the authored rig-space placement.
 */
import { Mesh, MeshBuilder, Vector3, VertexData, VertexBuffer, Quaternion, TransformNode, type Scene, type Material } from "@babylonjs/core";
import { paint, fixWinding, finishMesh, lathe, type ColorLike, type V3 } from "../render/Shapes";
import { toonMat } from "../render/Toon";

/* ------------------------------------------------------------------ */
/* Low-level shape helpers                                             */
/* ------------------------------------------------------------------ */

/** Strip UVs/tangents (so meshes merge cleanly) and paint vertex colours. */
export function prep(m: Mesh, color: ColorLike, bottom?: ColorLike): Mesh {
  for (const k of [VertexBuffer.UVKind, VertexBuffer.UV2Kind, VertexBuffer.TangentKind]) {
    if (m.isVerticesDataPresent(k)) m.removeVerticesData(k);
  }
  paint(m, color, bottom);
  return m;
}

export function place(m: Mesh, pos?: V3, rot?: V3, scale?: V3 | number): Mesh {
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotationQuaternion = Quaternion.FromEulerAngles(rot[0], rot[1], rot[2]);
  if (scale !== undefined) {
    if (typeof scale === "number") m.scaling.setAll(scale);
    else m.scaling.set(scale[0], scale[1], scale[2]);
  }
  return m;
}

/** Euler that turns local +Z to face along normal n. */
export function rotZTo(n: V3, roll = 0): V3 {
  return [-Math.asin(Math.max(-1, Math.min(1, n[1]))), Math.atan2(n[0], n[2]), roll];
}
/** Euler that turns local +Y to point along normal n. */
export function rotYTo(n: V3): V3 {
  return [Math.acos(Math.max(-1, Math.min(1, n[1]))), Math.atan2(n[0], n[2]), 0];
}

export function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export function add(a: V3, b: V3, s = 1): V3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

/** An ellipsoid surface (centre + radii) in rig space. */
export interface Ell {
  c: V3;
  r: V3;
}

/** Mirror an ellipsoid across X (for the other eye / ear …). */
export function mirrorEll(e: Ell, side: number): Ell {
  return { c: [Math.abs(e.c[0]) * side, e.c[1], e.c[2]], r: e.r };
}

/**
 * Point on an ellipsoid along view direction (yaw from +Z toward +X, pitch up),
 * plus its surface normal. `lift` pushes the point out along the normal.
 */
export function surf(e: Ell, yaw: number, pitch: number, lift = 0): { p: V3; n: V3 } {
  const cp = Math.cos(pitch);
  const dx = Math.sin(yaw) * cp,
    dy = Math.sin(pitch),
    dz = Math.cos(yaw) * cp;
  const [rx, ry, rz] = e.r;
  const t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2 + (dz / rz) ** 2);
  const px = dx * t,
    py = dy * t,
    pz = dz * t;
  const n = norm([px / (rx * rx), py / (ry * ry), pz / (rz * rz)]);
  return { p: [e.c[0] + px + n[0] * lift, e.c[1] + py + n[1] * lift, e.c[2] + pz + n[2] * lift], n };
}

export function ballM(scene: Scene, r: number, pos: V3, color: ColorLike, bottom?: ColorLike, seg = 10): Mesh {
  const m = MeshBuilder.CreateSphere("b", { diameter: r * 2, segments: seg }, scene);
  return place(prep(m, color, bottom), pos);
}

export function blobM(scene: Scene, r: V3, pos: V3, color: ColorLike, rot?: V3, bottom?: ColorLike, seg = 10): Mesh {
  const m = MeshBuilder.CreateSphere("e", { diameterX: r[0] * 2, diameterY: r[1] * 2, diameterZ: r[2] * 2, segments: seg }, scene);
  prep(m, color, bottom);
  return place(m, pos, rot);
}

/** Soft rounded cone along +Y (ears, spines, tufts). Base at origin. */
export function softConeM(scene: Scene, h: number, r: number, pos: V3, color: ColorLike, rot?: V3, bottom?: ColorLike, scale?: V3, tess = 10, tip = 0.18): Mesh {
  const prof: [number, number][] = [
    [0, 0],
    [r * 0.94, 0],
    [r, h * 0.08],
    [r * 0.82, h * 0.42],
    [r * (tip + 0.18), h * 0.8],
    [r * tip, h * 0.94],
    [r * tip * 0.4, h * 0.995],
    [0, h],
  ];
  const m = lathe(scene, prof, { color, bottom }, tess);
  place(m, pos, rot, scale);
  return m;
}

/** Puffy N-point star facing +Z (thickness along Z). */
export function puffStar(scene: Scene, points: number, rOut: number, rIn: number, thick: number, pos: V3, color: ColorLike, rot?: V3): Mesh {
  const p: number[] = [0, 0, thick, 0, 0, -thick];
  const ref: number[] = [0, 0, 1, 0, 0, -1];
  const N = points * 2;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? rOut : rIn;
    // two rings (front/back) give the star a soft rounded rim
    p.push(Math.cos(a) * rr, Math.sin(a) * rr, thick * 0.35);
    ref.push(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.6);
    p.push(Math.cos(a) * rr, Math.sin(a) * rr, -thick * 0.35);
    ref.push(Math.cos(a) * 0.6, Math.sin(a) * 0.6, -0.6);
  }
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    const f0 = 2 + i * 2,
      b0 = f0 + 1;
    const f1 = 2 + ((i + 1) % N) * 2,
      b1 = f1 + 1;
    idx.push(0, f0, f1);
    idx.push(1, b1, b0);
    idx.push(f0, b0, f1, f1, b0, b1);
  }
  fixWinding(p, idx, ref);
  const normals: number[] = [];
  VertexData.ComputeNormals(p, idx, normals);
  const vd = new VertexData();
  vd.positions = p;
  vd.indices = idx;
  vd.normals = normals;
  const m = new Mesh("star", scene);
  vd.applyToMesh(m);
  prep(m, color);
  return place(m, pos, rot);
}

/** Round-capped tube through rig-space points (mouths, closed eyes, whiskers). */
export function tubeM(scene: Scene, pts: V3[], radius: number, color: ColorLike, caps = true): Mesh[] {
  const path = pts.map((q) => new Vector3(q[0], q[1], q[2]));
  const t = MeshBuilder.CreateTube("tube", { path, radius, tessellation: 6, cap: Mesh.CAP_ALL }, scene);
  const out = [prep(t, color)];
  if (caps) {
    out.push(ballM(scene, radius, pts[0], color, undefined, 4));
    out.push(ballM(scene, radius, pts[pts.length - 1], color, undefined, 4));
  }
  return out;
}

/** Arc on an ellipsoid surface: angles are [yaw, pitch] pairs. */
export function arcOn(scene: Scene, e: Ell, ang: [number, number][], radius: number, color: ColorLike, lift = radius * 0.4): Mesh[] {
  return tubeM(
    scene,
    ang.map(([y, p]) => surf(e, y, p, lift).p),
    radius,
    color,
  );
}

/** Flattened oriented ellipsoid stuck onto a surface (eyes, cheeks, nose, spots). */
export function decal(scene: Scene, e: Ell, yaw: number, pitch: number, r: V3, color: ColorLike, sink = 0.35, roll = 0, seg = 8): Mesh {
  const { p, n } = surf(e, yaw, pitch);
  const pos = add(p, n, -r[2] * sink);
  return blobM(scene, r, pos, color, rotZTo(n, roll), undefined, seg);
}

/**
 * A colour patch that hugs an ellipsoid (calico spots, bellies, masks):
 * a slightly smaller copy of the ellipsoid pushed out along `dir`, so only a cap pokes through.
 * `ang` is the patch's angular radius (radians).
 */
export function patchOn(scene: Scene, e: Ell, yaw: number, pitch: number, ang: number, color: ColorLike, lift = 0.005, stretch: V3 = [1, 1, 1], seg = 14): Mesh {
  const R = (e.r[0] + e.r[1] + e.r[2]) / 3;
  const cosA = Math.cos(ang);
  const a = (lift * cosA) / (1 - cosA);
  const k = Math.max(0.3, 1 - a / R);
  const cp = Math.cos(pitch);
  const d: V3 = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
  const off = a + lift * 0.0;
  const pos: V3 = [e.c[0] + d[0] * off, e.c[1] + d[1] * off, e.c[2] + d[2] * off];
  return blobM(scene, [e.r[0] * k * stretch[0], e.r[1] * k * stretch[1], e.r[2] * k * stretch[2]], pos, color, undefined, undefined, seg);
}

/**
 * A conforming colour cap on an ellipsoid (bellies, masks, calico spots): a thin shell that follows
 * the surface exactly (same normals → seamless shading) with a soft tucked-in rim.
 * `ang` = angular radius; `wob` adds an organic wobbly edge; `sx/sy` stretch it across/along.
 */
export function capOn(scene: Scene, e: Ell, yaw: number, pitch: number, ang: number, color: ColorLike, o: { lift?: number; wob?: number; seed?: number; sx?: number; sy?: number; segs?: number; rings?: number } = {}): Mesh {
  const lift = o.lift ?? 0.0035,
    wob = o.wob ?? 0,
    seed = o.seed ?? 0;
  const S = o.segs ?? 28,
    NR = o.rings ?? 6;
  const sx = o.sx ?? 1,
    sy = o.sy ?? 1;
  const cp = Math.cos(pitch);
  const d: V3 = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
  // tangent frame: u = horizontal, v = "up" along the surface
  let u: V3 = norm([d[2], 0, -d[0]]);
  if (Math.abs(d[1]) > 0.98) u = [1, 0, 0];
  const v: V3 = norm([d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]);
  const [rx, ry, rz] = e.r;
  const pos: number[] = [];
  const nrm: number[] = [];
  const pt = (dir: V3, l: number) => {
    const t = 1 / Math.sqrt((dir[0] / rx) ** 2 + (dir[1] / ry) ** 2 + (dir[2] / rz) ** 2);
    const px = dir[0] * t,
      py = dir[1] * t,
      pz = dir[2] * t;
    const n = norm([px / (rx * rx), py / (ry * ry), pz / (rz * rz)]);
    pos.push(e.c[0] + px + n[0] * l, e.c[1] + py + n[1] * l, e.c[2] + pz + n[2] * l);
    nrm.push(n[0], n[1], n[2]);
  };
  const dirAt = (th: number, ph: number): V3 => {
    const c = Math.cos(th),
      s = Math.sin(th);
    const a = Math.cos(ph) * sx,
      b = Math.sin(ph) * sy;
    return norm([d[0] * c + (u[0] * a + v[0] * b) * s, d[1] * c + (u[1] * a + v[1] * b) * s, d[2] * c + (u[2] * a + v[2] * b) * s]);
  };
  pt(d, lift);
  for (let i = 1; i <= NR + 1; i++) {
    for (let j = 0; j < S; j++) {
      const ph = (j / S) * Math.PI * 2;
      const edge = ang * (1 + wob * (0.6 * Math.sin(3 * ph + seed) + 0.4 * Math.sin(5 * ph + seed * 2.3)));
      const k = i <= NR ? i / NR : 1.03;
      // ease rings towards the rim; final ring tucks under the surface
      pt(dirAt(edge * k, ph), i <= NR ? lift * (i === NR ? 0.6 : 1) : -lift * 1.5);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < S; j++) idx.push(0, 1 + j, 1 + ((j + 1) % S));
  for (let i = 0; i < NR; i++) {
    const r0 = 1 + i * S,
      r1 = r0 + S;
    for (let j = 0; j < S; j++) {
      const j1 = (j + 1) % S;
      idx.push(r0 + j, r1 + j, r0 + j1, r0 + j1, r1 + j, r1 + j1);
    }
  }
  fixWinding(pos, idx, nrm);
  const vd = new VertexData();
  vd.positions = pos;
  vd.normals = nrm;
  vd.indices = idx;
  const m = new Mesh("cap", scene);
  vd.applyToMesh(m);
  return prep(m, color);
}

/* ------------------------------------------------------------------ */
/* Kit: builds re-pivoted parts under a rig hierarchy                   */
/* ------------------------------------------------------------------ */

export interface PartOpts {
  outline?: number | false;
  material?: Material;
  shadow?: boolean;
}

export class Kit {
  private rigPos = new Map<TransformNode, Vector3>();
  readonly mat: Material;
  readonly faceMat: Material;
  meshes: Mesh[] = [];
  constructor(
    public scene: Scene,
    public root: TransformNode,
    public outline = 0.018,
  ) {
    this.rigPos.set(root, Vector3.Zero());
    this.mat = toonMat(scene, { name: "critter", rim: 0.32, shade: 0.74 });
    this.faceMat = toonMat(scene, { name: "critterFace", rim: 0.06, shade: 0.86 });
  }

  rig(n: TransformNode): Vector3 {
    return this.rigPos.get(n) ?? Vector3.Zero();
  }

  /** A pivot node placed at rig-space position `pivot` under `parent`. */
  node(name: string, parent: TransformNode, pivot: V3): TransformNode {
    const n = new TransformNode(name, this.scene);
    n.parent = parent;
    const pr = this.rig(parent);
    n.position.set(pivot[0] - pr.x, pivot[1] - pr.y, pivot[2] - pr.z);
    this.rigPos.set(n, new Vector3(pivot[0], pivot[1], pivot[2]));
    return n;
  }

  /** Merge rig-space shapes into one mesh whose origin is `pivot`, parented under `parent`. */
  part(name: string, parent: TransformNode, pivot: V3, shapes: Mesh[], o: PartOpts = {}): Mesh {
    const m = shapes.length === 1 ? shapes[0] : Mesh.MergeMeshes(shapes, true, true, undefined, false, false)!;
    m.name = name;
    m.position.x -= pivot[0];
    m.position.y -= pivot[1];
    m.position.z -= pivot[2];
    m.bakeCurrentTransformIntoVertices();
    m.parent = parent;
    const pr = this.rig(parent);
    m.position.set(pivot[0] - pr.x, pivot[1] - pr.y, pivot[2] - pr.z);
    this.rigPos.set(m, new Vector3(pivot[0], pivot[1], pivot[2]));
    m.isPickable = false;
    finishMesh(m, this.scene, {
      material: o.material ?? this.mat,
      outline: o.outline === undefined ? this.outline : o.outline,
      castShadow: o.shadow ?? true,
      receiveShadow: true,
    });
    this.meshes.push(m);
    return m;
  }
}

/* ------------------------------------------------------------------ */
/* Faces                                                               */
/* ------------------------------------------------------------------ */

export type FaceMode = "open" | "closed" | "happy" | "sad" | "surprised";
export const FACE_MODES: FaceMode[] = ["open", "closed", "happy", "sad", "surprised"];

export interface FaceSpec {
  head: Ell;
  /** optional separate surface for eye +X (mirrored for -X), e.g. frog eye bumps */
  eyeEll?: Ell;
  eyeYaw: number;
  eyePitch: number;
  eyeW: number;
  eyeH: number;
  eyeStyle?: "dot" | "smile";
  eyeColor?: ColorLike;
  /** tube radius for line features */
  line?: number;
  cheekYaw?: number;
  cheekPitch?: number;
  cheekR?: number;
  cheekColor?: ColorLike;
  mouth?: { ell?: Ell; pitch: number; w: number; h?: number; style: "smile" | "w" | "none" };
  nose?: { ell?: Ell; pitch: number; r: number; color: ColorLike; w?: number };
  fang?: boolean;
  whiskers?: { yaw: number; pitch: number; len: number };
}

const INK = "#3b2f45";
const MOUTH = "#5b3f5e";

/** Builds the face shapes for one expression (rig-space meshes, not merged). */
export function faceShapes(scene: Scene, f: FaceSpec, mode: FaceMode): Mesh[] {
  const out: Mesh[] = [];
  const H = f.head;
  const R = (H.r[0] + H.r[1] + H.r[2]) / 3;
  const line = f.line ?? Math.max(0.008, f.eyeH * 0.2);
  const eyeCol = f.eyeColor ?? INK;
  const style = f.eyeStyle ?? "dot";

  for (const s of [-1, 1]) {
    const E = f.eyeEll ? mirrorEll(f.eyeEll, s) : H;
    const er = (E.r[0] + E.r[1] + E.r[2]) / 3;
    const yaw = s * f.eyeYaw,
      pit = f.eyePitch;
    const dy = f.eyeW / er,
      dp = f.eyeH / er;
    const arc = (dip: number, w = 1.05, k = 7): [number, number][] => {
      const pts: [number, number][] = [];
      for (let i = 0; i < k; i++) {
        const u = (i / (k - 1)) * 2 - 1;
        pts.push([yaw + u * dy * w, pit + dip * (1 - u * u) * dp - dip * 0.35 * dp]);
      }
      return pts;
    };
    const openEye = (scale: number, hiScale: number) => {
      const ew = f.eyeW * scale,
        eh = f.eyeH * scale,
        ed = f.eyeW * 0.6 * scale;
      out.push(decal(scene, E, yaw, pit, [ew, eh, ed], eyeCol, 0.4, 0, 10));
      // highlights: big upper (+X side, i.e. viewer's left), small lower
      const hr = eh * 0.34 * hiScale;
      const h1 = surf(E, yaw + dy * 0.36 * scale, pit + dp * 0.36 * scale, ed * 0.62);
      out.push(ballM(scene, hr, h1.p, "#ffffff", undefined, 6));
      const h2 = surf(E, yaw - dy * 0.35 * scale, pit - dp * 0.42 * scale, ed * 0.5);
      out.push(ballM(scene, hr * 0.48, h2.p, "#ffffff", undefined, 4));
    };
    const smileEye = (dip: number, w: number) => out.push(...arcOn(scene, E, arc(dip, w), line * 1.15, eyeCol));
    if (style === "dot") {
      if (mode === "open") openEye(1, 1);
      else if (mode === "surprised") openEye(1.18, 1.1);
      else if (mode === "sad") openEye(0.92, 1.35);
      else if (mode === "closed") smileEye(-0.42, 1.0);
      else smileEye(0.7, 1.0); // happy ^ ^
    } else {
      // tiny closed-smile eyes (mole)
      if (mode === "open") smileEye(0.55, 0.9);
      else if (mode === "happy") smileEye(0.9, 1.0);
      else if (mode === "closed") smileEye(-0.4, 0.9);
      else if (mode === "sad") smileEye(-0.5, 0.9);
      else out.push(decal(scene, E, yaw, pit, [f.eyeW * 0.45, f.eyeH * 0.6, f.eyeW * 0.4], eyeCol, 0.4));
    }
    if (mode === "sad") {
      // worried brows: inner end higher
      const b: [number, number][] = [
        [yaw + s * dy * 0.9, pit + dp * 1.45],
        [yaw - s * dy * 0.0, pit + dp * 1.7],
        [yaw - s * dy * 0.7, pit + dp * 1.95],
      ];
      out.push(...arcOn(scene, E, b, line * 0.85, eyeCol));
    }
    // blush
    if (f.cheekR) {
      const cr = f.cheekR * (mode === "happy" ? 1.12 : 1);
      out.push(decal(scene, H, s * (f.cheekYaw ?? 0.7), f.cheekPitch ?? -0.15, [cr * 1.4, cr * 0.85, cr * 0.4], f.cheekColor ?? "#ff9fbb", 0.45, 0, 8));
    }
    if (f.whiskers) {
      const w = f.whiskers;
      for (const k of [-1, 1]) {
        const a = surf(H, s * w.yaw, w.pitch + k * 0.07, 0.002).p;
        const dir = norm([s * 1, k * 0.25 + 0.05, -0.15]);
        const b = add(a, dir, w.len);
        out.push(...tubeM(scene, [a, add(a, dir, w.len * 0.5), b], line * 0.45, "#9c8aa6", false));
      }
    }
  }

  // nose
  if (f.nose) {
    const ne = f.nose.ell ?? H;
    out.push(decal(scene, ne, 0, f.nose.pitch, [f.nose.r * (f.nose.w ?? 1.25), f.nose.r * 0.85, f.nose.r * 0.9], f.nose.color, 0.35, 0, 8));
    const hl = surf(ne, 0.12 * (f.nose.r / ((ne.r[0] + ne.r[1]) / 2)) * 3, f.nose.pitch + (f.nose.r / ne.r[1]) * 0.35, f.nose.r * 0.55);
    out.push(ballM(scene, f.nose.r * 0.28, hl.p, "#ffffff", undefined, 4));
  }

  // mouth
  const m = f.mouth;
  if (m && m.style !== "none") {
    const me = m.ell ?? H;
    const mr = (me.r[0] + me.r[1] + me.r[2]) / 3;
    const w = m.w / mr,
      h = (m.h ?? m.w * 0.5) / mr;
    const pts = (y0: number, y1: number, dip: number, k = 6): [number, number][] => {
      const r: [number, number][] = [];
      for (let i = 0; i < k; i++) {
        const u = i / (k - 1);
        const v = u * 2 - 1;
        r.push([y0 + (y1 - y0) * u, m.pitch - dip * (1 - v * v)]);
      }
      return r;
    };
    const lw = line * 0.85;
    if (mode === "happy") {
      // open smiling mouth
      const p = surf(me, 0, m.pitch - h * 0.5);
      out.push(blobM(scene, [m.w * 0.75, m.w * 0.62, m.w * 0.3], add(p.p, p.n, -m.w * 0.1), "#8a3f5a", rotZTo(p.n), undefined, 8));
      const q = surf(me, 0, m.pitch - h * 0.95, m.w * 0.12);
      out.push(blobM(scene, [m.w * 0.42, m.w * 0.26, m.w * 0.16], q.p, "#ff8fa8", rotZTo(q.n), undefined, 6));
    } else if (mode === "surprised") {
      const p = surf(me, 0, m.pitch - h * 0.6);
      out.push(blobM(scene, [m.w * 0.36, m.w * 0.46, m.w * 0.24], add(p.p, p.n, -m.w * 0.06), "#8a3f5a", rotZTo(p.n), undefined, 8));
    } else if (mode === "sad") {
      out.push(...arcOn(scene, me, pts(-w * 0.6, w * 0.6, -h * 0.6), lw, MOUTH));
    } else if (m.style === "w") {
      out.push(...arcOn(scene, me, pts(-w, 0, h), lw, MOUTH));
      out.push(...arcOn(scene, me, pts(0, w, h), lw, MOUTH));
    } else {
      out.push(...arcOn(scene, me, pts(-w, w, h), lw, MOUTH));
    }
  }
  if (f.fang && mode !== "surprised") {
    const me = f.mouth?.ell ?? H;
    const mp = f.mouth ? f.mouth.pitch : -0.2;
    const p = surf(me, 0.06, mp - 0.07, 0.0);
    out.push(softConeM(scene, 0.03, 0.013, p.p, "#ffffff", [Math.PI, 0, 0], undefined, undefined, 6));
  }
  void R;
  return out;
}

/**
 * Builds one head mesh per expression (head shapes + that expression's face merged together, so the
 * features render inside the outlined mesh). Only the first ("open") is enabled.
 * `shapes` must create fresh meshes on every call.
 */
export function buildHeads(k: Kit, parent: TransformNode, pivot: V3, shapes: () => Mesh[], f: FaceSpec, o: PartOpts = {}): Mesh[] {
  return FACE_MODES.map((mode, i) => {
    const m = k.part("head_" + mode, parent, pivot, [...shapes(), ...faceShapes(k.scene, f, mode)], o);
    m.setEnabled(i === 0);
    return m;
  });
}
