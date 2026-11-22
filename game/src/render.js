// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Flat shapes, canvas gradients for the vision cones, canvas text for the HUD and
// the panels. Text that holds a number is rebuilt only when the number changes, so a frame
// allocates almost nothing.

import {
  CAMERA, CASES, COLUMNS, EXIT, FIELD, FONT, GUARD, PALETTE, ROOM, THIEF, VAULT,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WON = 'won';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_LOCKDOWN = 'lockdown';

const PANEL = { width: 660, top: 120, line: 32, bottom: 66 };
const HUD_HEIGHT = 56;

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function fmtMoney(n) {
  return '$' + n.toLocaleString('en-US');
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const lootLabel = cachedLabel('LOOT ');
  const scoreLabel = cachedLabel('SCORE ');
  const finalLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const timeLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function plainText(value, x, y, size, color, align) {
    if (!fonts.has('p' + size)) fonts.set('p' + size, `${size}px ${FONT}`);
    context.font = fonts.get('p' + size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  // ---- the room -------------------------------------------------------------

  function drawFloor() {
    // Parquet tiles.
    const tile = 64;
    for (let y = ROOM.top; y < ROOM.bottom; y += tile) {
      for (let x = ROOM.left; x < ROOM.right; x += tile) {
        const even = ((x - ROOM.left) / tile + (y - ROOM.top) / tile) % 2 === 0;
        context.fillStyle = even ? PALETTE.floorA : PALETTE.floorB;
        context.fillRect(x, y, Math.min(tile, ROOM.right - x), Math.min(tile, ROOM.bottom - y));
      }
    }
    context.strokeStyle = PALETTE.floorLine;
    context.lineWidth = 1;
    for (let x = ROOM.left; x <= ROOM.right; x += tile) {
      context.beginPath(); context.moveTo(x, ROOM.top); context.lineTo(x, ROOM.bottom); context.stroke();
    }
    for (let y = ROOM.top; y <= ROOM.bottom; y += tile) {
      context.beginPath(); context.moveTo(ROOM.left, y); context.lineTo(ROOM.right, y); context.stroke();
    }
    // The crimson carpet runner from the service door to the vault.
    context.fillStyle = PALETTE.carpet;
    context.fillRect(120, 596, 1000, 60);
    context.fillStyle = PALETTE.carpet;
    context.beginPath();
    context.moveTo(1120, 596); context.lineTo(1152, 596); context.lineTo(1152, 260); context.lineTo(1120, 260);
    context.closePath(); context.fill();
    context.strokeStyle = PALETTE.carpetEdge;
    context.lineWidth = 3;
    context.strokeRect(120, 596, 1000, 60);
    // Round rug under the statue.
    context.fillStyle = 'rgba(94, 31, 42, 0.55)';
    context.beginPath(); context.ellipse(625, 345, 150, 95, 0, 0, Math.PI * 2); context.fill();
    context.strokeStyle = PALETTE.carpetEdge;
    context.lineWidth = 2;
    context.beginPath(); context.ellipse(625, 345, 150, 95, 0, 0, Math.PI * 2); context.stroke();
    // Walls: a thick frame with a gold inner trim.
    context.fillStyle = PALETTE.wall;
    context.fillRect(0, 0, FIELD.width, ROOM.top);
    context.fillRect(0, ROOM.bottom, FIELD.width, FIELD.height - ROOM.bottom);
    context.fillRect(0, 0, ROOM.left, FIELD.height);
    context.fillRect(ROOM.right, 0, FIELD.width - ROOM.right, FIELD.height);
    context.strokeStyle = PALETTE.wallTrim;
    context.lineWidth = 3;
    context.strokeRect(ROOM.left - 1.5, ROOM.top - 1.5, ROOM.right - ROOM.left + 3, ROOM.bottom - ROOM.top + 3);
  }

  function drawExit(state) {
    const pulse = 0.55 + 0.25 * Math.sin(state.time * 3);
    context.fillStyle = PALETTE.exitGlow;
    context.globalAlpha = 0.25 + pulse * 0.3;
    context.fillRect(EXIT.x - 6, EXIT.y - 6, EXIT.width + 12, EXIT.height + 12);
    context.globalAlpha = 1;
    context.fillStyle = '#0e2a1a';
    context.fillRect(EXIT.x, EXIT.y, EXIT.width, EXIT.height);
    context.strokeStyle = PALETTE.exitGlow;
    context.lineWidth = 3;
    context.strokeRect(EXIT.x, EXIT.y, EXIT.width, EXIT.height);
    context.fillStyle = PALETTE.exitGlow;
    context.font = `bold 20px ${FONT}`;
    context.textAlign = 'center';
    context.fillText('EXIT', EXIT.x + EXIT.width / 2, EXIT.y + 34);
    context.font = `bold 30px ${FONT}`;
    context.fillText('→', EXIT.x + EXIT.width / 2, EXIT.y + 70);
    if (state.vaultCracked) {
      context.fillStyle = PALETTE.exitGlow;
      context.font = `bold 15px ${FONT}`;
      context.fillText('GET OUT!', EXIT.x + EXIT.width / 2, EXIT.y - 10);
    }
  }

  function drawVault(state) {
    const { x, y, width: w, height: h } = VAULT;
    context.fillStyle = PALETTE.vaultDark;
    context.fillRect(x - 8, y - 8, w + 16, h + 16);
    if (state.vaultCracked) {
      context.fillStyle = '#120d05';
      context.fillRect(x, y, w, h);
      context.fillStyle = PALETTE.vaultGold;
      context.font = `bold 22px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('OPEN', x + w / 2, y + h / 2 + 8);
      context.fillStyle = 'rgba(201, 162, 39, 0.35)';
      context.fillRect(x, y + h - 6, w, 6);
    } else {
      context.fillStyle = PALETTE.vaultDoor;
      context.fillRect(x, y, w, h);
      context.strokeStyle = PALETTE.vaultGold;
      context.lineWidth = 3;
      context.strokeRect(x + 4, y + 4, w - 8, h - 8);
      // Dial and handle.
      context.fillStyle = PALETTE.vaultDark;
      context.beginPath(); context.arc(x + w / 2, y + h / 2, 26, 0, Math.PI * 2); context.fill();
      context.strokeStyle = PALETTE.vaultGold;
      context.lineWidth = 3;
      context.beginPath(); context.arc(x + w / 2, y + h / 2, 26, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.arc(x + w / 2, y + h / 2, 8, 0, Math.PI * 2); context.fill();
      context.fillStyle = PALETTE.vaultGold;
      context.font = `bold 15px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('VAULT', x + w / 2, y + h - 12);
      // Rivets.
      context.fillStyle = PALETTE.vaultDark;
      for (const [rx, ry] of [[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]]) {
        context.beginPath(); context.arc(rx, ry, 4, 0, Math.PI * 2); context.fill();
      }
    }
    // Crack progress ring at the front point while cracking.
    if (!state.vaultCracked && state.crackProgress > 0) {
      const p = state.crackProgress / 2.5;
      context.strokeStyle = 'rgba(242, 201, 76, 0.35)';
      context.lineWidth = 6;
      context.beginPath(); context.arc(VAULT.frontX, VAULT.frontY, 30, 0, Math.PI * 2); context.stroke();
      context.strokeStyle = PALETTE.vaultGold;
      context.beginPath(); context.arc(VAULT.frontX, VAULT.frontY, 30, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); context.stroke();
      plainText('CRACKING…', VAULT.frontX, VAULT.frontY + 48, 14, PALETTE.vaultGold, 'center');
    }
    // A hint marker at the crack spot.
    if (!state.vaultCracked) {
      context.fillStyle = 'rgba(201, 162, 39, 0.85)';
      context.beginPath(); context.arc(VAULT.frontX, VAULT.frontY, 5, 0, Math.PI * 2); context.fill();
      plainText('CRACK HERE', VAULT.frontX, VAULT.frontY + 22, 11, PALETTE.vaultGold, 'center');
    }
  }

  function drawCases(state) {
    for (const c of CASES) {
      const isPlinth = c.x === 580 && c.y === 310;
      if (isPlinth) {
        context.fillStyle = PALETTE.plinth;
        context.fillRect(c.x, c.y, c.w, c.h);
        context.strokeStyle = PALETTE.caseFrame;
        context.lineWidth = 2;
        context.strokeRect(c.x, c.y, c.w, c.h);
        // The golden statue on top.
        context.fillStyle = PALETTE.statue;
        context.beginPath(); context.arc(c.x + c.w / 2, c.y + c.h / 2, 22, 0, Math.PI * 2); context.fill();
        context.fillStyle = '#8a6d2b';
        context.beginPath(); context.arc(c.x + c.w / 2, c.y + c.h / 2 - 6, 9, 0, Math.PI * 2); context.fill();
        continue;
      }
      context.fillStyle = '#101019';
      context.fillRect(c.x, c.y, c.w, c.h);
      context.fillStyle = PALETTE.caseGlass;
      context.fillRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
      context.strokeStyle = PALETTE.caseFrame;
      context.lineWidth = 3;
      context.strokeRect(c.x, c.y, c.w, c.h);
      // A little exhibit inside each case.
      context.fillStyle = 'rgba(201, 162, 39, 0.7)';
      context.beginPath(); context.arc(c.x + c.w / 2, c.y + c.h / 2, 10, 0, Math.PI * 2); context.fill();
    }
    for (const col of COLUMNS) {
      context.fillStyle = '#565064';
      context.beginPath(); context.arc(col.x, col.y, col.r, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#7a7387';
      context.beginPath(); context.arc(col.x, col.y, col.r - 6, 0, Math.PI * 2); context.fill();
    }
  }

  function drawCone(x, y, facing, range, halfAngle, fill, edge) {
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(x, y);
    context.arc(x, y, range, facing - halfAngle, facing + halfAngle);
    context.closePath();
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(facing - halfAngle) * range, y + Math.sin(facing - halfAngle) * range);
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(facing + halfAngle) * range, y + Math.sin(facing + halfAngle) * range);
    context.stroke();
  }

  function drawGems(state) {
    for (const gem of state.gems) {
      if (gem.taken) continue;
      const spin = state.time * 1.6;
      context.save();
      context.translate(gem.x, gem.y);
      context.rotate(Math.sin(spin) * 0.35);
      context.fillStyle = PALETTE.gem;
      context.beginPath();
      context.moveTo(0, -13); context.lineTo(10, 0); context.lineTo(0, 13); context.lineTo(-10, 0);
      context.closePath(); context.fill();
      context.fillStyle = 'rgba(255,255,255,0.75)';
      context.beginPath(); context.moveTo(0, -13); context.lineTo(5, 0); context.lineTo(0, 0); context.lineTo(-5, 0); context.closePath(); context.fill();
      context.restore();
      plainText(fmtMoney(gem.value), gem.x, gem.y + 30, 13, PALETTE.gem, 'center');
    }
  }

  function drawCoins(state) {
    for (const coin of state.coins) {
      if (!coin.active) continue;
      const blink = 0.6 + 0.4 * Math.sin(state.time * 10);
      context.globalAlpha = blink;
      context.fillStyle = PALETTE.vaultGold;
      context.beginPath(); context.arc(coin.x, coin.y, 7, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#fff2b0';
      context.lineWidth = 1.5;
      context.beginPath(); context.arc(coin.x, coin.y, 12, 0, Math.PI * 2); context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawGuards(state) {
    for (const g of state.guards) {
      const alert = g.mode === 'chase' || g.spotted;
      drawCone(g.x, g.y, g.facing, GUARD.viewRange, GUARD.viewHalfAngle,
        alert ? PALETTE.coneGuardAlert : PALETTE.coneGuard,
        alert ? 'rgba(224,82,56,0.5)' : 'rgba(242,201,76,0.4)');
      // Body.
      context.fillStyle = alert ? PALETTE.guardAlert : PALETTE.guard;
      context.beginPath(); context.arc(g.x, g.y, GUARD.radius, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#dfe6f2';
      context.lineWidth = 2;
      context.beginPath(); context.arc(g.x, g.y, GUARD.radius, 0, Math.PI * 2); context.stroke();
      // Cap brim in the facing direction + eyes.
      const fx = Math.cos(g.facing);
      const fy = Math.sin(g.facing);
      context.fillStyle = '#dfe6f2';
      context.beginPath(); context.arc(g.x + fx * 7, g.y + fy * 7, 4, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#ffffff';
      context.beginPath(); context.arc(g.x + fx * 5 - fy * 5, g.y + fy * 5 + fx * 5, 2.5, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.arc(g.x + fx * 5 + fy * 5, g.y + fy * 5 - fx * 5, 2.5, 0, Math.PI * 2); context.fill();
      if (alert) {
        text('!', g.x, g.y - GUARD.radius - 8, 26, '#ff6b57', 'center');
      } else {
        plainText(g.def.name, g.x, g.y + GUARD.radius + 16, 12, PALETTE.muted, 'center');
      }
    }
  }

  function drawCameras(state) {
    for (const c of state.cameras) {
      drawCone(c.def.x, c.def.y, c.angle, CAMERA.viewRange, CAMERA.viewHalfAngle,
        PALETTE.coneCamera, 'rgba(224,82,56,0.45)');
      context.fillStyle = PALETTE.camera;
      context.fillRect(c.def.x - 12, c.def.y - 8, 24, 16);
      context.strokeStyle = '#9aa3b2';
      context.lineWidth = 2;
      context.strokeRect(c.def.x - 12, c.def.y - 8, 24, 16);
      const blink = Math.sin(state.time * 5) > 0;
      context.fillStyle = blink ? PALETTE.cameraEye : '#7a2020';
      context.beginPath(); context.arc(c.def.x + Math.cos(c.angle) * 14, c.def.y + Math.sin(c.angle) * 14, 4, 0, Math.PI * 2); context.fill();
      if (c.spotted) text('!', c.def.x, c.def.y - 22, 24, '#ff6b57', 'center');
    }
  }

  function drawThief(state) {
    const t = state.thief;
    const sneak = t.sneak;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath(); context.ellipse(t.x, t.y + 12, 14, 5, 0, 0, Math.PI * 2); context.fill();
    if (sneak) {
      context.strokeStyle = PALETTE.thiefBand;
      context.lineWidth = 2;
      context.beginPath(); context.arc(t.x, t.y, THIEF.radius + 4, 0, Math.PI * 2); context.stroke();
    }
    context.fillStyle = PALETTE.thief;
    context.beginPath(); context.arc(t.x, t.y, THIEF.radius, 0, Math.PI * 2); context.fill();
    context.strokeStyle = PALETTE.thiefBand;
    context.lineWidth = 4;
    context.beginPath(); context.arc(t.x, t.y, THIEF.radius - 2, -0.4, Math.PI + 0.4); context.stroke();
    // Eyes (white slits of the mask) + a little cap.
    context.fillStyle = '#ffffff';
    context.beginPath(); context.arc(t.x - 5, t.y - 2, 2.6, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(t.x + 5, t.y - 2, 2.6, 0, Math.PI * 2); context.fill();
    context.fillStyle = PALETTE.thiefBand;
    context.beginPath(); context.arc(t.x, t.y - THIEF.radius + 2, 6, Math.PI, 0); context.fill();
    plainText('WREN', t.x, t.y + THIEF.radius + 16, 12, PALETTE.text, 'center');
  }

  function drawField(state) {
    drawFloor();
    drawExit(state);
    drawVault(state);
    // Cones first, then the things that block sight sit on top of them.
    drawCameras(state);
    drawGuards(state);
    drawCases(state);
    drawGems(state);
    drawCoins(state);
    drawThief(state);
  }

  // ---- HUD ------------------------------------------------------------------

  function drawHud(state) {
    context.fillStyle = PALETTE.hud;
    context.fillRect(0, 0, FIELD.width, HUD_HEIGHT);
    context.fillStyle = PALETTE.wallTrim;
    context.fillRect(0, HUD_HEIGHT, FIELD.width, 2);

    context.textBaseline = 'top';
    text(lootLabel(state.loot), 24, 14, 26, PALETTE.vaultGold, 'left');
    const objective = state.vaultCracked
      ? '★ Reach the EXIT!'
      : '◆ Crack the VAULT';
    plainText(objective, FIELD.width / 2, 20, 19, PALETTE.text, 'center');

    // Alarm meter.
    const barX = FIELD.width - 420;
    const barW = 200;
    plainText('ALARM', barX - 8, 20, 17, PALETTE.text, 'right');
    context.fillStyle = '#1a1420';
    context.fillRect(barX, 18, barW, 20);
    const alarmColor = state.alarm < 40 ? PALETTE.alarmLow : state.alarm < 75 ? PALETTE.alarmMid : PALETTE.alarmHigh;
    context.fillStyle = alarmColor;
    context.fillRect(barX, 18, barW * (state.alarm / 100), 20);
    context.strokeStyle = PALETTE.text;
    context.lineWidth = 1.5;
    context.strokeRect(barX, 18, barW, 20);
    if (state.alarm >= 75) {
      const blink = Math.sin(state.time * 8) > 0;
      if (blink) plainText('!', barX + barW + 10, 16, 22, PALETTE.alarmHigh, 'left');
    }
    text(timeLabel(Math.floor(state.time)), FIELD.width - 196, 14, 26, PALETTE.text, 'left');
    text(scoreLabel(state.score), FIELD.width - 120, 14, 26, PALETTE.text, 'left');
    plainText('coins ◉ ' + state.coinsLeft + '  •  click: toss a coin  •  Shift: sneak', FIELD.width - 24, 44, 12, PALETTE.muted, 'right');
  }

  // ---- panels ---------------------------------------------------------------

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 44, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      plainText(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 19, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, PALETTE.vaultGold, 'center');
  }

  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      const lines = [
        'The Meridian Gallery, 2 a.m. One room, three guards,',
        'two cameras, one vault — and you, Wren, the thief.',
        'Crack the vault, grab the gems, slip out the exit.',
        'WASD / arrows to move · Shift to sneak · Click to toss a coin',
        'Stay out of the yellow cones. Fill the alarm and it is over.',
        bestLabel(best),
      ];
      drawPanel('The Gilded Hour', lines, 'Press Space or click to start the job');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The guards will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_WON) {
      const timeBonus = Math.max(0, Math.round((180 - state.time) * 10));
      const calmBonus = Math.max(0, Math.round((100 - state.alarm) * 5));
      const lines = [
        'Loot  ' + fmtMoney(state.loot),
        'Time bonus  +' + fmtMoney(timeBonus) + '   •   Calm bonus  +' + fmtMoney(calmBonus),
        'Time  ' + fmtTime(state.time) + '   •   Alarm at the door  ' + Math.round(state.alarm) + '%',
        finalLabel(state.score),
        bestLabel(best),
      ];
      drawPanel('CLEAN GETAWAY', lines, 'Press Space or click for another job', PALETTE.exitGlow);
    } else if (screen === SCREEN_CAUGHT) {
      const lines = [
        'A guard got hands on Wren. The gallery keeps its gold.',
        'Loot kept  ' + fmtMoney(state.loot),
        finalLabel(state.score),
        bestLabel(best),
      ];
      drawPanel('CAUGHT!', lines, 'Press Space or click to try again', PALETTE.alarmHigh);
    } else if (screen === SCREEN_LOCKDOWN) {
      const lines = [
        'The alarm hit 100%. Shutters down, doors sealed.',
        'Loot kept  ' + fmtMoney(state.loot),
        finalLabel(state.score),
        bestLabel(best),
      ];
      drawPanel('LOCKDOWN!', lines, 'Press Space or click to try again', PALETTE.alarmHigh);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Convert a client (mouse) point to field coordinates, or null when off the field. */
    toWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (canvas.width / rect.width);
      const y = (clientY - rect.top) * (canvas.height / rect.height);
      const fx = (x - view.x) / view.scale;
      const fy = (y - view.y) / view.scale;
      if (fx < 0 || fy < 0 || fx > FIELD.width || fy > FIELD.height) return null;
      return { x: fx, y: fy };
    },
  };
}
