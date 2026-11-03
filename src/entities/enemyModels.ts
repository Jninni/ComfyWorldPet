/**
 * enemyModels — the Gloomies: grumpy-cute smoky plush baddies of the Thornwild.
 *
 * Rig per enemy:
 *   root (game moves / rotates / scales)          ← EnemyModel.root
 *     base  (pivot at the feet: hop, squash & stretch, lunge, tilt, shake, poof)
 *       body mesh (+ ink hull)  — brows/mouth merged in, flashes white on hit
 *       eyes mesh               — emissive glow, flares (scale + brighten) on windup
 *       kind parts: legs (thornbug), cap (puffspitter), crown/cape/arms (gloomking)
 *       wisps                   — thin-instanced shadow-smoke puffs (1 draw)
 *
 * update() allocates nothing. All timings are in seconds.
 */
import { TransformNode, Vector3, type Mesh, type Scene, type StandardMaterial } from "@babylonjs/core";
import { toonMat } from "../render/Toon";
import { lathe, type V3 } from "../render/Shapes";
import { faceShapes } from "./critterParts";
import {
  fxMat,
  setFlash,
  makePart,
  grumpyFace,
  thornsOn,
  hornM,
  capeM,
  Wisps,
  ballM,
  blobM,
  softConeM,
  capOn,
  puffStar,
  tubeM,
  surf,
  add,
  rotYTo,
  type FxMat,
  type Ell,
} from "./enemyParts";

export type EnemyKind = "gloomblob" | "thornbug" | "puffspitter" | "gloomking";
export const ENEMY_KINDS: EnemyKind[] = ["gloomblob", "thornbug", "puffspitter", "gloomking"];

export interface EnemyAnimState {
  speed: number; // 0..1
  windup?: boolean; // telegraph before attacking
}

