/**
 * Shared cosy props used by interiors and exteriors. All functions author into the Kit's
 * current frame. Wall-mounted items assume local -Z points out of the wall.
 */
import { Color3 } from "@babylonjs/core";
import { Kit, archPts, circlePts, heartPts, starPts, roundRectPts, tabPts, type V3, type P2 } from "./kit";
import { col, mixCol, rng } from "../../render/Palette";
import type { ColorLike } from "../../render/Shapes";

export const PI = Math.PI;

export function heart(k: Kit, p: V3, size: number, color: ColorLike, depth = size * 0.35, o: { rot?: V3; key?: string; bulge?: number } = {}) {
  return k.puff(heartPts(size, 26), depth, p, color, { bevel: depth * 0.5, bulge: o.bulge ?? depth * 0.2, rot: o.rot, key: o.key });
}

export function star(k: Kit, p: V3, size: number, color: ColorLike, depth = size * 0.3, o: { rot?: V3; key?: string } = {}) {
  return k.puff(starPts(size / 2, size * 0.24, 5, 40), depth, p, color, { bevel: depth * 0.5, bulge: depth * 0.25, rot: o.rot, key: o.key });
}

/** flattened leaf blob pointing along local +Y then tilted */
export function leaf(k: Kit, p: V3, size: number, color: ColorLike, rot: V3 = [0, 0, 0], key = "main") {
  return k.blob(size * 0.5, size, size * 0.18, p, color, { rot, key, seg: 4 });
}

/** hanging ivy strand from `top` downward */
export function ivyStrand(k: Kit, top: V3, len: number, seed: number, key = "main", colors: ColorLike[] = ["leaf", "leafDeep", "leafLight"]) {
  const r = rng(seed);
  const path: V3[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push([top[0] + Math.sin(t * 5 + seed) * 0.06, top[1] - t * len, top[2] + Math.cos(t * 4 + seed) * 0.04]);
  }
  k.tube(path, 0.018, "leafDark", { key });
  const leaves = Math.round(len / 0.2);
  for (let i = 1; i <= leaves; i++) {
    const t = i / leaves;
    const y = top[1] - t * len;
    const side = i % 2 ? 1 : -1;
    const sz = 0.09 + r() * 0.04 - t * 0.02;
    leaf(k, [top[0] + side * 0.07 + Math.sin(t * 5 + seed) * 0.06, y, top[2] - 0.03], sz, colors[i % colors.length], [0.3, 0, side * 0.9 + (r() - 0.5) * 0.5], key);
  }
}

/** pot (lathe) standing at p */
export function pot(k: Kit, p: V3, r: number, h: number, color: ColorLike, rim: ColorLike = color, o: { key?: string } = {}) {
  k.lathe(
    [
      [0, 0],
      [r * 0.7, 0],
      [r * 0.78, 0.02],
      [r * 0.95, h * 0.8],
      [r * 1.0, h * 0.82],
      [r * 0.92, h * 0.9],
      [0, h * 0.9],
    ],
    p,
    color,
    { key: o.key, bottom: mixCol(color as string, "#000000", 0.08) },
  );
  k.cyl(h * 0.18, r * 1.08, r * 1.08, [p[0], p[1] + h * 0.8, p[2]], rim, { key: o.key });
  k.disc(r * 0.88, 0.02, [p[0], p[1] + h * 0.9, p[2]], "#9b7458", { key: o.key });
}

