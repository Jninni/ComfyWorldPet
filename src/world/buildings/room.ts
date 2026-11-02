/**
 * Diorama room shell: thick sticker-border floor slab, back (+Z) and left (-X) walls,
 * wainscot, baseboards, crown scallops, wallpaper motifs and a fat pastel rim.
 * Local coordinates: floor top at y=0, walkable approx x∈[-5,5], z∈[-4,4].
 */
import { Vector3, TransformNode, type Scene } from "@babylonjs/core";
import type { Collider, InteriorDef, CameraFrame } from "../../core/types";
import type { StageLighting } from "../../render/Stage";
import { Kit, circlePts, heartPts, starPts, scallopPts, roundRectPts, type V3 } from "./kit";
import { jitterCol, mixCol, rng, col } from "../../render/Palette";
import type { ColorLike } from "../../render/Shapes";
import { doormat } from "./props";

export const X0 = -5.3; // left wall inner face
export const X1 = 5.35; // right floor edge
export const Z0 = -4.35; // front floor edge
export const Z1 = 4.0; // back wall inner face
export const WALL_H = 3.7;

export interface RoomStyle {
  wall: ColorLike;
  wallTop?: ColorLike;
  wainscot?: ColorLike;
  wainscotH?: number;
  rail?: ColorLike;
  base?: ColorLike;
  border: ColorLike;
  borderDeep: ColorLike;
  crown?: ColorLike;
  floor: "wood" | "tile" | "check";
  floorA: ColorLike;
  floorB: ColorLike;
  floorGap?: ColorLike;
  motif?: "dots" | "hearts" | "stars" | "stripes" | "diamonds" | "flowers" | "none";
  motifColor?: ColorLike;
  mat: ColorLike;
  matAccent: ColorLike;
  seed?: number;
}

export function onBack(k: Kit, x: number, y: number, fn: () => void, out = 0) {
  k.at(k.frame([x, y, Z1 - out], 0), fn);
}
export function onLeft(k: Kit, z: number, y: number, fn: () => void, out = 0) {
  k.at(k.frame([X0 + out, y, z], -Math.PI / 2), fn);
}

