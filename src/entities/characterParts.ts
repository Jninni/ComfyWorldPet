/**
 * characterParts — shared building blocks for the procedural characters:
 *  - small shape helpers (tubes, grouped sub-assemblies, surface placement)
 *  - Kit: collects shapes per animated node and merges each group into one draw call
 *  - Rig: transform-only procedural animation (idle, walk/run, talk, celebrate, emotes, look-at, springy ears/tails)
 */
import { Mesh, MeshBuilder, Vector3, Matrix, Quaternion, TransformNode, VertexBuffer, VertexData, StandardMaterial, type Scene, type Material } from "@babylonjs/core";
import { col } from "../render/Palette";
import { paint, finishMesh, fixWinding, ball, blob, type ShapeOpts, type V3, type BuildOpts, type ColorLike } from "../render/Shapes";
import { toonMat } from "../render/Toon";

/* ------------------------------------------------------------------ */
/* Public animation types (re-exported by characterModels)            */
/* ------------------------------------------------------------------ */

export interface CharacterAnimState {
  /** 0 idle .. 1 run */
  speed: number;
  talking?: boolean;
  celebrate?: boolean;
}

export type EmoteKind = "wave" | "happy" | "surprised" | "think" | "nod";

export type HatId = "none" | "beret" | "flower" | "bunnyears" | "strawhat" | "crown" | "chef";
/** Garment cut (sewing skill). */
export type OutfitStyle = "overalls" | "dress" | "hoodie" | "tunic" | "raincoat";
/** Worn accessory (sewing skill). */
export type AccessoryId = "none" | "scarf" | "bow" | "cape" | "backpack";
export const OUTFIT_STYLES: OutfitStyle[] = ["overalls", "dress", "hoodie", "tunic", "raincoat"];
export const ACCESSORIES: AccessoryId[] = ["none", "scarf", "bow", "cape", "backpack"];

/**
 * Player customisation (hex colours). Everything after `hat` is optional so looks saved before the
 * wardrobe existed still load; see `resolveLook` for the defaults.
 */
export interface PlayerLook {
  skin: string;
  hair: string;
  /** main garment colour */
  outfit: string;
  hat: HatId;
  /** default "overalls" */
  style?: OutfitStyle;
  /** accent / trim colour (straps & shirt, pockets, collar, cuffs, hood lining, buttons…). default "#fff6e6" */
  outfit2?: string;
  /** default "none" */
  accessory?: AccessoryId;
  /** default "#f8b9cb" */
  accessoryColor?: string;
}

export const LOOK_DEFAULTS = { style: "overalls", outfit2: "#fff6e6", accessory: "none", accessoryColor: "#f8b9cb" } as const satisfies Partial<PlayerLook>;

/** Fill in the optional wardrobe fields (unknown ids fall back to the defaults too). */
export function resolveLook(look: PlayerLook): Required<PlayerLook> {
  return {
    skin: look.skin,
    hair: look.hair,
    outfit: look.outfit,
    hat: look.hat ?? "none",
    style: look.style && OUTFIT_STYLES.includes(look.style) ? look.style : LOOK_DEFAULTS.style,
    outfit2: look.outfit2 || LOOK_DEFAULTS.outfit2,
    accessory: look.accessory && ACCESSORIES.includes(look.accessory) ? look.accessory : LOOK_DEFAULTS.accessory,
    accessoryColor: look.accessoryColor || LOOK_DEFAULTS.accessoryColor,
  };
}

export interface CharacterModel {
  root: TransformNode;
  height: number;
  update(dt: number, s: CharacterAnimState): void;
  emote(kind: EmoteKind): void;
  lookAt(target: Vector3 | null): void;
  setLook?(look: PlayerLook): void;
  dispose(): void;
}

/* ------------------------------------------------------------------ */
/* Shape helpers                                                       */
/* ------------------------------------------------------------------ */

/** Strip UVs, paint vertex colours and apply transform opts (mirrors Shapes' internal applyOpts). */
export function prep(mesh: Mesh, o: ShapeOpts = {}): Mesh {
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
  return mesh;
}

/** Capped tube along a polyline. `taper` maps 0..1 (along the path) to a radius multiplier. */
export function tube(scene: Scene, pts: V3[], radius: number, o: ShapeOpts = {}, tess = 6, taper?: (u: number) => number): Mesh {
  const path = pts.map((p) => new Vector3(p[0], p[1], p[2]));
  const n = path.length - 1;
  const m = MeshBuilder.CreateTube(
    o.name ?? "tube",
    { path, radius, tessellation: tess, cap: Mesh.CAP_ALL, radiusFunction: taper ? (i: number) => radius * taper(i / n) : undefined },
    scene,
  );
  return prep(m, o);
}

