export type SpeciesId =
  | "puffbun" // bunny – meadow
  | "chirpy" // round songbird – meadow
  | "fennix" // fluffy fox – woods
  | "hoglet" // hedgehog – woods
  | "shroomy" // mushroom sprite – woods
  | "ribbit" // frog – pond
  | "duckling" // duck – pond
  | "glowbat" // fuzzy bat – cave
  | "molly" // mole – cave
  | "mochi"; // kitten – village (story)

export const SPECIES_IDS: SpeciesId[] = ["puffbun", "chirpy", "fennix", "hoglet", "shroomy", "ribbit", "duckling", "glowbat", "molly", "mochi"];

export type ZoneId = "village" | "meadow" | "woods" | "pond" | "cave";
export type MinigameKind = "treatToss" | "bubblePop" | "melodyMatch" | "danceAlong";

export interface SpeciesInfo {
  name: string;
  color: string;
  zone: ZoneId;
  game: MinigameKind;
  difficulty: 1 | 2 | 3;
  /** how it behaves in the wild */
  temper: "curious" | "shy" | "sleepy" | "playful";
  speed: number;
  desc: string;
  likes: string;
  /** what it helps with while in your party */
  talent: string;
  names: string[];
}

export const SPECIES: Record<SpeciesId, SpeciesInfo> = {
  mochi: {
    name: "Mochi Kitten",
    color: "#ffd9b8",
    zone: "village",
    game: "treatToss",
    difficulty: 1,
    temper: "sleepy",
    speed: 2.6,
    desc: "A calico kitten who naps in the sunniest spot of the library.",
    likes: "Warm rugs and fish cookies",
    talent: "Sniffs out hidden treasures nearby.",
    names: ["Mochi", "Dango", "Taffy", "Biscuit"],
  },
  puffbun: {
    name: "Puffbun",
    color: "#fbd3e0",
    zone: "meadow",
    game: "treatToss",
    difficulty: 1,
    temper: "shy",
    speed: 3.2,
    desc: "A cloud-soft bunny. Its ears flop when it's happy!",
    likes: "Clover and gentle songs",
    talent: "Finds extra Petals when gathering flowers.",
    names: ["Puff", "Clover", "Marsh", "Nibbles", "Pom"],
  },
  chirpy: {
    name: "Chirpy",
    color: "#bfe0f6",
    zone: "meadow",
    game: "melodyMatch",
    difficulty: 1,
    temper: "playful",
    speed: 2.8,
    desc: "A round little songbird that hums every tune it hears.",
    likes: "Bells, berries and sunny mornings",
    talent: "Sings to make minigames a little easier.",
    names: ["Tweet", "Pip-pip", "Sky", "Bluey"],
  },
  fennix: {
    name: "Fennix",
    color: "#ffc59e",
    zone: "woods",
    game: "danceAlong",
    difficulty: 2,
    temper: "playful",
    speed: 3.6,
    desc: "A fluffy fox with a tail bigger than its whole body.",
    likes: "Dancing and hide-and-seek",
    talent: "Finds extra Twigs in the woods.",
    names: ["Foxy", "Maple", "Ember", "Sunny"],
  },
  hoglet: {
    name: "Hoglet",
    color: "#e9c2a6",
    zone: "woods",
    game: "bubblePop",
    difficulty: 2,
    temper: "shy",
    speed: 2.2,
    desc: "Its spines are soft as a brush. It curls up when shy.",
    likes: "Berries and bubbles",
    talent: "Finds extra Berries in bushes.",
    names: ["Prickles", "Bramble Jr.", "Nutmeg", "Acorn"],
  },
  shroomy: {
    name: "Shroomy",
    color: "#f8b9cb",
    zone: "woods",
    game: "bubblePop",
    difficulty: 2,
    temper: "curious",
    speed: 2.4,
    desc: "A tiny mushroom sprite. Nobody knows where it keeps its feet.",
    likes: "Rainy days and soft moss",
    talent: "Makes mushrooms sparkle with goodies.",
    names: ["Spot", "Button", "Morel", "Puffcap"],
  },
  ribbit: {
    name: "Ribbit",
    color: "#bfe9d6",
    zone: "pond",
    game: "danceAlong",
    difficulty: 2,
    temper: "playful",
    speed: 3.0,
    desc: "A bouncy frog who loves to hop from lily pad to lily pad.",
    likes: "Splashing and rhythm",
    talent: "Finds extra Pebbles by the water.",
    names: ["Hopper", "Lily", "Kero", "Bubbles"],
  },
  duckling: {
    name: "Duckling",
    color: "#fbe7a1",
    zone: "pond",
    game: "treatToss",
    difficulty: 2,
    temper: "curious",
    speed: 2.4,
    desc: "A waddly little duck who follows anyone with snacks.",
    likes: "Bread crumbs and puddles",
    talent: "Waddles behind you in the cutest way.",
    names: ["Waddles", "Butter", "Quackers", "Sunny"],
  },
  glowbat: {
    name: "Glowbat",
    color: "#d9c6f5",
    zone: "cave",
    game: "melodyMatch",
    difficulty: 3,
    temper: "curious",
    speed: 3.4,
    desc: "A fuzzy bat whose ears glow like little nightlights.",
    likes: "Echoes and starlight",
    talent: "Lights up dark places.",
    names: ["Nova", "Lumi", "Twinkle", "Echo"],
  },
  molly: {
    name: "Molly Mole",
    color: "#d8c8e6",
    zone: "cave",
    game: "treatToss",
    difficulty: 3,
    temper: "sleepy",
    speed: 2.0,
    desc: "A sleepy mole with a pink star nose. Excellent at digging.",
    likes: "Crystals and worm cookies",
    talent: "Digs up extra Crystals.",
    names: ["Molly", "Digby", "Truffle", "Pebble"],
  },
};

export const ZONE_INFO: Record<ZoneId, { name: string; subtitle: string; music: "village" | "meadow" | "woods" | "pond" | "cave" }> = {
  village: { name: "Cozy Hollow", subtitle: "A sleepy little village", music: "village" },
  meadow: { name: "Whisper Meadow", subtitle: "Where the flowers hum", music: "meadow" },
  woods: { name: "Mossy Woods", subtitle: "Soft, green and full of secrets", music: "woods" },
  pond: { name: "Sparkle Pond", subtitle: "Splishy splashy fun", music: "pond" },
  cave: { name: "Crystal Cave", subtitle: "Glowing wonders underground", music: "cave" },
};
