/**
 * Bakery goodies shared by Mocha's Bakery exterior + interior: breads, pastries, café furniture,
 * chalkboard pictures, copper pans… All author into the Kit's current frame (bottom-centre at p).
 */
import { Kit, circlePts, roundRectPts, heartPts, type V3, type P2 } from "./kit";
import { PI, cakeRound, petalPts } from "./props";
import type { ColorLike } from "../../render/Shapes";
import { mixCol, rng } from "../../render/Palette";

export const CRUST = "#eaa45e";
export const CRUST_DEEP = "#d48a4a";
export const CRUST_LIGHT = "#f8cf8c";
export const DOUGH = "#fbe3b8";
export const COPPER = "#eb9d6c";
export const SPRINKLES: ColorLike[] = ["#f47a9a", "#7fd6cf", "#ffe066", "#b48ce6", "#fffdf8", "#8fc3ea"];

/* --------------------------------- breads --------------------------------- */

/** plump bloomer loaf with three scores, long axis along local X */
export function loaf(k: Kit, p: V3, rotY = 0, s = 1, key = "main", crust: ColorLike = CRUST) {
  k.at(k.frame(p, rotY, s), () => {
    k.blob(0.22, 0.13, 0.13, [0, 0.11, 0], crust, { bottom: CRUST_DEEP, key, seg: 8 });
    for (const x of [-0.1, 0, 0.1]) k.blob(0.028, 0.03, 0.105, [x, 0.21 - Math.abs(x) * 0.08, 0], CRUST_LIGHT, { rot: [0, 0.45, 0], key, seg: 4 });
  });
}

/** round boule */
export function boule(k: Kit, p: V3, s = 1, key = "main") {
  k.at(k.frame(p, 0, s), () => {
    k.blob(0.17, 0.12, 0.17, [0, 0.1, 0], CRUST, { bottom: CRUST_DEEP, key, seg: 8 });
    k.blob(0.03, 0.03, 0.12, [0, 0.205, 0], CRUST_LIGHT, { rot: [0, 0.8, 0], key, seg: 5 });
    k.blob(0.03, 0.03, 0.12, [0, 0.205, 0], CRUST_LIGHT, { rot: [0, -0.8, 0], key, seg: 5 });
  });
}

/** baguette standing along local +Y from p (use rot to tilt / lay down) */
export function baguette(k: Kit, p: V3, rot: V3, len = 0.75, s = 1, key = "main") {
  k.at(k.frame(p, rot, s), () => {
    k.capsule(len, 0.055, [0, len / 2, 0], CRUST, { key, seg: 6 });
    const n = Math.max(2, Math.round(len / 0.22));
    for (let i = 0; i < n; i++) {
      const y = 0.14 + (i * (len - 0.28)) / Math.max(1, n - 1);
      k.blob(0.028, 0.06, 0.03, [0, y, -0.035], CRUST_LIGHT, { rot: [0, 0, 0.7], key, seg: 3 });
    }
  });
}

/** crescent croissant lying flat (top up); horns point toward +Z */
export function croissant(k: Kit, p: V3, rotY = 0, s = 1, key = "main") {
  k.at(k.frame(p, rotY, s), () => {
    const segs: [number, number][] = [
      [-1.35, 0.04],
      [-0.72, 0.058],
      [0, 0.075],
      [0.72, 0.058],
      [1.35, 0.04],
    ];
    segs.forEach(([a, r], i) => {
      const R = 0.12;
      k.blob(r * 0.85, r * 0.9, r * 1.3, [Math.sin(a) * R, r * 0.85, -Math.cos(a) * R + 0.06], i % 2 ? CRUST_LIGHT : CRUST, { rot: [0, PI - a, 0], key, seg: 5, bottom: CRUST_DEEP });
    });
  });
}

/** soft round bun (optionally with sesame seeds) */
export function bun(k: Kit, p: V3, s = 1, key = "main", sesame = false, color: ColorLike = CRUST) {
  k.at(k.frame(p, 0, s), () => {
    k.blob(0.11, 0.075, 0.11, [0, 0.065, 0], color, { bottom: CRUST_LIGHT, key, seg: 7 });
    if (sesame) {
      const r = rng(Math.floor((p[0] * 13 + p[2] * 7) * 100) & 0xffff);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + r(),
          d = 0.03 + r() * 0.035;
        k.blob(0.014, 0.01, 0.022, [Math.cos(a) * d, 0.137 - d * 0.25, Math.sin(a) * d], "#fff6e6", { rot: [0, a, 0], key, seg: 3 });
      }
    }
  });
}

