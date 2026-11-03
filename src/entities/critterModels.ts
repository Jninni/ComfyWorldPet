/**
 * critterModels — procedural plush critters (16 species × 2 colourways) with procedural animation.
 *
 * Rig per critter:
 *   root (integrator moves/rotates)            ← CritterModel.root
 *     base  (hop height, squash & stretch about the feet, emote spins)
 *       body mesh, legs/feet, tail, wings
 *       head  (look / tilt / lag)  → head mesh, faces (one per expression, only one enabled), ears
 *     sparkle (rare variants only)
 *
 * All animation is per-frame transforms; update() allocates nothing.
 */
import { TransformNode, Vector3, Quaternion, type Mesh, type Scene } from "@babylonjs/core";
import type { SpeciesId } from "../data/species";
import { rng } from "../render/Palette";
import { toonMat } from "../render/Toon";
import { lathe, type V3 } from "../render/Shapes";
import { Kit, ballM, blobM, softConeM, puffStar, capOn, decal, surf, arcOn, rotZTo, rotYTo, add, norm, heartM, shieldDome, spiralHorn, buildHeads, type Ell, type FaceSpec } from "./critterParts";

export interface CritterAnimState {
  speed: number; // 0..1 normalized move speed
  sleeping?: boolean;
  excited?: boolean;
}

export interface CritterModel {
  root: TransformNode;
  height: number;
  radius: number;
  update(dt: number, s: CritterAnimState): void;
  emote(kind: "happy" | "surprised" | "love" | "sad"): void;
  setEnabled(on: boolean): void;
  dispose(): void;
  /** riders only: height (local, at scale 1) where a rider sits, measured from the feet (seat is at x = z = 0) */
  seatY?: number;
  /**
   * riders only: a node at the seat (0, seatY, 0) that follows the trot/gallop bob, pitch and hops
   * (squash is cancelled out). Parent the rider to it, or read its world matrix, for a lively ride.
   */
  seat?: TransformNode;
  /** guardians (and any critter): play a quick attack animation (~0.35–0.5 s); safe to call often */
  attack?(): void;
}

type EmoteKind = "happy" | "surprised" | "love" | "sad";
type Gait = "hop" | "bounce" | "trot" | "waddle" | "shuffle" | "hover" | "gallop";

interface Cfg {
  gait: Gait;
  freq: number;
  hopH: number;
  squash: number;
  pitch: number;
  bob: number;
  stride: number;
  lift: number;
  roll: number;
  hover: number;
  height: number;
  radius: number;
  /** look amplitude (1 = head turns, smaller for whole-body "heads") */
  look: number;
  headLag: number;
  sleepDrop: number;
  sleepRoll: number;
  sleepHeadYaw: number;
  sleepHeadPitch: number;
  sleepHeadRoll: number;
  sleepHeadDrop: number;
  /** height of the body-pitch pivot (0 = feet); big quadrupeds rock about their middle */
  pitchPivot: number;
  /** attack animation length (s) */
  attackDur: number;
}

const DEF: Cfg = {
  gait: "trot",
  freq: 2.4,
  hopH: 0.12,
  squash: 0.18,
  pitch: 0.15,
  bob: 0.02,
  stride: 0.06,
  lift: 0.05,
  roll: 0.1,
  hover: 0,
  height: 0.6,
  radius: 0.25,
  look: 1,
  headLag: 0.04,
  sleepDrop: 0.03,
  sleepRoll: 0.0,
  sleepHeadYaw: 0.0,
  sleepHeadPitch: 0.3,
  sleepHeadRoll: 0.25,
  sleepHeadDrop: 0.03,
  pitchPivot: 0,
  attackDur: 0.42,
};

interface Ear {
  n: TransformNode;
  side: number;
  /** response to vertical jiggle */
  gain: number;
  /** extra droop when sleeping (rad) */
  sleep: number;
  /** drag-back when moving (rad) */
  drag: number;
  tw: number;
  twT: number;
}
interface Tail {
  n: TransformNode;
  amp: number;
  f: number;
  walk: number;
  gain: number;
  curlY: number;
  curlX: number;
  /** wag about Y (side to side) or Z (wiggle) */
  axis: "y" | "z";
}
interface Wing {
  n: TransformNode;
  side: number;
  rest: number;
  amp: number;
  kind: "bird" | "bat" | "duck";
}
interface Leg {
  n: TransformNode;
  rest: Vector3;
  ph: number;
  side: number;
  tuck: number;
  hopDz: number;
  hopRx: number;
  /** stride scale */
  k: number;
  /** gallop gait: phase at full gallop (blends from `ph` at a trot), swing (rad) and sleep fold (rad) */
  ph2?: number;
  swing?: number;
  sleepRx?: number;
}

/** Pose offsets written by an attack animation each frame (reset to 0 before every call). */
export interface AtkPose {
  /** base offsets: forward, up, pitch (+ = nose down), roll, squash (+ = squash) */
  z: number;
  y: number;
  pitch: number;
  roll: number;
  sq: number;
  /** head offsets: pitch, forward, up */
  hp: number;
  hz: number;
  hy: number;
  /** face index to show (-1 = leave alone) */
  face: number;
}

interface Rig {
  root: TransformNode;
  base: TransformNode;
  head: TransformNode;
  faces: Mesh[];
  ears: Ear[];
  tails: Tail[];
  wings: Wing[];
  legs: Leg[];
  sparkle?: TransformNode;
  sparklePos?: V3;
  hook?: (c: Critter, dt: number) => void;
  /** custom attack pose (u = 0..1 through the attack); defaults to a small lunge */
  attackPose?: (c: Critter, u: number, p: AtkPose) => void;
  seat?: TransformNode;
  seatY?: number;
  nodes: Record<string, TransformNode>;
}

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;
let seedCounter = 1;

