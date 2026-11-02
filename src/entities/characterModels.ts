/**
 * characterModels — procedural plush-style player + villager NPCs with transform-only animation.
 *
 * Every model: origin at feet centre, faces +Z, ~8–13 draw calls. Animated parts are separate
 * meshes parented to TransformNode pivots (see characterParts.Rig); everything static is merged.
 */
import { type Scene, type Mesh, type TransformNode, Vector3 } from "@babylonjs/core";
import { ball, blob, softBox, softCyl, lathe, capsule, disc, torus, cone, type V3, type ColorLike } from "../render/Shapes";
import { mixCol } from "../render/Palette";
import { toonMat } from "../render/Toon";
import {
  Rig,
  Kit,
  tube,
  bez,
  group,
  heart,
  flower,
  placeOn,
  surfCurve,
  wrapBand,
  profileRadius,
  shell,
  resolveLook,
  OUTFIT_STYLES,
  ACCESSORIES,
  LOOK_DEFAULTS,
  type RigSpec,
  type CharacterModel,
  type CharacterAnimState,
  type PlayerLook,
  type HatId,
  type OutfitStyle,
  type AccessoryId,
  type EmoteKind,
} from "./characterParts";

export type { CharacterModel, CharacterAnimState, PlayerLook, HatId, OutfitStyle, AccessoryId, EmoteKind };
export { OUTFIT_STYLES, ACCESSORIES, LOOK_DEFAULTS, resolveLook };

/* ------------------------------------------------------------------ */
/* Look options                                                        */
/* ------------------------------------------------------------------ */

export const DEFAULT_LOOK: PlayerLook = { skin: "#ffe2cf", hair: "#8a5a44", outfit: "#8fc3ea", hat: "none", ...LOOK_DEFAULTS };

export const LOOK_OPTIONS: {
  skin: string[];
  hair: string[];
  outfit: string[];
  hat: HatId[];
  style: OutfitStyle[];
  outfit2: string[];
  accessory: AccessoryId[];
  accessoryColor: string[];
} = {
  skin: ["#ffe2cf", "#f8d0b0", "#e9b58e", "#c98e66", "#9a6446"],
  hair: ["#8a5a44", "#4a3a52", "#f3c76a", "#ee8a63", "#f4a3c4", "#a993dc"],
  outfit: ["#8fc3ea", "#ef8fab", "#8fd4b5", "#b48ce6", "#f5cf6b", "#ff9f8f"],
  hat: ["none", "beret", "flower", "bunnyears", "strawhat", "crown", "chef"],
  style: OUTFIT_STYLES,
  outfit2: ["#fff6e6", "#f8b9cb", "#ffe066", "#bfe9d6", "#cdb9f0", "#a8d4f5"],
  accessory: ACCESSORIES,
  accessoryColor: ["#f8b9cb", "#ff8f8a", "#ffd45e", "#8fd4b5", "#8fb4ea", "#b48ce6"],
};

export type NpcId = "mayor" | "granny" | "flora" | "stitch" | "hoot" | "pip" | "bramble" | "marina" | "mocha";

export const NPC_INFO: Record<NpcId, { name: string; color: string }> = {
  mayor: { name: "Mayor Bunbury", color: "#b48ce6" },
  granny: { name: "Granny Pom", color: "#a993dc" },
  flora: { name: "Flora", color: "#ef8fab" },
  stitch: { name: "Stitch", color: "#5fc4bc" },
  hoot: { name: "Professor Hoot", color: "#8fb4ea" },
  pip: { name: "Pip", color: "#ffa64d" },
  bramble: { name: "Bramble", color: "#e8b53e" },
  marina: { name: "Marina", color: "#6fb9e2" },
  mocha: { name: "Mocha", color: "#e8976a" },
};

/* ------------------------------------------------------------------ */
/* Shared colours                                                      */
/* ------------------------------------------------------------------ */

const EYE = "#3b2f45";
const HILITE = "#ffffff";
const MOUTH_LINE = "#6e4058";
const MOUTH_IN = "#7a3a55";
const TONGUE = "#f58fa6";
const CHEEK = "#ff9db4";
const INK = "#4a3a52";

const darker = (c: ColorLike, t = 0.18) => mixCol(c as string, INK, t);
const lighter = (c: ColorLike, t = 0.3) => mixCol(c as string, "#ffffff", t);

/* ------------------------------------------------------------------ */
/* Face helpers                                                        */
/* ------------------------------------------------------------------ */

interface Ell {
  c: V3;
  r: V3;
}

interface EyeOpts {
  yaw: number;
  pitch: number;
  rx: number;
  ry: number;
  color?: ColorLike;
  /** coloured ring / sclera behind the pupil */
  white?: ColorLike;
  whiteScale?: number;
  /** eyelashes on the outer corner */
  lash?: boolean;
  /** push eyes off the surface (e.g. over a raccoon mask) */
  out?: number;
}

function eyeCentre(f: Ell, o: EyeOpts): V3 {
  const p = placeOn(f.c, f.r, o.yaw, o.pitch, -o.rx * 0.2 + (o.out ?? 0)).pos;
  return [0, p[1], p[2]];
}

function addEyes(kit: Kit, grp: string, f: Ell, o: EyeOpts) {
  const s = kit.scene;
  for (const side of [-1, 1]) {
    const yaw = o.yaw * side;
    const ou = o.out ?? 0;
    const e = placeOn(f.c, f.r, yaw, o.pitch, -o.rx * 0.2 + ou);
    if (o.white) {
      const ws = o.whiteScale ?? 1.45;
      const w = placeOn(f.c, f.r, yaw, o.pitch, -o.rx * 0.3 + ou);
      kit.add(grp, blob(s, o.rx * ws, o.ry * ws * 0.92, o.rx * 0.4, { pos: w.pos, rot: w.rot, color: o.white }, 10));
    }
    kit.add(grp, blob(s, o.rx, o.ry, o.rx * 0.55, { pos: e.pos, rot: e.rot, color: o.color ?? EYE }, 10));
    const h1 = placeOn(f.c, f.r, yaw, o.pitch, o.rx * 0.12 + ou, [o.rx * 0.32, o.ry * 0.38, 0]);
    kit.add(grp, ball(s, o.rx * 0.36, { pos: h1.pos, color: HILITE }, 6));
    const h2 = placeOn(f.c, f.r, yaw, o.pitch, o.rx * 0.1 + ou, [-o.rx * 0.32, -o.ry * 0.45, 0]);
    kit.add(grp, ball(s, o.rx * 0.17, { pos: h2.pos, color: HILITE }, 5));
    if (o.lash) {
      const r0 = placeOn(f.c, f.r, yaw + side * o.rx * 30, o.pitch + o.ry * 25, -0.004).pos;
      const r1 = placeOn(f.c, f.r, yaw + side * o.rx * 62, o.pitch + o.ry * 58, 0.012).pos;
      const r2 = placeOn(f.c, f.r, yaw + side * o.rx * 34, o.pitch + o.ry * 50, -0.002).pos;
      const r3 = placeOn(f.c, f.r, yaw + side * o.rx * 52, o.pitch + o.ry * 85, 0.012).pos;
      kit.add(grp, tube(s, [r0, r1], o.rx * 0.16, { color: o.color ?? EYE }, 4, (u) => 1 - u * 0.6));
      kit.add(grp, tube(s, [r2, r3], o.rx * 0.14, { color: o.color ?? EYE }, 4, (u) => 1 - u * 0.6));
    }
  }
}

/** U-shaped smile on a surface. */
function smile(kit: Kit, grp: string, f: Ell, pitch: number, halfYaw: number, depth: number, rad: number, color: ColorLike = MOUTH_LINE) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 4 - 1;
    pts.push([u * halfYaw, pitch - depth * (1 - u * u) + depth * 0.15 * u * u]);
  }
  kit.add(grp, tube(kit.scene, surfCurve(f.c, f.r, pts, 0), rad, { color }, 5));
}

/** Cat/animal "ω" mouth. */
function wMouth(kit: Kit, grp: string, f: Ell, pitch: number, halfYaw: number, depth: number, rad: number, color: ColorLike = MOUTH_LINE) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 6 - 1; // -1..1
    const local = Math.abs(u) * 2 - 1; // -1..1 in each lobe
    pts.push([u * halfYaw, pitch - depth * (1 - local * local)]);
  }
  kit.add(grp, tube(kit.scene, surfCurve(f.c, f.r, pts, 0), rad, { color }, 5));
}

/** Open mouth (talking) – lives in the rig's mouth group, scaled by the animator. */
function openMouth(kit: Kit, f: Ell, pitch: number, w: number, h: number) {
  const s = kit.scene;
  const m = placeOn(f.c, f.r, 0, pitch - (h / f.r[1]) * 25, -0.002);
  const parts = [
    blob(s, w, h, Math.min(w, h) * 0.5, { color: MOUTH_IN }, 10),
    blob(s, w * 0.6, h * 0.45, Math.min(w, h) * 0.35, { pos: [0, -h * 0.42, Math.min(w, h) * 0.25], color: TONGUE }, 8),
  ];
  kit.add("mouth", group(parts, { pos: m.pos, rot: m.rot }));
}

function mouthPivot(f: Ell, pitch: number, h: number): V3 {
  return placeOn(f.c, f.r, 0, pitch - (h / f.r[1]) * 25, -0.002).pos;
}

function cheeks(kit: Kit, grp: string, f: Ell, yaw: number, pitch: number, rx: number, ry: number, color: ColorLike = CHEEK) {
  for (const side of [-1, 1]) {
    const p = placeOn(f.c, f.r, yaw * side, pitch, -0.003);
    kit.add(grp, blob(kit.scene, rx, ry, 0.012, { pos: p.pos, rot: p.rot, color }, 8));
  }
}

/** Standard rounded arm hanging from the shoulder pivot (+X side if side = 1). */
function arm(kit: Kit, side: 1 | -1, sh: V3, len: number, r: number, color: ColorLike, handR: number, handColor: ColorLike, opts: { sleeve?: ColorLike; sleeveR?: number; splay?: number } = {}) {
  const g = side > 0 ? "armR" : "armL";
  const s = kit.scene;
  const sp = opts.splay ?? 0.02;
  const x = sh[0] * side;
  kit.add(g, capsule(s, len, r, { pos: [x + sp * side, sh[1] - len / 2 + r * 0.6, sh[2]], color, bottom: darker(color, 0.06) }));
  kit.add(g, ball(s, handR, { pos: [x + sp * 1.6 * side, sh[1] - len + r * 0.9, sh[2] + 0.005], color: handColor, scale: [1, 0.95, 0.95] }, 10));
  if (opts.sleeve) kit.add(g, ball(s, opts.sleeveR ?? r * 1.45, { pos: [x + 0.004 * side, sh[1] - 0.01, sh[2]], color: opts.sleeve, bottom: darker(opts.sleeve, 0.06) }, 10));
}

/** Standard stubby leg + foot. */
function leg(kit: Kit, side: 1 | -1, hip: V3, r: number, color: ColorLike, foot: { rx: number; ry: number; rz: number; color: ColorLike; z?: number }) {
  const g = side > 0 ? "legR" : "legL";
  const s = kit.scene;
  const x = hip[0] * side;
  const top = hip[1] + 0.05;
  const bot = foot.ry * 1.1;
  kit.add(g, capsule(s, top - bot + r, r, { pos: [x, (top + bot) / 2, 0], color }));
  kit.add(g, blob(s, foot.rx, foot.ry, foot.rz, { pos: [x, foot.ry * 0.95, foot.z ?? foot.rz * 0.3], color: foot.color, bottom: darker(foot.color, 0.15) }, 10));
}

/** Groups every model uses. */
function stdGroups(kit: Kit, rig: Rig, ol = 0.016) {
  kit
    .def("body", rig.body, { outline: ol })
    .def("head", rig.head, { outline: ol })
    .flatInto("face", "head")
    .def("eyes", rig.eyes, { outline: false, castShadow: false, receiveShadow: false })
    .def("mouth", rig.mouth, { outline: false, castShadow: false, receiveShadow: false }, true)
    .def("armL", rig.armL, { outline: ol })
    .def("armR", rig.armR, { outline: ol })
    .def("legL", rig.legL, { outline: ol })
    .def("legR", rig.legR, { outline: ol });
}

/* ------------------------------------------------------------------ */
/* PLAYER                                                              */
/* ------------------------------------------------------------------ */

const P_HEAD: Ell = { c: [0, 0.95, 0.02], r: [0.29, 0.27, 0.27] };
const P_EYES: EyeOpts = { yaw: 21, pitch: -6, rx: 0.033, ry: 0.047 };
const P_MOUTH_PITCH = -25;
const P_TORSO: [number, number][] = [
  [0, 0.25],
  [0.14, 0.26],
  [0.158, 0.31],
  [0.156, 0.4],
  [0.14, 0.52],
  [0.115, 0.61],
  [0.085, 0.67],
  [0.04, 0.7],
  [0, 0.7],
];

export function buildPlayer(scene: Scene, look: PlayerLook): CharacterModel {
  const spec: RigSpec = {
    name: "player",
    height: 1.27,
    hipY: 0.3,
    neck: [0, 0.66, 0],
    headY: P_HEAD.c[1],
    eyes: eyeCentre(P_HEAD, P_EYES),
    mouth: mouthPivot(P_HEAD, P_MOUTH_PITCH, 0.03),
    shoulder: [0.15, 0.6, 0],
    hip: [0.08, 0.3, 0],
    persona: { idleBounce: 0.0, armRestZ: 0.16 },
  };
  const rig = new Rig(scene, spec, 7);
  // springy accessory pivots live for the model's whole life (setLook only rebuilds meshes)
  const nodes: PlayerNodes = {
    cape: rig.node("cape", rig.body, CAPE_PIVOT),
    scarf: rig.node("scarfTail", rig.body, SCARF_PIVOT),
  };
  rig.addSecondary({ node: nodes.cape, axis: "x", k: 38, d: 3.2, gy: 0.016, gspeed: 0.42, min: -0.06, max: 0.8 });
  rig.addSecondary({ node: nodes.cape, axis: "z", k: 46, d: 3, gyaw: 0.22, wagAmp: 0.035, wagFreq: 0.65, min: -0.3, max: 0.3 });
  rig.addSecondary({ node: nodes.scarf, axis: "z", k: 55, d: 3.2, gyaw: -0.3, wagAmp: 0.07, wagFreq: 0.85, min: -0.6, max: 0.6 });
  rig.addSecondary({ node: nodes.scarf, axis: "x", k: 48, d: 3.6, gy: -0.014, gspeed: -0.16, min: -0.7, max: 0.12 });
  let current = { ...look };
  const build = (lk: PlayerLook) => {
    const L = resolveLook(lk);
    const kit = new Kit(scene, rig);
    stdGroups(kit, rig, 0.015);
    if (L.style === "raincoat") {
      // glossy vinyl: same draw calls, shinier material on the coat + sleeves
      const gloss = toonMat(scene, { name: "charGloss", rim: 0.42, specular: 0.5 });
      kit.def("body", rig.body, { outline: 0.015, material: gloss }).def("armL", rig.armL, { outline: 0.015, material: gloss }).def("armR", rig.armR, { outline: 0.015, material: gloss });
    }
    kit.flatInto("bodyFlat", "body");
    kit.def("hat", rig.head, { outline: 0.015 });
    kit.def("cape", nodes.cape, { outline: 0.015 });
    kit.def("scarfTail", nodes.scarf, { outline: 0.014 });
    playerParts(kit, L, nodes);
    kit.build();
  };
  build(current);
  const model = rig as unknown as CharacterModel;
  model.setLook = (lk: PlayerLook) => {
    current = { ...lk };
    rig.clearMeshes();
    build(current);
  };
  return model;
}