export function bush(k: Kit, p: V3, s: number, seed: number, key = "main", colors: ColorLike[] = ["leaf", "leafDeep", "leafLight"], seg = 7, n = 5) {
  const r = rng(seed);
  k.ball(s * 0.55, [p[0], p[1] + s * 0.4, p[2]], colors[0], { key, seg: seg + 1 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + r();
    k.ball(s * (0.32 + r() * 0.1), [p[0] + Math.cos(a) * s * 0.4, p[1] + s * (0.35 + r() * 0.35), p[2] + Math.sin(a) * s * 0.4], colors[(i + 1) % colors.length], { key, seg });
  }
}

/** potted plant: kinds bush / trailing / tall / snake */
export function pottedPlant(
  k: Kit,
  p: V3,
  o: { kind?: "bush" | "trailing" | "tall" | "snake" | "fern"; potColor?: ColorLike; rim?: ColorLike; size?: number; heart?: ColorLike; seed?: number; key?: string } = {},
) {
  const s = o.size ?? 1;
  const pr = 0.22 * s,
    ph = 0.36 * s;
  pot(k, p, pr, ph, o.potColor ?? "#f7a98f", o.rim ?? o.potColor ?? "#f7a98f");
  if (o.heart) heart(k, [p[0], p[1] + ph * 0.48, p[2] - pr * 0.95], pr * 0.8, o.heart, 0.05);
  const top: V3 = [p[0], p[1] + ph * 0.9, p[2]];
  const seed = o.seed ?? 3;
  const key = o.key ?? "main";
  const r = rng(seed);
  switch (o.kind ?? "bush") {
    case "bush":
      bush(k, top, 0.42 * s, seed, key);
      break;
    case "trailing":
      bush(k, top, 0.34 * s, seed, key);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2 + 0.4;
        ivyStrand(k, [top[0] + Math.cos(a) * pr * 0.9, top[1] + 0.08 * s, top[2] + Math.sin(a) * pr * 0.9], (0.35 + r() * 0.4) * s, seed + i, key);
      }
      break;
    case "tall":
    case "snake":
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * PI * 2;
        const hh = (0.5 + r() * 0.35) * s * (o.kind === "snake" ? 1.2 : 1);
        k.blob(0.07 * s, hh / 2, 0.025 * s, [top[0] + Math.cos(a) * pr * 0.4, top[1] + hh / 2 - 0.04, top[2] + Math.sin(a) * pr * 0.4], i % 2 ? "leafDeep" : "leaf", {
          rot: [Math.sin(a) * 0.25, a, -Math.cos(a) * 0.25],
          key,
          seg: 6,
        });
      }
      break;
    case "fern":
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * PI * 2;
        leaf(k, [top[0] + Math.cos(a) * 0.16 * s, top[1] + 0.16 * s, top[2] + Math.sin(a) * 0.16 * s], 0.22 * s, i % 2 ? "leaf" : "leafDeep", [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], key);
      }
      break;
  }
}

/* ---------------------------------- flowers ------------------------------- */

export type FlowerKind = "tulip" | "daisy" | "sunflower" | "rose" | "lavender" | "bell";

/** a single flower whose stem base is at p */
export function flower(k: Kit, p: V3, kind: FlowerKind, color: ColorLike, h = 0.35, key = "sway") {
  const [x, y, z] = p;
  const top = y + h;
  if (kind !== "lavender") k.rod(h, 0.014, [x, y + h / 2, z], "leafDeep", { key, seg: 5 });
  switch (kind) {
    case "tulip": {
      k.lathe(
        [
          [0, 0],
          [0.05, 0.015],
          [0.065, 0.06],
          [0.06, 0.11],
          [0.035, 0.1],
          [0, 0.09],
        ],
        [x, top - 0.02, z],
        color,
        { key, seg: 8 },
      );
      // petal tips
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        k.cone(0.05, 0.03, [x + Math.cos(a) * 0.04, top + 0.07, z + Math.sin(a) * 0.04], color, { key, seg: 5 });
      }
      leaf(k, [x + 0.04, y + h * 0.35, z], 0.12, "leaf", [0, 0, -0.5], key);
      break;
    }
    case "daisy": {
      // petals as one puffy flower-shaped disc, tilted to face the camera a little
      k.puff(petalPts(0.1, 8, 32), 0.025, [x, top, z], color, { rot: [1.1, 0, 0], key, bevel: 0.012, steps: 2 });
      k.blob(0.032, 0.022, 0.032, [x, top + 0.02, z - 0.012], "sun", { key, seg: 5 });
      break;
    }
    case "sunflower": {
      const s = 1.5;
      k.puff(petalPts(0.13 * s, 12, 48), 0.03, [x, top, z], color, { key, bevel: 0.012, steps: 2 });
      k.blob(0.055 * s, 0.055 * s, 0.03 * s, [x, top, z - 0.035], "#a3754d", { key, seg: 6 });
      leaf(k, [x - 0.06, y + h * 0.45, z], 0.14, "leaf", [0, 0, 0.8], key);
      leaf(k, [x + 0.06, y + h * 0.6, z], 0.12, "leafDeep", [0, 0, -0.8], key);
      break;
    }
    case "rose": {
      k.ball(0.065, [x, top, z], color, { key, seg: 7 });
      k.torus(0.04, 0.028, [x, top + 0.03, z], mixCol(color as string, "#ffffff", 0.25), { key, seg: 10 });
      leaf(k, [x + 0.05, top - 0.1, z], 0.08, "leafDeep", [0, 0, -1.0], key);
      break;
    }
    case "lavender": {
      k.rod(h, 0.012, [x, y + h / 2, z], "leafDeep", { key, seg: 4 });
      for (let i = 0; i < 6; i++) k.ball(0.028 - i * 0.002, [x + (i % 2 ? 0.012 : -0.012), top - 0.12 + i * 0.035, z], color, { key, seg: 5 });
      break;
    }
    case "bell": {
      k.lathe(
        [
          [0, 0],
          [0.05, 0],
          [0.04, 0.03],
          [0.03, 0.07],
          [0, 0.08],
        ],
        [x, top - 0.05, z],
        color,
        { key, seg: 7 },
      );
      break;
    }
  }
}