export function bagel(k: Kit, p: V3, s = 1, key = "main") {
  k.torus(0.075 * s, 0.06 * s, [p[0], p[1] + 0.025 * s, p[2]], CRUST, { key, scale: [1, 0.8, 1], seg: 12, bottom: CRUST_LIGHT });
}

/** glazed donut with sprinkles */
export function donut(k: Kit, p: V3, glaze: ColorLike, s = 1, key = "main", sprinkles = true) {
  k.at(k.frame(p, 0, s), () => {
    k.torus(0.08, 0.065, [0, 0.032, 0], CRUST_LIGHT, { key, seg: 14 });
    k.torus(0.08, 0.068, [0, 0.045, 0], glaze, { key, scale: [1.02, 0.55, 1.02], seg: 14 });
    if (sprinkles)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2 + 0.3;
        k.plainBox(0.035, 0.014, 0.014, [Math.cos(a) * 0.08, 0.068, Math.sin(a) * 0.08], SPRINKLES[i % SPRINKLES.length], { rot: [0, a * 1.7, 0], key });
      }
  });
}

/** cupcake: pleated wrapper + swirl + cherry */
export function cupcake(k: Kit, p: V3, frost: ColorLike, wrap: ColorLike = "#f7a8c0", s = 1, key = "main", top: ColorLike = "#f0727a") {
  k.at(k.frame(p, 0, s), () => {
    k.revolve(
      (a) => {
        const pl = 1 + 0.06 * Math.cos(a * 12);
        return [
          [0, 0],
          [0.06 * pl, 0],
          [0.085 * pl, 0.11],
          [0.07, 0.115],
          [0, 0.11],
        ];
      },
      [0, 0, 0],
      wrap,
      { key, segA: 16 },
    );
    k.blob(0.095, 0.05, 0.095, [0, 0.13, 0], frost, { key, seg: 6 });
    k.blob(0.07, 0.045, 0.07, [0, 0.18, 0], frost, { key, seg: 6 });
    k.blob(0.04, 0.04, 0.04, [0, 0.225, 0], frost, { key, seg: 5 });
    k.ball(0.028, [0, 0.27, 0], top, { key, seg: 4 });
  });
}

/** frosted round cake with a big flower on top */
export function flowerCake(k: Kit, p: V3, r: number, h: number, frosting: ColorLike, petal: ColorLike = "#fffdf8", centre: ColorLike = "#ffe066", sponge: ColorLike = "#fff0c9") {
  cakeRound(k, p, r, h, sponge, frosting, { berries: 0 });
  const top = p[1] + h + 0.03;
  // rosettes round the rim
  const n = Math.max(6, Math.round((r * PI * 2) / 0.13));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    k.ball(0.042 * (r / 0.2) ** 0.4, [p[0] + Math.cos(a) * r * 0.86, top + 0.01, p[2] + Math.sin(a) * r * 0.86], mixCol(frosting as string, "#ffffff", 0.35), { seg: 4 });
  }
  k.puff(petalPts(r * 0.55, 5, 30), 0.05, [p[0], top + 0.04, p[2]], petal, { rot: [PI / 2, 0, 0], bevel: 0.022 });
  k.ball(r * 0.17, [p[0], top + 0.07, p[2]], centre, { seg: 7, scale: [1, 0.6, 1] });
  for (const s of [-1, 1]) k.blob(r * 0.22, 0.012, r * 0.1, [p[0] + s * r * 0.45, top + 0.035, p[2] + r * 0.3], "#8fd27a", { rot: [0, s * 0.6, 0], seg: 5 });
}

