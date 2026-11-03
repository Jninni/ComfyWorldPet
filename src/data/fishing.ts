/** Fish you can catch at Sparkle Pond. */
export type FishId = "guppy" | "minnow" | "koi" | "carp" | "puffer" | "jelly" | "goldkoi" | "boot" | "bottle";

export interface FishInfo {
  name: string;
  icon: string;
  color: string;
  /** 1 = easy … 5 = legendary */
  difficulty: number;
  /** relative chance */
  weight: number;
  size: [number, number]; // cm
  desc: string;
  junk?: boolean;
}

export const FISH: Record<FishId, FishInfo> = {
  guppy: { name: "Bubble Guppy", icon: "🐟", color: "#9fd3f2", difficulty: 1, weight: 30, size: [6, 14], desc: "Blows tiny bubbles when it's happy." },
  minnow: { name: "Mint Minnow", icon: "🐟", color: "#9fdcb8", difficulty: 1, weight: 26, size: [5, 11], desc: "Smells faintly of peppermint. Nobody knows why." },
  koi: { name: "Rosy Koi", icon: "🐠", color: "#f6a3c0", difficulty: 2, weight: 16, size: [20, 45], desc: "A pink koi with a heart-shaped spot." },
  carp: { name: "Lily Carp", icon: "🐠", color: "#cdb9f0", difficulty: 2, weight: 12, size: [25, 55], desc: "Naps under lily pads all afternoon." },
  puffer: { name: "Puffy Puffer", icon: "🐡", color: "#fbe7a1", difficulty: 3, weight: 6, size: [12, 26], desc: "Puffs up into a perfect ball when surprised!" },
  jelly: { name: "Moon Jelly", icon: "🪼", color: "#e3d6fa", difficulty: 3, weight: 4, size: [10, 22], desc: "Glows softly, like a little nightlight." },
  goldkoi: { name: "Golden Koi", icon: "✨", color: "#ffd166", difficulty: 5, weight: 1.2, size: [40, 80], desc: "A legendary fish! Catching one brings good luck." },
  boot: { name: "Old Boot", icon: "👢", color: "#c99a6b", difficulty: 1, weight: 5, size: [24, 30], desc: "A frog was living in it. It's a nice boot, honestly.", junk: true },
  bottle: { name: "Message Bottle", icon: "🍾", color: "#bfe9d6", difficulty: 2, weight: 3, size: [20, 25], desc: "There's a treasure map doodle inside! (and some crystals)", junk: true },
};

export const FISH_IDS = Object.keys(FISH) as FishId[];
