/**
 * Storybook cottage exteriors. Authored in local space: door faces -Z, ground y=0, centre at origin.
 */
import { Vector3, TransformNode, Matrix, type Scene, type Mesh, type StandardMaterial } from "@babylonjs/core";
import type { Collider, ExteriorDef } from "../../core/types";
import { Kit, archPts, circlePts, heartPts, roundRectPts, scallopPts, starPts, tabPts, uniqueMat, type V3, type P2 } from "./kit";
import { PI, heart, star, leaf, bush, flower, flowerPot, pottedPlant, lantern, ivyStrand, petalPts, bookRow, teacup, BOOK_COLS, type FlowerKind } from "./props";
import { awning, tieredStand, wateringCan, crate } from "./int_flowershop";
import { spool } from "./int_sewing";
import { hammerShape, sawShape, sawhorse } from "./int_workshop";
import type { ColorLike } from "../../render/Shapes";
import { mixCol, rng, jitterCol } from "../../render/Palette";

const BASE = 0.35; // foundation height

/* ------------------------------------------------------------------ */
/* parts                                                               */
/* ------------------------------------------------------------------ */

function foundation(k: Kit, w: number, d: number, seed: number) {
  const r = rng(seed);
  k.box(w + 0.45, BASE, d + 0.45, [0, BASE / 2, 0], "#d9d4e3", { r: 0.16, bottom: "#b4aec4" });
  // cobbles along the front
  for (let x = -w / 2; x <= w / 2; x += 0.42) k.blob(0.2, 0.12, 0.08, [x + (r() - 0.5) * 0.08, 0.17 + (r() - 0.5) * 0.05, -d / 2 - 0.235], jitterCol("#e4dfec", 0.03, r), { seg: 5 });
}

/** walls box with corner posts */
function walls(k: Kit, w: number, d: number, h: number, wall: ColorLike, wallDeep: ColorLike, trim: ColorLike) {
  k.box(w, h, d, [0, BASE + h / 2, 0], wall, { r: 0.2, steps: 2, bottom: wallDeep });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.28, h + 0.05, 0.28, [sx * (w / 2), BASE + h / 2, sz * (d / 2)], trim, { r: 0.12 });
  // top band
  k.box(w + 0.12, 0.16, d + 0.12, [0, BASE + h - 0.06, 0], trim, { r: 0.07 });
}

/** one gable slope; built in a frame where the ridge runs along X at y=ph, eave at z=-run, y=0. */
function slope(k: Kit, w: number, run: number, ph: number, o: { color: ColorLike; rows: ColorLike[]; thick?: number; scallop?: boolean; overhang?: number }) {
  const thick = o.thick ?? 0.24;
  const L = Math.hypot(run, ph);
  const th = Math.atan2(run, ph);
  const W = w + 2 * (o.overhang ?? 0.35);
  k.at(k.frame([0, ph / 2, -run / 2], [th, 0, 0]), () => {
    k.box(W, L + 0.15, thick, [0, 0, 0], o.color, { r: 0.1, steps: 2 });
    if (o.scallop !== false) {
      const rowH = 0.42;
      const n = Math.floor((L - 0.1) / rowH);
      for (let i = 0; i < n; i++) {
        const top = L / 2 - 0.05 - i * rowH;
        const cnt = Math.round(W / 0.44);
        k.puff(scallopPts(W - 0.06, rowH * 0.55, cnt, 4), 0.07, [0, top - rowH * 0.55, -thick / 2 - 0.06 - i * 0.012], o.rows[i % o.rows.length], {
          bevel: 0.03,
          spine: [[-W / 2, rowH * 0.25], [W / 2, rowH * 0.25]],
        });
      }
    }
  });
}

/** gable roof with ridge along local X; y0 = eave height; returns ridge height */
function gableRoof(k: Kit, w: number, d: number, y0: number, ph: number, o: { color: ColorLike; rows: ColorLike[]; ridge?: ColorLike; gable?: ColorLike; overhang?: number; scallop?: boolean }) {
  const ov = o.overhang ?? 0.45;
  const run = d / 2 + ov;
  const phx = ph * (run / (d / 2));
  for (const rot of [0, PI]) k.at(k.frame([0, y0 - (phx - ph), 0], rot), () => slope(k, w, run, phx, { color: o.color, rows: o.rows, overhang: 0.35, scallop: o.scallop }));
  // ridge cap
  k.capsule(w + 0.95, 0.15, [0, y0 + ph + 0.12, 0], o.ridge ?? o.color, { rot: [0, 0, PI / 2] });
  // gable triangles at the ends
  if (o.gable) {
    for (const sx of [-1, 1]) {
      k.at(k.frame([sx * (w / 2 - 0.05), y0, 0], sx > 0 ? -PI / 2 : PI / 2), () => {
        k.puff(
          [
            [-d / 2 - 0.05, 0],
            [d / 2 + 0.05, 0],
            [0, ph - 0.05],
          ],
          0.25,
          [0, 0, 0],
          o.gable!,
          { bevel: 0.08 },
        );
      });
    }
  }
  return y0 + ph;
}

