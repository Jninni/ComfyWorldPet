/**
 * Bubble Pop — bubbles float up; pop the ones holding hearts & stars (+1),
 * leave the grumpy rain-cloud bubbles alone (-1, harmless poof).
 * Touch: tap bubbles. Keys/gamepad: move the paw cursor, A pops.
 */
import { audio } from "../../audio/Audio";
import { input, type Btn } from "../../core/Input";
import { C, INK, clamp, drawHeart, drawStar, drawGrumpyCloud, drawPaw, rgba, rand, easeOutBack, drawRug, lighten } from "../draw";
import type { Critter } from "../critter";
import type { Game, GameCtx, GameDef, GameOutcome } from "../types";

type Kind = "heart" | "star" | "cloud";
interface Bubble {
  id: number;
  x0: number;
  x: number;
  y: number;
  r: number;
  vy: number;
  ph: number;
  amp: number;
  kind: Kind;
  age: number;
  popping: number; // >0 when popping (seconds)
  hue: number;
}

function drawBubble(g: CanvasRenderingContext2D, b: { x: number; y: number; r: number; kind: Kind; age: number; hue: number }, t: number, scale = 1) {
  const r = b.r * scale;
  if (r <= 0.5) return;
  const wob = Math.sin(t * 5 + b.hue * 10) * 0.035;
  g.save();
  g.translate(b.x, b.y);
  g.scale(1 + wob, 1 - wob);
  // body
  const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  const tint = b.kind === "cloud" ? "#d9d4e3" : b.hue < 0.33 ? C.sky : b.hue < 0.66 ? C.lavender : C.mint;
  gr.addColorStop(0, "rgba(255,255,255,0.75)");
  gr.addColorStop(0.55, rgba(lighten(tint, 0.4), 0.45));
  gr.addColorStop(0.9, rgba(tint, 0.75));
  gr.addColorStop(1, rgba(lighten(C.pink, 0.2), 0.9));
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = gr;
  g.fill();
  // iridescent rim
  g.lineWidth = Math.max(2, r * 0.06);
  g.strokeStyle = rgba(INK, 0.85);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.86, Math.PI * 0.15, Math.PI * 0.75);
  g.strokeStyle = rgba(C.pink, 0.8);
  g.lineWidth = r * 0.07;
  g.lineCap = "round";
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.86, Math.PI * 0.85, Math.PI * 1.05);
  g.strokeStyle = rgba(C.mint, 0.9);
  g.stroke();
  // content
  const bob = Math.sin(t * 3 + b.hue * 6) * r * 0.04;
  if (b.kind === "heart") drawHeart(g, 0, bob + r * 0.04, r * 0.95, C.rose, r * 0.06);
  else if (b.kind === "star") drawStar(g, 0, bob + r * 0.04, r * 0.55, C.sun, r * 0.06, -Math.PI / 2 + Math.sin(t * 2 + b.hue) * 0.15);
  else drawGrumpyCloud(g, 0, bob - r * 0.08, r * 0.55, t + b.hue, r * 0.05);
  // shine
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.ellipse(-r * 0.45, -r * 0.48, r * 0.2, r * 0.11, -0.75, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(-r * 0.2, -r * 0.68, r * 0.06, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function createBubblePop(ctx: GameCtx): Game {
  const d = ctx.opts.difficulty;
  const target = [10, 14, 18][d - 1];
  const total = [30, 30, 32][d - 1];
  const spawnEvery = [0.5, 0.46, 0.42][d - 1];
  const cloudP = [0.13, 0.22, 0.3][d - 1];
  const speedMul = [1, 1.15, 1.32][d - 1];
  const crit: Critter = ctx.critter;

  let bubbles: Bubble[] = [];
  let nextId = 1;
  let T = 0;
  let playing = false;
  let over = false;
  let timeLeft = total;
  let score = 0;
  let spawnT = 0;
  let combo = 0;
  let comboT = 0;
  let resolveFn: ((o: GameOutcome) => void) | null = null;
  const paw = { x: 0, y: 0, vis: 0, press: 0, init: false };

  const layout = () => {
    const v = ctx.view;
    const S = clamp(Math.min(v.ph * 0.15, v.pw * 0.11), 34, 110);
    return { S, cx: v.l + S * 1.5, footY: v.b - S * 0.4 };
  };

  const spawn = (initial = false) => {
    const v = ctx.view;
    const s = v.s;
    const r = Math.max(36, rand(50, 66) * s);
    const kind: Kind = Math.random() < cloudP ? "cloud" : Math.random() < 0.45 ? "star" : "heart";
    // avoid stacking on the previous bubble
    let x = rand(v.l + r + 8, v.r - r - 8);
    const lastB = bubbles[bubbles.length - 1];
    if (lastB && Math.abs(lastB.x0 - x) < r * 2) x = clamp(x + (x > (v.l + v.r) / 2 ? -1 : 1) * r * 2.4, v.l + r, v.r - r);
    bubbles.push({
      id: nextId++,
      x0: x,
      x,
      y: initial ? rand(v.t + v.ph * 0.25, v.b) : v.b + r + 10,
      r,
      vy: -rand(78, 112) * Math.max(0.6, s) * speedMul * (v.ph / 700 > 1 ? Math.min(1.5, v.ph / 700) : 1),
      ph: rand(0, 6),
      amp: rand(10, 26) * s,
      kind,
      age: initial ? 1 : 0,
      popping: 0,
      hue: Math.random(),
    });
  };

  const popBubble = (b: Bubble) => {
    if (b.popping > 0 || over) return;
    b.popping = 0.001;
    const fx = ctx.fx;
    fx.burst(b.x, b.y, "ring", { count: 1, size: b.r * 1.5, colors: ["#ffffff"] });
    fx.burst(b.x, b.y, "drop", { count: 10, speed: 380, gravity: 700 });
    if (b.kind === "cloud") {
      score = Math.max(0, score - 1);
      combo = 0;
      fx.burst(b.x, b.y, "poof", { count: 6, speed: 120 });
      fx.text(b.x, b.y - b.r, "-1", "mg-pop-miss");
      audio.sfx("pop", { pitch: 0.7 });
      audio.sfx("miss");
      crit.setMood("surprised", 0.8);
      crit.squash(0.5);
    } else {
      score++;
      combo = comboT > 0 ? combo + 1 : 1;
      comboT = 1.1;
      audio.sfx("pop", { pitch: 1 + Math.min(combo, 8) * 0.07 });
      fx.burst(b.x, b.y, b.kind === "heart" ? "heart" : "star", { count: 6, speed: 300 });
      fx.burst(b.x, b.y, "sparkle", { count: 6, speed: 260, gravity: 0 });
      fx.text(b.x, b.y - b.r * 0.9, combo >= 3 ? `Combo ×${combo}!` : "+1", combo >= 3 ? "mg-pop-perfect" : "mg-pop-good");
      const hp = ctx.hud.heartPos();
      fx.flyTo(b.x, b.y, hp.x, hp.y, b.kind === "heart" ? "heart" : "star", 30, b.kind === "heart" ? C.rose : C.sun, 0.6, () => {
        ctx.hud.pulseHeart();
      });
      crit.setMood(combo >= 3 ? "love" : "happy", 0.7);
      crit.hop(0.5);
      if (score >= target) win();
    }
    ctx.hud.setProgress(score / target, `${score}/${target}`);
  };

  const win = () => {
    if (over) return;
    over = true;
    playing = false;
    crit.setMood("love", 0);
    audio.sfx("success");
    // cascade-pop the remaining good bubbles for juice
    const rest = bubbles.filter((b) => b.popping === 0 && b.kind !== "cloud");
    rest.forEach((b, i) =>
      setTimeout(() => {
        if (b.popping === 0) {
          b.popping = 0.001;
          ctx.fx.burst(b.x, b.y, "ring", { count: 1, size: b.r * 1.4 });
          ctx.fx.burst(b.x, b.y, b.kind === "heart" ? "heart" : "star", { count: 5, speed: 260 });
          audio.sfx("pop", { pitch: 1.2 + i * 0.06 });
        }
      }, 90 * i),
    );
    bubbles.filter((b) => b.kind === "cloud").forEach((b) => (b.popping = 0.001));
    const frac = timeLeft / total;
    const stars = (frac >= 0.4 ? 3 : frac >= 0.15 ? 2 : 1) as 1 | 2 | 3;
    setTimeout(() => resolveFn?.({ success: true, stars }), 900 + rest.length * 90);
  };

  const hitTest = (x: number, y: number, extra: number): Bubble | null => {
    let best: Bubble | null = null;
    let bestD = Infinity;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (b.popping > 0) continue;
      const dd = Math.hypot(b.x - x, b.y - y) - b.r * 1.12;
      if (dd < extra && dd < bestD) {
        // prefer good bubbles when overlapping
        if (best && best.kind !== "cloud" && b.kind === "cloud" && dd > -b.r * 0.5) continue;
        best = b;
        bestD = dd;
      }
    }
    return best;
  };

  const tapAt = (x: number, y: number, extra: number) => {
    if (!playing) return;
    const b = hitTest(x, y, extra);
    if (b) popBubble(b);
    else {
      ctx.fx.burst(x, y, "ring", { count: 1, size: 40, colors: [rgba(C.lavenderDeep, 0.8)] });
      audio.sfx("bubble", { volume: 0.4 });
    }
  };

  // initial bubbles for the idle scene behind the title card
  for (let i = 0; i < 5; i++) spawn(true);

  return {
    start() {
      playing = true;
      bubbles = bubbles.filter((b) => b.y > ctx.view.t + ctx.view.ph * 0.3);
      while (bubbles.length < 6) spawn(true);
      ctx.hud.setProgress(0, `0/${target}`);
      ctx.hud.setTimer(timeLeft, total);
      return new Promise((res) => (resolveFn = res));
    },
    onButton(b: Btn) {
      if (b === "a" && playing) {
        paw.press = 1;
        paw.vis = 1;
        tapAt(paw.x, paw.y, 40 * ctx.view.s + 14);
      }
    },
    onPointerDown(x, y) {
      tapAt(x, y, 18);
    },
    update(dt) {
      T += dt;
      const v = ctx.view;
      if (!paw.init) {
        paw.x = (v.l + v.r) / 2;
        paw.y = (v.t + v.b) / 2;
        paw.init = true;
      }
      if (playing) {
        timeLeft -= dt;
        ctx.hud.setTimer(timeLeft, total);
        if (timeLeft <= 0) {
          timeLeft = 0;
          playing = false;
          over = true;
          crit.setMood("sad", 1.5);
          bubbles.forEach((b) => (b.popping = b.popping || 0.001));
          audio.sfx("whoosh");
          setTimeout(() => resolveFn?.({ success: false, stars: 1 }), 700);
        }
      }
      comboT -= dt;
      if (!over) {
        spawnT -= dt;
        const alive = bubbles.filter((b) => b.popping === 0).length;
        if (spawnT <= 0 && alive < 12) {
          spawn();
          // keep enough good bubbles on screen
          spawnT = spawnEvery * rand(0.75, 1.25) * (playing ? 1 : 2.2);
        }
      }
      for (const b of bubbles) {
        b.age += dt;
        if (b.popping > 0) b.popping += dt;
        else {
          b.y += b.vy * dt;
          b.x = b.x0 + Math.sin(T * 1.6 + b.ph) * b.amp;
        }
      }
      bubbles = bubbles.filter((b) => b.y > v.t - b.r * 2 && b.popping < 0.18);
      // paw cursor (keyboard / gamepad)
      const mv = input.move;
      const moving = Math.hypot(mv.x, mv.y) > 0.15;
      if (moving) paw.vis = 1;
      if (ctx.pointerMode) paw.vis = Math.max(0, paw.vis - dt * 4);
      else if (input.lastDevice !== "touch") paw.vis = Math.min(1, paw.vis + dt * 4);
      const sp = Math.min(v.pw, v.ph) * 1.1 + 200;
      paw.x = clamp(paw.x + mv.x * sp * dt, v.l, v.r);
      paw.y = clamp(paw.y - mv.y * sp * dt, v.t, v.b);
      if (!moving && playing) {
        // gentle magnet toward the nearest good bubble
        let best: Bubble | null = null;
        let bd = 130 * v.s + 30;
        for (const b of bubbles) {
          if (b.popping || b.kind === "cloud") continue;
          const dd = Math.hypot(b.x - paw.x, b.y - paw.y);
          if (dd < bd) {
            bd = dd;
            best = b;
          }
        }
        if (best) {
          const k = 1 - Math.exp(-dt * 3);
          paw.x += (best.x - paw.x) * k;
          paw.y += (best.y - paw.y) * k;
        }
      }
      paw.press = Math.max(0, paw.press - dt * 6);
      // critter looks at the paw or the nearest bubble
      const L = layout();
      const tx = paw.vis > 0.5 ? paw.x : bubbles[0]?.x ?? L.cx;
      const ty = paw.vis > 0.5 ? paw.y : bubbles[0]?.y ?? v.t;
      crit.look((tx - L.cx) / (v.pw * 0.5), clamp((ty - (L.footY - L.S)) / (v.ph * 0.5), -1, 1));
      ctx.debug.bubbles = bubbles.filter((b) => b.popping === 0).map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.r), kind: b.kind }));
      ctx.debug.score = score;
      ctx.debug.target = target;
      ctx.debug.paw = { x: Math.round(paw.x), y: Math.round(paw.y) };
    },
    draw(g) {
      const L = layout();
      drawRug(g, L.cx, L.footY + L.S * 0.05, L.S * 1.5, L.S * 0.34, C.mint, C.sky);
      crit.draw(g, L.cx, L.footY - L.S * 0.92, L.S);
      for (const b of bubbles) {
        const app = Math.min(1, b.age / 0.35);
        let sc = easeOutBack(app, 2);
        let a = 1;
        if (b.popping > 0) {
          sc = 1 + b.popping * 3;
          a = 1 - b.popping / 0.18;
        }
        // fade near the top
        const topFade = clamp((b.y - (ctx.view.t - b.r)) / (b.r * 1.5), 0, 1);
        g.save();
        g.globalAlpha = Math.max(0, a * topFade);
        drawBubble(g, b, T, sc);
        g.restore();
      }
      if (paw.vis > 0.02 && !over) {
        g.save();
        g.globalAlpha = paw.vis;
        const ps = Math.max(22, 36 * ctx.view.s) * (1 - paw.press * 0.25);
        g.beginPath();
        g.arc(paw.x, paw.y, ps * 1.25, 0, Math.PI * 2);
        g.setLineDash([6, 6]);
        g.lineDashOffset = -T * 20;
        g.strokeStyle = rgba(INK, 0.55);
        g.lineWidth = 3;
        g.stroke();
        g.setLineDash([]);
        drawPaw(g, paw.x + ps * 0.15, paw.y + ps * 0.35, ps, C.white, C.pink, Math.max(2, ps * 0.08));
        g.restore();
      }
    },
  };
}

