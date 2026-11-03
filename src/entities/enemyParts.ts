/**
 * enemyParts — building blocks for the Gloomies (Thornwild enemies).
 *
 *  - per-instance toon materials (so one gloomy can flash white / flare its eyes without touching others)
 *  - inverted-hull outlines in a deep plum ink (one extra draw per outlined part)
 *  - grumpy faces: glowing eyes (+ pupils/highlights, one emissive mesh), frowny brows and mouths
 *  - Wisps: rising puffs of shadow smoke drawn as thin instances (one draw for the whole plume)
 *
 * Everything is authored in "rig space": origin at the feet, +Y up, facing +Z.
 */
import { Mesh, MeshBuilder, VertexBuffer, VertexData, StandardMaterial, Color3, Vector3, type Scene, type TransformNode } from "@babylonjs/core";
import { col } from "../render/Palette";
import { fixWinding, finishMesh, type ColorLike, type V3 } from "../render/Shapes";
import { ToonPlugin, toonMat } from "../render/Toon";
import { ballM, blobM, decal, surf, arcOn, tubeM, softConeM, capOn, puffStar, rotZTo, rotYTo, add, norm, prep, type Ell } from "./critterParts";

export { ballM, blobM, decal, surf, arcOn, tubeM, softConeM, capOn, puffStar, rotZTo, rotYTo, add, norm, prep, type Ell };

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * A toon material owned by one enemy instance (same shader as `toonMat`, but uncached so its uniforms can be
 * animated per enemy). Remember to dispose it with the enemy.
 */
export interface FxMat {
  mat: StandardMaterial;
  toon: ToonPlugin;
  /** resting rim settings (restored when flash = 0) */
  rim: Color3;
  rimK: number;
  rimP: number;
}

export function fxMat(scene: Scene, name: string, o: { rim?: number; rimColor?: ColorLike; rimPower?: number; shade?: number; emissive?: ColorLike } = {}): FxMat {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  if (o.emissive) m.emissiveColor = col(o.emissive).clone();
  const p = new ToonPlugin(m);
  const rim = col(o.rimColor ?? "#ffffff").clone();
  p.rimColor = rim.clone();
  p.rimStrength = o.rim ?? 0.3;
  p.rimPower = o.rimPower ?? 2.4;
  if (o.shade !== undefined) p.ramp.shade = o.shade;
  return { mat: m, toon: p, rim, rimK: p.rimStrength, rimP: p.rimPower };
}

/**
 * Additive flash via the toon rim term: at f=1 the rim power drops to ~0 so the rim colour is added to every
 * pixel (StandardMaterial emissive is multiplied by vertex colour, so it can't whiten a dark plush).
 * No allocations.
 */
export function setFlash(f: FxMat, k: number, r = 1, g = 1, b = 1, strength = 0.85) {
  const p = f.toon;
  if (k <= 0.001) {
    p.rimColor.copyFrom(f.rim);
    p.rimStrength = f.rimK;
    p.rimPower = f.rimP;
    return;
  }
  k = Math.min(1, k);
  p.rimColor.set(f.rim.r + (r - f.rim.r) * k, f.rim.g + (g - f.rim.g) * k, f.rim.b + (b - f.rim.b) * k);
  p.rimStrength = f.rimK + (strength - f.rimK) * k;
  p.rimPower = f.rimP + (0.04 - f.rimP) * Math.min(1, k * 1.6);
}

/* ------------------------------------------------------------------ */
/* Outline hull                                                         */
/* ------------------------------------------------------------------ */

export const GLOOM_INK = "#2a1d3a";
const hullMats = new Map<string, StandardMaterial>();

function hullMat(scene: Scene, color: string): StandardMaterial {
  const key = color;
  let m = hullMats.get(key);
  if (!m || m.getScene() !== scene) {
    m = new StandardMaterial("gloomOutline" + color, scene);
    m.disableLighting = true;
    m.emissiveColor = col(color).clone();
    m.diffuseColor.set(0, 0, 0);
    m.specularColor.set(0, 0, 0);
    m.backFaceCulling = true;
    m.cullBackFaces = false; // draw only the inside of the hull
    m.freeze();
    hullMats.set(key, m);
  }
  return m;
}

