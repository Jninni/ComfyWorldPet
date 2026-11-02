// usage: node tools/test-audio.mjs [--no-wav] [--wav-secs N]
// Renders every music track / sfx / jingle / voice offline in headless Chromium and checks levels.
import { createRequire } from "module";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "tools/shots/audio");
const args = process.argv.slice(2);
const WAVS = !args.includes("--no-wav");
const wi = args.indexOf("--wav-secs");
const WAV_SECS = wi >= 0 ? +args[wi + 1] : 30;
const li = args.indexOf("--long-secs");
const LONG_SECS = li >= 0 ? +args[li + 1] : 75;
const URL = "http://localhost:5173/dev/audio.html";

async function up() {
  try {
    const r = await fetch("http://localhost:5173/dev/audio.html");
    return r.ok;
  } catch {
    return false;
  }
}
let server = null;
if (!(await up())) {
  console.log("starting vite on :5173 …");
  server = spawn("npx", ["vite", "--port", "5173", "--strictPort"], { cwd: ROOT, stdio: "ignore", detached: true });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
// mute Vite HMR so other agents' file edits don't reload the page mid-render
await page.routeWebSocket(/.*/, () => {});
const logs = [];
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(URL);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(1500); // let any vite reload settle

/** evaluate, retrying if the dev server reloads the page underneath us (other files changing) */
async function evalRetry(fn, arg) {
  for (let i = 0; ; i++) {
    try {
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
      return await page.evaluate(fn, arg);
    } catch (e) {
      if (i >= 4 || !/context was destroyed|navigation/i.test(String(e))) throw e;
      await page.waitForTimeout(1000);
    }
  }
}

const failures = [];
const fail = (msg) => failures.push(msg);
const f = (x, d = 3) => (typeof x === "number" ? x.toFixed(d) : String(x));
const db = (x) => 20 * Math.log10(Math.max(1e-9, x));

// 1) pre-unlock safety
const pre = await evalRetry(() => window.__preUnlock);
console.log(`pre-unlock calls: ${pre.errors.length ? "ERRORS " + pre.errors.join("; ") : "all OK"} (state=${pre.debug.state})`);
if (pre.errors.length) fail("pre-unlock errors");
if (pre.debug.state !== "locked") fail("context was created before unlock()");

// 2) offline renders
const t0 = Date.now();
const res = await evalRetry((o) => window.__audioTest.runAll(o), { musicSecs: 8, wavs: WAVS, wavSecs: WAV_SECS, longSecs: LONG_SECS });
console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (res.lint.length) {
  console.log("song lint:\n  " + res.lint.join("\n  "));
  fail("song data lint");
}

function check(kind, name, s, { minWinDb = -45 } = {}) {
  const issues = [];
  if (s.nan) issues.push(`${s.nan} NaN`);
  if (s.peak >= 0.98) issues.push(`clipping peak ${f(s.peak)}`);
  if (s.maxWinDb < minWinDb) issues.push(`too quiet/silent (${f(s.maxWinDb, 1)} dB)`);
  if (Math.abs(s.dc) > 0.005) issues.push(`DC offset ${s.dc.toExponential(2)}`);
  if (s.hiFrac > 0.12) issues.push(`harsh: ${(s.hiFrac * 100).toFixed(0)}% energy above 5 kHz`);
  if (issues.length) fail(`${kind} ${name}: ${issues.join(", ")}`);
  return issues;
}
function row(kind, name, s, extra = "") {
  const issues = check(kind, name, s);
  console.log(
    `${(kind + " " + name).padEnd(26)} peak ${f(s.peak)}  rms ${f(s.rmsDb, 1).padStart(6)} dB  loudest100ms ${f(s.maxWinDb, 1).padStart(6)} dB  dc ${s.dc.toExponential(1).padStart(8)}  silent ${(s.silentFrac * 100).toFixed(0).padStart(3)}%  lo ${(s.loFrac * 100).toFixed(0).padStart(2)}% hi ${(s.hiFrac * 100).toFixed(1).padStart(4)}% ${extra}${issues.length ? "  <-- " + issues.join(", ") : ""}`,
  );
}

console.log("\n== music (8 s each) ==");
const mus = Object.entries(res.music);
for (const [k, s] of mus) {
  row("music", k, s);
  if (s.silentFrac > 0.1) fail(`music ${k}: ${(s.silentFrac * 100).toFixed(0)}% silent windows`);
}
const rmsDbs = mus.map(([, s]) => s.rmsDb);
const spread = Math.max(...rmsDbs) - Math.min(...rmsDbs);
const meanMusicDb = rmsDbs.reduce((a, b) => a + b, 0) / rmsDbs.length;
const musicLoudest = Math.max(...mus.map(([, s]) => s.maxWinDb));
console.log(`music RMS spread: ${spread.toFixed(1)} dB (mean ${meanMusicDb.toFixed(1)} dB)`);
if (spread > 6) fail(`music loudness spread ${spread.toFixed(1)} dB > 6 dB`);

console.log("\n== jingles ==");
for (const [k, s] of Object.entries(res.jingles)) {
  row("jingle", k, s);
  if (s.maxWinDb > musicLoudest + 8) fail(`jingle ${k} overpowers music (${f(s.maxWinDb, 1)} vs music max ${f(musicLoudest, 1)})`);
}

console.log("\n== sfx (rms over active part) ==");
for (const [k, s] of Object.entries(res.sfx)) {
  row("sfx", k, s);
  // SFX should sit on top of the music without overpowering it
  if (s.maxWinDb > musicLoudest + 7) fail(`sfx ${k} overpowers music (${f(s.maxWinDb, 1)} dB vs music max ${f(musicLoudest, 1)} dB)`);
}

console.log("\n== notes ==");
for (const [k, s] of Object.entries(res.notes)) row("note", k, s);

console.log("\n== voices ==");
for (const [k, s] of Object.entries(res.voices)) {
  row("voice", k, s);
  if (s.maxWinDb > musicLoudest + 7) fail(`voice ${k} overpowers music`);
}

console.log(`\n== long renders (${LONG_SECS} s @22.05 kHz, several loops with variation): RMS per 10 s window ==`);
for (const [k, { stats, windows }] of Object.entries(res.long)) {
  const lo = Math.min(...windows);
  const hi = Math.max(...windows);
  const issues = [];
  if (stats.nan) issues.push("NaN");
  if (stats.peak >= 0.98) issues.push(`clipping ${f(stats.peak)}`);
  if (hi - lo > 8) issues.push(`level drifts ${(hi - lo).toFixed(1)} dB`);
  if (stats.silentFrac > 0.05) issues.push(`${(stats.silentFrac * 100).toFixed(0)}% silent`);
  if (issues.length) fail(`long ${k}: ${issues.join(", ")}`);
  console.log(`${("long " + k).padEnd(26)} peak ${f(stats.peak)}  windows ${windows.map((w) => w.toFixed(0)).join(" ")} dB${issues.length ? "  <-- " + issues.join(", ") : ""}`);
}

console.log("\n== stress: full volumes, music + all sfx + jingle + voices at once ==");
for (const [k, s] of Object.entries(res.stress)) row("stress", k, s);

// 3) live smoke test (real AudioContext, scheduler, crossfades)
const live = await evalRetry(() => window.__audioTest.liveSmoke());
console.log("\nlive smoke:", JSON.stringify(live));
if (live.errs?.length) fail("live smoke errors");
if (live.mid?.state !== "running") fail(`live context not running (${live.mid?.state})`);
if (live.mid?.playing !== "meadow") fail("crossfade to meadow failed");
if (live.end?.playing !== "none" || live.end?.fading !== 0) fail("music none did not stop/cleanup players");

// 4) wavs
if (WAVS) {
  mkdirSync(OUT, { recursive: true });
  for (const [name, b64] of Object.entries(res.wavs)) writeFileSync(join(OUT, name), Buffer.from(b64, "base64"));
  console.log(`\nwrote ${Object.keys(res.wavs).length} WAVs to ${OUT}`);
}

const pageErrs = logs.filter((l) => !l.includes("favicon"));
if (pageErrs.length) {
  console.log("\npage console:\n  " + pageErrs.join("\n  "));
  if (pageErrs.some((l) => l.startsWith("[pageerror]") || l.includes("[audio]"))) fail("page errors");
}

await browser.close();
if (server) process.kill(-server.pid);
console.log(failures.length ? `\nFAIL (${failures.length}):\n  - ${failures.join("\n  - ")}` : "\nPASS: all audio checks OK");
process.exit(failures.length ? 1 : 0);
