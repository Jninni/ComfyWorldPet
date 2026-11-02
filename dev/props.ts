import { ArcRotateCamera, Vector3, MeshBuilder, VertexBuffer, Color3, type Mesh } from "@babylonjs/core";
import { Stage } from "../src/render/Stage";
import { finishMesh, disc, scallopRug, Batch } from "../src/render/Shapes";
import { col, mixCol } from "../src/render/Palette";
import { toonMat } from "../src/render/Toon";
import {
  makePropBatches,
  addTree,
  addBush,
  addFlowerPatch,
  addRock,
  addFence,
  addLamp,
  addSign,
  addMushroom,
  addGlowShroom,
  addLilyPad,
  addReeds,
  addCrystal,
  addStump,
  addLog,
  addBench,
  addWell,
  addFountain,
  addBridge,
  addCliff,
  addCaveMouth,
  addGate,
  makeGrassField,
  makeMotes,
} from "../src/world/props";

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qs.has(k) ? parseFloat(qs.get(k)!) : d);

const stage = new Stage(document.getElementById("c") as HTMLCanvasElement);
const scene = stage.scene;
const cam = new ArcRotateCamera("cam", -Math.PI / 2, 0.9, 40, new Vector3(0, 0, 3), scene);
cam.fov = 0.6;
cam.minZ = 0.3;
cam.maxZ = 400;
cam.attachControl(true);
stage.setupPipeline([cam]);

const updaters: ((dt: number, t: number) => void)[] = [];

async function main() {
  if (qs.get("cave")) {
    const { buildCave } = await import("../src/world/cave");
    const t0 = performance.now();
    const def = buildCave(scene, new Vector3(num("ox", 0), 0, num("oz", 0)));
    console.log(`cave built in ${(performance.now() - t0).toFixed(0)} ms, colliders ${def.colliders.length}`);
    stage.setLighting(def.lighting);
    const spot = qs.get("spot");
    const target = spot && def.spots[spot] ? def.spots[spot].clone() : def.camera.target.clone();
    cam.target = new Vector3(num("tx", target.x), num("ty", target.y), num("tz", target.z));
    cam.alpha = num("a", def.camera.alpha);
    cam.beta = num("b", def.camera.beta);
    cam.radius = num("r", def.camera.radius);
    stage.shadowFocus = cam.target.clone();
    if (def.update) updaters.push(def.update);
    if (qs.get("debug")) debugCave(def);
  } else if (qs.get("stats")) {
    stats();
  } else {
    buildMeadow();
    cam.target = new Vector3(num("tx", 0), num("ty", 0), num("tz", 3));
    cam.alpha = num("a", -Math.PI / 2);
    cam.beta = num("b", 0.9);
    cam.radius = num("r", 52);
    stage.shadowFocus = cam.target.clone();
    stage.setShadowArea(40);
  }
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    t += dt;
    for (const u of updaters) u(dt, t);
  });
  // let shaders compile
  await scene.whenReadyAsync();
  const frames = num("frames", 0);
  if (frames > 0) {
    // screenshot mode: render a fixed number of frames, then freeze (keeps headless captures cheap)
    stage.engine.stopRenderLoop();
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      scene.render();
      await new Promise((r) => requestAnimationFrame(r));
    }
    console.log(`frame avg ${((performance.now() - t0) / frames).toFixed(0)} ms`);
  }
  (window as unknown as { __ready: boolean }).__ready = true;
}

function debugCave(def: { colliders: import("../src/core/types").Collider[]; spots: Record<string, Vector3>; spawn: Vector3; exit: { pos: Vector3; radius: number } }) {
  const b = new Batch(scene, "dbg");
  for (const c of def.colliders) {
    if (c.kind === "circle") b.add(disc(scene, c.r, 0.02, { pos: [c.x, 0.05, c.z], color: "#ff0000" }, 10));
    else {
      const m = MeshBuilder.CreateBox("b", { width: c.maxX - c.minX, height: 0.05, depth: c.maxZ - c.minZ }, scene);
      m.position.set((c.minX + c.maxX) / 2, 0.05, (c.minZ + c.maxZ) / 2);
      m.removeVerticesData(VertexBuffer.UVKind);
      const n = m.getTotalVertices();
      m.setVerticesData(VertexBuffer.ColorKind, new Float32Array(n * 4).fill(1), false, 4);
      b.add(m);
    }
  }
  for (const [k, p] of Object.entries(def.spots)) b.add(disc(scene, 0.4, 0.3, { pos: [p.x, 0.1, p.z], color: k.startsWith("crit") ? "#00ff66" : k.startsWith("res") ? "#ffee00" : "#00ccff" }, 10));
  b.add(disc(scene, 0.5, 0.4, { pos: [def.spawn.x, 0.1, def.spawn.z], color: "#ffffff" }, 10));
  b.add(disc(scene, def.exit.radius, 0.05, { pos: [def.exit.pos.x, 0.1, def.exit.pos.z], color: "#ff8800" }, 16));
  b.build({ emissive: "#ffffff", outline: false, castShadow: false });
}

