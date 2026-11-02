import type { ResourceId } from "./items";

/* ================================================================== */
/* Ingredients & gardening                                             */
/* ================================================================== */

export type IngredientId = "wheat" | "carrot" | "strawberry" | "pumpkin" | "apple" | "mushroom" | "honey";

export const INGREDIENTS: Record<IngredientId, { name: string; icon: string; color: string; where: string }> = {
  wheat: { name: "Wheat", icon: "🌾", color: "#f5cf6b", where: "Grow it in your garden" },
  carrot: { name: "Carrots", icon: "🥕", color: "#ffb766", where: "Grow them in your garden" },
  strawberry: { name: "Strawberries", icon: "🍓", color: "#f0727a", where: "Grow them in your garden" },
  pumpkin: { name: "Pumpkins", icon: "🎃", color: "#ff9f5a", where: "Grow them in your garden" },
  apple: { name: "Apples", icon: "🍎", color: "#f47a7a", where: "Apple baskets under fruit trees" },
  mushroom: { name: "Mushrooms", icon: "🍄", color: "#e9b8d9", where: "Mossy Woods" },
  honey: { name: "Honey", icon: "🍯", color: "#f5cf6b", where: "Beehives in Whisper Meadow" },
};

export type CropId = "wheat" | "carrot" | "strawberry" | "pumpkin";

export const CROPS: Record<CropId, { name: string; icon: string; growSec: number; yield: [number, number]; leaf: string; fruit: string }> = {
  wheat: { name: "Wheat", icon: "🌾", growSec: 75, yield: [2, 3], leaf: "#b6d98a", fruit: "#f5cf6b" },
  carrot: { name: "Carrots", icon: "🥕", growSec: 100, yield: [2, 3], leaf: "#7fcf7a", fruit: "#ffa64d" },
  strawberry: { name: "Strawberries", icon: "🍓", growSec: 130, yield: [2, 4], leaf: "#6fbf6f", fruit: "#f0727a" },
  pumpkin: { name: "Pumpkins", icon: "🎃", growSec: 180, yield: [1, 2], leaf: "#7fc06a", fruit: "#ff9f5a" },
};

/* ================================================================== */
/* Cooking                                                             */
/* ================================================================== */

export type FoodId = "cookie" | "tart" | "carrotcake" | "applepie" | "soup" | "muffin" | "shortcake";
export type BuffId = "zoomies" | "lucky" | "cozy" | "helpful";

export interface FoodInfo {
  name: string;
  icon: string;
  desc: string;
  /** "eat" = buff for you, "share" = treat for your party critters */
  use: "eat" | "share" | "keep";
  buff?: BuffId;
  /** seconds (or uses for cozy) */
  amount?: number;
  makes?: number;
}

export const FOODS: Record<FoodId, FoodInfo> = {
  cookie: { name: "Critter Cookies", icon: "🍪", desc: "Offer one to a wild critter to make befriending easier.", use: "keep", makes: 3 },
  tart: { name: "Berry Tart", icon: "🥧", desc: "Share with your party: friends get happier and help you gather extra for a while.", use: "share", buff: "helpful", amount: 180 },
  carrotcake: { name: "Carrot Cake", icon: "🍰", desc: "Eat it to get the zoomies: run faster for a while!", use: "eat", buff: "zoomies", amount: 180 },
  applepie: { name: "Apple Pie", icon: "🥧", desc: "Eat it to feel lucky: rare-coloured critters appear much more often.", use: "eat", buff: "lucky", amount: 300 },
  soup: { name: "Mushroom Soup", icon: "🍲", desc: "A cozy belly makes the next 3 befriending games easier.", use: "eat", buff: "cozy", amount: 3 },
  muffin: { name: "Pumpkin Muffin", icon: "🧁", desc: "Share with your party: they sniff out every gathering spot so it's ready again.", use: "share" },
  shortcake: { name: "Strawberry Shortcake", icon: "🍓", desc: "Share with your party: each friend brings you a little present!", use: "share" },
};

export const BUFFS: Record<BuffId, { name: string; icon: string }> = {
  zoomies: { name: "Zoomies", icon: "💨" },
  lucky: { name: "Lucky", icon: "🍀" },
  cozy: { name: "Cozy Belly", icon: "💛" },
  helpful: { name: "Helpful Friends", icon: "🐾" },
};

