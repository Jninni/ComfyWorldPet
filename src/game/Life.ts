import { Vector3, TransformNode, type Mesh, type InstancedMesh } from "@babylonjs/core";
import type { Game, Interact } from "./Game";
import { Batch, ball, blob, softBox, softCyl, cone, disc } from "../render/Shapes";
import { rng } from "../render/Palette";
import { CROPS, FOODS, BUFFS, ORDER_POOL, type CropId, type FoodId, type BuffId, type Garment } from "../data/crafting";
import { SPECIES, type SpeciesId } from "../data/species";
import { RESOURCES, type ResourceId } from "../data/items";
import { audio } from "../audio/Audio";
import { heightAt, LOC } from "../world/layout";
import { WildCritter } from "./Actors";
import { h } from "../ui/dom";
import type { PlayerLook } from "../entities/characterModels";

/**
 * "Cozy life" systems layered on top of the adventure:
 * gardening, cooking & food buffs, critter treats/friendship, café orders, sewing wardrobe,
 * and the pastry-thief crumb trail.
 */
export class Life {
  private bedInst: (InstancedMesh | null)[] = [];
  private bedStage: string[] = [];
  private cropTpl = new Map<string, Mesh>();
  private crumbs: { id: string; pos: Vector3; mesh: InstancedMesh }[] = [];
  private buffEl: HTMLElement;
  private buffTimer = 0;
  thief: WildCritter | null = null;

  constructor(private g: Game) {
    this.buffEl = h(".buff-bar");
    g.ui.hud.querySelector(".quest-tracker")?.after(this.buffEl);
    if (!this.buffEl.isConnected) g.ui.root.append(this.buffEl);
  }

  /* ================================================================== */
  /* Buffs                                                               */
  /* ================================================================== */

  buffActive(id: BuffId) {
    const v = this.g.state.buffs[id] ?? 0;
    return id === "cozy" ? v > 0 : v > Date.now();
  }

  addBuff(id: BuffId, amount: number) {
    const b = this.g.state.buffs;
    if (id === "cozy") b.cozy = (b.cozy ?? 0) + amount;
    else b[id] = Math.max(Date.now(), b[id] ?? 0) + amount * 1000;
    this.renderBuffs();
  }

  useCozy() {
    const b = this.g.state.buffs;
    if ((b.cozy ?? 0) > 0) b.cozy = (b.cozy ?? 0) - 1;
    this.renderBuffs();
  }

  private renderBuffs() {
    const parts: string[] = [];
    for (const id of Object.keys(BUFFS) as BuffId[]) {
      if (!this.buffActive(id)) continue;
      const v = this.g.state.buffs[id] ?? 0;
      const label = id === "cozy" ? `×${v}` : fmtTime((v - Date.now()) / 1000);
      parts.push(`<span class="buff" title="${BUFFS[id].name}">${BUFFS[id].icon} ${label}</span>`);
    }
    const html = parts.join("");
    if (this.buffEl.innerHTML !== html) this.buffEl.innerHTML = html;
    this.buffEl.style.display = parts.length ? "" : "none";
  }

  /* ================================================================== */
  /* Per-frame                                                           */
  /* ================================================================== */

  update(dt: number) {
    this.buffTimer -= dt;
    if (this.buffTimer <= 0) {
      this.buffTimer = 0.5;
      this.renderBuffs();
      this.updateBeds();
    }
    // crumb trail: walk over crumbs to follow it
    if (this.g.current.id === "overworld" && this.g.story.active("thief") && this.g.story.stage("thief") === 0) {
      const next = this.crumbs.find((c) => !this.g.state.taken.includes(c.id));
      if (next && Vector3.DistanceSquared(next.pos, this.g.player.pos) < 2.4 * 2.4) this.collectCrumb(next);
    }
    if (this.g.state.skills.cooking && Date.now() > this.g.state.ordersRefreshAt) this.refreshOrders();
  }

  /* ================================================================== */
  /* Friendship & food                                                   */
  /* ================================================================== */

  bestFriendship(s: SpeciesId) {
    return Math.max(0, ...this.g.state.critters.filter((c) => c.inParty && c.species === s).map((c) => c.friendship ?? 1));
  }