/** tiny macaron tower / pile helper */
export function macaronPile(k: Kit, p: V3, cols: ColorLike[], s = 1) {
  k.at(k.frame(p, 0, s), () => {
    cols.forEach((c, i) => {
      const a = (i / cols.length) * PI * 2;
      const rr = i < 3 ? 0.06 : 0;
      const y = i < 3 ? 0 : 0.05;
      k.blob(0.045, 0.018, 0.045, [Math.cos(a) * rr, y + 0.012, Math.sin(a) * rr], c, { key: "fine", seg: 7 });
      k.cyl(0.014, 0.038, 0.038, [Math.cos(a) * rr, y + 0.022, Math.sin(a) * rr], "cream", { key: "fine", seg: 10 });
      k.blob(0.045, 0.018, 0.045, [Math.cos(a) * rr, y + 0.046, Math.sin(a) * rr], c, { key: "fine", seg: 7 });
    });
  });
}

/** low-poly puffy heart (cheaper than props.heart for small/repeated use) */
export function heartLo(k: Kit, p: V3, size: number, color: ColorLike, depth = size * 0.3, o: { rot?: V3; key?: string } = {}) {
  return k.puff(heartPts(size, 18), depth, p, color, { bevel: depth * 0.45, bulge: depth * 0.15, rot: o.rot, key: o.key, steps: 2 });
}

/** cheap slatted wooden crate (open top), p = floor centre */
export function breadCrate(k: Kit, p: V3, w: number, h: number, d: number, wood: ColorLike = "#e8c49a", rotY = 0) {
  k.at(k.frame(p, rotY), () => {
    k.box(w - 0.06, h * 0.92, d - 0.06, [0, h * 0.46, 0], "#c99a6b", { r: 0.03, steps: 1 });
    for (let i = 0; i < 2; i++) {
      const y = h * (0.27 + i * 0.46);
      for (const s of [-1, 1]) {
        k.box(w, h * 0.32, 0.05, [0, y, s * (d / 2 - 0.02)], wood, { r: 0.02, steps: 1 });
        k.box(0.05, h * 0.32, d, [s * (w / 2 - 0.02), y, 0], wood, { r: 0.02, steps: 1 });
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.08, h, 0.08, [sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03)], "#f2d4ae", { r: 0.03, steps: 1 });
  });
}

/* --------------------------------- tools ---------------------------------- */

/** rolling pin lying along local X */
export function rollingPin(k: Kit, p: V3, rotY = 0, s = 1, key = "main") {
  k.at(k.frame(p, rotY, s), () => {
    k.rod(0.42, 0.055, [0, 0.055, 0], "#f2d7b4", { rot: [0, 0, PI / 2], key, seg: 10 });
    for (const sx of [-1, 1]) {
      k.rod(0.12, 0.022, [sx * 0.27, 0.055, 0], "#c99a6b", { rot: [0, 0, PI / 2], key, seg: 6 });
      k.ball(0.035, [sx * 0.345, 0.055, 0], "#f47a9a", { key, seg: 6 });
    }
  });
}

/** piping bag lying on its side, tip toward local +X */
export function pipingBag(k: Kit, p: V3, rotY = 0, s = 1, color: ColorLike = "#fffdf8", cream: ColorLike = "#f8b9cb", key = "main") {
  k.at(k.frame(p, rotY, s), () => {
    k.at(k.frame([0, 0.085, 0], [0, 0, -PI / 2 - 0.12]), () => {
      k.lathe(
        [
          [0, 0.02],
          [0.03, 0.04],
          [0.08, 0.2],
          [0.085, 0.26],
          [0.05, 0.31],
          [0, 0.32],
        ],
        [0, 0, 0],
        color,
        { key, seg: 10, bottom: cream },
      );
      k.cone(0.07, 0.03, [0, 0.07, 0], "#c9c3d6", { rot: [PI, 0, 0], key, seg: 8 });
      k.blob(0.035, 0.025, 0.035, [0, -0.01, 0], cream, { key, seg: 6 });
    });
  });
}

