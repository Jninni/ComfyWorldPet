import {
  Engine,
  Scene,
  Color3,
  Color4,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  MeshBuilder,
  StandardMaterial,
  type Camera,
  type Mesh,
  VertexBuffer,
} from "@babylonjs/core";
import { col } from "./Palette";
import { setShadowHook } from "./Shapes";
import { ToonPlugin } from "./Toon";

export type Quality = "low" | "medium" | "high";

export interface StageLighting {
  sky: string;
  ground: string;
  hemi: number;
  sun: string;
  sunI: number;
  sunDir: [number, number, number];
  fog: string;
  fogDensity: number;
  clear: string;
  skyTop: string;
  skyHorizon: string;
}

export const OUTDOOR_LIGHT: StageLighting = {
  sky: "#f3ecff",
  ground: "#d8c7b8",
  hemi: 0.62,
  sun: "#fff1dc",
  sunI: 0.95,
  sunDir: [-0.55, -1, 0.45],
  fog: "#f4dff0",
  fogDensity: 0.0042,
  clear: "#cfe6fb",
  skyTop: "#a9d4f5",
  skyHorizon: "#fbe0ef",
};

export function detectQuality(): Quality {
  const params = new URLSearchParams(location.search);
  const q = params.get("q");
  if (q === "low" || q === "medium" || q === "high") return q;
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 1;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua) || (touch && /Macintosh/.test(ua));
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return cores >= 6 ? "medium" : "low";
  return "high";
}

/**
 * Stage: engine + scene + lights + shadows + post FX, tuned per quality tier.
 */
export class Stage {
  engine: Engine;
  scene: Scene;
  hemi: HemisphericLight;
  sun: DirectionalLight;
  shadows: ShadowGenerator;
  pipeline: DefaultRenderingPipeline | null = null;
  quality: Quality;
  skyDome: Mesh;
  private dprCap: number;
  private fpsSamples: number[] = [];
  private dynScale = 1;
  shadowFocus = new Vector3();

