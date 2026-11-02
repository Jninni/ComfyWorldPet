import { input, type Btn } from "../core/Input";
import { audio } from "../audio/Audio";

type Child = Node | string | null | undefined | false;

/** Tiny hyperscript helper. h("div.panel#id", {onclick}, children…) */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | string, props: Record<string, unknown> | null = null, ...kids: (Child | Child[])[]): HTMLElement {
  const [tagPart, ...rest] = sel.split(".");
  let tag = tagPart || "div";
  let id: string | undefined;
  if (tag.includes("#")) [tag, id] = tag.split("#");
  const el = document.createElement(tag || "div");
  if (id) el.id = id;
  if (rest.length) el.className = rest.join(" ");
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "html") el.innerHTML = String(v);
      else if (k.startsWith("--")) el.style.setProperty(k, String(v));
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return el;
}

/**
 * Gamepad / keyboard navigation inside a container: elements with [data-nav]
 * are focusable; d-pad moves spatially, A clicks, B calls onBack.
 */
export class Nav {
  private off: () => void;
  focused: HTMLElement | null = null;
  constructor(public root: HTMLElement, private onBack?: () => void) {
    this.off = input.onPress((b) => this.handle(b));
  }

  items(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>("[data-nav]")].filter((e) => e.offsetParent !== null && !(e as HTMLButtonElement).disabled);
  }

  focus(el: HTMLElement | null) {
    this.focused?.classList.remove("nav-focus");
    this.focused = el;
    if (el) {
      if (input.lastDevice !== "touch") el.classList.add("nav-focus");
      el.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }

  focusFirst() {
    const it = this.items();
    const pref = it.find((e) => e.hasAttribute("data-autofocus")) ?? it[0] ?? null;
    this.focus(pref);
  }

  private handle(b: Btn) {
    if (!this.root.isConnected) return;
    if (b === "b") {
      if (this.onBack) {
        audio.sfx("back");
        this.onBack();
      }
      return;
    }
    if (b === "a") {
      if (this.focused && this.focused.isConnected) {
        this.focused.classList.add("pressed");
        setTimeout(() => this.focused?.classList.remove("pressed"), 120);
        this.focused.click();
      }
      return;
    }
    if (b === "lb" || b === "rb") {
      const ev = new CustomEvent("navshoulder", { detail: b === "lb" ? -1 : 1 });
      this.root.dispatchEvent(ev);
      return;
    }
    const dir = b === "left" ? [-1, 0] : b === "right" ? [1, 0] : b === "up" ? [0, -1] : b === "down" ? [0, 1] : null;
    if (!dir) return;
    const items = this.items();
    if (!items.length) return;
    if (!this.focused || !this.focused.isConnected) {
      this.focusFirst();
      return;
    }
    const r0 = this.focused.getBoundingClientRect();
    const cx = r0.left + r0.width / 2,
      cy = r0.top + r0.height / 2;
    let best: HTMLElement | null = null,
      bestScore = Infinity;
    for (const el of items) {
      if (el === this.focused) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx,
        dy = r.top + r.height / 2 - cy;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 4) continue;
      const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      audio.sfx("click");
      this.focus(best);
    }
  }

  dispose() {
    this.off();
    this.focused?.classList.remove("nav-focus");
  }
}

/* ------------------------------------------------------------------ */
/* Procedural 2D critter portraits for menus                           */
/* ------------------------------------------------------------------ */

