import type { Game } from "../game/Game";
import { h, Nav } from "./dom";
import { audio } from "../audio/Audio";
import { input } from "../core/Input";
import { RECIPES, FOODS, INGREDIENTS, DYES, PATTERNS, type FoodId, type DyeId, type GarmentKind, type Cost } from "../data/crafting";
import { RESOURCES, type ResourceId } from "../data/items";
import { NPC_INFO, type PlayerLook } from "../entities/characterModels";
import { Vector3 } from "@babylonjs/core";

function costLabel(g: Game, id: string): { icon: string; name: string } {
  if (id in RESOURCES) return { icon: RESOURCES[id as ResourceId].icon, name: RESOURCES[id as ResourceId].name };
  if (id in INGREDIENTS) return { icon: INGREDIENTS[id as keyof typeof INGREDIENTS].icon, name: INGREDIENTS[id as keyof typeof INGREDIENTS].name };
  void g;
  return { icon: "❔", name: id };
}

function canPay(g: Game, cost: Cost) {
  return Object.entries(cost).every(([k, n]) => g.count(k) >= (n ?? 0));
}

function costRow(g: Game, cost: Cost) {
  const row = h(".cost");
  for (const [k, n] of Object.entries(cost)) {
    const c = costLabel(g, k);
    row.append(h("span" + (g.count(k) < (n ?? 0) ? ".lack" : ""), { title: c.name }, `${c.icon}${g.count(k)}/${n}`));
  }
  return row;
}

function modal(g: Game, title: string, color: string, onClose: () => void) {
  const back = h(".modal-back");
  const close = h("button.btn.round-btn.close", { "aria-label": "Close", "data-nav": "", onclick: () => onClose() }, "✕");
  const body = h(".modal-body");
  const box = h(".modal.panel", { "--c": color }, close, h("h2", null, title), body);
  back.append(box);
  back.addEventListener("pointerdown", (e) => {
    if (e.target === back) onClose();
  });
  g.ui.root.append(back);
  return { back, box, body };
}

/**
 * A short, joyful "do the thing" mini-interaction: tap the big button (or press Ⓐ) a few times,
 * then a progress bar fills. Used for mixing dough and stitching fabric.
 */
export function craftAction(g: Game, o: { title: string; verb: string; emoji: string; taps: number; color: string; finish: string }): Promise<void> {
  return new Promise((resolve) => {
    const bowl = h(".craft-emoji", null, o.emoji);
    const bar = h(".craft-bar", null, h(".craft-fill"));
    const hint = h(".craft-hint", null, `Tap ${o.verb} ${o.taps} times!`);
    const btn = h("button.btn.craft-btn", { "--c": o.color, "data-nav": "", "data-autofocus": "" }, o.verb);
    const card = h(".panel.craft-card", { "--c": o.color }, h("h2", null, o.title), bowl, bar, hint, btn);
    const back = h(".modal-back", null, card);
    g.ui.root.append(back);
    const nav = new Nav(card);
    nav.focusFirst();
    let n = 0;
    let done = false;
    const fill = bar.firstElementChild as HTMLElement;
    const tap = () => {
      if (done) return;
      n++;
      audio.sfx(n % 2 ? "pop" : "bubble", { pitch: 1 + n * 0.06 });
      fill.style.width = Math.min(100, (n / o.taps) * 100) + "%";
      bowl.classList.remove("wobble");
      void bowl.offsetWidth;
      bowl.classList.add("wobble");
      if (n >= o.taps) {
        done = true;
        btn.setAttribute("disabled", "");
        hint.textContent = o.finish;
        fill.classList.add("glow");
        audio.sfx("sparkle");
        setTimeout(() => {
          nav.dispose();
          back.remove();
          input.consumeAll();
          resolve();
        }, 1100);
      }
    };
    btn.addEventListener("click", tap);
  });
}

/* ================================================================== */
/* Cooking                                                             */
/* ================================================================== */

