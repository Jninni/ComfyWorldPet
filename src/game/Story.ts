import type { Game } from "./Game";
import type { Line } from "../ui/UI";
import type { NpcId } from "../entities/characterModels";
import { NPC_INFO } from "../entities/characterModels";
import { audio } from "../audio/Audio";
import { SPECIES_IDS } from "../data/species";

export interface QuestDef {
  id: string;
  name: string;
  giver: NpcId;
  icon: string;
  color: string;
  stages: string[];
  /** target count for progress-style stages, by stage index */
  targets?: Record<number, number>;
  main?: boolean;
}

export const QUESTS: Record<string, QuestDef> = {
  main: {
    id: "main",
    name: "A Friend for Everyone",
    giver: "mayor",
    icon: "⭐",
    color: "var(--butter)",
    main: true,
    stages: [
      "Say hello to Mayor Bunbury in the plaza",
      "Visit Professor Hoot in the Library",
      "Make friends with Mochi the kitten",
      "Talk to Professor Hoot",
      "Ask Bramble to open the village gates",
      "Befriend 3 wild critters",
      "Tell Professor Hoot about your new friends",
      "Find the Star Crystal in the Crystal Cave",
      "Bring the Star Crystal to Mayor Bunbury",
      "Enjoy the Friendship Festival!",
    ],
    targets: { 5: 3 },
  },
  tea: {
    id: "tea",
    name: "Berry Tea Party",
    giver: "granny",
    icon: "🫖",
    color: "var(--lav)",
    stages: ["Collect 3 Berries in Mossy Woods", "Bring the Berries to Granny Pom"],
  },
  bouquet: {
    id: "bouquet",
    name: "A Bouquet for the Mayor",
    giver: "flora",
    icon: "💐",
    color: "var(--pink)",
    stages: ["Collect 5 Petals in Whisper Meadow", "Bring the Petals to Flora"],
  },
  yarn: {
    id: "yarn",
    name: "The Runaway Yarn",
    giver: "stitch",
    icon: "🧶",
    color: "var(--butter)",
    stages: ["Find Stitch's 3 lost yarn balls", "Return the yarn to Stitch"],
    targets: { 0: 3 },
  },
  hide: {
    id: "hide",
    name: "Hide and Seek",
    giver: "pip",
    icon: "🙈",
    color: "var(--mint)",
    stages: ["Find Pip in Whisper Meadow", "Find Pip in Mossy Woods", "Find Pip at Sparkle Pond", "Talk to Pip"],
  },
  pebbles: {
    id: "pebbles",
    name: "Skipping Stones",
    giver: "marina",
    icon: "🪨",
    color: "var(--sky)",
    stages: ["Collect 4 Pebbles", "Bring the Pebbles to Marina"],
  },
  bakery: {
    id: "bakery",
    name: "Mocha's Baking Lessons",
    giver: "mocha",
    icon: "🥐",
    color: "var(--butter)",
    stages: [
      "Plant wheat in your garden (next to your cottage)",
      "Harvest your wheat when it's ready",
      "Collect honey from a beehive in Whisper Meadow",
      "Bake Critter Cookies in Mocha's oven",
      "Show Mocha your cookies",
    ],
  },
  thief: {
    id: "thief",
    name: "The Pastry Thief",
    giver: "mocha",
    icon: "🐾",
    color: "var(--pink)",
    stages: ["Follow the crumb trail", "Befriend the pastry thief in Mossy Woods", "Bring your new friend to meet Mocha"],
    targets: { 0: 9 },
  },
  sewing: {
    id: "sewing",
    name: "Sewing Lessons",
    giver: "stitch",
    icon: "🧵",
    color: "var(--lav)",
    stages: ["Pick 3 dye flowers (any colours!)", "Bring the flowers to Stitch"],
  },
  thornwild: {
    id: "thornwild",
    name: "Heroes of the Thornwild",
    giver: "hoot",
    icon: "⚔️",
    color: "var(--lav)",
    stages: ["Enter the Thornwild (north-east of Whisper Meadow)", "Free the trapped guardians", "Calm the Gloom King", "Tell Professor Hoot"],
    targets: { 1: 3 },
  },
  fishing: {
    id: "fishing",
    name: "Gone Fishing",
    giver: "marina",
    icon: "🎣",
    color: "var(--sky)",
    stages: ["Catch 3 different kinds of fish", "Show Marina your catches"],
    targets: { 0: 3 },
  },
  haven: {
    id: "haven",
    name: "Critter Haven",
    giver: "bramble",
    icon: "🔨",
    color: "var(--mint)",
    stages: ["Build 3 things in Critter Haven", "Tell Bramble"],
    targets: { 0: 3 },
  },
};

