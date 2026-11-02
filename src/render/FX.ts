import { ParticleSystem, DynamicTexture, Color4, Vector3, type Scene, type Texture } from "@babylonjs/core";

type Shape = "dot" | "heart" | "star" | "puff" | "note";

function makeTex(scene: Scene, shape: Shape): Texture {
  const S = 64;
  const t = new DynamicTexture("fx_" + shape, { width: S, height: S }, scene, false);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = "#fff";
  if (shape === "dot" || shape === "puff") {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(shape === "puff" ? 0.55 : 0.3, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  } else if (shape === "heart") {
    ctx.beginPath();
    const u = S / 2,
      v = S * 0.62,
      s = S * 0.42;
    ctx.moveTo(u, v + s * 0.35);
    ctx.bezierCurveTo(u - s * 1.25, v - s * 0.45, u - s * 0.5, v - s * 1.3, u, v - s * 0.55);
    ctx.bezierCurveTo(u + s * 0.5, v - s * 1.3, u + s * 1.25, v - s * 0.45, u, v + s * 0.35);
    ctx.fill();
  } else if (shape === "star") {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? S * 0.46 : S * 0.2;
      ctx.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else if (shape === "note") {
    ctx.beginPath();
    ctx.ellipse(S * 0.38, S * 0.72, S * 0.16, S * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(S * 0.5, S * 0.18, S * 0.07, S * 0.55);
    ctx.fillRect(S * 0.5, S * 0.18, S * 0.25, S * 0.08);
  }
  t.hasAlpha = true;
  t.update();
  return t;
}

export class FX {
  private tex = new Map<Shape, Texture>();
  private pools = new Map<string, ParticleSystem[]>();
  private busy = new Map<ParticleSystem, number>();
  constructor(private scene: Scene) {}

  private texture(s: Shape) {
    let t = this.tex.get(s);
    if (!t) this.tex.set(s, (t = makeTex(this.scene, s)));
    return t;
  }

  private system(shape: Shape, capacity: number): ParticleSystem {
    const key = shape + capacity;
    let pool = this.pools.get(key);
    if (!pool) this.pools.set(key, (pool = []));
    const now = performance.now();
    const free = pool.find((p) => (this.busy.get(p) ?? 0) < now);
    if (free) return free;
    const ps = new ParticleSystem("fx", capacity, this.scene);
    ps.particleTexture = this.texture(shape);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.emitter = new Vector3();
    ps.updateSpeed = 1 / 60;
    ps.isLocal = false;
    pool.push(ps);
    return ps;
  }

  private burst(
    shape: Shape,
    pos: Vector3,
    n: number,
    o: {
      colors: [string, string];
      size: [number, number];
      life: [number, number];
      power: [number, number];
      gravity?: number;
      spread?: number;
      up?: number;
      rot?: boolean;
    },
  ) {
    const ps = this.system(shape, Math.max(n, 16));
    ps.stop();
    ps.reset();
    (ps.emitter as Vector3).copyFrom(pos);
    const c1 = Color4.FromHexString(o.colors[0] + "ff"),
      c2 = Color4.FromHexString(o.colors[1] + "ff");
    ps.color1 = c1;
    ps.color2 = c2;
    ps.colorDead = new Color4(c2.r, c2.g, c2.b, 0);
    ps.minSize = o.size[0];
    ps.maxSize = o.size[1];
    ps.minLifeTime = o.life[0];
    ps.maxLifeTime = o.life[1];
    ps.minEmitPower = o.power[0];
    ps.maxEmitPower = o.power[1];
    ps.gravity = new Vector3(0, o.gravity ?? -2, 0);
    const sp = o.spread ?? 1;
    const up = o.up ?? 1;
    ps.direction1 = new Vector3(-sp, up, -sp);
    ps.direction2 = new Vector3(sp, up * 1.6, sp);
    ps.minEmitBox = new Vector3(-0.15, 0, -0.15);
    ps.maxEmitBox = new Vector3(0.15, 0.2, 0.15);
    ps.minAngularSpeed = o.rot ? -2 : 0;
    ps.maxAngularSpeed = o.rot ? 2 : 0;
    ps.manualEmitCount = n;
    ps.targetStopDuration = o.life[1] + 0.2;
    ps.disposeOnStop = false;
    this.busy.set(ps, performance.now() + (o.life[1] + 0.5) * 1000);
    ps.start();
  }

  hearts(pos: Vector3, n = 10) {
    this.burst("heart", pos, n, { colors: ["#ff8fb1", "#ffc2d6"], size: [0.25, 0.5], life: [0.8, 1.4], power: [1.2, 2.4], gravity: 0.6, spread: 0.7, up: 1.2 });
  }
  sparkles(pos: Vector3, n = 14, colors: [string, string] = ["#fff3a6", "#ffffff"]) {
    this.burst("star", pos, n, { colors, size: [0.12, 0.3], life: [0.5, 1.0], power: [1.5, 3], gravity: -1.5, spread: 1, up: 1, rot: true });
  }
  puff(pos: Vector3, n = 8, color = "#fff8f0") {
    this.burst("puff", pos, n, { colors: [color, "#f4ecff"], size: [0.35, 0.7], life: [0.35, 0.6], power: [0.6, 1.4], gravity: 0.5, spread: 1, up: 0.3 });
  }
  notes(pos: Vector3, n = 5) {
    this.burst("note", pos, n, { colors: ["#b48ce6", "#7fb8e6"], size: [0.25, 0.4], life: [1.0, 1.6], power: [0.6, 1.2], gravity: 0.4, spread: 0.6, up: 1 });
  }
  confetti(pos: Vector3, n = 40) {
    this.burst("star", pos, n, { colors: ["#f8b9cb", "#bfe0f6"], size: [0.15, 0.35], life: [1.2, 2.0], power: [4, 7], gravity: -5, spread: 1.2, up: 1.5, rot: true });
    this.burst("heart", pos, Math.floor(n / 2), { colors: ["#fbe7a1", "#bfe9d6"], size: [0.2, 0.4], life: [1.2, 2.0], power: [3, 6], gravity: -4, spread: 1.2, up: 1.5 });
  }

  /** a looping ambient emitter (fireflies, pollen, cave motes). Returns the system so callers can stop it. */
  ambient(o: { center: Vector3; box: Vector3; rate: number; shape?: Shape; colors: [string, string]; size: [number, number]; life: [number, number] }) {
    const ps = new ParticleSystem("amb", Math.ceil(o.rate * o.life[1] * 1.2) + 4, this.scene);
    ps.particleTexture = this.texture(o.shape ?? "dot");
    ps.emitter = o.center.clone();
    ps.minEmitBox = o.box.scale(-1);
    ps.maxEmitBox = o.box.clone();
    ps.color1 = Color4.FromHexString(o.colors[0] + "ff");
    ps.color2 = Color4.FromHexString(o.colors[1] + "ff");
    ps.colorDead = new Color4(1, 1, 1, 0);
    ps.minSize = o.size[0];
    ps.maxSize = o.size[1];
    ps.minLifeTime = o.life[0];
    ps.maxLifeTime = o.life[1];
    ps.emitRate = o.rate;
    ps.minEmitPower = 0.1;
    ps.maxEmitPower = 0.4;
    ps.direction1 = new Vector3(-0.5, 0.3, -0.5);
    ps.direction2 = new Vector3(0.5, 0.8, 0.5);
    ps.gravity = new Vector3(0, 0.05, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.addSizeGradient(0, 0);
    ps.addSizeGradient(0.2, 1);
    ps.addSizeGradient(0.8, 1);
    ps.addSizeGradient(1, 0);
    ps.start();
    return ps;
  }
}
