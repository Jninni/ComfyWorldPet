/**
 * Crystal Cave — explorable multi-chamber interior (~37 x 32 m), follow camera.
 *
 * Layout (local, +Z = north / away from camera):
 *   entrance tunnel (south) → entry chamber ─┬─ west corridor → Crystal Garden ─┐
 *                                            └─ east corridor → Mushroom Grotto ─┤
 *   both side chambers lead into the central Pool Hall (underground pool, wooden bridge)
 *   north of the pool: Treasure Nook (NW) and a cosy lantern nook (NE, "npc").
 *
 * Built in WORLD coordinates (origin added); all meshes are parented to `root` (identity transform).
 * Two PointLights (pool + garden) are parented to `root`, so `root.setEnabled(false)` turns them off.
 */
import { Mesh, MeshBuilder, PointLight, TransformNode, Vector3, VertexBuffer, Color3, type Scene } from "@babylonjs/core";
import { Batch, finishMesh, lathe, scallopRug } from "../render/Shapes";
import { col, mixCol, jitterCol, rng } from "../render/Palette";
import { toonMat } from "../render/Toon";
import type { StageLighting } from "../render/Stage";
import type { Collider, InteriorDef } from "../core/types";
import { elb, addCrystal, addGlowShroom, addBridge, addRock, addLilyPad, addMushroom, addFlowerPatch, makeMotes, linkBatches, petals } from "./props";

export const CAVE_LIGHT: StageLighting = {
  sky: "#b3a3ea",
  ground: "#4a3866",
  hemi: 0.66,
  sun: "#c4cdff",
  sunI: 0.55,
  sunDir: [-0.35, -1, 0.55],
  fog: "#2c2040",
  fogDensity: 0.011,
  clear: "#1f1630",
  skyTop: "#1f1630",
  skyHorizon: "#2c2040",
};

type Shape = { x1: number; z1: number; x2: number; z2: number; r: number };
const cap = (x1: number, z1: number, x2: number, z2: number, r: number): Shape => ({ x1, z1, x2, z2, r });
const circ = (x: number, z: number, r: number): Shape => ({ x1: x, z1: z, x2: x, z2: z, r });

/** Walkable floor as a union of circles / capsules (local coords). */
const SHAPES: Shape[] = [
  cap(0, -15, 0, -10, 2.2), // entrance tunnel
  circ(0, -9.6, 4.2), // entry chamber
  cap(-2.5, -8.6, -9.5, -5.2, 2.3), // west corridor
  circ(-12, -3, 5.2), // crystal garden
  circ(-14.4, 2.6, 3.4),
  cap(2.5, -8.6, 9.5, -6.2, 2.2), // east corridor
  circ(12, -4, 4.8), // mushroom grotto
  circ(15, 1.5, 3.2),
  cap(-9.5, -0.5, -4.5, 1.6, 2.2), // garden → hall
  cap(9.5, -0.5, 4.5, 1.6, 2.2), // grotto → hall
  circ(0, 3, 6.3), // pool hall
  cap(-2, 8, -7.5, 11.3, 2.2), // → treasure nook
  circ(-11, 11.6, 3.3),
  cap(2, 8, 8.5, 10.4, 2.0), // → lantern nook
  circ(12.2, 10.6, 3.1),
];