/** Quadratic bezier samples. */
export function bez(a: V3, b: V3, c: V3, n = 8): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]]);
  }
  return out;
}

/** Merge locally-built parts into one mesh, then place it with pos/rot/scale. */
export function group(meshes: Mesh[], o: ShapeOpts = {}): Mesh {
  const m = Mesh.MergeMeshes(meshes, true, true, undefined, false, false)!;
  if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rot) m.rotationQuaternion = Quaternion.FromEulerAngles(o.rot[0], o.rot[1], o.rot[2]);
  if (o.scale !== undefined) {
    if (typeof o.scale === "number") m.scaling.setAll(o.scale);
    else m.scaling.set(o.scale[0], o.scale[1], o.scale[2]);
  }
  return m;
}

/** Puffy heart facing +Z, centred at origin, ~size wide. */
export function heart(scene: Scene, size: number, color: ColorLike, o: ShapeOpts = {}): Mesh {
  const s = size;
  const d = s * 0.32;
  const parts = [
    blob(scene, s * 0.3, s * 0.3, d, { pos: [-s * 0.22, s * 0.1, 0], color }, 8),
    blob(scene, s * 0.3, s * 0.3, d, { pos: [s * 0.22, s * 0.1, 0], color }, 8),
    blob(scene, s * 0.3, s * 0.36, d * 0.95, { pos: [0, -s * 0.12, 0], rot: [0, 0, Math.PI / 4], color, scale: [1, 1, 1] }, 8),
  ];
  return group(parts, o);
}

/** Five-petal flower facing +Z. */
export function flower(scene: Scene, r: number, petal: ColorLike, center: ColorLike, o: ShapeOpts = {}, petals = 5): Mesh {
  const parts: Mesh[] = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + Math.PI / 2;
    parts.push(blob(scene, r * 0.52, r * 0.52, r * 0.22, { pos: [Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, 0], color: petal }, 6));
  }
  parts.push(ball(scene, r * 0.42, { pos: [0, 0, r * 0.14], color: center, scale: [1, 1, 0.7] }, 6));
  return group(parts, o);
}

export interface ShellSpec {
  yTop: number;
  yBot: number;
  rTop: number;
  rBot: number;
  /** half-angle (rad) of the sheet, centred on -Z (the back) */
  arc: number;
  thick: number;
  /** scalloped bottom edge: number of lobes and how far they hang */
  lobes?: number;
  lobeDepth?: number;
  nu?: number;
  nv?: number;
}

/**
 * A curved, flaring sheet with real thickness wrapped around the Y axis (capes, collars, capelets).
 * Closed mesh with smooth normals, so it takes an inverted-hull outline cleanly.
 */
export function shell(scene: Scene, sp: ShellSpec, o: ShapeOpts = {}): Mesh {
  const NU = sp.nu ?? 26,
    NV = sp.nv ?? 6;
  const row = 2 * (NU + 1);
  const P: number[] = [];
  const refSide: number[] = [];
  for (let i = 0; i <= NV; i++) {
    const v = i / NV;
    for (let side = 0; side < 2; side++) {
      for (let jj = 0; jj <= NU; jj++) {
        const j = side === 0 ? jj : NU - jj;
        const u = j / NU;
        const a = -sp.arc + 2 * sp.arc * u;
        const lobe = sp.lobes ? (sp.lobeDepth ?? 0.03) * Math.pow(Math.abs(Math.sin(Math.PI * u * sp.lobes)), 0.6) : 0;
        const y = sp.yTop - (sp.yTop - sp.yBot + lobe) * v;
        const t = (sp.yTop - y) / (sp.yTop - sp.yBot);
        const r = sp.rTop + (sp.rBot - sp.rTop) * t - (side ? sp.thick : 0);
        const sa = Math.sin(a),
          ca = Math.cos(a);
        P.push(sa * r, y, -ca * r);
        if (side) refSide.push(-sa, 0, ca);
        else refSide.push(sa, 0, -ca);
      }
    }
  }
  const nV = P.length / 3;
  const fill = (x: number, y: number, z: number) => {
    const a: number[] = [];
    for (let i = 0; i < nV; i++) a.push(x, y, z);
    return a;
  };
  const sideIdx: number[] = [],
    endP: number[] = [],
    endN: number[] = [],
    capT: number[] = [],
    capB: number[] = [];
  for (let i = 0; i < NV; i++) {
    for (let k = 0; k < row; k++) {
      const k2 = (k + 1) % row;
      const a = i * row + k,
        b = i * row + k2,
        c = (i + 1) * row + k2,
        d = (i + 1) * row + k;
      const dst = k === NU ? endP : k === row - 1 ? endN : sideIdx;
      dst.push(a, b, c, a, c, d);
    }
  }
  for (const [ri, dst] of [
    [0, capT],
    [NV, capB],
  ] as [number, number[]][]) {
    for (let jj = 0; jj < NU; jj++) {
      const o0 = ri * row + jj,
        o1 = o0 + 1;
      const i0 = ri * row + NU + 1 + (NU - jj),
        i1 = i0 - 1;
      dst.push(o0, o1, i1, o0, i1, i0);
    }
  }
  fixWinding(P, sideIdx, refSide);
  fixWinding(P, endP, fill(Math.cos(sp.arc), 0, Math.sin(sp.arc)));
  fixWinding(P, endN, fill(-Math.cos(sp.arc), 0, Math.sin(sp.arc)));
  fixWinding(P, capT, fill(0, 1, 0));
  fixWinding(P, capB, fill(0, -1, 0));
  const idx = [...sideIdx, ...endP, ...endN, ...capT, ...capB];
  const vd = new VertexData();
  vd.positions = P;
  vd.indices = idx;
  const nor: number[] = [];
  VertexData.ComputeNormals(P, idx, nor);
  vd.normals = nor;
  const m = new Mesh(o.name ?? "shell", scene);
  vd.applyToMesh(m);
  return prep(m, o);
}

