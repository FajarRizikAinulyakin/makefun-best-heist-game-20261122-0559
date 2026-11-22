// The heist's rules and state, with no drawing and no browser in it: the thief, the
// patrolling guards and their vision cones, the sweeping cameras, the vault, the gems, the
// alarm meter and the win/lose conditions. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react (sounds, announcements) without the world
// knowing about screens or sound. Nothing here allocates after createWorld returns.

import {
  ALARM, CAMERA, CAMERAS, CASES, COIN, COINS, COLUMNS, EXIT, GEMS, GUARD, GUARDS,
  ROOM, SCORE, THIEF, VAULT,
} from './config.js';

export const EVENT_PICKUP = 1;
export const EVENT_CRACKED = 2;
export const EVENT_SPOTTED = 4;
export const EVENT_CAUGHT = 8;
export const EVENT_WIN = 16;
export const EVENT_LOCKDOWN = 32;
export const EVENT_COIN = 64;
export const EVENT_CRACK_TICK = 128;

// ---- geometry ---------------------------------------------------------------

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Does the segment (x1,y1)-(x2,y2) hit the rectangle? Slab test.
function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;
  if (dx === 0) {
    if (x1 < rect.x || x1 > rect.x + rect.w) return false;
  } else {
    let t1 = (rect.x - x1) / dx;
    let t2 = (rect.x + rect.w - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (dy === 0) {
    if (y1 < rect.y || y1 > rect.y + rect.h) return false;
  } else {
    let t1 = (rect.y - y1) / dy;
    let t2 = (rect.y + rect.h - y1) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

// Does the segment pass within `r` of the circle centre?
function segmentHitsCircle(x1, y1, x2, y2, circle) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((circle.x - x1) * dx + (circle.y - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const cx = x1 + dx * t;
  const cy = y1 + dy * t;
  const ox = circle.x - cx;
  const oy = circle.y - cy;
  return ox * ox + oy * oy < circle.r * circle.r;
}

// True when the line of sight between two points is blocked by a case, a column or the vault.
export function sightBlocked(x1, y1, x2, y2) {
  for (let i = 0; i < CASES.length; i += 1) {
    if (segmentHitsRect(x1, y1, x2, y2, CASES[i])) return true;
  }
  if (segmentHitsRect(x1, y1, x2, y2, { x: VAULT.x, y: VAULT.y, w: VAULT.width, h: VAULT.height })) return true;
  for (let i = 0; i < COLUMNS.length; i += 1) {
    if (segmentHitsCircle(x1, y1, x2, y2, COLUMNS[i])) return true;
  }
  return false;
}

function inCone(eyeX, eyeY, facing, range, halfAngle, tx, ty) {
  const dx = tx - eyeX;
  const dy = ty - eyeY;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return 0;
  if (Math.abs(angleDiff(Math.atan2(dy, dx), facing)) > halfAngle) return 0;
  if (sightBlocked(eyeX, eyeY, tx, ty)) return 0;
  return dist;
}

// Circle (the thief) against a rectangle: push the circle out and report a hit.
function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function circleHitsCircle(cx, cy, r, circle) {
  const dx = cx - circle.x;
  const dy = cy - circle.y;
  const min = r + circle.r;
  return dx * dx + dy * dy < min * min;
}

// ---- world ------------------------------------------------------------------

export function createWorld(random) {
  const thief = { x: 150, y: 640, sneak: false };
  const guards = GUARDS.map((def) => ({
    def,
    x: def.waypoints[0][0],
    y: def.waypoints[0][1],
    wp: 1,
    facing: 0,
    pause: 0,
    scanTime: 0,
    mode: 'patrol', // patrol | chase | distracted
    alertTimer: 0,
    distractTimer: 0,
    lastSeenX: 0,
    lastSeenY: 0,
    spotted: false,
  }));
  const cameras = CAMERAS.map((def) => ({ def, angle: def.baseAngle, spotted: false }));
  const gems = GEMS.map((g) => ({ ...g, taken: false }));
  const coins = [];
  for (let i = 0; i < 4; i += 1) coins.push({ active: false, x: 0, y: 0, t: 0 });

  const state = {
    thief, guards, cameras, gems, coins,
    loot: 0,
    alarm: 0,
    time: 0,
    coinsLeft: COINS,
    crackProgress: 0,
    vaultCracked: false,
    outcome: 'playing', // playing | won | caught | lockdown
    score: 0,
    spottedNow: false,
    seed: 0,
  };

  function reset(seed) {
    thief.x = 150;
    thief.y = 640;
    thief.sneak = false;
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      g.x = g.def.waypoints[0][0];
      g.y = g.def.waypoints[0][1];
      g.wp = 1;
      g.facing = 0;
      g.pause = 0;
      g.scanTime = 0;
      g.mode = 'patrol';
      g.alertTimer = 0;
      g.distractTimer = 0;
      g.spotted = false;
    }
    for (let i = 0; i < cameras.length; i += 1) {
      cameras[i].angle = cameras[i].def.baseAngle;
      cameras[i].spotted = false;
    }
    for (let i = 0; i < gems.length; i += 1) gems[i].taken = false;
    for (let i = 0; i < coins.length; i += 1) coins[i].active = false;
    state.loot = 0;
    state.alarm = 0;
    state.time = 0;
    state.coinsLeft = COINS;
    state.crackProgress = 0;
    state.vaultCracked = false;
    state.outcome = 'playing';
    state.score = 0;
    state.spottedNow = false;
    state.seed = seed | 0;
    // A touch of seeded variety: shuffle which gem sits where, so replays differ slightly.
    if (random) {
      const order = [0, 1, 2];
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
      for (let i = 0; i < gems.length; i += 1) {
        const src = GEMS[order[i]];
        gems[i].x = src.x;
        gems[i].y = src.y;
        gems[i].value = src.value;
        gems[i].name = src.name;
      }
    }
  }

  function thiefBlocked(x, y) {
    if (x < ROOM.left + THIEF.radius || x > ROOM.right - THIEF.radius
      || y < ROOM.top + THIEF.radius || y > ROOM.bottom - THIEF.radius) return true;
    for (let i = 0; i < CASES.length; i += 1) {
      if (circleHitsRect(x, y, THIEF.radius, CASES[i])) return true;
    }
    if (circleHitsRect(x, y, THIEF.radius, { x: VAULT.x, y: VAULT.y, w: VAULT.width, h: VAULT.height })) return true;
    for (let i = 0; i < COLUMNS.length; i += 1) {
      if (circleHitsCircle(x, y, THIEF.radius, COLUMNS[i])) return true;
    }
    return false;
  }

  // Guards never clip through the furniture either: they slide along it, axis by axis,
  // just like the thief (their patrol legs are already clear of every obstacle).
  function guardBlocked(x, y) {
    if (x < ROOM.left + GUARD.radius || x > ROOM.right - GUARD.radius
      || y < ROOM.top + GUARD.radius || y > ROOM.bottom - GUARD.radius) return true;
    for (let i = 0; i < CASES.length; i += 1) {
      if (circleHitsRect(x, y, GUARD.radius, CASES[i])) return true;
    }
    if (circleHitsRect(x, y, GUARD.radius, { x: VAULT.x, y: VAULT.y, w: VAULT.width, h: VAULT.height })) return true;
    for (let i = 0; i < COLUMNS.length; i += 1) {
      if (circleHitsCircle(x, y, GUARD.radius, COLUMNS[i])) return true;
    }
    return false;
  }

  function moveGuard(g, dx, dy, dt, speed) {
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const nx = g.x + (dx / len) * speed * dt;
    if (!guardBlocked(nx, g.y)) g.x = nx;
    const ny = g.y + (dy / len) * speed * dt;
    if (!guardBlocked(g.x, ny)) g.y = ny;
  }

  function moveThief(dx, dy, dt, sneak) {
    const speed = sneak ? THIEF.sneakSpeed : THIEF.speed;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const nx = thief.x + (dx / len) * speed * dt;
    if (!thiefBlocked(nx, thief.y)) thief.x = nx;
    const ny = thief.y + (dy / len) * speed * dt;
    if (!thiefBlocked(thief.x, ny)) thief.y = ny;
  }

  function throwCoin(wx, wy) {
    if (state.coinsLeft <= 0 || state.outcome !== 'playing') return false;
    const dx = wx - thief.x;
    const dy = wy - thief.y;
    const dist = Math.hypot(dx, dy);
    if (dist > COIN.range) return false;
    let slot = null;
    for (let i = 0; i < coins.length; i += 1) if (!coins[i].active) { slot = coins[i]; break; }
    if (slot === null) return false;
    slot.active = true;
    slot.x = clamp(wx, ROOM.left + 8, ROOM.right - 8);
    slot.y = clamp(wy, ROOM.top + 8, ROOM.bottom - 8);
    slot.t = 3.0;
    state.coinsLeft -= 1;
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      if (Math.hypot(g.x - slot.x, g.y - slot.y) < COIN.distractRadius) {
        g.mode = 'distracted';
        g.distractTimer = COIN.distractSeconds;
        g.lastSeenX = slot.x;
        g.lastSeenY = slot.y;
      }
    }
    return true;
  }

  function finishScore() {
    const timeBonus = Math.max(0, SCORE.parTime - state.time) * SCORE.timeBonusPerSecond;
    const calmBonus = Math.max(0, 100 - state.alarm) * SCORE.calmBonusPerPoint;
    state.score = Math.round(state.loot + timeBonus + calmBonus);
  }

  /**
   * One fixed step. `move` is {x, y} in -1..1, `sneak` holds Shift. With `harmless` set
   * (the title screen's backdrop) the thief never moves, nothing is spotted and nothing scores.
   */
  function step(dt, move, sneak, harmless) {
    if (state.outcome !== 'playing') return 0;
    let events = 0;
    state.time += dt;
    thief.sneak = sneak;

    if (!harmless) moveThief(move.x, move.y, dt, sneak);

    // Thrown coins fade; distracted guards walk to the clatter, then resume patrol.
    for (let i = 0; i < coins.length; i += 1) {
      if (!coins[i].active) continue;
      coins[i].t -= dt;
      if (coins[i].t <= 0) coins[i].active = false;
    }

    // Cameras sweep their arcs.
    for (let i = 0; i < cameras.length; i += 1) {
      const c = cameras[i];
      c.angle = c.def.baseAngle + c.def.sweep * Math.sin(state.time * c.def.speed + c.def.phase);
      c.spotted = false;
    }

    // Guards patrol, chase or investigate.
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      g.spotted = false;
      if (g.mode === 'distracted') {
        g.distractTimer -= dt;
        const dx = g.lastSeenX - g.x;
        const dy = g.lastSeenY - g.y;
        const dist = Math.hypot(dx, dy);
        g.facing = Math.atan2(dy, dx);
        if (dist > 6) moveGuard(g, dx, dy, dt, g.def.speed);
        if (g.distractTimer <= 0) g.mode = 'patrol';
        continue;
      }
      if (g.mode === 'chase') {
        g.alertTimer -= dt;
        const dx = g.lastSeenX - g.x;
        const dy = g.lastSeenY - g.y;
        const dist = Math.hypot(dx, dy);
        g.facing = Math.atan2(dy, dx);
        if (dist > 4) moveGuard(g, dx, dy, dt, g.def.chaseSpeed);
        if (g.alertTimer <= 0) g.mode = 'patrol';
        continue;
      }
      // Patrol: walk to the next waypoint, then stand and scan.
      if (g.pause > 0) {
        g.pause -= dt;
        g.scanTime += dt;
        const heading = Math.atan2(
          g.def.waypoints[g.wp][1] - g.def.waypoints[(g.wp + g.def.waypoints.length - 1) % g.def.waypoints.length][1],
          g.def.waypoints[g.wp][0] - g.def.waypoints[(g.wp + g.def.waypoints.length - 1) % g.def.waypoints.length][0],
        );
        g.facing = heading + GUARD.scanSweep * Math.sin(g.scanTime * 2.4);
        continue;
      }
      const target = g.def.waypoints[g.wp];
      const dx = target[0] - g.x;
      const dy = target[1] - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        g.wp = (g.wp + 1) % g.def.waypoints.length;
        g.pause = GUARD.pauseAtWaypoint;
        g.scanTime = 0;
      } else {
        moveGuard(g, dx, dy, dt, g.def.speed);
        g.facing = Math.atan2(dy, dx);
      }
    }

    if (harmless) return 0;

    // A guard who walks into you catches you, cone or no cone.
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      if (Math.hypot(g.x - thief.x, g.y - thief.y) < GUARD.catchRadius) {
        state.outcome = 'caught';
        events |= EVENT_CAUGHT;
        return events;
      }
    }

    // ---- detection ----------------------------------------------------------
    const wasSpotted = state.spottedNow;
    state.spottedNow = false;
    const sneakFactor = sneak ? ALARM.sneakGainFactor : 1;
    for (let i = 0; i < guards.length; i += 1) {
      const g = guards[i];
      if (g.mode === 'distracted') continue;
      const range = GUARD.viewRange * (sneak ? GUARD.sneakRangeFactor : 1);
      const dist = inCone(g.x, g.y, g.facing, range, GUARD.viewHalfAngle, thief.x, thief.y);
      if (dist > 0) {
        g.spotted = true;
        state.spottedNow = true;
        const closeness = clamp(1.15 - dist / range, 0.55, 1);
        state.alarm += ALARM.guardPerSecond * closeness * sneakFactor * dt;
        g.mode = 'chase';
        g.alertTimer = GUARD.chaseMemory;
        g.lastSeenX = thief.x;
        g.lastSeenY = thief.y;
      }
    }
    for (let i = 0; i < cameras.length; i += 1) {
      const c = cameras[i];
      const range = CAMERA.viewRange * (sneak ? CAMERA.sneakRangeFactor : 1);
      const dist = inCone(c.def.x, c.def.y, c.angle, range, CAMERA.viewHalfAngle, thief.x, thief.y);
      if (dist > 0) {
        c.spotted = true;
        state.spottedNow = true;
        const closeness = clamp(1.15 - dist / range, 0.55, 1);
        state.alarm += ALARM.cameraPerSecond * closeness * sneakFactor * dt;
      }
    }
    if (state.spottedNow && !wasSpotted) events |= EVENT_SPOTTED;
    if (!state.spottedNow) state.alarm = Math.max(0, state.alarm - ALARM.decayPerSecond * dt);

    // ---- gems ---------------------------------------------------------------
    for (let i = 0; i < gems.length; i += 1) {
      const gem = gems[i];
      if (!gem.taken && Math.hypot(gem.x - thief.x, gem.y - thief.y) < 28) {
        gem.taken = true;
        state.loot += gem.value;
        events |= EVENT_PICKUP;
      }
    }

    // ---- the vault ----------------------------------------------------------
    if (!state.vaultCracked) {
      const d = Math.hypot(VAULT.frontX - thief.x, VAULT.frontY - thief.y);
      if (d < THIEF.crackRadius) {
        state.crackProgress += dt;
        state.alarm += ALARM.crackPerSecond * dt;
        events |= EVENT_CRACK_TICK;
        if (state.crackProgress >= THIEF.crackTime) {
          state.vaultCracked = true;
          state.loot += VAULT.loot;
          events |= EVENT_CRACKED;
        }
      } else {
        state.crackProgress = Math.max(0, state.crackProgress - dt * 0.5);
      }
    }

    // ---- alarm --------------------------------------------------------------
    if (state.alarm >= 100) {
      state.alarm = 100;
      state.outcome = 'lockdown';
      events |= EVENT_LOCKDOWN;
      return events;
    }

    // ---- the exit -----------------------------------------------------------
    if (state.vaultCracked
      && thief.x > EXIT.zoneX && thief.x < EXIT.zoneX + EXIT.zoneW
      && thief.y > EXIT.zoneY && thief.y < EXIT.zoneY + EXIT.zoneH) {
      state.outcome = 'won';
      finishScore();
      events |= EVENT_WIN;
      return events;
    }

    return events;
  }

  reset(1);
  return { state, reset, step, throwCoin };
}