export function openCookMenu(g: Game): Promise<FoodId | null> {
  return new Promise((resolve) => {
    let nav: Nav;
    const close = (r: FoodId | null = null) => {
      nav.dispose();
      m.back.remove();
      input.consumeAll();
      resolve(r);
    };
    const m = modal(g, "🥐 Mocha's Oven", "var(--butter)", () => close());
    const unlocked = RECIPES.filter((r) => r.id === "cookie" || g.story.done("bakery"));
    const render = () => {
      m.body.innerHTML = "";
      m.body.append(h("p", { style: { textAlign: "center", margin: "0 0 10px", fontWeight: "600" } }, "Pick a recipe! Ingredients come from your garden, beehives, apple baskets and the woods."));
      const grid = h(".grid");
      for (const r of unlocked) {
        const f = FOODS[r.id];
        const ok = canPay(g, r.cost);
        grid.append(
          h(
            ".card",
            {
              "data-nav": "",
              style: ok ? undefined : { opacity: "0.6" },
              onclick: async () => {
                if (!canPay(g, r.cost)) {
                  audio.sfx("fail");
                  g.ui.toast("Not enough ingredients yet!", "🧺", "var(--pink)");
                  return;
                }
                nav.dispose();
                m.back.remove();
                for (const [k, n] of Object.entries(r.cost)) g.take(k, n ?? 0);
                await craftAction(g, { title: `Baking ${f.name}`, verb: "Stir!", emoji: "🥣", taps: 6, color: "var(--butter)", finish: "Into the oven… ding! ✨" });
                const makes = (f.makes ?? 1) + (g.partyHas("mochi") ? (g.bestFriendship("mochi") >= 5 ? 2 : 1) : 0);
                if (g.partyHas("mochi")) g.ui.toast("Mochi helped! Extra treats ✨", "🐱", "var(--butter)");
                g.give(r.id, makes, true);
                audio.jingle("fanfare");
                g.fx.confetti(g.player.pos.add(new Vector3(0, 2, 0)), 24);
                g.player.celebrate = 1.2;
                g.ui.toast(`You made ${makes > 1 ? makes + " " : ""}${f.name}!`, f.icon, "var(--butter)");
                g.save();
                input.consumeAll();
                resolve(r.id);
              },
            },
            h("div", { style: { fontSize: "46px" } }, f.icon),
            h(".nm", null, f.name + (f.makes && f.makes > 1 ? ` ×${f.makes}` : "")),
            h(".sub", null, f.desc),
            h(".sub", { style: { fontWeight: "600", color: "var(--ink)" } }, f.use === "eat" ? "🍴 Eat for a power-up" : f.use === "share" ? "🐾 Share with your party" : "🎁 Offer to wild critters"),
            costRow(g, r.cost),
          ),
        );
      }
      m.body.append(grid);
      if (!g.story.done("bakery")) m.body.append(h("p", { style: { textAlign: "center", fontSize: "15px" } }, "Finish Mocha's lessons to unlock more recipes!"));
    };
    nav = new Nav(m.box, () => close());
    render();
    requestAnimationFrame(() => nav.focusFirst());
  });
}

/* ================================================================== */
/* Café                                                                */
/* ================================================================== */

export function openOrdersMenu(g: Game): Promise<void> {
  return new Promise((resolve) => {
    let nav: Nav;
    const close = () => {
      nav.dispose();
      m.back.remove();
      input.consumeAll();
      resolve();
    };
    const m = modal(g, "☕ Café Orders", "var(--pink)", close);
    const render = () => {
      m.body.innerHTML = "";
      m.body.append(h("p", { style: { textAlign: "center", margin: "0 0 10px", fontWeight: "600" } }, "Villagers are craving treats! Deliver one to get a reward. New orders appear every few minutes."));
      const list = h(".quest-list");
      g.state.orders.forEach((o, i) => {
        const f = FOODS[o.food];
        const have = g.count(o.food);
        const reward = h(".cost");
        for (const [r, n] of Object.entries(o.reward) as [ResourceId, number][]) reward.append(h("span", null, `${RESOURCES[r].icon}+${n}`));
        const who = NPC_INFO[o.who as keyof typeof NPC_INFO];
        list.append(
          h(
            ".quest-item",
            { "--c": who?.color ?? "var(--butter)" },
            h(".qi-ico", null, f.icon),
            h("div", null, h(".qi-name", null, `${who?.name ?? o.who} wants ${f.name}`), h(".qi-obj", null, `You have ${have}`), reward),
            h(
              "button.btn",
              {
                "data-nav": "",
                "--c": have ? "var(--mint)" : "var(--cream)",
                style: { marginLeft: "auto" },
                onclick: () => {
                  if (!g.count(o.food)) {
                    audio.sfx("fail");
                    g.ui.toast(`Bake some ${f.name} first!`, f.icon, "var(--pink)");
                    return;
                  }
                  g.life.completeOrder(i);
                  g.ui.toast(`${who?.name ?? "They"} loved it! Thank you!`, "💌", "var(--mint)");
                  render();
                  requestAnimationFrame(() => nav.focusFirst());
                },
              },
              "Deliver",
            ),
          ),
        );
      });
      m.body.append(list);
    };
    nav = new Nav(m.box, close);
    render();
    requestAnimationFrame(() => nav.focusFirst());
  });
}