const FACE = { open: 0, closed: 1, happy: 2, sad: 3, surprised: 4 } as const;
const EMOTE_DUR: Record<EmoteKind, number> = { happy: 0.95, surprised: 0.75, love: 1.05, sad: 1.25 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Default attack: a quick wind-up, a bouncy lunge forward and a settle (any species). */
function genericAttack(cr: Critter, u: number, p: AtkPose) {
  const H = cr.cfg.height;
  if (u < 0.3) {
    const a = sstep(0, 0.3, u);
    p.z = -0.06 * H * a;
    p.pitch = -0.12 * a;
    p.sq = 0.1 * a;
  } else if (u < 0.55) {
    const a = sstep(0.3, 0.55, u);
    p.z = lerp(-0.06, 0.18, a) * H;
    p.y = 0.07 * H * Math.sin(Math.PI * a);
    p.pitch = lerp(-0.12, 0.2, a);
    p.sq = lerp(0.1, -0.1, a);
    p.face = FACE.happy;
  } else {
    const a = sstep(0.55, 1, u);
    p.z = 0.18 * H * (1 - a);
    p.pitch = 0.2 * (1 - a);
    p.sq = -0.1 * (1 - a) + 0.06 * Math.sin(Math.PI * a);
    if (a < 0.5) p.face = FACE.happy;
  }
}

class Critter implements CritterModel {
  root: TransformNode;
  height: number;
  radius: number;
  cfg: Cfg;
  rig: Rig;
  rand: () => number;
  headRest: Vector3;

  // animation state (public so species hooks can read it)
  t = 0;
  move = 0;
  sleep = 0;
  exc = 0;
  phase = 0;
  cycling = false;
  amp = 0;
  air = 0;
  breathP = 0;
  // springs
  jig = 0;
  jigV = 0;
  jx = 0;
  jxV = 0;
  jz = 0;
  jzV = 0;
  private pTop = 0;
  private pV = 0;
  private pYaw = 0;
  private pMove = 0;
  private first = true;
  // look
  private lookT = 1;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookTilt = 0;
  private tYaw = 0;
  private tPitch = 0;
  private tTilt = 0;
  // blink
  private blinkT = 2;
  private blinkOn = 0;
  private faceIdx = 0;
  private happyT = 0;
  // emote
  emK: EmoteKind | null = null;
  emT = 0;
  earPerk = 0;
  earDroop = 0;
  flutter = 0;
  private flutterT = 5;
  /** gallop blend (0 = trot, 1 = full gallop) */
  gal = 0;
  /** attack progress 0..1, or -1 when not attacking */
  atkU = -1;
  private atkT = 0;
  readonly ap: AtkPose = { z: 0, y: 0, pitch: 0, roll: 0, sq: 0, hp: 0, hz: 0, hy: 0, face: -1 };
  seatY?: number;
  seat?: TransformNode;

  constructor(rig: Rig, cfg: Cfg) {
    this.rig = rig;
    this.cfg = cfg;
    this.root = rig.root;
    this.height = cfg.height;
    this.radius = cfg.radius;
    this.rand = rng(0x51f15e + seedCounter++ * 7919);
    this.seatY = rig.seatY;
    this.seat = rig.seat;
    this.headRest = rig.head.position.clone();
    this.blinkT = 1 + this.rand() * 3;
    this.lookT = 0.5 + this.rand() * 2;
    this.breathP = this.rand() * TAU;
    for (const e of rig.ears) e.twT = 1 + this.rand() * 5;
  }

  emote(kind: EmoteKind) {
    this.emK = kind;
    this.emT = 0;
  }

  /** quick attack animation; repeated calls while one is mid-swing are ignored */
  attack() {
    if (this.atkU >= 0 && this.atkU < 0.75) return;
    this.atkT = 0;
    this.atkU = 0;
  }

  setEnabled(on: boolean) {
    this.root.setEnabled(on);
  }

  dispose() {
    this.root.dispose(false, false);
  }

  private setFace(i: number) {
    if (i === this.faceIdx) return;
    const f = this.rig.faces;
    f[this.faceIdx].setEnabled(false);
    f[i].setEnabled(true);
    this.faceIdx = i;
  }

  update(dt: number, st: CritterAnimState) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    const c = this.cfg;
    const R = this.rig;
    const H = c.height;
    const t = (this.t += dt);
    const tgt = st.sleeping ? 0 : Math.min(1, Math.max(0, st.speed || 0));
    this.move = damp(this.move, tgt, 8, dt);
    this.sleep = damp(this.sleep, st.sleeping ? 1 : 0, 2.2, dt);
    this.exc = damp(this.exc, st.excited && !st.sleeping ? 1 : 0, 4, dt);
    const mv = this.move,
      sl = this.sleep,
      ex = this.exc,
      awake = 1 - sl;

    /* ---------------- locomotion ---------------- */
    let y = 0,
      sq = 0,
      pitch = 0,
      roll = 0,
      yaw = 0,
      headBobP = 0;
    let th = 0;
    this.air = 0;
    const rate = c.freq * (0.7 + 0.3 * tgt) * (1 + 0.15 * ex);
    if (c.gait === "hop" || c.gait === "bounce") {
      const C = c.gait === "hop" ? 0.3 : 0.42;
      const want = !st.sleeping && !this.emK && (tgt > 0.05 || !!st.excited);
      const hopAmp = tgt > 0.05 ? 0.6 + 0.4 * tgt : 0.45;
      if (want && !this.cycling) {
        this.cycling = true;
        this.phase = 0;
        this.amp = hopAmp;
      }
      if (this.cycling) {
        const prev = this.phase;
        this.phase += dt * Math.max(rate, want ? 0 : c.freq);
        if (this.phase >= 1) {
          this.phase -= 1;
          if (want) this.amp = hopAmp;
        }
        if (!want && prev < C && this.phase >= C) {
          this.phase = 0;
          this.cycling = false;
        }
      }
      if (this.cycling) {
        const p = this.phase,
          A = this.amp;
        if (p < C) {
          sq = -c.squash * Math.sin((Math.PI * p) / C) * A;
        } else {
          const u = (p - C) / (1 - C);
          y = c.hopH * A * 4 * u * (1 - u);
          const k = 1 - 2 * u;
          sq = c.squash * 0.65 * k * k * A;
          pitch = c.pitch * (2 * u - 1) * A;
          this.air = Math.sin(Math.PI * u) * A;
        }
      }
      th = this.phase * TAU;
    } else if (c.gait === "hover") {
      this.phase = (this.phase + dt * c.freq * (1 + 0.5 * mv + 0.4 * ex) * (0.35 + 0.65 * awake)) % 1;
      th = this.phase * TAU;
      y = (c.hover + Math.sin(t * 2.1) * 0.035 + Math.sin(th) * 0.014) * awake;
      pitch = 0.22 * mv;
      roll = Math.sin(t * 1.3) * 0.06 * awake;
      sq = Math.sin(th) * 0.03 * awake;
    } else if (c.gait === "gallop") {
      // trot that opens up into a rocking-horse gallop as speed → 1
      const g = (this.gal = sstep(0.5, 0.92, mv));
      this.phase = (this.phase + dt * c.freq * (0.8 + 0.2 * mv + 0.25 * g) * (1 + 0.15 * ex) * Math.min(1, mv * 2.5)) % 1;
      th = this.phase * TAU;
      const yT = c.bob * mv * Math.abs(Math.sin(th));
      const air = Math.max(0, Math.sin(th));
      // one big bound per stride: up while the legs are stretched out (suspension), down as they gather
      const yG = c.hopH * (0.35 + 0.65 * air * air) - c.hopH * 0.2;
      y = lerp(yT, yG, g);
      // nose dips as the front legs land, rises as the hind legs gather under (rocking horse)
      pitch = lerp(0.03 * mv * Math.sin(2 * th) + 0.03 * mv, -c.pitch * Math.cos(th), g);
      sq = lerp(-0.03 * mv * Math.cos(2 * th), -c.squash * Math.sin(th), g);
      headBobP = lerp(-0.05 * mv * Math.sin(2 * th), 0.6 * c.pitch * Math.cos(th) + 0.1 * Math.sin(th), g);
      this.air = air * g;
    } else {
      this.phase = (this.phase + dt * rate * Math.min(1, mv * 2.5)) % 1;
      th = this.phase * TAU;
      if (c.gait === "trot") {
        y = c.bob * mv * Math.abs(Math.sin(th));
        pitch = 0.04 * mv * Math.sin(2 * th) + 0.05 * mv;
        sq = -0.035 * mv * Math.cos(2 * th);
        headBobP = -0.05 * mv * Math.sin(2 * th);
      } else if (c.gait === "waddle") {
        roll = c.roll * mv * Math.cos(th);
        y = c.bob * mv * Math.abs(Math.cos(th));
        yaw = 0.07 * mv * Math.cos(th);
        sq = 0.03 * mv * Math.cos(2 * th);
      } else {
        // shuffle
        roll = c.roll * mv * Math.sin(th);
        y = c.bob * mv * Math.abs(Math.sin(th));
        yaw = 0.09 * mv * Math.sin(th);
        pitch = 0.09 * mv;
        sq = 0.03 * mv * Math.cos(2 * th);
      }
    }

    // excited idle bounce for walkers / idle sway for everyone
    const still = (1 - mv) * awake;
    if (c.gait !== "hop" && c.gait !== "bounce") {
      y += ex * still * 0.035 * H * Math.abs(Math.sin(t * 7.5));
      sq += ex * still * 0.05 * Math.sin(t * 15);
    }
    roll += Math.sin(t * 1.15) * 0.025 * still;

    // breathing
    this.breathP += dt * (2.5 - 1.2 * sl);
    const br = Math.sin(this.breathP) * (0.016 + 0.026 * sl) * (1 - 0.7 * mv);

    /* ---------------- emotes ---------------- */
    let eY = 0,
      eZ = 0,
      eYaw = 0,
      eSq = 0,
      eRoll = 0,
      eHP = 0,
      eHR = 0,
      face = -1;
    this.earPerk = 0;
    this.earDroop = 0;
    if (this.emK) {
      this.emT += dt;
      const u = this.emT / EMOTE_DUR[this.emK];
      if (u >= 1) this.emK = null;
      else if (this.emK === "happy") {
        const a0 = 0.18,
          a1 = 0.8;
        if (u < a0) eSq = -0.16 * Math.sin((Math.PI * u) / a0);
        else if (u < a1) {
          const a = (u - a0) / (a1 - a0);
          eY = 0.34 * H * 4 * a * (1 - a);
          eSq = 0.12 * (1 - 2 * a) * (1 - 2 * a);
          eYaw = TAU * sstep(0, 1, a);
        } else eSq = -0.14 * Math.sin((Math.PI * (u - a1)) / (1 - a1));
        face = FACE.happy;
      } else if (this.emK === "surprised") {
        const a = Math.min(1, u / 0.3);
        eZ = -0.16 * H * (1 - (1 - a) * (1 - a)) * (1 - sstep(0.5, 1, u));
        eY = u < 0.3 ? 0.14 * H * Math.sin(Math.PI * a) : 0;
        eSq = 0.18 * Math.sin(Math.PI * Math.min(1, u * 2.4)) * (1 - u);
        eHP = -0.28 * Math.sin(Math.PI * u);
        this.earPerk = Math.sin(Math.PI * Math.min(1, u * 1.4));
        face = FACE.surprised;
      } else if (this.emK === "love") {
        const env = 1 - u * 0.5;
        eRoll = 0.2 * Math.sin(u * Math.PI * 6) * env;
        eY = 0.06 * H * Math.abs(Math.sin(u * Math.PI * 3));
        eSq = 0.05 * Math.sin(u * Math.PI * 6);
        eHR = 0.28 * Math.sin(Math.PI * u);
        face = FACE.happy;
      } else {
        const env = sstep(0, 0.2, u) * (1 - sstep(0.78, 1, u));
        eSq = -0.1 * env;
        eHP = 0.4 * env;
        eHR = 0.12 * env;
        this.earDroop = env;
        face = FACE.sad;
      }
    }

    /* ---------------- attack ---------------- */
    const ap = this.ap;
    ap.z = ap.y = ap.pitch = ap.roll = ap.sq = ap.hp = ap.hz = ap.hy = 0;
    ap.face = -1;
    if (this.atkU >= 0) {
      this.atkT += dt;
      const u = this.atkT / c.attackDur;
      if (u >= 1) this.atkU = -1;
      else {
        this.atkU = u;
        (R.attackPose ?? genericAttack)(this, u, ap);
        if (ap.face >= 0) face = ap.face;
      }
    }

    /* ---------------- base transform ---------------- */
    sq += ap.sq;
    let sy = 1 + sq + br;
    let sxz = 1 - sq * 0.5 - br * 0.4;
    sy *= 1 - 0.08 * sl;
    sxz *= 1 + 0.05 * sl;
    sy *= 1 + eSq;
    sxz *= 1 - eSq * 0.5;
    const by = y * awake - c.sleepDrop * sl + eY + ap.y;
    const base = R.base;
    const bp = pitch * awake + ap.pitch;
    const pp = c.pitchPivot;
    base.position.set(0, by + pp * (1 - Math.cos(bp)), eZ + ap.z - pp * Math.sin(bp));
    base.rotation.set(bp, yaw + eYaw, roll + eRoll + c.sleepRoll * sl + ap.roll);
    base.scaling.set(sxz, sy, sxz);
    // the seat rides the bob / pitch but not the squash
    if (R.seat) R.seat.scaling.set(1 / sxz, 1 / sy, 1 / sxz);

    /* ---------------- secondary-motion springs ---------------- */
    const top = by + sy * H * 0.6;
    const rq = this.root.rotationQuaternion;
    const ryaw = rq ? Math.atan2(2 * (rq.w * rq.y + rq.x * rq.z), 1 - 2 * (rq.y * rq.y + rq.x * rq.x)) : this.root.rotation.y;
    if (this.first) {
      this.pTop = top;
      this.pV = 0;
      this.pYaw = ryaw;
      this.pMove = mv;
      this.first = false;
    }
    const v = (top - this.pTop) / dt;
    const acc = Math.max(-60, Math.min(60, (v - this.pV) / dt));
    this.pTop = top;
    this.pV = v;
    let dyaw = ryaw - this.pYaw;
    if (dyaw > Math.PI) dyaw -= TAU;
    else if (dyaw < -Math.PI) dyaw += TAU;
    this.pYaw = ryaw;
    const yawRate = Math.max(-12, Math.min(12, dyaw / dt + (eYaw !== 0 ? 6 : 0)));
    const dMove = (mv - this.pMove) / dt;
    this.pMove = mv;
    const n = Math.ceil(dt / 0.01);
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.jigV += (-170 * this.jig - 7 * this.jigV - acc * 6) * h;
      this.jig += this.jigV * h;
      this.jxV += (-120 * this.jx - 6 * this.jxV - yawRate * 6) * h;
      this.jx += this.jxV * h;
      this.jzV += (-120 * this.jz - 6 * this.jzV - dMove * 8) * h;
      this.jz += this.jzV * h;
    }
    this.jig = Math.max(-0.9, Math.min(0.9, this.jig));
    this.jx = Math.max(-0.6, Math.min(0.6, this.jx));
    this.jz = Math.max(-0.6, Math.min(0.6, this.jz));
    const jig = this.jig,
      jx = this.jx,
      jz = this.jz;

    /* ---------------- head / look ---------------- */
    this.lookT -= dt;
    if (this.lookT <= 0) {
      const r = this.rand;
      this.lookT = 1.2 + r() * 3.2;
      if (r() < 0.3) {
        this.tYaw = 0;
        this.tPitch = 0;
        this.tTilt = 0;
      } else {
        this.tYaw = (r() * 2 - 1) * 0.6;
        this.tPitch = (r() * 2 - 1) * 0.16 - 0.04;
        this.tTilt = r() < 0.45 ? (r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.14) : 0;
      }
    }
    const lk = c.look * (1 - mv * 0.75) * awake;
    this.lookYaw = damp(this.lookYaw, this.tYaw * lk, 4.5, dt);
    this.lookPitch = damp(this.lookPitch, this.tPitch * lk, 4.5, dt);
    this.lookTilt = damp(this.lookTilt, this.tTilt * lk, 3.5, dt);
    const hd = R.head;
    hd.rotation.set(
      this.lookPitch + c.sleepHeadPitch * sl + eHP * c.look + headBobP * awake + ap.hp,
      this.lookYaw + c.sleepHeadYaw * sl,
      this.lookTilt + c.sleepHeadRoll * sl + eHR * c.look + ex * still * 0.12 * Math.sin(t * 5) * c.look,
    );
    hd.position.set(this.headRest.x, this.headRest.y + jig * c.headLag - c.sleepHeadDrop * sl + ap.hy, this.headRest.z + ap.hz);

    /* ---------------- ears ---------------- */
    for (let i = 0; i < R.ears.length; i++) {
      const e = R.ears[i];
      e.twT -= dt;
      if (e.twT <= 0) {
        e.twT = 1.5 + this.rand() * 5;
        if (sl < 0.5) e.tw = 1;
      }
      e.tw = Math.max(0, e.tw - dt * 2.8);
      const tw = Math.sin(e.tw * Math.PI * 5) * 0.28 * e.tw;
      const flop = -jig * e.gain;
      const out = flop * 0.55 + e.sleep * 0.7 * sl + this.earDroop * 0.45 - this.earPerk * 0.18 + tw + ex * 0.12 * Math.sin(t * 11 + e.side) * awake;
      const back = mv * e.drag + flop * 0.45 + jz * e.gain * 0.5 + e.sleep * sl + this.earDroop * 0.55 - this.earPerk * 0.25;
      e.n.rotation.set(-back, e.side * jx * 0.4 * e.gain, -e.side * out);
    }

    /* ---------------- tails ---------------- */
    for (let i = 0; i < R.tails.length; i++) {
      const tl = R.tails[i];
      const f = tl.f * (1 + ex * 1.6);
      const sway = (Math.sin(t * f) * tl.amp * (1 + ex * 1.2) * (1 - mv * 0.6) + Math.sin(th) * tl.walk * mv) * awake + jx * 0.9;
      const lift = jig * tl.gain - this.earDroop * 0.45 + tl.curlX * sl + this.earPerk * 0.2;
      if (tl.axis === "y") tl.n.rotation.set(lift, sway + tl.curlY * sl, 0);
      else tl.n.rotation.set(lift, tl.curlY * sl, sway);
    }

    /* ---------------- wings ---------------- */
    if (R.wings.length) {
      this.flutterT -= dt;
      if (this.flutterT <= 0) {
        this.flutterT = 4 + this.rand() * 6;
        if (sl < 0.5 && mv < 0.3) this.flutter = 1;
      }
      this.flutter = Math.max(0, this.flutter - dt * 1.4);
    }
    for (let i = 0; i < R.wings.length; i++) {
      const w = R.wings[i];
      let a = 0;
      if (w.kind === "bat") {
        const flap = Math.sin(th);
        a = (w.rest + w.amp * flap) * awake - 0.25 * sl;
      } else {
        const fast = Math.sin(t * 34);
        const happy = this.emK === "happy" || this.emK === "love" ? 1 : 0;
        const aflap = Math.max(this.air * (w.kind === "bird" ? 1 : 0.4), this.flutter > 0 ? Math.min(1, this.flutter * 2.5) : 0, happy, ex * 0.45);
        const walkFlap = w.kind === "duck" ? 0.18 * mv * (0.5 + 0.5 * Math.sin(th * 2)) : 0;
        a = w.rest + (aflap * w.amp * (0.55 + 0.45 * fast) + 0.05 * Math.sin(t * 2.2) + walkFlap) * awake - this.earDroop * 0.1;
      }
      w.n.rotation.z = w.side * a;
      // bats wrap their wings around themselves to sleep
      if (w.kind === "bat") w.n.rotation.y = -w.side * 1.25 * sl;
    }

    /* ---------------- legs ---------------- */
    const hop = c.gait === "hop" || c.gait === "bounce";
    for (let i = 0; i < R.legs.length; i++) {
      const L = R.legs[i];
      let dz = 0,
        dy = 0,
        rx = 0;
      if (c.gait === "gallop") {
        // legs swing from the hip; the swinging-forward leg lifts and folds (fake knee)
        const g = this.gal;
        const a = th + lerp(L.ph, L.ph2 ?? L.ph, g) * TAU;
        const up = Math.max(0, Math.cos(a)) * mv * awake;
        rx = -(L.swing ?? 0.35) * L.k * (1 + 0.7 * g) * Math.sin(a) * mv * awake + (L.sleepRx ?? 0) * sl;
        dy = c.lift * up * (1 + 0.6 * g);
        L.n.scaling.y = 1 - 0.2 * up - 0.25 * sl;
      } else if (hop) {
        dz = L.hopDz * this.air;
        rx = L.hopRx * this.air;
      } else if (c.gait !== "hover") {
        const a = th + L.ph * TAU;
        dz = c.stride * L.k * Math.sin(a) * mv;
        dy = c.lift * Math.max(0, Math.cos(a)) * mv;
        rx = -0.35 * L.k * Math.sin(a) * mv * (c.gait === "shuffle" ? 1 : 0);
      }
      dy += L.tuck * sl;
      L.n.position.set(L.rest.x, L.rest.y + dy, L.rest.z + dz * awake);
      L.n.rotation.x = rx;
    }

    /* ---------------- face ---------------- */
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkOn = 0.13;
      this.blinkT = this.rand() < 0.2 ? 0.3 : 1.6 + this.rand() * 3.4;
    }
    if (this.blinkOn > 0) this.blinkOn -= dt;
    if (ex > 0.5) {
      this.happyT -= dt;
      if (this.happyT < -1.6) this.happyT = 1.2 + this.rand();
    } else this.happyT = 0;
    let fi: number = FACE.open;
    if (sl > 0.35) fi = FACE.closed;
    else if (face >= 0) fi = face;
    else if (this.blinkOn > 0) fi = FACE.closed;
    else if (this.happyT > 0) fi = FACE.happy;
    this.setFace(fi);

    /* ---------------- rare sparkle ---------------- */
    const sp = R.sparkle;
    if (sp && R.sparklePos) {
      const q = R.sparklePos;
      const pulse = 0.75 + 0.25 * Math.sin(t * 3.1);
      sp.position.set(q[0] + Math.sin(t * 1.3) * 0.03, q[1] + Math.sin(t * 2.2) * 0.035 - c.sleepDrop * sl, q[2]);
      sp.rotation.set(0, t * 1.6, Math.sin(t * 1.7) * 0.3);
      sp.scaling.setAll(pulse);
    }

    R.hook?.(this, dt);
  }
}

/* ================================================================== */
/* Builders                                                            */
/* ================================================================== */

interface Ctx {
  scene: Scene;
  k: Kit;
  root: TransformNode;
  base: TransformNode;
  rare: boolean;
}

function ctx(scene: Scene, species: SpeciesId, variant: number, outline = 0.018): Ctx {
  const root = new TransformNode("critter_" + species, scene);
  const k = new Kit(scene, root, outline);
  const base = k.node("base", root, [0, 0, 0]);
  return { scene, k, root, base, rare: variant === 1 };
}

const rotDir = (rot: V3, v: V3): V3 => {
  const q = Quaternion.FromEulerAngles(rot[0], rot[1], rot[2]);
  const o = new Vector3(v[0], v[1], v[2]).applyRotationQuaternion(q);
  return [o.x, o.y, o.z];
};

/** Ear built as an outer soft cone + inner colour, splayed out (base at `at`). */
function coneEar(
  c: Ctx,
  side: number,
  at: V3,
  h: number,
  r: number,
  splay: number,
  back: number,
  outer: string,
  inner: string,
  tip?: string,
  flat = 0.55,
  tipK = 0.18,
): Mesh[] {
  const rot: V3 = [-back, 0, -side * splay];
  const fwd = rotDir(rot, [0, 0, 1]);
  return [
    softConeM(c.scene, h, r, at, tip ?? outer, rot, tip ? outer : undefined, [1, 1, flat], 10, tipK),
    softConeM(c.scene, h * 0.74, r * 0.62, add(add(at, fwd, r * flat * 0.42), rotDir(rot, [0, 1, 0]), h * 0.06), inner, rot, undefined, [1, 1, 0.5], 10, tipK),
  ];
}

/** Tiny accessories for rare variants. */
function bow(c: Ctx, at: V3, color: string, rot: V3 = [0, 0, 0], s = 1): Mesh[] {
  const sc = c.scene;
  return [
    blobM(sc, [0.05 * s, 0.035 * s, 0.022 * s], add(at, rotDir(rot, [-0.042 * s, 0, 0])), color, [rot[0], rot[1], rot[2] + 0.35]),
    blobM(sc, [0.05 * s, 0.035 * s, 0.022 * s], add(at, rotDir(rot, [0.042 * s, 0, 0])), color, [rot[0], rot[1], rot[2] - 0.35]),
    ballM(sc, 0.022 * s, add(at, rotDir(rot, [0, 0, 0.008 * s])), color, undefined, 6),
  ];
}
function flower(c: Ctx, at: V3, n: V3, petal: string, centre: string, s = 1): Mesh[] {
  const out: Mesh[] = [];
  const rot = rotZTo(n);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    out.push(blobM(c.scene, [0.026 * s, 0.026 * s, 0.012 * s], add(at, rotDir(rot, [Math.cos(a) * 0.03 * s, Math.sin(a) * 0.03 * s, 0])), petal, rot, undefined, 6));
  }
  out.push(ballM(c.scene, 0.02 * s, add(at, n, 0.008 * s), centre, undefined, 6));
  return out;
}
function crown(c: Ctx, at: V3, s = 1, color = "#ffd85a"): Mesh[] {
  const out: Mesh[] = [];
  const sc = c.scene;
  out.push(blobM(sc, [0.055 * s, 0.022 * s, 0.055 * s], add(at, [0, 0.012 * s, 0]), color, undefined, undefined, 10));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const p: V3 = add(at, [Math.sin(a) * 0.045 * s, 0.02 * s, Math.cos(a) * 0.045 * s]);
    out.push(softConeM(sc, 0.05 * s, 0.018 * s, p, color, undefined, undefined, undefined, 6, 0.3));
    out.push(ballM(sc, 0.011 * s, add(p, [0, 0.05 * s, 0]), i % 2 ? "#ff9fc0" : "#9fd8ff", undefined, 4));
  }
  return out;
}

/** Rare variants: a little emissive sparkle star floating near the head. */
function addSparkle(c: Ctx, rig: Partial<Rig>, pos: V3) {
  const n = c.k.node("sparkleNode", c.root, pos);
  const m = puffStar(c.scene, 4, 0.055, 0.02, 0.012, pos, "#fff4b8");
  c.k.part("sparkle", n, pos, [m], { outline: 0.008, material: toonMat(c.scene, { name: "sparkle", emissive: "#d9b45a", rim: 0 }), shadow: false });
  rig.sparkle = n;
  rig.sparklePos = pos;
}

function finish(c: Ctx, cfg: Partial<Cfg>, rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] }): Critter {
  const full: Rig = {
    root: c.root,
    base: c.base,
    head: rig.head,
    faces: rig.faces,
    ears: rig.ears ?? [],
    tails: rig.tails ?? [],
    wings: rig.wings ?? [],
    legs: rig.legs ?? [],
    sparkle: rig.sparkle,
    sparklePos: rig.sparklePos,
    hook: rig.hook,
    attackPose: rig.attackPose,
    seat: rig.seat,
    seatY: rig.seatY,
    nodes: rig.nodes ?? {},
  };
  const cr = new Critter(full, { ...DEF, ...cfg });
  cr.update(1 / 60, { speed: 0 });
  return cr;
}

