import { Vector3, type Scene } from "@babylonjs/core";
import { buildCritter, type CritterModel } from "../entities/critterModels";
import { buildPlayer, buildNpc, type CharacterModel, type NpcId, type PlayerLook } from "../entities/characterModels";
import type { CollisionWorld } from "../core/Collision";
import type { SpeciesId } from "../data/species";
import { SPECIES } from "../data/species";
import type { OwnedCritter } from "../core/State";
import { audio } from "../audio/Audio";

export type GroundFn = (x: number, z: number) => number;

function angLerp(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ------------------------------------------------------------------ */
/* Player                                                              */
/* ------------------------------------------------------------------ */

export class PlayerCtl {
  model: CharacterModel;
  pos = new Vector3();
  rot = 0;
  speed = 0;
  radius = 0.42;
  private vx = 0;
  private vz = 0;
  private stepT = 0;
  celebrate = 0;
  /** food buffs (zoomies) */
  speedMul = 1;
  /** breadcrumb trail for followers */
  trail: Vector3[] = [];
  private trailDist = 0;
  onStep: ((p: Vector3) => void) | null = null;

  constructor(scene: Scene, look: PlayerLook) {
    this.model = buildPlayer(scene, look);
  }

  place(x: number, y: number, z: number, rot: number) {
    this.pos.set(x, y, z);
    this.rot = rot;
    this.vx = this.vz = 0;
    this.trail = [];
    for (let i = 0; i < 40; i++) {
      this.trail.push(new Vector3(x - Math.sin(rot) * i * 0.3, y, z - Math.cos(rot) * i * 0.3));
    }
    this.sync();
  }

  sync() {
    this.model.root.position.copyFrom(this.pos);
    this.model.root.rotation.y = this.rot;
  }

  update(dt: number, mx: number, my: number, camAlpha: number, world: CollisionWorld, ground: GroundFn) {
    // camera-relative: camera at angle alpha looks toward -(cos a, sin a)
    const fx = -Math.cos(camAlpha),
      fz = -Math.sin(camAlpha);
    const rx = fz,
      rz = -fx;
    const mag = Math.min(1, Math.hypot(mx, my));
    const maxSpeed = (mag > 0.85 ? 6.8 : 4.6) * this.speedMul;
    const tx = (rx * mx + fx * my) * maxSpeed;
    const tz = (rz * mx + fz * my) * maxSpeed;
    const acc = mag > 0.05 ? 14 : 18;
    this.vx += (tx - this.vx) * Math.min(1, acc * dt);
    this.vz += (tz - this.vz) * Math.min(1, acc * dt);
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.05) {
      const r = world.move(this.pos.x, this.pos.z, this.vx * dt, this.vz * dt, this.radius);
      const moved = Math.hypot(r.x - this.pos.x, r.z - this.pos.z);
      this.pos.x = r.x;
      this.pos.z = r.z;
      if (mag > 0.05) this.rot = angLerp(this.rot, Math.atan2(this.vx, this.vz), Math.min(1, 12 * dt));
      this.trailDist += moved;
      if (this.trailDist > 0.3) {
        this.trailDist = 0;
        this.trail.unshift(this.pos.clone());
        if (this.trail.length > 40) this.trail.pop();
      }
      this.stepT += moved;
      if (this.stepT > 1.15) {
        this.stepT = 0;
        audio.sfx("step", { volume: 0.5 });
        this.onStep?.(this.pos);
      }
    }
    this.speed = Math.min(1, sp / 6.8);
    const gy = ground(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, 20 * dt);
    this.sync();
    if (this.celebrate > 0) this.celebrate -= dt;
    this.model.update(dt, { speed: this.speed, celebrate: this.celebrate > 0 });
  }

  /** idle-animate without moving (dialogue, menus) */
  idle(dt: number, talking = false) {
    this.vx = this.vz = 0;
    this.speed = 0;
    this.model.update(dt, { speed: 0, talking, celebrate: this.celebrate > 0 });
    if (this.celebrate > 0) this.celebrate -= dt;
  }

  face(p: Vector3) {
    this.rot = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.sync();
  }

  /** point in front of the player */
  front(d = 1.2) {
    return new Vector3(this.pos.x + Math.sin(this.rot) * d, this.pos.y, this.pos.z + Math.cos(this.rot) * d);
  }
}

