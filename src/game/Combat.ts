import { Vector3, type Mesh, TransformNode } from "@babylonjs/core";
import type { Game, Location } from "./Game";
import { buildEnemy, buildHappyBlob, ENEMY_INFO, type EnemyKind, type EnemyModel } from "../entities/enemyModels";
import { Batch, ball, torus, blob } from "../render/Shapes";
import { SPECIES } from "../data/species";
import type { Follower } from "./Actors";
import { audio } from "../audio/Audio";
import { input } from "../core/Input";
import { h } from "../ui/dom";

/**
 * Light action combat for dangerous areas (the Thornwild).
 * Kid-friendly rules: Gloomies poof into sparkles, you have 5 hearts, campfires are checkpoints,
 * running out of hearts just sends you back to the last campfire with full hearts.
 */

interface Enemy {
  kind: EnemyKind;
  model: EnemyModel;
  home: Vector3;
  pos: Vector3;
  rot: number;
  hp: number;
  maxHp: number;
  state: "idle" | "chase" | "windup" | "charge" | "recover" | "return" | "dead";
  t: number;
  cd: number;
  arena: number;
  charge: Vector3;
  hitFlash: number;
}

interface Shot {
  mesh: Mesh;
  pos: Vector3;
  vel: Vector3;
  life: number;
  friendly: boolean;
  dmg: number;
}

interface Wave {
  mesh: Mesh;
  center: Vector3;
  r: number;
  hitDone: boolean;
}

export class Combat {
  active = false;
  hearts = 5;
  maxHearts = 5;
  private invuln = 0;
  private shield = 0;
  private shieldMesh: Mesh | null = null;
  enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private waves: Wave[] = [];
  private shotTpl: { good: Mesh; bad: Mesh } | null = null;
  private waveTpl: Mesh | null = null;
  private attackCd = 0;
  private guardCd = new Map<number, number>();
  private pounce = new Map<number, { t: number; from: Vector3; to: Vector3 }>();
  private heartsEl: HTMLElement;
  private bossEl: HTMLElement;
  private boss: Enemy | null = null;
  checkpoint = new Vector3();
  private L: Location | null = null;
  private slashMesh: Mesh | null = null;
  private slashT = 0;
  onBossDefeated: (() => void) | null = null;
  onEnemyDefeated: ((kind: EnemyKind, pos: Vector3) => void) | null = null;
  onKnockedOut: (() => void) | null = null;
  /** the Gloom King, happy again, bouncing around after the fight */
  private happy: { m: EnemyModel; t: number; pos: Vector3 } | null = null;

  constructor(private g: Game) {
    this.heartsEl = h(".hearts-hud");
    this.bossEl = h(".boss-hud", null, h(".boss-name", null, "👑 Gloom King"), h(".boss-bar", null, h(".boss-fill")));
    this.heartsEl.style.display = "none";
    this.bossEl.style.display = "none";
    g.ui.root.append(this.heartsEl, this.bossEl);
  }

  /* ================================================================== */
  /* Lifecycle                                                           */
  /* ================================================================== */

  /** Enter a dangerous area: spawn its Gloomies. */
  begin(L: Location) {
    this.end();
    this.L = L;
    this.active = true;
    this.hearts = this.maxHearts;
    this.invuln = 1.5;
    const def = L.def!;
    this.checkpoint.copyFrom(def.spawn);
    this.ensureTemplates();
    if (!this.g.state.flags.thornwildCleansed) this.spawnAll();
    this.renderHearts();
    this.heartsEl.style.display = "";
    this.g.ui.setCombatButtons(true);
  }

  end() {
    for (const e of this.enemies) e.model.dispose();
    this.enemies = [];
    for (const s of this.shots) s.mesh.dispose();
    this.shots = [];
    for (const w of this.waves) w.mesh.dispose();
    this.waves = [];
    this.boss = null;
    this.happy?.m.dispose();
    this.happy = null;
    this.active = false;
    this.invuln = 0;
    this.g.player?.model.root.setEnabled(true);
    this.setShield(false);
    this.heartsEl.style.display = "none";
    this.bossEl.style.display = "none";
    this.g.ui.setCombatButtons(false);
    this.L = null;
  }

  private spawnAll() {
    const def = this.L!.def!;
    const kinds: EnemyKind[] = ["gloomblob", "gloomblob", "thornbug", "gloomblob", "puffspitter", "thornbug"];
    for (let i = 0; i < 18; i++) {
      const p = def.spots["enemy_" + i];
      if (!p) continue;
      const arena = Math.floor(i / 6);
      // later arenas get trickier mixes
      const kind = arena === 0 ? (i % 3 === 2 ? "thornbug" : "gloomblob") : kinds[(i + arena) % kinds.length];
      this.spawn(kind, p, arena);
    }
  }

