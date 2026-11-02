/**
 * Taming minigames — full-screen DOM/Canvas2D overlays.
 *
 *   const r = await playMinigame("treatToss", { species, critterName, color, difficulty });
 *   if (r.success) befriend(r.stars);
 */
import type { SpeciesId } from "../data/species";
import { runMinigame, cancelActiveMinigame } from "./shell";
import { treatToss } from "./games/treatToss";
import { bubblePop } from "./games/bubblePop";
import { melodyMatch } from "./games/melodyMatch";
import { danceAlong } from "./games/danceAlong";
import type { GameDef, MinigameId, MinigameOpts, MinigameResult } from "./types";

export type { MinigameId, MinigameOpts, MinigameResult } from "./types";

export const MINIGAME_INFO: Record<MinigameId, { title: string; howTo: string; icon: string }> = {
  treatToss: { title: "Treat Toss", howTo: "Tap when the treat is on the heart!", icon: "🍪" },
  bubblePop: { title: "Bubble Pop", howTo: "Pop hearts & stars. Skip grumpy clouds!", icon: "🫧" },
  melodyMatch: { title: "Melody Match", howTo: "Listen… then play the song back!", icon: "🔔" },
  danceAlong: { title: "Dance Along", howTo: "Hit the arrows when they reach the ring!", icon: "🎶" },
};

const DEFS: Record<MinigameId, GameDef> = { treatToss, bubblePop, melodyMatch, danceAlong };

/**
 * Opens the minigame overlay and resolves when the player is done:
 *  - success → { success: true, stars: 1..3 } after the "wants to be friends" card
 *  - "Later" (fail card or the title card's "Not now") → { success: false, stars: 0 }
 */
export function playMinigame(id: MinigameId, opts: MinigameOpts): Promise<MinigameResult> {
  const def = DEFS[id] ?? DEFS.treatToss;
  return runMinigame(id, def, MINIGAME_INFO[id] ?? MINIGAME_INFO.treatToss, opts);
}

/** Closes an open minigame immediately (resolves it with { success:false, stars:0 }). */
export function closeMinigame(): void {
  cancelActiveMinigame();
}

/** A sensible default minigame per species (integrator may ignore). */
export const SPECIES_MINIGAME: Record<SpeciesId, MinigameId> = {
  puffbun: "treatToss",
  chirpy: "melodyMatch",
  fennix: "danceAlong",
  hoglet: "treatToss",
  shroomy: "bubblePop",
  ribbit: "bubblePop",
  duckling: "bubblePop",
  glowbat: "melodyMatch",
  molly: "treatToss",
  mochi: "danceAlong",
};
