/**
 * Mocha's Bakery & Café — exterior. A cosy corner bakery on a tiled square base: box shop with a fat
 * strawberry sign band, a GIANT glazed donut on the roof with Mocha's mascot cat peeking over the rim,
 * striped scalloped awnings on the front and the patio side, open counter windows full of bakes,
 * crates & baskets of bread outside and a little café patio with umbrellas and an order board.
 *
 * Local space: door faces -Z, ground y = 0, building centre at origin.
 * Footprint ≈ x ∈ [-4.8, 4.8], z ∈ [-6.0, 3.4] (front edge 6 m in front of the centre). The shop sits on the
 * left (shadow side, the sun comes from +X) and the café patio is on the sunny right.
 */
import { Vector3, type Scene, type Mesh, type StandardMaterial } from "@babylonjs/core";
import { Kit, circlePts, heartPts, roundRectPts, scallopPts, uniqueMat, OL, type V3, type P2 } from "./kit";
import { PI, bush, stool, pot, leaf } from "./props";
import { awning } from "./int_flowershop";
import { extDoor, extWindow, type Built } from "./exteriors";
import {
  loaf,
  boule,
  baguette,
  croissant,
  bun,
  bagel,
  donut,
  cupcake,
  flowerCake,
  rollingPin,
  pipingBag,
  cafeTable,
  cafeChair,
  cafeUmbrella,
  chalkIcon,
  pawMat,
  heartLo,
  breadCrate,
  SPRINKLES,
} from "./bakery_props";
import { jitterCol, mixCol, rng } from "../../render/Palette";
import type { ColorLike } from "../../render/Shapes";

/* ------------------------------------------------------------------ */
/* layout constants (local)                                             */
/* ------------------------------------------------------------------ */

const G = 0.1; // tiled plinth top
const FB = 0.25; // shop foundation above the plinth
const FL = G + FB; // shop floor level
const SX = -1.5,
  SZ = 0.7,
  W = 5.0,
  D = 4.4,
  H = 3.0;
const XL = SX - W / 2,
  XR = SX + W / 2,
  ZF = SZ - D / 2,
  ZB = SZ + D / 2;
const TOP = FL + H; // wall top
const BAND = 1.0; // sign band
const ROOF = TOP + BAND;
const DX = -0.1; // door centre x
const WX = -2.5, // front window centre x
  WW = 2.3;
const PX0 = -4.8,
  PX1 = 4.8,
  PZ0 = -6.0,
  PZ1 = 3.4;

const WALL = "#fff1dc",
  WALL_DEEP = "#f8d9bd",
  STRAW = "#f48fab",
  STRAW_DEEP = "#e8789a",
  PINK = "#f7a8c0",
  CREAM = "#fff6e6",
  MINT = "#a8e2c4",
  BUTTER = "#fde7a6",
  WOOD = "#e8c49a",
  WOOD_DEEP = "#d6aa7c",
  MORTAR = "#f8d3c8",
  BRICK = "#f3a79d";
const MOCHA = "#e6b48a",
  MOCHA_DEEP = "#d39c70",
  MOCHA_CREAM = "#fff3e2";
const INK = "#4a3a52";

/* ------------------------------------------------------------------ */
/* parts                                                                */
/* ------------------------------------------------------------------ */

/** open counter window on a wall (frame: local -Z out, x along wall, y=0 at the ledge). Returns inner-shelf & ledge heights */
function openWindow(k: Kit, w: number, h: number, shutter: ColorLike) {
  // warm interior glow seen through the opening
  k.puff(
    roundRectPts(w, h, 0.1).map(([x, y]) => [x, y + h / 2] as P2),
    0.06,
    [0, 0, -0.03],
    "#ffe2a6",
    { key: "winGlow", bevel: 0.02, bottom: "#ffc884" },
  );
  // deep reveal: jambs + head
  for (const s of [-1, 1]) k.box(0.18, h + 0.12, 0.34, [s * (w / 2 + 0.03), h / 2, -0.17], CREAM, { r: 0.07, steps: 1 });
  k.box(w + 0.42, 0.18, 0.36, [0, h + 0.04, -0.18], CREAM, { r: 0.08, steps: 1 });
  heartLo(k, [0, h + 0.05, -0.39], 0.2, STRAW, 0.06);
  // inner shelf
  const shelfY = h * 0.45;
  k.box(w - 0.12, 0.06, 0.24, [0, shelfY, -0.15], WOOD, { r: 0.025, steps: 1 });
  // counter ledge with brackets
  k.box(w + 0.5, 0.12, 0.62, [0, -0.02, -0.28], WOOD, { r: 0.05, bottom: WOOD_DEEP });
  k.box(w + 0.42, 0.05, 0.05, [0, -0.1, -0.58], "#fff6e6", { r: 0.02, key: "fine" });
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) {
    k.puff(
      [
        [0, 0],
        [0.48, 0],
        [0.05, -0.38],
        [0, -0.38],
      ],
      0.07,
      [x, -0.08, 0],
      WOOD_DEEP,
      { rot: [0, PI / 2, 0], bevel: 0.025 },
    );
  }
  // open shutters folded back against the wall
  for (const s of [-1, 1]) {
    k.puff(roundRectPts(0.32, h * 0.9, 0.1), 0.07, [s * (w / 2 + 0.3), h * 0.5, -0.06], shutter, { bevel: 0.03 });
    heartLo(k, [s * (w / 2 + 0.3), h * 0.62, -0.13], 0.13, CREAM, 0.035);
    for (const y of [0.25, 0.4]) k.box(0.22, 0.035, 0.03, [s * (w / 2 + 0.3), h * y, -0.12], mixCol(shutter as string, "#ffffff", 0.35), { r: 0.012, steps: 1, key: "fine" });
  }
  return { shelfY: shelfY + 0.03 + OL, ledgeY: 0.04 + OL };
}

/** pastel brick decals on a wall face (frame: local -Z out), rows from y0 */
function bricks(k: Kit, x0: number, x1: number, y0: number, rows: number, z: number, skip: (x: number) => boolean, seed: number) {
  const r = rng(seed);
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? 0.21 : 0;
    for (let x = x0 + 0.2 + off; x < x1 - 0.15; x += 0.42) {
      if (skip(x)) continue;
      k.decal(roundRectPts(0.36, 0.15, 0.05, 2), [x, y0 + row * 0.2, z], jitterCol(BRICK, 0.025, r), { t: 0.02 });
    }
  }
}

