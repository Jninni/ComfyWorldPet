import type { Game } from "../game/Game";
import { h, Nav } from "./dom";
import { audio } from "../audio/Audio";
import { input } from "../core/Input";
import { SPECIES, ROLES } from "../data/species";
import { FOODS, type FoodId } from "../data/crafting";
import { PARTY_MAX } from "../core/State";
import { PortraitView } from "../minigames/critter";
import { levelOf, levelProgress, statsFor, fmtTogether, MAX_LEVEL } from "../game/Pets";
import { Vector3 } from "@babylonjs/core";

/**
 * Pet stat card: portrait, class & perk, level/XP, friendship, stat bars,
 * plus things to do with your friend (pet, treat, rename, party/haven, ride).
 */
export function openPetCard(g: Game, uid: number): Promise<void> {
  return new Promise((resolve) => {
    const c = g.state.critters.find((x) => x.uid === uid);
    if (!c) return resolve();
    const info = SPECIES[c.species];
    const role = ROLES[info.role];
    const view = new PortraitView(c.species, info.color, "pet-portrait");
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      view.frame(Math.min(0.05, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    const body = h(".pet-body");
    const box = h(".modal.panel.pet-card", { "--c": info.color });
    const back = h(".modal-back", null, box);
    let nav: Nav;
    const close = () => {
      cancelAnimationFrame(raf);
      nav.dispose();
      back.remove();
      input.consumeAll();
      g.refreshParty();
      resolve();
    };
    back.addEventListener("pointerdown", (e) => {
      if (e.target === back) close();
    });
    const follower = () => g.followers.find((f) => f.owned.uid === uid);
    const react = (mood: "happy" | "love") => {
      view.critter.mood = mood === "love" ? "love" : "happy";
      const f = follower();
      if (f) {
        f.model.emote(mood);
        g.fx.hearts(f.pos.add(new Vector3(0, f.model.height + 0.2, 0)), 6);
      }
      audio.voice(c.species, "happy");
    };
    const render = () => {
      const lv = levelOf(c);
      body.innerHTML = "";
      const stats = h(".pet-stats");
      for (const r of statsFor(c)) {
        stats.append(h(".pet-stat", null, h(".ps-l", null, `${r.icon} ${r.label}`), h(".ps-bar", null, h(".ps-fill", { style: { width: Math.round(r.value * 100) + "%" } })), h(".ps-t", null, r.text)));
      }
      const hearts = Math.min(5, c.friendship ?? 1);
      body.append(
        h(
          ".pet-top",
          null,
          h(".pet-pic", { "--c": info.color }, view.el),
          h(
            ".pet-info",
            null,
            h(".pet-name", null, c.name, c.variant ? h("span.badge", null, "✨ rare") : null),
            h(".sub", null, info.name),
            h(".role-badge", { "--c": role.color }, `${role.icon} ${role.name}`),
            h(".pet-perk", null, info.talent),
            h(".hearts", { style: { fontSize: "20px", marginTop: "4px" } }, "💗".repeat(hearts) + "🤍".repeat(5 - hearts)),
            h(
              ".pet-xp",
              null,
              h(".px-l", null, lv >= MAX_LEVEL ? `⭐ Level ${lv} (max!)` : `⭐ Level ${lv}`),
              h(".px-bar", null, h(".px-fill", { style: { width: Math.round(levelProgress(c) * 100) + "%" } })),
            ),
            h(".sub", null, `🕒 ${fmtTogether(c.together ?? 0)} · ${c.inParty ? "🐾 In your party" : "🏡 In Critter Haven"}`),
          ),
        ),
        stats,
      );
      const acts = h(".row.pet-acts");
      const btn = (label: string, color: string, fn: () => void | Promise<void>, disabled = false) =>
        acts.append(
          h(
            "button.btn",
            {
              "data-nav": "",
              "--c": color,
              disabled,
              onclick: async () => {
                await fn();
                render();
              },
            },
            label,
          ),
        );
      btn("🤚 Pet", "var(--pink)", () => g.petCritter(c.uid).then((m) => react(m)));
      const treats = (Object.keys(FOODS) as FoodId[]).filter((f) => FOODS[f].use === "share" && g.count(f) > 0);
      btn(treats.length ? "🍰 Give treat" : "🍰 No treats", "var(--butter)", async () => {
        if (!treats.length) {
          g.ui.toast("Bake treats at Mocha's to share!", "🥐", "var(--butter)");
          return;
        }
        const choices = treats.map((f) => `${FOODS[f].icon} ${FOODS[f].name} (${g.count(f)})`);
        choices.push("Never mind");
        const k = await g.ui.say([{ text: `What should ${c.name} have?`, choices }]);
        if (k >= 0 && k < treats.length) {
          g.feedOne(c.uid, treats[k]);
          react("love");
        }
      });
      btn("✏️ Rename", "var(--cream)", async () => {
        const names = info.names.filter((n) => n !== c.name).slice(0, 3);
        const k = await g.ui.say([{ text: `New name for ${c.name}?`, choices: [...names, "Keep it"] }]);
        if (k >= 0 && k < names.length) {
          c.name = names[k];
          g.refreshParty();
          g.save();
        }
      });
      const inParty = g.state.critters.filter((x) => x.inParty).length;
      btn(c.inParty ? "🏡 Send to Haven" : inParty >= PARTY_MAX ? "🐾 Party full" : "🐾 Join party", "var(--mint)", () => {
        if (!g.setPartyMember(c.uid, !c.inParty)) {
          audio.sfx("fail");
          g.ui.toast("Your party is full (3)!", "🐾", "var(--pink)");
        } else audio.sfx("confirm");
      });
      if (info.role === "rider" && c.inParty)
        btn(g.riding?.f.owned.uid === c.uid ? "🐴 Hop off" : "🐴 Ride", "var(--lav)", () => {
          close();
          if (g.riding?.f.owned.uid !== c.uid) {
            // ride this one specifically
            const f = g.followers.find((x) => x.owned.uid === c.uid);
            if (f) {
              g.followers.splice(g.followers.indexOf(f), 1);
              g.followers.unshift(f);
            }
            if (g.riding) g.toggleRide();
          }
          g.toggleRide();
        });
      body.append(acts);
      requestAnimationFrame(() => {
        if (!nav.focused?.isConnected) nav.focusFirst();
      });
    };
    box.append(h("button.btn.round-btn.close", { "aria-label": "Close", "data-nav": "", onclick: close }, "✕"), body);
    g.ui.root.append(back);
    nav = new Nav(box, close);
    render();
    raf = requestAnimationFrame(loop);
    audio.voice(c.species, "curious");
  });
}