/** window on a wall surface (frame: local -Z out). glass glows warm. */
function extWindow(
  k: Kit,
  p: V3,
  rotY: number,
  o: { w?: number; h?: number; kind?: "arch" | "round" | "rect"; frame?: ColorLike; shutters?: ColorLike; box?: ColorLike; flowers?: ColorLike[]; heart?: ColorLike },
) {
  const w = o.w ?? 0.9,
    h = o.h ?? 1.1;
  const fr = o.frame ?? "#fffdf8";
  k.at(k.frame(p, rotY), () => {
    const kind = o.kind ?? "arch";
    if (kind === "round") {
      k.puff(circlePts(w / 2, 24), 0.06, [0, h / 2, -0.06], "#ffe7a8", { key: "winGlow", bevel: 0.02, bottom: "#ffcf86" });
      k.torus(w / 2, 0.11, [0, h / 2, -0.08], fr, { rot: [PI / 2, 0, 0], seg: 24 });
      k.box(0.06, w, 0.05, [0, h / 2, -0.11], fr, { r: 0.02 });
      k.box(w, 0.06, 0.05, [0, h / 2, -0.11], fr, { r: 0.02 });
      return;
    }
    const pts = kind === "arch" ? archPts(w, h, 12) : roundRectPts(w, h, 0.08).map(([x, y]) => [x, y + h / 2] as P2);
    k.puff(pts, 0.06, [0, 0, -0.06], "#ffe7a8", { key: "winGlow", bevel: 0.02, bottom: "#ffcf86" });
    // frame tube
    const path: V3[] = [];
    if (kind === "arch") {
      const r = w / 2;
      path.push([r, 0, -0.08]);
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * PI;
        path.push([Math.cos(a) * r, h - r + Math.sin(a) * r, -0.08]);
      }
      path.push([-r, 0, -0.08]);
      path.push([r, 0, -0.08]);
    } else {
      path.push([w / 2, 0, -0.08], [w / 2, h, -0.08], [-w / 2, h, -0.08], [-w / 2, 0, -0.08], [w / 2, 0, -0.08]);
    }
    k.tube(path, 0.07, fr, { tess: 8 });
    k.box(0.06, h - 0.05, 0.05, [0, h / 2, -0.11], fr, { r: 0.02 });
    k.box(w, 0.06, 0.05, [0, h * 0.5, -0.11], fr, { r: 0.02 });
    if (o.heart) heart(k, [0, h - w / 2 + 0.02, -0.13], 0.16, o.heart, 0.04);
    if (o.shutters) {
      for (const s of [-1, 1]) {
        k.puff(roundRectPts(w * 0.42, h * 0.95, 0.06), 0.06, [s * (w / 2 + w * 0.26), h / 2, -0.08], o.shutters, { bevel: 0.025 });
        heart(k, [s * (w / 2 + w * 0.26), h * 0.62, -0.13], 0.12, "#fffdf8", 0.03, { key: "flat" });
      }
    }
    // sill
    k.box(w + 0.3, 0.09, 0.22, [0, -0.04, -0.12], fr, { r: 0.04 });
    if (o.box) {
      k.box(w + 0.2, 0.26, 0.3, [0, -0.2, -0.22], o.box, { r: 0.07 });
      const fl = o.flowers ?? ["#f47a9a", "#ffe066", "#fffdf8"];
      bush(k, [0, -0.15, -0.22], 0.38, 4, "main", ["#8fd27a", "#5fb46a"], 5, 3);
      for (let i = 0; i < 5; i++) k.ball(0.065, [-w / 2 + (i + 0.5) * (w / 5), 0.0 + (i % 2) * 0.05, -0.3], fl[i % fl.length], { seg: 6 });
    }
  });
}

/** front door. p = bottom centre on wall surface. */
function extDoor(k: Kit, p: V3, o: { w?: number; h?: number; color: ColorLike; frame?: ColorLike; heartWin?: boolean; knob?: ColorLike; kind?: "arch" | "barn" }) {
  const w = o.w ?? 1.15,
    h = o.h ?? 2.15;
  k.at(k.frame(p, 0), () => {
    if (o.kind === "barn") {
      k.puff(roundRectPts(w + 0.3, h + 0.2, 0.15).map(([x, y]) => [x, y + (h + 0.2) / 2] as P2), 0.12, [0, -0.02, -0.04], o.frame ?? "#c99a6b", { bevel: 0.05 });
      for (const s of [-1, 1]) {
        k.box(w / 2 - 0.03, h, 0.1, [s * (w / 4 + 0.01), h / 2, -0.12], o.color, { r: 0.05 });
        // X brace
        const bl = Math.hypot(w / 2 - 0.15, h - 0.3);
        const ang = Math.atan2(w / 2 - 0.15, h - 0.3);
        for (const t of [-1, 1]) k.box(0.09, bl, 0.05, [s * (w / 4 + 0.01), h / 2, -0.19], "#fff3df", { rot: [0, 0, t * ang], r: 0.025 });
        k.box(w / 2 - 0.1, 0.1, 0.05, [s * (w / 4 + 0.01), 0.15, -0.19], "#fff3df", { r: 0.025 });
        k.box(w / 2 - 0.1, 0.1, 0.05, [s * (w / 4 + 0.01), h - 0.15, -0.19], "#fff3df", { r: 0.025 });
      }
      return;
    }
    k.puff(archPts(w + 0.32, h + 0.16, 14), 0.12, [0, -0.02, -0.04], o.frame ?? "#fffdf8", { bevel: 0.05 });
    k.puff(archPts(w, h, 14), 0.12, [0, 0, -0.11], o.color, { bevel: 0.05, bottom: mixCol(o.color as string, "#7a5080", 0.1) });
    // planks lines
    for (const x of [-w / 4, w / 4]) k.box(0.025, h * 0.55, 0.02, [x, h * 0.3, -0.225], mixCol(o.color as string, "#7a5080", 0.2), { key: "flat", r: 0.01, steps: 1 });
    if (o.heartWin) {
      k.puff(heartPts(w * 0.45, 26), 0.03, [0, h - w * 0.55, -0.235], "#ffe7a8", { key: "winGlow", bevel: 0.012 });
    } else {
      k.puff(circlePts(w * 0.18, 18), 0.03, [0, h - w * 0.5, -0.235], "#ffe7a8", { key: "winGlow", bevel: 0.012 });
      k.torus(w * 0.18, 0.04, [0, h - w * 0.5, -0.245], o.frame ?? "#fffdf8", { rot: [PI / 2, 0, 0], seg: 18 });
    }
    k.ball(0.065, [w * 0.33, h * 0.45, -0.26], o.knob ?? "#ffe066", { seg: 7 });
  });
}

/** steps + path stones from the door toward -Z */
function doorstep(k: Kit, x: number, z: number, w: number, seed: number) {
  k.box(w + 0.5, BASE * 0.5, 0.55, [x, BASE * 0.25, z - 0.25], "#e4dfec", { r: 0.08 });
  const r = rng(seed);
  for (let i = 0; i < 4; i++) k.blob(0.32 + r() * 0.08, 0.05, 0.24, [x + (r() - 0.5) * 0.4, 0.02, z - 0.95 - i * 0.62], jitterCol("#f1dcb6", 0.03, r), { rot: [0, r() * 0.6, 0], seg: 6 });
}

/** wall lantern beside a door (local -Z out). */
function wallLantern(k: Kit, p: V3) {
  k.box(0.06, 0.06, 0.3, [p[0], p[1] + 0.32, p[2] - 0.15], "#6d5a78", { r: 0.02 });
  lantern(k, [p[0], p[1], p[2] - 0.32], "#6d5a78", 1.0);
  k.lathe(
    [
      [0, -0.13],
      [0.08, -0.13],
      [0.095, 0],
      [0.08, 0.12],
      [0, 0.12],
    ],
    [p[0], p[1], p[2] - 0.32],
    "#fff1c4",
    { key: "glow", seg: 10 },
  );
}