/** flower outline with `n` round petals */
export function petalPts(r: number, n: number, samples = 40): P2[] {
  const o: P2[] = [];
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * PI * 2;
    const rr = r * (0.55 + 0.45 * Math.pow(Math.abs(Math.cos((a * n) / 2)), 0.7));
    o.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return o;
}

/** pot of flowers */
export function flowerPot(k: Kit, p: V3, kind: FlowerKind, colors: ColorLike[], o: { potColor?: ColorLike; rim?: ColorLike; size?: number; seed?: number; heart?: ColorLike } = {}) {
  const s = o.size ?? 1;
  const pr = 0.17 * s,
    ph = 0.26 * s;
  pot(k, p, pr, ph, o.potColor ?? "#f7a98f", o.rim);
  if (o.heart) heart(k, [p[0], p[1] + ph * 0.45, p[2] - pr * 0.95], pr * 0.8, o.heart, 0.04);
  const r = rng(o.seed ?? 7);
  const n = kind === "sunflower" ? 2 : kind === "lavender" ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + r();
    const rr = pr * 0.5;
    flower(k, [p[0] + Math.cos(a) * rr, p[1] + ph * 0.85, p[2] + Math.sin(a) * rr], kind, colors[i % colors.length], (0.22 + r() * 0.14) * s * (kind === "sunflower" ? 1.5 : 1));
  }
  // foliage collar
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4;
    leaf(k, [p[0] + Math.cos(a) * pr * 0.7, p[1] + ph + 0.04, p[2] + Math.sin(a) * pr * 0.7], 0.08 * s, i % 2 ? "leaf" : "leafDeep", [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0], "sway");
  }
}

/* ---------------------------------- tea things ---------------------------- */

export function teacup(k: Kit, p: V3, color: ColorLike, accent: ColorLike = "pink", s = 1, rotY = 0) {
  k.at(
    k.frame(p, rotY, s),
    () => {
      k.disc(0.11, 0.02, [0, 0, 0], color, { key: "fine" });
      k.lathe(
        [
          [0, 0.015],
          [0.04, 0.015],
          [0.07, 0.05],
          [0.078, 0.1],
          [0.072, 0.1],
          [0.0, 0.09],
        ],
        [0, 0, 0],
        color,
        { key: "fine", bottom: accent },
      );
      k.torus(0.03, 0.014, [0.085, 0.06, 0], color, { rot: [PI / 2, 0, 0], key: "fine", seg: 10 });
      k.disc(0.062, 0.02, [0, 0.1, 0], "#d9a27a", { key: "fine" });
    },
  );
}

export function teapot(k: Kit, p: V3, color: ColorLike, accent: ColorLike, s = 1, rotY = 0) {
  k.at(k.frame(p, rotY, s), () => {
    k.lathe(
      [
        [0, 0],
        [0.13, 0],
        [0.18, 0.06],
        [0.2, 0.14],
        [0.17, 0.23],
        [0.1, 0.27],
        [0, 0.27],
      ],
      [0, 0, 0],
      color,
    );
    k.disc(0.11, 0.04, [0, 0.26, 0], color);
    k.ball(0.04, [0, 0.33, 0], accent, { seg: 7 });
    // spout
    k.tube(
      [
        [0.16, 0.08, 0],
        [0.24, 0.13, 0],
        [0.29, 0.22, 0],
      ],
      0.032,
      color,
      { tess: 8 },
    );
    k.torus(0.08, 0.03, [-0.19, 0.15, 0], color, { rot: [PI / 2, 0, 0], seg: 12 });
    // flower decal
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      k.ball(0.03, [Math.cos(a) * 0.035, 0.14 + Math.sin(a) * 0.035, -0.235], accent, { scale: [1, 1, 0.4], key: "flat", seg: 6 });
    }
    k.ball(0.022, [0, 0.14, -0.245], "sun", { scale: [1, 1, 0.5], key: "flat", seg: 6 });
  });
}

