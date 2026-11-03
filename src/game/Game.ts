import { ArcRotateCamera, Vector3, Matrix, TransformNode, SceneInstrumentation, type Mesh } from "@babylonjs/core";
import { Stage, OUTDOOR_LIGHT, type StageLighting } from "../render/Stage";
import { FX } from "../render/FX";
import { UI } from "../ui/UI";
import { input } from "../core/Input";
import { audio, type MusicId } from "../audio/Audio";
import { CollisionWorld } from "../core/Collision";
import type { CameraFrame, InteriorDef } from "../core/types";
import { newState, loadState, saveState, PARTY_MAX, type GameState, type OwnedCritter } from "../core/State";
import { SPECIES, ZONE_INFO, type SpeciesId, type ZoneId } from "../data/species";
import { RESOURCES, KEY_ITEMS, BUILDABLES, type ResourceId, type BuildableId } from "../data/items";
import { PlayerCtl, Follower, WildCritter, Npc, type GroundFn } from "./Actors";
import { Story, QUESTS } from "./Story";
import { Life } from "./Life";
import { Combat } from "./Combat";
import { buildThornwild, buildThornGate, type ThornwildDef } from "../world/thornwild";

/** Rider-class critters: how they ride. */
const MOUNTS: Record<string, { scale: number; speed: number; jump: number; double?: boolean; hint: string }> = {
  ribbit: { scale: 2.4, speed: 8.5, jump: 1.9, hint: "Giant froggy hops!" },
  pony: { scale: 1, speed: 11, jump: 1.15, hint: "Gallop!" },
  unicorn: { scale: 1, speed: 11.5, jump: 1.3, double: true, hint: "Double jump & rainbow sparkles!" },
};
import { openCookMenu, openSewingMenu, openOrdersMenu, chooseSnack } from "../ui/Crafting";
import { Overworld, type ResourceNode, type Pickup, type NodeKind } from "./World";
import { INGREDIENTS, FOODS, DYES, type IngredientId, type FoodId, type DyeId, type BuffId } from "../data/crafting";
import { buildInterior, BUILDING_INFO, type BuildingId } from "../world/buildings";
import { buildCave } from "../world/cave";
import { buildBuildable, buildPlotMarker, type BuiltThing } from "./Village";
import { playMinigame } from "../minigames";
import type { NpcId, PlayerLook } from "../entities/characterModels";
import { NPC_INFO } from "../entities/characterModels";
import { zoneAt, LOC, heightAt } from "../world/layout";
import { openPauseMenu, openBuildMenu, showTitle, showCreator } from "../ui/Menus";
import { h, portrait } from "../ui/dom";
import { Batch, ball } from "../render/Shapes";

export interface Interact {
  id: string;
  pos: Vector3;
  r: number;
  label: string | (() => string);
  enabled?: () => boolean;
  run: () => Promise<void> | void;
  /** world height for the prompt bubble */
  h?: number;
}

export interface Location {
  id: string;
  root: TransformNode;
  collision: CollisionWorld;
  ground: GroundFn;
  interacts: Interact[];
  frame: CameraFrame | null;
  lighting: StageLighting;
  music: MusicId;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  def?: InteriorDef;
  update?: (dt: number, t: number) => void;
  wild: WildCritter[];
}

const CAM_BETA = 0.86;
const CAM_RADIUS = 25;

