import type { TransformNode, Vector3 } from "@babylonjs/core";
import type { StageLighting } from "../render/Stage";

/** XZ-plane collider (world units). y is ignored. */
export type Collider =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number };

/** A thing the player can walk up to and press A on. */
export interface Interactable {
  id: string;
  pos: Vector3;
  radius: number;
  label: string;
}

export interface CameraFrame {
  /** ArcRotate params: alpha (around Y), beta (from vertical), radius, target */
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
  /** if true, camera follows player (clamped to bounds); else fixed diorama framing */
  follow?: boolean;
}

/** Built interior location (house rooms, cave). Everything is in WORLD coordinates. */
export interface InteriorDef {
  id: string;
  root: TransformNode;
  /** walkable rectangle */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  colliders: Collider[];
  spawn: Vector3;
  /** stepping into this circle leaves the interior */
  exit: { pos: Vector3; radius: number };
  /** named spots: "npc", "counter", "item_teacup", critter spawn points "critter_0" … */
  spots: Record<string, Vector3>;
  camera: CameraFrame;
  lighting: StageLighting;
  /** per-frame animation hook (flickering lamps, swaying vines…) */
  update?: (dt: number, t: number) => void;
}

/** Building exterior placed in the overworld. Coordinates in WORLD space. */
export interface ExteriorDef {
  id: string;
  root: TransformNode;
  /** the door: player walking into this point enters */
  door: Vector3;
  colliders: Collider[];
  update?: (dt: number, t: number) => void;
}
