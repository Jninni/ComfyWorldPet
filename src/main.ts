import { Game } from "./game/Game";

async function boot() {
  const bootEl = document.getElementById("boot")!;
  const fill = bootEl.querySelector(".fill") as HTMLElement;
  const msg = bootEl.querySelector(".msg") as HTMLElement;
  const progress = (p: number, m: string) => {
    fill.style.width = Math.round(4 + p * 96) + "%";
    msg.textContent = m;
  };
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  try {
    const game = new Game(canvas);
    await game.init(progress);
    bootEl.style.opacity = "0";
    setTimeout(() => bootEl.remove(), 600);
    canvas.focus();
    await game.title();
  } catch (e) {
    console.error(e);
    msg.textContent = "Oops! Something went wrong: " + (e as Error).message;
  }
}

// prevent iOS double-tap zoom & context menus
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());
document.addEventListener("gesturestart", (e) => e.preventDefault());

boot();