const who = (id: NpcId): { who: string; color: string } => ({ who: NPC_INFO[id].name, color: NPC_INFO[id].color });

export class Story {
  constructor(private g: Game) {}

  stage(id: string) {
    return this.g.state.quests[id]?.stage ?? -1;
  }
  done(id: string) {
    return !!this.g.state.quests[id]?.done;
  }
  active(id: string) {
    const q = this.g.state.quests[id];
    return !!q && !q.done;
  }

  start(id: string) {
    if (this.g.state.quests[id]) return;
    this.g.state.quests[id] = { stage: 0, progress: 0, done: false };
    audio.sfx("quest");
    this.g.ui.toast(`New quest: ${QUESTS[id].name}`, QUESTS[id].icon, QUESTS[id].color);
    this.g.refreshQuestUI(true);
    this.checkAuto(id);
  }

  advance(id: string, to?: number) {
    const q = this.g.state.quests[id];
    if (!q) return;
    q.stage = to ?? q.stage + 1;
    q.progress = 0;
    if (q.stage >= QUESTS[id].stages.length - (QUESTS[id].main ? 0 : 0)) {
      q.done = true;
    }
    audio.sfx("quest");
    this.g.refreshQuestUI(true);
    this.g.save();
    this.checkAuto(id);
  }

  complete(id: string) {
    const q = this.g.state.quests[id];
    if (!q) return;
    q.done = true;
    q.stage = QUESTS[id].stages.length;
    audio.jingle("questdone");
    this.g.ui.toast(`Quest complete: ${QUESTS[id].name}!`, "🏅", "var(--mint)");
    this.g.refreshQuestUI(true);
    this.g.save();
  }

  objective(id: string): string {
    const q = this.g.state.quests[id];
    const d = QUESTS[id];
    if (!q || q.done) return "";
    let t = d.stages[Math.min(q.stage, d.stages.length - 1)];
    const target = d.targets?.[q.stage];
    if (target) t += ` (${Math.min(q.progress, target)}/${target})`;
    if (id === "tea" && q.stage === 0) t += ` (${Math.min(this.g.state.resources.berry, 3)}/3)`;
    if (id === "bouquet" && q.stage === 0) t += ` (${Math.min(this.g.state.resources.petal, 5)}/5)`;
    if (id === "pebbles" && q.stage === 0) t += ` (${Math.min(this.g.state.resources.pebble, 4)}/4)`;
    if (id === "sewing" && q.stage === 0) t += ` (${Math.min(this.dyeCount(), 3)}/3)`;
    return t;
  }

  dyeCount() {
    return Object.values(this.g.state.dyes).reduce((a, b) => a + (b ?? 0), 0);
  }

  onGarden(what: "plant" | "harvest", crop: string) {
    if (crop !== "wheat" || !this.active("bakery")) return;
    if (what === "plant" && this.stage("bakery") === 0) this.advance("bakery");
    if (what === "harvest" && this.stage("bakery") === 1) this.advance("bakery");
  }

  onFish() {
    const q = this.g.state.quests.fishing;
    if (!q || q.done || q.stage !== 0) return;
    q.progress = Object.keys(this.g.state.fishLog).length;
    if (q.progress >= 3) this.advance("fishing");
    else this.g.refreshQuestUI(true);
  }

  onGuardianFreed() {
    const q = this.g.state.quests.thornwild;
    if (!q || q.done || q.stage !== 1) return;
    q.progress = ["emberling", "roarlet", "shellby"].filter((s) => this.g.state.flags["freed_" + s]).length;
    if (q.progress >= 3) this.advance("thornwild");
    else this.g.refreshQuestUI(true);
  }

  onCook(food: string) {
    if (food === "cookie" && this.active("bakery") && this.stage("bakery") === 3) this.advance("bakery");
  }

  /** Called whenever inventory/state changes, to auto-advance collect stages. */
  checkAuto(id?: string) {
    const r = this.g.state.resources;
    const chk = (q: string, cond: boolean) => {
      if ((!id || id === q) && this.active(q) && this.stage(q) === 0 && cond) this.advance(q);
    };
    chk("tea", r.berry >= 3);
    chk("bouquet", r.petal >= 5);
    chk("pebbles", r.pebble >= 4);
    if (this.active("yarn") && this.stage("yarn") === 0 && (this.g.state.keyItems.yarn ?? 0) >= 3) this.advance("yarn");
    if (this.active("sewing") && this.stage("sewing") === 0 && this.dyeCount() >= 3) this.advance("sewing");
    if (this.active("bakery") && this.stage("bakery") === 2 && (this.g.state.ingredients.honey ?? 0) >= 1) this.advance("bakery");
    if (this.active("haven") && this.stage("haven") === 0) {
      const built = this.g.state.plots.filter(Boolean).length;
      this.g.state.quests.haven.progress = built;
      if (built >= 3) this.advance("haven");
    }
  }

