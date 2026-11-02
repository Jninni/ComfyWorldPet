import type { Game } from "../game/Game";
import { h, Nav, portrait } from "./dom";
import { audio } from "../audio/Audio";
import { input } from "../core/Input";
import { hasSave, clearSave, PARTY_MAX } from "../core/State";
import { SPECIES, SPECIES_IDS, ZONE_INFO } from "../data/species";
import { RESOURCES, KEY_ITEMS, BUILDABLES, type BuildableId, type ResourceId } from "../data/items";
import { QUESTS } from "../game/Story";
import { LOOK_OPTIONS, NPC_INFO, type PlayerLook, type HatId } from "../entities/characterModels";
import { WORLD, ZONE_SHAPES, PATHS, POND, LOC, walkField } from "../world/layout";

function modal(title: string, onClose: () => void, color = "var(--lav)") {
  const back = h(".modal-back");
  const close = h("button.btn.round-btn.close", { "aria-label": "Close", "data-nav": "", onclick: () => onClose() }, "✕");
  const body = h(".modal-body");
  const box = h(".modal.panel", { "--c": color }, close, h("h2", null, title), body);
  back.append(box);
  back.addEventListener("pointerdown", (e) => {
    if (e.target === back) onClose();
  });
  return { back, box, body, titleEl: box.querySelector("h2") as HTMLElement };
}

/* ================================================================== */
/* Title                                                               */
/* ================================================================== */

export function showTitle(g: Game): Promise<"new" | "continue"> {
  return new Promise((resolve) => {
    const saved = hasSave();
    const btns = h(".title-btns");
    const root = h(
      ".title-screen",
      null,
      h(".logo", null, h("span.l1", null, "Comfy World"), h("span.l2", null, "P", h("b", null, "e"), "ts")),
      btns,
      h(".credit", null, "Made with 💖 — tap, click, or press Ⓐ"),
    );
    let nav: Nav | null = null;
    const done = (r: "new" | "continue") => {
      audio.unlock();
      audio.sfx("confirm");
      nav?.dispose();
      root.style.transition = "opacity .4s";
      root.style.opacity = "0";
      setTimeout(() => root.remove(), 400);
      resolve(r);
    };
    const showButtons = () => {
      btns.innerHTML = "";
      if (saved) btns.append(h("button.btn", { "data-nav": "", "data-autofocus": "", "--c": "var(--butter)", onclick: () => done("continue") }, "▶ Continue"));
      btns.append(
        h(
          "button.btn",
          {
            "data-nav": "",
            "--c": saved ? "var(--pink)" : "var(--butter)",
            onclick: async () => {
              if (saved) {
                nav?.dispose();
                const c = await g.ui.say([{ text: "Start a brand-new adventure? Your old save will be replaced.", choices: ["Yes, start fresh!", "No, go back"] }]);
                if (c !== 0) {
                  showButtons();
                  return;
                }
                clearSave();
              }
              done("new");
            },
          },
          saved ? "✿ New Adventure" : "✿ Start Adventure",
        ),
      );
      nav = new Nav(root);
      nav.focusFirst();
    };
    // first gesture unlocks audio and shows the menu
    const hint = h(".tap-hint", null, "Tap to start");
    btns.append(hint);
    const first = () => {
      window.removeEventListener("pointerdown", first);
      off();
      audio.unlock();
      audio.music("title");
      audio.sfx("sparkle");
      showButtons();
    };
    window.addEventListener("pointerdown", first);
    const off = input.onPress(() => first());
    g.ui.root.append(root);
    (window as unknown as { __ready: boolean }).__ready = true;
  });
}

/* ================================================================== */
/* Character creator                                                   */
/* ================================================================== */

