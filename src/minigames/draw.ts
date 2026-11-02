/**
 * Canvas2D drawing helpers for the minigames: palette, colour maths and a
 * library of chunky "sticker" shapes (hearts, stars, treats, arrows, bells…).
 */
export const INK = "#4a3a52";
export const C = {
  ink: INK,
  inkSoft: "#6d5a78",
  lavender: "#cdb9f0",
  lavenderDeep: "#a993dc",
  lilac: "#e3d6fa",
  pink: "#f8b9cb",
  pinkDeep: "#ef8fab",
  rose: "#f47a9a",
  mint: "#bfe9d6",
  mintDeep: "#8fd4b5",
  butter: "#fbe7a1",
  butterDeep: "#f5cf6b",
  sky: "#bfe0f6",
  skyDeep: "#8fc3ea",
  cream: "#fff6e6",
  white: "#fffdf8",
  peach: "#ffd3b5",
  orange: "#ffb766",
  sun: "#ffe066",
  red: "#f0727a",
  cloud: "#b9b3cc",
  cloudDeep: "#8e88a3",
  choco: "#8a5a44",
  cookie: "#e9b877",
};

export type Dir = "up" | "right" | "down" | "left";
export const DIRS: Dir[] = ["up", "right", "down", "left"];
/** colour per direction (shared by melodyMatch bells and danceAlong notes) */
export const DIR_COLOR: Record<Dir, string> = { up: C.pink, right: C.butter, down: C.mint, left: C.sky };
export const DIR_DEEP: Record<Dir, string> = { up: C.pinkDeep, right: C.butterDeep, down: C.mintDeep, left: C.skyDeep };
export const DIR_ANGLE: Record<Dir, number> = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

/* ------------------------------------------------------------------ colour */

