import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "./ui.css";
import { Vector3, Matrix, type Scene, type Camera } from "@babylonjs/core";
import { h, Nav } from "./dom";
import { input, btnLabel, type Btn } from "../core/Input";
import { audio } from "../audio/Audio";
import { RESOURCES, type ResourceId } from "../data/items";

export interface Line {
  who?: string;
  color?: string;
  text: string;
  choices?: string[];
  /** emote shown on speaker when line starts */
  emote?: string;
}

interface WLabel {
  el: HTMLElement;
  pos: () => Vector3 | null;
  dy: number;
}

export class UI {
  root: HTMLElement;
  private toasts: HTMLElement;
  private banner: HTMLElement;
  private fadeEl: HTMLElement;
  private qt: HTMLElement;
  private resEls = new Map<ResourceId, HTMLElement>();
  private labels = new Set<WLabel>();
  private promptEl: HTMLElement;
  private promptLabel: WLabel | null = null;
  partyStrip: HTMLElement;
  hud: HTMLElement;
  touchUI: HTMLElement;
  private aLabel: HTMLElement;
  menuBtn: HTMLElement;
  onMenu: (() => void) | null = null;
  dialogueOpen = false;

  constructor() {
    this.root = document.getElementById("ui")!;
    this.detectTouch();

    // HUD
    this.qt = h(".quest-tracker.hidden", null, h(".qt-icon", null, "⭐"), h("div", null, h(".qt-title", null, ""), h(".qt-text", null, "")));
    const res = h(".res-bar");
    for (const id of Object.keys(RESOURCES) as ResourceId[]) {
      const el = h(".res", { title: RESOURCES[id].name }, h("span.ico", null, RESOURCES[id].icon), h("span.n", null, "0"));
      this.resEls.set(id, el);
      res.append(el);
    }
    this.menuBtn = h("button.round-btn", { "aria-label": "Menu", onclick: () => this.onMenu?.() }, "🎒");
    this.hud = h(".hud-top", null, this.qt, h(".hud-right", null, res, this.menuBtn));
    this.partyStrip = h(".party-strip");
    this.toasts = h(".toasts");
    this.banner = h(".zone-banner", null, h(".zb-title"), h(".zb-sub"));
    this.fadeEl = h(".fade", null, h(".loader", null, "🐾"));
    this.promptEl = h(".wlabel.prompt-bubble", null, h("span.key"), h("span.t"));
    this.promptEl.style.display = "none";

    // touch controls
    this.aLabel = h("small", null, "");
    this.touchUI = h(".touch-ui", null, this.buildJoystick(), this.buildButtons());

    this.root.append(this.banner, this.hud, this.partyStrip, this.toasts, this.promptEl, this.touchUI, this.fadeEl);
    this.setHudVisible(false);
  }

