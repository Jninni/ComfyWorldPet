/**
 * Song data. Melodies are written in scale degrees of the song's key
 * (0 = tonic, 7 = tonic an octave up, negative = below) on a step grid
 * of `beats * div` steps per bar. "-" holds, "." rests.
 */
import { SCALES, Song } from "./sequencer";

export type SongId = "title" | "village" | "meadow" | "woods" | "pond" | "cave" | "interior" | "minigame";

/** key of the minigame track (note() is tuned to it): C major */
export const MINIGAME_KEY = 60;

const title: Song = {
  key: 58, // Bb
  scale: SCALES.major,
  bpm: 84,
  beats: 3,
  div: 2,
  swing: 0,
  gain: 1.15,
  rev: 1.4,
  sections: [
    { name: "intro", once: true, chords: ["0", "3:9"] },
    {
      name: "A",
      chords: ["0", "5", "3", "4"],
      alt: ["0", "2", "3", "4"],
      mel: "4 - - 2 4 - | 7 - - 5 4 - | 5 - 3 - 0 - | 1 - - - - -",
    },
    {
      name: "A2",
      chords: ["0", "5", "3:9", "4"],
      mel: "4 - - 2 4 - | 9 - - 7 5 - | 8 - 7 - 5 - | 6 - - - 4 -",
    },
    {
      name: "B",
      chords: ["3", "0", "1:7", "4"],
      alt: ["3", "5", "1:7", "4:s"],
      mel: "7 - 5 - 3 - | 4 - - 2 4 7 | 8 - - 7 5 - | 6 - - - - -",
    },
    {
      name: "A3",
      chords: ["0", "5", "3", "4", "0"],
      mel: "4 - - 2 4 - | 9 - - 7 5 - | 5 - 3 - 0 - | 1 - - 2 1 - | 0 - - - - -",
    },
  ],
  layers: [
    { kind: "lead", inst: "musicbox", oct: 12, vel: 1.45, rev: 0.45, pan: 0.1, legato: 1 },
    { kind: "arp", inst: "musicbox", low: 58, vel: 0.5, rev: 0.4, pan: -0.25, pats: ["0 2 1 2 1 2", "0 2 3 2 1 2", "0 . 1 2 3 2"] },
    { kind: "pad", vel: 0.5, low: 50, rev: 0.5, bright: 0.8 },
    { kind: "bass", inst: "bass", vel: 0.55, rev: 0.1, pats: ["R - - - - -", "R - - 5 - -"] },
    { kind: "sparkle", inst: "bell", low: 82, high: 98, density: 0.04, vel: 0.4, rev: 0.7, pan: 0.4, minPass: 1 },
  ],
};

const village: Song = {
  key: 60, // C
  scale: SCALES.major,
  bpm: 100,
  beats: 4,
  div: 2,
  swing: 0.14,
  gain: 1.4,
  rev: 1,
  sections: [
    { name: "intro", once: true, chords: ["0", "4"] },
    {
      name: "A",
      chords: ["0", "5", "3", "4"],
      alt: ["0", "5", "1:7", "4"],
      mel: "4 - 2 4 7 - 4 - | 5 - 4 2 0 - 2 - | 3 - 5 7 5 - 3 - | 4 - 6 4 1 - . .",
    },
    {
      name: "A2",
      chords: ["0", "5", "3", "4"],
      mel: "4 - 2 4 9 - 7 - | 7 - 5 4 2 - 4 - | 5 - 3 5 7 - 8 7 | 8 - 6 - 4 - . .",
    },
    {
      name: "B",
      chords: ["3", "4", "2", "5"],
      alt: ["3:9", "4", "2:7", "5:7"],
      mel: "7 . 7 5 3 - . . | 8 . 8 6 4 - . . | 9 - 8 7 6 - 4 - | 5 - 7 - 9 - 8 -",
    },
    {
      name: "A3",
      chords: ["0", "5", "3", "4", "0"],
      mel: "4 - 2 4 9 - 7 - | 7 - 5 4 2 - 4 - | 5 - 3 5 7 - 8 7 | 8 - 6 - 1 - 2 - | 0 - - - . . . .",
    },
  ],
  layers: [
    { kind: "lead", inst: "marimba", oct: 12, vel: 1.35, rev: 0.22, pan: 0.05, alt: "flute", altVel: 0.8, altIn: ["B"], altProb: 0.1, legato: 0.85 },
    { kind: "comp", inst: "pluck", low: 60, vel: 0.65, rev: 0.15, pan: -0.3, pats: [". . x . . . x .", ". . x . . x x .", ". x . x . x . x"] },
    { kind: "bass", inst: "bass", vel: 0.8, rev: 0.05, pats: ["R . . . 5 . . .", "R . . 5 8 . 5 .", "R . . R 5 . a ."] },
    {
      kind: "drums",
      vel: 1,
      rev: 0.12,
      pan: 0.15,
      skip: ["intro"],
      drums: [
        { kick: "x...x...", wood: "..x...x.", shaker: "oooooooo" },
        { kick: "x...x.o.", wood: "..x...x.", shaker: "o.ooo.oo" },
      ],
      fill: { kick: "x...x...", wood: "..x.xxx.", shaker: "oooooooo" },
    },
    { kind: "pad", vel: 0.35, low: 52, rev: 0.4, only: ["B", "A3"] },
    { kind: "sparkle", inst: "bell", low: 84, high: 98, density: 0.05, vel: 0.35, rev: 0.6, pan: 0.45, minPass: 1, prob: 0.6 },
  ],
};

