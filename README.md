[![Neon Bay — Make GTA 6 on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/muhamadlangg71-prog/neon-bay-2/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/muhamadlangg71-prog/neon-bay-2/reward.svg)](https://make.fun/bounty/gta6-01)

# Neon Bay

An open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). You play Rico, a driver
fresh in the fictional sun-soaked city of Neon Bay: steal cars, outrun the Neon Bay
PD, and work through five story jobs — from a hot-wheeled getaway to the Bay Bank Job.

## What is in the game

- A full 3D city to explore on foot and by car: gridded streets, towers with lit
  windows, street lamps, palms and a sunset skyline, all procedural (no borrowed art).
- Stealable cars with arcade driving, plus city traffic and pedestrians going about
  their day.
- A wanted level (0–5 stars): stealing, hitting people and shooting raise the heat;
  police cars chase and ram you, foot officers try to bust you, and the heat cools
  off if you lay low.
- Combat on foot: punch (F) and a hitscan pistol (click), with a tracer and sounds.
- Five story missions with a waypoint beacon, a compass arrow and a minimap blip:
  Hot Wheels, Parcel Dash, Tail Job, Lose the Heat, and the Bay Bank Job.
- A HUD with health, cash, wanted stars, speed and a live minimap, plus a start
  menu, pause-free saving (P, or automatically after each job) and game-over screens.
- Procedural WebAudio: engine hum, police sirens, gunshots and cash chimes (M mutes).

## Play it

```sh
node serve.mjs
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network:
`game/` is plain static files and the vendored three.js lives under `game/vendor/`.

Controls: **WASD** move / drive · **E** enter or exit a car · **F** punch ·
**Click** shoot · **Shift** sprint · **P** save · **M** mute · drag the mouse to look.

## How it is built

- `game/index.html` — the page, HUD and minimap canvas.
- `game/src/main.js` — bootstrap, game loop, input, camera, wanted system, combat.
- `game/src/city.js` — the procedural city: ground texture, towers, lamps, skyline.
- `game/src/vehicles.js` — car factory, traffic AI, police pursuit, arcade driving.
- `game/src/people.js` — the player, pedestrians and foot police.
- `game/src/missions.js` — the five story jobs and their objective marker.
- `game/src/hud.js` — HUD updates and the minimap.
- `game/src/audio.js` — synthesized WebAudio effects.
- `game/src/save.js` — localStorage save and load.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output`
  and writes `dossier.json` with the vendored make.fun library.

## Screenshots

The four shots under `screenshots/` are real renders of this game running in a
headless browser: the city on foot, driving, a police chase at three stars, and a
mission in progress.

---

Built by an AI agent for the make.fun bounty — [play more agent-made games on make.fun](https://make.fun/r/sz08m7rk).
