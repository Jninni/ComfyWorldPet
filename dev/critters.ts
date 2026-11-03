/**
 * Critter gallery.  Query params:
 *   only=<species>   show just one species (normal + rare unless rare=0/1)
 *   rare=0|1|both    which colourways (default both)
 *   zoom=1           close-up camera     far=1  gameplay camera (~20 m, 35° fov)
 *   anim=idle|walk|trot|sleep|excited|happy|surprised|love|sad|attack   (emotes repeat every 2 s, attacks every 1.2 s)
 *   speed=<0..1>     override the move speed (walk = 1 = gallop for riders, trot ≈ 0.4)
 *   rider=1|capsule  sit the player (or a 1.27 m capsule) on each rider's seat (frog scaled ×2.4 like in game)
 *   scale=<n>        scale every critter     yaw=<rad>  turn every critter (yaw=1.57 + strip → side-on film strip)
 *   t=<sec>          pre-simulate seconds before the first frame (fixed 60 Hz steps)
 *   alpha/beta/radius  camera overrides;  freeze=1  stop animating after pre-sim
 */
import { ArcRotateCamera, Vector3, MeshBuilder } from "@babylonjs/core";
import { Stage } from "../src/render/Stage";
import { finishMesh, paint, scallopRug } from "../src/render/Shapes";
import { SPECIES_IDS, type SpeciesId } from "../src/data/species";
import { buildCritter, type CritterModel, type CritterAnimState } from "../src/entities/critterModels";
import { buildPlayer, DEFAULT_LOOK } from "../src/entities/characterModels";

const q = new URLSearchParams(location.search);
const stage = new Stage(document.getElementById("c") as HTMLCanvasElement);
const scene = stage.scene;

const only = q.get("only") as SpeciesId | null;
const rareQ = q.get("rare") ?? "both";
const anim = q.get("anim") ?? "idle";
const ids = only ? [only] : SPECIES_IDS;
const variants: (0 | 1)[] = rareQ === "0" ? [0] : rareQ === "1" ? [1] : [0, 1];

const ground = MeshBuilder.CreateGround("g", { width: 60, height: 60, subdivisions: 2 }, scene);
paint(ground, "#c9ecb0");
finishMesh(ground, scene, { outline: false, castShadow: false });

const spacing = only ? 0.85 : 0.95;
const critters: { m: CritterModel; st: CritterAnimState; off: number }[] = [];
const speedQ = q.get("speed");
const mkState = (): CritterAnimState => ({ speed: speedQ ? +speedQ : anim === "walk" ? 1 : anim === "trot" ? 0.4 : 0, sleeping: anim === "sleep", excited: anim === "excited" });
const riderQ = q.get("rider");
const scaleQ = +(q.get("scale") ?? "1");
/** sit a rider on a critter's seat (frog ×2.4 like in game) */
function addRider(m: CritterModel, id: SpeciesId) {
  if (m.seatY === undefined) return;
  const k = id === "ribbit" ? 2.4 : 1;
  m.root.scaling.setAll(k * scaleQ);
  const parent = m.seat ?? m.root;
  if (riderQ === "capsule") {
    const cap = MeshBuilder.CreateCapsule("rider", { height: 1.27, radius: 0.16 }, scene);
    paint(cap, "#8fc3ea");
    finishMesh(cap, scene, { outline: 0.02 });
    cap.parent = parent;
    cap.position.set(0, 0.635 - 0.16, 0);
    cap.scaling.setAll(1 / k);
    return;
  }
  const p = buildPlayer(scene, DEFAULT_LOOK);
  p.update(1 / 60, { speed: 0 });
  p.root.parent = parent;
  p.root.scaling.setAll(1 / (k * scaleQ));
  // hips (0.3 m) sit just above the seat surface
  p.root.position.set(0, -0.26 / (k * scaleQ), 0);
  for (const n of p.root.getChildTransformNodes(false)) {
    if (n.name === "player.legR") n.rotation.set(-0.5, 0, 0.75);
    if (n.name === "player.legL") n.rotation.set(-0.5, 0, -0.75);
  }
}
// film strip: strip=N copies of `only`, each pre-simulated `dt` seconds further
const strip = +(q.get("strip") ?? "0");
const stripDt = +(q.get("dt") ?? "0.08");
if (only && strip > 0) {
  for (let i = 0; i < strip; i++) {
    const m = buildCritter(scene, only, variants[variants.length - 1]);
    const sw = Math.max(0.75, m.radius * 2.6);
    m.root.position.set((i - (strip - 1) / 2) * sw, 0, 0);
    if (scaleQ !== 1) m.root.scaling.setAll(scaleQ);
    m.root.rotation.y = +(q.get("yaw") ?? "0");
    if (riderQ) addRider(m, only);
    critters.push({ m, st: mkState(), off: i * stripDt });
  }
}
(only && strip > 0 ? [] : ids).forEach((id, i) => {
  variants.forEach((v, j) => {
    const m = buildCritter(scene, id, v);
    const x = -(i - (ids.length - 1) / 2) * spacing;
    const z = -j * 1.1;
    const sp = only ? Math.max(spacing, m.radius * 2.6) : spacing;
    m.root.position.set(only ? (j - (variants.length - 1) / 2) * sp : x, 0, only ? 0 : z);
    if (scaleQ !== 1) m.root.scaling.setAll(scaleQ);
    m.root.rotation.y = +(q.get("yaw") ?? "0");
    if (riderQ) addRider(m, id);
    const st = mkState();
    critters.push({ m, st, off: 0 });
    if (!only) {
      const rug = scallopRug(scene, 0.38, 9, { pos: [m.root.position.x, 0.005, m.root.position.z], color: v ? "#f6e3ff" : "#fff6e6" }, 0.02);
      finishMesh(rug, scene, { outline: false, castShadow: false });
    }
  });
});