const meadow: Song = {
  key: 55, // G
  scale: SCALES.major,
  bpm: 88,
  beats: 4,
  div: 2,
  swing: 0.08,
  gain: 1.05,
  rev: 1.15,
  sections: [
    { name: "intro", once: true, chords: ["0:9", "3:9"] },
    {
      name: "A",
      chords: ["0:9", "3:9", "0:9", "4:s"],
      mel: "4 - - - 2 - 4 - | 5 - - 3 7 - - - | 6 - 5 4 2 - - - | 1 - - - . . . .",
    },
    {
      name: "A2",
      chords: ["0:9", "3:9", "5:7", "4"],
      alt: ["0:9", "3:9", "2:7", "4"],
      mel: "4 - - - 7 - 6 - | 5 - - - 3 - 4 5 | 4 - 2 - 0 - 2 - | 1 - - - - - . .",
    },
    {
      name: "B",
      chords: ["5", "3", "0", "4"],
      alt: ["5:7", "3:9", "0:9", "4:s"],
      mel: "9 - - 7 5 - - - | 7 - 5 - 3 - 5 - | 4 - 6 7 9 - 7 - | 8 - - - 6 - - -",
    },
    {
      name: "A3",
      chords: ["0:9", "3:9", "5:7", "4", "0:9"],
      mel: "4 - - - 7 - 6 - | 5 - - - 3 - 4 5 | 4 - 2 - 0 - 2 - | 1 - - - 2 - 1 - | 0 - - - - - . .",
    },
    { name: "breeze", chords: ["3:9", "0:9"] },
  ],
  layers: [
    { kind: "lead", inst: "flute", oct: 12, vel: 0.95, rev: 0.32, pan: 0.05, legato: 0.96 },
    { kind: "arp", inst: "kalimba", low: 62, vel: 0.62, rev: 0.25, pan: -0.35, pats: ["0 . 1 2 . 1 . 2", "0 . 2 . 1 . 3 .", "0 1 2 . 3 . 2 ."] },
    { kind: "pad", vel: 0.55, low: 50, rev: 0.45, bright: 1.1 },
    { kind: "bass", inst: "bass", vel: 0.62, rev: 0.05, pats: ["R - - - 5 - - -", "R - - - - - 5 -", "R - - 5 R - - -"] },
    {
      kind: "drums",
      vel: 1.3,
      rev: 0.2,
      pan: 0.2,
      skip: ["intro"],
      drums: [{ shaker: "o.o.o.o.", brush: "....x..." }, { shaker: "oo.oo.o.", brush: "....x..o" }],
    },
    { kind: "sparkle", inst: "musicbox", low: 79, high: 96, density: 0.04, vel: 0.35, rev: 0.55, pan: 0.45, prob: 0.7 },
  ],
};

