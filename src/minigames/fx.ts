/**
 * Particle layer (Canvas2D, screen space) + floating DOM text pops.
 */
import { C, INK, drawHeart, drawStar, drawTwinkle, cloudPath, rgba, rand, pick, fitCanvas, easeInOut } from "./draw";

export type PKind = "heart" | "star" | "sparkle" | "confetti" | "dot" | "ring" | "poof" | "drop";

interface P {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  s: number;
  rot: number;
  vr: number;
  c: string;
  // fly-to
  fly?: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; done?: () => void };
}

export interface BurstOpts {
  count?: number;
  colors?: string[];
  speed?: number;
  size?: number;
  gravity?: number;
  spread?: number; // radians, default full circle
  angle?: number; // centre angle
  life?: number;
}

export class Fx {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private ps: P[] = [];
  private w = 1;
  private h = 1;
  density = 1;
  textLayer: HTMLElement;

  constructor(canvas: HTMLCanvasElement, textLayer: HTMLElement) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d")!;
    this.textLayer = textLayer;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  get count() {
    return this.ps.length;
  }

  burst(x: number, y: number, kind: PKind, o: BurstOpts = {}) {
    const n = Math.max(1, Math.round((o.count ?? 10) * (kind === "ring" ? 1 : this.density)));
    const colors = o.colors ?? defaultColors(kind);
    for (let i = 0; i < n; i++) {
      const a = (o.angle ?? -Math.PI / 2) + (o.spread !== undefined ? (Math.random() - 0.5) * o.spread : Math.random() * Math.PI * 2);
      const sp = (o.speed ?? 320) * rand(0.45, 1);
      this.ps.push({
        kind,
        x,
        y,
        vx: kind === "ring" ? 0 : Math.cos(a) * sp,
        vy: kind === "ring" ? 0 : Math.sin(a) * sp,
        g: o.gravity ?? (kind === "confetti" ? 520 : kind === "drop" ? 900 : kind === "poof" ? -40 : 380),
        drag: kind === "poof" ? 3.5 : kind === "confetti" ? 1.6 : 1.2,
        life: 0,
        max: (o.life ?? (kind === "ring" ? 0.45 : kind === "poof" ? 0.7 : 1.0)) * rand(0.8, 1.2),
        s: (o.size ?? sizeFor(kind)) * (kind === "ring" ? 1 : rand(0.65, 1.15)),
        rot: rand(-0.5, 0.5) + (kind === "confetti" ? rand(0, 6) : 0),
        vr: kind === "confetti" ? rand(-10, 10) : rand(-2, 2),
        c: pick(colors),
      });
    }
  }

  /** A single icon flying along a curve to a target (e.g. into the HUD meter). */
  flyTo(x0: number, y0: number, x1: number, y1: number, kind: PKind, size: number, color: string, dur = 0.65, done?: () => void) {
    const cx = (x0 + x1) / 2 + rand(-80, 80),
      cy = Math.min(y0, y1) - 120;
    this.ps.push({ kind, x: x0, y: y0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: dur, s: size, rot: 0, vr: 0, c: color, fly: { x0, y0, cx, cy, x1, y1, done } });
  }

  /** Pop-up text ("Perfect!", "+1"…) */
  text(x: number, y: number, str: string, cls = "", dur = 900) {
    const el = document.createElement("div");
    el.className = "mg-pop " + cls;
    el.textContent = str;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.animationDuration = dur + "ms";
    this.textLayer.appendChild(el);
    setTimeout(() => el.remove(), dur + 50);
  }

  clear() {
    this.ps.length = 0;
    this.textLayer.innerHTML = "";
  }

