/**
 * Melody Match — four flower-bells in a diamond. The critter sings a short
 * sequence (bells light + notes); the player repeats it. 3 rounds.
 */
import { audio } from "../../audio/Audio";
import { input, type Btn } from "../../core/Input";
import { C, DIRS, DIR_COLOR, INK, clamp, drawArrow, drawFlowerBell, drawNote, drawPaw, drawRug, pick, rgba, type Dir } from "../draw";
import type { Critter } from "../critter";
import type { Game, GameCtx, GameDef, GameOutcome, PipState } from "../types";

export const BELL_NOTE: Record<Dir, number> = { up: 9, right: 7, down: 2, left: 4 };
const EAR_ICON = `<svg class="mg-banner-icon" viewBox="0 0 24 24"><path d="M7 10a5 5 0 0 1 10 0c0 3-3 3.5-3 6.5a2.5 2.5 0 0 1-5 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M10 10.5a2 2 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const NOTE_ICON = `<svg class="mg-banner-icon" viewBox="0 0 24 24"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="3" fill="currentColor"/><circle cx="17.5" cy="16" r="3" fill="currentColor"/></svg>`;

interface BellState {
  lit: number;
  pop: number;
  popV: number;
  wob: number;
  swing: number;
}

function geo(l: number, t0: number, r: number, b: number, banner = true) {
  // keep a band at the top free for the "Listen!" / "Your turn!" banner
  const t = banner ? t0 + Math.min(64, Math.max(34, (b - t0) * 0.08)) : t0;
  const pw = r - l,
    ph = b - t;
  const cx = (l + r) / 2,
    cy = (t + b) / 2;
  const Dy = ph * 0.335;
  const Dx = Math.min(pw * 0.3, Dy * 2.2);
  const Rb = Math.min(Dy * 0.43, Dx * 0.46, 140);
  const S = clamp(Math.min(Dy * 0.32, Dx * 0.34), 22, 95);
  const pos: Record<Dir, { x: number; y: number }> = {
    up: { x: cx, y: cy - Dy },
    right: { x: cx + Dx, y: cy },
    down: { x: cx, y: cy + Dy },
    left: { x: cx - Dx, y: cy },
  };
  return { cx, cy, Dx, Dy, Rb, S, pos };
}

function drawLeaves(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + s * r * 0.75, y + r * 0.7, r * 0.42, r * 0.2, s * 0.5, 0, Math.PI * 2);
    g.lineWidth = Math.max(2, r * 0.07) * 2;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = "#9ed98a";
    g.fill();
    g.beginPath();
    g.moveTo(x + s * r * 0.45, y + r * 0.62);
    g.lineTo(x + s * r * 1.0, y + r * 0.8);
    g.strokeStyle = rgba("#5fb46a", 0.8);
    g.lineWidth = Math.max(1.5, r * 0.04);
    g.stroke();
  }
}

function drawGarden(g: CanvasRenderingContext2D, G: ReturnType<typeof geo>, bells: Record<Dir, BellState>, T: number, showKeys: boolean) {
  // soft garden patch behind
  g.save();
  g.beginPath();
  g.ellipse(G.cx, G.cy, G.Dx + G.Rb * 1.2, G.Dy + G.Rb * 1.15, 0, 0, Math.PI * 2);
  g.fillStyle = rgba(C.cream, 0.55);
  g.fill();
  g.setLineDash([12, 10]);
  g.strokeStyle = rgba(C.lavenderDeep, 0.5);
  g.lineWidth = 3;
  g.stroke();
  g.restore();
  for (const d of DIRS) {
    const p = G.pos[d];
    const b = bells[d];
    const sc = 1 + b.pop;
    const wob = Math.sin(T * 40) * b.wob * 0.12;
    g.save();
    g.translate(p.x, p.y);
    g.rotate(wob);
    g.scale(sc, sc);
    drawLeaves(g, 0, 0, G.Rb);
    drawFlowerBell(g, 0, 0, G.Rb, DIR_COLOR[d], b.lit, T + DIRS.indexOf(d), b.swing * Math.sin(T * 14));
    g.restore();
    if (showKeys) {
      // arrow badge on the outer side
      const ox = d === "left" ? -1 : d === "right" ? 1 : 0;
      const oy = d === "up" ? -1 : d === "down" ? 1 : 0;
      const bx = p.x + (ox ? ox * G.Rb * 1.05 : G.Rb * 0.95);
      const by = p.y + (oy ? oy * G.Rb * 0.9 : -G.Rb * 0.85);
      const rr = Math.max(12, G.Rb * 0.24);
      g.beginPath();
      g.arc(bx, by, rr, 0, Math.PI * 2);
      g.fillStyle = C.white;
      g.lineWidth = Math.max(2, rr * 0.16) * 2;
      g.strokeStyle = INK;
      g.stroke();
      g.fill();
      drawArrow(g, bx, by, rr * 0.55, d, DIR_COLOR[d], rr * 0.08);
    }
  }
}

export function createMelodyMatch(ctx: GameCtx): Game {
  const d = ctx.opts.difficulty;
  const lengths = [
    [3, 3, 4],
    [3, 4, 5],
    [4, 5, 5],
  ][d - 1];
  const stepT = [0.7, 0.58, 0.47][d - 1];
  const allowed = [3, 2, 2][d - 1];
  const totalNotes = lengths.reduce((a, b) => a + b, 0);
  const crit: Critter = ctx.critter;
  const bells = Object.fromEntries(DIRS.map((k) => [k, { lit: 0, pop: 0, popV: 0, wob: 0, swing: 0 }])) as Record<Dir, BellState>;

  let phase: "idle" | "intro" | "listen" | "input" | "yay" | "oops" | "over" = "idle";
  let pt = 0;
  let T = 0;
  let round = 0;
  let seq: Dir[] = [];
  let playIdx = 0;
  let inputIdx = 0;
  let bestIdx = 0;
  let doneNotes = 0;
  let mistakes = 0;
  let idleT = 0;
  let resolveFn: ((o: GameOutcome) => void) | null = null;
  let G = geo(0, 0, 1, 1);

  const ring = (dir: Dir, byPlayer: boolean) => {
    const b = bells[dir];
    b.lit = 1;
    b.popV += 4.5;
    b.swing = 0.5;
    audio.note(BELL_NOTE[dir], "bell");
    const p = G.pos[dir];
    ctx.fx.burst(p.x, p.y - G.Rb * 0.3, "sparkle", { count: byPlayer ? 6 : 4, speed: 240, gravity: 0 });
    ctx.fx.burst(p.x, p.y, "ring", { count: 1, size: G.Rb * 1.8, colors: [DIR_COLOR[dir]] });
    crit.look((p.x - G.cx) / G.Dx, (p.y - G.cy) / G.Dy);
  };

  const pips = () => {
    const st: PipState[] = lengths.map((_, i) => (i < round ? "good" : i === round && phase !== "over" && phase !== "idle" ? "current" : "empty"));
    ctx.hud.setPips(st, "bell");
  };

  const extendSeq = () => {
    while (seq.length < lengths[round]) {
      let n = pick(DIRS);
      const L = seq.length;
      if (L >= 2 && seq[L - 1] === n && seq[L - 2] === n) n = DIRS[(DIRS.indexOf(n) + 1 + Math.floor(Math.random() * 3)) % 4];
      seq.push(n);
    }
  };

  const beginListen = () => {
    phase = "listen";
    pt = -0.35;
    playIdx = 0;
    inputIdx = 0;
    crit.setMood("sing", 0);
    ctx.banner("Listen!", 1300, EAR_ICON);
  };

  const press = (dir: Dir, fromPointer: boolean) => {
    if (phase !== "input") {
      if (phase === "listen") bells[dir].wob = 0.5;
      return;
    }
    idleT = 0;
    ring(dir, true);
    if (dir === seq[inputIdx]) {
      inputIdx++;
      bestIdx = Math.max(bestIdx, inputIdx);
      ctx.hud.setProgress((doneNotes + bestIdx) / totalNotes);
      const p = G.pos[dir];
      ctx.fx.burst(p.x, p.y - G.Rb * 0.6, "heart", { count: 2, speed: 200 });
      crit.squash(0.4);
      if (inputIdx >= seq.length) {
        phase = "yay";
        pt = 0;
        doneNotes += seq.length;
        bestIdx = 0;
        round++;
        crit.setMood("love", 1.3);
        crit.hop(0.8);
        setTimeout(() => audio.sfx("chime"), 180);
        ctx.fx.burst(G.cx, G.cy - G.S, "heart", { count: 14, speed: 460 });
        ctx.fx.burst(G.cx, G.cy - G.S, "sparkle", { count: 10, speed: 400 });
        ctx.fx.text(G.cx, G.cy - G.S * 1.9, round >= lengths.length ? "Perfect song!" : "Yay!", "mg-pop-perfect", 1000);
        const hp = ctx.hud.heartPos();
        ctx.fx.flyTo(G.cx, G.cy - G.S, hp.x, hp.y, "heart", 34, C.rose, 0.7, () => ctx.hud.pulseHeart());
        pips();
      }
    } else {
      mistakes++;
      bells[dir].wob = 1;
      crit.setMood("surprised", 0.9);
      audio.sfx("miss");
      phase = "oops";
      pt = 0;
      const p = G.pos[dir];
      ctx.fx.burst(p.x, p.y, "poof", { count: 4, speed: 90 });
      if (mistakes > allowed) ctx.fx.text(G.cx, G.cy - G.S * 1.9, "Oops!", "mg-pop-miss", 1000);
      else ctx.banner("Oops! Listen again", 1400, EAR_ICON);
    }
    void fromPointer;
  };

  return {
    start() {
      phase = "intro";
      pt = 0;
      round = 0;
      seq = [];
      ctx.hud.setProgress(0);
      pips();
      crit.wave();
      return new Promise((res) => (resolveFn = res));
    },
    onButton(b: Btn) {
      if (b === "up" || b === "down" || b === "left" || b === "right") press(b, false);
    },
    onPointerDown(x, y) {
      let best: Dir | null = null;
      let bd = Infinity;
      for (const dd of DIRS) {
        const p = G.pos[dd];
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist < Math.max(G.Rb * 1.15, 44) && dist < bd) {
          bd = dist;
          best = dd;
        }
      }
      if (best) press(best, true);
    },
    update(dt) {
      T += dt;
      pt += dt;
      const v = ctx.view;
      G = geo(v.l, v.t, v.r, v.b);
      for (const k of DIRS) {
        const b = bells[k];
        b.lit = Math.max(0, b.lit - dt * 2.6);
        b.popV += (-160 * b.pop - 12 * b.popV) * dt;
        b.pop += b.popV * dt;
        b.wob = Math.max(0, b.wob - dt * 2);
        b.swing *= Math.exp(-dt * 3);
      }
      if (phase === "idle") {
        // ambient demo twinkle
        if (Math.floor(T / 1.2) !== Math.floor((T - dt) / 1.2)) {
          const dd = DIRS[Math.floor(T / 1.2) % 4];
          bells[dd].lit = 0.6;
          bells[dd].popV += 2;
        }
      } else if (phase === "intro") {
        if (pt > 0.7) {
          extendSeq();
          beginListen();
        }
      } else if (phase === "listen") {
        const due = Math.floor(pt / stepT);
        if (pt >= 0 && due >= playIdx && playIdx < seq.length) {
          ring(seq[playIdx], false);
          crit.squash(0.3);
          playIdx++;
        }
        if (playIdx >= seq.length && pt > seq.length * stepT + 0.15) {
          phase = "input";
          pt = 0;
          idleT = 0;
          crit.setMood("idle", 0);
          crit.look(0, 0.4);
          ctx.banner("Your turn!", 1300, NOTE_ICON);
        }
      } else if (phase === "input") {
        idleT += dt;
        // hint for the next bell after a long pause (kind to little ones)
        if (idleT > (d === 1 ? 3.5 : 5)) {
          idleT = 0;
          const nd = seq[inputIdx];
          bells[nd].lit = 0.45;
          bells[nd].popV += 2;
        }
      } else if (phase === "yay") {
        if (pt > 1.2) {
          if (round >= lengths.length) {
            phase = "over";
            pips();
            crit.setMood("love", 0);
            const stars = (mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1) as 1 | 2 | 3;
            setTimeout(() => resolveFn?.({ success: true, stars }), 400);
          } else {
            extendSeq();
            pips();
            beginListen();
          }
        }
      } else if (phase === "oops") {
        if (pt > 1.25) {
          if (mistakes > allowed) {
            phase = "over";
            crit.setMood("sad", 1.2);
            setTimeout(() => resolveFn?.({ success: false, stars: 1 }), 300);
          } else beginListen();
        }
      }
      Object.assign(ctx.debug, { phase, seq: [...seq], inputIdx, round, mistakes });
    },
    draw(g) {
      const showKeys = !ctx.pointerMode && input.lastDevice !== "touch";
      drawGarden(g, G, bells, T, showKeys);
      const fy = G.cy + G.S * 1.1;
      drawRug(g, G.cx, fy, G.S * 1.3, G.S * 0.3, C.lilac, C.pink);
      crit.draw(g, G.cx, fy - G.S * 0.92, G.S);
    },
  };
}

function howTo(g: CanvasRenderingContext2D, w: number, h: number, t: number, critter: Critter) {
  const G = geo(w * 0.1, h * 0.04, w * 0.9, h * 0.96, false);
  const cyc = 4.2;
  const k = t % cyc;
  const seq: Dir[] = ["up", "right", "down"];
  const bells = Object.fromEntries(DIRS.map((dd) => [dd, { lit: 0, pop: 0, popV: 0, wob: 0, swing: 0 }])) as Record<Dir, BellState>;
  let paw: { x: number; y: number } | null = null;
  for (let i = 0; i < 3; i++) {
    const ts = 0.2 + i * 0.5; // critter sings
    const tp = 2.2 + i * 0.5; // paw repeats
    for (const tt of [ts, tp]) {
      const dt = k - tt;
      if (dt >= 0 && dt < 0.45) {
        bells[seq[i]].lit = 1 - dt / 0.45;
        bells[seq[i]].pop = Math.sin((dt / 0.45) * Math.PI) * 0.12;
      }
    }
    if (k >= tp - 0.15 && k < tp + 0.3) paw = { x: G.pos[seq[i]].x + G.Rb * 0.4, y: G.pos[seq[i]].y + G.Rb * 0.5 };
  }
  const singing = k < 1.8;
  critter.setMood(singing ? "sing" : k > 3.7 ? "happy" : "idle", 0.2);
  drawGarden(g, G, bells, t, false);
  critter.draw(g, G.cx, G.cy - G.S * 0.1, G.S * 0.95);
  if (singing) {
    const f = (k * 1.4) % 1;
    g.save();
    g.globalAlpha = 1 - f;
    drawNote(g, G.cx + G.S * 1.1, G.cy - G.S * (1.1 + f), G.S * 0.5, C.lavenderDeep, 2);
    g.restore();
  }
  if (paw) drawPaw(g, paw.x, paw.y, Math.max(14, G.Rb * 0.45), C.white, C.pink, 2);
}

export const melodyMatch: GameDef = { create: createMelodyMatch, howTo };