const woods: Song = {
  key: 62, // D dorian
  scale: SCALES.dorian,
  bpm: 84,
  beats: 4,
  div: 2,
  swing: 0.1,
  gain: 1.2,
  rev: 1.2,
  sections: [
    { name: "intro", once: true, chords: ["0:7", "3"] },
    {
      name: "A",
      chords: ["0:7", "3", "0:7", "6"],
      alt: ["0:7", "3:7", "0:79", "6"],
      mel: "4 - - 2 4 - 5 - | 5 - 3 - 0 - - - | 2 - 4 - 6 - 7 - | 8 - 6 - - - . .",
    },
    {
      name: "B",
      chords: ["2", "6", "3", "4"],
      alt: ["2:7", "6", "3", "4:7"],
      mel: "4 - 6 - 7 - 6 4 | 3 - 1 - -1 - . . | 5 - 7 - 10 - 9 - | 8 - - - 4 - . .",
    },
    {
      name: "A2",
      chords: ["0:7", "3", "0:7", "6", "0:7", "3"],
      mel: "4 - - 2 4 - 5 - | 5 - 3 - 0 - - - | 2 - 4 - 6 - 7 - | 8 - 6 - 3 - 1 - | 0 - - - - - . . | . . . . . . . .",
    },
  ],
  layers: [
    { kind: "lead", inst: "flute", oct: 12, vel: 0.8, rev: 0.4, pan: 0.1, alt: "kalimba", altVel: 1.3, altProb: 0.35, prob: 0.85 },
    { kind: "arp", inst: "kalimba", low: 57, vel: 0.6, rev: 0.3, pan: -0.3, pats: ["0 1 2 1 3 1 2 1", "0 2 1 3 . 2 1 .", "0 . 2 1 3 . 1 2"] },
    { kind: "pad", vel: 0.45, low: 50, rev: 0.45, bright: 0.7 },
    { kind: "bass", inst: "bass", vel: 0.7, rev: 0.05, pats: ["R . . R . . 5 .", "R - - . R . 5 .", "R . . . 5 . a ."] },
    {
      kind: "drums",
      vel: 0.85,
      rev: 0.35,
      pan: 0.2,
      skip: ["intro"],
      woodHz: 820,
      drums: [{ kick: "x.......", wood: "....x...", shaker: ".o.o.o.o" }, { kick: "x.....o.", wood: "....x..o", shaker: ".o.o.ooo" }],
    },
    { kind: "sparkle", inst: "bell", low: 81, high: 96, density: 0.035, vel: 0.35, rev: 0.75, pan: 0.5, minPass: 1 },
  ],
};

const pond: Song = {
  key: 53, // F
  scale: SCALES.major,
  bpm: 72,
  beats: 4,
  div: 4,
  swing: 0,
  gain: 1.1,
  rev: 1.3,
  sections: [
    { name: "intro", once: true, chords: ["0:9", "3:9"] },
    {
      name: "A",
      chords: ["0:9", "2:7", "3:9", "4:s"],
      mel:
        "7 - - - - - 4 - 2 - - - 4 - - - | 6 - - - - - 4 - 8 - - - - - - - | 5 - - - - - 3 - 0 - - - 4 - - - | 1 - - - - - - - . . . . . . . .",
    },
    {
      name: "A2",
      chords: ["0:9", "5:7", "3:9", "4"],
      alt: ["0:9", "5:7", "1:7", "4"],
      mel:
        "4 - - - - - 7 - 9 - - - 8 - - - | 7 - - - - - 5 - 4 - - - - - - - | 3 - - - 5 - - - 7 - - - 8 - - - | 6 - - - - - - - 4 - - - - - - -",
    },
    {
      name: "B",
      chords: ["3", "4", "2:7", "5:7"],
      mel:
        "9 - - - - - - - 7 - - - 5 - - - | 8 - - - - - - - 6 - - - 4 - - - | 6 - - - - - - - 4 - - - 2 - - - | 4 - - - - - - - - - - - . . . .",
    },
  ],
  layers: [
    { kind: "lead", inst: "flute", oct: 12, vel: 0.75, rev: 0.38, pan: 0.1, alt: "marimba", altVel: 1.3, altIn: ["B"], altProb: 0.2 },
    {
      kind: "arp",
      inst: "kalimba",
      low: 60,
      vel: 0.42,
      rev: 0.4,
      pan: -0.3,
      pats: ["0 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1", "0 2 4 . 1 3 5 . 2 4 6 . 1 3 5 .", "0 1 2 3 4 5 6 5 4 3 2 1 2 3 4 3"],
    },
    { kind: "pad", vel: 0.5, low: 50, rev: 0.5, bright: 0.85 },
    { kind: "bass", inst: "bass", vel: 0.6, rev: 0.08, pats: ["R - - - - - - - 5 - - - - - - -", "R - - - - - - - - - - - 5 - - -"] },
    { kind: "sparkle", inst: "drop", low: 79, high: 96, density: 0.025, vel: 0.9, rev: 0.5, pan: 0.4 },
    { kind: "drums", vel: 1.1, rev: 0.3, pan: -0.15, skip: ["intro"], drums: [{ shaker: "....o.......o..." }, { shaker: "....o.....o.o..." }] },
  ],
};

