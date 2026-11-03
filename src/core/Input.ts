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
export type Btn = "a" | "b" | "x" | "y" | "start" | "lb" | "rb" | "up" | "down" | "left" | "right" | "sprint" | "ride" | "attack";
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
  KeyR: "ride",
  KeyF: "attack",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  Comma: "lb",
  Period: "rb",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  // Android sometimes delivers controller buttons as key events
  GameButtonA: "a",
  GameButtonB: "b",
  GameButtonX: "x",
  GameButtonY: "y",
  GameButtonStart: "start",
  NumpadEnter: "a",
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
  6: "sprint",
  7: "sprint",
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
  /** right stick (camera), x right, y up. */
  look = { x: 0, y: 0 };
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
  /** pad buttons seen down by the fast poller since the last frame */
  private padLatched = new Set<Btn>();
  private connectListeners: ((id: string, connected: boolean) => void)[] = [];

  /** Notified when a controller connects/disconnects (for a friendly toast). */
  onConnect(cb: (id: string, connected: boolean) => void) {
    this.connectListeners.push(cb);
  }

  /** Read every connected pad; supports the standard layout plus common non-standard Android layouts. */
  private lookTmp = { x: 0, y: 0 };
  private readPads(out: Set<Btn>): { x: number; y: number } {
    this.lookTmp.x = this.lookTmp.y = 0;
    let px = 0,
      py = 0;
    let pads: (Gamepad | null)[] = [];
    try {
      pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    } catch {
      pads = [];
    }
    for (const p of pads) {
      if (!p || !p.connected) continue;
      p.buttons.forEach((btn, i) => {
        const b = PADMAP[i];
        if (b && (btn.pressed || btn.value > 0.5)) out.add(b);
      });
      if (p.mapping === "standard" || p.axes.length >= 4) {
        const rx = p.axes[2] ?? 0,
          ry = p.axes[3] ?? 0;
        if (Math.hypot(rx, ry) > 0.2) {
          this.lookTmp.x = rx;
          this.lookTmp.y = -ry;
        }
      }
      const ax = p.axes[0] ?? 0,
        ay = p.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.18) {
        px = ax;
        py = -ay;
      }
      if (p.mapping !== "standard") {
        // many non-standard pads put the d-pad on axes 6/7 or a single "hat" axis 9
        const hx = p.axes[6] ?? 0,
          hy = p.axes[7] ?? 0;
        if (hx < -0.5) out.add("left");
        if (hx > 0.5) out.add("right");
        if (hy < -0.5) out.add("up");
        if (hy > 0.5) out.add("down");
        const hat = p.axes[9];
        if (hat !== undefined && hat >= -1.01 && hat <= 1.01 && Math.abs(hat) > 0.05) {
          const k = Math.round((hat + 1) * 3.5); // 0 up, 1 up-right, 2 right … 7 up-left
          if (k === 7 || k === 0 || k === 1) out.add("up");
          if (k >= 1 && k <= 3) out.add("right");
          if (k >= 3 && k <= 5) out.add("down");
          if (k >= 5 && k <= 7) out.add("left");
        }
      }
    }
    return { x: px, y: py };
  }

  private pollPads() {
    const s = new Set<Btn>();
    this.readPads(s);
    for (const b of s) this.padLatched.add(b);
  }

  constructor() {
    window.addEventListener("keydown", (e) => {
      const b = KEYMAP[e.code] ?? KEYMAP[e.key];
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
      const b = KEYMAP[e.code] ?? KEYMAP[e.key];
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
    // Poll pads ~120x/s in between frames so short taps aren't lost when the frame rate dips.
    setInterval(() => this.pollPads(), 8);
    window.addEventListener("gamepadconnected", (e) => {
      this.lastDevice = "gamepad";
      for (const cb of this.connectListeners) cb((e as GamepadEvent).gamepad.id, true);
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      for (const cb of this.connectListeners) cb((e as GamepadEvent).gamepad.id, false);
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
    const stick = this.readPads(this.padDown);
    this.look.x = this.lookTmp.x;
    this.look.y = this.lookTmp.y;
    const px = stick.x,
      py = stick.y;
    for (const b of this.padLatched) this.padDown.add(b);
    this.padLatched.clear();
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