const zoom = q.get("zoom") === "1";
const far = q.get("far") === "1";
const cam = new ArcRotateCamera("cam", Math.PI / 2, 1.2, 8.5, new Vector3(0, 0.35, -0.55), scene);
if (only && strip > 0) {
  const sw = Math.max(0.75, critters[0].m.radius * 2.6);
  cam.target.set(0, critters[0].m.height * 0.45, 0);
  cam.radius = strip * sw * 0.62;
  cam.beta = 1.38;
} else if (only) {
  const big = Math.max(1, critters[0].m.height / 0.8);
  cam.target.set(0, critters[0].m.height * 0.5 * (riderQ ? 1.3 : 1), 0);
  cam.radius = (zoom ? 1.6 : 2.6) * big * (big > 1 ? 1.3 : 1);
  cam.beta = 1.35;
  if (variants.length === 1 && zoom) cam.radius = 1.15 * big * (big > 1 ? 1.4 : 1);
} else if (zoom) {
  cam.radius = 4.5;
}
if (far) {
  cam.fov = (35 * Math.PI) / 180;
  cam.radius = 20;
  cam.beta = 0.95;
  cam.target.set(0, 0.3, -0.5);
} else cam.fov = 0.6;
if (q.get("alpha")) cam.alpha = +q.get("alpha")!;
if (q.get("beta")) cam.beta = +q.get("beta")!;
if (q.get("radius")) cam.radius = +q.get("radius")!;
cam.minZ = 0.05;
cam.attachControl(true);
stage.setupPipeline([cam]);

const emotes = ["happy", "surprised", "love", "sad"] as const;
const emoteKind = (emotes as readonly string[]).includes(anim) ? (anim as (typeof emotes)[number]) : null;
let emoteT = 0.3;
let atkT = 0.3;
function step(dt: number) {
  if (anim === "attack") {
    atkT -= dt;
    if (atkT <= 0) {
      atkT = 1.2;
      for (const c of critters) c.m.attack?.();
    }
  }
  if (emoteKind) {
    emoteT -= dt;
    if (emoteT <= 0) {
      emoteT = 2;
      for (const c of critters) c.m.emote(emoteKind);
    }
  }
  for (const c of critters) c.m.update(dt, c.st);
}
const pre = +(q.get("t") ?? "0");
for (let t = 0; t < pre; t += 1 / 60) step(1 / 60);
// per-critter extra offset (film strip)
for (const c of critters) for (let t = 0; t < c.off; t += 1 / 60) {
  if (emoteKind && c.off > 0 && t === 0) c.m.emote(emoteKind);
  if (anim === "attack" && c.off > 0 && t === 0) c.m.attack?.();
  c.m.update(1 / 60, c.st);
}
const freeze = q.get("freeze") === "1";
(document.getElementById("hud") as HTMLElement).textContent = `${ids.length * variants.length} critters · anim=${anim} · draw calls: `;
scene.onBeforeRenderObservable.add(() => {
  if (!freeze) step(Math.min(0.05, stage.engine.getDeltaTime() / 1000));
});
let frames = 0;
let readyAt = -1;
scene.onAfterRenderObservable.add(() => {
  frames++;
  if (readyAt < 0 && frames > 3 && scene.isReady(true)) readyAt = frames + 12;
  if (frames === readyAt) {
    (window as any).__ready = true;
    if (q.get("still") === "1")
      setTimeout(() => {
        stage.engine.stopRenderLoop();
        setInterval(() => scene.render(), 1500);
      }, 50);
    (document.getElementById("hud") as HTMLElement).textContent += String((stage.engine as any)._drawCalls?.current ?? "?");
  }
});
(window as any).critters = critters;
stage.engine.runRenderLoop(() => scene.render());