/** fluffy round tree in a planter ring, p = ground */
function fluffyTree(k: Kit, p: V3, s: number, seed: number) {
  const r = rng(seed);
  k.cyl(0.32, 0.55 * s, 0.6 * s, p, "#f3d0c4", { bevel: 0.08, bottom: "#e6b4a6", seg: 18 });
  k.disc(0.5 * s, 0.05, [p[0], p[1] + 0.3, p[2]], "#a6dc8c", { seg: 16 });
  k.cyl(1.25 * s, 0.14 * s, 0.22 * s, [p[0], p[1] + 0.3, p[2]], "#c99a6b", { bevel: 0.05, bottom: "#a3754d", seg: 10 });
  const c: V3 = [p[0], p[1] + 2.25 * s, p[2]];
  const cols = ["#8fd27a", "#7cc86f", "#a6dc8c", "#6fbf73"];
  k.ball(1.0 * s, c, cols[0], { key: "fluffy", seg: 11 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + r() * 0.5;
    const up = (r() - 0.45) * 0.7;
    k.ball((0.55 + r() * 0.12) * s, [c[0] + Math.cos(a) * 0.78 * s, c[1] + up * s, c[2] + Math.sin(a) * 0.78 * s], cols[(i + 1) % cols.length], { key: "fluffy", seg: 8 });
  }
  k.ball(0.62 * s, [c[0] - 0.1, c[1] + 0.72 * s, c[2]], cols[2], { key: "fluffy", seg: 9 });
  // little round blossoms dotted over the canopy
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + 0.6;
    const yy = (i % 3) * 0.35 - 0.25;
    k.ball(0.085 * s, [c[0] + Math.cos(a) * 1.18 * s, c[1] + yy * s, c[2] + Math.sin(a) * 1.18 * s], i % 2 ? "#f8b9cb" : "#fffdf8", { seg: 4 });
  }
}

/** flowering bush with lots of small blossoms */
function blossomBush(k: Kit, p: V3, s: number, seed: number, blossoms: string[]) {
  const r = rng(seed);
  bush(k, p, s, seed, "fluffy", ["#8fd27a", "#6fbf73", "#a6dc8c"], 6, 5);
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * PI * 2 + r() * 0.4;
    const el = 0.2 + r() * 1.0;
    const rr = s * 0.72;
    const x = p[0] + Math.cos(a) * Math.cos(el) * rr,
      z = p[2] + Math.sin(a) * Math.cos(el) * rr,
      y = p[1] + s * 0.45 + Math.sin(el) * rr * 0.8;
    k.ball(0.06 * s + 0.02, [x, y, z], blossoms[i % blossoms.length], { seg: 3, key: "fine" });
  }
}

/** chalkboard A-frame with pastry pictures; p = ground centre, faces local -Z */
function orderBoard(k: Kit, p: V3, rotY: number) {
  const L = 1.25,
    tilt = 0.24;
  k.at(k.frame(p, rotY), () => {
    const hinge: V3 = [0, L * Math.cos(tilt), 0];
    // back leaf
    k.at(k.frame(hinge, [-tilt, 0, 0]), () => {
      k.box(0.82, L, 0.07, [0, -L / 2, 0.04], WOOD, { r: 0.03 });
    });
    // front leaf
    k.at(k.frame(hinge, [tilt, 0, 0]), () => {
      k.puff(roundRectPts(0.9, L, 0.12).map(([x, y]) => [x, y - L / 2] as P2), 0.08, [0, 0, -0.02], WOOD, { bevel: 0.03, bottom: WOOD_DEEP });
      // chalk surface (soft slate)
      k.puff(roundRectPts(0.72, L - 0.3, 0.08).map(([x, y]) => [x, y - L / 2 - 0.02] as P2), 0.04, [0, 0, -0.075], "#5d6b72", { bevel: 0.015 });
      // header scallop + heart
      k.puff(scallopPts(0.82, 0.1, 6, 4), 0.05, [0, -0.13, -0.08], STRAW, { bevel: 0.02, spine: [[-0.41, 0.05], [0.41, 0.05]] });
      heartLo(k, [0, -0.07, -0.13], 0.16, CREAM, 0.04);
      // pastry pictures (chalky pastel, lifted clear of the outlined board)
      const z = -0.1 - OL;
      chalkIcon(k, "croissant", [-0.17, -0.42, z], 0.95);
      chalkIcon(k, "cupcake", [0.17, -0.42, z], 0.95);
      chalkIcon(k, "donut", [-0.17, -0.74, z], 0.95);
      chalkIcon(k, "cup", [0.17, -0.74, z], 0.95);
      // little "price" dots
      for (const [x, y] of [
        [-0.17, -0.58],
        [0.17, -0.58],
        [-0.17, -0.9],
        [0.17, -0.9],
      ])
        for (let i = 0; i < 3; i++) k.decal(circlePts(0.016, 8), [x - 0.04 + i * 0.04, y, z], i === 1 ? "#ffe066" : "#f6f0fa", { t: 0.01 });
      // chalk tray
      k.box(0.78, 0.05, 0.12, [0, -L + 0.12, -0.1], WOOD_DEEP, { r: 0.02 });
      k.box(0.12, 0.035, 0.035, [0.2, -L + 0.17, -0.12], "#fffdf8", { r: 0.012, steps: 1, key: "fine" });
      k.box(0.1, 0.035, 0.035, [0.05, -L + 0.17, -0.12], "#f8b9cb", { r: 0.012, steps: 1, key: "fine" });
    });
  });
}