export function hex2rgb(h: string): [number, number, number] {
  let s = (h || "").trim().replace("#", "");
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s)) s = "cdb9f0";
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function normHex(h: string): string {
  const [r, g, b] = hex2rgb(h);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function mix(a: string, b: string, t: number): string {
  const A = hex2rgb(a),
    B = hex2rgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
export const lighten = (c: string, t: number) => mix(c, "#ffffff", t);
export const darken = (c: string, t: number) => mix(c, INK, t);
export function rgba(c: string, a: number): string {
  const [r, g, b] = hex2rgb(c);
  return `rgba(${r},${g},${b},${a})`;
}

/* ------------------------------------------------------------------ maths */

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const easeOutBack = (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export function easeOutElastic(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

/* ------------------------------------------------------------------ paths */

export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** polygon with rounded corners */
export function roundPoly(g: CanvasRenderingContext2D, pts: [number, number][], r: number) {
  const n = pts.length;
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  g.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i],
      q = pts[(i + 1) % n];
    g.arcTo(p[0], p[1], q[0], q[1], r);
  }
  g.closePath();
}

/** parametric heart centred on (x,y), total width ≈ s */
export function heartPath(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const k = s / 33;
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const hx = 16 * Math.pow(Math.sin(t), 3);
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const px = x + hx * k,
      py = y - (hy + 2.5) * k;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

/** chubby rounded star */
export function starPath(g: CanvasRenderingContext2D, x: number, y: number, R: number, inner = 0.52, n = 5, rot = -Math.PI / 2) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 === 0 ? R : R * inner;
    const a = rot + (i * Math.PI) / n;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  roundPoly(g, pts, R * 0.16);
}

/** 4-point twinkle */
export function twinklePath(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const k = s * 0.22;
  g.moveTo(x, y - s);
  g.quadraticCurveTo(x + k * 0.3, y - k * 0.3, x + s, y);
  g.quadraticCurveTo(x + k * 0.3, y + k * 0.3, x, y + s);
  g.quadraticCurveTo(x - k * 0.3, y + k * 0.3, x - s, y);
  g.quadraticCurveTo(x - k * 0.3, y - k * 0.3, x, y - s);
  g.closePath();
}

export function cloudPath(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // s ≈ half width
  const bumps: [number, number, number][] = [
    [-0.55, 0.12, 0.42],
    [-0.18, -0.22, 0.5],
    [0.3, -0.12, 0.46],
    [0.62, 0.18, 0.36],
    [0.05, 0.25, 0.45],
  ];
  for (const [bx, by, br] of bumps) {
    g.moveTo(x + bx * s + br * s, y + by * s);
    g.arc(x + bx * s, y + by * s, br * s, 0, Math.PI * 2);
  }
}

/* ------------------------------------------------------------------ inked shapes */

/** Fill + thick ink outline for the current path. */
export function ink(g: CanvasRenderingContext2D, fill: string | CanvasGradient | null, lw: number, stroke = INK) {
  g.lineJoin = "round";
  g.lineCap = "round";
  if (lw > 0) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
}

/**
 * Draws a union silhouette: every sub-shape stroked at 2×lw first, then all
 * filled — so overlapping parts share one clean outer outline.
 */
export function silhouette(g: CanvasRenderingContext2D, shapes: (() => void)[], fill: string | CanvasGradient, lw: number) {
  g.lineJoin = "round";
  g.lineCap = "round";
  g.strokeStyle = INK;
  g.lineWidth = lw * 2;
  for (const s of shapes) {
    g.beginPath();
    s();
    g.stroke();
  }
  g.fillStyle = fill;
  for (const s of shapes) {
    g.beginPath();
    s();
    g.fill();
  }
}

export function shine(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = -0.6, a = 0.75) {
  g.save();
  g.globalAlpha *= a;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function drawHeart(g: CanvasRenderingContext2D, x: number, y: number, s: number, color = C.rose, lw = s * 0.09) {
  g.beginPath();
  heartPath(g, x, y, s);
  // outline outside: stroke first then fill
  g.lineJoin = "round";
  g.lineWidth = lw * 2;
  g.strokeStyle = INK;
  if (lw > 0) g.stroke();
  g.fillStyle = color;
  g.fill();
  shine(g, x - s * 0.2, y - s * 0.16, s * 0.11, s * 0.07, -0.7, 0.8);
}

export function drawStar(g: CanvasRenderingContext2D, x: number, y: number, R: number, color = C.sun, lw = R * 0.14, rot = -Math.PI / 2) {
  g.beginPath();
  starPath(g, x, y, R, 0.52, 5, rot);
  g.lineJoin = "round";
  if (lw > 0) {
    g.lineWidth = lw * 2;
    g.strokeStyle = INK;
    g.stroke();
  }
  g.fillStyle = color;
  g.fill();
  shine(g, x - R * 0.18, y - R * 0.2, R * 0.13, R * 0.08, -0.7, 0.7);
}

export function drawTwinkle(g: CanvasRenderingContext2D, x: number, y: number, s: number, color = "#fff") {
  g.beginPath();
  twinklePath(g, x, y, s);
  g.fillStyle = color;
  g.fill();
}

export function drawCookie(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  const lw = Math.max(2, r * 0.13);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  // wavy edge
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rr = r * (1 + Math.sin(a * 9) * 0.035);
    const px = Math.cos(a) * rr,
      py = Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  ink(g, C.cookie, lw * 2);
  g.beginPath();
  g.arc(0, r * 0.08, r * 0.78, 0, Math.PI * 2);
  g.fillStyle = "#f2c98c";
  g.fill();
  const chips: [number, number, number][] = [
    [-0.4, -0.3, 0.15],
    [0.3, -0.42, 0.12],
    [0.42, 0.2, 0.15],
    [-0.15, 0.38, 0.13],
    [-0.5, 0.15, 0.1],
    [0.05, -0.05, 0.11],
  ];
  g.fillStyle = C.choco;
  for (const [cx, cy, cr] of chips) {
    g.beginPath();
    g.ellipse(cx * r, cy * r, cr * r, cr * r * 0.85, 0.4, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  shine(g, x - r * 0.38, y - r * 0.45, r * 0.18, r * 0.1, -0.7, 0.7);
}

export function drawBerry(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  const lw = Math.max(2, r * 0.13);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(0, r * 1.0);
  g.bezierCurveTo(-r * 1.25, r * 0.35, -r * 1.05, -r * 0.85, 0, -r * 0.72);
  g.bezierCurveTo(r * 1.05, -r * 0.85, r * 1.25, r * 0.35, 0, r * 1.0);
  g.closePath();
  ink(g, C.rose, lw * 2);
  g.fillStyle = C.butter;
  for (const [sx, sy] of [
    [-0.4, -0.2],
    [0.05, -0.32],
    [0.45, -0.18],
    [-0.25, 0.22],
    [0.25, 0.25],
    [0, 0.6],
  ]) {
    g.beginPath();
    g.ellipse(sx * r, sy * r, r * 0.07, r * 0.1, 0, 0, Math.PI * 2);
    g.fill();
  }
  // leaves
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * 0.65;
    g.moveTo(0, -r * 0.7);
    g.ellipse(Math.cos(a) * r * 0.32, -r * 0.72 + Math.sin(a) * r * 0.2, r * 0.3, r * 0.14, a, 0, Math.PI * 2);
  }
  ink(g, "#8fd27a", lw * 1.4);
  g.restore();
  shine(g, x - r * 0.4, y - r * 0.2, r * 0.17, r * 0.1, -0.9, 0.7);
}

export function drawApple(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  const lw = Math.max(2, r * 0.13);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  g.moveTo(0, -r * 0.62);
  g.bezierCurveTo(r * 0.7, -r * 1.05, r * 1.25, -r * 0.2, r * 0.8, r * 0.55);
  g.bezierCurveTo(r * 0.55, r * 1.0, r * 0.15, r * 0.95, 0, r * 0.82);
  g.bezierCurveTo(-r * 0.15, r * 0.95, -r * 0.55, r * 1.0, -r * 0.8, r * 0.55);
  g.bezierCurveTo(-r * 1.25, -r * 0.2, -r * 0.7, -r * 1.05, 0, -r * 0.62);
  g.closePath();
  ink(g, C.red, lw * 2);
  g.beginPath();
  g.moveTo(0, -r * 0.55);
  g.quadraticCurveTo(r * 0.05, -r * 0.9, r * 0.12, -r * 1.05);
  g.lineWidth = lw;
  g.strokeStyle = C.choco;
  g.stroke();
  g.beginPath();
  g.ellipse(r * 0.38, -r * 0.88, r * 0.3, r * 0.13, -0.5, 0, Math.PI * 2);
  ink(g, "#8fd27a", lw * 1.4);
  g.restore();
  shine(g, x - r * 0.42, y - r * 0.2, r * 0.18, r * 0.11, -0.9, 0.75);
}

export type TreatKind = "cookie" | "berry" | "apple";
export function drawTreat(g: CanvasRenderingContext2D, kind: TreatKind, x: number, y: number, r: number, rot = 0) {
  if (kind === "cookie") drawCookie(g, x, y, r, rot);
  else if (kind === "berry") drawBerry(g, x, y, r, rot);
  else drawApple(g, x, y, r, rot);
}

/** chunky arrow pointing in dir */
export function drawArrow(g: CanvasRenderingContext2D, x: number, y: number, s: number, dir: Dir, fill = "#fff", lw = s * 0.12) {
  g.save();
  g.translate(x, y);
  g.rotate(DIR_ANGLE[dir]);
  const pts: [number, number][] = [
    [0, -s * 0.95],
    [s * 0.85, -s * 0.05],
    [s * 0.36, -s * 0.05],
    [s * 0.36, s * 0.85],
    [-s * 0.36, s * 0.85],
    [-s * 0.36, -s * 0.05],
    [-s * 0.85, -s * 0.05],
  ];
  g.beginPath();
  roundPoly(g, pts, s * 0.16);
  g.lineJoin = "round";
  if (lw > 0) {
    g.lineWidth = lw * 2;
    g.strokeStyle = INK;
    g.stroke();
  }
  g.fillStyle = fill;
  g.fill();
  g.restore();
}

export function drawNote(g: CanvasRenderingContext2D, x: number, y: number, s: number, color = C.lavenderDeep, lw = s * 0.12) {
  g.save();
  g.translate(x, y);
  g.lineJoin = "round";
  g.lineCap = "round";
  const head = () => {
    g.beginPath();
    g.ellipse(-s * 0.18, s * 0.42, s * 0.3, s * 0.23, -0.4, 0, Math.PI * 2);
  };
  const stem = () => {
    g.beginPath();
    g.moveTo(s * 0.08, s * 0.4);
    g.lineTo(s * 0.08, -s * 0.6);
    g.quadraticCurveTo(s * 0.45, -s * 0.45, s * 0.5, -s * 0.15);
  };
  g.strokeStyle = INK;
  g.lineWidth = s * 0.17 + lw * 2;
  stem();
  g.stroke();
  head();
  g.lineWidth = lw * 2;
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = s * 0.17;
  stem();
  g.stroke();
  head();
  g.fillStyle = color;
  g.fill();
  g.restore();
}

export function drawPaw(g: CanvasRenderingContext2D, x: number, y: number, s: number, color = C.white, padColor = C.pink, lw = s * 0.08) {
  g.save();
  g.translate(x, y);
  const toes: [number, number, number][] = [
    [-0.55, -0.42, 0.24],
    [-0.2, -0.68, 0.26],
    [0.2, -0.68, 0.26],
    [0.55, -0.42, 0.24],
  ];
  const shapes = [
    () => g.ellipse(0, s * 0.12, s * 0.62, s * 0.55, 0, 0, Math.PI * 2),
    ...toes.map(([tx, ty, tr]) => () => g.ellipse(tx * s, ty * s, tr * s, tr * s * 1.1, 0, 0, Math.PI * 2)),
  ];
  silhouette(g, shapes, color, lw);
  g.fillStyle = padColor;
  g.beginPath();
  g.ellipse(0, s * 0.2, s * 0.32, s * 0.26, 0, 0, Math.PI * 2);
  g.fill();
  for (const [tx, ty, tr] of toes) {
    g.beginPath();
    g.ellipse(tx * s, ty * s + s * 0.03, tr * s * 0.55, tr * s * 0.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function drawGrumpyCloud(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, lw = s * 0.1) {
  // rain drops
  g.save();
  g.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const ph = (t * 1.6 + i * 0.33) % 1;
    const dx = (i - 1) * s * 0.42;
    const dy = s * 0.55 + ph * s * 0.45;
    g.globalAlpha = 1 - ph;
    g.beginPath();
    g.moveTo(x + dx, y + dy);
    g.lineTo(x + dx - s * 0.05, y + dy + s * 0.16);
    g.strokeStyle = C.skyDeep;
    g.lineWidth = s * 0.11;
    g.stroke();
  }
  g.restore();
  g.beginPath();
  cloudPath(g, x, y, s);
  g.lineJoin = "round";
  g.lineWidth = lw * 2;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = C.cloud;
  g.fill();
  shine(g, x - s * 0.3, y - s * 0.3, s * 0.18, s * 0.09, -0.4, 0.55);
  // grumpy face
  g.fillStyle = INK;
  g.strokeStyle = INK;
  g.lineCap = "round";
  g.lineWidth = s * 0.07;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + sx * s * 0.25, y + s * 0.08, s * 0.06, s * 0.075, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath(); // brows
    g.moveTo(x + sx * s * 0.38, y - s * 0.1);
    g.lineTo(x + sx * s * 0.14, y - s * 0.02);
    g.stroke();
  }
  g.beginPath();
  g.arc(x, y + s * 0.36, s * 0.12, Math.PI * 1.15, Math.PI * 1.85);
  g.stroke();
}

/** Flower with a little bell in the middle. lit 0..1 */
export function drawFlowerBell(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lit: number, t: number, swing = 0) {
  const lw = Math.max(2.5, r * 0.07);
  const petals = 6;
  const pc = mix(color, "#ffffff", lit * 0.35);
  // glow
  if (lit > 0.01) {
    const gr = g.createRadialGradient(x, y, r * 0.4, x, y, r * 1.75);
    gr.addColorStop(0, rgba(lighten(color, 0.5), 0.85 * lit));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r * 1.75, 0, Math.PI * 2);
    g.fill();
  }
  const shapes: (() => void)[] = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + t * 0.15 - Math.PI / 2;
    const px = x + Math.cos(a) * r * 0.55,
      py = y + Math.sin(a) * r * 0.55;
    shapes.push(() => g.ellipse(px, py, r * 0.48, r * 0.42, a, 0, Math.PI * 2));
  }
  silhouette(g, shapes, pc, lw);
  // petal inner shading
  g.save();
  g.globalAlpha = 0.5;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + t * 0.15 - Math.PI / 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.66, y + Math.sin(a) * r * 0.66, r * 0.2, r * 0.13, a, 0, Math.PI * 2);
    g.fillStyle = "#ffffff";
    g.fill();
  }
  g.restore();
  // centre disc
  g.beginPath();
  g.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ink(g, lighten(color, 0.75), lw * 2);
  // dashed stitch around centre
  g.save();
  g.setLineDash([r * 0.07, r * 0.07]);
  g.beginPath();
  g.arc(x, y, r * 0.42, 0, Math.PI * 2);
  g.strokeStyle = rgba(darken(color, 0.35), 0.6);
  g.lineWidth = lw * 0.5;
  g.stroke();
  g.restore();
  // bell
  g.save();
  g.translate(x, y - r * 0.2);
  g.rotate(swing);
  const b = r * 0.3;
  g.beginPath();
  g.moveTo(-b * 0.12, -b * 0.02);
  g.arc(0, -b * 0.08, b * 0.2, 0, Math.PI * 2);
  ink(g, C.butterDeep, lw * 1.4);
  g.beginPath();
  g.moveTo(-b * 0.95, b * 1.05);
  g.quadraticCurveTo(-b * 0.75, b * 0.75, -b * 0.62, b * 0.35);
  g.bezierCurveTo(-b * 0.55, -b * 0.25, b * 0.55, -b * 0.25, b * 0.62, b * 0.35);
  g.quadraticCurveTo(b * 0.75, b * 0.75, b * 0.95, b * 1.05);
  g.quadraticCurveTo(0, b * 1.25, -b * 0.95, b * 1.05);
  g.closePath();
  ink(g, mix(C.sun, "#ffffff", lit * 0.5), lw * 1.6);
  g.beginPath();
  g.arc(0, b * 1.18, b * 0.2, 0, Math.PI * 2);
  ink(g, C.orange, lw * 1.2);
  shine(g, -b * 0.3, b * 0.25, b * 0.12, b * 0.26, 0.25, 0.8);
  g.restore();
}

/** soft drop shadow ellipse */
export function groundShadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.18) {
  g.save();
  g.fillStyle = rgba(INK, a);
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** size a canvas to its CSS box at device pixel ratio; returns css size */
export function fitCanvas(cv: HTMLCanvasElement, w: number, h: number, maxDpr = 2): number {
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(w * dpr)),
    H = Math.max(1, Math.round(h * dpr));
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  return dpr;
}

