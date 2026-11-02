/**
 * Dev sound board for the procedural audio + test hooks used by tools/test-audio.mjs.
 */
import { audio, audioDebug, MusicId, SfxId, JingleId } from "../src/audio/Audio";
import {
  analyze,
  lintSongs,
  renderJingle,
  renderMusic,
  renderNotes,
  renderSfx,
  renderVoice,
  reelJingles,
  reelSfx,
  reelVoices,
  toBase64,
  toWav,
  Stats,
} from "../src/audio/offline";
import { VOICE_SPECIES } from "../src/audio/sfx";
import * as offline from "../src/audio/offline";
import { SONGS } from "../src/audio/songs";

const MUSIC: MusicId[] = ["title", "village", "meadow", "woods", "pond", "cave", "interior", "minigame", "none"];
const SFX_IDS: SfxId[] = [
  "click", "confirm", "back", "step", "talk", "pop", "sparkle", "success", "fail", "heart", "whoosh", "door", "pickup",
  "coin", "jump", "splash", "chime", "levelup", "build", "tame", "bubble", "countdown", "go", "miss", "quest",
];
const JINGLES: JingleId[] = ["victory", "newfriend", "questdone", "fanfare"];
const MOODS = ["happy", "curious", "sad"] as const;

// ------------------------------------------------------------ pre-unlock safety check (runs before any gesture)
const preUnlockErrors: string[] = [];
function tryCall(name: string, f: () => unknown) {
  try {
    f();
  } catch (e) {
    preUnlockErrors.push(`${name}: ${(e as Error).message}`);
  }
}
for (const m of MUSIC) tryCall("music " + m, () => audio.music(m));
tryCall("music none", () => audio.music("none"));
for (const s of SFX_IDS) tryCall("sfx " + s, () => audio.sfx(s, { pitch: 1.2, volume: 0.5 }));
for (const j of JINGLES) tryCall("jingle " + j, () => audio.jingle(j));
for (let i = -2; i < 14; i++) tryCall("note " + i, () => audio.note(i, "marimba"));
for (const sp of [...VOICE_SPECIES, "unknown"]) for (const m of MOODS) tryCall("voice " + sp, () => audio.voice(sp, m));
tryCall("volumes", () => {
  const m = audio.musicVolume;
  const s = audio.sfxVolume;
  audio.setVolumes(m, s);
});
tryCall("bad args", () => {
  audio.sfx("nope" as SfxId);
  audio.note(NaN);
  audio.voice("");
});
(window as unknown as Record<string, unknown>).__preUnlock = { errors: preUnlockErrors, debug: audioDebug() };

// ------------------------------------------------------------ UI
const $ = (id: string) => document.getElementById(id)!;
function btn(parent: string, label: string, cls: string, on: () => void) {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = cls;
  b.addEventListener("click", () => {
    audio.unlock();
    on();
    refresh();
  });
  $(parent).appendChild(b);
  return b;
}
document.addEventListener("pointerdown", () => audio.unlock(), { capture: true });

const musicBtns = new Map<string, HTMLButtonElement>();
for (const m of MUSIC) musicBtns.set(m, btn("music", m, "music", () => audio.music(m)));
for (const j of JINGLES) btn("jingles", j, "jingle", () => audio.jingle(j));
for (const s of SFX_IDS) btn("sfx", s, "", () => audio.sfx(s));
for (const inst of ["bell", "marimba", "flute"] as const)
  for (let i = 0; i < 12; i++) btn("notes", `${inst[0]}${i}`, "note", () => audio.note(i, inst));
for (const sp of [...VOICE_SPECIES, "unknown"]) {
  const row = document.createElement("div");
  row.className = "row";
  row.style.marginBottom = "6px";
  row.id = "v-" + sp;
  $("voices").appendChild(row);
  for (const m of MOODS) btn(row.id, `${sp} · ${m}`, "", () => audio.voice(sp, m));
}

const mv = $("mv") as HTMLInputElement;
const sv = $("sv") as HTMLInputElement;
mv.value = String(audio.musicVolume);
sv.value = String(audio.sfxVolume);
const onVol = () => audio.setVolumes(+mv.value, +sv.value);
mv.addEventListener("input", onVol);
sv.addEventListener("input", onVol);

function refresh() {
  const d = audioDebug();
  $("status").textContent = `ctx=${d.state} music=${d.playing} fading=${d.fading} t=${d.time.toFixed(1)}`;
  for (const [id, b] of musicBtns) b.classList.toggle("on", id === d.wanted);
}
setInterval(refresh, 500);
refresh();