interface PlayerNodes {
  cape: TransformNode;
  scarf: TransformNode;
}
const CAPE_PIVOT: V3 = [0, 0.655, -0.07];
const SCARF_PIVOT: V3 = [-0.075, 0.615, 0.12];

/* ---- garment silhouettes (lathe profiles, [radius, y]) ---- */
const P_PANTS: [number, number][] = [
  [0, 0.2],
  [0.148, 0.205],
  [0.168, 0.25],
  [0.17, 0.32],
  [0.162, 0.42],
  [0, 0.42],
];
const P_SKIRT: [number, number][] = [
  [0, 0.15],
  [0.232, 0.15],
  [0.25, 0.168],
  [0.24, 0.2],
  [0.205, 0.29],
  [0.168, 0.39],
  [0.152, 0.445],
  [0, 0.45],
];
const P_HOODIE: [number, number][] = [
  [0, 0.215],
  [0.152, 0.215],
  [0.17, 0.235],
  [0.176, 0.3],
  [0.174, 0.4],
  [0.158, 0.52],
  [0.13, 0.61],
  [0.097, 0.668],
  [0.05, 0.7],
  [0, 0.705],
];
const P_TUNIC: [number, number][] = [
  [0, 0.19],
  [0.178, 0.19],
  [0.192, 0.205],
  [0.18, 0.27],
  [0.164, 0.34],
  [0.16, 0.42],
  [0.146, 0.52],
  [0.118, 0.61],
  [0.087, 0.67],
  [0.04, 0.7],
  [0, 0.7],
];
const P_COAT: [number, number][] = [
  [0, 0.155],
  [0.235, 0.155],
  [0.25, 0.175],
  [0.238, 0.21],
  [0.205, 0.3],
  [0.175, 0.4],
  [0.162, 0.5],
  [0.14, 0.59],
  [0.11, 0.65],
  [0.06, 0.695],
  [0, 0.705],
];

/** Outer silhouette of a set of lathes, resampled as one profile (for straps, capes, scarves). */
function outerProfile(ps: [number, number][][]): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0.14; y <= 0.72; y += 0.02) {
    let r = 0;
    for (const p of ps) {
      const ys = p.map((q) => q[1]);
      if (y >= Math.min(...ys) && y <= Math.max(...ys)) r = Math.max(r, profileRadius(p, y));
    }
    out.push([r, y]);
  }
  return out;
}

function playerParts(kit: Kit, L: Required<PlayerLook>, nodes: PlayerNodes) {
  const s = kit.scene;
  const skin = L.skin,
    hair = L.hair,
    outfit = L.outfit,
    acc = L.outfit2;
  const H = P_HEAD;
  const hoodUp = L.style === "hoodie" && L.hat === "none";

  /* ---- head ---- */
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: skin, bottom: darker(skin, 0.05) }, 16));
  // ears peeking under the bob
  if (!hoodUp) for (const side of [-1, 1]) kit.add("head", blob(s, 0.04, 0.055, 0.035, { pos: [0.285 * side, 0.9, 0.03], color: skin }, 8));
  // nose
  const n = placeOn(H.c, H.r, 0, -14, -0.006);
  kit.add("head", blob(s, 0.02, 0.014, 0.014, { pos: n.pos, rot: n.rot, color: darker(skin, 0.06) }, 8));
  addEyes(kit, "eyes", H, P_EYES);
  cheeks(kit, "face", H, 38, -17, 0.05, 0.03);
  smile(kit, "face", H, P_MOUTH_PITCH, 7, 2.6, 0.0075);
  openMouth(kit, H, P_MOUTH_PITCH, 0.034, 0.03);
  // tiny brows
  for (const side of [-1, 1]) {
    const pts = surfCurve(H.c, H.r, [[(P_EYES.yaw - 6) * side, 8.5], [P_EYES.yaw * side, 9.8], [(P_EYES.yaw + 6) * side, 8.8]], 0.003);
    kit.add("face", tube(s, pts, 0.006, { color: darker(hair, 0.25) }, 4));
  }

  /* ---- hair: bob with bangs ---- */
  const hairB = darker(hair, 0.12);
  kit.add("head", blob(s, 0.31, 0.295, 0.295, { pos: [0, 0.975, -0.04], color: hair, bottom: hairB }, 16));
  // bangs: scalloped fringe across the forehead
  const bangs: [number, number, number][] = [
    [-44, 25, 0.075],
    [-23, 31, 0.08],
    [0, 33, 0.085],
    [23, 31, 0.08],
    [44, 25, 0.075],
  ];
  for (const [yw, pt, r] of bangs) {
    const p = placeOn(H.c, H.r, yw, pt, -0.012);
    kit.add("head", blob(s, r, r * 0.95, 0.05, { pos: p.pos, rot: [p.rot[0], p.rot[1], -yw * 0.006], color: hair }, 10));
  }
  if (!hoodUp) {
    // bob flip at the back
    kit.add("head", blob(s, 0.3, 0.1, 0.28, { pos: [0, 0.79, -0.06], color: hairB }, 12));
    // side locks framing the cheeks
    for (const side of [-1, 1]) {
      const p = placeOn(H.c, H.r, 68 * side, -14, -0.02);
      kit.add("head", blob(s, 0.065, 0.165, 0.09, { pos: p.pos, rot: [0, p.rot[1], 0.1 * side], color: hair, bottom: hairB }, 10));
    }
    // cowlick
    kit.add("head", tube(s, bez([0.0, 1.24, 0.0], [0.0, 1.33, 0.06], [0.07, 1.33, 0.03], 8), 0.022, { color: hair }, 6, (u) => 1 - u * 0.75));
  } else {
    // little side wisps tucked inside the hood
    for (const side of [-1, 1]) {
      const p = placeOn(H.c, H.r, 58 * side, -6, -0.02);
      kit.add("head", blob(s, 0.055, 0.12, 0.07, { pos: p.pos, rot: [0, p.rot[1], 0.12 * side], color: hair, bottom: hairB }, 10));
    }
  }

  /* ---- outfit ---- */
  const prof = playerOutfit(kit, L, hoodUp);

  /* ---- accessory (satchel unless the backpack replaces it) ---- */
  if (L.accessory !== "backpack") satchel(kit, prof);
  playerAccessory(kit, L, prof, hoodUp, nodes);

  /* ---- hat ---- */
  playerHat(kit, L.hat);
}

/** Builds body/arm/leg garments for the style and returns the outer torso silhouette. */
function playerOutfit(kit: Kit, L: Required<PlayerLook>, hoodUp: boolean): [number, number][] {
  const s = kit.scene;
  const { skin, outfit } = L;
  const acc = L.outfit2;
  const sh: V3 = [0.15, 0.6, 0];
  const add = (...m: Mesh[]) => kit.add("body", ...m);
  let legCol: ColorLike = outfit;
  let boot: ColorLike = "#a8727c";
  let cuff: ColorLike | null = null; // rolled trouser cuff colour
  let prof: [number, number][] = P_TORSO;
  /** a little thing sitting on the garment surface at height y, angle a (rad, 0 = front) */
  const onFront = (p: [number, number][], y: number, a: number, out = 0): V3 => {
    const r = profileRadius(p, y) + out;
    return [Math.sin(a) * r, y, Math.cos(a) * r];
  };

  switch (L.style) {
    case "overalls": {
      const shirt = acc;
      add(lathe(s, P_TORSO, { color: shirt, bottom: darker(shirt, 0.05) }, 18));
      add(lathe(s, P_PANTS, { color: outfit, bottom: darker(outfit, 0.12) }, 18));
      // bib + accent pocket with a stitched heart, straps + buttons
      add(softBox(s, 0.17, 0.15, 0.05, { pos: [0, 0.475, 0.125], rot: [-0.12, 0, 0], color: outfit }, 0.022));
      add(softBox(s, 0.085, 0.055, 0.02, { pos: [0, 0.455, 0.153], rot: [-0.12, 0, 0], color: lighter(acc, 0.1), bottom: darker(acc, 0.06) }, 0.01));
      add(heart(s, 0.03, darker(outfit, 0.05), { pos: [0, 0.457, 0.165], rot: [-0.12, 0, 0] }));
      for (const side of [-1, 1]) {
        add(tube(s, bez([0.065 * side, 0.52, 0.135], [0.08 * side, 0.63, 0.11], [0.1 * side, 0.67, -0.01], 6), 0.017, { color: outfit }, 5));
        add(ball(s, 0.02, { pos: [0.064 * side, 0.528, 0.155], color: "#ffe066" }, 8));
        // collar
        add(blob(s, 0.055, 0.025, 0.04, { pos: [0.045 * side, 0.68, 0.06], rot: [0.3, 0.35 * side, -0.4 * side], color: shirt }, 8));
      }
      cuff = acc;
      prof = outerProfile([P_TORSO, P_PANTS]);
      break;
    }
    case "dress": {
      add(lathe(s, P_TORSO, { color: outfit, bottom: darker(outfit, 0.05) }, 18));
      add(lathe(s, P_SKIRT, { color: outfit, bottom: darker(outfit, 0.14) }, 22));
      // scalloped hem
      const N = 16;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        add(blob(s, 0.05, 0.034, 0.03, { pos: [Math.sin(a) * 0.243, 0.16, Math.cos(a) * 0.243], rot: [0, a, 0], color: acc, bottom: darker(acc, 0.06) }, 8));
      }
      // waist sash + bow at the back
      add(tube(s, wrapBand(P_SKIRT, 0.43, 0, 0.006, 26), 0.018, { color: acc }, 6));
      for (const side of [-1, 1]) add(blob(s, 0.055, 0.035, 0.025, { pos: [0.05 * side, 0.44, -0.165], rot: [0, 0, -0.35 * side], color: acc }, 8));
      add(ball(s, 0.022, { pos: [0, 0.44, -0.172], color: darker(acc, 0.08) }, 8));
      // peter-pan collar + two little buttons
      for (const side of [-1, 1]) add(blob(s, 0.06, 0.035, 0.03, { pos: [0.045 * side, 0.665, 0.075], rot: [0.55, 0.3 * side, -0.5 * side], color: acc, bottom: darker(acc, 0.04) }, 10));
      for (const y of [0.6, 0.53]) add(ball(s, 0.014, { pos: onFront(P_TORSO, y, 0, 0.004), color: acc }, 6));
      legCol = skin;
      boot = "#f47a9a";
      prof = outerProfile([P_TORSO, P_SKIRT]);
      break;
    }
    case "hoodie": {
      const pants = mixCol(outfit, INK, 0.42);
      add(lathe(s, P_PANTS, { color: pants, bottom: darker(pants, 0.1) }, 18));
      add(lathe(s, P_HOODIE, { color: outfit, bottom: darker(outfit, 0.08) }, 20));
      // ribbed waistband
      add(tube(s, wrapBand(P_HOODIE, 0.232, 0, -0.002, 26), 0.022, { color: darker(outfit, 0.08) }, 6));
      // kangaroo pocket (accent piping on the openings)
      add(softBox(s, 0.2, 0.1, 0.03, { pos: [0, 0.325, 0.168], rot: [-0.05, 0, 0], color: darker(outfit, 0.04) }, 0.03));
      for (const side of [-1, 1]) add(tube(s, [[0.075 * side, 0.375, 0.186], [0.098 * side, 0.285, 0.186]], 0.008, { color: acc }, 4));
      // drawstrings with aglets
      for (const side of [-1, 1]) {
        const top: V3 = [0.035 * side, 0.665, 0.105];
        const end: V3 = [0.045 * side, 0.53, 0.168];
        add(tube(s, bez(top, [0.042 * side, 0.6, 0.165], end, 5), 0.008, { color: acc }, 4));
        add(ball(s, 0.016, { pos: end, color: acc, scale: [1, 1.4, 1] }, 6));
      }
      if (!hoodUp) {
        // hood resting on the upper back: accent lining on top, ear nubs flopped backwards
        add(blob(s, 0.15, 0.105, 0.075, { pos: [0, 0.585, -0.17], rot: [-0.25, 0, 0], color: outfit, bottom: darker(outfit, 0.08) }, 12));
        add(blob(s, 0.115, 0.035, 0.05, { pos: [0, 0.665, -0.165], rot: [-0.45, 0, 0], color: acc }, 10));
        for (const side of [-1, 1]) {
          add(group([cone(s, 0.09, 0.045, { color: outfit, scale: [1, 1, 0.55] }, 8), cone(s, 0.055, 0.026, { pos: [0, 0.008, -0.018], color: acc, scale: [1, 1, 0.4] }, 6)], { pos: [0.075 * side, 0.6, -0.225], rot: [-2.0, 0, 0.3 * side] }));
        }
      }
      legCol = pants;
      boot = "#fffaf4";
      prof = outerProfile([P_HOODIE, P_PANTS]);
      break;
    }
    case "tunic": {
      const tights = mixCol(outfit, INK, 0.5);
      add(lathe(s, P_TUNIC, { color: outfit, bottom: darker(outfit, 0.1) }, 20));
      // accent hem trim
      add(tube(s, wrapBand(P_TUNIC, 0.205, 0, 0.004, 28), 0.013, { color: acc }, 5));
      // belt + buckle
      add(tube(s, wrapBand(P_TUNIC, 0.37, 0, 0.006, 26), 0.022, { color: "#a3754d" }, 6));
      add(softBox(s, 0.06, 0.05, 0.02, { pos: onFront(P_TUNIC, 0.37, 0, 0.022), color: "#ffd45e" }, 0.01));
      add(softBox(s, 0.03, 0.022, 0.02, { pos: onFront(P_TUNIC, 0.37, 0, 0.03), color: "#a3754d" }, 0.008));
      // scalloped capelet collar with a lace-up V
      add(shell(s, { yTop: 0.695, yBot: 0.6, rTop: 0.075, rBot: profileRadius(P_TUNIC, 0.6) + 0.03, arc: 2.62, thick: 0.02, lobes: 6, lobeDepth: 0.022 }, { color: acc, bottom: darker(acc, 0.05) }));
      for (const [y0, y1] of [
        [0.58, 0.535],
        [0.535, 0.49],
      ]) {
        for (const side of [-1, 1]) add(tube(s, [onFront(P_TUNIC, y0, 0.16 * side, 0.004), onFront(P_TUNIC, y1, -0.16 * side, 0.004)], 0.0065, { color: acc }, 4));
      }
      add(blob(s, 0.035, 0.07, 0.01, { pos: onFront(P_TUNIC, 0.55, 0, -0.002), rot: [-0.25, 0, 0], color: darker(outfit, 0.15) }, 8));
      legCol = tights;
      prof = P_TUNIC;
      break;
    }
    case "raincoat": {
      const pants = mixCol(outfit, INK, 0.45);
      add(lathe(s, P_COAT, { color: outfit, bottom: darker(outfit, 0.08) }, 22));
      // placket + big accent buttons
      add(blob(s, 0.014, 0.2, 0.01, { pos: onFront(P_COAT, 0.42, 0, -0.002), rot: [-0.18, 0, 0], color: darker(outfit, 0.12) }, 8));
      for (const y of [0.56, 0.45, 0.34]) add(ball(s, 0.022, { pos: onFront(P_COAT, y, 0.11, 0.006), color: acc, bottom: darker(acc, 0.12), scale: [1, 1, 0.6] }, 8));
      // pointy collar
      for (const side of [-1, 1]) add(blob(s, 0.075, 0.03, 0.045, { pos: [0.05 * side, 0.675, 0.065], rot: [0.45, 0.4 * side, -0.55 * side], color: outfit, bottom: darker(outfit, 0.06) }, 10));
      // pocket flaps
      for (const side of [-1, 1]) {
        const a = 0.62 * side;
        add(softBox(s, 0.08, 0.035, 0.02, { pos: onFront(P_COAT, 0.3, a, 0.004), rot: [-0.25, a, 0], color: darker(outfit, 0.1) }, 0.01));
      }
      // painted gloss streaks (flat, no outline)
      for (const [y, a, h] of [
        [0.48, -0.55, 0.07],
        [0.36, -0.6, 0.035],
        [0.27, 0.95, 0.05],
      ]) {
        kit.add("bodyFlat", blob(s, 0.013, h, 0.008, { pos: onFront(P_COAT, y, a, 0.001), rot: [-0.25, a, 0.12], color: lighter(outfit, 0.7) }, 6));
      }
      legCol = pants;
      boot = outfit;
      prof = P_COAT;
      break;
    }
  }

  /* ---- arms ---- */
  for (const side of [-1, 1] as const) {
    const g = side > 0 ? "armR" : "armL";
    const x = sh[0] * side;
    switch (L.style) {
      case "overalls":
        arm(kit, side, sh, 0.22, 0.042, skin, 0.052, skin, { sleeve: acc, sleeveR: 0.066 });
        break;
      case "dress":
        arm(kit, side, sh, 0.22, 0.04, skin, 0.052, skin, { sleeve: outfit, sleeveR: 0.082 });
        kit.add(g, torus(s, 0.058, 0.024, { pos: [x + 0.012 * side, 0.54, 0], rot: [0, 0, 0.12 * side], color: acc }, 14));
        break;
      case "tunic":
        arm(kit, side, sh, 0.22, 0.04, skin, 0.052, skin, { sleeve: outfit, sleeveR: 0.066 });
        kit.add(g, capsule(s, 0.15, 0.05, { pos: [x + 0.02 * side, 0.545, 0], color: outfit, bottom: darker(outfit, 0.06) }));
        kit.add(g, torus(s, 0.05, 0.022, { pos: [x + 0.026 * side, 0.49, 0], color: acc }, 14));
        break;
      case "hoodie":
      case "raincoat": {
        const cf = L.style === "hoodie" ? acc : lighter(outfit, 0.35);
        arm(kit, side, sh, 0.22, 0.047, outfit, 0.052, skin, { sleeve: outfit, sleeveR: 0.066 });
        kit.add(g, torus(s, 0.047, L.style === "hoodie" ? 0.024 : 0.03, { pos: [x + 0.026 * side, 0.455, 0.002], color: cf }, 14));
        break;
      }
    }
  }

  /* ---- legs + boots ---- */
  for (const side of [-1, 1] as const) {
    const x = 0.08 * side;
    const g = side > 0 ? "legR" : "legL";
    kit.add(g, capsule(s, 0.24, 0.058, { pos: [x, 0.2, 0], color: legCol, bottom: darker(legCol, 0.1) }));
    if (L.style === "raincoat") {
      // tall wellies
      kit.add(g, softCyl(s, 0.12, 0.066, 0.064, { pos: [x, 0.04, 0.0], color: boot, bottom: darker(boot, 0.12) }, 0.02, 14));
      kit.add(g, softBox(s, 0.12, 0.08, 0.17, { pos: [x, 0.045, 0.025], color: boot, bottom: darker(boot, 0.14) }, 0.04));
      kit.add(g, softBox(s, 0.125, 0.025, 0.175, { pos: [x, 0.014, 0.027], color: darker(boot, 0.25) }, 0.012));
      kit.add(g, torus(s, 0.066, 0.024, { pos: [x, 0.165, 0.0], color: lighter(boot, 0.3) }, 14));
    } else {
      kit.add(g, softBox(s, 0.115, 0.1, 0.16, { pos: [x, 0.06, 0.02], color: boot, bottom: darker(boot, 0.1) }, 0.045));
      kit.add(g, softBox(s, 0.12, 0.025, 0.165, { pos: [x, 0.014, 0.022], color: "#fff0dc" }, 0.012));
      kit.add(g, torus(s, 0.054, 0.022, { pos: [x, 0.11, 0.01], color: lighter(boot, 0.15) }, 14));
    }
    if (cuff) kit.add(g, torus(s, 0.06, 0.03, { pos: [x, 0.145, 0], color: cuff, bottom: darker(cuff, 0.06) }, 14));
    if (L.style === "dress") kit.add(g, torus(s, 0.058, 0.02, { pos: [x, 0.125, 0.005], color: "#fffaf4" }, 14));
  }

  /* ---- hood (worn up when there's no hat) ---- */
  if (hoodUp) playerHood(kit, outfit, acc);
  return prof;
}

