/**
 * Procedural plush critter portrait drawn with Canvas2D.
 * One class handles state (mood, springs, blinking, little particles) and
 * drawing at any size, so the same critter appears on title cards, in the
 * play field and on the result card.
 */
import type { SpeciesId } from "../data/species";
import { C, INK, darken, drawHeart, drawNote, drawTwinkle, lighten, mix, normHex, rgba, shine, silhouette, ink, starPath } from "./draw";

export type Mood = "idle" | "happy" | "love" | "surprised" | "sad" | "nom" | "sing" | "wow";

interface Mote {
  kind: "heart" | "note" | "sparkle";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s: number;
  c: string;
  rot: number;
}

export class Critter {
  readonly species: SpeciesId;
  readonly body: string;
  readonly light: string;
  readonly dark: string;
  t = Math.random() * 10;
  mood: Mood = "idle";
  private moodUntil = Infinity;
  private baseMood: Mood = "idle";
  // springs
  private sq = 0;
  private sqV = 0;
  private tilt = 0;
  private tiltV = 0;
  tiltTarget = 0;
  private hopY = 0;
  private hopV = 0;
  private lookX = 0;
  private lookY = 0;
  lookTX = 0;
  lookTY = 0;
  private blinkT = 0;
  private nextBlink = 2 + Math.random() * 2;
  private armWave = 0;
  private emitT = 0;
  private motes: Mote[] = [];
  /** particle density multiplier (reduced motion) */
  density = 1;
  /** bob on a beat (0..1) */
  bop = 0;

  constructor(species: SpeciesId, color: string) {
    this.species = species;
    this.body = normHex(color);
    this.light = lighten(this.body, 0.55);
    this.dark = darken(this.body, 0.28);
  }

  /** set a mood; dur <= 0 → permanent (becomes the base mood) */
  setMood(m: Mood, dur = 1.2) {
    if (dur <= 0) {
      this.baseMood = m;
      this.mood = m;
      this.moodUntil = Infinity;
    } else {
      this.mood = m;
      this.moodUntil = this.t + dur;
    }
  }
  /** squash kick (positive = squash down) */
  squash(a = 1) {
    this.sqV += 7 * a;
  }
  hop(h = 1) {
    if (this.hopY > -0.02) {
      this.hopV = -2.6 * Math.sqrt(h);
      this.sqV -= 5 * h; // stretch on take-off
    }
  }
  lean(dir: number) {
    this.tiltV += dir * 7;
  }
  wave() {
    this.armWave = 1;
  }
  look(x: number, y: number) {
    this.lookTX = Math.max(-1, Math.min(1, x));
    this.lookTY = Math.max(-1, Math.min(1, y));
  }
  burst(kind: Mote["kind"], n = 5) {
    for (let i = 0; i < Math.max(1, Math.round(n * this.density)); i++) this.spawn(kind, true);
  }

  private spawn(kind: Mote["kind"], burst = false) {
    const a = burst ? -Math.PI / 2 + (Math.random() - 0.5) * 2.4 : -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const sp = burst ? 1.1 + Math.random() * 0.8 : 0.5 + Math.random() * 0.3;
    const colors = kind === "heart" ? [C.rose, C.pinkDeep, C.pink] : kind === "note" ? [C.lavenderDeep, C.skyDeep, C.pinkDeep, C.mintDeep] : ["#fff", C.sun];
    this.motes.push({
      kind,
      x: (Math.random() - 0.5) * 1.6,
      y: -1.15 + Math.random() * 0.25,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      max: burst ? 0.9 + Math.random() * 0.4 : 1.4,
      s: kind === "sparkle" ? 0.1 + Math.random() * 0.08 : 0.2 + Math.random() * 0.1,
      c: colors[Math.floor(Math.random() * colors.length)],
      rot: (Math.random() - 0.5) * 0.6,
    });
  }