export class Game {
  stage: Stage;
  cam: ArcRotateCamera;
  ui: UI;
  fx: FX;
  state: GameState = newState();
  story: Story;
  life!: Life;
  combat!: Combat;
  private thornGate: ReturnType<typeof buildThornGate> | null = null;
  private bubbles: { w: WildCritter; mesh: Mesh; hp: number }[] = [];
  private bossStarted = false;
  world!: Overworld;
  locations = new Map<string, Location>();
  current!: Location;
  player!: PlayerCtl;
  followers: Follower[] = [];
  npcs = new Map<NpcId, Npc>();
  mode: "title" | "play" | "busy" = "title";
  time = 0;
  zone: ZoneId | "interior" = "village";
  private camTarget = new Vector3();
  private camRadius = CAM_RADIUS;
  private camAlpha = -Math.PI / 2;
  private camBeta = CAM_BETA;
  private focusOverride: Vector3 | null = null;
  private zoomMul = 1;
  /** player-controlled camera rotation (radians) around the target */
  private camYaw = 0;
  private plotMeshes: (Mesh | null)[] = [];
  private builtThings: (BuiltThing | null)[] = [];
  private markerLabels = new Map<NpcId, () => void>();
  private nearest: Interact | null = null;
  private haven: WildCritter[] = [];
  private saveTimer = 0;
  private enteredAt = 0;
  /** the party critter you're riding */
  riding: { f: Follower; scale: number; seat: number } | null = null;
  private trailT = 0;
  /** tests: skip minigames with an automatic win */
  debugAutoWin = false;
  private guide = h(".guide-arrow", null, h(".ga-in", null, "➜"));
  private hintEl: HTMLElement | null = null;
  private hintMoved = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new Stage(canvas);
    const scene = this.stage.scene;
    this.cam = new ArcRotateCamera("cam", this.camAlpha, this.camBeta, this.camRadius, new Vector3(0, 1, 0), scene);
    this.cam.fov = 0.62;
    this.cam.minZ = 0.5;
    this.cam.maxZ = 700;
    this.cam.inputs.clear();
    this.stage.setupPipeline([this.cam]);
    this.ui = new UI();
    this.fx = new FX(scene);
    this.story = new Story(this);
    this.ui.onMenu = () => this.openMenu();
    input.onConnect((id, on) => {
      const name = /xbox|xinput/i.test(id) ? "Xbox controller" : /playstation|dualsense|dualshock|054c/i.test(id) ? "PlayStation controller" : "Controller";
      this.ui.toast(on ? `${name} connected!` : `${name} disconnected`, "🎮", on ? "var(--mint)" : "var(--pink)");
    });
    this.ui.root.append(this.guide);
    // wheel / pinch zoom
    canvas.addEventListener(
      "wheel",
      (e) => {
        this.zoomMul = Math.max(0.65, Math.min(1.35, this.zoomMul * (1 + Math.sign(e.deltaY) * 0.08)));
      },
      { passive: true },
    );
    this.setupPinch(canvas);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.mode !== "title") this.save();
    });
  }

  private setupPinch(canvas: HTMLCanvasElement) {
    const pts = new Map<number, { x: number; y: number }>();
    let d0 = 0,
      z0 = 1;
    canvas.addEventListener("pointerdown", (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        d0 = Math.hypot(a.x - b.x, a.y - b.y);
        z0 = this.zoomMul;
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId)!;
      if (pts.size === 1 && this.mode === "play") this.camYaw += (e.clientX - prev.x) * 0.006;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && d0 > 0) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomMul = Math.max(0.65, Math.min(1.35, (z0 * d0) / d));
      }
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      d0 = 0;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  get scene() {
    return this.stage.scene;
  }

  /* ================================================================== */
  /* Boot                                                                */
  /* ================================================================== */

  async init(progress: (p: number, msg: string) => void) {
    const scene = this.scene;
    progress(0.1, "Planting flowers…");
    await tick();
    this.world = new Overworld(this);
    await this.world.build(progress);
    const ow: Location = {
      id: "overworld",
      root: this.world.root,
      collision: this.world.collision,
      ground: (x, z) => heightAt(x, z),
      interacts: this.world.interacts,
      frame: null,
      lighting: OUTDOOR_LIGHT,
      music: "village",
      wild: this.world.wild,
      update: (dt, t) => this.world.update(dt, t),
    };
    this.locations.set("overworld", ow);
    progress(0.85, "Waking up the villagers…");
    await tick();

    // NPCs
    for (const id of Object.keys(NPC_INFO) as NpcId[]) {
      const n = new Npc(scene, id);
      this.npcs.set(id, n);
    }
    this.player = new PlayerCtl(scene, this.state.look as PlayerLook);
    this.player.onJump = (second) => {
      if (second) this.fx.sparkles(this.player.pos.add(new Vector3(0, 0.4, 0)), 10, ["#bfe0f6", "#ffffff"]);
      else this.fx.puff(this.player.pos.add(new Vector3(0, 0.1, 0)), 4, "#f6f0e2");
      if (!second) this.followers.forEach((f, i) => f !== this.riding?.f && (f.hopT = -0.12 - i * 0.12));
    };
    this.player.onLand = (p, hard) => {
      if (this.zone !== "interior") this.fx.puff(p.add(new Vector3(0, 0.08, 0)), hard ? 8 : 5, "#f6f0e2");
    };
    this.player.onStep = (p) => {
      if (this.zone !== "interior" && Math.random() < 0.5) this.fx.puff(p.add(new Vector3(0, 0.1, 0)), 2, "#f6f0e2");
    };
    this.current = ow;
    this.placeNpcs();
    this.buildPlots();
    this.life = new Life(this);
    this.life.initGarden();
    this.life.initCrumbs();
    this.combat = new Combat(this);
    this.combat.onBossDefeated = () => this.onBossDefeated();
    // tuckered out mid-boss-fight: reopen the arena so you can walk back in and try again
    this.combat.onKnockedOut = () => this.setBossGate(false);
    this.initThornGate();
    progress(1, "Ready!");
    this.stage.engine.runRenderLoop(() => this.frame());
    (window as unknown as { __game: Game }).__game = this;
  }

  /* ================================================================== */
  /* Title / new game                                                    */
  /* ================================================================== */

  async title() {
    this.mode = "title";
    this.ui.setHudVisible(false);
    this.ui.setTouchVisible(false);
    // pretty orbiting view of the village
    this.player.place(LOC.spawnStart.x, heightAt(LOC.spawnStart.x, LOC.spawnStart.z), LOC.spawnStart.z, Math.PI);
    this.player.model.root.setEnabled(false);
    this.focusOverride = new Vector3(0, 2, 6);
    const choice = await showTitle(this);
    audio.unlock();
    if (choice === "continue") {
      const s = loadState();
      if (s) this.state = s;
      this.player.model.setLook?.(this.state.look as PlayerLook);
    } else {
      this.state = newState();
      this.focusOverride = null;
      this.player.model.root.setEnabled(true);
      this.player.place(LOC.spawnStart.x, heightAt(LOC.spawnStart.x, LOC.spawnStart.z), LOC.spawnStart.z, Math.PI);
      this.camTarget.copyFrom(this.player.pos);
      const res = await showCreator(this);
      this.state.look = res.look;
      this.state.playerName = res.name;
      this.state.location = { where: "home", x: 0, z: 0, rot: 0 };
    }
    this.focusOverride = null;
    this.player.model.root.setEnabled(true);
    await this.startPlay();
  }

  private async startPlay() {
    await this.ui.fade(true);
    this.syncWorldToState();
    const L = this.state.location;
    await this.goTo(L.where, L.where === "overworld" ? { x: L.x, z: L.z, rot: L.rot } : undefined, false);
    this.ui.setHudVisible(true);
    this.ui.setTouchVisible(true);
    this.refreshQuestUI();
    this.refreshParty();
    this.ui.setResources(this.state.resources);
    await this.ui.fade(false);
    this.mode = "play";
    if (!this.state.quests.main) {
      await wait(400);
      this.mode = "busy";
      await this.ui.say([
        { text: `☀️ Good morning, *${this.state.playerName}*! The sun is shining on Cozy Hollow.` },
        { text: "Today feels like the start of a big adventure... Let's head outside!" },
      ]);
      this.story.start("main");
      this.mode = "play";
      const touch = document.body.classList.contains("touch");
      this.showHint(
        touch
          ? "👆 Drag on the left to walk · ✋ talk / jump · hold 👟 to sprint"
          : input.lastDevice === "gamepad"
            ? "🕹️ Stick to walk · Ⓐ talk / jump · hold Ⓑ to sprint"
            : "⌨️ WASD to walk · Space talk / jump · hold Shift to sprint",
      );
    }
  }

  /** Apply persistent state to the world (gates, plots, owned critters, NPC positions). */
  private syncWorldToState() {
    if ((this.story.stage("main") ?? -1) >= 5 || this.state.flags.gatesOpen) this.world.setGates(false, false);
    else this.world.setGates(true, false);
    if (this.story.stage("main") >= 5) this.placeBrambleAtWorkshop();
    this.state.plots.forEach((p, i) => this.setPlot(i, p, false));
    this.rebuildFollowers();
    this.rebuildHaven();
    this.movePipForHide();
    this.refreshPickups();
    this.life.refreshCrumbs();
    this.life.ensureStarterWardrobe();
    this.refreshThornGate();
    this.refreshUnicorn();
    this.player.model.setLook?.(this.state.look as PlayerLook);
    this.ui.setResources(this.state.resources);
    this.refreshNpcMarkers();
    if (this.state.critters.some((c) => c.species === "mochi")) this.locations.get("library")?.wild.forEach((w) => w.species === "mochi" && w.hide());
  }

  /* ================================================================== */
  /* Locations                                                           */
  /* ================================================================== */

  private getLocation(id: string): Location {
    let L = this.locations.get(id);
    if (L) return L;
    const origin = interiorOrigin(id);
    const def = id === "cave" ? buildCave(this.scene, origin) : id === "thornwild" ? buildThornwild(this.scene, origin) : buildInterior(this.scene, id as BuildingId, origin);
    const col = new CollisionWorld(4);
    col.add(def.colliders);
    col.bounds = def.bounds;
    const floorY = def.spawn.y;
    L = {
      id,
      root: def.root,
      collision: col,
      ground: () => floorY,
      interacts: [],
      frame: def.camera,
      lighting: def.lighting,
      music: id === "cave" || id === "thornwild" ? "cave" : "interior",
      bounds: def.bounds,
      def,
      update: def.update,
      wild: [],
    };
    L.interacts.push({
      id: id + "_exit",
      pos: def.exit.pos,
      r: def.exit.radius + 0.6,
      label: "Go outside",
      run: () => this.exitInterior(id),
    });
    this.decorateInterior(L, def);
    def.root.setEnabled(false);
    this.locations.set(id, L);
    return L;
  }

  /** Add the location-specific interactables, critters and NPCs. */
  private decorateInterior(L: Location, def: InteriorDef) {
    const spot = (k: string) => def.spots[k];
    if (L.id === "library") {
      const p = spot("cat") ?? spot("npc").add(new Vector3(2, 0, -1));
      const mochi = new WildCritter(this.scene, "mochi_story", "mochi", 0, p.clone(), 0.01);
      mochi.state = "sleep";
      mochi.model.root.parent = null;
      L.wild.push(mochi);
    }
    if (L.id === "home") {
      const bed = spot("bed");
      if (bed)
        L.interacts.push({
          id: "bed",
          pos: bed,
          r: 1.8,
          label: "Take a nap",
          run: async () => {
            await this.ui.fade(true, 500);
            this.save();
            this.fx.notes(this.player.pos.add(new Vector3(0, 1.5, 0)));
            await wait(400);
            await this.ui.fade(false, 500);
            this.ui.toast("Game saved. Sweet dreams!", "💤", "var(--lav)");
          },
        });
      const mirror = spot("mirror") ?? spot("desk");
      if (mirror)
        L.interacts.push({
          id: "wardrobe",
          pos: mirror,
          r: 1.8,
          label: "Change style",
          run: () => openPauseMenu(this, "style"),
        });
    }
    if (L.id === "bakery") {
      const o = spot("oven") ?? spot("counter");
      if (o)
        L.interacts.push({
          id: "oven",
          pos: o,
          r: 2,
          label: "Bake",
          run: () => this.openOven(),
        });
      for (let i = 0; i < 2; i++) {
        const t = spot("cafe_table_" + i);
        if (t)
          L.interacts.push({
            id: "in_table_" + i,
            pos: t,
            r: 2.1,
            label: "Have a snack",
            enabled: () => !!this.state.skills.cooking,
            run: () => this.cafeSnack(),
          });
      }
    }
    if (L.id === "sewing") {
      const t = spot("counter");
      if (t)
        L.interacts.push({
          id: "sewing_machine",
          pos: t,
          r: 2,
          label: "Sew",
          run: () => this.openSewing(),
        });
    }
    if (L.id === "workshop") {
      const t = spot("blueprint") ?? spot("table") ?? spot("counter");
      if (t)
        L.interacts.push({
          id: "blueprint",
          pos: t,
          r: 2,
          label: "Build",
          enabled: () => this.story.stage("main") >= 5,
          run: () => this.openBuildMenu(),
        });
    }
    if (L.id === "thornwild") this.decorateThornwild(L, def);
    if (L.id === "cave") {
      const t = spot("treasure");
      if (t) {
        const chest = this.world.makeChest(t);
        L.interacts.push({
          id: "chest",
          pos: t,
          r: 2.2,
          label: () => (this.state.taken.includes("starChest") ? "Empty chest" : "Open"),
          run: async () => {
            if (this.state.taken.includes("starChest")) {
              await this.ui.say([{ text: "The chest is empty. The Star Crystal's glow still lingers..." }]);
              return;
            }
            this.state.taken.push("starChest");
            this.world.openChest(chest);
            audio.jingle("fanfare");
            this.fx.sparkles(t.add(new Vector3(0, 1, 0)), 30, ["#fff3a6", "#f0d4ff"]);
            this.player.celebrate = 1.6;
            this.give("starCrystal", 1);
            await this.ui.say([{ text: "✨ You found the *Star Crystal*! It's warm, and glows like a tiny sun." }]);
            if (this.story.stage("main") === 7) this.story.advance("main");
          },
        });
      }
      // wild cave critters
      const table: SpeciesId[] = ["glowbat", "molly", "glowbat", "molly", "glowbat", "molly"];
      for (let i = 0; i < 6; i++) {
        const p = spot("critter_" + i);
        if (!p) continue;
        const w = new WildCritter(this.scene, "cave_" + i, table[i], Math.random() < 0.08 ? 1 : 0, p.clone(), 3);
        L.wild.push(w);
      }
      for (let i = 0; i < 6; i++) {
        const p = spot("res_" + i);
        if (p) this.world.addResourceNode(L, "crystal", p);
      }
      // ambient motes
      this.fx.ambient({ center: def.spawn.add(new Vector3(0, 2, 12)), box: new Vector3(22, 3, 16), rate: 12, colors: ["#f0d4ff", "#bfe0f6"], size: [0.08, 0.2], life: [3, 6] }).emitter;
    }
    // NPC interactions in interiors are added when NPCs are placed
  }

  async goTo(id: string, spawn?: { x: number; z: number; rot: number }, fade = true) {
    const keepRiding = !!this.riding;
    if (this.riding) this.toggleRide();
    this.mode = "busy";
    if (fade) await this.ui.fade(true);
    const prev = this.current;
    const L = this.getLocation(id);
    if (prev && prev !== L) prev.root.setEnabled(false);
    L.root.setEnabled(true);
    this.current = L;
    for (const [, l] of this.locations) {
      const on = l === L;
      l.wild.forEach((w) => w.model.root.setEnabled(on && w.state !== "hidden"));
    }
    this.haven.forEach((w) => w.model.root.setEnabled(id === "overworld" && w.state !== "hidden"));
    for (const n of this.npcs.values()) n.model.root.setEnabled(n.location === id);
    const cleansed = id === "thornwild" && !!this.state.flags.thornwildCleansed;
    this.stage.setLighting(cleansed && L.def?.cleansedLighting ? L.def.cleansedLighting : L.lighting);
    if (L.def?.cleanse) L.def.cleanse(cleansed ? 1 : 0);
    if (L.def?.dangerous) {
      this.combat.begin(L);
      this.setBossGate(false);
    } else if (this.combat?.active) this.combat.end();
    let p: Vector3;
    let rot: number;
    if (spawn) {
      p = new Vector3(spawn.x, L.ground(spawn.x, spawn.z), spawn.z);
      rot = spawn.rot;
    } else if (L.def) {
      p = L.def.spawn.clone();
      rot = 0;
    } else {
      p = new Vector3(LOC.spawnStart.x, heightAt(LOC.spawnStart.x, LOC.spawnStart.z), LOC.spawnStart.z);
      rot = Math.PI;
    }
    this.camYaw = 0;
    this.player.place(p.x, p.y, p.z, rot);
    this.followers.forEach((f, i) => f.place(p.add(new Vector3(-Math.sin(rot) * (i + 1) * 1.2, 0, -Math.cos(rot) * (i + 1) * 1.2)), rot));
    this.snapCamera();
    this.stage.setTiltShift(!!L.def && L.id !== "cave");
    if (L.id === "overworld") {
      this.zone = zoneAt(p.x, p.z);
      audio.music(ZONE_INFO[this.zone].music);
    } else {
      this.zone = "interior";
      audio.music(L.music);
    }
    this.state.location = { where: id, x: p.x, z: p.z, rot };
    this.enteredAt = this.time;
    if (keepRiding && this.canRideHere()) this.toggleRide();
    this.refreshNpcMarkers();
    if (fade) await this.ui.fade(false);
    if (L.id === "cave") this.ui.showBanner(ZONE_INFO.cave.name, ZONE_INFO.cave.subtitle);
    else if (L.id === "thornwild") {
      this.ui.showBanner(ZONE_INFO.thornwild.name, this.state.flags.thornwildCleansed ? "Sunny and safe again!" : ZONE_INFO.thornwild.subtitle);
      if (this.story.active("thornwild") && this.story.stage("thornwild") === 0) this.story.advance("thornwild");
    }
    else if (L.def) {
      const info = BUILDING_INFO[L.id as BuildingId];
      if (info) this.ui.showBanner(info.name, "");
    }
    this.mode = "play";
  }

  async enterBuilding(id: string) {
    audio.sfx("door");
    await this.goTo(id);
  }

  async exitInterior(id: string) {
    audio.sfx("door");
    const ext = id === "cave" ? this.world.caveEntrance : this.world.doors.get(id);
    const p = ext ?? new Vector3(0, 0, 0);
    // step out a little in front of the door (towards the camera / south)
    const out = id === "cave" ? new Vector3(p.x + 0.5, 0, p.z - 3.2) : new Vector3(p.x, 0, p.z - 1.8);
    await this.goTo("overworld", { x: out.x, z: out.z, rot: Math.PI });
    const z = zoneAt(out.x, out.z);
    this.ui.showBanner(ZONE_INFO[z].name, ZONE_INFO[z].subtitle);
  }

  /* ================================================================== */
  /* Frame                                                               */
  /* ================================================================== */

  private frame() {
    const eng = this.stage.engine;
    const dt = Math.min(0.05, eng.getDeltaTime() / 1000);
    this.time += dt;
    const L = this.current;
    try {
      this.update(dt, L);
    } catch (e) {
      console.error(e);
    }
    this.scene.render();
    this.ui.updateLabels(this.scene, this.cam);
  }

  private update(dt: number, L: Location) {
    const playing = this.mode === "play" && !this.ui.dialogueOpen;
    if (this.mode !== "title") {
      if (playing) {
        // sprint: hold Ⓑ / a trigger / Shift / the 👟 touch button
        this.player.sprinting = input.down("b") || input.down("sprint");
        this.player.jumpHeld = input.down("a");
        this.applyPerks();
        this.player.update(dt, input.move.x, input.move.y, this.camAlpha, L.collision, L.ground);
        this.updateMount(dt);
        this.state.playTime += dt;
      } else this.player.idle(dt, false);
    }
    // followers walk the breadcrumb trail (the critter you're riding is busy carrying you)
    const trail = this.player.trail;
    const walkers = this.followers.filter((f) => f !== this.riding?.f);
    walkers.forEach((f, i) => {
      const idx = Math.min(trail.length - 1, 4 + i * 4);
      f.update(dt, trail[idx] ?? this.player.pos, L.ground, this.player.moveSpeed * 1.05);
    });
    if (this.riding && !playing) this.updateMount(dt);
    // wild critters
    const pp = this.player.pos;
    for (const w of L.wild) {
      if (w.state === "hidden") {
        if (w.respawnAt && this.time > w.respawnAt) this.respawnWild(L, w);
        continue;
      }
      const far = Vector3.DistanceSquared(w.pos, pp) > 46 * 46;
      if (far !== !w.model.root.isEnabled()) w.model.root.setEnabled(!far);
      if (!far) w.update(dt, pp, this.player.speed, L.collision, L.ground, (c, g) => this.ui.emote(() => c.pos.add(new Vector3(0, c.model.height + 0.2, 0)), g));
    }
    if (L.id === "overworld")
      for (const w of this.haven) {
        if (Vector3.DistanceSquared(w.pos, pp) < 46 * 46) w.update(dt, pp, 0, L.collision, L.ground, () => {});
      }
    // NPCs
    for (const n of this.npcs.values()) if (n.location === L.id) n.update(dt, pp);
    L.update?.(dt, this.time);
    if (this.mode !== "title") this.life.update(dt);
    if (this.combat?.active) {
      this.combat.update(dt, playing);
      this.updateThornwild(dt);
    }
    this.builtThings.forEach((b) => b?.update?.(dt, this.time));

    // zone changes
    if (L.id === "overworld" && this.mode === "play") {
      const z = zoneAt(pp.x, pp.z);
      if (z !== this.zone) {
        this.zone = z;
        this.ui.showBanner(ZONE_INFO[z].name, ZONE_INFO[z].subtitle);
        audio.music(ZONE_INFO[z].music);
      }
    }

    // interactions
    if (playing) this.updateInteractions(L);
    else if (this.nearest) {
      this.nearest = null;
      this.ui.showPrompt(null, "");
    }
    if (playing && input.pressed("x") && !this.combat?.active) this.openMenu();
    if (playing && input.pressed("start")) this.openMenu();
    if (playing && (input.pressed("ride") || (input.pressed("y") && this.riders().length))) this.toggleRide();
    else if (playing && input.pressed("y")) openPauseMenu(this, "critters");

    if (playing) {
      // rotate: right stick, LB/RB, [ ] or , . keys (drag / two-finger handled in setupPinch)
      let turn = input.look.x * 2.4;
      if (input.down("lb")) turn -= 1.8;
      if (input.down("rb")) turn += 1.8;
      this.camYaw += turn * dt;
      if (Math.abs(input.look.y) > 0.2) this.zoomMul = Math.max(0.65, Math.min(1.35, this.zoomMul * (1 + input.look.y * dt * 0.9)));
    }
    this.updateCamera(dt, L);
    this.updateGuide(playing);
    if (this.hintEl && playing) {
      this.hintMoved += this.player.speed * dt;
      if (this.hintMoved > 1.5) this.hideHint();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 30 && this.mode === "play") {
      this.saveTimer = 0;
      this.save();
    }
  }

  private updateInteractions(L: Location) {
    const pp = this.player.pos;
    const front = this.player.front(0.7);
    let best: Interact | null = null,
      bestD = Infinity;
    const consider = (it: Interact) => {
      if (it.enabled && !it.enabled()) return;
      const d = Math.hypot(it.pos.x - front.x, it.pos.z - front.z);
      const d2 = Math.hypot(it.pos.x - pp.x, it.pos.z - pp.z);
      const dd = Math.min(d, d2);
      if (dd < it.r && dd < bestD) {
        best = it;
        bestD = dd;
      }
    };
    L.interacts.forEach(consider);
    // npcs
    for (const n of this.npcs.values()) {
      if (n.location !== L.id) continue;
      consider({ id: "npc_" + n.id, pos: n.pos, r: 2.2, label: "Talk", h: n.model.height + 0.5, run: () => this.talkTo(n) });
    }
    for (const w of L.wild) {
      if (w.state === "hidden") continue;
      consider({ id: "wild_" + w.id, pos: w.pos, r: 2.0 + w.model.radius, label: "Befriend", h: w.model.height + 0.6, run: () => this.befriend(w) });
    }
    if (L.id === "overworld")
      for (const w of this.haven) {
        if (w.state === "hidden") continue;
        consider({ id: "haven_" + w.id, pos: w.pos, r: 1.8 + w.model.radius, label: "Play", h: w.model.height + 0.6, run: () => this.playWithHaven(w) });
      }
    const b = best as Interact | null;
    if (b?.id !== this.nearest?.id || (b && this.nearest && b.pos !== this.nearest.pos)) {
      this.nearest = b;
      if (b) {
        const lbl = typeof b.label === "function" ? b.label() : b.label;
        this.ui.showPrompt(b.pos.add(new Vector3(0, b.h ?? 1.6, 0)), lbl);
      } else this.ui.showPrompt(null, "");
    }
    // auto-trigger exits (door mats) by walking onto them
    if (b && b.id.endsWith("_exit") && bestD < 0.9 && this.player.speed > 0.2 && this.time - this.enteredAt > 1.2) {
      this.runInteract(b);
      return;
    }
    if (b && input.pressed("a") && !this.player.airborne) {
      input.consume("a");
      this.runInteract(b);
    } else if (!b && input.pressed("a")) {
      // nothing to talk to → Ⓐ jumps
      input.consume("a");
      this.player.jump();
    }
  }

  private async runInteract(it: Interact) {
    this.mode = "busy";
    this.nearest = null;
    this.ui.showPrompt(null, "");
    try {
      await it.run();
    } catch (e) {
      console.error(e);
    }
    if (this.mode === "busy") this.mode = "play";
    this.refreshNpcMarkers();
  }

  /* ================================================================== */
  /* Guidance                                                            */
  /* ================================================================== */

  /** World position the current objective lives at, translated through doors when needed. */
  objectivePos(): Vector3 | null {
    const t = this.story.objectiveTarget();
    if (!t) return null;
    const cur = this.current.id;
    const via = (loc: string, p: Vector3): Vector3 | null => {
      if (loc === cur) return p;
      if (cur === "overworld") return loc === "cave" ? this.world.caveEntrance : this.world.doors.get(loc) ?? null;
      return this.current.def?.exit.pos ?? null;
    };
    if (t.npc) {
      const n = this.npcs.get(t.npc);
      return n ? via(n.location, n.pos) : null;
    }
    if (t.critter) {
      for (const [id, L] of this.locations) {
        const w = L.wild.find((x) => x.id === t.critter && x.state !== "hidden");
        if (w) return via(id, w.pos);
      }
      return null;
    }
    if (t.cave) {
      if (cur === "cave") return this.current.def?.spots.treasure ?? null;
      return via("cave", Vector3.Zero());
    }
    if (t.crumb) {
      const c = this.life.nextCrumb();
      return c ? via("overworld", c) : null;
    }
    if (t.spot) return via("overworld", new Vector3(t.spot[0], heightAt(t.spot[0], t.spot[1]), t.spot[1]));
    if (t.building) {
      const L = this.locations.get(t.building);
      const inside = t.building === "bakery" ? L?.def?.spots.oven : L?.def?.spots.npc;
      return via(t.building, inside ?? Vector3.Zero());
    }
    return null;
  }

  private updateGuide(playing: boolean) {
    const target = playing ? this.objectivePos() : null;
    const pp = this.player.pos;
    if (!target || Math.hypot(target.x - pp.x, target.z - pp.z) < 6) {
      this.guide.style.display = "none";
      return;
    }
    const eng = this.stage.engine;
    const w = eng.getRenderWidth(),
      hh = eng.getRenderHeight();
    const vp = this.cam.viewport.toGlobal(w, hh);
    const tm = this.scene.getTransformMatrix();
    const a = Vector3.Project(pp.add(new Vector3(0, 0.8, 0)), Matrix.IdentityReadOnly, tm, vp);
    const b = Vector3.Project(target, Matrix.IdentityReadOnly, tm, vp);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const cw = this.ui.root.clientWidth / w,
      ch = this.ui.root.clientHeight / hh;
    const R = 78;
    this.guide.style.display = "";
    this.guide.style.left = a.x * cw + Math.cos(ang) * R + "px";
    this.guide.style.top = a.y * ch + Math.sin(ang) * R + "px";
    (this.guide.firstElementChild as HTMLElement).style.transform = `rotate(${ang}rad)`;
  }

  showHint(text: string) {
    this.hideHint();
    this.hintMoved = 0;
    this.hintEl = h(".hint-pill", null, text);
    this.ui.root.append(this.hintEl);
  }
  hideHint() {
    const el = this.hintEl;
    if (!el) return;
    this.hintEl = null;
    el.classList.add("out");
    setTimeout(() => el.remove(), 400);
  }

  /* ================================================================== */
  /* Camera                                                              */
  /* ================================================================== */

  private desiredCam(L: Location) {
    const f = L.frame;
    const pp = this.player.pos;
    if (this.focusOverride) {
      return { target: this.focusOverride, alpha: -Math.PI / 2 + Math.sin(this.time * 0.08) * 0.25, beta: 1.08, radius: 30 };
    }
    if (f && !f.follow) {
      // diorama: fixed frame with a little parallax toward the player
      const t = f.target.clone();
      t.x += (pp.x - f.target.x) * 0.18;
      t.z += (pp.z - f.target.z) * 0.12;
      // dioramas only have back/left walls, so keep the turn gentle
      this.camYaw = Math.max(-0.45, Math.min(0.45, this.camYaw));
      return { target: t, alpha: f.alpha + this.camYaw, beta: f.beta, radius: f.radius * this.zoomMulClamped(0.9, 1.1) };
    }
    const fwd = -Math.PI / 2 + this.camYaw;
    const t = new Vector3(pp.x - Math.cos(fwd) * 1.0, this.player.groundY + 1.1, pp.z - Math.sin(fwd) * 1.0);
    if (f?.follow) {
      return { target: t, alpha: f.alpha + this.camYaw, beta: f.beta, radius: f.radius * this.zoomMul };
    }
    const sprintZoom = this.player.sprinting && this.player.speed > 0.9 ? 1.07 : 1;
    return { target: t, alpha: -Math.PI / 2 + this.camYaw, beta: CAM_BETA, radius: CAM_RADIUS * this.zoomMul * sprintZoom };
  }

  private zoomMulClamped(a: number, b: number) {
    return Math.max(a, Math.min(b, this.zoomMul));
  }

  private snapCamera() {
    const d = this.desiredCam(this.current);
    this.camTarget.copyFrom(d.target);
    this.camAlpha = d.alpha;
    this.camBeta = d.beta;
    this.camRadius = d.radius;
    this.applyCam();
  }

  private camShot: { target: Vector3; radius: number; beta?: number } | null = null;

  private updateCamera(dt: number, L: Location) {
    let d = this.desiredCam(L);
    if (this.camShot) d = { ...d, target: this.camShot.target, radius: this.camShot.radius, beta: this.camShot.beta ?? d.beta };
    const k = 1 - Math.exp(-dt * (this.camShot ? 3 : 5));
    this.camTarget.x += (d.target.x - this.camTarget.x) * k;
    this.camTarget.y += (d.target.y - this.camTarget.y) * k;
    this.camTarget.z += (d.target.z - this.camTarget.z) * k;
    this.camAlpha += (d.alpha - this.camAlpha) * k;
    this.camBeta += (d.beta - this.camBeta) * k;
    this.camRadius += (d.radius - this.camRadius) * k;
    this.applyCam();
  }

  private applyCam() {
    this.cam.target.copyFrom(this.camTarget);
    this.cam.alpha = this.camAlpha;
    this.cam.beta = this.camBeta;
    this.cam.radius = this.camRadius;
    this.stage.shadowFocus.copyFrom(this.camTarget);
    if (this.current?.def) this.stage.setShadowArea(this.current.id === "cave" ? 30 : 14);
    else this.stage.setShadowArea(34);
  }

  /* ================================================================== */
  /* NPCs                                                                */
  /* ================================================================== */

  private placeNpcs() {
    const ow = this.world.npcSpots;
    const place = (id: NpcId, loc: string, p: Vector3, rot = Math.PI) => this.npcs.get(id)!.place(loc, p, rot);
    place("mayor", "overworld", ow.mayor, Math.PI);
    place("bramble", "overworld", ow.brambleGate, Math.PI);
    place("pip", "overworld", ow.pip, Math.PI);
    place("marina", "overworld", ow.marina, Math.PI * 0.7);
    // shopkeepers inside their shops
    const inside: [NpcId, string][] = [
      ["granny", "teahouse"],
      ["flora", "flowershop"],
      ["stitch", "sewing"],
      ["hoot", "library"],
      ["mocha", "bakery"],
    ];
    for (const [id, b] of inside) {
      const L = this.getLocation(b);
      place(id, b, L.def!.spots.npc ?? L.def!.spawn.add(new Vector3(0, 0, 3)), Math.PI);
    }
    for (const n of this.npcs.values()) {
      n.model.root.setEnabled(n.location === this.current.id);
      n.pos.y = this.locations.get(n.location)!.ground(n.pos.x, n.pos.z);
      n.model.root.position.y = n.pos.y;
    }
  }

  placeBrambleAtWorkshop() {
    const n = this.npcs.get("bramble")!;
    n.place("overworld", this.world.npcSpots.brambleHaven, Math.PI);
    n.pos.y = heightAt(n.pos.x, n.pos.z);
    n.model.root.position.y = n.pos.y;
    n.model.root.setEnabled(this.current?.id === "overworld");
  }

  movePipForHide() {
    const n = this.npcs.get("pip")!;
    const s = this.story;
    let p = this.world.npcSpots.pip;
    if (s.active("hide")) {
      const st = s.stage("hide");
      p = [this.world.npcSpots.pipMeadow, this.world.npcSpots.pipWoods, this.world.npcSpots.pipPond, this.world.npcSpots.pip][st] ?? p;
    }
    n.place("overworld", p, Math.PI);
    n.pos.y = heightAt(p.x, p.z);
    n.model.root.position.y = n.pos.y;
    n.model.root.setEnabled(this.current?.id === "overworld");
  }

  refreshNpcMarkers() {
    for (const [id, n] of this.npcs) {
      const news = this.story.hasNews(id) && n.location === this.current?.id;
      const has = this.markerLabels.has(id);
      if (news && !has) {
        const el = h(".quest-mark", null, "!");
        this.markerLabels.set(
          id,
          this.ui.addLabel(el, () => (n.model.root.isEnabled() ? n.pos.add(new Vector3(0, n.model.height + 0.9, 0)) : null)),
        );
      } else if (!news && has) {
        this.markerLabels.get(id)!();
        this.markerLabels.delete(id);
      }
    }
  }

  private async talkTo(n: Npc) {
    n.talking = true;
    this.player.face(n.pos);
    n.model.emote("wave");
    this.camShot = { target: Vector3.Lerp(this.player.pos, n.pos, 0.5).add(new Vector3(0, 1.2, 0)), radius: this.current.def ? this.current.frame!.radius * 0.8 : 15 };
    try {
      await this.story.talk(n.id);
    } finally {
      n.talking = false;
      this.camShot = null;
    }
  }

  /* ================================================================== */
  /* Befriending                                                         */
  /* ================================================================== */

  private async befriend(w: WildCritter) {
    const info = SPECIES[w.species];
    w.state = "notice";
    w.timer = 99;
    this.player.face(w.pos);
    w.model.root.rotation.y = Math.atan2(this.player.pos.x - w.pos.x, this.player.pos.z - w.pos.z);
    w.rot = w.model.root.rotation.y;
    this.camShot = { target: Vector3.Lerp(this.player.pos, w.pos, 0.6).add(new Vector3(0, 0.8, 0)), radius: this.current.def ? this.current.frame!.radius * 0.7 : 12 };
    audio.voice(w.species, "curious");
    try {
      const bubble = this.bubbles.find((b) => b.w === w);
      if (bubble) {
        await this.ui.say([{ text: `This ${info.name} is trapped in a gloomy bubble! Bonk the bubble with your *Sparkle Wand* (Ⓧ / F / ⚔️) to set it free!` }]);
        return;
      }
      if (!this.state.keyItems.charm) {
        await this.ui.say([{ text: `It's a ${info.name}! It looks at you curiously... You'll need a *Friendship Charm* to make friends.` }]);
        return;
      }
      if (!this.state.seen.includes(w.species)) {
        this.state.seen.push(w.species);
        this.ui.toast(`New critter in your Journal: ${info.name}!`, "📔", "var(--sky)");
      }
      const intro = w.species === "mochi" ? `Mochi is fast asleep, purring softly... *Prrr...*` : `A wild *${info.name}*${w.variant ? " (a rare colour!)" : ""}! ${info.desc}`;
      const cookies = this.state.keyItems.cookie ?? 0;
      const choices = ["Let's play! 💖", "Not now"];
      if (cookies > 0) choices.splice(1, 0, `Offer a cookie 🍪 (${cookies})`);
      const c = await this.ui.say([{ text: intro, choices }]);
      if (c === choices.length - 1 || c < 0) {
        w.state = w.species === "mochi" ? "sleep" : "idle";
        w.timer = 2;
        return;
      }
      const usedCookie = cookies > 0 && c === 1;
      if (usedCookie) {
        this.take("cookie", 1);
        w.model.emote("love");
        this.fx.hearts(w.pos.add(new Vector3(0, w.model.height, 0)), 6);
        audio.voice(w.species, "happy");
        await wait(700);
      }
      w.state = "idle";
      const cozy = this.life.buffActive("cozy");
      let diff = info.difficulty - (usedCookie ? 1 : 0) - (cozy ? 1 : 0);
      if (cozy) this.life.useCozy();
      if (w.species === "mochi" || w.id === "thief") diff = 1;
      diff = Math.max(1, Math.min(3, diff));
      this.ui.setHudVisible(false);
      this.ui.setTouchVisible(false);
      const res = this.debugAutoWin ? { success: true, stars: 3 as const } : await playMinigame(info.game, { species: w.species, critterName: info.name, color: info.color, difficulty: diff as 1 | 2 | 3 });
      this.ui.setHudVisible(true);
      this.ui.setTouchVisible(true);
      audio.music(this.zone === "interior" ? this.current.music : ZONE_INFO[this.zone].music);
      if (!res.success) {
        w.model.emote("sad");
        audio.voice(w.species, "sad");
        await this.ui.say([{ text: `The ${info.name} wants to play again some other time.` }]);
        w.state = w.species === "mochi" ? "sleep" : "idle";
        return;
      }
      // success!
      w.model.emote("love");
      audio.voice(w.species, "happy");
      audio.jingle("newfriend");
      this.fx.hearts(w.pos.add(new Vector3(0, w.model.height, 0)), 16);
      this.fx.sparkles(w.pos.add(new Vector3(0, 0.5, 0)), 20);
      this.player.celebrate = 1.4;
      await wait(900);
      const names = info.names.slice().sort(() => Math.random() - 0.5).slice(0, 3);
      let name = names[0];
      if (w.id === "thief") name = "Maple";
      else if (w.species !== "mochi") {
        const pick = await this.ui.say([{ text: `💖 The ${info.name} wants to be your friend! What will you name it?`, choices: names }]);
        name = names[Math.max(0, pick)];
      } else name = "Mochi";
      const owned: OwnedCritter = {
        uid: this.state.nextUid++,
        species: w.species,
        variant: w.variant,
        name,
        inParty: this.state.critters.filter((c) => c.inParty).length < PARTY_MAX,
        friendship: 1,
      };
      this.state.critters.push(owned);
      w.hide();
      if (w.id !== "mochi_story" && w.id !== "thief") w.respawnAt = this.time + 40 + Math.random() * 30;
      this.fx.puff(w.pos.add(new Vector3(0, 0.4, 0)), 10, "#ffe6f0");
      this.rebuildFollowers();
      this.rebuildHaven();
      await this.ui.say([
        {
          text: owned.inParty ? `*${name}* joined your party! 🐾` : `*${name}* went to play in *Critter Haven*! You can swap party members from the menu.`,
        },
      ]);
      this.story.onBefriend(w.species, w.id);
      if (w.id === "thief") this.life.refreshCrumbs();
      this.save();
    } finally {
      this.camShot = null;
    }
  }

  private respawnWild(L: Location, w: WildCritter) {
    // pick a fresh spot near home & sometimes a new species of the same zone
    const zone = SPECIES[w.species].zone;
    const pool = (Object.keys(SPECIES) as SpeciesId[]).filter((s) => SPECIES[s].zone === zone);
    const rare = this.life.buffActive("lucky") ? 0.45 : 0.08;
    const fresh = new WildCritter(this.scene, w.id + "r", pool[Math.floor(Math.random() * pool.length)], Math.random() < rare ? 1 : 0, w.home.clone(), w.range);
    w.model.dispose();
    const i = L.wild.indexOf(w);
    L.wild[i] = fresh;
    fresh.model.root.setEnabled(L === this.current);
  }

  /* ================================================================== */
  /* The Thornwild                                                       */
  /* ================================================================== */

  private initThornGate() {
    const p = LOC.thornGate;
    const gate = buildThornGate(this.scene, new Vector3(p.x, heightAt(p.x, p.z), p.z), 0);
    gate.root.parent = this.world.root;
    this.world.collision.add(gate.colliders);
    this.thornGate = gate;
    this.world.updaters.push((dt, t) => gate.update(dt, t));
    this.world.interacts.push({
      id: "thorngate",
      pos: gate.entrance,
      r: 2.6,
      h: 3,
      label: () => (this.thornwildOpen() ? "Enter the Thornwild" : "Thorny gate"),
      run: async () => {
        if (!this.thornwildOpen()) {
          await this.ui.say([
            {
              text: this.story.done("main")
                ? "Prickly brambles block the way, and grumpy growls echo inside... Maybe *Professor Hoot* knows something."
                : "Prickly brambles block the way, and grumpy growls echo inside. It feels too dangerous for now — maybe after your big adventure!",
            },
          ]);
          return;
        }
        audio.sfx("whoosh");
        await this.goTo("thornwild");
      },
    });
    this.refreshThornGate();
  }

  /** a shy Moonbeam Unicorn appears in a meadow glade once the Thornwild is safe */
  refreshUnicorn() {
    const want = this.story.done("thornwild") && !this.state.critters.some((c) => c.species === "unicorn");
    const has = this.world.wild.find((w) => w.id === "unicorn_glade");
    if (want && !has) {
      const g = LOC.unicornGlade;
      const w = new WildCritter(this.scene, "unicorn_glade", "unicorn", 0, new Vector3(g.x, heightAt(g.x, g.z), g.z), 3);
      this.world.wild.push(w);
      w.model.root.setEnabled(this.current?.id === "overworld");
    }
  }

  thornwildOpen() {
    return !!this.state.quests.thornwild;
  }

  refreshThornGate() {
    this.thornGate?.setOpen(this.thornwildOpen());
  }

  private decorateThornwild(L: Location, def: InteriorDef) {
    const spot = (k: string) => def.spots[k];
    // campfires = checkpoints (walk near to rest: hearts refill)
    for (let i = 0; i < 3; i++) {
      const c = spot("checkpoint_" + i);
      if (c)
        L.interacts.push({
          id: "campfire_" + i,
          pos: c,
          r: 2.2,
          label: "Rest by the fire",
          run: async () => {
            this.combat.setCheckpoint(c);
            this.combat.heal(5);
            audio.sfx("chime");
            this.save();
            this.ui.toast("Checkpoint! Hearts refilled.", "🔥", "var(--butter)");
          },
        });
    }
    const camp = spot("camp");
    if (camp)
      L.interacts.push({
        id: "camp",
        pos: camp,
        r: 2.2,
        label: "Rest",
        run: () => {
          this.combat.heal(5);
          this.ui.toast("Cozy camp — hearts refilled!", "🔥", "var(--butter)");
        },
      });
    for (let i = 0; i < 6; i++) {
      const p = spot("res_" + i);
      if (p) this.world.addResourceNode(L, i % 2 ? "berry" : "crystal", p);
    }
    // trapped guardians
    const guardians = ["emberling", "roarlet", "shellby"] as const;
    guardians.forEach((sp, i) => {
      const p = spot("guardian_" + i);
      if (!p) return;
      const w = new WildCritter(this.scene, "guardian_" + sp, sp, 0, p.clone(), 0.01);
      w.state = "idle";
      L.wild.push(w);
      if (this.state.critters.some((c) => c.species === sp) || this.state.flags["freed_" + sp]) {
        if (this.state.critters.some((c) => c.species === sp)) w.hide();
        return;
      }
      const b = new Batch(this.scene, "gloomBubble");
      b.add(ball(this.scene, w.model.height * 0.85 + 0.35, { color: "#6a4f9a" }, 16));
      const mesh = b.build({ outline: 0.03, emissive: "#2a1a4a", castShadow: false, alpha: 0.55 })!;
      mesh.material!.alpha = 0.55;
      mesh.position.set(p.x, p.y + w.model.height * 0.5, p.z);
      mesh.parent = def.root;
      mesh.position.subtractInPlace(def.root.position);
      this.bubbles.push({ w, mesh, hp: 3 });
    });
    // the treasure appears once the Gloom King is calmed
    const t = spot("treasure");
    if (t) {
      const chest = this.world.makeChest(t);
      L.interacts.push({
        id: "thorn_chest",
        pos: t,
        r: 2.2,
        label: () => (this.state.taken.includes("thornChest") ? "Empty chest" : "Open"),
        enabled: () => !!this.state.flags.thornwildCleansed,
        run: async () => {
          if (this.state.taken.includes("thornChest")) return;
          this.state.taken.push("thornChest");
          this.world.openChest(chest);
          audio.jingle("fanfare");
          this.give("crystal", 8);
          this.give("cookie", 5);
          this.unlockHat("crown");
          await this.ui.say([{ text: "✨ Treasure! Sparkly crystals, a big bag of Critter Cookies and a shiny *Hero's Crown*!" }]);
        },
      });
    }
  }

  /** seal / open the boss arena (visuals + collision) */
  setBossGate(closed: boolean) {
    const L = this.locations.get("thornwild");
    const def = L?.def as ThornwildDef | undefined;
    if (!L || !def) return;
    def.setBossGate?.(closed);
    if (def.bossGate) {
      L.collision.remove(def.bossGate);
      if (closed) L.collision.add(def.bossGate);
    }
    this.bossStarted = closed;
  }

  /** bonk gloom bubbles near a point (called by the wand swing) */
  bonkBubbles(at: Vector3) {
    for (const b of this.bubbles) {
      if (Vector3.Distance(at, b.w.pos) > 2.6) continue;
      b.hp--;
      audio.sfx("bubble", { pitch: 0.8 + b.hp * 0.15 });
      b.mesh.scaling.setAll(0.85 + b.hp * 0.05);
      this.fx.sparkles(b.mesh.getAbsolutePosition(), 8, ["#d9c6f5", "#ffffff"]);
      if (b.hp <= 0) {
        b.mesh.dispose();
        this.bubbles = this.bubbles.filter((x) => x !== b);
        this.state.flags["freed_" + b.w.species] = true;
        b.w.model.emote("happy");
        audio.voice(b.w.species, "happy");
        this.fx.hearts(b.w.pos.add(new Vector3(0, 1, 0)), 10);
        this.ui.toast(`You freed ${SPECIES[b.w.species].name}! Now make friends!`, "⚔️", "var(--lav)");
        this.story.onGuardianFreed();
        this.save();
      }
    }
  }

  private updateThornwild(dt: number) {
    const L = this.current;
    const def = L.def as ThornwildDef | undefined;
    if (!def || L.id !== "thornwild") return;
    const pp = this.player.pos;
    // walking past a campfire makes it your checkpoint
    for (let i = 0; i < 3; i++) {
      const c = def.spots["checkpoint_" + i];
      if (c && Vector3.DistanceSquared(c, pp) < 9 && this.combat.setCheckpoint(c)) this.ui.toast("Checkpoint! Hearts refilled.", "🔥", "var(--butter)");
    }
    // heart flowers
    for (let i = 0; i < 4; i++) {
      const hp = def.spots["heart_" + i];
      const key = "heartflower_" + i;
      if (hp && !this.state.flags[key] && Vector3.DistanceSquared(hp, pp) < 2.2 && this.combat.hearts < this.combat.maxHearts) {
        this.state.flags[key] = true;
        this.combat.heal(2);
        audio.sfx("heart");
        setTimeout(() => (this.state.flags[key] = false), 60000);
      }
    }
    // walking into the boss arena starts the fight (once all guardians are freed, the King gets nervous)
    const arena = def.bossArena ?? (def.spots.boss ? { center: def.spots.boss, radius: 11 } : null);
    if (!this.bossStarted && arena && !this.state.flags.thornwildCleansed && Math.hypot(arena.center.x - pp.x, arena.center.z - pp.z) < arena.radius - 1.5) {
      this.setBossGate(true);
      this.combat.startBoss();
    }
    void dt;
  }

  private async onBossDefeated() {
    const L = this.current;
    const def = L.def as ThornwildDef;
    this.state.flags.thornwildCleansed = true;
    this.setBossGate(false);
    this.player.celebrate = 2;
    audio.jingle("victory");
    // cleanse the whole area over a few seconds
    const t0 = performance.now();
    const step = () => {
      const f = Math.min(1, (performance.now() - t0) / 3000);
      def.cleanse?.(f);
      if (f < 1) requestAnimationFrame(step);
      else if (def.cleansedLighting) this.stage.setLighting(def.cleansedLighting);
    };
    step();
    if (this.story.active("thornwild") && this.story.stage("thornwild") <= 2) this.story.advance("thornwild", 3);
    this.save();
    await wait(1800);
    await this.ui.say([{ text: "🌈 The Gloom King gives a big sigh... and turns into a happy little cloud! The Thornwild is sunny and safe again!" }]);
  }

  /* ================================================================== */
  /* Critter classes: perks & riding                                     */
  /* ================================================================== */

  riders() {
    return this.followers.filter((f) => SPECIES[f.owned.species].role === "rider");
  }

  /** Booster perks from your party + the mount you're riding. */
  private applyPerks() {
    const p = this.player;
    const best = (s: SpeciesId) => this.bestFriendship(s) >= 5;
    let speed = this.life.buffActive("zoomies") ? 1.35 : 1;
    if (this.partyHas("fennix")) speed *= best("fennix") ? 1.3 : 1.2;
    let jump = this.partyHas("puffbun") ? (best("puffbun") ? 1.7 : 1.45) : 1;
    let jumps = this.partyHas("chirpy") ? 2 : 1;
    p.canGlide = this.partyHas("glowbat");
    const r = this.riding;
    if (r) {
      const m = MOUNTS[r.f.owned.species] ?? MOUNTS.pony;
      p.mountSpeed = m.speed;
      jump *= m.jump;
      if (m.double) jumps = 2;
      p.rideOffset = r.seat;
    } else {
      p.mountSpeed = 0;
      p.rideOffset = 0;
    }
    p.speedMul = speed;
    p.jumpMul = jump;
    p.maxJumps = jumps;
  }

  canRideHere() {
    const f = this.current.frame;
    return !this.current.def || !!f?.follow;
  }

  toggleRide() {
    if (this.riding) {
      const r = this.riding;
      this.riding = null;
      r.f.model.root.scaling.setAll(1);
      const side = this.player.front(-1.2);
      r.f.place(new Vector3(side.x + 1, this.player.groundY, side.z), this.player.rot);
      this.player.rideOffset = 0;
      this.player.sync();
      audio.sfx("whoosh");
      this.fx.puff(this.player.pos.add(new Vector3(0, 0.3, 0)), 8);
      return;
    }
    const riders = this.riders();
    if (!riders.length) {
      this.ui.toast("Befriend a Rider critter (frog, pony or unicorn) to ride!", "🐴", "var(--pink)");
      return;
    }
    if (!this.canRideHere()) {
      this.ui.toast("No riding indoors!", "🏠", "var(--pink)");
      return;
    }
    const f = riders[0];
    const m = MOUNTS[f.owned.species] ?? MOUNTS.pony;
    const seat = (f.model.seatY ?? f.model.height * 0.72) * m.scale;
    this.riding = { f, scale: m.scale, seat };
    audio.voice(f.owned.species, "happy");
    audio.sfx("jump", { pitch: 1.2 });
    this.fx.sparkles(this.player.pos.add(new Vector3(0, 1, 0)), 14);
    this.ui.toast(`Riding ${f.owned.name}! ${m.hint}`, "🐴", "var(--pink)");
    this.applyPerks();
    this.updateMount(0);
  }

  private updateMount(dt: number) {
    const r = this.riding;
    if (!r) return;
    const p = this.player;
    const root = r.f.model.root;
    r.f.pos.set(p.pos.x, p.groundY + p.jumpY, p.pos.z);
    r.f.rot = p.rot;
    root.position.copyFrom(r.f.pos);
    root.rotation.y = p.rot;
    root.scaling.setAll(r.scale);
    if (dt > 0) r.f.model.update(dt, { speed: Math.min(1, p.moveSpeed / 7) });
    // unicorn rainbow sparkle trail
    if (r.f.owned.species === "unicorn" && p.moveSpeed > 2) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.09;
        const cols: [string, string][] = [
          ["#ffb3cf", "#fff3a6"],
          ["#bfe0f6", "#d9c6f5"],
          ["#bfe9d6", "#fff3a6"],
        ];
        this.fx.sparkles(p.pos.add(new Vector3(0, 0.5, 0)), 3, cols[Math.floor(Math.random() * 3)]);
      }
    }
  }

  partyHas(s: SpeciesId) {
    return this.state.critters.some((c) => c.inParty && c.species === s);
  }

  rebuildFollowers() {
    if (this.riding) {
      this.riding = null;
      this.player.rideOffset = 0;
    }
    this.followers.forEach((f) => f.dispose());
    this.followers = this.state.critters.filter((c) => c.inParty).map((c) => new Follower(this.scene, c));
    const p = this.player.pos;
    this.followers.forEach((f, i) => f.place(p.add(new Vector3(0, 0, -1.2 * (i + 1))), 0));
    this.refreshParty();
    this.ui.setRideVisible(this.riders().length > 0);
  }

  rebuildHaven() {
    this.haven.forEach((w) => w.model.dispose());
    this.haven = [];
    const home = this.world.havenCenter;
    this.state.critters
      .filter((c) => !c.inParty)
      .forEach((c, i) => {
        const a = (i / 6) * Math.PI * 2;
        const p = new Vector3(home.x + Math.cos(a) * 6, 0, home.z + Math.sin(a) * 4);
        const w = new WildCritter(this.scene, "haven_" + c.uid, c.species, c.variant, p, 9);
        w.noticed = true;
        w.state = "idle";
        (w as unknown as { owned: OwnedCritter }).owned = c;
        w.model.root.setEnabled(this.current?.id === "overworld");
        this.haven.push(w);
      });
  }

  private async playWithHaven(w: WildCritter) {
    const owned = (w as unknown as { owned: OwnedCritter }).owned;
    w.model.emote("happy");
    audio.voice(w.species, "happy");
    this.fx.hearts(w.pos.add(new Vector3(0, w.model.height, 0)), 6);
    const party = this.state.critters.filter((c) => c.inParty);
    const choices = party.length < PARTY_MAX ? ["Join my party!", "Keep playing"] : ["Keep playing"];
    const c = await this.ui.say([{ text: `*${owned.name}* is having lots of fun in Critter Haven!`, choices }]);
    if (party.length < PARTY_MAX && c === 0) {
      owned.inParty = true;
      this.rebuildFollowers();
      this.rebuildHaven();
      this.ui.toast(`${owned.name} joined your party!`, "🐾", "var(--pink)");
    }
  }

  setPartyMember(uid: number, inParty: boolean) {
    const c = this.state.critters.find((x) => x.uid === uid);
    if (!c) return false;
    if (inParty && this.state.critters.filter((x) => x.inParty).length >= PARTY_MAX) return false;
    c.inParty = inParty;
    this.rebuildFollowers();
    this.rebuildHaven();
    this.save();
    return true;
  }

  refreshParty() {
    const strip = this.ui.partyStrip;
    strip.innerHTML = "";
    for (const c of this.state.critters.filter((x) => x.inParty)) {
      const info = SPECIES[c.species];
      const face = h(".party-face", { "--c": info.color, title: c.name });
      face.append(portrait(c.species, info.color, 96));
      strip.append(face);
    }
  }

  /* ================================================================== */
  /* Inventory / quests                                                  */
  /* ================================================================== */

  /** how many of anything the player has (materials, ingredients, dyes "dye_x", foods, key items) */
  count(id: string): number {
    if (id in RESOURCES) return this.state.resources[id as ResourceId];
    if (id in INGREDIENTS) return this.state.ingredients[id as IngredientId] ?? 0;
    if (id.startsWith("dye_")) return this.state.dyes[id.slice(4) as DyeId] ?? 0;
    if (id in FOODS && id !== "cookie") return this.state.foods[id as FoodId] ?? 0;
    return this.state.keyItems[id] ?? 0;
  }

  give(id: ResourceId | string, n: number, quiet = false) {
    if (id in RESOURCES) {
      const r = id as ResourceId;
      this.state.resources[r] += n;
      this.ui.setResources(this.state.resources, r);
      if (!quiet) this.ui.toast(`+${n} ${RESOURCES[r].name}`, RESOURCES[r].icon, RESOURCES[r].color);
    } else if (id in INGREDIENTS) {
      const k = id as IngredientId;
      this.state.ingredients[k] = (this.state.ingredients[k] ?? 0) + n;
      if (!quiet) this.ui.toast(`+${n} ${INGREDIENTS[k].name}`, INGREDIENTS[k].icon, INGREDIENTS[k].color);
    } else if (id.startsWith("dye_")) {
      const d = id.slice(4) as DyeId;
      this.state.dyes[d] = (this.state.dyes[d] ?? 0) + n;
      if (!quiet) this.ui.toast(`+${n} ${DYES[d].name}`, "🌼", DYES[d].color);
    } else if (id in FOODS && id !== "cookie") {
      const f = id as FoodId;
      this.state.foods[f] = (this.state.foods[f] ?? 0) + n;
      if (!quiet) this.ui.toast(`+${n} ${FOODS[f].name}`, FOODS[f].icon, "var(--butter)");
    } else {
      this.state.keyItems[id] = (this.state.keyItems[id] ?? 0) + n;
      const k = KEY_ITEMS[id as keyof typeof KEY_ITEMS];
      if (!quiet && k) {
        audio.sfx("pickup");
        this.ui.toast(n > 1 ? `Got ${n} ${k.name}!` : `Got the ${k.name}!`, k.icon, "var(--pink)");
      }
    }
    this.story.checkAuto();
    this.refreshQuestUI();
  }

  take(id: ResourceId | string, n: number) {
    if (id in RESOURCES) {
      this.state.resources[id as ResourceId] = Math.max(0, this.state.resources[id as ResourceId] - n);
      this.ui.setResources(this.state.resources);
    } else if (id in INGREDIENTS) this.state.ingredients[id as IngredientId] = Math.max(0, (this.state.ingredients[id as IngredientId] ?? 0) - n);
    else if (id.startsWith("dye_")) this.state.dyes[id.slice(4) as DyeId] = Math.max(0, (this.state.dyes[id.slice(4) as DyeId] ?? 0) - n);
    else if (id in FOODS && id !== "cookie") this.state.foods[id as FoodId] = Math.max(0, (this.state.foods[id as FoodId] ?? 0) - n);
    else this.state.keyItems[id] = Math.max(0, (this.state.keyItems[id] ?? 0) - n);
    this.refreshQuestUI();
  }

  unlockHat(h: string) {
    if (!this.state.hats.includes(h)) this.state.hats.push(h);
    this.state.look.hat = h;
    this.player.model.setLook?.(this.state.look as PlayerLook);
    this.player.celebrate = 1.2;
    audio.jingle("fanfare");
    this.fx.sparkles(this.player.pos.add(new Vector3(0, 1.6, 0)), 18);
    this.ui.toast("New hat! Change it anytime in Style.", "🎩", "var(--lav)");
  }

  refreshQuestUI(bump = false) {
    const t = this.story.tracked();
    if (t) this.ui.setQuest(t.title, t.text, t.icon, bump);
    else this.ui.setQuest("Free play", "Explore, befriend and build!", "🌈", bump);
    this.refreshNpcMarkers();
  }

  refreshPickups() {
    this.world?.refreshPickups();
  }

  async collectPickup(p: Pickup) {
    if (this.state.taken.includes(p.id)) return;
    this.state.taken.push(p.id);
    p.mesh.setEnabled(false);
    this.fx.sparkles(p.pos.add(new Vector3(0, 0.6, 0)), 16);
    audio.sfx("pickup");
    if (p.kind === "yarn") {
      this.give("yarn", 1, true);
      const n = this.state.keyItems.yarn ?? 0;
      this.state.quests.yarn && (this.state.quests.yarn.progress = n);
      this.ui.toast(`Found a yarn ball! (${n}/3)`, "🧶", "var(--butter)");
      this.story.checkAuto("yarn");
      this.refreshQuestUI(true);
    }
  }

  async gather(L: Location, node: ResourceNode) {
    if (this.time < node.readyAt) return;
    node.readyAt = this.time + 75;
    node.setReady(false);
    let n = 1 + (Math.random() < 0.5 ? 1 : 0);
    // Helper-class critters find extra stuff
    const talent: Partial<Record<NodeKind, SpeciesId>> = { petal: "duckling", twig: "hoglet", berry: "hoglet", mushroom: "hoglet", pebble: "molly", crystal: "molly", apple: "redpanda", honey: "redpanda" };
    const helper = talent[node.kind] ?? (node.kind.startsWith("dye_") ? "duckling" : undefined);
    if (this.buffActive("helpful") && this.followers.length) n++;
    if (helper && this.partyHas(helper)) {
      n += this.bestFriendship(helper) >= 5 ? 2 : 1;
      const f = this.followers.find((x) => x.owned.species === helper);
      if (f) {
        f.model.emote("happy");
        this.ui.emote(() => f.pos.add(new Vector3(0, f.model.height + 0.2, 0)), "✨", 900);
      }
    }
    this.player.face(node.pos);
    this.fx.sparkles(node.pos.add(new Vector3(0, 0.6, 0)), 14);
    audio.sfx("pickup");
    this.give(node.kind, n);
    void L;
  }

  /* ================================================================== */
  /* Village building                                                    */
  /* ================================================================== */

  private buildPlots() {
    LOC.plots.forEach((p, i) => {
      this.plotMeshes[i] = null;
      this.builtThings[i] = null;
      this.world.interacts.push({
        id: "plot_" + i,
        pos: new Vector3(p.x, heightAt(p.x, p.z), p.z - 2.6),
        r: 2.4,
        label: () => (this.state.plots[i] ? BUILDABLES[this.state.plots[i]!].name : "Build here"),
        enabled: () => this.story.stage("main") >= 5,
        run: async () => {
          if (this.state.plots[i]) {
            await this.ui.say([{ text: `A lovely ${BUILDABLES[this.state.plots[i]!].name}. ${BUILDABLES[this.state.plots[i]!].desc}` }]);
          } else await this.openBuildMenu(i);
        },
      });
    });
  }

  setPlot(i: number, id: BuildableId | null, animate: boolean) {
    const p = LOC.plots[i];
    this.state.plots[i] = id;
    this.plotMeshes[i]?.dispose();
    this.plotMeshes[i] = null;
    const old = this.builtThings[i];
    if (old) {
      this.world.collision.remove(old.colliders);
      old.root.dispose();
    }
    this.builtThings[i] = null;
    const y = heightAt(p.x, p.z);
    if (!id) {
      const m = buildPlotMarker(this.scene, p.x, p.z);
      m.parent = this.world.root;
      m.position.y = y;
      this.plotMeshes[i] = m;
      return;
    }
    const b = buildBuildable(this.scene, id, p.x, p.z, i + 1);
    b.root.parent = this.world.root;
    b.root.position.y = y;
    this.world.collision.add(b.colliders);
    this.builtThings[i] = b;
    if (animate) {
      b.root.scaling.setAll(0.01);
      const t0 = performance.now();
      const anim = () => {
        const t = Math.min(1, (performance.now() - t0) / 700);
        const s = 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t);
        const e = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
        b.root.scaling.set(e * s, e * (2 - s), e * s);
        if (t < 1) requestAnimationFrame(anim);
        else b.root.scaling.setAll(1);
      };
      anim();
      const c = new Vector3(p.x, y + 1, p.z);
      this.fx.puff(c, 16, "#fff4e0");
      this.fx.confetti(c, 30);
      audio.sfx("build");
    }
  }

  canAfford(id: BuildableId) {
    const cost = BUILDABLES[id].cost;
    return (Object.keys(cost) as ResourceId[]).every((r) => this.state.resources[r] >= (cost[r] ?? 0));
  }

  async build(plot: number, id: BuildableId) {
    if (!this.canAfford(id)) return false;
    const cost = BUILDABLES[id].cost;
    for (const r of Object.keys(cost) as ResourceId[]) this.take(r, cost[r] ?? 0);
    const wasInside = this.current.id !== "overworld";
    if (wasInside) {
      this.ui.toast(`Bramble built a ${BUILDABLES[id].name} in Critter Haven!`, BUILDABLES[id].icon, "var(--mint)");
      this.setPlot(plot, id, false);
    } else {
      const p = LOC.plots[plot];
      this.camShot = { target: new Vector3(p.x, 1, p.z), radius: 18 };
      await wait(500);
      this.setPlot(plot, id, true);
      await wait(1300);
      this.camShot = null;
      this.ui.toast(`${BUILDABLES[id].name} built! Cozy +${BUILDABLES[id].cozy}`, BUILDABLES[id].icon, "var(--mint)");
    }
    this.story.checkAuto("haven");
    this.refreshQuestUI(true);
    this.save();
    return true;
  }

  buffActive(id: BuffId) {
    return this.life.buffActive(id);
  }
  bestFriendship(s: SpeciesId) {
    return this.life.bestFriendship(s);
  }

  async openOven() {
    if (!this.state.skills.cooking) {
      await this.ui.say([{ text: "A big warm oven. Mocha would have to teach you how to bake first!" }]);
      return;
    }
    const made = await openCookMenu(this);
    if (made) this.story.onCook(made);
  }

  async openSewing() {
    if (!this.state.skills.sewing) {
      await this.ui.say([{ text: "Stitch's sewing machine — shiny and clicky! Ask Stitch to teach you how to sew." }]);
      return;
    }
    await openSewingMenu(this);
  }

  async openOrders() {
    if (!this.state.skills.cooking) {
      await this.ui.say([{ text: "The café order board is covered in cute doodles of cakes. Learn to bake with Mocha to take orders!" }]);
      return;
    }
    if (!this.state.orders.length) this.life.refreshOrders();
    await openOrdersMenu(this);
  }

  async cafeSnack() {
    const f = await chooseSnack(this);
    if (f) await this.life.eat(f, true);
  }

  async openBuildMenu(plot?: number) {
    await openBuildMenu(this, plot);
  }

  /* ================================================================== */
  /* Story beats                                                         */
  /* ================================================================== */

  async openGates() {
    this.state.flags.gatesOpen = true;
    const g = this.world.gates[0];
    if (g) this.camShot = { target: g.pos.add(new Vector3(0, 1, 0)), radius: 16 };
    await wait(600);
    this.world.setGates(false, true);
    audio.jingle("fanfare");
    await wait(1400);
    this.camShot = null;
    this.ui.toast("The village gates are open!", "🚪", "var(--mint)");
  }

  async festival() {
    this.ui.setHudVisible(false);
    await this.ui.fade(true, 600);
    // gather everyone around the plaza
    const ring = [..."mayor granny flora stitch hoot pip bramble marina mocha".split(" ")] as NpcId[];
    const saved = new Map<NpcId, { loc: string; pos: Vector3; rot: number }>();
    ring.forEach((id, i) => {
      const n = this.npcs.get(id)!;
      saved.set(id, { loc: n.location, pos: n.pos.clone(), rot: n.homeRot });
      const a = (i / ring.length) * Math.PI * 2;
      const p = new Vector3(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5 - 1);
      p.y = heightAt(p.x, p.z);
      n.place("overworld", p, Math.atan2(-p.x, -p.z));
    });
    if (this.current.id !== "overworld") await this.goTo("overworld", { x: 0, z: -4, rot: 0 }, false);
    else this.player.place(0, heightAt(0, -4), -4, 0);
    for (const n of this.npcs.values()) n.model.root.setEnabled(true);
    this.camShot = { target: new Vector3(0, 2, 0), radius: 26, beta: 0.95 };
    await this.ui.fade(false, 600);
    this.mode = "busy";
    audio.jingle("victory");
    for (let i = 0; i < 8; i++) {
      this.fx.confetti(new Vector3((Math.random() - 0.5) * 14, 4 + Math.random() * 3, (Math.random() - 0.5) * 10), 40);
      this.npcs.forEach((n) => Math.random() < 0.4 && n.model.emote("happy"));
      this.player.celebrate = 1;
      await wait(650);
    }
    this.followers.forEach((f) => f.model.emote("love"));
    await this.ui.say([{ text: "🎉 The *Friendship Festival* lights up Cozy Hollow! Everyone cheers for you and your critter friends!" }]);
    this.camShot = null;
    // return NPCs home
    for (const [id, s] of saved) this.npcs.get(id)!.place(s.loc, s.pos, s.rot);
    this.placeBrambleAtWorkshop();
    this.movePipForHide();
    for (const n of this.npcs.values()) n.model.root.setEnabled(n.location === this.current.id);
    this.ui.setHudVisible(true);
  }

  /* ================================================================== */
  /* Menus & save                                                        */
  /* ================================================================== */

  async openMenu() {
    if (this.mode !== "play") return;
    this.mode = "busy";
    audio.sfx("confirm");
    await openPauseMenu(this);
    this.mode = "play";
  }

  save() {
    const p = this.player?.pos;
    if (p && this.current) this.state.location = { where: this.current.id, x: p.x, z: p.z, rot: this.player.rot };
    saveState(this.state);
  }

  /** Debug helper for automated tests: jump the main story to a stage with sensible inventory. */
  debugMain(stage: number) {
    this.state.quests.main = { stage, progress: 0, done: false };
    if (stage >= 2) {
      this.state.keyItems.journal = 1;
      this.state.keyItems.charm = 1;
    }
    if (stage >= 7) this.state.keyItems.lantern = 1;
    for (const r of Object.keys(this.state.resources) as ResourceId[]) this.state.resources[r] = 9;
    this.ui.setResources(this.state.resources);
    this.syncWorldToState();
    this.refreshQuestUI();
    this.mode = "play";
  }

  /** Debug: walk up to an NPC (in whatever location) and talk, as a player would. */
  async debugTalk(id: NpcId) {
    const n = this.npcs.get(id)!;
    if (this.current.id !== n.location) await this.goTo(n.location, n.location === "overworld" ? { x: n.pos.x, z: n.pos.z - 2, rot: 0 } : undefined, false);
    this.player.place(n.pos.x, n.pos.y, n.pos.z - 1.8, 0);
    await this.runInteract({ id: "npc_" + id, pos: n.pos, r: 3, label: "Talk", run: () => this.talkTo(n) });
    return { main: this.state.quests.main?.stage, quests: Object.fromEntries(Object.entries(this.state.quests).map(([k, v]) => [k, v.done ? "done" : v.stage])) };
  }

  /** Debug: befriend the nearest wild critter of a species in the current location. */
  async debugBefriend(species?: string) {
    const w = this.current.wild.find((x) => x.state !== "hidden" && (!species || x.species === species));
    if (!w) return "none";
    this.player.place(w.pos.x, w.pos.y, w.pos.z - 1.6, 0);
    await this.runInteract({ id: "wild", pos: w.pos, r: 3, label: "", run: () => this.befriend(w) });
    return this.state.critters.length;
  }

  /** Debug: rendering stats for perf budgeting. */
  stats() {
    const inst = (this as unknown as { _inst?: SceneInstrumentation })._inst ?? new SceneInstrumentation(this.scene);
    (this as unknown as { _inst?: SceneInstrumentation })._inst = inst;
    inst.captureFrameTime = true;
    return new Promise((r) =>
      setTimeout(
        () =>
          r({
            drawCalls: inst.drawCallsCounter.current,
            activeMeshes: this.scene.getActiveMeshes().length,
            activeIndices: this.scene.getActiveIndices(),
            frameMs: inst.frameTimeCounter.lastSecAverage,
            fps: this.stage.engine.getFps(),
          }),
        1500,
      ),
    );
  }

  /** Debug helper for automated tests. */
  debugTeleport(where: string, x?: number, z?: number) {
    this.camShot = null;
    if (where === "overworld" && x !== undefined && z !== undefined) return this.goTo("overworld", { x, z, rot: 0 }, false);
    return this.goTo(where, undefined, false);
  }
}

function interiorOrigin(id: string): Vector3 {
  const order = ["home", "teahouse", "library", "flowershop", "sewing", "workshop", "cave", "bakery", "thornwild"];
  const i = Math.max(0, order.indexOf(id));
  return new Vector3(1000 + i * 120, 0, 1000);
}

export function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
function tick() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

void QUESTS;