/** Hood framing the face, accent lining and cat-ear nubs (head group). */
function playerHood(kit: Kit, outfit: string, acc: string) {
  const s = kit.scene;
  const HC: V3 = [0, 0.985, -0.07],
    HR: V3 = [0.345, 0.33, 0.33];
  kit.add("head", blob(s, HR[0], HR[1], HR[2], { pos: HC, color: outfit, bottom: darker(outfit, 0.08) }, 18));
  // lining rim around the face opening, following the hood surface
  const rim: V3[] = [];
  for (let i = 0; i <= 22; i++) {
    const ph = ((-128 + (256 * i) / 22) * Math.PI) / 180;
    const x = Math.sin(ph) * 0.255,
      y = 0.935 + Math.cos(ph) * 0.27;
    const q = 1 - (x / HR[0]) ** 2 - ((y - HC[1]) / HR[1]) ** 2;
    rim.push([x, y, HC[2] + HR[2] * Math.sqrt(Math.max(0.02, q)) + 0.004]);
  }
  kit.add("head", tube(s, rim, 0.034, { color: acc }, 8));
  // ear nubs
  for (const side of [-1, 1]) {
    const p = placeOn(HC, HR, 40 * side, 50, -0.03);
    kit.add(
      "head",
      group(
        [cone(s, 0.13, 0.075, { color: outfit, bottom: darker(outfit, 0.05), scale: [1, 1, 0.55] }, 10), cone(s, 0.08, 0.042, { pos: [0, 0.012, 0.03], color: acc, scale: [1, 1, 0.4] }, 8)],
        { pos: p.pos, rot: [-0.2, 0.3 * side, -0.5 * side] },
      ),
    );
  }
}

/** Cross-body satchel (the default bag). */
function satchel(kit: Kit, prof: [number, number][]) {
  const s = kit.scene;
  kit.add("body", tube(s, wrapBand(prof, 0.47, 0.72, 0.012, 30), 0.016, { color: "#c99a6b" }, 5));
  const bagCol = "#f2c98e";
  const a = -0.87;
  const r = Math.max(0.177, profileRadius(prof, 0.3) + 0.04);
  const bag = group(
    [
      softBox(s, 0.15, 0.12, 0.065, { color: bagCol, bottom: darker(bagCol, 0.08) }, 0.03),
      softBox(s, 0.155, 0.075, 0.03, { pos: [0, 0.028, 0.025], rot: [0.12, 0, 0], color: "#d9a36c" }, 0.014),
      heart(s, 0.05, "#f47a9a", { pos: [0, 0.0, 0.048] }),
    ],
    { pos: [Math.sin(a) * r, 0.3, Math.cos(a) * r], rot: [0, -0.55, 0.05] },
  );
  kit.add("body", bag);
}

function playerAccessory(kit: Kit, L: Required<PlayerLook>, prof: [number, number][], hoodUp: boolean, nodes: PlayerNodes) {
  const s = kit.scene;
  const c = L.accessoryColor;
  const R = (y: number) => profileRadius(prof, y);
  switch (L.accessory) {
    case "none":
      return;
    case "scarf": {
      kit.add("body", tube(s, wrapBand(prof, 0.665, 0, 0.022, 26), 0.036, { color: c, bottom: darker(c, 0.06) }, 8));
      kit.add("body", tube(s, wrapBand(prof, 0.625, 0.14, 0.03, 26), 0.033, { color: c, bottom: darker(c, 0.08) }, 8));
      const k = SCARF_PIVOT;
      const kz = Math.max(k[2], R(k[1]) + 0.03);
      kit.add("body", ball(s, 0.042, { pos: [k[0], k[1], kz], color: c, bottom: darker(c, 0.06) }, 10));
      // hanging tail end with stripes + fringe (springy)
      const len = 0.19;
      const tail: Mesh[] = [softBox(s, 0.078, len, 0.026, { pos: [0, -len / 2, 0], color: c, bottom: darker(c, 0.08) }, 0.012)];
      for (const y of [-0.1, -0.135]) tail.push(softBox(s, 0.081, 0.016, 0.028, { pos: [0, y, 0], color: lighter(c, 0.6) }, 0.007));
      for (let i = 0; i < 4; i++) tail.push(capsule(s, 0.04, 0.0075, { pos: [-0.027 + i * 0.018, -len - 0.012, 0], color: lighter(c, 0.25) }));
      const rx = -Math.atan2(Math.max(0.03, R(k[1] - len) + 0.03 - kz + 0.02), len);
      kit.add("scarfTail", group(tail, { pos: [k[0], k[1] - 0.01, kz + 0.008], rot: [rx, 0, 0.12] }));
      return;
    }
    case "bow": {
      // on the hood, high on the hair, or tucked by the ear when a hat is in the way
      const hatClear = L.hat === "none" || L.hat === "flower";
      const E: Ell = hoodUp ? { c: [0, 0.985, -0.07], r: [0.345, 0.33, 0.33] } : { c: [0, 0.975, -0.04], r: [0.31, 0.295, 0.295] };
      const p = hatClear ? placeOn(E.c, E.r, -40, 46, -0.01) : placeOn(E.c, E.r, -74, 8, -0.005);
      const tilt = hatClear ? 0.45 : 0.15;
      const parts: Mesh[] = [];
      for (const side of [-1, 1]) {
        parts.push(blob(s, 0.075, 0.056, 0.032, { pos: [0.068 * side, 0.004, 0], rot: [0, 0, 0.32 * side], color: c, bottom: darker(c, 0.1) }, 10));
        parts.push(ball(s, 0.022, { pos: [0.07 * side, 0.004, 0.026], color: darker(c, 0.12), scale: [1.2, 1, 0.5] }, 6));
        parts.push(blob(s, 0.02, 0.05, 0.014, { pos: [0.025 * side, -0.05, 0.004], rot: [0, 0, 0.35 * side], color: c }, 6));
      }
      parts.push(blob(s, 0.03, 0.032, 0.026, { pos: [0, 0, 0.012], color: lighter(c, 0.15) }, 8));
      kit.add("hat", group(parts, { pos: p.pos, rot: [p.rot[0] * 0.5, p.rot[1] * 0.6, tilt], scale: 1.05 }));
      return;
    }
    case "cape": {
      let rb = 0;
      for (let y = 0.36; y <= 0.66; y += 0.02) rb = Math.max(rb, R(y));
      const cape = shell(s, { yTop: 0.675, yBot: 0.35, rTop: R(0.66) + 0.04, rBot: rb + 0.085, arc: 1.12, thick: 0.022, lobes: 5, lobeDepth: 0.045, nu: 30, nv: 7 }, { color: c, bottom: darker(c, 0.12) });
      // puffy collar roll along the top edge
      const roll: V3[] = [];
      const rt = R(0.66) + 0.045;
      for (let i = 0; i <= 14; i++) {
        const a = -1.2 + (2.4 * i) / 14;
        roll.push([Math.sin(a) * rt, 0.678, -Math.cos(a) * rt]);
      }
      kit.add("cape", cape, tube(s, roll, 0.024, { color: lighter(c, 0.35) }, 6));
      // ties to a heart clasp under the chin (static on the body)
      const fz = R(0.635) + 0.025;
      for (const side of [-1, 1]) kit.add("body", tube(s, bez([Math.sin(1.1 * side) * rt, 0.675, -Math.cos(1.1) * rt], [0.085 * side, 0.665, fz * 0.75], [0.02 * side, 0.64, fz], 6), 0.013, { color: lighter(c, 0.35) }, 4));
      kit.add("body", heart(s, 0.05, "#ffd45e", { pos: [0, 0.635, fz + 0.006], rot: [-0.25, 0, 0] }));
      return;
    }
    case "backpack": {
      const by = 0.44;
      const bz = -(R(by) + 0.08);
      const parts: Mesh[] = [
        blob(s, 0.145, 0.15, 0.09, { color: c, bottom: darker(c, 0.12) }, 14),
        blob(s, 0.1, 0.075, 0.04, { pos: [0, -0.045, -0.07], color: lighter(c, 0.3), bottom: lighter(c, 0.15) }, 10),
        heart(s, 0.085, "#f47a9a", { pos: [0, -0.035, -0.112], rot: [0.15, Math.PI, 0] }),
      ];
      for (const side of [-1, 1]) {
        parts.push(ball(s, 0.042, { pos: [0.085 * side, 0.13, 0], color: c, scale: [1, 1, 0.7] }, 8));
        parts.push(ball(s, 0.022, { pos: [0.085 * side, 0.135, -0.022], color: lighter(c, 0.4), scale: [1, 1, 0.5] }, 6));
      }
      kit.add("body", group(parts, { pos: [0, by, bz], rot: [-0.08, 0, 0] }));
      // shoulder straps
      const strap = darker(c, 0.22);
      for (const side of [-1, 1]) {
        const x = 0.085 * side;
        const zf = (y: number, g: number) => Math.sqrt(Math.max(0, R(y) ** 2 - x * x)) + g;
        const pts: V3[] = [
          [x, 0.52, bz + 0.06],
          [x, 0.62, -zf(0.62, 0.02)],
          [x * 1.1, 0.7, -0.01],
          [x * 1.1, 0.64, zf(0.64, 0.016)],
          [x * 1.05, 0.52, zf(0.52, 0.014)],
          [x, 0.42, zf(0.42, 0.014)],
        ];
        kit.add("body", tube(s, pts, 0.016, { color: strap }, 5));
      }
      return;
    }
  }
}