/* ------------------------------------------------------------------ */
/* Party followers                                                     */
/* ------------------------------------------------------------------ */

export class Follower {
  model: CritterModel;
  pos = new Vector3();
  rot = 0;
  private spd = 0;
  constructor(scene: Scene, public owned: OwnedCritter) {
    this.model = buildCritter(scene, owned.species, owned.variant);
  }
  place(p: Vector3, rot: number) {
    this.pos.copyFrom(p);
    this.rot = rot;
    this.model.root.position.copyFrom(p);
    this.model.root.rotation.y = rot;
  }
  update(dt: number, target: Vector3, ground: GroundFn) {
    const dx = target.x - this.pos.x,
      dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const sp = SPECIES[this.owned.species].speed * 2.2;
    let want = 0;
    if (d > 0.35) want = Math.min(sp, d * 3.2);
    this.spd += (want - this.spd) * Math.min(1, 8 * dt);
    if (d > 0.01 && this.spd > 0.05) {
      const k = Math.min(1, (this.spd * dt) / d);
      this.pos.x += dx * k;
      this.pos.z += dz * k;
      this.rot = angLerp(this.rot, Math.atan2(dx, dz), Math.min(1, 10 * dt));
    }
    if (d > 14) {
      // teleport if left far behind (e.g. after a door)
      this.pos.x = target.x;
      this.pos.z = target.z;
    }
    this.pos.y = ground(this.pos.x, this.pos.z);
    this.model.root.position.copyFrom(this.pos);
    this.model.root.rotation.y = this.rot;
    this.model.update(dt, { speed: Math.min(1, this.spd / sp) });
  }
  dispose() {
    this.model.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Wild critters                                                       */
/* ------------------------------------------------------------------ */

type WildState = "idle" | "wander" | "notice" | "flee" | "sleep" | "hidden";

export class WildCritter {
  model: CritterModel;
  pos = new Vector3();
  rot = Math.random() * Math.PI * 2;
  state: WildState = "idle";
  timer = 1 + Math.random() * 2;
  target = new Vector3();
  private spd = 0;
  noticed = false;
  respawnAt = 0;
  constructor(scene: Scene, public id: string, public species: SpeciesId, public variant: 0 | 1, public home: Vector3, public range: number) {
    this.model = buildCritter(scene, species, variant);
    this.pos.copyFrom(home);
    if (SPECIES[species].temper === "sleepy" && Math.random() < 0.6) this.state = "sleep";
  }

  get info() {
    return SPECIES[this.species];
  }

  hide() {
    this.state = "hidden";
    this.model.setEnabled(false);
  }
  show(p: Vector3) {
    this.pos.copyFrom(p);
    this.state = "idle";
    this.timer = 1;
    this.noticed = false;
    this.model.setEnabled(true);
  }

  update(dt: number, player: Vector3, playerSpeed: number, world: CollisionWorld, ground: GroundFn, onEmote: (c: WildCritter, g: string) => void) {
    if (this.state === "hidden") return;
    const info = this.info;
    const pdx = player.x - this.pos.x,
      pdz = player.z - this.pos.z;
    const pd = Math.hypot(pdx, pdz);
    this.timer -= dt;
    let want = 0;

    if (this.state !== "sleep") {
      if (pd < 6.5 && !this.noticed) {
        this.noticed = true;
        this.state = "notice";
        this.timer = 1.2;
        onEmote(this, info.temper === "shy" ? "❗" : info.temper === "curious" ? "❓" : "🎵");
        this.model.emote("surprised");
        if (Math.random() < 0.6) audio.voice(this.species, "curious");
      } else if (pd > 11) this.noticed = false;
    }

    switch (this.state) {
      case "sleep":
        if (pd < 2.5 && playerSpeed > 0.8 && this.timer < 0) {
          this.timer = 3;
          onEmote(this, "💤");
        }
        break;
      case "notice":
        this.rot = angLerp(this.rot, Math.atan2(pdx, pdz), Math.min(1, 6 * dt));
        if (this.timer < 0) {
          if (info.temper === "shy" && pd < 4 && playerSpeed > 0.75) {
            this.state = "flee";
            this.timer = 1.0;
            const a = Math.atan2(-pdx, -pdz) + (Math.random() - 0.5) * 0.8;
            this.target.set(this.pos.x + Math.sin(a) * 4, 0, this.pos.z + Math.cos(a) * 4);
          } else {
            this.state = "idle";
            this.timer = 1.5 + Math.random();
          }
        }
        break;
      case "flee":
      case "wander": {
        const dx = this.target.x - this.pos.x,
          dz = this.target.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        want = this.state === "flee" ? info.speed * 1.4 : info.speed * 0.55;
        if (d < 0.3 || this.timer < 0) {
          this.state = "idle";
          this.timer = 1.5 + Math.random() * 3;
          want = 0;
        } else {
          this.rot = angLerp(this.rot, Math.atan2(dx, dz), Math.min(1, 6 * dt));
        }
        break;
      }
      case "idle":
      default:
        // curious critters face the player when close
        if (pd < 5) this.rot = angLerp(this.rot, Math.atan2(pdx, pdz), Math.min(1, 3 * dt));
        if (this.timer < 0) {
          const a = Math.random() * Math.PI * 2,
            r = Math.random() * this.range;
          this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.state = "wander";
          this.timer = 6;
        }
    }
    this.spd += (want - this.spd) * Math.min(1, 6 * dt);
    if (this.spd > 0.05) {
      const fx = Math.sin(this.rot) * this.spd * dt,
        fz = Math.cos(this.rot) * this.spd * dt;
      const r = world.move(this.pos.x, this.pos.z, fx, fz, this.model.radius);
      if (r.hit && this.state === "wander") this.timer = Math.min(this.timer, 0.2);
      this.pos.x = r.x;
      this.pos.z = r.z;
    }
    this.pos.y = ground(this.pos.x, this.pos.z);
    this.model.root.position.copyFrom(this.pos);
    this.model.root.rotation.y = this.rot;
    this.model.update(dt, { speed: Math.min(1, this.spd / info.speed), sleeping: this.state === "sleep" });
  }
}

/* ------------------------------------------------------------------ */
/* NPC                                                                 */
/* ------------------------------------------------------------------ */

export class Npc {
  model: CharacterModel;
  pos = new Vector3();
  rot = 0;
  homeRot = 0;
  talking = false;
  location = "overworld";
  constructor(scene: Scene, public id: NpcId) {
    this.model = buildNpc(scene, id);
  }
  place(location: string, p: Vector3, rot: number) {
    this.location = location;
    this.pos.copyFrom(p);
    this.rot = this.homeRot = rot;
    this.model.root.position.copyFrom(p);
    this.model.root.rotation.y = rot;
  }
  update(dt: number, player: Vector3 | null) {
    const near = player && Vector3.DistanceSquared(player, this.pos) < 30;
    if (near && player) {
      this.model.lookAt(player.add(new Vector3(0, 1, 0)));
      if (this.talking) this.rot = angLerp(this.rot, Math.atan2(player.x - this.pos.x, player.z - this.pos.z), Math.min(1, 6 * dt));
    } else {
      this.model.lookAt(null);
      this.rot = angLerp(this.rot, this.homeRot, Math.min(1, 2 * dt));
    }
    this.model.root.rotation.y = this.rot;
    this.model.update(dt, { speed: 0, talking: this.talking });
  }
}
