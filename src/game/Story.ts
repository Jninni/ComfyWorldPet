import type { Game } from "./Game";
import type { Line } from "../ui/UI";
import type { NpcId } from "../entities/characterModels";
import { NPC_INFO } from "../entities/characterModels";
import { audio } from "../audio/Audio";

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
    return t;
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
    if (this.active("haven") && this.stage("haven") === 0) {
      const built = this.g.state.plots.filter(Boolean).length;
      this.g.state.quests.haven.progress = built;
      if (built >= 3) this.advance("haven");
    }
  }

  onBefriend() {
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
    const order = ["main", "tea", "bouquet", "yarn", "hide", "pebbles", "haven"];
    for (const id of order) {
      if (this.active(id)) return { id, title: QUESTS[id].name, text: this.objective(id), icon: QUESTS[id].icon };
    }
    return null;
  }

  /** What should the guide arrow point at? An NPC id, a building door, or a world spot. */
  objectiveTarget(): { npc?: NpcId; building?: string; spot?: [number, number]; critter?: string; cave?: boolean } | null {
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
        return m === 1 || m === 3 || m === 6;
      case "bramble":
        return m === 4 || (m >= 5 && !this.g.state.quests.haven) || (this.active("haven") && this.stage("haven") === 1);
      case "granny":
        return m >= 5 && (!this.g.state.quests.tea || (this.active("tea") && this.stage("tea") === 1));
      case "flora":
        return m >= 5 && (!this.g.state.quests.bouquet || (this.active("bouquet") && this.stage("bouquet") === 1));
      case "stitch":
        return m >= 5 && (!this.g.state.quests.yarn || (this.active("yarn") && this.stage("yarn") === 1));
      case "marina":
        return m >= 5 && (!this.g.state.quests.pebbles || (this.active("pebbles") && this.stage("pebbles") === 1));
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
        } else {
          const seen = g.state.seen.length;
          await say([{ ...W, text: `Your journal has ${seen} of 10 critters. ${seen >= 10 ? "Every single one! Magnificent!" : "Keep exploring — each zone has its own critters!"}` }]);
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
        if (m < 5) {
          await say([{ ...W, text: "Oh, hello! Mind the pins! I'm stitching a quilt with a pattern of stars." }]);
        } else if (!g.state.quests.yarn) {
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
          await say([{ ...W, text: "Want to change your look? Open your bag and pick *Style*!" }]);
        }
        break;
      }

      case "marina": {
        const W = who("marina");
        if (!g.state.quests.pebbles) {
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
          await say([{ ...W, text: "The pond is extra sparkly today. Ducklings love following snacks, you know!" }]);
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
          await say([{ ...W, text: "When I grow up, I'm gonna befriend EVERY critter. Even the glowy ones!" }]);
        }
        break;
      }
    }
  }
}