/** balloon whisk standing along local +Y (handle down) */
export function whisk(k: Kit, p: V3, rot: V3 = [0, 0, 0], s = 1, handle: ColorLike = "#f7a8c0", key = "main") {
  k.at(k.frame(p, rot, s), () => {
    k.rod(0.16, 0.022, [0, 0.08, 0], handle, { key, seg: 6 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI;
      const path: V3[] = [];
      for (let j = 0; j <= 10; j++) {
        const t = (j / 10) * PI;
        const rr = Math.sin(t) * 0.065;
        path.push([Math.cos(a) * rr, 0.16 + (1 - Math.cos(t)) * 0.12, Math.sin(a) * rr]);
      }
      k.tube(path, 0.007, "#d9d4e3", { key: "fine", tess: 4 });
    }
  });
}

/** copper pan hanging flat against a wall (face toward local -Z); p = hook point */
export function hangingPan(k: Kit, p: V3, r = 0.2, s = 1) {
  k.at(k.frame(p, 0, s), () => {
    k.ball(0.025, [0, 0, -0.02], "#6d5a78", { seg: 5 });
    k.rod(0.3, 0.025, [0, -0.17, -0.05], COPPER, { seg: 6 });
    k.torus(0.03, 0.014, [0, -0.04, -0.05], COPPER, { rot: [PI / 2, 0, 0], key: "fine", seg: 8 });
    k.at(k.frame([0, -0.32 - r, -0.06], [-PI / 2, 0, 0]), () => {
      k.cyl(0.08, r, r * 0.88, [0, -0.04, 0], COPPER, { bevel: 0.03, seg: 18, bottom: "#d98458" });
      k.disc(r * 0.82, 0.02, [0, 0.025, 0], "#f6b98e", { seg: 18 });
    });
  });
}

/** sack of flour slumped on the floor */
export function flourSack(k: Kit, p: V3, rotY = 0, s = 1, stamp: ColorLike = "#f7a8c0") {
  k.at(k.frame(p, rotY, s), () => {
    k.blob(0.3, 0.32, 0.24, [0, 0.3, 0], "#f6eedf", { bottom: "#e6d6bd", seg: 8 });
    k.blob(0.2, 0.12, 0.16, [0, 0.6, 0], "#f6eedf", { seg: 6 });
    k.torus(0.1, 0.04, [0, 0.66, 0], "#c99a6b", { seg: 10, key: "fine" });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + 0.4;
      k.blob(0.06, 0.08, 0.03, [Math.cos(a) * 0.06, 0.74, Math.sin(a) * 0.06], "#f6eedf", { rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], seg: 4 });
    }
    // stamp: wheat-ish heart sitting proud of the sack face
    heartLo(k, [0, 0.32, -0.27], 0.2, stamp, 0.04, { key: "fine" });
  });
}

/* --------------------------------- café ----------------------------------- */

/** round bistro table, p = floor; returns table-top height */
export function cafeTable(k: Kit, p: V3, top: ColorLike, s = 1, metal: ColorLike = "#fffdf8", h = 0.72): number {
  k.at(k.frame(p, 0, s), () => {
    k.cyl(0.05, 0.26, 0.3, [0, 0, 0], metal, { bevel: 0.025, seg: 16 });
    k.rod(h - 0.06, 0.045, [0, (h - 0.06) / 2 + 0.03, 0], metal, { seg: 8 });
    k.revolve(
      (a) => {
        const w = 1 + 0.035 * Math.cos(a * 10);
        return [
          [0, h - 0.06],
          [0.42 * w, h - 0.06],
          [0.47 * w, h - 0.03],
          [0.46 * w, h + 0.005],
          [0.4, h + 0.01],
          [0, h + 0.01],
        ];
      },
      [0, 0, 0],
      top,
      { segA: 30, bottom: mixCol(top as string, "#7a5a70", 0.12) },
    );
  });
  return p[1] + (h + 0.01) * s;
}

/** bistro chair: seat facing local -Z (sitter faces -Z), heart back at +Z */
export function cafeChair(k: Kit, p: V3, rotY: number, color: ColorLike, cushionC: ColorLike = "#fff6e6", s = 1, metal: ColorLike = "#fffdf8") {
  k.at(k.frame(p, rotY, s), () => {
    for (const [x, z] of [
      [-0.17, -0.17],
      [0.17, -0.17],
      [-0.17, 0.17],
      [0.17, 0.17],
    ])
      k.rod(0.46, 0.022, [x * 1.08, 0.23, z * 1.08], metal, { rot: [-z * 0.25, 0, x * 0.25], seg: 5 });
    k.cyl(0.07, 0.24, 0.23, [0, 0.42, 0], color, { bevel: 0.03, seg: 12 });
    k.blob(0.2, 0.04, 0.2, [0, 0.5, 0], cushionC, { seg: 6 });
    for (const x of [-0.13, 0.13]) k.rod(0.36, 0.02, [x, 0.66, 0.2], metal, { rot: [-0.12, 0, 0], seg: 4 });
    k.at(k.frame([0, 0.8, 0.24], [-0.12, PI, 0]), () => heartLo(k, [0, -0.02, 0], 0.42, color, 0.07));
  });
}

