import { Vector3, MeshBuilder, type Mesh, TransformNode } from "@babylonjs/core";
import type { Game } from "./Game";
import { Batch, ball, softCyl, torus, blob, disc } from "../render/Shapes";
import { toonMat } from "../render/Toon";
import { col } from "../render/Palette";
import { FISH, FISH_IDS, type FishId } from "../data/fishing";
import { POND, WATER_Y, heightAt } from "../world/layout";
import { audio } from "../audio/Audio";
import { input } from "../core/Input";
import { h } from "../ui/dom";

/**
 * Fishing at Sparkle Pond: cast → wait for a nibble → tap when the bobber dips → reel
 * (hold to lift the net so it stays over the fish until the catch meter fills).
 * Forgiving for little hands: generous windows, no line-snapping, "try again" anytime.
 */
export class Fishing {
  spots: { pos: Vector3; water: Vector3; ring: Mesh }[] = [];
  private rod: TransformNode | null = null;
  private bobber: Mesh | null = null;
  private line: Mesh | null = null;
  busy = false;

  constructor(private g: Game) {}

  /** Fishing spots around the pond, each with a rippling ring on the water. */
  init() {
    const scene = this.g.scene;
    const angles = [Math.PI, -Math.PI / 2 - 0.25, 0.6, Math.PI * 0.62];
    const rb = new Batch(scene, "ripple");
    rb.add(torus(scene, 1, 0.05, { rot: [0, 0, 0], color: "#ffffff" }, 28));
    const ringTpl = rb.build({ outline: false, emissive: "#9fc8dd", castShadow: false })!;
    ringTpl.isVisible = false;
    ringTpl.position.y = -60;
    angles.forEach((a, i) => {
      const pos = new Vector3(POND.cx + Math.cos(a) * POND.rx * 1.06, 0, POND.cz + Math.sin(a) * POND.rz * 1.06);
      pos.y = heightAt(pos.x, pos.z);
      const water = new Vector3(POND.cx + Math.cos(a) * POND.rx * 0.72, WATER_Y + 0.05, POND.cz + Math.sin(a) * POND.rz * 0.72);
      const ring = ringTpl.clone("ripple" + i)!;
      ring.isVisible = true;
      ring.position.copyFrom(water);
      ring.parent = this.g.world.root;
      this.spots.push({ pos, water, ring });
      this.g.world.interacts.push({
        id: "fish_" + i,
        pos,
        r: 2.4,
        h: 1.8,
        label: () => (this.g.state.keyItems.rod ? "Fish 🎣" : "Ripples…"),
        run: () => this.fishAt(i),
      });
      this.g.world.updaters.push((_dt, t) => {
        const k = (t * 0.45 + i * 0.3) % 1;
        ring.scaling.setAll(0.4 + k * 1.8);
        ring.position.y = WATER_Y + 0.05 + Math.sin(t * 2 + i) * 0.02;
        (ring as unknown as { visibility: number }).visibility = 1 - k;
      });
    });
  }

  private buildGear() {
    if (this.rod) return;
    const scene = this.g.scene;
    const b = new Batch(scene, "rod");
    b.add(softCyl(scene, 1.7, 0.02, 0.035, { rot: [0, 0, 0], color: "woodDeep" }, 0.01, 6));
    b.add(softCyl(scene, 0.25, 0.05, 0.05, { pos: [0, 0.05, 0], color: "pink" }, 0.02, 8));
    b.add(torus(scene, 0.07, 0.025, { pos: [0.06, 0.35, 0], rot: [0, Math.PI / 2, 0], color: "sky" }, 10));
    const rodMesh = b.build({ outline: 0.015, castShadow: false })!;
    const rod = new TransformNode("rodRoot", scene);
    rodMesh.parent = rod;
    this.rod = rod;
    const bb = new Batch(scene, "bobber");
    bb.add(ball(scene, 0.13, { color: "white" }, 10));
    bb.add(blob(scene, 0.135, 0.07, 0.135, { pos: [0, 0.04, 0], color: "red" }, 10));
    bb.add(softCyl(scene, 0.12, 0.015, 0.015, { pos: [0, 0.1, 0], color: "ink" }, 0.005, 5));
    bb.add(disc(scene, 0.17, 0.02, { pos: [0, -0.05, 0], color: "#d6f0fa" }, 12));
    this.bobber = bb.build({ outline: 0.012, castShadow: false })!;
    this.line = MeshBuilder.CreateTube("line", { path: [Vector3.Zero(), new Vector3(0, 0.5, 0), new Vector3(0, 1, 0)], radius: 0.008, updatable: true }, scene);
    this.line.material = toonMat(scene, { name: "fishLine", emissive: "#ffffff" });
    this.line.isPickable = false;
    void col;
    this.setGear(false);
  }

