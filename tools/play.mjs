// Drive the real game in headless Chromium: node tools/play.mjs <outPrefix> [script.json]
// Steps: {"wait":ms} {"key":"Space","hold":ms} {"eval":"js"} {"shot":"name"} {"move":[x,y],"ms":n}
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
import fs from "fs";
const [prefix = "tools/shots/play", scriptPath, w = "1280", h = "800", url = "http://localhost:5173/"] = process.argv.slice(2);
const steps = scriptPath ? JSON.parse(fs.readFileSync(scriptPath, "utf8")) : [{ wait: 3000 }, { shot: "title" }];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on("console", (m) => { const t = m.text(); if (!t.includes("Babylon.js v") && !t.includes("[vite]")) logs.push(`[${m.type()}] ${t}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(() => logs.push("TIMEOUT waiting __ready"));
for (const s of steps) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.key) { await page.keyboard.down(s.key); await page.waitForTimeout(s.hold ?? 60); await page.keyboard.up(s.key); }
  if (s.click) await page.mouse.click(s.click[0], s.click[1]);
  if (s.eval) { try { const r = await page.evaluate(s.eval); if (r !== undefined) logs.push("eval: " + JSON.stringify(r).slice(0, 400)); } catch (e) { logs.push("evalerr " + e.message); } }
  if (s.shot) { try { await page.screenshot({ path: `${prefix}_${s.shot}.png`, timeout: 120000 }); } catch (e) { logs.push("shot failed " + e.message.split("\n")[0]); } }
  while (logs.length) console.log(logs.shift());
}
console.log(logs.slice(0, 60).join("\n"));
await browser.close();
