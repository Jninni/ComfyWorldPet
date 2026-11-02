/**
 * Mocha's Bakery & Café — interior diorama. Butter walls with strawberry wainscot, pink/cream check
 * floor, a big brick-and-pastel oven with a glowing arch, a long counter with a glass display case,
 * bread & jar shelves, a chalkboard menu, hanging copper pans, flour sacks, a prep table, two café
 * tables and twinkly string lights.
 */
import { Vector3, Color3, type Scene, type Mesh, type StandardMaterial } from "@babylonjs/core";
import type { InteriorDef } from "../../core/types";
import { Kit, archPts, circlePts, roundRectPts, scallopPts, uniqueMat, OL, type V3, type P2 } from "./kit";
import { RoomCtx, roomShell, finishInterior, makeRoot, onBack, onLeft, X0, X1, Z0, Z1, WALL_H } from "./room";
import { PI, pottedPlant, archWindow, wallShelf, flower, flowerPot, teacup, cakeRound, strawberry, fluffyRug, cakeSlice } from "./props";
import {
  loaf,
  boule,
  baguette,
  croissant,
  bun,
  donut,
  cupcake,
  flowerCake,
  rollingPin,
  whisk,
  hangingPan,
  flourSack,
  cafeTable,
  cafeChair,
  chalkIcon,
  pawMat,
  heartLo,
  macaronPile,
  CRUST,
  DOUGH,
  COPPER,
} from "./bakery_props";
import { jitterCol, rng } from "../../render/Palette";
import type { ColorLike } from "../../render/Shapes";

const CREAM = "#fff6e6",
  WHITE = "#fffdf8",
  PINK = "#f7a8c0",
  PINK_DEEP = "#ef8fab",
  STRAW = "#f48fab",
  MINT = "#a8e2c4",
  MINT_DEEP = "#8fd4b5",
  BUTTER = "#fde7a6",
  WOOD = "#e8c49a",
  WOOD_DEEP = "#d6aa7c",
  OVEN = "#f3aea4",
  OVEN_DEEP = "#e2928a",
  SLATE = "#5d6b72";

/** glass jar with coloured contents + cloth lid, p = bottom on a surface */
function jar(k: Kit, p: V3, fill: ColorLike, lid: ColorLike, s = 1) {
  k.at(k.frame(p, 0, s), () => {
    k.lathe(
      [
        [0, 0],
        [0.1, 0],
        [0.115, 0.03],
        [0.115, 0.2],
        [0.085, 0.24],
        [0, 0.24],
      ],
      [0, 0, 0],
      "#e8f6ff",
      { key: "glass", seg: 10 },
    );
    k.cyl(0.15, 0.118, 0.118, [0, 0.02, 0], fill, { bevel: 0.03, seg: 10 });
    k.revolve(
      (a) => {
        const sc = Math.pow(Math.abs(Math.cos(a * 4)), 0.6);
        return [
          [0.13 + sc * 0.015, 0.2 - sc * 0.03],
          [0.135, 0.25],
          [0.09, 0.285],
          [0, 0.29],
        ];
      },
      [0, 0, 0],
      lid,
      { segA: 16 },
    );
  });
}

/** cute pastel stand mixer, p = base on a surface, facing -Z with the bowl in front */
function standMixer(k: Kit, p: V3, body: ColorLike, s = 1) {
  k.at(k.frame(p, 0, s), () => {
    k.box(0.36, 0.08, 0.5, [0, 0.04, 0.02], body, { r: 0.035 });
    k.box(0.16, 0.42, 0.16, [0, 0.29, 0.17], body, { r: 0.07 });
    k.blob(0.15, 0.13, 0.32, [0, 0.52, 0.04], body, { seg: 10 });
    k.ball(0.04, [0, 0.52, -0.27], WHITE, { seg: 6 });
    k.rod(0.14, 0.02, [0, 0.33, -0.08], "#d9d4e3", { seg: 5 });
    k.lathe(
      [
        [0, 0.08],
        [0.08, 0.08],
        [0.15, 0.14],
        [0.16, 0.27],
        [0.14, 0.27],
        [0, 0.2],
      ],
      [0, 0, -0.08],
      "#e6e3ef",
      { seg: 14 },
    );
    k.blob(0.13, 0.04, 0.13, [0, 0.25, -0.08], DOUGH, { seg: 7 });
    heartLo(k, [0, 0.52, -0.33], 0.07, WHITE, 0.02, { key: "fine" });
  });
}

/** big mixing bowl with batter and a whisk leaning in it, p = bottom on a surface */
function mixingBowl(k: Kit, p: V3, color: ColorLike, rim: ColorLike, s = 1) {
  k.at(k.frame(p, 0, s), () => {
    k.lathe(
      [
        [0, 0],
        [0.13, 0],
        [0.24, 0.1],
        [0.29, 0.22],
        [0.27, 0.23],
        [0, 0.14],
      ],
      [0, 0, 0],
      color,
      { seg: 18, bottom: rim },
    );
    k.torus(0.28, 0.035, [0, 0.22, 0], rim, { seg: 18 });
    k.blob(0.24, 0.035, 0.24, [0, 0.19, 0], "#fff1c9", { seg: 9 });
    whisk(k, [0.05, 0.12, 0.02], [0.15, 0, -0.5], 1.15, PINK);
  });
}

