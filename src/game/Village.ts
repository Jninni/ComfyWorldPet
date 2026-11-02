import { TransformNode, Vector3, type Scene, type Mesh } from "@babylonjs/core";
import { Batch, ball, blob, softBox, softCyl, cone, torus, disc, lathe, scallopRug } from "../render/Shapes";
import { toonMat } from "../render/Toon";
import type { BuildableId } from "../data/items";
import type { Collider } from "../core/types";
import { rng } from "../render/Palette";

export interface BuiltThing {
  root: TransformNode;
  colliders: Collider[];
  update?: (dt: number, t: number) => void;
}

function tulip(b: Batch, scene: Scene, x: number, z: number, color: string, hgt = 0.55) {
  b.add(softCyl(scene, hgt, 0.025, 0.03, { pos: [x, 0, z], color: "leafDeep" }, 0.01, 6));
  b.add(blob(scene, 0.09, 0.05, 0.035, { pos: [x + 0.06, hgt * 0.45, z], rot: [0, 0, -0.7], color: "leaf" }, 6));
  b.add(blob(scene, 0.1, 0.13, 0.1, { pos: [x, hgt + 0.06, z], color }, 8));
}

function daisy(b: Batch, scene: Scene, x: number, z: number, hgt = 0.4, petal = "white") {
  b.add(softCyl(scene, hgt, 0.02, 0.025, { pos: [x, 0, z], color: "leafDeep" }, 0.01, 6));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(blob(scene, 0.07, 0.025, 0.04, { pos: [x + Math.cos(a) * 0.07, hgt, z + Math.sin(a) * 0.07], rot: [0, -a, 0], color: petal }, 6));
  }
  b.add(ball(scene, 0.045, { pos: [x, hgt + 0.02, z], color: "butterDeep" }, 6));
}

function bush(b: Batch, scene: Scene, x: number, z: number, s: number, rnd: () => number, berries = false) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd();
    const r = s * (0.45 + rnd() * 0.2);
    b.add(ball(scene, r, { pos: [x + Math.cos(a) * s * 0.35, r * 0.9, z + Math.sin(a) * s * 0.35], color: i % 2 ? "leaf" : "leafLight", bottom: "leafDeep" }, 9));
  }
  b.add(ball(scene, s * 0.6, { pos: [x, s * 0.95, z], color: "leafLight", bottom: "leaf" }, 9));
  if (berries)
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2,
        el = 0.2 + rnd() * 0.9;
      const r = s * 0.78;
      b.add(ball(scene, 0.09, { pos: [x + Math.cos(a) * Math.cos(el) * r, s * 0.7 + Math.sin(el) * r * 0.8, z + Math.sin(a) * Math.cos(el) * r], color: rnd() < 0.5 ? "red" : "rose" }, 6));
    }
}

/** Empty plot marker: soft dirt square, stakes with ribbon and a little sign. */
export function buildPlotMarker(scene: Scene, x: number, z: number): Mesh {
  const b = new Batch(scene, "plot");
  b.add(softBox(scene, 6, 0.12, 6, { pos: [x, 0.02, z], color: "#e8cfa6", bottom: "#d9b98a" }, 0.06));
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    b.add(softCyl(scene, 0.7, 0.07, 0.08, { pos: [x + sx * 2.8, 0, z + sz * 2.8], color: "woodLight", bottom: "wood" }, 0.03, 8));
    b.add(ball(scene, 0.12, { pos: [x + sx * 2.8, 0.75, z + sz * 2.8], color: "pink" }, 8));
  }
  // sign
  b.add(softCyl(scene, 1.0, 0.06, 0.07, { pos: [x, 0, z - 2.2], color: "woodDeep" }, 0.03, 8));
  b.add(softBox(scene, 1.1, 0.6, 0.12, { pos: [x, 1.05, z - 2.2], color: "woodLight", bottom: "wood" }, 0.08));
  b.add(blob(scene, 0.16, 0.14, 0.05, { pos: [x - 0.12, 1.08, z - 2.28], color: "pinkDeep" }, 8));
  b.add(blob(scene, 0.16, 0.14, 0.05, { pos: [x + 0.12, 1.08, z - 2.28], color: "pinkDeep" }, 8));
  return b.build({ outline: 0.035 })!;
}

