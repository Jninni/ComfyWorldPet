import { Vector3, Color3, type Scene, type StandardMaterial } from "@babylonjs/core";
import type { InteriorDef } from "../../core/types";
import { Kit, archPts, circlePts, roundRectPts, uniqueMat, type V3, type P2 } from "./kit";
import { RoomCtx, roomShell, finishInterior, makeRoot, onBack, onLeft, X0, Z1, WALL_H } from "./room";
import { PI, heart, star, pottedPlant, archWindow, lantern, lanternGlow, bunting, cord, mug, bush } from "./props";
import { crate } from "./int_flowershop";
import type { ColorLike } from "../../render/Shapes";
import { jitterCol, rng } from "../../render/Palette";

/** hammer lying in local XY (facing -Z), centred at p */
export function hammerShape(k: Kit, p: V3, rotZ: number, s = 1, head: ColorLike = "#b4aec4", handle: ColorLike = "#e2b98c") {
  k.at(k.frame(p, [0, 0, rotZ], s), () => {
    k.box(0.07, 0.55, 0.06, [0, -0.08, 0], handle, { r: 0.03 });
    k.box(0.3, 0.11, 0.1, [0, 0.22, 0], head, { r: 0.04 });
    k.box(0.08, 0.2, 0.06, [0, -0.3, 0], "#f47a9a", { r: 0.03 });
  });
}

export function sawShape(k: Kit, p: V3, rotZ: number, s = 1) {
  k.at(k.frame(p, [0, 0, rotZ], s), () => {
    const blade: P2[] = [];
    blade.push([-0.12, 0.12], [0.08, 0.12]);
    for (let i = 0; i <= 10; i++) blade.push([0.06 - i * 0.02 + (i % 2 ? 0.012 : 0), 0.1 - i * 0.075]);
    blade.push([-0.12, -0.65]);
    k.puff(blade, 0.025, [0, 0, 0], "#d9d4e3", { bevel: 0.008, key: "fine" });
    k.puff(roundRectPts(0.2, 0.3, 0.08), 0.06, [-0.03, 0.25, -0.01], "#e2b98c", { bevel: 0.025 });
    k.puff(roundRectPts(0.09, 0.14, 0.04), 0.07, [-0.03, 0.28, -0.03], "#c99a6b", { bevel: 0.02 });
  });
}

export function wrenchShape(k: Kit, p: V3, rotZ: number, s = 1) {
  k.at(k.frame(p, [0, 0, rotZ], s), () => {
    k.box(0.06, 0.5, 0.04, [0, 0, 0], "#a8d8f0", { r: 0.02 });
    k.torus(0.07, 0.035, [0, 0.27, 0], "#a8d8f0", { rot: [PI / 2, 0, 0], seg: 12 });
    k.torus(0.055, 0.03, [0, -0.27, 0], "#a8d8f0", { rot: [PI / 2, 0, 0], seg: 12 });
  });
}

export function sawhorse(k: Kit, p: V3, rotY: number, len = 1.3, h = 0.75) {
  k.at(k.frame(p, rotY), () => {
    k.box(len, 0.12, 0.16, [0, h, 0], "#e2b98c", { r: 0.04 });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) k.box(0.08, h + 0.05, 0.08, [sx * (len / 2 - 0.15), h / 2, sz * 0.18], "#c99a6b", { rot: [sz * 0.25, 0, 0], r: 0.03 });
    k.box(len - 0.3, 0.06, 0.06, [0, h * 0.35, 0], "#c99a6b", { r: 0.02 });
  });
}

