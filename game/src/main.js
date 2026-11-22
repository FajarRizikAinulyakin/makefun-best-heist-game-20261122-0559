// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, paused, won, caught, lockdown.
//
// ?seed=N fixes the gem shuffle. ?shot=start|play|alarm|win (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { BEST_KEY, GAME_TITLE, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_CAUGHT, EVENT_COIN, EVENT_CRACKED, EVENT_LOCKDOWN,
  EVENT_PICKUP, EVENT_SPOTTED, EVENT_WIN,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer, SCREEN_CAUGHT, SCREEN_LOCKDOWN, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WON,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

window.addEventListener('error', (event) => {
  window.__gameError = String(event.message || event.error || 'unknown error');
});

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (x, y) => renderer.toWorld(x, y));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset(seed);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Crack the vault, then reach the exit.');
  }

  function endGame(outcome) {
    screen = outcome;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    const s = world.state;
    if (outcome === SCREEN_WON) {
      audio.win();
      announce(`Clean getaway! Score ${s.score}. Best ${best}.`);
    } else if (outcome === SCREEN_CAUGHT) {
      audio.caught();
      announce(`Caught! Score ${s.score}. Best ${best}.`);
    } else {
      audio.caught();
      announce(`Lockdown! Score ${s.score}. Best ${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_WON
        || screen === SCREEN_CAUGHT || screen === SCREEN_LOCKDOWN) {
        audio.click();
        startGame();
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function handleThrow() {
    const point = input.takeThrow();
    if (point === null) return;
    if (screen !== SCREEN_PLAY) return;
    if (world.throwCoin(point.x, point.y)) {
      audio.coin();
      announce('Coin tossed. A guard goes to look.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, false, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, input.move(), input.sneaking(), false);
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CRACKED) audio.cracked();
    if (events & EVENT_SPOTTED) {
      audio.spotted();
      announce('Spotted! The alarm is rising.');
    }
    if (events & EVENT_WIN) endGame(SCREEN_WON);
    else if (events & EVENT_CAUGHT) endGame(SCREEN_CAUGHT);
    else if (events & EVENT_LOCKDOWN) endGame(SCREEN_LOCKDOWN);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleThrow();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce(`${GAME_TITLE}. Press Space or click to start.`);
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
