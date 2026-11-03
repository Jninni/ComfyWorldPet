import type { Game } from "../game/Game";
import { h, Nav } from "./dom";
import { audio } from "../audio/Audio";
import { input } from "../core/Input";
import { WORLD, PATHS, POND, LOC, LEDGES, PLAZA, walkField, zoneAt, ellipseD, ZONE_SHAPES } from "../world/layout";

const PX = 4; // base map pixels per world metre
const BUILD_ICON: Record<string, string> = { home: "🏠", teahouse: "🫖", library: "📚", flowershop: "🌷", sewing: "🧵", workshop: "🔨", bakery: "🥐" };

let baseMap: HTMLCanvasElement | null = null;

/** world (x,z) → base-map pixel */
export function toMap(x: number, z: number): [number, number] {
  return [(x - WORLD.minX) * PX, (WORLD.maxZ - z) * PX];
}

/** The painted overworld map, rendered once and reused by the mini-map and the full map. */
export function getBaseMap(): HTMLCanvasElement {
  if (baseMap) return baseMap;
  const W = (WORLD.maxX - WORLD.minX) * PX,
    H = (WORLD.maxZ - WORLD.minZ) * PX;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  // terrain at quarter resolution, smoothly upscaled
  const sm = document.createElement("canvas");
  const Q = 4;
  sm.width = Math.ceil(W / Q);
  sm.height = Math.ceil(H / Q);
  const sc = sm.getContext("2d")!;
  const img = sc.createImageData(sm.width, sm.height);
  for (let py = 0; py < sm.height; py++)
    for (let px = 0; px < sm.width; px++) {
      const x = WORLD.minX + (px * Q) / PX,
        z = WORLD.maxZ - (py * Q) / PX;
      const w = walkField(x, z);
      let r = 196,
        g = 232,
        b = 170;
      if (w > 1.0) {
        r = 140;
        g = 196;
        b = 132;
      } else {
        const zn = zoneAt(x, z);
        if (zn === "meadow") [r, g, b] = [214, 240, 176];
        else if (zn === "woods") [r, g, b] = [160, 210, 150];
        else if (zn === "pond") [r, g, b] = [200, 236, 196];
      }
      const pd = ellipseD(POND, x, z);
      if (pd < 1.12) [r, g, b] = [246, 227, 189];
      if (pd < 0.97) [r, g, b] = [159, 215, 240];
      const i = (py * sm.width + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  sc.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(sm, 0, 0, W, H);
  // paths
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const [wd, col] of [
    [1.2, "#d9bf8f"],
    [0, "#f6e6c4"],
  ] as [number, string][]) {
    c.strokeStyle = col;
    for (const p of PATHS) {
      c.lineWidth = (p.w + wd) * PX;
      c.beginPath();
      p.pts.forEach(([x, z], i) => {
        const [u, v] = toMap(x, z);
        if (i) c.lineTo(u, v);
        else c.moveTo(u, v);
      });
      c.stroke();
    }
  }
  const [pu, pv] = toMap(PLAZA.x, PLAZA.z);
  c.fillStyle = "#efe4f6";
  c.beginPath();
  c.arc(pu, pv, PLAZA.r * PX, 0, Math.PI * 2);
  c.fill();
  // ledges
  for (const l of LEDGES) {
    const [u, v] = toMap(l.x, l.z);
    l.steps.forEach((st, i) => {
      c.fillStyle = i ? "#b9a6d6" : "#cbbbe3";
      c.strokeStyle = "#7d6b98";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(u, v, st.r * PX, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    });
  }
  // labels
  c.font = "600 26px Fredoka, sans-serif";
  c.textAlign = "center";
  c.lineWidth = 7;
  c.strokeStyle = "rgba(255,255,255,0.9)";
  const label = (t: string, x: number, z: number) => {
    const [u, v] = toMap(x, z);
    c.fillStyle = "#4a3a52";
    c.strokeText(t, u, v);
    c.fillText(t, u, v);
  };
  label("Cozy Hollow", 0, -7);
  label("Whisper Meadow", 0, 88);
  label("Mossy Woods", -84, 34);
  label("Sparkle Pond", 102, 50);
  label("Critter Haven", 40, -24);
  label("Crystal Cave", -44, 124);
  label("Thornwild", LOC.thornGate.x, LOC.thornGate.z + 9);
  c.font = "30px sans-serif";
  for (const [id, b] of Object.entries(LOC.buildings)) {
    const [u, v] = toMap(b.x, b.z);
    c.fillText(BUILD_ICON[id] ?? "🏠", u, v + 10);
  }
  for (const [x, z, icon] of [
    [LOC.caveMouth.x, LOC.caveMouth.z, "🕳️"],
    [LOC.thornGate.x, LOC.thornGate.z, "🌿"],
    [-25.3, -14.5, "🌱"],
  ] as [number, number, string][]) {
    const [u, v] = toMap(x, z);
    c.fillText(icon, u, v + 10);
  }
  void ZONE_SHAPES;
  baseMap = cv;
  return cv;
}

/* ------------------------------------------------------------------ */
/* Live markers                                                        */
/* ------------------------------------------------------------------ */

interface Marker {
  x: number;
  z: number;
  icon: string;
  pulse?: boolean;
  edge?: boolean;
}

function liveMarkers(g: Game): Marker[] {
  const m: Marker[] = [];
  const s = g.state;
  // treasure ledges not yet opened → "needs double jump"
  for (const l of LEDGES) if (!s.taken.includes("ledge_" + l.id)) m.push({ x: l.x, z: l.z, icon: "⏫" });
  if (s.keyItems.rod) for (const sp of g.fishing.spots) m.push({ x: sp.pos.x, z: sp.pos.z, icon: "🎣" });
  // NPCs with something to say
  for (const [id, n] of g.npcs) {
    if (n.location !== "overworld") {
      if (g.story.hasNews(id)) {
        const d = g.world.doors.get(n.location);
        if (d) m.push({ x: d.x, z: d.z, icon: "❗", pulse: true });
      }
      continue;
    }
    m.push({ x: n.pos.x, z: n.pos.z, icon: g.story.hasNews(id) ? "❗" : "•", pulse: g.story.hasNews(id) });
  }
  // the current objective
  if (g.current.id === "overworld") {
    const o = g.objectivePos();
    if (o) m.push({ x: o.x, z: o.z, icon: "⭐", pulse: true, edge: true });
  }
  return m;
}

function drawMarker(c: CanvasRenderingContext2D, mk: Marker, u: number, v: number, size: number, t: number) {
  if (mk.icon === "•") {
    c.fillStyle = "#ffffff";
    c.strokeStyle = "#4a3a52";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(u, v, size * 0.18, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    return;
  }
  const s = mk.pulse ? size * (1 + Math.sin(t * 6) * 0.1) : size;
  c.font = `${s}px sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(mk.icon, u, v);
}

function drawPlayer(c: CanvasRenderingContext2D, u: number, v: number, ang: number, size: number) {
  c.save();
  c.translate(u, v);
  c.rotate(ang);
  c.fillStyle = "#ef8fab";
  c.strokeStyle = "#4a3a52";
  c.lineWidth = Math.max(2, size * 0.14);
  c.beginPath();
  c.moveTo(0, -size);
  c.lineTo(size * 0.72, size * 0.75);
  c.lineTo(0, size * 0.35);
  c.lineTo(-size * 0.72, size * 0.75);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
}

/* ------------------------------------------------------------------ */
/* Mini-map (HUD)                                                      */
/* ------------------------------------------------------------------ */

export class MiniMap {
  el: HTMLElement;
  private cv: HTMLCanvasElement;
  private label: HTMLElement;
  private acc = 0;
  /** metres from centre to edge */
  range = 36;

  constructor(private g: Game) {
    this.cv = document.createElement("canvas");
    this.cv.width = this.cv.height = 300;
    this.label = h(".mm-label", null, "");
    this.el = h(".minimap", { title: "Map — tap to open" }, this.cv, this.label, h(".mm-n", null, "N"));
    this.el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (g.mode === "play") openFullMap(g);
    });
    g.ui.hud.querySelector(".hud-right")?.after(this.el);
    if (!this.el.isConnected) g.ui.root.append(this.el);
  }

  update(dt: number) {
    this.acc += dt;
    if (this.acc < 1 / 15) return;
    this.acc = 0;
    const g = this.g;
    const L = g.current;
    const show = g.mode !== "title";
    this.el.style.display = show ? "" : "none";
    if (!show) return;
    const c = this.cv.getContext("2d")!;
    const S = this.cv.width;
    c.clearRect(0, 0, S, S);
    if (L.id !== "overworld") {
      // indoors / underground: a cosy placeholder with the location name
      c.fillStyle = L.id === "cave" ? "#3a2c55" : L.id === "thornwild" ? "#4a3a6a" : "#f6e6f0";
      c.fillRect(0, 0, S, S);
      c.font = "120px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(L.id === "cave" ? "💎" : L.id === "thornwild" ? "🌿" : "🏠", S / 2, S / 2);
      this.label.textContent = L.id === "cave" ? "Crystal Cave" : L.id === "thornwild" ? "Thornwild" : "Indoors";
      return;
    }
    this.label.textContent = "";
    const base = getBaseMap();
    const p = g.player.pos;
    const [pu, pv] = toMap(p.x, p.z);
    // rotate so "up" matches the camera's forward direction
    const yaw = g.cam.alpha + Math.PI / 2;
    const scale = S / (this.range * 2 * PX);
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = "#8cc484";
    c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2);
    c.rotate(yaw);
    c.scale(scale, scale);
    c.drawImage(base, -pu, -pv);
    const t = performance.now() / 1000;
    for (const mk of liveMarkers(g)) {
      const [u, v] = toMap(mk.x, mk.z);
      let du = u - pu,
        dv = v - pv;
      const d = Math.hypot(du, dv);
      const lim = this.range * PX * 0.86;
      if (d > lim) {
        if (!mk.edge) continue;
        du *= lim / d;
        dv *= lim / d;
      }
      c.save();
      c.translate(du, dv);
      c.rotate(-yaw);
      drawMarker(c, mk, 0, 0, 30 / scale / 4, t);
      c.restore();
    }
    c.restore();
    drawPlayer(c, S / 2, S / 2, g.player.rot + yaw, 18);
  }
}

/* ------------------------------------------------------------------ */
/* Full map (zoom / pan)                                               */
/* ------------------------------------------------------------------ */

export function createMapView(g: Game): { el: HTMLElement; dispose: () => void } {
  const base = getBaseMap();
  const cv = document.createElement("canvas");
  const wrap = h(".mapview", null, cv);
  const zin = h("button.btn.round-btn", { "data-nav": "", "aria-label": "Zoom in" }, "＋");
  const zout = h("button.btn.round-btn", { "data-nav": "", "aria-label": "Zoom out" }, "－");
  const me = h("button.btn.round-btn", { "data-nav": "", "aria-label": "Centre on me" }, "🎯");
  const legend = h(".map-legend", null, h("span", null, "⭐ Goal"), h("span", null, "❗ News"), h("span", null, "⏫ Needs double jump"), h("span", null, "🎣 Fishing"), h("span", null, "▲ You"));
  wrap.append(h(".map-tools", null, zin, zout, me), legend);
  let zoom = 1; // 1 = whole world fits
  const p0 = g.current.id === "overworld" ? g.player.pos : null;
  let cx = p0 ? toMap(p0.x, p0.z)[0] : base.width / 2,
    cy = p0 ? toMap(p0.x, p0.z)[1] : base.height / 2;
  zoom = p0 ? 2.2 : 1;
  const clampView = () => {
    cx = Math.max(0, Math.min(base.width, cx));
    cy = Math.max(0, Math.min(base.height, cy));
  };
  const setZoom = (z: number) => {
    zoom = Math.max(1, Math.min(6, z));
    audio.sfx("click");
  };
  zin.addEventListener("click", () => setZoom(zoom * 1.5));
  zout.addEventListener("click", () => setZoom(zoom / 1.5));
  me.addEventListener("click", () => {
    if (g.current.id !== "overworld") return;
    [cx, cy] = toMap(g.player.pos.x, g.player.pos.z);
    setZoom(Math.max(zoom, 2.2));
  });
  // drag to pan, pinch / wheel to zoom
  const pts = new Map<number, { x: number; y: number }>();
  let pinch0 = 0,
    zoom0 = 1;
  cv.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      zoom0 = zoom;
    }
  });
  cv.addEventListener("pointermove", (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const k = fit() * zoom;
    if (pts.size === 1) {
      cx -= ((e.clientX - prev.x) * (cv.width / cv.clientWidth)) / k;
      cy -= ((e.clientY - prev.y) * (cv.height / cv.clientHeight)) / k;
      clampView();
    } else if (pts.size === 2 && pinch0) {
      const [a, b] = [...pts.values()];
      zoom = Math.max(1, Math.min(6, (zoom0 * Math.hypot(a.x - b.x, a.y - b.y)) / pinch0));
    }
  });
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    pinch0 = 0;
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = Math.max(1, Math.min(6, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    },
    { passive: false },
  );
  // gamepad / keys: stick pans, shoulders zoom
  const offPress = input.onPress((b) => {
    if (b === "rb") setZoom(zoom * 1.5);
    if (b === "lb") setZoom(zoom / 1.5);
  });
  const fit = () => Math.min(cv.width / base.width, cv.height / base.height);
  let raf = 0;
  let last = performance.now();
  let seen = false;
  const draw = () => {
    // stop by itself once removed from the page (e.g. switching bag tabs)
    if (wrap.isConnected) seen = true;
    else if (seen) {
      offPress();
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(wrap.clientWidth * dpr),
      H = Math.round(Math.max(200, wrap.clientHeight) * dpr);
    if (W && (cv.width !== W || cv.height !== H)) {
      cv.width = W;
      cv.height = H;
    }
    if (Math.hypot(input.move.x, input.move.y) > 0.2) {
      const k = fit() * zoom;
      cx += (input.move.x * 600 * dt) / k;
      cy -= (input.move.y * 600 * dt) / k;
      clampView();
    }
    const c = cv.getContext("2d")!;
    const k = fit() * zoom;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#8cc484";
    c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(k, 0, 0, k, cv.width / 2 - cx * k, cv.height / 2 - cy * k);
    c.drawImage(base, 0, 0);
    const t = now / 1000;
    const msize = Math.max(26, 40 / Math.sqrt(zoom)) / k;
    for (const mk of liveMarkers(g)) {
      const [u, v] = toMap(mk.x, mk.z);
      drawMarker(c, mk, u, v, msize, t);
    }
    if (g.current.id === "overworld") {
      const [u, v] = toMap(g.player.pos.x, g.player.pos.z);
      drawPlayer(c, u, v, g.player.rot, 16 / k);
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return {
    el: wrap,
    dispose: () => {
      cancelAnimationFrame(raf);
      offPress();
    },
  };
}

export function openFullMap(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const prevMode = g.mode;
    g.mode = "busy";
    audio.sfx("confirm");
    const view = createMapView(g);
    const close = () => {
      view.dispose();
      nav.dispose();
      back.remove();
      input.consumeAll();
      g.mode = prevMode === "busy" ? "busy" : "play";
      resolve();
    };
    const box = h(".modal.panel.map-modal", { "--c": "var(--mint)" }, h("button.btn.round-btn.close", { "aria-label": "Close", "data-nav": "", onclick: close }, "✕"), h("h2", null, "🗺️ Map"), view.el);
    const back = h(".modal-back", null, box);
    back.addEventListener("pointerdown", (e) => {
      if (e.target === back) close();
    });
    g.ui.root.append(back);
    const nav = new Nav(box, close);
  });
}