  constructor(public canvas: HTMLCanvasElement, quality: Quality = detectQuality()) {
    this.quality = quality;
    this.engine = new Engine(canvas, quality !== "low", {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: quality !== "low",
      powerPreference: "high-performance",
      adaptToDeviceRatio: false,
    });
    this.dprCap = quality === "high" ? 2 : quality === "medium" ? 1.5 : 1;
    this.applyScaling();
    window.addEventListener("resize", () => {
      this.applyScaling();
      this.engine.resize();
    });

    const scene = (this.scene = new Scene(this.engine));
    scene.clearColor = Color4.FromColor3(col(OUTDOOR_LIGHT.clear), 1);
    scene.ambientColor = new Color3(0, 0, 0);
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;

    this.hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, -0.3), scene);
    this.sun = new DirectionalLight("sun", new Vector3(-0.55, -1, 0.45).normalize(), scene);
    this.sun.position = new Vector3(30, 60, -30);
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 160;
    this.sun.autoUpdateExtends = false;
    this.sun.autoCalcShadowZBounds = false;
    this.setShadowArea(46);

    const size = quality === "low" ? 1024 : 2048;
    const sg = (this.shadows = new ShadowGenerator(size, this.sun));
    sg.usePercentageCloserFiltering = quality !== "low";
    sg.filteringQuality = quality === "high" ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    sg.bias = 0.0015;
    sg.normalBias = 0.02;
    sg.darkness = 0.38;
    sg.transparencyShadow = false;
    setShadowHook((m, cast, recv) => {
      if (cast) sg.addShadowCaster(m, false);
      m.receiveShadows = recv;
    });

    // sky dome with soft vertical gradient
    this.skyDome = MeshBuilder.CreateSphere("sky", { diameter: 600, segments: 24, sideOrientation: 1 }, scene);
    const sm = new StandardMaterial("skyMat", scene);
    sm.disableLighting = true;
    sm.emissiveColor = Color3.White();
    sm.diffuseColor = Color3.Black();
    sm.fogEnabled = false;
    sm.backFaceCulling = false;
    this.skyDome.material = sm;
    this.skyDome.infiniteDistance = true;
    this.skyDome.isPickable = false;
    this.skyDome.applyFog = false;
    this.setLighting(OUTDOOR_LIGHT);

    scene.onBeforeRenderObservable.add(() => {
      ToonPlugin.time += this.engine.getDeltaTime() / 1000;
      this.updateShadowFrustum();
      this.monitorPerf();
    });
  }

  private applyScaling() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.dynScale;
    this.engine.setHardwareScalingLevel(1 / dpr);
  }

  /** Dynamic resolution: if frame rate sags, render fewer pixels. */
  private monitorPerf() {
    const fps = this.engine.getFps();
    if (!isFinite(fps) || fps <= 0) return;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length < 120) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples.length = 0;
    if (avg < 40 && this.dynScale > 0.6) {
      this.dynScale = Math.max(0.6, this.dynScale - 0.1);
      this.applyScaling();
    } else if (avg > 57 && this.dynScale < 1) {
      this.dynScale = Math.min(1, this.dynScale + 0.05);
      this.applyScaling();
    }
  }

  setShadowArea(half: number) {
    this.sun.orthoLeft = -half;
    this.sun.orthoRight = half;
    this.sun.orthoTop = half;
    this.sun.orthoBottom = -half;
  }

  private updateShadowFrustum() {
    const d = this.sun.direction;
    // snap focus to texel grid to avoid shimmering
    const snap = 0.5;
    const fx = Math.round(this.shadowFocus.x / snap) * snap;
    const fz = Math.round(this.shadowFocus.z / snap) * snap;
    this.sun.position.set(fx - d.x * 80, this.shadowFocus.y - d.y * 80, fz - d.z * 80);
  }

  setLighting(L: StageLighting) {
    this.hemi.diffuse = col(L.sky);
    this.hemi.groundColor = col(L.ground);
    this.hemi.intensity = L.hemi;
    this.hemi.specular = Color3.Black();
    this.sun.diffuse = col(L.sun);
    this.sun.intensity = L.sunI;
    this.sun.specular = new Color3(0.3, 0.3, 0.3);
    this.sun.direction = new Vector3(...L.sunDir).normalize();
    const s = this.scene;
    s.fogMode = L.fogDensity > 0 ? Scene.FOGMODE_EXP2 : Scene.FOGMODE_NONE;
    s.fogDensity = L.fogDensity;
    s.fogColor = col(L.fog);
    s.clearColor = Color4.FromColor3(col(L.clear), 1);
    // repaint sky gradient
    const pos = this.skyDome.getVerticesData(VertexBuffer.PositionKind)!;
    const n = pos.length / 3;
    const colors = new Float32Array(n * 4);
    const top = col(L.skyTop),
      hor = col(L.skyHorizon);
    for (let i = 0; i < n; i++) {
      const y = pos[i * 3 + 1] / 300;
      const t = Math.min(1, Math.max(0, (y + 0.05) / 0.55));
      const s2 = Math.pow(t, 0.8);
      colors[i * 4] = hor.r + (top.r - hor.r) * s2;
      colors[i * 4 + 1] = hor.g + (top.g - hor.g) * s2;
      colors[i * 4 + 2] = hor.b + (top.b - hor.b) * s2;
      colors[i * 4 + 3] = 1;
    }
    this.skyDome.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  }

  setupPipeline(cameras: Camera[]) {
    this.pipeline?.dispose();
    const q = this.quality;
    const p = new DefaultRenderingPipeline("post", q !== "low", this.scene, cameras);
    p.samples = q === "high" ? 4 : 1;
    p.fxaaEnabled = q !== "high";
    p.imageProcessingEnabled = true;
    const ip = p.imageProcessing;
    ip.toneMappingEnabled = false;
    ip.contrast = 1.12;
    ip.exposure = 1.02;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.6;
    ip.vignetteStretch = 0.4;
    ip.vignetteColor = new Color4(0.55, 0.42, 0.62, 0);
    ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
    ip.colorCurvesEnabled = true;
    const cc = ip.colorCurves!;
    cc.globalSaturation = 16;
    cc.shadowsHue = 280;
    cc.shadowsDensity = 18;
    cc.shadowsSaturation = 30;
    cc.highlightsHue = 40;
    cc.highlightsDensity = 10;
    cc.highlightsSaturation = 20;
    p.bloomEnabled = q !== "low";
    p.bloomThreshold = 0.82;
    p.bloomWeight = 0.28;
    p.bloomKernel = 48;
    p.bloomScale = 0.5;
    p.sharpenEnabled = false;
    p.depthOfFieldEnabled = false;
    this.pipeline = p;
    return p;
  }

  /** Optional diorama tilt-shift (high quality only). */
  setTiltShift(on: boolean, focusDistance = 22000, fStop = 2.4) {
    if (!this.pipeline || this.quality !== "high") return;
    this.pipeline.depthOfFieldEnabled = on;
    if (on) {
      const dof = this.pipeline.depthOfField;
      dof.focusDistance = focusDistance;
      dof.fStop = fStop;
      dof.focalLength = 50;
      this.pipeline.depthOfFieldBlurLevel = 0;
    }
  }
}