  private setGear(on: boolean) {
    this.rod?.setEnabled(on);
    this.bobber?.setEnabled(on);
    this.line?.setEnabled(on);
  }

  /** place the rod in the player's hands and run the line to the bobber */
  private poseGear(bob: Vector3, bend = 0) {
    const p = this.g.player;
    const r = this.rod!;
    const fx = Math.sin(p.rot),
      fz = Math.cos(p.rot);
    const rx = Math.cos(p.rot),
      rz = -Math.sin(p.rot);
    r.position.set(p.pos.x + fx * 0.35 + rx * 0.25, p.pos.y + 0.7, p.pos.z + fz * 0.35 + rz * 0.25);
    r.rotation.set(0.9 + bend, p.rot, 0);
    r.computeWorldMatrix(true);
    const tip = Vector3.TransformCoordinates(new Vector3(0, 1.7, 0), r.getWorldMatrix());
    this.bobber!.position.copyFrom(bob);
    const mid = Vector3.Lerp(tip, bob, 0.5);
    mid.y -= 0.25 + bend * 0.3;
    MeshBuilder.CreateTube("line", { path: [tip, mid, bob.add(new Vector3(0, 0.1, 0))], radius: 0.008, instance: this.line! });
  }

  private pickFish(): FishId {
    const lure = (this.g.state.keyItems.lure ?? 0) > 0;
    const lucky = this.g.life.buffActive("lucky");
    let total = 0;
    const w = FISH_IDS.map((id) => {
      const f = FISH[id];
      let k = f.weight;
      if (f.difficulty >= 3 && lure) k *= 2;
      if (f.difficulty >= 3 && lucky) k *= 1.5;
      total += k;
      return k;
    });
    let r = Math.random() * total;
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) return FISH_IDS[i];
    }
    return "guppy";
  }

  async fishAt(i: number) {
    const g = this.g;
    if (!g.state.keyItems.rod) {
      await g.ui.say([{ text: "Little fish are rippling the water! If only you had a fishing rod... *Marina* by the pond might help." }]);
      return;
    }
    if (this.busy) return;
    this.busy = true;
    const s = this.spots[i];
    g.player.face(s.water);
    this.buildGear();
    this.setGear(true);
    const prevHud = g.ui.hud.style.display;
    try {
      // cast!
      audio.sfx("whoosh");
      const from = g.player.pos.add(new Vector3(0, 1.8, 0));
      const target = s.water.add(new Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
      await this.animate(0.55, (k) => {
        const p = Vector3.Lerp(from, target, k);
        p.y += Math.sin(k * Math.PI) * 1.4;
        this.poseGear(p, -0.4 * (1 - k));
      });
      audio.sfx("splash", { volume: 0.6 });
      g.fx.puff(target, 4, "#d6f0fa");
      const ui = new FishingUI(g);
      const fish = this.pickFish();
      const info = FISH[fish];
      // wait for a nibble (with a couple of teasing fake nibbles)
      ui.status("Wait for a nibble…", "🎣");
      const wait = 1.6 + Math.random() * 2.8;
      let t = 0,
        nextFake = 0.8 + Math.random();
      let bite = false,
        hooked = false,
        early = false;
      await new Promise<void>((done) => {
        const off = input.onPress((b) => {
          if (b === "b") {
            early = true;
            finish();
          }
          if (b !== "a") return;
          if (bite) {
            hooked = true;
            finish();
          }
        });
        ui.onTap = () => {
          if (bite) {
            hooked = true;
            finish();
          }
        };
        let last = performance.now();
        let biteT = 0;
        let raf = 0;
        const step = () => {
          const now = performance.now();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          t += dt;
          let dip = Math.sin(t * 3) * 0.03;
          if (!bite && t > nextFake && t < wait - 0.4) {
            dip -= 0.06;
            if (t > nextFake + 0.15) nextFake = t + 0.9 + Math.random();
          }
          if (!bite && t >= wait) {
            bite = true;
            biteT = 0;
            audio.sfx("splash");
            audio.sfx("countdown", { pitch: 1.4 });
            g.fx.puff(target, 8, "#ffffff");
            ui.status("A bite! TAP NOW!", "❗", true);
          }
          if (bite) {
            biteT += dt;
            dip = -0.22 + Math.sin(biteT * 30) * 0.04;
            if (biteT > 1.6) finish();
          }
          this.poseGear(target.add(new Vector3(0, dip, 0)), bite ? 0.25 : 0);
          raf = requestAnimationFrame(step);
        };
        const finish = () => {
          off();
          ui.onTap = null;
          cancelAnimationFrame(raf);
          done();
        };
        raf = requestAnimationFrame(step);
      });
      if (early) {
        ui.close();
        return;
      }
      if (!hooked) {
        ui.status("It got away… try again!", "💦");
        audio.sfx("fail", { volume: 0.5 });
        await wait_(1200);
        ui.close();
        return;
      }
      // reel it in
      audio.sfx("confirm");
      const won = await ui.reel(info.difficulty, (bend) => this.poseGear(target.add(new Vector3(0, -0.15, 0)), bend));
      if (!won) {
        ui.status(`The ${info.junk ? "thing" : "fish"} slipped away! So close!`, "💦");
        audio.sfx("fail", { volume: 0.5 });
        await wait_(1300);
        ui.close();
        return;
      }
      const size = Math.round(info.size[0] + Math.random() * (info.size[1] - info.size[0]));
      ui.close();
      // reel animation: the catch flies to the player
      await this.animate(0.45, (k) => this.poseGear(Vector3.Lerp(target, g.player.pos.add(new Vector3(0, 1.4, 0)), k), 0.4 * (1 - k)));
      await this.landCatch(fish, size);
    } finally {
      this.setGear(false);
      g.ui.hud.style.display = prevHud;
      this.busy = false;
    }
  }

  private async landCatch(fish: FishId, size: number) {
    const g = this.g;
    const info = FISH[fish];
    const log = g.state.fishLog;
    const first = !log[fish];
    const entry = (log[fish] = log[fish] ?? { count: 0, best: 0 });
    entry.count++;
    const record = size > entry.best;
    entry.best = Math.max(entry.best, size);
    g.player.celebrate = 1.2;
    g.fx.sparkles(g.player.pos.add(new Vector3(0, 1.6, 0)), 18, ["#bfe0f6", "#ffffff"]);
    audio.jingle(info.difficulty >= 3 ? "fanfare" : "questdone");
    if (fish === "bottle") g.give("crystal", 3, true);
    else if (fish === "boot") g.give("twig", 2, true);
    else g.give("fish", 1, true);
    if (fish === "goldkoi") g.life.addBuff("lucky", 300);
    // party critters gain a little xp for sharing the moment
    g.addPartyXp(3);
    const extra = fish === "bottle" ? " Inside: 3 Crystals!" : fish === "boot" ? " (You got 2 Twigs out of it.)" : fish === "goldkoi" ? " You feel very lucky!" : "";
    await g.ui.say([
      {
        text: `${info.icon} You caught a *${info.name}*${info.junk ? "" : ` — ${size} cm`}!${first ? " (New for your Fish Log!)" : record && !info.junk ? " A new record!" : ""} ${info.desc}${extra}`,
      },
    ]);
    g.story.onFish();
    g.save();
  }

  private animate(dur: number, f: (k: number) => void) {
    return new Promise<void>((res) => {
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
        f(k);
        if (k < 1) requestAnimationFrame(step);
        else res();
      };
      step();
    });
  }
}

