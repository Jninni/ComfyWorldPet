// Plays every taming minigame to completion in headless Chromium and checks
// that playMinigame() resolves. Also exercises Fail → Retry and Fail → Later.
//
// usage:
//   node tools/test-minigames.mjs                 # play all games (difficulty 1 + 2)
//   node tools/test-minigames.mjs play treatToss  # one game
//   node tools/test-minigames.mjs shots [w] [h] [suffix]   # screenshots → tools/shots/mg_*.png
//
// Needs the Vite dev server on http://localhost:5173 (npx vite --port 5173 --strictPort).
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

// Own Vite server without HMR so edits by other tools don't reload the page mid-test.
// (set MG_BASE=http://localhost:5173/dev/minigames.html to use the shared dev server instead)
let server = null;
let BASE = process.env.MG_BASE;
if (!BASE) {
  const { createServer } = await import("vite");
  server = await createServer({ server: { port: 5191, strictPort: false, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "silent", clearScreen: false });
  await server.listen();
  BASE = server.resolvedUrls.local[0].replace(/\/$/, "") + "/dev/minigames.html";
}
const [mode = "play", ...rest] = process.argv.slice(2);
const GAMES = ["treatToss", "bubblePop", "melodyMatch", "danceAlong"];

const browser = await chromium.launch({ args: ["--disable-gpu", "--disable-gpu-compositing"] });
let failures = 0;

async function open(params, w = 1180, h = 820) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.setDefaultTimeout(60000);
  page.__logs = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") page.__logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => page.__logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${BASE}?${new URLSearchParams(params)}`);
  await page.waitForFunction(() => window.__ready === true);
  return page;
}
const phase = (page) => page.evaluate(() => window.__minigame?.phase);
const waitPhase = (page, p, timeout = 60000) => page.waitForFunction((p) => window.__minigame?.phase === p, p, { timeout });
async function tapKey(page, code) {
  // hold for two frames so the polled Input module always sees it
  await page.evaluate(async (code) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code }));
  }, code);
}
async function realKey(page, key) {
  await page.keyboard.down(key);
  // Input is polled once per animation frame: hold until at least two frames ran
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(40);
  await page.keyboard.up(key);
}
async function startFromTitle(page) {
  await waitPhase(page, "title");
  await page.waitForTimeout(700);
  await realKey(page, "Space");
  await waitPhase(page, "play");
}
async function finishResult(page) {
  await waitPhase(page, "result");
  await page.waitForTimeout(900);
  const win = await page.evaluate(() => !!document.querySelector(".mg-win"));
  return win;
}
async function results(page) {
  await page.waitForFunction(() => (window.__results || []).length > 0);
  return page.evaluate(() => window.__results);
}

/* ------------------------------------------------------------ bots */

// in-page bot: press A when the treat is near the zone centre (or deliberately far for `miss`)
async function botTreat(page, { miss = false } = {}) {
  return page.evaluate(async (miss) => {
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const key = async (code) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code }));
      await raf();
      await raf();
      window.dispatchEvent(new KeyboardEvent("keyup", { code }));
    };
    const t0 = performance.now();
    while (performance.now() - t0 < 60000) {
      const m = window.__minigame;
      if (!m || m.phase !== "play") return m?.phase;
      const s = m.state;
      if (s.phase === "aim") {
        const d = Math.abs(s.u - s.zc);
        const fire = miss ? d > s.zh + 0.2 && s.u > 0.05 && s.u < 0.95 : d < s.zh * 0.35;
        if (fire) {
          await key("Space");
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      await raf();
    }
    return "timeout";
  }, miss);
}

// node-side bot with real mouse clicks on bubbles
async function botBubbles(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const m = await page.evaluate(() => window.__minigame);
    if (!m || m.phase !== "play") return m?.phase;
    const good = (m.state.bubbles || []).filter((b) => b.kind !== "cloud" && b.y > 120 && b.y < 780);
    if (good.length) {
      const b = good.sort((a, z) => a.y - z.y)[0];
      await page.mouse.click(b.x, b.y - 8);
    }
    await page.waitForTimeout(140);
  }
  return "timeout";
}