const ear = (n: TransformNode, side: number, gain: number, sleep = 0.4, drag = 0.3): Ear => ({ n, side, gain, sleep, drag, tw: 0, twT: 2 });
const leg = (n: TransformNode, ph: number, side: number, tuck = 0, k = 1, hopDz = 0, hopRx = 0): Leg => ({ n, rest: n.position.clone(), ph, side, tuck, hopDz, hopRx, k });

/* ------------------------------------------------------------------ */
/* Species                                                             */
/* ------------------------------------------------------------------ */

function buildPuffbun(c: Ctx): Critter {
  const P = c.rare
    ? { fur: "#ddd0fb", furB: "#c7b6f2", inner: "#ffc4dc", tail: "#f6f0ff", nose: "#ff9cbc", acc: "#ffd760" }
    : { fur: "#fff6ef", furB: "#f7e0dc", inner: "#ffbfd2", tail: "#ffffff", nose: "#ff9cbc", acc: "#ffd760" };
  const { scene: s, k } = c;
  const body: Mesh[] = [
    blobM(s, [0.2, 0.18, 0.2], [0, 0.19, -0.02], P.fur, undefined, P.furB, 12),
    blobM(s, [0.085, 0.085, 0.12], [-0.13, 0.11, -0.05], P.fur, undefined, P.furB),
    blobM(s, [0.085, 0.085, 0.12], [0.13, 0.11, -0.05], P.fur, undefined, P.furB),
    blobM(s, [0.06, 0.04, 0.11], [-0.12, 0.035, 0.03], P.fur),
    blobM(s, [0.06, 0.04, 0.11], [0.12, 0.035, 0.03], P.fur),
    blobM(s, [0.05, 0.045, 0.06], [-0.065, 0.045, 0.15], P.fur),
    blobM(s, [0.05, 0.045, 0.06], [0.065, 0.045, 0.15], P.fur),
    ballM(s, 0.075, [0, 0.16, -0.22], P.tail, undefined, 8),
  ];
  k.part("body", c.base, [0, 0, 0], body);
  const head = k.node("head", c.base, [0, 0.3, 0.04]);
  const HE: Ell = { c: [0, 0.45, 0.06], r: [0.215, 0.185, 0.19] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [
    blobM(s, HE.r, HE.c, P.fur, undefined, P.furB, 14),
    blobM(s, [0.085, 0.07, 0.075], [-0.12, 0.385, 0.13], P.fur),
    blobM(s, [0.085, 0.07, 0.075], [0.12, 0.385, 0.13], P.fur),
  ];
  if (c.rare) hs.push(puffStar(s, 5, 0.05, 0.024, 0.016, [0.13, 0.6, 0.1], P.acc, [-0.3, 0.4, -0.3]));
    return hs;
  };
  const MU: Ell = { c: [0, 0.39, 0.14], r: [0.12, 0.08, 0.12] };
  const faces = buildHeads(k, head, [0, 0.3, 0.04], hs, {
    head: HE,
    eyeYaw: 0.44,
    eyePitch: 0.06,
    eyeW: 0.036,
    eyeH: 0.047,
    cheekYaw: 0.74,
    cheekPitch: -0.2,
    cheekR: 0.036,
    nose: { ell: MU, pitch: 0.42, r: 0.02, color: P.nose, w: 1.3 },
    mouth: { ell: MU, pitch: 0.2, w: 0.022, h: 0.012, style: "w" },
  });
  const ears: Ear[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.075, 0.585, 0.02];
    const en = k.node("ear" + sd, head, piv);
    const rot: V3 = [-0.12, 0, -sd * 0.2];
    const up = rotDir(rot, [0, 1, 0]);
    const fw = rotDir(rot, [0, 0, 1]);
    const ctr = add(piv, up, 0.15);
    k.part("earMesh" + sd, en, piv, [
      blobM(s, [0.058, 0.175, 0.04], ctr, P.fur, rot, P.furB),
      blobM(s, [0.032, 0.13, 0.02], add(add(ctr, fw, 0.026), up, 0.005), P.inner, rot),
    ]);
    ears.push(ear(en, sd, 0.9, 0.75, 0.3));
  }
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = { head, faces, ears };
  if (c.rare) addSparkle(c, rig, [-0.26, 0.82, 0.05]);
  return finish(c, { gait: "hop", freq: 1.9, hopH: 0.17, squash: 0.2, pitch: 0.22, height: 0.86, radius: 0.26, sleepDrop: 0.03, sleepHeadPitch: 0.25 }, rig);
}

function buildChirpy(c: Ctx): Critter {
  const P = c.rare
    ? { body: "#ffc0d6", bodyB: "#f6a4c2", belly: "#fff3e8", wing: "#f593b7", beak: "#ffc45e", tuft: "#ffd85a", feet: "#ffad5e" }
    : { body: "#a9d8f7", bodyB: "#8cc4ef", belly: "#fff7e6", wing: "#7db6ea", beak: "#ffc15e", tuft: "#7db6ea", feet: "#ffad5e" };
  const { scene: s, k } = c;
  const head = k.node("head", c.base, [0, 0.06, 0]);
  const BE: Ell = { c: [0, 0.255, 0], r: [0.225, 0.215, 0.215] };
  const bs = (): Mesh[] => {
    const bs: Mesh[] = [
    blobM(s, BE.r, BE.c, P.body, undefined, P.bodyB, 14),
    capOn(s, BE, 0, -0.42, 0.72, P.belly),
    // tail feathers
    blobM(s, [0.05, 0.022, 0.1], [-0.035, 0.24, -0.23], P.wing, [-0.7, -0.25, 0]),
    blobM(s, [0.05, 0.022, 0.1], [0.035, 0.24, -0.23], P.wing, [-0.7, 0.25, 0]),
    // beak (two halves)
    softConeM(s, 0.085, 0.04, [0, 0.262, 0.19], P.beak, [Math.PI / 2 - 0.08, 0, 0], undefined, [1, 1, 0.7], 8, 0.3),
  ];
    return bs;
  };
  const feet: Mesh[] = [];
  for (const sd of [-1, 1]) {
    feet.push(blobM(s, [0.035, 0.05, 0.035], [sd * 0.075, 0.05, 0.02], P.feet));
    feet.push(blobM(s, [0.04, 0.018, 0.06], [sd * 0.08, 0.016, 0.06], P.feet));
  }
  const feetNode = k.node("feet", c.base, [0, 0.05, 0]);
  k.part("feetMesh", feetNode, [0, 0.05, 0], feet);
  const faces = buildHeads(k, head, [0, 0.06, 0], bs, {
    head: BE,
    eyeYaw: 0.4,
    eyePitch: 0.15,
    eyeW: 0.033,
    eyeH: 0.044,
    cheekYaw: 0.66,
    cheekPitch: -0.02,
    cheekR: 0.032,
  });
  // tuft
  const tpiv: V3 = [0, 0.46, 0.02];
  const tuftN = k.node("tuft", head, tpiv);
  const tuft: Mesh[] = [
    softConeM(s, 0.1, 0.03, [0, 0.45, 0.03], P.tuft, [0.35, 0, 0], undefined, [1, 1, 0.6], 8, 0.35),
    softConeM(s, 0.085, 0.026, [0.012, 0.45, 0.0], P.tuft, [-0.1, 0, -0.4], undefined, [1, 1, 0.6], 8, 0.35),
    softConeM(s, 0.075, 0.024, [-0.012, 0.45, 0.0], P.tuft, [-0.1, 0, 0.4], undefined, [1, 1, 0.6], 8, 0.35),
  ];
  if (c.rare) tuft.push(...flower(c, [0.06, 0.45, 0.06], [0.4, 0.6, 0.7], "#ffffff", "#ffd85a", 0.8));
  k.part("tuftMesh", tuftN, tpiv, tuft);
  const ears: Ear[] = [ear(tuftN, 0, 1.4, 0.2, 0.4)];
  // wings
  const wings: Wing[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.19, 0.31, -0.03];
    const wn = k.node("wing" + sd, c.base, piv);
    k.part("wingMesh" + sd, wn, piv, [blobM(s, [0.03, 0.1, 0.085], add(piv, [sd * 0.025, -0.075, -0.01]), P.wing, [0.25, 0, sd * 0.18])]);
    wings.push({ n: wn, side: sd, rest: 0.05, amp: 1.0, kind: "bird" });
  }
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = { head, faces, ears, wings, nodes: { tuft: tuftN } };
  if (c.rare) addSparkle(c, rig, [0.24, 0.55, 0.02]);
  return finish(c, { gait: "hop", freq: 2.6, hopH: 0.1, squash: 0.18, pitch: 0.12, height: 0.56, radius: 0.22, look: 0.6, headLag: 0.0, sleepDrop: 0.02, sleepHeadPitch: 0.12, sleepHeadRoll: 0.12, sleepHeadDrop: 0.0 }, rig);
}

function buildFennix(c: Ctx): Critter {
  const P = c.rare
    ? { fur: "#ffb3cf", furB: "#f797bb", cream: "#fff3f0", sock: "#b9a1ec", inner: "#fff0f4", tip: "#b9a1ec", bow: "#b9a1ec" }
    : { fur: "#ffb27a", furB: "#fb9a63", cream: "#fff4e4", sock: "#c98a78", inner: "#fff1e2", tip: "#d97f62", bow: "#ffffff" };
  const { scene: s, k } = c;
  const BE: Ell = { c: [0, 0.25, -0.03], r: [0.16, 0.15, 0.21] };
  k.part("body", c.base, [0, 0, 0], [
    blobM(s, BE.r, BE.c, P.fur, undefined, P.furB, 12),
    capOn(s, BE, 0, -0.2, 0.55, P.cream),
    blobM(s, [0.12, 0.1, 0.07], [0, 0.3, 0.14], P.cream),
  ]);
  const legs: Leg[] = [];
  const legMesh = (x: number, zz: number) => [blobM(s, [0.052, 0.085, 0.055], [x, 0.085, zz], P.fur, undefined, P.sock), blobM(s, [0.05, 0.03, 0.06], [x, 0.03, zz + 0.012], P.sock)];
  const la = k.node("legsA", c.base, [0, 0, 0]);
  k.part("legsAMesh", la, [0, 0, 0], [...legMesh(-0.085, 0.1), ...legMesh(0.085, -0.15)]);
  const lb = k.node("legsB", c.base, [0, 0, 0]);
  k.part("legsBMesh", lb, [0, 0, 0], [...legMesh(0.085, 0.1), ...legMesh(-0.085, -0.15)]);
  legs.push(leg(la, 0, 1, 0.06), leg(lb, 0.5, -1, 0.06));

  const hp: V3 = [0, 0.36, 0.13];
  const head = k.node("head", c.base, hp);
  const HE: Ell = { c: [0, 0.5, 0.15], r: [0.2, 0.175, 0.175] };
  const MU: Ell = { c: [0, 0.445, 0.27], r: [0.085, 0.062, 0.085] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [
    blobM(s, HE.r, HE.c, P.fur, undefined, P.furB, 14),
    capOn(s, HE, 0, -0.55, 0.62, P.cream, { sx: 1.15 }),
    blobM(s, [0.085, 0.07, 0.075], [-0.14, 0.44, 0.16], P.cream, [0, 0, 0.5]),
    blobM(s, [0.085, 0.07, 0.075], [0.14, 0.44, 0.16], P.cream, [0, 0, -0.5]),
    blobM(s, MU.r, MU.c, P.cream),
  ];
  if (c.rare) hs.push(...bow(c, [0.12, 0.64, 0.14], P.bow, [0, 0.2, -0.4], 1));
    return hs;
  };
  const faces = buildHeads(k, head, hp, hs, {
    head: HE,
    eyeYaw: 0.43,
    eyePitch: 0.1,
    eyeW: 0.035,
    eyeH: 0.047,
    cheekYaw: 0.74,
    cheekPitch: -0.16,
    cheekR: 0.032,
    nose: { ell: MU, pitch: 0.5, r: 0.024, color: "#4a3a52", w: 1.35 },
    mouth: { ell: MU, pitch: 0.0, w: 0.022, h: 0.012, style: "w" },
  });
  const ears: Ear[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.1, 0.6, 0.13];
    const en = k.node("ear" + sd, head, piv);
    k.part("earMesh" + sd, en, piv, coneEar(c, sd, piv, 0.2, 0.085, 0.32, 0.12, P.fur, P.inner, P.tip, 0.55, 0.16));
    ears.push(ear(en, sd, 0.6, 0.45, 0.35));
  }
  // big fluffy tail: chain of overlapping puffs curling up & back
  const tp: V3 = [0, 0.24, -0.2];
  const tn = k.node("tail", c.base, tp);
  const tail: Mesh[] = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const p: V3 = [Math.sin(u * 2.2) * 0.03, 0.24 + 0.03 + 0.26 * u * u + 0.06 * u, -0.2 - 0.07 - 0.2 * u + 0.06 * u * u];
    const r = 0.065 + 0.075 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.9);
    tail.push(ballM(s, r, p, u > 0.74 ? P.cream : P.fur, u > 0.74 ? undefined : P.furB, 10));
  }
  k.part("tailMesh", tn, tp, tail);
  const tails: Tail[] = [{ n: tn, amp: 0.22, f: 2.2, walk: 0.3, gain: 0.5, curlY: 1.6, curlX: -0.5, axis: "y" }];
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = { head, faces, ears, tails, legs };
  if (c.rare) addSparkle(c, rig, [-0.26, 0.78, 0.1]);
  return finish(
    c,
    { gait: "trot", freq: 2.6, bob: 0.03, stride: 0.07, lift: 0.06, height: 0.8, radius: 0.3, sleepDrop: 0.065, sleepHeadPitch: 0.2, sleepHeadYaw: 0.45, sleepHeadRoll: 0.38, sleepHeadDrop: 0.06, sleepRoll: 0.08 },
    rig,
  );
}

