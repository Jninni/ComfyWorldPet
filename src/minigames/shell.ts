/**
 * Minigame shell: full-screen overlay, HUD, title card, countdown, result
 * cards, retry loop, input routing, render loop and cleanup.
 */
import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/600.css";
import "./minigames.css";
import { input, btnLabel, type Btn } from "../core/Input";
import { audio } from "../audio/Audio";
import { Critter, PortraitView } from "./critter";
import { Fx } from "./fx";
import { C, fitCanvas, clamp } from "./draw";
import type { GameCtx, GameDef, Game, Hud, MinigameId, MinigameOpts, MinigameResult, PipState, View, GameOutcome } from "./types";

type Phase = "title" | "countdown" | "play" | "result" | "closing";

interface Info {
  title: string;
  howTo: string;
  icon: string;
}

interface DevFlags {
  /** skip title + countdown and jump straight into play */
  skipIntro?: boolean;
  /** show the result card immediately */
  forceResult?: "win" | "fail";
  forceStars?: 1 | 2 | 3;
}

let active: Shell | null = null;

export function runMinigame(id: MinigameId, def: GameDef, info: Info, opts: MinigameOpts): Promise<MinigameResult> {
  if (active) active.cancel();
  const sh = new Shell(id, def, info, opts);
  active = sh;
  return sh.run().finally(() => {
    if (active === sh) active = null;
  });
}

export function cancelActiveMinigame() {
  active?.cancel();
}

const HEART_PATH = "M50 90 C 22 70 4 52 4 31 C 4 15 16 4 30 4 C 40 4 46 10 50 18 C 54 10 60 4 70 4 C 84 4 96 15 96 31 C 96 52 78 70 50 90 Z";

