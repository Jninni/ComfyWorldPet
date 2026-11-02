// usage: node tools/shot.mjs <url> <out.png> [waitMs] [w] [h] [evalJs]
import { createRequire } from "module"; const require = createRequire("/opt/node22/lib/node_modules/"); const { chromium } = require("playwright");
const [url, out, waitMs = "4000", w = "1280", h = "800", evalJs] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => logs.push("TIMEOUT waiting __ready"));
if (evalJs) { try { const r = await page.evaluate(evalJs); if (r !== undefined) logs.push("eval: " + JSON.stringify(r)); } catch (e) { logs.push("evalerr " + e.message); } }
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
console.log(logs.filter(l => !l.includes("Babylon.js v")).slice(0, 40).join("\n"));
await browser.close();