export function showCreator(g: Game): Promise<{ look: PlayerLook; name: string }> {
  return new Promise((resolve) => {
    const look: PlayerLook = { ...(g.state.look as PlayerLook) };
    look.hat = "none";
    let name = g.state.playerName;
    const panel = h(".creator.panel", { "--c": "var(--pink)" });
    const apply = () => g.player.model.setLook?.(look);
    const row = (label: string, key: "skin" | "hair" | "outfit") => {
      const sw = h(".swatches");
      for (const c of LOOK_OPTIONS[key]) {
        const b = h("button.swatch", {
          "data-nav": "",
          "--c": c,
          onclick: () => {
            look[key] = c;
            sw.querySelectorAll(".swatch").forEach((e) => e.classList.remove("sel"));
            b.classList.add("sel");
            audio.sfx("click");
            apply();
          },
        });
        if (look[key] === c) b.classList.add("sel");
        sw.append(b);
      }
      return h(".opt-row", null, h(".lbl", null, label), sw);
    };
    const inputEl = h("input.name-input", { value: name, maxlength: "12", "aria-label": "Your name" }) as HTMLInputElement;
    inputEl.addEventListener("input", () => (name = inputEl.value));
    inputEl.addEventListener("keydown", (e) => e.stopPropagation());
    const nameChoices = h(".swatches");
    for (const n of ["Sunny", "Momo", "Kiki", "Juniper", "Biscuit", "Pebble"]) {
      nameChoices.append(
        h(
          "button.btn",
          {
            "data-nav": "",
            "--c": "var(--cream)",
            style: { fontSize: "15px", minHeight: "40px", padding: "4px 12px" },
            onclick: () => {
              name = n;
              inputEl.value = n;
              audio.sfx("click");
            },
          },
          n,
        ),
      );
    }
    panel.append(
      h("h2", null, "Who are you?"),
      h(".opt-row", null, h(".lbl", null, "Name"), inputEl),
      h(".opt-row", null, nameChoices),
      row("Skin", "skin"),
      row("Hair", "hair"),
      row("Outfit", "outfit"),
      h(
        ".row",
        { style: { justifyContent: "center", marginTop: "12px" } },
        h(
          "button.btn",
          {
            "data-nav": "",
            "--c": "var(--mint)",
            style: { fontSize: "24px", minWidth: "220px" },
            onclick: () => {
              audio.sfx("confirm");
              nav.dispose();
              panel.remove();
              g.player.model.emote("wave");
              resolve({ look, name: (name || "Sunny").slice(0, 12) });
            },
          },
          "That's me! ✨",
        ),
      ),
    );
    g.ui.root.append(panel);
    const nav = new Nav(panel);
    nav.focusFirst();
    apply();
    // frame the player nicely on the left side
    g.player.model.emote("happy");
  });
}

/* ================================================================== */
/* Pause menu                                                          */
/* ================================================================== */

type Tab = "quests" | "critters" | "party" | "bag" | "map" | "style" | "settings";

export function openPauseMenu(g: Game, startTab: Tab = "quests"): Promise<void> {
  return new Promise((resolve) => {
    let nav: Nav;
    const close = () => {
      nav.dispose();
      m.back.remove();
      g.save();
      input.consumeAll();
      resolve();
    };
    const m = modal("My Bag", close);
    const tabs = h(".tabs");
    m.box.insertBefore(tabs, m.body);
    const TABS: [Tab, string][] = [
      ["quests", "⭐ Quests"],
      ["critters", "📔 Journal"],
      ["party", "🐾 Party"],
      ["bag", "🎒 Items"],
      ["map", "🗺️ Map"],
      ["style", "🎀 Style"],
      ["settings", "⚙️"],
    ];
    let cur: Tab = startTab;
    const render = () => {
      tabs.innerHTML = "";
      for (const [id, label] of TABS) {
        tabs.append(
          h(
            "button.btn.tab" + (id === cur ? ".active" : ""),
            {
              "data-nav": "",
              onclick: () => {
                cur = id;
                audio.sfx("click");
                render();
              },
            },
            label,
          ),
        );
      }
      m.body.innerHTML = "";
      m.body.append(renderTab(g, cur, render));
      requestAnimationFrame(() => {
        const t = tabs.querySelector(".tab.active") as HTMLElement;
        if (!nav.focused || !nav.focused.isConnected) nav.focus(t);
      });
    };
    m.box.addEventListener("navshoulder", ((e: CustomEvent) => {
      const i = TABS.findIndex(([t]) => t === cur);
      cur = TABS[(i + e.detail + TABS.length) % TABS.length][0];
      audio.sfx("click");
      render();
    }) as EventListener);
    g.ui.root.append(m.back);
    nav = new Nav(m.box, close);
    render();
  });
}