export interface EnemyModel {
  root: TransformNode; // origin at feet, faces +Z; the game moves/rotates root (and may scale it)
  height: number;
  radius: number; // collision/hit radius
  update(dt: number, s: EnemyAnimState): void;
  attack(): void;
  hit(): void;
  poof(): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

export const ENEMY_INFO: Record<EnemyKind, { name: string; hp: number; speed: number; damage: number; color: string }> = {
  gloomblob: { name: "Gloomblob", hp: 3, speed: 2.4, damage: 1, color: "#6f5aa8" },
  thornbug: { name: "Thornbug", hp: 2, speed: 3.6, damage: 1, color: "#5a4488" },
  puffspitter: { name: "Puffspitter", hp: 3, speed: 1.0, damage: 1, color: "#5b3f80" },
  gloomking: { name: "Gloom King", hp: 24, speed: 1.8, damage: 1, color: "#4a3878" },
};

/**
 * Attack timing per kind: `dur` = length of attack(), `impact` = seconds after attack() when the bump/bite lands,
 * the gloom ball should spawn (puffspitter) or the ground-pound hits (gloomking).
 */
export const ENEMY_ATTACK: Record<EnemyKind, { dur: number; impact: number }> = {
  gloomblob: { dur: 0.42, impact: 0.2 },
  thornbug: { dur: 0.36, impact: 0.15 },
  puffspitter: { dur: 0.42, impact: 0.12 },
  gloomking: { dur: 1.1, impact: 0.7 },
};

/** Rig-space position of the puffspitter's snout (where its gloom ball appears), before root transforms. */
export const PUFFSPITTER_MUZZLE: V3 = [0, 0.27, 0.4];

export const HIT_DUR = 0.28;
export const POOF_DUR = 0.4;

/* ------------------------------------------------------------------ */
/* Colours                                                             */
/* ------------------------------------------------------------------ */

const C = {
  ink: "#1f1530",
  hull: "#2a1d3a",
  thorn: "#35274f",
  thornTip: "#c58ae6",
  horn: "#2e2346",
  hornTip: "#b89ae6",
  amber: "#ffc23a",
  magenta: "#ff5cd6",
  rim: "#ffa8f2",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Piecewise smoothstep keyframes (no allocation). */
function kf(t: number, T: readonly number[], V: readonly number[]): number {
  if (t <= T[0]) return V[0];
  for (let i = 1; i < T.length; i++) {
    if (t < T[i]) {
      const u = (t - T[i - 1]) / (T[i] - T[i - 1]);
      return V[i - 1] + (V[i] - V[i - 1]) * u * u * (3 - 2 * u);
    }
  }
  return V[V.length - 1];
}

interface Track {
  T: number[];
  z: number[];
  y: number[];
  sq: number[];
  pitch: number[];
  /** kind-specific channel (cheek puff / arm raise) */
  x?: number[];
}

const TRACKS: Record<EnemyKind, Track> = {
  gloomblob: { T: [0, 0.1, 0.2, 0.28, 0.42], z: [0, -0.05, 0.3, 0.22, 0], y: [0, 0, 0.08, 0.02, 0], sq: [0, -0.22, 0.16, -0.08, 0], pitch: [0, -0.2, 0.34, 0.1, 0] },
  thornbug: { T: [0, 0.07, 0.15, 0.24, 0.36], z: [0, -0.07, 0.3, 0.24, 0], y: [0, 0, 0.04, 0.01, 0], sq: [0, -0.12, 0.1, 0, 0], pitch: [0, -0.22, 0.26, 0.12, 0] },
  puffspitter: { T: [0, 0.08, 0.13, 0.24, 0.42], z: [0, 0.02, 0.05, -0.09, 0], y: [0, 0, 0, 0, 0], sq: [0, -0.18, 0.12, -0.06, 0], pitch: [0, 0.06, 0.18, -0.24, 0], x: [0, 0.24, -0.12, 0.04, 0] },
  gloomking: {
    T: [0, 0.4, 0.52, 0.62, 0.7, 0.82, 1.1],
    z: [0, -0.1, 0.05, 0.15, 0.2, 0.18, 0],
    y: [0, 0, 0.6, 0.85, 0, 0, 0],
    sq: [0, -0.2, 0.16, 0.1, -0.3, 0.07, 0],
    pitch: [0, -0.12, -0.05, 0.04, 0.12, 0.02, 0],
    x: [0, 1, 1, 0.9, -0.35, -0.15, 0],
  },
};

type Gait = "hop" | "scuttle" | "waddle" | "stomp";

interface Cfg {
  gait: Gait;
  freq: number;
  hopH: number;
  squash: number;
  /** jelly wobble from the vertical spring */
  jelly: number;
  /** how hard hits knock it (boss = less) */
  knock: number;
  /** poof swell */
  swell: number;
  breathe: number;
  height: number;
  radius: number;
  /** windup telegraph tint (added rim colour) */
  tint: [number, number, number];
}

const DEF: Cfg = {
  gait: "hop",
  freq: 2.2,
  hopH: 0.14,
  squash: 0.18,
  jelly: 0.08,
  knock: 1,
  swell: 0.38,
  breathe: 0.03,
  height: 0.8,
  radius: 0.4,
  tint: [1, 0.35, 0.85],
};

/** Mutable per-frame pose (allocated once). */
interface Pose {
  x: number;
  y: number;
  z: number;
  sq: number;
  sw: number;
  pitch: number;
  roll: number;
  yaw: number;
}

interface Parts {
  root: TransformNode;
  base: TransformNode;
  eyes: Mesh | null;
  eyeRest: Vector3;
  bodyMats: FxMat[];
  eyeMat: FxMat | null;
  wisps: Wisps[];
  ownMats: StandardMaterial[];
  /** kind-specific per-frame hook (runs after the base pose is computed) */
  hook?: (e: Enemy, dt: number) => void;
}

let seed = 1;

class Enemy implements EnemyModel {
  root: TransformNode;
  height: number;
  radius: number;
  readonly p: Parts;
  readonly cfg: Cfg;
  readonly track: Track | null;
  readonly atkDur: number;
  readonly pose: Pose = { x: 0, y: 0, z: 0, sq: 0, sw: 0, pitch: 0, roll: 0, yaw: 0 };

  t = Math.random() * 10;
  move = 0;
  wind = 0;
  phase = 0;
  /** gait cycle angle (rad), for legs */
  th = 0;
  atkT = -1;
  hitT = -1;
  poofT = -1;
  dead = false;
  /** 0..1 eye flare this frame */
  flare = 0;
  /** jelly spring */
  jig = 0;
  jigV = 0;
  private pY = 0;
  private pV = 0;
  private first = true;
  readonly id = seed++;

  constructor(p: Parts, cfg: Cfg, track: Track | null, atkDur: number) {
    this.p = p;
    this.cfg = cfg;
    this.track = track;
    this.atkDur = atkDur;
    this.root = p.root;
    this.height = cfg.height;
    this.radius = cfg.radius;
    this.phase = Math.random();
    this.update(1 / 60, { speed: 0 });
  }

  attack() {
    if (this.dead || this.poofT >= 0) return;
    this.atkT = 0;
  }
  hit() {
    if (this.dead || this.poofT >= 0) return;
    this.hitT = 0;
    this.jigV -= 5 * this.cfg.knock;
  }
  poof() {
    if (this.dead || this.poofT >= 0) return;
    this.poofT = 0;
    this.atkT = -1;
  }
  setEnabled(on: boolean) {
    this.root.setEnabled(on);
  }
  dispose() {
    for (const w of this.p.wisps) w.dispose();
    this.root.dispose(false, false);
    for (const m of this.p.ownMats) m.dispose(true, false);
  }

  /** attack progress channel helper for hooks */
  atk(ch: "x" | "y" | "z" | "sq" | "pitch"): number {
    const tr = this.track;
    if (!tr || this.atkT < 0) return 0;
    const V = tr[ch];
    return V ? kf(this.atkT, tr.T, V) : 0;
  }

  update(dt: number, s: EnemyAnimState) {
    if (this.dead) return;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    const c = this.cfg;
    const H = c.height;
    const t = (this.t += dt);
    const o = this.pose;
    const tgt = clamp01(s.speed || 0);
    this.move = damp(this.move, tgt, 8, dt);
    this.wind = damp(this.wind, s.windup ? 1 : 0, s.windup ? 12 : 7, dt);
    const mv = this.move,
      wd = this.wind;
    o.x = o.y = o.z = o.sq = o.sw = o.pitch = o.roll = o.yaw = 0;

    /* ---------------- locomotion ---------------- */
    const rate = c.freq * (0.65 + 0.35 * tgt);
    if (c.gait === "hop") {
      const hopping = mv > 0.04 || this.phase > 0.02;
      if (hopping) {
        this.phase += dt * rate;
        if (this.phase >= 1) this.phase = mv > 0.04 ? this.phase - 1 : 0;
      }
      const p = this.phase,
        A = Math.min(1, mv * 1.4);
      const CT = 0.3;
      if (p < CT) o.sq -= c.squash * Math.sin((Math.PI * p) / CT) * A;
      else {
        const u = (p - CT) / (1 - CT);
        o.y += c.hopH * A * 4 * u * (1 - u);
        const k = 1 - 2 * u;
        o.sq += c.squash * 0.7 * (1 - k * k) * A;
        o.pitch += 0.14 * (1 - 2 * u) * A * -1 + 0.06 * A;
      }
      this.th = p * TAU;
    } else {
      this.phase = (this.phase + dt * rate * Math.min(1, mv * 2.5 + (c.gait === "scuttle" ? wd * 1.6 : 0))) % 1;
      const th = (this.th = this.phase * TAU);
      if (c.gait === "scuttle") {
        o.y += 0.012 * mv * Math.abs(Math.sin(th * 2));
        o.roll += 0.05 * mv * Math.sin(th);
        o.pitch += 0.05 * mv;
      } else if (c.gait === "waddle") {
        o.roll += 0.1 * mv * Math.sin(th);
        o.y += 0.04 * mv * Math.abs(Math.sin(th));
        o.yaw += 0.08 * mv * Math.sin(th);
        o.sq += 0.04 * mv * Math.cos(2 * th);
      } else {
        // stomp: heavy side-to-side rock with a thump on each foot
        const st = Math.sin(th);
        o.roll += 0.07 * mv * st;
        o.y += 0.07 * mv * Math.abs(st);
        o.sq -= 0.05 * mv * (1 - Math.abs(st));
        o.yaw += 0.05 * mv * st;
        o.pitch += 0.05 * mv;
      }
    }

    /* ---------------- idle life ---------------- */
    const still = 1 - mv;
    o.sq += Math.sin(t * 3.1) * c.breathe * (0.4 + 0.6 * still);
    o.roll += Math.sin(t * 1.3) * 0.035 * still;
    o.yaw += Math.sin(t * 0.7) * 0.06 * still;

    /* ---------------- windup telegraph ---------------- */
    if (wd > 0.001) {
      o.x += Math.sin(t * 61) * 0.022 * H * wd;
      o.roll += Math.sin(t * 47) * 0.06 * wd;
      o.sq -= (0.14 + 0.03 * Math.sin(t * 29)) * wd;
      o.sw += 0.06 * wd;
      o.pitch -= 0.08 * wd;
    }

    /* ---------------- attack ---------------- */
    const tr = this.track;
    if (this.atkT >= 0 && tr) {
      this.atkT += dt;
      if (this.atkT >= this.atkDur) this.atkT = -1;
      else {
        const a = this.atkT;
        o.z += kf(a, tr.T, tr.z);
        o.y += kf(a, tr.T, tr.y);
        o.sq += kf(a, tr.T, tr.sq);
        o.pitch += kf(a, tr.T, tr.pitch);
      }
    }

    /* ---------------- hit ---------------- */
    let flash = 0;
    if (this.hitT >= 0) {
      this.hitT += dt;
      const u = this.hitT / HIT_DUR;
      if (u >= 1) this.hitT = -1;
      else {
        const env = Math.sin(Math.PI * Math.min(1, u * 1.25)) * (1 - u * 0.4);
        const k = c.knock;
        o.sq -= 0.24 * env * k;
        o.sw += 0.1 * env * k;
        o.pitch -= 0.34 * env * k;
        o.z -= 0.06 * H * env * k;
        o.roll += 0.08 * env * k * Math.sin(this.id * 2.7);
        flash = this.hitT < 0.2 ? 1 - Math.pow(this.hitT / 0.2, 2) : 0;
      }
    }

    /* ---------------- jelly spring ---------------- */
    const yy = o.y;
    if (this.first) {
      this.pY = yy;
      this.pV = 0;
      this.first = false;
    }
    const v = (yy - this.pY) / dt;
    const acc = Math.max(-40, Math.min(40, (v - this.pV) / dt));
    this.pY = yy;
    this.pV = v;
    const n = Math.ceil(dt / 0.01),
      h = dt / n;
    for (let i = 0; i < n; i++) {
      this.jigV += (-160 * this.jig - 7 * this.jigV - acc * 0.9) * h;
      this.jig += this.jigV * h;
    }
    this.jig = Math.max(-0.8, Math.min(0.8, this.jig));
    o.sq += this.jig * c.jelly;

    /* ---------------- poof ---------------- */
    let scaleAll = 1;
    if (this.poofT >= 0) {
      this.poofT += dt;
      const u = this.poofT / POOF_DUR;
      if (u >= 1) {
        this.dead = true;
        this.p.base.setEnabled(false);
        return;
      }
      if (u < 0.62) {
        const a = u / 0.62;
        scaleAll = 1 + c.swell * (1 - (1 - a) * (1 - a));
        o.x += Math.sin(t * 70) * 0.02 * H * a;
        o.sq += 0.06 * Math.sin(a * Math.PI * 3);
        flash = Math.max(flash, a);
      } else {
        const a = (u - 0.62) / 0.38;
        scaleAll = (1 + c.swell) * (1 - a * a * a) + 0.0001;
        o.sq += 0.15 * a;
        flash = 1;
      }
    }

    /* ---------------- apply ---------------- */
    const P = this.p;
    const sy = (1 + o.sq) * scaleAll;
    const sxz = (1 - o.sq * 0.5 + o.sw) * scaleAll;
    P.base.position.set(o.x, Math.max(0, o.y), o.z);
    P.base.rotation.set(o.pitch, o.yaw, o.roll);
    P.base.scaling.set(sxz, Math.max(0.0001, sy), sxz);

    // eyes flare: windup, attack anticipation, poof
    const atkFlare = this.atkT >= 0 ? Math.sin(Math.PI * Math.min(1, this.atkT / Math.max(0.2, this.atkDur * 0.7))) : 0;
    this.flare = Math.max(wd, atkFlare * 0.8, this.poofT >= 0 ? 1 : 0);
    if (P.eyes) {
      const es = 1 + 0.22 * this.flare + 0.03 * Math.sin(t * 9) * wd;
      P.eyes.scaling.set(es, es, es);
    }
    if (P.eyeMat) {
      const e = P.eyeMat;
      setFlash(e, Math.max(this.flare * 0.55, flash * 0.8), e.rim.r, e.rim.g, e.rim.b, 0.5);
    }
    // body: white flash on hit/poof, a pulsing magenta tint while winding up
    const tint = wd * (0.45 + 0.25 * Math.sin(t * 22));
    for (let i = 0; i < P.bodyMats.length; i++) {
      const m = P.bodyMats[i];
      if (flash >= tint * 0.6) setFlash(m, flash, 1, 1, 1, 0.9);
      else setFlash(m, tint, c.tint[0], c.tint[1], c.tint[2], 0.42);
    }
    for (let i = 0; i < P.wisps.length; i++) {
      const w = P.wisps[i];
      w.intensity = 1 + 0.35 * wd;
      w.update(dt * (1 + 1.5 * wd + 0.6 * mv));
    }
    P.hook?.(this, dt);
  }
}

/* ================================================================== */
/* Builders                                                            */
/* ================================================================== */

interface Ctx {
  scene: Scene;
  root: TransformNode;
  base: TransformNode;
  body: FxMat;
  eye: FxMat;
  own: StandardMaterial[];
}

function ctx(scene: Scene, kind: string, glow: string, rim = C.rim): Ctx {
  const root = new TransformNode("enemy_" + kind, scene);
  const base = new TransformNode("base", scene);
  base.parent = root;
  const id = seed;
  const body = fxMat(scene, `gloom_${kind}_${id}`, { rim: 0.36, rimColor: rim, rimPower: 2.2, shade: 0.72 });
  const eye = fxMat(scene, `gloomEye_${kind}_${id}`, { rim: 0, rimColor: glow, rimPower: 1.5, emissive: "#ffffff" });
  return { scene, root, base, body, eye, own: [body.mat, eye.mat] };
}

/** Eyes mesh pivoted between the eyes so the flare scales them in place. */
function eyesPart(c: Ctx, parent: TransformNode, parentPivot: V3, shapes: Mesh[], pivot: V3): Mesh {
  const [m] = makePart(c.scene, "eyes", parent, parentPivot, pivot, { shapes, material: c.eye.mat });
  return m;
}

function finish(c: Ctx, kind: EnemyKind | null, cfg: Partial<Cfg>, eyes: Mesh | null, wisps: Wisps[], hook?: Parts["hook"], extraMats: FxMat[] = []): Enemy {
  const p: Parts = {
    root: c.root,
    base: c.base,
    eyes,
    eyeRest: eyes ? eyes.position.clone() : Vector3.Zero(),
    bodyMats: [c.body, ...extraMats],
    eyeMat: eyes ? c.eye : null,
    wisps,
    ownMats: c.own,
    hook,
  };
  const full = { ...DEF, ...cfg };
  return new Enemy(p, full, kind ? TRACKS[kind] : TRACKS.gloomblob, kind ? ENEMY_ATTACK[kind].dur : 0.42);
}

/* ------------------------------------------------------------------ */
/* Gloomblob                                                           */
/* ------------------------------------------------------------------ */

function buildGloomblob(scene: Scene): Enemy {
  const c = ctx(scene, "gloomblob", C.amber);
  const s = scene;
  const BE: Ell = { c: [0, 0.34, 0], r: [0.4, 0.33, 0.38] };
  const top = "#8470bd",
    bot = "#3f3169";
  const shapes: Mesh[] = [
    blobM(s, BE.r, BE.c, top, undefined, bot, 12),
    // gumdrop skirt that spreads onto the ground
    blobM(s, [0.46, 0.16, 0.44], [0, 0.12, 0], "#4b3c7a", undefined, "#3a2d62", 10),
  ];
  // lumpy, drippy jelly hem
  // two little drips on the jelly
  for (const sd of [-1, 1]) shapes.push(blobM(s, [0.05, 0.075, 0.04], surf(BE, sd * 0.85, -0.45, -0.02).p, "#5a4890", [0, sd * 0.85, 0], "#4a3b78", 6));
  // stubby horns, curling outward
  for (const sd of [-1, 1]) {
    const { p, n } = surf(BE, sd * 0.6, 0.9, -0.01);
    shapes.push(...hornM(s, p, [n[0] + sd * 0.05, n[1] + 0.7, n[2] - 0.1], 0.15, 0.048, [sd * 5, -2.5, 0], C.horn, C.hornTip, 5));
  }
  // thorny bumps across the back
  shapes.push(
    ...thornsOn(
      s,
      BE,
      [
        [Math.PI, 0.55, 0.1],
        [Math.PI - 0.7, 0.35, 0.085],
        [Math.PI + 0.7, 0.35, 0.085],
        [Math.PI - 0.35, 0.95, 0.08],
        [Math.PI + 0.35, 0.95, 0.08],
        [Math.PI - 1.35, 0.15, 0.07],
        [Math.PI + 1.35, 0.15, 0.07],
        [0, 1.25, 0.075],
      ],
      C.thorn,
      C.thornTip,
    ),
  );
  const face = grumpyFace(s, {
    head: BE,
    eyeYaw: 0.34,
    eyePitch: 0.2,
    eyeW: 0.096,
    eyeH: 0.08,
    glow: C.amber,
    brow: 0.022,
    browSlant: 0.7,
    mouth: { pitch: -0.2, w: 0.075, style: "wavy", fang: 1 },
  });
  // a lighter tummy patch so the face has something to sit on
  const flat = [...face.flat, capOn(s, BE, 0, -0.38, 0.5, "#9584c7", { wob: 0.08, sx: 1.15, sy: 0.7, segs: 20, rings: 4 })];
  makePart(s, "body", c.base, [0, 0, 0], [0, 0, 0], { shapes, flat, outline: 0.022, outlineColor: C.hull, material: c.body.mat, shadow: true });
  const eyes = eyesPart(c, c.base, [0, 0, 0], face.eyes, [0, 0.43, 0.32]);
  const wisps = [
    new Wisps(s, c.base, { count: 5, at: [0, 0.42, -0.05], spread: [0.28, 0.24], arc: Math.PI * 1.2, rise: 0.55, drift: 0.7, size: 0.065, rate: 0.55, color: "#6a5a98", bottom: "#3d3066" }),
  ];
  return finish(c, "gloomblob", { gait: "hop", freq: 2.3, hopH: 0.15, squash: 0.2, jelly: 0.12, height: 0.8, radius: 0.42 }, eyes, wisps);
}

/* ------------------------------------------------------------------ */
/* Thornbug                                                            */
/* ------------------------------------------------------------------ */

function buildThornbug(scene: Scene): Enemy {
  const c = ctx(scene, "thornbug", C.magenta);
  const s = scene;
  const SH: Ell = { c: [0, 0.3, -0.12], r: [0.3, 0.25, 0.36] };
  const HE: Ell = { c: [0, 0.25, 0.26], r: [0.21, 0.19, 0.18] };
  const shapes: Mesh[] = [
    blobM(s, SH.r, SH.c, "#6a51a0", undefined, "#2f2450", 12),
    blobM(s, [0.27, 0.12, 0.32], [0, 0.17, -0.1], "#3a2d5e", undefined, "#2a2046", 8),
    blobM(s, HE.r, HE.c, "#8a76bf", undefined, "#4a3a78", 12),
  ];
  // shell seam
  shapes.push(...tubeM(s, [surf(SH, 0, 0.75, 0.004).p, surf(SH, 0, 1.3, 0.004).p, surf(SH, Math.PI, 1.1, 0.004).p, surf(SH, Math.PI, 0.55, 0.004).p], 0.014, "#241a3a"));
  // rhino horn
  const hp = surf(HE, 0, 1.15, -0.02);
  shapes.push(...hornM(s, hp.p, [0, 1, 0.25], 0.2, 0.055, [0, -0.5, 4.5], C.horn, C.hornTip, 5));
  // thorny shell: two rows of spikes + a crest
  const th: [number, number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const yaw = Math.PI * (0.18 + i * 0.22);
    th.push([yaw, 0.55, 0.11], [-yaw, 0.55, 0.11]);
  }
  th.push([Math.PI, 1.0, 0.12], [Math.PI * 0.55, 1.15, 0.1], [-Math.PI * 0.55, 1.15, 0.1], [Math.PI * 0.5, 0.15, 0.08], [-Math.PI * 0.5, 0.15, 0.08]);
  shapes.push(...thornsOn(s, SH, th, C.thorn, C.thornTip, 0.4));
  const face = grumpyFace(s, {
    head: HE,
    eyeYaw: 0.42,
    eyePitch: 0.12,
    eyeW: 0.076,
    eyeH: 0.068,
    glow: C.magenta,
    brow: 0.018,
    browSlant: 0.85,
    mouth: { pitch: -0.38, w: 0.055, style: "frown", fang: 2 },
  });
  makePart(s, "body", c.base, [0, 0, 0], [0, 0, 0], { shapes, flat: face.flat, outline: 0.02, outlineColor: C.hull, material: c.body.mat, shadow: true });
  const eyes = eyesPart(c, c.base, [0, 0, 0], face.eyes, [0, 0.3, 0.42]);

  // legs as two tripods (L1 R2 L3 / R1 L2 R3) → two draws
  const legMat = toonMat(s, { name: "gloomLeg", rim: 0.3, shade: 0.75 });
  const tripods: TransformNode[] = [];
  for (let g = 0; g < 2; g++) {
    const n = new TransformNode("legs" + g, s);
    n.parent = c.base;
    const ls: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const sd = (i + g) % 2 === 0 ? -1 : 1;
      const z = 0.14 - i * 0.2;
      const a: V3 = [sd * 0.2, 0.16, z];
      const k: V3 = [sd * 0.29, 0.11, z + 0.02];
      const f: V3 = [sd * 0.31, 0.04, z + 0.04];
      ls.push(...tubeM(s, [a, k, f], 0.04, "#33274d", false));
      ls.push(blobM(s, [0.06, 0.04, 0.07], [f[0], 0.035, f[2] + 0.01], "#45366a", undefined, "#2a2040", 6));
    }
    makePart(s, "legs" + g, n, [0, 0, 0], [0, 0, 0], { shapes: ls, material: legMat, shadow: false });
    tripods.push(n);
  }
  const wisps = [new Wisps(s, c.base, { count: 4, at: [0, 0.4, -0.38], spread: [0.18, 0.12], arc: Math.PI * 0.9, rise: 0.4, drift: 0.8, size: 0.07, rate: 0.7, color: "#6a5a98", bottom: "#3d3066" })];
  const hook = (e: Enemy) => {
    const mv = e.move,
      wd = e.wind;
    const th = e.th;
    // scrabble in place while winding up
    const amp = 0.06 * Math.min(1, mv * 1.5) + 0.03 * wd;
    for (let g = 0; g < 2; g++) {
      const a = th + g * Math.PI;
      const n = tripods[g];
      n.position.set(0, Math.max(0, Math.cos(a)) * (0.05 * mv + 0.03 * wd), Math.sin(a) * amp);
    }
  };
  return finish(c, "thornbug", { gait: "scuttle", freq: 7.5, squash: 0.1, jelly: 0.04, breathe: 0.02, height: 0.62, radius: 0.42 }, eyes, wisps, hook);
}

/* ------------------------------------------------------------------ */
/* Puffspitter                                                         */
/* ------------------------------------------------------------------ */

function buildPuffspitter(scene: Scene): Enemy {
  const c = ctx(scene, "puffspitter", C.amber);
  const s = scene;
  // squat stem-body with the spitting snout
  const ST: Ell = { c: [0, 0.27, 0], r: [0.27, 0.28, 0.26] };
  const shapes: Mesh[] = [blobM(s, ST.r, ST.c, "#a592d0", undefined, "#5f4e8e", 10), blobM(s, [0.31, 0.11, 0.3], [0, 0.08, 0], "#5a4986", undefined, "#45386d", 8)];
  for (const sd of [-1, 1]) shapes.push(blobM(s, [0.085, 0.055, 0.1], [sd * 0.15, 0.04, 0.19], "#4a3b72", undefined, undefined, 6));
  const nz: V3 = [0, 0.27, 0.2];
  const snout = lathe(s, [[0, 0], [0.09, 0], [0.1, 0.04], [0.088, 0.1], [0.1, 0.15], [0.092, 0.19], [0.062, 0.2], [0.05, 0.17], [0, 0.16]], { color: "#8a77b8", bottom: "#76639f" }, 12);
  snout.position.set(nz[0], nz[1], nz[2]);
  snout.rotation.x = Math.PI / 2;
  shapes.push(snout);
  const flat = [blobM(s, [0.052, 0.052, 0.02], [0, nz[1], nz[2] + 0.175], "#1a1026", undefined, undefined, 8)];
  makePart(s, "body", c.base, [0, 0, 0], [0, 0, 0], { shapes, flat, outline: 0.02, outlineColor: C.hull, material: c.body.mat, shadow: true });

  // the grumpy cloud-cap head (separate node so it can puff up); the face is on its front
  const capPivot: V3 = [0, 0.5, 0];
  const capN = new TransformNode("cap", s);
  capN.parent = c.base;
  capN.position.set(...capPivot);
  const CE: Ell = { c: [0, 0.72, 0], r: [0.43, 0.27, 0.4] };
  const capTop = "#7656a2",
    capBot = "#4a3570";
  const cs: Mesh[] = [blobM(s, CE.r, CE.c, capTop, undefined, capBot, 12)];
  // cloud puffs round the back and sides (none in front of the face)
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.42 + (i / 6) * Math.PI * 1.16;
    const r = 0.36;
    cs.push(ballM(s, 0.16 + (i % 2) * 0.03, [Math.sin(a) * r, 0.68 + (i % 3) * 0.03, Math.cos(a) * r], capTop, capBot, 6));
  }
  cs.push(ballM(s, 0.2, [0.13, 0.9, -0.1], "#8466b0", capTop, 7), ballM(s, 0.17, [-0.16, 0.88, -0.02], "#8466b0", capTop, 7));
  cs.push(
    ...thornsOn(
      s,
      { c: [0, 0.78, -0.04], r: [0.42, 0.26, 0.4] },
      [
        [0.5, 0.95, 0.1],
        [-0.7, 0.85, 0.1],
        [Math.PI - 0.4, 0.7, 0.11],
        [Math.PI + 0.7, 0.55, 0.1],
        [1.9, 0.45, 0.09],
        [-1.9, 0.45, 0.09],
        [0, 1.45, 0.1],
      ],
      C.thorn,
      C.thornTip,
    ),
  );
  const face = grumpyFace(s, {
    head: CE,
    eyeYaw: 0.35,
    eyePitch: -0.05,
    eyeW: 0.088,
    eyeH: 0.073,
    glow: C.amber,
    brow: 0.021,
    browSlant: 0.9,
    browLift: 0.45,
    mouth: { pitch: -0.1, w: 0.05, style: "none" },
  });
  const spots: Mesh[] = [];
  for (const [y, p, r] of [
    [0.9, 0.55, 0.07],
    [-1.1, 0.5, 0.06],
    [2.6, 0.4, 0.07],
  ] as const)
    spots.push(capOn(s, CE, y, p, r / 0.35, "#b79be0", { wob: 0.1, segs: 16, rings: 3 }));
  makePart(s, "capMesh", capN, capPivot, capPivot, { shapes: cs, flat: [...spots, ...face.flat], outline: 0.02, outlineColor: C.hull, material: c.body.mat, shadow: true });
  const eyes = eyesPart(c, capN, capPivot, face.eyes, [0, 0.74, 0.38]);
  const wisps = [new Wisps(s, capN, { count: 5, at: [0, 0.4, -0.08], spread: [0.25, 0.22], rise: 0.5, drift: 0.6, size: 0.07, rate: 0.5, color: "#6a5a98", bottom: "#3d3066" })];
  const hook = (e: Enemy) => {
    const wd = e.wind;
    const puff = e.atk("x");
    const k = 1 + 0.035 * Math.sin(e.t * 3.1 + 1) + 0.12 * wd + puff * 0.5 + e.jig * 0.15;
    capN.scaling.set(k, 1 + (k - 1) * 0.6, k);
    capN.position.set(0, capPivot[1] + 0.04 * wd + e.jig * 0.03 + puff * 0.05, 0);
    capN.rotation.set(-e.atk("pitch") * 0.5 + 0.04, 0, Math.sin(e.t * 1.6) * 0.04 + Math.sin(e.t * 40) * 0.04 * wd);
  };
  return finish(c, "puffspitter", { gait: "waddle", freq: 2.0, squash: 0.12, jelly: 0.05, breathe: 0.035, height: 1.02, radius: 0.42 }, eyes, wisps, hook);
}

