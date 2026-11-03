/**
 * Thornwild test page.
 *   ?spot=<name>        centre the follow camera on a spot (default: spawn)
 *   &cleanse=0..1       cleanse amount (lighting lerps too)
 *   &debug=1            overlay colliders (red), spots (cyan / green enemies / yellow res / pink hearts), exit (orange)
 *   &bossgate=1         close the boss gate (visual + colliders in the flood test)
 *   &flood=1            reachability test from spawn (console)
 *   &overview=1         high top-down view of the whole zone
 *   &a= &b= &r= &tx= &tz=  camera overrides, &frames=N render N frames then stop
 *   ?gate=1&open=0|1    the overworld Thorn Gate on pastel grass
 */
import { ArcRotateCamera, Vector3, MeshBuilder, VertexBuffer, Color3, type Mesh } from "@babylonjs/core";
import { Stage, OUTDOOR_LIGHT } from "../src/render/Stage";
import { finishMesh, disc, Batch } from "../src/render/Shapes";
import { col } from "../src/render/Palette";
import { makeGrassField, addTree, addBush, makePropBatches, addFlowerPatch } from "../src/world/props";
import { CollisionWorld } from "../src/core/Collision";
import type { Collider } from "../src/core/types";
import { buildThornwild, buildThornGate, lerpLighting } from "../src/world/thornwild";

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qs.has(k) ? parseFloat(qs.get(k)!) : d);

const stage = new Stage(document.getElementById("c") as HTMLCanvasElement);
const scene = stage.scene;
const cam = new ArcRotateCamera("cam", -Math.PI / 2, 0.9, 22, new Vector3(0, 0, 0), scene);
cam.fov = 0.62;
cam.minZ = 0.3;
cam.maxZ = 500;
cam.attachControl(true);
stage.setupPipeline([cam]);
const updaters: ((dt: number, t: number) => void)[] = [];
const verts = () => scene.meshes.filter((m) => m.isEnabled()).reduce((a, m) => a + (m as Mesh).getTotalVertices(), 0);

function overlay(colliders: Collider[], spots: Record<string, Vector3>, extra: { pos: Vector3; r: number; c: string }[]) {
  const b = new Batch(scene, "dbg");
  for (const c of colliders) {
    if (c.kind === "circle") b.add(disc(scene, Math.max(0.05, c.r), 0.02, { pos: [c.x, 0.06, c.z], color: "#ff2030" }, 10));
    else {
      const m = MeshBuilder.CreateBox("b", { width: Math.max(0.05, c.maxX - c.minX), height: 0.05, depth: Math.max(0.05, c.maxZ - c.minZ) }, scene);
      m.position.set((c.minX + c.maxX) / 2, 0.08, (c.minZ + c.maxZ) / 2);
      m.removeVerticesData(VertexBuffer.UVKind);
      const n = m.getTotalVertices();
      const arr = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) arr.set([1, 0.5, 0, 1], i * 4);
      m.setVerticesData(VertexBuffer.ColorKind, arr, false, 4);
      b.add(m);
    }
  }
  for (const [k, p] of Object.entries(spots)) {
    const c = k.startsWith("enemy") ? "#00ff66" : k.startsWith("res") ? "#ffee00" : k.startsWith("heart") ? "#ff66cc" : "#00ccff";
    b.add(disc(scene, 0.4, 0.5, { pos: [p.x, 0.1, p.z], color: c }, 10));
  }
  for (const e of extra) b.add(disc(scene, e.r, 0.05, { pos: [e.pos.x, 0.1, e.pos.z], color: e.c }, 16));
  const m = b.build({ emissive: "#ffffff", outline: false, castShadow: false });
  if (m) m.renderingGroupId = 1;
}