export function cakeRound(k: Kit, p: V3, r: number, h: number, sponge: ColorLike, frosting: ColorLike, o: { berries?: number; drip?: boolean } = {}) {
  k.cyl(h, r, r, p, sponge, { bevel: 0.03 });
  // frosting top with drips
  k.revolve(
    (a) => {
      const drip = o.drip === false ? 0 : Math.max(0, Math.sin(a * 7)) * h * 0.35;
      return [
        [0, h + 0.03],
        [r * 0.7, h + 0.03],
        [r + 0.012, h + 0.005],
        [r + 0.014, h - 0.06 - drip],
        [r * 0.9, h - 0.05 - drip],
        [0, h - 0.04],
      ];
    },
    p,
    frosting,
    { segA: 28 },
  );
  const n = o.berries ?? 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    strawberry(k, [p[0] + Math.cos(a) * r * 0.6, p[1] + h + 0.075, p[2] + Math.sin(a) * r * 0.6], 0.045);
  }
  if (n) strawberry(k, [p[0], p[1] + h + 0.085, p[2]], 0.055);
}

export function strawberry(k: Kit, p: V3, s: number) {
  k.lathe(
    [
      [0, 0],
      [s * 0.5, s * 0.3],
      [s * 0.85, s * 1.0],
      [s * 0.7, s * 1.35],
      [0, s * 1.4],
    ],
    [p[0], p[1] - s * 0.4, p[2]],
    "#f2667a",
    { key: "fine", seg: 8 },
  );
  k.blob(s * 0.6, s * 0.15, s * 0.6, [p[0], p[1] + s * 0.98, p[2]], "leaf", { key: "fine", seg: 5 });
}

export function cakeSlice(k: Kit, p: V3, rotY: number, sponge: ColorLike, cream: ColorLike, s = 1) {
  k.at(k.frame(p, rotY, s), () => {
    k.disc(0.13, 0.015, [0, 0, 0], "white", { key: "fine" });
    const tri: P2[] = [
      [-0.07, -0.06],
      [0.07, -0.06],
      [0.07, 0.0],
      [0.0, 0.1],
      [-0.07, 0.0],
    ];
    // wedge = puff lying on its side
    k.puff(tri, 0.1, [0, 0.07, 0], sponge, { rot: [PI / 2, 0, 0], bevel: 0.015 });
    k.box(0.12, 0.02, 0.15, [0, 0.07, 0.02], cream, { r: 0.01, key: "fine" });
    k.puff(tri, 0.02, [0, 0.13, 0], cream, { rot: [PI / 2, 0, 0], bevel: 0.01 });
    strawberry(k, [0, 0.16, 0.0], 0.03);
  });
}

export function macaron(k: Kit, p: V3, color: ColorLike) {
  k.blob(0.045, 0.018, 0.045, [p[0], p[1] + 0.012, p[2]], color, { key: "fine", seg: 7 });
  k.cyl(0.014, 0.038, 0.038, [p[0], p[1] + 0.022, p[2]], "cream", { key: "fine", seg: 10 });
  k.blob(0.045, 0.018, 0.045, [p[0], p[1] + 0.046, p[2]], color, { key: "fine", seg: 7 });
}

/* ---------------------------------- books ---------------------------------- */

export const BOOK_COLS: ColorLike[] = ["#f6a5bd", "#a8d8f0", "#c9b3f2", "#ffe08a", "#a8e2c4", "#ffc4a3", "#f48fab", "#9fc6ee", "#f9d1e0", "#b6e59a"];

export function book(k: Kit, p: V3, w: number, h: number, d: number, color: ColorLike, rot: V3 = [0, 0, 0], key = "fine") {
  k.box(w, h, d, p, color, { rot, r: Math.min(0.02, w / 3), key, steps: 1 });
}

/** row of standing books filling width `len` along local +X starting at p (bottom) */
export function bookRow(k: Kit, p: V3, len: number, maxH: number, depth: number, seed: number, cols = BOOK_COLS) {
  const r = rng(seed);
  let x = 0;
  let i = 0;
  while (x < len - 0.06) {
    const w = 0.06 + r() * 0.05;
    if (x + w > len) break;
    const h = maxH * (0.7 + r() * 0.3);
    const lean = i > 0 && r() < 0.08 ? -0.18 : 0;
    const c = cols[Math.floor(r() * cols.length)];
    const bd = depth * (0.8 + r() * 0.2);
    book(k, [p[0] + x + w / 2, p[1] + h / 2, p[2] + (depth - bd) / 2], w - 0.008, h, bd, c, [0, 0, lean]);
    // spine band
    if (lean === 0 && r() < 0.6) k.box(w - 0.02, 0.03, 0.01, [p[0] + x + w / 2, p[1] + h * 0.72, p[2] - depth / 2 + (depth - bd) - 0.028], mixCol(c as string, "#ffffff", 0.55), { key: "flat", r: 0.004, steps: 1 });
    x += w + 0.004;
    i++;
  }
}

