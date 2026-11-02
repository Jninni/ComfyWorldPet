/**
 * Dance Along — arrow notes slide toward a hit ring on the beat; press the
 * matching direction (on-screen pads, arrows/WASD, d-pad). The critter
 * dances on every hit.
 */
import { audio } from "../../audio/Audio";
import type { Btn } from "../../core/Input";
import { C, DIRS, DIR_COLOR, DIR_DEEP, INK, clamp, drawArrow, drawRug, drawTwinkle, drawPaw, ink, rgba, rrect, rand, pick, lighten, type Dir } from "../draw";
import { BELL_NOTE } from "./melodyMatch";
import type { Critter } from "../critter";
import type { Game, GameCtx, GameDef, GameOutcome } from "../types";

interface Note {
  t: number;
  dir: Dir;
  judged: "" | "perfect" | "good" | "miss";
  jt: number; // time judged
}

const PAD_ORDER: Dir[] = ["left", "up", "down", "right"];

function layout(l: number, t: number, r: number, b: number) {
  const pw = r - l,
    ph = b - t;
  const P = clamp(Math.min(pw * 0.13, ph * 0.17), 64, 118);
  const gap = P * 0.28;
  const padsW = P * 4 + gap * 3;
  const padY = b - P / 2 - 2;
  const pads = PAD_ORDER.map((d, i) => ({ dir: d, x: (l + r) / 2 - padsW / 2 + P / 2 + i * (P + gap), y: padY }));
  const H = clamp(P * 0.95, 60, 112);
  const trackY = padY - P / 2 - H / 2 - Math.max(14, P * 0.3);
  const trackL = l + 6,
    trackR = r - 6;
  const ringX = l + Math.max(H * 0.9, pw * 0.17);
  const spawnX = trackR - H * 0.5;
  const stageTop = t;
  const stageBottom = trackY - H / 2 - 8;
  const S = clamp(Math.min((stageBottom - stageTop) / 2.7, pw * 0.13), 28, 120);
  const critX = (l + r) / 2 + Math.min(pw * 0.08, S * 1.2);
  const feetY = stageBottom - S * 0.3;
  return { P, pads, H, trackY, trackL, trackR, ringX, spawnX, S, critX, feetY, pw, ph };
}
type L = ReturnType<typeof layout>;

