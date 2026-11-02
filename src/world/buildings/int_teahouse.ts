import { Vector3, type Scene, type Mesh, type StandardMaterial, Color3 } from "@babylonjs/core";
import type { InteriorDef } from "../../core/types";
import { Kit, archPts, circlePts, roundRectPts, tabPts, uniqueMat, type V3, type P2 } from "./kit";
import { RoomCtx, roomShell, finishInterior, makeRoot, onBack, onLeft, X0, Z1, WALL_H } from "./room";
import {
  PI,
  heart,
  ivyStrand,
  pottedPlant,
  teacup,
  teapot,
  cakeRound,
  cakeSlice,
  macaron,
  archWindow,
  pictureFrame,
  tulipArt,
  wallShelf,
  fluffyRug,
  cushion,
  pouf,
  cord,
  bush,
  flower,
} from "./props";
import { mixCol } from "../../render/Palette";

/** scalloped tablecloth over a round table, p = floor centre */
export function roundTable(k: Kit, p: V3, r: number, h: number, cloth: string, overlay: string, wood = "wood") {
  k.cyl(0.05, 0.42, 0.48, p, wood, { bevel: 0.025 });
  k.rod(h, 0.07, [p[0], p[1] + h / 2, p[2]], wood);
  k.cyl(0.05, r, r, [p[0], p[1] + h - 0.05, p[2]], wood);
  // under cloth (long, wavy)
  k.revolve(
    (a) => {
      const w = 0.05 * Math.cos(a * 9);
      return [
        [0, h + 0.012],
        [r * 0.9, h + 0.012],
        [r + 0.04, h - 0.02],
        [r + 0.1 + w, h * 0.55],
        [r + 0.16 + w * 1.5, h * 0.38 + Math.cos(a * 9) * 0.04],
        [r + 0.1, h * 0.38],
        [r * 0.6, h * 0.5],
      ];
    },
    p,
    cloth,
    { segA: 54 },
  );
  // scalloped overlay
  k.revolve(
    (a) => {
      const sc = Math.pow(Math.abs(Math.cos(a * 7)), 0.6);
      return [
        [0, h + 0.03],
        [r * 0.9, h + 0.03],
        [r + 0.07, h],
        [r + 0.13, h - 0.12 - sc * 0.13],
        [r + 0.1, h - 0.14 - sc * 0.13],
        [r * 0.7, h - 0.1],
      ];
    },
    p,
    overlay,
    { segA: 56 },
  );
}

/** tufted armchair facing local -Z, p = floor centre */
export function armchair(k: Kit, p: V3, rotY: number, body: string, cushionC: string, buttonC: string) {
  k.at(k.frame(p, rotY), () => {
    const deep = mixCol(body, "#8a5a80", 0.18);
    // legs
    for (const [x, z] of [
      [-0.45, -0.38],
      [0.45, -0.38],
      [-0.45, 0.38],
      [0.45, 0.38],
    ])
      k.cyl(0.14, 0.05, 0.035, [x, 0, z], "woodDeep", { bevel: 0.02 });
    // seat base
    k.box(1.2, 0.42, 1.0, [0, 0.36, 0], body, { r: 0.18, steps: 3, bottom: deep });
    // back
    k.puff(archPts(1.2, 1.15, 14), 0.32, [0, 0.35, 0.36], body, { bevel: 0.14, bulge: 0.04, bottom: deep });
    // tufts
    for (const [x, y] of [
      [-0.28, 0.85],
      [0, 0.95],
      [0.28, 0.85],
      [-0.14, 1.15],
      [0.14, 1.15],
      [0, 0.72],
    ])
      k.ball(0.04, [x, y, 0.115], buttonC, { scale: [1, 1, 0.6], key: "fine", seg: 6 });
    // arms
    for (const s of [-1, 1]) {
      k.box(0.26, 0.42, 0.95, [s * 0.58, 0.68, 0.0], body, { r: 0.13, steps: 3 });
      k.capsule(0.9, 0.14, [s * 0.58, 0.88, -0.02], body, { rot: [PI / 2, 0, 0] });
    }
    // seat cushion
    cushion(k, [0, 0.55, -0.06], 0.9, 0.82, 0.2, cushionC, [0, 0, 0], buttonC);
    // little heart pillow
    k.at(k.frame([0.22, 0.95, 0.12], [-0.25, 0.3, -0.15]), () => heart(k, [0, 0, 0], 0.42, "#fff2a8", 0.14, { bulge: 0.04 }));
  });
}