const D2R = Math.PI / 180;
const _m = new Matrix();
const _v = new Vector3();

/**
 * Place a feature on the surface of an ellipsoid (centre c, radii r) at yaw/pitch (degrees; yaw + = character's right/+X,
 * pitch + = up). `local` is an offset in the tangent frame (x right, y up, z out). `out` pushes along the normal.
 * Returns pos + Euler rot so a z-flattened shape lies on the surface.
 */
export function placeOn(c: V3, r: V3, yawDeg: number, pitchDeg: number, out = 0, local: V3 = [0, 0, 0]): { pos: V3; rot: V3 } {
  const a = yawDeg * D2R,
    p = pitchDeg * D2R;
  const dx = Math.sin(a) * Math.cos(p),
    dy = Math.sin(p),
    dz = Math.cos(a) * Math.cos(p);
  const k = 1 / Math.sqrt((dx / r[0]) ** 2 + (dy / r[1]) ** 2 + (dz / r[2]) ** 2);
  Matrix.RotationYawPitchRollToRef(a, -p, 0, _m);
  Vector3.TransformCoordinatesFromFloatsToRef(local[0], local[1], local[2] + out, _m, _v);
  return { pos: [c[0] + dx * k + _v.x, c[1] + dy * k + _v.y, c[2] + dz * k + _v.z], rot: [-p, a, 0] };
}

/** Points of a curve drawn on an ellipsoid surface, given [yaw, pitch] pairs in degrees. */
export function surfCurve(c: V3, r: V3, pts: [number, number][], out = 0): V3[] {
  return pts.map(([y, p]) => placeOn(c, r, y, p, out).pos);
}