export function roomShell(k: Kit, st: RoomStyle) {
  const r = rng(st.seed ?? 11);
  const W = X1 - X0;
  const D = Z1 - Z0;
  const cxW = (X0 + X1) / 2;
  const T = 0.42; // wall thickness

  // ---------- slab (sticker border) ----------
  const sx0 = X0 - T - 0.12,
    sx1 = X1 + 0.22,
    sz0 = Z0 - 0.22,
    sz1 = Z1 + T + 0.12;
  k.box(sx1 - sx0, 0.6, sz1 - sz0, [(sx0 + sx1) / 2, -0.4, (sz0 + sz1) / 2], st.border, { key: "shell", r: 0.26, steps: 3, bottom: st.borderDeep });
  // under-slab gap colour (so plank gaps read)
  k.box(W, 0.04, D, [cxW, -0.07, (Z0 + Z1) / 2], st.floorGap ?? mixCol(st.floorB as string, "#6b4a3a", 0.35), { key: "floor", r: 0.02, steps: 1 });

  // ---------- floor ----------
  if (st.floor === "wood") {
    const pw = 0.5;
    const n = Math.ceil(W / pw);
    for (let i = 0; i < n; i++) {
      const x0 = X0 + i * pw;
      const w = Math.min(pw, X1 - x0);
      // planks broken into 2 lengths, staggered
      const split = Z0 + D * (0.3 + r() * 0.4);
      for (const [a, b] of [
        [Z0, split],
        [split, Z1],
      ]) {
        const c = jitterCol(i % 2 ? st.floorA : st.floorB, 0.025, r);
        k.plainBox(w - 0.035, 0.1, b - a - 0.035, [x0 + w / 2, -0.05, (a + b) / 2], c);
      }
    }
  } else {
    const ts = st.floor === "tile" ? 0.72 : 0.9;
    const nx = Math.ceil(W / ts),
      nz = Math.ceil(D / ts);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x0 = X0 + i * ts,
          z0 = Z0 + j * ts;
        const w = Math.min(ts, X1 - x0),
          d = Math.min(ts, Z1 - z0);
        const c = jitterCol((i + j) % 2 ? st.floorA : st.floorB, 0.015, r);
        k.plainBox(w - 0.05, 0.1, d - 0.05, [x0 + w / 2, -0.05, z0 + d / 2], c);
      }
  }

  // ---------- walls ----------
  const H = WALL_H;
  const wallTop = st.wallTop ?? mixCol(st.wall as string, "#ffffff", 0.18);
  // back wall
  k.box(W + T + 0.1, H, T, [cxW - T / 2 + 0.05, H / 2, Z1 + T / 2], wallTop, { key: "wall", r: 0.06, bottom: st.wall });
  // left wall
  k.box(T, H, D + 0.1, [X0 - T / 2, H / 2, (Z0 + Z1) / 2 - 0.05], wallTop, { key: "wall", r: 0.06, bottom: st.wall });

  // wainscot + rail + baseboard
  const wh = st.wainscotH ?? 1.0;
  if (st.wainscot) {
    k.box(W, wh, 0.06, [cxW, wh / 2, Z1 - 0.03], st.wainscot, { key: "wall", r: 0.02, steps: 1 });
    k.box(0.06, wh, D, [X0 + 0.03, wh / 2, (Z0 + Z1) / 2], st.wainscot, { key: "wall", r: 0.02, steps: 1 });
    // vertical panel grooves
    for (let x = X0 + 0.7; x < X1 - 0.2; x += 0.7) k.box(0.035, wh - 0.3, 0.03, [x, wh / 2 + 0.05, Z1 - 0.07], mixCol(st.wainscot as string, "#ffffff", 0.35), { key: "flat", r: 0.012, steps: 1 });
    for (let z = Z0 + 0.6; z < Z1 - 0.2; z += 0.7) k.box(0.03, wh - 0.3, 0.035, [X0 + 0.07, wh / 2 + 0.05, z], mixCol(st.wainscot as string, "#ffffff", 0.35), { key: "flat", r: 0.012, steps: 1 });
  }
  const rail = st.rail ?? "white";
  k.capsule(W, 0.055, [cxW, wh, Z1 - 0.07], rail, { rot: [0, 0, Math.PI / 2], key: "shell" });
  k.capsule(D, 0.055, [X0 + 0.07, wh, (Z0 + Z1) / 2], rail, { rot: [Math.PI / 2, 0, 0], key: "shell" });
  const base = st.base ?? "white";
  k.box(W, 0.16, 0.08, [cxW, 0.08, Z1 - 0.07], base, { key: "shell", r: 0.03 });
  k.box(0.08, 0.16, D, [X0 + 0.07, 0.08, (Z0 + Z1) / 2], base, { key: "shell", r: 0.03 });

  // ---------- motif wallpaper ----------
  const motif = st.motif ?? "dots";
  const mc = st.motifColor ?? mixCol(st.wall as string, "#ffffff", 0.45);
  if (motif !== "none") {
    const y0 = wh + 0.35,
      y1 = H - 0.55;
    const sp = 0.62;
    const stamp = (fn: () => void) => fn();
    let row = 0;
    for (let y = y0; y < y1; y += sp * 0.8, row++) {
      const off = row % 2 ? sp / 2 : 0;
      for (let x = X0 + 0.35 + off; x < X1 - 0.15; x += sp) stamp(() => motifAt(k, motif, [x, y, Z1 - 0.004], 0, mc));
      for (let z = Z0 + 0.35 + off; z < Z1 - 0.2; z += sp) stamp(() => motifAt(k, motif, [X0 + 0.004, y, z], -Math.PI / 2, mc));
    }
  }

  // ---------- crown scallops ----------
  const crown = st.crown ?? st.border;
  const nB = Math.round(W / 0.36);
  k.at(k.frame([cxW, H - 0.22, Z1 - 0.01], 0), () => {
    k.puff(scallopPts(W, 0.16, nB, 5), 0.08, [0, 0, 0], crown, { key: "shell", bevel: 0.035, spine: [[-W / 2, 0.06], [W / 2, 0.06]] });
  });
  const nL = Math.round(D / 0.36);
  k.at(k.frame([X0 + 0.01, H - 0.22, (Z0 + Z1) / 2], -Math.PI / 2), () => {
    k.puff(scallopPts(D, 0.16, nL, 5), 0.08, [0, 0, 0], crown, { key: "shell", bevel: 0.035, spine: [[-D / 2, 0.06], [D / 2, 0.06]] });
  });

  // ---------- fat pastel rim (top + exposed ends) ----------
  const rimT = 0.36;
  k.box(W + T + 0.34, rimT, T + 0.3, [cxW - T / 2 + 0.05, H + rimT / 2 - 0.05, Z1 + T / 2], st.border, { key: "shell", r: 0.16, steps: 3 });
  k.box(T + 0.3, rimT, D + T + 0.1, [X0 - T / 2, H + rimT / 2 - 0.05, (Z0 + Z1) / 2 + T / 2 - 0.05], st.border, { key: "shell", r: 0.16, steps: 3 });
  // right end post of back wall
  k.box(0.34, H + 0.1, T + 0.3, [X1 + 0.08, H / 2 - 0.03, Z1 + T / 2], st.border, { key: "shell", r: 0.15, steps: 3, bottom: st.borderDeep });
  // front end post of left wall
  k.box(T + 0.3, H + 0.1, 0.34, [X0 - T / 2, H / 2 - 0.03, Z0 - 0.06], st.border, { key: "shell", r: 0.15, steps: 3, bottom: st.borderDeep });

  // ---------- doormat (exit) ----------
  doormat(k, [0, 0, Z0 + 0.62], st.mat, st.matAccent);
}

