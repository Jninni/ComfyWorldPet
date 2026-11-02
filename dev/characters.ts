/**
 * Character lineup test page.
 *  ?only=player|mayor|granny|...   close-up of one character
 *  ?set=npcs|players               only one row
 *  ?view=game                      gameplay camera (~22 m, 35° fov)
 *  ?anim=idle|walk|run|talk|celebrate   ?emote=wave|happy|surprised|think|nod (repeats)
 *  ?yaw=deg                        rotate every character; ?cam=alphaDeg,betaDeg,radius
 *  ?hat=crown&skin=..&hair=..&outfit=..   (player look for ?only=player)
 */
import { ArcRotateCamera, Vector3, MeshBuilder } from "@babylonjs/core";
import { Stage } from "../src/render/Stage";
import { finishMesh, paint, scallopRug } from "../src/render/Shapes";
import { buildPlayer, buildNpc, DEFAULT_LOOK, LOOK_OPTIONS, NPC_INFO, type CharacterModel, type NpcId, type PlayerLook, type HatId } from "../src/entities/characterModels";

const q = new URLSearchParams(location.search);
const only = q.get("only");
const set = q.get("set");
const view = q.get("view");
const anim = q.get("anim") ?? "idle";
const emote = q.get("emote") as Parameters<CharacterModel["emote"]>[0] | null;
const yaw = ((+(q.get("yaw") ?? 0)) * Math.PI) / 180;

const stage = new Stage(document.getElementById("c") as HTMLCanvasElement);
const scene = stage.scene;
const cam = new ArcRotateCamera("cam", Math.PI / 2, 1.2, 14, new Vector3(0, 0.7, 0), scene);
cam.fov = 0.6;
cam.minZ = 0.05;
cam.attachControl(true);
cam.wheelPrecision = 60;
stage.setupPipeline([cam]);

const ground = MeshBuilder.CreateGround("g", { width: 60, height: 60, subdivisions: 2 }, scene);
paint(ground, "grass");
finishMesh(ground, scene, { outline: false, castShadow: false });

const chars: { m: CharacterModel; x: number }[] = [];
const ids = Object.keys(NPC_INFO) as NpcId[];

function place(m: CharacterModel, x: number, z: number) {
  m.root.position.set(x, 0, z);
  m.root.rotation.y = yaw;
  const rug = scallopRug(scene, 0.45, 9, { pos: [x, 0.005, z], color: "#fff6e6" });
  finishMesh(rug, scene, { outline: false, castShadow: false });
  chars.push({ m, x });
}

const looks: PlayerLook[] = [
  DEFAULT_LOOK,
  { skin: LOOK_OPTIONS.skin[1], hair: LOOK_OPTIONS.hair[2], outfit: LOOK_OPTIONS.outfit[1], hat: "bunnyears" },
  { skin: LOOK_OPTIONS.skin[3], hair: LOOK_OPTIONS.hair[1], outfit: LOOK_OPTIONS.outfit[2], hat: "strawhat" },
  { skin: LOOK_OPTIONS.skin[2], hair: LOOK_OPTIONS.hair[3], outfit: LOOK_OPTIONS.outfit[3], hat: "beret" },
  { skin: LOOK_OPTIONS.skin[4], hair: LOOK_OPTIONS.hair[5], outfit: LOOK_OPTIONS.outfit[4], hat: "crown" },
  { skin: LOOK_OPTIONS.skin[0], hair: LOOK_OPTIONS.hair[4], outfit: LOOK_OPTIONS.outfit[5], hat: "flower" },
];

let focusH = 1.2;
if (only) {
  if (only === "player") {
    const look: PlayerLook = {
      skin: q.get("skin") ?? DEFAULT_LOOK.skin,
      hair: q.get("hair") ?? DEFAULT_LOOK.hair,
      outfit: q.get("outfit") ?? DEFAULT_LOOK.outfit,
      hat: (q.get("hat") as HatId) ?? DEFAULT_LOOK.hat,
    };
    const m = buildPlayer(scene, look);
    place(m, 0, 0);
    focusH = m.height;
  } else {
    const m = buildNpc(scene, only as NpcId);
    place(m, 0, 0);
    focusH = m.height;
  }
  cam.target.set(0, focusH * 0.55, 0);
  cam.radius = focusH * 2.6;
  cam.beta = 1.42;
} else {
  if (set !== "npcs") looks.forEach((lk, i) => place(buildPlayer(scene, lk), (i - (looks.length - 1) / 2) * 1.15, 1.2));
  if (set !== "players") ids.forEach((id, i) => place(buildNpc(scene, id), (i - (ids.length - 1) / 2) * 1.25, -0.4));
  cam.radius = 13;
  cam.beta = 1.25;
  if (set) {
    cam.radius = 10;
    cam.target.y = 0.7;
  }
}
if (view === "game") {
  cam.fov = (35 * Math.PI) / 180;
  cam.radius = 22;
  cam.beta = 0.95;
  cam.target.set(0, 0.6, 0);
}
const camQ = q.get("cam");
if (camQ) {
  const [a, b, r] = camQ.split(",").map(Number);
  cam.alpha = (a * Math.PI) / 180;
  cam.beta = (b * Math.PI) / 180;
  if (r) cam.radius = r;
}

// look-at demo: everyone looks at a point orbiting in front of them
const lookPt = new Vector3(0, 1, 3);
const lookOn = q.get("look") === "1";
let emoteTimer = 0.3;
const hud = document.getElementById("hud")!;
scene.onBeforeRenderObservable.add(() => {
  const dt = stage.engine.getDeltaTime() / 1000;
  const t = performance.now() / 1000;
  lookPt.set(Math.sin(t * 0.8) * 4, 1 + Math.sin(t * 1.3) * 0.6, 3);
  const speed = anim === "walk" ? 0.45 : anim === "run" ? 1 : 0;
  if (emote) {
    emoteTimer -= dt;
    if (emoteTimer <= 0) {
      emoteTimer = 2.2;
      for (const c of chars) c.m.emote(emote);
    }
  }
  for (const c of chars) {
    if (lookOn) c.m.lookAt(lookPt);
    c.m.update(dt, { speed, talking: anim === "talk", celebrate: anim === "celebrate" });
  }
  hud.textContent = `${scene.getActiveMeshes().length} active meshes · ${stage.engine.getFps().toFixed(0)} fps`;
});

// draw-call stats per character for the console
for (const c of chars) {
  const ms = c.m.root.getChildMeshes(false);
  const verts = ms.reduce((a, m) => a + m.getTotalVertices(), 0);
  console.log(`${c.m.root.name}: ${ms.length} meshes (${ms.filter((m) => !m.name.endsWith(".outline")).length} + outlines), ${verts} verts, height ${c.m.height}`);
}
(window as unknown as { __freeze: () => void }).__freeze = () => {
  stage.engine.stopRenderLoop();
  scene.render();
};
(window as unknown as { __ready: boolean }).__ready = true;
(window as unknown as { chars: unknown }).chars = chars;
stage.engine.runRenderLoop(() => scene.render());
