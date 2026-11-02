import { Vector3, Color3, type Scene, type Mesh, type StandardMaterial } from "@babylonjs/core";
import type { InteriorDef } from "../../core/types";
import { Kit, archPts, circlePts, roundRectPts, starPts, uniqueMat, type V3 } from "./kit";
import { RoomCtx, roomShell, finishInterior, makeRoot, onBack, onLeft, X0, Z1, WALL_H } from "./room";
import { PI, heart, star, ivyStrand, pottedPlant, bookRow, bookStack, mug, archWindow, pictureFrame, fluffyRug, cushion, cord, stool, tableLamp, heartDrawer, face, bush, BOOK_COLS } from "./props";

/** tall bookshelf against a wall; p = floor centre of its back */
export function bookshelf(k: Kit, p: V3, w: number, h: number, d: number, seed: number, o: { wood?: string; drawer?: string; knob?: string; rows?: number } = {}) {
  const wood = o.wood ?? "#e2b98c";
  const inner = "#c99a6b";
  const [x, y, z] = p;
  const rows = o.rows ?? 4;
  k.box(w, h, 0.06, [x, y + h / 2, z - 0.03], inner, { r: 0.02 });
  for (const s of [-1, 1]) k.box(0.12, h, d, [x + s * (w / 2 - 0.06), y + h / 2, z - d / 2], wood, { r: 0.05 });
  // crown + base
  k.box(w + 0.16, 0.14, d + 0.08, [x, y + h + 0.07, z - d / 2], wood, { r: 0.06 });
  k.puff(archPts(w * 0.55, 0.32, 12), 0.08, [x, y + h + 0.1, z - d + 0.06], wood, { bevel: 0.035 });
  heart(k, [x, y + h + 0.28, z - d + 0.0], 0.16, "#f7a8c4", 0.05);
  // drawers row
  const dh = 0.6;
  k.box(w - 0.1, dh, d - 0.04, [x, y + dh / 2, z - d / 2 - 0.02], wood, { r: 0.04 });
  const nd = 3;
  for (let i = 0; i < nd; i++) {
    const dw = (w - 0.3) / nd;
    heartDrawer(k, [x - (w - 0.3) / 2 + dw * (i + 0.5), y + dh / 2, z - d - 0.02], dw - 0.08, dh - 0.16, o.drawer ?? "#f9d9e6", o.knob ?? "#f47a9a");
  }
  // shelves + books
  const inH = (h - dh - 0.1) / rows;
  for (let r = 0; r < rows; r++) {
    const sy = y + dh + r * inH;
    k.box(w - 0.12, 0.07, d - 0.04, [x, sy + 0.035, z - d / 2], wood, { r: 0.025 });
    const fillTo = r % 2 === 0 ? w - 0.3 : (w - 0.3) * 0.68;
    bookRow(k, [x - (w - 0.3) / 2, sy + 0.07 + 0.035, z - d / 2 + 0.02], fillTo, inH - 0.16, d - 0.14, seed + r * 7);
    if (r % 2 === 1) {
      // a little ornament in the gap
      const gx = x - (w - 0.3) / 2 + fillTo + ((w - 0.3) - fillTo) / 2;
      if (r === 1) {
        k.lathe([[0, 0], [0.1, 0], [0.12, 0.12], [0.07, 0.22], [0, 0.22]], [gx, sy + 0.105, z - d / 2], "#bfe9d6");
        star(k, [gx, sy + 0.42, z - d / 2], 0.22, "#ffe066", 0.07);
      } else {
        bookStack(k, [gx, sy + 0.105, z - d / 2], 3, seed + 99, 0.8);
      }
    }
  }
  k.box(w - 0.12, 0.07, d - 0.04, [x, y + h - 0.035, z - d / 2], wood, { r: 0.025 });
}

/** squishy beanbag */
export function beanbag(k: Kit, p: V3, r: number, color: string, rotY = 0) {
  k.at(k.frame(p, rotY), () => {
    k.revolve(
      (a) => {
        const back = Math.max(0, Math.sin(a)) * 0.35; // raised back (toward +z)
        const w = 1 + 0.05 * Math.cos(a * 5);
        return [
          [0, 0],
          [r * 0.85 * w, 0],
          [r * w, r * 0.25],
          [r * 0.95 * w, r * (0.55 + back * 0.6)],
          [r * 0.7 * w, r * (0.75 + back)],
          [r * 0.35, r * (0.6 + back * 0.5)],
          [0, r * 0.5],
        ];
      },
      [0, 0, 0],
      color,
      { segA: 36, bottom: "#a993dc" },
    );
  });
}