export function buildBuildable(scene: Scene, id: BuildableId, x: number, z: number, seed = 1): BuiltThing {
  const root = new TransformNode("built_" + id, scene);
  root.position.set(x, 0, z);
  const b = new Batch(scene, id);
  const glow = new Batch(scene, id + "_glow");
  const rnd = rng(seed * 977 + id.length);
  const colliders: Collider[] = [];
  let update: BuiltThing["update"];
  // all geometry is built relative to (0,0) then parented
  switch (id) {
    case "garden": {
      b.add(softBox(scene, 4.6, 0.35, 3.2, { pos: [0, 0.17, 0], color: "woodLight", bottom: "woodDeep" }, 0.12));
      b.add(softBox(scene, 4.2, 0.1, 2.8, { pos: [0, 0.34, 0], color: "#b98a6a" }, 0.05));
      const cols = ["pink", "butter", "lavender", "coral", "sky", "pinkDeep"];
      for (let i = 0; i < 7; i++)
        for (let j = 0; j < 4; j++) {
          const px = -1.8 + i * 0.6 + (rnd() - 0.5) * 0.12,
            pz = -1.05 + j * 0.7 + (rnd() - 0.5) * 0.12;
          if ((i + j) % 3 === 0) daisy(b, scene, px, pz, 0.38 + 0.38);
          else tulip(b, scene, px, pz, cols[(i + j) % cols.length], 0.45 + 0.38);
        }
      colliders.push({ kind: "box", minX: x - 2.4, maxX: x + 2.4, minZ: z - 1.7, maxZ: z + 1.7 });
      break;
    }
    case "bench": {
      b.add(softBox(scene, 2.6, 0.16, 1.2, { pos: [0, 0.85, 0], color: "woodLight" }, 0.06));
      for (const s of [-1, 1]) {
        b.add(softBox(scene, 0.14, 0.85, 1.0, { pos: [s * 1.05, 0.42, 0], color: "wood" }, 0.05));
        b.add(softBox(scene, 2.6, 0.12, 0.42, { pos: [0, 0.48, s * 1.0], color: "woodLight", bottom: "wood" }, 0.05));
        b.add(softBox(scene, 0.12, 0.48, 0.12, { pos: [-1.1, 0.24, s * 1.0], color: "wood" }, 0.04));
        b.add(softBox(scene, 0.12, 0.48, 0.12, { pos: [1.1, 0.24, s * 1.0], color: "wood" }, 0.04));
      }
      // gingham cloth + picnic basket + pie
      b.add(softBox(scene, 1.4, 0.03, 1.25, { pos: [0, 0.95, 0], rot: [0, 0.3, 0], color: "#f7c6d3" }, 0.012));
      b.add(softCyl(scene, 0.12, 0.28, 0.25, { pos: [-0.4, 0.95, 0.1], color: "butterDeep" }, 0.05));
      b.add(softCyl(scene, 0.06, 0.32, 0.32, { pos: [-0.4, 0.95, 0.1], color: "white" }, 0.02));
      b.add(softBox(scene, 0.5, 0.3, 0.36, { pos: [0.5, 1.1, -0.1], color: "wood", bottom: "woodDeep" }, 0.08));
      b.add(torus(scene, 0.2, 0.05, { pos: [0.5, 1.28, -0.1], rot: [0, 0, Math.PI / 2], color: "woodDeep" }, 12));
      colliders.push({ kind: "box", minX: x - 1.4, maxX: x + 1.4, minZ: z - 1.3, maxZ: z + 1.3 });
      break;
    }
    case "lamp": {
      b.add(softCyl(scene, 0.25, 0.4, 0.45, { pos: [0, 0, 0], color: "stoneDeep", bottom: "stoneDark" }, 0.08));
      b.add(softCyl(scene, 3.0, 0.1, 0.13, { pos: [0, 0.2, 0], color: "#7c6a9a" }, 0.04, 10));
      b.add(torus(scene, 0.35, 0.06, { pos: [0.3, 2.6, 0], rot: [Math.PI / 2, 0, 0], color: "#7c6a9a" }, 14));
      b.add(cone(scene, 0.5, 0.48, { pos: [0, 3.55, 0], color: "lavenderDeep" }, 10));
      b.add(ball(scene, 0.12, { pos: [0, 4.08, 0], color: "butter" }, 8));
      glow.add(ball(scene, 0.38, { pos: [0, 3.35, 0], color: "#fff4c2" }, 12));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        b.add(softCyl(scene, 0.55, 0.03, 0.03, { pos: [Math.cos(a) * 0.36, 3.05, Math.sin(a) * 0.36], color: "#7c6a9a" }, 0.01, 6));
      }
      tulip(b, scene, 0.5, 0.2, "pink");
      tulip(b, scene, -0.4, 0.4, "butter");
      colliders.push({ kind: "circle", x, z, r: 0.5 });
      break;
    }
    case "berrypatch": {
      b.add(softBox(scene, 4.4, 0.25, 3, { pos: [0, 0.12, 0], color: "#c9a07a", bottom: "#b98a6a" }, 0.1));
      bush(b, scene, -1.3, 0, 0.75, rnd, true);
      bush(b, scene, 0.1, -0.3, 0.85, rnd, true);
      bush(b, scene, 1.4, 0.3, 0.7, rnd, true);
      b.add(softBox(scene, 0.5, 0.35, 0.4, { pos: [1.6, 0.35, -1.1], color: "wood", bottom: "woodDeep" }, 0.08));
      for (let i = 0; i < 5; i++) b.add(ball(scene, 0.08, { pos: [1.5 + rnd() * 0.25, 0.55, -1.15 + rnd() * 0.15], color: "red" }, 6));
      colliders.push({ kind: "box", minX: x - 2.2, maxX: x + 2.2, minZ: z - 1.5, maxZ: z + 1.5 });
      break;
    }
    case "swing": {
      // tree with swing
      b.add(lathe(scene, [[0, 0], [0.6, 0], [0.45, 0.3], [0.35, 2.2], [0.3, 3.6], [0, 3.6]], { pos: [-1.6, 0, 0.4], color: "woodDeep", bottom: "woodDark" }, 12));
      b.add(softCyl(scene, 2.6, 0.16, 0.2, { pos: [-1.6, 3.0, 0.4], rot: [0, 0, -Math.PI / 2], color: "woodDeep" }, 0.06, 10));
      for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2,
          r = 0.6 + rnd() * 1.1;
        b.add(ball(scene, 0.9 + rnd() * 0.5, { pos: [-1.6 + Math.cos(a) * r, 4.3 + rnd() * 1.1, 0.4 + Math.sin(a) * r], color: i % 3 ? "leaf" : "leafLight", bottom: "leafDeep" }, 10));
      }
      for (let i = 0; i < 6; i++) b.add(ball(scene, 0.12, { pos: [-1.6 + (rnd() - 0.5) * 2.6, 4.6 + rnd(), -0.7 - rnd() * 0.3], color: "pink" }, 6));
      const swing = new Batch(scene, "swingSeat");
      swing.add(softCyl(scene, 1.85, 0.025, 0.025, { pos: [-0.35, -1.85, 0], color: "cream" }, 0.01, 6));
      swing.add(softCyl(scene, 1.85, 0.025, 0.025, { pos: [0.35, -1.85, 0], color: "cream" }, 0.01, 6));
      swing.add(softBox(scene, 1.0, 0.12, 0.45, { pos: [0, -1.9, 0], color: "pink", bottom: "pinkDeep" }, 0.05));
      const seat = swing.build({ outline: 0.03 })!;
      const pivot = new TransformNode("swingPivot", scene);
      pivot.parent = root;
      pivot.position.set(0.2, 2.95, 0.4);
      seat.parent = pivot;
      update = (_dt, t) => {
        pivot.rotation.x = Math.sin(t * 1.6) * 0.35;
      };
      colliders.push({ kind: "circle", x: x - 1.6, z: z + 0.4, r: 0.6 });
      break;
    }
    case "cottage": {
      b.add(softBox(scene, 3.6, 2.4, 3.0, { pos: [0, 1.2, 0], color: "#ffe1ec", bottom: "#f6c3d4" }, 0.25));
      b.add(cone(scene, 1.9, 2.5, { pos: [0, 2.3, 0], scale: [1, 1, 0.9], color: "skyDeep", bottom: "#a8cdee" }, 4));
      b.add(scallopRug(scene, 2.3, 12, { pos: [0, 2.32, 0], color: "sky" }, 0.12));
      b.add(ball(scene, 0.18, { pos: [0, 4.25, 0], color: "butter" }, 8));
      // round door
      b.add(softBox(scene, 0.95, 1.4, 0.2, { pos: [0, 0.7, -1.45], color: "woodLight", bottom: "wood" }, 0.3));
      b.add(ball(scene, 0.07, { pos: [0.28, 0.75, -1.58], color: "butterDeep" }, 6));
      // heart window
      glow.add(blob(scene, 0.22, 0.2, 0.06, { pos: [-1.0, 1.55, -1.48], color: "#fff1b8" }, 8));
      glow.add(blob(scene, 0.22, 0.2, 0.06, { pos: [1.0, 1.55, -1.48], color: "#fff1b8" }, 8));
      b.add(torus(scene, 0.28, 0.06, { pos: [-1.0, 1.55, -1.5], rot: [Math.PI / 2, 0, 0], color: "white" }, 14));
      b.add(torus(scene, 0.28, 0.06, { pos: [1.0, 1.55, -1.5], rot: [Math.PI / 2, 0, 0], color: "white" }, 14));
      b.add(softBox(scene, 0.8, 0.22, 0.25, { pos: [-1.0, 1.15, -1.55], color: "wood" }, 0.06));
      b.add(softBox(scene, 0.8, 0.22, 0.25, { pos: [1.0, 1.15, -1.55], color: "wood" }, 0.06));
      for (let i = 0; i < 3; i++) {
        b.add(ball(scene, 0.09, { pos: [-1.25 + i * 0.25, 1.32, -1.58], color: "pinkDeep" }, 6));
        b.add(ball(scene, 0.09, { pos: [0.75 + i * 0.25, 1.32, -1.58], color: "butterDeep" }, 6));
      }
      b.add(scallopRug(scene, 0.6, 8, { pos: [0, 0.02, -2.0], color: "pink" }, 0.04));
      colliders.push({ kind: "box", minX: x - 1.85, maxX: x + 1.85, minZ: z - 1.55, maxZ: z + 1.55 });
      break;
    }
    case "mushroomhouse": {
      b.add(lathe(scene, [[0, 0], [1.25, 0], [1.3, 0.2], [1.15, 1.6], [1.05, 2.3], [0, 2.3]], { color: "cream", bottom: "#f3e2cc" }, 18));
      b.add(lathe(scene, [[0, 2.0], [2.4, 2.0], [2.5, 2.25], [2.2, 2.9], [1.4, 3.6], [0.4, 3.9], [0, 3.92]], { color: "#f7a3b8", bottom: "#ef8fab" }, 20));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3,
          r = i % 2 ? 1.5 : 2.0,
          y = i % 2 ? 3.35 : 2.75;
        b.add(blob(scene, 0.32, 0.12, 0.32, { pos: [Math.cos(a) * r, y, Math.sin(a) * r], rot: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], color: "white" }, 8));
      }
      b.add(softBox(scene, 0.8, 1.25, 0.2, { pos: [0, 0.62, -1.22], rot: [0.06, 0, 0], color: "#d9a3ff", bottom: "#b48ce6" }, 0.3));
      glow.add(ball(scene, 0.22, { pos: [0.75, 1.45, -0.98], scale: [1, 1, 0.4], color: "#fff1b8" }, 8));
      b.add(torus(scene, 0.25, 0.06, { pos: [0.75, 1.45, -1.02], rot: [Math.PI / 2, -0.6, 0], color: "woodLight" }, 12));
      for (let i = 0; i < 4; i++) b.add(disc(scene, 0.28, 0.08, { pos: [0, 0.03, -1.7 - i * 0.6], color: "stone" }, 10));
      colliders.push({ kind: "circle", x, z, r: 1.4 });
      break;
    }
    case "fountain": {
      b.add(lathe(scene, [[0, 0], [2.1, 0], [2.2, 0.15], [2.15, 0.7], [1.95, 0.75], [1.9, 0.3], [0, 0.3]], { color: "stone", bottom: "stoneDeep" }, 24));
      b.add(softCyl(scene, 1.4, 0.3, 0.4, { pos: [0, 0.3, 0], color: "stone", bottom: "stoneDeep" }, 0.08, 14));
      b.add(lathe(scene, [[0, 1.6], [1.0, 1.6], [1.05, 1.75], [0.95, 2.0], [0.2, 1.9], [0, 1.9]], { color: "lilac", bottom: "stone" }, 18));
      b.add(ball(scene, 0.32, { pos: [0, 2.25, 0], color: "pink" }, 10));
      const water = new Batch(scene, "fwater");
      water.add(disc(scene, 1.92, 0.05, { pos: [0, 0.58, 0], color: "#bfe7f8" }, 24));
      water.add(disc(scene, 0.9, 0.04, { pos: [0, 1.85, 0], color: "#bfe7f8" }, 18));
      const wm = water.build({ outline: false, emissive: "#3a5a6a", castShadow: false });
      if (wm) wm.parent = root;
      const bubbles: Mesh[] = [];
      for (let i = 0; i < 7; i++) {
        const bb = new Batch(scene, "bub");
        bb.add(ball(scene, 0.13 + rnd() * 0.1, { color: "#e8f7ff" }, 8));
        const m = bb.build({ outline: 0.015, emissive: "#5a7a8a", castShadow: false })!;
        m.parent = root;
        bubbles.push(m);
      }
      update = (_dt, t) => {
        bubbles.forEach((m, i) => {
          const k = (t * 0.35 + i / bubbles.length) % 1;
          const a = i * 2.4 + t * 0.3;
          m.position.set(Math.cos(a) * (0.3 + k * 0.9), 2.3 + k * 2.2, Math.sin(a) * (0.3 + k * 0.9));
          const s = k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15;
          m.scaling.setAll(Math.max(0.01, s));
        });
      };
      colliders.push({ kind: "circle", x, z, r: 2.2 });
      break;
    }
  }
  const m = b.build({ outline: 0.035 });
  if (m) m.parent = root;
  const g = glow.build({ outline: 0.02, emissive: "#ffe9a8", castShadow: false });
  if (g) g.parent = root;
  // little nudge so new things pop nicely: start scaled 0, the caller animates
  void Vector3;
  void toonMat;
  return { root, colliders, update };
}