  update(dt: number) {
    for (const p of this.ps) {
      p.life += dt;
      if (p.fly) {
        const t = Math.min(1, p.life / p.max);
        const e = easeInOut(t);
        const f = p.fly;
        const u = 1 - e;
        p.x = u * u * f.x0 + 2 * u * e * f.cx + e * e * f.x1;
        p.y = u * u * f.y0 + 2 * u * e * f.cy + e * e * f.y1;
        if (t >= 1 && f.done) {
          f.done();
          f.done = undefined;
        }
        continue;
      }
      p.vx *= 1 - Math.min(1, p.drag * dt);
      p.vy *= 1 - Math.min(1, p.drag * dt);
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.ps = this.ps.filter((p) => p.life < p.max && p.y < this.h + 80);
  }

  draw() {
    const g = this.g;
    const dpr = fitCanvas(this.canvas, this.w, this.h);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    for (const p of this.ps) {
      const t = p.life / p.max;
      let a = p.fly ? 1 : t < 0.1 ? t / 0.1 : 1 - Math.max(0, (t - 0.55) / 0.45);
      if (p.kind === "ring") a = 1 - t;
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, a));
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      const s = p.fly ? p.s * (1 + Math.sin(t * Math.PI) * 0.35) : p.s * (p.kind === "poof" ? 0.6 + t * 0.9 : t < 0.15 ? 0.5 + (t / 0.15) * 0.5 : 1);
      switch (p.kind) {
        case "heart":
          drawHeart(g, 0, 0, s, p.c, s * 0.08);
          break;
        case "star":
          drawStar(g, 0, 0, s * 0.55, p.c, s * 0.07);
          break;
        case "sparkle":
          drawTwinkle(g, 0, 0, s * 0.5, p.c);
          break;
        case "confetti":
          g.fillStyle = p.c;
          g.scale(1, Math.cos(p.life * 9 + p.vr));
          g.beginPath();
          g.roundRect(-s * 0.5, -s * 0.3, s, s * 0.6, s * 0.2);
          g.fill();
          break;
        case "dot":
          g.fillStyle = p.c;
          g.beginPath();
          g.arc(0, 0, s * 0.5, 0, Math.PI * 2);
          g.fill();
          break;
        case "drop":
          g.fillStyle = p.c;
          g.beginPath();
          g.ellipse(0, 0, s * 0.35, s * 0.5, Math.atan2(p.vy, p.vx) + Math.PI / 2, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = rgba(INK, 0.5);
          g.lineWidth = 1.5;
          g.stroke();
          break;
        case "ring": {
          const r = p.s * (0.3 + 0.9 * (1 - Math.pow(1 - t, 3)));
          g.strokeStyle = p.c;
          g.lineWidth = Math.max(2, p.s * 0.12 * (1 - t));
          g.beginPath();
          g.arc(0, 0, r, 0, Math.PI * 2);
          g.stroke();
          break;
        }
        case "poof":
          g.beginPath();
          cloudPath(g, 0, 0, s * 0.5);
          g.fillStyle = p.c;
          g.fill();
          break;
      }
      g.restore();
    }
  }
}

function defaultColors(kind: PKind): string[] {
  switch (kind) {
    case "heart":
      return [C.rose, C.pinkDeep, C.pink];
    case "star":
      return [C.sun, C.butter, C.butterDeep];
    case "sparkle":
      return ["#ffffff", C.sun, C.butter];
    case "confetti":
      return [C.pink, C.mint, C.butter, C.sky, C.lavender, C.peach];
    case "poof":
      return ["#e9e5f2", "#d9d4e3", "#f3f0f8"];
    case "drop":
      return ["#d8f0ff", "#ffffff", C.sky];
    case "ring":
      return ["#ffffff"];
    default:
      return [C.lavender, C.pink, C.mint];
  }
}
function sizeFor(kind: PKind) {
  switch (kind) {
    case "heart":
      return 26;
    case "star":
      return 30;
    case "sparkle":
      return 22;
    case "confetti":
      return 14;
    case "poof":
      return 44;
    case "drop":
      return 12;
    case "ring":
      return 80;
    default:
      return 10;
  }
}