function buildHoglet(c: Ctx): Critter {
  const P = c.rare
    ? { spine: "#c6aef0", spineTip: "#efe4ff", face: "#fff3e6", feet: "#ffbfcf", ear: "#ffc7d6" }
    : { spine: "#cf9a86", spineTip: "#f8d9c6", face: "#fff1df", feet: "#ffbcb6", ear: "#ffc4c0" };
  const { scene: s, k } = c;
  const BE: Ell = { c: [0, 0.22, -0.04], r: [0.235, 0.2, 0.24] };
  const bs: Mesh[] = [blobM(s, BE.r, BE.c, P.spine, undefined, undefined, 12), capOn(s, BE, 0, -0.75, 0.6, P.face)];
  // spine puffs: clusters of soft cones over the back
  const R = rng(1234);
  for (let row = 0; row < 4; row++) {
    const pitch = -0.15 + row * 0.42;
    const cnt = [9, 8, 6, 3][row];
    for (let i = 0; i < cnt; i++) {
      const spread = [2.3, 2.15, 1.9, 1.2][row];
      const yaw = Math.PI + (cnt === 1 ? 0 : (i / (cnt - 1) - 0.5) * 2 * spread) + (row % 2 ? 0.12 : 0);
      if (row === 3 && cnt === 1) continue;
      const { p, n } = surf(BE, yaw, pitch, -0.02);
      for (let j = 0; j < 3; j++) {
        const jit: V3 = [(R() - 0.5) * 0.5, (R() - 0.5) * 0.5, (R() - 0.5) * 0.5];
        const dir: V3 = [n[0] + jit[0] - 0.25 * Math.sign(n[2] + 0.001) * 0, n[1] + jit[1] + 0.15, n[2] + jit[2] - 0.25];
        const l = Math.hypot(dir[0], dir[1], dir[2]);
        const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
        const off: V3 = [(R() - 0.5) * 0.05, (R() - 0.5) * 0.05, (R() - 0.5) * 0.05];
        bs.push(softConeM(s, 0.1 + R() * 0.03, 0.042, add(p, off), P.spineTip, rotYTo(d), P.spine, undefined, 7, 0.28));
      }
    }
  }
  if (c.rare) {
    // a little strawberry stuck on the spines
    bs.push(blobM(s, [0.05, 0.055, 0.05], [0.09, 0.47, -0.08], "#ff8fa3", [0, 0, 0.3], "#ff6f8c"));
    bs.push(softConeM(s, 0.03, 0.03, [0.1, 0.51, -0.08], "#8fd27a", [0, 0, -0.3], undefined, [1, 0.6, 1], 6, 0.4));
  }
  k.part("body", c.base, [0, 0, 0], bs, { outline: 0.02 });
  const hp: V3 = [0, 0.18, 0.1];
  const head = k.node("head", c.base, hp);
  const HE: Ell = { c: [0, 0.235, 0.13], r: [0.165, 0.15, 0.15] };
  const SN: Ell = { c: [0, 0.205, 0.28], r: [0.065, 0.055, 0.07] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [
    blobM(s, HE.r, HE.c, P.face, undefined, undefined, 12),
    blobM(s, SN.r, SN.c, P.face),
    blobM(s, [0.045, 0.045, 0.025], [-0.12, 0.36, 0.13], P.ear, [0, 0.3, 0.3]),
    blobM(s, [0.045, 0.045, 0.025], [0.12, 0.36, 0.13], P.ear, [0, -0.3, -0.3]),
  ];
    return hs;
  };
  const faces = buildHeads(k, head, hp, hs, {
    head: HE,
    eyeYaw: 0.44,
    eyePitch: 0.12,
    eyeW: 0.03,
    eyeH: 0.04,
    cheekYaw: 0.72,
    cheekPitch: -0.12,
    cheekR: 0.03,
    nose: { ell: SN, pitch: 0.15, r: 0.026, color: "#4a3a52", w: 1.2 },
    mouth: { ell: SN, pitch: -0.55, w: 0.022, h: 0.012, style: "smile" },
  }, { outline: 0.02 });
  const legs: Leg[] = [];
  for (const sd of [-1, 1]) {
    const fn = k.node("foot" + sd, c.base, [0, 0, 0]);
    k.part("footMesh" + sd, fn, [0, 0, 0], [blobM(s, [0.055, 0.04, 0.075], [sd * 0.11, 0.035, 0.1], P.feet), blobM(s, [0.05, 0.035, 0.06], [sd * 0.13, 0.03, -0.14], P.feet)], { outline: 0.02 });
    legs.push(leg(fn, sd > 0 ? 0 : 0.5, sd, 0.02));
  }
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = { head, faces, legs };
  if (c.rare) addSparkle(c, rig, [0.24, 0.55, 0.05]);
  return finish(c, { gait: "waddle", freq: 2.6, bob: 0.02, stride: 0.045, lift: 0.04, roll: 0.12, height: 0.52, radius: 0.27, look: 0.7, headLag: 0.02, sleepDrop: 0.02, sleepHeadPitch: 0.3, sleepHeadRoll: 0.1, sleepHeadDrop: 0.03 }, rig);
}

function buildShroomy(c: Ctx): Critter {
  const P = c.rare
    ? { cap: "#9fe0d6", capB: "#78cdc2", dot: "#fff3b8", body: "#fff6ea", bodyB: "#f3e2d6", gill: "#f5ecdf", feet: "#f3e2d6" }
    : { cap: "#ff9fbf", capB: "#f47fa6", dot: "#ffffff", body: "#fff6ea", bodyB: "#f3e2d6", gill: "#fde7e3", feet: "#f3e2d6" };
  const { scene: s, k } = c;
  const head = k.node("head", c.base, [0, 0.05, 0]);
  const BE: Ell = { c: [0, 0.18, 0], r: [0.155, 0.17, 0.145] };
  const bs = (): Mesh[] => {
    const bs: Mesh[] = [
    blobM(s, BE.r, BE.c, P.body, undefined, P.bodyB, 12),
    blobM(s, [0.035, 0.05, 0.035], [-0.15, 0.17, 0.02], P.body, [0, 0, -0.6]),
    blobM(s, [0.035, 0.05, 0.035], [0.15, 0.17, 0.02], P.body, [0, 0, 0.6]),
  ];
    return bs;
  };
  k.part("feet", c.base, [0, 0, 0], [blobM(s, [0.045, 0.03, 0.06], [-0.06, 0.025, 0.04], P.feet), blobM(s, [0.045, 0.03, 0.06], [0.06, 0.025, 0.04], P.feet)]);
  const faces = buildHeads(k, head, [0, 0.05, 0], bs, {
    head: BE,
    eyeYaw: 0.38,
    eyePitch: 0.02,
    eyeW: 0.03,
    eyeH: 0.04,
    cheekYaw: 0.62,
    cheekPitch: -0.2,
    cheekR: 0.03,
    mouth: { pitch: -0.2, w: 0.022, h: 0.012, style: "smile" },
  });
  // cap
  const cp: V3 = [0, 0.29, 0];
  const capN = k.node("cap", head, cp);
  const CE: Ell = { c: [0, 0.29, 0], r: [0.27, 0.215, 0.26] };
  const prof: [number, number][] = [[0, 0.268], [0.2, 0.262], [0.25, 0.27], [0.272, 0.285]];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    prof.push([0.27 * Math.cos(a) + (i === 0 ? 0.004 : 0), 0.29 + 0.215 * Math.sin(a)]);
  }
  const dome = lathe(s, prof, { color: P.cap, bottom: P.capB }, 18);
  dome.scaling.z = 0.26 / 0.27;
  const capM: Mesh[] = [dome];
  const R = rng(77);
  const spots: [number, number, number][] = [
    [0, 1.35, 0.06],
    [0.0, 0.5, 0.05],
    [0.95, 0.55, 0.045],
    [-0.95, 0.55, 0.045],
    [2.1, 0.55, 0.05],
    [-2.1, 0.55, 0.05],
    [Math.PI, 0.6, 0.05],
    [0.5, 0.95, 0.035],
    [-0.5, 0.95, 0.035],
    [1.6, 1.0, 0.035],
    [-1.6, 1.0, 0.035],
  ];
  for (const [yaw, pitch, r] of spots) capM.push(decal(s, CE, yaw, pitch, [r * (0.9 + R() * 0.2), r, r * 0.35], P.dot, 0.35, 0, 8));
  if (c.rare) capM.push(softConeM(s, 0.07, 0.028, [0.03, 0.5, 0], "#8fd27a", [0, 0, -0.5], "#6fbf6a", [1, 1, 0.45], 8, 0.25));
  k.part("capMesh", capN, cp, capM);
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = {
    head,
    faces,
    nodes: { cap: capN },
    hook: (cr) => {
      // cap wobbles on its own spring + leans with idle sway
      capN.rotation.set(cr.jz * 0.6 + Math.sin(cr.t * 1.7) * 0.03, 0, cr.jx * 0.5 + Math.sin(cr.t * 1.3) * 0.04);
      const sq = -cr.jig * 0.25;
      capN.scaling.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    },
  };
  if (c.rare) addSparkle(c, rig, [0.3, 0.6, 0.05]);
  return finish(c, { gait: "bounce", freq: 2.1, hopH: 0.08, squash: 0.26, pitch: 0.06, height: 0.56, radius: 0.27, look: 0.5, headLag: 0, sleepDrop: 0.0, sleepHeadPitch: 0.12, sleepHeadRoll: 0.12, sleepHeadDrop: 0 }, rig);
}

function buildRibbit(c: Ctx): Critter {
  const P = c.rare
    ? { skin: "#ffc4d6", skinB: "#f7a6c1", belly: "#fff6ea", legs: "#f7a6c1", acc: "#ffd85a" }
    : { skin: "#a8e6c2", skinB: "#86d4aa", belly: "#f5fde8", legs: "#86d4aa", acc: "#ffd85a" };
  const { scene: s, k } = c;
  const head = k.node("head", c.base, [0, 0.05, 0]);
  const BE: Ell = { c: [0, 0.165, 0.0], r: [0.235, 0.16, 0.2] };
  const EB: Ell = { c: [0.11, 0.3, 0.07], r: [0.085, 0.08, 0.08] };
  const bs = (): Mesh[] => {
    const bs: Mesh[] = [
    blobM(s, BE.r, BE.c, P.skin, undefined, P.skinB, 14),
    capOn(s, BE, 0, -0.55, 0.62, P.belly, { sx: 1.1 }),
    blobM(s, EB.r, EB.c, P.skin, undefined, undefined, 10),
    blobM(s, EB.r, [-0.11, 0.3, 0.07], P.skin, undefined, undefined, 10),
    // front legs
    blobM(s, [0.04, 0.065, 0.045], [-0.13, 0.06, 0.13], P.skin, [0.2, 0, 0.25]),
    blobM(s, [0.04, 0.065, 0.045], [0.13, 0.06, 0.13], P.skin, [0.2, 0, -0.25]),
    blobM(s, [0.05, 0.018, 0.05], [-0.14, 0.015, 0.16], P.legs),
    blobM(s, [0.05, 0.018, 0.05], [0.14, 0.015, 0.16], P.legs),
  ];
  if (c.rare) bs.push(...crown(c, [0, 0.31, -0.02], 0.85, P.acc));
    return bs;
  };
  const faces = buildHeads(k, head, [0, 0.05, 0], bs, {
    head: BE,
    eyeEll: EB,
    eyeYaw: 0.12,
    eyePitch: 0.18,
    eyeW: 0.036,
    eyeH: 0.044,
    cheekYaw: 0.62,
    cheekPitch: 0.05,
    cheekR: 0.036,
    mouth: { pitch: 0.12, w: 0.07, h: 0.022, style: "smile" },
  });
  // hind legs (separate so they kick out during hops)
  const lp: V3 = [0, 0.08, -0.06];
  const ln = k.node("hind", c.base, lp);
  const hl: Mesh[] = [];
  for (const sd of [-1, 1]) {
    hl.push(blobM(s, [0.085, 0.07, 0.11], [sd * 0.17, 0.075, -0.06], P.skin, [0, sd * 0.3, 0], P.skinB));
    hl.push(blobM(s, [0.06, 0.02, 0.085], [sd * 0.19, 0.018, 0.04], P.legs, [0, sd * 0.35, 0]));
  }
  k.part("hindMesh", ln, lp, hl);
  // throat puff
  const thp: V3 = [0, 0.12, 0.15];
  const thN = k.node("throat", head, thp);
  k.part("throatMesh", thN, thp, [blobM(s, [0.08, 0.05, 0.05], [0, 0.11, 0.15], P.belly)], { outline: 0.015 });
  const legs: Leg[] = [leg(ln, 0, 0, 0, 1, -0.07, -0.9)];
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = {
    head,
    faces,
    legs,
    nodes: { throat: thN },
    hook: (cr) => {
      // throat sac inflates every few seconds while idle
      const t = cr.t % 4.2;
      const puff = t < 0.9 ? Math.sin((t / 0.9) * Math.PI) * (1 - cr.move) * (1 - cr.sleep) : 0;
      const p = Math.max(0.2, 0.2 + puff * 1.1);
      thN.scaling.set(p, p, p);
    },
  };
  if (c.rare) addSparkle(c, rig, [0.27, 0.48, 0.0]);
  return finish(c, { gait: "hop", freq: 1.5, hopH: 0.2, squash: 0.24, pitch: 0.25, height: 0.45, radius: 0.27, look: 0.5, headLag: 0, sleepDrop: 0.01, sleepHeadPitch: 0.1, sleepHeadRoll: 0.06, sleepHeadDrop: 0 }, rig);
}

function buildDuckling(c: Ctx): Critter {
  const P = c.rare
    ? { body: "#ffd84f", bodyB: "#f8c23c", beak: "#ff9a4f", wing: "#ffcd3c", acc: "#fff3b0" }
    : { body: "#ffe99a", bodyB: "#fbd873", beak: "#ffa65a", wing: "#fde08a", acc: "#ffd85a" };
  const { scene: s, k } = c;
  const BE: Ell = { c: [0, 0.19, -0.02], r: [0.17, 0.15, 0.2] };
  k.part("body", c.base, [0, 0, 0], [
    blobM(s, BE.r, BE.c, P.body, undefined, P.bodyB, 12),
    softConeM(s, 0.1, 0.06, [0, 0.22, -0.19], P.body, [-2.0, 0, 0], undefined, [1, 1, 0.6], 8, 0.3),
  ]);
  const hp: V3 = [0, 0.3, 0.05];
  const head = k.node("head", c.base, hp);
  const HE: Ell = { c: [0, 0.44, 0.06], r: [0.175, 0.165, 0.165] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [
    blobM(s, HE.r, HE.c, P.body, undefined, P.bodyB, 14),
    blobM(s, [0.075, 0.026, 0.065], [0, 0.415, 0.22], P.beak),
    blobM(s, [0.065, 0.02, 0.055], [0, 0.39, 0.205], P.beak),
    softConeM(s, 0.08, 0.026, [0, 0.59, 0.07], P.body, [0.5, 0, 0], undefined, [1, 1, 0.6], 8, 0.35),
    softConeM(s, 0.065, 0.022, [0.012, 0.59, 0.05], P.body, [-0.1, 0, -0.5], undefined, [1, 1, 0.6], 8, 0.35),
  ];
  if (c.rare) hs.push(...crown(c, [-0.02, 0.6, 0.02], 0.8, "#fff1a0"));
    return hs;
  };
  const faces = buildHeads(k, head, hp, hs, {
    head: HE,
    eyeYaw: 0.47,
    eyePitch: 0.14,
    eyeW: 0.032,
    eyeH: 0.043,
    cheekYaw: 0.74,
    cheekPitch: -0.06,
    cheekR: 0.032,
  });
  const wings: Wing[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.155, 0.26, -0.02];
    const wn = k.node("wing" + sd, c.base, piv);
    k.part("wingMesh" + sd, wn, piv, [blobM(s, [0.028, 0.075, 0.095], add(piv, [sd * 0.02, -0.05, -0.02]), P.wing, [0.3, 0, sd * 0.2], P.bodyB)]);
    wings.push({ n: wn, side: sd, rest: 0.05, amp: 0.9, kind: "duck" });
  }
  const legs: Leg[] = [];
  for (const sd of [-1, 1]) {
    const fn = k.node("foot" + sd, c.base, [0, 0, 0]);
    k.part("footMesh" + sd, fn, [0, 0, 0], [blobM(s, [0.025, 0.05, 0.025], [sd * 0.07, 0.05, 0.02], P.beak), blobM(s, [0.055, 0.017, 0.07], [sd * 0.075, 0.015, 0.06], P.beak)]);
    legs.push(leg(fn, sd > 0 ? 0 : 0.5, sd, 0.03));
  }
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = { head, faces, wings, legs };
  if (c.rare) addSparkle(c, rig, [0.24, 0.66, 0.05]);
  return finish(c, { gait: "waddle", freq: 2.8, bob: 0.02, stride: 0.05, lift: 0.04, roll: 0.17, height: 0.66, radius: 0.22, sleepDrop: 0.03, sleepHeadPitch: 0.35, sleepHeadRoll: 0.2, sleepHeadDrop: 0.04 }, rig);
}