/** hanging sign on an arm that sticks out sideways past a front corner; returns arm hinge (local) */
function hangingSign(k: Kit, hinge: V3, dir: 1 | -1, len: number, board: ColorLike, icon: () => void, name: string, rim: ColorLike = "#fffdf8"): Mesh | null {
  // arm (static)
  k.box(len, 0.08, 0.08, [hinge[0] + (dir * len) / 2, hinge[1], hinge[2]], "#6d5a78", { r: 0.03 });
  k.tube(
    [
      [hinge[0], hinge[1] - 0.45, hinge[2]],
      [hinge[0] + dir * len * 0.55, hinge[1] - 0.02, hinge[2]],
    ],
    0.025,
    "#6d5a78",
  );
  k.ball(0.07, [hinge[0] + dir * len, hinge[1], hinge[2]], "#ffe066", { seg: 6 });
  const cx = hinge[0] + dir * len * 0.55;
  return k.anim(
    name,
    { outline: 0.035 },
    () => {
      for (const s of [-1, 1]) k.rod(0.28, 0.012, [cx + s * 0.3, hinge[1] - 0.14, hinge[2]], "#6d5a78", { seg: 4 });
      k.at(k.frame([cx, hinge[1] - 0.62, hinge[2]], 0), () => {
        k.puff(roundRectPts(0.95, 0.68, 0.2), 0.1, [0, 0, 0], rim, { bevel: 0.045 });
        k.puff(roundRectPts(0.8, 0.53, 0.14), 0.05, [0, 0, -0.07], board, { bevel: 0.02 });
        k.at(k.frame([0, 0, -0.15], 0), icon);
      });
    },
    [cx, hinge[1], hinge[2]],
  );
}

/* ------------------------------------------------------------------ */
/* buildings                                                           */
/* ------------------------------------------------------------------ */

interface Built {
  footprint: [number, number, number, number][]; // local rects: cx, cz, w, d
  doorLocal: V3;
  update?: (dt: number, t: number) => void;
}

function buildHomeExt(k: Kit, scene: Scene): Built {
  const w = 5.6,
    d = 4.6,
    h = 2.9;
  foundation(k, w, d, 1);
  walls(k, w, d, h, "#ffd3b5", "#f7b996", "#fffdf8");
  const top = gableRoof(k, w, d, BASE + h, 2.1, { color: "#f48fa0", rows: ["#f7a1b2", "#f48fa0"], ridge: "#ef7d93", gable: "#ffd3b5" });
  // little front dormer gable over the door
  k.at(k.frame([0, BASE + h - 0.1, -d / 2 - 0.1], 0), () => {
    k.puff(
      [
        [-1.0, 0],
        [1.0, 0],
        [0, 1.0],
      ],
      0.3,
      [0, 0, 0],
      "#ffd3b5",
      { bevel: 0.1 },
    );
    heart(k, [0, 0.4, -0.2], 0.4, "#f47a9a", 0.08);
  });
  for (const s of [-1, 1]) {
    k.at(k.frame([s * 0.6, BASE + h + 0.42, -d / 2 - 0.15], [0, 0, s * -0.785]), () => k.box(1.55, 0.18, 0.5, [0, 0, 0], "#ef7d93", { r: 0.08 }));
  }
  // chimney
  k.box(0.7, 1.9, 0.7, [w / 2 - 1.1, top - 0.35, 0.8], "#e8a58c", { r: 0.12, bottom: "#d98a72" });
  k.box(0.86, 0.2, 0.86, [w / 2 - 1.1, top + 0.65, 0.8], "#d9d4e3", { r: 0.08 });
  for (let i = 0; i < 4; i++) k.box(0.22, 0.12, 0.04, [w / 2 - 1.1 + (i % 2 ? 0.12 : -0.15), top - 0.6 + i * 0.32, 0.8 - 0.37], "#f4b9a3", { key: "flat", r: 0.03, steps: 1 });
  // door + windows
  extDoor(k, [0, BASE, -d / 2], { color: "#f47a9a", heartWin: true, knob: "#ffe066" });
  extWindow(k, [-1.75, BASE + 1.0, -d / 2], 0, { w: 0.95, h: 1.15, shutters: "#a8d8f0", box: "#a8d8f0" });
  extWindow(k, [1.75, BASE + 1.0, -d / 2], 0, { w: 0.95, h: 1.15, shutters: "#a8d8f0", box: "#a8d8f0" });
  extWindow(k, [-w / 2, BASE + 1.0, 0.2], PI / 2, { w: 0.9, h: 1.1, kind: "arch" });
  extWindow(k, [w / 2, BASE + 1.0, 0.2], -PI / 2, { w: 0.9, h: 1.1, kind: "arch" });
  extWindow(k, [w / 2 + 0.05, BASE + h + 0.7, 0], -PI / 2, { w: 0.7, h: 0.7, kind: "round" });
  extWindow(k, [-w / 2 - 0.05, BASE + h + 0.7, 0], PI / 2, { w: 0.7, h: 0.7, kind: "round" });
  wallLantern(k, [-0.95, BASE + 1.9, -d / 2]);
  wallLantern(k, [0.95, BASE + 1.9, -d / 2]);
  doorstep(k, 0, -d / 2 - 0.2, 1.2, 3);
  // garden: mailbox, bushes, flower pots, picket bits
  k.rod(1.0, 0.05, [-2.6, 0.5, -d / 2 - 1.2], "#e2b98c");
  k.box(0.5, 0.36, 0.34, [-2.6, 1.15, -d / 2 - 1.2], "#a8d8f0", { r: 0.14 });
  heart(k, [-2.6, 1.15, -d / 2 - 1.42], 0.16, "#f47a9a", 0.04);
  k.box(0.04, 0.22, 0.12, [-2.33, 1.3, -d / 2 - 1.2], "#f47a9a", { r: 0.015 });
  bush(k, [-w / 2 - 0.25, 0, -d / 2 + 0.3], 0.95, 11, "main", ["#8fd27a", "#6fbf73", "#a6dc8c"], 7, 4);
  bush(k, [w / 2 + 0.25, 0, -d / 2 + 0.6], 0.85, 12, "main", ["#8fd27a", "#6fbf73", "#a6dc8c"], 7, 4);
  for (let i = 0; i < 6; i++) k.ball(0.08, [-w / 2 - 0.35 + Math.cos(i) * 0.45, 0.55 + Math.sin(i * 2) * 0.2, -d / 2 + 0.05 + Math.sin(i) * 0.3], i % 2 ? "#f47a9a" : "#fffdf8", { seg: 5 });
  flowerPot(k, [1.0, 0, -d / 2 - 0.75], "tulip", ["#f47a9a", "#ffe066"], { potColor: "#f7a98f", size: 1.4, seed: 2 });
  // smoke puffs
  const smokeMat = uniqueMat(scene, "home_smoke", { emissive: "#eee6f0" }) as StandardMaterial;
  const puffs: Mesh[] = [];
  const S = new Vector3(w / 2 - 1.1, top + 0.8, 0.8);
  for (let i = 0; i < 4; i++) {
    const m = k.anim(`home_smoke${i}`, { material: smokeMat, outline: false, castShadow: false }, () => k.ball(0.22, [0, 0, 0], "#ffffff", { seg: 7 }));
    if (m) puffs.push(m);
  }
  return {
    footprint: [[0, 0, w + 0.5, d + 0.5]],
    doorLocal: [0, 0, -d / 2 - 0.85],
    update: (_dt, t) => {
      puffs.forEach((m, i) => {
        const ph = (t * 0.18 + i / puffs.length) % 1;
        m.position.set(S.x + Math.sin(ph * 5 + i) * 0.25 + ph * 0.5, S.y + ph * 2.6, S.z);
        m.scaling.setAll(0.5 + ph * 1.4);
        m.visibility = Math.min(1, ph * 6) * (1 - ph) * 0.9;
      });
    },
  };
}