/** small café set: table + umbrella + 2 chairs. Returns front seat pos & table-top height */
function cafeSet(k: Kit, t: V3, umbA: string, umbB: string, top: string, chairC: string, cupA: string, seed: number) {
  const r = rng(seed);
  const topY = cafeTable(k, t, top);
  cafeUmbrella(k, t, umbA, umbB, 1, 2.15, 1.05);
  const seats: V3[] = [];
  for (const a of [-PI / 2 + 0.55, PI / 2 + 0.55]) {
    const c: V3 = [t[0] + Math.cos(a) * 0.78, t[1], t[2] + Math.sin(a) * 0.78];
    cafeChair(k, c, PI / 2 - a, chairC, CREAM);
    seats.push(c);
  }
  // goodies on the table
  const y = topY + OL;
  k.disc(0.16, 0.02, [t[0] - 0.12, y, t[2] - 0.08], "#fffdf8", { key: "fine", seg: 14 });
  if (r() < 0.5) croissant(k, [t[0] - 0.12, y + 0.02, t[2] - 0.08], 0.4, 0.9, "fine");
  else cupcake(k, [t[0] - 0.12, y + 0.02, t[2] - 0.08], "#fff6e6", "#a8d8f0", 0.9, "fine");
  teacupMini(k, [t[0] + 0.16, y, t[2] + 0.06], cupA);
  return { seat: seats[0], seat2: seats[1], topY };
}

function teacupMini(k: Kit, p: V3, accent: string) {
  k.disc(0.09, 0.018, p, "#fffdf8", { key: "fine", seg: 12 });
  k.lathe(
    [
      [0, 0.015],
      [0.035, 0.015],
      [0.06, 0.045],
      [0.065, 0.09],
      [0.058, 0.09],
      [0, 0.08],
    ],
    p,
    "#fffdf8",
    { key: "fine", seg: 12, bottom: accent },
  );
  k.torus(0.025, 0.012, [p[0] + 0.07, p[1] + 0.055, p[2]], "#fffdf8", { rot: [PI / 2, 0, 0], key: "fine", seg: 8 });
  k.disc(0.05, 0.015, [p[0], p[1] + 0.08, p[2]], "#c98d68", { key: "fine", seg: 10 });
}

/* ------------------------------------------------------------------ */
/* build                                                                */
/* ------------------------------------------------------------------ */