function motifAt(k: Kit, m: NonNullable<RoomStyle["motif"]>, p: V3, rotY: number, c: ColorLike) {
  k.at(k.frame(p, rotY), () => {
    switch (m) {
      case "dots":
        k.decal(circlePts(0.05, 10), [0, 0, 0], c);
        break;
      case "hearts":
        k.decal(heartPts(0.13, 16), [0, 0, 0], c);
        break;
      case "stars":
        k.decal(starPts(0.08, 0.04, 5, 20), [0, 0, 0], c);
        break;
      case "diamonds":
        k.decal(
          [
            [0, 0.08],
            [0.055, 0],
            [0, -0.08],
            [-0.055, 0],
          ],
          [0, 0, 0],
          c,
        );
        break;
      case "flowers":
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          k.decal(circlePts(0.035, 8), [Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0], c);
        }
        k.decal(circlePts(0.03, 8), [0, 0, -0.004], "#fff3c4");
        break;
      case "stripes":
        k.decal(roundRectPts(0.12, 0.5, 0.05, 2), [0, 0, 0], c);
        break;
    }
  });
}

/* ------------------------------------------------------------------ */
/* InteriorDef assembly                                                  */
/* ------------------------------------------------------------------ */

export class RoomCtx {
  colliders: Collider[] = [];
  spots: Record<string, Vector3> = {};
  constructor(public origin: Vector3) {}
  w(x: number, y: number, z: number) {
    return new Vector3(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }
  /** collider box from local centre + size */
  box(cx: number, cz: number, w: number, d: number) {
    const o = this.origin;
    this.colliders.push({ kind: "box", minX: o.x + cx - w / 2, maxX: o.x + cx + w / 2, minZ: o.z + cz - d / 2, maxZ: o.z + cz + d / 2 });
  }
  circle(cx: number, cz: number, r: number) {
    this.colliders.push({ kind: "circle", x: this.origin.x + cx, z: this.origin.z + cz, r });
  }
  spot(name: string, x: number, y: number, z: number) {
    this.spots[name] = this.w(x, y, z);
  }
}

export function roomLighting(clear: ColorLike, tint: ColorLike = "#fff1de", bright = 1): StageLighting {
  const c = col(clear).toHexString();
  return {
    sky: "#fff8f0",
    ground: mixCol(tint as string, "#c9a98c", 0.45).toHexString(),
    hemi: 0.68 * bright,
    sun: col(tint).toHexString(),
    sunI: 0.88 * bright,
    sunDir: [0.42, -1, 0.62],
    fog: c,
    fogDensity: 0,
    clear: c,
    skyTop: mixCol(c, "#ffffff", 0.15).toHexString(),
    skyHorizon: mixCol(c, "#ffffff", 0.35).toHexString(),
  };
}

export function roomCamera(origin: Vector3): CameraFrame {
  return {
    alpha: -Math.PI / 2 + 0.3,
    beta: 1.0,
    radius: 18.2,
    target: new Vector3(origin.x + 0.2, origin.y + 1.0, origin.z - 0.1),
  };
}

export function makeRoot(scene: Scene, id: string, origin: Vector3) {
  const root = new TransformNode(`interior_${id}`, scene);
  root.position.copyFrom(origin);
  return root;
}

export function finishInterior(id: string, k: Kit, ctx: RoomCtx, clear: ColorLike, update?: (dt: number, t: number) => void, tint?: ColorLike, bright = 1): InteriorDef {
  k.build();
  const o = ctx.origin;
  if (!ctx.spots.npc) ctx.spot("npc", 2, 0, 1.5);
  if (!ctx.spots.center) ctx.spot("center", 0, 0, 0);
  return {
    id,
    root: k.root,
    bounds: { minX: o.x + X0 + 0.4, maxX: o.x + X1 - 0.35, minZ: o.z + Z0 + 0.3, maxZ: o.z + Z1 - 0.4 },
    colliders: ctx.colliders,
    spawn: ctx.w(0, 0, Z0 + 1.7),
    exit: { pos: ctx.w(0, 0, Z0 + 0.55), radius: 0.55 },
    spots: ctx.spots,
    camera: roomCamera(o),
    lighting: roomLighting(clear, tint, bright),
    update,
  };
}
