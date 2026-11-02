import { Vector3, Color3, type Scene, type StandardMaterial } from "@babylonjs/core";
import type { InteriorDef } from "../../core/types";
import { Kit, archPts, circlePts, heartPts, roundRectPts, starPts, scallopPts, uniqueMat, type V3, type P2 } from "./kit";
import { RoomCtx, roomShell, finishInterior, makeRoot, onBack, onLeft, X0, Z1, WALL_H } from "./room";
import { PI, heart, star, pottedPlant, archWindow, pictureFrame, tulipArt, fluffyRug, cushion, heartDrawer, bookRow, bookStack, mug, tableLamp, bunting, face, flowerPot } from "./props";
import { bookshelf } from "./int_library";
import type { ColorLike } from "../../render/Shapes";
import { mixCol } from "../../render/Palette";

/** little teddy bear sitting, facing -Z */
export function teddy(k: Kit, p: V3, color: ColorLike, s = 1, rotY = 0) {
  k.at(k.frame(p, rotY, s), () => {
    k.blob(0.2, 0.22, 0.18, [0, 0.2, 0], color, { seg: 8 });
    k.ball(0.17, [0, 0.52, 0], color, { seg: 8 });
    for (const sx of [-1, 1]) {
      k.ball(0.065, [sx * 0.13, 0.66, 0.02], color, { seg: 6 });
      k.blob(0.07, 0.07, 0.11, [sx * 0.12, 0.07, -0.12], color, { seg: 6 });
      k.blob(0.06, 0.1, 0.06, [sx * 0.2, 0.26, -0.04], color, { rot: [0, 0, sx * 0.5], seg: 6 });
    }
    k.blob(0.075, 0.055, 0.05, [0, 0.47, -0.15], "#fff3df", { seg: 6 });
    k.ball(0.025, [0, 0.5, -0.2], "#4a3a52", { seg: 5 });
    k.ball(0.02, [-0.06, 0.57, -0.16], "#4a3a52", { seg: 4 });
    k.ball(0.02, [0.06, 0.57, -0.16], "#4a3a52", { seg: 4 });
    heart(k, [0, 0.22, -0.2], 0.12, "#f47a9a", 0.03, { key: "fine" });
  });
}

/** bed with patchwork quilt; headboard against +Z; p = floor centre */
export function bed(k: Kit, p: V3, w: number, l: number, o: { frame?: ColorLike; quilt?: ColorLike[]; trim?: ColorLike } = {}) {
  const fr = o.frame ?? "#fffdf8";
  const q = o.quilt ?? ["#f9d9e6", "#bfe9d6", "#fff3b0", "#cfe8fa", "#e3d6fa"];
  const [x, y, z] = p;
  // frame
  k.box(w + 0.1, 0.32, l, [x, y + 0.3, z], "#e2b98c", { r: 0.1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.18, 0.07, 0.06, [x + sx * (w / 2 - 0.05), y, z + sz * (l / 2 - 0.08)], "#c99a6b", { bevel: 0.03 });
  // headboard
  k.puff(archPts(w + 0.3, 1.45, 16), 0.16, [x, y, z + l / 2 + 0.02], fr, { bevel: 0.07, bulge: 0.02 });
  k.puff(archPts(w - 0.2, 1.05, 16), 0.04, [x, y + 0.3, z + l / 2 - 0.08], o.trim ?? "#a8d8f0", { bevel: 0.015, key: "fine" });
  heart(k, [x, y + 1.05, z + l / 2 - 0.13], 0.32, "#f47a9a", 0.07);
  // footboard
  k.puff(archPts(w + 0.2, 0.75, 16), 0.12, [x, y, z - l / 2 - 0.02], fr, { bevel: 0.05 });
  // mattress
  k.box(w - 0.04, 0.24, l - 0.12, [x, y + 0.55, z + 0.02], "#fffdf8", { r: 0.1 });
  // pillow
  k.at(k.frame([x, y + 0.75, z + l / 2 - 0.38], [-0.25, 0, 0]), () => k.puff(roundRectPts(w * 0.72, 0.42, 0.18), 0.18, [0, 0, 0], "#fff3df", { bevel: 0.09, bulge: 0.04 }));
  // patchwork quilt over lower 2/3
  const ql = l * 0.68;
  const qz = z - l / 2 + ql / 2 + 0.02;
  const nx = 4,
    nz = 5;
  const cw = (w + 0.12) / nx,
    cd = ql / nz;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const c = q[(i + j * 2) % q.length];
      k.box(cw - 0.015, 0.06, cd - 0.015, [x - (w + 0.12) / 2 + cw * (i + 0.5), y + 0.7, qz - ql / 2 + cd * (j + 0.5)], c, { r: 0.025, key: "fine" });
      if ((i + j) % 2 === 0) heart(k, [x - (w + 0.12) / 2 + cw * (i + 0.5), y + 0.76, qz - ql / 2 + cd * (j + 0.5)], 0.14, "#fffdf8", 0.02, { rot: [PI / 2, 0, 0], key: "flat" });
    }
  // quilt sides draping with scalloped hem
  for (const sx of [-1, 1]) {
    k.at(k.frame([x + sx * (w / 2 + 0.07), y + 0.72, qz], sx > 0 ? -PI / 2 : PI / 2), () => {
      k.puff(scallopPts(ql, 0.06, 6, 5).map(([a, b]) => [a, b - 0.02] as P2), 0.04, [0, -0.32, 0], q[0], { bevel: 0.018, spine: [[-ql / 2, -0.29], [ql / 2, -0.29]] });
      k.box(ql, 0.32, 0.04, [0, -0.16, 0.0], q[1], { r: 0.02 });
    });
  }
  k.at(k.frame([x, y + 0.72, z - l / 2 + 0.03], 0), () => {
    k.box(w + 0.14, 0.32, 0.04, [0, -0.16, 0], q[1], { r: 0.02 });
  });
}

