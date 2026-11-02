/**
 * Treat Toss — a treat sweeps along a curved meter; press when it is inside
 * the glowing heart zone to toss it to the critter. 3 good tosses out of 5.
 */
import { audio } from "../../audio/Audio";
import { input, btnLabel, type Btn } from "../../core/Input";
import { C, INK, clamp, drawHeart, drawTreat, rgba, lighten, rand, easeOutBack, drawRug, pillLabel, drawPaw, lerp, type TreatKind } from "../draw";
import type { Critter } from "../critter";
import type { Game, GameCtx, GameDef, GameOutcome, PipState } from "../types";

const TOTAL = 5;
const NEED = 3;
const TREATS: TreatKind[] = ["cookie", "berry", "apple", "cookie", "berry"];

interface Geo {
  cx: number;
  cy: number;
  R: number;
  a0: number;
  a1: number;
  T: number;
  S: number;
  critX: number;
  critY: number;
  feetY: number;
  s: number;
}

function arcGeo(l: number, t: number, r: number, b: number, s: number): Geo {
  const pw = r - l,
    ph = b - t;
  const a0 = (140 * Math.PI) / 180,
    a1 = (40 * Math.PI) / 180;
  const R = Math.min(pw * 0.5, ph * 1.05, 620);
  const T = Math.max(26, 46 * s);
  const bottom = b - T * 0.6 - 18 * s;
  const cy = bottom - R;
  const cx = (l + r) / 2;
  const endsY = cy + R * Math.sin(a1);
  const feetY = endsY - T * 0.2;
  const S = clamp(Math.min((feetY - t) / 3.0, pw * 0.11, 135), 28, 135);
  return { cx, cy, R, a0, a1, T, S, critX: cx, critY: feetY - S * 0.92, feetY, s };
}
function arcPt(G: Geo, u: number) {
  const a = lerp(G.a0, G.a1, u);
  return { x: G.cx + Math.cos(a) * G.R, y: G.cy + Math.sin(a) * G.R, a };
}

function drawMeter(g: CanvasRenderingContext2D, G: Geo, zc: number, zh: number, inZone: boolean, t: number) {
  const lw = Math.max(2.5, G.T * 0.09);
  const seg = (u0: number, u1: number) => {
    g.beginPath();
    g.arc(G.cx, G.cy, G.R, lerp(G.a0, G.a1, u1), lerp(G.a0, G.a1, u0));
  };
  g.lineCap = "round";
  // shadow
  g.save();
  g.translate(0, G.T * 0.18);
  seg(0, 1);
  g.strokeStyle = rgba(INK, 0.15);
  g.lineWidth = G.T + lw * 2;
  g.stroke();
  g.restore();
  seg(0, 1);
  g.strokeStyle = INK;
  g.lineWidth = G.T + lw * 2;
  g.stroke();
  seg(0, 1);
  g.strokeStyle = C.cream;
  g.lineWidth = G.T;
  g.stroke();
  // inner groove
  seg(0, 1);
  g.strokeStyle = rgba(C.lavender, 0.55);
  g.lineWidth = G.T * 0.42;
  g.stroke();
  // stitch
  g.save();
  g.setLineDash([G.T * 0.14, G.T * 0.14]);
  g.beginPath();
  g.arc(G.cx, G.cy, G.R - G.T * 0.36, G.a1, G.a0);
  g.strokeStyle = rgba(C.pinkDeep, 0.6);
  g.lineWidth = Math.max(1.5, G.T * 0.05);
  g.stroke();
  g.beginPath();
  g.arc(G.cx, G.cy, G.R + G.T * 0.36, G.a1, G.a0);
  g.stroke();
  g.restore();
  // heart zone
  const z0 = clamp(zc - zh, 0, 1),
    z1 = clamp(zc + zh, 0, 1);
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  g.save();
  g.shadowColor = rgba(C.rose, inZone ? 0.95 : 0.6);
  g.shadowBlur = G.T * (inZone ? 0.9 : 0.4 + pulse * 0.3);
  seg(z0, z1);
  g.strokeStyle = inZone ? C.rose : C.pinkDeep;
  g.lineWidth = G.T * 0.82;
  g.stroke();
  g.restore();
  seg(z0, z1);
  g.strokeStyle = rgba("#ffffff", 0.35 + pulse * 0.2);
  g.lineWidth = G.T * 0.22;
  g.stroke();
  // zone end caps (little ticks)
  for (const u of [z0, z1]) {
    const p = arcPt(G, u);
    const nx = Math.cos(p.a),
      ny = Math.sin(p.a);
    g.beginPath();
    g.moveTo(p.x - nx * G.T * 0.55, p.y - ny * G.T * 0.55);
    g.lineTo(p.x + nx * G.T * 0.55, p.y + ny * G.T * 0.55);
    g.strokeStyle = INK;
    g.lineWidth = lw;
    g.stroke();
  }
  // heart badge above zone
  const hp = arcPt(G, zc);
  const hs = G.T * (0.95 + (inZone ? 0.35 : pulse * 0.08));
  const ox = -Math.cos(hp.a) * G.T * 1.05,
    oy = -Math.sin(hp.a) * G.T * 1.05;
  drawHeart(g, hp.x + ox, hp.y + oy, hs, inZone ? C.rose : C.pink, hs * 0.07);
}

