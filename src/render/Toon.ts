import {
  MaterialPluginBase,
  StandardMaterial,
  Color3,
  type Material,
  type Scene,
  type UniformBuffer,
  type MaterialDefines,
  type AbstractMesh,
} from "@babylonjs/core";
import { col } from "./Palette";

/**
 * ToonPlugin — turns Babylon's StandardMaterial into a soft "plush sticker" shader:
 *  - 2-band soft cel ramp on the accumulated diffuse light (keeps shadows + light tints)
 *  - fuzzy rim light (gives felt/plush silhouettes)
 *  - optional vertex wind sway (grass, leaves, flowers)
 */
export class ToonPlugin extends MaterialPluginBase {
  /** ramp edge (0..1 light level), ramp softness, shade level, toon strength */
  ramp = { edge: 0.5, soft: 0.14, shade: 0.7, strength: 0.75 };
  shadeTint = new Color3(0.86, 0.8, 1.0);
  rimColor = new Color3(1.0, 0.97, 1.0);
  rimStrength = 0.22;
  rimPower = 2.6;
  wind = 0;
  private _on = false;

  static time = 0;

  constructor(material: Material) {
    super(material, "Toon", 200, { TOON: false, TOONWIND: false });
    this._enable(true);
    this._on = true;
  }

  get isEnabled() {
    return this._on;
  }

  override getClassName() {
    return "ToonPlugin";
  }

  override prepareDefines(defines: MaterialDefines, _scene: Scene, _mesh: AbstractMesh) {
    defines["TOON"] = this._on;
    defines["TOONWIND"] = this._on && this.wind > 0;
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "toonRamp", size: 4, type: "vec4" },
        { name: "toonShade", size: 3, type: "vec3" },
        { name: "toonRim", size: 4, type: "vec4" },
        { name: "toonWind", size: 2, type: "vec2" },
      ],
      vertex: `#ifdef TOON
        uniform vec2 toonWind;
      #endif`,
      fragment: `#ifdef TOON
        uniform vec4 toonRamp;
        uniform vec3 toonShade;
        uniform vec4 toonRim;
      #endif`,
    };
  }

  override bindForSubMesh(ubo: UniformBuffer) {
    if (!this._on) return;
    ubo.updateFloat4("toonRamp", this.ramp.edge, this.ramp.soft, this.ramp.shade, this.ramp.strength);
    ubo.updateColor3("toonShade", this.shadeTint);
    ubo.updateFloat4("toonRim", this.rimColor.r * this.rimStrength, this.rimColor.g * this.rimStrength, this.rimColor.b * this.rimStrength, this.rimPower);
    ubo.updateFloat2("toonWind", ToonPlugin.time, this.wind);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `
          #ifdef TOONWIND
          {
            float h = max(positionUpdated.y, 0.0);
            float ph = worldPos.x * 0.35 + worldPos.z * 0.27;
            float s = sin(toonWind.x * 1.9 + ph) * 0.6 + sin(toonWind.x * 3.3 + ph * 1.7) * 0.25;
            worldPos.x += s * h * toonWind.y;
            worldPos.z += cos(toonWind.x * 1.6 + ph) * 0.5 * h * toonWind.y;
          }
          #endif
        `,
      };
    }
    if (shaderType === "fragment") {
      return {
        // soft 2-band ramp on accumulated light, inserted right before diffuse composition
        "!vec3 finalDiffuse=": `
          #ifdef TOON
          {
            float tl = dot(diffuseBase, vec3(0.3, 0.55, 0.15));
            float tk = smoothstep(toonRamp.x - toonRamp.y, toonRamp.x + toonRamp.y, tl);
            vec3 hue = diffuseBase / max(tl, 0.0001);
            vec3 toonLit = hue * mix(toonRamp.z, 1.0, tk);
            toonLit = mix(toonLit * toonShade, toonLit, tk);
            diffuseBase = mix(diffuseBase, toonLit, toonRamp.w);
          }
          #endif
          vec3 finalDiffuse=`,
        CUSTOM_FRAGMENT_BEFORE_FOG: `
          #ifdef TOON
          {
            float rimF = 1.0 - max(dot(normalW, viewDirectionW), 0.0);
            color.rgb += toonRim.rgb * pow(rimF, toonRim.w);
          }
          #endif
        `,
      };
    }
    return null;
  }
}

export interface ToonOpts {
  name?: string;
  rim?: number;
  wind?: number;
  emissive?: string | Color3;
  shade?: number;
  alpha?: number;
  specular?: number;
}

const matCache = new Map<string, StandardMaterial>();

/** Shared vertex-coloured toon material. */
export function toonMat(scene: Scene, opts: ToonOpts = {}): StandardMaterial {
  const key = JSON.stringify(opts);
  const cached = matCache.get(key);
  if (cached && cached.getScene() === scene) return cached;
  const m = new StandardMaterial(opts.name ?? "toon", scene);
  m.diffuseColor = Color3.White();
  m.specularColor = new Color3(opts.specular ?? 0, opts.specular ?? 0, opts.specular ?? 0);
  m.specularPower = 32;
  if (opts.emissive) m.emissiveColor = col(opts.emissive);
  if (opts.alpha !== undefined && opts.alpha < 1) m.alpha = opts.alpha;
  const p = new ToonPlugin(m);
  p.rimStrength = opts.rim ?? 0.22;
  p.wind = opts.wind ?? 0;
  if (opts.shade !== undefined) p.ramp.shade = opts.shade;
  (m as unknown as { toon: ToonPlugin }).toon = p;
  matCache.set(key, m);
  return m;
}

export function getToon(m: Material): ToonPlugin | undefined {
  return (m as unknown as { toon?: ToonPlugin }).toon;
}

export function clearMatCache() {
  matCache.clear();
}
