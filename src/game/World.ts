import { TransformNode, Vector3, Matrix, Quaternion, Color4, Mesh, type InstancedMesh } from "@babylonjs/core";
import type { Game, Interact, Location } from "./Game";
import { CollisionWorld } from "../core/Collision";
import { buildTerrain, type TerrainResult } from "../world/Terrain";
import {
  makePropBatches,
  addTree,
  addBush,
  addFlowerPatch,
  addRock,
  addFence,
  addLamp,
  addSign,
  addMushroom,
  addGlowShroom,
  addLilyPad,
  addReeds,
  addStump,
  addLog,
  addBench,
  addWell,
  addFountain,
  addBridge,
  addCaveMouth,
  addCliff,
  addGate,
  makeGrassField,
  makeMotes,
  type PropBatches,
  type TreeKind,
  type GateResult,
  type Motes,
} from "../world/props";
import { buildExterior, BUILDING_IDS, type BuildingId } from "../world/buildings";
import { Batch, ball, blob, softBox, torus, softCyl, cone } from "../render/Shapes";
import { rng } from "../render/Palette";
import { WORLD, LOC, heightAt, walkField, isWater, nearPath, ellipseD, POND, ZONE_SHAPES, zoneAt } from "../world/layout";
import { WildCritter } from "./Actors";
import { SPECIES, type SpeciesId, type ZoneId } from "../data/species";
import type { ResourceId } from "../data/items";
import { audio } from "../audio/Audio";
import type { Collider, ExteriorDef } from "../core/types";

export interface ResourceNode {
  id: string;
  kind: ResourceId;
  pos: Vector3;
  readyAt: number;
  setReady(on: boolean): void;
}

export interface Pickup {
  id: string;
  kind: "yarn";
  pos: Vector3;
  mesh: Mesh | InstancedMesh;
  visible: () => boolean;
}

const CHUNK = 40;

export class Overworld {
  root: TransformNode;
  collision = new CollisionWorld(6);
  interacts: Interact[] = [];
  wild: WildCritter[] = [];
  doors = new Map<string, Vector3>();
  caveEntrance = new Vector3(LOC.caveMouth.x, 0, LOC.caveMouth.z - 1);
  gates: { gate: GateResult; pos: Vector3 }[] = [];
  gatesClosed = true;
  havenCenter = new Vector3(37, 0, -11);
  npcSpots = {
    mayor: new Vector3(4.5, 0, -6),
    brambleGate: new Vector3(3.2, 0, 30.5),
    brambleHaven: new Vector3(33, 0, 7.5),
    pip: new Vector3(-9, 0, -7),
    pipMeadow: new Vector3(-27, 0, 92),
    pipWoods: new Vector3(-104, 0, 56),
    pipPond: new Vector3(120, 0, 44),
    marina: new Vector3(83, 0, 23),
  };
  pickups: Pickup[] = [];
  private terrain!: TerrainResult;
  private chunks = new Map<string, PropBatches>();
  private exteriors: ExteriorDef[] = [];
  private updaters: ((dt: number, t: number) => void)[] = [];
  private nodeTemplates = new Map<ResourceId, { base: Mesh; star: Mesh }>();
  private occupied: { x: number; z: number; r: number }[] = [];

  constructor(private g: Game) {
    this.root = new TransformNode("overworld", g.scene);
  }

  private chunk(x: number, z: number): PropBatches {
    const k = Math.floor(x / CHUNK) + "," + Math.floor(z / CHUNK);
    let c = this.chunks.get(k);
    if (!c) this.chunks.set(k, (c = makePropBatches(this.g.scene, "chunk" + k)));
    return c;
  }

  private col(c: Collider | Collider[] | undefined | null) {
    this.collision.add(c);
  }

  /** reserve a spot so scattered props don't overlap important things */
  private reserve(x: number, z: number, r: number) {
    this.occupied.push({ x, z, r });
  }
  private isFree(x: number, z: number, r: number, pathPad = 1.2) {
    if (nearPath(x, z, pathPad + r)) return false;
    if (isWater(x, z) || ellipseD(POND, x, z) < 1.12) return false;
    for (const o of this.occupied) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
    return true;
  }