function buildGlowbat(c: Ctx): Critter {
  const P = c.rare
    ? { fur: "#ffc1dd", furB: "#f4a2c8", wing: "#e58fbd", wingIn: "#f7b4d4", inner: "#fff0f6", glow: "#bdf2ff", glowE: "#4a9ab0" }
    : { fur: "#c4abef", furB: "#a98fe0", wing: "#9579d3", wingIn: "#b49ce6", inner: "#ffd0e4", glow: "#fff0a0", glowE: "#b09040" };
  const { scene: s, k } = c;
  const head = k.node("head", c.base, [0, 0.02, 0]);
  const BE: Ell = { c: [0, 0.21, 0], r: [0.2, 0.19, 0.185] };
  const bs = (): Mesh[] => {
    const bs: Mesh[] = [blobM(s, BE.r, BE.c, P.fur, undefined, P.furB, 14)];
  // fuzzy cheek tufts
  for (const sd of [-1, 1]) bs.push(ballM(s, 0.05, surf(BE, sd * 1.25, -0.15, -0.035).p, P.fur, undefined, 6));
  // top fluff
  bs.push(ballM(s, 0.04, [0.02, 0.4, 0.02], P.fur, undefined, 6), ballM(s, 0.035, [-0.03, 0.395, 0.0], P.fur, undefined, 6));
  // tiny feet
  bs.push(blobM(s, [0.03, 0.025, 0.035], [-0.06, 0.02, 0.03], P.furB), blobM(s, [0.03, 0.025, 0.035], [0.06, 0.02, 0.03], P.furB));
  // big ears (static, glow tips separate)
  for (const sd of [-1, 1]) {
    bs.push(...coneEar(c, sd, [sd * 0.11, 0.33, 0.0], 0.23, 0.095, 0.45, 0.05, P.fur, P.inner, undefined, 0.5, 0.25));
  }
    return bs;
  };
  // glow parts: ear tips + belly star (emissive; must poke out past the body's outline shell)
  const tips: Mesh[] = [];
  for (const sd of [-1, 1]) {
    const rot: V3 = [-0.05, 0, -sd * 0.42];
    tips.push(ballM(s, 0.036, add([sd * 0.11, 0.33, 0.0], rotDir([-0.05, 0, -sd * 0.45], [0, 1, 0]), 0.245), P.glow, undefined, 8));
  }
  const st = surf(BE, 0, -0.42, 0.024);
  tips.push(puffStar(s, 5, 0.05, 0.024, 0.014, st.p, P.glow, rotZTo(st.n)));
  k.part("glow", head, [0, 0.02, 0], tips, { outline: false, material: toonMat(s, { name: "critterGlow" + (c.rare ? "R" : ""), emissive: P.glowE, rim: 0.1 }), shadow: false });
  const faces = buildHeads(k, head, [0, 0.02, 0], bs, {
    head: BE,
    eyeYaw: 0.38,
    eyePitch: 0.12,
    eyeW: 0.034,
    eyeH: 0.045,
    cheekYaw: 0.66,
    cheekPitch: -0.08,
    cheekR: 0.032,
    mouth: { pitch: -0.08, w: 0.022, h: 0.012, style: "w" },
    fang: true,
  });
  const wings: Wing[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.15, 0.27, -0.04];
    const wn = k.node("wing" + sd, c.base, piv);
    const wm: Mesh[] = [];
    // membrane + lighter inner panel + a little thumb claw
    const ctr = add(piv, [sd * 0.13, 0.0, -0.005]);
    wm.push(blobM(s, [0.14, 0.085, 0.016], ctr, P.wing, [0, 0, sd * 0.2], undefined, 10));
    wm.push(blobM(s, [0.1, 0.055, 0.012], add(ctr, [sd * 0.01, -0.012, 0.007]), P.wingIn, [0, 0, sd * 0.2], undefined, 10));
    wm.push(blobM(s, [0.07, 0.04, 0.014], add(ctr, [sd * 0.07, -0.06, 0]), P.wing, [0, 0, sd * 0.5], undefined, 8));
    wm.push(blobM(s, [0.07, 0.04, 0.014], add(ctr, [-sd * 0.03, -0.065, 0]), P.wing, [0, 0, -sd * 0.3], undefined, 8));
    wm.push(ballM(s, 0.022, add(ctr, [sd * 0.13, 0.05, 0]), P.wing, undefined, 6));
    k.part("wingMesh" + sd, wn, piv, wm, { outline: 0.016 });
    wings.push({ n: wn, side: sd, rest: 0.1, amp: 0.6, kind: "bat" });
  }
  const glowM = head.getChildMeshes(true).find((m) => m.name === "glow");
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = {
    head,
    faces,
    wings,
    hook: (cr) => {
      if (glowM) {
        const p = 0.92 + 0.08 * Math.sin(cr.t * 2.4);
        glowM.scaling.set(p, p, p);
      }
    },
  };
  if (c.rare) addSparkle(c, rig, [0.3, 0.85, 0.0]);
  return finish(c, { gait: "hover", freq: 3.0, hover: 0.3, height: 0.92, radius: 0.32, look: 0.55, headLag: 0, sleepDrop: 0.0, sleepHeadPitch: 0.15, sleepHeadRoll: 0.12, sleepHeadDrop: 0 }, rig);
}

function buildMolly(c: Ctx): Critter {
  const P = c.rare
    ? { fur: "#b4d3f2", furB: "#98bde6", snout: "#eef6ff", nose: "#ff9fc0", paw: "#ffc9d6", claw: "#fff8ee", acc: "#ffffff" }
    : { fur: "#bca8d2", furB: "#a691c2", snout: "#efe4f6", nose: "#ff9fc0", paw: "#ffc5d2", claw: "#fff8ee", acc: "#ffd85a" };
  const { scene: s, k } = c;
  const head = k.node("head", c.base, [0, 0.05, 0]);
  const BE: Ell = { c: [0, 0.25, 0], r: [0.235, 0.245, 0.22] };
  const SN: Ell = { c: [0, 0.235, 0.2], r: [0.095, 0.075, 0.08] };
  const bs = (): Mesh[] => {
    const bs: Mesh[] = [
    blobM(s, BE.r, BE.c, P.fur, undefined, P.furB, 14),
    capOn(s, BE, 0, -0.5, 0.55, P.snout),
    blobM(s, SN.r, SN.c, P.snout),
    puffStar(s, 6, 0.042, 0.026, 0.018, [0, 0.245, 0.285], P.nose, [0, 0, 0]),
  ];
  if (c.rare) bs.push(...flower(c, [0.1, 0.46, 0.06], [0.35, 0.8, 0.4], "#ffffff", "#ffd85a", 1));
  else bs.push(ballM(s, 0.035, [0, 0.49, 0.0], P.fur, undefined, 6), ballM(s, 0.03, [0.03, 0.485, -0.02], P.fur, undefined, 6));
    return bs;
  };
  k.part("feet", c.base, [0, 0, 0], [blobM(s, [0.06, 0.03, 0.07], [-0.1, 0.025, 0.02], P.paw), blobM(s, [0.06, 0.03, 0.07], [0.1, 0.025, 0.02], P.paw)]);
  const faces = buildHeads(k, head, [0, 0.05, 0], bs, {
    head: BE,
    eyeYaw: 0.33,
    eyePitch: 0.22,
    eyeW: 0.03,
    eyeH: 0.03,
    eyeStyle: "smile",
    line: 0.011,
    cheekYaw: 0.58,
    cheekPitch: 0.02,
    cheekR: 0.036,
    mouth: { ell: SN, pitch: -0.55, w: 0.024, h: 0.012, style: "w" },
  });
  const legs: Leg[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.19, 0.16, 0.1];
    const pn = k.node("paw" + sd, c.base, piv);
    const rot: V3 = [0.2, sd * 0.4, -sd * 0.5];
    const ctr = add(piv, [sd * 0.035, -0.035, 0.06]);
    const pm: Mesh[] = [blobM(s, [0.085, 0.04, 0.075], ctr, P.paw, rot)];
    for (let i = -1; i <= 1; i++) pm.push(softConeM(s, 0.045, 0.017, add(ctr, rotDir(rot, [i * 0.04, 0, 0.06])), P.claw, [rot[0] + Math.PI / 2 - 0.3, rot[1] + i * 0.2, rot[2]], undefined, undefined, 6, 0.35));
    k.part("pawMesh" + sd, pn, piv, pm);
    legs.push(leg(pn, sd > 0 ? 0 : 0.5, sd, 0.0, 1.2));
  }
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = { head, faces, legs };
  if (c.rare) addSparkle(c, rig, [-0.28, 0.6, 0.05]);
  return finish(c, { gait: "shuffle", freq: 3.2, bob: 0.018, stride: 0.05, lift: 0.03, roll: 0.07, height: 0.56, radius: 0.28, look: 0.45, headLag: 0, sleepDrop: 0.0, sleepHeadPitch: 0.1, sleepHeadRoll: 0.08, sleepHeadDrop: 0 }, rig);
}

function buildMochi(c: Ctx): Critter {
  const P = c.rare
    ? { fur: "#fffaf6", furB: "#f2e8f0", a: "#c9b2f2", b: "#ffb3cc", inner: "#ffc6d8", nose: "#ff9fbf", collar: "#9fd8ff", bell: "#ffd85a" }
    : { fur: "#fffaf3", furB: "#f2e6dd", a: "#f9b072", b: "#9b7563", inner: "#ffc2d2", nose: "#ff9fbf", collar: "#ff9fbf", bell: "#ffd85a" };
  const { scene: s, k } = c;
  const BE: Ell = { c: [0, 0.23, -0.03], r: [0.15, 0.145, 0.2] };
  k.part("body", c.base, [0, 0, 0], [
    blobM(s, BE.r, BE.c, P.fur, undefined, P.furB, 12),
    capOn(s, BE, -2.4, 0.55, 0.55, P.a, { wob: 0.16, seed: 8 }),
    capOn(s, BE, 2.2, 0.75, 0.42, P.b, { wob: 0.16, seed: 7 }),
    capOn(s, BE, Math.PI, 0.1, 0.35, P.a, { wob: 0.16, seed: 10 }),
  ]);
  const legMesh = (x: number, zz: number, color: string) => [blobM(s, [0.05, 0.08, 0.052], [x, 0.08, zz], color, undefined, P.fur), blobM(s, [0.048, 0.03, 0.058], [x, 0.03, zz + 0.012], P.fur)];
  const la = k.node("legsA", c.base, [0, 0, 0]);
  k.part("legsAMesh", la, [0, 0, 0], [...legMesh(-0.08, 0.09, P.a), ...legMesh(0.08, -0.15, P.fur)]);
  const lb = k.node("legsB", c.base, [0, 0, 0]);
  k.part("legsBMesh", lb, [0, 0, 0], [...legMesh(0.08, 0.09, P.fur), ...legMesh(-0.08, -0.15, P.b)]);
  const legs: Leg[] = [leg(la, 0, 1, 0.07), leg(lb, 0.5, -1, 0.07)];

  const hp: V3 = [0, 0.34, 0.11];
  const head = k.node("head", c.base, hp);
  const HE: Ell = { c: [0, 0.47, 0.13], r: [0.215, 0.18, 0.185] };
  const MU: Ell = { c: [0, 0.425, 0.25], r: [0.08, 0.05, 0.08] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [
    blobM(s, HE.r, HE.c, P.fur, undefined, P.furB, 14),
    capOn(s, HE, 0.75, 0.62, 0.48, P.a, { wob: 0.16, seed: 8 }),
    capOn(s, HE, -0.95, 0.75, 0.38, P.b, { wob: 0.16, seed: 9 }),
    blobM(s, [0.045, 0.035, 0.04], [-0.035, 0.415, 0.285], P.fur),
    blobM(s, [0.045, 0.035, 0.04], [0.035, 0.415, 0.285], P.fur),
  ];
  if (c.rare) {
    hs.push(blobM(s, [0.16, 0.03, 0.14], [0, 0.32, 0.1], P.collar, undefined, undefined, 12));
    hs.push(ballM(s, 0.03, [0, 0.3, 0.235], P.bell, undefined, 8));
  }
    return hs;
  };
  const faces = buildHeads(k, head, hp, hs, {
    head: HE,
    eyeYaw: 0.43,
    eyePitch: 0.06,
    eyeW: 0.036,
    eyeH: 0.048,
    cheekYaw: 0.72,
    cheekPitch: -0.17,
    cheekR: 0.034,
    nose: { ell: HE, pitch: -0.08, r: 0.017, color: P.nose, w: 1.4 },
    mouth: { ell: MU, pitch: 0.2, w: 0.022, h: 0.012, style: "w" },
    whiskers: { yaw: 0.62, pitch: -0.2, len: 0.035 },
  });
  const ears: Ear[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.11, 0.6, 0.12];
    const en = k.node("ear" + sd, head, piv);
    k.part("earMesh" + sd, en, piv, coneEar(c, sd, piv, 0.13, 0.075, 0.34, 0.1, sd > 0 ? P.a : P.b, P.inner, undefined, 0.6, 0.25));
    ears.push(ear(en, sd, 0.5, 0.35, 0.3));
  }
  const tp: V3 = [0, 0.26, -0.2];
  const tn = k.node("tail", c.base, tp);
  const tail: Mesh[] = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const p: V3 = [Math.sin(u * Math.PI) * 0.035, 0.26 + 0.27 * Math.sin(u * 1.35), -0.22 - 0.1 * Math.sin(u * 2.6) + 0.02 * u];
    tail.push(ballM(s, 0.04 - 0.004 * u, p, u > 0.7 ? P.a : P.fur, undefined, 8));
  }
  k.part("tailMesh", tn, tp, tail);
  const tails: Tail[] = [{ n: tn, amp: 0.25, f: 1.6, walk: 0.25, gain: 0.4, curlY: 1.9, curlX: -1.25, axis: "y" }];
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = { head, faces, ears, tails, legs };
  if (c.rare) addSparkle(c, rig, [0.27, 0.75, 0.1]);
  return finish(
    c,
    { gait: "trot", freq: 2.8, bob: 0.025, stride: 0.065, lift: 0.055, height: 0.76, radius: 0.26, sleepDrop: 0.075, sleepHeadPitch: 0.16, sleepHeadYaw: 0.5, sleepHeadRoll: 0.42, sleepHeadDrop: 0.07, sleepRoll: 0.1 },
    rig,
  );
}

/** Rare-variant accessory: a tiny puffy chef toque with a coloured band. */
function toque(c: Ctx, at: V3, band: string, rot: V3 = [0, 0, 0], s = 1): Mesh[] {
  const sc = c.scene;
  const P = (v: V3): V3 => add(at, rotDir(rot, [v[0] * s, v[1] * s, v[2] * s]));
  const out: Mesh[] = [
    blobM(sc, [0.062 * s, 0.03 * s, 0.058 * s], P([0, 0.012, 0]), "#fffdf8", rot, "#f2ece6", 12),
    blobM(sc, [0.064 * s, 0.014 * s, 0.06 * s], P([0, 0.004, 0]), band, rot, undefined, 12),
  ];
  // puffy top: a ring of soft balls with one on top
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    out.push(ballM(sc, 0.036 * s, P([Math.sin(a) * 0.034, 0.058, Math.cos(a) * 0.032]), "#ffffff", "#f3ede8", 8));
  }
  out.push(ballM(sc, 0.04 * s, P([0, 0.078, 0]), "#ffffff", undefined, 8));
  return out;
}