/** two-tier pastry stand (cupcakes below, donuts on top), p = base on a surface */
function pastryStand(k: Kit, p: V3, s = 1) {
  k.at(k.frame(p, 0, s), () => {
    k.rod(0.62, 0.022, [0, 0.31, 0], PINK, { seg: 6 });
    k.ball(0.045, [0, 0.64, 0], PINK, { seg: 6 });
    for (const [ty, tr] of [
      [0.04, 0.34],
      [0.36, 0.24],
    ] as [number, number][]) {
      k.revolve(
        (a) => {
          const w = 1 + 0.05 * Math.cos(a * 10);
          return [
            [0, ty],
            [tr * 0.6, ty],
            [tr * w, ty + 0.03],
            [tr * w * 1.02, ty + 0.045],
            [tr * 0.6, ty + 0.025],
            [0, ty + 0.025],
          ];
        },
        [0, 0, 0],
        WHITE,
        { segA: 30 },
      );
    }
    const cc: [ColorLike, ColorLike][] = [
      ["#f8b9cb", MINT],
      [WHITE, PINK],
      ["#c9b3f2", BUTTER],
      ["#bfe9d6", PINK],
      ["#ffe08a", "#c9b3f2"],
    ];
    cc.forEach(([f, w], i) => {
      const a = (i / cc.length) * PI * 2 + 0.3;
      cupcake(k, [Math.cos(a) * 0.23, 0.07 + OL, Math.sin(a) * 0.23], f, w, 0.85);
    });
    const gl = ["#f9a8c4", "#fff6e6", "#c9b3f2"];
    gl.forEach((g, i) => {
      const a = (i / 3) * PI * 2 + 0.9;
      donut(k, [Math.cos(a) * 0.14, 0.39 + OL, Math.sin(a) * 0.14], g, 0.9);
    });
  });
}