/* ------------------------------------------------------------------ */
/* Gloom King                                                          */
/* ------------------------------------------------------------------ */

function buildGloomking(scene: Scene): Enemy {
  const c = ctx(scene, "gloomking", C.magenta);
  const s = scene;
  const BE: Ell = { c: [0, 1.22, 0], r: [1.22, 1.12, 1.1] };
  const top = "#7c66b6",
    bot = "#33275a";
  const shapes: Mesh[] = [blobM(s, BE.r, BE.c, top, undefined, bot, 18), blobM(s, [1.36, 0.44, 1.3], [0, 0.36, 0], "#43356f", undefined, "#2f2452", 14)];
  for (const sd of [-1, 1]) shapes.push(blobM(s, [0.12, 0.18, 0.1], surf(BE, sd * 0.8, -0.42, -0.04).p, "#5a4890", [0, sd * 0.8, 0], "#43356f", 6));
  // feet
  for (const sd of [-1, 1]) shapes.push(blobM(s, [0.3, 0.16, 0.36], [sd * 0.55, 0.1, 0.75], "#3a2d62", undefined, "#2a2046", 10));
  const th: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) th.push([Math.PI + (i - 2) * 0.5, 0.45 + (i % 2) * 0.3, 0.26]);
  th.push([1.25, 0.65, 0.22], [-1.25, 0.65, 0.22], [1.55, 0.2, 0.2], [-1.55, 0.2, 0.2], [Math.PI, 1.0, 0.24]);
  shapes.push(...thornsOn(s, BE, th, C.thorn, C.thornTip, 0.38));
  const face = grumpyFace(s, {
    head: BE,
    eyeYaw: 0.3,
    eyePitch: 0.26,
    eyeW: 0.23,
    eyeH: 0.19,
    glow: C.magenta,
    brow: 0.06,
    browSlant: 0.8,
    mouth: { pitch: -0.12, w: 0.26, style: "frown", fang: 2 },
  });
  const flat = [...face.flat, capOn(s, BE, 0, -0.28, 0.6, "#9b88cc", { wob: 0.07, sx: 1.15, sy: 0.85 })];
  makePart(s, "body", c.base, [0, 0, 0], [0, 0, 0], { shapes, flat, outline: 0.045, outlineColor: C.hull, material: c.body.mat, shadow: true });
  const eyes = eyesPart(c, c.base, [0, 0, 0], face.eyes, [0, 1.65, 1.0]);

  // stubby arms
  const arms: TransformNode[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 1.08, 1.25, 0.15];
    const n = new TransformNode("arm" + sd, s);
    n.parent = c.base;
    n.position.set(...piv);
    makePart(s, "armMesh" + sd, n, piv, piv, {
      shapes: [blobM(s, [0.26, 0.4, 0.26], [sd * 1.3, 1.02, 0.2], top, [0, 0, sd * 0.5], bot, 12), ...thornsOn(s, { c: [sd * 1.3, 1.02, 0.2], r: [0.26, 0.4, 0.26] }, [[sd * 1.6, 0.4, 0.12]], C.thorn, C.thornTip)],
      outline: 0.04,
      outlineColor: C.hull,
      material: c.body.mat,
      shadow: true,
    });
    arms.push(n);
  }

  // crooked thorn crown
  const crPiv: V3 = [0, 2.26, 0];
  const crown = new TransformNode("crown", s);
  crown.parent = c.base;
  crown.position.set(...crPiv);
  const crMat = fxMat(s, "gloomCrown_" + seed, { rim: 0.4, rimColor: "#ffd27a", rimPower: 2.0, shade: 0.75 });
  c.own.push(crMat.mat);
  // tarnished-gold band with crooked thorn points, slipped to one side
  const cr: Mesh[] = [lathe(s, [[0.0, 0.0], [0.5, 0], [0.56, 0.02], [0.6, 0.1], [0.62, 0.22], [0.58, 0.26], [0.52, 0.25], [0.45, 0.12], [0.0, 0.1]], { color: "#e6bf5c", bottom: "#a57a2c" }, 16)];
  cr[0].position.set(0, 2.2, 0);
  const spikes = [
    [0, 0.5, 0.6],
    [1.25, 0.4, -0.9],
    [2.5, 0.46, 0.7],
    [3.75, 0.36, -0.6],
    [5.0, 0.44, 0.9],
  ];
  for (const [a, len, bend] of spikes) {
    const p: V3 = [Math.sin(a) * 0.53, 2.4, Math.cos(a) * 0.53];
    cr.push(...hornM(s, p, [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], len, 0.11, [Math.cos(a) * bend, 0, -Math.sin(a) * bend], "#c99a42", "#5a3a7a", 5));
  }
  // bramble knots round the band
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.63;
    cr.push(ballM(s, 0.075, [Math.sin(a) * 0.61, 2.32, Math.cos(a) * 0.61], "#4a3570", undefined, 6));
  }
  const crMesh = makePart(s, "crownMesh", crown, crPiv, crPiv, { shapes: cr, outline: 0.03, outlineColor: C.hull, material: crMat.mat, shadow: true });
  for (const m of crMesh) m.rotation.set(0.1, 0, 0.2);
  const gem = blobM(s, [0.12, 0.13, 0.06], [0, 2.32, 0.63], C.magenta, [0.1, 0, 0], undefined, 8);
  const gemHi = ballM(s, 0.035, [0.04, 2.36, 0.68], "#ffffff", undefined, 4);
  const [gemM] = makePart(s, "gem", crown, crPiv, crPiv, { shapes: [gem, gemHi], material: c.eye.mat });
  gemM.rotation.set(0.1, 0, 0.2);

  // shadow cape
  const capePiv: V3 = [0, 2.05, -0.2];
  const capeN = new TransformNode("capeN", s);
  capeN.parent = c.base;
  capeN.position.set(...capePiv);
  const cape = capeM(s, { a0: Math.PI * 0.56, a1: Math.PI * 1.44, yTop: 2.1, yBot: 0.06, rTop: 0.95, rBot: 1.5, zOff: -0.12, wave: 0.14, waves: 5, outer: "#3a2a5e", outerBot: "#1f1634", inner: "#7a4aa0", thick: 0.04 });
  const collar: Mesh[] = [cape];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.55 + (i / 6) * 0.9);
    const p: V3 = [Math.sin(a) * 0.98, 2.05, Math.cos(a) * 0.98 - 0.12];
    collar.push(softConeM(s, 0.36 + (i % 2) * 0.12, 0.13, p, "#4a3878", [-0.5 * Math.cos(a), 0, 0.5 * Math.sin(a)], "#2e2148", undefined, 7, 0.22));
  }
  makePart(s, "cape", capeN, capePiv, capePiv, { shapes: collar, material: c.body.mat, shadow: true });

  const wispMat = toonMat(s, { name: "gloomWisp", rim: 0.5, shade: 0.85, alpha: 0.62 });
  const wisps = [
    new Wisps(s, c.base, { count: 10, at: [0, 0.15, -0.35], spread: [1.35, 1.05], arc: Math.PI * 1.3, rise: 1.4, drift: 0.35, size: 0.26, rate: 0.42, color: "#5d4c8c", bottom: "#2f2452", material: wispMat }),
    new Wisps(s, crown, { count: 4, at: [0, 0.55, 0], spread: [0.4, 0.4], rise: 0.7, drift: 0.5, size: 0.1, rate: 0.5, color: "#7d68b0", bottom: "#4a3a78", material: wispMat }),
  ];
  const hook = (e: Enemy) => {
    const t = e.t,
      wd = e.wind;
    const raise = e.atk("x") + 0.45 * wd;
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      const a = arms[i];
      const swing = Math.sin(e.th + i * Math.PI) * 0.25 * e.move;
      a.rotation.set(-swing - raise * 0.3, 0, sd * (raise * 2.1 + 0.06 * Math.sin(t * 2.2 + i)));
    }
    // rumbling anticipation before the jump
    if (e.atkT >= 0 && e.atkT < 0.42) e.p.base.position.x += Math.sin(t * 58) * 0.035 * Math.min(1, e.atkT / 0.2);
    crown.rotation.set(e.jig * 0.25 + Math.sin(t * 1.7) * 0.03, 0, Math.sin(t * 1.2) * 0.05 + Math.sin(t * 45) * 0.05 * wd - e.jig * 0.15);
    crown.position.y = crPiv[1] + Math.max(0, -e.jig) * 0.15 + e.atk("y") * 0.12;
    capeN.rotation.set(-0.06 - e.move * 0.12 - e.atk("y") * 0.2 + Math.sin(t * 1.4) * 0.03, Math.sin(t * 0.9) * 0.05, Math.sin(t * 1.1) * 0.03);
  };
  return finish(c, "gloomking", { gait: "stomp", freq: 1.25, squash: 0.12, jelly: 0.1, knock: 0.45, swell: 0.3, breathe: 0.025, height: 3.0, radius: 1.35 }, eyes, wisps, hook, [crMat]);
}