function playerHat(kit: Kit, hat: HatId) {
  const s = kit.scene;
  switch (hat) {
    case "none":
      return;
    case "beret": {
      const c = "#f47a9a";
      kit.add("hat", blob(s, 0.26, 0.075, 0.25, { pos: [0.035, 1.245, -0.03], rot: [-0.12, 0, -0.22], color: c, bottom: darker(c, 0.12) }, 14));
      kit.add("hat", ball(s, 0.028, { pos: [0.02, 1.33, -0.03], color: darker(c, 0.1) }, 8));
      return;
    }
    case "flower": {
      kit.add("hat", flower(s, 0.085, "#f8b9cb", "#ffe066", { pos: [0.2, 1.17, 0.14], rot: [-0.3, 0.75, 0.2] }));
      kit.add("hat", flower(s, 0.05, "#c8b4f4", "#fff6e6", { pos: [0.25, 1.1, 0.04], rot: [-0.1, 1.1, 0.2] }));
      for (const [x, y, z, rz] of [
        [0.14, 1.12, 0.18, -0.9],
        [0.26, 1.2, 0.06, 0.6],
      ])
        kit.add("hat", blob(s, 0.055, 0.022, 0.02, { pos: [x, y, z], rot: [0, 0.8, rz], color: "#8fd27a" }, 6));
      return;
    }
    case "bunnyears": {
      const band: V3[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (-80 + (160 * i) / 12) * (Math.PI / 180);
        band.push([Math.sin(a) * 0.315, 0.975 + Math.cos(a) * 0.305, -0.0]);
      }
      kit.add("hat", tube(s, band, 0.02, { color: "#f8b9cb" }, 6));
      for (const side of [-1, 1]) {
        const rz = side > 0 ? -0.5 : 0.18;
        const ear = group(
          [
            blob(s, 0.065, 0.17, 0.04, { pos: [0, 0.15, 0], color: "#fffaf4", bottom: "#f3e6ee" }, 10),
            blob(s, 0.035, 0.12, 0.012, { pos: [0, 0.16, 0.032], color: "#f8b9cb" }, 8),
          ],
          { pos: [0.11 * side, 1.25, 0.0], rot: [-0.08, 0, rz] },
        );
        kit.add("hat", ear);
      }
      return;
    }
    case "strawhat": {
      const straw = "#f6dc9a";
      const hatG = group(
        [
          disc(s, 0.46, 0.03, { pos: [0, 0, 0], color: straw, bottom: darker(straw, 0.08) }, 26),
          softCyl(s, 0.15, 0.24, 0.285, { pos: [0, 0.01, 0], color: straw, bottom: darker(straw, 0.05) }, 0.07, 20),
          softCyl(s, 0.05, 0.287, 0.29, { pos: [0, 0.02, 0], color: "#f47a9a" }, 0.014, 20),
          flower(s, 0.05, "#fffdf8", "#ffe066", { pos: [0.2, 0.05, 0.2], rot: [0, 0.78, 0] }),
        ],
        { pos: [0, 1.12, -0.03], rot: [-0.2, 0, 0.06] },
      );
      kit.add("hat", hatG);
      return;
    }
    case "crown": {
      const gold = "#ffd45e";
      const parts: Mesh[] = [softCyl(s, 0.075, 0.13, 0.125, { color: gold, bottom: darker(gold, 0.1) }, 0.02, 18)];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push(cone(s, 0.085, 0.034, { pos: [Math.sin(a) * 0.112, 0.06, Math.cos(a) * 0.112], color: gold }, 8));
        parts.push(ball(s, 0.018, { pos: [Math.sin(a) * 0.112, 0.15, Math.cos(a) * 0.112], color: "#fff3b0" }, 6));
      }
      parts.push(ball(s, 0.026, { pos: [0, 0.035, 0.13], color: "#f47a9a", scale: [1, 1, 0.6] }, 8));
      parts.push(ball(s, 0.018, { pos: [0.075, 0.035, 0.108], color: "#7fd6cf", scale: [1, 1, 0.6] }, 6));
      parts.push(ball(s, 0.018, { pos: [-0.075, 0.035, 0.108], color: "#b48ce6", scale: [1, 1, 0.6] }, 6));
      kit.add("hat", group(parts, { pos: [0.02, 1.235, -0.02], rot: [-0.1, 0, -0.12], scale: 1.15 }));
      return;
    }
    case "chef": {
      kit.add("hat", group(chefToque(s, 0.14, 0.2, "#fffdf8"), { pos: [0.015, 1.215, -0.035], rot: [-0.14, 0, -0.1] }));
      return;
    }
  }
}

/** Chef's toque: band + puffy pleated crown. Origin at the band's base. */
function chefToque(s: Scene, r: number, h: number, white: ColorLike): Mesh[] {
  const sh = "#ece4f2";
  const bandH = h * 0.4;
  const parts: Mesh[] = [softCyl(s, bandH, r, r * 0.97, { color: white, bottom: sh }, r * 0.12, 18)];
  // pleat lines on the band
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    parts.push(capsule(s, bandH * 0.8, r * 0.05, { pos: [Math.sin(a) * r * 0.985, bandH * 0.5, Math.cos(a) * r * 0.985], color: "#f4eef8" }));
  }
  // puffs
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    parts.push(blob(s, r * 0.62, h * 0.38, r * 0.62, { pos: [Math.sin(a) * r * 0.62, bandH + h * 0.28, Math.cos(a) * r * 0.62], color: white, bottom: sh }, 10));
  }
  parts.push(blob(s, r * 0.85, h * 0.42, r * 0.85, { pos: [0, bandH + h * 0.4, 0], color: white, bottom: sh }, 12));
  return parts;
}

/* ------------------------------------------------------------------ */
/* NPCs                                                                */
/* ------------------------------------------------------------------ */

export function buildNpc(scene: Scene, id: NpcId): CharacterModel {
  switch (id) {
    case "mayor":
      return buildMayor(scene);
    case "granny":
      return buildGranny(scene);
    case "flora":
      return buildFlora(scene);
    case "stitch":
      return buildStitch(scene);
    case "hoot":
      return buildHoot(scene);
    case "pip":
      return buildPip(scene);
    case "bramble":
      return buildBramble(scene);
    case "marina":
      return buildMarina(scene);
    case "mocha":
      return buildMocha(scene);
  }
}

/* ---------- NPC helpers ---------- */

/** Lathe profile of an ellipsoid (rx radial, ry vertical) centred at cy. */
function ellProfile(cy: number, rx: number, ry: number, n = 12): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    out.push([Math.max(0, rx * Math.cos(a)), cy + ry * Math.sin(a)]);
  }
  return out;
}

/** Make a springy appendage node on the head/body and a kit group for it. */
function appendage(rig: Rig, kit: Kit, name: string, parent: "head" | "body", pivot: V3, outline = 0.015) {
  const n = rig.node(name, parent === "head" ? rig.head : rig.body, pivot);
  kit.def(name, n, { outline });
  return n;
}

/** Ring of glasses rims around both eyes, with a bridge. */
function glasses(kit: Kit, grp: string, f: Ell, yaw: number, pitch: number, r: number, th: number, color: ColorLike, out = 0.01) {
  const s = kit.scene;
  for (const side of [-1, 1]) {
    const p = placeOn(f.c, f.r, yaw * side, pitch, out);
    kit.add(grp, torus(s, r, th, { pos: p.pos, rot: [Math.PI / 2 + p.rot[0], p.rot[1], 0], color }, 18));
  }
  const br = surfCurve(f.c, f.r, [[-yaw + (r / f.r[0]) * 57, pitch + 2], [0, pitch + 5], [yaw - (r / f.r[0]) * 57, pitch + 2]], out + 0.004);
  kit.add(grp, tube(s, br, th * 0.45, { color }, 4));
}

function whiskers(kit: Kit, grp: string, m: Ell, color: ColorLike, len: number, n = 2) {
  const s = kit.scene;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const pitch = -5 + i * 14 - (n - 2) * 4;
      const a = placeOn(m.c, m.r, 62 * side, pitch, -0.004).pos;
      const b: V3 = [a[0] + side * len, a[1] + (i - (n - 1) / 2) * len * 0.3 + 0.006, a[2] - len * 0.18];
      const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.008, (a[2] + b[2]) / 2];
      kit.add(grp, tube(s, bez(a, mid, b, 4), 0.0045, { color }, 3, (u) => 1 - u * 0.6));
    }
  }
}

/* ---------- Mayor Bunbury: chubby lop-eared rabbit ---------- */

function buildMayor(scene: Scene): CharacterModel {
  const fur = "#f4e3d6",
    light = "#fffaf4",
    pink = "#f6a9c0",
    vest = "#b48ce6",
    plum = "#5e4a70";
  const H: Ell = { c: [0, 0.87, 0.01], r: [0.25, 0.225, 0.22] };
  const M: Ell = { c: [0, 0.8, 0.19], r: [0.085, 0.06, 0.06] };
  const E: EyeOpts = { yaw: 27, pitch: 3, rx: 0.029, ry: 0.041 };
  const body = ellProfile(0.4, 0.26, 0.27);
  const rig = new Rig(
    scene,
    {
      name: "mayor",
      height: 1.3,
      hipY: 0.28,
      neck: [0, 0.64, 0],
      headY: H.c[1],
      eyes: eyeCentre(H, E),
      mouth: mouthPivot(M, -22, 0.022),
      shoulder: [0.23, 0.54, 0],
      hip: [0.11, 0.2, 0],
      persona: { walkFreq: 1.35, runFreq: 2.2, stride: 0.5, bob: 0.045, breathe: 0.022, sway: 0.035, armRestZ: 0.32, hop: 0.2 },
    },
    11,
  );
  const kit = new Kit(scene, rig);
  stdGroups(kit, rig);
  const s = scene;

  // body: round belly, waistcoat, shirt front, bow tie
  kit.add("body", lathe(s, body, { color: fur, bottom: light }, 18));
  kit.add("body", lathe(s, ellProfile(0.45, 0.268, 0.205), { color: vest, bottom: darker(vest, 0.12) }, 18));
  kit.add("body", cone(s, 0.24, 0.1, { pos: [0, 0.655, 0.185], rot: [Math.PI - 0.32, 0, 0], color: light, scale: [1, 1, 0.45] }, 12));
  // pointed waistcoat hem tips
  for (const side of [-1, 1]) {
    for (const y of [0.44, 0.36]) {
      const x = 0.1 * side;
      kit.add("body", ball(s, 0.016, { pos: [x, y, Math.sqrt(Math.max(0, 1 - (x / 0.268) ** 2 - ((y - 0.45) / 0.205) ** 2)) * 0.268 + 0.006], color: "#ffd45e" }, 6));
    }
  }
  // pocket watch chain
  kit.add("body", tube(s, bez([0.1, 0.44, 0.24], [0.15, 0.37, 0.24], [0.2, 0.42, 0.18], 6), 0.007, { color: "#ffd45e" }, 4));
  // bow tie
  for (const side of [-1, 1]) kit.add("body", blob(s, 0.052, 0.036, 0.024, { pos: [0.048 * side, 0.645, 0.205], rot: [0.2, 0, -0.35 * side], color: "#f0727a" }, 8));
  kit.add("body", ball(s, 0.024, { pos: [0, 0.645, 0.222], color: darker("#f0727a", 0.1) }, 8));
  // tail puff
  kit.add("body", ball(s, 0.075, { pos: [0, 0.24, -0.23], color: light }, 10));

  // head
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: fur, bottom: darker(fur, 0.04) }, 16));
  kit.add("head", blob(s, M.r[0], M.r[1], M.r[2], { pos: M.c, color: light }, 12));
  const nz = placeOn(M.c, M.r, 0, 38, -0.004);
  kit.add("head", blob(s, 0.022, 0.016, 0.015, { pos: nz.pos, rot: nz.rot, color: "#f47a9a" }, 8));
  const th = placeOn(M.c, M.r, 0, -40, -0.008);
  kit.add("head", softBox(s, 0.03, 0.026, 0.012, { pos: th.pos, rot: th.rot, color: "#ffffff" }, 0.006));
  addEyes(kit, "eyes", H, E);
  cheeks(kit, "face", H, 46, -12, 0.042, 0.026);
  wMouth(kit, "face", M, -10, 22, 18, 0.006);
  openMouth(kit, M, -22, 0.03, 0.022);
  // monocle on the right eye + chain
  const mono = placeOn(H.c, H.r, E.yaw, E.pitch, 0.012);
  kit.add("face", torus(s, 0.05, 0.009, { pos: mono.pos, rot: [Math.PI / 2 + mono.rot[0], mono.rot[1], 0], color: "#ffd45e" }, 18));

  // top hat (tilted jauntily)
  kit.add(
    "head",
    group(
      [
        disc(s, 0.125, 0.022, { color: plum }, 18),
        softCyl(s, 0.17, 0.088, 0.082, { color: plum, bottom: darker(plum, 0.1) }, 0.02, 16),
        softCyl(s, 0.035, 0.086, 0.086, { pos: [0, 0.018, 0], color: "#f47a9a" }, 0.008, 16),
        flower(s, 0.03, "#fff6e6", "#ffd45e", { pos: [0.065, 0.04, 0.06], rot: [0, 0.8, 0] }),
      ],
      { pos: [0.03, 1.075, -0.02], rot: [-0.08, 0, -0.17] },
    ),
  );

  // lop ears
  for (const side of [-1, 1] as const) {
    const name = side > 0 ? "earR" : "earL";
    const n = appendage(rig, kit, name, "head", [0.15 * side, 1.04, -0.02]);
    kit.add(
      name,
      group(
        [
          blob(s, 0.078, 0.21, 0.045, { pos: [0.07 * side, -0.15, 0], color: fur, bottom: darker(fur, 0.06) }, 12),
          blob(s, 0.047, 0.15, 0.012, { pos: [0.07 * side, -0.16, 0.037], color: pink }, 8),
          blob(s, 0.075, 0.055, 0.05, { pos: [0.02 * side, 0.0, 0], color: fur }, 8),
        ],
        { pos: [0.15 * side, 1.04, 0.0], rot: [0.08, 0.3 * side, 0.3 * side] },
      ),
    );
    rig.addSecondary({ node: n, axis: "z", k: 70, d: 5, gy: -0.01 * side, gyaw: -0.12, min: -0.4, max: 0.4 });
    rig.addSecondary({ node: n, axis: "x", k: 60, d: 5, gy: 0.008, gspeed: 0.25, min: -0.3, max: 0.6 });
  }

  // arms (fur with shirt cuffs) & feet
  for (const side of [-1, 1] as const) {
    arm(kit, side, [0.23, 0.54, 0], 0.17, 0.052, light, 0.058, fur, { sleeve: light, sleeveR: 0.07 });
    leg(kit, side, [0.11, 0.2, 0], 0.062, fur, { rx: 0.082, ry: 0.05, rz: 0.13, color: light, z: 0.05 });
  }
  kit.build();
  return rig;
}

/* ---------- Granny Pom: fluffy sheep grandma ---------- */