  async build(progress: (p: number, msg: string) => void) {
    const scene = this.g.scene;
    const q = this.g.stage.quality;
    const R = rng(4242);
    this.terrain = buildTerrain(scene, q);
    this.terrain.ground.parent = this.root;
    this.terrain.water.parent = this.root;
    this.collision.bounds = { ...WORLD };
    // hills & water are walls
    this.collision.blockers.push((x, z) => walkField(x, z) > 0.97 || heightAt(x, z) > 0.9);
    this.collision.blockers.push((x, z) => ellipseD(POND, x, z) < 0.97);
    progress(0.25, "Building cozy cottages…");
    await nextFrame();

    /* ---------------- village ---------------- */
    for (const id of BUILDING_IDS) {
      const b = LOC.buildings[id];
      const ext = buildExterior(scene, id, new Vector3(b.x, heightAt(b.x, b.z), b.z), b.rot);
      ext.root.parent = this.root;
      this.exteriors.push(ext);
      this.col(ext.colliders);
      this.doors.set(id, ext.door.clone());
      this.reserve(b.x, b.z, 5.5);
      this.reserve(ext.door.x, ext.door.z - 1.5, 2.5);
      this.interacts.push({
        id: "door_" + id,
        pos: ext.door,
        r: 1.9,
        label: id === "home" ? "Go home" : "Enter",
        h: 2.4,
        run: () => this.g.enterBuilding(id),
      });
    }
    // plaza fountain
    const vc = this.chunk(0, 0);
    const fountain = addFountain(vc.main, 0, 0, {});
    fountain.water.parent = this.root;
    this.col(fountain.colliders);
    this.updaters.push((_dt, t) => fountain.update(t));
    this.reserve(0, 0, 9);
    this.interacts.push({
      id: "fountain",
      pos: new Vector3(0, 0.5, -2.6),
      r: 1.6,
      label: "Make a wish",
      run: async () => {
        audio.sfx("coin");
        this.g.fx.sparkles(new Vector3(0, 1.5, 0), 24, ["#bfe0f6", "#ffffff"]);
        const wishes = [
          "You wish for a hundred critter friends! The fountain sparkles happily.",
          "You wish for endless cookies. Somewhere, Granny Pom sneezes.",
          "You wish that everyone has a cozy day. The water glitters!",
          "You wish to see a rare-coloured critter. Keep your eyes open!",
        ];
        await this.g.ui.say([{ text: "✨ " + wishes[Math.floor(Math.random() * wishes.length)] }]);
      },
    });
    // plaza lamps & benches
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * 10.2,
        z = Math.sin(a) * 10.2;
      if (nearPath(x, z, 0.6)) continue;
      const lamp = addLamp(this.chunk(x, z).main, x, z, { y: heightAt(x, z) });
      this.col(lamp.collider);
      this.reserve(x, z, 1);
    }
    for (const [x, z, r] of [
      [-6.5, -6.5, Math.PI * 0.25],
      [6.5, 6.5, Math.PI * 1.25],
      [-6.5, 6.5, Math.PI * 0.75],
    ]) {
      this.col(addBench(this.chunk(x, z).main, x, z, { rotY: r, y: heightAt(x, z) }));
      this.reserve(x, z, 1.5);
    }
    // well, signpost
    this.col(addWell(vc.main, -9, -2, { y: 0 }));
    this.reserve(-9, -2, 1.8);
    this.addSignpost(5, 7, "🌸 North: Whisper Meadow\n🌲 West: Mossy Woods\n💧 East: Sparkle Pond & Critter Haven", 0.3);
    this.addSignpost(31, -1.5, "🏡 Critter Haven — homes for your critter friends!\nTalk to Bramble to build.", 0);
    // flower beds hugging houses
    for (const id of BUILDING_IDS) {
      const b = LOC.buildings[id];
      for (const sx of [-1, 1]) {
        const x = b.x + sx * 4.2,
          z = b.z - 3.2;
        if (!nearPath(x, z, 0.5)) addFlowerPatch(this.chunk(x, z).main, x, z, 1.0, { seed: Math.floor(x * 7 + z), y: heightAt(x, z), density: 0.8 });
      }
    }
    // gates (north / west / east) + fences filling the chokepoints
    this.makeGate(LOC.gateNorth.x, LOC.gateNorth.z, 0, [[-12, 34], [-1.7, 34]], [[1.7, 34], [12, 34]]);
    this.makeGate(LOC.gateWest.x, LOC.gateWest.z, Math.PI / 2, [[-51, -4], [-51, 4.3]], [[-51, 7.7], [-51, 16]]);
    this.makeGate(LOC.gateEast.x, LOC.gateEast.z, Math.PI / 2, [[67, -4], [67, 4.3]], [[67, 7.7], [67, 16]]);
    progress(0.4, "Growing trees…");
    await nextFrame();