const cave: Song = {
  key: 53, // F lydian
  scale: SCALES.lydian,
  bpm: 62,
  beats: 4,
  div: 2,
  swing: 0,
  gain: 1.2,
  rev: 2.2,
  sections: [
    {
      name: "A",
      chords: ["0:7", "1", "0:7", "1"],
      mel: "9 - - - 7 - - - | 8 - - 10 - - - - | 11 - - - 9 - 7 - | 8 - - - - - - -",
    },
    {
      name: "B",
      chords: ["5:7", "2:7", "0:9", "1"],
      alt: ["5:7", "2:7", "4", "1"],
      mel: "12 - - - 11 - - - | 9 - - - 6 - - - | 8 - - - 7 - 4 - | 5 - - - - - - -",
    },
    {
      name: "A2",
      chords: ["0:7", "1", "0:7", "1"],
      mel: "9 - - - 7 - 8 - | 10 - - - 8 - - - | 11 - 12 - 9 - 7 - | 8 - - - - - - -",
    },
    { name: "glow", chords: ["0:79", "1:9"] },
  ],
  layers: [
    { kind: "lead", inst: "bell", oct: 12, vel: 1.4, rev: 0.6, pan: 0.15, alt: "musicbox", altVel: 1.3, altProb: 0.3 },
    { kind: "arp", inst: "musicbox", low: 65, vel: 0.5, rev: 0.6, pan: -0.35, pats: ["0 . 2 . 1 . 3 .", "0 . . 2 . . 3 .", "3 . 2 . 1 . 0 ."] },
    { kind: "pad", vel: 0.5, low: 48, rev: 0.6, bright: 0.75 },
    { kind: "bass", inst: "bass", vel: 0.45, rev: 0.15, pats: ["R - - - - - - -", "R - - - 5 - - -"] },
    { kind: "sparkle", inst: "bell", low: 84, high: 101, density: 0.12, vel: 0.5, rev: 0.85, pan: 0.5 },
    { kind: "sparkle", inst: "musicbox", low: 86, high: 100, density: 0.06, vel: 0.4, rev: 0.85, pan: -0.5, minPass: 1 },
  ],
};