/** Inverted-hull outline (an ink shell pushed out along normals, front faces culled) parented like `m`. */
export function addHull(m: Mesh, width: number, color = GLOOM_INK): Mesh {
  const scene = m.getScene();
  const pos = m.getVerticesData(VertexBuffer.PositionKind)!;
  const nor = m.getVerticesData(VertexBuffer.NormalKind)!;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i++) out[i] = pos[i] + nor[i] * width;
  const vd = new VertexData();
  vd.positions = out;
  vd.normals = nor;
  vd.indices = m.getIndices()!;
  const h = new Mesh(m.name + ".outline", scene);
  vd.applyToMesh(h);
  h.material = hullMat(scene, color);
  h.parent = m.parent;
  h.position.copyFrom(m.position);
  h.isPickable = false;
  h.receiveShadows = false;
  h.doNotSyncBoundingInfo = true;
  return h;
}

/* ------------------------------------------------------------------ */
/* Part assembly                                                       */
/* ------------------------------------------------------------------ */

export interface PartSpec {
  /** outlined shapes */
  shapes: Mesh[];
  /** shapes merged into the same draw but kept out of the outline hull (brows, mouths, patches) */
  flat?: Mesh[];
  outline?: number;
  outlineColor?: string;
  material: StandardMaterial;
  shadow?: boolean;
}

/**
 * Merge rig-space shapes into one mesh re-pivoted at `pivot` (rig space of `parent` = `parentPivot`).
 * Returns [mesh, hull?].
 */
