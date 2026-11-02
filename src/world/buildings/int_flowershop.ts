import { Vector3, type Scene, type StandardMaterial, Color3 } from "@babylonjs/core";
import type { InteriorDef } from "../../core/types";
import { Kit, archPts, circlePts, roundRectPts, tabPts, uniqueMat, type V3, type P2 } from "./kit";
import { RoomCtx, roomShell, finishInterior, makeRoot, onBack, onLeft, X0, Z1, WALL_H } from "./room";
import { PI, heart, flower, flowerPot, pottedPlant, lantern, lanternGlow, leaf, ivyStrand, bush, type FlowerKind } from "./props";
import type { ColorLike } from "../../render/Shapes";

/** striped scalloped awning; p = top centre on wall, spans `len` along local X, projects toward -Z */
export function awning(k: Kit, p: V3, len: number, drop: number, a: ColorLike, b: ColorLike, tilt = 0.55, key = "main") {
  const n = Math.max(3, Math.round(len / 0.42));
  const w = len / n;
  k.at(k.frame(p, [tilt, 0, 0]), () => {
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + w * (i + 0.5);
      k.puff(tabPts(w + 0.02, drop, 8), 0.07, [x, 0, -0.05], i % 2 ? a : b, { bevel: 0.03, bulge: 0.015, spine: [[0, -0.05], [0, -drop + w / 2]], key });
    }
  });
  // roll bar on top
  k.capsule(len + 0.2, 0.09, [p[0], p[1] + 0.02, p[2] - 0.06], a, { rot: [0, 0, PI / 2] });
  // side arms
  const out = Math.sin(tilt) * drop;
  for (const s of [-1, 1]) {
    k.tube(
      [
        [p[0] + s * (len / 2 - 0.05), p[1] - drop - 0.25, p[2]],
        [p[0] + s * (len / 2 - 0.05), p[1] - drop * Math.cos(tilt) + 0.05, p[2] - out + 0.05],
      ],
      0.025,
      "#6d5a78",
      { key: "fine" },
    );
  }
}

/** stepped wooden flower stand, p = floor centre of the front edge; steps rise toward +Z */
export function tieredStand(k: Kit, p: V3, w: number, tiers: number, o: { wood?: ColorLike; step?: number; rise?: number } = {}): V3[] {
  const wood = o.wood ?? "#e2b98c";
  const st = o.step ?? 0.5,
    rise = o.rise ?? 0.42;
  const tops: V3[] = [];
  const side: P2[] = [[0, 0]];
  for (let i = 0; i < tiers; i++) {
    side.push([i * st, (i + 1) * rise]);
    side.push([(i + 1) * st, (i + 1) * rise]);
  }
  side.push([tiers * st, 0]);
  for (const s of [-1, 1]) k.puff(side, 0.08, [p[0] + s * (w / 2 - 0.04), p[1], p[2]], wood, { rot: [0, -PI / 2, 0], bevel: 0.03, bottom: "#c99a6b" });
  for (let i = 0; i < tiers; i++) {
    const y = (i + 1) * rise;
    k.box(w, 0.08, st + 0.04, [p[0], p[1] + y - 0.04, p[2] + i * st + st / 2], i % 2 ? "#f2d4ae" : wood, { r: 0.03 });
    k.box(w - 0.1, 0.05, 0.05, [p[0], p[1] + y - 0.15, p[2] + i * st + 0.03], "#c99a6b", { r: 0.02, key: "fine" });
    tops.push([p[0], p[1] + y + 0.035, p[2] + i * st + st / 2]);
  }
  return tops;
}

export function wateringCan(k: Kit, p: V3, color: ColorLike, rotY = 0, s = 1) {
  k.at(k.frame(p, rotY, s), () => {
    k.cyl(0.36, 0.2, 0.22, [0, 0, 0], color, { bevel: 0.06 });
    k.disc(0.15, 0.03, [0, 0.36, 0], "#8fc3ea");
    k.tube(
      [
        [0.14, 0.08, 0],
        [0.3, 0.25, 0],
        [0.42, 0.42, 0],
      ],
      0.035,
      color,
      { tess: 8 },
    );
    k.cyl(0.06, 0.07, 0.05, [0.44, 0.42, 0], color, { rot: [0, 0, -0.7], bevel: 0.02 });
    k.torus(0.15, 0.04, [-0.12, 0.38, 0], color, { rot: [PI / 2, 0, 0], seg: 14 });
    heart(k, [0, 0.18, -0.245], 0.14, "#fffdf8", 0.03, { key: "flat" });
    flower(k, [0.02, 0.33, 0], "daisy", "#fffdf8", 0.32, "main");
    flower(k, [-0.05, 0.33, 0.04], "tulip", "#f47a9a", 0.24, "main");
  });
}