function buildGranny(scene: Scene): CharacterModel {
  const wool = "#fffaf5",
    woolSh = "#eadff6",
    face = "#f7ddd0",
    hoof = "#8f7894",
    apron = "#cdb9f0";
  const H: Ell = { c: [0, 0.88, 0.03], r: [0.21, 0.205, 0.195] };
  const E: EyeOpts = { yaw: 24, pitch: -5, rx: 0.025, ry: 0.034 };
  const rig = new Rig(
    scene,
    {
      name: "granny",
      height: 1.22,
      hipY: 0.25,
      neck: [0, 0.68, 0],
      headY: H.c[1],
      eyes: eyeCentre(H, E),
      mouth: mouthPivot(H, -32, 0.022),
      shoulder: [0.25, 0.52, 0],
      hip: [0.1, 0.17, 0],
      persona: { walkFreq: 1.2, runFreq: 2.0, stride: 0.42, armSwing: 0.5, bob: 0.03, breathRate: 1.8, sway: 0.03, hop: 0.14, glance: 0.3, armRestZ: 0.3 },
    },
    23,
  );
  const kit = new Kit(scene, rig);
  stdGroups(kit, rig);
  const s = scene;
  const R = (seed: number) => {
    let a = seed;
    return () => ((a = (a * 16807) % 2147483647) / 2147483647);
  };

  // woolly body: core + clustered puffs
  const core = ellProfile(0.41, 0.26, 0.25);
  kit.add("body", lathe(s, core, { color: wool, bottom: woolSh }, 16));
  const rr = R(7);
  for (let i = 0; i < 26; i++) {
    const yaw = rr() * 360 - 180;
    const pitch = -55 + rr() * 95;
    if (Math.abs(yaw) < 48 && pitch < 50) continue; // leave room for the apron
    const p = placeOn([0, 0.41, 0], [0.26, 0.25, 0.26], yaw, pitch, -0.03);
    const r = 0.085 + rr() * 0.035;
    kit.add("body", ball(s, r, { pos: p.pos, color: wool, bottom: woolSh }, 8));
  }
  // apron with ruffle, bib & heart pocket
  kit.add("body", blob(s, 0.2, 0.2, 0.07, { pos: [0, 0.37, 0.215], rot: [-0.1, 0, 0], color: apron, bottom: darker(apron, 0.1) }, 14));
  kit.add("body", softBox(s, 0.17, 0.11, 0.04, { pos: [0, 0.54, 0.22], rot: [-0.32, 0, 0], color: apron }, 0.03));
  for (let i = 0; i < 7; i++) {
    const a = (-60 + i * 20) * (Math.PI / 180);
    kit.add("body", ball(s, 0.03, { pos: [Math.sin(a) * 0.19, 0.19 + (1 - Math.cos(a)) * 0.04, 0.215 + Math.cos(a) * 0.05], color: "#fffdf8" }, 6));
  }
  kit.add("body", softBox(s, 0.11, 0.08, 0.03, { pos: [0, 0.34, 0.28], rot: [-0.1, 0, 0], color: lighter(apron, 0.35) }, 0.014));
  kit.add("body", heart(s, 0.045, "#f47a9a", { pos: [0, 0.345, 0.298], rot: [-0.1, 0, 0] }));
  kit.add("body", ball(s, 0.07, { pos: [0, 0.3, -0.27], color: wool }, 8));

  // head: face, wool perm + bun
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: face, bottom: darker(face, 0.04) }, 16));
  const perm: [number, number, number][] = [
    [0, 50, 0.085], [-28, 44, 0.08], [28, 44, 0.08], [-52, 32, 0.08], [52, 32, 0.08], [-75, 15, 0.08], [75, 15, 0.08],
    [-100, 30, 0.09], [100, 30, 0.09], [-140, 30, 0.1], [140, 30, 0.1], [180, 30, 0.1], [0, 82, 0.1], [-60, 70, 0.1], [60, 70, 0.1],
    [-120, 0, 0.09], [120, 0, 0.09], [180, -10, 0.1], [-150, -20, 0.08], [150, -20, 0.08],
  ];
  for (const [yw, pt, r] of perm) {
    const p = placeOn(H.c, H.r, yw, pt, -0.035);
    kit.add("head", ball(s, r, { pos: p.pos, color: wool, bottom: woolSh }, 8));
  }
  kit.add("head", ball(s, 0.1, { pos: [0, 1.16, -0.05], color: wool, bottom: woolSh }, 10));
  kit.add("head", flower(s, 0.04, "#f8b9cb", "#ffe066", { pos: [0.09, 1.17, 0.02], rot: [-0.3, 0.5, 0] }));
  const nz = placeOn(H.c, H.r, 0, -20, -0.006);
  kit.add("head", blob(s, 0.026, 0.017, 0.016, { pos: nz.pos, rot: nz.rot, color: "#f39ab1" }, 8));
  addEyes(kit, "eyes", H, E);
  cheeks(kit, "face", H, 44, -18, 0.042, 0.026);
  smile(kit, "face", H, -30, 9, 3, 0.0065);
  openMouth(kit, H, -32, 0.028, 0.022);
  glasses(kit, "face", H, E.yaw, E.pitch, 0.048, 0.01, "#9d7cc4", 0.014);
  // glasses chain

  // floppy ears
  for (const side of [-1, 1] as const) {
    const name = side > 0 ? "earR" : "earL";
    const piv: V3 = [0.19 * side, 0.92, 0.0];
    const n = appendage(rig, kit, name, "head", piv);
    kit.add(
      name,
      group(
        [
          blob(s, 0.1, 0.042, 0.055, { pos: [0.08 * side, 0, 0], color: face, bottom: darker(face, 0.06) }, 10),
          blob(s, 0.065, 0.025, 0.01, { pos: [0.085 * side, 0.004, 0.046], color: "#f6b1c3" }, 8),
        ],
        { pos: piv, rot: [0, -0.35 * side, -0.45 * side] },
      ),
    );
    rig.addSecondary({ node: n, axis: "z", k: 55, d: 4.5, gy: 0.012 * side, gyaw: 0.1, twitch: 0.08, twitchAmp: 3, min: -0.5, max: 0.5 });
  }

  for (const side of [-1, 1] as const) {
    arm(kit, side, [0.25, 0.52, 0], 0.16, 0.042, face, 0.048, hoof, { sleeve: wool, sleeveR: 0.08 });
    leg(kit, side, [0.1, 0.17, 0], 0.045, face, { rx: 0.06, ry: 0.045, rz: 0.075, color: hoof, z: 0.02 });
  }
  kit.build();
  return rig;
}

/* ---------- Flora: gentle deer florist ---------- */

function buildFlora(scene: Scene): CharacterModel {
  const fur = "#e9b68d",
    light = "#fff3e4",
    hoof = "#8a6266",
    dress = "#bfe9d6",
    apron = "#f8b9cb";
  const H: Ell = { c: [0, 1.04, 0.0], r: [0.19, 0.185, 0.18] };
  const M: Ell = { c: [0, 0.975, 0.16], r: [0.075, 0.065, 0.1] };
  const E: EyeOpts = { yaw: 31, pitch: 3, rx: 0.027, ry: 0.039, lash: true };
  const dressP: [number, number][] = [
    [0, 0.3],
    [0.2, 0.305],
    [0.215, 0.34],
    [0.175, 0.48],
    [0.135, 0.6],
    [0.115, 0.7],
    [0.075, 0.77],
    [0, 0.785],
  ];
  const rig = new Rig(
    scene,
    {
      name: "flora",
      height: 1.34,
      hipY: 0.45,
      neck: [0, 0.8, 0],
      headY: H.c[1],
      eyes: eyeCentre(H, E),
      mouth: mouthPivot(M, -28, 0.02),
      shoulder: [0.12, 0.72, 0],
      hip: [0.075, 0.42, 0],
      persona: { walkFreq: 1.35, runFreq: 2.2, stride: 0.5, armSwing: 0.6, sway: 0.03, headTilt: 0.09, armRestZ: 0.18 },
    },
    31,
  );
  const kit = new Kit(scene, rig);
  stdGroups(kit, rig);
  const s = scene;

  // dress + apron
  kit.add("body", lathe(s, dressP, { color: dress, bottom: darker(dress, 0.1) }, 20));
  kit.add("body", softBox(s, 0.22, 0.2, 0.03, { pos: [0, 0.47, 0.17], rot: [-0.3, 0, 0], color: apron, bottom: darker(apron, 0.08) }, 0.06));
  for (let i = 0; i < 6; i++) kit.add("body", ball(s, 0.022, { pos: [-0.09 + i * 0.036, 0.375, 0.205], color: "#fffdf8" }, 6));
  kit.add("body", tube(s, wrapBand(dressP, 0.6, 0, 0.008), 0.016, { color: apron }, 5));
  kit.add("body", blob(s, 0.06, 0.04, 0.03, { pos: [0, 0.6, -0.14], color: apron }, 8));
  for (const side of [-1, 1]) kit.add("body", blob(s, 0.05, 0.022, 0.02, { pos: [0.04 * side, 0.57, -0.15], rot: [0, 0, -0.8 * side], color: apron }, 6));
  kit.add("body", softBox(s, 0.08, 0.06, 0.02, { pos: [0.05, 0.42, 0.205], rot: [-0.3, 0, 0], color: lighter(apron, 0.4) }, 0.01));
  kit.add("body", flower(s, 0.026, "#ffe066", "#ffffff", { pos: [0.05, 0.47, 0.205], rot: [-0.3, 0, 0] }));
  // neck + tail
  kit.add("body", capsule(s, 0.2, 0.062, { pos: [0, 0.81, -0.01], color: fur }));
  kit.add("body", blob(s, 0.045, 0.06, 0.04, { pos: [0, 0.48, -0.21], rot: [-0.5, 0, 0], color: "#ffffff" }, 8));

  // head
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: fur, bottom: darker(fur, 0.04) }, 16));
  kit.add("head", blob(s, M.r[0], M.r[1], M.r[2], { pos: M.c, color: light }, 12));
  const nz = placeOn(M.c, M.r, 0, 30, -0.008);
  kit.add("head", blob(s, 0.028, 0.02, 0.02, { pos: nz.pos, rot: nz.rot, color: "#5e4656" }, 8));
  // fawn spots on the forehead
  for (const [yw, pt, r] of [
    [-14, 38, 0.016],
    [12, 42, 0.013],
    [0, 52, 0.011],
  ] as [number, number, number][]) {
    const p = placeOn(H.c, H.r, yw, pt, -0.004);
    kit.add("face", blob(s, r, r, 0.006, { pos: p.pos, rot: p.rot, color: "#fff6ea" }, 6));
  }
  addEyes(kit, "eyes", H, E);
  cheeks(kit, "face", H, 50, -14, 0.035, 0.022);
  smile(kit, "face", M, -18, 22, 12, 0.0055);
  openMouth(kit, M, -28, 0.026, 0.02);

  // flower crown
  const crownC: V3 = [0, 1.165, -0.02];
  const crownR = 0.155;
  const crown: Mesh[] = [torus(s, crownR * 2 * 0.5, 0.03, { color: "#7cc78a" }, 20)];
  const fc = ["#f8b9cb", "#ffe066", "#fffdf8", "#c8b4f4", "#ffb5a0", "#f8b9cb", "#ffe066"];
  for (let i = 0; i < 7; i++) {
    const a = (-105 + i * 35) * (Math.PI / 180);
    const x = Math.sin(a) * crownR,
      z = Math.cos(a) * crownR;
    const r = i === 3 ? 0.045 : 0.036;
    crown.push(flower(s, r, fc[i], i % 2 ? "#fff6e6" : "#ffd45e", { pos: [x, 0.012, z], rot: [-0.5, a, 0] }));
    const la = a + 0.3;
    crown.push(blob(s, 0.03, 0.012, 0.016, { pos: [Math.sin(la) * crownR * 1.05, -0.012, Math.cos(la) * crownR * 1.05], rot: [0, la + 1.2, 0.3], color: "#8fd27a" }, 6));
  }
  kit.add("head", group(crown, { pos: crownC, rot: [-0.32, 0, 0.05] }));

  // ears
  for (const side of [-1, 1] as const) {
    const name = side > 0 ? "earR" : "earL";
    const piv: V3 = [0.13 * side, 1.14, -0.03];
    const n = appendage(rig, kit, name, "head", piv);
    kit.add(
      name,
      group(
        [
          blob(s, 0.12, 0.05, 0.03, { pos: [0.1 * side, 0, 0], color: fur, bottom: darker(fur, 0.06) }, 10),
          blob(s, 0.08, 0.03, 0.01, { pos: [0.11 * side, 0.003, 0.024], color: "#f8b9cb" }, 8),
        ],
        { pos: piv, rot: [0.0, 0.25 * side, 0.2 * side] },
      ),
    );
    rig.addSecondary({ node: n, axis: "z", k: 80, d: 5, gy: -0.01 * side, gyaw: 0.1, twitch: 0.15, twitchAmp: 5, min: -0.5, max: 0.5 });
  }

  for (const side of [-1, 1] as const) {
    arm(kit, side, [0.12, 0.72, 0], 0.22, 0.036, fur, 0.042, light, { sleeve: dress, sleeveR: 0.058 });
    leg(kit, side, [0.075, 0.42, 0], 0.04, fur, { rx: 0.048, ry: 0.05, rz: 0.06, color: hoof, z: 0.01 });
  }
  kit.build();
  return rig;
}

/* ---------- Stitch: raccoon tailor ---------- */