function stats() {
  const tests: [string, (b: Batch) => void][] = [
    ["tree round", (b) => addTree(b, 0, 0, "round")],
    ["tree pine", (b) => addTree(b, 0, 0, "pine")],
    ["tree blossom", (b) => addTree(b, 0, 0, "blossom")],
    ["tree fruit", (b) => addTree(b, 0, 0, "fruit")],
    ["tree willow", (b) => addTree(b, 0, 0, "willow")],
    ["tree mushroom", (b) => addTree(b, 0, 0, "mushroomTree")],
    ["bush", (b) => addBush(b, 0, 0)],
    ["bush flowers", (b) => addBush(b, 0, 0, { flowers: true })],
    ["flowerPatch r1.5", (b) => addFlowerPatch(b, 0, 0, 1.5)],
    ["rock", (b) => addRock(b, 0, 0)],
    ["fence 10m", (b) => addFence(b, 0, 0, 10, 0)],
    ["lamp", (b) => addLamp(b, 0, 0)],
    ["sign", (b) => addSign(b, 0, 0)],
    ["mushroom", (b) => addMushroom(b, 0, 0)],
    ["glowshroom", (b) => addGlowShroom(b, 0, 0)],
    ["lily+flower", (b) => addLilyPad(b, 0, 0, { flower: true })],
    ["reeds", (b) => addReeds(b, 0, 0)],
    ["crystal", (b) => addCrystal(b, 0, 0)],
    ["stump", (b) => addStump(b, 0, 0)],
    ["log", (b) => addLog(b, 0, 0)],
    ["bench", (b) => addBench(b, 0, 0)],
    ["well", (b) => addWell(b, 0, 0)],
    ["fountain", (b) => addFountain(b, 0, 0)],
    ["bridge 7.5", (b) => addBridge(b, 0, 0, 7.5, 0)],
    ["cliff 30m", (b) => addCliff(b, [[0, 0], [30, 0]], 3.2)],
    ["caveMouth", (b) => addCaveMouth(b, 0, 0, 0)],
  ];
  const out: string[] = [];
  for (const [name, fn] of tests) {
    const b = new Batch(scene, name);
    const before = scene.meshes.length;
    fn(b);
    const extra = scene.meshes.slice(before).filter((m) => !b.meshes.includes(m as Mesh));
    const v = b.meshes.reduce((a, m) => a + m.getTotalVertices(), 0) + extra.reduce((a, m) => a + (m as Mesh).getTotalVertices(), 0);
    out.push(`${name}: ${v} verts (${b.meshes.length} parts)`);
    for (const m of scene.meshes.slice(before)) m.dispose();
  }
  console.log(out.join("\n"));
}

