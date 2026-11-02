import { Vector3, type Scene } from "@babylonjs/core";
import type { InteriorDef } from "../../core/types";
import { Kit, archPts, circlePts, heartPts, roundRectPts, tabPts, type V3 } from "./kit";
import { RoomCtx, roomShell, finishInterior, makeRoot, onBack, onLeft, X0, Z1, WALL_H } from "./room";
import { PI, heart, ivyStrand, pottedPlant, pictureFrame, daisyArt, wallShelf, fluffyRug, heartDrawer, bush, cord, petalPts, flower, bunting, archWindow } from "./props";
import type { ColorLike } from "../../render/Shapes";
import { mixCol } from "../../render/Palette";

export function spool(k: Kit, p: V3, color: ColorLike, s = 1, rot: V3 = [0, 0, 0]) {
  k.at(k.frame(p, rot, s), () => {
    k.cyl(0.03, 0.07, 0.07, [0, 0, 0], "#e2b98c", { bevel: 0.012, seg: 10 });
    k.cyl(0.14, 0.058, 0.058, [0, 0.025, 0], color, { bevel: 0.02, seg: 12 });
    k.cyl(0.03, 0.07, 0.07, [0, 0.16, 0], "#e2b98c", { bevel: 0.012, seg: 10 });
  });
}

export function buttonJar(k: Kit, p: V3, s = 1) {
  k.at(k.frame(p, 0, s), () => {
    const cols = ["#f47a9a", "#8fc3ea", "#ffe066", "#a8e2c4", "#c9b3f2", "#ffb766"];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const y = 0.04 + (i / 14) * 0.22;
      k.cyl(0.02, 0.045, 0.045, [Math.cos(a) * 0.07, y, Math.sin(a) * 0.07 - 0.02], cols[i % cols.length], { rot: [0.6 * Math.sin(i), 0, 0.5 * Math.cos(i)], seg: 8, key: "fine" });
    }
    k.lathe(
      [
        [0, 0],
        [0.15, 0],
        [0.16, 0.04],
        [0.16, 0.28],
        [0.12, 0.31],
        [0, 0.31],
      ],
      [0, 0, 0],
      "#e6f6ff",
      { key: "glass" },
    );
    k.cyl(0.06, 0.13, 0.13, [0, 0.3, 0], "#f8b9cb", { bevel: 0.02 });
    // big button on lid
    k.cyl(0.03, 0.08, 0.08, [0, 0.37, 0], "#ffe066", { bevel: 0.012 });
  });
}

/** light-blue sewing machine facing -Z; returns hand-wheel centre (local to frame -> caller passes p) */
export function sewingMachine(k: Kit, p: V3, body: ColorLike, accent: ColorLike, rotY = 0) {
  k.at(k.frame(p, rotY), () => {
    k.box(0.95, 0.12, 0.45, [0, 0.06, 0], mixCol(body as string, "#ffffff", 0.3), { r: 0.05 });
    k.box(0.24, 0.5, 0.36, [0.3, 0.37, 0.02], body, { r: 0.1 });
    k.box(0.85, 0.22, 0.34, [0.0, 0.58, 0.02], body, { r: 0.1 });
    k.box(0.2, 0.3, 0.3, [-0.34, 0.47, 0.02], body, { r: 0.08 });
    // needle
    k.rod(0.14, 0.012, [-0.36, 0.25, -0.05], "#d9d4e3", { seg: 4 });
    k.box(0.12, 0.03, 0.1, [-0.36, 0.13, -0.05], "#d9d4e3", { r: 0.012, key: "fine" });
    // thread spool on top
    k.cyl(0.13, 0.05, 0.05, [0.15, 0.69, 0.02], "#f47a9a", { bevel: 0.02, seg: 10 });
    // flower decal on front
    k.puff(petalPts(0.1, 5, 30), 0.025, [-0.05, 0.58, -0.2], accent, { bevel: 0.01, key: "fine" });
    k.ball(0.035, [-0.05, 0.58, -0.235], "#ffe066", { scale: [1, 1, 0.5], key: "flat", seg: 5 });
    // stitch dial
    k.cyl(0.03, 0.05, 0.05, [0.3, 0.42, -0.17], "#fffdf8", { rot: [PI / 2, 0, 0], key: "fine", seg: 10 });
  });
}