export function portrait(species: string, color: string, size = 128, mood: "happy" | "sleep" = "happy"): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!;
  const s = size / 100;
  c.scale(s, s);
  c.lineWidth = 3.2;
  c.strokeStyle = "#4a3a52";
  c.lineJoin = "round";
  const shade = (hex: string, k: number) => {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * k));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * k));
    const b = Math.min(255, Math.max(0, (n & 255) * k));
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  };
  const blob = (x: number, y: number, rx: number, ry: number, fill: string, rot = 0) => {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.stroke();
  };
  const dark = shade(color, 0.85);
  // ears / features behind head
  if (species === "puffbun") {
    blob(36, 26, 9, 24, color, -0.25);
    blob(64, 26, 9, 24, color, 0.25);
    blob(36, 28, 4, 15, "#ffc2d6", -0.25);
    blob(64, 28, 4, 15, "#ffc2d6", 0.25);
  } else if (species === "fennix" || species === "mochi") {
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(50 + sx * 30, 46);
      c.lineTo(50 + sx * 28, 12);
      c.lineTo(50 + sx * 10, 32);
      c.closePath();
      c.fillStyle = species === "mochi" && sx > 0 ? "#f5b56b" : color;
      c.fill();
      c.stroke();
    }
  } else if (species === "glowbat") {
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(50 + sx * 26, 42);
      c.lineTo(50 + sx * 34, 8);
      c.lineTo(50 + sx * 8, 30);
      c.closePath();
      c.fillStyle = "#f6e6ff";
      c.fill();
      c.stroke();
    }
  } else if (species === "hoglet") {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      blob(50 + Math.cos(a) * 34, 58 + Math.sin(a) * 34, 9, 9, shade(color, 0.72));
    }
  } else if (species === "shroomy") {
    // cap drawn after
  } else if (species === "ribbit") {
    blob(34, 34, 12, 12, color);
    blob(66, 34, 12, 12, color);
  }
  // head
  blob(50, 60, 34, 30, color);
  if (species === "shroomy") {
    c.beginPath();
    c.ellipse(50, 42, 40, 26, 0, Math.PI, 0);
    c.closePath();
    c.fillStyle = "#f58fae";
    c.fill();
    c.stroke();
    c.fillStyle = "#fff";
    for (const [x, y, r] of [
      [36, 30, 5],
      [58, 24, 6],
      [70, 36, 4],
      [46, 38, 3.5],
    ])
      blob(x, y, r, r, "#fff");
  }
  if (species === "mochi") {
    c.save();
    c.beginPath();
    c.ellipse(50, 60, 34, 30, 0, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = "#f5b56b";
    c.beginPath();
    c.ellipse(70, 48, 16, 13, 0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#9b7258";
    c.beginPath();
    c.ellipse(30, 46, 11, 9, -0.3, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.beginPath();
    c.ellipse(50, 60, 34, 30, 0, 0, Math.PI * 2);
    c.stroke();
  }
  // muzzle / beak
  if (species === "chirpy" || species === "duckling") {
    c.beginPath();
    c.moveTo(43, 66);
    c.quadraticCurveTo(50, 78, 57, 66);
    c.closePath();
    c.fillStyle = species === "duckling" ? "#ffa94d" : "#ffd36b";
    c.fill();
    c.stroke();
  } else if (species === "molly") {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      blob(50 + Math.cos(a) * 4, 68 + Math.sin(a) * 4, 3.4, 3.4, "#ff9fbf");
    }
  } else {
    blob(50, 70, 9, 6, shade(color, 1.08));
    c.fillStyle = "#4a3a52";
    c.beginPath();
    c.ellipse(50, 67, 3, 2.2, 0, 0, Math.PI * 2);
    c.fill();
  }
  // eyes
  const eyeY = species === "ribbit" ? 36 : 58;
  const eyeX = species === "ribbit" ? 16 : 14;
  if (mood === "sleep" || species === "molly") {
    c.lineWidth = 3;
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.arc(50 + sx * eyeX, eyeY, 5, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
    }
  } else {
    for (const sx of [-1, 1]) {
      c.fillStyle = "#3b3043";
      c.beginPath();
      c.ellipse(50 + sx * eyeX, eyeY, 5, 6.2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(50 + sx * eyeX + 1.6, eyeY - 2.2, 1.9, 0, Math.PI * 2);
      c.fill();
    }
  }
  // blush
  c.fillStyle = "rgba(255,140,170,0.55)";
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(50 + sx * 24, 70, 6, 3.6, 0, 0, Math.PI * 2);
    c.fill();
  }
  void dark;
  return cv;
}