function buildRedpanda(c: Ctx): Critter {
  const P = c.rare
    ? { fur: "#ffaac4", furB: "#f48fb0", mask: "#fffaf6", ring: "#fff0de", tip: "#d9739a", dark: "#a3707a", darkB: "#8a5a66", tear: "#e8799e", inner: "#e07a9a", nose: "#5a3848", band: "#ff8fb4" }
    : { fur: "#e57a46", furB: "#cc6033", mask: "#fffaf2", ring: "#f9dcb6", tip: "#9a4a33", dark: "#74463b", darkB: "#58362f", tear: "#b8542f", inner: "#a8553a", nose: "#3b2f45", band: "#ff9fbf" };
  const { scene: s, k } = c;
  // chubby little body: rusty back, dark chest & belly
  const BE: Ell = { c: [0, 0.24, -0.03], r: [0.165, 0.155, 0.205] };
  k.part("body", c.base, [0, 0, 0], [
    blobM(s, BE.r, BE.c, P.fur, undefined, P.furB, 12),
    capOn(s, BE, 0, -0.62, 0.62, P.dark, { sx: 1.1, wob: 0.06, seed: 3 }),
    blobM(s, [0.11, 0.1, 0.07], [0, 0.29, 0.15], P.dark, undefined, P.darkB),
  ]);
  const legs: Leg[] = [];
  const legMesh = (x: number, zz: number) => [blobM(s, [0.054, 0.088, 0.056], [x, 0.088, zz], P.dark, undefined, P.darkB), blobM(s, [0.052, 0.032, 0.062], [x, 0.032, zz + 0.014], P.darkB)];
  const la = k.node("legsA", c.base, [0, 0, 0]);
  k.part("legsAMesh", la, [0, 0, 0], [...legMesh(-0.088, 0.1), ...legMesh(0.088, -0.15)]);
  const lb = k.node("legsB", c.base, [0, 0, 0]);
  k.part("legsBMesh", lb, [0, 0, 0], [...legMesh(0.088, 0.1), ...legMesh(-0.088, -0.15)]);
  legs.push(leg(la, 0, 1, 0.065), leg(lb, 0.5, -1, 0.065));

  // big round head with the classic white mask
  const hp: V3 = [0, 0.36, 0.12];
  const head = k.node("head", c.base, hp);
  const HE: Ell = { c: [0, 0.5, 0.14], r: [0.22, 0.18, 0.185] };
  const MU: Ell = { c: [0, 0.44, 0.265], r: [0.085, 0.06, 0.08] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [
      blobM(s, HE.r, HE.c, P.fur, undefined, P.furB, 14),
      // white cheek patches (puffy, fluffing out at the sides)
      capOn(s, HE, 0.9, -0.3, 0.42, P.mask, { sx: 1.05, wob: 0.08, seed: 2 }),
      capOn(s, HE, -0.9, -0.3, 0.42, P.mask, { sx: 1.05, wob: 0.08, seed: 5 }),
      blobM(s, [0.068, 0.056, 0.066], [-0.18, 0.43, 0.13], P.mask, [0, 0, 0.6]),
      blobM(s, [0.068, 0.056, 0.066], [0.18, 0.43, 0.13], P.mask, [0, 0, -0.6]),
      // white muzzle + chin
      blobM(s, MU.r, MU.c, P.mask),
      // eyebrow dots
      capOn(s, HE, 0.36, 0.42, 0.11, P.mask, { sx: 1.35 }),
      capOn(s, HE, -0.36, 0.42, 0.11, P.mask, { sx: 1.35 }),
    ];
    // tear-mark stripes: darker rust running from under each eye down to the muzzle corners
    for (const sd of [-1, 1]) hs.push(capOn(s, HE, sd * 0.34, -0.21, 0.07, P.tear, { sx: 0.85, sy: 2.7, lift: 0.004 }));
    if (c.rare) hs.push(...toque(c, [0.04, 0.66, 0.1], P.band, [-0.12, 0, -0.2], 1.15));
    return hs;
  };
  const faces = buildHeads(k, head, hp, hs, {
    head: HE,
    eyeYaw: 0.42,
    eyePitch: 0.1,
    eyeW: 0.036,
    eyeH: 0.048,
    cheekYaw: 0.72,
    cheekPitch: -0.16,
    cheekR: 0.033,
    nose: { ell: MU, pitch: 0.48, r: 0.024, color: P.nose, w: 1.35 },
    mouth: { ell: MU, pitch: 0.0, w: 0.022, h: 0.012, style: "w" },
  });
  // white-rimmed round ears: white shell, rust back, dark inside
  const ears: Ear[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.135, 0.6, 0.12];
    const en = k.node("ear" + sd, head, piv);
    const rot: V3 = [-0.1, 0, -sd * 0.5];
    const fwd = rotDir(rot, [0, 0, 1]);
    const up = rotDir(rot, [0, 1, 0]);
    const h = 0.15,
      r = 0.085;
    k.part("earMesh" + sd, en, piv, [
      softConeM(s, h, r, piv, P.mask, rot, undefined, [1, 1, 0.55], 12, 0.42),
      softConeM(s, h * 0.9, r * 0.86, add(add(piv, fwd, -r * 0.55 * 0.3), up, -0.004), P.fur, rot, P.furB, [1, 1, 0.5], 12, 0.42),
      softConeM(s, h * 0.8, r * 0.76, add(add(piv, fwd, r * 0.55 * 0.4), up, h * 0.05), P.inner, rot, undefined, [1, 1, 0.5], 12, 0.42),
      blobM(s, [0.03, 0.04, 0.022], add(add(piv, fwd, r * 0.55 * 0.7), up, h * 0.16), P.mask, rot, undefined, 6),
    ]);
    ears.push(ear(en, sd, 0.55, 0.4, 0.32));
  }
  // BIG ringed fluffy tail: chain of overlapping puffs in alternating rust / cream bands
  const tp: V3 = [0, 0.22, -0.2];
  const tn = k.node("tail", c.base, tp);
  const tail: Mesh[] = [];
  const N = 13;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const p: V3 = [Math.sin(u * 2.4) * 0.03, 0.235 + 0.02 * u + 0.3 * u * u, -0.27 - 0.34 * u + 0.13 * u * u];
    const r = 0.07 + 0.042 * Math.sin(Math.min(1, u * 1.12) * Math.PI * 0.86);
    const band = Math.floor((i + 1) / 2) % 2 === 1;
    tail.push(ballM(s, i === N - 1 ? r * 0.92 : r, p, i === N - 1 ? P.tip : band ? P.ring : P.fur, band ? undefined : P.furB, 12));
  }
  k.part("tailMesh", tn, tp, tail);
  const tails: Tail[] = [{ n: tn, amp: 0.2, f: 2.0, walk: 0.34, gain: 0.5, curlY: 1.95, curlX: -0.1, axis: "y" }];
  // springy follow-through: the tail chases the pose the shared tail logic asks for (underdamped →
  // swishy overshoot), and when sleeping it rolls over sideways to wrap round the body like a scarf
  let tY = 0,
    tYV = 0,
    tX = 0,
    tXV = 0;
  const tRest = tn.position.clone();
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = {
    head,
    faces,
    ears,
    tails,
    legs,
    nodes: { tail: tn },
    hook: (cr, dt) => {
      const gY = tn.rotation.y,
        gX = tn.rotation.x;
      const n = Math.ceil(dt / 0.01),
        h = dt / n;
      for (let i = 0; i < n; i++) {
        tYV += (-110 * (tY - gY) - 6 * tYV) * h;
        tY += tYV * h;
        tXV += (-110 * (tX - gX) - 6 * tXV) * h;
        tX += tXV * h;
      }
      const sl = cr.sleep;
      tn.rotation.set(tX, tY, 1.25 * sl + tYV * 0.012);
      // slide it out to hug the body's side so it peeks round under the chin
      tn.position.set(tRest.x - 0.075 * sl, tRest.y + 0.03 * sl, tRest.z + 0.03 * sl);
    },
  };
  if (c.rare) addSparkle(c, rig, [-0.28, 0.8, 0.1]);
  return finish(
    c,
    { gait: "trot", freq: 2.7, bob: 0.04, stride: 0.07, lift: 0.06, height: 0.75, radius: 0.28, sleepDrop: 0.07, sleepHeadPitch: 0.2, sleepHeadYaw: -0.3, sleepHeadRoll: 0.42, sleepHeadDrop: 0.065, sleepRoll: 0.09 },
    rig,
  );
}

/* ------------------------------------------------------------------ */
/* Riders: Clover Pony & Moonbeam Unicorn (shared chubby equine rig)    */
/* ------------------------------------------------------------------ */

/** Quadratic Bézier in rig space. */
const qbez = (a: V3, b: V3, c: V3, u: number): V3 => {
  const v = 1 - u;
  return [v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1], v * v * a[2] + 2 * v * u * b[2] + u * u * c[2]];
};

function buildEquine(c: Ctx, uni: boolean): Critter {
  const R = c.rare;
  // mane colours cycle along the crest / tail; `sock` = fluffy fetlocks
  const P = uni
    ? R
      ? { coat: "#d3cdf7", coatB: "#b9b0ec", belly: "#ece8ff", muzzle: "#f1eeff", inner: "#f4c4e4", nose: "#8f7bc4", hoof: "#f2eaff", hoofB: "#cbbcf2", sock: "#f4f1ff",
          mane: ["#7fd6e8", "#b7a2f2", "#f3f0ff", "#8fb8f6", "#d9b2f4", "#a6ece0"], blanket: "#8fb8f6", trim: "#f3f0ff", emblem: "#fff1a8",
          horn: "#eefaff", hornB: "#bfe9ff", hornE: "#6cb8dc", star: "#fff1a8", glint: "#ffffff" }
      : { coat: "#fbf7ff", coatB: "#e9dffb", belly: "#ffffff", muzzle: "#fff7fb", inner: "#ffc6dc", nose: "#c9a6d8", hoof: "#fff3c8", hoofB: "#f3d9a0", sock: "#ffffff",
          mane: ["#ffb3cf", "#ffd2a6", "#fff0a6", "#bdeed2", "#b6dcff", "#d4c0ff"], blanket: "#d4c0ff", trim: "#fff6e6", emblem: "#ffb3cf",
          horn: "#fff2c2", hornB: "#ffcf86", hornE: "#dcb35a", star: "#ffd1e8", glint: "#ffffff" }
    : R
      ? { coat: "#ffd4df", coatB: "#f6b5c6", belly: "#fff0f3", muzzle: "#fff3f2", inner: "#ffb6c8", nose: "#c97b8f", hoof: "#c98a96", hoofB: "#ad6f7e", sock: "#fffaf2",
          mane: ["#fff7e6", "#ffe39a", "#fff7e6", "#ffd27a"], blanket: "#bfe9d6", trim: "#fffaf2", emblem: "#ff8fb0",
          horn: "", hornB: "", hornE: "", star: "", glint: "#ffffff" }
      : { coat: "#fbe1c6", coatB: "#f0c59f", belly: "#fff3e3", muzzle: "#fff5ea", inner: "#ffbfcf", nose: "#b9806c", hoof: "#b98370", hoofB: "#9c6a5a", sock: "#fffaf0",
          mane: ["#ffb7d0", "#d2bdf7", "#ffcadb", "#c3aef0"], blanket: "#b6dcf7", trim: "#fff6e6", emblem: "#ff8fb0",
          horn: "", hornB: "", hornE: "", star: "", glint: "#ffffff" };
  const mane = (i: number) => P.mane[((i % P.mane.length) + P.mane.length) % P.mane.length];
  const { scene: s, k } = c;
  const SEAT = 0.92;

  /* ---- body: round barrel + chest + neck, mane crest and a little saddle blanket ---- */
  const BE: Ell = { c: [0, 0.6, -0.06], r: [0.33, 0.295, 0.45] };
  const body: Mesh[] = [
    blobM(s, BE.r, BE.c, P.coat, undefined, P.coatB, 16),
    capOn(s, BE, 0, -Math.PI / 2, 0.75, P.belly, { sx: 0.8, sy: 1.25 }),
    blobM(s, [0.265, 0.27, 0.21], [0, 0.67, 0.22], P.coat, undefined, P.coatB, 12),
    blobM(s, [0.16, 0.25, 0.16], [0, 0.95, 0.27], P.coat, [0.45, 0, 0], undefined, 12),
  ];
  // saddle blanket: scalloped trim, coloured cloth, puffy seat pad, heart on each side
  body.push(capOn(s, BE, 0, Math.PI / 2, 0.76, P.trim, { sx: 1.45, sy: 0.82, lift: 0.005, wob: 0.06, seed: 2, segs: 40 }));
  body.push(capOn(s, BE, 0, Math.PI / 2, 0.68, P.blanket, { sx: 1.45, sy: 0.8, lift: 0.011, segs: 40 }));
  body.push(blobM(s, [0.17, 0.05, 0.17], [0, SEAT - 0.025, -0.04], P.trim, undefined, P.blanket, 12));
  for (const sd of [-1, 1]) {
    const hp = surf(BE, sd * Math.PI * 0.5, 0.3, 0.016);
    body.push(heartM(s, 0.07, 0.018, hp.p, P.emblem, rotZTo(hp.n)));
  }
  // mane crest: overlapping puffs from behind the ears down to the withers
  const mA: V3 = [0, 1.26, 0.33],
    mC: V3 = [0, 1.18, 0.12],
    mB: V3 = [0, 0.9, 0.05];
  const NM = 8;
  for (let i = 0; i < NM; i++) {
    const u = i / (NM - 1);
    const p = qbez(mA, mC, mB, u);
    const r = 0.1 - 0.03 * u;
    body.push(ballM(s, r, p, mane(i), undefined, 10));
    // side fluff so the crest reads from every angle (the unicorn's mane flows down further)
    for (const sd of [-1, 1]) {
      body.push(ballM(s, r * 0.82, add(p, [sd * 0.075, -0.06, 0.03]), mane(i + 1), undefined, 8));
      if (uni && i > 0 && i < NM - 1) body.push(ballM(s, r * 0.7, add(p, [sd * 0.11, -0.14, 0.05]), mane(i + 2), undefined, 8));
    }
  }
  if (uni) {
    // tiny star mark on the flank
    for (const sd of [-1, 1]) {
      const sp = surf(BE, sd * 2.05, 0.18, 0.014);
      body.push(puffStar(s, 5, 0.06, 0.027, 0.014, sp.p, P.star, rotZTo(sp.n)));
    }
  }
  k.part("body", c.base, [0, 0, 0], body);

  /* ---- legs: four chubby legs with fluffy socks and little hooves ---- */
  const legs: Leg[] = [];
  const hoofProf: [number, number][] = [[0, 0], [0.082, 0], [0.094, 0.018], [0.093, 0.066], [0.08, 0.088], [0, 0.088]];
  const LEGS: [number, number, number, number][] = [
    // x, z, trot phase, gallop phase  (front legs reach together, hind legs push together)
    [-0.15, 0.2, 0.0, 0.0],
    [0.15, 0.2, 0.5, 0.08],
    [-0.15, -0.3, 0.5, 0.5],
    [0.15, -0.3, 0.0, 0.58],
  ];
  LEGS.forEach(([x, z, ph, ph2], i) => {
    const front = z > 0;
    const piv: V3 = [x, 0.46, z];
    const ln = k.node("leg" + i, c.base, piv);
    const lm: Mesh[] = [
      blobM(s, [0.1, 0.23, 0.105], [x, 0.29, z], P.coat, undefined, P.coatB, 10),
      lathe(s, hoofProf.map(([r, y]) => [r * 1.1, y] as [number, number]), { color: P.hoof, bottom: P.hoofB, pos: [x, 0, z + 0.008] }, 14),
    ];
    if (!front) lm.push(blobM(s, [0.125, 0.15, 0.15], [x * 0.92, 0.43, z - 0.02], P.coat, undefined, P.coatB, 10));
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * TAU;
      lm.push(ballM(s, 0.042, [x + Math.sin(a) * 0.088, 0.115 + Math.cos(a * 2) * 0.006, z + 0.008 + Math.cos(a) * 0.09], P.sock, undefined, 6));
    }
    if (uni) {
      // sparkly hooves: a few tiny glints
      for (const [ya, yy] of [[0.4, 0.05], [-0.5, 0.035], [0.05, 0.03], [1.2, 0.045], [-1.1, 0.05]] as const) lm.push(ballM(s, 0.013, [x + Math.sin(ya) * 0.103, yy, z + 0.008 + Math.cos(ya) * 0.103], P.glint, undefined, 4));
    }
    k.part("legMesh" + i, ln, piv, lm);
    legs.push({ ...leg(ln, ph, x > 0 ? 1 : -1, 0.0, 1), ph2, swing: front ? 0.42 : 0.38, sleepRx: front ? -1.25 : 1.2 });
  });

  /* ---- head ---- */
  const hp: V3 = [0, 1.02, 0.35];
  const head = k.node("head", c.base, hp);
  const HE: Ell = { c: [0, 1.1, 0.45], r: [0.215, 0.19, 0.2] };
  const MU: Ell = { c: [0, 1.005, 0.6], r: [0.152, 0.11, 0.125] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [
      blobM(s, HE.r, HE.c, P.coat, undefined, P.coatB, 16),
      blobM(s, MU.r, MU.c, P.muzzle, undefined, undefined, 14),
    ];
    // nostrils
    for (const sd of [-1, 1]) hs.push(decal(s, MU, sd * 0.36, 0.32, [0.017, 0.012, 0.012], P.nose, 0.4, sd * 0.4, 6));
    // forelock: a fluffy fringe between the ears
    const fl: [V3, number][] = [
      [[0, 1.27, 0.47], 0.068],
      [[-0.06, 1.25, 0.5], 0.052],
      [[0.06, 1.25, 0.5], 0.052],
      [[0.02, 1.29, 0.4], 0.06],
    ];
    fl.forEach(([p, r], i) => hs.push(ballM(s, r, p, mane(i * 2 + 1), undefined, 8)));
    if (uni) {
      // horn base ring
      hs.push(blobM(s, [0.06, 0.024, 0.06], [0, 1.272, 0.53], P.hornB, [0.45, 0, 0], undefined, 8));
    }
    if (R && !uni) hs.push(...flower(c, [0.15, 1.27, 0.44], [0.6, 0.7, 0.3], "#ffffff", "#ffd85a", 1.15));
    if (R && uni) hs.push(...bow(c, [-0.14, 1.27, 0.38], "#b7a2f2", [0, -0.3, 0.4], 1.1));
    return hs;
  };
  const faces = buildHeads(k, head, hp, hs, {
    head: HE,
    eyeYaw: 0.5,
    eyePitch: 0.13,
    eyeW: 0.043,
    eyeH: 0.058,
    line: 0.011,
    cheekYaw: 0.86,
    cheekPitch: -0.1,
    cheekR: 0.04,
    mouth: { ell: MU, pitch: -0.25, w: 0.03, h: 0.016, style: "smile" },
  });
  if (uni) {
    const hn: V3 = [0, 1.27, 0.53];
    const horn = spiralHorn(s, 0.25, 0.052, hn, [0.45, 0, 0], P.horn, P.hornB, 2.6);
    k.part("horn", head, hn, [horn], { outline: 0.01, material: toonMat(s, { name: "unicornHorn" + (R ? "R" : ""), emissive: P.hornE, rim: 0.2 }), shadow: true });
  }
  const ears: Ear[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.11, 1.24, 0.4];
    const en = k.node("ear" + sd, head, piv);
    k.part("earMesh" + sd, en, piv, coneEar(c, sd, piv, 0.15, 0.062, 0.36, 0.18, P.coat, P.inner, undefined, 0.6, 0.22));
    ears.push(ear(en, sd, 0.45, 0.5, 0.45));
  }

  /* ---- tail: big fluffy puff-chain ---- */
  const tp: V3 = [0, 0.8, -0.48];
  const tn = k.node("tail", c.base, tp);
  const tail: Mesh[] = [];
  const NT = uni ? 11 : 9;
  const TL = uni ? 1.25 : 1;
  for (let i = 0; i < NT; i++) {
    const u = i / (NT - 1);
    const p: V3 = [Math.sin(u * 2.4) * 0.035, 0.83 - 0.36 * TL * u - 0.06 * u * u, -0.52 - 0.2 * TL * Math.sin(u * 1.9) + 0.02 * u];
    const r = 0.065 + 0.055 * Math.sin(Math.min(1, u * 1.1) * Math.PI * 0.82);
    tail.push(ballM(s, r, p, mane(i), undefined, 10));
    if (i > 2) tail.push(ballM(s, r * 0.7, add(p, [(i % 2 ? 1 : -1) * r * 0.6, 0.01, -r * 0.3]), mane(i + 1), undefined, 8));
  }
  k.part("tailMesh", tn, tp, tail);
  const tails: Tail[] = [{ n: tn, amp: 0.2, f: 1.8, walk: 0.18, gain: 0.35, curlY: 0.9, curlX: 0.15, axis: "y" }];

  const seat = k.node("seat", c.base, [0, SEAT, 0]);
  const hornM = uni ? head.getChildMeshes(true).find((m) => m.name === "horn") : undefined;
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = {
    head,
    faces,
    ears,
    tails,
    legs,
    seat,
    seatY: SEAT,
    nodes: { tail: tn },
    hook: (cr) => {
      // tail streams out behind at speed and flicks with each bound
      const th = cr.phase * TAU;
      tn.rotation.x += cr.move * (0.55 + 0.45 * cr.gal) + cr.gal * 0.22 * Math.sin(th + 1.2) - 0.3 * cr.sleep;
      if (hornM) {
        const p = 0.97 + 0.03 * Math.sin(cr.t * 2.2);
        hornM.scaling.set(p, 1, p);
      }
    },
  };
  if (R) addSparkle(c, rig, [-0.34, 1.45, 0.35]);
  return finish(
    c,
    uni
      ? { gait: "gallop", freq: 1.75, bob: 0.05, hopH: 0.15, squash: 0.05, pitch: 0.08, stride: 0, lift: 0.07, height: 1.3, radius: 0.5, look: 0.8, headLag: 0.03, pitchPivot: 0.6, sleepDrop: 0.3, sleepHeadPitch: 0.35, sleepHeadYaw: 0.35, sleepHeadRoll: 0.2, sleepHeadDrop: 0.08, sleepRoll: 0.0, attackDur: 0.5 }
      : { gait: "gallop", freq: 2.05, bob: 0.045, hopH: 0.11, squash: 0.05, pitch: 0.1, stride: 0, lift: 0.07, height: 1.3, radius: 0.5, look: 0.8, headLag: 0.03, pitchPivot: 0.6, sleepDrop: 0.3, sleepHeadPitch: 0.35, sleepHeadYaw: 0.35, sleepHeadRoll: 0.2, sleepHeadDrop: 0.08, sleepRoll: 0.0, attackDur: 0.5 },
    rig,
  );
}

