// The screenshot scenes behind ?shot=start|play|alarm|win. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (score the eight compass directions plus standing still: head for the objective, keep out
// of the guards' and cameras' cones), so the frame is what a real game looks like and the
// same seed always gives the same frame.

import { CAMERA, CASES, COLUMNS, FIELD, GUARD, ROOM, STEP, THIEF, VAULT } from './config.js';
import {
  EVENT_CAUGHT, EVENT_LOCKDOWN, EVENT_WIN, sightBlocked,
} from './world.js';
import {
  SCREEN_CAUGHT, SCREEN_LOCKDOWN, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON,
} from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 21;
const LIMIT_SECONDS = 600;
const SAMPLE = 1 / 20;
/** How far ahead, in seconds, the autopilot checks each candidate move. */
const HORIZON = 1.2;
/** Clearance the autopilot's route planner demands around obstacles (thief radius + slack). */
const CLEAR = 34;
const DIRECTIONS = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// ---- route planning ---------------------------------------------------------
// The room's furniture makes beelining to the vault a trap: a straight line runs the
// thief into the back of a display case, where every way on looks worse than waiting.
// So the autopilot plans a route over a small graph of open-floor nodes, connected when
// the straight segment between them clears every obstacle by CLEAR pixels.

const NODES = [
  [150, 640], [150, 520], [150, 300], [150, 100],
  [480, 100], [950, 100], [1080, 300], [1152, 212],
  [1150, 640], [640, 640], [480, 560], [820, 400],
  [520, 420], [350, 380], [950, 520],
];

function segmentClearOfRect(x1, y1, x2, y2, rect, pad) {
  // Segment vs rectangle expanded by pad: sample the segment; a hit anywhere fails.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / 8));
  for (let i = 0; i <= steps; i += 1) {
    const x = x1 + (dx * i) / steps;
    const y = y1 + (dy * i) / steps;
    if (x > rect.x - pad && x < rect.x + rect.w + pad && y > rect.y - pad && y < rect.y + rect.h + pad) return false;
  }
  return true;
}

function segmentClear(x1, y1, x2, y2) {
  if (x1 < ROOM.left + 10 || x1 > ROOM.right - 10 || y1 < ROOM.top + 10 || y1 > ROOM.bottom - 10) return false;
  if (x2 < ROOM.left + 10 || x2 > ROOM.right - 10 || y2 < ROOM.top + 10 || y2 > ROOM.bottom - 10) return false;
  for (const c of CASES) if (!segmentClearOfRect(x1, y1, x2, y2, c, CLEAR)) return false;
  if (!segmentClearOfRect(x1, y1, x2, y2, { x: VAULT.x, y: VAULT.y, w: VAULT.width, h: VAULT.height }, CLEAR)) return false;
  for (const col of COLUMNS) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((col.x - x1) * dx + (col.y - y1) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    if (Math.hypot(col.x - cx, col.y - cy) < col.r + CLEAR) return false;
  }
  return true;
}

const ADJACENCY = NODES.map(() => []);
for (let i = 0; i < NODES.length; i += 1) {
  for (let j = i + 1; j < NODES.length; j += 1) {
    if (segmentClear(NODES[i][0], NODES[i][1], NODES[j][0], NODES[j][1])) {
      ADJACENCY[i].push(j);
      ADJACENCY[j].push(i);
    }
  }
}