export function buildWorkshop(scene: Scene, origin: Vector3): InteriorDef {
  const root = makeRoot(scene, "workshop", origin);
  const k = new Kit(scene, root);
  const ctx = new RoomCtx(origin);
  const r = rng(77);

  roomShell(k, {
    wall: "#f2d2a8",
    wallTop: "#f8e2c2",
    wainscot: "#d9ae80",
    wainscotH: 1.0,
    rail: "#fff3df",
    border: "#ffd27a",
    borderDeep: "#f0ad4e",
    crown: "#fff3df",
    floor: "wood",
    floorA: "#e2b98c",
    floorB: "#d6aa7c",
    motif: "none",
    mat: "#a8e2c4",
    matAccent: "#fffdf8",
    seed: 77,
  });
  // vertical plank seams on the walls
  for (let x = X0 + 0.45; x < 5.2; x += 0.5) k.box(0.025, WALL_H - 1.4, 0.02, [x, 1.0 + (WALL_H - 1.4) / 2 + 0.05, Z1 - 0.008], "#dcb588", { key: "flat", r: 0.008, steps: 1 });
  for (let z = -4.0; z < Z1 - 0.2; z += 0.5) k.box(0.02, WALL_H - 1.4, 0.025, [X0 + 0.008, 1.0 + (WALL_H - 1.4) / 2 + 0.05, z], "#d8b083", { key: "flat", r: 0.008, steps: 1 });

  // ---- workbench (back left-centre) ----
  const W: V3 = [-1.3, 0, Z1 - 0.55];
  k.box(3.2, 0.16, 1.05, [W[0], 0.92, W[2]], "#e8c49a", { r: 0.06 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.14, 0.86, 0.14, [W[0] + sx * 1.42, 0.43, W[2] + sz * 0.38], "#c99a6b", { r: 0.05 });
  k.box(2.9, 0.08, 0.85, [W[0], 0.25, W[2]], "#d6aa7c", { r: 0.03 });
  // toolbox + boxes on the lower shelf
  k.box(0.7, 0.32, 0.4, [W[0] - 0.7, 0.45, W[2]], "#f47a9a", { r: 0.07 });
  k.tube([[W[0] - 0.9, 0.61, W[2]], [W[0] - 0.9, 0.72, W[2]], [W[0] - 0.5, 0.72, W[2]], [W[0] - 0.5, 0.61, W[2]]], 0.025, "#6d5a78");
  crate(k, [W[0] + 0.6, 0.29, W[2]], 0.7, 0.35, 0.5, "#f2d4ae");
  const bt = 1.0 + 0.035;
  // vise on the right end
  k.box(0.3, 0.2, 0.3, [W[0] + 1.35, bt + 0.1, W[2] - 0.35], "#a8d8f0", { r: 0.06 });
  k.rod(0.4, 0.025, [W[0] + 1.35, bt + 0.12, W[2] - 0.6], "#b4aec4", { rot: [PI / 2, 0, 0] });
  // birdhouse in progress
  k.at(k.frame([W[0] - 0.2, bt, W[2] - 0.05], 0.35, 1.2), () => {
    k.box(0.4, 0.36, 0.36, [0, 0.18, 0], "#bfe9d6", { r: 0.04 });
    k.box(0.26, 0.04, 0.46, [-0.13, 0.43, 0], "#f47a9a", { rot: [0, 0, 0.7], r: 0.02 });
    k.box(0.26, 0.04, 0.46, [0.13, 0.43, 0], "#f47a9a", { rot: [0, 0, -0.7], r: 0.02 });
    k.puff(circlePts(0.07, 14), 0.02, [0, 0.2, -0.19], "#6d5a78", { bevel: 0.008, key: "flat" });
  });
  // hammer + nails + plank + mug
  k.at(k.frame([W[0] - 1.0, bt + 0.04, W[2] - 0.15], [PI / 2, 0.4, 0]), () => hammerShape(k, [0, 0, 0], 0, 1.1));
  k.cyl(0.18, 0.09, 0.08, [W[0] + 0.55, bt, W[2] + 0.15], "#e6f6ff", { key: "glass" });
  k.box(1.1, 0.06, 0.24, [W[0] + 0.35, bt + 0.03, W[2] - 0.25], "#f2d4ae", { r: 0.025, rot: [0, -0.1, 0] });
  mug(k, [W[0] - 1.35, bt, W[2] + 0.2], "#fff3b0", "#f47a9a", 0.5);
  // shavings
  for (let i = 0; i < 8; i++) k.torus(0.04, 0.012, [W[0] - 0.6 + r() * 1.6, bt + 0.012, W[2] - 0.3 + r() * 0.3], "#fff3df", { rot: [PI / 2 + 0.3, r() * 3, 0], seg: 8, key: "fine" });
  ctx.box(W[0], W[2], 3.3, 1.15);
  ctx.spot("counter", W[0], bt, W[2]);
  ctx.spot("npc", W[0] + 2.2, 0, W[2] - 0.75);

  // ---- pegboard with tools ----
  onBack(k, W[0], 2.45, () => {
    k.box(3.0, 1.35, 0.06, [0, 0, -0.03], "#fff3df", { r: 0.04 });
    k.box(3.12, 0.08, 0.1, [0, 0.7, -0.05], "#c99a6b", { r: 0.03 });
    k.box(3.12, 0.08, 0.1, [0, -0.7, -0.05], "#c99a6b", { r: 0.03 });
    for (let i = 0; i < 14; i++) for (let j = 0; j < 6; j++) k.decal(circlePts(0.018, 6), [-1.3 + i * 0.2, -0.5 + j * 0.2, -0.1], "#e8d2b8", { t: 0.004 });
    hammerShape(k, [-1.1, 0.05, -0.15], 0.15, 1.4);
    sawShape(k, [-0.45, 0.25, -0.13], 0.05, 1.15);
    wrenchShape(k, [0.25, 0.0, -0.13], -0.2, 1.2);
    // screwdrivers
    ["#f47a9a", "#ffe066", "#a8e2c4"].forEach((c, i) => {
      k.capsule(0.22, 0.045, [0.65 + i * 0.16, 0.25, -0.13], c);
      k.rod(0.25, 0.012, [0.65 + i * 0.16, 0.02, -0.13], "#b4aec4", { seg: 5 });
    });
    // ruler
    k.box(0.08, 0.95, 0.03, [1.25, 0.0, -0.13], "#ffe066", { r: 0.012 });
    for (let i = 0; i < 9; i++) k.box(0.04, 0.012, 0.01, [1.23, -0.4 + i * 0.1, -0.155], "#6d5a78", { key: "flat", r: 0.004, steps: 1 });
    // pliers
    k.at(k.frame([0.95, -0.42, -0.13], [0, 0, 0.2]), () => {
      for (const s of [-1, 1]) k.box(0.05, 0.32, 0.04, [s * 0.04, 0, 0], "#f7a8c0", { rot: [0, 0, s * 0.18], r: 0.02 });
    });
  });
  ctx.spot("pegboard", W[0], 0, W[2] - 0.8);

  // ---- window (back right) ----
  onBack(k, 2.35, 1.25, () => archWindow(k, [0, 0, 0], 1.4, 1.9, { frame: "#fff3df", view: "hills", sill: "#e2b98c" }));
  pottedPlant(k, [2.35 + 0.45, 1.25 + 0.04, Z1 - 0.15], { kind: "fern", potColor: "#bfe9d6", size: 0.6, seed: 12 });
  k.cyl(0.18, 0.1, 0.1, [2.35 - 0.4, 1.29, Z1 - 0.15], "#a8d8f0");
  for (let i = 0; i < 3; i++) k.rod(0.3, 0.015, [2.35 - 0.4 + (i - 1) * 0.03, 1.5, Z1 - 0.15], ["#f47a9a", "#ffe066", "#8fc3ea"][i], { rot: [0, 0, (i - 1) * 0.2], seg: 4 });

  // ---- blueprint drafting table (front right) ----
  const BP: V3 = [3.3, 0, 0.7];
  k.at(k.frame(BP, -0.25), () => {
    for (const sx of [-1, 1]) {
      k.box(0.1, 0.95, 0.1, [sx * 0.75, 0.47, 0.25], "#c99a6b", { r: 0.04 });
      k.box(0.1, 0.8, 0.1, [sx * 0.75, 0.4, -0.35], "#c99a6b", { r: 0.04 });
    }
    k.box(1.4, 0.06, 0.06, [0, 0.25, -0.05], "#c99a6b", { r: 0.02 });
    k.at(k.frame([0, 0.98, -0.05], [-0.4, 0, 0]), () => {
      k.box(1.75, 0.07, 1.05, [0, 0, 0], "#e8c49a", { r: 0.04 });
      k.box(1.45, 0.012, 0.85, [0, 0.042, 0], "#7fb8ec", { r: 0.006, steps: 1, key: "fine" });
      // white lines: a little house drawing
      const ln = (x: number, z: number, w: number, d: number, rot = 0) => k.box(w, 0.006, d, [x, 0.06, z], "#fffdf8", { rot: [0, rot, 0], key: "flat", r: 0.002, steps: 1 });
      ln(-0.15, 0.12, 0.5, 0.018);
      ln(-0.15, -0.2, 0.5, 0.018);
      ln(-0.4, -0.04, 0.018, 0.32);
      ln(0.1, -0.04, 0.018, 0.32);
      ln(-0.27, 0.26, 0.36, 0.018, -0.75);
      ln(-0.03, 0.26, 0.36, 0.018, 0.75);
      ln(-0.15, -0.12, 0.1, 0.16);
      ln(0.45, 0.25, 0.3, 0.012);
      ln(0.45, 0.15, 0.3, 0.012);
      ln(0.45, 0.05, 0.22, 0.012);
      ln(0.45, -0.2, 0.26, 0.26);
      k.box(0.24, 0.008, 0.24, [0.45, 0.065, -0.2], "#7fb8ec", { key: "flat", r: 0.002, steps: 1 });
      // pencil + ruler
      k.capsule(0.32, 0.018, [0.2, 0.08, -0.36], "#ffe066", { rot: [0, 0, PI / 2] });
      k.box(0.6, 0.02, 0.07, [-0.3, 0.07, -0.37], "#fffdf8", { r: 0.01, key: "fine" });
    });
  });
  // rolled blueprints bin
  k.cyl(0.6, 0.22, 0.2, [BP[0] + 1.25, 0, BP[2] + 0.6], "#a8d8f0", { bevel: 0.05 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2;
    k.capsule(0.85, 0.06, [BP[0] + 1.25 + Math.cos(a) * 0.09, 0.62, BP[2] + 0.6 + Math.sin(a) * 0.09], i % 2 ? "#7fb8ec" : "#cfe8fa", { rot: [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15] });
  }
  ctx.box(BP[0], BP[2], 1.9, 1.2);
  ctx.circle(BP[0] + 1.25, BP[2] + 0.6, 0.3);
  ctx.spot("blueprint", BP[0] - 0.1, 0, BP[2] - 0.95);
  ctx.spot("item_blueprint", BP[0], 1.1, BP[2]);

  // ---- sawhorse with plank (centre) ----
  sawhorse(k, [0.6, 0, 0.5], 0.2);
  sawhorse(k, [0.6, 0, -0.9], 0.2);
  k.box(0.6, 0.09, 2.3, [0.6, 0.86, -0.2], "#f2d4ae", { rot: [0, 0.2, 0], r: 0.03 });
  k.box(0.04, 0.02, 0.5, [0.6, 0.9, 0.3], "#6d5a78", { rot: [0, 0.2, 0], r: 0.008, steps: 1, key: "flat" });
  ctx.box(0.6, -0.2, 1.6, 2.2);
  ctx.spot("sawhorse", 0.6, 0.9, -0.2);

  // ---- planks leaning on left wall + lumber pile ----
  const pc = ["#f2d4ae", "#e8c49a", "#e2b98c", "#f6dcb8"];
  for (let i = 0; i < 6; i++) {
    k.box(0.28, 2.6 - (i % 3) * 0.2, 0.06, [X0 + 0.32 + i * 0.03, 1.25 - (i % 3) * 0.1, 1.5 + i * 0.3], jitterCol(pc[i % 4], 0.03, r), { rot: [0, PI / 2, -0.16], r: 0.025 });
  }
  ctx.box(X0 + 0.45, 2.25, 0.7, 2.0);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      k.box(2.0, 0.18, 0.28, [-3.8, 0.09 + row * 0.18, -1.9 + (i + row * 0.5) * 0.3], jitterCol(pc[(i + row) % 4], 0.03, r), { r: 0.04 });
      k.decal(circlePts(0.06, 10), [-4.8 - 0.002, 0.09 + row * 0.18, -1.9 + (i + row * 0.5) * 0.3], "#c99a6b", { rot: [0, PI / 2, 0] });
    }
  }
  ctx.box(-3.8, -1.45, 2.1, 1.3);
  ctx.spot("lumber", -3.8, 0.6, -1.45);
  // log stump with axe-free wedge
  k.cyl(0.5, 0.36, 0.4, [-2.2, 0, -2.9], "#c99a6b", { bevel: 0.05 });
  k.disc(0.32, 0.03, [-2.2, 0.5, -2.9], "#f2d4ae");
  k.torus(0.18, 0.01, [-2.2, 0.53, -2.9], "#d6aa7c", { seg: 16, key: "flat" });
  ctx.circle(-2.2, -2.9, 0.42);

  // ---- barrel + crates (front right) ----
  k.lathe([[0, 0], [0.35, 0], [0.42, 0.35], [0.35, 0.72], [0, 0.72]], [4.45, 0, -2.9], "#d6aa7c", { seg: 18 });
  for (const y of [0.12, 0.6]) k.torus(0.38, 0.025, [4.45, y, -2.9], "#8e88a3", { seg: 20, key: "fine" });
  crate(k, [4.4, 0, -1.8], 0.8, 0.6, 0.7, "#e8c49a", 0.3);
  ctx.circle(4.45, -2.9, 0.45);
  ctx.box(4.4, -1.8, 0.95, 0.9);
  pottedPlant(k, [4.45, 0.72, -2.9], { kind: "bush", potColor: "#f7a8c0", size: 0.8, seed: 3 });

  // ---- left wall: hanging saw + framed blueprint of the village ----
  onLeft(k, -1.0, 2.3, () => {
    k.box(1.3, 0.95, 0.06, [0, 0, -0.04], "#c99a6b", { r: 0.03 });
    k.box(1.15, 0.8, 0.03, [0, 0, -0.09], "#7fb8ec", { r: 0.01, key: "fine" });
    star(k, [0.3, 0.2, -0.13], 0.16, "#fffdf8", 0.02, { key: "flat" });
    heart(k, [-0.25, -0.1, -0.13], 0.22, "#fffdf8", 0.02, { key: "flat" });
  });
  bunting(k, X0 + 0.3, 5.2, WALL_H - 0.42, Z1 - 0.08, ["#ffd27a", "#a8e2c4", "#f7a8c0", "#a8d8f0"], { spacing: 0.6 });

  // ---- hanging lantern (flicker) ----
  const LP: V3 = [-1.3, 2.75, 2.2];
  cord(k, [LP[0], LP[1] + 0.25, LP[2]], 4);
  lantern(k, LP, "#6d5a78", 1.6);
  const lampMat = uniqueMat(scene, "workshop_lantern", { emissive: "#ffd99a" }) as StandardMaterial;
  k.anim("workshop_lantern_glow", { material: lampMat, outline: false, castShadow: false }, () => {
    k.at(k.frame(LP, 0, 1.6), () => {
      k.lathe([[0, -0.13], [0.08, -0.13], [0.095, 0], [0.08, 0.12], [0, 0.12]], [0, 0, 0], "#fff1c4", { seg: 10 });
    });
  });
  void lanternGlow;
  void bush;
  void archPts;
  void Color3;

  return finishInterior(
    "workshop",
    k,
    ctx,
    "#fbe3b8",
    (_dt, t) => {
      const f = 0.9 + Math.sin(t * 9.0) * 0.04 + Math.sin(t * 13.7) * 0.03 + Math.sin(t * 2.1) * 0.03;
      lampMat.emissiveColor.set(1.0 * f, 0.85 * f, 0.6 * f);
    },
    "#fff0da",
  );
}
