// The Gilded Hour — a one-room heist. Every tuning number, colour and the whole floor
// plan lives here. The playfield is a fixed 1280x720 logical area; the renderer scales it
// to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

// The room: the playable interior inside the outer walls. The HUD is a translucent strip
// laid over the top of the room, so nothing gameplay-critical sits above y = 76.
export const ROOM = { left: 28, top: 28, right: 1252, bottom: 692, wall: 28 };

export const STEP = 1 / 60; // fixed simulation step, seconds

export const THIEF = {
  radius: 14,
  speed: 205,
  sneakSpeed: 112,
  crackTime: 2.5, // seconds standing at the vault to crack it
  crackRadius: 58, // how close to the vault's front point counts as "at the vault"
};

export const VAULT = {
  // The big steel vault door set into the top-right of the room.
  x: 1104, y: 84, width: 120, height: 96,
  frontX: 1152, frontY: 212, // where the thief stands to crack it
  loot: 5000,
};

export const EXIT = {
  // The service door, bottom-left. Reach it with the vault loot to win.
  x: 28, y: 596, width: 92, height: 96,
  zoneX: 40, zoneY: 608, zoneW: 76, zoneH: 76,
};

export const GEMS = [
  { x: 340, y: 282, value: 500, name: 'Jade Scarab' },
  { x: 948, y: 224, value: 750, name: 'Sapphire Tear' },
  { x: 700, y: 572, value: 1000, name: 'Ruby Heart' },
];

// Rectangular display cases and the statue plinth: they block movement and sight.
export const CASES = [
  { x: 300, y: 180, w: 150, h: 70 },
  { x: 620, y: 150, w: 150, h: 70 },
  { x: 880, y: 300, w: 70, h: 150 },
  { x: 300, y: 430, w: 150, h: 70 },
  { x: 620, y: 450, w: 150, h: 70 },
  { x: 580, y: 310, w: 90, h: 70 }, // the statue plinth
];

// Round marble columns: also block movement and sight.
export const COLUMNS = [
  { x: 430, y: 300, r: 18 },
  { x: 850, y: 490, r: 18 },
];

export const GUARDS = [
  {
    name: 'Marco',
    speed: 72, chaseSpeed: 124,
    waypoints: [[250, 120], [1000, 120], [1000, 280], [250, 280]],
  },
  {
    name: 'Sable',
    speed: 82, chaseSpeed: 128,
    waypoints: [[250, 620], [700, 620], [700, 545], [250, 545]],
  },
  {
    name: 'Rook',
    speed: 76, chaseSpeed: 122,
    waypoints: [[980, 340], [1120, 340], [1120, 560], [980, 560]],
  },
];

export const GUARD = {
  radius: 15,
  viewRange: 210,
  viewHalfAngle: 0.55, // radians either side of facing
  catchRadius: 24,
  pauseAtWaypoint: 0.7, // seconds the guard stands and scans at each waypoint
  scanSweep: 0.7, // radians the guard sweeps while paused
  chaseMemory: 2.2, // seconds a guard keeps chasing after losing sight
  sneakRangeFactor: 0.75, // sneak shrinks the range the guard can spot you at
};

export const CAMERAS = [
  // Wall-mounted, sweeping. angle sweeps around baseAngle by +/- sweep.
  { x: 640, y: 30, baseAngle: Math.PI / 2, sweep: 0.55, speed: 0.55, phase: 0 },
  { x: 30, y: 360, baseAngle: 0, sweep: 0.5, speed: 0.42, phase: 1.9 },
];

export const CAMERA = {
  viewRange: 250,
  viewHalfAngle: 0.42,
  sneakRangeFactor: 0.75,
};

// The alarm meter, 0..100. 100 means lockdown: the job is blown. Being spotted for a
// couple of seconds should hurt, not end the job on the spot: the meter fills in roughly
// 4 seconds of being watched and drains in about 5 seconds of hiding.
export const ALARM = {
  guardPerSecond: 26,
  cameraPerSecond: 34,
  crackPerSecond: 6, // cracking the vault is noisy
  decayPerSecond: 20, // the room calms down while you stay unseen
  sneakGainFactor: 0.5,
};

export const COINS = 3; // distractions to throw; click to toss one
export const COIN = { range: 520, distractRadius: 270, distractSeconds: 2.6 };

export const SCORE = {
  parTime: 180, // seconds; finishing faster earns a time bonus
  timeBonusPerSecond: 10,
  calmBonusPerPoint: 5, // per alarm point left under 100 at the win
};

export const PALETTE = {
  backdrop: '#0d0b12',
  floorA: '#241f2e',
  floorB: '#2b2536',
  floorLine: '#171221',
  carpet: '#5e1f2a',
  carpetEdge: '#c9a227',
  wall: '#3a3247',
  wallTrim: '#c9a227',
  caseGlass: 'rgba(140, 200, 235, 0.20)',
  caseFrame: '#c9a227',
  statue: '#d8b45a',
  plinth: '#4a4238',
  vaultDoor: '#5a6270',
  vaultDark: '#2e3440',
  vaultGold: '#c9a227',
  exitGlow: '#37d67a',
  thief: '#1b1b22',
  thiefBand: '#8b5cf6',
  guard: '#2f4d7a',
  guardAlert: '#d43d2a',
  coneGuard: 'rgba(242, 201, 76, 0.20)',
  coneGuardAlert: 'rgba(224, 82, 56, 0.28)',
  coneCamera: 'rgba(224, 82, 56, 0.16)',
  camera: '#3c4450',
  cameraEye: '#ff4d3d',
  gem: '#7ef0c1',
  text: '#f2ead8',
  muted: '#a89f8d',
  panel: 'rgba(16, 13, 24, 0.92)',
  panelEdge: '#c9a227',
  hud: 'rgba(10, 8, 16, 0.72)',
  alarmLow: '#37d67a',
  alarmMid: '#f2c94c',
  alarmHigh: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const BEST_KEY = 'gilded-hour.best';
export const GAME_TITLE = 'The Gilded Hour';
export const GAME_SUBTITLE = 'a one-room heist at the Meridian Gallery';