function buildStitch(scene: Scene): CharacterModel {
  const fur = "#aaa6c9",
    light = "#f5f1fb",
    dark = "#62587a",
    smock = "#7fd6cf",
    tape = "#ffe066";
  const H: Ell = { c: [0, 0.83, 0.0], r: [0.245, 0.21, 0.205] };
  const M: Ell = { c: [0, 0.775, 0.17], r: [0.085, 0.06, 0.06] };
  const E: EyeOpts = { yaw: 27, pitch: 3, rx: 0.026, ry: 0.036, white: "#fffaf0", whiteScale: 1.5, out: 0.016 };
  const bodyP = ellProfile(0.41, 0.2, 0.23);
  const rig = new Rig(
    scene,
    {
      name: "stitch",
      height: 1.15,
      hipY: 0.24,
      neck: [0, 0.62, 0],
      headY: H.c[1],
      eyes: eyeCentre(H, E),
      mouth: mouthPivot(M, -24, 0.02),
      shoulder: [0.18, 0.54, 0],
      hip: [0.09, 0.2, 0],
      persona: { walkFreq: 1.6, glance: 0.6, headTilt: 0.07, armRestZ: 0.2 },
    },
    41,
  );
  const kit = new Kit(scene, rig);
  stdGroups(kit, rig);
  const s = scene;

  // body + belly + half-apron with scissors
  kit.add("body", lathe(s, bodyP, { color: fur, bottom: darker(fur, 0.06) }, 18));
  kit.add("body", blob(s, 0.12, 0.15, 0.05, { pos: [0, 0.44, 0.155], color: light }, 10));
  kit.add("body", tube(s, wrapBand(bodyP, 0.36, 0, 0.006), 0.016, { color: darker(smock, 0.1) }, 5));
  kit.add("body", softBox(s, 0.26, 0.17, 0.03, { pos: [0, 0.28, 0.175], rot: [0.12, 0, 0], color: smock, bottom: darker(smock, 0.1) }, 0.06));
  kit.add("body", softBox(s, 0.09, 0.07, 0.025, { pos: [0.07, 0.25, 0.215], rot: [0.15, 0, 0], color: lighter(smock, 0.3) }, 0.012));
  for (const side of [-1, 1]) kit.add("body", torus(s, 0.014, 0.008, { pos: [0.06 + 0.02 * side, 0.31, 0.21], rot: [Math.PI / 2, 0, 0], color: "#f47a9a" }, 10));
  // measuring tape around the neck
  kit.add("body", tube(s, wrapBand(bodyP, 0.6, 0, 0.012, 24), 0.016, { color: tape }, 5));
  for (const side of [-1, 1]) {
    const len = side > 0 ? 0.42 : 0.47;
    kit.add("body", tube(s, bez([0.065 * side, 0.6, 0.12], [0.095 * side, 0.52, 0.19], [0.085 * side, len, 0.205], 6), 0.015, { color: tape }, 5));
    kit.add("body", softBox(s, 0.035, 0.022, 0.02, { pos: [0.085 * side, len - 0.012, 0.205], color: "#f0727a" }, 0.006));
  }

  // head: mask, white cheeks & brow stripe
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: fur, bottom: darker(fur, 0.04) }, 16));
  for (const side of [-1, 1]) {
    const cp = placeOn(H.c, H.r, 72 * side, -22, -0.03);
    kit.add("head", blob(s, 0.085, 0.07, 0.06, { pos: cp.pos, rot: [0, cp.rot[1], 0.35 * side], color: light }, 10));
    const tuft = placeOn(H.c, H.r, 92 * side, -30, -0.02);
    kit.add("head", blob(s, 0.06, 0.035, 0.035, { pos: tuft.pos, rot: [0, 0, -0.5 * side], color: light }, 8));
    const mk = placeOn(H.c, H.r, 30 * side, 2, -0.012);
    kit.add("head", blob(s, 0.085, 0.052, 0.03, { pos: mk.pos, rot: [mk.rot[0], mk.rot[1], -0.22 * side], color: dark }, 10));
  }
  const br = placeOn(H.c, H.r, 0, 22, -0.006);
  kit.add("head", blob(s, 0.03, 0.065, 0.02, { pos: br.pos, rot: br.rot, color: light }, 8));
  kit.add("head", blob(s, M.r[0], M.r[1], M.r[2], { pos: M.c, color: light }, 12));
  const nz = placeOn(M.c, M.r, 0, 34, -0.004);
  kit.add("head", blob(s, 0.028, 0.019, 0.018, { pos: nz.pos, rot: nz.rot, color: "#3b3043" }, 8));
  addEyes(kit, "eyes", H, E);
  cheeks(kit, "face", H, 50, -16, 0.034, 0.022);
  wMouth(kit, "face", M, -14, 22, 18, 0.0055);
  openMouth(kit, M, -24, 0.026, 0.02);

  // ears
  for (const side of [-1, 1] as const) {
    const name = side > 0 ? "earR" : "earL";
    const piv: V3 = [0.15 * side, 0.98, -0.02];
    const n = appendage(rig, kit, name, "head", piv);
    kit.add(
      name,
      group(
        [
          blob(s, 0.07, 0.08, 0.03, { pos: [0, 0.05, 0], color: light }, 10),
          blob(s, 0.055, 0.065, 0.03, { pos: [0, 0.045, 0.006], color: fur }, 10),
          blob(s, 0.035, 0.045, 0.01, { pos: [0, 0.042, 0.03], color: dark }, 8),
        ],
        { pos: piv, rot: [-0.1, 0.15 * side, -0.32 * side] },
      ),
    );
    rig.addSecondary({ node: n, axis: "z", k: 120, d: 7, gy: 0.006 * side, twitch: 0.12, twitchAmp: 4, min: -0.4, max: 0.4 });
  }

  // big striped tail
  const tailN = appendage(rig, kit, "tail", "body", [0, 0.26, -0.15]);
  const tpts = bez([0, 0.26, -0.15], [0, 0.26, -0.48], [0, 0.62, -0.46], 6);
  for (let i = 0; i < tpts.length; i++) {
    const u = i / (tpts.length - 1);
    const r = 0.07 + Math.sin(u * Math.PI) * 0.035 - u * 0.02;
    kit.add("tail", ball(s, r, { pos: tpts[i], color: i % 2 === 1 || i === tpts.length - 1 ? dark : fur }, 10));
  }
  rig.addSecondary({ node: tailN, axis: "y", k: 40, d: 3, wagAmp: 0.18, wagFreq: 0.7, gyaw: -0.2, min: -0.6, max: 0.6 });
  rig.addSecondary({ node: tailN, axis: "x", k: 50, d: 4, gy: 0.008, gspeed: 0.25, min: -0.3, max: 0.5 });

  for (const side of [-1, 1] as const) {
    arm(kit, side, [0.18, 0.54, 0], 0.17, 0.045, fur, 0.05, dark);
    leg(kit, side, [0.09, 0.2, 0], 0.052, dark, { rx: 0.062, ry: 0.045, rz: 0.085, color: dark, z: 0.03 });
  }
  // pincushion on the left wrist
  const pc: V3 = [-0.205, 0.41, 0.045];
  kit.add("armL", ball(s, 0.042, { pos: pc, color: "#f0727a", scale: [1, 0.8, 1] }, 10));
  for (const [dx, dz, c] of [
    [0.0, 0.0, "#ffe066"],
    [0.025, 0.015, "#8fc3ea"],
    [-0.02, 0.02, "#ffffff"],
  ] as [number, number, string][]) {
    kit.add("armL", ball(s, 0.011, { pos: [pc[0] + dx, pc[1] + 0.045, pc[2] + dz], color: c }, 6));
  }
  kit.build();
  return rig;
}

/* ---------- Professor Hoot: owl researcher ---------- */

function buildHoot(scene: Scene): CharacterModel {
  const feather = "#bca6e0",
    belly = "#f8f2ff",
    wing = "#9f88cf",
    beak = "#ffb766",
    disc_ = "#fff6ec",
    rim = "#d9984a",
    scarf = "#ff9f8f";
  const H: Ell = { c: [0, 0.78, 0.0], r: [0.28, 0.24, 0.235] };
  const E: EyeOpts = { yaw: 25, pitch: 0, rx: 0.038, ry: 0.044 };
  const bodyP = ellProfile(0.36, 0.26, 0.3);
  const rig = new Rig(
    scene,
    {
      name: "hoot",
      height: 1.1,
      hipY: 0.2,
      neck: [0, 0.6, 0],
      headY: H.c[1],
      eyes: eyeCentre(H, E),
      mouth: mouthPivot(H, -27, 0.018),
      shoulder: [0.245, 0.47, 0],
      hip: [0.1, 0.1, 0],
      persona: { walkFreq: 1.9, runFreq: 2.8, stride: 0.38, armSwing: 0.35, sway: 0.05, headTilt: 0.15, glance: 0.95, armRestZ: 0.12, hop: 0.22 },
    },
    53,
  );
  const kit = new Kit(scene, rig);
  stdGroups(kit, rig);
  const s = scene;

  // round body, pale belly with feather chevrons
  kit.add("body", lathe(s, bodyP, { color: feather, bottom: darker(feather, 0.06) }, 18));
  kit.add("body", blob(s, 0.19, 0.22, 0.07, { pos: [0, 0.32, 0.2], rot: [0.1, 0, 0], color: belly }, 12));
  // scarf
  kit.add("body", tube(s, wrapBand(ellProfile(0.36, 0.26, 0.3), 0.6, 0.0, 0.03, 24), 0.036, { color: scarf }, 7));
  kit.add("body", softBox(s, 0.07, 0.17, 0.03, { pos: [0.09, 0.5, 0.215], rot: [-0.3, 0, 0.18], color: scarf, bottom: darker(scarf, 0.06) }, 0.014));
  for (const y of [0.53, 0.47]) kit.add("body", softBox(s, 0.074, 0.018, 0.032, { pos: [0.09 + (0.5 - y) * 0.18, y, 0.217 + (y - 0.5) * 0.3], rot: [-0.3, 0, 0.18], color: "#fff6e6" }, 0.006));

  // head with facial disc, glasses, beak
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: feather, bottom: darker(feather, 0.04) }, 16));
  for (const side of [-1, 1]) {
    const p = placeOn(H.c, H.r, 25 * side, -2, -0.035);
    kit.add("head", blob(s, 0.11, 0.115, 0.05, { pos: p.pos, rot: p.rot, color: disc_ }, 12));
    const brow = placeOn(H.c, H.r, 25 * side, 26, -0.01);
    kit.add("head", blob(s, 0.08, 0.025, 0.03, { pos: brow.pos, rot: [brow.rot[0], brow.rot[1], -0.25 * side], color: wing }, 8));
  }
  const bk = placeOn(H.c, H.r, 0, -12, -0.012);
  kit.add("head", cone(s, 0.075, 0.032, { pos: bk.pos, rot: [Math.PI / 2 + 0.5, 0, 0], color: beak, bottom: darker(beak, 0.1) }, 10));
  glasses(kit, "head", H, E.yaw, E.pitch, 0.072, 0.018, rim, 0.022);
  addEyes(kit, "eyes", H, E);
  cheeks(kit, "face", H, 47, -20, 0.036, 0.022);
  openMouth(kit, H, -27, 0.026, 0.018);

  // ear tufts
  for (const side of [-1, 1] as const) {
    const name = side > 0 ? "earR" : "earL";
    const piv: V3 = [0.17 * side, 0.97, -0.02];
    const n = appendage(rig, kit, name, "head", piv);
    kit.add(name, group([cone(s, 0.13, 0.05, { color: wing, bottom: feather }, 10)], { pos: piv, rot: [-0.15, 0, -0.45 * side] }));
    rig.addSecondary({ node: n, axis: "z", k: 110, d: 6, gy: 0.007 * side, twitch: 0.1, twitchAmp: 3, min: -0.4, max: 0.4 });
  }

  // wings + notebook
  for (const side of [-1, 1] as const) {
    const g = side > 0 ? "armR" : "armL";
    kit.add(
      g,
      group(
        [
          blob(s, 0.055, 0.17, 0.12, { pos: [0, -0.13, 0], color: wing, bottom: darker(wing, 0.1) }, 12),
          blob(s, 0.035, 0.06, 0.04, { pos: [0.005 * side, -0.28, 0.04], color: darker(wing, 0.1) }, 8),
          blob(s, 0.035, 0.06, 0.04, { pos: [0.005 * side, -0.28, -0.03], color: darker(wing, 0.1) }, 8),
        ],
        { pos: [0.245 * side, 0.47, 0], rot: [0, 0, 0.12 * side] },
      ),
    );
    kit.add(g === "armR" ? "legR" : "legL", blob(s, 0.075, 0.035, 0.085, { pos: [0.1 * side, 0.035, 0.05], color: beak, bottom: darker(beak, 0.12) }, 10));
    for (const dx of [-0.035, 0, 0.035]) kit.add(g === "armR" ? "legR" : "legL", ball(s, 0.024, { pos: [0.1 * side + dx, 0.025, 0.125], color: beak }, 6));
  }
  kit.add(
    "armL",
    group(
      [
        softBox(s, 0.03, 0.17, 0.13, { color: "#f8b9cb", bottom: darker("#f8b9cb", 0.08) }, 0.012),
        softBox(s, 0.034, 0.155, 0.11, { pos: [0.003, 0, 0.012], color: "#fffdf8" }, 0.008),
        heart(s, 0.035, "#f47a9a", { pos: [-0.018, 0.02, 0], rot: [0, -Math.PI / 2, 0] }),
      ],
      { pos: [-0.31, 0.28, 0.08], rot: [0.25, 0.25, 0.1] },
    ),
  );
  kit.build();
  return rig;
}

/* ---------- Pip: little mouse explorer ---------- */

function buildPip(scene: Scene): CharacterModel {
  const fur = "#d9c9d4",
    light = "#fbf4f7",
    pink = "#f7a8bd",
    shirt = "#a9d98f",
    pack = "#ffb766",
    kerchief = "#ff8f8a";
  const H: Ell = { c: [0, 0.64, 0.01], r: [0.22, 0.2, 0.195] };
  const M: Ell = { c: [0, 0.6, 0.17], r: [0.075, 0.056, 0.07] };
  const E: EyeOpts = { yaw: 27, pitch: 3, rx: 0.03, ry: 0.043 };
  const bodyP = ellProfile(0.3, 0.155, 0.19);
  const rig = new Rig(
    scene,
    {
      name: "pip",
      height: 0.98,
      hipY: 0.18,
      neck: [0, 0.46, 0],
      headY: H.c[1],
      eyes: eyeCentre(H, E),
      mouth: mouthPivot(M, -26, 0.02),
      shoulder: [0.14, 0.43, 0],
      hip: [0.07, 0.15, 0],
      persona: { walkFreq: 2.0, runFreq: 3.1, stride: 0.72, armSwing: 0.95, bob: 0.05, idleBounce: 0.012, hop: 0.34, glance: 0.6, breathRate: 3.2, headTilt: 0.08, armRestZ: 0.22 },
    },
    67,
  );
  const kit = new Kit(scene, rig);
  stdGroups(kit, rig);
  const s = scene;

  // body: explorer shirt, kerchief, backpack with bedroll
  kit.add("body", lathe(s, bodyP, { color: shirt, bottom: darker(shirt, 0.15) }, 16));
  kit.add("body", softBox(s, 0.06, 0.05, 0.02, { pos: [0.06, 0.33, 0.14], rot: [-0.15, 0.3, 0], color: lighter(shirt, 0.3) }, 0.01));
  kit.add("body", tube(s, wrapBand(bodyP, 0.455, 0, 0.012, 20), 0.022, { color: kerchief }, 6));
  kit.add("body", cone(s, 0.07, 0.055, { pos: [0, 0.47, 0.105], rot: [Math.PI - 0.3, 0, 0], color: kerchief, scale: [1, 1, 0.5] }, 8));
  kit.add("body", softBox(s, 0.2, 0.22, 0.11, { pos: [0, 0.31, -0.17], color: pack, bottom: darker(pack, 0.1) }, 0.045));
  kit.add("body", softBox(s, 0.205, 0.1, 0.04, { pos: [0, 0.37, -0.115], rot: [0.0, 0, 0], color: darker(pack, 0.08) }, 0.018));
  kit.add("body", softBox(s, 0.12, 0.08, 0.035, { pos: [0, 0.25, -0.24], color: "#ffe066" }, 0.016));
  kit.add("body", capsule(s, 0.26, 0.048, { pos: [0, 0.46, -0.17], rot: [0, 0, Math.PI / 2], color: "#8fc3ea" }));
  for (const side of [-1, 1]) {
    kit.add("body", tube(s, bez([0.075 * side, 0.45, -0.1], [0.1 * side, 0.48, 0.05], [0.09 * side, 0.36, 0.13], 6), 0.013, { color: darker(pack, 0.2) }, 4));
  }
  // tail
  const tailN = appendage(rig, kit, "tail", "body", [0, 0.17, -0.12], 0.01);
  const tp = [...bez([0, 0.17, -0.12], [0, 0.05, -0.32], [0, 0.18, -0.42], 6), ...bez([0, 0.18, -0.42], [0, 0.3, -0.48], [0.06, 0.3, -0.4], 5).slice(1)];
  kit.add("tail", tube(s, tp, 0.02, { color: pink }, 6, (u) => 1 - u * 0.55));
  rig.addSecondary({ node: tailN, axis: "y", k: 50, d: 3, wagAmp: 0.25, wagFreq: 1.3, gyaw: -0.3, min: -0.7, max: 0.7 });
  rig.addSecondary({ node: tailN, axis: "x", k: 60, d: 3.5, gy: 0.012, min: -0.4, max: 0.4 });

  // head
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: fur, bottom: darker(fur, 0.04) }, 16));
  kit.add("head", blob(s, M.r[0], M.r[1], M.r[2], { pos: M.c, color: light }, 12));
  const nz = placeOn(M.c, M.r, 0, 22, -0.006);
  kit.add("head", ball(s, 0.026, { pos: nz.pos, color: "#f47a9a" }, 8));
  // bandage on the left cheek
  const bd = placeOn(H.c, H.r, -46, -14, 0.002);
  kit.add(
    "head",
    group(
      [
        softBox(s, 0.085, 0.036, 0.012, { color: "#ffe8cc" }, 0.006),
        softBox(s, 0.03, 0.03, 0.012, { pos: [0, 0, 0.003], color: "#f3c9a0" }, 0.005),
      ],
      { pos: bd.pos, rot: [bd.rot[0], bd.rot[1], 0.5] },
    ),
  );
  addEyes(kit, "eyes", H, E);
  cheeks(kit, "face", H, 44, -16, 0.034, 0.022);
  wMouth(kit, "face", M, -16, 22, 18, 0.0055);
  openMouth(kit, M, -26, 0.026, 0.02);
  whiskers(kit, "face", M, "#9a879f", 0.09, 2);
  // tuft of hair
  kit.add("head", tube(s, bez([0, 0.83, 0.03], [0.0, 0.89, 0.08], [0.05, 0.88, 0.1], 6), 0.018, { color: fur }, 5, (u) => 1 - u * 0.7));

  // big round ears
  for (const side of [-1, 1] as const) {
    const name = side > 0 ? "earR" : "earL";
    const piv: V3 = [0.13 * side, 0.78, -0.02];
    const n = appendage(rig, kit, name, "head", piv);
    kit.add(
      name,
      group(
        [
          blob(s, 0.14, 0.135, 0.032, { pos: [0.02 * side, 0.1, 0], color: fur, bottom: darker(fur, 0.05) }, 14),
          blob(s, 0.1, 0.095, 0.01, { pos: [0.02 * side, 0.1, 0.026], color: pink }, 12),
        ],
        { pos: piv, rot: [-0.1, 0.3 * side, -0.38 * side] },
      ),
    );
    rig.addSecondary({ node: n, axis: "z", k: 70, d: 4, gy: 0.01 * side, gyaw: 0.15, twitch: 0.2, twitchAmp: 5, min: -0.5, max: 0.5 });
    rig.addSecondary({ node: n, axis: "x", k: 60, d: 4, gy: 0.006, gspeed: 0.3, min: -0.3, max: 0.5 });
  }

  for (const side of [-1, 1] as const) {
    arm(kit, side, [0.14, 0.43, 0], 0.13, 0.034, fur, 0.04, light, { sleeve: shirt, sleeveR: 0.05 });
    leg(kit, side, [0.07, 0.15, 0], 0.04, fur, { rx: 0.05, ry: 0.035, rz: 0.08, color: pink, z: 0.04 });
  }
  kit.build();
  return rig;
}

