import { TransformNode, type Scene, type Vector3 } from "@babylonjs/core";
import type { ExteriorDef } from "../../core/types";
export function buildExteriorImpl(scene: Scene, id: string, pos: Vector3, rotY: number): ExteriorDef {
  const root = new TransformNode(id, scene);
  root.position.copyFrom(pos);
  root.rotation.y = rotY;
  return { id, root, door: pos.clone(), colliders: [] };
}