  update(dt: number) {
    this.t += dt;
    if (this.t > this.moodUntil) {
      this.mood = this.baseMood;
      this.moodUntil = Infinity;
    }
    // squash spring
    this.sqV += (-140 * this.sq - 11 * this.sqV) * dt;
    this.sq += this.sqV * dt;
    this.sq = Math.max(-0.35, Math.min(0.35, this.sq));
    // tilt spring
    this.tiltV += (-90 * (this.tilt - this.tiltTarget) - 9 * this.tiltV) * dt;
    this.tilt += this.tiltV * dt;
    // hop
    if (this.hopY < 0 || this.hopV < 0) {
      this.hopV += 16 * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY >= 0) {
        this.hopY = 0;
        this.squash(Math.min(1, this.hopV * 0.3));
        this.hopV = 0;
      }
    }
    // look
    const k = 1 - Math.exp(-10 * dt);
    this.lookX += (this.lookTX - this.lookX) * k;
    this.lookY += (this.lookTY - this.lookY) * k;
    // blink
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0.14;
      this.nextBlink = 2 + Math.random() * 3;
    }
    if (this.blinkT > 0) this.blinkT -= dt;
    this.armWave = Math.max(0, this.armWave - dt * 0.9);
    this.bop = Math.max(0, this.bop - dt * 4);
    // ambient motes
    this.emitT -= dt;
    if (this.emitT <= 0) {
      if (this.mood === "love") {
        this.spawn("heart");
        this.emitT = 0.32 / this.density;
      } else if (this.mood === "sing") {
        this.spawn("note");
        this.emitT = 0.28 / this.density;
      } else this.emitT = 0.1;
    }
    for (const m of this.motes) {
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx *= 1 - dt * 1.5;
      m.vy = m.vy * (1 - dt * 1.2) - dt * 0.25;
    }
    this.motes = this.motes.filter((m) => m.life < m.max);
  }

  /** Draw with feet resting at (x, y + S*0.92). S = body radius in px. */
  draw(g: CanvasRenderingContext2D, x: number, y: number, S: number) {
    const breathe = Math.sin(this.t * 2.6) * 0.018;
    const sq = this.sq + this.bop * 0.08;
    const sx = 1 + sq * 0.8 - breathe * 0.5;
    const sy = 1 - sq + breathe;
    const footY = y + S * 0.92;
    // shadow
    g.save();
    const shadowScale = 1 + this.hopY * 0.5;
    g.fillStyle = rgba(INK, 0.16);
    g.beginPath();
    g.ellipse(x, footY + S * 0.04, S * 0.85 * shadowScale * sx, S * 0.13 * shadowScale, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.save();
    g.translate(x, footY + this.hopY * S);
    g.rotate(this.tilt * 0.35);
    g.scale(sx, sy);
    g.translate(0, -S * 0.92);
    this.drawBody(g, S);
    g.restore();

    // motes (screen-aligned, relative to critter)
    for (const m of this.motes) {
      const p = m.life / m.max;
      const a = p < 0.15 ? p / 0.15 : 1 - Math.max(0, (p - 0.6) / 0.4);
      g.save();
      g.globalAlpha = Math.max(0, a);
      const mx = x + m.x * S,
        my = y + m.y * S;
      const sc = (m.s * S) * (0.7 + 0.3 * Math.min(1, p * 4));
      g.translate(mx, my);
      g.rotate(m.rot + Math.sin(m.life * 4) * 0.15);
      if (m.kind === "heart") drawHeart(g, 0, 0, sc * 1.6, m.c, sc * 0.12);
      else if (m.kind === "note") drawNote(g, 0, 0, sc * 1.4, m.c, sc * 0.1);
      else drawTwinkle(g, 0, 0, sc * 1.2, m.c);
      g.restore();
    }
  }

  private drawBody(g: CanvasRenderingContext2D, S: number) {
    const lw = Math.max(1.5, S * 0.055);
    const sp = this.species;
    const t = this.t;
    const happyish = this.mood === "happy" || this.mood === "love";

    /* ---------- back layer: ears / wings / tails / spines ---------- */
    const earWiggle = Math.sin(t * 3.1) * 0.05 + (happyish ? Math.sin(t * 12) * 0.06 : 0);
    const back: (() => void)[] = [];
    const innerEars: (() => void)[] = [];
    const body = () => g.ellipse(0, 0.02 * S, S * 1.02, S * 0.92, 0, 0, Math.PI * 2);

    if (sp === "glowbat") {
      // soft glow halo
      const gr = g.createRadialGradient(0, 0, S * 0.6, 0, 0, S * 1.9);
      gr.addColorStop(0, rgba(lighten(this.body, 0.6), 0.55 + Math.sin(t * 3) * 0.1));
      gr.addColorStop(1, rgba(this.body, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, S * 1.9, 0, Math.PI * 2);
      g.fill();
      // wings
      const flap = Math.sin(t * (happyish ? 14 : 5)) * 0.18;
      for (const s of [-1, 1]) {
        g.save();
        g.translate(s * S * 0.8, S * 0.05);
        g.rotate(s * (0.2 + flap));
        g.beginPath();
        g.moveTo(0, -S * 0.35);
        g.quadraticCurveTo(s * S * 0.7, -S * 0.75, s * S * 1.0, -S * 0.25);
        g.quadraticCurveTo(s * S * 0.85, -S * 0.05, s * S * 0.88, S * 0.12);
        g.quadraticCurveTo(s * S * 0.65, 0, s * S * 0.6, S * 0.28);
        g.quadraticCurveTo(s * S * 0.4, S * 0.15, s * S * 0.3, S * 0.4);
        g.quadraticCurveTo(s * S * 0.1, S * 0.2, 0, S * 0.25);
        g.closePath();
        ink(g, this.dark, lw * 2);
        g.restore();
      }
    }
    if (sp === "fennix" || sp === "mochi") {
      // tail peeking out at the side
      const sw = Math.sin(t * 2.4) * 0.15;
      g.save();
      g.translate(S * 0.75, S * 0.45);
      g.rotate(-0.5 + sw);
      g.beginPath();
      if (sp === "fennix") g.ellipse(S * 0.35, -S * 0.25, S * 0.52, S * 0.3, -0.7, 0, Math.PI * 2);
      else {
        g.moveTo(0, 0);
        g.quadraticCurveTo(S * 0.6, S * 0.05, S * 0.55, -S * 0.55);
      }
      if (sp === "fennix") {
        ink(g, this.body, lw * 2);
        g.save();
        g.clip();
        g.beginPath();
        g.ellipse(S * 0.72, -S * 0.6, S * 0.3, S * 0.3, 0, 0, Math.PI * 2);
        g.fillStyle = C.cream;
        g.fill();
        g.restore();
      } else {
        g.lineCap = "round";
        g.strokeStyle = INK;
        g.lineWidth = S * 0.16 + lw * 2;
        g.stroke();
        g.strokeStyle = this.body;
        g.lineWidth = S * 0.16;
        g.stroke();
      }
      g.restore();
    }

    if (sp === "puffbun") {
      for (const s of [-1, 1]) {
        const flop = s === 1 ? 0.25 + Math.sin(t * 2) * 0.08 : 0;
        const a = s * (0.22 + earWiggle) + flop;
        back.push(() => {
          g.save();
          g.translate(s * S * 0.38, -S * 0.65);
          g.rotate(a);
          g.ellipse(0, -S * 0.55, S * 0.24, S * 0.62, 0, 0, Math.PI * 2);
          g.restore();
        });
        innerEars.push(() => {
          g.save();
          g.translate(s * S * 0.38, -S * 0.65);
          g.rotate(a);
          g.ellipse(0, -S * 0.5, S * 0.12, S * 0.45, 0, 0, Math.PI * 2);
          g.restore();
        });
      }
    } else if (sp === "fennix" || sp === "mochi" || sp === "glowbat") {
      const big = sp === "fennix" ? 1.15 : sp === "glowbat" ? 1.05 : 0.8;
      for (const s of [-1, 1]) {
        const a = s * (0.35 + earWiggle);
        const tri = (k: number, inset: number) => () => {
          g.save();
          g.translate(s * S * 0.5, -S * 0.55);
          g.rotate(a);
          const w = S * 0.36 * big * k,
            h = S * 0.62 * big * k;
          g.moveTo(-w, inset);
          g.quadraticCurveTo(-w * 0.35, -h * 0.6, 0, -h);
          g.quadraticCurveTo(w * 0.35, -h * 0.6, w, inset);
          g.closePath();
          g.restore();
        };
        back.push(tri(1, S * 0.2));
        innerEars.push(tri(0.55, 0));
      }
    } else if (sp === "hoglet") {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = Math.PI + 0.15 + (i / (n - 1)) * (Math.PI - 0.3);
        const wig = Math.sin(t * 3 + i) * 0.03;
        back.push(() => {
          const r0 = S * 0.78,
            r1 = S * (1.32 + (i % 2) * 0.1 + wig);
          const da = 0.24;
          g.moveTo(Math.cos(a - da) * r0, Math.sin(a - da) * r0 * 0.95);
          g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.95);
          g.lineTo(Math.cos(a + da) * r0, Math.sin(a + da) * r0 * 0.95);
          g.closePath();
        });
      }
      // side spines too
      for (const s of [-1, 1])
        back.push(() => {
          g.moveTo(s * S * 0.8, -S * 0.1);
          g.lineTo(s * S * 1.25, S * 0.15);
          g.lineTo(s * S * 0.85, S * 0.35);
          g.closePath();
        });
    } else if (sp === "ribbit") {
      for (const s of [-1, 1]) back.push(() => g.ellipse(s * S * 0.42, -S * 0.68, S * 0.3, S * 0.27, 0, 0, Math.PI * 2));
    } else if (sp === "chirpy") {
      // head tuft
      for (let i = -1; i <= 1; i++)
        back.push(() => {
          g.save();
          g.translate(i * S * 0.12, -S * 0.82);
          g.rotate(i * 0.45 + earWiggle);
          g.ellipse(0, -S * 0.2, S * 0.08, S * 0.24, 0, 0, Math.PI * 2);
          g.restore();
        });
    } else if (sp === "duckling") {
      back.push(() => {
        g.save();
        g.translate(S * 0.05, -S * 0.85);
        g.rotate(0.3 + earWiggle);
        g.ellipse(0, -S * 0.16, S * 0.1, S * 0.22, 0, 0, Math.PI * 2);
        g.restore();
      });
    }

    // feet behind body edge
    const feet = [-1, 1].map((s) => () => g.ellipse(s * S * 0.42, S * 0.84, S * 0.26, S * 0.16, 0, 0, Math.PI * 2));
    const innerC = sp === "glowbat" ? lighten(this.dark, 0.35) : sp === "fennix" ? C.cream : C.pink;

    /* ---------- body ---------- */
    if (sp === "ribbit") {
      // eye bumps merge into the head: one union outline
      silhouette(g, [...back, body, ...feet], this.body, lw);
    } else {
      if (back.length) silhouette(g, back, sp === "hoglet" ? this.dark : this.body, lw);
      if (innerEars.length) {
        g.fillStyle = innerC;
        for (const s of innerEars) {
          g.beginPath();
          s();
          g.fill();
        }
      }
      silhouette(g, [body, ...feet], this.body, lw);
    }
    // shading inside body
    g.save();
    g.beginPath();
    body();
    g.clip();
    const sh = g.createLinearGradient(0, -S, 0, S);
    sh.addColorStop(0, rgba("#ffffff", 0.22));
    sh.addColorStop(0.55, rgba("#ffffff", 0));
    sh.addColorStop(1, rgba(darken(this.body, 0.5), 0.22));
    g.fillStyle = sh;
    g.fillRect(-S * 1.2, -S * 1.2, S * 2.4, S * 2.4);
    // belly patch
    g.beginPath();
    g.ellipse(0, S * 0.55, S * 0.58, S * 0.42, 0, 0, Math.PI * 2);
    g.fillStyle = sp === "hoglet" || sp === "fennix" ? C.cream : this.light;
    g.fill();
    g.setLineDash([S * 0.07, S * 0.06]);
    g.strokeStyle = rgba(darken(this.body, 0.4), 0.45);
    g.lineWidth = lw * 0.55;
    g.beginPath();
    g.ellipse(0, S * 0.55, S * 0.5, S * 0.34, 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    g.restore();
    // feet fronts (toe beans)
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * S * 0.42, S * 0.86, S * 0.13, S * 0.07, 0, 0, Math.PI * 2);
      g.fillStyle = rgba(C.pinkDeep, 0.55);
      g.fill();
    }
    shine(g, -S * 0.52, -S * 0.5, S * 0.17, S * 0.09, -0.8, 0.55);

    /* ---------- arms ---------- */
    const up = happyish ? 1 : this.mood === "surprised" || this.mood === "wow" ? 0.6 : 0;
    for (const s of [-1, 1]) {
      const wave = this.armWave > 0 && s === 1 ? Math.sin(t * 18) * 0.5 * this.armWave + 1.3 * this.armWave : 0;
      // rotate outward/upward: right arm counter-clockwise, left arm clockwise
      const a = -s * (0.45 + up * (1.5 + Math.sin(t * 10 + s) * 0.3) + wave);
      g.save();
      g.translate(s * S * 0.8, S * 0.3);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, S * 0.13, S * 0.13, S * 0.2, 0, 0, Math.PI * 2);
      ink(g, this.body, lw * 2);
      g.beginPath();
      g.ellipse(0, S * 0.22, S * 0.065, S * 0.05, 0, 0, Math.PI * 2);
      g.fillStyle = rgba(C.pinkDeep, 0.5);
      g.fill();
      g.restore();
    }

    /* ---------- face ---------- */
    const faceY = sp === "shroomy" ? S * 0.18 : 0;
    const lx = this.lookX * S * 0.08,
      ly = this.lookY * S * 0.06 + faceY;
    const eyeSpread = sp === "molly" ? 0.3 : 0.34;
    const eyeY = sp === "ribbit" ? -S * 0.68 : -S * 0.06;
    const eyeX = sp === "ribbit" ? 0.42 : eyeSpread;
    const eyeSize = sp === "molly" ? 0.75 : sp === "ribbit" ? 1.05 : 1;

    // blush
    g.save();
    g.fillStyle = rgba(C.rose, happyish ? 0.55 : 0.38);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * S * 0.6 + lx * 0.5, S * 0.18 + ly, S * 0.15, S * 0.09, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    for (const s of [-1, 1]) this.drawEye(g, s * S * eyeX + lx, eyeY + (sp === "ribbit" ? this.lookY * S * 0.05 : ly), S * eyeSize, lw, s);

    // mouth / beak / nose
    const my = S * 0.2 + ly;
    if (sp === "chirpy" || sp === "duckling") this.drawBeak(g, lx, my - S * 0.04, S, lw, sp === "duckling");
    else {
      if (sp === "molly") {
        this.drawMouth(g, lx, my + S * 0.16, S, lw);
        g.save();
        g.translate(lx, my - S * 0.02);
        g.rotate(Math.sin(t * 6) * 0.08);
        g.beginPath();
        starPath(g, 0, 0, S * 0.17, 0.55, 8, -Math.PI / 2);
        ink(g, C.pinkDeep, lw * 1.6);
        g.restore();
      } else {
        if (sp !== "ribbit") {
          // tiny nose
          g.beginPath();
          g.ellipse(lx, my - S * 0.06, S * 0.05, S * 0.035, 0, 0, Math.PI * 2);
          g.fillStyle = sp === "fennix" || sp === "mochi" || sp === "puffbun" ? C.rose : INK;
          g.fill();
        }
        this.drawMouth(g, lx, my + (sp === "ribbit" ? -S * 0.02 : 0), S, lw, sp === "ribbit");
      }
    }
    if (sp === "mochi") {
      g.strokeStyle = INK;
      g.lineWidth = lw * 0.6;
      g.lineCap = "round";
      for (const s of [-1, 1])
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(s * S * 0.58 + lx, my + i * S * 0.07);
          g.lineTo(s * S * 0.92 + lx, my + i * S * 0.1 - S * 0.03);
          g.stroke();
        }
    }
    if (sp === "glowbat") {
      g.beginPath();
      g.moveTo(lx + S * 0.07, my + S * 0.04);
      g.lineTo(lx + S * 0.11, my + S * 0.14);
      g.lineTo(lx + S * 0.15, my + S * 0.04);
      ink(g, "#fff", lw * 0.8);
    }

    /* ---------- front accessories ---------- */
    if (sp === "shroomy") {
      const capC = mix(this.body, C.rose, 0.55);
      g.save();
      g.translate(0, -S * 0.42);
      g.rotate(Math.sin(t * 2) * 0.04);
      g.beginPath();
      g.moveTo(-S * 1.28, S * 0.12);
      g.bezierCurveTo(-S * 1.3, -S * 0.75, -S * 0.6, -S * 1.05, 0, -S * 1.05);
      g.bezierCurveTo(S * 0.6, -S * 1.05, S * 1.3, -S * 0.75, S * 1.28, S * 0.12);
      g.quadraticCurveTo(0, S * 0.32, -S * 1.28, S * 0.12);
      g.closePath();
      ink(g, capC, lw * 2);
      g.save();
      g.clip();
      g.fillStyle = C.white;
      for (const [dx, dy, r] of [
        [-0.65, -0.35, 0.2],
        [0.1, -0.72, 0.17],
        [0.7, -0.3, 0.22],
        [-0.1, -0.15, 0.13],
      ]) {
        g.beginPath();
        g.ellipse(dx * S, dy * S, r * S, r * S * 0.85, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      shine(g, -S * 0.75, -S * 0.55, S * 0.2, S * 0.08, -0.6, 0.6);
      g.restore();
    }
  }

  private drawEye(g: CanvasRenderingContext2D, x: number, y: number, S: number, lw: number, side: number) {
    const m = this.mood;
    g.strokeStyle = INK;
    g.fillStyle = INK;
    g.lineCap = "round";
    g.lineJoin = "round";
    if (m === "love") {
      const pulse = 1 + Math.sin(this.t * 10) * 0.08;
      drawHeart(g, x, y, S * 0.3 * pulse, C.rose, lw * 0.45);
      return;
    }
    if (m === "happy" || (m === "nom" && Math.sin(this.t * 16) > 0)) {
      g.lineWidth = lw * 1.4;
      g.beginPath();
      g.arc(x, y + S * 0.05, S * 0.11, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
      return;
    }
    if (this.blinkT > 0 && m !== "surprised" && m !== "wow") {
      g.lineWidth = lw * 1.2;
      g.beginPath();
      g.moveTo(x - S * 0.09, y);
      g.lineTo(x + S * 0.09, y);
      g.stroke();
      return;
    }
    const big = m === "surprised" || m === "wow" ? 1.25 : 1;
    const rx = S * 0.105 * big,
      ry = S * 0.135 * big;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    // highlights
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(x - rx * 0.32, y - ry * 0.38, rx * 0.42, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(x + rx * 0.35, y + ry * 0.35, rx * 0.2, 0, Math.PI * 2);
    g.fill();
    if (m === "sad") {
      // soft worried brow
      g.strokeStyle = INK;
      g.lineWidth = lw * 0.9;
      g.beginPath();
      g.moveTo(x - side * S * 0.12, y - S * 0.24);
      g.lineTo(x + side * S * 0.06, y - S * 0.2);
      g.stroke();
    }
  }

  private drawMouth(g: CanvasRenderingContext2D, x: number, y: number, S: number, lw: number, wide = false) {
    const m = this.mood;
    g.strokeStyle = INK;
    g.lineWidth = lw * 1.1;
    g.lineCap = "round";
    g.lineJoin = "round";
    const w = wide ? 1.6 : 1;
    const open = (rx: number, ry: number) => {
      g.beginPath();
      g.ellipse(x, y + ry * 0.5, rx, ry, 0, 0, Math.PI * 2);
      ink(g, "#7a4a62", lw * 1.6);
      g.save();
      g.clip();
      g.beginPath();
      g.ellipse(x, y + ry * 1.25, rx * 0.8, ry * 0.6, 0, 0, Math.PI * 2);
      g.fillStyle = C.rose;
      g.fill();
      g.restore();
    };
    if (m === "happy" || m === "love") {
      g.beginPath();
      g.moveTo(x - S * 0.14 * w, y - S * 0.02);
      g.quadraticCurveTo(x, y + S * 0.03, x + S * 0.14 * w, y - S * 0.02);
      g.quadraticCurveTo(x, y + S * 0.28, x - S * 0.14 * w, y - S * 0.02);
      g.closePath();
      ink(g, "#7a4a62", lw * 1.6);
      g.save();
      g.clip();
      g.beginPath();
      g.ellipse(x, y + S * 0.2, S * 0.1 * w, S * 0.08, 0, 0, Math.PI * 2);
      g.fillStyle = C.rose;
      g.fill();
      g.restore();
    } else if (m === "surprised" || m === "wow") open(S * 0.08 * w, S * 0.1);
    else if (m === "sing") open(S * 0.07 * w, S * (0.07 + Math.abs(Math.sin(this.t * 9)) * 0.04));
    else if (m === "nom") {
      if (Math.sin(this.t * 16) > 0) open(S * 0.1 * w, S * 0.09);
      else {
        g.beginPath();
        g.moveTo(x - S * 0.1 * w, y + S * 0.02);
        g.quadraticCurveTo(x - S * 0.05 * w, y + S * 0.08, x, y + S * 0.02);
        g.quadraticCurveTo(x + S * 0.05 * w, y + S * 0.08, x + S * 0.1 * w, y + S * 0.02);
        g.stroke();
      }
    } else if (m === "sad") {
      g.beginPath();
      g.moveTo(x - S * 0.07, y + S * 0.08);
      g.quadraticCurveTo(x, y + S * 0.02, x + S * 0.07, y + S * 0.08);
      g.stroke();
    } else {
      // classic "w"
      g.beginPath();
      g.moveTo(x - S * 0.11 * w, y);
      g.quadraticCurveTo(x - S * 0.055 * w, y + S * 0.08, x, y + S * 0.01);
      g.quadraticCurveTo(x + S * 0.055 * w, y + S * 0.08, x + S * 0.11 * w, y);
      g.stroke();
    }
  }

  private drawBeak(g: CanvasRenderingContext2D, x: number, y: number, S: number, lw: number, duck: boolean) {
    const m = this.mood;
    const openAmt = m === "sing" ? 0.06 + Math.abs(Math.sin(this.t * 9)) * 0.05 : m === "nom" ? (Math.sin(this.t * 16) > 0 ? 0.1 : 0.01) : m === "happy" || m === "love" || m === "wow" || m === "surprised" ? 0.08 : 0;
    const w = duck ? S * 0.26 : S * 0.15;
    const h = duck ? S * 0.11 : S * 0.13;
    const col = C.orange;
    // lower beak
    g.beginPath();
    if (duck) g.ellipse(x, y + h * 0.6 + openAmt * S, w * 0.85, h * 0.6, 0, 0, Math.PI * 2);
    else {
      g.moveTo(x - w * 0.8, y + openAmt * S * 0.3);
      g.quadraticCurveTo(x, y + h * 1.2 + openAmt * S, x + w * 0.8, y + openAmt * S * 0.3);
      g.closePath();
    }
    ink(g, darken(col, 0.15), lw * 1.5);
    // upper beak
    g.beginPath();
    if (duck) g.ellipse(x, y, w, h * 0.75, 0, 0, Math.PI * 2);
    else {
      g.moveTo(x - w, y);
      g.quadraticCurveTo(x - w * 0.2, y - h * 0.9, x, y - h * 0.8);
      g.quadraticCurveTo(x + w * 0.2, y - h * 0.9, x + w, y);
      g.quadraticCurveTo(x, y + h * 0.9, x - w, y);
      g.closePath();
    }
    ink(g, col, lw * 1.5);
    shine(g, x - w * 0.35, y - h * 0.25, w * 0.2, h * 0.15, -0.4, 0.6);
  }
}

/** Standalone canvas portrait for DOM cards. */
export class PortraitView {
  readonly el: HTMLCanvasElement;
  readonly critter: Critter;
  private g: CanvasRenderingContext2D;
  constructor(species: SpeciesId, color: string, cls = "mg-portrait") {
    this.el = document.createElement("canvas");
    this.el.className = cls;
    this.g = this.el.getContext("2d")!;
    this.critter = new Critter(species, color);
  }
  frame(dt: number) {
    const w = this.el.clientWidth,
      h = this.el.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr),
      H = Math.round(h * dpr);
    if (this.el.width !== W || this.el.height !== H) {
      this.el.width = W;
      this.el.height = H;
    }
    this.critter.update(dt);
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const S = Math.min(w, h) * 0.3;
    this.critter.draw(g, w / 2, h - S * 0.92 - h * 0.08, S);
  }
}
