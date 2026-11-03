export type ResourceId = "twig" | "petal" | "pebble" | "berry" | "crystal";
export type KeyItemId = "journal" | "charm" | "lantern" | "starCrystal" | "yarn" | "cookie" | "wand";

export const RESOURCES: Record<ResourceId, { name: string; icon: string; color: string; desc: string }> = {
  twig: { name: "Twigs", icon: "🪵", color: "#c99a6b", desc: "Sturdy little sticks from the woods." },
  petal: { name: "Petals", icon: "🌸", color: "#f8b9cb", desc: "Soft petals from meadow flowers." },
  pebble: { name: "Pebbles", icon: "🪨", color: "#b4aec4", desc: "Smooth pebbles from the pond shore." },
  berry: { name: "Berries", icon: "🍓", color: "#f0727a", desc: "Sweet berries from forest bushes." },
  crystal: { name: "Crystals", icon: "💎", color: "#c8a8ff", desc: "Glittery shards from the Crystal Cave." },
};

export const KEY_ITEMS: Record<KeyItemId, { name: string; icon: string; desc: string }> = {
  journal: { name: "Critter Journal", icon: "📔", desc: "Records every critter you meet." },
  charm: { name: "Friendship Charm", icon: "💖", desc: "Lets you befriend wild critters." },
  lantern: { name: "Star Lantern", icon: "🏮", desc: "Lights the way through dark caves." },
  starCrystal: { name: "Star Crystal", icon: "🌟", desc: "A legendary crystal that glows with friendship." },
  wand: { name: "Sparkle Wand", icon: "🪄", desc: "Bonk Gloomies into sparkles! Ⓧ / F / ⚔️ in the Thornwild." },
  yarn: { name: "Yarn Balls", icon: "🧶", desc: "Stitch's lost yarn." },
  cookie: { name: "Critter Cookies", icon: "🍪", desc: "Makes befriending a little easier." },
};

export type BuildableId = "garden" | "cottage" | "lamp" | "fountain" | "berrypatch" | "swing" | "mushroomhouse" | "bench";

export interface BuildableInfo {
  name: string;
  icon: string;
  cost: Partial<Record<ResourceId, number>>;
  cozy: number;
  desc: string;
}

export const BUILDABLES: Record<BuildableId, BuildableInfo> = {
  garden: { name: "Flower Garden", icon: "🌷", cost: { petal: 4 }, cozy: 2, desc: "A bright bed of tulips and daisies." },
  bench: { name: "Picnic Bench", icon: "🪑", cost: { twig: 3 }, cozy: 1, desc: "A comfy spot to rest." },
  lamp: { name: "Glow Lamp", icon: "💡", cost: { twig: 2, crystal: 1 }, cozy: 2, desc: "A lamp that glows all night." },
  berrypatch: { name: "Berry Patch", icon: "🍓", cost: { berry: 3, twig: 1 }, cozy: 2, desc: "Snacks for everyone!" },
  swing: { name: "Tree Swing", icon: "🎠", cost: { twig: 5 }, cozy: 3, desc: "Wheee! Critters love it." },
  cottage: { name: "Critter Cottage", icon: "🏡", cost: { twig: 5, pebble: 2 }, cozy: 4, desc: "A snug home for your critter friends." },
  mushroomhouse: { name: "Mushroom House", icon: "🍄", cost: { twig: 3, petal: 3 }, cozy: 4, desc: "A spotty little house." },
  fountain: { name: "Bubble Fountain", icon: "⛲", cost: { pebble: 4, crystal: 2 }, cozy: 5, desc: "Sparkly bubbles all day long." },
};