function buildTeaExt(k: Kit, scene: Scene): Built {
  const w = 5.2,
    d = 5.4,
    h = 3.0;
  foundation(k, w, d, 2);
  walls(k, w, d, h, "#d2bdf3", "#b49be2", "#fffdf8");
  // front-facing gable: ridge along Z
  k.at(k.frame([0, 0, 0], PI / 2), () => {
    gableRoof(k, d, w, BASE + h, 2.5, { color: "#f48fab", rows: ["#f8b9cb", "#f7a8c0"], ridge: "#ef7d9b", overhang: 0.45 });
  });
  // front gable triangle with round window + scallop trim
  for (const z of [-d / 2 - 0.02, d / 2 + 0.02]) {
    k.at(k.frame([0, BASE + h - 0.05, z], z < 0 ? 0 : PI), () => {
      k.puff(
        [
          [-w / 2 - 0.05, 0],
          [w / 2 + 0.05, 0],
          [0, 2.45],
        ],
        0.3,
        [0, 0, 0],
        "#dccbf8",
        { bevel: 0.1 },
      );
      k.puff(scallopPts(w * 0.9, 0.12, 12, 4), 0.07, [0, 0.0, -0.17], "#fff6e6", { bevel: 0.03, spine: [[-w * 0.45, 0.06], [w * 0.45, 0.06]] });
    });
  }
  extWindow(k, [0, BASE + h + 0.45, -d / 2 - 0.15], 0, { w: 0.8, h: 0.8, kind: "round" });
  extDoor(k, [0, BASE, -d / 2], { color: "#f7a8c4", knob: "#ffe066" });
  extWindow(k, [-1.6, BASE + 1.0, -d / 2], 0, { w: 0.95, h: 1.3, box: "#f8b9cb", flowers: ["#fffdf8", "#ffe066", "#f47a9a"] });
  extWindow(k, [1.6, BASE + 1.0, -d / 2], 0, { w: 0.95, h: 1.3, box: "#f8b9cb", flowers: ["#fffdf8", "#ffe066", "#f47a9a"] });
  extWindow(k, [-w / 2, BASE + 1.0, 0.3], PI / 2, { w: 0.9, h: 1.2 });
  extWindow(k, [w / 2, BASE + 1.0, 0.3], -PI / 2, { w: 0.9, h: 1.2 });
  wallLantern(k, [-0.9, BASE + 1.95, -d / 2]);
  doorstep(k, 0, -d / 2 - 0.2, 1.2, 5);
  // ivy climbing the front corners
  const r = rng(9);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const y = BASE + 0.2 + i * 0.19;
      const x = sx * (w / 2 - 0.1) - sx * (Math.sin(i * 0.9) * 0.25 + 0.15 + (i > 10 ? (i - 10) * 0.12 : 0));
      leaf(k, [x, y, -d / 2 - 0.2], 0.16 + r() * 0.05, i % 3 ? "#7cc86f" : "#5fb46a", [0, 0, (r() - 0.5) * 2]);
      if (i % 4 === 2) k.ball(0.055, [x + 0.08, y, -d / 2 - 0.26], "#f8b9cb", { seg: 5 });
    }
  }
  for (let i = 0; i < 5; i++) ivyStrand(k, [-w / 2 + 0.4 + i * 0.25, BASE + h - 0.05, -d / 2 - 0.25], 0.35 + (i % 3) * 0.2, 40 + i);
  // teacup sign
  const sign = hangingSign(
    k,
    [w / 2 + 0.1, BASE + h - 0.2, -d / 2 - 0.25],
    1,
    1.1,
    "#fff3df",
    () => {
      k.lathe(
        [
          [0, 0],
          [0.1, 0],
          [0.16, 0.1],
          [0.17, 0.2],
          [0, 0.18],
        ],
        [0, -0.15, -0.03],
        "#f8b9cb",
        { rot: [-0.25, 0, 0], seg: 14 },
      );
      k.torus(0.07, 0.025, [0.18, -0.03, -0.03], "#f8b9cb", { rot: [PI / 2, 0, 0], seg: 10 });
      heart(k, [0, -0.04, -0.2], 0.1, "#fffdf8", 0.02, { key: "flat" });
      for (let i = 0; i < 3; i++) k.blob(0.025, 0.06, 0.02, [-0.06 + i * 0.06, 0.15 + (i % 2) * 0.03, -0.05], "#fffdf8", { seg: 4 });
    },
    "tea_sign",
    "#f7a8c4",
  );
  // outdoor table with teacups
  k.cyl(0.05, 0.28, 0.32, [-2.9, 0, -d / 2 - 1.3], "#fffdf8");
  k.rod(0.7, 0.05, [-2.9, 0.37, -d / 2 - 1.3], "#fffdf8");
  k.cyl(0.06, 0.48, 0.48, [-2.9, 0.72, -d / 2 - 1.3], "#f8b9cb", { bevel: 0.03 });
  teacup(k, [-3.05, 0.815, -d / 2 - 1.35], "#fffdf8", "#c9b3f2", 1.4, 0.4);
  teacup(k, [-2.7, 0.815, -d / 2 - 1.2], "#fffdf8", "#bfe9d6", 1.4, 2.4);
  pottedPlant(k, [2.6, 0, -d / 2 - 0.6], { kind: "bush", potColor: "#c9b3f2", size: 1.4, seed: 4 });
  void scene;
  return {
    footprint: [
      [0, 0, w + 0.5, d + 0.5],
      [-2.9, -d / 2 - 1.3, 1.0, 1.0],
    ],
    doorLocal: [0, 0, -d / 2 - 0.85],
    update: (_dt, t) => {
      if (sign) sign.rotation.x = Math.sin(t * 1.3) * 0.06;
    },
  };
}