/* ------------------------------------------------------------------ */
/* Guardians: Emberling, Roarlet, Shellby                              */
/* ------------------------------------------------------------------ */

function buildEmberling(c: Ctx): Critter {
  const P = c.rare
    ? { skin: "#c9b6ff", skinB: "#ad97f2", belly: "#fff4d6", stripe: "#f3dcb0", spike: "#ff9fc8", spikeT: "#ffd6ea", horn: "#fff6dc", wing: "#ffa8cf", wingIn: "#ffd9ea", claw: "#fff6e6", heart: "#ff8fb8", nose: "#7a5fb8", glow: "#ffb3dc", glowE: "#c8508c", fire: "#ffd1f0", fireE: "#d870b8" }
    : { skin: "#ffb48a", skinB: "#f7976a", belly: "#fff1d2", stripe: "#f6d6a8", spike: "#ff8b6e", spikeT: "#ffc59a", horn: "#fff3d6", wing: "#ff957a", wingIn: "#ffc9a6", claw: "#fff6e6", heart: "#ff8aa6", nose: "#c45f44", glow: "#ffb070", glowE: "#d8622c", fire: "#fff0a0", fireE: "#e0a040" };
  const { scene: s, k } = c;
  // pear-shaped tummy with a striped cream belly, little back spikes and nub arms
  const BE: Ell = { c: [0, 0.24, -0.02], r: [0.2, 0.2, 0.185] };
  const body: Mesh[] = [blobM(s, BE.r, BE.c, P.skin, undefined, P.skinB, 14), capOn(s, BE, 0, -0.28, 0.66, P.belly, { sx: 0.95, sy: 1.1 })];
  for (const pit of [-0.12, -0.36, -0.6]) {
    const w = 0.34 * Math.cos(pit + 0.25);
    body.push(...arcOn(s, BE, [[-w, pit], [-w * 0.5, pit - 0.03], [0, pit - 0.04], [w * 0.5, pit - 0.03], [w, pit]], 0.007, P.stripe, 0.004));
  }
  for (const [pit, h] of [[0.55, 0.085], [0.18, 0.08], [-0.2, 0.065]] as const) {
    const sp = surf(BE, Math.PI, pit, -0.012);
    body.push(softConeM(s, h, 0.038, sp.p, P.spikeT, rotYTo(sp.n), P.spike, [1, 1, 0.55], 8, 0.32));
  }
  for (const sd of [-1, 1]) {
    body.push(blobM(s, [0.048, 0.07, 0.05], [sd * 0.175, 0.27, 0.09], P.skin, [0.5, 0, sd * 0.5]));
    body.push(ballM(s, 0.014, [sd * 0.2, 0.215, 0.135], P.claw, undefined, 4));
  }
  k.part("body", c.base, [0, 0, 0], body);

  // feet with tiny cream claws
  const legs: Leg[] = [];
  for (const sd of [-1, 1]) {
    const fn = k.node("foot" + sd, c.base, [0, 0, 0]);
    const fm: Mesh[] = [blobM(s, [0.068, 0.055, 0.085], [sd * 0.1, 0.048, 0.04], P.skin, undefined, P.skinB)];
    for (let i = -1; i <= 1; i++) fm.push(ballM(s, 0.017, [sd * 0.1 + i * 0.03, 0.025, 0.118 - Math.abs(i) * 0.012], P.claw, undefined, 5));
    k.part("footMesh" + sd, fn, [0, 0, 0], fm);
    legs.push(leg(fn, sd > 0 ? 0 : 0.5, sd, 0.03));
  }

  const hp: V3 = [0, 0.4, 0.03];
  const head = k.node("head", c.base, hp);
  const HE: Ell = { c: [0, 0.53, 0.05], r: [0.215, 0.185, 0.19] };
  const MU: Ell = { c: [0, 0.47, 0.2], r: [0.115, 0.075, 0.085] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [blobM(s, HE.r, HE.c, P.skin, undefined, P.skinB, 14), blobM(s, MU.r, MU.c, P.belly, undefined, undefined, 12)];
    for (const sd of [-1, 1]) {
      hs.push(decal(s, MU, sd * 0.3, 0.42, [0.012, 0.009, 0.008], P.nose, 0.4, 0, 5));
      // soft rounded horn nubs
      const hn = surf(HE, sd * 0.42, 0.95, -0.01);
      hs.push(softConeM(s, 0.085, 0.036, hn.p, P.horn, rotYTo([sd * 0.35, 0.9, -0.3]), undefined, undefined, 8, 0.45));
      // little fin ears
      const fe = surf(HE, sd * 1.4, 0.25, -0.01);
      hs.push(softConeM(s, 0.09, 0.042, fe.p, P.spikeT, rotYTo([sd * 0.9, 0.35, -0.3]), P.spike, [1, 1, 0.45], 8, 0.3));
    }
    // crest spikes on the back of the head
    for (const [pit, h] of [[0.7, 0.07], [0.35, 0.06]] as const) {
      const sp = surf(HE, Math.PI, pit, -0.01);
      hs.push(softConeM(s, h, 0.032, sp.p, P.spikeT, rotYTo(sp.n), P.spike, [1, 1, 0.55], 8, 0.32));
    }
    if (c.rare) hs.push(...crown(c, [0.04, 0.705, 0.02], 0.85, "#ffe17a"));
    return hs;
  };
  const faces = buildHeads(k, head, hp, hs, {
    head: HE,
    eyeYaw: 0.42,
    eyePitch: 0.13,
    eyeW: 0.04,
    eyeH: 0.053,
    mouth: { ell: MU, pitch: -0.4, w: 0.026, h: 0.014, style: "w" },
    fang: true,
  });
  // warm glowing cheeks (emissive, outside the outline)
  const gl: Mesh[] = [];
  for (const sd of [-1, 1]) gl.push(decal(s, HE, sd * 0.78, -0.12, [0.048, 0.03, 0.02], P.glow, -0.25, 0, 8));
  const glowM = k.part("glow", head, hp, gl, { outline: false, material: toonMat(s, { name: "emberGlow" + (c.rare ? "R" : ""), emissive: P.glowE, rim: 0 }), shadow: false });
  // sparkle-sneeze burst (only shown mid-attack)
  const bp: V3 = [0, 0.45, 0.33];
  const burstN = k.node("burst", head, bp);
  const burst: Mesh[] = [puffStar(s, 5, 0.085, 0.04, 0.025, bp, P.fire)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    burst.push(puffStar(s, 4, 0.035, 0.014, 0.012, add(bp, [Math.cos(a) * 0.12, Math.sin(a) * 0.1, 0.03]), "#ffffff", [0, 0, a]));
  }
  const burstM = k.part("burstMesh", burstN, bp, burst, { outline: false, material: toonMat(s, { name: "emberFire" + (c.rare ? "R" : ""), emissive: P.fireE, rim: 0 }), shadow: false });
  burstN.setEnabled(false);

  // tiny rounded wings that flutter
  const wings: Wing[] = [];
  const wingNodes: TransformNode[] = [];
  for (const sd of [-1, 1]) {
    const piv: V3 = [sd * 0.1, 0.36, -0.15];
    const wn = k.node("wing" + sd, c.base, piv);
    const rot: V3 = [0.15, -sd * 0.55, sd * 0.35];
    const ctr = add(piv, rotDir(rot, [sd * 0.1, 0.02, 0]));
    const wm: Mesh[] = [
      blobM(s, [0.11, 0.075, 0.016], ctr, P.wing, rot, undefined, 10),
      blobM(s, [0.075, 0.048, 0.012], add(ctr, rotDir(rot, [sd * 0.005, -0.01, 0.008])), P.wingIn, rot, undefined, 10),
      blobM(s, [0.05, 0.035, 0.014], add(ctr, rotDir(rot, [sd * 0.06, -0.055, 0])), P.wing, [rot[0], rot[1], rot[2] + sd * 0.4], undefined, 8),
      blobM(s, [0.05, 0.035, 0.014], add(ctr, rotDir(rot, [-sd * 0.02, -0.06, 0])), P.wing, [rot[0], rot[1], rot[2] - sd * 0.2], undefined, 8),
      ballM(s, 0.022, add(ctr, rotDir(rot, [sd * 0.1, 0.05, 0])), P.spike, undefined, 6),
    ];
    k.part("wingMesh" + sd, wn, piv, wm, { outline: 0.014 });
    wings.push({ n: wn, side: sd, rest: 0.15, amp: 0.8, kind: "bird" });
    wingNodes.push(wn);
  }

  // fat tail curling up at the end into a little heart
  const tp: V3 = [0, 0.15, -0.17];
  const tn = k.node("tail", c.base, tp);
  const tail: Mesh[] = [];
  const NT = 8;
  let end: V3 = tp;
  for (let i = 0; i < NT; i++) {
    const u = i / (NT - 1);
    const p: V3 = [Math.sin(u * 2.2) * 0.07, 0.13 - 0.07 * Math.sin(u * 2.4) + 0.2 * u * u * u, -0.2 - 0.26 * u + 0.05 * u * u * u];
    tail.push(ballM(s, 0.085 - 0.05 * u, p, P.skin, P.skinB, 10));
    end = p;
  }
  tail.push(heartM(s, 0.068, 0.028, add(end, [0, 0.065, -0.01]), P.heart, [0, Math.PI / 2 - 0.4, 0]));
  k.part("tailMesh", tn, tp, tail);
  const tails: Tail[] = [{ n: tn, amp: 0.28, f: 2.2, walk: 0.3, gain: 0.4, curlY: 1.4, curlX: -0.1, axis: "y" }];

  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = {
    head,
    faces,
    legs,
    wings,
    tails,
    nodes: { tail: tn, burst: burstN },
    attackPose: (cr, u, p) => {
      if (u < 0.45) {
        // "ah… ah…": nose up, big inhale, eyes scrunched
        const a = sstep(0, 0.45, u);
        p.hp = -0.38 * a;
        p.sq = -0.1 * a;
        p.z = -0.03 * a;
        p.pitch = -0.08 * a;
        p.face = FACE.closed;
      } else if (u < 0.62) {
        // "CHOO!"
        const a = sstep(0.45, 0.54, u);
        p.hp = lerp(-0.38, 0.32, a);
        p.sq = lerp(-0.1, 0.14, a);
        p.z = lerp(-0.03, 0.06, a);
        p.pitch = lerp(-0.08, 0.12, a);
        p.face = FACE.happy;
      } else {
        const a = sstep(0.62, 1, u);
        p.hp = 0.32 * (1 - a);
        p.sq = 0.14 * (1 - a) - 0.04 * Math.sin(Math.PI * a);
        p.z = 0.06 * (1 - a);
        p.pitch = 0.12 * (1 - a);
        if (a < 0.6) p.face = FACE.happy;
      }
      void cr;
    },
    hook: (cr) => {
      const u = cr.atkU;
      // wings: a lazy idle flutter, frantic flapping during the sneeze
      const flap = u >= 0 ? (u < 0.45 ? 0.5 + 0.5 * Math.sin(cr.t * 30) : 0.9 * (1 - sstep(0.6, 1, u))) : 0;
      for (const w of wingNodes) {
        const sd = w === wingNodes[0] ? -1 : 1;
        w.rotation.z += sd * (0.08 * Math.sin(cr.t * 3.1) * (1 - cr.sleep) + flap * (0.5 + 0.5 * Math.sin(cr.t * 38)));
      }
      // cheeks glow brighter as it winds up
      const g = 1 + (u >= 0 ? 0.45 * Math.sin(Math.PI * Math.min(1, u / 0.62)) : 0) + 0.06 * Math.sin(cr.t * 2.6);
      glowM.scaling.set(g, g, g);
      // the sneeze burst
      const on = u >= 0.47 && u < 0.92;
      if (burstN.isEnabled() !== on) burstN.setEnabled(on);
      if (on) {
        const a = (u - 0.47) / 0.45;
        const sc = 0.4 + 1.3 * Math.sin(Math.PI * Math.min(1, a * 1.6)) * (1 - a * 0.3);
        burstN.scaling.set(sc, sc, sc);
        burstN.position.z = cr.rig.head.position.z * 0 + 0.33 - 0.03 + a * 0.12;
        burstM.rotation.z = a * 2.4;
      }
    },
  };
  if (c.rare) addSparkle(c, rig, [-0.3, 0.8, 0.05]);
  return finish(c, { gait: "waddle", freq: 2.7, bob: 0.025, stride: 0.05, lift: 0.045, roll: 0.13, height: 0.75, radius: 0.27, look: 0.75, headLag: 0.02, sleepDrop: 0.03, sleepHeadPitch: 0.32, sleepHeadRoll: 0.22, sleepHeadDrop: 0.03, attackDur: 0.45 }, rig);
}