function buildMeadow() {
  // ---- ground: soft painted grass with a sandy path and a pond
  const pondC = { x: 11, z: 1.5, r: 3.4 };
  const inPond = (x: number, z: number) => Math.hypot((x - pondC.x) / 1.25, z - pondC.z) < pondC.r;
  const onPath = (x: number, z: number) => Math.abs(x - Math.sin(z * 0.15) * 1.2) < 1.3 && z < -2.4;
  const ground = MeshBuilder.CreateGround("g", { width: 90, height: 90, subdivisions: 90 }, scene);
  ground.removeVerticesData(VertexBuffer.UVKind);
  {
    const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
    const n = pos.length / 3;
    const c = new Float32Array(n * 4);
    const g1 = col("grass"),
      g2 = col("grassLight"),
      sand = col("path");
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3],
        z = pos[i * 3 + 2];
      const w = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.13 - x * 0.05);
      let cc = Color3.Lerp(g1, g2, w * 0.6);
      if (onPath(x, z)) cc = sand;
      const pd = Math.hypot((x - pondC.x) / 1.25, z - pondC.z);
      if (pd < pondC.r + 0.5) cc = mixCol(cc, "sand", 0.8);
      if (pd < pondC.r - 0.3) {
        cc = col("waterDeep");
        pos[i * 3 + 1] = -0.3;
      }
      c.set([cc.r, cc.g, cc.b, 1], i * 4);
    }
    ground.setVerticesData(VertexBuffer.PositionKind, pos);
    ground.setVerticesData(VertexBuffer.ColorKind, c, false, 4);
    ground.createNormals(false);
  }
  finishMesh(ground, scene, { outline: false, castShadow: false });

  const pb = makePropBatches(scene, "meadow");
  const B = pb.main;
  const colliders: unknown[] = [];

  // pond water
  const wb = new Batch(scene, "pond");
  wb.add(scallopRug(scene, pondC.r * 0.98, 14, { pos: [pondC.x, -0.06, pondC.z], scale: [1.25, 1, 1], color: "#a8def5" }, 0.04));
  wb.build({ material: toonMat(scene, { name: "pondWater", emissive: "#5f6f7a", rim: 0.4 }), outline: 0.03, outlineColor: "#6fa9d6", castShadow: false });

  // trees along the back
  const kinds = ["round", "pine", "blossom", "fruit", "willow", "mushroomTree"] as const;
  kinds.forEach((k, i) => colliders.push(addTree(B, -14 + i * 5.5, 10 + (i % 2) * 1.2, k)));
  addTree(B, -21, 6, "pine", { scale: 1.2 });
  addTree(B, 20, 7, "round", { scale: 1.1 });
  addTree(B, 22, 2, "blossom", { scale: 0.9 });
  // cliff at the back with a cave mouth
  colliders.push(
    ...addCliff(
      B,
      [
        [-34, 17],
        [-20, 19],
        [-8, 18],
        [6, 19.5],
        [20, 18],
        [34, 20],
      ],
      3.2,
    ),
  );
  colliders.push(addCaveMouth(B, -18, 15, 0));

  // fountain centrepiece
  const f = addFountain(B, 0, 2.5);
  updaters.push((_dt, t) => f.update(t));

  // left garden
  addBush(B, -12, 4, { flowers: true });
  addBush(B, -9.5, 5.2);
  addBush(B, -15.5, 2.5, { flowers: true, scale: 1.2 });
  addFlowerPatch(B, -11, 0.5, 1.8);
  addFlowerPatch(B, -6.5, 4.5, 1.3);
  addFlowerPatch(B, -15, -2.5, 1.6, { palette: ["pink", "white", "lilac"] });
  addRock(B, -7, 0.5);
  addRock(B, -8, -1.2, { scale: 0.6 });
  addRock(B, -17.5, 4.5, { scale: 1.4, moss: true });
  addMushroom(B, -13.5, 1.5);
  addMushroom(B, -9, 2.5);
  addStump(B, -16.5, 0);
  addLog(B, -10.5, -3.5, { rotY: 0.3 });
  addCrystal(B, -19, 0, { hue: "lavender" });
  addCrystal(B, -20.5, 2, { hue: "pink", scale: 0.7 });
  addCrystal(B, -18.5, -2.5, { hue: "sky", scale: 0.8 });
  addCrystal(B, -21, -1, { hue: "mint", scale: 0.6 });
  addGlowShroom(B, -17, -4.2);

  // pond side
  addBridge(B, pondC.x, pondC.z, 7.5, 0);
  addLilyPad(B, 8.5, 3.2, { flower: true });
  addLilyPad(B, 9.5, -0.5);
  addLilyPad(B, 13.5, 3.4, { flower: true });
  addLilyPad(B, 14.2, -0.2);
  addReeds(B, 15.5, 3.2);
  addReeds(B, 6.6, 0.2);
  addReeds(B, 7.2, 3.4);

  // front row: fence, lamps, sign, bench, well, gate
  colliders.push(...addFence(B, -16, -6.5, -3, -6.5));
  colliders.push(...addFence(B, 3, -6.5, 10, -7.5));
  addLamp(B, -2.2, -5.5);
  addLamp(B, 2.2, -5.5);
  addSign(B, 4.6, -4.3);
  addSign(B, -4.6, -4.3, { arrow: true, rotY: 0.3 });
  addBench(B, -6.5, -3.6);
  addWell(B, 15, -4.5);
  addBush(B, 18, -2, { flowers: true });
  addFlowerPatch(B, 12.5, -7, 1.5);
  addFlowerPatch(B, -2.5, 6.5, 1.2);
  const gate = addGate(scene, 0, -9.5, {});
  gate.setOpen(num("gate", 0));

  pb.build();

  makeGrassField(
    scene,
    { minX: -40, maxX: 40, minZ: -30, maxZ: 25 },
    num("grass", 0.9),
    (x, z) => onPath(x, z) || inPond(x * 0.95 + pondC.x * 0.05, z) || Math.hypot(x, z - 2.5) < 2.7 || z > 16.5,
    7,
  );
  const ff = makeMotes(scene, { minX: -20, maxX: 20, minZ: -8, maxZ: 12 }, 30, { y0: 0.5, y1: 2.5, seed: 3 });
  updaters.push((_dt, t) => ff.update(t));
  console.log("meadow meshes", scene.meshes.length, "verts", scene.meshes.reduce((a, m) => a + (m as Mesh).getTotalVertices(), 0));
}

main();
if (!qs.get("frames")) stage.engine.runRenderLoop(() => scene.render());