/* ------------------------------------------------------------------ */
/* Happy blob (the Gloom King, un-gloomed)                              */
/* ------------------------------------------------------------------ */

/** A small pastel smiling blob for the post-boss celebration. Same EnemyModel API (attack() = a happy hop). */
export function buildHappyBlob(scene: Scene): EnemyModel {
  const c = ctx(scene, "happyblob", "#ffffff", "#fff4fb");
  c.body.toon.rimStrength = c.body.rimK = 0.28;
  const s = scene;
  const BE: Ell = { c: [0, 0.3, 0], r: [0.34, 0.29, 0.32] };
  const shapes: Mesh[] = [blobM(s, BE.r, BE.c, "#ffd6ec", undefined, "#e7b8f0", 16), blobM(s, [0.37, 0.12, 0.35], [0, 0.1, 0], "#e9bdf0", undefined, "#dcaef0", 14)];
  for (const sd of [-1, 1]) {
    const { p, n } = surf(BE, sd * 0.6, 0.95, -0.02);
    shapes.push(softConeM(s, 0.07, 0.045, p, "#ffeef8", rotYTo(n), "#f7c6e6", undefined, 7, 0.45));
  }
  // its little crown, slipped to one side
  const cr: Mesh[] = [lathe(s, [[0.11, 0], [0.13, 0.01], [0.13, 0.07], [0.11, 0.07]], { color: "#ffd75a", bottom: "#f5b942" }, 14, false)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    cr.push(softConeM(s, 0.07, 0.03, [Math.sin(a) * 0.12, 0.06, Math.cos(a) * 0.12], "#ffe27a", undefined, "#ffd75a", undefined, 6, 0.3));
    cr.push(ballM(s, 0.016, [Math.sin(a) * 0.12, 0.135, Math.cos(a) * 0.12], i % 2 ? "#ff9fc0" : "#9fd8ff", undefined, 4));
  }
  const crownN = new TransformNode("crownTilt", s);
  for (const m of cr) {
    m.parent = crownN;
  }
  crownN.position.set(0.1, 0.555, 0.0);
  crownN.rotation.set(0.12, 0, -0.32);
  crownN.scaling.setAll(0.78);
  for (const m of cr) {
    m.computeWorldMatrix(true);
  }
  crownN.computeWorldMatrix(true);
  for (const m of cr) {
    m.bakeTransformIntoVertices(m.computeWorldMatrix(true));
    m.parent = null;
    m.position.setAll(0);
    m.rotation.setAll(0);
    m.rotationQuaternion = null;
  }
  crownN.dispose();
  const face = faceShapes(s, {
    head: BE,
    eyeYaw: 0.33,
    eyePitch: 0.12,
    eyeW: 0.05,
    eyeH: 0.062,
    cheekYaw: 0.62,
    cheekPitch: -0.08,
    cheekR: 0.04,
    mouth: { pitch: -0.16, w: 0.04, h: 0.03, style: "smile" },
  }, "happy");
  makePart(s, "body", c.base, [0, 0, 0], [0, 0, 0], { shapes, flat: [...face, ...cr], outline: 0.02, outlineColor: "#8a6f96", material: c.body.mat, shadow: true });
  const star = puffStar(s, 4, 1, 0.38, 0.25, [0, 0, 0], "#fff1a0");
  const sparkMat = toonMat(s, { name: "happySparkle", emissive: "#ffffff", rim: 0 });
  const wisps = [new Wisps(s, c.base, { count: 6, at: [0, 0.35, 0], spread: [0.36, 0.34], rise: 0.6, drift: 0.4, size: 0.045, rate: 0.5, color: "#fff1a0", material: sparkMat, shape: star, stretch: 1 })];
  const e = finish(c, null, { gait: "hop", freq: 2.6, hopH: 0.18, squash: 0.2, jelly: 0.14, height: 0.62, radius: 0.34, tint: [1, 0.9, 0.6] }, null, wisps);
  return e;
}

/* ------------------------------------------------------------------ */
/* Public                                                              */
/* ------------------------------------------------------------------ */

export function buildEnemy(scene: Scene, kind: EnemyKind): EnemyModel {
  switch (kind) {
    case "gloomblob":
      return buildGloomblob(scene);
    case "thornbug":
      return buildThornbug(scene);
    case "puffspitter":
      return buildPuffspitter(scene);
    case "gloomking":
      return buildGloomking(scene);
  }
}