/** scalloped oval rug / stage */
export function drawRug(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, accent: string) {
  const n = 18;
  const sc = Math.min(rx, ry) * 0.32;
  const shapes: (() => void)[] = [() => g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * rx,
      py = y + Math.sin(a) * ry;
    shapes.push(() => g.arc(px, py, sc, 0, Math.PI * 2));
  }
  g.save();
  g.translate(0, ry * 0.18);
  g.globalAlpha = 0.16;
  g.fillStyle = INK;
  for (const s of shapes) {
    g.beginPath();
    s();
    g.fill();
  }
  g.restore();
  silhouette(g, shapes, color, Math.max(1.5, ry * 0.06));
  g.save();
  g.beginPath();
  g.ellipse(x, y, rx * 0.8, ry * 0.7, 0, 0, Math.PI * 2);
  g.fillStyle = rgba(accent, 0.55);
  g.fill();
  g.setLineDash([ry * 0.12, ry * 0.1]);
  g.beginPath();
  g.ellipse(x, y, rx * 0.9, ry * 0.82, 0, 0, Math.PI * 2);
  g.strokeStyle = rgba(INK, 0.35);
  g.lineWidth = Math.max(1, ry * 0.04);
  g.stroke();
  g.restore();
}

/** rounded pill with outlined text, centred at (x,y) */
export function pillLabel(g: CanvasRenderingContext2D, x: number, y: number, text: string, size: number, color: string, textColor = "#fff") {
  g.save();
  g.font = `600 ${size}px Fredoka, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const w = g.measureText(text).width + size * 1.3;
  const h = size * 1.55;
  const lw = Math.max(2, size * 0.13);
  g.beginPath();
  rrect(g, x - w / 2, y - h / 2 + lw, w, h, h / 2);
  g.fillStyle = rgba(INK, 0.25);
  g.fill();
  g.beginPath();
  rrect(g, x - w / 2, y - h / 2, w, h, h / 2);
  ink(g, color, lw * 2);
  g.lineWidth = lw * 1.6;
  g.strokeStyle = INK;
  g.strokeText(text, x, y + size * 0.04);
  g.fillStyle = textColor;
  g.fillText(text, x, y + size * 0.04);
  g.restore();
}