export type Cost = Partial<Record<IngredientId | ResourceId, number>>;

export interface Recipe {
  id: FoodId;
  cost: Cost;
}

export const RECIPES: Recipe[] = [
  { id: "cookie", cost: { wheat: 1, honey: 1 } },
  { id: "tart", cost: { wheat: 1, berry: 2 } },
  { id: "carrotcake", cost: { wheat: 1, carrot: 2, honey: 1 } },
  { id: "soup", cost: { mushroom: 2, carrot: 1 } },
  { id: "applepie", cost: { wheat: 1, apple: 3 } },
  { id: "muffin", cost: { pumpkin: 1, wheat: 1, honey: 1 } },
  { id: "shortcake", cost: { strawberry: 2, wheat: 1, honey: 1 } },
];

/* ================================================================== */
/* Café orders                                                         */
/* ================================================================== */

export interface CafeOrder {
  who: string; // npc id
  food: FoodId;
  reward: Partial<Record<ResourceId, number>>;
}

export const ORDER_POOL: CafeOrder[] = [
  { who: "bramble", food: "carrotcake", reward: { twig: 4, pebble: 2 } },
  { who: "granny", food: "tart", reward: { petal: 3, crystal: 1 } },
  { who: "hoot", food: "soup", reward: { crystal: 2, twig: 2 } },
  { who: "pip", food: "cookie", reward: { petal: 2, berry: 2 } },
  { who: "marina", food: "applepie", reward: { pebble: 4, crystal: 1 } },
  { who: "mayor", food: "shortcake", reward: { crystal: 2, petal: 3 } },
  { who: "flora", food: "muffin", reward: { petal: 4, berry: 2 } },
  { who: "stitch", food: "tart", reward: { twig: 3, petal: 2 } },
];

/* ================================================================== */
/* Sewing & dyes                                                       */
/* ================================================================== */

export type DyeId = "rose" | "sunflower" | "bluebell" | "lavender" | "daisy" | "poppy" | "mint";

export const DYES: Record<DyeId, { name: string; color: string; where: string }> = {
  rose: { name: "Pink Rose", color: "#f6a3c0", where: "Whisper Meadow" },
  sunflower: { name: "Sunflower", color: "#ffd166", where: "Whisper Meadow" },
  lavender: { name: "Lavender", color: "#b9a0e6", where: "Whisper Meadow" },
  daisy: { name: "Daisy", color: "#fffaf0", where: "Whisper Meadow & the village" },
  bluebell: { name: "Bluebell", color: "#8fc3ea", where: "Sparkle Pond" },
  poppy: { name: "Poppy", color: "#ff8a7a", where: "Mossy Woods edge & the village" },
  mint: { name: "Mint Leaf", color: "#9fdcb8", where: "Mossy Woods" },
};

export type GarmentKind = "overalls" | "dress" | "hoodie" | "tunic" | "raincoat" | "scarf" | "bow" | "cape" | "backpack";

export const PATTERNS: Record<GarmentKind, { name: string; icon: string; slot: "outfit" | "accessory"; petals: number }> = {
  overalls: { name: "Overalls", icon: "👖", slot: "outfit", petals: 2 },
  dress: { name: "Dress", icon: "👗", slot: "outfit", petals: 3 },
  hoodie: { name: "Hoodie", icon: "🧥", slot: "outfit", petals: 3 },
  tunic: { name: "Tunic", icon: "👕", slot: "outfit", petals: 2 },
  raincoat: { name: "Raincoat", icon: "🧥", slot: "outfit", petals: 3 },
  scarf: { name: "Scarf", icon: "🧣", slot: "accessory", petals: 1 },
  bow: { name: "Hair Bow", icon: "🎀", slot: "accessory", petals: 1 },
  cape: { name: "Cape", icon: "🦸", slot: "accessory", petals: 2 },
  backpack: { name: "Backpack", icon: "🎒", slot: "accessory", petals: 2 },
};

export interface Garment {
  uid: number;
  kind: GarmentKind;
  color: string;
  accent: string;
}
