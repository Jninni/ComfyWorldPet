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
  | "mochi" // kitten – village (story)
  | "redpanda" // red panda – woods (bakery story)
  | "pony" // rideable pony – meadow
  | "unicorn" // rideable unicorn – hidden glade (after the main story)
  | "emberling" // guardian baby dragon – Thornwild
  | "roarlet" // guardian lion cub – Thornwild
  | "shellby"; // guardian turtle knight – Thornwild

export const SPECIES_IDS: SpeciesId[] = [
  "puffbun",
  "chirpy",
  "fennix",
  "hoglet",
  "shroomy",
  "redpanda",
  "ribbit",
  "duckling",
  "glowbat",
  "molly",
  "mochi",
  "pony",
  "unicorn",
  "emberling",
  "roarlet",
  "shellby",
];

/** Critter classes. */
export type Role = "helper" | "booster" | "rider" | "guardian";
export const ROLES: Record<Role, { name: string; icon: string; color: string; desc: string }> = {
  helper: { name: "Helper", icon: "🧺", color: "#bfe9d6", desc: "Helps with gardening, gathering, sewing and baking." },
  booster: { name: "Booster", icon: "⚡", color: "#fbe7a1", desc: "Gives you powers: run faster, jump higher, double jump or glide." },
  rider: { name: "Rider", icon: "🐴", color: "#f8b9cb", desc: "Let you ride them! Press Ⓨ / R / 🐴 to hop on." },
  guardian: { name: "Guardian", icon: "⚔️", color: "#cdb9f0", desc: "Brave fighters that battle Gloomies in the Thornwild." },
};

export type ZoneId = "village" | "meadow" | "woods" | "pond" | "cave" | "thornwild";
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
  role: Role;
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
    talent: "Baking: makes one extra treat every time you bake.",
    names: ["Mochi", "Dango", "Taffy", "Biscuit"],
    role: "helper",
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
    talent: "Bouncy: you jump much higher.",
    names: ["Puff", "Clover", "Marsh", "Nibbles", "Pom"],
    role: "booster",
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
    talent: "Flutter: you can double jump!",
    names: ["Tweet", "Pip-pip", "Sky", "Bluey"],
    role: "booster",
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
    talent: "Swift: you run faster.",
    names: ["Foxy", "Maple", "Ember", "Sunny"],
    role: "booster",
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
    talent: "Foraging: finds extra berries, twigs and mushrooms.",
    names: ["Prickles", "Bramble Jr.", "Nutmeg", "Acorn"],
    role: "helper",
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
    talent: "Gardening: waters new seeds for you and makes crops grow faster.",
    names: ["Spot", "Button", "Morel", "Puffcap"],
    role: "helper",
  },
  redpanda: {
    name: "Rufflepaw",
    color: "#e8875a",
    zone: "woods",
    game: "treatToss",
    difficulty: 2,
    temper: "curious",
    speed: 3.1,
    desc: "A fluffy red panda with a stripy tail. It has a terrible weakness for pastries!",
    likes: "Warm muffins and climbing trees",
    talent: "Foraging: finds extra apples, honey and garden crops.",
    names: ["Maple", "Cinnamon", "Toffee", "Pancake"],
    role: "helper",
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
    talent: "Ride: giant froggy hops! Press Ⓨ / R / 🐴.",
    names: ["Hopper", "Lily", "Kero", "Bubbles"],
    role: "rider",
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
    talent: "Sewing: soft down feathers mean sewing needs 1 fewer Petal.",
    names: ["Waddles", "Butter", "Quackers", "Sunny"],
    role: "helper",
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
    talent: "Glide: hold jump while falling to float. Lights dark places.",
    names: ["Nova", "Lumi", "Twinkle", "Echo"],
    role: "booster",
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
    talent: "Digging: finds extra crystals and pebbles.",
    names: ["Molly", "Digby", "Truffle", "Pebble"],
    role: "helper",
  },
  pony: {
    name: "Clover Pony",
    color: "#f6d7b8",
    zone: "meadow",
    game: "danceAlong",
    difficulty: 2,
    temper: "playful",
    speed: 4.2,
    desc: "A chubby little pony with a fluffy mane. It loves a good gallop!",
    likes: "Apples and wide open meadows",
    talent: "Ride: gallop super fast! Press Ⓨ / R / 🐴.",
    names: ["Biscuit", "Clover", "Butterscotch", "Pipsqueak"],
    role: "rider",
  },
  unicorn: {
    name: "Moonbeam Unicorn",
    color: "#f3ecff",
    zone: "meadow",
    game: "melodyMatch",
    difficulty: 3,
    temper: "shy",
    speed: 4.4,
    desc: "A shy, shimmering unicorn that only shows itself to true Critter Friends.",
    likes: "Starlight, songs and rainbow sprinkles",
    talent: "Ride: fast gallop, double jump and a rainbow sparkle trail!",
    names: ["Moonbeam", "Stardust", "Opal", "Sugarplum"],
    role: "rider",
  },
  emberling: {
    name: "Emberling",
    color: "#ffb38a",
    zone: "thornwild",
    game: "danceAlong",
    difficulty: 3,
    temper: "playful",
    speed: 3.4,
    desc: "A baby dragon with a warm tummy. Its sneezes are tiny sparkle-fireballs!",
    likes: "Toasty marshmallows and brave friends",
    talent: "Guardian: shoots sparkle fireballs at Gloomies.",
    names: ["Ember", "Sparky", "Cinder", "Toasty"],
    role: "guardian",
  },
  roarlet: {
    name: "Roarlet",
    color: "#ffd58a",
    zone: "thornwild",
    game: "treatToss",
    difficulty: 3,
    temper: "curious",
    speed: 3.8,
    desc: "A lion cub with a fluffy mane and a big brave roar (it squeaks).",
    likes: "Sunny rocks and pouncing games",
    talent: "Guardian: pounces on Gloomies with a mighty bonk.",
    names: ["Leo", "Sunny", "Mane-y", "Rory"],
    role: "guardian",
  },
  shellby: {
    name: "Shellby",
    color: "#a9dcb8",
    zone: "thornwild",
    game: "bubblePop",
    difficulty: 3,
    temper: "sleepy",
    speed: 2.4,
    desc: "A turtle knight with a shell shaped like a shield. Slow, steady and very kind.",
    likes: "Puddles and protecting friends",
    talent: "Guardian: wraps you in a bubble shield that blocks a hit.",
    names: ["Shelly", "Sir Shell", "Pebble", "Bastion"],
    role: "guardian",
  },
};

export const ZONE_INFO: Record<ZoneId, { name: string; subtitle: string; music: "village" | "meadow" | "woods" | "pond" | "cave" }> = {
  village: { name: "Cozy Hollow", subtitle: "A sleepy little village", music: "village" },
  meadow: { name: "Whisper Meadow", subtitle: "Where the flowers hum", music: "meadow" },
  woods: { name: "Mossy Woods", subtitle: "Soft, green and full of secrets", music: "woods" },
  pond: { name: "Sparkle Pond", subtitle: "Splishy splashy fun", music: "pond" },
  cave: { name: "Crystal Cave", subtitle: "Glowing wonders underground", music: "cave" },
  thornwild: { name: "The Thornwild", subtitle: "Brave hearts only!", music: "cave" },
};
