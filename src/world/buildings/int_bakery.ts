import { Vector3, type Scene } from "@babylonjs/core";
import type { InteriorDef } from "../../core/types";
import { Kit } from "./kit";
import { RoomCtx, roomShell, finishInterior, makeRoot } from "./room";

export function buildBakery(scene: Scene, origin: Vector3): InteriorDef {
  const root = makeRoot(scene, "bakery", origin);
  const k = new Kit(scene, root);
  const ctx = new RoomCtx(origin);
  roomShell(k, { wall: "#fde9b8", border: "#f7a8c0", borderDeep: "#e58aa9", floor: "check", floorA: "#fff6e6", floorB: "#f8c9d4", mat: "#f7a8c0", matAccent: "#fff6e6" });
  return finishInterior("bakery", k, ctx, "#f9d7c4");
}