/** pincushion with pins */
export function pincushion(k: Kit, p: V3, color: ColorLike, s = 1) {
  k.at(k.frame(p, 0, s), () => {
    k.revolve(
      (a) => {
        const w = 1 - 0.08 * Math.pow(Math.abs(Math.cos(a * 3)), 4);
        return [
          [0, 0],
          [0.12 * w, 0.0],
          [0.17 * w, 0.06],
          [0.16 * w, 0.13],
          [0.08 * w, 0.18],
          [0, 0.16],
        ];
      },
      [0, 0, 0],
      color,
      { segA: 24 },
    );
    k.blob(0.06, 0.02, 0.06, [0, 0.18, 0], "leaf", { seg: 5 });
    const heads = ["#ffe066", "#8fc3ea", "#a8e2c4", "#fffdf8", "#c9b3f2"];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + 0.3;
      const tilt: V3 = [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5];
      k.rod(0.12, 0.006, [Math.cos(a) * 0.09, 0.17, Math.sin(a) * 0.09], "#d9d4e3", { rot: tilt, seg: 4, key: "fine" });
      k.ball(0.022, [Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12], heads[i], { seg: 5, key: "fine" });
    }
  });
}

/** stack of folded fabrics, p = bottom centre */
export function fabricStack(k: Kit, p: V3, w: number, d: number, n: number, cols: ColorLike[], seed: number) {
  let y = p[1];
  for (let i = 0; i < n; i++) {
    const h = 0.07 + ((seed + i) % 3) * 0.015;
    const c = cols[(seed + i) % cols.length];
    k.box(w - (i % 2) * 0.03, h, d, [p[0] + (i % 2 ? 0.015 : -0.01), y + h / 2, p[2]], c, { r: 0.03, key: "fine" });
    // pattern: dots or stripe along the folded front edge
    if ((seed + i) % 2) {
      for (let j = 0; j < 4; j++) k.ball(0.012, [p[0] - w / 2 + 0.06 + j * ((w - 0.12) / 3), y + h / 2, p[2] - d / 2 - 0.025], "#fffdf8", { scale: [1, 1, 0.4], key: "flat", seg: 4 });
    } else {
      k.box(w - 0.06, 0.015, 0.01, [p[0], y + h / 2, p[2] - d / 2 - 0.028], mixCol(c as string, "#ffffff", 0.6), { r: 0.005, steps: 1, key: "flat" });
    }
    y += h;
  }
  return y;
}

export function mushroomStool(k: Kit, p: V3, cap: ColorLike, s = 1) {
  k.at(k.frame(p, 0, s), () => {
    k.lathe(
      [
        [0, 0],
        [0.2, 0],
        [0.22, 0.03],
        [0.16, 0.18],
        [0.15, 0.36],
        [0, 0.36],
      ],
      [0, 0, 0],
      "#fff3df",
    );
    k.revolve(
      () => [
        [0, 0.32],
        [0.3, 0.33],
        [0.4, 0.37],
        [0.42, 0.42],
        [0.36, 0.52],
        [0.2, 0.58],
        [0, 0.6],
      ],
      [0, 0, 0],
      cap,
      { segA: 26 },
    );
    // spots, aligned to the cap surface
    const spots: [number, number, number][] = [
      [0, 0, 0],
      [0.27, 0.4, 0.08],
      [0.28, 2.0, 0.07],
      [0.3, 3.4, 0.06],
      [0.27, 4.9, 0.075],
    ];
    for (const [r, a, sz] of spots) {
      const y = r === 0 ? 0.61 : 0.5 + (0.3 - r) * 0.3;
      const n: V3 = r === 0 ? [0, 1, 0] : [Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7];
      k.blob(sz || 0.08, 0.02, sz || 0.08, [Math.cos(a) * r, y + 0.005, Math.sin(a) * r], "#fffdf8", { up: n, seg: 6, key: "fine" });
    }
  });
}