function buildLibraryExt(k: Kit, scene: Scene): Built {
  const w = 5.0,
    d = 4.6,
    h = 4.5;
  foundation(k, w, d, 3);
  walls(k, w, d, h, "#b5daf4", "#8fc3ea", "#fffdf8");
  // floor band between storeys
  k.box(w + 0.12, 0.14, d + 0.12, [0, BASE + 2.45, 0], "#c9b3f2", { r: 0.06 });
  const top = gableRoof(k, w, d, BASE + h, 2.5, { color: "#a993dc", rows: ["#c9b3f2", "#b8a2e8"], ridge: "#9a82d0", gable: "#cfe8fa" });
  // front gable dormer with big round window
  k.at(k.frame([0, BASE + h - 0.3, -d / 2 - 0.45], 0), () => {
    k.box(2.3, 1.0, 0.6, [0, 0.5, 0.3], "#cfe8fa", { r: 0.1 });
    k.puff(
      [
        [-1.25, 0],
        [1.25, 0],
        [0, 1.6],
      ],
      0.35,
      [0, 0, 0],
      "#cfe8fa",
      { bevel: 0.12 },
    );
  });
  for (const s of [-1, 1]) k.at(k.frame([s * 0.7, BASE + h + 0.47, -d / 2 - 0.55], [0, 0, s * -0.99]), () => k.box(1.95, 0.18, 0.65, [0, 0, 0], "#9a82d0", { r: 0.08 }));
  extWindow(k, [0, BASE + h - 0.15, -d / 2 - 0.62], 0, { w: 0.95, h: 0.95, kind: "round" });
  // star weathervane
  k.rod(1.2, 0.04, [1.4, top + 0.6, 0], "#6d5a78");
  k.ball(0.08, [1.4, top + 0.25, 0], "#ffe066", { seg: 6 });
  const vane = k.anim(
    "lib_vane",
    { outline: 0.035 },
    () => {
      star(k, [1.4, top + 1.3, 0], 0.55, "#ffe066", 0.12);
      k.box(0.9, 0.04, 0.04, [1.4, top + 0.95, 0], "#6d5a78", { r: 0.015 });
      k.puff(
        [
          [0, 0.12],
          [0.2, 0],
          [0, -0.12],
        ],
        0.04,
        [1.85, top + 0.95, 0],
        "#f47a9a",
        { bevel: 0.015 },
      );
    },
    [1.4, 0, 0],
  );
  // door + windows
  extDoor(k, [0, BASE, -d / 2], { color: "#c9b3f2", knob: "#ffe066", h: 2.3, w: 1.25 });
  extWindow(k, [-1.55, BASE + 0.85, -d / 2], 0, { w: 0.85, h: 1.3, box: "#c9b3f2", flowers: ["#ffe066", "#fffdf8"] });
  extWindow(k, [1.55, BASE + 0.85, -d / 2], 0, { w: 0.85, h: 1.3, box: "#c9b3f2", flowers: ["#ffe066", "#fffdf8"] });
  extWindow(k, [-1.4, BASE + 2.85, -d / 2], 0, { w: 0.7, h: 1.05, shutters: "#c9b3f2" });
  extWindow(k, [1.4, BASE + 2.85, -d / 2], 0, { w: 0.7, h: 1.05, shutters: "#c9b3f2" });
  for (const s of [-1, 1]) {
    extWindow(k, [s * w / 2, BASE + 0.9, 0.3], s < 0 ? PI / 2 : -PI / 2, { w: 0.8, h: 1.2 });
    extWindow(k, [s * w / 2, BASE + 2.9, 0.3], s < 0 ? PI / 2 : -PI / 2, { w: 0.7, h: 1.0 });
  }
  wallLantern(k, [-0.95, BASE + 2.05, -d / 2]);
  wallLantern(k, [0.95, BASE + 2.05, -d / 2]);
  doorstep(k, 0, -d / 2 - 0.2, 1.3, 7);
  // book sign
  const sign = hangingSign(
    k,
    [-w / 2 - 0.1, BASE + 2.2, -d / 2 - 0.25],
    -1,
    1.1,
    "#cfe8fa",
    () => {
      k.at(k.frame([0, -0.02, 0], [0, 0, 0]), () => {
        for (const s of [-1, 1]) k.box(0.24, 0.32, 0.04, [s * 0.13, 0, 0], "#fffdf8", { rot: [0, s * -0.35, 0], r: 0.02 });
        k.box(0.56, 0.36, 0.03, [0, -0.01, 0.06], "#f47a9a", { r: 0.02 });
        for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.box(0.15, 0.015, 0.01, [s * 0.13, 0.08 - i * 0.07, -0.06], "#a8d8f0", { key: "flat", r: 0.004, steps: 1, rot: [0, s * -0.35, 0] });
      });
    },
    "lib_sign",
    "#c9b3f2",
  );
  // bench + stacked books outside
  k.box(1.4, 0.1, 0.45, [2.95, 0.48, -d / 2 - 0.9], "#e2b98c", { r: 0.04 });
  for (const s of [-1, 1]) k.box(0.1, 0.45, 0.4, [2.95 + s * 0.55, 0.22, -d / 2 - 0.9], "#c99a6b", { r: 0.03 });
  bookRow(k, [2.45, 0.53, -d / 2 - 0.9], 0.55, 0.32, 0.26, 5);
  pottedPlant(k, [-2.7, 0, -d / 2 - 0.5], { kind: "tall", potColor: "#c9b3f2", size: 1.5, seed: 8 });
  void scene;
  return {
    footprint: [
      [0, 0, w + 0.5, d + 0.5],
      [2.95, -d / 2 - 0.9, 1.5, 0.6],
    ],
    doorLocal: [0, 0, -d / 2 - 0.85],
    update: (_dt, t) => {
      if (vane) vane.rotation.y = Math.sin(t * 0.35) * 1.2 + t * 0.05;
      if (sign) sign.rotation.x = Math.sin(t * 1.2 + 1) * 0.06;
    },
  };
}