    /* ---------------- scatter decoration by zone ---------------- */
    const scatter = (zone: ZoneId | "any", n: number, r: number, fn: (x: number, z: number, i: number) => void, pathPad = 1.2) => {
      let placed = 0,
        tries = 0;
      while (placed < n && tries++ < n * 40) {
        const x = WORLD.minX + R() * (WORLD.maxX - WORLD.minX);
        const z = WORLD.minZ + R() * (WORLD.maxZ - WORLD.minZ);
        if (walkField(x, z) > 0.86) continue;
        if (zone !== "any" && zoneAt(x, z) !== zone) continue;
        if (!this.isFree(x, z, r, pathPad)) continue;
        // keep haven plots & the plaza clear
        if (x > 22 && x < 54 && z > -22 && z < 2) continue;
        this.reserve(x, z, r);
        fn(x, z, placed++);
      }
    };
    const y = (x: number, z: number) => heightAt(x, z);
    // village greenery
    scatter("village", 26, 1.8, (x, z, i) => {
      const kinds: TreeKind[] = ["blossom", "round", "fruit", "round"];
      this.col(addTree(this.chunk(x, z).main, x, z, kinds[i % kinds.length], { seed: i * 13 + 1, y: y(x, z), scale: 0.85 + R() * 0.3 }));
    });
    scatter("village", 30, 1.0, (x, z, i) => this.col(addBush(this.chunk(x, z).main, x, z, { flowers: i % 2 === 0, seed: i + 300, y: y(x, z) })));
    scatter("village", 14, 1.2, (x, z, i) => addFlowerPatch(this.chunk(x, z).main, x, z, 0.9 + R() * 0.6, { seed: i + 500, y: y(x, z), density: 0.7 }), 0.6);
    // meadow: flowers everywhere, blossom trees, rocks
    scatter("meadow", 22, 2.0, (x, z, i) => this.col(addTree(this.chunk(x, z).main, x, z, i % 3 === 0 ? "fruit" : "blossom", { seed: i * 7 + 900, y: y(x, z), scale: 0.9 + R() * 0.35 })));
    scatter("meadow", 44, 1.2, (x, z, i) => addFlowerPatch(this.chunk(x, z).main, x, z, 1.3 + R() * 1.2, { seed: i + 1200, y: y(x, z), density: 0.75 }), 0.5);
    scatter("meadow", 18, 1.0, (x, z, i) => this.col(addBush(this.chunk(x, z).main, x, z, { flowers: true, seed: i + 1500, y: y(x, z) })));
    scatter("meadow", 14, 0.9, (x, z, i) => this.col(addRock(this.chunk(x, z).main, x, z, { seed: i + 1700, y: y(x, z), scale: 0.6 + R() * 0.6 })));
    // woods: dense trees, mushrooms, logs
    scatter("woods", 70, 2.1, (x, z, i) => {
      const kinds: TreeKind[] = ["round", "pine", "pine", "mushroomTree", "willow", "round"];
      this.col(addTree(this.chunk(x, z).main, x, z, kinds[i % kinds.length], { seed: i * 11 + 2000, y: y(x, z), scale: 0.95 + R() * 0.45 }));
    });
    scatter("woods", 45, 0.6, (x, z, i) => (i % 4 === 0 ? addGlowShroom : addMushroom)(this.chunk(x, z).main, x, z, { seed: i + 2400, y: y(x, z), scale: 0.8 + R() * 0.7 }), 0.6);
    scatter("woods", 10, 1.0, (x, z, i) => this.col(addStump(this.chunk(x, z).main, x, z, { seed: i + 2600, y: y(x, z) })));
    scatter("woods", 6, 2.0, (x, z, i) => this.col(addLog(this.chunk(x, z).main, x, z, { seed: i + 2700, y: y(x, z), rotY: R() * 3 })));
    scatter("woods", 25, 1.0, (x, z, i) => this.col(addBush(this.chunk(x, z).main, x, z, { seed: i + 2800, y: y(x, z) })));
    scatter("woods", 12, 0.9, (x, z, i) => this.col(addRock(this.chunk(x, z).main, x, z, { seed: i + 2900, y: y(x, z), moss: true })));
    // pond: reeds and lily pads around the water, willows
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 + R() * 0.1;
      const k = 0.92 + R() * 0.12;
      const x = POND.cx + Math.cos(a) * POND.rx * k,
        z = POND.cz + Math.sin(a) * POND.rz * k;
      if (nearPath(x, z, 0.4)) continue;
      if (i % 2 === 0) addReeds(this.chunk(x, z).main, x, z, { seed: i + 3000, y: Math.max(y(x, z), -0.5) });
    }
    for (let i = 0; i < 22; i++) {
      const a = R() * Math.PI * 2,
        k = 0.25 + R() * 0.55;
      const x = POND.cx + Math.cos(a) * POND.rx * k,
        z = POND.cz + Math.sin(a) * POND.rz * k;
      addLilyPad(this.chunk(x, z).main, x, z, { flower: i % 3 === 0, seed: i + 3100, y: -0.42, scale: 0.8 + R() * 0.6 });
    }
    scatter("pond", 16, 2.0, (x, z, i) => this.col(addTree(this.chunk(x, z).main, x, z, i % 2 ? "willow" : "round", { seed: i * 5 + 3200, y: y(x, z) })));
    scatter("pond", 14, 0.9, (x, z, i) => this.col(addRock(this.chunk(x, z).main, x, z, { seed: i + 3300, y: y(x, z), scale: 0.5 + R() * 0.6 })));
    scatter("pond", 10, 1.1, (x, z, i) => addFlowerPatch(this.chunk(x, z).main, x, z, 1.1, { seed: i + 3400, y: y(x, z), palette: ["#bfe0f6", "#ffffff", "#cdb9f0"], density: 0.8 }), 0.5);
    // a little fishing dock
    this.col(addBridge(this.chunk(POND.cx - POND.rx, POND.cz).main, POND.cx - POND.rx + 2.2, POND.cz - 4, 7, Math.PI / 2, { y: -0.1 }));
    // cave mouth
    const cm = addCaveMouth(this.chunk(LOC.caveMouth.x, LOC.caveMouth.z).main, LOC.caveMouth.x, LOC.caveMouth.z, 0, { y: heightAt(LOC.caveMouth.x, LOC.caveMouth.z - 2) });
    this.col(cm.colliders);
    this.col(
      addCliff(
        this.chunk(LOC.caveMouth.x, LOC.caveMouth.z).main,
        [
          [-62, 108],
          [-54, 116],
          [-47.5, 118.5],
        ],
        6.5,
        { y: heightAt(LOC.caveMouth.x, LOC.caveMouth.z - 2), seed: 11 },
      ),
    );
    this.col(
      addCliff(
        this.chunk(LOC.caveMouth.x, LOC.caveMouth.z).main,
        [
          [-38.5, 118.5],
          [-32, 116],
          [-24, 108],
        ],
        6.5,
        { y: heightAt(LOC.caveMouth.x, LOC.caveMouth.z - 2), seed: 12 },
      ),
    );
    this.caveEntrance = cm.entrance.clone();
    this.reserve(LOC.caveMouth.x, LOC.caveMouth.z, 6);
    this.interacts.push({
      id: "cave",
      pos: cm.entrance,
      r: 2.4,
      label: "Enter cave",
      h: 2.6,
      run: async () => {
        if (!this.g.state.keyItems.lantern && !this.g.partyHas("glowbat")) {
          await this.g.ui.say([{ text: "It's very dark inside... You hear tiny squeaks echoing. You'll need a light to explore safely. Maybe *Professor Hoot* can help." }]);
          return;
        }
        audio.sfx("whoosh");
        await this.g.goTo("cave");
      },
    });
    this.addSignpost(-36, 101, "🕳️ Crystal Cave\nIt's dark in there! Bring a light.", 0.4);
    this.addSignpost(6, 44, "🌸 Whisper Meadow\nPuffbuns & Chirpies love the flowers!", 0);
    this.addSignpost(-60, 10, "🌲 Mossy Woods\nFoxes, hedgehogs & mushroom sprites!", 0.2);
    this.addSignpost(75, 9, "💧 Sparkle Pond\nFrogs & ducklings splash here!", -0.3);
    progress(0.55, "Planting the hills…");
    await nextFrame();

    /* ---------------- backdrop trees on the hills (thin instances) ---------------- */
    this.buildBackdrop(R);

    /* ---------------- build chunk meshes ---------------- */
    for (const [, c] of this.chunks) {
      const lowQ = this.g.stage.quality === "low";
      const ms = c.build(null, { main: lowQ ? { castShadow: false } : {}, leaves: { castShadow: false } });
      ms.forEach((m) => {
        m.parent = this.root;
        m.freezeWorldMatrix();
        m.isPickable = false;
      });
    }
    progress(0.65, "Sprinkling grass…");
    await nextFrame();

    /* ---------------- grass ---------------- */
    const density = q === "low" ? 0.18 : q === "medium" ? 0.32 : 0.5;
    const exclude = (x: number, z: number) =>
      walkField(x, z) > 0.9 || nearPath(x, z, 0.3) || ellipseD(POND, x, z) < 1.12 || this.occupied.some((o) => o.r > 3 && Math.hypot(o.x - x, o.z - z) < o.r * 0.8);
    let gseed = 77;
    for (let gx = -125; gx < 135; gx += 32)
      for (let gz = -35; gz < 125; gz += 32) {
        // skip cells that are entirely hills
        let any = false;
        for (let sx = 0; sx <= 4 && !any; sx++) for (let sz = 0; sz <= 4 && !any; sz++) any = walkField(gx + sx * 8, gz + sz * 8) < 0.9;
        if (!any) continue;
        const gm = makeGrassField(scene, { minX: gx, maxX: gx + 32, minZ: gz, maxZ: gz + 32 }, density, exclude, gseed++, 0.02);
        gm.parent = this.root;
      }
    // fireflies / pollen motes
    const motes: Motes[] = [
      makeMotes(scene, { minX: -40, maxX: 40, minZ: 45, maxZ: 115 }, q === "low" ? 30 : 70, { colors: ["#fff6c8", "#ffe0f0", "#ffffff"], seed: 3, accept: (x, z) => walkField(x, z) < 0.9 }),
      makeMotes(scene, { minX: -115, maxX: -55, minZ: -20, maxZ: 85 }, q === "low" ? 30 : 70, { colors: ["#e8ffb0", "#c8ffe8"], seed: 4, accept: (x, z) => walkField(x, z) < 0.9 }),
    ];
    motes.forEach((m) => {
      m.mesh.parent = this.root;
      this.updaters.push((_dt, t) => m.update(t));
    });
    this.buildButterflies(q === "low" ? 10 : 18);
    progress(0.72, "Inviting critters…");
    await nextFrame();

    /* ---------------- resources, pickups, critters ---------------- */
    this.buildNodeTemplates();
    const owLoc = { interacts: this.interacts } as Location;
    const res: [ZoneId, ResourceId, number][] = [
      ["meadow", "petal", 9],
      ["village", "petal", 2],
      ["woods", "twig", 8],
      ["village", "twig", 2],
      ["woods", "berry", 7],
      ["pond", "pebble", 8],
    ];
    for (const [zone, kind, n] of res) {
      scatter(zone, n, 1.0, (x, z) => this.addResourceNode(owLoc, kind, new Vector3(x, heightAt(x, z), z)), 0.4);
    }
    // stitch's yarn
    const yarnSpots: [string, number, number, string][] = [
      ["yarn_meadow", 24, 64, "#f8b9cb"],
      ["yarn_woods", -98, 44, "#bfe0f6"],
      ["yarn_pond", 92, 46, "#fbe7a1"],
    ];
    for (const [id, x, z, c] of yarnSpots) {
      const m = this.makeYarn(c);
      m.position.set(x, heightAt(x, z) + 0.35, z);
      m.parent = this.root;
      const p: Pickup = { id, kind: "yarn", pos: new Vector3(x, heightAt(x, z), z), mesh: m, visible: () => this.g.story.active("yarn") && !this.g.state.taken.includes(id) };
      this.pickups.push(p);
      this.updaters.push((_dt, t) => {
        if (m.isEnabled()) {
          m.rotation.y = t * 1.2;
          m.position.y = p.pos.y + 0.35 + Math.sin(t * 2.5) * 0.08;
        }
      });
      this.interacts.push({ id: "pick_" + id, pos: p.pos, r: 1.6, label: "Pick up", enabled: () => p.visible(), run: () => this.g.collectPickup(p) });
    }
    // wild critters
    const table: Record<string, SpeciesId[]> = {
      meadow: ["puffbun", "puffbun", "chirpy", "puffbun", "chirpy", "puffbun", "chirpy"],
      woods: ["fennix", "hoglet", "shroomy", "fennix", "hoglet", "shroomy", "shroomy", "fennix"],
      pond: ["ribbit", "duckling", "ribbit", "duckling", "ribbit", "duckling"],
    };
    for (const [zone, list] of Object.entries(table)) {
      scatter(
        zone as ZoneId,
        list.length,
        2.5,
        (x, z, i) => {
          const s = list[i];
          const w = new WildCritter(scene, `${zone}_${i}`, s, R() < 0.08 ? 1 : 0, new Vector3(x, heightAt(x, z), z), 5);
          w.model.root.parent = null;
          this.wild.push(w);
        },
        0.5,
      );
    }
    void SPECIES;
    progress(0.82, "Almost there…");
  }

  /* ------------------------------------------------------------------ */

  private addSignpost(x: number, z: number, text: string, rotY: number) {
    this.col(addSign(this.chunk(x, z).main, x, z, { rotY, y: heightAt(x, z), arrow: true }));
    this.reserve(x, z, 1.2);
    this.interacts.push({
      id: "sign_" + x + "_" + z,
      pos: new Vector3(x, heightAt(x, z), z),
      r: 1.7,
      label: "Read",
      run: async () => {
        await this.g.ui.say(text.split("\n").length > 1 ? [{ text: text.replace(/\n/g, " · ") }] : [{ text }]);
      },
    });
  }

  private buildButterflies(n: number) {
    const scene = this.g.scene;
    const cols = ["#f8b9cb", "#fbe7a1", "#bfe0f6", "#cdb9f0", "#ffffff", "#ffc59e"];
    const R = rng(91);
    // white templates tinted per instance → a couple of draw calls for every butterfly
    const wb = new Batch(scene, "wingTpl");
    wb.add(blob(scene, 0.16, 0.012, 0.13, { pos: [0.15, 0, 0.04], color: "#ffffff" }, 6));
    wb.add(blob(scene, 0.11, 0.012, 0.09, { pos: [0.11, 0, -0.1], color: "#ffffff" }, 6));
    const wingTpl = wb.build({ outline: 0.012, castShadow: false })!;
    wingTpl.registerInstancedBuffer("color", 4);
    wingTpl.instancedBuffers.color = new Color4(1, 1, 1, 1);
    wingTpl.isVisible = false;
    const bb = new Batch(scene, "bodyTpl");
    bb.add(blob(scene, 0.03, 0.03, 0.12, { color: "ink" }, 5));
    const bodyTpl = bb.build({ outline: false, castShadow: false })!;
    bodyTpl.isVisible = false;
    for (let i = 0; i < n; i++) {
      const c = Color4.FromHexString(cols[i % cols.length] + "ff");
      const body = new TransformNode("bfly", scene);
      body.parent = this.root;
      const bm = bodyTpl.createInstance("bb" + i);
      bm.parent = body;
      const hinges: TransformNode[] = [];
      for (const side of [-1, 1]) {
        const hinge = new TransformNode("hinge", scene);
        hinge.parent = body;
        hinge.rotation.y = side < 0 ? Math.PI : 0;
        const w = wingTpl.createInstance("w" + i + side);
        w.instancedBuffers.color = c;
        w.parent = hinge;
        hinges.push(hinge);
      }
      const home = i % 2 ? new Vector3((R() - 0.5) * 60, 0, 50 + R() * 50) : new Vector3((R() - 0.5) * 50, 0, (R() - 0.5) * 40);
      const ph = R() * 100;
      const sp = 0.25 + R() * 0.2;
      this.updaters.push((_dt, t) => {
        const tt = t * sp + ph;
        const x = home.x + Math.sin(tt) * 6 + Math.sin(tt * 2.3) * 2;
        const z = home.z + Math.cos(tt * 0.8) * 5 + Math.sin(tt * 1.7) * 2;
        const y = heightAt(x, z) + 1.3 + Math.sin(tt * 3.1) * 0.5;
        const dx = Math.cos(tt) * 6 + Math.cos(tt * 2.3) * 4.6,
          dz = -Math.sin(tt * 0.8) * 4 + Math.cos(tt * 1.7) * 3.4;
        body.position.set(x, y, z);
        body.rotation.y = Math.atan2(dx, dz);
        const flap = Math.sin(t * 18 + ph) * 0.9;
        hinges[0].rotation.z = flap;
        hinges[1].rotation.z = flap;
      });
    }
  }

  private makeGate(x: number, z: number, rotY: number, f1: [number, number][], f2: [number, number][]) {
    const gate = addGate(this.g.scene, x, z, { rotY, y: heightAt(x, z) });
    gate.root.parent = this.root;
    this.col(gate.posts);
    this.col(gate.blocker);
    for (const f of [f1, f2]) {
      const [[x1, z1], [x2, z2]] = f;
      this.col(addFence(this.chunk(x1, z1).main, x1, z1, x2, z2, { y: heightAt((x1 + x2) / 2, (z1 + z2) / 2) }));
    }
    this.reserve(x, z, 4);
    this.gates.push({ gate, pos: new Vector3(x, heightAt(x, z), z) });
  }

  setGates(closed: boolean, animate: boolean) {
    if (closed === this.gatesClosed && !animate) {
      this.gates.forEach((g) => g.gate.setOpen(closed ? 0 : 1));
      return;
    }
    this.gatesClosed = closed;
    for (const { gate, pos } of this.gates) {
      if (closed) this.collision.add(gate.blocker);
      else this.collision.remove(gate.blocker);
      if (!animate) gate.setOpen(closed ? 0 : 1);
      else {
        const t0 = performance.now();
        const from = closed ? 1 : 0,
          to = closed ? 0 : 1;
        const step = () => {
          const t = Math.min(1, (performance.now() - t0) / 1200);
          const e = t < 1 ? 1 - Math.pow(1 - t, 3) : 1;
          gate.setOpen(from + (to - from) * e);
          if (t < 1) requestAnimationFrame(step);
        };
        step();
        this.g.fx.sparkles(pos.add(new Vector3(0, 2, 0)), 20);
      }
    }
    if (animate) audio.sfx("door");
  }

  private buildBackdrop(R: () => number) {
    const scene = this.g.scene;
    const kinds: TreeKind[] = ["round", "pine", "blossom", "round"];
    // purpose-built low-poly backdrop trees; built per spatial cell so frustum culling works
    const makeTemplate = (k: TreeKind, i: number, cell: string) => {
      const b = new Batch(scene, "bk_" + k + i + "_" + cell);
      const leafA = k === "blossom" ? "#ffc9dc" : k === "pine" ? "#7fc98a" : i === 3 ? "#a6dc8a" : "#93d47f";
      const leafB = k === "blossom" ? "#f39bbb" : k === "pine" ? "#4f9f68" : "#62b46f";
      b.add(softCyl(scene, 1.6, 0.22, 0.32, { color: "woodDeep", bottom: "woodDark" }, 0.08, 6));
      if (k === "pine") {
        b.add(cone(scene, 2.6, 1.7, { pos: [0, 1.2, 0], color: leafA, bottom: leafB }, 7));
        b.add(cone(scene, 2.1, 1.3, { pos: [0, 2.6, 0], color: leafA, bottom: leafB }, 7));
        b.add(cone(scene, 1.5, 0.85, { pos: [0, 3.8, 0], color: leafA, bottom: leafB }, 7));
      } else {
        b.add(ball(scene, 1.55, { pos: [0, 2.9, 0], color: leafA, bottom: leafB }, 5));
        b.add(ball(scene, 1.1, { pos: [0.95, 2.35, 0.2], color: leafA, bottom: leafB }, 4));
        b.add(ball(scene, 1.05, { pos: [-0.9, 2.45, -0.3], color: leafA, bottom: leafB }, 4));
      }
      const m = b.build({ outline: 0.05, castShadow: false })!;
      m.parent = this.root;
      return m;
    };
    const cells = new Map<string, Matrix[][]>();
    const q = this.g.stage.quality;
    const step = q === "low" ? 6.5 : 5.2;
    const CELL = 40;
    for (let x = WORLD.minX + 2; x < WORLD.maxX - 2; x += step) {
      for (let z = WORLD.minZ + 2; z < WORLD.maxZ - 2; z += step) {
        const jx = x + (R() - 0.5) * step * 0.9,
          jz = z + (R() - 0.5) * step * 0.9;
        const w = walkField(jx, jz);
        if (w < 0.98 || w > 2.2) continue;
        // keep distant hills sparser
        if (w > 1.6 && R() < 0.55) continue;
        if (Math.hypot(jx - LOC.caveMouth.x, jz - LOC.caveMouth.z) < 9) continue;
        const k = zoneAt(jx, jz) === "woods" ? (R() < 0.6 ? 1 : 0) : zoneAt(jx, jz) === "meadow" ? (R() < 0.4 ? 2 : 0) : Math.floor(R() * 4);
        const sc = 1.0 + R() * 0.8 + Math.min(0.6, (w - 1) * 0.6);
        const key = Math.floor(jx / CELL) + "," + Math.floor(jz / CELL);
        let c = cells.get(key);
        if (!c) cells.set(key, (c = kinds.map(() => [])));
        c[k].push(Matrix.Compose(new Vector3(sc, sc, sc), Quaternion.FromEulerAngles(0, R() * Math.PI * 2, 0), new Vector3(jx, heightAt(jx, jz) - 0.1, jz)));
      }
    }
    for (const [key, perKind] of cells) {
      perKind.forEach((mats, i) => {
        if (!mats.length) return;
        const m = makeTemplate(kinds[i], i, key);
        const buf = new Float32Array(mats.length * 16);
        mats.forEach((mm, j) => mm.copyToArray(buf, j * 16));
        m.thinInstanceSetBuffer("matrix", buf, 16, true);
        m.thinInstanceRefreshBoundingInfo(false);
        m.isPickable = false;
        m.freezeWorldMatrix();
      });
    }
  }

  private buildNodeTemplates() {
    const scene = this.g.scene;
    const mk = (kind: ResourceId, build: (b: Batch) => void) => {
      const b = new Batch(scene, "node_" + kind);
      build(b);
      const base = b.build({ outline: 0.03 })!;
      const sb = new Batch(scene, "nodestar_" + kind);
      // little floating 4-point sparkle
      sb.add(blob(scene, 0.06, 0.24, 0.06, { color: "#fff6c0" }, 6));
      sb.add(blob(scene, 0.24, 0.06, 0.06, { color: "#fff6c0" }, 6));
      const star = sb.build({ outline: 0.015, emissive: "#ffe9a0", castShadow: false })!;
      // hide the sources but keep their instances visible
      base.isVisible = false;
      star.isVisible = false;
      base.position.y = -50;
      star.position.y = -50;
      this.nodeTemplates.set(kind, { base, star });
    };
    mk("petal", (b) => {
      const cols = ["#ffb3cf", "#ffd7e6", "#ff9fc0"];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const x = Math.cos(a) * 0.35,
          z = Math.sin(a) * 0.35;
        b.add(softCyl(scene, 0.5, 0.03, 0.035, { pos: [x, 0, z], color: "leafDeep" }, 0.01, 6));
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * Math.PI * 2;
          b.add(blob(scene, 0.13, 0.05, 0.08, { pos: [x + Math.cos(pa) * 0.12, 0.52, z + Math.sin(pa) * 0.12], rot: [0, -pa, 0.25], color: cols[i % 3] }, 6));
        }
        b.add(ball(scene, 0.07, { pos: [x, 0.55, z], color: "butterDeep" }, 6));
      }
      b.add(ball(scene, 0.32, { pos: [0, 0.12, 0], scale: [1.3, 0.5, 1.3], color: "leaf", bottom: "leafDeep" }, 8));
    });
    mk("twig", (b) => {
      for (let i = 0; i < 4; i++) b.add(softCyl(scene, 1.0, 0.05, 0.06, { pos: [-0.4 + i * 0.05, 0.12 + (i % 2) * 0.1, -0.2 + i * 0.12], rot: [0, i * 0.5, Math.PI / 2 - 0.1], color: i % 2 ? "woodDeep" : "wood" }, 0.02, 6));
      b.add(blob(scene, 0.12, 0.05, 0.08, { pos: [0.1, 0.3, 0.1], color: "leaf" }, 6));
      b.add(torus(scene, 0.12, 0.04, { pos: [0, 0.18, 0], rot: [0, 0, Math.PI / 2], color: "pink" }, 10));
    });
    mk("berry", (b) => {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.add(ball(scene, 0.42, { pos: [Math.cos(a) * 0.32, 0.42, Math.sin(a) * 0.32], color: i % 2 ? "leaf" : "leafLight", bottom: "leafDeep" }, 8));
      }
      b.add(ball(scene, 0.45, { pos: [0, 0.75, 0], color: "leafLight", bottom: "leaf" }, 8));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.add(ball(scene, 0.09, { pos: [Math.cos(a) * 0.62, 0.45 + (i % 3) * 0.2, Math.sin(a) * 0.62], color: i % 2 ? "red" : "rose" }, 6));
      }
    });
    mk("pebble", (b) => {
      const cols = ["#d9d4e3", "#c7e3f0", "#f0d9e6", "#e8e2f4"];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add(blob(scene, 0.2, 0.1, 0.15, { pos: [Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3], rot: [0, a, 0], color: cols[i % 4] }, 8));
      }
      b.add(blob(scene, 0.24, 0.13, 0.2, { pos: [0, 0.14, 0], color: "#bfe0f6" }, 8));
    });
    mk("crystal", (b) => {
      const cols = ["#d9c2ff", "#f6c2e6", "#bfe0f6"];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.add(cone(scene, 0.8 + (i % 2) * 0.4, 0.18, { pos: [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], color: cols[i % 3] }, 6));
      }
      b.add(cone(scene, 1.3, 0.24, { pos: [0, 0, 0], color: "#e8d6ff" }, 6));
    });
  }

  addResourceNode(L: Location | { interacts: Interact[] }, kind: ResourceId, p: Vector3) {
    const tpl = this.nodeTemplates.get(kind);
    if (!tpl) return;
    const id = `res_${kind}_${Math.round(p.x)}_${Math.round(p.z)}`;
    const inst = tpl.base.createInstance(id);
    inst.position.copyFrom(p);
    inst.rotation.y = (p.x * 13.1 + p.z * 7.7) % 6.28;
    const star = tpl.star.createInstance(id + "_s");
    star.position.set(p.x, p.y + 1.4, p.z);
    // overworld nodes hang off the overworld root (at the origin); interior ones live far away unparented
    if (!(L as Location).root) {
      inst.parent = this.root;
      star.parent = this.root;
    }
    const node: ResourceNode = {
      id,
      kind,
      pos: p.clone(),
      readyAt: 0,
      setReady: (on) => {
        star.setEnabled(on);
        inst.scaling.setAll(on ? 1 : 0.55);
      },
    };
    this.updaters.push((_dt, t) => {
      if (this.g.time >= node.readyAt && !star.isEnabled()) node.setReady(true);
      if (star.isEnabled()) {
        star.rotation.y = t * 2;
        star.position.y = p.y + 1.3 + Math.sin(t * 3 + p.x) * 0.12;
        const s = 0.8 + Math.sin(t * 5 + p.z) * 0.2;
        star.scaling.setAll(s);
      }
    });
    const label: Record<ResourceId, string> = { petal: "Pick petals", twig: "Gather twigs", berry: "Pick berries", pebble: "Collect pebbles", crystal: "Mine crystals" };
    L.interacts.push({
      id,
      pos: p,
      r: 1.7,
      label: label[kind],
      enabled: () => this.g.time >= node.readyAt,
      run: () => this.g.gather(L as Location, node),
    });
    if (kind === "pebble" || kind === "petal" || kind === "crystal") return;
    this.collision.add({ kind: "circle", x: p.x, z: p.z, r: kind === "berry" ? 0.7 : 0.3 });
  }

  private makeYarn(color: string): Mesh {
    const scene = this.g.scene;
    const b = new Batch(scene, "yarn");
    b.add(ball(scene, 0.32, { color }, 12));
    for (let i = 0; i < 4; i++) b.add(torus(scene, 0.3, 0.04, { rot: [i * 0.8, i * 0.5, 0.3], color: "#ffffff" }, 16));
    b.add(softCyl(scene, 0.5, 0.025, 0.025, { pos: [0.25, -0.3, 0.1], rot: [0, 0, 1.2], color }, 0.01, 6));
    return b.build({ outline: 0.025 })!;
  }

  refreshPickups() {
    for (const p of this.pickups) p.mesh.setEnabled(p.visible());
  }

  makeChest(p: Vector3): Mesh {
    const scene = this.g.scene;
    const b = new Batch(scene, "chest");
    b.add(softBox(scene, 1.4, 0.8, 0.95, { pos: [p.x, p.y + 0.4, p.z], color: "#f0b3cf", bottom: "#d98fb3" }, 0.14));
    b.add(softBox(scene, 1.5, 0.12, 1.05, { pos: [p.x, p.y + 0.15, p.z], color: "butterDeep" }, 0.05));
    b.add(softBox(scene, 0.25, 0.3, 0.1, { pos: [p.x, p.y + 0.6, p.z - 0.5], color: "butter" }, 0.05));
    const body = b.build({ outline: 0.035 })!;
    const lb = new Batch(scene, "chestLid");
    lb.add(softBox(scene, 1.5, 0.42, 1.05, { pos: [0, 0.18, 0.5], color: "#f6c6dc", bottom: "#f0b3cf" }, 0.2));
    lb.add(blob(scene, 0.22, 0.2, 0.08, { pos: [0, 0.18, 0.0], color: "#fff3a6" }, 8));
    const lid = lb.build({ outline: 0.035 })!;
    const pivot = new TransformNode("lidPivot", scene);
    pivot.position.set(p.x, p.y + 0.8, p.z + 0.5);
    lid.parent = pivot;
    lid.position.z = -0.5;
    pivot.parent = body;
    body.metadata = { pivot, glowAt: p };
    return body;
  }

  openChest(chest: Mesh) {
    const pivot = chest.metadata.pivot as TransformNode;
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 600);
      pivot.rotation.x = -t * 1.9 * (1 + Math.sin(t * Math.PI) * 0.1);
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }

  update(dt: number, t: number) {
    this.terrain.update(t);
    for (const u of this.updaters) u(dt, t);
    for (const e of this.exteriors) e.update?.(dt, t);
    void ZONE_SHAPES;
  }
}

function nextFrame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