function howTo(g: CanvasRenderingContext2D, w: number, h: number, t: number, critter: Critter) {
  const s = Math.min(w / 420, h / 240);
  const cyc = 3;
  const k = (t % cyc) / cyc;
  const r = 34 * s;
  const items: { x: number; kind: Kind; ph: number }[] = [
    { x: w * 0.32, kind: "heart", ph: 0 },
    { x: w * 0.55, kind: "cloud", ph: 0.35 },
    { x: w * 0.78, kind: "star", ph: 0.15 },
  ];
  // little critter bottom-left
  const S = 30 * s;
  drawRug(g, w * 0.1, h - S * 0.35, S * 1.3, S * 0.3, C.mint, C.sky);
  critter.draw(g, w * 0.1, h - S * 0.35 - S * 0.92, S);
  for (const it of items) {
    const y = h + r - ((k + it.ph) % 1) * (h + r * 2);
    const tapped = it.kind !== "cloud" && Math.abs(((k + it.ph) % 1) - 0.55) < 0.04;
    const popped = it.kind !== "cloud" && ((k + it.ph) % 1) > 0.59;
    if (!popped) drawBubble(g, { x: it.x + Math.sin(t * 2 + it.ph * 9) * 6, y, r, kind: it.kind, age: 1, hue: it.ph }, t, tapped ? 1.15 : 1);
    else if (((k + it.ph) % 1) < 0.75) {
      const f = (((k + it.ph) % 1) - 0.59) / 0.16;
      g.save();
      g.globalAlpha = 1 - f;
      g.font = `600 ${22 * s}px Fredoka, sans-serif`;
      g.textAlign = "center";
      g.lineWidth = 5 * s;
      g.strokeStyle = INK;
      g.strokeText("+1", it.x, y - f * 20);
      g.fillStyle = "#fff";
      g.fillText("+1", it.x, y - f * 20);
      g.restore();
      if (f < 0.4) critter.setMood("happy", 0.3);
    }
    if (tapped) drawPaw(g, it.x + r * 0.5, y + r * 0.6, 20 * s, C.white, C.pink, 2);
    if (it.kind === "cloud") {
      // "no" badge
      const bx = it.x + r * 0.75,
        by = y - r * 0.75;
      g.beginPath();
      g.arc(bx, by, r * 0.36, 0, Math.PI * 2);
      g.fillStyle = "#fff";
      g.fill();
      g.lineWidth = r * 0.12;
      g.strokeStyle = C.rose;
      g.stroke();
      g.beginPath();
      g.moveTo(bx - r * 0.24, by + r * 0.24);
      g.lineTo(bx + r * 0.24, by - r * 0.24);
      g.stroke();
    }
  }
}

export const bubblePop: GameDef = { create: createBubblePop, howTo };