export function crate(k: Kit, p: V3, w: number, h: number, d: number, wood: ColorLike = "#e2b98c", rotY = 0) {
  k.at(k.frame(p, rotY), () => {
    k.box(w - 0.06, h * 0.9, d - 0.06, [0, h * 0.45, 0], "#c99a6b", { r: 0.03 });
    for (let i = 0; i < 3; i++) {
      const y = h * (0.18 + i * 0.32);
      for (const s of [-1, 1]) {
        k.box(w, h * 0.22, 0.05, [0, y, s * (d / 2 - 0.02)], wood, { r: 0.02 });
        k.box(0.05, h * 0.22, d, [s * (w / 2 - 0.02), y, 0], wood, { r: 0.02 });
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.08, h, 0.08, [sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03)], "#f2d4ae", { r: 0.03 });
  });
}

/** bouquet wrapped in paper with a bow, lying/standing at p */
export function bouquet(k: Kit, p: V3, rot: V3, colors: ColorLike[], paper: ColorLike = "#fff6e6", bow: ColorLike = "#f47a9a") {
  k.at(k.frame(p, rot), () => {
    // paper cone (point down)
    k.revolve(
      (a) => {
        const w = 1 + 0.08 * Math.cos(a * 6);
        return [
          [0, 0],
          [0.06, 0.05],
          [0.22 * w, 0.42],
          [0.26 * w, 0.5],
          [0.2, 0.47],
          [0, 0.4],
        ];
      },
      [0, 0, 0],
      paper,
      { segA: 30 },
    );
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      const r = i === 0 ? 0 : 0.13;
      k.ball(0.075, [Math.cos(a) * r, 0.55 + (i === 0 ? 0.05 : 0), Math.sin(a) * r], colors[i % colors.length], { seg: 7 });
      k.torus(0.045, 0.03, [Math.cos(a) * r, 0.6 + (i === 0 ? 0.05 : 0), Math.sin(a) * r], colors[(i + 1) % colors.length], { seg: 8 });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + 0.3;
      leaf(k, [Math.cos(a) * 0.2, 0.52, Math.sin(a) * 0.2], 0.1, "leaf", [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1]);
    }
    // bow
    k.torus(0.1, 0.035, [0, 0.2, 0], bow, { seg: 14 });
    for (const s of [-1, 1]) k.blob(0.09, 0.05, 0.04, [s * 0.09, 0.22, -0.13], bow, { rot: [0, 0, s * 0.4], seg: 6 });
    k.ball(0.04, [0, 0.22, -0.13], bow, { seg: 6 });
  });
}

/** leafy wreath with flowers and a bow; faces -Z, p = centre */
export function heartWreath(k: Kit, p: V3, r: number, bow: ColorLike = "#f47a9a") {
  k.at(k.frame(p, 0), () => {
    const n = 18;
    for (let i = 0; i < n; i++) {
      // heart-shaped path
      const t = (i / n) * PI * 2;
      const x = (16 * Math.pow(Math.sin(t), 3)) / 17;
      const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17;
      leaf(k, [x * r, y * r, -0.05], 0.1, i % 2 ? "leaf" : "leafDeep", [0, 0, t + 1.2]);
      if (i % 3 === 0) k.ball(0.05, [x * r, y * r, -0.1], i % 2 ? "#f47a9a" : "#ffe066", { seg: 6 });
    }
    k.torus(0.05, 0.03, [0, r * 0.75, -0.12], bow, { rot: [PI / 2, 0, 0], seg: 10 });
    for (const s of [-1, 1]) {
      k.blob(0.1, 0.06, 0.03, [s * 0.1, r * 0.75, -0.12], bow, { rot: [0, 0, s * 0.3], seg: 6 });
      k.blob(0.03, 0.12, 0.02, [s * 0.06, r * 0.62, -0.12], bow, { rot: [0, 0, s * 0.4], seg: 5 });
    }
  });
}