function renderTab(g: Game, tab: Tab, rerender: () => void): HTMLElement {
  const s = g.state;
  switch (tab) {
    case "quests": {
      const list = h(".quest-list");
      const ids = Object.keys(QUESTS).filter((id) => s.quests[id]);
      ids.sort((a, b) => Number(!!s.quests[a].done) - Number(!!s.quests[b].done));
      if (!ids.length) list.append(h("p", null, "No quests yet. Talk to villagers!"));
      for (const id of ids) {
        const q = QUESTS[id];
        const st = s.quests[id];
        list.append(
          h(
            ".quest-item" + (st.done ? ".done" : ""),
            { "--c": q.color, "data-nav": "" },
            h(".qi-ico", null, st.done ? "✅" : q.icon),
            h("div", null, h(".qi-name", null, q.name), h(".qi-obj", null, st.done ? "Complete!" : g.story.objective(id))),
            h(".qi-giver", null, NPC_INFO[q.giver].name),
          ),
        );
      }
      return list;
    }
    case "critters": {
      const wrap = h("div");
      const grid = h(".grid");
      const detail = h("div");
      wrap.append(h("p", { style: { textAlign: "center", margin: "0 0 10px", fontWeight: "600" } }, `Seen ${s.seen.length} / ${SPECIES_IDS.length}  ·  Friends ${s.critters.length}`), grid, detail);
      for (const id of SPECIES_IDS) {
        const info = SPECIES[id];
        const seen = s.seen.includes(id);
        const owned = s.critters.filter((c) => c.species === id).length;
        const card = h(
          ".card" + (seen ? "" : ".locked"),
          {
            "data-nav": "",
            "--c": info.color,
            onclick: () => {
              audio.sfx("click");
              detail.innerHTML = "";
              if (!seen) {
                detail.append(h(".detail", { "--c": "#ddd" }, h("div", null, h("b", null, "???"), h("div", null, `Lives in: ${ZONE_INFO[info.zone].name}`))));
                return;
              }
              detail.append(
                h(
                  ".detail",
                  { "--c": info.color },
                  h(".portrait", { "--c": info.color }, portrait(id, info.color, 160)),
                  h(
                    "div",
                    null,
                    h("div", { style: { fontSize: "22px", fontWeight: "600" } }, info.name),
                    h("div", null, info.desc),
                    h("div", { style: { marginTop: "6px", fontSize: "15px" } }, `💕 Likes: ${info.likes}`),
                    h("div", { style: { fontSize: "15px" } }, `✨ Talent: ${info.talent}`),
                    h("div", { style: { fontSize: "15px" } }, `📍 ${ZONE_INFO[info.zone].name}`),
                  ),
                ),
              );
            },
          },
          h(".portrait", null, portrait(id, info.color, 128)),
          h(".nm", null, seen ? info.name : "???"),
          h(".sub", null, seen ? ZONE_INFO[info.zone].name : "Not seen yet"),
          owned ? h(".badge", null, `♥ ${owned}`) : null,
        );
        grid.append(card);
      }
      return wrap;
    }
    case "party": {
      const wrap = h("div");
      const inParty = s.critters.filter((c) => c.inParty).length;
      wrap.append(h("p", { style: { textAlign: "center", margin: "0 0 10px", fontWeight: "600" } }, `Party ${inParty} / ${PARTY_MAX} — tap a friend to bring them along or send them to Critter Haven`));
      const grid = h(".grid");
      if (!s.critters.length) grid.append(h("p", null, "No critter friends yet!"));
      for (const c of s.critters) {
        const info = SPECIES[c.species];
        grid.append(
          h(
            ".card",
            {
              "data-nav": "",
              "--c": info.color,
              style: c.inParty ? { background: "var(--butter)" } : undefined,
              onclick: () => {
                const ok = g.setPartyMember(c.uid, !c.inParty);
                if (!ok) {
                  audio.sfx("fail");
                  g.ui.toast("Your party is full (3)!", "🐾", "var(--pink)");
                } else audio.sfx("confirm");
                rerender();
              },
            },
            h(".portrait", null, portrait(c.species, info.color, 128)),
            h(".nm", null, c.name),
            h(".sub", null, c.inParty ? "🐾 In party" : "🏡 In Haven"),
            c.variant ? h(".badge", null, "✨ rare") : null,
          ),
        );
      }
      wrap.append(grid);
      return wrap;
    }
    case "bag": {
      const grid = h(".grid");
      for (const id of Object.keys(RESOURCES) as ResourceId[]) {
        const r = RESOURCES[id];
        grid.append(h(".card", { "data-nav": "" }, h("div", { style: { fontSize: "44px" } }, r.icon), h(".nm", null, `${r.name} ×${s.resources[id]}`), h(".sub", null, r.desc)));
      }
      for (const [id, k] of Object.entries(KEY_ITEMS)) {
        const n = s.keyItems[id] ?? 0;
        if (!n) continue;
        grid.append(h(".card", { "data-nav": "", style: { background: "var(--lilac, #f1eaff)" } }, h("div", { style: { fontSize: "44px" } }, k.icon), h(".nm", null, n > 1 ? `${k.name} ×${n}` : k.name), h(".sub", null, k.desc)));
      }
      return grid;
    }
    case "map":
      return h(".map-wrap", null, drawMap(g));
    case "style": {
      const look = s.look as PlayerLook;
      const wrap = h(".settings");
      const opt = (label: string, key: "skin" | "hair" | "outfit") => {
        const sw = h(".swatches");
        for (const c of LOOK_OPTIONS[key]) {
          const b = h("button.swatch" + (look[key] === c ? ".sel" : ""), {
            "data-nav": "",
            "--c": c,
            onclick: () => {
              look[key] = c;
              g.player.model.setLook?.(look);
              audio.sfx("click");
              rerender();
            },
          });
          sw.append(b);
        }
        return h(".opt-row", null, h(".lbl", { style: { fontWeight: "600" } }, label), sw);
      };
      const hats = h(".swatches");
      const HAT_ICON: Record<string, string> = { none: "🚫", beret: "🎨", flower: "🌸", bunnyears: "🐰", strawhat: "👒", crown: "👑" };
      for (const hat of LOOK_OPTIONS.hat) {
        const owned = s.hats.includes(hat);
        hats.append(
          h(
            "button.swatch" + (look.hat === hat ? ".sel" : ""),
            {
              "data-nav": "",
              "--c": owned ? "var(--cream)" : "#ddd",
              title: owned ? hat : "Locked — help villagers to earn it!",
              disabled: !owned,
              onclick: () => {
                look.hat = hat as HatId;
                g.player.model.setLook?.(look);
                audio.sfx("click");
                rerender();
              },
            },
            owned ? HAT_ICON[hat] ?? "🎩" : "🔒",
          ),
        );
      }
      wrap.append(opt("Skin", "skin"), opt("Hair", "hair"), opt("Outfit", "outfit"), h(".opt-row", null, h(".lbl", { style: { fontWeight: "600" } }, "Hats (earn more by helping villagers!)"), hats));
      return wrap;
    }
    case "settings": {
      const wrap = h(".settings");
      const slider = (label: string, val: number, on: (v: number) => void) => {
        const r = h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(val), "data-nav": "" }) as HTMLInputElement;
        r.addEventListener("input", () => on(+r.value));
        r.addEventListener("keydown", (e) => e.stopPropagation());
        return h("label", null, h("span", { style: { width: "120px" } }, label), r);
      };
      wrap.append(
        slider("🎵 Music", audio.musicVolume, (v) => audio.setVolumes(v, audio.sfxVolume)),
        slider("🔔 Sounds", audio.sfxVolume, (v) => {
          audio.setVolumes(audio.musicVolume, v);
          audio.sfx("pop");
        }),
        h(
          "label",
          null,
          h("span", { style: { width: "120px" } }, "✨ Graphics"),
          ...(["low", "medium", "high"] as const).map((q) =>
            h(
              "button.btn" + (g.stage.quality === q ? ".tab.active" : ".tab"),
              {
                "data-nav": "",
                onclick: () => {
                  const u = new URL(location.href);
                  u.searchParams.set("q", q);
                  g.save();
                  location.href = u.toString();
                },
              },
              q[0].toUpperCase() + q.slice(1),
            ),
          ),
        ),
        h("p", { style: { fontSize: "15px", color: "var(--ink-soft)" } }, "Controls: move with the stick / WASD / joystick. Ⓐ / Space = talk & interact. Ⓧ / Q = bag. Pinch or scroll to zoom."),
        h(
          ".row",
          { style: { justifyContent: "center", marginTop: "8px" } },
          h(
            "button.btn",
            {
              "data-nav": "",
              "--c": "var(--mint)",
              onclick: () => {
                g.save();
                g.ui.toast("Game saved!", "💾", "var(--mint)");
              },
            },
            "💾 Save now",
          ),
        ),
      );
      return wrap;
    }
  }
}