/** stack of lying books, bottom at p */
export function bookStack(k: Kit, p: V3, n: number, seed: number, s = 1) {
  const r = rng(seed);
  let y = p[1];
  for (let i = 0; i < n; i++) {
    const h = (0.06 + r() * 0.03) * s;
    book(k, [p[0] + (r() - 0.5) * 0.04, y + h / 2, p[2] + (r() - 0.5) * 0.04], (0.32 + r() * 0.08) * s, h, (0.24 + r() * 0.06) * s, BOOK_COLS[Math.floor(r() * BOOK_COLS.length)], [0, (r() - 0.5) * 0.5, 0], "main");
    y += h;
  }
  return y;
}

export function mug(k: Kit, p: V3, color: ColorLike, decal?: ColorLike, rotY = 0) {
  k.at(k.frame(p, rotY), () => {
    k.cyl(0.12, 0.055, 0.05, [0, 0, 0], color, { bevel: 0.015, key: "fine" });
    k.torus(0.035, 0.016, [0.06, 0.06, 0], color, { rot: [PI / 2, 0, 0], key: "fine", seg: 10 });
    k.disc(0.045, 0.01, [0, 0.11, 0], "#b07a5a", { key: "flat" });
    if (decal) heart(k, [0, 0.055, -0.08], 0.05, decal, 0.012, { key: "flat" });
  });
}

/* ---------------------------------- wall things ---------------------------- */

/** arched window on a wall. p = bottom centre on wall surface. */
export function archWindow(
  k: Kit,
  p: V3,
  w: number,
  h: number,
  o: { frame?: ColorLike; pane?: ColorLike; paneTop?: ColorLike; view?: "hills" | "sky" | "garden" | "night"; sill?: ColorLike; curtains?: ColorLike; muntins?: boolean } = {},
) {
  const frameC = o.frame ?? "white";
  k.at(k.frame(p, 0), () => {
    // pane (glowy sky)
    k.puff(archPts(w, h, 12), 0.04, [0, 0, -0.02], o.paneTop ?? "#d7f0ff", { key: "glass", bottom: o.pane ?? "#a9daf5", bevel: 0.01 });
    if (o.view === "hills" || o.view === "garden") {
      // rolling hills
      k.puff(circlePts(w * 0.42, 18, w * 0.25), 0.02, [-w * 0.18, h * 0.08, -0.045], "#a6dc8c", { key: "glass", bevel: 0.008 });
      k.puff(circlePts(w * 0.45, 18, w * 0.3), 0.02, [w * 0.22, h * 0.04, -0.05], "#8fd27a", { key: "glass", bevel: 0.008 });
      k.puff(roundRectPts(w * 0.96, h * 0.16, 0.02), 0.02, [0, h * 0.08, -0.055], "#7cc86f", { key: "glass", bevel: 0.008 });
      // tree & cloud
      k.puff(circlePts(w * 0.1, 12), 0.02, [w * 0.25, h * 0.36, -0.06], "#6fbf73", { key: "glass", bevel: 0.008 });
      k.puff(circlePts(w * 0.09, 10, w * 0.05), 0.02, [-w * 0.15, h * 0.72, -0.045], "white", { key: "glass", bevel: 0.008 });
      k.puff(circlePts(w * 0.07, 10, w * 0.045), 0.02, [-w * 0.05, h * 0.74, -0.046], "white", { key: "glass", bevel: 0.008 });
    }
    if (o.view === "night") {
      star(k, [w * 0.2, h * 0.7, -0.05], 0.12, "sun", 0.02, { key: "glow" });
      k.puff(circlePts(0.09, 16), 0.02, [-w * 0.2, h * 0.55, -0.05], "#fff3c4", { key: "glow", bevel: 0.008 });
    }
    // frame: tube around arch + sill
    const r = w / 2;
    const path: V3[] = [[r, 0, -0.03]];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * PI;
      path.push([Math.cos(a) * r, h - r + Math.sin(a) * r, -0.03]);
    }
    path.push([-r, 0, -0.03]);
    k.tube(path, 0.07, frameC, { tess: 8 });
    if (o.muntins !== false) {
      k.box(0.06, h - 0.05, 0.05, [0, (h - 0.05) / 2, -0.06], frameC, { r: 0.02 });
      k.box(w, 0.06, 0.05, [0, h * 0.5, -0.06], frameC, { r: 0.02 });
    }
    k.box(w + 0.42, 0.1, 0.26, [0, -0.04, -0.12], o.sill ?? frameC, { r: 0.04 });
    if (o.curtains) {
      for (const s of [-1, 1]) {
        k.puff(tabPts(0.4, h + 0.15), 0.1, [s * (r + 0.12), h + 0.2, -0.16], o.curtains, { bevel: 0.05, bulge: 0.02, spine: [[0, -0.2], [0, -h + 0.1]] });
        k.ball(0.06, [s * (r + 0.12), h * 0.45, -0.24], "sun", { seg: 6 });
      }
      k.rod(w + 1.0, 0.03, [0, h + 0.22, -0.2], "woodDeep", { rot: [0, 0, PI / 2] });
    }
  });
}