// node-side bot with real arrow keys for melody
async function botMelody(page) {
  const keyFor = { up: "ArrowUp", right: "ArrowRight", down: "ArrowDown", left: "ArrowLeft" };
  const t0 = Date.now();
  let lastRound = -1;
  while (Date.now() - t0 < 90000) {
    const m = await page.evaluate(() => window.__minigame);
    if (!m || m.phase !== "play") return m?.phase;
    const s = m.state;
    if (s.phase === "input" && s.round !== lastRound) {
      for (let i = s.inputIdx; i < s.seq.length; i++) {
        await realKey(page, keyFor[s.seq[i]]);
        await page.waitForTimeout(120);
      }
      lastRound = s.round;
    }
    await page.waitForTimeout(100);
  }
  return "timeout";
}

// in-page rhythm bot: press each note's direction when it is ~on the beat
async function botDance(page) {
  return page.evaluate(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const codes = { up: "ArrowUp", right: "ArrowRight", down: "ArrowDown", left: "ArrowLeft" };
    const t0 = performance.now();
    let pressedFor = -1;
    while (performance.now() - t0 < 90000) {
      const m = window.__minigame;
      if (!m || m.phase !== "play") return m?.phase;
      const n = m.state.notes?.[0];
      const id = m.state.hits + ":" + (n ? n.dir + n.dt.toFixed(1) : "");
      if (n && n.dt < 0.035 && n.dt > -0.2 && pressedFor !== m.state.songT) {
        pressedFor = m.state.songT;
        const code = codes[n.dir];
        window.dispatchEvent(new KeyboardEvent("keydown", { code }));
        await raf();
        window.dispatchEvent(new KeyboardEvent("keyup", { code }));
        await raf();
      }
      void id;
      await raf();
    }
    return "timeout";
  });
}

const BOTS = { treatToss: botTreat, bubblePop: botBubbles, melodyMatch: botMelody, danceAlong: botDance };

async function playOne(id, diff) {
  const page = await open({ game: id, autoplay: 1, diff, species: ["puffbun", "chirpy", "fennix", "glowbat"][GAMES.indexOf(id)] });
  const t = Date.now();
  await startFromTitle(page);
  const end = await BOTS[id](page);
  const win = await finishResult(page);
  await realKey(page, "Space"); // "Yay!" / "Retry"
  if (!win) {
    // a retry started — finish it
    await waitPhase(page, "play");
    await BOTS[id](page);
    await finishResult(page);
    await realKey(page, "Space");
  }
  const res = await results(page);
  const ok = res.length === 1 && res[0].success === true && res[0].stars >= 1;
  const closed = await page.evaluate(() => !document.querySelector(".mg-root"));
  console.log(`${ok && closed ? "PASS" : "FAIL"} ${id} d${diff}: bot=${end} firstTryWin=${win} result=${JSON.stringify(res)} overlayRemoved=${closed} ${((Date.now() - t) / 1000).toFixed(1)}s`);
  if (page.__logs.length) console.log("   logs:", page.__logs.slice(0, 5).join(" | "));
  if (!ok || !closed) failures++;
  await page.close();
}