export function yarnBall(k: Kit, p: V3, r: number, color: ColorLike, seed = 0) {
  k.ball(r, p, color, { seg: 8 });
  const dark = mixCol(color as string, "#7a5080", 0.18);
  for (let i = 0; i < 3; i++) k.torus(r * 0.98, 0.014, p, dark, { rot: [i * 1.1 + seed, i * 0.7, 0.4 * i], seg: 14, key: "fine" });
}

export function buildSewing(scene: Scene, origin: Vector3): InteriorDef {
  const root = makeRoot(scene, "sewing", origin);
  const k = new Kit(scene, root);
  const ctx = new RoomCtx(origin);

  roomShell(k, {
    wall: "#fbe39a",
    wallTop: "#fff0c2",
    wainscot: "#ffd8c2",
    wainscotH: 1.0,
    rail: "#fffdf8",
    border: "#ffc0a6",
    borderDeep: "#f39c80",
    crown: "#fffdf8",
    floor: "wood",
    floorA: "#f2d4ae",
    floorB: "#e9c79d",
    motif: "dots",
    motifColor: "#fff6d6",
    mat: "#ffc4a3",
    matAccent: "#fffdf8",
    seed: 55,
  });

  // ---- desk + sewing machine (back, centre-right) ----
  const D: V3 = [1.5, 0, Z1 - 0.55];
  k.box(2.5, 0.1, 0.95, [D[0], 0.86, D[2]], "#e2b98c", { r: 0.05 });
  for (const s of [-1, 1]) k.box(0.6, 0.81, 0.85, [D[0] + s * 0.9, 0.405, D[2]], "#d4a77a", { r: 0.06 });
  heartDrawer(k, [D[0] - 0.9, 0.62, D[2] - 0.43], 0.48, 0.3, "#f9d9e6", "#f47a9a");
  heartDrawer(k, [D[0] + 0.9, 0.62, D[2] - 0.43], 0.48, 0.3, "#f9d9e6", "#f47a9a");
  heartDrawer(k, [D[0] + 0.9, 0.25, D[2] - 0.43], 0.48, 0.3, "#f9d9e6", "#f47a9a");
  heartDrawer(k, [D[0] - 0.9, 0.25, D[2] - 0.43], 0.48, 0.3, "#f9d9e6", "#f47a9a");
  const top = 0.91 + 0.035;
  k.at(k.frame([D[0] + 0.05, top, D[2]], 0, 1.35), () => sewingMachine(k, [0, 0, 0], "#a8d8f0", "#f7a8c0"));
  // hand wheel (animated)
  const wheelC: V3 = [D[0] + 0.05 + 0.47 * 1.35, top + 0.5 * 1.35, D[2] + 0.02 * 1.35];
  const wheel = k.anim(
    "sew_wheel",
    { outline: 0.025 },
    () => {
      k.cyl(0.08, 0.13, 0.13, [wheelC[0] - 0.04, wheelC[1], wheelC[2]], "#f7a8c0", { rot: [0, 0, PI / 2], seg: 16, bevel: 0.03 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2;
        k.ball(0.025, [wheelC[0] + 0.06, wheelC[1] + Math.cos(a) * 0.08, wheelC[2] + Math.sin(a) * 0.08], "#fffdf8", { seg: 4, key: "fine" });
      }
      k.cyl(0.05, 0.03, 0.03, [wheelC[0] + 0.04, wheelC[1] + 0.09, wheelC[2]], "#fffdf8", { rot: [0, 0, PI / 2], seg: 8 });
    },
    wheelC,
  );
  // pink floral fabric draped over the desk front
  const fab = "#f7a8c0";
  k.puff(roundRectPts(0.9, 0.7, 0.1), 0.03, [D[0] - 0.35, top - 0.01, D[2] - 0.12], fab, { rot: [PI / 2, 0, 0.08], bevel: 0.012 });
  k.at(k.frame([D[0] - 0.4, top - 0.02, D[2] - 0.5], [0.12, 0, 0]), () => {
    const pts = tabPts(0.85, 0.6, 3).map(([x, y]) => [x + Math.sin(y * 9) * 0.03, y] as [number, number]);
    k.puff(pts, 0.035, [0, 0, 0], fab, { bevel: 0.015, spine: [[0, -0.05], [0, -0.4]] });
    for (let i = 0; i < 5; i++) {
      const fx = -0.3 + (i % 3) * 0.28 + (i > 2 ? 0.14 : 0),
        fy = i > 2 ? -0.38 : -0.14;
      k.decal(petalPts(0.06, 5, 20), [fx, fy, -0.025], "#fffdf8", { t: 0.008 });
      k.decal(circlePts(0.02, 8), [fx, fy, -0.035], "#ffe066", { t: 0.006 });
    }
  });
  ctx.box(D[0], D[2], 2.6, 1.05);
  ctx.spot("counter", D[0], top, D[2]);
  ctx.spot("item_fabric", D[0] - 0.4, top, D[2] - 0.3);
  // pincushion + scissors on desk
  pincushion(k, [D[0] + 1.0, top, D[2] - 0.1], "#f47a9a", 1.3);
  spool(k, [D[0] - 1.05, top, D[2] + 0.1], "#c9b3f2", 1.2);
  spool(k, [D[0] - 0.85, top, D[2] + 0.2], "#a8e2c4", 1.2);
  ctx.spot("npc", D[0] + 1.85, 0, D[2] - 0.6);
  // mushroom stool in front of the desk
  mushroomStool(k, [D[0] - 0.05, 0, D[2] - 1.2], "#f7a8c0", 1.25);
  ctx.circle(D[0] - 0.05, D[2] - 1.2, 0.5);

  // ---- pegboard above desk ----
  onBack(k, D[0], 2.45, () => {
    k.box(2.3, 1.15, 0.06, [0, 0, -0.03], "#fff3df", { r: 0.04 });
    k.box(2.42, 0.08, 0.1, [0, 0.6, -0.05], "#e2b98c", { r: 0.03 });
    k.box(2.42, 0.08, 0.1, [0, -0.6, -0.05], "#e2b98c", { r: 0.03 });
    for (let i = 0; i < 11; i++) for (let j = 0; j < 5; j++) k.decal(circlePts(0.018, 6), [-1.0 + i * 0.2, -0.42 + j * 0.21, -0.1], "#e8d2b8", { t: 0.004 });
    // pink scissors
    k.at(k.frame([-0.65, 0.05, -0.12], [0, 0, -0.5]), () => {
      for (const s of [-1, 1]) k.torus(0.085, 0.035, [s * 0.09, -0.2, 0], "#f47a9a", { rot: [PI / 2, 0, 0], seg: 14 });
      for (const s of [-1, 1])
        k.puff(
          [
            [-0.03, 0],
            [0.03, 0],
            [0.012, 0.42],
            [-0.01, 0.42],
          ],
          0.025,
          [s * 0.03, -0.1, -0.01 * s],
          "#d9d4e3",
          { rot: [0, 0, -s * 0.12], bevel: 0.01 },
        );
      k.ball(0.025, [0, -0.05, -0.04], "#f47a9a", { seg: 5 });
    });
    // heart pin cushion with pins
    k.puff(heartPts(0.4, 28), 0.14, [0.0, 0.08, -0.1], "#f47a9a", { bevel: 0.07, bulge: 0.04 });
    for (let i = 0; i < 4; i++) k.ball(0.025, [-0.1 + i * 0.07, 0.2 - (i % 2) * 0.06, -0.24], ["#ffe066", "#8fc3ea", "#fffdf8", "#a8e2c4"][i], { seg: 5, key: "fine" });
    // tape measure: yellow disc + hanging tape
    k.cyl(0.08, 0.15, 0.15, [0.55, 0.22, -0.08], "#ffe066", { rot: [PI / 2, 0, 0], seg: 18 });
    k.decal(circlePts(0.05, 14), [0.55, 0.22, -0.17], "#f47a9a");
    k.box(0.08, 0.6, 0.015, [0.62, -0.12, -0.06], "#fff3b0", { r: 0.006, steps: 1, key: "fine" });
    for (let i = 0; i < 8; i++) k.box(0.03, 0.008, 0.008, [0.6, 0.12 - i * 0.07, -0.075], "#6d5a78", { key: "flat", r: 0.003, steps: 1 });
    // spools on pegs
    for (let i = 0; i < 3; i++) {
      k.rod(0.14, 0.012, [0.85 + i * 0.0, -0.3 + i * 0.27, -0.09], "#c99a6b", { rot: [PI / 2, 0, 0], seg: 4 });
      spool(k, [0.85, -0.3 + i * 0.27, -0.13], ["#a8d8f0", "#ffe066", "#c9b3f2"][i], 0.9, [PI / 2, 0, 0]);
    }
  });
  ctx.spot("item_scissors", D[0] - 0.65, 2.45, Z1 - 0.2);

  // ---- shelf of thread spools + button jar (back left) ----
  onBack(k, -1.65, 2.3, () => wallShelf(k, [0, 0, 0], 2.0, 0.42, "#e2b98c", "#c99a6b"));
  const spoolCols = ["#f7a8c0", "#a8d8f0", "#ffe066", "#a8e2c4", "#c9b3f2", "#ffc4a3", "#f47a9a"];
  for (let i = 0; i < 7; i++) spool(k, [-2.45 + i * 0.17, 2.335, Z1 - 0.22 + (i % 2) * 0.06], spoolCols[i], 1.15);
  buttonJar(k, [-0.95, 2.335, Z1 - 0.22], 1.1);
  ctx.spot("item_button", -0.95, 2.4, Z1 - 0.3);
  // second shelf lower with fabric rolls
  onBack(k, -1.65, 1.45, () => wallShelf(k, [0, 0, 0], 2.0, 0.42, "#e2b98c", "#c99a6b"));
  ["#f9d9e6", "#bfe9d6", "#fff3b0", "#cfe8fa"].forEach((c, i) => k.capsule(0.5, 0.1, [-2.35 + i * 0.42, 1.585, Z1 - 0.22], c, { rot: [PI / 2, 0, 0] }));
  yarnBall(k, [-0.9, 1.6, Z1 - 0.2], 0.13, "#c9b3f2", 2);

  // ---- arched cubby of folded fabrics (left wall) ----
  onLeft(k, 2.5, 0, () => {
    const w = 1.9,
      h = 2.6,
      d = 0.55;
    k.puff(archPts(w, h, 16), 0.12, [0, 0, -0.06], "#f7c4d3", { bevel: 0.05 });
    k.puff(archPts(w - 0.25, h - 0.18, 16), 0.04, [0, 0.09, -0.13], "#fff3df", { bevel: 0.015 });
    // shelves
    for (const sy of [0.1, 0.72, 1.34, 1.92]) k.box(w - 0.2, 0.07, d, [0, sy, -d / 2 - 0.1], "#e2b98c", { r: 0.025 });
    for (const sx of [-0.27, 0.27]) k.box(0.06, 1.82, d, [sx, 1.0, -d / 2 - 0.1], "#e2b98c", { r: 0.02 });
    const fc = ["#f7a8c0", "#bfe9d6", "#fff3b0", "#c9b3f2", "#a8d8f0", "#ffc4a3", "#f9d9e6"];
    let seed = 0;
    for (const sy of [0.135, 0.755, 1.375]) for (const sx of [-0.6, 0, 0.6]) fabricStack(k, [sx, sy + 0.035, -d / 2 - 0.1], 0.46, 0.42, 4 + (seed % 2), fc, seed++ * 3);
    // top: heart + yarn
    heart(k, [0, 2.25, -0.25], 0.32, "#f47a9a", 0.08);
    yarnBall(k, [-0.45, 2.1, -0.3], 0.12, "#a8e2c4", 1);
    yarnBall(k, [0.45, 2.1, -0.3], 0.12, "#ffe066", 3);
  });
  ctx.box(X0 + 0.45, 2.5, 0.9, 2.0);
  ctx.spot("cubby", X0 + 1.0, 0, 2.5);

  // ---- framed flower picture (left wall) ----
  onLeft(k, 0.2, 2.35, () => pictureFrame(k, [0, 0, 0], 0.85, 1.0, "#a8e2c4", "#fff6e6", () => daisyArt(k, 1.9, "#f7a8c0", "#ffe066")));

  // ---- dress form (front left) ----
  k.at(k.frame([-4.1, 0, -1.4], 0.4), () => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2;
      k.rod(0.5, 0.03, [Math.cos(a) * 0.18, 0.2, Math.sin(a) * 0.18], "#c99a6b", { rot: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6] });
    }
    k.rod(0.7, 0.035, [0, 0.65, 0], "#c99a6b");
    k.lathe(
      [
        [0, 0.95],
        [0.32, 0.95],
        [0.26, 1.3],
        [0.24, 1.45],
        [0.3, 1.65],
        [0.24, 1.8],
        [0.06, 1.88],
        [0.05, 1.98],
        [0, 1.98],
      ],
      [0, 0, 0],
      "#fff3df",
      { seg: 18 },
    );
    // pink skirt with scalloped hem
    k.revolve(
      (a) => {
        const sc = Math.pow(Math.abs(Math.cos(a * 5)), 0.6);
        return [
          [0.25, 1.42],
          [0.3, 1.4],
          [0.45 + sc * 0.03, 0.95 - sc * 0.06],
          [0.42, 0.93 - sc * 0.06],
          [0.26, 1.2],
        ];
      },
      [0, 0, 0],
      "#f7a8c0",
      { segA: 40 },
    );
    k.ball(0.04, [0, 2.0, 0], "#f47a9a", { seg: 6 });
    k.torus(0.26, 0.03, [0, 1.45, 0], "#ffe066", { seg: 20 });
  });
  ctx.circle(-4.1, -1.4, 0.5);

  // ---- rug, yarn basket ----
  fluffyRug(k, [-0.4, 0, -0.5], 1.9, "#fff3df", "#fffaf0", 1.15, 0.9);
  const B: V3 = [-1.7, 0, 0.55];
  k.lathe(
    [
      [0, 0],
      [0.4, 0],
      [0.48, 0.1],
      [0.52, 0.42],
      [0.48, 0.42],
      [0, 0.36],
    ],
    B,
    "#e2b98c",
    { seg: 20, bottom: "#c99a6b" },
  );
  for (const y of [0.12, 0.24, 0.36]) k.torus(0.5 + y * 0.08, 0.03, [B[0], y, B[2]], "#c99a6b", { seg: 22, key: "fine" });
  yarnBall(k, [B[0] - 0.15, 0.48, B[2] + 0.05], 0.2, "#f7a8c0", 0);
  yarnBall(k, [B[0] + 0.2, 0.47, B[2] - 0.05], 0.18, "#a8d8f0", 1);
  yarnBall(k, [B[0] + 0.02, 0.5, B[2] + 0.22], 0.17, "#ffe066", 2);
  for (const s of [-1, 1]) {
    k.rod(0.75, 0.018, [B[0] + s * 0.05, 0.72, B[2] + 0.05], "#fffdf8", { rot: [0.2, 0, s * 0.35], seg: 5 });
    k.ball(0.045, [B[0] + s * 0.05 - s * Math.sin(0.35) * 0.4, 0.72 + 0.37, B[2] + 0.05 + 0.08], s > 0 ? "#f47a9a" : "#8fc3ea", { seg: 6 });
  }
  ctx.circle(B[0], B[2], 0.6);
  ctx.spot("item_yarn", B[0], 0.5, B[2]);
  ctx.spot("rug", -0.4, 0.07, -0.5);

  // ---- bunting + window (back right) ----
  bunting(k, X0 + 0.3, 5.2, WALL_H - 0.45, Z1 - 0.08, ["#f7a8c0", "#a8d8f0", "#fffdf8", "#a8e2c4", "#c9b3f2"], { sag: 0.1, spacing: 0.55 });
  onBack(k, 4.05, 1.3, () => archWindow(k, [0, 0, 0], 1.0, 1.55, { frame: "#fffdf8", view: "garden", sill: "#ffc0a6" }));
  pottedPlant(k, [4.05, 1.3 - 0.04 + 0.04, Z1 - 0.15], { kind: "fern", potColor: "#fff3df", size: 0.55, seed: 77 });

  // ---- clothes rack with little dresses (right) ----
  k.at(k.frame([3.75, 0, 0.35], 0.35), () => {
    for (const s of [-1, 1]) {
      k.rod(1.75, 0.035, [s * 0.85, 0.88, 0], "#e2b98c");
      k.box(0.12, 0.06, 0.6, [s * 0.85, 0.03, 0], "#c99a6b", { r: 0.025 });
    }
    k.rod(1.8, 0.03, [0, 1.74, 0], "#e2b98c", { rot: [0, 0, PI / 2] });
    const dc = ["#f7a8c0", "#a8d8f0", "#fff3b0", "#c9b3f2", "#bfe9d6"];
    for (let i = 0; i < 5; i++) {
      const x = -0.64 + i * 0.32;
      k.torus(0.05, 0.012, [x, 1.76, 0], "#6d5a78", { seg: 8, key: "fine", rot: [PI / 2, 0, 0] });
      k.at(k.frame([x, 1.68, 0], [0, 0, 0]), () => {
        k.revolve(
          (a) => {
            const sc = Math.pow(Math.abs(Math.cos(a * 4)), 0.6);
            return [
              [0.02, 0.02],
              [0.1, 0],
              [0.14, -0.25],
              [0.3 + sc * 0.02, -0.75 - sc * 0.04],
              [0.27, -0.76 - sc * 0.04],
              [0.08, -0.3],
            ];
          },
          [0, 0, 0],
          dc[i],
          { segA: 24, scale: [0.5, 1, 0.4] },
        );
      });
    }
  });
  ctx.box(3.75, 0.35, 2.0, 1.0);

  // ---- basket of fabric rolls (back-left corner) ----
  k.lathe([[0, 0], [0.35, 0], [0.42, 0.45], [0.38, 0.45], [0, 0.4]], [-3.4, 0, 3.3], "#e2b98c", { seg: 18, bottom: "#c99a6b" });
  ["#f7a8c0", "#fff3b0", "#a8d8f0", "#c9b3f2"].forEach((c, i) => {
    const a = (i / 4) * PI * 2;
    k.capsule(1.1, 0.1, [-3.4 + Math.cos(a) * 0.15, 0.7, 3.3 + Math.sin(a) * 0.15], c, { rot: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2] });
  });
  ctx.circle(-3.4, 3.3, 0.45);

  // ---- plants ----
  pottedPlant(k, [4.55, 0, -3.1], { kind: "tall", potColor: "#f7a8c0", size: 1.6, seed: 15, heart: "#fffdf8" });
  ctx.circle(4.55, -3.1, 0.45);


  // ---- hanging plant (animated) ----
  const HP: V3 = [-3.9, 2.55, 1.0];
  const hang = k.anim(
    "sew_hang",
    { outline: 0.025 },
    () => {
      cord(k, [HP[0], HP[1] + 0.3, HP[2]], 4);
      k.lathe([[0, -0.05], [0.2, -0.04], [0.28, 0.1], [0.3, 0.26], [0.26, 0.28], [0, 0.22]], HP, "#fff3df");
      k.torus(0.28, 0.03, [HP[0], HP[1] + 0.15, HP[2]], "#f7a8c0", { seg: 18 });
      bush(k, [HP[0], HP[1] + 0.22, HP[2]], 0.4, 3, "main", undefined, 6, 4);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        ivyStrand(k, [HP[0] + Math.cos(a) * 0.25, HP[1] + 0.2, HP[2] + Math.sin(a) * 0.25], 0.5 + (i % 3) * 0.25, 600 + i);
      }
    },
    [HP[0], HP[1] + 4.3, HP[2]],
  );

  void WALL_H;
  return finishInterior(
    "sewing",
    k,
    ctx,
    "#ffd9b8",
    (dt, t) => {
      if (wheel) wheel.rotation.x += dt * 1.6;
      if (hang) hang.rotation.z = Math.sin(t * 0.8) * 0.01;
    },
    "#fff1dc",
    0.86,
  );
}