const interior: Song = {
  key: 62, // D
  scale: SCALES.major,
  bpm: 76,
  beats: 4,
  div: 4,
  swing: 0.2,
  gain: 1.15,
  rev: 0.85,
  sections: [
    { name: "intro", once: true, chords: ["3:7", "2:7"] },
    {
      name: "A",
      chords: ["3:7", "2:7", "1:7", "4:7"],
      alt: ["3:79", "2:7", "1:79", "4:s"],
      mel:
        "9 - - - - - 7 - 5 - - - 4 - - - | 4 - - - - - 2 - 1 - - - - - - - | 3 - - - 5 - - - 7 - - - 8 - - - | 6 - - - - - 4 - - - - - . . . .",
    },
    {
      name: "B",
      chords: ["5:7", "1:7", "4:7", "0:7"],
      alt: ["5:7", "1:79", "4:s", "0:79"],
      mel:
        "11 - - - 9 - - - 7 - - - 5 - - - | 8 - - - - - 7 - 5 - - - - - - - | 6 - - - 8 - - - 10 - - - 8 - - - | 7 - - - - - - - . . . . . . . .",
    },
    { name: "chill", chords: ["3:7", "2:7", "1:7", "4:7"] },
  ],
  layers: [
    { kind: "lead", inst: "epiano", oct: 12, vel: 1.3, rev: 0.25, pan: 0.1, alt: "flute", altVel: 0.8, altProb: 0.25, prob: 0.9 },
    { kind: "comp", inst: "epiano", low: 57, vel: 0.42, rev: 0.2, pan: -0.25, pats: ["x - - - - - x - - - x - - - - -", "x - - - - - - - - - x - - x - -", ". . x - - - . . x - - - - - . ."] },
    { kind: "bass", inst: "bass", vel: 0.75, rev: 0.05, pats: ["R - - - . . . . 5 - . R - - . .", "R - - - - - . R . . 5 - - - a .", "R - - . . . R . 5 - - - . . . ."] },
    {
      kind: "drums",
      vel: 1.4,
      rev: 0.15,
      pan: 0.1,
      skip: ["intro"],
      drums: [
        { kick: "x......x..x.....", brush: "....x.......x...", shaker: "o.o.o.o.o.o.o.o." },
        { kick: "x.........x..x..", brush: "....x.......x..o", shaker: "o.o.o.ooo.o.o.oo" },
      ],
    },
    { kind: "pad", vel: 0.4, low: 50, rev: 0.4, bright: 0.65 },
    { kind: "sparkle", inst: "musicbox", low: 81, high: 96, density: 0.02, vel: 0.35, rev: 0.6, pan: 0.45, minPass: 1 },
  ],
};

const minigame: Song = {
  key: MINIGAME_KEY,
  scale: SCALES.major,
  bpm: 120,
  beats: 4,
  div: 2,
  swing: 0.06,
  gain: 1.2,
  rev: 0.8,
  sections: [
    {
      name: "A",
      chords: ["0", "3", "4", "0"],
      mel: "0 . 2 . 4 . 7 . | 5 . 7 5 3 . . . | 4 . 6 4 8 . 6 . | 7 . 4 . 7 - . .",
    },
    {
      name: "A2",
      chords: ["0", "5", "3", "4"],
      alt: ["0", "5", "1", "4"],
      mel: "4 4 2 . 4 . 7 . | 9 . 7 . 5 . 7 . | 8 . 7 . 5 . 3 . | 4 . 6 . 8 - . .",
    },
    {
      name: "B",
      chords: ["3", "4", "2", "5"],
      mel: "7 - 5 7 10 - 7 . | 8 - 6 8 11 - 8 . | 9 - 8 9 11 - 9 . | 7 - 9 - 12 - . .",
    },
    {
      name: "A3",
      chords: ["0", "5", "3", "4"],
      mel: "4 4 2 . 4 . 7 . | 9 . 7 . 5 . 7 . | 8 . 7 . 5 . 3 . | 4 . 6 . 1 - . .",
    },
  ],
  layers: [
    { kind: "lead", inst: "marimba", oct: 12, vel: 1.35, rev: 0.15, pan: 0.05, alt: "bell", altVel: 1.5, altIn: ["B"], altProb: 0.2, legato: 0.8 },
    { kind: "comp", inst: "pluck", low: 60, vel: 0.5, rev: 0.1, pan: -0.3, pats: [". x . x . x . x", ". x . x . x x .", "x . . x . . x ."] },
    { kind: "bass", inst: "bass", vel: 0.8, rev: 0.03, pats: ["R . 8 . R . 8 .", "R . 8 . 5 . 8 .", "R . R 8 . R 5 a"] },
    {
      kind: "drums",
      vel: 1.25,
      rev: 0.1,
      pan: 0.15,
      drums: [
        { kick: "x...x...", wood: "..x...x.", shaker: "oooooooo" },
        { kick: "x..xx...", wood: "..x...xo", shaker: "oxoooxoo" },
      ],
      fill: { kick: "x...x.x.", wood: "..x.xxxx", shaker: "oooooooo" },
    },
    { kind: "sparkle", inst: "bell", low: 84, high: 98, density: 0.05, vel: 0.35, rev: 0.4, pan: 0.45, minPass: 1, prob: 0.7 },
  ],
};

export const SONGS: Record<SongId, Song> = { title, village, meadow, woods, pond, cave, interior, minigame };