export function buildBakery(scene: Scene, origin: Vector3): InteriorDef {
  const root = makeRoot(scene, "bakery", origin);
  const k = new Kit(scene, root);
  const ctx = new RoomCtx(origin);
  const r = rng(58);

  roomShell(k, {
    wall: "#fde6b4",
    wallTop: "#fff2d2",
    wainscot: "#f7b6c6",
    wainscotH: 1.05,
    rail: WHITE,
    base: WHITE,
    border: PINK,
    borderDeep: "#e58aa9",
    crown: WHITE,
    floor: "check",
    floorA: "#fff6e6",
    floorB: "#f8cbd5",
    floorGap: "#e8b8c2",
    motif: "dots",
    motifColor: "#fff7e3",
    mat: PINK,
    matAccent: CREAM,
    seed: 58,
    customMat: true,
  });
  // paw-print exit mat
  pawMat(k, [0, 0, Z0 + 0.62], PINK, CREAM, 1.3, 0.8);

  /* ================= oven (back left) ================= */
  const OX = -2.8,
    OD = 1.3,
    OZ = Z1 - OD; // front face
  k.box(2.6, 0.32, OD + 0.2, [OX, 0.16, Z1 - (OD + 0.2) / 2], CREAM, { r: 0.1, bottom: "#f3e2cf" });
  k.box(2.3, 1.75, OD, [OX, 0.32 + 0.875, Z1 - OD / 2], OVEN, { r: 0.22, steps: 3, bottom: OVEN_DEEP });
  k.blob(1.2, 0.62, OD / 2 + 0.02, [OX, 2.0, Z1 - OD / 2], "#f7bdb3", { seg: 14 });
  k.box(2.42, 0.13, OD + 0.1, [OX, 2.05, Z1 - OD / 2], CREAM, { r: 0.06 });
  // bricks on the oven face (lifted clear of the outlined body)
  const bz = OZ - OL - 0.02;
  for (let row = 0; row < 7; row++) {
    const y = 0.48 + row * 0.22;
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.34 + (row % 2 ? 0.17 : 0);
      if (Math.abs(x) > 1.0) continue;
      if (Math.abs(x) < 0.92 && y > 0.45 && y < 1.98) continue; // arch
      k.decal(roundRectPts(0.28, 0.14, 0.05, 2), [OX + x, y, bz], jitterCol(row % 2 ? "#f8c6bd" : "#eea197", 0.02, r), { t: 0.02 });
    }
  }
  // arch frame, ledge, peel, loaves
  k.at(k.frame([OX, 0.6, OZ], 0), () => {
    k.puff(archPts(1.55, 1.38, 16), 0.14, [0, -0.06, -0.02], CREAM, { bevel: 0.06 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * PI;
      k.box(0.12, 0.2, 0.06, [Math.cos(a) * 0.71, 1.12 - 0.62 + Math.sin(a) * 0.71, -0.12], i % 2 ? "#fff3df" : "#f8d9c4", { rot: [0, 0, a - PI / 2], r: 0.03, steps: 1 });
    }
    k.box(1.7, 0.1, 0.56, [0, -0.04, -0.27], WOOD, { r: 0.04, bottom: WOOD_DEEP });
    heartLo(k, [0, 1.62, -0.12], 0.3, STRAW, 0.08);
  });
  // glowing interior (pulses)
  const ovenMat = uniqueMat(scene, "bakery_oven_glow", { emissive: "#ff9a52" }) as StandardMaterial;
  const ovenBase = ovenMat.emissiveColor.clone();
  const ovenGlow = k.anim("bakery_oven_glow", { material: ovenMat, outline: false, castShadow: false }, () => {
    k.puff(archPts(1.12, 1.04, 16), 0.04, [OX, 0.62, OZ - 0.2], "#ffd08a", { bevel: 0.015, bottom: "#ffb070" });
  });
  void ovenGlow;
  k.defKey("ember", { outline: false, emissive: "#ff9f5a", castShadow: false });
  for (let i = 0; i < 5; i++) k.blob(0.1, 0.07 + (i % 2) * 0.05, 0.04, [OX - 0.36 + i * 0.18, 0.7, OZ - 0.26], i % 2 ? "#ffe066" : "#ffb766", { key: "ember", seg: 5 });
  // bread baking on a tray at the mouth
  k.box(0.9, 0.035, 0.3, [OX, 0.62 + OL, OZ - 0.36], "#c9c3d6", { r: 0.015, steps: 1, key: "fine" });
  loaf(k, [OX - 0.22, 0.64 + OL, OZ - 0.36], 0.1, 0.85);
  loaf(k, [OX + 0.22, 0.64 + OL, OZ - 0.36], -0.1, 0.85);
  // chimney pipe into the wall
  const px = OX + 0.6;
  k.tube(
    [
      [px, 2.3, Z1 - 0.62],
      [px, 2.95, Z1 - 0.62],
      [px, 3.2, Z1 - 0.48],
      [px, 3.3, Z1 - 0.25],
      [px, 3.32, Z1 + 0.05],
    ],
    0.13,
    COPPER,
    { tess: 12 },
  );
  for (const y of [2.55, 2.85]) k.torus(0.14, 0.05, [px, y, Z1 - 0.62], "#d98458", { seg: 14 });
  // heart oven mitt hanging on the oven's right side
  k.at(k.frame([OX + 1.16, 1.45, Z1 - 0.75], -PI / 2), () => {
    k.rod(0.16, 0.012, [0, 0.2, -0.02], "#6d5a78", { seg: 4 });
    k.puff(roundRectPts(0.24, 0.32, 0.11), 0.07, [0, 0.0, -0.05], PINK, { bevel: 0.03 });
    k.puff(circlePts(0.07, 12, 0.09), 0.06, [0.14, 0.02, -0.05], PINK, { bevel: 0.025, rot: [0, 0, -0.5] });
    k.box(0.28, 0.08, 0.08, [0, 0.16, -0.05], WHITE, { r: 0.035, steps: 1 });
    heartLo(k, [0, -0.03, -0.11], 0.1, WHITE, 0.025, { key: "fine" });
  });
  // bread peel leaning on the left
  k.at(k.frame([OX - 1.32, 0, Z1 - 0.35], [0.12, 0, -0.18]), () => {
    k.rod(1.4, 0.03, [0, 0.7, 0], WOOD_DEEP, { seg: 6 });
    k.puff(roundRectPts(0.42, 0.5, 0.16), 0.04, [0, 1.62, 0], WOOD, { bevel: 0.015 });
  });
  ctx.box(OX, Z1 - (OD + 0.2) / 2, 2.7, OD + 0.3);
  ctx.spot("oven", OX, 0, OZ - 1.05);

  // flour sacks in the corner
  flourSack(k, [-4.72, 0, 3.4], 0.5, 1.15, PINK);
  flourSack(k, [-4.65, 0, 2.55], -0.35, 0.95, MINT);
  flourSack(k, [-4.2, 0, 3.55], 0.2, 0.8, BUTTER);
  ctx.circle(-4.6, 3.05, 0.8);

  /* ================= chalkboard menu + cake stand table ================= */
  onBack(k, -0.55, 2.3, () => {
    k.puff(roundRectPts(1.6, 1.22, 0.14), 0.1, [0, 0, -0.05], WOOD, { bevel: 0.035, bottom: WOOD_DEEP });
    k.puff(roundRectPts(1.38, 1.0, 0.1), 0.04, [0, -0.02, -0.11], SLATE, { bevel: 0.015 });
    k.puff(scallopPts(1.4, 0.1, 9, 4), 0.05, [0, 0.42, -0.12], STRAW, { bevel: 0.02, spine: [[-0.7, 0.05], [0.7, 0.05]] });
    heartLo(k, [0, 0.66, -0.12], 0.22, PINK, 0.06);
    const z = -0.13 - OL;
    const kinds = ["croissant", "cupcake", "donut", "cup", "loaf", "cake"] as const;
    kinds.forEach((kd, i) => {
      const x = -0.44 + (i % 3) * 0.44,
        y = i < 3 ? 0.13 : -0.27;
      chalkIcon(k, kd, [x, y, z], 1.05);
      for (let d = 0; d < 3; d++) k.decal(circlePts(0.018, 8), [x - 0.045 + d * 0.045, y - 0.15, z], d === 1 ? "#ffe066" : "#f6f0fa", { t: 0.01 });
    });
    k.box(1.2, 0.05, 0.1, [0, -0.56, -0.12], WOOD_DEEP, { r: 0.02, steps: 1 });
    k.box(0.12, 0.035, 0.035, [0.25, -0.515, -0.13], WHITE, { r: 0.012, steps: 1, key: "fine" });
  });
  // butter side table with a tiered cake stand
  const ST: V3 = [-0.55, 0, Z1 - 0.55];
  k.cyl(0.06, 0.45, 0.45, [ST[0], 0.7, ST[2]], BUTTER, { bevel: 0.03, seg: 20 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.3;
    k.rod(0.7, 0.035, [ST[0] + Math.cos(a) * 0.28, 0.35, ST[2] + Math.sin(a) * 0.28], "#f5cf6b", { rot: [Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1], seg: 6 });
  }
  pastryStand(k, [ST[0], 0.76 + OL, ST[2]], 1.1);
  ctx.circle(ST[0], ST[2], 0.5);
  ctx.spot("chalkboard", -0.55, 0, Z1 - 1.55);

  /* ================= counter + glass display ================= */
  const CZ = 1.55,
    CD = 0.95,
    CXa = 0.5,
    CXb = 2.45,
    CXc = 5.25;
  const fz = CZ - CD / 2;
  // wooden serving counter
  k.box(CXb - CXa, 0.95, CD, [(CXa + CXb) / 2, 0.475, CZ], CREAM, { r: 0.1, bottom: "#f3e2cf" });
  k.box(CXb - CXa + 0.16, 0.09, CD + 0.14, [(CXa + CXb) / 2, 0.99, CZ], WOOD, { r: 0.04, bottom: WOOD_DEEP });
  for (const x of [CXa + 0.5, CXb - 0.5]) {
    k.puff(roundRectPts(0.8, 0.6, 0.12), 0.06, [x, 0.48, fz - 0.03], PINK, { bevel: 0.025 });
    heartLo(k, [x, 0.5, fz - 0.1], 0.2, CREAM, 0.05);
  }
  k.puff(scallopPts(CXb - CXa + 0.1, 0.08, 7, 4), 0.05, [(CXa + CXb) / 2, 0.9, fz - 0.06], STRAW, { bevel: 0.02, spine: [[-(CXb - CXa) / 2, 0.04], [(CXb - CXa) / 2, 0.04]] });
  const ct = 1.035 + OL;
  // service bell, fresh-bun tray (steams), cookie jar, little vase
  k.lathe(
    [
      [0, 0],
      [0.1, 0],
      [0.1, 0.02],
      [0.07, 0.04],
      [0.075, 0.09],
      [0.03, 0.13],
      [0, 0.13],
    ],
    [CXa + 0.3, ct, CZ - 0.15],
    "#ffd66e",
    { seg: 12, bottom: "#f5b94a" },
  );
  k.ball(0.025, [CXa + 0.3, ct + 0.15, CZ - 0.15], "#f5b94a", { seg: 5 });
  const BT: V3 = [CXa + 0.95, ct, CZ - 0.05];
  k.box(0.62, 0.04, 0.42, [BT[0], BT[1] + 0.02, BT[2]], "#c9c3d6", { r: 0.02, steps: 1 });
  for (let i = 0; i < 6; i++) bun(k, [BT[0] - 0.19 + (i % 3) * 0.19, BT[1] + 0.04 + OL, BT[2] - 0.09 + Math.floor(i / 3) * 0.18], 0.95, "main", i % 2 === 0);
  // cookie jar (open top so the cookies show)
  k.lathe(
    [
      [0, 0],
      [0.14, 0],
      [0.16, 0.05],
      [0.16, 0.26],
      [0.14, 0.28],
      [0.13, 0.26],
      [0, 0.2],
    ],
    [CXb - 0.45, ct, CZ + 0.1],
    "#e8f6ff",
    { key: "glass", seg: 14 },
  );
  for (let i = 0; i < 4; i++) k.cyl(0.03, 0.08, 0.08, [CXb - 0.45 + (i - 1.5) * 0.04, ct + 0.22 + (i % 2) * 0.03, CZ + 0.1 + (i % 2 ? 0.03 : -0.03)], "#e9b07a", { rot: [0.5 + i * 0.2, i, 0.2], seg: 10, bevel: 0.01 });
  k.torus(0.15, 0.04, [CXb - 0.45, ct + 0.26, CZ + 0.1], PINK, { seg: 16 });
  k.lathe(
    [
      [0, 0],
      [0.06, 0],
      [0.08, 0.08],
      [0.035, 0.18],
      [0.05, 0.22],
      [0, 0.22],
    ],
    [CXb - 0.15, ct, CZ - 0.25],
    MINT,
    { seg: 10 },
  );
  flower(k, [CXb - 0.15, ct + 0.2, CZ - 0.25], "daisy", WHITE, 0.14, "main");
  flower(k, [CXb - 0.12, ct + 0.2, CZ - 0.23], "rose", "#f47a9a", 0.1, "main");

  // display cabinet base
  const dcx = (CXb + CXc) / 2,
    dw = CXc - CXb;
  k.box(dw, 0.8, CD, [dcx, 0.4, CZ], PINK, { r: 0.1, bottom: PINK_DEEP });
  for (let i = 0; i < 3; i++) {
    const x = CXb + dw * ((i + 0.5) / 3);
    k.puff(roundRectPts(dw / 3 - 0.2, 0.48, 0.1), 0.05, [x, 0.4, fz - 0.03], CREAM, { bevel: 0.02 });
    k.ball(0.045, [x, 0.4, fz - 0.1], STRAW, { seg: 6 });
  }
  k.box(dw + 0.12, 0.07, CD + 0.12, [dcx, 0.82, CZ], CREAM, { r: 0.03 });
  const caseTop = 1.52;
  for (const x of [CXb + 0.06, CXc - 0.06]) for (const z of [fz + 0.04, CZ + CD / 2 - 0.04]) k.rod(caseTop - 0.86, 0.035, [x, (caseTop + 0.86) / 2, z], WHITE, { seg: 8 });
  k.box(dw + 0.12, 0.07, CD + 0.12, [dcx, caseTop, CZ], CREAM, { r: 0.03 });
  k.puff(scallopPts(dw + 0.1, 0.08, 9, 4), 0.05, [dcx, caseTop - 0.03, fz - 0.06], STRAW, { bevel: 0.02, spine: [[-dw / 2, 0.04], [dw / 2, 0.04]] });
  // glass shelf + glass shine strokes on the front
  k.box(dw - 0.1, 0.035, CD - 0.15, [dcx, 1.18, CZ + 0.02], "#eaf6ff", { r: 0.012, steps: 1, key: "glass" });
  k.defKey("shine", { outline: false, emissive: "#c8d6e6", castShadow: false });
  for (let i = 0; i < 3; i++) {
    const x = CXb + dw * ((i + 0.5) / 3);
    k.box(0.04, 0.34, 0.01, [x - 0.18, 1.2, fz - 0.02], WHITE, { rot: [0, 0, -0.6], r: 0.005, steps: 1, key: "shine" });
    k.box(0.025, 0.18, 0.01, [x - 0.08, 1.24, fz - 0.02], WHITE, { rot: [0, 0, -0.6], r: 0.005, steps: 1, key: "shine" });
  }
  k.box(dw, 0.035, 0.035, [dcx, caseTop - 0.06, fz - 0.01], "#e8f6ff", { r: 0.012, steps: 1, key: "glass" });
  // lower level: croissants, donuts, loaves
  const y0 = 0.855 + OL;
  for (let i = 0; i < 3; i++) croissant(k, [CXb + 0.35 + i * 0.3, y0, CZ - 0.18], 0.2 * i - 0.2, 1.05);
  const gl = ["#f9a8c4", "#fff6e6", "#c9b3f2", "#ffe08a"];
  for (let i = 0; i < 4; i++) donut(k, [CXb + 1.35 + i * 0.25, y0, CZ - 0.18 + (i % 2) * 0.05], gl[i], 1.25);
  loaf(k, [CXb + 0.55, y0, CZ + 0.2], 0.1, 0.95);
  boule(k, [CXb + 1.15, y0, CZ + 0.2], 0.9);
  loaf(k, [CXb + 1.8, y0, CZ + 0.2], -0.15, 0.95);
  boule(k, [CXb + 2.4, y0, CZ + 0.2], 0.85);
  // upper level: cupcakes + macarons
  const y1 = 1.2 + OL;
  const cc: [ColorLike, ColorLike][] = [
    [WHITE, PINK],
    ["#f8b9cb", MINT],
    ["#c9b3f2", BUTTER],
    ["#bfe9d6", PINK],
  ];
  cc.forEach(([f, w], i) => cupcake(k, [CXb + 0.3 + i * 0.25, y1, CZ - 0.12], f, w, 1.0));
  macaronPile(k, [CXb + 2.05, y1, CZ - 0.05], ["#f7a8c0", "#bfe9d6", "#ffe08a", "#c9b3f2"], 1.3);
  // on top of the case: a tiered celebration cake + cupcake plate
  const tc: V3 = [CXc - 0.55, caseTop + 0.035 + OL, CZ + 0.05];
  k.cyl(0.05, 0.42, 0.36, tc, WHITE, { bevel: 0.02, seg: 20 });
  cakeRound(k, [tc[0], tc[1] + 0.05, tc[2]], 0.34, 0.26, "#fff0c9", "#fbd3e0", { berries: 0 });
  cakeRound(k, [tc[0], tc[1] + 0.35, tc[2]], 0.25, 0.22, "#fff0c9", WHITE, { berries: 0 });
  flowerCake(k, [tc[0], tc[1] + 0.6, tc[2]], 0.16, 0.18, "#f9c2d3");
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2 + 0.3;
    strawberry(k, [tc[0] + Math.cos(a) * 0.28, tc[1] + 0.38, tc[2] + Math.sin(a) * 0.28], 0.04);
  }
  k.disc(0.3, 0.03, [CXb + 0.6, caseTop + 0.035 + OL, CZ], WHITE, { seg: 16 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.4;
    cupcake(k, [CXb + 0.6 + Math.cos(a) * 0.14, caseTop + 0.065 + OL * 2, CZ + Math.sin(a) * 0.14], ["#f8b9cb", WHITE, "#c9b3f2"][i], [MINT, PINK, BUTTER][i], 1.0);
  }
  ctx.box((CXa + CXc) / 2, CZ, CXc - CXa + 0.12, CD + 0.14);
  ctx.spot("counter", (CXa + CXb) / 2, 0, fz - 0.65);
  ctx.spot("display", dcx, 0, fz - 0.65);

  /* ================= behind the counter: cabinet, shelves, mixer ================= */
  const BX = 3.15,
    BW = 4.0;
  k.box(BW, 0.92, 0.58, [BX, 0.46, Z1 - 0.31], CREAM, { r: 0.08, bottom: "#f3e2cf" });
  k.box(BW + 0.1, 0.07, 0.64, [BX, 0.95, Z1 - 0.32], MINT_DEEP, { r: 0.03 });
  for (let i = 0; i < 4; i++) {
    const x = BX - BW / 2 + BW * ((i + 0.5) / 4);
    k.puff(roundRectPts(BW / 4 - 0.16, 0.62, 0.1), 0.05, [x, 0.46, Z1 - 0.62], MINT, { bevel: 0.02 });
    k.ball(0.04, [x + (i % 2 ? -0.32 : 0.32), 0.5, Z1 - 0.67], WHITE, { seg: 6 });
  }
  const bt = 0.985 + OL;
  standMixer(k, [1.65, bt, Z1 - 0.32], MINT, 1.15);
  for (let i = 0; i < 4; i++) k.disc(0.17, 0.025, [2.4, bt + i * 0.03, Z1 - 0.3], i % 2 ? WHITE : "#fde7ef", { seg: 16, key: "fine" });
  mixingBowl(k, [3.1, bt, Z1 - 0.3], WHITE, PINK, 0.85);
  for (let i = 0; i < 3; i++) jar(k, [3.85 + i * 0.32, bt, Z1 - 0.28], ["#ffcf6e", "#f47a9a", "#c98d68"][i], [PINK, MINT, BUTTER][i], 0.95);
  // bread shelves
  onBack(k, BX, 1.82, () => wallShelf(k, [0, 0, 0], BW - 0.1, 0.44, WOOD, WOOD_DEEP));
  onBack(k, BX, 2.62, () => wallShelf(k, [0, 0, 0], BW - 0.1, 0.44, WOOD, WOOD_DEEP));
  const s1 = 1.82 + OL,
    s2 = 2.62 + OL,
    sz = Z1 - 0.22;
  loaf(k, [1.55, s1, sz], 0.1, 1.05);
  loaf(k, [2.1, s1, sz], -0.1, 1.05);
  boule(k, [2.6, s1, sz], 1.0);
  boule(k, [3.0, s1, sz], 0.9);
  loaf(k, [3.5, s1, sz], 0.05, 1.0);
  // baguette crock
  k.cyl(0.32, 0.17, 0.15, [4.15, s1, sz], "#a8d8f0", { bevel: 0.04, seg: 14 });
  for (let i = 0; i < 4; i++) baguette(k, [4.15 + (i - 1.5) * 0.06, s1 + 0.1, sz + (i % 2) * 0.04], [-0.1, 0, (i - 1.5) * 0.14], 0.62, 1.0);
  boule(k, [4.65, s1, sz], 0.8);
  for (let i = 0; i < 5; i++) jar(k, [1.5 + i * 0.7, s2, sz], ["#ffcf6e", "#f47a9a", "#a8e2c4", "#c98d68", "#c9b3f2"][i], [PINK, MINT, BUTTER, PINK, MINT][i], 1.05);
  pottedPlant(k, [4.85, s2, sz], { kind: "bush", potColor: CREAM, rim: PINK, size: 0.75, seed: 21 });
  ctx.box(BX, Z1 - 0.32, BW + 0.1, 0.7);
  ctx.spot("npc", 2.4, 0, 2.62);

  /* ================= left wall: prep table, pans, window ================= */
  const PX = X0 + 0.48,
    PZ = 0.5,
    PL = 2.2;
  k.box(0.88, 0.09, PL, [PX, 0.9, PZ], WOOD, { r: 0.04, bottom: WOOD_DEEP });
  for (const dz of [-1, 1]) for (const dx of [-1, 1]) k.box(0.09, 0.86, 0.09, [PX + dx * 0.34, 0.43, PZ + dz * (PL / 2 - 0.1)], CREAM, { r: 0.035 });
  k.box(0.76, 0.05, PL - 0.2, [PX, 0.24, PZ], WOOD_DEEP, { r: 0.02 });
  // lower shelf: stacked bowls + small sack
  for (let i = 0; i < 2; i++)
    k.lathe(
      [
        [0, 0],
        [0.1, 0],
        [0.2, 0.1],
        [0.18, 0.11],
        [0, 0.05],
      ],
      [PX, 0.265 + OL + i * 0.06, PZ - 0.5],
      i ? MINT : PINK,
      { seg: 14 },
    );
  for (let i = 0; i < 3; i++) jar(k, [PX, 0.265 + OL, PZ + 0.2 + i * 0.3], ["#fff6e6", "#ffcf6e", "#f6e3c4"][i], [MINT, PINK, BUTTER][i], 0.9);
  const pt = 0.945 + OL;
  mixingBowl(k, [PX + 0.02, pt, PZ - 0.55], WHITE, MINT, 1.05);
  k.box(0.58, 0.04, 0.62, [PX + 0.02, pt + 0.02, PZ + 0.3], "#f6e3c4", { r: 0.02, steps: 1 });
  k.blob(0.16, 0.1, 0.15, [PX, pt + 0.12, PZ + 0.2], DOUGH, { seg: 9 });
  rollingPin(k, [PX + 0.05, pt + 0.04, PZ + 0.45], PI / 2 + 0.3, 1.0);
  for (let i = 0; i < 3; i++) k.blob(0.05, 0.06, 0.05, [PX - 0.15 + i * 0.08, pt + 0.06, PZ + 0.95], "#fff6e6", { seg: 6 });
  ctx.box(PX, PZ, 0.98, PL + 0.1);
  ctx.spot("prep_table", PX + 1.15, 0, PZ);
  // hanging rail of copper pans + whisks
  onLeft(k, PZ, 2.62, () => {
    k.rod(PL + 0.2, 0.03, [0, 0, -0.28], "#6d5a78", { rot: [0, 0, PI / 2], seg: 6 });
    for (const s of [-1, 1]) k.box(0.06, 0.06, 0.3, [s * (PL / 2 + 0.05), 0, -0.14], "#6d5a78", { r: 0.02, steps: 1 });
    hangingPan(k, [-0.82, 0, -0.28], 0.17);
    hangingPan(k, [-0.3, 0, -0.28], 0.22);
    hangingPan(k, [0.25, 0, -0.28], 0.15);
    whisk(k, [0.62, -0.05, -0.28], [PI, 0, 0], 1.1, PINK);
    whisk(k, [0.85, -0.05, -0.28], [PI, 0, 0], 0.9, MINT);
    // ladle
    k.rod(0.42, 0.016, [-1.05, -0.23, -0.28], COPPER, { seg: 5 });
    k.lathe(
      [
        [0, 0],
        [0.06, 0.01],
        [0.08, 0.06],
        [0, 0.06],
      ],
      [-1.05, -0.5, -0.28],
      COPPER,
      { seg: 10 },
    );
  });
  // arched garden window over the café corner
  onLeft(k, -2.35, 1.3, () => archWindow(k, [0, 0, 0], 1.25, 1.6, { frame: WHITE, view: "garden", sill: CREAM, curtains: PINK }));
  onLeft(k, -2.35, 1.3, () => {
    flowerPot(k, [-0.32, 0.01 + OL, -0.15], "tulip", ["#f47a9a", "#ffe066"], { potColor: CREAM, size: 0.55, seed: 3 });
    cupcake(k, [0.3, 0.01 + OL, -0.13], WHITE, PINK, 1.2);
  });

  /* ================= café tables ================= */
  const setTable = (t: V3, angs: number[], rug: [string, string], cupA: string, seed: number) => {
    const rr = rng(seed);
    fluffyRug(k, t, 1.05, rug[0], rug[1]);
    const topY = cafeTable(k, [t[0], 0.11, t[2]], WHITE);
    const seats: V3[] = [];
    for (const a of angs) {
      const c: V3 = [t[0] + Math.cos(a) * 0.82, 0.11, t[2] + Math.sin(a) * 0.82];
      cafeChair(k, c, PI / 2 - a, rug[0] === "#bfe9d6" ? MINT : PINK, CREAM, 1.05);
      seats.push(c);
      ctx.circle(c[0], c[2], 0.3);
    }
    const y = topY + OL;
    teacup(k, [t[0] - 0.18, y, t[2] - 0.12], WHITE, cupA, 1.1, 0.5);
    teacup(k, [t[0] + 0.2, y, t[2] + 0.12], WHITE, PINK, 1.1, 2.5);
    k.disc(0.12, 0.02, [t[0] + 0.1, y, t[2] - 0.2], WHITE, { key: "fine", seg: 14 });
    if (rr() < 0.5) cakeSlice(k, [t[0] + 0.1, y, t[2] - 0.2], 0.6, "#fff0c9", "#f8b9cb", 0.9);
    else croissant(k, [t[0] + 0.1, y + 0.02, t[2] - 0.2], 0.3, 0.85, "fine");
    ctx.circle(t[0], t[2], 0.55);
    return { seat: seats[0], top: topY };
  };
  const T0 = setTable([-3.25, 0, -2.2], [-0.4, PI - 0.4], ["#bfe9d6", "#e3f6ec"], MINT, 5);
  const T1 = setTable([2.95, 0, -2.15], [-PI + 0.4, 0.4], ["#f8bdd0", "#fcd9e5"], "#c9b3f2", 6);
  ctx.spot("cafe_table_0", T0.seat[0], 0.6, T0.seat[2]);
  ctx.spot("cafe_table_1", T1.seat[0], 0.6, T1.seat[2]);
  ctx.spot("cafe_table_0_top", -3.25, T0.top, -2.2);
  ctx.spot("cafe_table_1_top", 2.95, T1.top, -2.15);

  /* ================= plants ================= */
  pottedPlant(k, [4.6, 0, -3.55], { kind: "tall", potColor: MINT, rim: CREAM, size: 1.6, seed: 12, heart: WHITE });
  ctx.circle(4.6, -3.55, 0.45);

  /* ================= string lights (twinkle) ================= */
  const bulbA = uniqueMat(scene, "bakery_bulbA", { emissive: "#ffe39a" }) as StandardMaterial;
  const bulbB = uniqueMat(scene, "bakery_bulbB", { emissive: "#ffc2d6" }) as StandardMaterial;
  const wireY = WALL_H - 0.42;
  const sagY = (t: number) => wireY - Math.sin(t * PI * 3) ** 2 * 0.22;
  const backPath: V3[] = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    backPath.push([X0 + 0.2 + (X1 - 0.3 - X0 - 0.2) * t, sagY(t), Z1 - 0.1]);
  }
  const leftPath: V3[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    leftPath.push([X0 + 0.1, wireY - Math.sin(t * PI * 2.5) ** 2 * 0.22, Z1 - 0.2 - (Z1 - 0.2 - Z0 - 0.4) * t]);
  }
  k.tube(backPath, 0.014, "#6d5a78", { key: "fine", tess: 4 });
  k.tube(leftPath, 0.014, "#6d5a78", { key: "fine", tess: 4 });
  const bulbs = (mat: StandardMaterial, name: string, odd: number) =>
    k.anim(name, { material: mat, outline: 0.02, castShadow: false }, () => {
      backPath.forEach((p, i) => {
        if (i % 2 || i === 0 || i === backPath.length - 1) return;
        if ((i / 2) % 2 !== odd) return;
        k.blob(0.06, 0.08, 0.06, [p[0], p[1] - 0.09, p[2] - 0.04], WHITE, { seg: 4 });
      });
      leftPath.forEach((p, i) => {
        if (i % 2 || i === 0 || i === leftPath.length - 1) return;
        if ((i / 2) % 2 !== odd) return;
        k.blob(0.06, 0.08, 0.06, [p[0] + 0.04, p[1] - 0.09, p[2]], WHITE, { seg: 4 });
      });
    });
  bulbs(bulbA, "bakery_bulbs_a", 0);
  bulbs(bulbB, "bakery_bulbs_b", 1);
  const bulbBaseA = bulbA.emissiveColor.clone(),
    bulbBaseB = bulbB.emissiveColor.clone();

  /* ================= steam ================= */
  const steamMat = uniqueMat(scene, "bakery_steam_in", { emissive: "#fff8f0" }) as StandardMaterial;
  steamMat.alpha = 0.75;
  const steam: { m: Mesh; src: Vector3; sp: number; ph: number; h: number }[] = [];
  const srcs: [Vector3, number, number][] = [
    [new Vector3(BT[0], BT[1] + 0.2, BT[2]), 0.45, 0.7],
    [new Vector3(BT[0] + 0.1, BT[1] + 0.2, BT[2] + 0.05), 0.45, 0.7],
    [new Vector3(OX - 0.2, 1.75, OZ - 0.35), 0.3, 1.0],
    [new Vector3(OX + 0.25, 1.75, OZ - 0.35), 0.3, 1.0],
    [new Vector3(-3.25 - 0.18, 1.0, -2.2 - 0.12), 0.4, 0.5],
    [new Vector3(2.95 + 0.2, 1.0, -2.15 + 0.12), 0.4, 0.5],
  ];
  srcs.forEach(([src, sp, h], i) => {
    const m = k.anim(`bakery_steam_in${i}`, { material: steamMat, outline: false, castShadow: false }, () => k.ball(0.07, [0, 0, 0], "#ffffff", { seg: 6 }));
    if (m) steam.push({ m, src, sp, ph: (i * 0.37) % 1, h });
  });

  void Color3;
  return finishInterior(
    "bakery",
    k,
    ctx,
    "#f9d3c4",
    (_dt, t) => {
      const g = 0.86 + Math.sin(t * 2.2) * 0.08 + Math.sin(t * 7.3) * 0.04 + Math.sin(t * 13.1) * 0.02;
      ovenMat.emissiveColor.copyFrom(ovenBase).scaleInPlace(g);
      bulbA.emissiveColor.copyFrom(bulbBaseA).scaleInPlace(0.85 + Math.max(0, Math.sin(t * 1.7)) * 0.2);
      bulbB.emissiveColor.copyFrom(bulbBaseB).scaleInPlace(0.85 + Math.max(0, Math.sin(t * 1.7 + PI)) * 0.2);
      for (const s of steam) {
        const ph = (t * s.sp + s.ph) % 1;
        s.m.position.set(s.src.x + Math.sin(ph * 6 + s.ph * 9) * 0.06, s.src.y + ph * s.h, s.src.z);
        s.m.scaling.setAll(0.4 + ph * 1.2 - ph * ph * 0.8 + 0.001);
        s.m.visibility = 1 - ph;
      }
    },
    "#ffeedd",
  );
}