  private spawn(kind: EnemyKind, p: Vector3, arena: number) {
    const model = buildEnemy(this.g.scene, kind);
    const info = ENEMY_INFO[kind];
    const e: Enemy = {
      kind,
      model,
      home: p.clone(),
      pos: p.clone(),
      rot: Math.random() * Math.PI * 2,
      hp: info.hp,
      maxHp: info.hp,
      state: "idle",
      t: Math.random() * 2,
      cd: 1,
      arena,
      charge: new Vector3(),
      hitFlash: 0,
    };
    model.root.position.copyFrom(p);
    this.enemies.push(e);
    return e;
  }

  startBoss() {
    const def = this.L?.def;
    if (!def || this.boss) return;
    const p = def.spots.boss ?? def.spawn;
    this.boss = this.spawn("gloomking", p, 3);
    this.boss.state = "chase";
    this.bossEl.style.display = "";
    this.renderBoss();
    audio.jingle("fanfare");
    this.g.ui.showBanner("The Gloom King!", "Jump over his shockwaves!");
  }

  /* ================================================================== */
  /* Player actions                                                      */
  /* ================================================================== */

  /** Sparkle Wand swing: hits Gloomies in a wide arc in front of you. */
  swing() {
    if (this.attackCd > 0) return;
    this.attackCd = 0.42;
    const p = this.g.player;
    audio.sfx("whoosh", { pitch: 1.3 });
    this.showSlash();
    const fx = Math.sin(p.rot),
      fz = Math.cos(p.rot);
    let hit = false;
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const dx = e.pos.x - p.pos.x,
        dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const reach = 2.3 + e.model.radius;
      if (d > reach) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (d > 1.0 && dot < 0.15) continue;
      this.damage(e, 1, dx / (d || 1), dz / (d || 1));
      hit = true;
    }
    // gloom bubbles around trapped guardians pop after a few bonks
    this.g.bonkBubbles(p.front(1.2));
    if (hit) audio.sfx("pop", { pitch: 1.4 });
  }

  private showSlash() {
    const p = this.g.player;
    if (!this.slashMesh) {
      const b = new Batch(this.g.scene, "slash");
      b.add(torus(this.g.scene, 1.4, 0.16, { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.35], color: "#fff3c4" }, 24));
      for (let i = 0; i < 5; i++) b.add(blob(this.g.scene, 0.12, 0.12, 0.12, { pos: [Math.cos(i) * 1.4, 0, Math.sin(i) * 1.4], color: "#ffd6ea" }, 6));
      this.slashMesh = b.build({ outline: false, emissive: "#ffe6a8", castShadow: false })!;
    }
    const m = this.slashMesh;
    m.setEnabled(true);
    m.position.set(p.pos.x + Math.sin(p.rot) * 0.9, p.pos.y + 0.8, p.pos.z + Math.cos(p.rot) * 0.9);
    m.rotation.y = p.rot;
    m.scaling.setAll(0.4);
    this.slashT = 0.22;
    this.g.fx.sparkles(m.position, 6, ["#fff3a6", "#ffd6ea"]);
    this.g.player.celebrate = 0.15;
  }

  heal(n: number) {
    if (!this.active) return;
    this.hearts = Math.min(this.maxHearts, this.hearts + n);
    this.renderHearts();
    this.g.fx.hearts(this.g.player.pos.add(new Vector3(0, 1.4, 0)), 6);
  }

  setCheckpoint(p: Vector3) {
    if (this.checkpoint.equalsWithEpsilon(p, 0.5)) return false;
    this.checkpoint.copyFrom(p);
    this.hearts = this.maxHearts;
    this.renderHearts();
    return true;
  }

  /* ================================================================== */
  /* Damage                                                              */
  /* ================================================================== */

  private damage(e: Enemy, n: number, kx = 0, kz = 0) {
    if (e.state === "dead") return;
    e.hp -= n;
    e.model.hit();
    e.hitFlash = 0.2;
    if (e.kind !== "gloomking") {
      e.pos.x += kx * 0.55;
      e.pos.z += kz * 0.55;
      if (e.state === "windup" || e.state === "charge") {
        e.state = "recover";
        e.t = 0.6;
      }
    }
    this.g.fx.sparkles(e.pos.add(new Vector3(0, e.model.height * 0.6, 0)), 5, ["#ffffff", "#e9d6ff"]);
    if (e === this.boss) this.renderBoss();
    if (e.hp <= 0) this.defeat(e);
  }

  private defeat(e: Enemy) {
    e.state = "dead";
    e.model.poof();
    audio.sfx("sparkle");
    audio.sfx("pop", { pitch: 0.8 });
    const at = e.pos.add(new Vector3(0, e.model.height * 0.5, 0));
    this.g.fx.sparkles(at, e.kind === "gloomking" ? 60 : 18, ["#fff3a6", "#d9c6f5"]);
    this.g.fx.puff(at, 8, "#cdb9f0");
    setTimeout(() => e.model.setEnabled(false), 500);
    if (e === this.boss) {
      const at2 = e.pos.clone();
      setTimeout(() => {
        if (!this.active) return;
        const m = buildHappyBlob(this.g.scene);
        m.root.position.copyFrom(at2);
        m.root.scaling.setAll(1.8);
        this.happy = { m, t: 0, pos: at2 };
        this.g.fx.hearts(at2.add(new Vector3(0, 1.5, 0)), 20);
      }, 450);
      this.bossEl.style.display = "none";
      this.invuln = 0;
      this.g.player.model.root.setEnabled(true);
      this.g.fx.confetti(at.add(new Vector3(0, 2, 0)), 60);
      this.onBossDefeated?.();
      this.boss = null;
      // every remaining Gloomie poofs too
      for (const o of this.enemies) if (o.state !== "dead") this.defeat(o);
    } else {
      // little rewards: sometimes a heart, sometimes a shiny
      if (Math.random() < 0.3 && this.hearts < this.maxHearts) {
        this.heal(1);
        this.g.ui.toast("+1 heart", "💗", "var(--pink)");
      } else if (Math.random() < 0.4) this.g.give(Math.random() < 0.5 ? "crystal" : "pebble", 1);
    }
    this.onEnemyDefeated?.(e.kind, e.pos);
  }

  hurtPlayer(n: number, from: Vector3) {
    if (this.invuln > 0 || !this.active) return;
    const p = this.g.player;
    if (this.shield > 0) {
      this.setShield(false);
      this.invuln = 0.8;
      audio.sfx("bubble");
      this.g.fx.sparkles(p.pos.add(new Vector3(0, 1, 0)), 14, ["#bfe9d6", "#ffffff"]);
      this.g.ui.toast("Shellby's shield blocked it!", "🛡️", "var(--mint)");
      return;
    }
    this.hearts = Math.max(0, this.hearts - n);
    this.invuln = 1.3;
    audio.sfx("miss");
    audio.sfx("fail", { volume: 0.5 });
    // knockback away from the hit
    const dx = p.pos.x - from.x,
      dz = p.pos.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const L = this.L!;
    const r = L.collision.move(p.pos.x, p.pos.z, (dx / d) * 1.6, (dz / d) * 1.6, p.radius);
    p.pos.x = r.x;
    p.pos.z = r.z;
    p.jump();
    this.g.fx.puff(p.pos.add(new Vector3(0, 0.8, 0)), 8, "#cdb9f0");
    this.renderHearts(true);
    if (this.hearts <= 0) this.knockedOut();
  }

  private async knockedOut() {
    const g = this.g;
    g.mode = "busy";
    await g.ui.fade(true, 500);
    const p = this.checkpoint;
    g.player.place(p.x, p.y, p.z, Math.PI);
    g.followers.forEach((f, i) => f.place(p.add(new Vector3(-0.8 - i * 0.8, 0, -1)), 0));
    this.hearts = this.maxHearts;
    this.invuln = 2;
    this.onKnockedOut?.();
    // Gloomies go home and feel better too
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      e.pos.copyFrom(e.home);
      e.hp = e.maxHp;
      e.state = "idle";
    }
    if (this.boss) this.renderBoss();
    this.renderHearts();
    await g.ui.fade(false, 500);
    g.mode = "play";
    await g.ui.say([{ text: "Phew! You got a little tuckered out, so you rested by the campfire. Hearts refilled — let's try again! 💗" }]);
  }

  private setShield(on: boolean) {
    this.shield = on ? 1 : 0;
    if (on && !this.shieldMesh) {
      const b = new Batch(this.g.scene, "shield");
      b.add(ball(this.g.scene, 1.0, { color: "#bfe9f6" }, 16));
      this.shieldMesh = b.build({ outline: 0.02, emissive: "#6fa8b8", castShadow: false, alpha: 0.35 })!;
      this.shieldMesh.material!.alpha = 0.35;
    }
    this.shieldMesh?.setEnabled(on);
  }

  /* ================================================================== */
  /* Frame                                                               */
  /* ================================================================== */

  update(dt: number, playing: boolean) {
    if (!this.active || !this.L) return;
    const p = this.g.player;
    this.attackCd -= dt;
    this.invuln -= dt;
    if (this.slashT > 0 && this.slashMesh) {
      this.slashT -= dt;
      const k = 1 - this.slashT / 0.22;
      this.slashMesh.scaling.setAll(0.4 + k * 0.8);
      this.slashMesh.rotation.y += dt * 9;
      if (this.slashT <= 0) this.slashMesh.setEnabled(false);
    }
    // blink while invulnerable (always visible again once it wears off)
    p.model.root.setEnabled(!(this.invuln > 0 && this.invuln < 1.4 && Math.floor(this.invuln * 12) % 2 === 0));
    if (this.shieldMesh?.isEnabled()) {
      this.shieldMesh.position.set(p.pos.x, p.pos.y + 0.8, p.pos.z);
      this.shieldMesh.scaling.setAll(1 + Math.sin(performance.now() / 200) * 0.04);
    }
    if (playing && (input.pressed("x") || input.pressed("attack"))) this.swing();
    if (this.happy) {
      const hb = this.happy;
      hb.t += dt;
      if (hb.t % 1.4 < dt) hb.m.attack();
      hb.m.root.rotation.y = Math.atan2(p.pos.x - hb.pos.x, p.pos.z - hb.pos.z);
      hb.m.update(dt, { speed: 0 });
    }
    this.updateEnemies(dt, playing);
    this.updateGuardians(dt);
    this.updateShots(dt);
    this.updateWaves(dt);
  }

  private updateEnemies(dt: number, playing: boolean) {
    const p = this.g.player;
    const L = this.L!;
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const info = ENEMY_INFO[e.kind];
      const dx = p.pos.x - e.pos.x,
        dz = p.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      const homeD = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
      e.t -= dt;
      e.cd -= dt;
      let move = 0;
      let windup = false;
      const aggro = e.kind === "gloomking" ? 30 : 9;
      switch (e.state) {
        case "idle":
          if (playing && d < aggro) e.state = "chase";
          break;
        case "return":
          move = info.speed;
          e.rot = Math.atan2(e.home.x - e.pos.x, e.home.z - e.pos.z);
          if (homeD < 0.6) {
            e.state = "idle";
            e.hp = e.maxHp;
          }
          break;
        case "chase": {
          if (!playing) break;
          if (homeD > (e.kind === "gloomking" ? 14 : 16) || d > aggro * 1.8) {
            e.state = "return";
            break;
          }
          e.rot = Math.atan2(dx, dz);
          if (e.kind === "thornbug" && d < 7 && e.cd <= 0) {
            e.state = "windup";
            e.t = 0.7;
            e.charge.set(dx / (d || 1), 0, dz / (d || 1));
          } else if (e.kind === "puffspitter") {
            move = d > 6 ? info.speed : 0;
            if (e.cd <= 0 && d < 11) {
              e.cd = 2.2;
              e.model.attack();
              this.fire(e.pos.add(new Vector3(0, 0.8, 0)), new Vector3(dx / d, 0, dz / d).scale(5.5), false, 1);
            }
          } else if (e.kind === "gloomking") {
            move = d > 4 ? info.speed : 0;
            if (e.cd <= 0) {
              e.state = "windup";
              e.t = 1.0;
            }
          } else move = info.speed;
          break;
        }
        case "windup":
          windup = true;
          if (e.t <= 0) {
            e.model.attack();
            if (e.kind === "thornbug") {
              e.state = "charge";
              e.t = 0.55;
            } else if (e.kind === "gloomking") {
              this.slam(e);
              e.state = "recover";
              e.t = 1.0;
              e.cd = e.hp < e.maxHp / 2 ? 2.4 : 3.4;
            }
          }
          break;
        case "charge": {
          const r = L.collision.move(e.pos.x, e.pos.z, e.charge.x * 9 * dt, e.charge.z * 9 * dt, e.model.radius);
          e.pos.x = r.x;
          e.pos.z = r.z;
          if (e.t <= 0 || r.hit) {
            e.state = "recover";
            e.t = 0.8;
            e.cd = 1.6;
          }
          break;
        }
        case "recover":
          if (e.t <= 0) e.state = "chase";
          break;
      }
      if (move > 0) {
        const fx = Math.sin(e.rot) * move * dt,
          fz = Math.cos(e.rot) * move * dt;
        const r = L.collision.move(e.pos.x, e.pos.z, fx, fz, e.model.radius);
        e.pos.x = r.x;
        e.pos.z = r.z;
      }
      // touching hurts (unless you're up in a jump over a small one)
      const reach = e.model.radius + p.radius * 0.9;
      if (playing && d < reach && !(p.jumpY > 0.9 && e.kind !== "gloomking")) this.hurtPlayer(info.damage, e.pos);
      e.pos.y = L.ground(e.pos.x, e.pos.z);
      e.model.root.position.copyFrom(e.pos);
      e.model.root.rotation.y = e.rot;
      e.model.update(dt, { speed: Math.min(1, move / Math.max(0.1, info.speed)) || (e.state === "charge" ? 1 : 0), windup });
    }
  }

  /** Gloom King ground-pound: an expanding shockwave ring. Jump over it! */
  private slam(e: Enemy) {
    audio.sfx("miss", { pitch: 0.5, volume: 1 });
    this.g.fx.puff(e.pos.add(new Vector3(0, 0.3, 0)), 20, "#9b86c4");
    const m = this.waveTpl!.clone("wave");
    m.setEnabled(true);
    m.position.copyFrom(e.pos);
    m.position.y += 0.15;
    this.waves.push({ mesh: m, center: e.pos.clone(), r: 1.5, hitDone: false });
    // below half health the King also calls a couple of blobs
    if (e.hp < e.maxHp / 2 && this.enemies.filter((x) => x.state !== "dead" && x.kind === "gloomblob" && x.arena === 3).length < 3) {
      for (const s of [-1, 1]) this.spawn("gloomblob", e.pos.add(new Vector3(s * 3, 0, -2)), 3).state = "chase";
    }
  }

  private updateWaves(dt: number) {
    const p = this.g.player;
    for (const w of this.waves) {
      w.r += dt * 7.5;
      w.mesh.scaling.set(w.r, 1, w.r);
      const d = Math.hypot(p.pos.x - w.center.x, p.pos.z - w.center.z);
      if (!w.hitDone && Math.abs(d - w.r) < 0.7) {
        if (p.jumpY < 0.35) {
          w.hitDone = true;
          this.hurtPlayer(1, w.center);
        }
      }
    }
    this.waves = this.waves.filter((w) => {
      if (w.r > 16) {
        w.mesh.dispose();
        return false;
      }
      return true;
    });
  }

  /* ================================================================== */
  /* Guardians                                                           */
  /* ================================================================== */

  private nearestEnemy(from: Vector3, range: number) {
    let best: Enemy | null = null,
      bd = range;
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private updateGuardians(dt: number) {
    for (const f of this.g.followers) {
      if (f === this.g.riding?.f) continue;
      const sp = f.owned.species;
      if (SPECIES[sp].role !== "guardian") continue;
      const best = (f.owned.friendship ?? 1) >= 5;
      const cd = (this.guardCd.get(f.owned.uid) ?? 0) - dt;
      this.guardCd.set(f.owned.uid, cd);
      const pn = this.pounce.get(f.owned.uid);
      if (pn) this.animatePounce(f, pn, dt);
      if (cd > 0) continue;
      if (sp === "shellby") {
        if (!this.shield) {
          this.setShield(true);
          f.model.attack?.();
          audio.sfx("bubble");
          this.guardCd.set(f.owned.uid, best ? 6 : 9);
        }
        continue;
      }
      const target = this.nearestEnemy(f.pos, sp === "emberling" ? 10 : 7);
      if (!target) continue;
      f.rot = Math.atan2(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
      f.model.root.rotation.y = f.rot;
      f.model.attack?.();
      if (sp === "emberling") {
        const from = f.pos.add(new Vector3(0, 0.6, 0));
        const dir = target.pos.add(new Vector3(0, 0.5, 0)).subtract(from).normalize();
        this.fire(from, dir.scale(11), true, best ? 2 : 1);
        audio.sfx("pop", { pitch: 1.6, volume: 0.6 });
        this.guardCd.set(f.owned.uid, best ? 0.8 : 1.1);
      } else if (sp === "roarlet") {
        this.pounce.set(f.owned.uid, { t: 0, from: f.pos.clone(), to: target.pos.clone() });
        audio.voice("roarlet", "happy");
        this.guardCd.set(f.owned.uid, best ? 1.0 : 1.4);
      } else {
        this.guardCd.set(f.owned.uid, 2);
      }
    }
  }

  private animatePounce(f: Follower, pn: { t: number; from: Vector3; to: Vector3 }, dt: number) {
    pn.t += dt / 0.35;
    const k = Math.min(1, pn.t);
    f.pos.x = pn.from.x + (pn.to.x - pn.from.x) * k;
    f.pos.z = pn.from.z + (pn.to.z - pn.from.z) * k;
    f.model.root.position.set(f.pos.x, f.pos.y + Math.sin(k * Math.PI) * 1.1, f.pos.z);
    if (pn.t >= 1) {
      this.pounce.delete(f.owned.uid);
      const target = this.nearestEnemy(pn.to, 1.8);
      if (target) {
        this.damage(target, (f.owned.friendship ?? 1) >= 5 ? 3 : 2, Math.sin(f.rot), Math.cos(f.rot));
        this.g.fx.puff(target.pos.add(new Vector3(0, 0.4, 0)), 6, "#ffe6a8");
      }
    }
  }

  /* ================================================================== */
  /* Projectiles                                                         */
  /* ================================================================== */

  private ensureTemplates() {
    if (this.shotTpl) return;
    const scene = this.g.scene;
    const mk = (c: string, glow: string) => {
      const b = new Batch(scene, "shot");
      b.add(ball(scene, 0.22, { color: c }, 10));
      const m = b.build({ outline: 0.02, emissive: glow, castShadow: false })!;
      m.setEnabled(false);
      return m;
    };
    this.shotTpl = { good: mk("#ffd38a", "#ffb35a"), bad: mk("#7a5aa8", "#5a3a88") };
    const wb = new Batch(scene, "waveTpl");
    wb.add(torus(scene, 1, 0.12, { color: "#b9a0e6" }, 48));
    this.waveTpl = wb.build({ outline: 0.02, emissive: "#6a4a9a", castShadow: false })!;
    this.waveTpl.setEnabled(false);
    void TransformNode;
  }

  private fire(from: Vector3, vel: Vector3, friendly: boolean, dmg: number) {
    const tpl = friendly ? this.shotTpl!.good : this.shotTpl!.bad;
    const m = tpl.clone("shot");
    m.setEnabled(true);
    m.position.copyFrom(from);
    this.shots.push({ mesh: m, pos: from.clone(), vel, life: 1.6, friendly, dmg });
  }

  private updateShots(dt: number) {
    const p = this.g.player;
    for (const s of this.shots) {
      s.life -= dt;
      s.pos.addInPlace(s.vel.scale(dt));
      s.mesh.position.copyFrom(s.pos);
      s.mesh.rotation.y += dt * 8;
      if (s.friendly) {
        for (const e of this.enemies) {
          if (e.state === "dead") continue;
          if (Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) < e.model.radius + 0.35) {
            this.damage(e, s.dmg, s.vel.x / 11, s.vel.z / 11);
            this.g.fx.sparkles(s.pos, 6, ["#ffd38a", "#fff3a6"]);
            s.life = 0;
            break;
          }
        }
      } else if (Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z) < 0.6 && Math.abs(p.pos.y + 0.7 - s.pos.y) < 1) {
        this.hurtPlayer(s.dmg, s.pos);
        s.life = 0;
      }
    }
    this.shots = this.shots.filter((s) => {
      if (s.life <= 0) {
        s.mesh.dispose();
        return false;
      }
      return true;
    });
  }

  /* ================================================================== */
  /* HUD                                                                 */
  /* ================================================================== */

  private renderHearts(bump = false) {
    let html = "";
    for (let i = 0; i < this.maxHearts; i++) html += `<span class="${i < this.hearts ? "full" : "empty"}">${i < this.hearts ? "💗" : "🤍"}</span>`;
    this.heartsEl.innerHTML = html;
    if (bump) {
      this.heartsEl.classList.remove("bump");
      void this.heartsEl.offsetWidth;
      this.heartsEl.classList.add("bump");
    }
  }

  private renderBoss() {
    if (!this.boss) return;
    (this.bossEl.querySelector(".boss-fill") as HTMLElement).style.width = Math.max(0, (this.boss.hp / this.boss.maxHp) * 100) + "%";
  }

  /** how many Gloomies are left in an arena */
  remaining(arena: number) {
    return this.enemies.filter((e) => e.arena === arena && e.state !== "dead").length;
  }
}
