import { SPECIES, ROLES } from "../data/species";
import type { OwnedCritter } from "../core/State";

/** XP needed to reach each level (index = level-1). Level 10 is max. */
export const LEVEL_XP = [0, 15, 40, 80, 130, 190, 260, 340, 430, 530];
export const MAX_LEVEL = LEVEL_XP.length;

export function levelOf(c: OwnedCritter): number {
  const xp = c.xp ?? 0;
  let lv = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) lv = i + 1;
  return lv;
}

/** 0..1 progress to the next level */
export function levelProgress(c: OwnedCritter): number {
  const lv = levelOf(c);
  if (lv >= MAX_LEVEL) return 1;
  const a = LEVEL_XP[lv - 1],
    b = LEVEL_XP[lv];
  return ((c.xp ?? 0) - a) / (b - a);
}

/** Levels make perks a bit stronger: +3% of the perk per level above 1. */
export function levelScale(c: OwnedCritter | undefined): number {
  return c ? 1 + 0.03 * (levelOf(c) - 1) : 1;
}

export interface StatRow {
  icon: string;
  label: string;
  /** 0..1 for the bar */
  value: number;
  text: string;
}

/** What the stat card shows for a critter, based on its class, level and friendship. */
export function statsFor(c: OwnedCritter): StatRow[] {
  const info = SPECIES[c.species];
  const lv = levelOf(c);
  const hearts = Math.min(5, c.friendship ?? 1);
  const best = hearts >= 5;
  const L = levelScale(c);
  const pct = (x: number) => `+${Math.round(x * 100)}%`;
  const rows: StatRow[] = [];
  const bar = (v: number) => Math.max(0.05, Math.min(1, v));
  switch (c.species) {
    case "fennix":
      rows.push({ icon: "💨", label: "Run speed", value: bar(((best ? 0.3 : 0.2) * L) / 0.45), text: pct((best ? 0.3 : 0.2) * L) });
      break;
    case "puffbun":
      rows.push({ icon: "⤴️", label: "Jump height", value: bar(((best ? 0.7 : 0.45) * L) / 0.9), text: pct((best ? 0.7 : 0.45) * L) });
      break;
    case "chirpy":
      rows.push({ icon: "🪽", label: "Double jump", value: 1, text: "Yes!" });
      break;
    case "glowbat":
      rows.push({ icon: "🪂", label: "Glide", value: 1, text: "Hold jump" });
      break;
    case "pony":
      rows.push({ icon: "🐎", label: "Gallop speed", value: 0.8, text: "11 m/s" });
      break;
    case "unicorn":
      rows.push({ icon: "🌈", label: "Gallop speed", value: 0.85, text: "11.5 m/s" });
      rows.push({ icon: "🪽", label: "Double jump", value: 1, text: "Yes!" });
      break;
    case "ribbit":
      rows.push({ icon: "🐸", label: "Mega hop", value: 0.9, text: "×1.9 jump" });
      break;
    case "emberling":
      rows.push({ icon: "🔥", label: "Sparkle fireball", value: bar((best ? 2 : 1) / 2), text: `${best ? 2 : 1} dmg · ${best ? 0.8 : 1.1}s` });
      break;
    case "roarlet":
      rows.push({ icon: "🐾", label: "Pounce", value: bar((best ? 3 : 2) / 3), text: `${best ? 3 : 2} dmg · ${best ? 1.0 : 1.4}s` });
      break;
    case "shellby":
      rows.push({ icon: "🛡️", label: "Bubble shield", value: bar((best ? 9 : 6) / 9), text: `every ${best ? 6 : 9}s` });
      break;
    case "shroomy":
      rows.push({ icon: "🌱", label: "Garden boost", value: best ? 0.65 : 0.55, text: `${best ? 65 : 55}% head start` });
      break;
    case "mochi":
      rows.push({ icon: "🧁", label: "Extra treats", value: best ? 1 : 0.5, text: `+${best ? 2 : 1} per bake` });
      break;
    case "duckling":
      rows.push({ icon: "🧵", label: "Sewing", value: 0.5, text: "−1 Petal" });
      break;
    default:
      rows.push({ icon: "🧺", label: "Gathering", value: bar(best ? 1 : 0.5), text: `+${best ? 2 : 1} finds` });
  }
  rows.push({ icon: "⭐", label: "Level", value: lv / MAX_LEVEL, text: `${lv} / ${MAX_LEVEL}` });
  rows.push({ icon: "💗", label: "Friendship", value: hearts / 5, text: best ? "Best friends!" : `${hearts} / 5 hearts` });
  void ROLES;
  return rows;
}

export function fmtTogether(sec: number) {
  const m = Math.floor(sec / 60);
  if (m < 1) return "just met!";
  if (m < 60) return `${m} min together`;
  return `${Math.floor(m / 60)} h ${m % 60} min together`;
}
