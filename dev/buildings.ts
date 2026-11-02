import { ArcRotateCamera, Vector3, MeshBuilder, Color3, StandardMaterial, Mesh } from "@babylonjs/core";
import { Stage, OUTDOOR_LIGHT } from "../src/render/Stage";
import { finishMesh, paint } from "../src/render/Shapes";
import { buildExterior, buildInterior, BUILDING_IDS, type BuildingId } from "../src/world/buildings";
import type { Collider } from "../src/core/types";

const qs = new URLSearchParams(location.search);
const stage = new Stage(document.getElementById("c") as HTMLCanvasElement);
const scene = stage.scene;
const cam = new ArcRotateCamera("cam", -Math.PI / 2, 1.0, 20, Vector3.Zero(), scene);
cam.fov = 0.6;
cam.minZ = 0.3;
cam.maxZ = 800;
cam.attachControl(true);
stage.setupPipeline([cam]);
const updates: ((dt: number, t: number) => void)[] = [];
const debug = qs.has("debug");

function drawColliders(cs: Collider[], y = 0.05) {
  const mat = new StandardMaterial("dbg", scene);
  mat.emissiveColor = new Color3(1, 0, 0.3);
  mat.disableLighting = true;
  mat.wireframe = true;
  for (const c of cs) {
    let m: Mesh;
    if (c.kind === "box") {
      m = MeshBuilder.CreateBox("c", { width: c.maxX - c.minX, depth: c.maxZ - c.minZ, height: 0.1 }, scene);
      m.position.set((c.minX + c.maxX) / 2, y, (c.minZ + c.maxZ) / 2);
    } else {
      m = MeshBuilder.CreateCylinder("c", { diameter: c.r * 2, height: 0.1 }, scene);
      m.position.set(c.x, y, c.z);
    }
    m.material = mat;
  }
}
function marker(p: Vector3, color: Color3, r = 0.15) {
  const m = MeshBuilder.CreateSphere("mk", { diameter: r * 2 }, scene);
  const mat = new StandardMaterial("mk", scene);
  mat.emissiveColor = color;
  mat.disableLighting = true;
  m.material = mat;
  m.position.copyFrom(p);
  m.renderingGroupId = 1;
}

const interior = qs.get("interior") as BuildingId | null;
const single = qs.get("ext") as BuildingId | null;
if (interior) {
  const origin = new Vector3(1000, 0, 0);
  const def = buildInterior(scene, interior, origin);
  stage.setLighting(def.lighting);
  stage.setShadowArea(10);
  // NB: setting target recomputes alpha/beta/radius from the current position, so set it first
  cam.target = def.camera.target.clone();
  cam.alpha = +(qs.get("alpha") ?? def.camera.alpha);
  cam.beta = +(qs.get("beta") ?? def.camera.beta);
  cam.radius = +(qs.get("radius") ?? def.camera.radius);
  stage.shadowFocus.copyFrom(def.camera.target);
  if (def.update) updates.push(def.update);
  if (debug) {
    drawColliders(def.colliders);
    const b = def.bounds;
    drawColliders([{ kind: "box", ...b }], 0.02);
    marker(def.spawn, new Color3(0, 1, 0));
    marker(def.exit.pos, new Color3(1, 0, 0), def.exit.radius);
    for (const [, p] of Object.entries(def.spots)) marker(p, new Color3(0, 0.4, 1), 0.1);
  }
  // player-size reference
  if (qs.has("ref")) {
    const ref = MeshBuilder.CreateCapsule("ref", { height: 1.25, radius: 0.3 }, scene);
    ref.position.copyFrom(def.spawn).addInPlace(new Vector3(0, 0.625, 0));
  }
} else {
  stage.setLighting(OUTDOOR_LIGHT);
  const g = MeshBuilder.CreateGround("g", { width: 120, height: 80, subdivisions: 2 }, scene);
  paint(g, "grass");
  finishMesh(g, scene, { outline: false, castShadow: false });
  const ids = single ? [single] : BUILDING_IDS;
  const spacing = 11;
  ids.forEach((id, i) => {
    const x = (i - (ids.length - 1) / 2) * spacing;
    const rot = +(qs.get("rot") ?? 0);
    const def = buildExterior(scene, id, new Vector3(x, 0, 0), rot);
    if (def.update) updates.push(def.update);
    if (debug) {
      drawColliders(def.colliders, 0.16); // above raised plinths/tiles
      marker(def.door, new Color3(0, 1, 0));
      for (const p of Object.values(def.spots ?? {})) marker(p, new Color3(0, 0.4, 1), 0.1);
    }
  });
  cam.target = new Vector3(0, 2.6, 0);
  cam.alpha = +(qs.get("alpha") ?? -Math.PI / 2 + 0.15);
  cam.beta = +(qs.get("beta") ?? 1.12);
  cam.radius = +(qs.get("radius") ?? (single ? 19 : 58));
  stage.shadowFocus.set(0, 0, 0);
  stage.setShadowArea(single ? 10 : 34);
}

let t = 0;
const hud = document.getElementById("hud")!;
let frames = 0;
scene.onBeforeRenderObservable.add(() => {
  const dt = stage.engine.getDeltaTime() / 1000;
  t += dt;
  for (const u of updates) u(dt, t);
  if (++frames % 30 === 0) {
    const verts = scene.meshes.reduce((a, m) => a + (m.isEnabled() ? m.getTotalVertices() : 0), 0);
    hud.textContent = `meshes ${scene.meshes.length} · verts ${(verts / 1000).toFixed(1)}k · fps ${stage.engine.getFps().toFixed(0)}`;
  }
});
let rendered = 0;
let stopAt = -1;
stage.engine.runRenderLoop(() => {
  scene.render();
  rendered++;
  // ?still=N : stop rendering N frames after ready (keeps headless screenshots cheap)
  if (stopAt > 0 && rendered >= stopAt) stage.engine.stopRenderLoop();
});
scene.executeWhenReady(() => {
  if (qs.has("still")) stopAt = rendered + +(qs.get("still") || 40);
  (window as any).__ready = true;
  (window as any).__scene = scene;
  (window as any).__cam = cam;
  const verts = scene.meshes.reduce((a, m) => a + m.getTotalVertices(), 0);
  console.log(`meshes ${scene.meshes.length} verts ${verts}`);
});