function drawGround(g: CanvasRenderingContext2D, G: Geo) {
  drawRug(g, G.critX, G.feetY + G.S * 0.02, G.S * 1.55, G.S * 0.36, C.butter, C.pink);
}

export function createTreatToss(ctx: GameCtx): Game {
  const d = ctx.opts.difficulty;
  const traverse = [1.55, 1.12, 0.86][d - 1];
  const zoneHalf = [0.13, 0.09, 0.064][d - 1];
  const grace = [0.03, 0.015, 0.008][d - 1];
  const crit: Critter = ctx.critter;

  let phase: "idle" | "appear" | "aim" | "fly" | "react" | "over" = "idle";
  let pt = 0; // time in phase
  let T = 0;
  let sweep = 0; // progress along triangle wave
  let u = 0;
  let zc = 0.5;
  let tossIdx = 0;
  let good = 0;
  let misses = 0;
  const results: PipState[] = [];
  let speedMul = 1;
  let resolveFn: ((o: GameOutcome) => void) | null = null;
  // flight
  let fly: { x0: number; y0: number; x1: number; y1: number; h: number; dur: number; good: boolean; perfect: boolean; rot: number } | null = null;
  let fall: { x: number; y: number; vx: number; vy: number; rot: number; a: number } | null = null;
  let treatPop = 0;
  let geo = arcGeo(0, 0, 1, 1, 1);

  const newZone = () => {
    let z = zc;
    for (let i = 0; i < 10 && Math.abs(z - zc) < 0.22; i++) z = rand(0.2, 0.8);
    zc = z;
  };
  newZone();

  const updatePips = () => {
    const st: PipState[] = [];
    for (let i = 0; i < TOTAL; i++) st.push(results[i] ?? (i === tossIdx && phase !== "over" && phase !== "idle" ? "current" : "empty"));
    ctx.hud.setPips(st, "treat");
  };

  const toss = () => {
    if (phase !== "aim") return;
    const dist = Math.abs(u - zc);
    const ok = dist <= zoneHalf + grace;
    const perfect = dist <= zoneHalf * 0.38;
    const p = arcPt(geo, u);
    const mouth = { x: geo.critX, y: geo.critY + geo.S * 0.2 };
    const side = u < 0.5 ? -1 : 1;
    const target = ok ? mouth : { x: geo.critX + side * geo.S * rand(1.3, 1.7), y: geo.critY - geo.S * 0.2 };
    fly = { x0: p.x, y0: p.y, x1: target.x, y1: target.y, h: geo.S * 1.1 + Math.abs(p.y - target.y) * 0.4, dur: 0.55, good: ok, perfect, rot: 0 };
    phase = "fly";
    pt = 0;
    audio.sfx("whoosh");
    crit.look((p.x - geo.critX) / (geo.S * 3), 0.6);
    if (ok) crit.setMood("wow", 0.6);
  };

  const arrive = () => {
    if (!fly) return;
    const f = fly;
    const g = geo;
    if (f.good) {
      good++;
      results[tossIdx] = f.perfect ? "great" : "good";
      crit.setMood(f.perfect ? "love" : "nom", 1.1);
      crit.squash(0.9);
      setTimeout(() => crit.hop(0.6), 250);
      audio.sfx("pop", { pitch: 1.2 });
      setTimeout(() => audio.sfx("heart", { pitch: 1 + good * 0.1 }), 120);
      audio.voice(ctx.opts.species, "happy");
      const mx = g.critX,
        my = g.critY + g.S * 0.15;
      ctx.fx.burst(mx, my, "heart", { count: f.perfect ? 14 : 9, speed: 420 * g.s + 120 });
      ctx.fx.burst(mx, my, "dot", { count: 8, colors: [C.cookie, "#f2c98c"], speed: 260, gravity: 700 });
      if (f.perfect) ctx.fx.burst(mx, my, "sparkle", { count: 12, speed: 500 });
      ctx.fx.text(mx, g.critY - g.S * 1.25, f.perfect ? "Perfect!" : "Yummy!", f.perfect ? "mg-pop-perfect" : "mg-pop-good");
      const hp = ctx.hud.heartPos();
      ctx.fx.flyTo(mx, my, hp.x, hp.y, "heart", 34, C.rose, 0.7, () => ctx.hud.pulseHeart());
      ctx.hud.setProgress(good / NEED, `${good}/${NEED}`);
      fly = null;
    } else {
      misses++;
      results[tossIdx] = "miss";
      crit.setMood("surprised", 0.9);
      audio.sfx("miss");
      fall = { x: f.x1, y: f.y1, vx: (f.x1 - f.x0) * 0.6, vy: -260 * g.s, rot: f.rot, a: 1 };
      ctx.fx.burst(f.x1, f.y1, "poof", { count: 4, speed: 80 });
      ctx.fx.text(f.x1, f.y1 - g.S * 0.6, "Oops!", "mg-pop-miss");
      fly = null;
    }
    tossIdx++;
    phase = "react";
    pt = 0;
    updatePips();
  };

  const nextOrEnd = () => {
    if (good >= NEED) {
      phase = "over";
      crit.setMood("love", 0);
      updatePips();
      const stars = (misses === 0 ? 3 : misses === 1 ? 2 : 1) as 1 | 2 | 3;
      setTimeout(() => resolveFn?.({ success: true, stars }), 700);
      return;
    }
    if (TOTAL - tossIdx + good < NEED) {
      phase = "over";
      updatePips();
      setTimeout(() => resolveFn?.({ success: false, stars: 1 }), 500);
      return;
    }
    newZone();
    speedMul *= 1.05;
    sweep = 0;
    phase = "appear";
    pt = 0;
    treatPop = 0;
    crit.look(0, 0.3);
    updatePips();
  };

  return {
    start() {
      phase = "appear";
      pt = 0;
      treatPop = 0;
      sweep = 0;
      updatePips();
      ctx.hud.setProgress(0, `0/${NEED}`);
      return new Promise((res) => (resolveFn = res));
    },
    onButton(b: Btn) {
      if (b === "a") toss();
    },
    onPointerDown(_x, y) {
      if (y > ctx.view.t - 4) toss();
    },
    update(dt) {
      T += dt;
      pt += dt;
      const v = ctx.view;
      geo = arcGeo(v.l, v.t, v.r, v.b, v.s);
      if (phase === "idle") {
        u = 0.5 + Math.sin(T * 1.4) * 0.35;
      } else if (phase === "appear") {
        treatPop = Math.min(1, pt / 0.35);
        u = 0;
        if (pt > 0.45) {
          phase = "aim";
          pt = 0;
        }
      } else if (phase === "aim") {
        sweep += (dt / traverse) * speedMul;
        const tri = 1 - Math.abs(((sweep % 2) + 2) % 2 - 1); // 0→1→0
        u = 0.82 * tri + 0.18 * (0.5 - 0.5 * Math.cos(Math.PI * tri));
        const p = arcPt(geo, u);
        crit.look((p.x - geo.critX) / (geo.S * 4), 0.5);
      } else if (phase === "fly" && fly) {
        fly.rot += dt * 9;
        if (pt >= fly.dur) arrive();
      } else if (phase === "react") {
        if (pt > 1.05) nextOrEnd();
      }
      if (fall) {
        fall.vy += 1400 * v.s * dt;
        fall.x += fall.vx * dt;
        fall.y += fall.vy * dt;
        fall.rot += dt * 6;
        if (fall.y > geo.feetY - 10 && fall.vy > 0) {
          fall.vy *= -0.4;
          fall.y = geo.feetY - 10;
          fall.vx *= 0.6;
        }
        fall.a -= dt * 1.1;
        if (fall.a <= 0) fall = null;
      }
      Object.assign(ctx.debug, { phase, u, zc, zh: zoneHalf + grace, good, tossIdx, misses });
    },
    draw(g) {
      const G = geo;
      drawGround(g, G);
      crit.draw(g, G.critX, G.critY, G.S);
      const inZone = phase === "aim" && Math.abs(u - zc) <= zoneHalf + grace;
      drawMeter(g, G, zc, zoneHalf, inZone, T);
      const kind = TREATS[Math.min(tossIdx, TOTAL - 1)];
      const tr = G.T * 0.62;
      // treat on the track
      if (phase === "idle" || phase === "appear" || phase === "aim") {
        const p = arcPt(G, u);
        const sc = phase === "appear" ? easeOutBack(treatPop, 2.4) : 1;
        if (inZone) {
          g.save();
          g.fillStyle = rgba("#ffffff", 0.6);
          g.beginPath();
          g.arc(p.x, p.y, tr * 1.45, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
        drawTreat(g, kind, p.x, p.y, tr * Math.max(0.01, sc) * (inZone ? 1.12 : 1), u * 9);
      }
      if (fly) {
        const k = clamp(pt / fly.dur, 0, 1);
        const x = lerp(fly.x0, fly.x1, k);
        const y = lerp(fly.y0, fly.y1, k) - Math.sin(k * Math.PI) * fly.h;
        drawTreat(g, kind, x, y, tr * (1 + Math.sin(k * Math.PI) * 0.25), fly.rot);
      }
      if (fall) {
        g.save();
        g.globalAlpha = clamp(fall.a, 0, 1);
        drawTreat(g, TREATS[Math.max(0, tossIdx - 1)], fall.x, fall.y, tr, fall.rot);
        g.restore();
      }
      // prompt below the arc
      if (phase === "aim" || phase === "appear") {
        const bottom = G.cy + G.R;
        const label = ctx.pointerMode || input.lastDevice === "touch" ? "Tap!" : `Press ${btnLabel("a")}`;
        const bob = Math.sin(T * 8) * 3;
        pillLabel(g, G.cx, Math.min(ctx.view.b - 14 * G.s, bottom + G.T * 0.15) + bob - G.T * 1.6, label, Math.max(15, 24 * G.s), inZone ? C.rose : C.lavenderDeep);
      }
    },
  };
}

/* ---------------------------------------------------------------- how-to */

function howTo(g: CanvasRenderingContext2D, w: number, h: number, t: number, critter: Critter) {
  const s = Math.min(w / 420, h / 240);
  const G = arcGeo(w * 0.08, h * 0.04, w * 0.92, h * 0.98, s * 0.85);
  G.S = Math.min(G.S, h * 0.2);
  G.critY = G.feetY - G.S * 0.92;
  const cyc = 2.6;
  const k = (t % cyc) / cyc;
  const zc = 0.62;
  // treat sweeps to the zone, tap, flies
  let u = Math.min(1, k / 0.42) * zc;
  const tapK = 0.42;
  drawGround(g, G);
  if (k > tapK + 0.2 && k < tapK + 0.55) critter.setMood("nom", 0.2);
  else if (k > tapK && k <= tapK + 0.2) critter.setMood("wow", 0.2);
  critter.draw(g, G.critX, G.critY, G.S);
  const inZone = k >= tapK - 0.06 && k <= tapK + 0.02;
  drawMeter(g, G, zc, 0.1, inZone, t);
  const tr = G.T * 0.6;
  if (k < tapK) drawTreat(g, "cookie", arcPt(G, u).x, arcPt(G, u).y, tr, u * 9);
  else if (k < tapK + 0.2) {
    const f = (k - tapK) / 0.2;
    const p = arcPt(G, zc);
    const x = lerp(p.x, G.critX, f),
      y = lerp(p.y, G.critY + G.S * 0.2, f) - Math.sin(f * Math.PI) * G.S;
    if (f < 0.85) drawTreat(g, "cookie", x, y, tr * (1 - f * 0.45), f * 8);
  } else if (k < tapK + 0.6) {
    const f = (k - tapK - 0.2) / 0.4;
    for (let i = 0; i < 3; i++) {
      g.save();
      g.globalAlpha = 1 - f;
      drawHeart(g, G.critX + (i - 1) * G.S * 0.8, G.critY - G.S * (0.9 + f * 0.8) - (i % 2) * 8, G.S * 0.45, C.rose, 2);
      g.restore();
    }
  }
  // tapping paw near the bottom-right
  const press = k > tapK - 0.04 && k < tapK + 0.08;
  const px = G.cx + G.R * 0.55,
    py = G.cy + G.R * 0.98 + (press ? 6 : 0);
  if (press) {
    g.save();
    g.strokeStyle = rgba(C.rose, 0.8);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(px, py - 4, 20 + (k - tapK + 0.04) * 200, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
  drawPaw(g, px, py, Math.max(14, 26 * s), C.white, C.pink, 2);
  void lighten;
}

export const treatToss: GameDef = { create: createTreatToss, howTo };
