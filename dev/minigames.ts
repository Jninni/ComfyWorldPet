/**
 * Dev sandbox for the taming minigames.
 *   ?game=bubblePop&autoplay=1            open immediately (title card)
 *   &species=fennix&diff=2&name=Foxy&color=%23ffb766
 *   &skip=1                                skip title + countdown (straight to play)
 *   &result=win|fail&stars=2               show a result card directly
 */
import { playMinigame, MINIGAME_INFO, type MinigameId } from "../src/minigames";
import { SPECIES_IDS, type SpeciesId } from "../src/data/species";

const COLORS: Record<SpeciesId, string> = {
  puffbun: "#f8b9cb",
  chirpy: "#fbe7a1",
  fennix: "#ffc49b",
  hoglet: "#d9b99b",
  shroomy: "#fff0dc",
  redpanda: "#e8875a",
  ribbit: "#a8e0b0",
  duckling: "#fde68a",
  glowbat: "#c7b3f0",
  molly: "#c9b2a6",
  mochi: "#e9e4f5",
  pony: "#f6d7b8",
  unicorn: "#f3ecff",
  emberling: "#ffb38a",
  roarlet: "#ffd58a",
  shellby: "#a9dcb8",
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const speciesSel = $<HTMLSelectElement>("species");
const diffSel = $<HTMLSelectElement>("diff");
const nameIn = $<HTMLInputElement>("name");
const colorIn = $<HTMLInputElement>("color");
const log = $<HTMLDivElement>("log");

for (const s of SPECIES_IDS) speciesSel.add(new Option(cap(s), s));
speciesSel.onchange = () => {
  const s = speciesSel.value as SpeciesId;
  nameIn.value = cap(s);
  colorIn.value = COLORS[s];
};
const sp = (q.get("species") as SpeciesId) || "puffbun";
speciesSel.value = sp;
nameIn.value = q.get("name") || cap(sp);
colorIn.value = q.get("color") || COLORS[sp] || "#f8b9cb";
diffSel.value = q.get("diff") || "1";

const w = window as unknown as { __ready?: boolean; __results?: unknown[]; __mgDev?: unknown; __play?: (id: MinigameId) => Promise<unknown> };
w.__results = [];
if (q.get("skip")) w.__mgDev = { skipIntro: true };
if (q.get("result")) w.__mgDev = { forceResult: q.get("result"), forceStars: Number(q.get("stars") || 3) };

async function launch(id: MinigameId) {
  const r = await playMinigame(id, {
    species: speciesSel.value as SpeciesId,
    critterName: nameIn.value || "Friend",
    color: colorIn.value,
    difficulty: Number(diffSel.value) as 1 | 2 | 3,
  });
  w.__results!.push({ id, ...r });
  log.textContent = `${id}: ${JSON.stringify(r)}\n` + log.textContent;
  return r;
}
w.__play = launch;

const games = $<HTMLDivElement>("games");
for (const id of Object.keys(MINIGAME_INFO) as MinigameId[]) {
  const b = document.createElement("button");
  b.textContent = `${MINIGAME_INFO[id].icon} ${MINIGAME_INFO[id].title}`;
  b.onclick = () => launch(id);
  games.appendChild(b);
}

const g = q.get("game") as MinigameId | null;
if (g && q.get("autoplay")) {
  void launch(g);
  const wait = () => (document.querySelector(".mg-root") && (window as unknown as { __minigame?: { phase: string } }).__minigame ? (w.__ready = true) : requestAnimationFrame(wait));
  setTimeout(() => requestAnimationFrame(wait), 150);
} else w.__ready = true;

/* ?critters=1 → gallery of every species × mood (art review) */
if (q.get("critters")) {
  void import("../src/minigames/critter").then(({ Critter }) => {
    document.getElementById("panel")!.style.display = "none";
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;background:#fff6e6";
    document.body.appendChild(cv);
    const g = cv.getContext("2d")!;
    const moods = ["idle", "happy", "love", "surprised", "sad", "sing"] as const;
    const crits = SPECIES_IDS.map((s) => moods.map((m) => {
      const c = new Critter(s, COLORS[s]);
      c.setMood(m, 0);
      c.update(0.3);
      return c;
    }));
    const W = innerWidth, H = innerHeight;
    cv.width = W * 2; cv.height = H * 2;
    g.scale(2, 2);
    const cw = W / moods.length, ch = H / SPECIES_IDS.length;
    const S = Math.min(cw, ch) * 0.26;
    crits.forEach((row, i) => row.forEach((c, j) => c.draw(g, cw * (j + 0.5), ch * (i + 0.5) + S * 0.2, S)));
    w.__ready = true;
  });
}