/** scalloped oval picture frame on a wall. p = centre on wall. */
export function pictureFrame(k: Kit, p: V3, w: number, h: number, frameC: ColorLike, inner: ColorLike, content?: () => void) {
  k.at(k.frame(p, 0), () => {
    const pts: P2[] = [];
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      const s = 1 + 0.05 * Math.cos(a * 14);
      pts.push([Math.cos(a) * (w / 2) * s, Math.sin(a) * (h / 2) * s]);
    }
    k.puff(pts, 0.08, [0, 0, -0.03], frameC, { bevel: 0.035 });
    k.puff(circlePts(w * 0.38, 28, h * 0.38), 0.03, [0, 0, -0.125], inner, { bevel: 0.012, key: "fine" });
    if (content) k.at(k.frame([0, 0, -0.17], 0), content);
  });
}

/** tulip picture content (draw inside a frame with local -Z outward) */
export function tulipArt(k: Kit, s = 1, colors: ColorLike[] = ["#f47a9a", "#ffb766", "#c9b3f2"]) {
  const xs = [-0.13, 0, 0.13];
  xs.forEach((x, i) => {
    const hh = (i === 1 ? 0.22 : 0.16) * s;
    k.box(0.02 * s, hh, 0.01, [x * s, -0.12 * s + hh / 2, 0], "leafDeep", { key: "flat", r: 0.005, steps: 1 });
    k.puff(tabPts(0.09 * s, 0.1 * s, 6), 0.02, [x * s, -0.12 * s + hh + 0.07 * s, 0], colors[i], { key: "fine", rot: [0, 0, PI], bevel: 0.008 });
  });
  k.puff(circlePts(0.05 * s, 10, 0.02 * s), 0.015, [-0.07 * s, -0.08 * s, 0], "leaf", { key: "flat", rot: [0, 0, 0.6], bevel: 0.006 });
  k.puff(circlePts(0.05 * s, 10, 0.02 * s), 0.015, [0.07 * s, -0.06 * s, 0], "leaf", { key: "flat", rot: [0, 0, -0.6], bevel: 0.006 });
}

/** simple daisy art */
export function daisyArt(k: Kit, s = 1, petal: ColorLike = "white", centre: ColorLike = "sun") {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    k.puff(circlePts(0.05 * s, 10, 0.022 * s), 0.015, [Math.cos(a) * 0.06 * s, 0.03 * s + Math.sin(a) * 0.06 * s, 0], petal, { key: "fine", rot: [0, 0, a], bevel: 0.006 });
  }
  k.puff(circlePts(0.035 * s, 12), 0.02, [0, 0.03 * s, -0.008], centre, { key: "fine", bevel: 0.008 });
  k.box(0.018 * s, 0.14 * s, 0.01, [0, -0.1 * s, 0], "leafDeep", { key: "flat", r: 0.005, steps: 1 });
}

/** wall shelf: plank + 2 brackets, p = centre of plank top surface on wall */
export function wallShelf(k: Kit, p: V3, len: number, depth: number, color: ColorLike, bracket: ColorLike = color) {
  k.box(len, 0.07, depth, [p[0], p[1] - 0.035, p[2] - depth / 2], color, { r: 0.03 });
  for (const s of [-1, 1]) {
    k.puff(
      [
        [0, 0],
        [0, -0.22],
        [0.04, -0.22],
        [depth * 0.8, -0.04],
        [depth * 0.8, 0],
      ],
      0.05,
      [p[0] + s * (len / 2 - 0.15), p[1] - 0.07, p[2]],
      bracket,
      { rot: [0, PI / 2, 0], bevel: 0.015 },
    );
  }
}

/* ---------------------------------- soft furnishings ----------------------- */