/** striped scalloped café umbrella; p = pole foot; returns canopy rim height */
export function cafeUmbrella(k: Kit, p: V3, a: ColorLike, b: ColorLike, s = 1, poleH = 2.05, R = 1.05, panels = 8): number {
  const ca = mixCol(a as string, "#000000", 0),
    cb = mixCol(b as string, "#000000", 0);
  k.at(k.frame(p, 0, s), () => {
    k.rod(poleH, 0.035, [0, poleH / 2, 0], "#fffdf8", { seg: 6 });
    const y0 = poleH - 0.05;
    const m = k.revolve(
      (ang) => {
        const sc = Math.pow(Math.abs(Math.sin((ang * panels) / 2)), 0.6);
        return [
          [R * 0.96, y0 - 0.06 - sc * 0.1],
          [R * 1.01, y0 - 0.02 - sc * 0.07],
          [R * 0.95, y0 + 0.07],
          [R * 0.6, y0 + 0.36],
          [R * 0.2, y0 + 0.53],
          [0.0, y0 + 0.56],
        ];
      },
      [0, 0, 0],
      a,
      { segA: panels * 6 },
    );
    k.paintFn(m, (x, _y, z) => {
      const t = (Math.atan2(z, x) + PI * 2 + PI / panels) % (PI * 2);
      return Math.floor((t / (PI * 2)) * panels) % 2 ? cb : ca;
    });
    // underside (so it reads from low angles) + finial
    k.revolve(
      () => [
        [0, y0 + 0.4],
        [R * 0.5, y0 + 0.2],
        [R * 0.93, y0 - 0.02],
      ],
      [0, 0, 0],
      mixCol(b as string, "#c9a0b0", 0.15),
      { segA: 24 },
    );
    k.ball(0.07, [0, y0 + 0.6, 0], a, { seg: 7 });
    k.ball(0.06, [0, y0 + 0.05, 0], "#fffdf8", { seg: 6 });
  });
  return p[1] + (poleH - 0.1) * s;
}

/* ------------------------------ chalk pictures ------------------------------ */