async function failPaths() {
  // treatToss: miss on purpose → fail card → Retry → win
  let page = await open({ game: "treatToss", autoplay: 1, diff: 1 });
  await startFromTitle(page);
  await botTreat(page, { miss: true });
  let win = await finishResult(page);
  const failCard = await page.evaluate(() => !!document.querySelector(".mg-fail"));
  await realKey(page, "Space"); // Retry
  await waitPhase(page, "play");
  await botTreat(page);
  win = await finishResult(page);
  await realKey(page, "Space");
  let res = await results(page);
  let ok = failCard && win && res.length === 1 && res[0].success;
  console.log(`${ok ? "PASS" : "FAIL"} fail→retry→win: failCard=${failCard} ${JSON.stringify(res)}`);
  if (!ok) failures++;
  await page.close();

  // fail → Later (B / Escape) resolves {success:false, stars:0}
  page = await open({ game: "treatToss", autoplay: 1, diff: 3 });
  await startFromTitle(page);
  await botTreat(page, { miss: true });
  await finishResult(page);
  await realKey(page, "Escape");
  res = await results(page);
  ok = res.length === 1 && res[0].success === false && res[0].stars === 0;
  console.log(`${ok ? "PASS" : "FAIL"} fail→later: ${JSON.stringify(res)}`);
  if (!ok) failures++;
  await page.close();

  // title "Not now" via click
  page = await open({ game: "bubblePop", autoplay: 1, diff: 1 });
  await waitPhase(page, "title");
  await page.waitForTimeout(700);
  await page.click(".mg-btn-link");
  res = await results(page);
  ok = res.length === 1 && res[0].success === false;
  console.log(`${ok ? "PASS" : "FAIL"} title→not now (click): ${JSON.stringify(res)}`);
  if (!ok) failures++;
  // Let's go via click on a second launch, then cleanup check
  await page.evaluate(() => window.__play("melodyMatch"));
  await waitPhase(page, "title");
  await page.waitForTimeout(700);
  await page.click(".mg-btn-go");
  await waitPhase(page, "play");
  // tap bells with real pointer clicks
  const pos = await page.evaluate(() => {
    const w = innerWidth;
    return { w };
  });
  void pos;
  console.log(`PASS click "Let's go!" starts play`);
  await page.close();
}

async function shots(w = 1180, h = 820, suffix = "") {
  const sfx = suffix ? `_${suffix}` : "";
  const species = { treatToss: "puffbun", bubblePop: "ribbit", melodyMatch: "chirpy", danceAlong: "fennix" };
  for (const id of GAMES) {
    const short = { treatToss: "treat", bubblePop: "bubble", melodyMatch: "melody", danceAlong: "dance" }[id];
    // title
    let page = await open({ game: id, autoplay: 1, species: species[id] }, w, h);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `tools/shots/mg_${short}_title${sfx}.png` });
    // mid-play
    await realKey(page, "Space");
    await waitPhase(page, "play");
    if (id === "bubblePop") {
      await page.waitForTimeout(1500);
      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(450);
      await page.keyboard.up("ArrowRight");
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(300);
      await page.keyboard.up("ArrowUp");
      await realKey(page, "Space");
      await page.waitForTimeout(250);
      await page.screenshot({ path: `tools/shots/mg_${short}_play${sfx}.png` });
    } else if (id === "treatToss") {
      const p = botTreat(page).catch(() => {});
      await page.waitForTimeout(2300);
      await page.screenshot({ path: `tools/shots/mg_${short}_play${sfx}.png` });
      void p;
    } else if (id === "melodyMatch") {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `tools/shots/mg_${short}_play${sfx}.png` });
    } else {
      const p = botDance(page).catch(() => {});
      await page.waitForTimeout(4200);
      await page.screenshot({ path: `tools/shots/mg_${short}_play${sfx}.png` });
      void p;
    }
    if (page.__logs.length) console.log(id, page.__logs.slice(0, 5).join(" | "));
    await page.close();
    // win result
    page = await open({ game: id, autoplay: 1, species: species[id], result: "win", stars: id === "bubblePop" ? 2 : 3 }, w, h);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `tools/shots/mg_${short}_win${sfx}.png` });
    await page.close();
  }
  const page = await open({ game: "danceAlong", autoplay: 1, species: "hoglet", result: "fail" }, w, h);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `tools/shots/mg_fail${sfx}.png` });
  await page.close();
  console.log("shots written");
}

try {
  if (mode === "shots") await shots(+(rest[0] || 1180), +(rest[1] || 820), rest[2] || "");
  else if (mode === "play" && rest[0]) await playOne(rest[0], +(rest[1] || 1));
  else if (mode === "fail") await failPaths();
  else {
    for (const id of GAMES) await playOne(id, 1);
    for (const id of GAMES) await playOne(id, 2);
    await failPaths();
    console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL MINIGAME TESTS PASSED");
  }
} catch (e) {
  console.error("ERROR", e);
  failures++;
}
await browser.close();
await server?.close();
process.exit(failures ? 1 : 0);