/** Pick a power-up food to eat (café tables give a bonus). */
export async function chooseSnack(g: Game): Promise<FoodId | null> {
  const edible = (Object.keys(FOODS) as FoodId[]).filter((f) => FOODS[f].use === "eat" && g.count(f) > 0);
  if (!edible.length) {
    await g.ui.say([{ text: "A cozy café table! Bake a Carrot Cake, Apple Pie or Mushroom Soup, then sit here to enjoy it — café snacks last longer!" }]);
    return null;
  }
  const choices = edible.map((f) => `${FOODS[f].icon} ${FOODS[f].name} (${g.count(f)})`);
  choices.push("Not now");
  const c = await g.ui.say([{ text: "What would you like to snack on? (Snacks at the café last 50% longer!)", choices }]);
  return c >= 0 && c < edible.length ? edible[c] : null;
}

/* ================================================================== */
/* Sewing                                                              */
/* ================================================================== */

const CREAM = "#fff6e6";

export function openSewingMenu(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const look = g.state.look as PlayerLook;
    const original: PlayerLook = { ...look };
    let kind: GarmentKind = (look.style as GarmentKind) ?? "overalls";
    let main: DyeId | "cream" = "cream";
    let accent: DyeId | "cream" = "cream";
    const colorOf = (d: DyeId | "cream") => (d === "cream" ? CREAM : DYES[d].color);
    const panel = h(".creator.panel.sew-panel", { "--c": "var(--lav)" });
    let nav: Nav;
    const preview = () => {
      const p: PlayerLook = { ...original };
      if (PATTERNS[kind].slot === "outfit") {
        p.style = kind as PlayerLook["style"];
        p.outfit = colorOf(main);
        p.outfit2 = colorOf(accent);
      } else {
        p.accessory = kind as PlayerLook["accessory"];
        p.accessoryColor = colorOf(main);
      }
      g.player.model.setLook?.(p);
    };
    const cost = (): Cost & Record<string, number> => {
      const c: Record<string, number> = { petal: Math.max(1, PATTERNS[kind].petals - (g.partyHas("duckling") ? 1 : 0)) };
      const dyes = [main, PATTERNS[kind].slot === "outfit" ? accent : "cream"].filter((d) => d !== "cream") as DyeId[];
      for (const d of dyes) c["dye_" + d] = (c["dye_" + d] ?? 0) + 1;
      return c;
    };
    const close = (keep: boolean) => {
      nav.dispose();
      panel.remove();
      if (!keep) g.player.model.setLook?.(original);
      input.consumeAll();
      resolve();
    };
    const swatches = (sel: DyeId | "cream", on: (d: DyeId | "cream") => void) => {
      const row = h(".swatches");
      const opts: (DyeId | "cream")[] = ["cream", ...(Object.keys(DYES) as DyeId[])];
      for (const d of opts) {
        const have = d === "cream" ? Infinity : g.state.dyes[d] ?? 0;
        const b = h(
          "button.swatch" + (sel === d ? ".sel" : ""),
          {
            "data-nav": "",
            "--c": colorOf(d),
            title: d === "cream" ? "Undyed (free)" : `${DYES[d].name} — you have ${have}. Found in ${DYES[d].where}`,
            style: have > 0 ? undefined : { opacity: "0.35" },
            onclick: () => {
              if (have <= 0) {
                audio.sfx("fail");
                g.ui.toast(`Find ${DYES[d as DyeId].name} in ${DYES[d as DyeId].where}!`, "🌼", "var(--pink)");
                return;
              }
              on(d);
              audio.sfx("click");
              render();
            },
          },
          have > 0 && d !== "cream" ? h("small", { style: { fontSize: "12px", fontWeight: "700" } }, String(have)) : "",
        );
        row.append(b);
      }
      return row;
    };
    const render = () => {
      const focusedIdx = nav ? nav.items().indexOf(nav.focused as HTMLElement) : -1;
      panel.innerHTML = "";
      const pats = h(".swatches");
      for (const k of Object.keys(PATTERNS) as GarmentKind[]) {
        pats.append(
          h(
            "button.btn" + (k === kind ? ".tab.active" : ".tab"),
            {
              "data-nav": "",
              style: { fontSize: "14px", minHeight: "40px", padding: "4px 10px" },
              onclick: () => {
                kind = k;
                audio.sfx("click");
                render();
              },
            },
            `${PATTERNS[k].icon} ${PATTERNS[k].name}`,
          ),
        );
      }
      const c = cost();
      const ok = Object.entries(c).every(([k, n]) => g.count(k) >= n);
      const costEl = h(".cost", { style: { fontSize: "16px" } });
      for (const [k, n] of Object.entries(c)) {
        const label = k === "petal" ? "🌸 Petals" : `🌼 ${DYES[k.slice(4) as DyeId].name}`;
        costEl.append(h("span" + (g.count(k) < n ? ".lack" : ""), null, `${label} ${g.count(k)}/${n}`));
      }
      panel.append(
        h("h2", null, "🧵 Sewing Table"),
        h(".opt-row", null, h(".lbl", null, "Pattern"), pats),
        h(".opt-row", null, h(".lbl", null, PATTERNS[kind].slot === "outfit" ? "Main colour" : "Colour"), swatches(main, (d) => (main = d))),
        ...(PATTERNS[kind].slot === "outfit" ? [h(".opt-row", null, h(".lbl", null, "Trim colour"), swatches(accent, (d) => (accent = d)))] : []),
        h(".opt-row", null, h(".lbl", null, "Needs"), costEl),
        h(
          ".row",
          { style: { justifyContent: "center", marginTop: "10px" } },
          h("button.btn", { "data-nav": "", "--c": "var(--cream)", onclick: () => close(false) }, "Cancel"),
          h(
            "button.btn",
            {
              "data-nav": "",
              "--c": ok ? "var(--mint)" : "var(--cream)",
              onclick: async () => {
                if (!Object.entries(cost()).every(([k, n]) => g.count(k) >= n)) {
                  audio.sfx("fail");
                  g.ui.toast("You need more Petals or dye flowers!", "🌸", "var(--pink)");
                  return;
                }
                for (const [k, n] of Object.entries(cost())) g.take(k, n);
                nav.dispose();
                panel.style.visibility = "hidden";
                await craftAction(g, { title: `Sewing a ${PATTERNS[kind].name}`, verb: "Stitch!", emoji: "🪡", taps: 6, color: "var(--lav)", finish: "Snip snip… all done! ✨" });
                const gm = { uid: g.state.nextGarmentUid++, kind, color: colorOf(main), accent: colorOf(accent) };
                g.state.wardrobe.push(gm);
                g.life.wear(gm, PATTERNS[kind].slot);
                audio.jingle("fanfare");
                g.fx.sparkles(g.player.pos.add(new Vector3(0, 1.2, 0)), 24, ["#f8b9cb", "#cdb9f0"]);
                g.player.celebrate = 1.2;
                g.ui.toast(`You sewed a ${PATTERNS[kind].name}! Find it in Style.`, PATTERNS[kind].icon, "var(--lav)");
                panel.remove();
                input.consumeAll();
                resolve();
              },
            },
            "Sew it! ✂️",
          ),
        ),
      );
      preview();
      if (nav) {
        const it = nav.items();
        nav.focus(it[Math.max(0, Math.min(it.length - 1, focusedIdx))] ?? null);
      }
    };
    g.ui.root.append(panel);
    render();
    nav = new Nav(panel, () => close(false));
    nav.focusFirst();
  });
}
