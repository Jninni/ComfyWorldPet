/**
 * Gloomies gallery. Lineup of every enemy kind on a pastel meadow (front row) and on a dark plum
 * Thornwild patch (back row). Query params:
 *   only=<kind>|happy    show one kind (on both grounds)        ground=light|dark  just one row
 *   anim=idle|walk|windup|attack|hit|poof                       (attack/hit/poof loop; poof rebuilds)
 *   far=1   gameplay camera (~22 m, fov 0.6, ~50° down)         zoom=1  closer
 *   strip=N&dt=s   film strip: N copies of `only`, each pre-simulated dt s further into `anim`
 *   t=<sec> pre-simulate;  freeze=1  stop after pre-sim;  alpha/beta/radius camera overrides
 *   dusk=1  darker Thornwild-ish lighting
 */
import { ArcRotateCamera, Vector3, MeshBuilder, type AbstractMesh } from "@babylonjs/core";
import { Stage, OUTDOOR_LIGHT } from "../src/render/Stage";
import { finishMesh, paint } from "../src/render/Shapes";
import { buildEnemy, buildHappyBlob, ENEMY_KINDS, ENEMY_ATTACK, type EnemyKind, type EnemyModel, type EnemyAnimState } from "../src/entities/enemyModels";

const q = new URLSearchParams(location.search);
const stage = new Stage(document.getElementById("c") as HTMLCanvasElement);
const scene = stage.scene;
if (q.get("dusk") === "1")
  stage.setLighting({ ...OUTDOOR_LIGHT, sky: "#b9a6d8", ground: "#4a3a5e", hemi: 0.5, sun: "#e8c8f0", sunI: 0.7, fog: "#5a4670", fogDensity: 0.006, clear: "#4a3a62", skyTop: "#3a2c58", skyHorizon: "#8a5f8f" });

const only = q.get("only") as EnemyKind | "happy" | null;
const anim = q.get("anim") ?? "idle";
const groundQ = q.get("ground");
const kinds: (EnemyKind | "happy")[] = only ? [only] : [...ENEMY_KINDS, "happy"];
const rows: ("light" | "dark")[] = groundQ === "light" ? ["light"] : groundQ === "dark" ? ["dark"] : ["light", "dark"];

const light = MeshBuilder.CreateGround("gl", { width: 60, height: 30 }, scene);
paint(light, "#c9ecb0");
light.position.z = 15 - 2;
finishMesh(light, scene, { outline: false, castShadow: false });
const dark = MeshBuilder.CreateGround("gd", { width: 60, height: 30 }, scene);
paint(dark, "#3d2c4c");
dark.position.z = -15 - 2;
dark.position.y = 0.002;
finishMesh(dark, scene, { outline: false, castShadow: false });

const build = (k: EnemyKind | "happy") => (k === "happy" ? buildHappyBlob(scene) : buildEnemy(scene, k));
const width = (k: EnemyKind | "happy") => (k === "gloomking" ? 3.4 : 1.25);

interface Slot {
  k: EnemyKind | "happy";
  m: EnemyModel;
  pos: Vector3;
  st: EnemyAnimState;
  off: number;
  timer: number;
}
const slots: Slot[] = [];
const st = (): EnemyAnimState => ({ speed: anim === "walk" ? 1 : 0, windup: anim === "windup" });
const strip = +(q.get("strip") ?? "0");
const stripDt = +(q.get("dt") ?? "0.06");
if (only && strip > 0) {
  for (let i = 0; i < strip; i++) {
    const pos = new Vector3((i - (strip - 1) / 2) * width(only), 0, 0);
    slots.push({ k: only, m: build(only), pos, st: st(), off: i * stripDt, timer: 0 });
  }
} else {
  rows.forEach((row) => {
    const z = row === "light" ? 0 : -4.5;
    const total = kinds.reduce((a, k) => a + width(k), 0);
    let x = total / 2;
    for (const k of kinds) {
      const w = width(k);
      x -= w / 2;
      slots.push({ k, m: build(k), pos: new Vector3(x, 0, z), st: st(), off: 0, timer: 0.25 });
      x -= w / 2;
    }
  });
}
for (const s of slots) s.m.root.position.copyFrom(s.pos);