export function buildHome(scene: Scene, origin: Vector3): InteriorDef {
  const root = makeRoot(scene, "home", origin);
  const k = new Kit(scene, root);
  const ctx = new RoomCtx(origin);

  roomShell(k, {
    wall: "#ffd7c4",
    wallTop: "#ffe7da",
    wainscot: "#cfe8fa",
    wainscotH: 0.95,
    rail: "#fffdf8",
    border: "#9fd3ea",
    borderDeep: "#6fb6d8",
    crown: "#fffdf8",
    floor: "wood",
    floorA: "#f2d4ae",
    floorB: "#ebc79c",
    motif: "hearts",
    motifColor: "#fff0e8",
    mat: "#a8d8f0",
    matAccent: "#fffdf8",
    seed: 66,
  });

  // ---- bed (back-left) ----
  const B: V3 = [-3.35, 0, 2.7];
  bed(k, B, 1.9, 2.5);
  teddy(k, [B[0] + 0.45, 0.82, B[2] + 0.6], "#e8c49a", 1.3, 0.3);
  ctx.box(B[0], B[2], 2.2, 2.7);
  ctx.spot("bed", B[0], 0.8, B[2]);
  ctx.spot("bed_side", B[0] + 1.5, 0, B[2] - 0.6);
  // pictures above bed + garland
  onBack(k, B[0] - 0.55, 2.55, () => pictureFrame(k, [0, 0, 0], 0.65, 0.8, "#f7a8c0", "#fff6e6", () => tulipArt(k, 1.2)));
  onBack(k, B[0] + 0.55, 2.55, () =>
    pictureFrame(k, [0, 0, 0], 0.65, 0.8, "#ffe08a", "#cfe8fa", () => {
      star(k, [0, 0.02, 0], 0.26, "#ffe066", 0.03, { key: "fine" });
    }),
  );
  bunting(k, X0 + 0.3, 5.2, WALL_H - 0.42, Z1 - 0.08, ["#f7a8c0", "#ffe08a", "#a8d8f0", "#bfe9d6"], { shape: "heart", spacing: 0.6 });

  // ---- bedside table + star night-light ----
  const N: V3 = [-1.85, 0, 3.45];
  k.box(0.7, 0.62, 0.6, [N[0], 0.31, N[2]], "#fffdf8", { r: 0.08 });
  heartDrawer(k, [N[0], 0.4, N[2] - 0.3], 0.5, 0.24, "#f9d9e6", "#f47a9a");
  ctx.box(N[0], N[2], 0.8, 0.7);
  const nlMat = uniqueMat(scene, "home_nightlight", { emissive: "#ffd36b" }) as StandardMaterial;
  const NL: V3 = [N[0], 0.62 + 0.035 + 0.28, N[2] - 0.05];
  k.cyl(0.08, 0.14, 0.16, [N[0], 0.655, N[2] - 0.05], "#a8d8f0");
  const nlight = k.anim(
    "home_nightlight",
    { material: nlMat, outline: 0.03, castShadow: false },
    () => {
      k.puff(starPts(0.24, 0.12, 5, 40), 0.12, NL, "#fff2a8", { bevel: 0.055, bulge: 0.03 });
    },
    NL,
  );
  ctx.spot("nightlight", N[0], 0.9, N[2]);

  // ---- window with curtains (back centre) ----
  onBack(k, 0.15, 1.2, () => archWindow(k, [0, 0, 0], 1.5, 1.95, { frame: "#fffdf8", view: "hills", curtains: "#f9d9e6", sill: "#fffdf8" }));
  pottedPlant(k, [0.65, 1.2 - 0.04 + 0.04, Z1 - 0.13], { kind: "bush", potColor: "#bfe9d6", size: 0.6, seed: 4 });
  flowerPot(k, [-0.35, 1.16, Z1 - 0.13], "tulip", ["#f47a9a", "#ffb766"], { potColor: "#f8b9cb", size: 0.75, seed: 3 });

  // ---- desk + chair (back right) ----
  const D: V3 = [2.25, 0, Z1 - 0.45];
  k.box(2.0, 0.09, 0.8, [D[0], 0.82, D[2]], "#e2b98c", { r: 0.04 });
  k.box(0.55, 0.78, 0.72, [D[0] + 0.68, 0.39, D[2]], "#fffdf8", { r: 0.06 });
  heartDrawer(k, [D[0] + 0.68, 0.58, D[2] - 0.36], 0.42, 0.24, "#cfe8fa", "#f47a9a");
  heartDrawer(k, [D[0] + 0.68, 0.24, D[2] - 0.36], 0.42, 0.24, "#cfe8fa", "#f47a9a");
  for (const s of [-1, 1]) k.box(0.08, 0.78, 0.08, [D[0] - 0.92, 0.39, D[2] + s * 0.32], "#c99a6b", { r: 0.03 });
  const dt = 0.865 + 0.035;
  tableLamp(k, [D[0] + 0.7, dt, D[2] + 0.1], "#a8d8f0", "#fffdf8", 1.2, "glowSoft");
  bookStack(k, [D[0] - 0.6, dt, D[2] + 0.1], 3, 13, 0.9);
  k.at(k.frame([D[0] - 0.05, dt, D[2] - 0.05], 0, 1.3), () => mug(k, [0, 0, 0], "#fff3b0", "#f47a9a", 0.6));
  // paper with drawing
  k.box(0.42, 0.012, 0.32, [D[0] - 0.05, dt + 0.01, D[2] - 0.15], "#fffdf8", { rot: [0, 0.2, 0], r: 0.006, steps: 1, key: "fine" });
  // chair
  k.at(k.frame([D[0] - 0.15, 0, D[2] - 0.85], 0.15), () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod(0.5, 0.035, [sx * 0.22, 0.25, sz * 0.22], "#c99a6b");
    k.box(0.6, 0.08, 0.58, [0, 0.52, 0], "#e2b98c", { r: 0.04 });
    cushion(k, [0, 0.56, 0], 0.5, 0.48, 0.1, "#f9d9e6");
    k.puff(archPts(0.58, 0.55, 10), 0.08, [0, 0.55, 0.26], "#e2b98c", { bevel: 0.035 });
    heart(k, [0, 0.82, 0.18], 0.16, "#f47a9a", 0.04);
  });
  ctx.box(D[0], D[2], 2.1, 0.9);
  ctx.circle(D[0] - 0.15, D[2] - 0.85, 0.42);
  ctx.spot("desk", D[0], dt, D[2]);
  ctx.spot("npc", D[0] - 1.6, 0, D[2] - 0.9);

  // ---- little shelf (back right corner) ----
  bookshelf(k, [4.4, 0, Z1], 1.3, 1.7, 0.45, 41, { rows: 2, drawer: "#cfe8fa" });
  ctx.box(4.4, Z1 - 0.25, 1.4, 0.55);
  pottedPlant(k, [4.4, 1.86, Z1 - 0.25], { kind: "trailing", potColor: "#f8b9cb", size: 0.9, seed: 9 });

  // ---- toy chest (left, front of bed) ----
  const T: V3 = [-4.35, 0, 0.35];
  k.at(k.frame(T, PI / 2), () => {
    k.box(1.3, 0.62, 0.72, [0, 0.31, 0], "#a8d8f0", { r: 0.1, bottom: "#8fc3ea" });
    k.box(1.38, 0.14, 0.8, [0, 0.66, 0.02], "#f7a8c0", { r: 0.07 });
    heart(k, [0, 0.35, -0.42], 0.32, "#fffdf8", 0.06);
    // toys peeking
    k.ball(0.14, [-0.35, 0.82, 0.05], "#ffe066", { seg: 8 });
    k.torus(0.13, 0.03, [-0.35, 0.82, 0.05], "#f47a9a", { rot: [0.6, 0, 0], seg: 14 });
    star(k, [0.2, 0.9, 0.12], 0.3, "#ffe066", 0.08, { rot: [0, 0, 0.3] });
    k.blob(0.05, 0.16, 0.04, [0.45, 0.9, 0.1], "#fffdf8", { rot: [0, 0, -0.2], seg: 6 });
    k.blob(0.05, 0.16, 0.04, [0.55, 0.88, 0.1], "#fffdf8", { rot: [0, 0, 0.25], seg: 6 });
  });
  ctx.box(T[0], T[2], 0.85, 1.4);
  ctx.spot("chest", T[0] + 0.8, 0, T[2]);
  ctx.spot("item_toy", T[0], 0.9, T[2]);

  // ---- standing mirror on left wall ----
  onLeft(k, -1.6, 0, () => {
    const pts: P2[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * PI * 2;
      const s = 1 + 0.04 * Math.cos(a * 16);
      pts.push([Math.cos(a) * 0.5 * s, 1.35 + Math.sin(a) * 0.8 * s]);
    }
    k.puff(pts, 0.1, [0, 0, -0.06], "#f7a8c0", { bevel: 0.045 });
    k.puff(circlePts(0.4, 28, 0.68), 0.03, [0, 1.35, -0.15], "#e6f6ff", { key: "glass", bottom: "#cfe8fa", bevel: 0.012 });
    k.box(0.08, 0.35, 0.02, [-0.18, 1.6, -0.18], "#fffdf8", { rot: [0, 0, -0.5], r: 0.01, steps: 1, key: "flat" });
    heart(k, [0, 2.25, -0.16], 0.2, "#f47a9a", 0.05);
    k.box(0.9, 0.08, 0.3, [0, 0.04, -0.15], "#e2b98c", { r: 0.03 });
  });
  ctx.spot("mirror", X0 + 1.1, 0, -1.6);
  ctx.box(X0 + 0.35, -1.6, 0.6, 1.0);

  // ---- rug + pet bed ----
  fluffyRug(k, [0.4, 0, -0.4], 1.9, "#cdb9f0", "#e3d6fa", 1.2, 0.95);
  k.revolve(
    () => [
      [0, 0],
      [0.5, 0],
      [0.6, 0.1],
      [0.58, 0.22],
      [0.48, 0.24],
      [0.4, 0.12],
      [0, 0.1],
    ],
    [2.9, 0, -1.1],
    "#a8d8f0",
    { segA: 28 },
  );
  k.disc(0.4, 0.06, [2.9, 0.1, -1.1], "#fff3df");
  ctx.spot("petbed", 2.9, 0.15, -1.1);
  ctx.spot("rug", 0.4, 0.07, -0.4);

  // ---- plants ----
  pottedPlant(k, [-4.55, 0, -2.9], { kind: "fern", potColor: "#bfe9d6", size: 1.6, seed: 31, heart: "#fffdf8" });
  ctx.circle(-4.55, -2.9, 0.45);
  pottedPlant(k, [4.55, 0, -3.1], { kind: "tall", potColor: "#ffe08a", size: 1.6, seed: 32, heart: "#fffdf8" });
  ctx.circle(4.55, -3.1, 0.45);
  void mixCol;
  void Color3;

  return finishInterior(
    "home",
    k,
    ctx,
    "#cfe8f7",
    (_dt, t) => {
      const g = 0.85 + Math.sin(t * 1.4) * 0.12;
      nlMat.emissiveColor.set(1.0 * g, 0.83 * g, 0.42 * g);
      if (nlight) nlight.rotation.z = Math.sin(t * 0.7) * 0.06;
    },
    "#fff1e0",
  );
}