function buildFlowerExt(k: Kit, scene: Scene): Built {
  const w = 6.0,
    d = 4.6,
    h = 3.0;
  foundation(k, w, d, 4);
  walls(k, w, d, h, "#fff3e6", "#f6dcc8", "#a8e2c4");
  gableRoof(k, w, d, BASE + h, 2.0, { color: "#7fcaa8", rows: ["#a8e2c4", "#8fd4b5"], ridge: "#6dbf98", gable: "#c4efd9" });
  // door offset left, big shop window right
  const dx = -1.7;
  extDoor(k, [dx, BASE, -d / 2], { color: "#f7a8c0", knob: "#ffe066" });
  k.at(k.frame([0.9, BASE + 0.6, -d / 2], 0), () => {
    k.puff(roundRectPts(2.6, 1.45, 0.12).map(([x, y]) => [x, y + 0.72] as P2), 0.06, [0, 0, -0.06], "#ffe7a8", { key: "winGlow", bevel: 0.02, bottom: "#ffcf86" });
    k.tube(
      [
        [1.3, 0, -0.08],
        [1.3, 1.45, -0.08],
        [-1.3, 1.45, -0.08],
        [-1.3, 0, -0.08],
        [1.3, 0, -0.08],
      ],
      0.08,
      "#fffdf8",
    );
    for (const x of [-0.43, 0.43]) k.box(0.07, 1.4, 0.05, [x, 0.72, -0.12], "#fffdf8", { r: 0.02 });
    // flowers visible in window
    for (let i = 0; i < 7; i++) k.ball(0.09, [-1.0 + i * 0.33, 0.2 + (i % 2) * 0.08, -0.13], ["#f47a9a", "#ffe066", "#fffdf8", "#b48ce6"][i % 4], { seg: 6 });
    k.box(2.75, 0.1, 0.3, [0, -0.05, -0.15], "#fffdf8", { r: 0.04 });
  });
  awning(k, [0.9, BASE + 2.45, -d / 2 - 0.05], 3.0, 0.75, "#f7a8c0", "#fff6e6", 0.95);
  awning(k, [dx, BASE + 2.6, -d / 2 - 0.05], 1.6, 0.5, "#f7a8c0", "#fff6e6", 0.95);
  extWindow(k, [-w / 2, BASE + 1.0, 0.3], PI / 2, { w: 0.9, h: 1.2, box: "#f7a8c0" });
  extWindow(k, [w / 2, BASE + 1.0, 0.3], -PI / 2, { w: 0.9, h: 1.2, box: "#f7a8c0" });
  wallLantern(k, [dx - 0.85, BASE + 1.9, -d / 2]);
  doorstep(k, dx, -d / 2 - 0.2, 1.2, 9);
  // flower stand outside + pots
  const tops = tieredStand(k, [1.0, 0, -d / 2 - 1.45], 2.4, 2, { step: 0.4, rise: 0.38 });
  const kinds: [FlowerKind, ColorLike[], ColorLike][] = [
    ["tulip", ["#f47a9a", "#ffb766"], "#fff6e6"],
    ["sunflower", ["#ffd54a"], "#f7a98f"],
    ["daisy", ["#fffdf8"], "#bfe9d6"],
    ["lavender", ["#b48ce6"], "#fff6e6"],
  ];
  tops.forEach((t, ti) => {
    for (let i = 0; i < 4; i++) {
      const [kind, cols, pc] = kinds[(i + ti) % 4];
      flowerPot(k, [t[0] - 0.84 + i * 0.56, t[1], t[2]], kind, cols, { potColor: pc, size: 1.2, seed: 20 + i + ti * 5 });
    }
  });
  wateringCan(k, [2.8, 0, -d / 2 - 0.8], "#8fc3ea", -0.5, 1.1);
  crate(k, [-3.3, 0, -d / 2 - 0.4], 0.9, 0.42, 0.62, "#e2b98c", 0.25);
  k.at(k.frame([-3.3, 0.42, -d / 2 - 0.4], 0.25), () => {
    bush(k, [0, -0.05, 0], 0.45, 5, "main", ["#8fd27a", "#5fb46a"], 5, 3);
    for (let i = 0; i < 6; i++) flower(k, [-0.3 + (i % 3) * 0.3, 0.05, -0.12 + Math.floor(i / 3) * 0.24], "daisy", "#fffdf8", 0.12, "main");
  });
  // sign: flower
  const sign = hangingSign(
    k,
    [w / 2 + 0.1, BASE + h - 0.35, -d / 2 - 0.25],
    1,
    1.0,
    "#fff6ec",
    () => {
      k.puff(petalPts(0.2, 5, 30), 0.05, [0, 0.02, 0], "#f47a9a", { bevel: 0.02 });
      k.ball(0.07, [0, 0.02, -0.04], "#ffe066", { seg: 7, scale: [1, 1, 0.6] });
      k.box(0.04, 0.2, 0.02, [0, -0.17, 0.0], "#5fb46a", { r: 0.01, steps: 1, key: "fine" });
    },
    "flower_sign",
    "#a8e2c4",
  );
  void scene;
  return {
    footprint: [
      [0, 0, w + 0.5, d + 0.5],
      [1.0, -d / 2 - 1.05, 2.5, 0.9],
      [-3.3, -d / 2 - 0.4, 1.0, 0.8],
    ],
    doorLocal: [dx, 0, -d / 2 - 0.85],
    update: (_dt, t) => {
      if (sign) sign.rotation.x = Math.sin(t * 1.25 + 2) * 0.06;
    },
  };
}