  private detectTouch() {
    const set = (on: boolean) => document.body.classList.toggle("touch", on);
    set(matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
    window.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") set(true);
    });
    window.addEventListener("keydown", () => {
      if (!matchMedia("(pointer: coarse)").matches) set(false);
    });
    setInterval(() => {
      if (input.lastDevice === "gamepad") set(false);
    }, 1000);
  }

  /* ---------------- touch ---------------- */
  private buildJoystick() {
    const zone = h(".joy-zone");
    const knob = h(".joy-knob");
    const base = h(".joy-base.idle", null, knob);
    zone.append(base);
    const R = 60;
    let id: number | null = null;
    let ox = 0,
      oy = 0;
    const home = () => {
      const r = zone.getBoundingClientRect();
      base.style.left = Math.max(110, r.width * 0.32) + "px";
      base.style.top = r.height - 130 + "px";
    };
    requestAnimationFrame(home);
    window.addEventListener("resize", home);
    zone.addEventListener("pointerdown", (e) => {
      if (id !== null) return;
      id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      base.style.left = ox + "px";
      base.style.top = oy + "px";
      base.classList.remove("idle");
      e.preventDefault();
    });
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const r = zone.getBoundingClientRect();
      let dx = e.clientX - r.left - ox,
        dy = e.clientY - r.top - oy;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, len / R);
      const k = m < 0.12 ? 0 : (m - 0.12) / 0.88;
      const a = Math.atan2(dy, dx);
      input.setTouchMove(Math.cos(a) * k, -Math.sin(a) * k);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = "";
      base.classList.add("idle");
      input.setTouchMove(0, 0);
      home();
    };
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
    return zone;
  }

  private buildButtons() {
    const mk = (cls: string, b: Btn, ...kids: (Node | string)[]) => {
      const el = h(`.tbtn.${cls}`, null, ...kids);
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        el.classList.add("down");
        input.setTouchButton(b, true);
      });
      const up = () => {
        el.classList.remove("down");
        input.setTouchButton(b, false);
      };
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      return el;
    };
    return h(".touch-btns", null, mk("tbtn-a", "a", h("span", null, "✋", this.aLabel)), mk("tbtn-b", "b", "↩"), mk("tbtn-x", "x", "🐾"));
  }

  setActionLabel(t: string) {
    if (this.aLabel.textContent !== t) this.aLabel.textContent = t;
  }

  /* ---------------- HUD ---------------- */
  setHudVisible(on: boolean) {
    this.hud.style.display = on ? "" : "none";
    this.partyStrip.style.display = on ? "" : "none";
  }

  setTouchVisible(on: boolean) {
    this.touchUI.style.visibility = on ? "" : "hidden";
  }

  setResources(r: Record<ResourceId, number>, popId?: ResourceId) {
    for (const [id, el] of this.resEls) {
      (el.querySelector(".n") as HTMLElement).textContent = String(r[id]);
      if (id === popId) {
        el.classList.add("pop");
        setTimeout(() => el.classList.remove("pop"), 250);
      }
    }
  }

  setQuest(title: string | null, text: string, icon = "⭐", bump = false) {
    if (!title) {
      this.qt.classList.add("hidden");
      return;
    }
    this.qt.classList.remove("hidden");
    (this.qt.querySelector(".qt-title") as HTMLElement).textContent = title;
    (this.qt.querySelector(".qt-text") as HTMLElement).textContent = text;
    (this.qt.querySelector(".qt-icon") as HTMLElement).textContent = icon;
    if (bump) {
      this.qt.classList.add("bump");
      setTimeout(() => this.qt.classList.remove("bump"), 350);
    }
  }

  toast(text: string, icon = "✨", color = "var(--butter)") {
    const el = h(".toast", { "--c": color }, h(".ti", null, icon), text);
    this.toasts.append(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 360);
    }, 2600);
  }

  private bannerTimer = 0;
  showBanner(title: string, sub: string) {
    (this.banner.querySelector(".zb-title") as HTMLElement).textContent = title;
    (this.banner.querySelector(".zb-sub") as HTMLElement).textContent = sub;
    this.banner.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove("show"), 3000);
  }

  async fade(on: boolean, ms = 380) {
    this.fadeEl.style.transitionDuration = ms + "ms";
    this.fadeEl.classList.toggle("on", on);
    await new Promise((r) => setTimeout(r, ms + 30));
  }

  /* ---------------- world labels ---------------- */
  addLabel(el: HTMLElement, pos: () => Vector3 | null, dy = 0): () => void {
    el.classList.add("wlabel");
    this.root.insertBefore(el, this.promptEl);
    const l: WLabel = { el, pos, dy };
    this.labels.add(l);
    return () => {
      this.labels.delete(l);
      el.remove();
    };
  }

  emote(pos: () => Vector3 | null, glyph: string, ms = 1400) {
    const el = h(".emote", null, glyph);
    const rm = this.addLabel(el, pos, 0.3);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(rm, 300);
    }, ms);
  }

  showPrompt(pos: Vector3 | null, text: string) {
    if (!pos) {
      this.promptEl.style.display = "none";
      this.promptLabel = null;
      this.setActionLabel("");
      return;
    }
    (this.promptEl.querySelector(".key") as HTMLElement).textContent = btnLabel("a");
    (this.promptEl.querySelector(".t") as HTMLElement).textContent = text;
    this.promptEl.style.display = "";
    const p = pos.clone();
    this.promptLabel = { el: this.promptEl, pos: () => p, dy: 0 };
    this.setActionLabel(text);
  }

  private tmpV = new Vector3();
  updateLabels(scene: Scene, cam: Camera) {
    const eng = scene.getEngine();
    const w = eng.getRenderWidth(),
      hgt = eng.getRenderHeight();
    const cw = this.root.clientWidth,
      ch = this.root.clientHeight;
    const vp = cam.viewport.toGlobal(w, hgt);
    const tm = scene.getTransformMatrix();
    const all = [...this.labels];
    if (this.promptLabel) all.push(this.promptLabel);
    for (const l of all) {
      const p = l.pos();
      if (!p) {
        l.el.style.visibility = "hidden";
        continue;
      }
      this.tmpV.set(p.x, p.y + l.dy, p.z);
      const s = Vector3.Project(this.tmpV, Matrix.IdentityReadOnly, tm, vp);
      if (s.z < 0 || s.z > 1) {
        l.el.style.visibility = "hidden";
        continue;
      }
      l.el.style.visibility = "";
      l.el.style.left = (s.x / w) * cw + "px";
      l.el.style.top = (s.y / hgt) * ch + "px";
    }
  }

  /* ---------------- dialogue ---------------- */
  async say(lines: Line[], onLine?: (l: Line, i: number) => void): Promise<number> {
    this.dialogueOpen = true;
    let result = -1;
    const box = h(".dialogue.panel");
    const who = h(".who");
    const txt = h(".txt");
    const more = h(".more", null, "▼");
    const choices = h(".choices");
    box.append(who, txt, choices, more);
    this.root.append(box);
    try {
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        onLine?.(L, i);
        who.style.display = L.who ? "" : "none";
        who.textContent = L.who ?? "";
        box.style.setProperty("--c", L.color ?? "var(--lav)");
        who.style.setProperty("--c", L.color ?? "var(--pink)");
        choices.innerHTML = "";
        more.style.visibility = "hidden";
        await this.typeText(txt, L.text, box);
        if (L.choices?.length) {
          result = await this.choose(choices, L.choices);
        } else {
          more.style.visibility = "";
          await this.waitAdvance(box);
          audio.sfx("click");
        }
      }
    } finally {
      box.remove();
      this.dialogueOpen = false;
      input.consumeAll();
    }
    return result;
  }

  private typeText(el: HTMLElement, text: string, box: HTMLElement): Promise<void> {
    // *word* → highlighted
    const html = text.replace(/\*(.+?)\*/g, '<span class="hl">$1</span>');
    el.innerHTML = html;
    // reveal by walking text nodes
    const nodes: Text[] = [];
    const walk = (n: Node) => {
      if (n.nodeType === 3) nodes.push(n as Text);
      else n.childNodes.forEach(walk);
    };
    walk(el);
    const full = nodes.map((n) => n.textContent ?? "");
    nodes.forEach((n) => (n.textContent = ""));
    const total = full.reduce((a, s) => a + s.length, 0);
    return new Promise((resolve) => {
      let shown = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        nodes.forEach((n, i) => (n.textContent = full[i]));
        off();
        box.removeEventListener("pointerdown", onTap);
        clearInterval(iv);
        resolve();
      };
      const onTap = (e: Event) => {
        e.stopPropagation();
        finish();
      };
      const off = input.onPress((b) => {
        if (b === "a" || b === "b") finish();
      });
      box.addEventListener("pointerdown", onTap);
      const iv = setInterval(() => {
        shown += 2;
        let left = shown;
        for (let i = 0; i < nodes.length; i++) {
          const take = Math.min(left, full[i].length);
          nodes[i].textContent = full[i].slice(0, take);
          left -= take;
        }
        if (shown % 6 === 0) audio.sfx("talk", { volume: 0.5 });
        if (shown >= total) finish();
      }, 28);
    });
  }

  private waitAdvance(box: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const done = () => {
        off();
        box.removeEventListener("pointerdown", onTap);
        resolve();
      };
      const onTap = (e: Event) => {
        e.stopPropagation();
        if (performance.now() - t0 > 120) done();
      };
      const off = input.onPress((b) => {
        if ((b === "a" || b === "b") && performance.now() - t0 > 120) done();
      });
      box.addEventListener("pointerdown", onTap);
    });
  }

  private choose(wrap: HTMLElement, opts: string[]): Promise<number> {
    return new Promise((resolve) => {
      const nav = new Nav(wrap);
      opts.forEach((o, i) => {
        const b = h("button.btn", { "data-nav": "", "--c": i === 0 ? "var(--butter)" : "var(--cream)", onclick: () => pick(i) }, o);
        wrap.append(b);
      });
      const pick = (i: number) => {
        audio.sfx("confirm");
        nav.dispose();
        resolve(i);
      };
      setTimeout(() => nav.focusFirst(), 50);
    });
  }
}