/* ---------- Bramble: big gentle bear carpenter ---------- */

function buildBramble(scene: Scene): CharacterModel {
  const fur = "#d3a47f",
    light = "#f8e4cc",
    shirt = "#ff9f8f",
    denim = "#8fb6e6",
    belt = "#a3754d",
    hat = "#ffd24d";
  const H: Ell = { c: [0, 1.33, 0.02], r: [0.32, 0.285, 0.28] };
  const M: Ell = { c: [0, 1.255, 0.21], r: [0.125, 0.085, 0.09] };
  const E: EyeOpts = { yaw: 25, pitch: 6, rx: 0.031, ry: 0.043 };
  const bodyP = ellProfile(0.68, 0.37, 0.43);
  const rig = new Rig(
    scene,
    {
      name: "bramble",
      height: 1.68,
      hipY: 0.42,
      neck: [0, 1.05, 0],
      headY: H.c[1],
      eyes: eyeCentre(H, E),
      mouth: mouthPivot(M, -24, 0.026),
      shoulder: [0.33, 0.96, 0],
      hip: [0.16, 0.32, 0],
      persona: { walkFreq: 1.15, runFreq: 1.9, stride: 0.45, armSwing: 0.55, bob: 0.05, sway: 0.02, breathe: 0.018, breathRate: 1.6, hop: 0.16, armRestZ: 0.2, glance: 0.35 },
    },
    79,
  );
  const kit = new Kit(scene, rig);
  stdGroups(kit, rig, 0.019);
  const s = scene;

  // shirt body + overalls
  kit.add("body", lathe(s, bodyP, { color: shirt, bottom: darker(shirt, 0.1) }, 20));
  const pants: [number, number][] = [
    [0, 0.24],
    [0.3, 0.255],
    [0.355, 0.33],
    [0.375, 0.48],
    [0.37, 0.62],
    [0, 0.62],
  ];
  kit.add("body", lathe(s, pants, { color: denim, bottom: darker(denim, 0.12) }, 20));
  kit.add("body", softBox(s, 0.3, 0.24, 0.06, { pos: [0, 0.76, 0.315], rot: [-0.3, 0, 0], color: denim }, 0.03));
  kit.add("body", softBox(s, 0.12, 0.07, 0.025, { pos: [0, 0.76, 0.345], rot: [-0.3, 0, 0], color: lighter(denim, 0.25) }, 0.01));
  kit.add("body", tube(s, [[0.0, 0.81, 0.36], [0.0, 0.84, 0.35]], 0.012, { color: "#ffd24d" }, 4));
  for (const side of [-1, 1]) {
    kit.add("body", tube(s, bez([0.12 * side, 0.85, 0.3], [0.17 * side, 1.02, 0.22], [0.2 * side, 1.08, -0.02], 6), 0.026, { color: denim }, 5));
    kit.add("body", ball(s, 0.026, { pos: [0.12 * side, 0.85, 0.335], color: "#ffd24d" }, 8));
  }
  // tool belt with pouches & hammer
  kit.add("body", tube(s, wrapBand(pants, 0.55, 0, 0.018, 30), 0.034, { color: belt }, 6));
  kit.add("body", softBox(s, 0.08, 0.07, 0.03, { pos: [0, 0.55, 0.405], color: "#ffd24d" }, 0.012));
  for (const side of [-1, 1]) {
    const a = 0.75 * side;
    kit.add("body", softBox(s, 0.14, 0.15, 0.07, { pos: [Math.sin(a) * 0.4, 0.47, Math.cos(a) * 0.4], rot: [0, a, 0], color: darker(belt, 0.05), bottom: darker(belt, 0.15) }, 0.025));
  }
  // pencils in the right pouch
  kit.add("body", softCyl(s, 0.12, 0.012, 0.012, { pos: [Math.sin(0.75) * 0.39 - 0.02, 0.5, Math.cos(0.75) * 0.39], color: "#ffe066" }, 0.004, 6));
  kit.add("body", softCyl(s, 0.1, 0.012, 0.012, { pos: [Math.sin(0.75) * 0.39 + 0.025, 0.5, Math.cos(0.75) * 0.39 - 0.02], color: "#8fc3ea" }, 0.004, 6));
  // hammer on the left hip
  kit.add(
    "body",
    group(
      [
        softCyl(s, 0.26, 0.02, 0.022, { pos: [0, -0.2, 0], color: "#e8c49a", bottom: "#c99a6b" }, 0.008, 8),
        softBox(s, 0.16, 0.06, 0.06, { pos: [0, 0.07, 0], color: "#b4aec4" }, 0.02),
      ],
      { pos: [-0.39, 0.5, 0.06], rot: [0, 0, 0.12] },
    ),
  );
  kit.add("body", ball(s, 0.075, { pos: [0, 0.4, -0.35], color: fur }, 8));

  // head
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: fur, bottom: darker(fur, 0.04) }, 16));
  kit.add("head", blob(s, M.r[0], M.r[1], M.r[2], { pos: M.c, color: light }, 12));
  const nz = placeOn(M.c, M.r, 0, 30, -0.01);
  kit.add("head", blob(s, 0.05, 0.034, 0.032, { pos: nz.pos, rot: nz.rot, color: "#5a4250" }, 10));
  const hl = placeOn(M.c, M.r, -8, 40, 0.008);
  kit.add("face", ball(s, 0.011, { pos: hl.pos, color: "#ffffff", scale: [1.4, 0.8, 0.6] }, 6));
  for (const side of [-1, 1]) {
    const ep = placeOn(H.c, H.r, 70 * side, 34, -0.03);
    kit.add("head", blob(s, 0.085, 0.085, 0.05, { pos: ep.pos, rot: ep.rot, color: fur }, 10));
    const ip = placeOn(H.c, H.r, 70 * side, 34, 0.012);
    kit.add("head", blob(s, 0.05, 0.05, 0.012, { pos: ip.pos, rot: ip.rot, color: light }, 8));
  }
  addEyes(kit, "eyes", H, E);
  cheeks(kit, "face", H, 47, -12, 0.045, 0.028);
  wMouth(kit, "face", M, -20, 20, 16, 0.0075);
  openMouth(kit, M, -24, 0.036, 0.026);
  // pencil behind the right ear
  kit.add(
    "head",
    group(
      [
        softCyl(s, 0.2, 0.014, 0.014, { color: "#ffe066" }, 0.004, 6),
        cone(s, 0.04, 0.014, { pos: [0, 0.2, 0], color: "#f2d7b4" }, 6),
        softCyl(s, 0.03, 0.015, 0.015, { pos: [0, -0.03, 0], color: "#f8b9cb" }, 0.006, 6),
      ],
      { pos: [0.3, 1.43, -0.02], rot: [1.3, 0, 0.3] },
    ),
  );

  // hard hat
  const dome: [number, number][] = [
    [0, 0.0],
    [0.27, 0.0],
    [0.265, 0.06],
    [0.24, 0.12],
    [0.18, 0.18],
    [0.09, 0.205],
    [0, 0.21],
  ];
  kit.add(
    "head",
    group(
      [
        lathe(s, dome, { color: hat, bottom: darker(hat, 0.08) }, 20),
        disc(s, 0.32, 0.03, { pos: [0, -0.005, 0.03], color: darker(hat, 0.06) }, 22),
        blob(s, 0.04, 0.21, 0.28, { pos: [0, 0.0, 0.0], color: lighter(hat, 0.25) }, 10),
        heart(s, 0.06, "#f47a9a", { pos: [0, 0.1, 0.235], rot: [-0.55, 0, 0] }),
      ],
      { pos: [0, 1.5, 0.0], rot: [-0.1, 0, 0] },
    ),
  );
  // ears ride on the head mesh (static) but give them a little spring under the hat via a tiny node
  for (const side of [-1, 1] as const) {
    arm(kit, side, [0.33, 0.96, 0], 0.3, 0.075, shirt, 0.088, fur, { splay: 0.04 });
    leg(kit, side, [0.16, 0.32, 0], 0.09, denim, { rx: 0.1, ry: 0.07, rz: 0.15, color: belt, z: 0.04 });
  }
  kit.build();
  return rig;
}

/* ---------- Marina: otter by the pond ---------- */

function buildMarina(scene: Scene): CharacterModel {
  const fur = "#c39a7f",
    light = "#fbeadb",
    vest = "#b9d68f",
    shirt = "#bfe0f6",
    hat = "#ffd659";
  const H: Ell = { c: [0, 0.86, 0.02], r: [0.215, 0.19, 0.2] };
  const M: Ell = { c: [0, 0.805, 0.17], r: [0.12, 0.072, 0.07] };
  const E: EyeOpts = { yaw: 30, pitch: 5, rx: 0.027, ry: 0.039 };
  const bodyP = ellProfile(0.42, 0.195, 0.3);
  const rig = new Rig(
    scene,
    {
      name: "marina",
      height: 1.16,
      hipY: 0.24,
      neck: [0, 0.68, 0],
      headY: H.c[1],
      eyes: eyeCentre(H, E),
      mouth: mouthPivot(M, -24, 0.02),
      shoulder: [0.17, 0.6, 0],
      hip: [0.085, 0.17, 0],
      persona: { walkFreq: 1.6, sway: 0.035, glance: 0.5, headTilt: 0.07, armRestZ: 0.2 },
    },
    97,
  );
  const kit = new Kit(scene, rig);
  stdGroups(kit, rig);
  const s = scene;

  // body: shirt + fishing vest with pockets
  kit.add("body", lathe(s, bodyP, { color: shirt, bottom: fur }, 18));
  const vp: [number, number][] = [
    [0, 0.2],
    [0.17, 0.2],
    [0.2, 0.26],
    [0.205, 0.46],
    [0.185, 0.58],
    [0.14, 0.66],
    [0, 0.67],
  ];
  kit.add("body", lathe(s, vp, { color: vest, bottom: darker(vest, 0.1) }, 18));
  kit.add("body", cone(s, 0.17, 0.07, { pos: [0, 0.67, 0.165], rot: [Math.PI - 0.45, 0, 0], color: shirt, scale: [1, 1, 0.4] }, 10));
  for (const y of [0.44, 0.36, 0.28]) kit.add("body", ball(s, 0.014, { pos: [0, y, 0.212], color: "#fff6e6" }, 6));
  for (const side of [-1, 1]) {
    for (const [y, w] of [
      [0.36, 0.075],
      [0.5, 0.06],
    ]) {
      const a = 0.42 * side;
      const r = 0.2;
      const pz = Math.cos(a) * r + 0.012;
      kit.add("body", softBox(s, w, 0.075, 0.025, { pos: [Math.sin(a) * r, y, pz], rot: [-0.05, a, 0], color: darker(vest, 0.08) }, 0.01));
      kit.add("body", softBox(s, w + 0.006, 0.028, 0.03, { pos: [Math.sin(a) * (r + 0.006), y + 0.03, pz + 0.004], rot: [-0.05, a, 0], color: darker(vest, 0.16) }, 0.008));
    }
  }
  // fish badge
  kit.add(
    "body",
    group(
      [blob(s, 0.03, 0.018, 0.01, { color: "#f8b9cb" }, 8), cone(s, 0.025, 0.018, { pos: [-0.035, 0, 0], rot: [0, 0, -Math.PI / 2], color: "#f8b9cb", scale: [1, 1, 0.5] }, 6)],
      { pos: [0.085, 0.58, 0.17], rot: [-0.3, 0.42, 0] },
    ),
  );
  // thick tail
  const tailN = appendage(rig, kit, "tail", "body", [0, 0.2, -0.14]);
  kit.add("tail", tube(s, bez([0, 0.22, -0.12], [0, 0.07, -0.3], [0, 0.07, -0.5], 8), 0.075, { color: fur, bottom: darker(fur, 0.1) }, 10, (u) => 1 - u * 0.7));
  rig.addSecondary({ node: tailN, axis: "y", k: 40, d: 3, wagAmp: 0.14, wagFreq: 0.8, gyaw: -0.25, min: -0.6, max: 0.6 });

  // head
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: fur, bottom: darker(fur, 0.04) }, 16));
  kit.add("head", blob(s, M.r[0], M.r[1], M.r[2], { pos: M.c, color: light }, 12));
  for (const side of [-1, 1]) {
    const wp = placeOn(M.c, M.r, 35 * side, -5, -0.02);
    kit.add("head", ball(s, 0.05, { pos: wp.pos, color: light }, 10));
    const ep = placeOn(H.c, H.r, 72 * side, 26, -0.02);
    kit.add("head", blob(s, 0.045, 0.045, 0.03, { pos: ep.pos, rot: ep.rot, color: fur }, 8));
    const ip = placeOn(H.c, H.r, 72 * side, 26, 0.004);
    kit.add("head", blob(s, 0.025, 0.025, 0.008, { pos: ip.pos, rot: ip.rot, color: darker(fur, 0.2) }, 6));
  }
  const nz = placeOn(M.c, M.r, 0, 30, -0.008);
  kit.add("head", blob(s, 0.042, 0.028, 0.026, { pos: nz.pos, rot: nz.rot, color: "#4f3c4c" }, 10));
  addEyes(kit, "eyes", H, E);
  cheeks(kit, "face", H, 52, -10, 0.034, 0.022);
  wMouth(kit, "face", M, -14, 18, 18, 0.0055);
  openMouth(kit, M, -24, 0.026, 0.02);
  whiskers(kit, "face", M, "#8a7080", 0.09, 3);

  // sou'wester rain hat
  const crown: [number, number][] = [
    [0, 0],
    [0.2, 0],
    [0.195, 0.05],
    [0.17, 0.11],
    [0.11, 0.15],
    [0, 0.16],
  ];
  kit.add(
    "head",
    group(
      [
        lathe(s, crown, { color: hat, bottom: darker(hat, 0.06) }, 18),
        blob(s, 0.3, 0.025, 0.33, { pos: [0, 0.0, -0.05], rot: [0.12, 0, 0], color: darker(hat, 0.04) }, 18),
        softCyl(s, 0.03, 0.198, 0.2, { pos: [0, 0.015, 0], color: "#7fd6cf" }, 0.008, 18),
      ],
      { pos: [0, 0.99, -0.01], rot: [-0.14, 0, 0.06] },
    ),
  );

  for (const side of [-1, 1] as const) {
    arm(kit, side, [0.17, 0.6, 0], 0.2, 0.04, fur, 0.046, darker(fur, 0.08), { sleeve: shirt, sleeveR: 0.058 });
    leg(kit, side, [0.085, 0.17, 0], 0.05, fur, { rx: 0.068, ry: 0.04, rz: 0.095, color: darker(fur, 0.12), z: 0.04 });
  }
  kit.build();
  return rig;
}