function drawMap(g: Game): HTMLCanvasElement {
  const W = WORLD.maxX - WORLD.minX,
    H = WORLD.maxZ - WORLD.minZ;
  const S = 3.2;
  const cv = document.createElement("canvas");
  cv.width = W * S;
  cv.height = H * S;
  const c = cv.getContext("2d")!;
  const X = (x: number) => (x - WORLD.minX) * S;
  const Z = (z: number) => (WORLD.maxZ - z) * S;
  c.fillStyle = "#cfe9b5";
  c.fillRect(0, 0, cv.width, cv.height);
  // hills: sample at quarter resolution, then upscale smoothly for soft coastlines
  const sm = document.createElement("canvas");
  sm.width = Math.ceil(cv.width / 4);
  sm.height = Math.ceil(cv.height / 4);
  const sc = sm.getContext("2d")!;
  const img = sc.createImageData(sm.width, sm.height);
  for (let py = 0; py < sm.height; py++)
    for (let px = 0; px < sm.width; px++) {
      const w = walkField(WORLD.minX + (px * 4) / S, WORLD.maxZ - (py * 4) / S);
      const i = (py * sm.width + px) * 4;
      const hill = w > 1.0;
      img.data[i] = hill ? 150 : 207;
      img.data[i + 1] = hill ? 200 : 233;
      img.data[i + 2] = hill ? 140 : 181;
      img.data[i + 3] = 255;
    }
  sc.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(sm, 0, 0, cv.width, cv.height);
  c.fillStyle = "#9fd7f0";
  c.beginPath();
  c.ellipse(X(POND.cx), Z(POND.cz), POND.rx * S, POND.rz * S, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#f3e2bf";
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const p of PATHS) {
    c.lineWidth = p.w * S;
    c.beginPath();
    p.pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))));
    c.stroke();
  }
  c.font = "600 26px Fredoka, sans-serif";
  c.textAlign = "center";
  c.lineWidth = 6;
  c.strokeStyle = "#fff";
  const label = (t: string, x: number, z: number) => {
    c.fillStyle = "#4a3a52";
    c.strokeText(t, X(x), Z(z));
    c.fillText(t, X(x), Z(z));
  };
  label("Cozy Hollow", 0, -6);
  label("Whisper Meadow", 0, 86);
  label("Mossy Woods", -82, 30);
  label("Sparkle Pond", 98, 50);
  label("Critter Haven", 44, -27);
  label("Crystal Cave", -44, 124);
  // houses
  c.font = "26px sans-serif";
  for (const [id, b] of Object.entries(LOC.buildings)) {
    const icon = { home: "🏠", teahouse: "🫖", library: "📚", flowershop: "🌷", sewing: "🧵", workshop: "🔨" }[id] ?? "🏠";
    c.fillText(icon, X(b.x), Z(b.z) + 8);
  }
  c.fillText("🕳️", X(LOC.caveMouth.x), Z(LOC.caveMouth.z) + 8);
  // player
  const p = g.current.id === "overworld" ? g.player.pos : null;
  if (p) {
    c.fillStyle = "#ef8fab";
    c.strokeStyle = "#4a3a52";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(X(p.x), Z(p.z), 12, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = "#4a3a52";
    c.font = "600 20px Fredoka, sans-serif";
    c.fillText("You", X(p.x), Z(p.z) - 18);
  }
  cv.style.width = "100%";
  void ZONE_SHAPES;
  return cv;
}