// ------------------------------------------------------------ offline test hooks
const fmt = (s: Stats) => `peak ${s.peak.toFixed(3)} rms ${s.rmsDb.toFixed(1)}dB win ${s.maxWinDb.toFixed(1)}dB dc ${s.dc.toExponential(1)}`;

async function runAll(opts: { musicSecs?: number; wavs?: boolean; wavSecs?: number; longSecs?: number } = {}) {
  const musicSecs = opts.musicSecs ?? 8;
  const res: {
    lint: string[];
    music: Record<string, Stats>;
    sfx: Record<string, Stats>;
    jingles: Record<string, Stats>;
    voices: Record<string, Stats>;
    notes: Record<string, Stats>;
    stress: Record<string, Stats>;
    long: Record<string, { stats: Stats; windows: number[] }>;
    wavs: Record<string, string>;
  } = { lint: lintSongs(), music: {}, sfx: {}, jingles: {}, voices: {}, notes: {}, stress: {}, long: {}, wavs: {} };
  for (const m of MUSIC) if (m !== "none") res.music[m] = analyze(await renderMusic(m, musicSecs, 7));
  for (const s of SFX_IDS) res.sfx[s] = analyze(await renderSfx(s), true);
  for (const j of JINGLES) res.jingles[j] = analyze(await renderJingle(j), true);
  for (const sp of [...VOICE_SPECIES, "unknown"]) for (const m of MOODS) res.voices[`${sp}.${m}`] = analyze(await renderVoice(sp, m), true);
  for (const inst of ["bell", "marimba", "flute"] as const) res.notes[inst] = analyze(await renderNotes(inst), true);
  for (const m of ["village", "minigame", "cave"] as const) res.stress[m] = analyze(await offline.renderStress(m));
  if (opts.longSecs) {
    for (const m of MUSIC) {
      if (m === "none") continue;
      const b = await renderMusic(m, opts.longSecs, 11, 22050);
      res.long[m] = { stats: analyze(b), windows: offline.windowDb(b, 10) };
    }
  }
  if (opts.wavs) {
    const secs = opts.wavSecs ?? 30;
    for (const m of MUSIC) if (m !== "none") res.wavs[`music-${m}.wav`] = toBase64(toWav(await renderMusic(m, secs, 3)));
    res.wavs["sfx-reel.wav"] = toBase64(toWav(await reelSfx(SFX_IDS)));
    res.wavs["jingles-reel.wav"] = toBase64(toWav(await reelJingles(JINGLES)));
    res.wavs["voices-reel.wav"] = toBase64(toWav(await reelVoices([...VOICE_SPECIES, "unknown"])));
    res.wavs["notes-marimba.wav"] = toBase64(toWav(await renderNotes("marimba")));
    res.wavs["notes-bell.wav"] = toBase64(toWav(await renderNotes("bell")));
    res.wavs["notes-flute.wav"] = toBase64(toWav(await renderNotes("flute")));
  }
  return res;
}

/** realtime smoke test: unlock, play/crossfade tracks, fire everything, report errors & state */
async function liveSmoke() {
  const errs: string[] = [];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    audio.unlock();
    await wait(200);
    audio.music("village");
    audio.music("village");
    await wait(1200);
    audio.music("meadow");
    for (const s of SFX_IDS) audio.sfx(s);
    for (const j of JINGLES) audio.jingle(j);
    for (let i = 0; i < 12; i++) audio.note(i, "flute");
    for (const sp of VOICE_SPECIES) audio.voice(sp, "curious");
    audio.setVolumes(0.5, 0.7);
    await wait(2200);
    const mid = audioDebug();
    audio.music("none");
    await wait(1800);
    return { errs, mid, end: audioDebug(), vol: [audio.musicVolume, audio.sfxVolume] };
  } catch (e) {
    errs.push(String(e));
    return { errs };
  }
}

(window as unknown as Record<string, unknown>).__audioTest = { runAll, liveSmoke, offline, SONGS };
(window as unknown as Record<string, unknown>).__ready = true;

$("analyze").addEventListener("click", async () => {
  $("report").textContent = "rendering…";
  const r = await runAll({ musicSecs: 8 });
  const rows = [
    ...Object.entries(r.music).map(([k, s]) => `music ${k}`.padEnd(24) + fmt(s)),
    ...Object.entries(r.jingles).map(([k, s]) => `jingle ${k}`.padEnd(24) + fmt(s)),
    ...Object.entries(r.sfx).map(([k, s]) => `sfx ${k}`.padEnd(24) + fmt(s)),
  ];
  $("report").innerHTML = `<pre>${[...r.lint, ...rows].join("\n")}</pre>`;
});
