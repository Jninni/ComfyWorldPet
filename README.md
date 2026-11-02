# Comfy World Pets 🐾

A cozy, plush-styled 3D creature-befriending adventure for kids, built for tablets first (touch), with full
controller and keyboard support. Explore a semi-open world, enter buildings and a crystal cave, befriend
critters with playful minigames, help villagers with side quests and build up **Critter Haven**.

```bash
npm install
npm run dev        # http://localhost:5173  (add ?q=low|medium|high to force a graphics tier)
npm run build      # production bundle in dist/
```

## Engine evaluation: Babylon.js vs Phaser

| | **Babylon.js** (chosen) | Phaser |
|---|---|---|
| Rendering | Real 3D (WebGL2/WebGPU), shadows, post-processing, PBR/toon via material plugins | 2D sprites; "isometric" needs pre-rendered art and manual depth sorting |
| Look we want | Plush diorama look: real lighting + soft shadows + rim light + outlines on rounded 3D shapes, camera tilt, depth of field | Would need a large hand-painted sprite library for every angle and animation |
| Assets | Everything procedural (no art pipeline needed), so the world can grow quickly | Sprite sheets for every critter/NPC/direction |
| Input | Built-in gamepad support, pointer events; we use our own unified layer | Good input, 2D only |
| Tablet perf | Needs care (draw calls, instancing, dynamic resolution): handled below | Very cheap |

Phaser is excellent for 2D, but the brief asks for a "AAA 3D" feel with interiors and caves seen as dioramas.
Babylon.js gives us real 3D with a fixed SNES-style 3/4 camera — the best of both: the readability of a
classic top-down RPG with the depth, lighting and polish of 3D.

## Art direction

Kawaii pastel "sticker diorama", taken straight from the reference art: lavender / pink / mint / butter /
sky pastels, thick soft plum outlines, chunky rounded shapes, scalloped rugs, hearts and stars.

* **Toon plush shader** (`src/render/Toon.ts`): a Babylon `MaterialPlugin` on `StandardMaterial` adding a soft
  2-band light ramp (keeps real shadows), a fuzzy rim light (the "felt" look) and vertex wind for foliage.
* **Soft shapes** (`src/render/Shapes.ts`): rounded boxes, lathes, blobs with smooth normals so the inverted-hull
  outlines never crack; all vertex-coloured and merged into a handful of draw calls per area.
* **Post FX** (`src/render/Stage.ts`): pastel colour grading, bloom, vignette, FXAA/MSAA, tilt-shift DOF in
  interiors (high tier), sky gradient dome, pastel fog.

## Performance for tablets

* Quality tiers auto-detected (`low` / `medium` / `high`), overridable with `?q=` or in Settings.
* Dynamic resolution: render scale drops when the frame rate sags and recovers when it's smooth.
* World props merged per 48 m chunk (frustum-culled), hills forested with thin instances, grass as thin instances,
  resource nodes as hardware instances, wild critters disabled when far away.

## Controls

| Action | Touch | Gamepad | Keyboard |
|---|---|---|---|
| Move | Floating joystick (left side) | Left stick / d-pad | WASD / arrows |
| Talk / interact / confirm | ✋ button | Ⓐ | Space / E / Enter |
| Back | ↩ button | Ⓑ | Esc |
| Bag (quests, journal, party, map, style, settings) | 🐾 button / 🎒 | Ⓧ / Start | Q / Tab / P |
| Journal | — | Ⓨ | J |
| Zoom | Pinch | — | Mouse wheel |

Menus are fully navigable with the d-pad / stick (spatial focus), LB/RB switch tabs.

## Game content

* **Cozy Hollow** (tutorial village): Mayor Bunbury, Professor Hoot's Library, Granny Pom's Tea House, Flora's
  Flower Shop, Stitch's Sewing Room, your cottage and Bramble's Workshop — all enterable diorama interiors
  modelled on the reference stickers.
* **Whisper Meadow**, **Mossy Woods**, **Sparkle Pond** and the **Crystal Cave** (interior, needs a light).
* **10 critter species**, each with a rare colour variant, befriended through 4 minigames
  (Treat Toss, Bubble Pop, Melody Match, Dance Along). Party of 3 follows you SNES-style; the rest live in Critter Haven.
* **Main story** (tutorial → first friend → gates open → befriend 3 → Star Crystal → Friendship Festival)
  and **6 side quests** with hat rewards.
* **Village building**: gather Twigs, Petals, Pebbles, Berries and Crystals; build 8 kinds of cozy things on
  6 plots in Critter Haven. Party critters have talents (bonus gathering, easier minigames, light in caves).
* Autosave (localStorage) + nap in your bed to save.

## Code map

```
src/main.ts               boot + loading screen
src/game/Game.ts          orchestrator: locations, camera rig, interactions, befriending, building, saving
src/game/World.ts         overworld assembly (terrain, village, zones, gates, resources, critters)
src/game/Actors.ts        player controller, party followers, wild critter AI, NPCs
src/game/Story.ts         quests + all NPC dialogue
src/game/Village.ts       Critter Haven buildables
src/world/layout.ts       world map data: zones, paths, height field, key locations
src/world/Terrain.ts      painted ground + water shader
src/world/props.ts        nature/props kit      src/world/cave.ts   Crystal Cave
src/world/buildings*      house exteriors + diorama interiors
src/entities/*            procedural plush critters, player and villagers
src/minigames/*           the four taming minigames (DOM/Canvas2D)
src/audio/*               procedural WebAudio music + SFX
src/ui/*                  HUD, dialogue, menus, touch controls
src/render/*              toon shader, shapes, stage, particles
dev/*.html                standalone showcase pages for each module
tools/*.mjs               headless screenshot / play-test / audio test scripts
```