export function makePart(scene: Scene, name: string, parent: TransformNode, parentPivot: V3, pivot: V3, spec: PartSpec): Mesh[] {
  const out: Mesh[] = [];
  // merge + re-pivot while still unparented (MergeMeshes bakes world matrices)
  const mergeAt = (list: Mesh[]): Mesh | null => {
    if (!list.length) return null;
    const m = list.length === 1 ? list[0] : Mesh.MergeMeshes(list, true, true, undefined, false, false)!;
    m.position.x -= pivot[0];
    m.position.y -= pivot[1];
    m.position.z -= pivot[2];
    m.bakeCurrentTransformIntoVertices();
    return m;
  };
  let m = mergeAt(spec.shapes);
  const hull = m && (spec.outline ?? 0) > 0 ? addHull(m, spec.outline!, spec.outlineColor) : null;
  const f = spec.flat?.length ? mergeAt(spec.flat) : null;
  if (f) m = m ? Mesh.MergeMeshes([m, f], true, true, undefined, false, false)! : f;
  if (!m) return out;
  m.name = name;
  finishMesh(m, scene, { material: spec.material, outline: false, castShadow: spec.shadow ?? false, receiveShadow: true });
  m.isPickable = false;
  m.freezeNormals();
  out.push(m);
  if (hull) {
    hull.name = name + ".outline";
    out.push(hull);
  }
  for (const x of out) {
    x.parent = parent;
    x.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Grumpy faces                                                        */
/* ------------------------------------------------------------------ */

export interface GrumpySpec {
  head: Ell;
  eyeYaw: number;
  eyePitch: number;
  /** eye half-width / half-height (m) */
  eyeW: number;
  eyeH: number;
  /** glow colour of the eyes */
  glow: string;
  /** brow/mouth ink */
  ink?: string;
  /** brow tube radius */
  brow?: number;
  /** inner end of the brow dips this much (in eye heights) */
  browSlant?: number;
  /** extra gap between brow and eye (eye heights) */
  browLift?: number;
  mouth?: { pitch: number; w: number; style: "frown" | "wavy" | "o" | "none"; fang?: 0 | 1 | 2 };
  /** pupils glare a little inwards/down */
  pupil?: number;
}

/**
 * Returns `eyes` (merge into the glowing eye mesh — colours there are shown unlit) and `flat`
 * (brows, mouth — merge into the body, un-outlined).
 */
export function grumpyFace(scene: Scene, f: GrumpySpec): { eyes: Mesh[]; flat: Mesh[]; mouthPos: V3 } {
  const eyes: Mesh[] = [];
  const flat: Mesh[] = [];
  const H = f.head;
  const ink = f.ink ?? "#1f1530";
  const R = (H.r[0] + H.r[1] + H.r[2]) / 3;
  const brow = f.brow ?? f.eyeH * 0.32;
  const slant = f.browSlant ?? 0.6;
  for (const s of [-1, 1]) {
    const yaw = s * f.eyeYaw;
    const dy = f.eyeW / R,
      dp = f.eyeH / R;
    // glowing almond, tilted so the inner corner dips (glare)
    eyes.push(decal(scene, H, yaw, f.eyePitch, [f.eyeW, f.eyeH, f.eyeW * 0.5], f.glow, 0.42, -s * 0.32, 8));
    // pupil: dark, pushed inward/down, plus a tiny white glint
    const pk = f.pupil ?? 0.5;
    if (pk > 0) {
      const pp = surf(H, yaw - s * dy * 0.22, f.eyePitch - dp * 0.12, f.eyeW * 0.2);
      eyes.push(blobM(scene, [f.eyeW * 0.42 * pk * 2, f.eyeH * 0.55 * pk * 2, f.eyeW * 0.18], pp.p, "#2a1236", rotZTo(pp.n), undefined, 5));
      const gp = surf(H, yaw - s * dy * 0.05 + dy * 0.12, f.eyePitch + dp * 0.12, f.eyeW * 0.34);
      eyes.push(ballM(scene, f.eyeW * 0.16, gp.p, "#ffffff", undefined, 3));
    }
    // heavy brow slanting down toward the middle, overlapping the eye's top-inner edge
    const lift = f.browLift ?? 0.55;
    const bp: [number, number][] = [
      [yaw + s * dy * 1.15, f.eyePitch + dp * (lift + 0.62)],
      [yaw + s * dy * 0.25, f.eyePitch + dp * (lift + 0.48 - slant * 0.35)],
      [yaw - s * dy * 0.85, f.eyePitch + dp * (lift + 0.2 - slant * 0.9)],
    ];
    flat.push(...arcOn(scene, H, bp, brow, ink, brow * 0.55));
  }
  let mouthPos: V3 = surf(H, 0, f.mouth?.pitch ?? f.eyePitch - 0.3, 0).p;
  const m = f.mouth;
  if (m && m.style !== "none") {
    const w = m.w / R;
    const lw = brow * 0.7;
    if (m.style === "frown") {
      const pts: [number, number][] = [];
      for (let i = 0; i < 7; i++) {
        const u = (i / 6) * 2 - 1;
        pts.push([u * w, m.pitch + (1 - u * u) * w * 0.35]);
      }
      flat.push(...arcOn(scene, H, pts, lw, ink, lw * 0.5));
    } else if (m.style === "wavy") {
      const pts: [number, number][] = [];
      for (let i = 0; i < 9; i++) {
        const u = (i / 8) * 2 - 1;
        pts.push([u * w, m.pitch + Math.sin(u * Math.PI * 1.5) * w * 0.14 + (1 - u * u) * w * 0.12]);
      }
      flat.push(...arcOn(scene, H, pts, lw, ink, lw * 0.5));
    }
    mouthPos = surf(H, 0, m.pitch, 0).p;
    const fangs = m.fang ?? 0;
    for (let i = 0; i < fangs; i++) {
      const sx = fangs === 1 ? 0.45 : i ? 0.55 : -0.55;
      const fp = surf(H, sx * w, m.pitch + w * 0.12, -lw * 0.2);
      // little white fang pointing down out of the frown
      flat.push(softConeM(scene, lw * 3.2, lw * 1.25, fp.p, "#fff4fb", [Math.PI - 0.25, 0, 0], undefined, [1, 1, 0.7], 6, 0.3));
    }
  }
  return { eyes, flat, mouthPos };
}

/* ------------------------------------------------------------------ */
/* Little geometry                                                     */
/* ------------------------------------------------------------------ */

/** A ring of soft thorny bumps on an ellipsoid (yaw/pitch lists). */
export function thornsOn(scene: Scene, e: Ell, at: [number, number, number][], color: ColorLike, tip: ColorLike, rk = 0.38): Mesh[] {
  const out: Mesh[] = [];
  for (const [yaw, pitch, h] of at) {
    const { p, n } = surf(e, yaw, pitch, -h * 0.12);
    out.push(softConeM(scene, h, h * rk, p, tip, rotYTo(n), color, undefined, 6, 0.22));
  }
  return out;
}

/**
 * Bent horn / thorn: a smooth tapered tube from `base` along `dir`, curling by `bend` (per unit length),
 * painted from `color` (root) to `tip`.
 */
export function hornM(scene: Scene, base: V3, dir: V3, len: number, r: number, bend: V3, color: ColorLike, tip: ColorLike, segs = 5): Mesh[] {
  const path: Vector3[] = [];
  let p = add(base, norm(dir), -r * 0.6);
  let d = norm(dir);
  const N = Math.max(3, segs + 1);
  for (let i = 0; i < N; i++) {
    path.push(new Vector3(p[0], p[1], p[2]));
    const l = (len + r * 0.6) / (N - 1);
    p = add(p, d, l);
    d = norm(add(d, bend, l));
  }
  const m = MeshBuilder.CreateTube("horn", { path, tessellation: 8, cap: Mesh.CAP_START, radiusFunction: (i) => r * Math.pow(1 - i / (N - 1), 0.75) + r * 0.06 }, scene);
  for (const k of [VertexBuffer.UVKind, VertexBuffer.UV2Kind, VertexBuffer.TangentKind]) if (m.isVerticesDataPresent(k)) m.removeVerticesData(k);
  // colour along the horn: root colour → tip colour
  const pos = m.getVerticesData(VertexBuffer.PositionKind)!;
  const c0 = col(color),
    c1 = col(tip);
  const cols = new Float32Array((pos.length / 3) * 4);
  const b0 = path[0],
    bN = path[N - 1];
  const ax = bN.x - b0.x,
    ay = bN.y - b0.y,
    az = bN.z - b0.z;
  const al = ax * ax + ay * ay + az * az || 1;
  for (let i = 0; i < pos.length / 3; i++) {
    let u = ((pos[i * 3] - b0.x) * ax + (pos[i * 3 + 1] - b0.y) * ay + (pos[i * 3 + 2] - b0.z) * az) / al;
    u = Math.max(0, Math.min(1, u));
    u = u * u;
    cols[i * 4] = c0.r + (c1.r - c0.r) * u;
    cols[i * 4 + 1] = c0.g + (c1.g - c0.g) * u;
    cols[i * 4 + 2] = c0.b + (c1.b - c0.b) * u;
    cols[i * 4 + 3] = 1;
  }
  m.setVerticesData(VertexBuffer.ColorKind, cols, false, 4);
  return [m];
}

/**
 * Cape / skirt shell: a flared partial cylinder around Y spanning angles [a0,a1] (0 = +Z), from yTop down to
 * yBot with a wavy hem. Double-sided (outer colour / inner lining).
 */
export function capeM(scene: Scene, o: { a0: number; a1: number; yTop: number; yBot: number; rTop: number; rBot: number; zOff?: number; wave?: number; waves?: number; outer: ColorLike; outerBot?: ColorLike; inner: ColorLike; thick?: number }): Mesh {
  const NA = 26,
    NY = 6;
  const pos: number[] = [];
  const nor: number[] = [];
  const colr: number[] = [];
  const idx: number[] = [];
  const ref: number[] = [];
  const co = col(o.outer),
    cb = col(o.outerBot ?? o.outer),
    ci = col(o.inner);
  const th = o.thick ?? 0.03;
  for (let side = 0; side < 2; side++) {
    const base = pos.length / 3;
    for (let j = 0; j <= NY; j++) {
      const v = j / NY;
      for (let i = 0; i <= NA; i++) {
        const u = i / NA;
        const a = o.a0 + (o.a1 - o.a0) * u;
        const hem = (o.wave ?? 0.1) * Math.sin(u * Math.PI * 2 * (o.waves ?? 4)) * v;
        const y = o.yTop + (o.yBot - o.yTop) * v + hem;
        const r = o.rTop + (o.rBot - o.rTop) * Math.pow(v, 0.8) - (side ? th : 0);
        const x = Math.sin(a) * r,
          z = Math.cos(a) * r + (o.zOff ?? 0);
        pos.push(x, y, z);
        const sg = side ? -1 : 1;
        const nn = norm([Math.sin(a), 0.25, Math.cos(a)]);
        nor.push(nn[0] * sg, nn[1] * sg, nn[2] * sg);
        ref.push(nn[0] * sg, nn[1] * sg, nn[2] * sg);
        const c = side ? ci : co;
        const cc = side ? ci : cb;
        colr.push(c.r + (cc.r - c.r) * v, c.g + (cc.g - c.g) * v, c.b + (cc.b - c.b) * v, 1);
      }
    }
    const W = NA + 1;
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NA; i++) {
        const a = base + j * W + i;
        idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
      }
  }
  fixWinding(pos, idx, ref);
  const vd = new VertexData();
  vd.positions = pos;
  vd.normals = nor;
  vd.indices = idx;
  vd.colors = colr;
  const m = new Mesh("cape", scene);
  vd.applyToMesh(m);
  return m;
}

/* ------------------------------------------------------------------ */
/* Wisps: thin-instanced smoke puffs                                    */
/* ------------------------------------------------------------------ */

export interface WispOpts {
  count: number;
  /** emitter centre (local to the parent node) */
  at: V3;
  /** emitter half-extents (puffs spawn on an ellipse ring of this size) */
  spread: [number, number];
  /** only emit within this yaw arc around -Z (back) — 2π = all around */
  arc?: number;
  /** rise distance over a life */
  rise: number;
  /** outward drift over a life */
  drift: number;
  size: number;
  /** lives per second */
  rate: number;
  color: ColorLike;
  bottom?: ColorLike;
  material?: StandardMaterial;
  /** vertical stretch of each puff (smoke curls are taller than wide) */
  stretch?: number;
  /** custom puff template (rig units ~radius 1); default a sphere */
  shape?: Mesh;
}

/** A tiny three-lump cloud (radius ~1) used as the default smoke puff. */
export function cloudPuff(scene: Scene, color: ColorLike, bottom?: ColorLike): Mesh {
  const parts = [
    blobM(scene, [0.75, 0.7, 0.7], [0, 0.15, 0], color, undefined, bottom, 5),
    blobM(scene, [0.55, 0.5, 0.5], [-0.6, -0.1, 0.1], color, undefined, bottom, 4),
    blobM(scene, [0.5, 0.45, 0.45], [0.58, -0.05, -0.1], color, undefined, bottom, 4),
  ];
  const m = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
  m.name = "wisp";
  return m;
}

/** Rising, swelling-then-shrinking smoke puffs. One draw call; update() allocates nothing. */
export class Wisps {
  mesh: Mesh;
  private buf: Float32Array;
  private t = Math.random() * 10;
  intensity = 1;
  constructor(
    scene: Scene,
    parent: TransformNode,
    public o: WispOpts,
  ) {
    const m = o.shape ?? cloudPuff(scene, o.color, o.bottom);
    m.material = o.material ?? toonMat(scene, { name: "gloomWisp", rim: 0.5, shade: 0.85, alpha: 0.62 });
    m.parent = parent;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
    this.buf = new Float32Array(16 * o.count);
    for (let i = 0; i < o.count; i++) this.buf[i * 16 + 15] = 1;
    m.thinInstanceSetBuffer("matrix", this.buf, 16, false);
    m.receiveShadows = false;
    this.mesh = m;
    this.update(0);
  }
  update(dt: number) {
    const o = this.o;
    this.t += dt * o.rate;
    const n = o.count;
    const arc = o.arc ?? Math.PI * 2;
    const b = this.buf;
    for (let i = 0; i < n; i++) {
      const life = this.t + i / n;
      const cyc = Math.floor(life);
      const p = life - cyc;
      // pseudo-random but stable per (puff, cycle)
      const h = Math.sin(i * 12.9898 + cyc * 78.233) * 43758.5453;
      const r1 = h - Math.floor(h);
      const h2 = Math.sin(i * 39.346 + cyc * 11.135) * 24634.6345;
      const r2 = h2 - Math.floor(h2);
      const a = Math.PI + (r1 - 0.5) * arc;
      const ca = Math.sin(a),
        sa = Math.cos(a);
      const rr = 1 + p * o.drift;
      const x = o.at[0] + ca * o.spread[0] * rr;
      const z = o.at[2] + sa * o.spread[1] * rr;
      const y = o.at[1] + p * o.rise * (0.7 + 0.6 * r2);
      const s = o.size * (0.7 + 0.5 * r2) * Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.15)), 0.7) * this.intensity;
      const k = i * 16;
      const st = o.stretch ?? 1.15;
      b[k] = s;
      b[k + 5] = s * st;
      b[k + 10] = s;
      b[k + 12] = x;
      b[k + 13] = y;
      b[k + 14] = z;
    }
    this.mesh.thinInstanceBufferUpdated("matrix");
  }
  dispose() {
    this.mesh.dispose(false, false);
  }
}