function buildRoarlet(c: Ctx): Critter {
  const P = c.rare
    ? { fur: "#fff7ee", furB: "#f2e4dc", cream: "#ffffff", mane: "#f3b3d6", maneB: "#d9a2e8", inner: "#ffc6d8", nose: "#e88ca8", tuft: "#e8a6dc", paw: "#fff0f4" }
    : { fur: "#ffd98a", furB: "#f6bf66", cream: "#fff3d8", mane: "#ffaa5e", maneB: "#f48d4a", inner: "#ffc2b0", nose: "#c96f5c", tuft: "#f48d4a", paw: "#fff0d6" };
  const { scene: s, k } = c;
  const BE: Ell = { c: [0, 0.25, -0.05], r: [0.165, 0.155, 0.215] };
  k.part("body", c.base, [0, 0, 0], [blobM(s, BE.r, BE.c, P.fur, undefined, P.furB, 12), capOn(s, BE, 0, -0.62, 0.62, P.cream, { sx: 1.1 }), blobM(s, [0.115, 0.1, 0.07], [0, 0.29, 0.13], P.cream)]);
  const legs: Leg[] = [];
  const LEGS: [number, number, number][] = [
    [-0.09, 0.1, 0],
    [0.09, 0.1, 0.5],
    [-0.09, -0.17, 0.5],
    [0.09, -0.17, 0],
  ];
  const legNodes: TransformNode[] = [];
  LEGS.forEach(([x, z, ph], i) => {
    const piv: V3 = [x, 0.17, z];
    const ln = k.node("leg" + i, c.base, piv);
    const lm: Mesh[] = [blobM(s, [0.056, 0.09, 0.058], [x, 0.09, z], P.fur, undefined, P.furB), blobM(s, [0.056, 0.034, 0.066], [x, 0.032, z + 0.014], P.paw)];
    for (let j = -1; j <= 1; j++) lm.push(ballM(s, 0.011, [x + j * 0.022, 0.035, z + 0.075], P.inner, undefined, 4));
    k.part("legMesh" + i, ln, piv, lm);
    legs.push(leg(ln, ph, x > 0 ? 1 : -1, 0.06));
    legNodes.push(ln);
  });

  const hp: V3 = [0, 0.36, 0.12];
  const head = k.node("head", c.base, hp);
  const HE: Ell = { c: [0, 0.47, 0.15], r: [0.18, 0.16, 0.165] };
  const MU: Ell = { c: [0, 0.42, 0.28], r: [0.088, 0.06, 0.072] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [blobM(s, HE.r, HE.c, P.fur, undefined, P.furB, 14), blobM(s, MU.r, MU.c, P.cream)];
    // HUGE fluffy mane: a front ring framing the face + a fuller back layer
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + 0.11;
      const r = 0.088 + 0.01 * Math.sin(i * 2.7);
      hs.push(ballM(s, r, [Math.cos(a) * 0.205, 0.465 + Math.sin(a) * 0.19, 0.075 - 0.02 * Math.abs(Math.cos(a))], i % 2 ? P.mane : P.maneB, undefined, 10));
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.35;
      hs.push(ballM(s, 0.1, [Math.cos(a) * 0.13, 0.465 + Math.sin(a) * 0.125, -0.02], i % 2 ? P.maneB : P.mane, undefined, 10));
    }
    hs.push(ballM(s, 0.12, [0, 0.47, -0.05], P.maneB, undefined, 10));
    // round ears peeking out of the mane
    for (const sd of [-1, 1]) {
      const ep = surf(HE, sd * 0.55, 0.85, 0.0);
      hs.push(blobM(s, [0.055, 0.052, 0.028], ep.p, P.fur, rotZTo(ep.n), undefined, 10));
      hs.push(blobM(s, [0.032, 0.03, 0.014], add(ep.p, ep.n, 0.02), P.inner, rotZTo(ep.n), undefined, 8));
    }
    if (c.rare) hs.push(...crown(c, [0, 0.6, 0.21], 1.0, "#ffd85a"));
    return hs;
  };
  const faces = buildHeads(k, head, hp, hs, {
    head: HE,
    eyeYaw: 0.42,
    eyePitch: 0.12,
    eyeW: 0.036,
    eyeH: 0.05,
    cheekYaw: 0.74,
    cheekPitch: -0.14,
    cheekR: 0.032,
    nose: { ell: MU, pitch: 0.5, r: 0.026, color: P.nose, w: 1.4 },
    mouth: { ell: MU, pitch: 0.0, w: 0.024, h: 0.013, style: "w" },
  });
  // tail: thin swishy chain ending in a big tuft
  const tp: V3 = [0, 0.26, -0.25];
  const tn = k.node("tail", c.base, tp);
  const tail: Mesh[] = [];
  const NT = 9;
  let end: V3 = tp;
  for (let i = 0; i < NT; i++) {
    const u = i / (NT - 1);
    const p: V3 = [Math.sin(u * 2.2) * 0.03, 0.26 + 0.06 * Math.sin(u * 2) + 0.16 * u * u, -0.27 - 0.17 * Math.sin(u * 1.7)];
    tail.push(ballM(s, 0.03 - 0.004 * u, p, P.fur, undefined, 6));
    end = p;
  }
  tail.push(ballM(s, 0.06, add(end, [0, 0.04, -0.01]), P.tuft, undefined, 10), ballM(s, 0.042, add(end, [0.03, 0.08, 0.0]), P.mane, undefined, 8), ballM(s, 0.04, add(end, [-0.03, 0.075, -0.02]), P.mane, undefined, 8));
  k.part("tailMesh", tn, tp, tail);
  const tails: Tail[] = [{ n: tn, amp: 0.3, f: 2.4, walk: 0.3, gain: 0.5, curlY: 1.6, curlX: -0.4, axis: "y" }];
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = {
    head,
    faces,
    legs,
    tails,
    nodes: { tail: tn },
    attackPose: (cr, u, p) => {
      const H = cr.cfg.height;
      if (u < 0.32) {
        // crouch low with a wiggly bottom
        const a = sstep(0, 0.32, u);
        p.y = -0.035 * a;
        p.z = -0.04 * H * a;
        p.pitch = 0.12 * a;
        p.roll = 0.06 * Math.sin(u * 60) * a;
        p.sq = 0.1 * a;
        p.hp = -0.1 * a;
      } else if (u < 0.62) {
        // POUNCE: spring forward, rearing up with a paw swipe
        const a = (u - 0.32) / 0.3;
        p.z = lerp(-0.04, 0.24, sstep(0, 1, a)) * H;
        p.y = 0.13 * H * Math.sin(Math.PI * a);
        p.pitch = lerp(0.12, -0.32, sstep(0, 0.5, a)) + 0.4 * sstep(0.55, 1, a);
        p.sq = lerp(0.1, -0.12, sstep(0, 0.35, a)) + 0.12 * sstep(0.7, 1, a);
        p.hp = 0.1 * a;
        p.face = FACE.happy;
      } else {
        const a = sstep(0.62, 1, u);
        p.z = 0.24 * H * (1 - a);
        p.pitch = 0.08 * (1 - a);
        p.sq = 0.12 * (1 - a) - 0.05 * Math.sin(Math.PI * a);
        if (a < 0.5) p.face = FACE.happy;
      }
    },
    hook: (cr) => {
      const u = cr.atkU;
      if (u >= 0.32 && u < 0.85) {
        // front paws reach forward; the right one swipes down
        const a = (u - 0.32) / 0.53;
        const reach = Math.sin(Math.PI * Math.min(1, a * 1.4));
        legNodes[0].rotation.x = -1.1 * reach;
        legNodes[1].rotation.x = -1.3 * reach + 1.4 * sstep(0.35, 0.6, a) * reach;
        legNodes[1].rotation.z = 0.25 * reach;
        legNodes[2].rotation.x = 0.5 * reach;
        legNodes[3].rotation.x = 0.5 * reach;
      } else for (const n of legNodes) n.rotation.z = 0;
    },
  };
  if (c.rare) addSparkle(c, rig, [0.3, 0.8, 0.1]);
  return finish(c, { gait: "trot", freq: 2.8, bob: 0.035, stride: 0.07, lift: 0.06, height: 0.75, radius: 0.3, sleepDrop: 0.07, sleepHeadPitch: 0.2, sleepHeadYaw: 0.4, sleepHeadRoll: 0.38, sleepHeadDrop: 0.06, sleepRoll: 0.08, attackDur: 0.48 }, rig);
}

function buildShellby(c: Ctx): Critter {
  const P = c.rare
    ? { skin: "#c4e8f4", skinB: "#a6d6e8", shell: "#a7b4f0", shellB: "#8d9ae0", rim: "#fff1b8", under: "#fff6d8", emblem: "#ffd85a", helm: "#ffe48c", helmB: "#f0c457", band: "#fff3c4", plume: "#a6ecd2", plume2: "#d4f7ea", gem: "#ff9fc0" }
    : { skin: "#bfead0", skinB: "#a3dcb8", shell: "#83cba2", shellB: "#6db78d", rim: "#eaf7d6", under: "#f6f1c9", emblem: "#ff8fb0", helm: "#e4e7f6", helmB: "#c2c7e2", band: "#cfd3ec", plume: "#ff9fbf", plume2: "#ffc8da", gem: "#ffd85a" };
  const { scene: s, k } = c;
  // shell shaped like a heraldic shield (broad front, pointed back) with a light rim and a heart emblem
  const body: Mesh[] = [
    shieldDome(s, [0.27, 0.215, 0.3], [0, 0.2, -0.04], P.shell, P.shellB, 0.5, 0.15, 20),
    shieldDome(s, [0.295, 0.05, 0.325], [0, 0.19, -0.04], P.rim, undefined, 0.5, 1, 20),
    blobM(s, [0.215, 0.055, 0.25], [0, 0.15, -0.03], P.under, undefined, undefined, 12),
    // neck + little tail
    blobM(s, [0.085, 0.085, 0.12], [0, 0.25, 0.2], P.skin, [-0.3, 0, 0]),
    softConeM(s, 0.08, 0.035, [0, 0.17, -0.31], P.skin, [-2.0, 0, 0], undefined, [1, 1, 0.7], 8, 0.3),
  ];
  // emblem on top (lobes toward the head)
  const emN: V3 = norm([0, 1, -0.28]);
  const emP: V3 = [0, 0.41, -0.07];
  if (c.rare) body.push(puffStar(s, 5, 0.1, 0.048, 0.022, emP, P.emblem, [rotZTo(emN)[0], rotZTo(emN)[1], Math.PI]));
  else body.push(heartM(s, 0.095, 0.022, emP, P.emblem, [rotZTo(emN)[0], rotZTo(emN)[1], Math.PI]));
  k.part("body", c.base, [0, 0, 0], body, { outline: 0.02 });

  // stubby legs in two diagonal pairs
  const legMesh = (x: number, zz: number) => {
    const out = [blobM(s, [0.07, 0.075, 0.078], [x, 0.07, zz], P.skin, undefined, P.skinB, 10)];
    for (let i = -1; i <= 1; i++) out.push(ballM(s, 0.013, [x + i * 0.026, 0.03, zz + 0.072], P.rim, undefined, 4));
    return out;
  };
  const la = k.node("legsA", c.base, [0, 0.1, 0]);
  k.part("legsAMesh", la, [0, 0.1, 0], [...legMesh(-0.2, 0.12), ...legMesh(0.18, -0.2)], { outline: 0.02 });
  const lb = k.node("legsB", c.base, [0, 0.1, 0]);
  k.part("legsBMesh", lb, [0, 0.1, 0], [...legMesh(0.2, 0.12), ...legMesh(-0.18, -0.2)], { outline: 0.02 });
  const legs: Leg[] = [leg(la, 0, 1, 0.04), leg(lb, 0.5, -1, 0.04)];

  const hp: V3 = [0, 0.27, 0.24];
  const head = k.node("head", c.base, hp);
  const HE: Ell = { c: [0, 0.35, 0.34], r: [0.14, 0.13, 0.13] };
  const hs = (): Mesh[] => {
    const hs: Mesh[] = [
      blobM(s, HE.r, HE.c, P.skin, undefined, P.skinB, 14),
      // tiny knight helmet: dome + band + a jewel at the front
      blobM(s, [0.148, 0.085, 0.142], [0, 0.415, 0.325], P.helm, [-0.12, 0, 0], P.helmB, 14),
      blobM(s, [0.152, 0.024, 0.146], [0, 0.4, 0.33], P.band, [-0.12, 0, 0], undefined, 14),
      ballM(s, 0.02, [0, 0.415, 0.475], P.gem, undefined, 6),
    ];
    return hs;
  };
  const faces = buildHeads(k, head, hp, hs, {
    head: HE,
    eyeYaw: 0.4,
    eyePitch: -0.02,
    eyeW: 0.033,
    eyeH: 0.044,
    cheekYaw: 0.7,
    cheekPitch: -0.28,
    cheekR: 0.03,
    mouth: { pitch: -0.36, w: 0.024, h: 0.013, style: "smile" },
  }, { outline: 0.02 });
  // springy plume on top of the helmet
  const pp: V3 = [0, 0.49, 0.3];
  const plN = k.node("plume", head, pp);
  k.part("plumeMesh", plN, pp, [
    ballM(s, 0.042, [0, 0.515, 0.31], P.plume, undefined, 8),
    ballM(s, 0.048, [0, 0.555, 0.26], P.plume2, undefined, 8),
    ballM(s, 0.042, [0, 0.565, 0.2], P.plume, undefined, 8),
    ballM(s, 0.034, [0, 0.545, 0.15], P.plume2, undefined, 8),
  ], { outline: 0.016 });
  const ears: Ear[] = [ear(plN, 0, 1.2, 0.3, 0.45)];
  const rig: Partial<Rig> & { head: TransformNode; faces: Mesh[] } = {
    head,
    faces,
    legs,
    ears,
    nodes: { plume: plN },
    attackPose: (cr, u, p) => {
      if (u < 0.38) {
        // brace: tuck the head in and hunker down behind the shell
        const a = sstep(0, 0.3, u);
        p.hz = -0.085 * a;
        p.hy = -0.03 * a;
        p.y = -0.02 * a;
        p.z = -0.03 * a;
        p.pitch = 0.12 * a;
        p.sq = 0.08 * a;
        p.face = FACE.closed;
      } else if (u < 0.58) {
        // SHIELD BASH: bump forward shell-first
        const a = sstep(0.38, 0.5, u);
        p.hz = -0.085;
        p.hy = -0.03;
        p.z = lerp(-0.03, 0.17, a);
        p.y = 0.03 * Math.sin(Math.PI * a);
        p.pitch = lerp(0.12, 0.24, a);
        p.sq = lerp(0.08, -0.08, a);
        p.face = FACE.closed;
      } else {
        // pop back out, proud
        const a = sstep(0.58, 1, u);
        p.z = 0.17 * (1 - a);
        p.pitch = 0.24 * (1 - a);
        p.hz = -0.085 * (1 - sstep(0, 0.5, a)) + 0.02 * Math.sin(Math.PI * a);
        p.hy = -0.03 * (1 - a);
        p.sq = -0.08 * (1 - a) + 0.05 * Math.sin(Math.PI * a);
        p.face = FACE.happy;
      }
      void cr;
    },
  };
  if (c.rare) addSparkle(c, rig, [0.3, 0.62, 0.05]);
  return finish(c, { gait: "shuffle", freq: 2.2, bob: 0.012, stride: 0.04, lift: 0.03, roll: 0.05, height: 0.6, radius: 0.32, look: 0.6, headLag: 0.01, sleepDrop: 0.02, sleepHeadPitch: 0.25, sleepHeadRoll: 0.1, sleepHeadDrop: 0.03, attackDur: 0.48 }, rig);
}

const BUILDERS: Record<SpeciesId, (c: Ctx) => Critter> = {
  redpanda: buildRedpanda,
  puffbun: buildPuffbun,
  chirpy: buildChirpy,
  fennix: buildFennix,
  hoglet: buildHoglet,
  shroomy: buildShroomy,
  ribbit: buildRibbit,
  duckling: buildDuckling,
  glowbat: buildGlowbat,
  molly: buildMolly,
  mochi: buildMochi,
  pony: (c) => buildEquine(c, false),
  unicorn: (c) => buildEquine(c, true),
  emberling: buildEmberling,
  roarlet: buildRoarlet,
  shellby: buildShellby,
};
/** outline width per species (big riders get a slightly heavier line so they read at a distance) */
const OUTLINE: Partial<Record<SpeciesId, number>> = { pony: 0.024, unicorn: 0.024 };

/**
 * Build a plush critter. Origin at feet centre, facing +Z.
 * variant 1 = rare alternate colourway (+ floating sparkle and a tiny accessory).
 */
export function buildCritter(scene: Scene, species: SpeciesId, variant: 0 | 1 = 0): CritterModel {
  const c = ctx(scene, species, variant, OUTLINE[species]);
  return BUILDERS[species](c);
}