/** pastel "chalk" pastry icons on a board facing -Z, centred at p (z = board front). size ≈ 0.22*s */
export function chalkIcon(k: Kit, kind: "croissant" | "cupcake" | "donut" | "cup" | "loaf" | "cake" | "heart" | "star", p: V3, s = 1, key = "flat") {
  const t = 0.012;
  k.at(k.frame(p, 0, s), () => {
    switch (kind) {
      case "croissant": {
        for (let i = 0; i < 5; i++) {
          const a = -1.1 + i * 0.55;
          const rr = [0.04, 0.055, 0.07, 0.055, 0.04][i];
          k.decal(circlePts(rr, 12, rr * 1.15), [Math.sin(a) * 0.09, Math.cos(a) * 0.09 - 0.06, 0], i % 2 ? "#ffd27a" : "#f8bb6a", { key, t, rot: [0, 0, -a] });
        }
        break;
      }
      case "cupcake": {
        const cup: P2[] = [
          [-0.07, 0],
          [0.07, 0],
          [0.09, 0.08],
          [-0.09, 0.08],
        ];
        k.decal(cup, [0, -0.09, 0], "#a8d8f0", { key, t });
        k.decal(circlePts(0.1, 16, 0.06), [0, 0.01, 0], "#f8b9cb", { key, t });
        k.decal(circlePts(0.065, 14, 0.045), [0, 0.06, -0.002], "#f8b9cb", { key, t });
        k.decal(circlePts(0.025, 10), [0, 0.11, -0.004], "#f0727a", { key, t });
        break;
      }
      case "donut": {
        const ring: P2[] = [];
        for (let i = 0; i <= 20; i++) {
          const a = (i / 20) * PI * 2;
          ring.push([Math.cos(a) * 0.1, Math.sin(a) * 0.1]);
        }
        k.decal(circlePts(0.1, 22), [0, 0, 0], "#f9a8c4", { key, t });
        k.decal(circlePts(0.035, 12), [0, 0, -0.003], "#5b6a70", { key, t });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * PI * 2 + 0.4;
          k.decal(roundRectPts(0.03, 0.012, 0.005, 1), [Math.cos(a) * 0.065, Math.sin(a) * 0.065, -0.004], SPRINKLES[i % 5], { key, t, rot: [0, 0, a * 1.3] });
        }
        void ring;
        break;
      }
      case "cup": {
        k.decal(roundRectPts(0.15, 0.13, 0.04), [0, -0.02, 0], "#fffdf8", { key, t });
        k.decal(circlePts(0.035, 12), [0.09, -0.01, 0], "#fffdf8", { key, t });
        k.decal(circlePts(0.018, 10), [0.09, -0.01, -0.003], "#5b6a70", { key, t });
        for (const x of [-0.03, 0.03]) k.decal(circlePts(0.015, 8, 0.035), [x, 0.09, 0], "#e6e0f0", { key, t });
        heartLo(k, [0, -0.02, -0.01], 0.06, "#f47a9a", 0.01, { key });
        break;
      }
      case "loaf": {
        k.decal(circlePts(0.12, 18, 0.07), [0, 0, 0], "#f8bb6a", { key, t });
        for (const x of [-0.05, 0, 0.05]) k.decal(roundRectPts(0.016, 0.07, 0.008, 1), [x, 0.01, -0.003], "#ffe6b0", { key, t, rot: [0, 0, 0.5] });
        break;
      }
      case "cake": {
        k.decal(roundRectPts(0.2, 0.1, 0.03), [0, -0.05, 0], "#fff6e6", { key, t });
        k.decal(roundRectPts(0.2, 0.035, 0.015), [0, -0.01, -0.002], "#f8b9cb", { key, t });
        k.decal(roundRectPts(0.14, 0.07, 0.025), [0, 0.04, 0], "#fff6e6", { key, t });
        k.decal(circlePts(0.025, 10), [0, 0.1, 0], "#f0727a", { key, t });
        break;
      }
      case "heart":
        k.decal(heartPts(0.12, 18), [0, 0, 0], "#f8b9cb", { key, t });
        break;
      case "star":
        k.decal(circlePts(0.03, 8), [0, 0, 0], "#ffe066", { key, t });
        break;
    }
  });
}

/** paw-print doormat lying flat, p = floor centre (front edge toward -Z) */
export function pawMat(k: Kit, p: V3, color: ColorLike, paw: ColorLike, w = 1.3, d = 0.8) {
  k.puff(roundRectPts(w, d, 0.22), 0.06, [p[0], p[1] + 0.03, p[2]], color, { rot: [PI / 2, 0, 0], bevel: 0.03, key: "flat" });
  pawPrint(k, [p[0], p[1] + 0.062, p[2] + 0.02], 0.5 * (d / 0.8), paw, "flat");
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) k.plainBox(0.04, 0.02, 0.12, [p[0] - w * 0.4 + (i * w * 0.8) / 8, p[1] + 0.012, p[2] + s * (d / 2 + 0.03)], paw, { key: "flat" });
}

/** flat paw print (pad + 4 toe beans) lying on XZ, toes toward +Z */
export function pawPrint(k: Kit, p: V3, size: number, color: ColorLike, key = "flat") {
  const s = size;
  k.at(k.frame(p, [PI / 2, 0, 0]), () => {
    // local Y now = world -Z?  rot x +90°: +Y -> +Z, so toes (local +Y) point to +Z
    const pad: P2[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * PI * 2;
      const r = 1 + 0.12 * Math.cos(a * 3 - PI / 2);
      pad.push([Math.cos(a) * 0.22 * s * r, Math.sin(a) * 0.17 * s * r]);
    }
    k.puff(pad, 0.025, [0, -0.08 * s, 0], color, { bevel: 0.01, key });
    const toes: [number, number][] = [
      [-0.27, 0.14],
      [-0.1, 0.26],
      [0.1, 0.26],
      [0.27, 0.14],
    ];
    for (const [x, y] of toes) k.puff(circlePts(0.075 * s, 14, 0.09 * s), 0.025, [x * s, y * s + 0.04 * s, 0], color, { bevel: 0.01, key });
  });
}