function drawPad(g: CanvasRenderingContext2D, x: number, y: number, P: number, dir: Dir, press: number) {
  const lw = Math.max(2.5, P * 0.05);
  const dy = press * P * 0.06;
  const h = P;
  g.beginPath();
  rrect(g, x - P / 2, y - h / 2 + P * 0.08, P, h, P * 0.3);
  g.fillStyle = DIR_DEEP[dir];
  g.lineWidth = lw * 2;
  g.strokeStyle = INK;
  g.stroke();
  g.fill();
  g.beginPath();
  rrect(g, x - P / 2, y - h / 2 + dy, P, h - P * 0.02, P * 0.3);
  ink(g, press > 0.05 ? lighten(DIR_COLOR[dir], 0.35) : DIR_COLOR[dir], lw * 2);
  g.save();
  g.globalAlpha = 0.6;
  g.beginPath();
  g.ellipse(x - P * 0.22, y - P * 0.28 + dy, P * 0.14, P * 0.07, -0.5, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
  g.restore();
  drawArrow(g, x, y + dy + P * 0.02, P * 0.28, dir, "#fff", P * 0.035);
}

function drawNoteTile(g: CanvasRenderingContext2D, x: number, y: number, sz: number, dir: Dir, glow: number) {
  const lw = Math.max(2.5, sz * 0.06);
  if (glow > 0) {
    g.save();
    g.shadowColor = rgba(DIR_COLOR[dir], 0.95);
    g.shadowBlur = sz * 0.6 * glow;
    g.beginPath();
    rrect(g, x - sz / 2, y - sz / 2, sz, sz, sz * 0.32);
    g.fillStyle = DIR_COLOR[dir];
    g.fill();
    g.restore();
  }
  g.beginPath();
  rrect(g, x - sz / 2, y - sz / 2, sz, sz, sz * 0.32);
  ink(g, DIR_COLOR[dir], lw * 2);
  g.save();
  g.globalAlpha = 0.55;
  g.beginPath();
  g.ellipse(x - sz * 0.2, y - sz * 0.27, sz * 0.15, sz * 0.07, -0.5, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
  g.restore();
  drawArrow(g, x, y + sz * 0.02, sz * 0.27, dir, "#fff", sz * 0.04);
}

function drawTrack(g: CanvasRenderingContext2D, Lo: L, beatPhase: number, songT: number, beat: number, travel: number) {
  const { H, trackY, trackL, trackR, ringX } = Lo;
  const lw = Math.max(2.5, H * 0.05);
  g.beginPath();
  rrect(g, trackL, trackY - H / 2 + H * 0.1, trackR - trackL, H, H / 2);
  g.fillStyle = rgba(INK, 0.15);
  g.fill();
  g.beginPath();
  rrect(g, trackL, trackY - H / 2, trackR - trackL, H, H / 2);
  ink(g, rgba(C.cream, 0.94), lw * 2);
  // beat lines scrolling toward the ring
  g.save();
  g.beginPath();
  rrect(g, trackL, trackY - H / 2, trackR - trackL, H, H / 2);
  g.clip();
  const pxPerSec = (Lo.spawnX - ringX) / travel;
  const first = Math.floor(songT / beat) - 2;
  for (let i = first; i < first + 40; i++) {
    const x = ringX + (i * beat - songT) * pxPerSec;
    if (x > trackR + 10) break;
    if (x < trackL - 10) continue;
    g.beginPath();
    g.moveTo(x, trackY - H * 0.32);
    g.lineTo(x, trackY + H * 0.32);
    g.strokeStyle = rgba(C.lavenderDeep, i % 2 === 0 ? 0.45 : 0.22);
    g.lineWidth = Math.max(2, H * 0.04);
    g.lineCap = "round";
    g.stroke();
  }
  g.restore();
  // stitched edge
  g.save();
  g.setLineDash([H * 0.1, H * 0.09]);
  g.beginPath();
  rrect(g, trackL + H * 0.12, trackY - H / 2 + H * 0.12, trackR - trackL - H * 0.24, H * 0.76, H * 0.38);
  g.strokeStyle = rgba(C.pinkDeep, 0.5);
  g.lineWidth = Math.max(1.5, H * 0.03);
  g.stroke();
  g.restore();
  // hit ring
  const pulse = Math.pow(1 - beatPhase, 3);
  const rr = H * 0.5 * (1 + pulse * 0.08);
  g.save();
  g.shadowColor = rgba(C.rose, 0.6);
  g.shadowBlur = H * 0.35 * (0.5 + pulse);
  g.beginPath();
  g.arc(ringX, trackY, rr, 0, Math.PI * 2);
  g.fillStyle = rgba(C.pink, 0.35 + pulse * 0.25);
  g.fill();
  g.restore();
  g.beginPath();
  g.arc(ringX, trackY, rr, 0, Math.PI * 2);
  g.lineWidth = lw * 3.2;
  g.strokeStyle = INK;
  g.stroke();
  g.lineWidth = lw * 1.6;
  g.strokeStyle = "#fff";
  g.stroke();
  g.beginPath();
  g.arc(ringX, trackY, rr * 0.78, 0, Math.PI * 2);
  g.setLineDash([H * 0.08, H * 0.08]);
  g.strokeStyle = rgba(C.rose, 0.8);
  g.lineWidth = Math.max(1.5, lw * 0.6);
  g.stroke();
  g.setLineDash([]);
}

function drawStage(g: CanvasRenderingContext2D, Lo: L, beatPhase: number, T: number, accent: string) {
  const { critX, feetY, S } = Lo;
  // twinkly disco lights around the stage
  const pulse = Math.pow(1 - beatPhase, 2);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    const x = critX + Math.cos(a) * S * 2.6;
    const y = feetY - S * 1.0 + Math.sin(a) * S * 1.5;
    const c = [C.pink, C.butter, C.mint, C.sky, C.lavender, C.peach, C.pink][i];
    const on = (Math.floor(T * 2) + i) % 2 === 0;
    drawTwinkle(g, x, y, S * (0.14 + (on ? pulse * 0.12 : 0.02)), on ? c : rgba(c, 0.5));
  }
  drawRug(g, critX, feetY + S * 0.05, S * 1.6, S * 0.36, accent, C.butter);
}

export function createDanceAlong(ctx: GameCtx): Game {
  const d = ctx.opts.difficulty;
  const bpm = [88, 98, 108][d - 1];
  const beat = 60 / bpm;
  const N = [16, 20, 24][d - 1];
  const need = [9, 13, 17][d - 1];
  const travel = [2.3, 1.95, 1.65][d - 1];
  const perfectW = [0.13, 0.1, 0.085][d - 1];
  const goodW = [0.3, 0.24, 0.2][d - 1];
  const crit: Critter = ctx.critter;

  // chart
  const notes: Note[] = [];
  {
    let b = Math.ceil((travel + 0.6) / beat);
    let lastDir: Dir | null = null;
    let lastStep = 2;
    for (let i = 0; i < N; i++) {
      let dir = pick(DIRS);
      if (dir === lastDir && Math.random() < 0.6) dir = pick(DIRS.filter((x) => x !== lastDir));
      notes.push({ t: b * beat, dir, judged: "", jt: 0 });
      lastDir = dir;
      const oneP = d === 1 ? 0 : d === 2 ? 0.28 : 0.5;
      const step = lastStep === 1 && d === 2 ? 2 : Math.random() < oneP ? 1 : 2;
      lastStep = step;
      b += step;
      if (i % 8 === 7) b += 2; // little breather
    }
  }
  const songEnd = notes[notes.length - 1].t + 1.0;

  let T = 0;
  let songT = -0.0;
  let playing = false;
  let over = false;
  let hits = 0;
  let perfects = 0;
  let goods = 0;
  let lastBeat = -1;
  let resolveFn: ((o: GameOutcome) => void) | null = null;
  const press: Record<Dir, number> = { up: 0, down: 0, left: 0, right: 0 };
  let Lo = layout(0, 0, 1, 1);
  const accent = lighten(ctx.opts.color, 0.45);

  const judgeEnd = () => {
    if (over) return;
    over = true;
    playing = false;
    ctx.hud.hideTimer();
    if (hits >= need) {
      const acc = (perfects + goods * 0.6) / N;
      const stars = (acc >= 0.8 ? 3 : acc >= 0.6 ? 2 : 1) as 1 | 2 | 3;
      crit.setMood("love", 0);
      crit.hop(1);
      audio.sfx("success");
      setTimeout(() => resolveFn?.({ success: true, stars }), 700);
    } else {
      crit.setMood("sad", 1.5);
      setTimeout(() => resolveFn?.({ success: false, stars: 1 }), 700);
    }
  };

  const hit = (dir: Dir) => {
    press[dir] = 1;
    if (!playing) return;
    // nearest matching unjudged note in the window
    let best: Note | null = null;
    let bd = Infinity;
    let anyInWindow = false;
    for (const n of notes) {
      if (n.judged) continue;
      const dt = Math.abs(n.t - songT);
      if (dt <= goodW) {
        anyInWindow = true;
        if (n.dir === dir && dt < bd) {
          bd = dt;
          best = n;
        }
      }
      if (n.t - songT > goodW) break;
    }
    if (!best) {
      if (anyInWindow) {
        ctx.fx.text(Lo.ringX, Lo.trackY - Lo.H * 0.9, "Other way!", "mg-pop-miss", 600);
      }
      audio.sfx("click", { volume: 0.4 });
      return;
    }
    const perfect = bd <= perfectW;
    best.judged = perfect ? "perfect" : "good";
    best.jt = T;
    hits++;
    if (perfect) perfects++;
    else goods++;
    audio.note(BELL_NOTE[dir], "marimba");
    const fx = ctx.fx;
    fx.burst(Lo.ringX, Lo.trackY, "ring", { count: 1, size: Lo.H * 1.6, colors: [DIR_COLOR[dir]] });
    fx.burst(Lo.ringX, Lo.trackY, perfect ? "star" : "sparkle", { count: perfect ? 8 : 6, speed: 380 });
    fx.text(Lo.ringX, Lo.trackY - Lo.H * 0.95, perfect ? "Perfect!" : "Good!", perfect ? "mg-pop-perfect" : "mg-pop-good", 700);
    // dance!
    if (dir === "left") {
      crit.lean(-1.2);
      crit.hop(0.25);
    } else if (dir === "right") {
      crit.lean(1.2);
      crit.hop(0.25);
    } else if (dir === "up") crit.hop(0.8);
    else crit.squash(1.1);
    crit.setMood(perfect ? "love" : "happy", 0.5);
    if (perfect) crit.burst("sparkle", 3);
    ctx.hud.setProgress(hits / need, `${Math.min(hits, need)}/${need}`);
    if (hits === need) {
      const hp = ctx.hud.heartPos();
      fx.flyTo(Lo.critX, Lo.feetY - Lo.S, hp.x, hp.y, "heart", 40, C.rose, 0.7, () => ctx.hud.pulseHeart());
      fx.text(Lo.critX, Lo.feetY - Lo.S * 2.4, "Friends meter full!", "mg-pop-perfect", 1200);
    }
  };

  return {
    start() {
      playing = true;
      songT = 0;
      ctx.hud.setProgress(0, `0/${need}`);
      return new Promise((res) => (resolveFn = res));
    },
    onButton(b: Btn) {
      if (b === "up" || b === "down" || b === "left" || b === "right") hit(b);
    },
    onPointerDown(x, y) {
      const P = Lo.P;
      let best: Dir | null = null;
      let bd = Infinity;
      for (const p of Lo.pads) {
        const dx = Math.abs(x - p.x),
          dy = Math.abs(y - p.y);
        if (dx < P * 0.65 && dy < P * 0.75) {
          const dd = dx + dy;
          if (dd < bd) {
            bd = dd;
            best = p.dir;
          }
        }
      }
      if (best) hit(best);
    },
    update(dt) {
      T += dt;
      const v = ctx.view;
      Lo = layout(v.l, v.t, v.r, v.b);
      for (const k of DIRS) press[k] = Math.max(0, press[k] - dt * 6);
      if (playing) {
        songT += dt;
        const bi = Math.floor(songT / beat);
        if (bi !== lastBeat && songT >= 0) {
          lastBeat = bi;
          crit.bop = 1;
          if (songT < songEnd - 0.8) audio.sfx("step", { volume: 0.22, pitch: bi % 2 ? 1.5 : 1.2 });
        }
        for (const n of notes) {
          if (!n.judged && songT - n.t > goodW) {
            n.judged = "miss";
            n.jt = T;
            ctx.fx.text(Lo.ringX, Lo.trackY + Lo.H * 0.75, "Miss", "mg-pop-miss mg-pop-small", 600);
            crit.setMood("surprised", 0.35);
          }
        }
        const remaining = notes.filter((n) => !n.judged).length;
        if (hits + remaining < need) judgeEnd();
        else if (songT >= songEnd) judgeEnd();
        ctx.hud.setTimer(Math.max(0, songEnd - songT), songEnd);
      } else if (!over) {
        // idle bop behind the title card
        const bi = Math.floor(T / beat);
        if (bi !== lastBeat) {
          lastBeat = bi;
          crit.bop = 1;
        }
      }
      ctx.debug.songT = songT;
      ctx.debug.notes = notes.filter((n) => !n.judged).slice(0, 4).map((n) => ({ dir: n.dir, dt: +(n.t - songT).toFixed(3) }));
      ctx.debug.hits = hits;
      ctx.debug.need = need;
    },
    draw(g) {
      const st = playing || over ? songT : T;
      const beatPhase = (((st / beat) % 1) + 1) % 1;
      drawStage(g, Lo, beatPhase, T, accent);
      crit.draw(g, Lo.critX, Lo.feetY - Lo.S * 0.92, Lo.S);
      drawTrack(g, Lo, beatPhase, st, beat, travel);
      const pxPerSec = (Lo.spawnX - Lo.ringX) / travel;
      const sz = Lo.H * 0.74;
      // notes (draw far ones first)
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const dtn = n.t - songT;
        if (!playing && !over) continue;
        if (dtn > travel + 0.3) continue;
        let x = Lo.ringX + dtn * pxPerSec;
        let y = Lo.trackY;
        let a = 1,
          sc = 1;
        if (n.judged === "perfect" || n.judged === "good") {
          const k = (T - n.jt) / 0.25;
          if (k > 1) continue;
          x = Lo.ringX;
          sc = 1 + k * 0.6;
          a = 1 - k;
        } else if (n.judged === "miss") {
          const k = (T - n.jt) / 0.5;
          if (k > 1) continue;
          y += k * k * Lo.H * 0.9;
          a = 1 - k;
        }
        const enter = clamp((Lo.trackR - x) / (sz * 0.8), 0, 1);
        if (x > Lo.trackR + sz) continue;
        const near = !n.judged && Math.abs(dtn) <= goodW ? 1 - Math.abs(dtn) / goodW : 0;
        g.save();
        g.globalAlpha = a * enter;
        g.translate(x, y);
        g.scale(sc, sc);
        drawNoteTile(g, 0, 0, sz * (1 + near * 0.12), n.dir, near);
        g.restore();
      }
      for (const p of Lo.pads) drawPad(g, p.x, p.y, Lo.P, p.dir, press[p.dir]);
    },
  };
}