  async eat(id: FoodId, atCafe = false) {
    const f = FOODS[id];
    if (!this.g.count(id) || !f.buff) return;
    this.g.take(id, 1);
    const amount = (f.amount ?? 60) * (atCafe && f.buff !== "cozy" ? 1.5 : 1);
    this.addBuff(f.buff, f.buff === "cozy" ? (f.amount ?? 3) : amount);
    audio.sfx("success");
    this.g.fx.hearts(this.g.player.pos.add(new Vector3(0, 1.6, 0)), 8);
    this.g.player.celebrate = 1;
    this.g.ui.toast(`Yum! ${BUFFS[f.buff].name}${atCafe ? " (café bonus!)" : ""}`, BUFFS[f.buff].icon, "var(--butter)");
    if (this.g.combat?.active) this.g.combat.heal(2);
    this.g.save();
  }

  async share(id: FoodId) {
    const f = FOODS[id];
    const party = this.g.followers;
    if (!this.g.count(id)) return;
    if (!party.length) {
      await this.g.ui.say([{ text: "You need a critter friend in your party to share treats with!" }]);
      return;
    }
    this.g.take(id, 1);
    audio.jingle("newfriend");
    for (const fl of party) {
      fl.owned.friendship = Math.min(5, (fl.owned.friendship ?? 1) + 1);
      fl.model.emote("love");
      audio.voice(fl.owned.species, "happy");
      this.g.fx.hearts(fl.pos.add(new Vector3(0, fl.model.height, 0)), 8);
    }
    const names = party.map((p) => p.owned.name).join(" & ");
    if (id === "tart") {
      this.addBuff("helpful", f.amount ?? 180);
      this.g.ui.toast(`${names} feel extra helpful!`, "🐾", "var(--mint)");
    } else if (id === "muffin") {
      this.g.world.nodes.forEach((n) => {
        n.readyAt = 0;
        n.setReady(true);
      });
      this.g.ui.toast(`${names} sniffed out every gathering spot!`, "✨", "var(--mint)");
    } else if (id === "shortcake") {
      const pool: ResourceId[] = ["twig", "petal", "pebble", "berry", "crystal"];
      for (const fl of party) {
        const r = pool[Math.floor(Math.random() * pool.length)];
        const n = 2 + Math.floor(Math.random() * 2);
        this.g.give(r, n, true);
        this.g.ui.toast(`${fl.owned.name} brought you ${n} ${RESOURCES[r].name}!`, "🎁", "var(--pink)");
      }
    } else this.g.ui.toast(`${names} loved it!`, "💕", "var(--pink)");
    const maxed = party.filter((p) => p.owned.friendship >= 5);
    if (maxed.length) this.g.ui.toast(`${maxed[0].owned.name} is your best friend! Talent doubled ✨`, "💖", "var(--pink)");
    this.g.refreshParty();
    this.g.save();
  }

  /* ================================================================== */
  /* Gardening                                                           */
  /* ================================================================== */