/** fluffy round rug: scalloped outer + inner ring */
export function fluffyRug(k: Kit, p: V3, r: number, outer: ColorLike, inner?: ColorLike, sx = 1, sz = 1) {
  k.rug(r, 14, [p[0], p[1] + 0.005, p[2]], outer, { key: "fluffy", scale: [sx, 1, sz], thick: 0.06 });
  if (inner) k.rug(r * 0.72, 12, [p[0], p[1] + 0.07, p[2]], inner, { key: "flat", scale: [sx, 1, sz], thick: 0.06 });
}

/** doormat used as exit marker */
export function doormat(k: Kit, p: V3, color: ColorLike, accent: ColorLike) {
  k.puff(roundRectPts(1.3, 0.8, 0.22), 0.06, [p[0], p[1] + 0.03, p[2]], color, { rot: [PI / 2, 0, 0], bevel: 0.03, key: "flat" });
  heart(k, [p[0], p[1] + 0.065, p[2]], 0.34, accent, 0.03, { rot: [PI / 2, 0, 0], key: "flat" });
  // fringe
  for (let i = 0; i < 9; i++) {
    for (const s of [-1, 1]) k.box(0.04, 0.02, 0.12, [p[0] - 0.52 + i * 0.13, p[1] + 0.012, p[2] + s * 0.43], accent, { key: "flat", r: 0.008, steps: 1 });
  }
}

/** puffy square cushion lying flat, p = bottom centre */
export function cushion(k: Kit, p: V3, w: number, d: number, h: number, color: ColorLike, rot: V3 = [0, 0, 0], button?: ColorLike) {
  k.at(k.frame([p[0], p[1] + h / 2, p[2]], rot), () => {
    k.puff(roundRectPts(w, d, Math.min(w, d) * 0.3), h, [0, 0, 0], color, { rot: [PI / 2, 0, 0], bevel: h * 0.5, bulge: h * 0.25 });
    if (button) k.ball(0.04, [0, h * 0.75 + 0.03, 0], button, { scale: [1, 0.5, 1], key: "fine", seg: 6 });
  });
}

/** round pouf with button */
export function pouf(k: Kit, p: V3, r: number, h: number, color: ColorLike, button: ColorLike) {
  k.revolve(
    (a) => {
      const w = 1 + 0.04 * Math.cos(a * 8);
      return [
        [0, 0],
        [r * 0.8 * w, 0],
        [r * 0.98 * w, h * 0.2],
        [r * w, h * 0.55],
        [r * 0.9 * w, h * 0.92],
        [r * 0.5, h * 1.02],
        [0, h * 0.98],
      ];
    },
    p,
    color,
    { segA: 32, bottom: mixCol(color as string, "#7a6080", 0.12) },
  );
  k.ball(0.07, [p[0], p[1] + h * 1.02 + 0.025, p[2]], button, { scale: [1, 0.55, 1], seg: 7 });
}

/** cord hanging from far above down to p */
export function cord(k: Kit, p: V3, len = 4, color: ColorLike = "inkSoft", key = "fine") {
  k.rod(len, 0.012, [p[0], p[1] + len / 2, p[2]], color, { key, seg: 5 });
}