async function main() {
  if (qs.get("gate")) {
    // pastel meadow + gate
    const ground = MeshBuilder.CreateGround("g", { width: 80, height: 80, subdivisions: 40 }, scene);
    ground.removeVerticesData(VertexBuffer.UVKind);
    const n = ground.getTotalVertices();
    const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
    const c = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3],
        z = pos[i * 3 + 2];
      const w = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.13 - x * 0.05);
      const cc = Color3.Lerp(col("grass"), col("grassLight"), w * 0.6);
      c.set([cc.r, cc.g, cc.b, 1], i * 4);
    }
    ground.setVerticesData(VertexBuffer.ColorKind, c, false, 4);
    ground.position.set(24, 0, 108);
    finishMesh(ground, scene, { outline: false, castShadow: false });
    stage.setLighting(OUTDOOR_LIGHT);
    const gp = new Vector3(24, 0, 108);
    const g = buildThornGate(scene, gp, num("rot", 0));
    g.setOpen(num("open", 0) > 0.5);
    updaters.push(g.update);
    // a few meadow props around for scale
    const pb = makePropBatches(scene, "m");
    addTree(pb.main, 15, 104, "round");
    addTree(pb.main, 33, 103, "blossom");
    addBush(pb.main, 18, 101, { flowers: true });
    addBush(pb.main, 30.5, 101.5);
    addFlowerPatch(pb.main, 20, 98.5, 1.2);
    pb.build();
    makeGrassField(scene, { minX: -10 + 24, maxX: 10 + 24, minZ: -14 + 108, maxZ: 1 + 108 }, 0.8, (x, z) => Math.abs(x - 24) < 2.2 && z > 103.5, 5);
    cam.target = new Vector3(num("tx", 24), 1.1, num("tz", 106));
    cam.alpha = num("a", -Math.PI / 2);
    cam.beta = num("b", 0.86);
    cam.radius = num("r", 22);
    stage.shadowFocus = cam.target.clone();
    if (qs.get("debug")) overlay(g.colliders, { entrance: g.entrance }, []);
    console.log("gate verts", verts(), "colliders", g.colliders.length);
  } else {
    const t0 = performance.now();
    const origin = new Vector3(num("ox", 0), 0, num("oz", 0));
    const def = buildThornwild(scene, origin);
    console.log(`thornwild built in ${(performance.now() - t0).toFixed(0)} ms, colliders ${def.colliders.length}`);
    const f = num("cleanse", 0);
    def.cleanse?.(f);
    stage.setLighting(lerpLighting(def.lighting, def.cleansedLighting!, f));
    if (qs.get("bossgate")) {
      def.setBossGate(true);
      def.update?.(5, 0); // snap the rise animation
    }
    const spot = qs.get("spot");
    const target = spot && def.spots[spot] ? def.spots[spot].clone() : def.camera.target.clone();
    target.y = 1.1;
    cam.target = new Vector3(num("tx", target.x), target.y, num("tz", target.z - 1));
    cam.alpha = num("a", def.camera.alpha);
    cam.beta = num("b", def.camera.beta);
    cam.radius = num("r", def.camera.radius);
    if (qs.get("overview")) {
      cam.target = new Vector3(origin.x + 2, 0, origin.z - 4);
      cam.beta = num("b", 0.5);
      cam.radius = num("r", 105);
      stage.setShadowArea(70);
      scene.fogDensity = 0.002;
    }
    stage.shadowFocus = cam.target.clone();
    if (def.update) updaters.push(def.update);
    if (qs.get("debug")) overlay(qs.get("bossgate") ? [...def.colliders, ...def.bossGate] : def.colliders, def.spots, [{ pos: def.exit.pos, r: def.exit.radius, c: "#ff8800" }, { pos: def.spawn, r: 0.5, c: "#ffffff" }]);
    if (qs.get("flood")) flood(def, !!qs.get("bossgate"));
    console.log(scene.meshes.map((m) => `${m.name}:${(m as Mesh).getTotalVertices()}${(m as Mesh).hasThinInstances ? "x" + (m as Mesh).thinInstanceCount : ""}`).join(" "));
    console.log("thornwild verts", verts(), "meshes", scene.meshes.length, "active-ish", scene.meshes.filter((m) => m.isEnabled()).length);
  }
  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
    t += dt;
    for (const u of updaters) u(dt, t);
  });
  await scene.whenReadyAsync();
  const frames = num("frames", 0);
  if (frames > 0) {
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

function flood(def: ReturnType<typeof buildThornwild>, gateClosed: boolean) {
  const cw = new CollisionWorld(4);
  cw.add(def.colliders);
  if (gateClosed) cw.add(def.bossGate);
  cw.bounds = def.bounds;
  const R = 0.4,
    step = 0.3;
  const b = def.bounds;
  const W = Math.ceil((b.maxX - b.minX) / step),
    H = Math.ceil((b.maxZ - b.minZ) / step);
  const seen = new Uint8Array(W * H);
  const idx = (x: number, z: number) => Math.floor((z - b.minZ) / step) * W + Math.floor((x - b.minX) / step);
  const q: [number, number][] = [[def.spawn.x, def.spawn.z]];
  seen[idx(def.spawn.x, def.spawn.z)] = 1;
  let n = 0,
    escaped = 0;
  const escPts: string[] = [];
  while (q.length) {
    const [x, z] = q.pop()!;
    n++;
    if (def.sdf(x, z) < -1.2) {
      escaped++;
      if (escPts.length < 12) escPts.push(`(${x.toFixed(1)},${z.toFixed(1)})`);
    }
    for (const [dx, dz] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ]) {
      const nx = x + dx,
        nz = z + dz;
      if (nx < b.minX || nx > b.maxX || nz < b.minZ || nz > b.maxZ) continue;
      const k = idx(nx, nz);
      if (seen[k]) continue;
      seen[k] = 1;
      if (cw.free(nx, nz, R)) q.push([nx, nz]);
    }
  }
  const reach = (p: Vector3) => {
    // any reached cell within 0.45 m
    for (let dz = -0.45; dz <= 0.45; dz += step)
      for (let dx = -0.45; dx <= 0.45; dx += step) {
        const x = p.x + dx,
          z = p.z + dz;
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        if (seen[idx(x, z)] && cw.free(x, z, R)) return true;
      }
    return false;
  };
  const bad: string[] = [];
  for (const [k, p] of Object.entries(def.spots)) {
    const free = cw.free(p.x, p.z, 0.45);
    const r = reach(p);
    if (!free || !r) bad.push(`${k}${free ? "" : " !free"}${r ? "" : " !reach"} sdf=${def.sdf(p.x, p.z).toFixed(2)}`);
  }
  console.log(`FLOOD reached ${n} cells, escaped(sdf<-1.2) ${escaped} ${escPts.join(" ")}; gateClosed=${gateClosed}; boss reachable: ${reach(def.bossArena.center)}`);
  console.log("FLOOD spot problems: " + (bad.length ? bad.join(" | ") : "none"));
}

main();
if (!qs.get("frames")) stage.engine.runRenderLoop(() => scene.render());