function starPoints(cx: number, cy: number, R: number, r: number) {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    p.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return p.join(" ");
}
const STAR_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon class="mg-star-shape" points="${starPoints(50, 54, 44, 22)}"/><ellipse class="mg-star-shine" cx="38" cy="40" rx="6" ry="3.6" transform="rotate(-40 38 40)"/></svg>`;

let uid = 0;

class Shell implements Hud {
  private root: HTMLDivElement;
  private gameCv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private fxCv: HTMLCanvasElement;
  private fx: Fx;
  private hudEl: HTMLDivElement;
  private meterFill!: HTMLDivElement;
  private meterLabel!: HTMLSpanElement;
  private meterClip!: SVGRectElement;
  private meterHeart!: HTMLDivElement;
  private pipsEl!: HTMLDivElement;
  private timerEl!: HTMLDivElement;
  private timerNum!: HTMLSpanElement;
  private uiEl: HTMLDivElement;
  private cardsEl: HTMLDivElement;
  private probe: HTMLDivElement;
  private critter: Critter;
  private game: Game | null = null;
  private ctx!: GameCtx;
  private view: View = { w: 1, h: 1, l: 0, t: 0, r: 1, b: 1, pw: 1, ph: 1, s: 1, portrait: false };
  private phase: Phase = "title";
  private raf = 0;
  private last = 0;
  private portraits: PortraitView[] = [];
  private howTo: { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; t: number; critter: Critter } | null = null;
  private btnHandler: ((b: Btn) => void) | null = null;
  private offPress: () => void;
  private prevInputEnabled: boolean;
  private lastDevice = "";
  private glyphs: { el: HTMLElement; btn: Btn }[] = [];
  private reduced: boolean;
  private cancelled = false;
  private cancelResolve: (() => void) | null = null;
  private debug: Record<string, unknown> = {};
  private progress = 0;
  private dev: DevFlags;
  private cleanups: (() => void)[] = [];
  private id: MinigameId;
  private uid = ++uid;

  constructor(
    id: MinigameId,
    private def: GameDef,
    private info: Info,
    private opts: MinigameOpts,
  ) {
    this.id = id;
    this.dev = ((window as unknown as { __mgDev?: DevFlags }).__mgDev ?? {}) as DevFlags;
    this.reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.critter = new Critter(opts.species, opts.color);
    this.critter.density = this.reduced ? 0.4 : 1;

    const root = (this.root = document.createElement("div"));
    root.className = "mg-root mg-enter";
    root.dataset.game = id;
    root.style.setProperty("--critter", opts.color);
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", info.title);
    root.innerHTML = `
      <div class="mg-backdrop"><div class="mg-dots"></div></div>
      <canvas class="mg-game"></canvas>
      <div class="mg-hud">
        <div class="mg-name"><span class="mg-name-txt"></span></div>
        <div class="mg-meter">
          <div class="mg-meter-heart"><svg viewBox="0 0 100 94"><defs><clipPath id="mgclip${this.uid}"><rect class="mg-clip" x="0" y="0" width="100" height="94" style="transform: translateY(94px)"/></clipPath></defs>
            <path d="${HEART_PATH}" class="mg-heart-bg"/><path d="${HEART_PATH}" class="mg-heart-fill" clip-path="url(#mgclip${this.uid})"/>
            <path d="${HEART_PATH}" class="mg-heart-line"/><ellipse cx="27" cy="26" rx="8" ry="5" transform="rotate(-35 27 26)" class="mg-heart-shine"/></svg></div>
          <div class="mg-meter-bar"><div class="mg-meter-fill"></div><span class="mg-meter-label"></span></div>
        </div>
        <div class="mg-hud-right"><div class="mg-pips"></div><div class="mg-timer"><span></span></div></div>
      </div>
      <div class="mg-ui"></div>
      <canvas class="mg-fx"></canvas>
      <div class="mg-pops"></div>
      <div class="mg-cards"></div>
      <div class="mg-safe"></div>`;
    this.gameCv = root.querySelector(".mg-game")!;
    this.g = this.gameCv.getContext("2d")!;
    this.fxCv = root.querySelector(".mg-fx")!;
    this.fx = new Fx(this.fxCv, root.querySelector(".mg-pops")!);
    this.fx.density = this.reduced ? 0.35 : 1;
    this.hudEl = root.querySelector(".mg-hud")!;
    (root.querySelector(".mg-name-txt") as HTMLElement).textContent = opts.critterName;
    this.meterFill = root.querySelector(".mg-meter-fill")!;
    this.meterLabel = root.querySelector(".mg-meter-label")!;
    this.meterClip = root.querySelector(".mg-clip")!;
    this.meterHeart = root.querySelector(".mg-meter-heart")!;
    this.pipsEl = root.querySelector(".mg-pips")!;
    this.timerEl = root.querySelector(".mg-timer")!;
    this.timerNum = this.timerEl.querySelector("span")!;
    this.uiEl = root.querySelector(".mg-ui")!;
    this.cardsEl = root.querySelector(".mg-cards")!;
    this.probe = root.querySelector(".mg-safe")!;

    // pointer routing — never let events reach the world underneath
    const stop = (e: Event) => e.stopPropagation();
    for (const ev of ["pointerup", "pointermove", "pointercancel", "click", "dblclick", "wheel", "touchstart", "touchmove", "touchend", "mousedown", "mouseup", "contextmenu"]) {
      root.addEventListener(ev, stop, { passive: ev.startsWith("touch") || ev === "wheel" });
    }
    root.addEventListener("contextmenu", (e) => e.preventDefault());
    root.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (e.pointerType === "touch") input.lastDevice = "touch";
      else if (e.pointerType === "mouse" && input.lastDevice === "gamepad") input.lastDevice = "keyboard";
      this.pointerMode = true;
      if (this.phase === "play" && this.game?.onPointerDown && !(e.target as HTMLElement).closest("button")) {
        e.preventDefault();
        this.game.onPointerDown(e.clientX, e.clientY);
      }
    });

    this.prevInputEnabled = input.enabled;
    input.enabled = true;
    this.offPress = input.onPress((b) => {
      this.pointerMode = false;
      if (this.btnHandler) this.btnHandler(b);
    });
    const onResize = () => this.layout();
    window.addEventListener("resize", onResize);
    this.cleanups.push(() => window.removeEventListener("resize", onResize));
  }

  /** true when the last input was a pointer (hides paw cursors etc.) */
  pointerMode = false;

  /* ================================================================= flow */

  async run(): Promise<MinigameResult> {
    document.body.appendChild(this.root);
    this.layout();
    try {
      await Promise.race([document.fonts?.load("600 40px Fredoka"), new Promise((r) => setTimeout(r, 700))]);
    } catch {
      /* ignore */
    }
    this.newGame();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    audio.music("minigame");
    audio.voice(this.opts.species, "curious");
    this.publish();

    let result: MinigameResult = { success: false, stars: 0 };
    try {
      if (this.dev.forceResult) {
        this.root.classList.add("mg-hud-on");
        this.setProgress(this.dev.forceResult === "win" ? 1 : 0.4);
        if (this.dev.forceResult === "win") {
          await this.showWin(this.dev.forceStars ?? 3);
          result = { success: true, stars: this.dev.forceStars ?? 3 };
        } else {
          const r = await this.showFail();
          result = { success: false, stars: 0 };
          if (r === "retry") result = await this.loop(false);
        }
      } else if (this.dev.skipIntro) {
        result = await this.loop(true);
      } else {
        const go = await this.showTitle();
        if (go) result = await this.loop(false);
      }
    } catch (e) {
      if (!this.cancelled) console.error("[minigame]", e);
    }
    await this.close();
    return result;
  }

  private async loop(skipCountdown: boolean): Promise<MinigameResult> {
    let first = true;
    for (;;) {
      if (this.cancelled) return { success: false, stars: 0 };
      if (!first) this.newGame();
      this.root.classList.add("mg-hud-on");
      if (!(first && skipCountdown)) await this.countdown();
      first = false;
      this.phase = "play";
      this.publish();
      this.btnHandler = (b) => {
        if (this.phase === "play") this.game?.onButton?.(b);
      };
      const out = await this.cancellable(this.game!.start());
      if (!out || this.cancelled) return { success: false, stars: 0 };
      this.phase = "result";
      this.btnHandler = null;
      if (out.success) {
        await this.showWin(out.stars);
        return { success: true, stars: out.stars };
      }
      const choice = await this.showFail();
      if (choice === "later") return { success: false, stars: 0 };
    }
  }

  private cancellable<T>(p: Promise<T>): Promise<T | null> {
    return new Promise((res) => {
      this.cancelResolve = () => res(null);
      p.then(res, () => res(null));
    });
  }

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    this.cancelResolve?.();
    this.cardResolve?.("later");
  }

  private newGame() {
    this.game?.dispose?.();
    this.fx.clear();
    this.uiEl.innerHTML = "";
    this.debug = {};
    this.critter.setMood("idle", 0);
    this.progress = 0;
    this.setProgress(0);
    this.hideTimer();
    this.pipsEl.innerHTML = "";
    const banner = (text: string, ms = 1400, icon = "") => this.banner(text, ms, icon);
    const self = this;
    this.ctx = {
      get pointerMode() {
        return self.pointerMode;
      },
      opts: this.opts,
      view: this.view,
      critter: this.critter,
      fx: this.fx,
      hud: this,
      reduced: this.reduced,
      ui: this.uiEl,
      banner,
      debug: this.debug,
    };
    this.game = this.def.create(this.ctx);
    this.publish();
  }

  private publish() {
    (window as unknown as { __minigame?: unknown }).__minigame = { id: this.id, phase: this.phase, state: this.debug, progress: this.progress };
  }

  /* ================================================================= cards */

  private cardResolve: ((v: string) => void) | null = null;

  private showCard(el: HTMLElement, handlers: Partial<Record<Btn, string>>): Promise<string> {
    this.cardsEl.innerHTML = "";
    this.cardsEl.appendChild(el);
    this.cardsEl.classList.add("on");
    const shownAt = performance.now();
    return new Promise<string>((resolve) => {
      let done = false;
      const finish = (v: string) => {
        if (done) return;
        done = true;
        this.btnHandler = null;
        this.cardResolve = null;
        el.classList.add("mg-card-out");
        this.cardsEl.classList.remove("on");
        setTimeout(() => {
          el.remove();
          this.portraits = this.portraits.filter((p) => p.el.isConnected);
          if (this.howTo && !this.howTo.cv.isConnected) this.howTo = null;
        }, 260);
        resolve(v);
      };
      this.cardResolve = finish;
      this.btnHandler = (b) => {
        if (performance.now() - shownAt < 350) return;
        const v = handlers[b];
        if (v) {
          const btnEl = el.querySelector(`[data-v="${v}"]`) as HTMLElement | null;
          btnEl?.classList.add("mg-pressed");
          finish(v);
        }
      };
      el.querySelectorAll<HTMLElement>("[data-v]").forEach((b) => {
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          if (performance.now() - shownAt < 250) return;
          finish(b.dataset.v!);
        });
      });
    });
  }

  private mkBtn(label: string, v: string, cls: string, glyph: Btn | null, icon = ""): string {
    return `<button type="button" tabindex="-1" class="mg-btn ${cls}" data-v="${v}">${icon}<span class="mg-btn-txt">${label}</span>${glyph ? `<span class="mg-glyph" data-glyph="${glyph}"></span>` : ""}</button>`;
  }

  private bindGlyphs(el: HTMLElement) {
    this.glyphs = this.glyphs.filter((g) => g.el.isConnected);
    el.querySelectorAll<HTMLElement>("[data-glyph]").forEach((g) => {
      this.glyphs.push({ el: g, btn: g.dataset.glyph as Btn });
      this.setGlyph(g, g.dataset.glyph as Btn);
    });
  }
  private setGlyph(el: HTMLElement, b: Btn) {
    const l = btnLabel(b);
    el.textContent = l;
    el.style.display = l ? "" : "none";
  }

  private refreshGlyphs(force = false) {
    const d = input.lastDevice;
    if (!force && d === this.lastDevice) return;
    this.lastDevice = d;
    this.root.dataset.device = d;
    for (const g of this.glyphs) this.setGlyph(g.el, g.btn);
  }

  private async showTitle(): Promise<boolean> {
    this.phase = "title";
    this.publish();
    const el = document.createElement("div");
    el.className = "mg-card mg-title-card";
    el.innerHTML = `
      <div class="mg-ribbon"><span class="mg-ribbon-icon">${this.info.icon}</span>${this.info.title}</div>
      <div class="mg-title-body">
        <div class="mg-howto"><canvas></canvas></div>
        <div class="mg-title-side">
          <div class="mg-hint">${this.info.howTo}</div>
          <div class="mg-keyhint" data-keyhint></div>
          <div class="mg-card-btns">${this.mkBtn("Let's go!", "go", "mg-btn-go mg-wiggle", "a")}</div>
          ${this.mkBtn("Not now", "later", "mg-btn-link", "b")}
        </div>
      </div>`;
    const pv = new PortraitView(this.opts.species, this.opts.color, "mg-portrait mg-title-portrait");
    pv.critter.setMood("idle", 0);
    pv.critter.density = this.critter.density;
    this.portraits.push(pv);
    el.appendChild(pv.el);
    setTimeout(() => {
      pv.critter.wave();
      pv.critter.hop(0.6);
    }, 450);
    const howCv = el.querySelector(".mg-howto canvas") as HTMLCanvasElement;
    this.howTo = { cv: howCv, g: howCv.getContext("2d")!, t: 0, critter: new Critter(this.opts.species, this.opts.color) };
    this.howTo.critter.density = this.critter.density;
    const kh = el.querySelector("[data-keyhint]") as HTMLElement;
    kh.innerHTML = keyHint(this.id);
    this.bindGlyphs(el);
    const v = await this.showCard(el, { a: "go", start: "go", b: "later" });
    if (v === "go") {
      audio.unlock();
      audio.sfx("confirm");
      return true;
    }
    audio.sfx("back");
    return false;
  }

  private countdown(): Promise<void> {
    this.phase = "countdown";
    this.publish();
    this.btnHandler = null;
    return new Promise((resolve) => {
      const steps = ["3", "2", "1", "Go!"];
      let i = 0;
      const next = () => {
        if (this.cancelled) return resolve();
        if (i >= steps.length) return resolve();
        const s = steps[i++];
        const el = document.createElement("div");
        el.className = "mg-count" + (s === "Go!" ? " mg-count-go" : "");
        el.textContent = s;
        el.style.setProperty("--c", [C.sky, C.mint, C.butter, C.pink][i - 1]);
        this.uiEl.appendChild(el);
        setTimeout(() => el.remove(), 900);
        audio.sfx(s === "Go!" ? "go" : "countdown");
        if (s === "Go!") {
          this.critter.hop(0.8);
          this.critter.setMood("happy", 0.8);
          this.fx.burst(this.view.w / 2, this.view.h / 2, "star", { count: 12, speed: 520, gravity: 300 });
        }
        setTimeout(next, s === "Go!" ? 500 : 650);
      };
      next();
    });
  }

  private async showWin(stars: 1 | 2 | 3) {
    this.phase = "result";
    this.publish();
    this.critter.setMood("love", 0);
    const el = document.createElement("div");
    el.className = "mg-card mg-result-card mg-win";
    el.innerHTML = `
      <div class="mg-result-top"></div>
      <div class="mg-result-title"><span class="mg-result-name"></span> wants to be friends!</div>
      <div class="mg-stars">${[0, 1, 2].map((i) => `<span class="mg-star ${i < stars ? "on" : ""}" style="--i:${i}">${STAR_SVG}</span>`).join("")}</div>
      <div class="mg-card-btns">${this.mkBtn("Yay!", "ok", "mg-btn-go", "a")}</div>`;
    (el.querySelector(".mg-result-name") as HTMLElement).textContent = this.opts.critterName;
    const pv = new PortraitView(this.opts.species, this.opts.color, "mg-portrait mg-result-portrait");
    pv.critter.setMood("love", 0);
    pv.critter.density = this.critter.density;
    this.portraits.push(pv);
    el.querySelector(".mg-result-top")!.appendChild(pv.el);
    this.bindGlyphs(el);
    const p = this.showCard(el, { a: "ok", start: "ok", b: "ok" });
    audio.jingle("victory");
    setTimeout(() => audio.voice(this.opts.species, "happy"), 350);
    // celebration
    const cx = this.view.w / 2,
      cy = this.view.h * 0.4;
    this.fx.burst(cx, cy, "heart", { count: 26, speed: 700, gravity: 420, life: 1.6 });
    this.fx.burst(cx, cy, "confetti", { count: 50, speed: 900, life: 2.2 });
    this.fx.burst(cx, cy, "ring", { count: 1, size: 260, colors: [C.pink] });
    const hopper = setInterval(() => {
      pv.critter.hop(0.7);
      pv.critter.burst("heart", 3);
    }, 1100);
    this.cleanups.push(() => clearInterval(hopper));
    for (let i = 0; i < stars; i++) {
      setTimeout(() => {
        audio.sfx("sparkle", { pitch: 1 + i * 0.18 });
        const st = el.querySelectorAll(".mg-star")[i] as HTMLElement | undefined;
        if (st && st.isConnected) {
          const r = st.getBoundingClientRect();
          this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, "sparkle", { count: 10, speed: 360, gravity: 0 });
        }
      }, 650 + i * 280);
    }
    const rain = setInterval(() => {
      this.fx.burst(Math.random() * this.view.w, -20, "heart", { count: 1, speed: 60, gravity: 160, angle: Math.PI / 2, spread: 0.6, life: 3 });
    }, this.reduced ? 500 : 160);
    await p;
    clearInterval(rain);
    clearInterval(hopper);
    audio.sfx("confirm");
  }

  private async showFail(): Promise<"retry" | "later"> {
    this.phase = "result";
    this.publish();
    this.critter.setMood("sad", 1.4);
    const el = document.createElement("div");
    el.className = "mg-card mg-result-card mg-fail";
    el.innerHTML = `
      <div class="mg-result-top"></div>
      <div class="mg-result-title">So close!</div>
      <div class="mg-result-sub">Try again?</div>
      <div class="mg-card-btns">${this.mkBtn("Retry", "retry", "mg-btn-go", "a", RETRY_ICON)}${this.mkBtn("Later", "later", "mg-btn-soft", "b")}</div>`;
    const pv = new PortraitView(this.opts.species, this.opts.color, "mg-portrait mg-result-portrait");
    pv.critter.setMood("sad", 1.6);
    pv.critter.density = this.critter.density;
    setTimeout(() => {
      pv.critter.setMood("idle", 0);
      pv.critter.wave();
    }, 1600);
    this.portraits.push(pv);
    el.querySelector(".mg-result-top")!.appendChild(pv.el);
    this.bindGlyphs(el);
    audio.sfx("fail");
    setTimeout(() => audio.voice(this.opts.species, "sad"), 300);
    const v = (await this.showCard(el, { a: "retry", start: "retry", b: "later" })) as "retry" | "later";
    audio.sfx(v === "retry" ? "confirm" : "back");
    return v;
  }

  private banner(text: string, ms: number, icon: string) {
    const el = document.createElement("div");
    el.className = "mg-banner";
    el.innerHTML = `${icon}<span></span>`;
    (el.querySelector("span") as HTMLElement).textContent = text;
    el.style.top = this.view.t + 6 + "px";
    el.style.animationDuration = ms + "ms";
    this.uiEl.querySelectorAll(".mg-banner").forEach((b) => b.remove());
    this.uiEl.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  /* ================================================================= HUD */

  setProgress(v: number, label?: string) {
    v = clamp(v, 0, 1);
    const up = v > this.progress + 1e-4;
    this.progress = v;
    this.meterFill.style.transform = `scaleX(${Math.max(0.0001, v)})`;
    const fillH = v > 0 ? 94 * (0.14 + 0.86 * v) : 0;
    this.meterClip.style.transform = `translateY(${(94 - fillH).toFixed(1)}px)`;
    this.meterLabel.textContent = label ?? "";
    this.root.classList.toggle("mg-meter-full", v >= 1);
    if (up) this.pulseHeart();
    this.publish();
  }
  heartPos() {
    const r = this.meterHeart.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  pulseHeart() {
    this.meterHeart.classList.remove("mg-pulse");
    void this.meterHeart.offsetWidth;
    this.meterHeart.classList.add("mg-pulse");
  }
  private timerShown = -1;
  setTimer(left: number, total: number) {
    this.timerEl.classList.add("on");
    const secs = Math.max(0, Math.ceil(left));
    this.timerEl.style.setProperty("--p", String(clamp(left / total, 0, 1)));
    if (secs !== this.timerShown) {
      this.timerShown = secs;
      this.timerNum.textContent = String(secs);
      this.timerEl.classList.toggle("low", secs <= 5 && left > 0);
      if (secs <= 5 && secs > 0 && left < total) {
        this.timerEl.classList.remove("tick");
        void this.timerEl.offsetWidth;
        this.timerEl.classList.add("tick");
      }
    }
  }
  hideTimer() {
    this.timerEl.classList.remove("on", "low");
    this.timerShown = -1;
  }
  setPips(states: PipState[], icon: "treat" | "bell" | "dot" = "dot") {
    const html = states.map((s) => `<span class="mg-pip mg-pip-${icon} ${s}"></span>`).join("");
    if (this.pipsEl.innerHTML !== html) {
      // animate newly filled pips
      const prev = Array.from(this.pipsEl.children).map((c) => c.className);
      this.pipsEl.innerHTML = html;
      Array.from(this.pipsEl.children).forEach((c, i) => {
        if (prev[i] && prev[i] !== c.className) c.classList.add("mg-pip-pop");
      });
    }
  }

  /* ================================================================= loop */

  private layout() {
    const w = window.innerWidth,
      h = window.innerHeight;
    const sr = this.probe.getBoundingClientRect();
    const hudBottom = this.hudEl.offsetTop + this.hudEl.offsetHeight;
    const l = Math.max(sr.left, 0) + 12,
      r = Math.min(sr.right || w, w) - 12;
    const t = Math.max(hudBottom, sr.top) + 6,
      b = Math.min(sr.bottom || h, h) - 10;
    const pw = Math.max(100, r - l),
      ph = Math.max(100, b - t);
    const v = this.view;
    v.w = w;
    v.h = h;
    v.l = l;
    v.r = r;
    v.t = t;
    v.b = b;
    v.pw = pw;
    v.ph = ph;
    v.s = clamp(Math.min(pw / 1120, ph / 700), 0.4, 1.35);
    v.portrait = h > w * 1.1;
    this.fx.resize(w, h);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.refreshGlyphs();
    if (this.view.w !== window.innerWidth || this.view.h !== window.innerHeight) this.layout();
    const v = this.view;
    this.critter.update(dt);
    if (this.game) {
      try {
        this.game.update(dt);
      } catch (e) {
        console.error(e);
      }
    }
    const dpr = fitCanvas(this.gameCv, v.w, v.h);
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, v.w, v.h);
    if (this.game) {
      g.save();
      try {
        this.game.draw(g);
      } catch (e) {
        console.error(e);
      }
      g.restore();
    }
    for (const p of this.portraits) p.frame(dt);
    if (this.howTo && this.howTo.cv.isConnected) {
      const hw = this.howTo.cv.clientWidth,
        hh = this.howTo.cv.clientHeight;
      if (hw && hh) {
        const d = fitCanvas(this.howTo.cv, hw, hh);
        const hg = this.howTo.g;
        hg.setTransform(d, 0, 0, d, 0, 0);
        hg.clearRect(0, 0, hw, hh);
        this.howTo.t += dt;
        this.howTo.critter.update(dt);
        hg.save();
        this.def.howTo(hg, hw, hh, this.howTo.t, this.howTo.critter);
        hg.restore();
      }
    }
    this.fx.update(dt);
    this.fx.draw();
  };

  private close(): Promise<void> {
    this.phase = "closing";
    this.publish();
    this.btnHandler = null;
    this.root.classList.add("mg-leave");
    return new Promise((res) => {
      setTimeout(
        () => {
          this.destroy();
          res();
        },
        this.cancelled ? 0 : 320,
      );
    });
  }

  private destroy() {
    cancelAnimationFrame(this.raf);
    this.offPress();
    input.enabled = this.prevInputEnabled;
    this.game?.dispose?.();
    this.game = null;
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.fx.clear();
    this.root.remove();
    this.portraits = [];
    this.howTo = null;
    (window as unknown as { __minigame?: unknown }).__minigame = { id: this.id, phase: "closed", state: {}, progress: this.progress };
  }
}

const RETRY_ICON = `<svg class="mg-btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M19.5 3.5v5h-5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function keyHint(id: MinigameId): string {
  const k = (b: Btn) => `<span class="mg-glyph" data-glyph="${b}"></span>`;
  const arrows = `<span class="mg-keys"><span class="mg-key">↑</span><span class="mg-key">←</span><span class="mg-key">↓</span><span class="mg-key">→</span></span>`;
  switch (id) {
    case "treatToss":
      return `<span class="mg-kh-pad">or press ${k("a")}</span>`;
    case "bubblePop":
      return `<span class="mg-kh-pad">or move ${arrows} + ${k("a")}</span>`;
    case "melodyMatch":
    case "danceAlong":
      return `<span class="mg-kh-pad">or use ${arrows}</span>`;
  }
}