export function buildFlowershop(scene: Scene, origin: Vector3): InteriorDef {
  const root = makeRoot(scene, "flowershop", origin);
  const k = new Kit(scene, root);
  const ctx = new RoomCtx(origin);

  roomShell(k, {
    wall: "#fde2e9",
    wallTop: "#fff0f3",
    wainscot: "#bfe9d6",
    wainscotH: 1.0,
    rail: "#fffdf8",
    border: "#a8e2c4",
    borderDeep: "#76c6a2",
    crown: "#fffdf8",
    floor: "tile",
    floorA: "#fff4ea",
    floorB: "#f9d3dd",
    floorGap: "#e9c9c9",
    motif: "flowers",
    motifColor: "#fffdf8",
    mat: "#f7a8c0",
    matAccent: "#fffdf8",
    seed: 44,
  });

  // ---- awning + counter (back right) ----
  awning(k, [2.35, 3.0, Z1 - 0.06], 5.2, 0.85, "#f7a8c0", "#fff6e6", 0.75);
  const C: V3 = [2.4, 0, 2.35];
  k.box(2.8, 0.95, 0.75, [C[0], 0.475, C[2]], "#bfe9d6", { r: 0.1, bottom: "#9fdcbf" });
  k.box(3.0, 0.1, 0.9, [C[0], 1.0, C[2]], "#e2b98c", { r: 0.05 });
  // panel hearts on counter front
  for (let i = 0; i < 3; i++) {
    k.puff(roundRectPts(0.72, 0.58, 0.14), 0.05, [C[0] - 0.9 + i * 0.9, 0.47, C[2] - 0.4], "#dff5ea", { bevel: 0.02 });
    heart(k, [C[0] - 0.9 + i * 0.9, 0.47, C[2] - 0.47], 0.18, "#f7a8c0", 0.04, { key: "fine" });
  }
  ctx.box(C[0], C[2], 3.0, 0.95);
  ctx.spot("counter", C[0], 1.05, C[2]);
  ctx.spot("npc", C[0], 0, C[2] + 0.95);
  // bouquet on counter
  k.at(k.frame([C[0] - 0.75, 1.16, C[2] - 0.05], 0, 1.5), () => bouquet(k, [0, 0, 0], [0, 0, 1.3], ["#f47a9a", "#f8b9cb", "#ef8fab"]));
  ctx.spot("item_bouquet", C[0] - 0.7, 1.1, C[2]);
  // small bell + vase
  k.lathe([[0, 0], [0.09, 0], [0.12, 0.1], [0.06, 0.24], [0.08, 0.3], [0, 0.3]], [C[0] + 0.55, 1.05, C[2]], "#c8e6f8");
  flower(k, [C[0] + 0.55, 1.3, C[2]], "tulip", "#ffb766", 0.18, "main");
  flower(k, [C[0] + 0.6, 1.3, C[2] + 0.04], "tulip", "#f47a9a", 0.24, "main");
  k.lathe([[0, 0], [0.1, 0], [0.09, 0.03], [0.07, 0.1], [0.02, 0.15], [0, 0.18]], [C[0] + 1.1, 1.05, C[2] - 0.1], "#ffe066");
  // seed packets
  for (let i = 0; i < 3; i++) k.box(0.16, 0.22, 0.03, [C[0] + 0.05 + i * 0.18, 1.17, C[2] + 0.1], ["#f8b9cb", "#bfe9d6", "#ffe08a"][i], { rot: [-0.2, 0, 0], r: 0.015, key: "fine" });
  ctx.spot("item_seeds", C[0] + 0.2, 1.1, C[2]);
  // hanging baskets under awning
  // tiered stand along back wall (left of counter)
  const tops = tieredStand(k, [-1.3, 0, Z1 - 1.55], 2.6, 3, { step: 0.5, rise: 0.42 });
  const pots: [FlowerKind, ColorLike[], ColorLike][] = [
    ["tulip", ["#f47a9a", "#ffb766", "#f8b9cb"], "#fff6e6"],
    ["daisy", ["#fffdf8"], "#bfe9d6"],
    ["sunflower", ["#ffd54a"], "#f7a98f"],
    ["lavender", ["#b48ce6"], "#fff6e6"],
    ["rose", ["#f47a9a", "#ef8fab"], "#c9b3f2"],
    ["tulip", ["#ffe066", "#ffb766"], "#f8b9cb"],
    ["bell", ["#a8d8f0", "#c9b3f2"], "#fff6e6"],
  ];
  let pi = 0;
  tops.forEach((t, ti) => {
    const n = ti === 2 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const [kind, cols, potC] = pots[pi++ % pots.length];
      flowerPot(k, [t[0] - 0.9 + (1.8 / (n - 1)) * i, t[1], t[2]], kind, cols, { potColor: potC, size: 1.25, seed: 70 + pi });
    }
  });
  ctx.box(-1.3, Z1 - 0.8, 2.7, 1.6);

  // ---- left wall: mint door with heart wreath + wall lantern ----
  onLeft(k, 2.2, 0, () => {
    const dw = 1.3,
      dh = 2.3;
    k.puff(archPts(dw + 0.3, dh + 0.15, 14), 0.1, [0, 0, -0.02], "#fffdf8", { bevel: 0.04 });
    k.puff(archPts(dw, dh, 14), 0.1, [0, 0, -0.09], "#a8e2c4", { bevel: 0.04 });
    // window in the door
    k.puff(archPts(dw * 0.62, 0.8, 12), 0.03, [0, dh - 0.95, -0.165], "#d7f0ff", { key: "glass", bottom: "#a9daf5", bevel: 0.01 });
    k.box(0.04, 0.78, 0.03, [0, dh - 0.56, -0.18], "#fffdf8", { r: 0.012, key: "fine" });
    k.box(dw * 0.62, 0.04, 0.03, [0, dh - 0.5, -0.18], "#fffdf8", { r: 0.012, key: "fine" });
    // lower panels
    for (const s of [-1, 1]) k.puff(roundRectPts(0.42, 0.75, 0.1), 0.03, [s * 0.27, 0.65, -0.17], "#c4efd9", { bevel: 0.012 });
    k.ball(0.06, [0.48, 1.05, -0.2], "#ffe066", { seg: 7 });
    heartWreath(k, [0, dh - 1.35, -0.2], 0.32);
    // step
    k.box(dw + 0.4, 0.08, 0.35, [0, 0.04, -0.2], "#e2b98c", { r: 0.03 });
  });
  onLeft(k, 0.9, 1.95, () => {
    k.box(0.06, 0.06, 0.32, [0, 0.42, -0.16], "#6d5a78", { r: 0.02 });
    k.box(0.14, 0.18, 0.04, [0, 0.42, -0.02], "#6d5a78", { r: 0.02 });
  });
  lantern(k, [X0 + 0.32, 2.1, 0.9], "#6d5a78", 1.25);
  lanternGlow(k, [X0 + 0.32, 2.1, 0.9], 1.25);
  ctx.spot("door", X0 + 0.5, 0, 2.2);

  // ---- second stand on left wall front ----
  const tops2 = tieredStand(k, [X0 + 1.45, 0, -1.6], 1.9, 2, { step: 0.45, rise: 0.38 });
  // re-orient: we built facing +Z; tops2 used for pots. (stand sits with its tall side to the wall)
  void tops2;
  ctx.box(X0 + 1.45, -1.15, 2.0, 1.0);
  tops2.forEach((t, ti) => {
    for (let i = 0; i < 3; i++) {
      const [kind, cols, potC] = pots[(pi++ + ti) % pots.length];
      flowerPot(k, [t[0] - 0.6 + i * 0.6, t[1], t[2]], kind, cols, { potColor: potC, size: 1.2, seed: 90 + pi });
    }
  });

  // ---- watering can, crate of daisies, buckets ----
  wateringCan(k, [3.9, 0, -1.4], "#8fc3ea", -0.6, 1.5);
  ctx.circle(3.9, -1.4, 0.45);
  ctx.spot("item_watering_can", 3.9, 0.4, -1.4);
  crate(k, [-3.7, 0, -3.1], 1.1, 0.5, 0.75, "#e2b98c", 0.2);
  k.at(k.frame([-3.7, 0.45, -3.1], 0.2), () => {
    bush(k, [0, -0.08, 0], 0.55, 5, "main", ["#8fd27a", "#5fb46a"], 6, 4);
    for (let i = 0; i < 9; i++) flower(k, [-0.4 + (i % 3) * 0.4, 0.05, -0.22 + Math.floor(i / 3) * 0.22], "daisy", "#fffdf8", 0.12 + (i % 2) * 0.06, "main");
  });
  ctx.box(-3.7, -3.1, 1.2, 0.9);
  // buckets of flowers in front of counter
  const buckets: [number, FlowerKind, ColorLike][] = [
    [0.55, "tulip", "#ffe066"],
    [1.25, "rose", "#f47a9a"],
  ];
  for (const [bx, kind, c] of buckets) {
    k.cyl(0.42, 0.24, 0.19, [bx, 0, 1.25], "#c8e6f8", { bevel: 0.05, bottom: "#9fc6ee" });
    k.torus(0.235, 0.03, [bx, 0.42, 1.25], "#9fc6ee", { seg: 16 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      flower(k, [bx + Math.cos(a) * 0.1, 0.35, 1.25 + Math.sin(a) * 0.1], kind, i % 2 ? c : "#fffdf8", 0.45 + (i % 3) * 0.1, "sway");
    }
  }
  ctx.circle(0.9, 1.25, 0.65);

  // ---- big leafy plant front right ----
  pottedPlant(k, [4.55, 0, -3.25], { kind: "fern", potColor: "#f8b9cb", size: 1.7, seed: 8, heart: "#fffdf8" });
  ctx.circle(4.55, -3.25, 0.45);

  // ---- window on back wall far left with flower box ----
  onBack(k, -4.1, 1.35, () => {
    k.puff(archPts(1.0, 1.5, 12), 0.04, [0, 0, -0.02], "#d7f0ff", { key: "glass", bottom: "#a9daf5", bevel: 0.01 });
    const path: V3[] = [[0.5, 0, -0.03]];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * PI;
      path.push([Math.cos(a) * 0.5, 1.0 + Math.sin(a) * 0.5, -0.03]);
    }
    path.push([-0.5, 0, -0.03]);
    k.tube(path, 0.06, "#fffdf8", { tess: 8 });
    k.box(0.05, 1.45, 0.04, [0, 0.72, -0.06], "#fffdf8", { r: 0.015 });
    k.box(1.3, 0.3, 0.32, [0, -0.1, -0.18], "#f7a8c0", { r: 0.08 });
    for (let i = 0; i < 5; i++) flower(k, [-0.48 + i * 0.24, 0.05, -0.18], i % 2 ? "daisy" : "tulip", i % 2 ? "#fffdf8" : "#f47a9a", 0.16, "main");
  });

  // ---- hanging flower baskets (animated) ----
  const baskets = [
    [-2.7, 2.55, 2.0],
    [0.4, 2.7, 0.6],
  ] as V3[];
  const bMeshes = baskets.map((b, i) =>
    k.anim(
      `flower_basket${i}`,
      { outline: 0.025 },
      () => {
        for (let j = 0; j < 3; j++) {
          const a = (j / 3) * PI * 2;
          k.tube(
            [
              [b[0] + Math.cos(a) * 0.32, b[1] + 0.05, b[2] + Math.sin(a) * 0.32],
              [b[0], b[1] + 0.9, b[2]],
            ],
            0.012,
            "#6d5a78",
          );
        }
        k.rod(4, 0.012, [b[0], b[1] + 2.9, b[2]], "#6d5a78");
        k.lathe([[0, -0.2], [0.18, -0.18], [0.3, -0.05], [0.36, 0.06], [0.3, 0.08], [0, 0.04]], b, "#e2b98c");
        bush(k, [b[0], b[1] - 0.05, b[2]], 0.45, 12 + i, "main", ["#8fd27a", "#5fb46a"], 6, 4);
        for (let j = 0; j < 6; j++) {
          const a = (j / 6) * PI * 2;
          k.ball(0.06, [b[0] + Math.cos(a) * 0.3, b[1] + 0.2, b[2] + Math.sin(a) * 0.3], j % 2 ? "#f47a9a" : "#fffdf8", { seg: 6 });
          ivyStrand(k, [b[0] + Math.cos(a) * 0.3, b[1], b[2] + Math.sin(a) * 0.3], 0.3 + (j % 3) * 0.15, 500 + j + i * 10);
        }
      },
      [b[0], b[1] + 4.9, b[2]],
    ),
  );

  const lanternMat = uniqueMat(scene, "flower_lantern", { emissive: "#ffe2a8" }) as StandardMaterial;
  void lanternMat;
  void WALL_H;
  void Color3;
  void circlePts;
  void Z1;

  return finishInterior(
    "flowershop",
    k,
    ctx,
    "#cfeedd",
    (_dt, t) => {
      bMeshes.forEach((m, i) => {
        if (m) {
          m.rotation.z = Math.sin(t * 0.9 + i * 2) * 0.012;
          m.rotation.x = Math.sin(t * 0.7 + i) * 0.008;
        }
      });
    },
    "#fff4e4",
  );
}