function buildSewingExt(k: Kit, scene: Scene): Built {
  const R = 2.85,
    h = 2.9;
  // round foundation + body
  k.cyl(BASE, R + 0.25, R + 0.3, [0, 0, 0], "#d9d4e3", { bevel: 0.12, bottom: "#b4aec4", seg: 32 });
  k.cyl(h, R, R + 0.05, [0, BASE, 0], "#fbe39a", { bevel: 0.15, bottom: "#f5cf6b", seg: 32 });
  // vertical stripes (soft) to read as round
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    k.box(0.12, h - 0.4, 0.05, [Math.cos(a) * (R + 0.02), BASE + h / 2, Math.sin(a) * (R + 0.02)], "#fff0c2", { rot: [0, -a + PI / 2, 0], key: "flat", r: 0.03, steps: 1 });
  }
  k.torus(R + 0.05, 0.12, [0, BASE + h - 0.05, 0], "#fffdf8", { seg: 40 });
  // mushroom cap roof (ellipsoid dome with a scalloped, curled-under hem)
  const capY = BASE + h - 0.2;
  const Rc = R + 0.6,
    Hc = 2.25;
  k.revolve(
    (a) => {
      const sc = Math.pow(Math.abs(Math.cos(a * 9)), 0.7) * 0.1;
      const pr: P2[] = [
        [0, capY - 0.05],
        [R * 0.8, capY - 0.12],
        [Rc - 0.2 + sc, capY - 0.25 - sc],
        [Rc + sc * 0.6, capY - 0.12 - sc * 0.5],
      ];
      for (let i = 1; i <= 7; i++) {
        const t = (i / 7) * (PI / 2);
        pr.push([Math.cos(t) * Rc * (i === 1 ? 1.0 : 1), capY + Math.sin(t) * Hc]);
      }
      pr.push([0, capY + Hc]);
      return pr;
    },
    [0, 0, 0],
    "#f58fae",
    { segA: 48, bottom: "#ef7d9b" },
  );
  // cream spots on the cap
  const spots: [number, number, number][] = [
    [1.45, 0, 0.6],
    [0.95, -1.57, 0.5],
    [0.55, -0.9, 0.42],
    [0.6, -2.3, 0.4],
    [0.25, -1.2, 0.36],
    [0.3, -2.0, 0.34],
    [0.75, 0.2, 0.45],
    [0.7, 3.2, 0.42],
    [0.35, -0.3, 0.3],
    [0.4, 2.6, 0.38],
  ];
  for (const [t, a, sz] of spots) {
    const x = Math.cos(t) * Rc * Math.cos(a),
      z = Math.cos(t) * Rc * Math.sin(a),
      y = capY + Math.sin(t) * Hc;
    const n: V3 = [(Math.cos(t) * Math.cos(a)) / Rc, Math.sin(t) / Hc, (Math.cos(t) * Math.sin(a)) / Rc];
    k.blob(sz, 0.07, sz, [x, y, z], "#fff6e6", { up: n, seg: 7 });
  }
  // chimney-spool on top!
  k.at(k.frame([0, capY + Hc - 0.15, 0], 0, 3.2), () => spool(k, [0, 0, 0], "#a8d8f0"));
  // door + windows (on the curved wall)
  extDoor(k, [0, BASE, -R + 0.08], { color: "#a8d8f0", knob: "#f47a9a" });
  const winAt = (a: number, y: number, o: Parameters<typeof extWindow>[3]) => {
    const x = Math.sin(a) * (R - 0.05),
      z = -Math.cos(a) * (R - 0.05);
    extWindow(k, [x, y, z], -a, o);
  };
  // button-style round windows
  for (const a of [-0.85, 0.85]) {
    winAt(a, BASE + 1.0, { w: 1.0, h: 1.0, kind: "round", frame: "#f7a8c0" });
  }
  winAt(-1.9, BASE + 1.0, { w: 0.85, h: 1.15, box: "#f7a8c0" });
  winAt(1.9, BASE + 1.0, { w: 0.85, h: 1.15, box: "#f7a8c0" });
  // button holes on the round windows' frame (4 dots)
  wallLantern(k, [-0.85, BASE + 1.95, -R + 0.15]);
  doorstep(k, 0, -R - 0.05, 1.2, 11);
  // spool / button sign standing on a post
  k.rod(1.6, 0.06, [-2.9, 0.8, -R - 0.6], "#e2b98c");
  const sign = k.anim(
    "sew_sign",
    { outline: 0.035 },
    () => {
      k.at(k.frame([-2.9, 1.85, -R - 0.66], 0), () => {
        k.puff(circlePts(0.48, 28), 0.14, [0, 0, 0], "#f7a8c0", { bevel: 0.06 });
        k.torus(0.36, 0.04, [0, 0, -0.1], "#f48fab", { rot: [PI / 2, 0, 0], seg: 22 });
        for (const [x, y] of [
          [-0.1, 0.1],
          [0.1, 0.1],
          [-0.1, -0.1],
          [0.1, -0.1],
        ])
          k.puff(circlePts(0.055, 12), 0.03, [x, y, -0.1], "#fffdf8", { bevel: 0.012, key: "fine" });
      });
    },
    [-2.9, 1.85, -R - 0.66],
  );
  spool(k, [-2.35, 0, -R - 0.5], "#c9b3f2", 2.6);
  // yarn balls + needles basket by door
  k.lathe([[0, 0], [0.35, 0], [0.42, 0.38], [0.38, 0.38], [0, 0.32]], [2.4, 0, -R - 0.5], "#e2b98c", { seg: 18 });
  for (const [x, z, c] of [
    [-0.12, 0.05, "#f7a8c0"],
    [0.15, -0.05, "#a8d8f0"],
    [0.0, 0.18, "#ffe066"],
  ] as [number, number, string][])
    k.ball(0.18, [2.4 + x, 0.48, -R - 0.5 + z], c, { seg: 8 });
  pottedPlant(k, [1.6, 0, -R - 0.75], { kind: "bush", potColor: "#fbe39a", size: 1.1, seed: 13 });
  void scene;
  return {
    footprint: [
      [0, 0, 2 * R + 0.4, 2 * R + 0.4],
      [2.4, -R - 0.5, 0.9, 0.9],
    ],
    doorLocal: [0, 0, -R - 0.9],
    update: (_dt, t) => {
      if (sign) sign.rotation.z = Math.sin(t * 0.9) * 0.08;
    },
  };
}