/** small wooden stool, p = floor */
export function stool(k: Kit, p: V3, h: number, top: ColorLike, legs: ColorLike = "woodDeep", r = 0.28) {
  k.cyl(0.09, r, r, [p[0], p[1] + h - 0.09, p[2]], top, { bevel: 0.035 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.5;
    k.rod(h - 0.06, 0.035, [p[0] + Math.cos(a) * r * 0.62, p[1] + (h - 0.06) / 2, p[2] + Math.sin(a) * r * 0.62], legs, {
      rot: [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12],
    });
  }
}

/** table lamp (glowing) — returns nothing; shade in glow key */
export function tableLamp(k: Kit, p: V3, shade: ColorLike, base: ColorLike, s = 1, shadeKey = "glowSoft") {
  k.at(k.frame(p, 0, s), () => {
    k.lathe(
      [
        [0, 0],
        [0.12, 0],
        [0.13, 0.03],
        [0.06, 0.08],
        [0.05, 0.2],
        [0.08, 0.26],
        [0, 0.27],
      ],
      [0, 0, 0],
      base,
    );
    k.rod(0.16, 0.018, [0, 0.33, 0], "white", { seg: 6 });
    k.revolve(
      (a) => {
        const sc = 1 + 0.06 * Math.max(0, Math.cos(a * 8));
        return [
          [0.08, 0.6],
          [0.12, 0.6],
          [0.2 * sc, 0.4],
          [0.25 * sc, 0.33],
          [0.23 * sc, 0.31],
          [0.08, 0.38],
        ];
      },
      [0, 0, 0],
      shade,
      { key: shadeKey, segA: 24 },
    );
  });
}

/** knob drawer front with heart pull, on a face (local -Z outward). p = centre */
export function heartDrawer(k: Kit, p: V3, w: number, h: number, color: ColorLike, knob: ColorLike) {
  k.box(w, h, 0.05, [p[0], p[1], p[2] - 0.02], color, { r: 0.03 });
  heart(k, [p[0], p[1], p[2] - 0.1], Math.min(0.12, h * 0.55), knob, 0.04);
}

/** smiling face decal (eyes + mouth) on a puff facing -Z */
export function face(k: Kit, p: V3, s: number, ink: ColorLike = "ink", cheeks: ColorLike = "#f7a1b5") {
  k.ball(0.022 * s, [p[0] - 0.06 * s, p[1] + 0.02 * s, p[2]], ink, { scale: [1, 1.3, 0.5], key: "flat", seg: 5 });
  k.ball(0.022 * s, [p[0] + 0.06 * s, p[1] + 0.02 * s, p[2]], ink, { scale: [1, 1.3, 0.5], key: "flat", seg: 5 });
  k.tube(
    [
      [p[0] - 0.035 * s, p[1] - 0.025 * s, p[2]],
      [p[0], p[1] - 0.045 * s, p[2] - 0.004],
      [p[0] + 0.035 * s, p[1] - 0.025 * s, p[2]],
    ],
    0.008 * s,
    ink,
    { key: "flat", tess: 5 },
  );
  k.ball(0.025 * s, [p[0] - 0.1 * s, p[1] - 0.02 * s, p[2] + 0.004], cheeks, { scale: [1.2, 0.8, 0.4], key: "flat", seg: 5 });
  k.ball(0.025 * s, [p[0] + 0.1 * s, p[1] - 0.02 * s, p[2] + 0.004], cheeks, { scale: [1.2, 0.8, 0.4], key: "flat", seg: 5 });
}

/** small hanging/wall lantern with glowing core. p = lantern centre. */
export function lantern(k: Kit, p: V3, body: ColorLike = "#6d5a78", s = 1) {
  k.at(k.frame(p, 0, s), () => {
    k.cone(0.12, 0.16, [0, 0.12, 0], body, { seg: 8 });
    k.ball(0.035, [0, 0.25, 0], body, { seg: 6 });
    k.cyl(0.04, 0.12, 0.12, [0, -0.17, 0], body, { seg: 10 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      k.rod(0.26, 0.012, [Math.cos(a) * 0.1, -0.02, Math.sin(a) * 0.1], body, { seg: 4 });
    }
  });
}

export function lanternGlow(k: Kit, p: V3, s = 1, color: ColorLike = "#ffe7a6") {
  k.at(k.frame(p, 0, s), () => {
    k.lathe(
      [
        [0, -0.13],
        [0.08, -0.13],
        [0.095, 0],
        [0.08, 0.12],
        [0, 0.12],
      ],
      [0, 0, 0],
      color,
      { key: "glow", seg: 10 },
    );
  });
}

/** blend helper */
export function shade(c: ColorLike, amt: number): Color3 {
  return mixCol(c as string, amt > 0 ? "#ffffff" : "#5a4060", Math.abs(amt));
}

export { col };

/** bunting garland along local X from x0..x1 at height y, hugging a wall at local z (flags face -Z) */
export function bunting(k: Kit, x0: number, x1: number, y: number, z: number, cols: ColorLike[], o: { sag?: number; spacing?: number; shape?: "flag" | "heart" } = {}) {
  const sag = o.sag ?? 0.12;
  const sp = o.spacing ?? 0.5;
  const n = Math.max(2, Math.round((x1 - x0) / sp));
  const yAt = (x: number) => y - Math.sin(((x - x0) / (x1 - x0)) * PI) * sag;
  const path: V3[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = x0 + ((x1 - x0) * i) / 16;
    path.push([x, yAt(x), z]);
  }
  k.tube(path, 0.012, "#fffdf8", { key: "fine" });
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
    const c = cols[i % cols.length];
    if (o.shape === "heart") heart(k, [x, yAt(x) - 0.14, z - 0.01], 0.22, c, 0.04, { key: "fine" });
    else
      k.puff(
        [
          [-0.13, 0],
          [0.13, 0],
          [0, -0.28],
        ],
        0.03,
        [x, yAt(x) + 0.01, z - 0.01],
        c,
        { bevel: 0.012, key: "fine" },
      );
  }
}