function wait_(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/* ================================================================== */
/* Fishing overlay                                                     */
/* ================================================================== */

class FishingUI {
  el: HTMLElement;
  private msg: HTMLElement;
  onTap: (() => void) | null = null;

  constructor(private g: Game) {
    this.msg = h(".fish-msg");
    this.el = h(".fish-ui", null, this.msg);
    this.el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.onTap?.();
    });
    g.ui.root.append(this.el);
  }

  status(text: string, icon: string, urgent = false) {
    this.msg.innerHTML = `<span class="fi">${icon}</span>${text}`;
    this.msg.classList.toggle("urgent", urgent);
  }

  /**
   * Reel minigame: the fish darts up and down a tall meter; hold (A / Space / touch) to lift the net.
   * Keep the net over the fish to fill the catch meter.
   */
  reel(difficulty: number, pose: (bend: number) => void): Promise<boolean> {
    return new Promise((resolve) => {
      const bar = h(".reel-bar");
      const net = h(".reel-net");
      const fishEl = h(".reel-fish", null, "🐟");
      const meter = h(".reel-meter", null, h(".reel-fill"));
      bar.append(net, fishEl);
      const btn = h("button.btn.reel-btn", { "--c": "var(--butter)" }, "Hold to reel!");
      const box = h(".reel-box.panel", { "--c": "var(--sky)" }, h(".reel-cols", null, bar, meter), btn);
      this.el.append(box);
      this.status("Hold to lift the net — keep it on the fish!", "🎣");
      let held = false;
      const down = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        held = true;
      };
      const up = () => (held = false);
      box.addEventListener("pointerdown", down);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      const H = 1; // normalised height
      const netH = Math.max(0.22, 0.36 - difficulty * 0.03);
      let netY = 0.1,
        netV = 0;
      let fishY = 0.5,
        fishTarget = 0.5,
        fishT = 0;
      let prog = 0.3;
      const speed = 0.25 + difficulty * 0.12;
      let last = performance.now();
      let raf = 0;
      let t = 0;
      const step = () => {
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        const holding = held || input.down("a");
        netV += (holding ? 2.6 : -2.2) * dt;
        netV *= 0.9;
        netY = Math.max(0, Math.min(H - netH, netY + netV * dt * 2.2));
        if (netY <= 0 || netY >= H - netH) netV *= -0.3;
        fishT -= dt;
        if (fishT <= 0) {
          fishTarget = 0.08 + Math.random() * 0.84;
          fishT = 0.6 + Math.random() * (1.6 - difficulty * 0.2);
        }
        fishY += (fishTarget - fishY) * Math.min(1, dt * speed * 4);
        fishY += Math.sin(t * (3 + difficulty)) * dt * 0.05 * difficulty;
        const on = fishY > netY && fishY < netY + netH;
        prog += (on ? 0.32 : -0.16 + difficulty * -0.02) * dt;
        prog = Math.max(0, Math.min(1, prog));
        net.style.bottom = netY * 100 + "%";
        net.style.height = netH * 100 + "%";
        net.classList.toggle("on", on);
        fishEl.style.bottom = fishY * 100 + "%";
        (meter.firstElementChild as HTMLElement).style.height = prog * 100 + "%";
        pose(on ? 0.45 + Math.sin(t * 20) * 0.05 : 0.25);
        if (on && Math.random() < dt * 4) audio.sfx("click", { volume: 0.3, pitch: 1.5 });
        if (prog >= 1 || prog <= 0) {
          cancelAnimationFrame(raf);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          box.remove();
          resolve(prog >= 1);
          return;
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      void this.g;
    });
  }

  close() {
    this.el.remove();
    input.consumeAll();
  }
}