  initGarden() {
    const scene = this.g.scene;
    const R = rng(55);
    // soil beds, fence and a little sign
    const b = new Batch(scene, "garden");
    for (const p of LOC.garden) {
      const y = heightAt(p.x, p.z);
      b.add(softBox(scene, 2.6, 0.32, 2.6, { pos: [p.x, y + 0.12, p.z], color: "woodLight", bottom: "woodDeep" }, 0.1));
      b.add(softBox(scene, 2.3, 0.1, 2.3, { pos: [p.x, y + 0.29, p.z], color: "#a97c5c", bottom: "#8f6548" }, 0.05));
      for (let i = 0; i < 6; i++) b.add(ball(scene, 0.05, { pos: [p.x + (R() - 0.5) * 2, y + 0.34, p.z + (R() - 0.5) * 2], color: "#8f6548" }, 4));
    }
    const c = LOC.garden.reduce((a, p) => ({ x: a.x + p.x / 4, z: a.z + p.z / 4 }), { x: 0, z: 0 });
    // watering can on a stump + sign
    const sx = c.x - 4.1,
      sz = c.z - 2.4;
    const sy = heightAt(sx, sz);
    b.add(softCyl(scene, 1.0, 0.06, 0.07, { pos: [sx, sy, sz], color: "woodDeep" }, 0.03, 8));
    b.add(softBox(scene, 1.0, 0.55, 0.1, { pos: [sx, sy + 1.1, sz], color: "woodLight", bottom: "wood" }, 0.08));
    b.add(blob(scene, 0.15, 0.2, 0.05, { pos: [sx - 0.18, sy + 1.12, sz - 0.07], color: "#ffa64d" }, 8));
    b.add(blob(scene, 0.12, 0.06, 0.05, { pos: [sx - 0.16, sy + 1.32, sz - 0.07], color: "leaf" }, 6));
    b.add(ball(scene, 0.13, { pos: [sx + 0.18, sy + 1.1, sz - 0.07], color: "red" }, 8));
    const cy = heightAt(c.x + 3.6, c.z - 2.6);
    b.add(softCyl(scene, 0.4, 0.3, 0.34, { pos: [c.x + 3.6, cy, c.z - 2.6], color: "woodDeep" }, 0.06, 12));
    b.add(softCyl(scene, 0.42, 0.24, 0.28, { pos: [c.x + 3.6, cy + 0.42, c.z - 2.6], color: "sky", bottom: "skyDeep" }, 0.08, 12));
    b.add(cone(scene, 0.5, 0.05, { pos: [c.x + 3.85, cy + 0.55, c.z - 2.6], rot: [0, 0, -1.0], color: "skyDeep" }, 6));
    b.add(softCyl(scene, 0.22, 0.03, 0.03, { pos: [c.x + 3.6, cy + 0.9, c.z - 2.6], rot: [0, 0, Math.PI / 2], color: "skyDeep" }, 0.01, 6));
    const m = b.build({ outline: 0.035 })!;
    m.parent = this.g.world.root;
    this.g.world.collision.add({ kind: "circle", x: sx, z: sz, r: 0.3 });

    this.buildCropTemplates();
    LOC.garden.forEach((p, i) => {
      this.bedInst[i] = null;
      this.bedStage[i] = "";
      this.g.world.collision.add({ kind: "box", minX: p.x - 1.3, maxX: p.x + 1.3, minZ: p.z - 1.3, maxZ: p.z + 1.3 });
      const it: Interact = {
        id: "bed_" + i,
        pos: new Vector3(p.x, heightAt(p.x, p.z), p.z - 1.4),
        r: 1.9,
        h: 1.2,
        label: () => this.bedLabel(i),
        run: () => this.useBed(i),
      };
      this.g.world.interacts.push(it);
    });
    this.updateBeds();
  }

  private progress(i: number) {
    const bed = this.g.state.garden[i];
    if (!bed?.crop) return 0;
    return Math.min(1, (Date.now() - bed.plantedAt) / (CROPS[bed.crop].growSec * 1000));
  }

  private bedLabel(i: number) {
    const bed = this.g.state.garden[i];
    if (!this.g.state.skills.gardening) return "Garden bed";
    if (!bed.crop) return "Plant";
    const p = this.progress(i);
    if (p >= 1) return `Harvest ${CROPS[bed.crop].icon}`;
    if (!bed.watered) return "Water 💧";
    return `Growing… ${fmtTime(((1 - p) * CROPS[bed.crop].growSec * 1000) / 1000)}`;
  }

