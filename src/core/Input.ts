/**
 * Unified input: keyboard, standard gamepads and on-screen touch controls.
 *
 * Polling API (world/gameplay):   input.move, input.down("a"), input.pressed("a")
 * Event API (UI, minigames):       const off = input.onPress((btn) => ...)
 *
 * Buttons use console naming: a = confirm/interact, b = back, x = party/menu,
 * y = journal, start = pause, lb/rb = shoulder, up/down/left/right = d-pad
 * (also synthesised from stick/WASD for menu navigation).
 */
export type Btn = "a" | "b" | "x" | "y" | "start" | "lb" | "rb" | "up" | "down" | "left" | "right";
export type Device = "keyboard" | "gamepad" | "touch";

const KEYMAP: Record<string, Btn> = {
  Space: "a",
  Enter: "a",
  KeyE: "a",
  KeyZ: "a",
  Escape: "b",
  Backspace: "b",
  KeyX: "b",
  KeyQ: "x",
  Tab: "x",
  KeyJ: "y",
  KeyC: "y",
  KeyP: "start",
  KeyM: "start",
  BracketLeft: "lb",
  BracketRight: "rb",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
};

const PADMAP: Partial<Record<number, Btn>> = {
  0: "a",
  1: "b",
  2: "x",
  3: "y",
  4: "lb",
  5: "rb",
  8: "start",
  9: "start",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};

type PressCb = (b: Btn) => void;

class InputImpl {
  /** analog movement, x right, y up (forward). length <= 1 */
  move = { x: 0, y: 0 };
  lastDevice: Device = "keyboard";
  enabled = true;

  private keyDown = new Set<Btn>();
  private padDown = new Set<Btn>();
  private touchDown = new Set<Btn>();
  private touchMove = { x: 0, y: 0 };
  private prev = new Set<Btn>();
  private cur = new Set<Btn>();
  private edges = new Set<Btn>();
  private listeners: PressCb[] = [];
  private stickLatch = { x: 0, y: 0 };
  private keysHeld = new Set<string>();
  /** presses seen since the last update, so taps shorter than a frame still register */
  private tapped = new Set<Btn>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      const b = KEYMAP[e.code];
      if (e.code === "Tab") e.preventDefault();
      if (!b) return;
      if (e.target instanceof HTMLInputElement) return;
      this.lastDevice = "keyboard";
      this.keysHeld.add(e.code);
      if (!e.repeat) {
        this.keyDown.add(b);
        this.tapped.add(b);
      }
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.keysHeld.delete(e.code);
      const b = KEYMAP[e.code];
      if (!b) return;
      // only release if no other key maps to the same button
      for (const k of this.keysHeld) if (KEYMAP[k] === b) return;
      this.keyDown.delete(b);
    });
    window.addEventListener("blur", () => {
      this.keyDown.clear();
      this.keysHeld.clear();
    });
    window.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") this.lastDevice = "touch";
    });
    const loop = () => {
      this.update();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Called once per animation frame (automatically). */
  update() {
    this.padDown.clear();
    let px = 0,
      py = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      p.buttons.forEach((btn, i) => {
        const b = PADMAP[i];
        if (b && (btn.pressed || btn.value > 0.5)) this.padDown.add(b);
      });
      const ax = p.axes[0] ?? 0,
        ay = p.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.18) {
        px = ax;
        py = -ay;
      }
    }
    if (this.padDown.size || Math.hypot(px, py) > 0.3) this.lastDevice = "gamepad";

    // stick → dpad edges for menus
    const sx = px || this.touchMove.x;
    const sy = py || this.touchMove.y;
    if (Math.abs(sx) > 0.6) this.stickLatch.x = Math.sign(sx);
    else if (Math.abs(sx) < 0.3) this.stickLatch.x = 0;
    if (Math.abs(sy) > 0.6) this.stickLatch.y = Math.sign(sy);
    else if (Math.abs(sy) < 0.3) this.stickLatch.y = 0;

    this.prev = this.cur;
    this.cur = new Set<Btn>([...this.keyDown, ...this.padDown, ...this.touchDown, ...this.tapped]);
    this.tapped.clear();
    if (this.stickLatch.x > 0) this.cur.add("right");
    if (this.stickLatch.x < 0) this.cur.add("left");
    if (this.stickLatch.y > 0) this.cur.add("up");
    if (this.stickLatch.y < 0) this.cur.add("down");

    this.edges.clear();
    for (const b of this.cur) if (!this.prev.has(b)) this.edges.add(b);

    // movement vector
    let mx = 0,
      my = 0;
    if (this.keyDown.has("left")) mx -= 1;
    if (this.keyDown.has("right")) mx += 1;
    if (this.keyDown.has("up")) my += 1;
    if (this.keyDown.has("down")) my -= 1;
    if (this.padDown.has("left")) mx -= 1;
    if (this.padDown.has("right")) mx += 1;
    if (this.padDown.has("up")) my += 1;
    if (this.padDown.has("down")) my -= 1;
    mx += px + this.touchMove.x;
    my += py + this.touchMove.y;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.move.x = mx;
    this.move.y = my;

    if (this.enabled) for (const b of this.edges) for (const l of [...this.listeners]) l(b);
  }

  down(b: Btn) {
    return this.enabled && this.cur.has(b);
  }
  pressed(b: Btn) {
    return this.enabled && this.edges.has(b);
  }
  /** Swallow an edge so other pollers this frame don't see it. */
  consume(b: Btn) {
    this.edges.delete(b);
  }
  consumeAll() {
    this.edges.clear();
  }

  onPress(cb: PressCb): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /* ---- hooks for on-screen touch controls ---- */
  setTouchMove(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
    if (x || y) this.lastDevice = "touch";
  }
  setTouchButton(b: Btn, down: boolean) {
    if (down) {
      this.touchDown.add(b);
      this.tapped.add(b);
      this.lastDevice = "touch";
    } else this.touchDown.delete(b);
  }

  get hasGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return [...pads].some((p) => p && p.connected);
  }
}

export const input = new InputImpl();

/** Human-friendly glyph for a button given the current device. */
export function btnLabel(b: Btn): string {
  const d = input.lastDevice;
  if (d === "gamepad") return ({ a: "Ⓐ", b: "Ⓑ", x: "Ⓧ", y: "Ⓨ", start: "☰", lb: "LB", rb: "RB" } as Record<string, string>)[b] ?? b;
  if (d === "touch") return "";
  return ({ a: "Space", b: "Esc", x: "Q", y: "J", start: "P", lb: "[", rb: "]" } as Record<string, string>)[b] ?? b;
}