/* ================================================================== */
/* Build menu                                                          */
/* ================================================================== */

export function openBuildMenu(g: Game, plot?: number): Promise<void> {
  return new Promise((resolve) => {
    let nav: Nav;
    const close = () => {
      nav.dispose();
      m.back.remove();
      input.consumeAll();
      resolve();
    };
    const m = modal("Build in Critter Haven", close, "var(--mint)");
    let selPlot = plot ?? g.state.plots.findIndex((p) => !p);
    const render = () => {
      m.body.innerHTML = "";
      const res = h(".cost", { style: { fontSize: "17px", marginBottom: "10px" } });
      for (const id of Object.keys(RESOURCES) as ResourceId[]) res.append(h("span", null, `${RESOURCES[id].icon} ${g.state.resources[id]}`));
      m.body.append(res);
      // plots
      const plots = h(".row", { style: { justifyContent: "center", marginBottom: "12px" } });
      g.state.plots.forEach((p, i) => {
        plots.append(
          h(
            "button.btn" + (i === selPlot ? ".tab.active" : ".tab"),
            {
              "data-nav": "",
              onclick: () => {
                selPlot = i;
                audio.sfx("click");
                render();
              },
            },
            p ? `${BUILDABLES[p].icon} Plot ${i + 1}` : `➕ Plot ${i + 1}`,
          ),
        );
      });
      m.body.append(plots);
      if (selPlot < 0) {
        m.body.append(h("p", { style: { textAlign: "center" } }, "Every plot is full! Critter Haven looks wonderful. 💖"));
        return;
      }
      const grid = h(".grid");
      for (const id of Object.keys(BUILDABLES) as BuildableId[]) {
        const b = BUILDABLES[id];
        const afford = g.canAfford(id);
        const cost = h(".cost");
        for (const [r, n] of Object.entries(b.cost) as [ResourceId, number][]) {
          cost.append(h("span" + (g.state.resources[r] < n ? ".lack" : ""), null, `${RESOURCES[r].icon}${n}`));
        }
        grid.append(
          h(
            ".card",
            {
              "data-nav": "",
              style: afford ? undefined : { opacity: "0.65" },
              onclick: async () => {
                if (!afford) {
                  audio.sfx("fail");
                  g.ui.toast("Not enough materials yet!", "🧺", "var(--pink)");
                  return;
                }
                if (g.state.plots[selPlot]) {
                  const c = await g.ui.say([{ text: `Replace the ${BUILDABLES[g.state.plots[selPlot]!].name}? (Materials aren't refunded.)`, choices: ["Replace it", "Keep it"] }]);
                  if (c !== 0) return;
                }
                audio.sfx("confirm");
                const p = selPlot;
                close();
                await g.build(p, id);
              },
            },
            h("div", { style: { fontSize: "46px" } }, b.icon),
            h(".nm", null, b.name),
            h(".sub", null, b.desc),
            cost,
          ),
        );
      }
      m.body.append(grid);
    };
    g.ui.root.append(m.back);
    nav = new Nav(m.box, close);
    render();
    requestAnimationFrame(() => nav.focusFirst());
  });
}
