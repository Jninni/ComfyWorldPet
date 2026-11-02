import type { SpeciesId } from "../data/species";
import type { Btn } from "../core/Input";
import type { Critter } from "./critter";
import type { Fx } from "./fx";

export type MinigameId = "treatToss" | "bubblePop" | "melodyMatch" | "danceAlong";

export interface MinigameOpts {
  species: SpeciesId;
  critterName: string;
  /** theme hex of the critter */
  color: string;
  difficulty: 1 | 2 | 3;
}

export interface MinigameResult {
  success: boolean;
  stars: 0 | 1 | 2 | 3;
}

export interface GameOutcome {
  success: boolean;
  stars: 1 | 2 | 3;
}

/** play rectangle in CSS px (below the HUD, inside safe areas) */
export interface View {
  w: number;
  h: number;
  l: number;
  t: number;
  r: number;
  b: number;
  pw: number;
  ph: number;
  /** layout scale ≈ 1 at 1180×820 */
  s: number;
  portrait: boolean;
}

export type PipState = "empty" | "good" | "great" | "miss" | "current";

export interface Hud {
  setProgress(v: number, label?: string): void;
  /** client-space centre of the friendship heart (fly-to target) */
  heartPos(): { x: number; y: number };
  pulseHeart(): void;
  setTimer(left: number, total: number): void;
  hideTimer(): void;
  setPips(states: PipState[], icon?: "treat" | "bell" | "dot"): void;
}

export interface GameCtx {
  opts: MinigameOpts;
  view: View;
  critter: Critter;
  fx: Fx;
  hud: Hud;
  reduced: boolean;
  /** layer for game-specific DOM (banners etc.), pointer-events: none */
  ui: HTMLElement;
  /** shows a centred banner pill for ms */
  banner(text: string, ms?: number, icon?: string): void;
  /** true when the player last used mouse/touch (hide paw cursors etc.) */
  readonly pointerMode: boolean;
  /** debug/test state, exposed on window.__minigame.state */
  debug: Record<string, unknown>;
}

export interface Game {
  /** called every frame, also while title/countdown are shown (idle scene) */
  update(dt: number): void;
  draw(g: CanvasRenderingContext2D): void;
  /** begin gameplay; resolves when the round is over */
  start(): Promise<GameOutcome>;
  onButton?(b: Btn): void;
  onPointerDown?(x: number, y: number): void;
  dispose?(): void;
}

export type GameFactory = (ctx: GameCtx) => Game;

/** title-card "how to play" animation: draws a looping demo into a w×h box */
export type HowToDrawer = (g: CanvasRenderingContext2D, w: number, h: number, t: number, critter: Critter) => void;

export interface GameDef {
  create: GameFactory;
  howTo: HowToDrawer;
}