  onBefriend(species?: string, id?: string) {
    if (id === "thief" && this.active("thief") && this.stage("thief") === 1) this.advance("thief");
    void species;
    if (this.stage("main") === 2) this.advance("main");
    else if (this.stage("main") === 5) {
      const q = this.g.state.quests.main;
      q.progress++;
      if (q.progress >= 3) this.advance("main");
      else this.g.refreshQuestUI(true);
    }
  }

  /** Main quest tracker text, else first active side quest. */
  tracked(): { id: string; title: string; text: string; icon: string } | null {
    const order = ["main", "thornwild", "fishing", "bakery", "thief", "sewing", "tea", "bouquet", "yarn", "hide", "pebbles", "haven"];
    for (const id of order) {
      if (this.active(id)) return { id, title: QUESTS[id].name, text: this.objective(id), icon: QUESTS[id].icon };
    }
    return null;
  }

  /** What should the guide arrow point at? An NPC id, a building door, or a world spot. */
  objectiveTarget(): { npc?: NpcId; building?: string; spot?: [number, number]; critter?: string; cave?: boolean; crumb?: boolean } | null {
    const m = this.stage("main");
    const q = (id: string) => this.active(id);
    switch (m) {
      case 0:
        return { npc: "mayor" };
      case 1:
      case 3:
      case 6:
        return { npc: "hoot" };
      case 2:
        return { critter: "mochi_story" };
      case 4:
        return { npc: "bramble" };
      case 7:
        return { cave: true };
      case 8:
        return { npc: "mayor" };
    }
    if (q("thornwild")) {
      const t = this.stage("thornwild");
      if (t === 0) return { spot: [24, 104] };
      if (t === 1) {
        const left = ["emberling", "roarlet", "shellby"].find((s) => !this.g.state.flags["freed_" + s]);
        if (left) return { critter: "guardian_" + left };
      }
      if (t === 3) return { npc: "hoot" };
    }
    if (q("bakery")) {
      const b = this.stage("bakery");
      if (b <= 1) return { spot: [-25.3, -14.5] };
      if (b === 3) return { building: "bakery" };
      if (b === 4) return { npc: "mocha" };
    }
    if (q("thief")) {
      const t = this.stage("thief");
      if (t === 0) return { crumb: true };
      if (t === 1) return { critter: "thief" };
      if (t === 2) return { npc: "mocha" };
    }
    if (q("sewing") && this.stage("sewing") === 1) return { npc: "stitch" };
    if (q("tea") && this.stage("tea") === 1) return { npc: "granny" };
    if (q("bouquet") && this.stage("bouquet") === 1) return { npc: "flora" };
    if (q("yarn") && this.stage("yarn") === 1) return { npc: "stitch" };
    if (q("pebbles") && this.stage("pebbles") === 1) return { npc: "marina" };
    if (q("haven") && this.stage("haven") === 1) return { npc: "bramble" };
    return null;
  }