/** Radius of a lathe profile at height y (linear interpolation). */
export function profileRadius(profile: [number, number][], y: number): number {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i],
      [r1, y1] = profile[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) {
      const t = Math.abs(y1 - y0) < 1e-6 ? 0 : (y - y0) / (y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return 0;
}

/**
 * A band (belt / strap / scarf) wrapped around a lathe-profile body, in a plane tilted by `tilt` (rad, about Z),
 * centred at height y. Returns tube points pushed `gap` off the surface.
 */
export function wrapBand(profile: [number, number][], y: number, tilt: number, gap: number, n = 28, zScale = 1): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 2;
    const dx = Math.cos(th),
      dz = Math.sin(th);
    // the band plane is tilted about Z: height varies with x
    let rr = 0.2;
    let yy = y;
    for (let it = 0; it < 4; it++) {
      yy = y + Math.tan(tilt) * dx * rr;
      rr = profileRadius(profile, yy) + gap;
    }
    pts.push([dx * rr, yy, dz * rr * zScale]);
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

export function charMat(scene: Scene): Material {
  return toonMat(scene, { name: "charToon", rim: 0.3 });
}
export function eyeMat(scene: Scene): Material {
  return toonMat(scene, { name: "charEye", rim: 0.0, shade: 0.85 });
}

/** Outline colour as it appears after the post pipeline (matches Babylon renderOutline "ink" on world props). */
export const OUTLINE_COLOR = "#7f6c8c";
const hullMats = new WeakMap<Scene, StandardMaterial>();
function hullMat(scene: Scene): StandardMaterial {
  let m = hullMats.get(scene);
  if (!m) {
    m = new StandardMaterial("charOutline", scene);
    m.disableLighting = true;
    m.emissiveColor = col(OUTLINE_COLOR);
    m.diffuseColor.set(0, 0, 0);
    m.specularColor.set(0, 0, 0);
    m.backFaceCulling = true;
    m.cullBackFaces = false; // draw only the inside of the hull
    m.freeze();
    hullMats.set(scene, m);
  }
  return m;
}

/**
 * Inverted-hull outline: an ink copy of the mesh pushed out along its normals with front faces culled.
 * Unlike Babylon's renderOutline it doesn't write depth in front of the surface, so eyes/cheeks that sit
 * just above a head still show; it also costs one draw instead of two.
 */
export function addHull(m: Mesh, width: number): Mesh {
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
  h.material = hullMat(scene);
  h.parent = m.parent;
  h.position.copyFrom(m.position);
  h.isPickable = false;
  h.receiveShadows = false;
  return h;
}

/* ------------------------------------------------------------------ */
/* Rig                                                                 */
/* ------------------------------------------------------------------ */

export interface Persona {
  walkFreq: number; // stride cycles per second at a walk
  runFreq: number; // ... at a run
  stride: number; // leg swing (rad) at full run
  armSwing: number; // arm swing (rad) at full run
  bob: number; // body bob (m) at full run
  lean: number; // forward lean at full run (rad)
  breathe: number; // idle breathing scale amplitude
  breathRate: number; // rad/s
  sway: number; // idle side sway (rad)
  idleBounce: number; // extra idle bounce (m) – energetic characters
  hop: number; // celebrate hop height (m)
  armRestZ: number; // arms slightly out from the body (rad)
  headTilt: number; // idle curious head tilt amplitude (rad)
  glance: number; // idle glance-around amplitude (rad)
}

export const DEFAULT_PERSONA: Persona = {
  walkFreq: 1.55,
  runFreq: 2.5,
  stride: 0.62,
  armSwing: 0.75,
  bob: 0.04,
  lean: 0.16,
  breathe: 0.014,
  breathRate: 2.3,
  sway: 0.025,
  idleBounce: 0,
  hop: 0.26,
  armRestZ: 0.14,
  headTilt: 0.05,
  glance: 0.45,
};

export interface RigSpec {
  name: string;
  height: number;
  hipY: number; // body pivot height
  neck: V3; // head pivot (character space)
  headY: number; // head centre height (look-at origin)
  eyes: V3; // eye pivot (blink)
  mouth: V3; // open-mouth pivot
  shoulder: V3; // right shoulder (+X); mirrored for left
  hip: V3; // right leg pivot (+X); mirrored for left
  persona?: Partial<Persona>;
}

/** A springy secondary part (ears, tails, antennae). */
export interface SecondarySpec {
  node: TransformNode;
  axis: "x" | "y" | "z";
  /** spring stiffness / damping */
  k?: number;
  d?: number;
  /** response to body vertical acceleration (rad per m/s²) */
  gy?: number;
  /** response to head/body yaw velocity (rad per rad/s) */
  gyaw?: number;
  /** response to forward speed (constant drag, rad) */
  gspeed?: number;
  /** continuous wag */
  wagAmp?: number;
  wagFreq?: number;
  /** random twitches (avg per second) and strength (rad/s impulse) */
  twitch?: number;
  twitchAmp?: number;
  min?: number;
  max?: number;
}

interface Secondary extends Required<Omit<SecondarySpec, "node" | "axis">> {
  node: TransformNode;
  axis: "x" | "y" | "z";
  base: number;
  a: number;
  v: number;
  ph: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth01 = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

const EMOTE_DUR: Record<EmoteKind, number> = { wave: 1.3, happy: 1.1, surprised: 1.0, think: 1.7, nod: 1.0 };

export class Rig implements CharacterModel {
  root: TransformNode;
  /** inner node: hops & whole-body squash (pivot at feet) */
  rig: TransformNode;
  body: TransformNode;
  head: TransformNode;
  eyes: TransformNode;
  mouth: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  height: number;
  persona: Persona;
  spec: RigSpec;
  private pivots = new Map<TransformNode, V3>();
  private secs: Secondary[] = [];
  private rnd: () => number;

  // animation state
  private t = 0;
  private spd = 0;
  private phase = 0;
  private blinkT = 1;
  private blinkNext = 2;
  private doubleBlink = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookTarget: Vector3 | null = null;
  private glanceYaw = 0;
  private glancePitch = 0;
  private glanceNext = 3;
  private glanceHold = 0;
  private talkAmt = 0;
  private celebAmt = 0;
  private celebT = 0;
  private emoteKind: EmoteKind | null = null;
  private emoteT = 0;
  private yPrev = 0;
  private vyPrev = 0;
  private yawPrev = 0;
  private landSquash = 0;
  private airPrev = false;
  private mouthMeshes: Mesh[] = [];
  private _inv = new Matrix();
  private _tv = new Vector3();

  constructor(
    public scene: Scene,
    spec: RigSpec,
    seed = 1,
  ) {
    this.spec = spec;
    this.height = spec.height;
    this.persona = { ...DEFAULT_PERSONA, ...(spec.persona ?? {}) };
    let s = (seed * 2654435761) >>> 0;
    this.rnd = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.blinkNext = 0.5 + this.rnd() * 3;
    this.glanceNext = 1 + this.rnd() * 4;
    this.t = this.rnd() * 10;

    this.root = new TransformNode(spec.name, scene);
    this.pivots.set(this.root, [0, 0, 0]);
    this.rig = this.node("rig", this.root, [0, 0, 0]);
    this.body = this.node("body", this.rig, [0, spec.hipY, 0]);
    this.head = this.node("head", this.body, spec.neck);
    this.eyes = this.node("eyes", this.head, spec.eyes);
    this.mouth = this.node("mouth", this.head, spec.mouth);
    const sh = spec.shoulder,
      hp = spec.hip;
    this.armR = this.node("armR", this.body, sh);
    this.armL = this.node("armL", this.body, [-sh[0], sh[1], sh[2]]);
    this.legR = this.node("legR", this.rig, hp);
    this.legL = this.node("legL", this.rig, [-hp[0], hp[1], hp[2]]);
    this.mouth.setEnabled(false);
  }

  /** Create an animation node at a character-space pivot. */
  node(name: string, parent: TransformNode, charPos: V3): TransformNode {
    const n = new TransformNode(`${this.spec.name}.${name}`, this.scene);
    n.parent = parent;
    const pp = this.pivots.get(parent) ?? [0, 0, 0];
    n.position.set(charPos[0] - pp[0], charPos[1] - pp[1], charPos[2] - pp[2]);
    this.pivots.set(n, [charPos[0], charPos[1], charPos[2]]);
    return n;
  }

  pivot(n: TransformNode): V3 {
    return this.pivots.get(n) ?? [0, 0, 0];
  }

  addSecondary(s: SecondarySpec) {
    const base = s.node.rotation[s.axis];
    this.secs.push({
      node: s.node,
      axis: s.axis,
      k: s.k ?? 90,
      d: s.d ?? 7,
      gy: s.gy ?? 0.012,
      gyaw: s.gyaw ?? 0,
      gspeed: s.gspeed ?? 0,
      wagAmp: s.wagAmp ?? 0,
      wagFreq: s.wagFreq ?? 1,
      twitch: s.twitch ?? 0,
      twitchAmp: s.twitchAmp ?? 4,
      min: s.min ?? -0.8,
      max: s.max ?? 0.8,
      base,
      a: 0,
      v: 0,
      ph: this.rnd() * TAU,
    });
  }

  registerMouthMeshes(ms: Mesh[]) {
    this.mouthMeshes.push(...ms);
  }

  /** Dispose all meshes (not nodes) — used when rebuilding a look. */
  clearMeshes() {
    for (const m of this.root.getChildMeshes(false)) m.dispose(false, false);
    this.mouthMeshes.length = 0;
  }

  lookAt(target: Vector3 | null) {
    this.lookTarget = target;
  }

  emote(kind: EmoteKind) {
    this.emoteKind = kind;
    this.emoteT = 0;
    if (kind === "surprised") this.blinkT = 1;
  }

  dispose() {
    this.root.dispose(false, false);
    this.secs.length = 0;
  }

  update(dt: number, s: CharacterAnimState) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    const P = this.persona;
    const rnd = this.rnd;
    this.t += dt;
    const t = this.t;

    /* ---------- locomotion ---------- */
    const tgtSpd = clamp(s.speed || 0, 0, 1);
    this.spd += (tgtSpd - this.spd) * (1 - Math.exp(-dt * 9));
    const sp = this.spd;
    const amp = smooth01(0.0, 0.22, sp);
    const freq = P.walkFreq + (P.runFreq - P.walkFreq) * smooth01(0.35, 1, sp);
    this.phase += dt * freq * TAU * (amp > 0.001 ? 1 : 0);
    if (amp < 0.001) this.phase = 0;
    const sw = Math.sin(this.phase);
    const run = 0.55 + 0.45 * sp;
    const stride = P.stride * run * amp;
    const bobW = Math.abs(Math.cos(this.phase));
    const bob = bobW * P.bob * amp * (0.45 + 0.55 * sp);

    /* ---------- emotes ---------- */
    let eWave = 0,
      eHappy = 0,
      eSurp = 0,
      eThink = 0,
      eNod = 0,
      et = 0;
    if (this.emoteKind) {
      this.emoteT += dt;
      et = this.emoteT;
      const dur = EMOTE_DUR[this.emoteKind];
      if (et >= dur) this.emoteKind = null;
      else {
        const w = smooth01(0, 0.16, et) * (1 - smooth01(dur - 0.28, dur, et));
        switch (this.emoteKind) {
          case "wave": eWave = w; break;
          case "happy": eHappy = w; break;
          case "surprised": eSurp = w; break;
          case "think": eThink = w; break;
          case "nod": eNod = w; break;
        }
      }
    }

    /* ---------- talk / celebrate blend ---------- */
    this.talkAmt += ((s.talking ? 1 : 0) - this.talkAmt) * (1 - Math.exp(-dt * 8));
    this.celebAmt += ((s.celebrate ? 1 : 0) - this.celebAmt) * (1 - Math.exp(-dt * 7));
    if (s.celebrate) this.celebT += dt;
    else if (this.celebAmt < 0.02) this.celebT = 0;

    // celebrate hops
    let jump = 0;
    let squash = 0;
    const cel = this.celebAmt;
    if (cel > 0.01) {
      const period = 0.66;
      const pp = (this.celebT % period) / period;
      const air = 0.72;
      if (pp < air) {
        const q = pp / air;
        jump = P.hop * 4 * q * (1 - q) * cel;
        squash -= 0.07 * Math.sin(q * Math.PI) * cel; // stretch in the air
      } else {
        const q = (pp - air) / (1 - air);
        squash += 0.14 * Math.sin(q * Math.PI) * cel; // squash on landing
      }
    }
    // emote hops
    if (eHappy > 0) {
      const q = clamp(et / 0.42, 0, 2);
      const h = q < 1 ? Math.sin(q * Math.PI) : Math.sin((q - 1) * Math.PI) * 0.6;
      jump += 0.09 * h * eHappy;
    }
    if (eSurp > 0) {
      const q = clamp(et / 0.35, 0, 1);
      jump += 0.08 * Math.sin(q * Math.PI);
      squash -= 0.12 * Math.exp(-et * 6) * (et < 0.5 ? 1 : 0);
    }
    // landing squash from walking/running footfalls
    const air = jump > 0.004;
    if (this.airPrev && !air) this.landSquash = 0.1;
    this.airPrev = air;
    this.landSquash *= Math.exp(-dt * 10);
    squash += this.landSquash;
    squash += (1 - bobW) * 0.035 * amp * sp; // tiny squash at each footfall

    /* ---------- idle ---------- */
    const idleW = 1 - amp;
    const breath = Math.sin(t * P.breathRate);
    const bounce = P.idleBounce * Math.abs(Math.sin(t * 3.4)) * idleW;
    const sway = P.sway * Math.sin(t * 0.9) * idleW + 0.02 * eHappy * Math.sin(t * 16);

    /* ---------- look ---------- */
    let tYaw = 0,
      tPitch = 0;
    if (this.lookTarget) {
      this.root.getWorldMatrix().invertToRef(this._inv);
      Vector3.TransformCoordinatesToRef(this.lookTarget, this._inv, this._tv);
      const dx = this._tv.x,
        dy = this._tv.y - this.spec.headY,
        dz = this._tv.z;
      const hd = Math.hypot(dx, dz);
      if (hd > 0.05) {
        tYaw = clamp(Math.atan2(dx, dz), -1.25, 1.25);
        tPitch = clamp(-Math.atan2(dy, hd), -0.45, 0.35);
      }
    } else if (amp < 0.2 && !s.talking) {
      // idle glances
      this.glanceNext -= dt;
      if (this.glanceNext <= 0) {
        if (this.glanceHold > 0 || rnd() < 0.35) {
          this.glanceYaw = 0;
          this.glancePitch = 0;
          this.glanceHold = 0;
          this.glanceNext = 2 + rnd() * 4;
        } else {
          this.glanceYaw = (rnd() * 2 - 1) * P.glance;
          this.glancePitch = (rnd() * 2 - 1) * 0.12;
          this.glanceHold = 1;
          this.glanceNext = 1.2 + rnd() * 2;
        }
      }
      tYaw = this.glanceYaw;
      tPitch = this.glancePitch;
    } else {
      this.glanceYaw = 0;
      this.glancePitch = 0;
    }
    const lk = 1 - Math.exp(-dt * 6);
    this.lookYaw += (tYaw - this.lookYaw) * lk;
    this.lookPitch += (tPitch - this.lookPitch) * lk;
    const yawVel = (this.lookYaw - this.yawPrev) / dt;
    this.yawPrev = this.lookYaw;

    /* ---------- blink ---------- */
    this.blinkNext -= dt;
    if (this.blinkNext <= 0) {
      this.blinkT = 0;
      if (this.doubleBlink) {
        this.doubleBlink = false;
        this.blinkNext = 2 + rnd() * 3.5;
      } else if (rnd() < 0.2) {
        this.doubleBlink = true;
        this.blinkNext = 0.22;
      } else this.blinkNext = 1.8 + rnd() * 3.5;
    }
    this.blinkT += dt;
    const bl = this.blinkT < 0.16 ? Math.abs(Math.cos((this.blinkT / 0.16) * Math.PI)) : 1;
    const blink = 0.08 + 0.92 * bl;

    /* ---------- compose: rig ---------- */
    this.rig.position.y = jump + bounce;
    const sq = clamp(squash, -0.2, 0.25);
    this.rig.scaling.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);

    /* ---------- body ---------- */
    const b = this.body;
    b.position.y = this.spec.hipY + bob + breath * 0.004;
    const bs = 1 + breath * P.breathe * idleW;
    b.scaling.set(1 - (bs - 1) * 0.4, bs, 1 - (bs - 1) * 0.4);
    b.rotation.x = P.lean * amp * (0.35 + 0.65 * sp) - 0.12 * eSurp + 0.06 * eThink;
    b.rotation.y = this.lookYaw * 0.28 + sw * 0.08 * amp;
    b.rotation.z = sway + Math.sin(this.phase) * 0.03 * amp;

    /* ---------- head ---------- */
    const h = this.head;
    const talkNod = this.talkAmt * (Math.sin(t * 5.2) * 0.05 + Math.sin(t * 2.3) * 0.03);
    const nod = eNod * Math.sin(clamp(et / 0.9, 0, 1) * TAU * 2) * 0.32;
    h.rotation.y = this.lookYaw * 0.72 - b.rotation.y * 0.0;
    h.rotation.x = this.lookPitch + talkNod + nod - bob * 1.2 - 0.12 * eThink - 0.1 * eSurp + 0.08 * eHappy - 0.12 * cel;
    h.rotation.z =
      P.headTilt * Math.sin(t * 0.7 + 1.3) * idleW +
      this.talkAmt * Math.sin(t * 1.7) * 0.06 +
      0.22 * eThink +
      0.1 * eWave +
      eHappy * 0.12 * Math.sin(t * 9) -
      sway * 0.6;

    /* ---------- face ---------- */
    let eyeY = blink;
    let eyeX = 1;
    const squint = Math.max(eHappy, cel * 0.9);
    eyeY *= 1 - 0.6 * squint;
    eyeX *= 1 + 0.08 * squint;
    if (eSurp > 0) {
      const pop = 1 + 0.32 * eSurp;
      eyeY = Math.max(eyeY, 0.9) * pop;
      eyeX *= pop;
    }
    this.eyes.scaling.set(eyeX, eyeY, 1);

    let mouthOpen = 0;
    if (this.talkAmt > 0.02) {
      const m = Math.sin(t * 13.0) * 0.55 + Math.sin(t * 7.7 + 1) * 0.35 + Math.sin(t * 3.1) * 0.25;
      mouthOpen = clamp(m, 0, 1) * this.talkAmt;
    }
    mouthOpen = Math.max(mouthOpen, eSurp * 0.85, cel * 0.75, eHappy * 0.6);
    if (mouthOpen > 0.06) {
      if (!this.mouth.isEnabled(false)) this.mouth.setEnabled(true);
      this.mouth.scaling.set(0.85 + 0.15 * mouthOpen, mouthOpen, 1);
    } else if (this.mouth.isEnabled(false)) this.mouth.setEnabled(false);

    /* ---------- limbs ---------- */
    const rest = P.armRestZ + 0.12 * sp * amp;
    const swingA = P.armSwing * run * amp;
    let rX = sw * swingA,
      lX = -sw * swingA;
    let rZ = rest,
      lZ = -rest;
    // celebrate: both arms up, little shakes
    if (cel > 0.001) {
      const up = 2.55 + Math.sin(t * 14) * 0.12;
      rZ += (up - rZ) * cel;
      lZ += (-up - lZ) * cel;
      rX *= 1 - cel;
      lX *= 1 - cel;
    }
    // talking: gentle gestures with the right hand
    if (this.talkAmt > 0.01) {
      rX += (-0.45 + Math.sin(t * 2.6) * 0.25) * this.talkAmt * idleW;
      rZ += 0.15 * this.talkAmt * Math.max(0, Math.sin(t * 1.3));
      lX += -0.12 * this.talkAmt * idleW;
    }
    if (eWave > 0) {
      const wv = 2.5 + Math.sin(et * 15) * 0.38;
      rZ += (wv - rZ) * eWave;
      rX += (-0.25 - rX) * eWave;
    }
    if (eHappy > 0) {
      rZ += (1.1 - rZ) * eHappy;
      lZ += (-1.1 - lZ) * eHappy;
    }
    if (eSurp > 0) {
      rZ += (0.95 - rZ) * eSurp;
      lZ += (-0.95 - lZ) * eSurp;
      rX += (-0.5 - rX) * eSurp;
      lX += (-0.5 - lX) * eSurp;
    }
    if (eThink > 0) {
      // right paw to chin
      rX += (-2.05 - rX) * eThink;
      rZ += (-0.5 - rZ) * eThink;
      lX += (-0.5 - lX) * eThink * 0.6;
      lZ += (-0.35 - lZ) * eThink * 0.6;
    }
    this.armR.rotation.set(rX, 0, rZ);
    this.armL.rotation.set(lX, 0, lZ);

    // legs: swing, plus a little tuck while airborne
    const tuck = clamp(jump * 3, 0, 0.5);
    this.legR.rotation.x = -sw * stride - tuck * 0.6;
    this.legL.rotation.x = sw * stride - tuck * 0.6;
    this.legR.rotation.z = tuck * 0.5;
    this.legL.rotation.z = -tuck * 0.5;
    const lift = 0.025 * amp * run;
    this.legR.position.y = this.spec.hip[1] + Math.max(0, Math.cos(this.phase)) * lift;
    this.legL.position.y = this.spec.hip[1] + Math.max(0, -Math.cos(this.phase)) * lift;

    /* ---------- secondary motion ---------- */
    const y = this.rig.position.y + bob;
    const vy = (y - this.yPrev) / dt;
    const ay = clamp((vy - this.vyPrev) / dt, -40, 40);
    this.yPrev = y;
    this.vyPrev = vy;
    for (let i = 0; i < this.secs.length; i++) {
      const q = this.secs[i];
      let f = -q.k * q.a - q.d * q.v + q.k * (q.gy * ay + q.gyaw * yawVel + q.gspeed * sp);
      if (q.twitch > 0 && rnd() < q.twitch * dt) q.v += (rnd() < 0.5 ? -1 : 1) * q.twitchAmp;
      q.v += f * dt;
      q.a = clamp(q.a + q.v * dt, q.min, q.max);
      const wag = q.wagAmp ? Math.sin(t * q.wagFreq * TAU + q.ph) * q.wagAmp * (1 + cel + this.talkAmt * 0.5) : 0;
      q.node.rotation[q.axis] = q.base + q.a + wag;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Kit: shapes grouped per animated node → one draw call per group      */
/* ------------------------------------------------------------------ */

/** Default character outline width (local units). */
export const OUTLINE_W = 0.016;

interface KitGroup {
  node: TransformNode;
  opts: BuildOpts;
  meshes: Mesh[];
  /** parts merged into the same mesh but left out of the outline hull (cheeks, smiles, brows) */
  flat: Mesh[];
  mouth?: boolean;
}

export class Kit {
  private groups = new Map<string, KitGroup>();
  constructor(
    public scene: Scene,
    public rig: Rig,
  ) {}

  def(name: string, node: TransformNode, opts: BuildOpts = {}, mouth = false) {
    this.groups.set(name, { node, opts, meshes: [], flat: [], mouth });
    return this;
  }

  /** Route a group name into another group's un-outlined parts (same draw call, no ink halo). */
  flatInto(name: string, target: string) {
    const g = this.groups.get(target);
    if (!g) throw new Error(`Kit group ${target} not defined`);
    this.flats.set(name, g);
    return this;
  }
  private flats = new Map<string, KitGroup>();

  add(name: string, ...ms: Mesh[]) {
    const f = this.flats.get(name);
    if (f) {
      f.flat.push(...ms);
      return;
    }
    const g = this.groups.get(name);
    if (!g) throw new Error(`Kit group ${name} not defined`);
    g.meshes.push(...ms);
  }

  build(): Mesh[] {
    const out: Mesh[] = [];
    const cm = charMat(this.scene),
      em = eyeMat(this.scene);
    for (const [name, g] of this.groups) {
      if (!g.meshes.length && !g.flat.length) continue;
      const mat = g.opts.material ?? (g.opts.outline === false ? em : cm);
      const ol = g.opts.outline === false ? 0 : (g.opts.outline ?? OUTLINE_W);
      const p = this.rig.pivot(g.node);
      let m = g.meshes.length ? Mesh.MergeMeshes(g.meshes, true, true, undefined, false, false) : null;
      if (m && ol > 0) {
        const h = addHull(m, ol);
        h.parent = g.node;
        h.position.set(-p[0], -p[1], -p[2]);
        out.push(h);
      }
      if (g.flat.length) m = Mesh.MergeMeshes(m ? [m, ...g.flat] : g.flat, true, true, undefined, false, false);
      g.meshes = [];
      g.flat = [];
      if (!m) continue;
      m.name = `${this.rig.spec.name}.${name}`;
      finishMesh(m, this.scene, { ...g.opts, outline: false, material: mat });
      m.parent = g.node;
      m.position.set(-p[0], -p[1], -p[2]);
      m.freezeNormals();
      m.isPickable = false;
      if (g.mouth) this.rig.registerMouthMeshes([m]);
      out.push(m);
    }
    return out;
  }
}
