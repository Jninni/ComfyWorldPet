/**
 * Comfy World Pets — buildings: storybook cottage exteriors and diorama interiors.
 *
 * Exteriors: placed in the overworld, door faces -Z when rotY = 0.
 * Interiors: diorama rooms built around `origin` (place far from the overworld, e.g. x = 1000+).
 */
import type { Scene, Vector3 } from "@babylonjs/core";
import type { ExteriorDef, InteriorDef } from "../core/types";
import { buildTeahouse } from "./buildings/int_teahouse";
import { buildExteriorImpl } from "./buildings/exteriors";
import { buildLibrary } from "./buildings/int_library";
import { buildFlowershop } from "./buildings/int_flowershop";
import { buildSewing } from "./buildings/int_sewing";
import { buildHome } from "./buildings/int_home";
import { buildWorkshop } from "./buildings/int_workshop";
import { buildBakery } from "./buildings/int_bakery";

export type BuildingId = "home" | "teahouse" | "library" | "flowershop" | "sewing" | "workshop" | "bakery";

export const BUILDING_IDS: BuildingId[] = ["home", "teahouse", "library", "flowershop", "sewing", "workshop", "bakery"];

export const BUILDING_INFO: Record<BuildingId, { name: string; owner: string /* npc id or "player" */ }> = {
  home: { name: "Your Cozy Cottage", owner: "player" },
  teahouse: { name: "Granny Pom's Tea House", owner: "granny" },
  library: { name: "Professor Hoot's Library", owner: "hoot" },
  flowershop: { name: "Flora's Flower Shop", owner: "flora" },
  sewing: { name: "Stitch's Sewing Room", owner: "stitch" },
  workshop: { name: "Bramble's Workshop", owner: "bramble" },
  bakery: { name: "Mocha's Bakery & Café", owner: "mocha" },
};

export function buildExterior(scene: Scene, id: BuildingId, pos: Vector3, rotY: number): ExteriorDef {
  return buildExteriorImpl(scene, id, pos, rotY);
}

export function buildInterior(scene: Scene, id: BuildingId, origin: Vector3): InteriorDef {
  switch (id) {
    case "teahouse":
      return buildTeahouse(scene, origin);
    case "library":
      return buildLibrary(scene, origin);
    case "flowershop":
      return buildFlowershop(scene, origin);
    case "sewing":
      return buildSewing(scene, origin);
    case "home":
      return buildHome(scene, origin);
    case "workshop":
      return buildWorkshop(scene, origin);
    case "bakery":
      return buildBakery(scene, origin);
  }
}