  private async useBed(i: number) {
    const g = this.g;
    const bed = g.state.garden[i];
    const p = LOC.garden[i];
    const at = new Vector3(p.x, heightAt(p.x, p.z) + 0.6, p.z);
    g.player.face(at);
    if (!g.state.skills.gardening) {
      await g.ui.say([{ text: "A soft, empty garden bed next to your cottage. Mocha the baker knows all about growing tasty things — maybe she can teach you!" }]);
      return;
    }
    if (!bed.crop) {
      const unlocked = (Object.keys(CROPS) as CropId[]).filter((c) => c === "wheat" || c === "carrot" || g.story.done("bakery"));
      const choices = unlocked.map((c) => `${CROPS[c].icon} ${CROPS[c].name}`);
      choices.push("Not now");
      const pick = await g.ui.say([{ text: "What would you like to plant?", choices }]);
      if (pick < 0 || pick >= unlocked.length) return;
      bed.crop = unlocked[pick];
      bed.plantedAt = Date.now();
      bed.watered = false;
      if (g.partyHas("shroomy")) {
        // Shroomy waters the seeds right away and gives them a head start
        const total = CROPS[bed.crop].growSec * 1000;
        bed.plantedAt -= total * (g.bestFriendship("shroomy") >= 5 ? 0.65 : 0.55);
        bed.watered = true;
        g.ui.toast("Shroomy watered your seeds! 💧", "🍄", "var(--mint)");
      }
      audio.sfx("pop");
      g.fx.puff(at, 10, "#c9a07a");
      g.story.onGarden("plant", bed.crop);
      this.updateBeds();
      g.save();
      return;
    }
    const prog = this.progress(i);
    if (prog >= 1) {
      const c = CROPS[bed.crop];
      let n = c.yield[0] + Math.floor(Math.random() * (c.yield[1] - c.yield[0] + 1));
      if (g.partyHas("redpanda")) n++;
      const crop = bed.crop;
      bed.crop = null;
      bed.watered = false;
      g.fx.sparkles(at, 16);
      audio.sfx("pickup");
      g.player.celebrate = 0.8;
      g.give(crop, n);
      g.story.onGarden("harvest", crop);
      this.updateBeds();
      g.save();
      return;
    }
    if (!bed.watered) {
      // watering halves the time left
      const total = CROPS[bed.crop].growSec * 1000;
      const left = total * (1 - prog);
      bed.plantedAt -= left / 2;
      bed.watered = true;
      audio.sfx("splash");
      g.fx.puff(at, 12, "#bfe7f8");
      g.ui.toast("Watered! It'll grow twice as fast.", "💧", "var(--sky)");
      this.updateBeds();
      g.save();
      return;
    }
    await g.ui.say([{ text: `The ${CROPS[bed.crop].name.toLowerCase()} are growing nicely! Ready in about ${fmtTime(((1 - prog) * CROPS[bed.crop].growSec * 1000) / 1000)}. You can explore while you wait.` }]);
  }

  private updateBeds() {
    if (!this.g.world || !this.bedInst.length) return;
    LOC.garden.forEach((p, i) => {
      const bed = this.g.state.garden[i];
      let key = "";
      if (bed?.crop) {
        const pr = this.progress(i);
        key = bed.crop + (pr >= 1 ? "_2" : pr >= 0.35 ? "_1" : "_0");
      }
      if (key === this.bedStage[i]) return;
      this.bedStage[i] = key;
      this.bedInst[i]?.dispose();
      this.bedInst[i] = null;
      if (!key) return;
      const tpl = this.cropTpl.get(key);
      if (!tpl) return;
      const inst = tpl.createInstance("crop" + i);
      inst.position.set(p.x, heightAt(p.x, p.z) + 0.32, p.z);
      inst.parent = this.g.world.root;
      this.bedInst[i] = inst;
      if (key.endsWith("_2")) this.g.fx.sparkles(inst.position.add(new Vector3(0, 0.6, 0)), 8);
    });
  }