function sdfLocal(x: number, z: number): number {
  let best = -1e9;
  for (const s of SHAPES) {
    const dx = s.x2 - s.x1,
      dz = s.z2 - s.z1;
    const L2 = dx * dx + dz * dz;
    let t = L2 > 0 ? ((x - s.x1) * dx + (z - s.z1) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = s.r - Math.hypot(x - (s.x1 + dx * t), z - (s.z1 + dz * t));
    if (d > best) best = d;
  }
  return best;
}

// underground pool (ellipse across the hall)
const POOL = { x: 0, z: 3, rx: 7.2, rz: 1.75 };
const poolVal = (x: number, z: number) => Math.hypot((x - POOL.x) / POOL.rx, (z - POOL.z) / POOL.rz);

const SPOTS: Record<string, [number, number]> = {
  critter_0: [-12, -3.4],
  critter_1: [-14.2, 2.2],
  critter_2: [12, -3.8],
  critter_3: [14.6, 1.0],
  critter_4: [-2.8, -0.9],
  critter_5: [3.0, 7.3],
  res_0: [-15.0, -4.6],
  res_1: [-9.6, 0.4],
  res_2: [8.8, -7.2],
  res_3: [16.0, 2.9],
  res_4: [-3.6, 7.4],
  res_5: [6.4, 9.9],
  treasure: [-11, 12.1],
  npc: [12.6, 10.3],
};

export function buildCave(scene: Scene, origin: Vector3): InteriorDef {
  const ox = origin.x,
    oy = origin.y,
    oz = origin.z;
  const r = rng(424242);
  const rand = (a: number, b: number) => a + (b - a) * r();
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length) % a.length];
  const root = new TransformNode("crystalCave", scene);

  const main = new Batch(scene, "caveMain");
  const glowA = new Batch(scene, "caveGlowA");
  const glowB = new Batch(scene, "caveGlowB");
  const shroom = new Batch(scene, "caveShroomGlow");
  const water = new Batch(scene, "caveWater");
  linkBatches(main, { leaves: main, glow: glowA });
  const colliders: Collider[] = [];

  const W = (lx: number, lz: number) => new Vector3(ox + lx, oy, oz + lz);
  const reserved: [number, number][] = [...Object.values(SPOTS), [0, -12.8], [0, -15.4]];
  const isFree = (lx: number, lz: number, rad: number) => reserved.every(([sx, sz]) => Math.hypot(sx - lx, sz - lz) > rad);
  const sdf = sdfLocal;
  const grad = (x: number, z: number): [number, number] => {
    const e = 0.4;
    const gx = sdf(x + e, z) - sdf(x - e, z),
      gz = sdf(x, z + e) - sdf(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  };

  // ------------------------------------------------------------------ crystals & light pools
  const crystalSpots: [number, number, "lavender" | "pink" | "sky" | "mint", number][] = [
    [-15.6, -1.2, "lavender", 1.45],
    [-8.9, -6.9, "pink", 1.0],
    [-16.4, 4.6, "sky", 1.15],
    [-11.4, 1.6, "mint", 0.75],
    [-14.3, -6.9, "lavender", 1.1],
    [-12.6, 5.0, "pink", 0.8],
    [-3.3, -11.8, "sky", 0.8],
    [3.4, -10.8, "pink", 0.9],
    [-5.8, 6.8, "lavender", 1.0],
    [5.9, 6.3, "pink", 0.95],
    [-5.3, -1.6, "sky", 0.7],
    [-13.4, 13.2, "pink", 1.2],
    [-8.6, 13.4, "lavender", 1.0],
    [-11.2, 14.4, "sky", 0.9],
    [14.4, 12.2, "mint", 0.9],
    [6.2, -7.6, "sky", 0.7],
  ];
  const glowTint: Record<string, string> = { lavender: "#d9b8ff", pink: "#ffb8dc", sky: "#a8dcff", mint: "#a8ffd9" };
  const lightPools: [number, number, Color3, number][] = crystalSpots.map(([x, z, h, s]) => [x, z, col(glowTint[h]), 2.4 * s]);
  const shroomSpots: [number, number, "mint" | "sky" | "pink" | "lavender", number][] = [
    [13.6, -7.4, "mint", 1.2],
    [15.6, -2.8, "sky", 1.0],
    [9.4, -2.0, "mint", 0.9],
    [14.2, 3.9, "pink", 1.0],
    [16.6, 0.2, "lavender", 1.1],
    [10.8, -6.3, "sky", 0.8],
    [8.3, 1.2, "mint", 0.8],
    [-7.2, -3.6, "mint", 0.7],
    [-16.2, 0.9, "pink", 0.8],
    [9.8, 11.8, "sky", 0.8],
    [-2.6, 9.0, "lavender", 0.8],
    [2.6, -12.6, "mint", 0.7],
  ];
  for (const [x, z, h, s] of shroomSpots) lightPools.push([x, z, col(glowTint[h]), 1.8 * s]);
  const bigShrooms: [number, number, string, string][] = [
    [16.4, -5.4, "#c8fff0", "#62d6b0"],
    [11.0, 4.4, "#e2f3ff", "#7cbcf0"],
    [-17.0, -3.6, "#ffe2f2", "#ee8fc0"],
  ];
  for (const [x, z, c] of bigShrooms) lightPools.push([x, z, col(c), 3.2]);

  // ------------------------------------------------------------------ floor
  const FW = 48,
    FD = 42;
  const ground = MeshBuilder.CreateGround("caveFloor", { width: FW, height: FD, subdivisions: 64 }, scene);
  ground.removeVerticesData(VertexBuffer.UVKind);
  {
    const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
    const n = pos.length / 3;
    const c = new Float32Array(n * 4);
    const fLight = col("#c7aedb"),
      fMid = col("#9f86c4"),
      fDark = col("#3e2f56"),
      pool = col("#2f6e8a"),
      warm = col("#f6dcc0");
    for (let i = 0; i < n; i++) {
      const lx = pos[i * 3],
        lz = pos[i * 3 + 2];
      const d = sdf(lx, lz);
      const noise = 0.5 + 0.5 * Math.sin(lx * 0.9 + Math.sin(lz * 0.7) * 2) * Math.cos(lz * 0.8 - lx * 0.3);
      let cc: Color3;
      if (d > 0) cc = Color3.Lerp(fMid, fLight, Math.min(1, d / 2.5) * (0.6 + 0.4 * noise));
      else cc = Color3.Lerp(fMid, fDark, Math.min(1, -d / 1.4));
      // baked light pools under glowing things
      for (const [px, pz, pc, pr] of lightPools) {
        const dd = Math.hypot(lx - px, lz - pz);
        if (dd < pr) {
          const k = 1 - dd / pr;
          cc = Color3.Lerp(cc, mixCol(cc, pc, 0.85), k * k * 0.85);
        }
      }
      // daylight spilling in at the entrance
      if (lz < -10) {
        const k = Math.min(1, (-10 - lz) / 7) * Math.max(0, 1 - Math.abs(lx) / (3.2 + Math.max(0, -14 - lz) * 0.8));
        cc = Color3.Lerp(cc, warm, Math.min(1, k * 1.1));
      }
      const pv = poolVal(lx, lz);
      if (pv < 1.05) cc = Color3.Lerp(cc, pool, Math.min(1, (1.05 - pv) * 6));
      c.set([cc.r, cc.g, cc.b, 1], i * 4);
      pos[i * 3] = lx + ox;
      pos[i * 3 + 1] = oy + (pv < 1 ? -0.25 : 0);
      pos[i * 3 + 2] = lz + oz;
    }
    ground.setVerticesData(VertexBuffer.PositionKind, pos);
    ground.setVerticesData(VertexBuffer.ColorKind, c, false, 4);
    ground.createNormals(false);
    ground.refreshBoundingInfo();
  }
  finishMesh(ground, scene, { outline: false, castShadow: false, rim: 0.05 });
  ground.parent = root;
  ground.isPickable = false;

  // ------------------------------------------------------------------ walls
  const rockTops = ["#9f8ddb", "#ad93dd", "#8f95dc", "#a99ae0"].map((h) => col(h));
  const rockBot = col("#4e3d7c"),
    rockFarTop = col("#6f5c98"),
    rockFarBot = col("#3b2d55");
  const cell = 1.15;
  const wallFronts: { x: number; z: number; h: number; r: number; gx: number; gz: number }[] = [];
  for (let gz = -21; gz <= 18; gz += cell) {
    for (let gx = -22; gx <= 22; gx += cell) {
      const lx = gx + rand(-0.3, 0.3),
        lz = gz + rand(-0.3, 0.3);
      const d = sdf(lx, lz);
      if (d > -0.3 || d < -7) continue;
      // keep the tunnel mouth open to the daylight
      if (lz < -14 && Math.abs(lx) < 2.0 + (-14 - lz) * 0.9) continue;
      const [dx, dzz] = grad(lx, lz); // toward the floor
      // walls between camera (south) and floor are kept low so they never hide the player
      const camSide = Math.max(0, Math.min(1, (dzz + 0.15) / 0.8));
      const far = d < -3.2;
      if (far && r() < 0.45) continue;
      const tall = (2.4 + Math.min(2.2, -d * 0.55)) * (1 - camSide * 0.78) + rand(-0.3, 0.4);
      const rad = (far ? rand(1.2, 1.7) : rand(0.75, 1.3)) * (1 - camSide * 0.2);
      const t = Math.min(1, (-d - 0.3) / 4);
      const top = Color3.Lerp(jitterCol(pick(rockTops), 0.03, r), rockFarTop, t);
      const bot = Color3.Lerp(rockBot, rockFarBot, t);
      const seg = far ? 6 : 7;
      // lower lump
      const h1 = Math.min(tall, 1.6 + rand(-0.2, 0.3));
      const m1 = elb(scene, rad, h1 * 0.62, rad * rand(0.85, 1.05), { color: Color3.Lerp(bot, top, 0.75), bottom: bot }, seg);
      m1.position.set(ox + lx, oy + h1 * 0.38, oz + lz);
      m1.rotation.y = rand(0, 6);
      main.add(m1);
      if (tall > h1 + 0.4) {
        const h2 = tall - h1 * 0.55;
        const r2 = rad * rand(0.7, 0.88);
        const m2 = elb(scene, r2, h2 * 0.55, r2 * rand(0.85, 1.05), { color: top, bottom: Color3.Lerp(bot, top, 0.45) }, seg);
        m2.position.set(ox + lx + rand(-0.2, 0.2) - dx * 0.25, oy + h1 * 0.6 + h2 * 0.42, oz + lz + rand(-0.2, 0.2) - dzz * 0.25);
        m2.rotation.y = rand(0, 6);
        main.add(m2);
      }
      if (d > -1.7) {
        colliders.push({ kind: "circle", x: ox + lx, z: oz + lz, r: rad * 0.92 });
        wallFronts.push({ x: lx, z: lz, h: tall, r: rad, gx: dx, gz: dzz });
      }
    }
  }

  // ------------------------------------------------------------------ wall decor: vines, roots, glow moss, wall crystals
  for (const wf of wallFronts) {
    const facing = wf.gz < -0.35; // face looks toward the camera
    if (facing && wf.h > 2 && r() < 0.42) {
      // hanging vine strand down the front face
      const n = 4 + Math.floor(r() * 7);
      const fx = wf.x + wf.gx * wf.r * 0.92,
        fz = wf.z + wf.gz * wf.r * 0.92;
      let sw = 0;
      for (let j = 0; j < n; j++) {
        const y = wf.h - 0.25 - j * 0.2;
        if (y < 0.3) break;
        sw += rand(-0.05, 0.05);
        const sd = j % 2 ? 1 : -1;
        const leaf = elb(scene, 0.1, 0.075, 0.03, { color: jitterCol(j % 3 ? "#7fcf9a" : "#a6e3b4", 0.04, r), bottom: "#4f9a78" }, 5);
        leaf.position.set(ox + fx + sw + sd * 0.06, oy + y, oz + fz - 0.05);
        leaf.rotation.set(0.15, 0, sd * 0.6);
        main.add(leaf);
        if (j === n - 1 || (j > 2 && r() < 0.18)) {
          const berry = elb(scene, 0.055, 0.055, 0.055, { color: pick(["#bff8ff", "#ffd1f0", "#d9ffe9"]) }, 4);
          berry.position.set(ox + fx + sw, oy + y - 0.1, oz + fz - 0.08);
          glowA.add(berry);
        }
      }
    } else if (facing && wf.h > 2.2 && r() < 0.18) {
      // dangling root
      const fx = wf.x + wf.gx * wf.r * 0.9,
        fz = wf.z + wf.gz * wf.r * 0.9;
      const len = rand(0.9, 1.6);
      const root1 = elb(scene, 0.05, len / 2, 0.05, { color: "#c79a74", bottom: "#8d6447" }, 5);
      root1.position.set(ox + fx, oy + wf.h - len / 2 - 0.1, oz + fz - 0.03);
      root1.rotation.z = rand(-0.12, 0.12);
      main.add(root1);
      const root2 = elb(scene, 0.035, len / 3, 0.035, { color: "#c79a74", bottom: "#8d6447" }, 4);
      root2.position.set(ox + fx + 0.12, oy + wf.h - len / 3 - 0.1, oz + fz - 0.02);
      root2.rotation.z = -0.25;
      main.add(root2);
    }
    // crystals & tiny glow shrooms sprouting from wall tops
    if (r() < 0.07 && wf.h > 1.2) {
      addGlowShroom(main, ox + wf.x - wf.gx * 0.15, oz + wf.z - wf.gz * 0.15, { y: oy + wf.h - 0.12, scale: 0.8, glow: shroom });
    } else if (r() < 0.12 && wf.h > 1.5) {
      addCrystal(main, ox + wf.x - wf.gx * 0.2, oz + wf.z - wf.gz * 0.2, {
        y: oy + wf.h - 0.35,
        scale: rand(0.45, 0.65),
        hue: pick(["lavender", "pink", "sky", "mint"] as const),
        base: false,
        glow: r() < 0.5 ? glowA : glowB,
      });
    }
  }

  // ------------------------------------------------------------------ crystals, shrooms, rocks
  crystalSpots.forEach(([x, z, hue, s], i) => {
    const c = addCrystal(main, ox + x, oz + z, { y: oy, scale: s, hue, glow: i % 2 ? glowB : glowA, seed: 1000 + i });
    colliders.push(c);
    // satellite shards
    const n = 2 + (i % 3);
    for (let j = 0; j < n; j++) {
      const a = rand(0, Math.PI * 2),
        d = rand(0.9, 1.5) * s;
      addCrystal(main, ox + x + Math.cos(a) * d, oz + z + Math.sin(a) * d, { y: oy, scale: rand(0.25, 0.4), hue, base: false, glow: j % 2 ? glowA : glowB, seed: 2000 + i * 10 + j });
    }
  });
  for (const [x, z, hue, s] of shroomSpots) {
    addGlowShroom(main, ox + x, oz + z, { y: oy, scale: s * 1.25, hue, glow: shroom });
    if (s > 0.85) colliders.push({ kind: "circle", x: ox + x, z: oz + z, r: 0.35 * s });
  }
  // giant glow mushrooms (grotto landmarks)
  for (const [x, z, ct, cb] of bigShrooms) {
    const h = rand(2.0, 2.6);
    main.add(
      place(
        lathe(
          scene,
          [
            [0, 0],
            [0.42, 0],
            [0.32, 0.25],
            [0.24, h * 0.6],
            [0.28, h],
            [0, h + 0.05],
          ],
          { color: "#efe6ff", bottom: "#a796cc" },
          10,
        ),
        ox + x,
        oy,
        oz + z,
      ),
    );
    const R = rand(1.1, 1.35);
    shroom.add(
      place(
        lathe(
          scene,
          [
            [0, R * 0.7],
            [R * 0.55, R * 0.62],
            [R * 0.92, R * 0.3],
            [R, R * 0.05],
            [R * 0.88, -0.04],
            [0, 0.02],
          ],
          { color: ct, bottom: cb },
          16,
        ),
        ox + x,
        oy + h - 0.05,
        oz + z,
      ),
    );
    for (let j = 0; j < 7; j++) {
      const a = (j / 7) * Math.PI * 2 + rand(-0.2, 0.2),
        el = j === 0 ? 1.45 : rand(0.45, 0.95);
      const nx = Math.cos(a) * Math.cos(el),
        ny = Math.sin(el),
        nz = Math.sin(a) * Math.cos(el);
      const s = elb(scene, 0.13, 0.03, 0.13, { color: "#ffffff" }, 5);
      s.position.set(ox + x + nx * R * 0.95, oy + h - 0.05 + ny * R * 0.66, oz + z + nz * R * 0.95);
      s.rotation.set(Math.acos(Math.min(1, ny)), Math.atan2(nx, nz), 0);
      shroom.add(s);
    }
    colliders.push({ kind: "circle", x: ox + x, z: oz + z, r: 0.5 });
  }
  // stalagmites near walls & scattered rocks
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 26; tries++) {
    const lx = rand(-18, 18),
      lz = rand(-16, 15);
    const d = sdf(lx, lz);
    if (d < 0.3 || d > 1.3 || !isFree(lx, lz, 2.2) || poolVal(lx, lz) < 1.4) continue;
    placed++;
    if (r() < 0.55) {
      const h = rand(0.7, 1.6);
      const m = lathe(
        scene,
        [
          [0, 0],
          [0.38, 0],
          [0.32, h * 0.25],
          [0.16, h * 0.7],
          [0.04, h],
          [0, h],
        ],
        { color: "#9d88c9", bottom: "#5f4c86" },
        8,
      );
      main.add(place(m, ox + lx, oy, oz + lz));
      if (r() < 0.5) {
        const m2 = lathe(scene, [[0, 0], [0.2, 0], [0.08, h * 0.45], [0, h * 0.55]], { color: "#9d88c9", bottom: "#5f4c86" }, 7);
        main.add(place(m2, ox + lx + 0.38, oy, oz + lz + 0.12));
      }
      colliders.push({ kind: "circle", x: ox + lx, z: oz + lz, r: 0.4 });
    } else {
      colliders.push(addRock(main, ox + lx, oz + lz, { y: oy, scale: rand(0.55, 0.85), color: pick(["#b9a6dc", "#a998cf", "#c3b3e2"]), moss: false }));
    }
  }
  // tiny pebbles & normal mushrooms for texture
  for (let i = 0; i < 40; i++) {
    const lx = rand(-18, 18),
      lz = rand(-16, 15);
    const d = sdf(lx, lz);
    if (d < 0.1 || d > 2.5 || poolVal(lx, lz) < 1.3 || !isFree(lx, lz, 1.2)) continue;
    if (r() < 0.25) addMushroom(main, ox + lx, oz + lz, { y: oy, scale: 0.7, color: pick(["#c6a4f0", "#f7a0b8", "#9fd0f5"]) });
    else {
      const p = elb(scene, rand(0.1, 0.2), rand(0.06, 0.1), rand(0.1, 0.18), { color: pick(["#b9a6dc", "#c9b8e8", "#a998cf"]), bottom: "#76639e" }, 5);
      main.add(place(p, ox + lx, oy + 0.03, oz + lz));
    }
  }

  // ------------------------------------------------------------------ pool, rim, bridge, lily pads
  {
    const wm = scallopRug(scene, 1, 18, { color: "#7fd3ee", bottom: "#5ab6d8" }, 0.05);
    wm.scaling.set(POOL.rx * 0.99, 1, POOL.rz * 0.99);
    wm.position.set(ox + POOL.x, oy - 0.04, oz + POOL.z);
    water.add(wm);
    // rim pebbles
    const nR = 46;
    for (let i = 0; i < nR; i++) {
      const a = (i / nR) * Math.PI * 2;
      const px = POOL.x + Math.cos(a) * POOL.rx * 1.02,
        pz = POOL.z + Math.sin(a) * POOL.rz * 1.06;
      if (Math.abs(px) < 1.3 || sdf(px, pz) < -0.4) continue;
      const s = rand(0.18, 0.3);
      const p = elb(scene, s * 1.3, s * 0.55, s, { color: pick(["#c9b8e8", "#b9a6dc", "#d8cbef"]), bottom: "#76639e" }, 5);
      p.position.set(ox + px, oy + 0.03, oz + pz);
      p.rotation.y = -a + Math.PI / 2;
      main.add(p);
    }
    // glowing lily pads & lotus
    const pads: [number, number, boolean][] = [
      [-4.5, 2.4, true],
      [-3.0, 3.8, false],
      [-5.8, 3.5, false],
      [3.4, 2.3, false],
      [4.8, 3.6, true],
      [2.7, 4.0, false],
      [6.0, 2.6, false],
    ];
    pads.forEach(([x, z, fl], i) => addLilyPad(main, ox + x, oz + z, { y: oy + 0.0, flower: fl, seed: 300 + i, color: "#8fd9b0" }));
    // pool colliders: grid of circles inside the ellipse, leaving the bridge corridor free
    for (let px = -POOL.rx + 0.5; px <= POOL.rx - 0.4; px += 0.85) {
      if (Math.abs(px) < 1.6) continue;
      const half = POOL.rz * Math.sqrt(Math.max(0, 1 - (px / POOL.rx) ** 2));
      for (let pz = -half + 0.55; pz <= half - 0.3; pz += 0.85) colliders.push({ kind: "circle", x: ox + px, z: oz + POOL.z + pz, r: 0.62 });
      if (half < 1.1) colliders.push({ kind: "circle", x: ox + px, z: oz + POOL.z, r: Math.max(0.5, half) });
    }
    colliders.push(...addBridge(main, ox + 0, oz + POOL.z, 4.9, -Math.PI / 2, { y: oy, seed: 77 }));
  }

  // ------------------------------------------------------------------ treasure dais & lantern nook
  {
    const [tx, tz] = SPOTS.treasure;
    const rug = scallopRug(scene, 1.25, 12, { color: "#ffd9ec", bottom: "#f0a8cc" }, 0.05);
    rug.position.set(ox + tx, oy + 0.005, oz + tz);
    shroom.add(rug);
    const inner = scallopRug(scene, 0.85, 10, { color: "#fff0f7" }, 0.06);
    inner.position.set(ox + tx, oy + 0.01, oz + tz);
    shroom.add(inner);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const st = petals(scene, 0.12, 5, { color: "#fff4b8", bottom: "#ffd56b" }, 0.05, 0.45);
      st.position.set(ox + tx + Math.cos(a) * 1.6, oy + 0.03, oz + tz + Math.sin(a) * 1.6);
      st.rotation.y = a;
      glowB.add(st);
    }
    const [nx, nz] = SPOTS.npc;
    // little lantern on a post + a mushroom stool for the cave keeper
    const post = lathe(scene, [[0, 0], [0.06, 0], [0.05, 1.5], [0, 1.5]], { color: "#a27a58" }, 6);
    main.add(place(post, ox + nx + 1.3, oy, oz + nz + 0.7));
    const lantern = elb(scene, 0.16, 0.2, 0.16, { color: "#fff0b8", bottom: "#ffc76b" }, 7);
    glowA.add(place(lantern, ox + nx + 1.3, oy + 1.62, oz + nz + 0.7));
    const roof = lathe(scene, [[0, 0.2], [0.22, 0.02], [0.2, -0.02], [0, 0]], { color: "#ef8fab" }, 10);
    main.add(place(roof, ox + nx + 1.3, oy + 1.8, oz + nz + 0.7));
    colliders.push({ kind: "circle", x: ox + nx + 1.3, z: oz + nz + 0.7, r: 0.25 });
    const stoolCap = lathe(scene, [[0, 0.5], [0.32, 0.46], [0.38, 0.36], [0.3, 0.33], [0, 0.34]], { color: "#f7a0b8", bottom: "#d97a9c" }, 12);
    main.add(place(stoolCap, ox + nx - 1.2, oy, oz + nz + 0.9));
    const stoolStem = lathe(scene, [[0, 0], [0.16, 0], [0.12, 0.36], [0, 0.36]], { color: "#fff3e3", bottom: "#e6d3bd" }, 8);
    main.add(place(stoolStem, ox + nx - 1.2, oy, oz + nz + 0.9));
    colliders.push({ kind: "circle", x: ox + nx - 1.2, z: oz + nz + 0.9, r: 0.35 });
  }

  // daylight mouth: a little grass & flowers creeping in, low rocks framing the opening
  addFlowerPatch(main, ox - 1.9, oz - 16.3, 0.8, { y: oy, palette: ["white", "butter", "pink"], density: 5 });
  addFlowerPatch(main, ox + 2.0, oz - 16.6, 0.7, { y: oy, palette: ["white", "butter", "lilac"], density: 5 });
  for (const [x, z] of [[-2.4, -15.2], [2.5, -15.0], [-3.1, -17.4], [3.3, -17.6]] as [number, number][]) {
    const g = elb(scene, rand(0.35, 0.5), 0.14, rand(0.3, 0.4), { color: "#b6e59a", bottom: "#86c97a" }, 6);
    main.add(place(g, ox + x, oy + 0.04, oz + z));
  }

  // ------------------------------------------------------------------ build batches
  const mats = {
    a: toonMat(scene, { name: "caveGlowA", emissive: "#c4c4c4", rim: 0.4 }),
    b: toonMat(scene, { name: "caveGlowB", emissive: "#c4c4c4", rim: 0.4 }),
    s: toonMat(scene, { name: "caveShroom", emissive: "#d0d0d0", rim: 0.3 }),
    w: toonMat(scene, { name: "caveWater", emissive: "#6a8a9a", rim: 0.5, specular: 0.3 }),
  };
  const built: (Mesh | null)[] = [
    main.build({ outline: 0.04 }),
    glowA.build({ material: mats.a, outline: 0.03, castShadow: false }),
    glowB.build({ material: mats.b, outline: 0.03, castShadow: false }),
    shroom.build({ material: mats.s, outline: 0.03, castShadow: false }),
    water.build({ material: mats.w, outline: 0.03, outlineColor: "#3f86ad", castShadow: false }),
  ];
  for (const m of built) {
    if (!m) continue;
    m.parent = root;
    m.isPickable = false;
  }

  // ------------------------------------------------------------------ lights & motes
  const poolLight = new PointLight("cavePoolLight", new Vector3(ox + 0, oy + 2.2, oz + 3), scene);
  poolLight.diffuse = col("#8fdcff");
  poolLight.specular = Color3.Black();
  poolLight.intensity = 0.9;
  poolLight.range = 11;
  poolLight.parent = root;
  const gardenLight = new PointLight("caveGardenLight", new Vector3(ox - 13, oy + 2.4, oz - 1), scene);
  gardenLight.diffuse = col("#e6b0ff");
  gardenLight.specular = Color3.Black();
  gardenLight.intensity = 0.85;
  gardenLight.range = 11;
  gardenLight.parent = root;

  const motes = makeMotes(scene, { minX: ox - 18, maxX: ox + 18, minZ: oz - 16, maxZ: oz + 15 }, 90, {
    y0: oy + 0.3,
    y1: oy + 2.8,
    size: 0.065,
    seed: 11,
    colors: ["#fff3c4", "#f4dcff", "#c8f1ff", "#ffd9ee", "#d4ffe9"],
    accept: (x, z) => sdf(x - ox, z - oz) > 0.4,
  });
  motes.mesh.parent = root;

  const spots: Record<string, Vector3> = {};
  for (const [k, [x, z]] of Object.entries(SPOTS)) spots[k] = W(x, z);
  const spawn = W(0, -12.8);

  const base = new Color3(0.77, 0.77, 0.77);
  return {
    id: "crystalCave",
    root,
    bounds: { minX: ox - 18.5, maxX: ox + 18.8, minZ: oz - 16.6, maxZ: oz + 15.2 },
    colliders,
    spawn,
    exit: { pos: W(0, -15.4), radius: 1.5 },
    spots,
    camera: { alpha: -Math.PI / 2, beta: 0.95, radius: 20, target: spawn.clone(), follow: true },
    lighting: CAVE_LIGHT,
    update(_dt: number, t: number) {
      const pa = 0.5 + 0.5 * Math.sin(t * 1.4);
      const pb = 0.5 + 0.5 * Math.sin(t * 1.4 + 2.1);
      mats.a.emissiveColor.copyFrom(base).scaleInPlace(0.86 + 0.24 * pa);
      mats.b.emissiveColor.copyFrom(base).scaleInPlace(0.86 + 0.24 * pb);
      mats.s.emissiveColor.set(0.78 + 0.1 * Math.sin(t * 0.9), 0.8 + 0.1 * Math.sin(t * 0.9), 0.8 + 0.1 * Math.sin(t * 0.9));
      poolLight.intensity = 0.85 + 0.12 * Math.sin(t * 1.1);
      gardenLight.intensity = 0.8 + 0.12 * pa;
      motes.update(t);
    },
  };
}

function place<T extends Mesh>(m: T, x: number, y: number, z: number): T {
  m.position.set(x, y, z);
  return m;
}