function buildWorkshopExt(k: Kit, scene: Scene): Built {
  const w = 6.4,
    d = 5.2,
    h = 3.0;
  const r = rng(21);
  foundation(k, w, d, 6);
  // plank walls
  k.box(w, h, d, [0, BASE + h / 2, 0], "#e2b98c", { r: 0.15, bottom: "#c99a6b" });
  for (let x = -w / 2 + 0.3; x < w / 2 - 0.1; x += 0.4) {
    k.box(0.36, h - 0.1, 0.06, [x, BASE + h / 2, -d / 2 - 0.03], jitterCol("#e8c49a", 0.035, r), { r: 0.03, steps: 1 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.32, h + 0.05, 0.32, [sx * (w / 2), BASE + h / 2, sz * (d / 2)], "#a3754d", { r: 0.12 });
  k.box(w + 0.12, 0.18, d + 0.12, [0, BASE + h - 0.06, 0], "#a3754d", { r: 0.07 });
  // gambrel barn roof, ridge running front-to-back so the gable faces the path
  const y0 = BASE + h;
  k.at(k.frame([0, 0, 0], PI / 2), () => {
    for (const rot of [0, PI]) {
      k.at(k.frame([0, y0, 0], rot), () => {
        k.at(k.frame([0, -0.15, -(w / 2 - 0.95)], 0), () => slope(k, d, 1.4, 1.65, { color: "#e8957f", rows: ["#f2a28c", "#e8957f"], overhang: 0.4 }));
        k.at(k.frame([0, 1.5, 0], 0), () => slope(k, d, w / 2 - 0.95, 0.9, { color: "#e8957f", rows: ["#f2a28c", "#e8957f"], overhang: 0.4 }));
      });
    }
    k.capsule(d + 1.0, 0.15, [0, y0 + 2.45, 0], "#d9826b", { rot: [0, 0, PI / 2] });
  });
  // gable ends (pentagon) front & back
  for (const z of [-d / 2 - 0.04, d / 2 + 0.04]) {
    k.at(k.frame([0, y0 - 0.05, z], z < 0 ? 0 : PI), () => {
      k.puff(
        [
          [-w / 2 - 0.05, 0],
          [w / 2 + 0.05, 0],
          [w / 2 - 1.0, 1.5],
          [0, 2.4],
          [-w / 2 + 1.0, 1.5],
        ],
        0.24,
        [0, 0, 0],
        "#e8c49a",
        { bevel: 0.08 },
      );
      for (let x = -w / 2 + 0.6; x < w / 2 - 0.4; x += 0.4) {
        const hh = Math.min(1.5 + ((w / 2 - 1.0 - Math.abs(x)) / (w / 2 - 1.0)) * 0.9, 1.5 * Math.min(1, (w / 2 + 0.05 - Math.abs(x)) / 1.05)) - 0.2;
        if (hh > 0.2) k.box(0.025, hh, 0.02, [x, hh / 2 + 0.08, -0.13], "#d6aa7c", { key: "flat", r: 0.008, steps: 1 });
      }
    });
  }
  // hay-loft round window on the front gable
  extWindow(k, [1.6, y0 + 0.35, -d / 2 - 0.15], 0, { w: 0.6, h: 0.6, kind: "round", frame: "#fff3df" });
  extWindow(k, [-1.6, y0 + 0.35, -d / 2 - 0.15], 0, { w: 0.6, h: 0.6, kind: "round", frame: "#fff3df" });
  // saw + hammer crossed sign above door
  k.at(k.frame([0, y0 + 0.8, -d / 2 - 0.2], 0), () => {
    k.puff(roundRectPts(1.7, 0.95, 0.25), 0.12, [0, 0, 0], "#fff3df", { bevel: 0.05 });
    k.puff(roundRectPts(1.5, 0.78, 0.2), 0.05, [0, 0, -0.08], "#ffd27a", { bevel: 0.02 });
    k.at(k.frame([0, 0, -0.17], 0), () => {
      sawShape(k, [-0.2, 0.15, 0], -0.75, 0.75);
      hammerShape(k, [0.22, 0.05, -0.03], 0.75, 0.85);
    });
  });
  extDoor(k, [0, BASE, -d / 2 - 0.06], { kind: "barn", color: "#e8957f", w: 2.0, h: 2.3, frame: "#a3754d" });
  extWindow(k, [-2.2, BASE + 1.1, -d / 2 - 0.06], 0, { w: 0.9, h: 1.0, kind: "rect", frame: "#fff3df", box: "#a8e2c4", flowers: ["#ffe066", "#f47a9a"] });
  extWindow(k, [2.2, BASE + 1.1, -d / 2 - 0.06], 0, { w: 0.9, h: 1.0, kind: "rect", frame: "#fff3df", box: "#a8e2c4", flowers: ["#ffe066", "#f47a9a"] });
  extWindow(k, [-w / 2, BASE + 1.1, 0], PI / 2, { w: 0.9, h: 1.0, kind: "rect", frame: "#fff3df" });
  extWindow(k, [w / 2, BASE + 1.1, 0], -PI / 2, { w: 0.9, h: 1.0, kind: "rect", frame: "#fff3df" });
  wallLantern(k, [-1.35, BASE + 2.0, -d / 2 - 0.06]);
  wallLantern(k, [1.35, BASE + 2.0, -d / 2 - 0.06]);
  doorstep(k, 0, -d / 2 - 0.25, 2.0, 13);
  // lumber pile (right side)
  const pc = ["#f2d4ae", "#e8c49a", "#e2b98c", "#f6dcb8"];
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 4 - row; i++) {
      const z = -1.1 + (i + row * 0.5) * 0.32;
      k.rod(2.4, 0.15, [w / 2 + 1.0, 0.15 + row * 0.27, z + 0.6], jitterCol(pc[(i + row) % 4], 0.03, r), { rot: [PI / 2, 0, 0], seg: 10 });
      k.decal(circlePts(0.1, 12), [w / 2 + 1.0, 0.15 + row * 0.27, z + 0.6 - 1.2 - 0.04], "#c99a6b");
    }
  // sawhorse with a plank + stump
  sawhorse(k, [-w / 2 - 0.9, 0, -d / 2 - 0.3], PI / 2, 1.1, 0.7);
  k.box(0.32, 0.08, 1.8, [-w / 2 - 0.9, 0.8, -d / 2 - 0.3], "#f2d4ae", { r: 0.03 });
  k.cyl(0.5, 0.36, 0.42, [-2.1, 0, -d / 2 - 1.3], "#c99a6b", { bevel: 0.05 });
  k.disc(0.32, 0.03, [-2.1, 0.5, -d / 2 - 1.3], "#f2d4ae");
  // barrel with a little plant
  k.lathe([[0, 0], [0.35, 0], [0.42, 0.35], [0.35, 0.72], [0, 0.72]], [2.3, 0, -d / 2 - 0.8], "#d6aa7c", { seg: 18 });
  for (const y of [0.12, 0.6]) k.torus(0.38, 0.025, [2.3, y, -d / 2 - 0.8], "#8e88a3", { seg: 20, key: "fine" });
  bush(k, [2.3, 0.7, -d / 2 - 0.8], 0.5, 3, "main", ["#8fd27a", "#5fb46a"], 6, 4);
  void scene;
  void tabPts;
  void starPts;
  void BOOK_COLS;
  return {
    footprint: [
      [0, 0, w + 0.5, d + 0.5],
      [w / 2 + 1.0, -0.6, 0.8, 2.6],
      [-w / 2 - 0.9, -d / 2 - 0.3, 0.6, 1.9],
      [2.3, -d / 2 - 0.8, 0.9, 0.9],
    ],
    doorLocal: [0, 0, -d / 2 - 0.95],
  };
}

/* ------------------------------------------------------------------ */
/* entry                                                               */
/* ------------------------------------------------------------------ */

const BUILDERS: Record<string, (k: Kit, scene: Scene) => Built> = {
  home: buildHomeExt,
  teahouse: buildTeaExt,
  library: buildLibraryExt,
  flowershop: buildFlowerExt,
  sewing: buildSewingExt,
  workshop: buildWorkshopExt,
};

function worldColliders(root: TransformNode, rects: Built["footprint"], rotY: number): Collider[] {
  const m = root.computeWorldMatrix(true);
  const out: Collider[] = [];
  const q = ((rotY % (PI / 2)) + PI / 2) % (PI / 2);
  const aligned = q < 0.01 || PI / 2 - q < 0.01;
  for (const [cx, cz, w, d] of rects) {
    if (aligned) {
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const p = Vector3.TransformCoordinates(new Vector3(cx + (sx * w) / 2, 0, cz + (sz * d) / 2), m);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
      out.push({ kind: "box", minX, maxX, minZ, maxZ });
    } else {
      // rotated rect -> row of overlapping circles along its long axis
      const long = Math.max(w, d),
        short = Math.min(w, d);
      const rr = short / 2;
      const n = Math.max(1, Math.ceil(long / short) * 2 - 1);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : -long / 2 + rr + ((long - 2 * rr) * i) / (n - 1);
        const lx = w >= d ? cx + t : cx,
          lz = w >= d ? cz : cz + t;
        const p = Vector3.TransformCoordinates(new Vector3(lx, 0, lz), m);
        out.push({ kind: "circle", x: p.x, z: p.z, r: rr * 1.05 });
      }
    }
  }
  return out;
}

export function buildExteriorImpl(scene: Scene, id: string, pos: Vector3, rotY: number): ExteriorDef {
  const root = new TransformNode(`exterior_${id}`, scene);
  root.position.copyFrom(pos);
  root.rotation.y = rotY;
  const k = new Kit(scene, root);
  k.defKey("winGlow", { outline: false, emissive: "#c9a066", castShadow: false });
  const b = (BUILDERS[id] ?? buildHomeExt)(k, scene);
  k.build();
  const m = root.computeWorldMatrix(true);
  const door = Vector3.TransformCoordinates(new Vector3(...b.doorLocal), m);
  door.y = pos.y;
  void Matrix;
  return { id, root, door, colliders: worldColliders(root, b.footprint, rotY), update: b.update };
}