/** tiered cake stand, p = base on table top */
export function cakeStand(k: Kit, p: V3, plate = "white", rod = "#f7c6d6") {
  const [x, y, z] = p;
  k.rod(0.95, 0.025, [x, y + 0.48, z], rod);
  k.ball(0.05, [x, y + 0.98, z], rod, { seg: 7 });
  const tiers: [number, number][] = [
    [0.08, 0.42],
    [0.42, 0.32],
    [0.72, 0.24],
  ];
  for (const [ty, tr] of tiers) {
    k.revolve(
      (a) => {
        const s = 1 + 0.04 * Math.cos(a * 12);
        return [
          [0, 0],
          [tr * 0.6, 0],
          [tr * s, 0.03],
          [tr * s * 1.02, 0.045],
          [tr * 0.6, 0.025],
          [0, 0.025],
        ];
      },
      [x, y + ty, z],
      plate,
      { segA: 36 },
    );
  }
  // bottom tier: macarons
  const mc = ["#f7a8c0", "#bfe9d6", "#c9b3f2", "#ffe08a", "#ffc4a3", "#a8d8f0"];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    macaron(k, [x + Math.cos(a) * 0.29, y + 0.1, z + Math.sin(a) * 0.29], mc[i]);
  }
  // middle: slices
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.4;
    cakeSlice(k, [x + Math.cos(a) * 0.19, y + 0.45, z + Math.sin(a) * 0.19], -a + PI / 2, "#fff0c9", "#f8b9cb", 0.85);
  }
  // top: strawberry cake
  cakeRound(k, [x, y + 0.75, z], 0.17, 0.16, "#fff0c9", "#f9c2d3", { berries: 5 });
}

/** jar with heart candies */
export function heartJar(k: Kit, p: V3, s = 1) {
  k.at(k.frame(p, 0, s), () => {
    k.lathe(
      [
        [0, 0],
        [0.12, 0],
        [0.14, 0.04],
        [0.14, 0.24],
        [0.1, 0.28],
        [0, 0.28],
      ],
      [0, 0, 0],
      "#e6f6ff",
      { key: "glass" },
    );
    k.cyl(0.06, 0.11, 0.11, [0, 0.27, 0], "#f8b9cb", { bevel: 0.02 });
    k.ball(0.035, [0, 0.35, 0], "#f47a9a", { seg: 6 });
    heart(k, [0, 0.13, -0.145], 0.14, "#f47a9a", 0.04, { key: "fine" });
  });
}