function howTo(g: CanvasRenderingContext2D, w: number, h: number, t: number, critter: Critter) {
  const Lo = layout(w * 0.04, h * 0.02, w * 0.96, h * 0.98);
  // squeeze for the small card
  const k = Math.min(1, h / 300);
  Lo.P = Math.max(30, Math.min(Lo.P, h * 0.2));
  const gap = Lo.P * 0.28;
  const padsW = Lo.P * 4 + gap * 3;
  Lo.pads.forEach((p, i) => {
    p.x = w / 2 - padsW / 2 + Lo.P / 2 + i * (Lo.P + gap);
    p.y = h - Lo.P / 2 - 6;
  });
  Lo.H = Math.max(30, Lo.P * 0.9);
  Lo.trackY = h - Lo.P - 6 - Lo.H / 2 - 10;
  Lo.ringX = w * 0.2;
  Lo.spawnX = w * 0.92;
  Lo.S = Math.min((Lo.trackY - Lo.H / 2) / 2.8, w * 0.1);
  Lo.critX = w * 0.55;
  Lo.feetY = Lo.trackY - Lo.H / 2 - 6 - Lo.S * 0.25;
  void k;
  const cyc = 2.4;
  const ph = (t % cyc) / cyc;
  const dir: Dir = (["up", "right", "left", "down"] as Dir[])[Math.floor(t / cyc) % 4];
  const beatPhase = (t / (cyc / 2)) % 1;
  drawStage(g, Lo, beatPhase, t, C.lilac);
  const hitK = 0.6;
  if (ph > hitK && ph < hitK + 0.05) {
    if (dir === "up") critter.hop(0.6);
    else if (dir === "down") critter.squash(1);
    else critter.lean(dir === "left" ? -1 : 1);
    critter.setMood("happy", 0.6);
  }
  critter.draw(g, Lo.critX, Lo.feetY - Lo.S * 0.92, Lo.S);
  drawTrack(g, Lo, beatPhase, t, cyc / 2, cyc * hitK);
  const sz = Lo.H * 0.74;
  if (ph < hitK) {
    const x = Lo.spawnX + (Lo.ringX - Lo.spawnX) * (ph / hitK);
    drawNoteTile(g, x, Lo.trackY, sz, dir, ph > hitK - 0.1 ? 1 : 0);
  } else if (ph < hitK + 0.15) {
    const f = (ph - hitK) / 0.15;
    g.save();
    g.globalAlpha = 1 - f;
    drawNoteTile(g, Lo.ringX, Lo.trackY, sz * (1 + f * 0.6), dir, 1);
    g.restore();
    g.save();
    g.font = `600 ${Math.max(14, Lo.H * 0.45)}px Fredoka, sans-serif`;
    g.textAlign = "center";
    g.lineWidth = 5;
    g.strokeStyle = INK;
    g.strokeText("Perfect!", Lo.ringX + sz * 1.3, Lo.trackY - Lo.H * 0.6 - f * 10);
    g.fillStyle = C.butter;
    g.fillText("Perfect!", Lo.ringX + sz * 1.3, Lo.trackY - Lo.H * 0.6 - f * 10);
    g.restore();
  }
  for (const p of Lo.pads) {
    const pressed = p.dir === dir && ph > hitK - 0.03 && ph < hitK + 0.12;
    drawPad(g, p.x, p.y, Lo.P, p.dir, pressed ? 1 : 0);
    if (pressed) drawPaw(g, p.x + Lo.P * 0.3, p.y + Lo.P * 0.25, Lo.P * 0.32, C.white, C.pink, 2);
  }
  void rand;
}

export const danceAlong: GameDef = { create: createDanceAlong, howTo };