export function buildBakeryExt(k: Kit, scene: Scene): Built {
  const r = rng(58);

  /* ---------- tiled square plinth ---------- */
  const pcx = (PX0 + PX1) / 2,
    pcz = (PZ0 + PZ1) / 2;
  // NB: no outlined slab under the tiles — Babylon's outline pass (polygon-offset) would paint over thin
  // tiles. Instead: un-outlined grout base + an outlined sticker border ring around the tiles.
  const bw = 0.26;
  k.plainBox(PX1 - PX0 - 0.2, 0.06, PZ1 - PZ0 - 0.2, [pcx, 0.0, pcz], "#ecccbd");
  for (const sz of [-1, 1]) k.box(PX1 - PX0, 0.22, bw, [pcx, 0.01, sz < 0 ? PZ0 + bw / 2 : PZ1 - bw / 2], "#f6dccd", { key: "shell", r: 0.09, steps: 2, bottom: "#e3bba8" });
  for (const sx of [-1, 1]) k.box(bw, 0.22, PZ1 - PZ0 - 0.1, [sx < 0 ? PX0 + bw / 2 : PX1 - bw / 2, 0.01, pcz], "#f6dccd", { key: "shell", r: 0.09, steps: 2, bottom: "#e3bba8" });
  const tx0 = PX0 + bw,
    tx1 = PX1 - bw,
    tz0 = PZ0 + bw,
    tz1 = PZ1 - bw;
  const ts = 0.8;
  const nx = Math.round((tx1 - tx0) / ts),
    nz = Math.round((tz1 - tz0) / ts);
  const tw = (tx1 - tx0) / nx,
    td = (tz1 - tz0) / nz;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = tx0 + (i + 0.5) * tw,
        z = tz0 + (j + 0.5) * td;
      if (x > XL - 0.1 && x < XR + 0.1 && z > ZF - 0.1 && z < ZB + 0.1) continue;
      const c = jitterCol((i + j) % 2 ? "#fff4e6" : "#fbd9d0", 0.012, r);
      k.plainBox(tw - 0.07, 0.1, td - 0.07, [x, 0.05, z], c);
    }

  /* ---------- shop body ---------- */
  k.box(W + 0.4, FB + 0.06, D + 0.4, [SX, G + FB / 2 - 0.03, SZ], "#f2bcb0", { r: 0.1, bottom: "#e49d90" });
  k.box(W, H, D, [SX, FL + H / 2, SZ], WALL, { r: 0.18, steps: 2, bottom: WALL_DEEP });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.3, H, 0.3, [SX + (sx * W) / 2, FL + H / 2, SZ + (sz * D) / 2], PINK, { r: 0.12 });
  // brick wainscot + rail
  const wsH = 0.85;
  k.box(W + 0.08, wsH, D + 0.08, [SX, FL + wsH / 2, SZ], MORTAR, { r: 0.05, steps: 1 });
  k.capsule(W + 0.12, 0.055, [SX, FL + wsH, ZF - 0.06], CREAM, { rot: [0, 0, PI / 2] });
  for (const sx of [-1, 1]) k.capsule(D + 0.12, 0.055, [SX + sx * (W / 2 + 0.06), FL + wsH, SZ], CREAM, { rot: [PI / 2, 0, 0] });
  const bz = -0.04 - 0.012 - OL;
  k.at(k.frame([0, FL + 0.13, ZF], 0), () => bricks(k, XL + 0.1, XR - 0.1, 0, 4, bz, (x) => Math.abs(x - DX) < 0.82, 3));
  k.at(k.frame([XR, FL + 0.13, SZ], -PI / 2), () => bricks(k, -D / 2 + 0.1, D / 2 - 0.1, 0, 4, bz, () => false, 4));

  /* ---------- sign band, roof rim ---------- */
  const BW = W + 0.34,
    BD = D + 0.34;
  k.box(BW, BAND, BD, [SX, TOP + BAND / 2 - 0.03, SZ], STRAW, { r: 0.16, steps: 2, bottom: STRAW_DEEP });
  const RW = W + 0.52,
    RD = D + 0.52;
  k.box(W + 0.2, 0.08, D + 0.2, [SX, ROOF - 0.01, SZ], "#f7dccd", { r: 0.03, steps: 1 });
  k.box(RW, 0.24, 0.3, [SX, ROOF + 0.05, SZ - RD / 2 + 0.15], CREAM, { r: 0.11 });
  k.box(RW, 0.24, 0.3, [SX, ROOF + 0.05, SZ + RD / 2 - 0.15], CREAM, { r: 0.11 });
  for (const sx of [-1, 1]) k.box(0.3, 0.24, RD, [SX + sx * (RW / 2 - 0.15), ROOF + 0.05, SZ], CREAM, { r: 0.11 });
  // cream scallops under the band, front + patio side
  const nS = Math.round(BW / 0.36);
  k.at(k.frame([SX, TOP - 0.02, SZ - BD / 2 - 0.03], 0), () => {
    k.puff(scallopPts(BW - 0.1, 0.13, nS, 5), 0.08, [0, 0, 0], CREAM, { bevel: 0.035, spine: [[-BW / 2, 0.06], [BW / 2, 0.06]] });
  });
  const nSd = Math.round(BD / 0.36);
  for (const sx of [-1, 1])
    k.at(k.frame([SX + sx * (BW / 2 + 0.03), TOP - 0.02, SZ], sx < 0 ? PI / 2 : -PI / 2), () => {
      k.puff(scallopPts(BD - 0.1, 0.13, nSd, 5), 0.08, [0, 0, 0], CREAM, { bevel: 0.035, spine: [[-BD / 2, 0.06], [BD / 2, 0.06]] });
    });
  // polka dots on the band
  const bandY = TOP + BAND / 2 - 0.03;
  const dotZ = -0.012 - OL;
  k.at(k.frame([SX, bandY, SZ - BD / 2], 0), () => {
    for (let x = -BW / 2 + 0.3; x < BW / 2 - 0.2; x += 0.36) {
      if (Math.abs(x) < 0.85 || Math.abs(Math.abs(x) - 1.75) < 0.55) continue;
      for (const y of [-0.2, 0.2]) k.decal(circlePts(0.055, 10), [x + (y > 0 ? 0.18 : 0), y, dotZ], CREAM, { t: 0.015 });
    }
  });
  k.at(k.frame([SX + BW / 2, bandY, SZ], -PI / 2), () => {
    for (let x = -BD / 2 + 0.3; x < BD / 2 - 0.2; x += 0.36) {
      if (Math.abs(x) < 0.8) continue;
      for (const y of [-0.2, 0.2]) k.decal(circlePts(0.055, 10), [x + (y > 0 ? 0.18 : 0), y, dotZ], CREAM, { t: 0.015 });
    }
  });
  // big croissant medallion (front centre)
  k.at(k.frame([SX, bandY, SZ - BD / 2], 0), () => {
    k.puff(circlePts(0.66, 36), 0.14, [0, 0, -0.06], CREAM, { bevel: 0.06 });
    k.puff(scallopRing(0.56, 16), 0.06, [0, 0, -0.15], BUTTER, { bevel: 0.025 });
    k.at(k.frame([0, -0.03, -0.2], [0, 0, PI]), () => k.at(k.frame([0, 0, 0], [-PI / 2, 0, 0]), () => croissant(k, [0, -0.06, 0], 0, 2.3)));
    // side medallions: loaf + cupcake hearts
    for (const sx of [-1, 1]) {
      k.puff(heartPts(0.9, 30), 0.12, [sx * 1.75, -0.02, -0.05], CREAM, { bevel: 0.05 });
      if (sx < 0) loaf(k, [-1.75, -0.2, -0.24], 0, 1.45);
      else cupcake(k, [1.75, -0.24, -0.24], "#fff6e6", MINT, 1.5);
    }
  });
  // donut medallion on the patio side
  k.at(k.frame([SX + BW / 2, bandY, SZ], -PI / 2), () => {
    k.puff(circlePts(0.5, 28), 0.14, [0, 0.06, -0.06], CREAM, { bevel: 0.06 });
    k.at(k.frame([0, 0.06, -0.16], [-PI / 2, 0, 0]), () => donut(k, [0, 0, 0], "#f9a8c4", 3.6));
  });

  /* ---------- front: door, bell, window, awnings ---------- */
  extDoor(k, [DX, FL, ZF], { color: MINT, frame: CREAM, knob: "#ffe066", w: 1.1, h: 2.1 });
  // flower charm on the door: little wreath with blossoms + bow
  const dz = ZF - 0.3;
  k.torus(0.17, 0.07, [DX, FL + 1.05, dz], "#7cc86f", { rot: [PI / 2, 0, 0], seg: 18 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.3;
    k.ball(0.045, [DX + Math.cos(a) * 0.17, FL + 1.05 + Math.sin(a) * 0.17, dz - 0.05], i % 2 ? "#fffdf8" : "#f47a9a", { seg: 6 });
  }
  for (const s of [-1, 1]) k.blob(0.07, 0.045, 0.03, [DX + s * 0.07, FL + 1.24, dz - 0.04], "#f47a9a", { rot: [0, 0, s * 0.4], seg: 6 });
  // door step + paw mat
  k.box(1.55, 0.16, 0.5, [DX, G + 0.06, ZF - 0.36], "#f3e3d6", { r: 0.06, bottom: "#e6cfbf" });
  pawMat(k, [DX, G, ZF - 1.02], PINK, CREAM, 1.2, 0.72);
  // bell on a curly bracket beside the door
  const bellHook: V3 = [DX + 0.76, FL + 2.18, ZF - 0.42];
  k.tube(
    [
      [DX + 0.76, FL + 2.3, ZF - 0.02],
      [DX + 0.76, FL + 2.32, ZF - 0.25],
      [DX + 0.76, FL + 2.24, ZF - 0.42],
    ],
    0.025,
    "#6d5a78",
    { key: "fine" },
  );
  const bell = k.anim(
    "bakery_bell",
    { outline: 0.025 },
    () => {
      k.lathe(
        [
          [0, 0],
          [0.13, 0],
          [0.12, 0.03],
          [0.085, 0.1],
          [0.07, 0.17],
          [0.03, 0.2],
          [0, 0.2],
        ],
        [bellHook[0], bellHook[1] - 0.27, bellHook[2]],
        "#ffd66e",
        { seg: 12, bottom: "#f5b94a" },
      );
      k.ball(0.04, [bellHook[0], bellHook[1] - 0.29, bellHook[2]], "#f5b94a", { seg: 6 });
      k.rod(0.07, 0.012, [bellHook[0], bellHook[1] - 0.04, bellHook[2]], "#6d5a78", { seg: 4 });
      for (const s of [-1, 1]) k.blob(0.06, 0.035, 0.025, [bellHook[0] + s * 0.06, bellHook[1] - 0.07, bellHook[2] - 0.02], "#f47a9a", { rot: [0, 0, s * 0.5], seg: 6 });
    },
    bellHook,
  );

  // front open window full of bakes
  k.at(k.frame([WX, FL + wsH + 0.02, ZF], 0), () => {
    const { shelfY, ledgeY } = openWindow(k, WW, 1.4, PINK);
    // inner shelf: loaves + buns
    loaf(k, [-0.78, shelfY, -0.15], 0.15, 0.9);
    boule(k, [-0.36, shelfY, -0.15], 0.82);
    for (let i = 0; i < 3; i++) bun(k, [0.05 + i * 0.2, shelfY, -0.14], 0.85, "main", i === 1);
    loaf(k, [0.8, shelfY, -0.15], -0.2, 0.85);
    // second row of goodies hanging back (baguettes leaning)
    for (let i = 0; i < 3; i++) baguette(k, [0.78 + i * 0.12, 0.05, -0.12], [0.18, 0, -0.25 + i * 0.12], 0.62, 0.9);
    // ledge: frosted flower cake, rolling pin, piping bag, cupcakes
    k.cyl(0.05, 0.27, 0.22, [0, ledgeY, -0.3], "#fffdf8", { bevel: 0.02, seg: 18 });
    k.rod(0.14, 0.03, [0, ledgeY + 0.1, -0.3], "#fffdf8", { seg: 6 });
    k.cyl(0.03, 0.3, 0.3, [0, ledgeY + 0.16, -0.3], "#fffdf8", { bevel: 0.012, seg: 20 });
    flowerCake(k, [0, ledgeY + 0.19 + OL, -0.3], 0.22, 0.22, "#f9c2d3");
    rollingPin(k, [-0.68, ledgeY, -0.3], 0.25, 1.1);
    pipingBag(k, [0.58, ledgeY, -0.32], -0.35, 1.2);
    cupcake(k, [1.02, ledgeY, -0.28], "#fff6e6", "#a8d8f0", 1.1);
    cupcake(k, [-1.1, ledgeY, -0.26], "#f8b9cb", BUTTER, 1.1);
  });
  // little canopy over the door, big awning over the window (fluttering)
  const awnF = k.anim("bakery_awning_front", { outline: 0.035 }, () => {
    awning(k, [WX, FL + 2.95, ZF - 0.04], WW + 0.75, 0.72, STRAW, CREAM, 0.95);
    awning(k, [DX, FL + 2.88, ZF - 0.04], 1.6, 0.48, STRAW, CREAM, 0.95);
  }, [WX, FL + 2.95, ZF]);

  /* ---------- patio side (+X): open counter window + awning ---------- */
  const sideZ = 0.75;
  k.at(k.frame([XR, FL + wsH + 0.02, sideZ], -PI / 2), () => {
    const { shelfY, ledgeY } = openWindow(k, 2.4, 1.4, MINT);
    for (let i = 0; i < 3; i++) croissant(k, [-0.8 + i * 0.32, shelfY, -0.14], 0.15 * i, 1.0);
    loaf(k, [0.4, shelfY, -0.14], 0.1, 0.85);
    boule(k, [0.85, shelfY, -0.14], 0.8);
    // ledge: tray of donuts, cake stand of cupcakes, teapot-ish jug
    k.box(0.8, 0.05, 0.42, [-0.65, ledgeY + 0.02, -0.3], "#fffdf8", { r: 0.02, steps: 1 });
    const gl = ["#f9a8c4", "#fff6e6", "#c9b3f2", "#ffe08a"];
    for (let i = 0; i < 4; i++) donut(k, [-0.88 + (i % 2) * 0.23 + Math.floor(i / 2) * 0.23, ledgeY + 0.045 + OL, -0.38 + (i % 2) * 0.17], gl[i], 1.15);
    k.cyl(0.04, 0.3, 0.3, [0.25, ledgeY + 0.13, -0.3], "#fffdf8", { bevel: 0.015, seg: 20 });
    k.rod(0.14, 0.03, [0.25, ledgeY + 0.07, -0.3], "#fffdf8", { seg: 6 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + 0.5;
      cupcake(k, [0.25 + Math.cos(a) * 0.16, ledgeY + 0.17 + OL, -0.3 + Math.sin(a) * 0.16], ["#f8b9cb", "#fff6e6", "#c9b3f2"][i], ["#a8d8f0", PINK, BUTTER][i], 0.9);
    }
    bagel(k, [0.82, ledgeY, -0.26], 1.3);
    bagel(k, [0.95, ledgeY + 0.05, -0.36], 1.3);
  });
  const awnS = k.anim("bakery_awning_side", { outline: 0.035 }, () => {
    k.at(k.frame([XR, 0, sideZ], -PI / 2), () => awning(k, [0, FL + 2.95, -0.04], 3.15, 0.72, STRAW, CREAM, 0.95));
  }, [XR, FL + 2.95, sideZ]);

  /* ---------- shady side (-X): arched window ---------- */
  extWindow(k, [XL, FL + 1.15, SZ + 0.2], PI / 2, { w: 0.95, h: 1.15, kind: "arch", frame: CREAM, shutters: MINT, heart: STRAW });

  /* ---------- roof: GIANT glazed donut + peeking cat + steam pipe ---------- */
  const DC: V3 = [SX + 0.25, ROOF + 1.3, SZ + 0.75];
  const Rd = 0.86,
    Td = 0.47;
  k.at(k.frame(DC, [-(PI / 2 - 0.3), 0, 0]), () => {
    k.torus(Rd, Td * 2, [0, 0, 0], "#f3bb7f", { seg: 30, bottom: "#de9758" });
    // glaze with drips (local +Y faces the viewer)
    k.revolve(
      (a) => {
        const drip = Math.pow(Math.max(0, Math.sin(a * 5 + 0.7)), 3) * 0.5 + Math.pow(Math.max(0, Math.sin(a * 9 + 2)), 4) * 0.22;
        const dripIn = Math.pow(Math.max(0, Math.sin(a * 4 + 1)), 3) * 0.32;
        const e = 0.04;
        const p0 = -0.3 - drip,
          p1 = PI + 0.3 + dripIn;
        const pts: P2[] = [];
        for (let i = 0; i <= 11; i++) {
          const ph = p0 + ((p1 - p0) * i) / 11;
          pts.push([Rd + (Td + e) * Math.cos(ph), (Td + e) * Math.sin(ph)]);
        }
        return pts;
      },
      [0, 0, 0],
      "#f78fb3",
      { segA: 60 },
    );
    // sprinkles
    const sr = rng(77);
    for (let i = 0; i < 40; i++) {
      const a = sr() * PI * 2;
      const ph = 0.4 + sr() * 2.3;
      const rr = Td + 0.06;
      const n: V3 = [Math.cos(ph) * Math.cos(a), Math.sin(ph), Math.cos(ph) * Math.sin(a)];
      const pos: V3 = [(Rd + rr * Math.cos(ph)) * Math.cos(a), rr * Math.sin(ph), (Rd + rr * Math.cos(ph)) * Math.sin(a)];
      const q = new Vector3(sr() - 0.5, sr() - 0.5, sr() - 0.5);
      const u = Vector3.Cross(new Vector3(...n), q).normalize();
      k.rod(0.17, 0.032, pos, SPRINKLES[i % SPRINKLES.length], { up: [u.x, u.y, u.z], seg: 5 });
    }
  });
  // a little glossy highlight on the glaze (a cream "shine" stroke)
  // (kept inside the glaze batch above via the same key so no outline fighting)

  // peeking cat: head + paws on the rim; ears / eyes / tail animate
  const CH: V3 = [SX + 0.25, ROOF + 0.42, ZF + 0.62];
  const hr: V3 = [0.62, 0.5, 0.5];
  k.blob(hr[0], hr[1], hr[2], CH, MOCHA, { bottom: MOCHA_DEEP, seg: 14 });
  // cheek fluff
  for (const s of [-1, 1]) k.blob(0.24, 0.18, 0.2, [CH[0] + s * 0.48, CH[1] - 0.14, CH[2] - 0.12], MOCHA, { rot: [0, 0, s * 0.5], seg: 8 });
  // muzzle + nose
  const fz = CH[2] - hr[2] * 0.93;
  for (const s of [-1, 1]) k.blob(0.14, 0.11, 0.09, [CH[0] + s * 0.1, CH[1] - 0.15, fz - 0.02], MOCHA_CREAM, { seg: 8 });
  k.blob(0.06, 0.045, 0.04, [CH[0], CH[1] - 0.07, fz - 0.08], "#f58fa8", { seg: 7 });
  // tabby forehead stripes
  for (const [x, l] of [
    [-0.12, 0.13],
    [0, 0.17],
    [0.12, 0.13],
  ] as [number, number][])
    k.blob(0.035, l, 0.04, [CH[0] + x, CH[1] + 0.33, CH[2] - 0.32], MOCHA_DEEP, { rot: [-0.7, 0, x * 2], seg: 6 });
  // mouth "w", cheeks, whiskers (lifted clear of the outlined head)
  const mz = fz - 0.12;
  k.tube(
    [
      [CH[0] - 0.09, CH[1] - 0.15, mz + 0.01],
      [CH[0] - 0.045, CH[1] - 0.19, mz],
      [CH[0], CH[1] - 0.15, mz - 0.005],
      [CH[0] + 0.045, CH[1] - 0.19, mz],
      [CH[0] + 0.09, CH[1] - 0.15, mz + 0.01],
    ],
    0.014,
    INK,
    { key: "flat", tess: 5 },
  );
  for (const s of [-1, 1]) {
    k.blob(0.08, 0.05, 0.03, [CH[0] + s * 0.36, CH[1] - 0.1, CH[2] - hr[2] * 0.72 - OL - 0.02], "#f7a1b5", { key: "flat", seg: 6 });
    for (const dy of [-0.03, 0.04])
      k.tube(
        [
          [CH[0] + s * 0.24, CH[1] - 0.14 + dy, fz - 0.06],
          [CH[0] + s * 0.5, CH[1] - 0.13 + dy * 1.8, fz - 0.02],
          [CH[0] + s * 0.72, CH[1] - 0.1 + dy * 2.6, fz + 0.06],
        ],
        0.011,
        "#fffdf8",
        { key: "fine", tess: 4 },
      );
  }
  // paws hooked over the rim with toe beans
  const rimZ = SZ - RD / 2;
  for (const s of [-1, 1]) {
    const px = CH[0] + s * 0.36;
    k.blob(0.17, 0.12, 0.2, [px, ROOF + 0.2, rimZ + 0.12], MOCHA_CREAM, { seg: 8 });
    for (const t of [-1, 0, 1]) k.blob(0.035, 0.025, 0.02, [px + t * 0.065, ROOF + 0.22, rimZ - 0.08 - OL], "#f7a1b5", { key: "flat", seg: 5 });
  }
  // eyes (blink)
  const eyeY = CH[1] + 0.06;
  const eyes = k.anim(
    "bakery_cat_eyes",
    { outline: false, castShadow: false },
    () => {
      for (const s of [-1, 1]) {
        const ex = CH[0] + s * 0.21;
        const ez = CH[2] - hr[2] * Math.sqrt(Math.max(0, 1 - (0.21 / hr[0]) ** 2 - (0.06 / hr[1]) ** 2));
        k.blob(0.07, 0.095, 0.05, [ex, eyeY, ez - 0.01], INK, { seg: 8 });
        k.ball(0.026, [ex - 0.02, eyeY + 0.035, ez - 0.055], "#fffdf8", { seg: 5 });
      }
    },
    [CH[0], eyeY, CH[2] - 0.4],
  );
  // ears (twitch)
  const ears: Mesh[] = [];
  for (const s of [-1, 1]) {
    const base: V3 = [CH[0] + s * 0.36, CH[1] + 0.32, CH[2] - 0.02];
    const ear = k.anim(
      `bakery_cat_ear${s}`,
      { outline: 0.035 },
      () => {
        k.at(k.frame(base, [0, 0, -s * 0.38]), () => {
          k.cone(0.42, 0.21, [0, -0.04, 0], MOCHA, { seg: 10, bottom: MOCHA_DEEP });
          k.cone(0.3, 0.13, [0, 0.0, -0.09], "#f7b3c4", { seg: 8, rot: [-0.12, 0, 0] });
        });
      },
      base,
    );
    if (ear) ears.push(ear);
  }
  // tail curling up beside the donut (sways)
  const tailBase: V3 = [CH[0] - 0.55, ROOF + 0.05, CH[2] + 0.45];
  const tail = k.anim(
    "bakery_cat_tail",
    { outline: 0.035 },
    () => {
      const path: V3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        path.push([tailBase[0] - 0.35 * Math.sin(t * 1.6) + (t > 0.7 ? (t - 0.7) * 0.9 : 0), tailBase[1] + t * 1.15, tailBase[2] - 0.15 * t]);
      }
      k.tube(path, 0.085, MOCHA, { tess: 10 });
      const tip = path[path.length - 1];
      k.ball(0.1, tip, MOCHA_CREAM, { seg: 8 });
      for (let i = 1; i < 4; i++) {
        const q = path[i * 3];
        k.torus(0.075, 0.03, [q[0], q[1], q[2]], MOCHA_DEEP, { seg: 10, rot: [0, 0, -0.3] });
      }
    },
    tailBase,
  );

  // steam pipe on the roof
  const PIPE: V3 = [SX - 1.75, ROOF + 0.03, SZ + 1.35];
  k.cyl(0.95, 0.15, 0.17, PIPE, "#d9d4e3", { bevel: 0.04, bottom: "#b4aec4", seg: 14 });
  k.torus(0.16, 0.06, [PIPE[0], PIPE[1] + 0.4, PIPE[2]], "#f7a8c0", { seg: 14 });
  k.cyl(0.12, 0.25, 0.2, [PIPE[0], PIPE[1] + 0.92, PIPE[2]], "#b4aec4", { bevel: 0.04, seg: 14 });
  k.cone(0.18, 0.28, [PIPE[0], PIPE[1] + 1.12, PIPE[2]], "#f48fab", { seg: 14 });
  k.ball(0.06, [PIPE[0], PIPE[1] + 1.32, PIPE[2]], "#ffe066", { seg: 6 });

  /* ---------- outside goodies ---------- */
  // stool with a loaf
  stool(k, [-1.12, G, ZF - 1.08], 0.55, PINK, "#c99a6b", 0.26);
  loaf(k, [-1.12, G + 0.55 + OL, ZF - 1.08], -0.4, 1.05);
  // tray-crate of sesame buns with a cloth
  const TC: V3 = [-2.15, G, ZF - 1.0];
  breadCrate(k, TC, 0.92, 0.34, 0.62, "#e2b98c", -0.08);
  k.at(k.frame([TC[0], TC[1] + 0.34, TC[2]], -0.08), () => {
    // gingham cloth draped over the front
    k.box(0.98, 0.04, 0.68, [0, 0.0, 0], "#fffdf8", { r: 0.02, steps: 1 });
    k.box(0.98, 0.26, 0.04, [0, -0.11, -0.34], "#fffdf8", { r: 0.02, steps: 1 });
    for (let i = 0; i < 5; i++) k.box(0.08, 0.27, 0.02, [-0.4 + i * 0.2, -0.11, -0.37 - OL - 0.005], "#f7a8c0", { r: 0.008, steps: 1, key: "flat" });
    k.box(0.9, 0.05, 0.02, [0, -0.06, -0.37 - OL - 0.01], "#f7a8c0", { r: 0.008, steps: 1, key: "flat" });
    for (let i = 0; i < 6; i++) bun(k, [-0.28 + (i % 3) * 0.28, 0.02 + OL, -0.14 + Math.floor(i / 3) * 0.26], 1.1, "main", true);
  });
  // crate of round buns + bagels
  const BC: V3 = [-3.2, G, ZF - 0.95];
  breadCrate(k, BC, 0.84, 0.5, 0.64, "#e8c49a", 0.1);
  k.at(k.frame([BC[0], BC[1] + 0.42, BC[2]], 0.1), () => {
    for (let i = 0; i < 9; i++) {
      const x = -0.26 + (i % 3) * 0.26,
        z = -0.17 + Math.floor(i / 3) * 0.17;
      if (i % 3 === 1) bagel(k, [x, 0.02 + (i % 2) * 0.02, z], 1.2);
      else bun(k, [x, 0.0 + (i % 2) * 0.02, z], 1.05, "main", false, i % 2 ? "#e39a55" : "#eaa45e");
    }
  });
  // tall basket of baguettes
  const BK: V3 = [-4.25, G, ZF - 0.4];
  k.revolve(
    (a) => {
      const wv = 1 + 0.035 * Math.cos(a * 14);
      return [
        [0, 0],
        [0.24 * wv, 0],
        [0.27 * wv, 0.1],
        [0.29 * wv, 0.5],
        [0.32, 0.56],
        [0.27, 0.56],
        [0, 0.5],
      ];
    },
    BK,
    "#e2b98c",
    { segA: 28, bottom: "#c99a6b" },
  );
  for (const y of [0.16, 0.34]) k.torus(0.285, 0.035, [BK[0], BK[1] + y, BK[2]], "#c99a6b", { seg: 22, key: "fine" });
  k.torus(0.29, 0.05, [BK[0], BK[1] + 0.56, BK[2]], "#f7a8c0", { seg: 22 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.3;
    baguette(k, [BK[0] + Math.cos(a) * 0.12, BK[1] + 0.2, BK[2] + Math.sin(a) * 0.12], [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22], 0.85 + (i % 3) * 0.08, 1.0);
  }

  /* ---------- order board ---------- */
  const OB: V3 = [1.3, G, ZF - 1.05];
  const obRot = -0.3;
  orderBoard(k, OB, obRot);
  const obFace: V3 = [-Math.sin(obRot), 0, -Math.cos(obRot)];

  /* ---------- café patio ---------- */
  const T0 = cafeSet(k, [3.3, G, 1.55], "#a8e2c4", CREAM, "#fffdf8", MINT, "#f8b9cb", 1);
  const T1 = cafeSet(k, [3.4, G, -1.4], "#f7a8c0", CREAM, "#fffdf8", PINK, "#a8d8f0", 2);
  const T2 = cafeSet(k, [2.85, G, -4.6], "#ffd66e", CREAM, "#fffdf8", "#ffd66e", "#c9b3f2", 3);
  const tables = [
    [3.3, 1.55],
    [3.4, -1.4],
    [2.85, -4.6],
  ];

  /* ---------- greenery ---------- */
  fluffyTree(k, [-4.0, G, -4.6], 1.0, 9);
  blossomBush(k, [4.3, G, -5.5], 0.85, 14, ["#f8b9cb", "#fffdf8", "#f47a9a"]);
  blossomBush(k, [4.2, G, 2.85], 0.8, 15, ["#fffdf8", "#f8b9cb", "#ffe066"]);
  // flower pots flanking the front path
  tulipPot(k, [-1.05, G, PZ0 + 0.45], CREAM, PINK, ["#f47a9a", "#ffe066", "#fffdf8"]);
  tulipPot(k, [0.85, G, PZ0 + 0.45], CREAM, MINT, ["#fffdf8", "#f8b9cb", "#ffe066"]);

  /* ---------- steam from the pipe ---------- */
  const steamMat = uniqueMat(scene, "bakery_steam", { emissive: "#f3ecf3" }) as StandardMaterial;
  const puffs: Mesh[] = [];
  const S = new Vector3(PIPE[0], PIPE[1] + 1.35, PIPE[2]);
  for (let i = 0; i < 4; i++) {
    const m = k.anim(`bakery_steam${i}`, { material: steamMat, outline: false, castShadow: false }, () => k.ball(0.2, [0, 0, 0], "#ffffff", { seg: 7 }));
    if (m) puffs.push(m);
  }

  /* ---------- colliders + spots ---------- */
  const footprint: Built["footprint"] = [
    [SX, SZ, W + 0.5, D + 0.5],
    [WX, ZF - 0.42, WW + 0.6, 0.5], // front ledge
    [XR + 0.42, sideZ, 0.5, 3.0], // side ledge
    [-1.12, ZF - 1.08, 0.55, 0.55], // stool
    [TC[0], TC[2], 1.0, 0.7],
    [BC[0], BC[2], 0.9, 0.7],
    [BK[0], BK[2], 0.66, 0.66],
    [OB[0], OB[2], 0.85, 0.6], // order board
    [-4.0, -4.6, 1.15, 1.15], // tree planter
    [4.3, -5.5, 1.05, 1.05],
    [4.2, 2.85, 1.0, 1.0],
    [-1.05, PZ0 + 0.45, 0.45, 0.45],
    [0.85, PZ0 + 0.45, 0.45, 0.45],
  ];
  const spots: Record<string, V3> = {
    order_board: [OB[0] + obFace[0] * 0.95, 0, OB[2] + obFace[2] * 0.95],
    side_window: [XR + 1.05, 0, sideZ],
    front_window: [WX, 0, ZF - 1.85],
  };
  [T0, T1, T2].forEach((t, i) => {
    const [tx, tz] = tables[i];
    footprint.push([tx, tz, 0.95, 0.95]);
    footprint.push([t.seat[0], t.seat[2], 0.48, 0.48]);
    footprint.push([t.seat2[0], t.seat2[2], 0.48, 0.48]);
    spots[`cafe_table_${i}`] = [t.seat[0], G + 0.5, t.seat[2]];
    spots[`cafe_table_${i}_b`] = [t.seat2[0], G + 0.5, t.seat2[2]];
    spots[`cafe_table_${i}_top`] = [tx, t.topY, tz];
  });

  let blinkT = 0;
  return {
    footprint,
    doorLocal: [DX, 0, ZF - 0.95],
    spots,
    update: (dt, t) => {
      // awnings flutter softly
      if (awnF) awnF.rotation.x = Math.sin(t * 2.1) * 0.012 + Math.sin(t * 5.3) * 0.004;
      if (awnS) awnS.rotation.z = (Math.sin(t * 2.1 + 1.1) * 0.012 + Math.sin(t * 5.1) * 0.004);
      if (bell) bell.rotation.x = Math.sin(t * 1.6) * 0.08;
      // cat: blink every ~3.6 s (double blink sometimes), ear twitches, tail sway
      blinkT += dt;
      const cyc = t % 3.6;
      const b = cyc > 3.42 ? 1 - Math.sin(((cyc - 3.42) / 0.18) * PI) * 0.92 : 1;
      if (eyes) eyes.scaling.y = b;
      ears.forEach((e, i) => {
        const ph = (t + i * 2.3) % 5.2;
        e.rotation.z = (i ? -1 : 1) * (ph < 0.35 ? Math.sin((ph / 0.35) * PI * 2) * 0.22 : 0);
      });
      if (tail) tail.rotation.z = Math.sin(t * 1.3) * 0.12;
      // steam puffs
      puffs.forEach((m, i) => {
        const ph = (t * 0.2 + i / puffs.length) % 1;
        m.position.set(S.x + Math.sin(ph * 5 + i) * 0.2 + ph * 0.4, S.y + ph * 2.2, S.z);
        m.scaling.setAll(0.45 + ph * 1.3);
        m.visibility = Math.min(1, ph * 6) * (1 - ph) * 0.9;
      });
    },
  };
}

/** cheap pot of chunky tulips, p = ground */
function tulipPot(k: Kit, p: V3, potC: string, rim: string, cols: string[]) {
  pot(k, p, 0.24, 0.36, potC, rim);
  const top = p[1] + 0.32;
  cols.forEach((c, i) => {
    const a = (i / cols.length) * PI * 2 + 0.5;
    const x = p[0] + Math.cos(a) * 0.09,
      z = p[2] + Math.sin(a) * 0.09;
    const h = 0.28 + (i % 2) * 0.08;
    k.rod(h, 0.016, [x, top + h / 2, z], "leafDeep", { seg: 4, key: "sway" });
    k.blob(0.075, 0.09, 0.075, [x, top + h + 0.05, z], c, { seg: 6, key: "sway" });
    k.cone(0.06, 0.05, [x, top + h + 0.1, z], c, { seg: 5, key: "sway" });
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    leaf(k, [p[0] + Math.cos(a) * 0.12, top + 0.08, p[2] + Math.sin(a) * 0.12], 0.12, i % 2 ? "leaf" : "leafDeep", [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], "sway");
  }
}

/** circle with scalloped (cookie-cutter) edge */
function scallopRing(r: number, bumps: number, n = 64): P2[] {
  const o: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const rr = r * (1 + 0.06 * Math.abs(Math.cos((a * bumps) / 2)));
    o.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return o;
}