export function buildTeahouse(scene: Scene, origin: Vector3): InteriorDef {
  const root = makeRoot(scene, "teahouse", origin);
  const k = new Kit(scene, root);
  const ctx = new RoomCtx(origin);

  roomShell(k, {
    wall: "#c9b3ef",
    wallTop: "#dccbf8",
    wainscot: "#f6c3d6",
    wainscotH: 1.05,
    rail: "#fff6e6",
    border: "#f7b5cb",
    borderDeep: "#e58aa9",
    crown: "#fff1b8",
    floor: "wood",
    floorA: "#f2d4ae",
    floorB: "#ebc79c",
    motif: "diamonds",
    motifColor: "#e3d6fa",
    mat: "#f8b9cb",
    matAccent: "#fff6e6",
    seed: 21,
  });

  // ---- back wall: arched window, tulip picture ----
  onBack(k, -1.7, 1.25, () => archWindow(k, [0, 0, 0], 1.45, 1.95, { frame: "#fffdf8", view: "sky", sill: "#fff6e6" }));
  onBack(k, -1.7, 1.25, () => {
    // sill pots
    pottedPlant(k, [-0.5, 0.03, -0.15], { kind: "fern", potColor: "#bfe9d6", size: 0.6, seed: 4 });
    pottedPlant(k, [0.5, 0.03, -0.15], { kind: "bush", potColor: "#f8b9cb", size: 0.55, seed: 9 });
  });
  onBack(k, 1.05, 2.35, () =>
    pictureFrame(k, [0, 0, 0], 0.95, 1.15, "#ffd66e", "#fff6e6", () => tulipArt(k, 1.7)),
  );
  // tea cabinet back right with cups on top
  k.box(1.9, 0.95, 0.62, [3.55, 0.475, Z1 - 0.34], "#fff6e6", { r: 0.1, bottom: "#f3e2cf" });
  k.box(2.0, 0.08, 0.7, [3.55, 0.98, Z1 - 0.34], "#f2b8cc", { r: 0.04 });
  for (const s of [-1, 1]) {
    k.puff(roundRectPts(0.78, 0.66, 0.12), 0.05, [3.55 + s * 0.44, 0.47, Z1 - 0.7], "#fde7ef", { bevel: 0.02 });
    heart(k, [3.55 + s * 0.12, 0.55, Z1 - 0.77], 0.1, "#f47a9a", 0.04, { key: "fine" });
  }
  teacup(k, [2.9, 1.06, Z1 - 0.35], "#fffdf8", "#bfe9d6");
  teacup(k, [3.25, 1.06, Z1 - 0.3], "#fffdf8", "#f8b9cb", 1, 0.6);
  teapot(k, [4.0, 1.06, Z1 - 0.34], "#bfe9d6", "#fffdf8", 0.85, 0.4);
  // wall shelf above cabinet: heart jar + cake
  onBack(k, 3.55, 2.15, () => {
    wallShelf(k, [0, 0, 0], 1.8, 0.4, "#f2d4ae", "#e7b98f");
  });
  heartJar(k, [3.0, 2.19, Z1 - 0.22]);
  cakeRound(k, [3.65, 2.19, Z1 - 0.2], 0.17, 0.15, "#fff0c9", "#c9b3f2", { berries: 4 });
  teacup(k, [4.2, 2.19, Z1 - 0.2], "#fffdf8", "#ffd66e");

  // ---- left wall: small shelf w/ jar & second picture ----
  onLeft(k, 1.1, 2.0, () => wallShelf(k, [0, 0, 0], 1.5, 0.38, "#f2d4ae", "#e7b98f"));
  heartJar(k, [X0 + 0.22, 2.04, 0.7], 0.9);
  cakeRound(k, [X0 + 0.2, 2.04, 1.35], 0.15, 0.14, "#fff0c9", "#f8b9cb", { berries: 4 });
  onLeft(k, -1.6, 2.35, () => pictureFrame(k, [0, 0, 0], 0.75, 0.9, "#bfe9d6", "#fff6e6", () => {
    heart(k, [0, 0, 0], 0.32, "#f47a9a", 0.04);
  }));

  // ---- rug, table, tea set ----
  const T: V3 = [0.6, 0, 0.35];
  fluffyRug(k, T, 2.3, "#f8bdd0", "#fcd9e5", 1.15, 0.92);
  roundTable(k, T, 1.0, 0.8, "#ffe8a3", "#f7aac2");
  teapot(k, [T[0] + 0.15, 0.87, T[2] + 0.25], "#fffdf8", "#f47a9a", 1.55, -0.5);
  teacup(k, [T[0] - 0.55, 0.87, T[2] - 0.2], "#fffdf8", "#f8b9cb", 1.5, 0.4);
  teacup(k, [T[0] + 0.62, 0.87, T[2] - 0.3], "#fffdf8", "#c9b3f2", 1.5, 2.4);
  k.disc(0.22, 0.025, [T[0] - 0.02, 0.87, T[2] - 0.55], "#fffdf8", { key: "fine" });
  k.at(k.frame([T[0] - 0.02, 0.92, T[2] - 0.55], 0, 1.4), () => {
    macaron(k, [-0.07, 0, 0.02], "#bfe9d6");
    macaron(k, [0.07, 0, -0.02], "#f7a8c0");
    macaron(k, [0.0, 0, 0.09], "#ffe08a");
  });
  // bud vase
  k.lathe([[0, 0], [0.06, 0], [0.08, 0.08], [0.035, 0.18], [0.05, 0.22], [0, 0.22]], [T[0] - 0.35, 0.87, T[2] + 0.4], "#bfe9d6");
  flower(k, [T[0] - 0.35, 1.06, T[2] + 0.4], "rose", "#f47a9a", 0.14, "main");
  flower(k, [T[0] - 0.3, 1.06, T[2] + 0.38], "daisy", "#fffdf8", 0.1, "main");
  ctx.circle(T[0], T[2], 1.15);
  ctx.spot("table", T[0], 0.87, T[2]);
  ctx.spot("item_teacup", T[0] - 0.55, 0.87, T[2] - 0.2);

  // ---- armchair ----
  k.at(k.frame([-1.55, 0, 0.8], -PI / 2 + 0.35, 1.3), () => armchair(k, [0, 0, 0], 0, "#f7a8c4", "#fff3df", "#e57fa2"));
  ctx.box(-1.55, 0.8, 1.6, 1.6);
  ctx.spot("seat", -1.55, 0.7, 0.8);
  // little mint chair on the other side
  k.at(k.frame([2.55, 0, 0.75], PI / 2 + 0.25, 1.0), () => armchair(k, [0, 0, 0], 0, "#bfe9d6", "#fff3df", "#7fcaa8"));
  ctx.box(2.55, 0.75, 1.3, 1.3);

  // ---- mint pouf ----
  pouf(k, [1.75, 0, -1.25], 0.5, 0.55, "#bfe9d6", "#fff6e6");
  ctx.circle(1.75, -1.25, 0.52);

  // ---- yellow side table + tiered cake stand ----
  const S: V3 = [4.15, 0, 1.75];
  k.cyl(0.06, 0.55, 0.55, [S[0], 0.68, S[2]], "#ffe08a", { bevel: 0.03 });
  k.revolve(
    (a) => {
      const sc = Math.pow(Math.abs(Math.cos(a * 6)), 0.6);
      return [
        [0, 0.745],
        [0.5, 0.745],
        [0.58, 0.72],
        [0.6, 0.62 - sc * 0.06],
        [0.55, 0.62 - sc * 0.06],
        [0.4, 0.68],
      ];
    },
    [S[0], 0, S[2]],
    "#fff6e6",
    { segA: 36 },
  );
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.3;
    k.rod(0.68, 0.04, [S[0] + Math.cos(a) * 0.33, 0.34, S[2] + Math.sin(a) * 0.33], "#f5cf6b", { rot: [Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1] });
  }
  k.at(k.frame([S[0], 0.785, S[2]], 0, 1.3), () => cakeStand(k, [0, 0, 0]));
  ctx.circle(S[0], S[2], 0.65);
  ctx.spot("counter", S[0], 0.75, S[2]);
  ctx.spot("item_cake", S[0], 1.75, S[2]);
  ctx.box(3.55, Z1 - 0.34, 2.0, 0.7);
  ctx.spot("npc", 2.75, 0, 2.1);

  // ---- big trailing plant w/ heart pot (back-left corner) ----
  k.cyl(0.42, 0.34, 0.3, [-4.55, 0, 3.35], "#fff6e6", { bevel: 0.06 });
  pottedPlant(k, [-4.55, 0.42, 3.35], { kind: "trailing", potColor: "#f8b9cb", heart: "#f47a9a", size: 1.6, seed: 31 });
  ctx.circle(-4.55, 3.35, 0.5);
  // floor plant front-left
  pottedPlant(k, [4.5, 0, -3.3], { kind: "tall", potColor: "#c9b3f2", rim: "#e3d6fa", size: 1.6, seed: 12, heart: "#fffdf8" });
  ctx.circle(4.5, -3.3, 0.45);
  // ---- dresser hutch on the left wall with plates ----
  onLeft(k, -2.2, 0, () => {
    k.box(2.0, 1.0, 0.7, [0, 0.5, -0.36], "#fff6e6", { r: 0.1, bottom: "#f3e2cf" });
    k.box(2.1, 0.08, 0.78, [0, 1.04, -0.38], "#c9b3f2", { r: 0.04 });
    for (const s of [-1, 1]) {
      k.puff(roundRectPts(0.85, 0.72, 0.14), 0.05, [s * 0.47, 0.5, -0.74], "#efe6fd", { bevel: 0.02 });
      heart(k, [s * 0.12, 0.55, -0.81], 0.1, "#f47a9a", 0.04, { key: "fine" });
    }
    // upper hutch
    k.box(1.8, 1.25, 0.32, [0, 1.7, -0.17], "#fff6e6", { r: 0.08 });
    k.puff(archPts(1.95, 0.5, 12), 0.12, [0, 2.2, -0.2], "#c9b3f2", { bevel: 0.05 });
    heart(k, [0, 2.48, -0.3], 0.2, "#f7a8c4", 0.06);
    k.box(1.7, 0.05, 0.3, [0, 1.62, -0.2], "#f2d4ae", { r: 0.02 });
    // plates standing on rails
    const pc = ["#f8b9cb", "#bfe9d6", "#ffe08a", "#a8d8f0"];
    for (let i = 0; i < 4; i++) {
      k.puff(circlePts(0.17, 20), 0.035, [-0.6 + i * 0.4, 1.86, -0.18], "#fffdf8", { rot: [-0.15, 0, 0], bevel: 0.015 });
      k.puff(circlePts(0.1, 16), 0.02, [-0.6 + i * 0.4, 1.865, -0.26], pc[i], { rot: [-0.15, 0, 0], bevel: 0.008, key: "flat" });
    }
    for (let i = 0; i < 3; i++) teacup(k, [-0.45 + i * 0.45, 1.155, -0.4], "#fffdf8", pc[i], 1.3, 1.2);
  });
  ctx.box(X0 + 0.4, -2.2, 0.9, 2.1);

  // ---- pendant lamp (animated swing) ----
  const L: V3 = [0.6, 2.7, 0.35];
  const lampMat = uniqueMat(scene, "tea_lamp_glow", { emissive: "#ffd99a" }) as StandardMaterial;
  const lampBody = () => {
    k.revolve(
      (a) => {
        const sc = Math.pow(Math.abs(Math.cos(a * 6)), 0.5);
        return [
          [0.03, 0.45],
          [0.1, 0.44],
          [0.28, 0.25],
          [0.42, 0.02],
          [0.45 + sc * 0.03, -0.08 - sc * 0.08],
          [0.41, -0.06 - sc * 0.06],
          [0.36, 0.0],
          [0.1, 0.35],
        ];
      },
      [0, 0, 0],
      "#f8b0c6",
      { segA: 48 },
    );
    k.revolve(
      (a) => {
        const sc = Math.pow(Math.abs(Math.cos(a * 6)), 0.5);
        return [
          [0.4, 0.06],
          [0.435, 0.06],
          [0.47 + sc * 0.03, -0.08 - sc * 0.1],
          [0.44 + sc * 0.03, -0.1 - sc * 0.1],
          [0.38, 0.0],
        ];
      },
      [0, 0, 0],
      "#ffe08a",
      { segA: 48 },
    );
    k.ball(0.06, [0, 0.5, 0], "#ffe08a", { seg: 6 });
  };
  const lamp = k.anim(
    "tea_lamp",
    { outline: 0.03, castShadow: false },
    () => {
      cord(k, [L[0], L[1] + 0.6, L[2]], 6);
      k.at(k.frame(L, 0, 1.45), lampBody);
    },
    [L[0], L[1] + 6, L[2]],
  );
  const bulb = k.anim(
    "tea_bulb",
    { material: lampMat, outline: false, castShadow: false },
    () => {
      k.ball(0.2, [L[0], L[1] + 0.02, L[2]], "#fff6d8", { seg: 10 });
    },
    [L[0], L[1] + 6, L[2]],
  );

  // ---- hanging ivy from the crown (two animated garlands) ----
  const ivyBack = k.anim(
    "tea_ivy_back",
    { outline: 0.02 },
    () => {
      const xs = [-4.7, -4.2, -3.6, -2.9, -2.3, -0.95, 0.1, 1.9, 2.6, 4.7];
      xs.forEach((x, i) => ivyStrand(k, [x, WALL_H - 0.12, Z1 - 0.12], 0.5 + ((i * 37) % 9) * 0.13, 100 + i));
      for (let x = X0 + 0.3; x < 5.2; x += 0.55) bush(k, [x, WALL_H - 0.32, Z1 - 0.12], 0.32, Math.floor(x * 10 + 50), "main", undefined, 5, 3);
    },
    [0, WALL_H, Z1],
  );
  const ivyLeft = k.anim(
    "tea_ivy_left",
    { outline: 0.02 },
    () => {
      const zs = [3.3, 2.5, 1.9, 0.0, -0.8, -1.5, -2.6, -3.4];
      zs.forEach((z, i) => ivyStrand(k, [X0 + 0.12, WALL_H - 0.12, z], 0.45 + ((i * 53) % 7) * 0.14, 200 + i));
      for (let z = -4.1; z < Z1 - 0.2; z += 0.55) bush(k, [X0 + 0.12, WALL_H - 0.32, z], 0.32, Math.floor(z * 10 + 90), "main", undefined, 5, 3);
    },
    [X0, WALL_H, 0],
  );

  // ---- steam puffs from teapot spout ----
  const steamMat = uniqueMat(scene, "tea_steam", { emissive: "#fff8f0" }) as StandardMaterial;
  steamMat.alpha = 0.75;
  const steam: Mesh[] = [];
  const spout = new Vector3(T[0] + 0.15 + 0.4, 1.22, T[2] + 0.25 + 0.21);
  for (let i = 0; i < 3; i++) {
    const m = k.anim(`tea_steam${i}`, { material: steamMat, outline: false, castShadow: false }, () => {
      k.ball(0.06, [0, 0, 0], "#ffffff", { seg: 6 });
    });
    if (m) steam.push(m);
  }

  void ctx;
  return finishInterior(
    "teahouse",
    k,
    ctx,
    "#f7c7d8",
    (_dt, t) => {
      if (lamp) lamp.rotation.z = Math.sin(t * 0.8) * 0.012;
      if (bulb) bulb.rotation.z = Math.sin(t * 0.8) * 0.012;
      lampMat.emissiveColor.copyFrom(new Color3(1, 0.85, 0.6).scale(0.95 + Math.sin(t * 2.3) * 0.03 + Math.sin(t * 7.1) * 0.015));
      if (ivyBack) ivyBack.rotation.x = Math.sin(t * 0.9) * 0.012;
      if (ivyLeft) ivyLeft.rotation.z = Math.sin(t * 0.9 + 1.3) * 0.012;
      steam.forEach((m, i) => {
        const ph = (t * 0.45 + i / 3) % 1;
        m.position.set(spout.x + Math.sin(ph * 6 + i) * 0.05, spout.y + ph * 0.6, spout.z);
        m.scaling.setAll(0.4 + ph * 1.1 - ph * ph * 0.9 + 0.001);
        m.visibility = 1 - ph;
      });
    },
  );
}
