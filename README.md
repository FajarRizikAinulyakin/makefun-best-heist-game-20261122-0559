# The Gilded Hour — a one-room heist

**The job:** It is 2 a.m. at the Meridian Gallery. You are Wren, the thief. One room,
three guards, two cameras, one vault — and a service door at the far end. Crack the
vault, lift what you can, and slip out the exit before the alarm fills.

## How to play

Open `game/index.html` in a desktop browser. No network, no installs, no assets: the
whole game is canvas and code.

- **Move:** WASD or arrow keys. **Sneak:** hold Shift (slower, harder to spot, the
  alarm rises half as fast). **Toss a coin:** click anywhere in the room — a nearby
  guard will go and look at the clatter. You carry 3 coins.
- **Crack the vault:** stand on the gold dot in front of the vault for 2.5 seconds.
  Cracking is noisy — the alarm creeps up while you work.
- **Optional loot:** three gems sit around the room ($500, $750, $1,000). Worth the
  risk? Your call.
- **Win:** reach the green EXIT door with the vault loot. **Lose:** a guard gets
  hands on you (caught), or the alarm hits 100% (lockdown).
- **Score:** loot + a time bonus for finishing under 3 minutes + a calm bonus for
  the alarm you have left. Your best score is kept in the browser.
- **Pause:** P or Esc. **Restart:** R. **Mute:** M. Space or click starts and
  restarts.

## The room

Everything happens in a single gallery floor, and the whole of it is visible in one
frame — that is the point of the game. The guards Marco, Sable and Rook walk fixed
patrols and pause at each corner to scan; their yellow vision cones are blocked by
the display cases, the statue plinth and the marble columns, so the furniture is
your cover. The two wall cameras sweep their red cones back and forth. Stay out of
the cones: being watched fills the alarm, and a guard who sees you gives chase.
Break line of sight and the alarm drains again.

## What is in this repo

- `main.ts` — the hand-in program (Node 22, standard library only): copies `game/`
  and `screenshots/` to the output directory and writes `dossier.json`.
- `game/index.html` — the game shell; `game/src/` is the whole game in ES modules:
  `config.js` (tuning, palette, the floor plan), `world.js` (rules, detection,
  alarm, win/lose), `render.js` (all the drawing), `input.js` (keyboard + mouse),
  `audio.js` (procedural WebAudio blips, no files), `main.js` (loop and screens),
  `shots.js` (the four screenshot scenes), `random.js` (seeded RNG).
- `screenshots/` — four real renders of the game's own code in a browser:
  `1-play.jpg` (the cover: mid-heist, vault ahead, alarm warm), `2-start.jpg`
  (title), `3-alarm.jpg` (lockdown), `4-win.jpg` (clean getaway).
- `shots.json` — the four scenes and the `?shot=` queries that stage them.
- `serve.ts` — a tiny static server for local play-testing (`node serve.ts`).
- `vendor/makefun-game.ts` — the make.fun library, copied from the kit unchanged.

## Screenshots

The scenes are staged by `game/src/shots.js`: each one plays the real rules forward
from a fresh world with a simple autopilot (it plans a route around the furniture,
times the camera sweeps, and runs for open floor when a guard gives chase), so every
frame is what a real game looks like. The same seed always gives the same frame
(`?shot=play&seed=1`, and so on).

## Credits

An original game: its own idea, art, sounds and names. Built with Node 22 and a
desktop browser, for the make.fun best-heist-game bounty. MIT licensed.