const far = q.get("far") === "1";
const zoom = q.get("zoom") === "1";
const cam = new ArcRotateCamera("cam", Math.PI / 2, 1.25, 12, new Vector3(0, 0.6, -2), scene);
cam.fov = 0.6;
if (only && strip > 0) {
  cam.target.set(0, slots[0].m.height * 0.45, 0);
  cam.radius = strip * width(only) * 0.95;
  cam.beta = 1.35;
} else if (only) {
  const h = slots[0].m.height;
  cam.target.set(0, h * 0.5, rows.length > 1 ? -2.25 : slots[0].pos.z);
  cam.radius = h * (zoom ? 2.6 : 4.2) + (rows.length > 1 ? 7 : 0);
  cam.beta = rows.length > 1 ? 1.05 : 1.3;
} else if (zoom) cam.radius = 8;
if (far) {
  cam.radius = 22;
  cam.beta = (40 * Math.PI) / 180;
  cam.target.set(0, 0.4, -2);
}
if (q.get("alpha")) cam.alpha = +q.get("alpha")!;
if (q.get("beta")) cam.beta = +q.get("beta")!;
if (q.get("radius")) cam.radius = +q.get("radius")!;
cam.minZ = 0.05;
cam.attachControl(true);
stage.setupPipeline([cam]);

function loopPeriod(k: EnemyKind | "happy") {
  if (anim === "attack") return k === "gloomking" ? 2.0 : 1.2;
  if (anim === "hit") return 0.7;
  if (anim === "poof") return 1.5;
  return 0;
}
function step(dt: number) {
  for (const s of slots) {
    const p = loopPeriod(s.k);
    if (p > 0) {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer += p;
        if (anim === "attack") s.m.attack();
        else if (anim === "hit") s.m.hit();
        else if (anim === "poof") {
          if ((s.m as any).__poofed) {
            // rebuild a fresh one, poof it next cycle
            s.m.dispose();
            s.m = build(s.k);
            s.m.root.position.copyFrom(s.pos);
            s.timer = 0.7;
          } else {
            s.m.poof();
            (s.m as any).__poofed = true;
          }
        }
      }
    }
    s.m.update(dt, s.st);
  }
}
const pre = +(q.get("t") ?? "0");
for (let t = 0; t < pre; t += 1 / 60) step(1 / 60);
for (const s of slots) {
  if (s.off <= 0) continue;
  // film strip: trigger at t=0 then advance this copy `off` seconds
  if (anim === "attack") s.m.attack();
  if (anim === "hit") s.m.hit();
  if (anim === "poof") s.m.poof();
  for (let t = 0; t < s.off - 1e-6; t += 1 / 60) s.m.update(1 / 60, s.st);
}
if (strip > 0 && slots[0]) {
  if (anim === "attack") slots[0].m.attack();
  if (anim === "hit") slots[0].m.hit();
  if (anim === "poof") slots[0].m.poof();
  slots[0].m.update(1 / 60, slots[0].st);
  for (const s of slots) s.timer = 1e9;
}
const freeze = q.get("freeze") === "1" || strip > 0;

function countDraws(m: EnemyModel) {
  const ms = m.root.getChildMeshes(false).filter((x: AbstractMesh) => x.isEnabled() && x.isVisible && x.material);
  const casters = ms.filter((x) => stage.shadows.getShadowMap()?.renderList?.includes(x)).length;
  const verts = ms.reduce((a, x) => a + x.getTotalVertices(), 0);
  return `${ms.length} draws + ${casters} shadow, ${verts} verts`;
}
const hud = document.getElementById("hud") as HTMLElement;
const seen = new Set<string>();
hud.textContent = `anim=${anim}\n` + slots.filter((s) => (seen.has(s.k) ? false : (seen.add(s.k), true))).map((s) => `${s.k}: h=${s.m.height} r=${s.m.radius} · ${countDraws(s.m)}${s.k !== "happy" ? ` · atk ${ENEMY_ATTACK[s.k].dur}s` : ""}`).join("\n");

if (q.get("debug") === "1")
  for (const s of slots.slice(0, kinds.length))
    hud.textContent += `\n${s.k}: ` + s.m.root.getChildMeshes(false).map((x) => `${x.name}=${x.getTotalVertices()}`).join(" ");
scene.onBeforeRenderObservable.add(() => {
  if (!freeze) step(Math.min(0.05, stage.engine.getDeltaTime() / 1000));
});
let frames = 0,
  readyAt = -1;
scene.onAfterRenderObservable.add(() => {
  frames++;
  if (readyAt < 0 && frames > 3 && scene.isReady(true)) readyAt = frames + 12;
  if (frames === readyAt) (window as any).__ready = true;
});
(window as any).slots = slots;
stage.engine.runRenderLoop(() => scene.render());