export function buildLibrary(scene: Scene, origin: Vector3): InteriorDef {
  const root = makeRoot(scene, "library", origin);
  const k = new Kit(scene, root);
  const ctx = new RoomCtx(origin);

  roomShell(k, {
    wall: "#b5daf4",
    wallTop: "#cfe8fa",
    wainscot: "#d8ccf7",
    wainscotH: 0.95,
    rail: "#fffdf8",
    border: "#c7b3f1",
    borderDeep: "#9f86d8",
    crown: "#fffdf8",
    floor: "wood",
    floorA: "#efcfa6",
    floorB: "#e6c195",
    motif: "stars",
    motifColor: "#e6f4ff",
    mat: "#c9b3f2",
    matAccent: "#fff6e6",
    seed: 33,
  });

  // ---- big bookshelf (back right) ----
  bookshelf(k, [2.35, 0, Z1], 3.4, 3.25, 0.6, 5);
  ctx.box(2.35, Z1 - 0.32, 3.5, 0.7);
  // trailing ivy plant on top of shelf
  pottedPlant(k, [1.3, 3.32, Z1 - 0.3], { kind: "trailing", potColor: "#fff6e6", rim: "#bfe9d6", size: 1.1, seed: 44 });
  pottedPlant(k, [3.5, 3.32, Z1 - 0.3], { kind: "bush", potColor: "#f8b9cb", size: 0.9, seed: 45 });
  for (let i = 0; i < 4; i++) ivyStrand(k, [0.75 + i * 0.32, 3.36, Z1 - 0.62], 0.5 + (i % 2) * 0.4, 300 + i);
  // ladder leaning on the shelf
  k.at(k.frame([3.75, 0, Z1 - 1.05], [-0.28, 0, 0]), () => {
    for (const s of [-1, 1]) k.box(0.08, 3.1, 0.08, [s * 0.32, 1.55, 0], "#c99a6b", { r: 0.03 });
    for (let i = 0; i < 7; i++) k.rod(0.64, 0.03, [0, 0.35 + i * 0.4, 0], "#e2b98c", { rot: [0, 0, PI / 2] });
  });

  // ---- arched window with hills (back left) ----
  onBack(k, -2.2, 1.15, () => archWindow(k, [0, 0, 0], 1.7, 2.15, { frame: "#fffdf8", view: "hills", curtains: "#f9d9e6" }));
  onBack(k, -2.2, 1.15, () => {
    pottedPlant(k, [-0.55, 0.04, -0.15], { kind: "snake", potColor: "#c9b3f2", size: 0.55, seed: 3 });
    bookStack(k, [0.5, 0.04, -0.14], 2, 8, 0.6);
  });

  // ---- left wall: round clock, picture, shelf w/ globe ----
  onLeft(k, 1.8, 2.45, () => {
    k.puff(circlePts(0.42, 28), 0.12, [0, 0, -0.04], "#fff6e6", { bevel: 0.05 });
    k.torus(0.42, 0.08, [0, 0, -0.08], "#e2b98c", { rot: [PI / 2, 0, 0], seg: 28 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      k.ball(0.025, [Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.155], "#6d5a78", { key: "flat", seg: 4 });
    }
    k.box(0.04, 0.22, 0.02, [0, 0.09, -0.17], "#4a3a52", { key: "flat", r: 0.01, steps: 1 });
    k.box(0.16, 0.035, 0.02, [0.07, 0, -0.175], "#4a3a52", { key: "flat", r: 0.01, steps: 1 });
    k.ball(0.04, [0, 0, -0.18], "#f47a9a", { seg: 6 });
  });
  onLeft(k, -0.6, 2.35, () => pictureFrame(k, [0, 0, 0], 0.85, 1.0, "#ffe08a", "#e6f4ff", () => {
    k.puff(circlePts(0.2, 18), 0.03, [0, -0.08, 0], "#a6dc8c", { bevel: 0.01, key: "fine" });
    star(k, [0.05, 0.14, 0], 0.16, "#ffe066", 0.03, { key: "fine" });
  }));
  // low wall shelf with globe and books
  onLeft(k, -2.6, 1.5, () => {
    k.box(1.5, 0.07, 0.42, [0, -0.035, -0.21], "#e2b98c", { r: 0.03 });
    bookRow(k, [-0.65, 0.035, -0.22], 0.6, 0.34, 0.26, 17);
    k.lathe([[0, 0], [0.12, 0], [0.1, 0.03], [0.03, 0.06], [0.03, 0.1], [0, 0.1]], [0.35, 0.035, -0.22], "#c99a6b");
    k.ball(0.17, [0.35, 0.29, -0.22], "#9fd7f0", { seg: 10 });
    k.blob(0.1, 0.08, 0.06, [0.33, 0.33, -0.36], "#a6dc8c", { seg: 6 });
    k.torus(0.2, 0.025, [0.35, 0.29, -0.22], "#e2b98c", { rot: [0, 0, 0.4], seg: 18 });
  });

  // ---- stool + yellow lamp (back left corner) ----
  stool(k, [-4.45, 0, 2.9], 0.62, "#ffe08a", "#e2b98c", 0.32);
  tableLamp(k, [-4.45, 0.66, 2.9], "#ffe066", "#fff6e6", 1.5, "glowSoft");
  ctx.circle(-4.45, 2.9, 0.42);

  // ---- beanbag + star pillow ----
  beanbag(k, [-3.2, 0, 1.3], 1.2, "#cdb9f0", -0.5);
  k.at(k.frame([-3.05, 1.08, 1.55], [-0.3, -0.5, 0.1]), () => {
    k.puff(starPts(0.55, 0.3, 5, 50), 0.26, [0, 0, 0], "#ffe066", { bevel: 0.12, bulge: 0.06 });
    face(k, [0, 0.0, -0.24], 2.0);
  });
  ctx.circle(-3.2, 1.3, 1.2);
  ctx.spot("seat", -3.2, 0.6, 1.3);

  // ---- book stack + heart mug ----
  const topY = bookStack(k, [-1.0, 0, 2.6], 5, 21, 1.7);
  k.at(k.frame([-1.0, topY + 0.035, 2.6], 0, 1.6), () => mug(k, [0, 0, 0], "#fffdf8", "#f47a9a", -0.6));
  bookStack(k, [-0.3, 0, 3.25], 3, 23, 1.6);
  ctx.circle(-0.85, 2.8, 0.55);
  ctx.spot("item_mug", -1.0, topY, 2.6);

  // ---- cream rug + cat cushion ----
  const R: V3 = [-0.3, 0, -0.35];
  fluffyRug(k, R, 1.9, "#fff3df", "#fffaf0", 1.2, 0.92);
  cushion(k, [R[0] + 0.15, 0.1, R[2] + 0.1], 0.95, 0.85, 0.2, "#f9d9e6", [0, 0.3, 0]);
  ctx.spot("cat", R[0] + 0.15, 0.3, R[2] + 0.1);
  ctx.spot("rug", R[0], 0.07, R[2]);
  // a ball of yarn toy nearby
  k.ball(0.14, [R[0] + 1.1, 0.2, R[2] - 0.5], "#f7a8c4", { seg: 8 });
  k.torus(0.13, 0.025, [R[0] + 1.1, 0.2, R[2] - 0.5], "#ef8fab", { rot: [0.6, 0, 0.3], seg: 14 });

  // ---- Professor's reading desk (front right) ----
  const D: V3 = [3.4, 0, 0.55];
  k.box(1.7, 0.1, 0.9, [D[0], 0.86, D[2]], "#e2b98c", { r: 0.05 });
  k.box(1.5, 0.75, 0.7, [D[0], 0.42, D[2] + 0.05], "#d4a77a", { r: 0.08 });
  heartDrawer(k, [D[0], 0.55, D[2] - 0.31], 0.7, 0.3, "#c8e6f8", "#f47a9a");
  // open book
  k.at(k.frame([D[0] - 0.2, 0.95, D[2] - 0.05], [0, 0.15, 0]), () => {
    for (const s of [-1, 1]) k.box(0.32, 0.03, 0.42, [s * 0.17, 0.02, 0], "#fffdf8", { rot: [0, 0, s * -0.12], r: 0.012, key: "fine" });
    k.box(0.72, 0.02, 0.46, [0, -0.005, 0], "#ef8fab", { r: 0.01, key: "fine" });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) k.box(0.22, 0.01, 0.025, [s * 0.17, 0.06, 0.12 - i * 0.08], "#b5daf4", { key: "flat", r: 0.005, steps: 1, rot: [0, 0, s * -0.12] });
  });
  // quill pot + candle
  k.cyl(0.14, 0.07, 0.08, [D[0] + 0.45, 0.95, D[2] + 0.15], "#a8d8f0");
  k.blob(0.05, 0.2, 0.02, [D[0] + 0.5, 1.22, D[2] + 0.15], "#fffdf8", { rot: [0, 0, -0.3], seg: 6 });
  bookStack(k, [D[0] + 0.45, 0.95, D[2] - 0.2], 2, 51, 0.7);
  ctx.box(D[0], D[2], 1.8, 1.0);
  ctx.spot("counter", D[0], 0.95, D[2]);
  ctx.spot("npc", D[0] + 0.1, 0, D[2] + 0.95);
  ctx.spot("item_book", D[0] - 0.2, 0.95, D[2] - 0.05);

  // ---- floor plants ----
  pottedPlant(k, [-4.5, 0, -2.4], { kind: "fern", potColor: "#bfe9d6", size: 1.6, seed: 61, heart: "#fffdf8" });
  ctx.circle(-4.5, -2.4, 0.4);
  pottedPlant(k, [4.6, 0, -3.0], { kind: "bush", potColor: "#c9b3f2", size: 1.4, seed: 62 });
  ctx.circle(4.6, -3.0, 0.4);
  // garland of tiny books/flags along the crown
  for (let x = X0 + 0.5; x < 5.0; x += 0.55) {
    const c = BOOK_COLS[Math.floor((x + 6) * 3) % BOOK_COLS.length];
    k.puff(
      [
        [-0.13, 0],
        [0.13, 0],
        [0, -0.26],
      ],
      0.03,
      [x, WALL_H - 0.5 - Math.sin(((x - X0) / 0.55) * 0.5) * 0.02, Z1 - 0.1],
      c,
      { bevel: 0.012, key: "fine" },
    );
  }
  k.tube(
    Array.from({ length: 12 }, (_, i) => [X0 + 0.3 + i * 0.93, WALL_H - 0.48, Z1 - 0.09] as V3),
    0.012,
    "#fffdf8",
    { key: "fine" },
  );

  // ---- hanging stars (each spins) ----
  const starMat = uniqueMat(scene, "lib_star_glow", { emissive: "#3a3018" });
  const stars: Mesh[] = [];
  const SP: V3[] = [
    [-3.6, 2.55, 3.0],
    [-1.0, 2.85, 1.8],
    [0.4, 2.35, 3.0],
    [-2.3, 3.0, 0.2],
    [1.4, 2.7, 0.9],
  ];
  SP.forEach((sp, i) => {
    cord(k, [sp[0], sp[1] + 0.2, sp[2]], 4, "#fffdf8");
    const m = k.anim(
      `lib_star${i}`,
      { material: starMat, outline: 0.03, castShadow: true },
      () => {
        star(k, sp, 0.36 + (i % 2) * 0.1, i % 3 === 1 ? "#fff3a8" : "#ffe066", 0.12);
      },
      sp,
    );
    if (m) stars.push(m);
  });

  // ---- lamp glow pulse ----
  const lampMat = uniqueMat(scene, "lib_lamp", { emissive: "#6e5e4c" }) as StandardMaterial;
  void lampMat;

  return finishInterior(
    "library",
    k,
    ctx,
    "#cfe0fb",
    (_dt, t) => {
      stars.forEach((m, i) => {
        m.rotation.y = Math.sin(t * 0.6 + i * 1.7) * 0.6;
        m.position.y = Math.sin(t * 1.1 + i) * 0.03;
      });
    },
    "#fff3e2",
  );
}