function nearestNode(x, y) {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < NODES.length; i += 1) {
    const d = Math.hypot(NODES[i][0] - x, NODES[i][1] - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Breadth-first route from node `from` to node `to`; returns the node list, or []. */
function route(from, to) {
  if (from === to) return [to];
  const prev = new Array(NODES.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of ADJACENCY[current]) {
      if (prev[next] !== -1) continue;
      prev[next] = current;
      if (next === to) {
        const path = [to];
        let node = to;
        while (node !== from) {
          node = prev[node];
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

/** The point the autopilot steers for: the target itself when the way is clear, else the
 * next node on the planned route there. */
function steerTarget(state, target) {
  const thief = state.thief;
  if (segmentClear(thief.x, thief.y, target.x, target.y)) return target;
  const from = nearestNode(thief.x, thief.y);
  const to = nearestNode(target.x, target.y);
  const path = route(from, to);
  if (path.length === 0) return target;
  const next = path.length > 1 ? path[1] : path[0];
  // If the next node is already behind us (we passed it), aim at the one after.
  if (path.length > 2 && Math.hypot(NODES[next][0] - thief.x, NODES[next][1] - thief.y) < 24) {
    return { x: NODES[path[2]][0], y: NODES[path[2]][1] };
  }
  return { x: NODES[next][0], y: NODES[next][1] };
}

/** Is the point (x, y) inside any guard or camera cone right now? Cover counts: a case,
 * a column or the vault between the watcher and the point makes it safe. `tAhead` is how
 * far in the future the point is reached: the cameras sweep continuously, so a point is
 * judged against where the camera will be pointing then, not where it points now —
 * that is what lets the pilot time a sweep instead of fearing its whole arc. */
function coneDanger(state, x, y, tAhead) {
  let danger = 0;
  for (const g of state.guards) {
    const dx = x - g.x;
    const dy = y - g.y;
    const dist = Math.hypot(dx, dy);
    // Keep clear of the guard himself, cone or no cone: a guard who walks into you
    // catches you, and his next step is closer than his last one.
    if (dist < 96) danger += (96 - dist) / 96 * 2;
    if (g.mode === 'distracted') continue;
    if (dist > GUARD.viewRange) continue;
    let d = Math.atan2(dy, dx) - g.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) >= GUARD.viewHalfAngle) continue;
    if (sightBlocked(g.x, g.y, x, y)) continue;
    danger += 1 - dist / GUARD.viewRange + 0.5;
  }
  for (const c of state.cameras) {
    const dx = x - c.def.x;
    const dy = y - c.def.y;
    const dist = Math.hypot(dx, dy);
    if (dist > CAMERA.viewRange) continue;
    // The camera sweeps slowly (about 11 seconds a full swing), so a spot that is safe
    // right now can be watched a moment later. Judge the point against the whole arc
    // the camera will cover in the next three seconds, not just where it points now:
    // that is what keeps the pilot from waiting in a sweep's path.
    const start = state.time + tAhead;
    let minA = Infinity;
    let maxA = -Infinity;
    for (let k = 0; k <= 12; k += 1) {
      const a = c.def.baseAngle + c.def.sweep * Math.sin((start + (k * 3) / 12) * c.def.speed + c.def.phase);
      if (a < minA) minA = a;
      if (a > maxA) maxA = a;
    }
    const pointAngle = Math.atan2(dy, dx);
    let inside = false;
    // The point is watched if its angle falls in the arc the camera covers (allowing
    // for the cone's own half-width), checked on the unwrapped circle.
    for (let shift = -1; shift <= 1; shift += 1) {
      const pa = pointAngle + shift * Math.PI * 2;
      if (pa >= minA - CAMERA.viewHalfAngle && pa <= maxA + CAMERA.viewHalfAngle) { inside = true; break; }
    }
    if (!inside) continue;
    if (sightBlocked(c.def.x, c.def.y, x, y)) continue;
    danger += 1 - dist / CAMERA.viewRange + 0.5;
  }
  return danger;
}

/** Distance to the nearest guard that is currently hunting. */
function nearestHunter(state, x, y) {
  let best = Infinity;
  for (const g of state.guards) {
    if (g.mode !== 'chase') continue;
    best = Math.min(best, Math.hypot(g.x - x, g.y - y));
  }
  return best;
}

/** The guard currently hunting, or null. */
function huntingGuard(state) {
  for (const g of state.guards) if (g.mode === 'chase') return g;
  return null;
}

/** Open floor to run for when a guard is on your heels: fleeing blindly away from the
 * hunter only backs you into a corner, so run for a fixed open spot instead. */
const FLEE_POINTS = [[150, 300], [640, 640], [1150, 640], [150, 100], [950, 100]];

function fleePoint(state, hunter) {
  let best = FLEE_POINTS[0];
  let bestScore = -Infinity;
  for (const p of FLEE_POINTS) {
    const score = Math.hypot(p[0] - hunter.x, p[1] - hunter.y)
      - Math.hypot(p[0] - state.thief.x, p[1] - state.thief.y) * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return { x: best[0], y: best[1] };
}

function autopilot(state, horizon, reckless) {
  const goal = state.vaultCracked
    ? { x: 78, y: 644 }
    : { x: VAULT.frontX, y: VAULT.frontY };
  const hunter = huntingGuard(state);
  // Hunted? Forget the job for a moment and run for open floor.
  const target = hunter !== null
    ? steerTarget(state, fleePoint(state, hunter))
    : steerTarget(state, goal);
  const thief = state.thief;
  const speed = THIEF.speed;
  const seen = horizon ?? HORIZON;
  let best = [0, 0];
  let bestScore = Infinity;
  for (const [dx, dy] of DIRECTIONS) {
    const len = Math.hypot(dx, dy) || 1;
    let danger = 0;
    let dist = 0;
    for (let t = SAMPLE; t <= seen; t += SAMPLE) {
      const x = thief.x + (dx / len) * speed * t;
      const y = thief.y + (dy / len) * speed * t;
      danger += coneDanger(state, x, y, t);
      dist = Math.hypot(target.x - x, target.y - y);
    }
    // Cracking needs the thief to stand still at the vault: reward staying put there.
    const atVault = hunter === null && !state.vaultCracked
      && Math.hypot(VAULT.frontX - thief.x, VAULT.frontY - thief.y) < THIEF.crackRadius;
    let score = dist * 0.02 + (reckless ? 0 : danger * 3000) - (atVault && dx === 0 && dy === 0 ? 40 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = [dx, dy];
    }
  }
  return { x: best[0], y: best[1] };
}

/**
 * Set `world` to the named scene (start, play, alarm or win; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset(1);
  if (name !== 'play' && name !== 'alarm' && name !== 'win') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, false, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }

  // Play the real game forward with the autopilot at the wheel. The alarm scene's pilot
  // is reckless: it ignores the cones and beelines for the vault, so it walks into a cone,
  // gets chased and gets caught, as a hurried player is.
  const limit = name === 'play' ? PLAY_SECONDS : name === 'alarm' ? 90 : LIMIT_SECONDS;
  const horizon = name === 'alarm' ? 0.3 : HORIZON;
  const reckless = name === 'alarm';
  let events = 0;
  let shortcutTaken = false;
  for (let i = 0; i < limit / STEP; i += 1) {
    events = world.step(STEP, autopilot(world.state, horizon, reckless), false, false);
    if (name === 'win' && (events & EVENT_WIN)) break;
    if (name === 'alarm' && (events & (EVENT_CAUGHT | EVENT_LOCKDOWN))) break;
    if (name === 'play' && world.state.vaultCracked) break;
    // The win scene's autopilot usually cracks the vault itself; if it dawdles past two
    // minutes of game time, pick up from the moment just after the crack — a real rules
    // state — and let it play the escape leg instead of staging forever.
    if (name === 'win' && !shortcutTaken && !world.state.vaultCracked && world.state.time > 120) {
      shortcutTaken = true;
      world.state.vaultCracked = true;
      world.state.crackProgress = THIEF.crackTime;
      world.state.loot += VAULT.loot;
      world.state.thief.x = VAULT.frontX;
      world.state.thief.y = VAULT.frontY;
      world.state.alarm = Math.max(world.state.alarm, 35);
    }
  }

  if (name === 'win') {
    return { screen: world.state.outcome === 'won' ? SCREEN_WON : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'alarm') {
    // If the reckless pilot still survived, stage the capture from a real rules state:
    // put Wren right in front of a guard, then let the rules spot, chase and catch.
    if (world.state.outcome === 'playing') {
      const g = world.state.guards[0];
      world.state.thief.x = g.x + Math.cos(g.facing) * 60;
      world.state.thief.y = g.y + Math.sin(g.facing) * 60;
      for (let i = 0; i < 600; i += 1) {
        events = world.step(STEP, { x: 0, y: 0 }, false, false);
        if (events & (EVENT_CAUGHT | EVENT_LOCKDOWN)) break;
      }
    }
    const screen = world.state.outcome === 'caught' ? SCREEN_CAUGHT
      : world.state.outcome === 'lockdown' ? SCREEN_LOCKDOWN : SCREEN_PLAY;
    return { screen, best: world.state.score };
  }

  // The play scene: the job half done — vault cracked, alarm warm, guards alert.
  if (world.state.alarm < 30) world.state.alarm = 42;
  return { screen: SCREEN_PLAY, best: world.state.score };
}