/* ---------- Mocha: round tabby cat baker ---------- */

function buildMocha(scene: Scene): CharacterModel {
  const fur = "#f8e2c0",
    caramel = "#e3a46c",
    mocha = "#9c6a50",
    light = "#fffaf0",
    pink = "#f7a8bd",
    apron = "#fffdf8",
    kerchief = "#f58fae";
  const H: Ell = { c: [0, 0.76, 0.01], r: [0.27, 0.228, 0.225] };
  const M: Ell = { c: [0, 0.69, 0.185], r: [0.088, 0.058, 0.06] };
  const E: EyeOpts = { yaw: 29, pitch: 4, rx: 0.031, ry: 0.043 };
  const BC: V3 = [0, 0.33, 0],
    BR: V3 = [0.24, 0.255, 0.235];
  const bodyP = ellProfile(BC[1], BR[0], BR[1]);
  const rig = new Rig(
    scene,
    {
      name: "mocha",
      height: 1.15,
      hipY: 0.22,
      neck: [0, 0.55, 0],
      headY: H.c[1],
      eyes: eyeCentre(H, E),
      mouth: mouthPivot(M, -24, 0.02),
      shoulder: [0.2, 0.47, 0],
      hip: [0.1, 0.17, 0],
      persona: { walkFreq: 1.5, runFreq: 2.4, stride: 0.5, bob: 0.045, breathe: 0.02, sway: 0.035, idleBounce: 0.006, headTilt: 0.09, glance: 0.5, armRestZ: 0.3, hop: 0.24 },
    },
    109,
  );
  const kit = new Kit(scene, rig);
  stdGroups(kit, rig);
  const s = scene;

  /* body: round tummy, tabby stripes on the back, apron, neckerchief */
  kit.add("body", lathe(s, bodyP, { color: fur, bottom: mixCol(fur, caramel, 0.45) }, 18));
  for (const [yw, pt, w, h] of [
    [150, 20, 0.03, 0.09],
    [180, 25, 0.03, 0.1],
    [-150, 20, 0.03, 0.09],
    [125, 0, 0.026, 0.075],
    [-125, 0, 0.026, 0.075],
  ] as [number, number, number, number][]) {
    const p = placeOn(BC, BR, yw, pt, -0.008);
    kit.add("body", blob(s, w, h, 0.02, { pos: p.pos, rot: p.rot, color: caramel }, 8));
  }
  // mocha patch on the back
  const bp = placeOn(BC, BR, -165, -20, -0.01);
  kit.add("body", blob(s, 0.1, 0.08, 0.025, { pos: bp.pos, rot: bp.rot, color: mocha }, 10));
  // apron: skirt, bib, waist ties, heart pocket
  kit.add("body", blob(s, 0.165, 0.165, 0.06, { pos: [0, 0.27, 0.198], rot: [-0.1, 0, 0], color: apron, bottom: darker(apron, 0.07) }, 14));
  kit.add("body", blob(s, 0.11, 0.085, 0.03, { pos: [0, 0.445, 0.19], rot: [-0.62, 0, 0], color: apron }, 12));
  kit.add("body", tube(s, wrapBand(bodyP, 0.375, 0, 0.008, 26), 0.014, { color: apron }, 5));
  for (const side of [-1, 1]) kit.add("body", blob(s, 0.055, 0.03, 0.02, { pos: [0.045 * side, 0.385, -0.225], rot: [0, 0, -0.55 * side], color: apron }, 8));
  kit.add("body", ball(s, 0.02, { pos: [0, 0.385, -0.235], color: apron }, 6));
  // scalloped pink hem
  for (let i = 0; i < 7; i++) {
    const a = (-57 + i * 19) * (Math.PI / 180);
    kit.add("body", blob(s, 0.03, 0.02, 0.016, { pos: [Math.sin(a) * 0.155, 0.122 + (1 - Math.cos(a)) * 0.05, 0.2 + Math.cos(a) * 0.045], rot: [-0.3, a, 0], color: "#ffd3df" }, 6));
  }
  kit.add("body", heart(s, 0.085, "#f8b9cb", { pos: [0.055, 0.255, 0.258], rot: [-0.1, 0.2, 0] }));
  kit.add("body", tube(s, [[0.022, 0.282, 0.27], [0.088, 0.282, 0.257]], 0.0055, { color: "#fff0f5" }, 4));
  kit.add("body", flower(s, 0.017, "#ffe066", "#ffffff", { pos: [-0.06, 0.455, 0.214], rot: [-0.62, 0, 0] }));
  // striped neckerchief: band + front triangle with stripes
  kit.add("body", tube(s, wrapBand(bodyP, 0.548, 0, 0.026, 22), 0.028, { color: kerchief }, 7));
  const kt = 0.8,
    kl = 0.15,
    k0: V3 = [0, 0.57, 0.125];
  kit.add("body", cone(s, kl, 0.09, { pos: k0, rot: [Math.PI - kt, 0, 0], color: kerchief, bottom: darker(kerchief, 0.06), scale: [1, 1, 0.42] }, 12));
  for (const [t, w] of [
    [0.32, 0.058],
    [0.6, 0.034],
  ]) {
    // stripes across the triangle (t = fraction down its length)
    const y = k0[1] - kl * t * Math.cos(kt),
      z = k0[2] + kl * t * Math.sin(kt) + 0.038 * (1 - t) * Math.cos(kt) + 0.004;
    kit.add("body", tube(s, [[-w, y + 0.006, z - 0.008], [0, y, z], [w, y + 0.006, z - 0.008]], 0.0075, { color: "#fff6fa" }, 4));
  }
  kit.add("body", ball(s, 0.03, { pos: [0, 0.555, 0.15], color: darker(kerchief, 0.08) }, 8));
  for (let i = 0; i < 10; i++) {
    // white stripes around the band
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const r = profileRadius(bodyP, 0.548) + 0.03;
    kit.add("body", ball(s, 0.016, { pos: [Math.sin(a) * r, 0.548, Math.cos(a) * r], color: "#fff6fa", scale: [1, 1.7, 1] }, 6));
  }

  /* curly tail */
  const tailN = appendage(rig, kit, "tail", "body", [0, 0.17, -0.2]);
  const tp: V3[] = [...bez([0, 0.17, -0.2], [0, 0.08, -0.42], [0, 0.3, -0.46], 7)];
  const cc: V3 = [0, 0.38, -0.4];
  const r0 = Math.hypot(tp[tp.length - 1][1] - cc[1], tp[tp.length - 1][2] - cc[2]);
  const a0 = Math.atan2(tp[tp.length - 1][1] - cc[1], tp[tp.length - 1][2] - cc[2]);
  for (let i = 1; i <= 9; i++) {
    const t = i / 9;
    const a = a0 + t * Math.PI * 1.45;
    const r = r0 * (1 - 0.55 * t);
    tp.push([0.012 * i, cc[1] + Math.sin(a) * r, cc[2] + Math.cos(a) * r]);
  }
  kit.add("tail", tube(s, tp, 0.036, { color: caramel, bottom: darker(caramel, 0.06) }, 8, (u) => 1 - u * 0.35));
  for (const u of [0.2, 0.38, 0.56]) {
    // mocha stripe rings, perpendicular to the tail
    const i = Math.round(u * (tp.length - 1));
    const p = tp[i],
      a = tp[i - 1],
      b = tp[i + 1];
    const th = Math.atan2(b[2] - a[2], b[1] - a[1]);
    kit.add("tail", torus(s, 0.036 * (1 - u * 0.35) - 0.002, 0.022, { pos: p, rot: [th, 0, 0], color: mocha }, 12));
  }
  kit.add("tail", ball(s, 0.03, { pos: tp[tp.length - 1], color: fur }, 8));
  rig.addSecondary({ node: tailN, axis: "z", k: 45, d: 3, wagAmp: 0.16, wagFreq: 0.9, gyaw: -0.25, min: -0.6, max: 0.6 });
  rig.addSecondary({ node: tailN, axis: "x", k: 55, d: 3.5, gy: 0.01, gspeed: 0.2, min: -0.35, max: 0.45 });

  /* head */
  kit.add("head", blob(s, H.r[0], H.r[1], H.r[2], { pos: H.c, color: fur, bottom: darker(fur, 0.04) }, 16));
  // fluffy cheek tufts
  for (const side of [-1, 1]) {
    const cp = placeOn(H.c, H.r, 80 * side, -30, -0.03);
    kit.add("head", blob(s, 0.07, 0.05, 0.06, { pos: cp.pos, rot: [0, 0, -0.45 * side], color: fur }, 8));
  }
  // mocha patch around the left eye, tabby stripes on the forehead & cheeks
  const pe = placeOn(H.c, H.r, -E.yaw - 4, E.pitch + 5, -0.008);
  kit.add("head", blob(s, 0.082, 0.072, 0.012, { pos: pe.pos, rot: [pe.rot[0], pe.rot[1], 0.3], color: mocha }, 10));
  for (const [yw, pt, l] of [
    [-11, 36, 0.042],
    [0, 39, 0.05],
    [11, 36, 0.042],
  ] as [number, number, number][]) {
    const p = placeOn(H.c, H.r, yw, pt, -0.005);
    kit.add("face", blob(s, 0.011, l, 0.006, { pos: p.pos, rot: [p.rot[0], p.rot[1], -yw * 0.012], color: caramel }, 6));
  }
  for (const side of [-1, 1]) {
    for (const pt of [-4, -14]) {
      const p = placeOn(H.c, H.r, 70 * side, pt, -0.004);
      kit.add("face", blob(s, 0.035, 0.009, 0.006, { pos: p.pos, rot: [p.rot[0], p.rot[1], 0.15 * side * (pt + 9) * 0.1], color: caramel }, 6));
    }
  }
  for (const [yw, pt] of [
    [165, 25],
    [180, 30],
    [-165, 25],
    [180, 5],
  ] as [number, number][]) {
    const p = placeOn(H.c, H.r, yw, pt, -0.006);
    kit.add("head", blob(s, 0.014, 0.06, 0.008, { pos: p.pos, rot: p.rot, color: caramel }, 6));
  }
  kit.add("head", blob(s, M.r[0], M.r[1], M.r[2], { pos: M.c, color: light }, 12));
  const nz = placeOn(M.c, M.r, 0, 34, -0.006);
  kit.add("head", group([cone(s, 0.03, 0.022, { color: "#f58fa6", scale: [1.2, 1, 0.6] }, 8)], { pos: nz.pos, rot: [Math.PI + nz.rot[0] * 0.5, 0, 0] }));
  addEyes(kit, "eyes", H, E);
  cheeks(kit, "face", H, 45, -14, 0.042, 0.026);
  wMouth(kit, "face", M, -12, 24, 18, 0.006);
  openMouth(kit, M, -24, 0.028, 0.02);
  whiskers(kit, "face", M, "#b08a7a", 0.1, 2);
  // flour dusting on the right cheek and the nose
  for (const [yw, pt, r] of [
    [50, -2, 0.02],
    [58, -9, 0.014],
    [44, -10, 0.011],
    [62, 2, 0.009],
  ] as [number, number, number][]) {
    const p = placeOn(H.c, H.r, yw, pt, 0.0);
    kit.add("face", blob(s, r, r * 0.8, 0.006, { pos: p.pos, rot: p.rot, color: "#ffffff" }, 6));
  }
  const fl = placeOn(M.c, M.r, 14, 20, 0.0);
  kit.add("face", blob(s, 0.011, 0.009, 0.005, { pos: fl.pos, rot: fl.rot, color: "#ffffff" }, 6));

  // tall chef's toque
  kit.add("head", group(chefToque(s, 0.15, 0.25, "#fffdf8"), { pos: [0.02, 0.935, -0.02], rot: [-0.08, 0, -0.09] }));

  /* ears (one mocha, one caramel) */
  for (const side of [-1, 1] as const) {
    const name = side > 0 ? "earR" : "earL";
    const ep = placeOn(H.c, H.r, 47 * side, 38, -0.03);
    const piv: V3 = ep.pos;
    const n = appendage(rig, kit, name, "head", piv);
    const c = side < 0 ? mocha : caramel;
    kit.add(
      name,
      group(
        [
          cone(s, 0.15, 0.085, { color: c, bottom: darker(c, 0.04), scale: [1, 1, 0.5] }, 12),
          cone(s, 0.1, 0.05, { pos: [0, 0.012, 0.03], color: pink, scale: [1, 1, 0.35] }, 10),
        ],
        { pos: piv, rot: [-0.1, 0.25 * side, -0.42 * side] },
      ),
    );
    rig.addSecondary({ node: n, axis: "z", k: 110, d: 6, gy: 0.007 * side, gyaw: 0.08, twitch: 0.18, twitchAmp: 4, min: -0.4, max: 0.4 });
  }

  /* paws, whisk */
  for (const side of [-1, 1] as const) {
    arm(kit, side, [0.2, 0.47, 0], 0.16, 0.046, fur, 0.054, light);
    leg(kit, side, [0.1, 0.17, 0], 0.055, fur, { rx: 0.07, ry: 0.045, rz: 0.09, color: light, z: 0.03 });
    // caramel stripe bands on the arms
    kit.add(side > 0 ? "armR" : "armL", torus(s, 0.046, 0.014, { pos: [0.22 * side, 0.42, 0], color: caramel }, 12));
  }
  // whisk in the right paw
  const wires: Mesh[] = [softCyl(s, 0.11, 0.013, 0.015, { pos: [0, -0.1, 0], color: "#f3c89a", bottom: "#d9a36c" }, 0.006, 8)];
  for (let i = 0; i < 3; i++) {
    const loop: V3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = (k / 12) * Math.PI;
      loop.push([Math.cos(t) * 0.038, 0.01 + Math.sin(t) * 0.11, 0]);
    }
    wires.push(group([tube(s, loop, 0.004, { color: "#c9c6d8" }, 4)], { rot: [0, (i / 3) * Math.PI, 0] }));
  }
  kit.add("armR", group(wires, { pos: [0.245, 0.37, 0.07], rot: [0.55, 0, -0.25] }));
  kit.build();
  return rig;
}