  private buildCropTemplates() {
    const scene = this.g.scene;
    const spots: [number, number][] = [
      [-0.55, -0.55],
      [0.55, -0.55],
      [-0.55, 0.55],
      [0.55, 0.55],
    ];
    for (const crop of Object.keys(CROPS) as CropId[]) {
      const c = CROPS[crop];
      for (let stage = 0; stage < 3; stage++) {
        const b = new Batch(scene, `crop_${crop}_${stage}`);
        const R = rng(crop.length * 10 + stage);
        for (const [x, z] of spots) {
          const s = stage === 0 ? 0.45 : stage === 1 ? 0.8 : 1;
          if (crop === "wheat") {
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * Math.PI * 2;
              const px = x + Math.cos(a) * 0.14,
                pz = z + Math.sin(a) * 0.14;
              const hgt = (0.35 + R() * 0.15) * s * 1.6;
              b.add(softCyl(scene, hgt, 0.018, 0.025, { pos: [px, 0, pz], rot: [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], color: stage === 2 ? "#e9c46a" : c.leaf }, 0.01, 5));
              if (stage === 2) b.add(blob(scene, 0.045, 0.13, 0.045, { pos: [px, hgt + 0.08, pz], color: c.fruit }, 6));
            }
          } else {
            const leaves = stage === 0 ? 3 : 6;
            for (let k = 0; k < leaves; k++) {
              const a = (k / leaves) * Math.PI * 2 + R();
              const len = (crop === "carrot" ? 0.22 : 0.18) * s + 0.05;
              b.add(blob(scene, len, 0.03, len * 0.55, { pos: [x + Math.cos(a) * len * 0.6, 0.12 * s + (crop === "carrot" ? 0.12 * s : 0), z + Math.sin(a) * len * 0.6], rot: [0, -a, crop === "carrot" ? 0.9 : 0.35], color: k % 2 ? c.leaf : "leafLight" }, 6));
            }
            if (stage === 1 && crop === "strawberry") b.add(ball(scene, 0.05, { pos: [x, 0.22, z], color: "white" }, 6));
            if (stage === 2) {
              if (crop === "carrot") b.add(cone(scene, 0.14, 0.09, { pos: [x, 0.0, z], rot: [Math.PI, 0, 0], color: c.fruit }, 8));
              if (crop === "carrot") b.add(disc(scene, 0.09, 0.05, { pos: [x, 0.0, z], color: c.fruit }, 10));
              if (crop === "strawberry")
                for (let k = 0; k < 3; k++) {
                  const a = (k / 3) * Math.PI * 2;
                  b.add(cone(scene, 0.13, 0.07, { pos: [x + Math.cos(a) * 0.15, 0.2, z + Math.sin(a) * 0.15], rot: [Math.PI, 0, 0], color: c.fruit }, 8));
                }
              if (crop === "pumpkin") {
                b.add(ball(scene, 0.26, { pos: [x, 0.2, z], scale: [1.1, 0.8, 1.1], color: c.fruit, bottom: "#f08a3a" }, 10));
                b.add(softCyl(scene, 0.12, 0.03, 0.04, { pos: [x, 0.38, z], color: "#6f9a4a" }, 0.01, 6));
              }
            }
          }
        }
        const m = b.build({ outline: 0.02 });
        if (!m) continue;
        m.isVisible = false;
        m.position.y = -60;
        this.cropTpl.set(`${crop}_${stage}`, m);
      }
    }
  }

  /* ================================================================== */
  /* Café orders                                                         */
  /* ================================================================== */

  refreshOrders() {
    const s = this.g.state;
    const pool = ORDER_POOL.slice().sort(() => Math.random() - 0.5);
    while (s.orders.length < 3) {
      const next = pool.find((o) => !s.orders.some((x) => x.who === o.who));
      if (!next) break;
      s.orders.push({ ...next });
    }
    s.ordersRefreshAt = Date.now() + 8 * 60 * 1000;
  }

  /** Called after delivering: replace the order with a new one later. */
  completeOrder(i: number) {
    const s = this.g.state;
    const o = s.orders[i];
    if (!o || !this.g.count(o.food)) return false;
    this.g.take(o.food, 1);
    for (const [r, n] of Object.entries(o.reward) as [ResourceId, number][]) this.g.give(r, n, true);
    s.orders.splice(i, 1);
    const pool = ORDER_POOL.filter((x) => !s.orders.some((y) => y.who === x.who) && x.who !== o.who);
    if (pool.length) s.orders.push({ ...pool[Math.floor(Math.random() * pool.length)] });
    audio.jingle("questdone");
    this.g.fx.confetti(this.g.player.pos.add(new Vector3(0, 2, 0)), 24);
    this.g.save();
    return true;
  }

  /* ================================================================== */
  /* Sewing wardrobe                                                     */
  /* ================================================================== */

  ensureStarterWardrobe() {
    const s = this.g.state;
    if (!s.wardrobe.length) {
      s.wardrobe.push({ uid: s.nextGarmentUid++, kind: "overalls", color: s.look.outfit, accent: (s.look as PlayerLook).outfit2 ?? "#fff6e6" });
    }
  }

  wear(gm: Garment | null, slot: "outfit" | "accessory") {
    const look = this.g.state.look as PlayerLook;
    if (slot === "accessory") {
      look.accessory = gm ? (gm.kind as PlayerLook["accessory"]) : "none";
      if (gm) look.accessoryColor = gm.color;
    } else if (gm) {
      look.style = gm.kind as PlayerLook["style"];
      look.outfit = gm.color;
      look.outfit2 = gm.accent;
    }
    this.g.player.model.setLook?.(look);
    this.g.save();
  }

  /* ================================================================== */
  /* Pastry thief: crumb trail → red panda nest                         */
  /* ================================================================== */

  initCrumbs() {
    const scene = this.g.scene;
    const b = new Batch(scene, "crumbTpl");
    const R = rng(9);
    for (let i = 0; i < 7; i++) b.add(blob(scene, 0.08 + R() * 0.05, 0.05, 0.07, { pos: [(R() - 0.5) * 0.7, 0.04, (R() - 0.5) * 0.7], rot: [0, R() * 3, 0], color: i % 2 ? "#e7b878" : "#f2d39c" }, 6));
    b.add(blob(scene, 0.16, 0.08, 0.12, { pos: [0.1, 0.06, 0], color: "#eec58a" }, 8));
    b.add(blob(scene, 0.05, 0.2, 0.05, { pos: [0, 0.75, 0], color: "#fff6c0" }, 6));
    b.add(blob(scene, 0.2, 0.05, 0.05, { pos: [0, 0.75, 0], color: "#fff6c0" }, 6));
    const tpl = b.build({ outline: 0.015, castShadow: false })!;
    tpl.isVisible = false;
    tpl.position.y = -60;
    LOC.crumbs.forEach(([x, z], i) => {
      const m = tpl.createInstance("crumb" + i);
      m.position.set(x, heightAt(x, z) + 0.02, z);
      m.parent = this.g.world.root;
      this.crumbs.push({ id: "crumb_" + i, pos: new Vector3(x, heightAt(x, z), z), mesh: m });
    });
    this.refreshCrumbs();
  }

  refreshCrumbs() {
    const on = this.g.story.active("thief") && this.g.story.stage("thief") === 0;
    for (const c of this.crumbs) c.mesh.setEnabled(on && !this.g.state.taken.includes(c.id));
    // the thief appears at its nest once you've followed the trail
    const show = this.g.story.active("thief") && this.g.story.stage("thief") === 1;
    if (show && !this.thief) {
      const [x, z] = LOC.thiefNest;
      this.thief = new WildCritter(this.g.scene, "thief", "redpanda", 0, new Vector3(x, heightAt(x, z), z), 1.5);
      this.thief.state = "idle";
      this.g.world.wild.push(this.thief);
      this.thief.model.root.setEnabled(this.g.current.id === "overworld");
    } else if (!show && this.thief) {
      const i = this.g.world.wild.indexOf(this.thief);
      if (i >= 0) this.g.world.wild.splice(i, 1);
      this.thief.model.dispose();
      this.thief = null;
    }
  }

  /** the next crumb the guide arrow should point at */
  nextCrumb(): Vector3 | null {
    const c = this.crumbs.find((x) => !this.g.state.taken.includes(x.id));
    return c ? c.pos : null;
  }

  private collectCrumb(c: { id: string; pos: Vector3; mesh: InstancedMesh }) {
    const g = this.g;
    g.state.taken.push(c.id);
    c.mesh.setEnabled(false);
    g.fx.sparkles(c.pos.add(new Vector3(0, 0.4, 0)), 10, ["#f2d39c", "#ffffff"]);
    audio.sfx("sparkle");
    const left = this.crumbs.filter((x) => !g.state.taken.includes(x.id)).length;
    const q = g.state.quests.thief;
    if (q) q.progress = this.crumbs.length - left;
    if (left > 0) {
      const lines = ["Crumbs! They lead west…", "More crumbs… somebody had a big snack!", "The crumbs go toward the woods!", "Almost there… sniff sniff!"];
      g.ui.toast(lines[Math.min(lines.length - 1, Math.floor(((this.crumbs.length - left) / this.crumbs.length) * lines.length))], "🥐", "var(--butter)");
      g.refreshQuestUI(true);
    } else {
      g.ui.toast("A little nest… and a fluffy stripy tail!", "🐾", "var(--pink)");
      g.story.advance("thief");
      this.refreshCrumbs();
    }
  }
}

export function fmtTime(sec: number) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60),
    s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

void TransformNode;
void SPECIES;
