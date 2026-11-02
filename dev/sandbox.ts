import { ArcRotateCamera, Vector3, MeshBuilder } from "@babylonjs/core";
import { Stage } from "../src/render/Stage";
import { Batch, ball, softBox, softCyl, cone, scallopRug, finishMesh, paint } from "../src/render/Shapes";

const stage = new Stage(document.getElementById("c") as HTMLCanvasElement);
const scene = stage.scene;
const cam = new ArcRotateCamera("cam", -Math.PI / 2.4, 0.95, 18, new Vector3(0, 1, 0), scene);
cam.fov = 0.6;
cam.attachControl(true);
stage.setupPipeline([cam]);

const ground = MeshBuilder.CreateGround("g", { width: 40, height: 40, subdivisions: 2 }, scene);
paint(ground, "grass");
finishMesh(ground, scene, { outline: false, castShadow: false });

const b = new Batch(scene, "props");
b.add(softBox(scene, 3, 2, 3, { pos: [-4, 1, 0], color: "lavender", bottom: "lavenderDeep" }, 0.3));
b.add(softBox(scene, 3.4, 0.4, 3.4, { pos: [-4, 2.1, 0], color: "pink" }, 0.18));
b.add(ball(scene, 1, { pos: [0, 1, 0], color: "butter" }, 20));
b.add(softCyl(scene, 1.4, 0.7, 0.55, { pos: [3, 0, 0], color: "pink", bottom: "pinkDeep" }));
b.add(cone(scene, 2.4, 1.1, { pos: [3, 1.4, 3], color: "leaf", bottom: "leafDeep" }));
b.add(scallopRug(scene, 1.5, 10, { pos: [0, 0.01, 3], color: "cream" }));
b.build();
(window as any).__ready = true;
stage.engine.runRenderLoop(() => scene.render());
