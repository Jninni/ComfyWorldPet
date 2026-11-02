import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Texture,
  VertexBuffer,
  VertexData,
  ShaderMaterial,
  Effect,
  Color3,
  Vector4,
  type Scene,
} from "@babylonjs/core";
import { ToonPlugin } from "../render/Toon";
import { col } from "../render/Palette";
import { WORLD, heightAt, walkField, ellipseD, POND, PATHS, PLAZA, fbm, WATER_Y, ZONE_SHAPES } from "./layout";

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Paint the whole overworld ground into one big canvas texture. */
function paintGround(texW: number, texH: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = texW;
  cv.height = texH;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(texW, texH);
  const d = img.data;
  const W = WORLD.maxX - WORLD.minX,
    H = WORLD.maxZ - WORLD.minZ;

  const grass = col("#b5e39a"),
    grassLight = col("#cdeeac"),
    meadow = col("#c9ec9e"),
    woods = col("#93cf8a"),
    woodsDeep = col("#7fbf82"),
    hill = col("#a6d98f"),
    hillTop = col("#bfe6a0"),
    sand = col("#f6e3bd"),
    pondBed = col("#8fd0e6"),
    villageG = col("#bde6a0");

  const meadowE = ZONE_SHAPES[1].e,
    woodsE = ZONE_SHAPES[2].e;

  for (let py = 0; py < texH; py++) {
    const z = WORLD.maxZ - (py / texH) * H;
    for (let px = 0; px < texW; px++) {
      const x = WORLD.minX + (px / texW) * W;
      const w = walkField(x, z);
      const n = fbm(x * 0.12, z * 0.12);
      const n2 = fbm(x * 0.6 + 7, z * 0.6);
      // base by region
      let r = villageG.r,
        g = villageG.g,
        b = villageG.b;
      const mt = smooth(1.05, 0.7, ellipseD(meadowE, x, z));
      r += (meadow.r - r) * mt;
      g += (meadow.g - g) * mt;
      b += (meadow.b - b) * mt;
      const wt = smooth(1.1, 0.6, ellipseD(woodsE, x, z));
      const wc = n > 0.5 ? woodsDeep : woods;
      r += (wc.r - r) * wt;
      g += (wc.g - g) * wt;
      b += (wc.b - b) * wt;
      // patches
      const pt = smooth(0.45, 0.62, n) * 0.5;
      r += (grassLight.r - r) * pt;
      g += (grassLight.g - g) * pt;
      b += (grassLight.b - b) * pt;
      const gt = smooth(0.62, 0.4, n) * 0.25;
      r += (grass.r - r) * gt;
      g += (grass.g - g) * gt;
      b += (grass.b - b) * gt;
      // hills
      const ht = smooth(0.95, 1.4, w);
      const hc = n2 > 0.55 ? hillTop : hill;
      r += (hc.r - r) * ht;
      g += (hc.g - g) * ht;
      b += (hc.b - b) * ht;
      // pond: sand shore + bed
      const pd = ellipseD(POND, x, z);
      const st = smooth(1.25, 1.02, pd) * (0.85 + n2 * 0.15);
      r += (sand.r - r) * st;
      g += (sand.g - g) * st;
      b += (sand.b - b) * st;
      const bt = smooth(0.98, 0.85, pd);
      r += (pondBed.r - r) * bt;
      g += (pondBed.g - g) * bt;
      b += (pondBed.b - b) * bt;
      // fine speckle so it reads as soft felt
      const sp = (n2 - 0.5) * 0.05;
      const i = (py * texW + px) * 4;
      d[i] = Math.max(0, Math.min(255, (r + sp) * 255));
      d[i + 1] = Math.max(0, Math.min(255, (g + sp) * 255));
      d[i + 2] = Math.max(0, Math.min(255, (b + sp * 0.6) * 255));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const toPx = (x: number, z: number): [number, number] => [((x - WORLD.minX) / W) * texW, ((WORLD.maxZ - z) / H) * texH];
  const s = texW / W;

  // paths: soft outer edge, then fill, then pebble dots
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const strokePaths = (extra: number, color: string, blur = 0) => {
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    for (const p of PATHS) {
      ctx.lineWidth = (p.w + extra) * s;
      ctx.beginPath();
      p.pts.forEach(([x, z], i) => {
        const [u, v] = toPx(x, z);
        if (i === 0) ctx.moveTo(u, v);
        else ctx.lineTo(u, v);
      });
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  };
  strokePaths(1.2, "#d9e7a6", 6 * s);
  strokePaths(0.4, "#e8d2a8");
  strokePaths(-0.2, "#f3e2bf");
  // plaza: round tiled stone
  const [pu, pv] = toPx(PLAZA.x, PLAZA.z);
  ctx.fillStyle = "#e6d9ef";
  ctx.beginPath();
  ctx.arc(pu, pv, (PLAZA.r + 0.6) * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f4eaf7";
  ctx.beginPath();
  ctx.arc(pu, pv, PLAZA.r * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#dccbe6";
  ctx.lineWidth = 0.12 * s;
  for (let ring = 2; ring < PLAZA.r; ring += 1.6) {
    ctx.beginPath();
    ctx.arc(pu, pv, ring * s, 0, Math.PI * 2);
    ctx.stroke();
    const segs = Math.floor(ring * 3.2);
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2 + ring;
      ctx.beginPath();
      ctx.moveTo(pu + Math.cos(a) * ring * s, pv + Math.sin(a) * ring * s);
      ctx.lineTo(pu + Math.cos(a) * (ring + 1.6) * s, pv + Math.sin(a) * (ring + 1.6) * s);
      ctx.stroke();
    }
  }
  // heart mosaic in the plaza centre ring
  ctx.fillStyle = "#f8c6d6";
  const heart = (u: number, v: number, size: number) => {
    ctx.beginPath();
    ctx.moveTo(u, v + size * 0.35);
    ctx.bezierCurveTo(u - size, v - size * 0.35, u - size * 0.45, v - size * 1.0, u, v - size * 0.45);
    ctx.bezierCurveTo(u + size * 0.45, v - size * 1.0, u + size, v - size * 0.35, u, v + size * 0.35);
    ctx.fill();
  };
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    heart(pu + Math.cos(a) * 6.3 * s, pv + Math.sin(a) * 6.3 * s, 0.7 * s);
  }
  // pebbles along paths
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "rgba(214,190,150,0.55)";
  for (const p of PATHS) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i],
        [bx, bz] = p.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let k = 0; k < len * 2.2; k++) {
        const t = rnd();
        const off = (rnd() - 0.5) * p.w * 0.8;
        const nx = -(bz - az) / len,
          nz = (bx - ax) / len;
        const [u, v] = toPx(ax + (bx - ax) * t + nx * off, az + (bz - az) * t + nz * off);
        ctx.beginPath();
        ctx.ellipse(u, v, (0.12 + rnd() * 0.15) * s, (0.09 + rnd() * 0.1) * s, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // clover / tiny flower specks
  for (let k = 0; k < 5000; k++) {
    const x = WORLD.minX + rnd() * W,
      z = WORLD.minZ + rnd() * H;
    if (walkField(x, z) > 1.05 || ellipseD(POND, x, z) < 1.1) continue;
    const [u, v] = toPx(x, z);
    const c = rnd();
    ctx.fillStyle = c < 0.5 ? "rgba(255,255,255,0.55)" : c < 0.75 ? "rgba(255,214,230,0.6)" : "rgba(255,240,170,0.6)";
    ctx.beginPath();
    ctx.arc(u, v, (0.06 + rnd() * 0.06) * s, 0, Math.PI * 2);
    ctx.fill();
  }
  return cv;
}

export interface TerrainResult {
  ground: Mesh;
  water: Mesh;
  update(t: number): void;
}

export function buildTerrain(scene: Scene, quality: "low" | "medium" | "high"): TerrainResult {
  const W = WORLD.maxX - WORLD.minX,
    H = WORLD.maxZ - WORLD.minZ;
  const subX = quality === "low" ? 110 : 160;
  const subZ = Math.round((subX * H) / W);
  const ground = MeshBuilder.CreateGround("ground", { width: W, height: H, subdivisionsX: subX, subdivisionsY: subZ, updatable: true }, scene);
  ground.position.set(WORLD.minX + W / 2, 0, WORLD.minZ + H / 2);
  const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] + ground.position.x,
      z = pos[i + 2] + ground.position.z;
    pos[i + 1] = heightAt(x, z);
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, pos);
  const idx = ground.getIndices()!;
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  ground.updateVerticesData(VertexBuffer.NormalKind, normals);

  const texW = quality === "low" ? 1536 : 2048;
  const texH = Math.round((texW * H) / W);
  const canvas = paintGround(texW, texH);
  const tex = new DynamicTexture("groundTex", { width: texW, height: texH }, scene, true);
  tex.getContext().drawImage(canvas, 0, 0);
  tex.update(true);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = quality === "high" ? 8 : 4;
  const mat = new StandardMaterial("groundMat", scene);
  mat.diffuseTexture = tex;
  mat.specularColor = Color3.Black();
  const tp = new ToonPlugin(mat);
  tp.rimStrength = 0.0;
  tp.ramp.strength = 0.55;
  ground.material = mat;
  ground.receiveShadows = true;
  ground.isPickable = false;
  ground.freezeWorldMatrix();
  mat.freeze();

  // ---------------- water ----------------
  Effect.ShadersStore["cwpWaterVertexShader"] = `
    precision highp float;
    attribute vec3 position;
    uniform mat4 world; uniform mat4 viewProjection; uniform float time;
    varying vec3 vW;
    void main(){
      vec4 w = world * vec4(position,1.0);
      w.y += sin(w.x*0.6+time*1.3)*0.03 + cos(w.z*0.5+time*1.1)*0.03;
      vW = w.xyz;
      gl_Position = viewProjection * w;
    }`;
  Effect.ShadersStore["cwpWaterFragmentShader"] = `
    precision highp float;
    varying vec3 vW;
    uniform float time; uniform vec4 pond; uniform vec3 shallow; uniform vec3 deep; uniform vec3 foam; uniform vec3 eye;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec2 d = (vW.xz - pond.xy) / pond.zw;
      float e = length(d);
      vec3 c = mix(deep, shallow, smoothstep(0.15, 0.95, e));
      // soft moving caustic bands
      float band = sin(vW.x*0.9 + time*0.8 + sin(vW.z*0.7+time*0.6)*1.6) * sin(vW.z*0.8 - time*0.7 + sin(vW.x*0.5)*1.4);
      c += smoothstep(0.55, 0.95, band) * 0.10;
      // sparkles
      vec2 g = floor(vW.xz*2.2);
      float sp = hash(g);
      float tw = sin(time*3.0 + sp*40.0);
      c += step(0.985, sp) * smoothstep(0.6,1.0,tw) * 0.6;
      // shoreline foam ring
      float f = smoothstep(0.82, 0.9, e) * (0.75 + 0.25*sin(e*80.0 - time*2.0));
      c = mix(c, foam, f*0.85);
      // fresnel-ish sky tint
      vec3 v = normalize(eye - vW);
      c = mix(c, vec3(0.93,0.9,1.0), pow(1.0 - max(v.y,0.0), 3.0) * 0.35);
      gl_FragColor = vec4(c, 0.92);
    }`;
  const water = MeshBuilder.CreateDisc("water", { radius: 1, tessellation: 64 }, scene);
  water.rotation.x = Math.PI / 2;
  water.scaling.set(POND.rx * 0.98, POND.rz * 0.98, 1);
  water.position.set(POND.cx, WATER_Y, POND.cz);
  const wm = new ShaderMaterial(
    "waterMat",
    scene,
    { vertex: "cwpWater", fragment: "cwpWater" },
    { attributes: ["position"], uniforms: ["world", "viewProjection", "time", "pond", "shallow", "deep", "foam", "eye"], needAlphaBlending: true },
  );
  wm.setVector4("pond", new Vector4(POND.cx, POND.cz, POND.rx, POND.rz));
  const sh = col("#aee3f5"),
    dp = col("#76bfe6"),
    fo = col("#ffffff");
  wm.setColor3("shallow", sh);
  wm.setColor3("deep", dp);
  wm.setColor3("foam", fo);
  wm.backFaceCulling = false;
  water.material = wm;
  water.isPickable = false;

  return {
    ground,
    water,
    update(t: number) {
      wm.setFloat("time", t);
      const cam = scene.activeCamera;
      if (cam) wm.setVector3("eye", cam.globalPosition);
    },
  };
}