  /** Is the NPC someone with something new to say? (shows the "!" marker) */
  hasNews(id: NpcId): boolean {
    const m = this.stage("main");
    switch (id) {
      case "mayor":
        return m === 0 || m === 8 || (this.done("bouquet") === false && this.active("bouquet") && this.stage("bouquet") === 1 && false);
      case "hoot":
        return m === 1 || m === 3 || m === 6 || (this.done("main") && !this.g.state.quests.thornwild) || (this.active("thornwild") && this.stage("thornwild") === 3);
      case "bramble":
        return m === 4 || (m >= 5 && !this.g.state.quests.haven) || (this.active("haven") && this.stage("haven") === 1);
      case "granny":
        return m >= 5 && (!this.g.state.quests.tea || (this.active("tea") && this.stage("tea") === 1));
      case "flora":
        return m >= 5 && (!this.g.state.quests.bouquet || (this.active("bouquet") && this.stage("bouquet") === 1));
      case "stitch":
        return (m >= 1 && !this.g.state.quests.sewing) || (this.active("sewing") && this.stage("sewing") === 1) || (m >= 5 && this.done("sewing") && (!this.g.state.quests.yarn || (this.active("yarn") && this.stage("yarn") === 1)));
      case "mocha":
        return m >= 5 && (!this.g.state.quests.bakery || (this.active("bakery") && this.stage("bakery") === 4) || (this.done("bakery") && !this.g.state.quests.thief) || (this.active("thief") && this.stage("thief") === 2));
      case "marina":
        return (
          m >= 5 &&
          (!this.g.state.quests.fishing || (this.active("fishing") && this.stage("fishing") === 1) || (this.done("fishing") && !this.g.state.quests.pebbles) || (this.active("pebbles") && this.stage("pebbles") === 1))
        );
      case "pip":
        return m >= 5 && (!this.g.state.quests.hide || (this.active("hide") && this.stage("hide") >= 3));
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* NPC conversations                                                   */
  /* ------------------------------------------------------------------ */

  async talk(id: NpcId) {
    const g = this.g;
    const say = (lines: Line[]) => g.ui.say(lines);
    const P = g.state.playerName;
    const m = this.stage("main");

    switch (id) {
      case "mayor": {
        const W = who("mayor");
        if (m === 0) {
          await say([
            { ...W, text: `Oh! Good morning, *${P}*! What a splendid day!`, emote: "wave" },
            { ...W, text: "Today is a very special day. You're old enough to become a *Critter Friend*!" },
            { ...W, text: "Critter Friends explore the world and make friends with all the wild critters." },
            { ...W, text: "First, go see *Professor Hoot* at the *Library*. It's the tall blue house just north of here!" },
          ]);
          this.advance("main");
        } else if (m === 8) {
          await say([
            { ...W, text: "Is that... the *Star Crystal*?! It's even sparklier than in the stories!" },
            { ...W, text: `${P}, you and your critter friends have made Cozy Hollow so happy.` },
            { ...W, text: "Everyone! Let's celebrate with a *Friendship Festival*!" },
          ]);
          g.take("starCrystal", 1);
          this.advance("main");
          await g.festival();
          this.complete("main");
          await say([
            { ...W, text: "Thank you for everything. But there's still so much to explore!" },
            { ...W, text: "Keep making friends, help our villagers, and build up Critter Haven. Cozy Hollow is your home!" },
          ]);
        } else if (this.active("bouquet") && this.stage("bouquet") === 1) {
          await say([{ ...W, text: "Flora is making something? How exciting! I do love surprises." }]);
        } else {
          const lines = [
            "Cozy Hollow is the coziest village in all the land. Ho ho!",
            "Have you visited Granny Pom's tea house? Her berry tea is famous!",
            "Critter Haven grows cozier with every house Bramble builds.",
            "I heard there's a glittering cave beyond Whisper Meadow...",
          ];
          await say([{ ...W, text: lines[Math.floor(Math.random() * lines.length)] }]);
        }
        break;
      }

      case "hoot": {
        const W = who("hoot");
        if (m <= 0) {
          await say([{ ...W, text: "Hoo! A visitor! Have you said hello to the Mayor? He's been waiting for you in the plaza." }]);
        } else if (m === 1) {
          await say([
            { ...W, text: `Hoo-hoo! You must be ${P}! The Mayor told me all about you.` },
            { ...W, text: "Every Critter Friend needs two things. First, this *Critter Journal*!" },
          ]);
          g.give("journal", 1);
          await say([
            { ...W, text: "It records every critter you meet. And second... the *Friendship Charm*!" },
          ]);
          g.give("charm", 1);
          await say([
            { ...W, text: "With the charm, you can play special games with critters. If they have fun, they'll want to be your friend!" },
            { ...W, text: "Why don't you practice with *Mochi*? She's napping on the rug over there. Walk up and say hi!" },
          ]);
          this.advance("main");
        } else if (m === 2) {
          await say([{ ...W, text: "Go on! Mochi is napping on the rug. Walk up to her and press the action button." }]);
        } else if (m === 3) {
          await say([
            { ...W, text: "Hoo-hoo-hooray! Mochi likes you! Critter friends follow you on your adventures." },
            { ...W, text: "You can have *3 friends* with you at a time. The others will play in *Critter Haven*." },
            { ...W, text: "Wild critters live outside the village. Ask *Bramble* to open the gates — he's by the north gate." },
          ]);
          this.advance("main");
        } else if (m === 4) {
          await say([{ ...W, text: "Bramble is waiting by the north gate. Off you go, young explorer!" }]);
        } else if (m === 5) {
          const q = g.state.quests.main;
          await say([{ ...W, text: `You've made ${q.progress} new ${q.progress === 1 ? "friend" : "friends"} so far. Try Whisper Meadow, Mossy Woods and Sparkle Pond!` }]);
        } else if (m === 6) {
          await say([
            { ...W, text: "Three new friends! Hoo! You are a natural, my dear." },
            { ...W, text: "Now I can tell you a secret. North-west of the meadow is the *Crystal Cave*." },
            { ...W, text: "Deep inside sleeps the legendary *Star Crystal*. It's very dark in there, so take this." },
          ]);
          g.give("lantern", 1);
          await say([{ ...W, text: "The *Star Lantern*! Glowing critters live in the cave too. Be gentle with them!" }]);
          this.advance("main");
        } else if (m === 7) {
          await say([{ ...W, text: "The Crystal Cave is north-west of Whisper Meadow. Follow the little path past the flowers!" }]);
        } else if (this.done("main") && !g.state.quests.thornwild) {
          await say([
            { ...W, text: "Hoo... I have worrying news. North-east of Whisper Meadow lies the *Thornwild*." },
            { ...W, text: "Grumpy *Gloomies* have taken over, and three brave *guardian critters* are trapped in gloom bubbles!" },
            { ...W, text: "You'll need this: a *Sparkle Wand*! Bonk Gloomies and they poof into sparkles. Press Ⓧ, F or ⚔️ to swing it." },
          ]);
          g.give("wand", 1);
          await say([
            { ...W, text: "You have *5 hearts*. If they run out, you'll rest at the last *campfire* — no harm done! Eating food heals you too." },
            { ...W, text: "Free the guardians, befriend them, and calm the *Gloom King*. Guardian critters fight by your side!" },
          ]);
          this.start("thornwild");
          g.refreshThornGate();
        } else if (this.active("thornwild") && this.stage("thornwild") === 3) {
          await say([
            { ...W, text: "You calmed the Gloom King?! Hoo-hoo-HOORAY! You're a true hero of Cozy Hollow!" },
            { ...W, text: "And... I've heard whispers of a shy *Moonbeam Unicorn* in a glade of Whisper Meadow. It only appears to heroes!" },
          ]);
          this.complete("thornwild");
          g.refreshUnicorn();
        } else if (this.active("thornwild")) {
          await say([{ ...W, text: "The Thornwild gate is north-east of Whisper Meadow. Be brave — and remember, campfires are safe spots!" }]);
        } else {
          const seen = g.state.seen.length;
          await say([{ ...W, text: `Your journal has ${seen} of ${SPECIES_IDS.length} critters. ${seen >= SPECIES_IDS.length ? "Every single one! Magnificent!" : "Keep exploring — each zone has its own critters!"}` }]);
        }
        break;
      }

      case "bramble": {
        const W = who("bramble");
        if (m < 4) {
          await say([{ ...W, text: "Hmm-hmm. The gates stay shut until you've got a Friendship Charm and a critter buddy. Safety first!" }]);
        } else if (m === 4) {
          await say([
            { ...W, text: "Well look at that! A critter buddy already! You're ready, kiddo." },
            { ...W, text: "I'll open all the gates. North to *Whisper Meadow*, west to *Mossy Woods*, east to *Sparkle Pond*." },
          ]);
          await g.openGates();
          await say([
            { ...W, text: "One more thing! I'm building *Critter Haven* east of the plaza — a home for all your critter friends." },
            { ...W, text: "Bring me *Twigs*, *Petals*, *Pebbles* and such, and we'll build cozy things together. Visit my workshop anytime!" },
          ]);
          this.advance("main");
          g.placeBrambleAtWorkshop();
        } else {
          if (!g.state.quests.haven) {
            await say([{ ...W, text: "Let's make Critter Haven the coziest place around! Build *3 things* there and I'll have a little reward for you." }]);
            this.start("haven");
          } else if (this.active("haven") && this.stage("haven") === 1) {
            await say([
              { ...W, text: "Look at Critter Haven now! The critters love it." },
              { ...W, text: "Here, I made you something special. A *Golden Crown*, fit for a Critter Friend!" },
            ]);
            g.unlockHat("crown");
            this.complete("haven");
          }
          const c = await say([{ ...W, text: "What can I build for you today?", choices: ["Let's build!", "Just saying hi"] }]);
          if (c === 0) await g.openBuildMenu();
        }
        break;
      }

      case "granny": {
        const W = who("granny");
        if (m < 5) {
          await say([{ ...W, text: "Welcome, dearie! Sit, sit! Would you like a cup of tea? It's chamomile today." }]);
        } else if (!g.state.quests.tea) {
          await say([
            { ...W, text: "Oh dearie, I'm planning a tea party, but I've run out of berries for my famous *Berry Tea*!" },
            { ...W, text: "Could you find *3 Berries* in Mossy Woods? The bushes there are full of them." },
          ]);
          this.start("tea");
        } else if (this.active("tea") && this.stage("tea") === 0) {
          await say([{ ...W, text: "Berry bushes grow in Mossy Woods, west of the village. Look for the red dots!" }]);
        } else if (this.active("tea") && this.stage("tea") === 1) {
          await say([{ ...W, text: "Oh my, such plump berries! Let me put the kettle on..." }]);
          g.take("berry", 3);
          await say([{ ...W, text: "Here, take these *Critter Cookies*. Offer one to a wild critter and befriending gets easier!" }]);
          g.give("cookie", 3);
          g.unlockHat("strawhat");
          await say([{ ...W, text: "And this old *straw hat* — it kept me cool on many sunny days." }]);
          this.complete("tea");
        } else {
          await say([{ ...W, text: "Come back anytime for tea, dearie. And bring your critter friends!" }]);
          if ((g.state.keyItems.cookie ?? 0) < 1) {
            await say([{ ...W, text: "Out of cookies? Here, have a couple more. Fresh from the oven!" }]);
            g.give("cookie", 2);
          }
        }
        break;
      }

      case "flora": {
        const W = who("flora");
        if (m < 5) {
          await say([{ ...W, text: "Welcome to my flower shop! Every flower here was grown with love." }]);
        } else if (!g.state.quests.bouquet) {
          await say([
            { ...W, text: "I want to make a big bouquet for the Mayor, but I need more petals..." },
            { ...W, text: "Could you gather *5 Petals* from the flowers in Whisper Meadow? Look for the sparkly ones!" },
          ]);
          this.start("bouquet");
        } else if (this.active("bouquet") && this.stage("bouquet") === 0) {
          await say([{ ...W, text: "Whisper Meadow is just north of the village. The sparkly flowers have the softest petals." }]);
        } else if (this.active("bouquet") && this.stage("bouquet") === 1) {
          g.take("petal", 5);
          await say([
            { ...W, text: "They're perfect! The Mayor will be so happy." },
            { ...W, text: "I made this *Flower Crown* with the extra petals. It's for you!" },
          ]);
          g.unlockHat("flower");
          this.complete("bouquet");
        } else {
          await say([{ ...W, text: "Did you know? Puffbuns love the smell of fresh tulips." }]);
        }
        break;
      }

      case "stitch": {
        const W = who("stitch");
        if (m < 1) {
          await say([{ ...W, text: "Oh, hello! Mind the pins! I'm stitching a quilt with a pattern of stars." }]);
        } else if (!g.state.quests.sewing) {
          await say([
            { ...W, text: `Oh! You're ${P}, aren't you? Have you ever wanted to make your *own clothes*?` },
            { ...W, text: "I can teach you to *sew*! And here's my secret: the prettiest colours come from *flowers*." },
            { ...W, text: "Every flower makes a different dye — pink roses, yellow sunflowers, blue bluebells... Pick *3 dye flowers* and bring them to me!" },
            { ...W, text: "You'll find daisies and poppies right here in the village, and lots more out in the wild." },
          ]);
          this.start("sewing");
        } else if (this.active("sewing") && this.stage("sewing") === 0) {
          await say([{ ...W, text: `You have ${this.dyeCount()} of 3 dye flowers. Look for the flowers with a little sparkle!` }]);
        } else if (this.active("sewing") && this.stage("sewing") === 1) {
          await say([
            { ...W, text: "Ooh, what lovely colours! Now watch closely: pick a *pattern*, choose your *colours*, and stitch-stitch-stitch!" },
            { ...W, text: "You're a natural! From now on you can use my *sewing machine* whenever you like." },
            { ...W, text: "Each piece needs a few *Petals* for the fabric, and one dye flower for every colour you use. Have fun!" },
          ]);
          g.state.skills.sewing = true;
          this.complete("sewing");
          g.ui.toast("New skill: Sewing! Use Stitch's sewing machine.", "🧵", "var(--lav)");
          const c = await say([{ ...W, text: "Want to sew something right now?", choices: ["Yes, let's sew!", "Maybe later"] }]);
          if (c === 0) await g.openSewing();
        } else if (m >= 5 && !g.state.quests.yarn) {
          await say([
            { ...W, text: "Oh no, oh no! A gust of wind blew my *yarn balls* right out the window!" },
            { ...W, text: "They rolled far away — one to the *meadow*, one to the *woods*, and one to the *pond*. Can you find them?" },
          ]);
          this.start("yarn");
          g.refreshPickups();
        } else if (this.active("yarn") && this.stage("yarn") === 0) {
          await say([{ ...W, text: `You found ${g.state.keyItems.yarn ?? 0} of 3. They're fluffy and colourful — you can't miss them!` }]);
        } else if (this.active("yarn") && this.stage("yarn") === 1) {
          g.take("yarn", 3);
          await say([
            { ...W, text: "My yarn! Thank you, thank you! Now I can finish my quilt." },
            { ...W, text: "I knitted you a cute *beret* while I waited. Try it on!" },
          ]);
          g.unlockHat("beret");
          this.complete("yarn");
        } else {
          const c = await say([{ ...W, text: "Back for more sewing? My machine is all yours!", choices: ["Let's sew!", "Just visiting"] }]);
          if (c === 0) await g.openSewing();
        }
        break;
      }

      case "mocha": {
        const W = who("mocha");
        if (m < 5) {
          await say([
            { ...W, text: "Mew! Welcome to my bakery! Everything is fresh out of the oven." },
            { ...W, text: "Once you're a real Critter Friend, come back and I'll teach you to *bake*! Purr-omise!" },
          ]);
        } else if (!g.state.quests.bakery) {
          await say([
            { ...W, text: `${P}! The Critter Friend! Mrrow, I've been hoping you'd visit.` },
            { ...W, text: "Did you know critters *love* treats? And yummy food can give *you* special powers too!" },
            { ...W, text: "Every good baker starts with the basics. Here — *wheat seeds* and *carrot seeds* for your very own garden!" },
            { ...W, text: "There are garden beds right next to *your cottage*. Plant some *wheat*, and water it so it grows twice as fast!" },
          ]);
          g.state.skills.gardening = true;
          g.state.skills.cooking = true;
          this.start("bakery");
          g.ui.toast("New skills: Gardening & Cooking!", "🌱", "var(--mint)");
        } else if (this.active("bakery") && this.stage("bakery") < 4) {
          const tips = [
            "Plant *wheat* in the garden beds beside your cottage!",
            "Your wheat is growing! Water it, then come back when it sparkles.",
            "Cookies need *honey*! The beehives are out in *Whisper Meadow*.",
            "Use my *oven* to bake *Critter Cookies*: 1 Wheat + 1 Honey!",
          ];
          await say([{ ...W, text: tips[this.stage("bakery")] }]);
        } else if (this.active("bakery") && this.stage("bakery") === 4) {
          await say([
            { ...W, text: "Mmm, these smell purr-fect! You're a real baker now!" },
            { ...W, text: "Here are *strawberry* and *pumpkin seeds*, and my whole *recipe book*. Cakes, pies, soups, muffins..." },
            { ...W, text: "Some treats make *you* stronger, and some are for *sharing* with your critter friends. Check your bag!" },
            { ...W, text: "Oh! And the *order board* outside — villagers post what they're craving. Deliver food and they'll reward you!" },
          ]);
          this.complete("bakery");
          g.ui.toast("All recipes & seeds unlocked!", "📖", "var(--butter)");
        } else if (this.done("bakery") && !g.state.quests.thief) {
          await say([
            { ...W, text: "Mew... can I tell you a secret? Someone's been *nibbling my pastries* every night!" },
            { ...W, text: "This morning I found a trail of *crumbs* leading away from the bakery. Could you follow it and find the little thief?" },
          ]);
          this.start("thief");
          g.life.refreshCrumbs();
        } else if (this.active("thief") && this.stage("thief") < 2) {
          await say([{ ...W, text: this.stage("thief") === 0 ? "The crumbs start right outside my door and head *west*!" : "A stripy tail in *Mossy Woods*? Be gentle — a *Critter Cookie* might help!" }]);
        } else if (this.active("thief") && this.stage("thief") === 2) {
          if (!g.partyHas("redpanda")) {
            await say([{ ...W, text: "You found the pastry thief? Bring them along in your party so I can meet them!" }]);
          } else {
            await say([
              { ...W, text: "So YOU'RE the one who's been eating my muffins! Mrrrow..." },
              { ...W, text: "...How can I stay cross with that fluffy face? You can be my official *taste-tester* instead!" },
              { ...W, text: `Thank you, ${P}. Here's a little *chef's hat* — you're an honorary baker of Cozy Hollow!` },
            ]);
            g.unlockHat("chef");
            g.give("shortcake", 2);
            this.complete("thief");
          }
        } else {
          const c = await say([{ ...W, text: "What can I do for you, sweetie?", choices: ["Bake something", "Café orders", "Just saying hi"] }]);
          if (c === 0) await g.openOven();
          else if (c === 1) await g.openOrders();
        }
        break;
      }

      case "marina": {
        const W = who("marina");
        if (!g.state.quests.fishing) {
          await say([
            { ...W, text: "Ahoy, matey! Ever been *fishing*? Sparkle Pond is full of the cutest fish!" },
            { ...W, text: "Here — take my spare *Fishing Rod*. Look for the *ripples* on the water, stand at the shore and press the action button." },
          ]);
          g.give("rod", 1);
          await say([
            { ...W, text: "Wait for a nibble... when the bobber *dips*, tap quick! Then *hold* to lift the net and keep it on the fish." },
            { ...W, text: "Catch *3 different kinds* and come show me! Oh, and you might fish up a silly old boot. Happens to the best of us!" },
          ]);
          this.start("fishing");
        } else if (this.active("fishing") && this.stage("fishing") === 0) {
          await say([{ ...W, text: `You've found ${Object.keys(g.state.fishLog).length} kinds so far! Rare fish bite less often — keep trying!` }]);
        } else if (this.active("fishing") && this.stage("fishing") === 1) {
          await say([
            { ...W, text: "Look at all those! You're a natural angler!" },
            { ...W, text: "Here's my *Lucky Lure*. Rare fish — like the legendary *Golden Koi* — will bite more often now!" },
            { ...W, text: "Tip: Mocha can bake *Fishy Pie* from 2 Fish and 1 Wheat. Critters go wild for it!" },
          ]);
          g.give("lure", 1);
          this.complete("fishing");
        } else if (!g.state.quests.pebbles) {
          await say([
            { ...W, text: "Ahoy! I'm practising skipping stones, but I've run out of good flat pebbles." },
            { ...W, text: "Could you find *4 Pebbles* for me? They sparkle along the shore." },
          ]);
          this.start("pebbles");
        } else if (this.active("pebbles") && this.stage("pebbles") === 0) {
          await say([{ ...W, text: "The best pebbles sparkle by the water. Ribbits love hopping around them too!" }]);
        } else if (this.active("pebbles") && this.stage("pebbles") === 1) {
          g.take("pebble", 4);
          await say([{ ...W, text: "Wheee! Look at that one go — five skips! Here, take these Critter Cookies as thanks!" }]);
          g.give("cookie", 3);
          this.complete("pebbles");
        } else {
          const lines = ["The pond is extra sparkly today. Ducklings love following snacks, you know!", "Have you caught a Golden Koi yet? They say it brings good luck!", "Moon Jellies glow softly... I love watching them at dusk."];
          await say([{ ...W, text: lines[Math.floor(Math.random() * lines.length)] }]);
        }
        break;
      }

      case "pip": {
        const W = who("pip");
        if (m < 5) {
          await say([{ ...W, text: "Hiya! I'm gonna be the greatest explorer ever! Once the gates open, anyway..." }]);
        } else if (!g.state.quests.hide) {
          await say([
            { ...W, text: `Hey ${P}! Wanna play *hide and seek*? I'm REALLY good at hiding!` },
            { ...W, text: "I'll hide somewhere in *Whisper Meadow* first. Count to ten! Ready... GO!" },
          ]);
          this.start("hide");
          g.movePipForHide();
        } else if (this.active("hide") && this.stage("hide") < 3) {
          const s = this.stage("hide");
          const next = ["Mossy Woods", "Sparkle Pond"][s] ?? "";
          if (s < 2) {
            await say([{ ...W, text: `Aww, you found me! Okay, okay... next I'll hide in *${next}*! No peeking!` }]);
          } else {
            await say([{ ...W, text: "Found me AGAIN?! You're amazing! Meet me back in the village plaza!" }]);
          }
          this.advance("hide");
          g.movePipForHide();
        } else if (this.active("hide") && this.stage("hide") === 3) {
          await say([
            { ...W, text: "You're the best seeker in all of Cozy Hollow! Here's my lucky *bunny ears* hat!" },
          ]);
          g.unlockHat("bunnyears");
          this.complete("hide");
        } else {
          const lines = [
            "When I grow up, I'm gonna befriend EVERY critter. Even the glowy ones!",
            "Psst! I saw shiny treasure chests on top of really tall rocks. You'd need a DOUBLE jump to get up there! Chirpy can help — or ride a unicorn!",
            "The tallest place is Mossy Tower in the woods. Hop on the low step first, then double jump to the top!",
          ];
          await say([{ ...W, text: lines[Math.floor(Math.random() * lines.length)] }]);
        }
        break;
      }
    }
  }
}
