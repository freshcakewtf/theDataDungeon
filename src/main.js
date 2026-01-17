import { CONFIG } from './config.js';
import { generateDungeon, TILE, isSolid } from './dungeon.js';
import { castRays, raycastLOS } from './raycast.js';
import { renderScene, renderSprites, renderWeapon } from './render.js';
import { ditherToMonochrome } from './post.js';
import { dist, angleDiff, wrapAngle } from './util.js';

// --- Music ---
// NOTE: In normal browser builds, use the relative path in /lib.
// The absolute /Volumes path is kept as an optional first attempt for local desktop shells.
const MUSIC_SRC = '/Volumes/DevBox/Games/theDataDungeon/lib/ES_Tiger Tracks - Lexica.mp3';
const MUSIC_FALLBACK_SRC = 'lib/ES_Tiger Tracks - Lexica.mp3';
let musicAudio = null;
let musicStarted = false;
let musicMuted = false;

function initMusic() {
  if (musicAudio) return;

  musicAudio = new Audio();
  musicAudio.src = MUSIC_SRC;
  musicAudio.preload = 'auto';
  musicAudio.loop = true;
  musicAudio.volume = 0.6;
  musicAudio.muted = musicMuted;

  // If the absolute path fails, switch to a relative URL.
  musicAudio.addEventListener(
    'error',
    () => {
      if (musicAudio && musicAudio.src && !musicAudio.src.endsWith(MUSIC_FALLBACK_SRC)) {
        musicAudio.src = MUSIC_FALLBACK_SRC;
        musicAudio.load();
      }
    },
    { once: true }
  );
}

async function startMusicIfNeeded() {
  initMusic();
  if (musicStarted || !musicAudio) return;
  try {
    await musicAudio.play();
    musicStarted = true;
  } catch {
    // Autoplay blocked; try again on the next user gesture.
  }
}

function toggleMusicMute() {
  musicMuted = !musicMuted;
  initMusic();
  if (musicAudio) musicAudio.muted = musicMuted;
  if (!musicMuted) startMusicIfNeeded();
  updateHUD();
}

const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const centerMsg = document.getElementById('centerMsg');

// ✅ Locked internal resolution (aspect ratio = 320:200)
const INTERNAL_W = 320;
const INTERNAL_H = 200;

// ✅ Dither strength control:
const DITHER_LEVELS = 3;

let cfg = { ...CONFIG, INTERNAL_W, INTERNAL_H, DITHER_LEVELS };

const display = canvas.getContext('2d', { alpha: false });
display.imageSmoothingEnabled = false;

// offscreen internal
const off = document.createElement('canvas');
off.width = cfg.INTERNAL_W;
off.height = cfg.INTERNAL_H;
const offCtx = off.getContext('2d', { alpha: false });
offCtx.imageSmoothingEnabled = false;

let imgData = offCtx.createImageData(cfg.INTERNAL_W, cfg.INTERNAL_H);

// --- robust sprite loader (verifies URL with fetch, avoids silent failures) ---
async function loadBitmapSprite(url, w, h) {
  // 1) Verify it exists (gives clear 200/404)
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    console.log('✅ fetch ok:', url, res.status);
  } catch (e) {
    console.error('❌ fetch failed:', url, e);
    throw e;
  }

  // 2) Load image
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error(`Image load error for ${url}`));
    img.src = url;
  });

  // 3) Draw to temp canvas and extract pixels
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;

  const ctx = c.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);

  ctx.drawImage(img, 0, 0, w, h);

  let id;
  try {
    id = ctx.getImageData(0, 0, w, h);
  } catch (e) {
    console.error('❌ getImageData failed (tainted canvas?) for:', url, e);
    throw e;
  }

  console.log('✅ sprite ImageData ready:', url, w, h);
  return { w, h, data: id.data };
}

async function loadFirstWorking(candidates, w, h, label) {
  for (const url of candidates) {
    try {
      console.log(`🔎 trying ${label}:`, url);
      const tex = await loadBitmapSprite(url, w, h);
      console.log(`✅ ${label} loaded from`, url, `(${tex.w}x${tex.h})`);
      return tex;
    } catch (e) {
      console.warn(`❌ ${label} failed from`, url, e);
    }
  }
  return null;
}

const keys = new Set();
let mouseDX = 0;
let pointerLocked = false;

// ---- HUD layout helpers ----
const HUD_TOP_OFFSET = 64;
const CONTROLS_MARGIN_TOP = 14;
const STATS_MARGIN_TOP = 10;

function layoutHUD() {
  const r = canvas.getBoundingClientRect();

  hud.style.position = 'fixed';
  hud.style.left = `${Math.round(r.left)}px`;
  hud.style.width = `${Math.round(r.width)}px`;
  hud.style.color = '#e6e6e6';
  hud.style.textShadow = '0 1px 0 #000';
  hud.style.userSelect = 'none';
  hud.style.pointerEvents = 'none';
  hud.style.top = `${Math.round(r.top) - HUD_TOP_OFFSET}px`;
}

function statsYBelowCanvas() {
  const r = canvas.getBoundingClientRect();
  return Math.round(r.top + r.height + STATS_MARGIN_TOP);
}

const state = {
  floor: 1,
  score: 0,
  grid: null,
  rooms: null,
  player: { x: 2.5, y: 2.5, a: 0, hp: 5 },
  sprites: [],
  door: null,
  enemiesRemaining: 0,
  doorUnlocked: false,

  zbuf: [],
  swingCooldown: 0,
  swingTimer: 0,
  swingT: 0,

  showMap: false,
  enableDither: cfg.ENABLE_DITHER,

  dead: false,

  // textures
  enemyTex: null,
  playerWalkTex: null,
  playerPunchTex: null,
  weaponTex: null,

  playerIsMoving: false,
};

function startRun() {
  state.floor = 1;
  state.score = 0;
  state.player.hp = 5;
  state.dead = false;
  nextFloor(true);
}

function nextFloor(resetHp = false) {
  const d = generateDungeon(cfg);
  state.grid = d.grid;
  state.rooms = d.rooms;
  state.door = d.door;
  state.player.x = d.spawn.x;
  state.player.y = d.spawn.y;
  state.player.a = Math.random() * Math.PI * 2;
  if (resetHp) state.player.hp = 5;

  state.doorUnlocked = false;

  const count = cfg.BASE_ENEMIES + (state.floor - 1) * cfg.ENEMY_GROWTH;
  state.sprites = [];
  spawnEnemies(count);
  state.enemiesRemaining = state.sprites.filter((s) => s.type === 'enemy' && s.alive).length;

  state.swingCooldown = 0;
  state.swingTimer = 0;
  state.swingT = 0;

  flashCenter(
    `Sector ${state.floor}<div class="dim">Clear all enemies to unlock the exit node</div>`,
    900
  );
}

function spawnEnemies(n) {
  const grid = state.grid;
  const W = grid[0].length,
    H = grid.length;
  let tries = n * 40;

  while (n > 0 && tries-- > 0) {
    const rx = Math.floor(Math.random() * (W - 2)) + 1;
    const ry = Math.floor(Math.random() * (H - 2)) + 1;
    if (grid[ry][rx] !== TILE.FLOOR) continue;
    if (dist(rx + 0.5, ry + 0.5, state.player.x, state.player.y) < 9) continue;

    state.sprites.push({
      type: 'enemy',
      x: rx + 0.5,
      y: ry + 0.5,
      hp: cfg.ENEMY_HP + Math.floor((state.floor - 1) / 4),
      alive: true,
      hitFlash: 0,
      tex: state.enemyTex, // renderer must use this
    });
    n--;
  }
}

function flashCenter(html, ms) {
  centerMsg.innerHTML = html;
  centerMsg.style.opacity = '1';
  centerMsg.style.transition = 'opacity 200ms ease';
  setTimeout(() => {
    centerMsg.style.opacity = '0';
  }, ms);
}

function isWalkable(x, y) {
  const gx = Math.floor(x),
    gy = Math.floor(y);
  if (gy < 0 || gx < 0 || gy >= state.grid.length || gx >= state.grid[0].length)
    return false;

  return !isSolid(state.grid[gy][gx]) && state.grid[gy][gx] !== TILE.DOOR_OPEN
    ? true
    : state.grid[gy][gx] === TILE.FLOOR || state.grid[gy][gx] === TILE.DOOR_OPEN;
}

function movePlayer(dt) {
  const p = state.player;
  let forward = 0,
    strafe = 0;

  if (keys.has('KeyW')) forward += 1;
  if (keys.has('KeyS')) forward -= 1;
  if (keys.has('KeyD')) strafe += 1;
  if (keys.has('KeyA')) strafe -= 1;

  state.playerIsMoving = forward !== 0 || strafe !== 0;

  let turn = 0;
  if (keys.has('ArrowLeft')) turn -= 1;
  if (keys.has('ArrowRight')) turn += 1;
  p.a = wrapAngle(p.a + turn * cfg.TURN_SPEED * dt + mouseDX * 0.0022);
  mouseDX = 0;

  const speed = cfg.MOVE_SPEED;
  const vx = (Math.cos(p.a) * forward + Math.cos(p.a + Math.PI / 2) * strafe) * speed;
  const vy = (Math.sin(p.a) * forward + Math.sin(p.a + Math.PI / 2) * strafe) * speed;

  const r = 0.22;
  const nx = p.x + vx * dt;
  const ny = p.y + vy * dt;

  if (isWalkable(nx + r, p.y) && isWalkable(nx - r, p.y)) p.x = nx;
  if (isWalkable(p.x, ny + r) && isWalkable(p.x, ny - r)) p.y = ny;

  if (state.doorUnlocked) {
    const dd = dist(p.x, p.y, state.door.x, state.door.y);
    if (dd < 0.7) {
      state.floor++;
      state.score = Math.max(state.score, state.floor - 1);
      nextFloor(false);
    }
  }
}

function updateEnemies(dt) {
  const p = state.player;
  const speed = cfg.ENEMY_SPEED + (state.floor - 1) * 0.06;
  let aliveCount = 0;

  for (const e of state.sprites) {
    if (!e.alive) continue;
    aliveCount++;
    e.hitFlash = Math.max(0, e.hitFlash - dt * 6);

    const canSee = raycastLOS(state, e.x, e.y, p.x, p.y, 10);
    if (!canSee) continue;

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);

    if (d < 0.35) {
      if (!e._atk) e._atk = 0;
      e._atk -= dt;
      if (e._atk <= 0) {
        e._atk = 0.55;
        p.hp -= 1;
        flashCenter(`<div>Ouch!</div><div class="dim">HP: ${p.hp}</div>`, 300);
        if (p.hp <= 0) die();
      }
      continue;
    }

    const ex = e.x + (dx / d) * speed * dt;
    const ey = e.y + (dy / d) * speed * dt;

    const r = 0.22;
    const okX = isWalkable(ex + r, e.y) && isWalkable(ex - r, e.y);
    const okY = isWalkable(e.x, ey + r) && isWalkable(e.x, ey - r);
    if (okX) e.x = ex;
    if (okY) e.y = ey;
  }

  state.enemiesRemaining = aliveCount;
  if (!state.doorUnlocked && aliveCount === 0) unlockDoor();
}

function unlockDoor() {
  state.doorUnlocked = true;
  state.grid[state.door.ty][state.door.tx] = TILE.DOOR_OPEN;
  flashCenter(`ACCESS GRANTED<div class="dim">Find the exit node</div>`, 900);
}

function swing() {
  if (state.dead) return;
  if (state.swingCooldown > 0) return;

  state.swingCooldown = cfg.SWING_COOLDOWN;
  state.swingTimer = cfg.SWING_ACTIVE;
  state.swingT = 1;

  const p = state.player;

  for (const e of state.sprites) {
    if (!e.alive) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    if (d > cfg.SWORD_RANGE) continue;

    const angTo = Math.atan2(e.y - p.y, e.x - p.x);
    const da = Math.abs(angleDiff(angTo, p.a));
    if (da > cfg.SWING_ARC / 2) continue;

    if (!raycastLOS(state, p.x, p.y, e.x, e.y, cfg.SWORD_RANGE + 0.2)) continue;

    e.hp -= cfg.DAMAGE;
    e.hitFlash = 1.0;

    e.x += Math.cos(angTo) * 0.16;
    e.y += Math.sin(angTo) * 0.16;

    if (e.hp <= 0) e.alive = false;
  }
}

function die() {
  state.dead = true;
  const cleared = state.floor - 1;
  state.score = Math.max(state.score, cleared);
  flashCenter(
    `FATAL ERROR<div class="dim">Sectors cleared: ${cleared}<br>Press <kbd>R</kbd> to reboot</div>`,
    999999
  );
}

function drawMinimap() {
  const g = state.grid;
  const W = g[0].length,
    H = g.length;
  const scale = 3;
  const ox = 12;
  const oy = 86;

  display.globalAlpha = 0.95;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = g[y][x];
      let v = 20;
      if (t === TILE.WALL) v = 5;
      if (t === TILE.FLOOR) v = 40;
      if (t === TILE.DOOR_LOCKED) v = 90;
      if (t === TILE.DOOR_OPEN) v = 140;
      display.fillStyle = `rgb(${v},${v},${v})`;
      display.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }

  display.fillStyle = 'rgb(200,200,200)';
  for (const e of state.sprites) {
    if (!e.alive) continue;
    display.fillRect(ox + e.x * scale - 1, oy + e.y * scale - 1, 2, 2);
  }

  display.fillStyle = 'rgb(255,255,255)';
  display.fillRect(ox + state.player.x * scale - 1, oy + state.player.y * scale - 1, 2, 2);

  display.globalAlpha = 1;
}

function resize() {
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;

  const verticalReserve = 140;
  const usableH = Math.max(1, maxH - verticalReserve);

  const s = Math.max(1, Math.floor(Math.min(maxW / cfg.INTERNAL_W, usableH / cfg.INTERNAL_H)));

  canvas.width = cfg.INTERNAL_W * s;
  canvas.height = cfg.INTERNAL_H * s;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;

  display.imageSmoothingEnabled = false;
  requestAnimationFrame(layoutHUD);
}
window.addEventListener('resize', resize);

document.addEventListener('keydown', (e) => {
  startMusicIfNeeded();
  keys.add(e.code);

  if (e.code === 'KeyR') startRun();
  if (e.code === 'KeyT') state.enableDither = !state.enableDither;

  // Map toggle moved off M so M can be used for mute.
  if (e.code === 'KeyN') state.showMap = !state.showMap;

  // Music mute/unmute
  if (e.code === 'KeyM') toggleMusicMute();

  if (e.code === 'Space') swing();
});

document.addEventListener('keyup', (e) => keys.delete(e.code));

canvas.addEventListener('click', async () => {
  startMusicIfNeeded();
  if (!pointerLocked) await canvas.requestPointerLock();
  swing();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', (e) => {
  if (pointerLocked) mouseDX += e.movementX || 0;
});

function updateHUD() {
  const statsTop = statsYBelowCanvas();

  hud.innerHTML = `
    <div style="text-align:center;font-size:34px;letter-spacing:0.02em;margin-bottom:-6px;">
      <b>The Data Dungeon</b>
    </div>

    <div style="text-align:center;font-size:20px;margin-bottom:${CONTROLS_MARGIN_TOP}px;">
      Floor: <b>${state.floor}</b>
      &nbsp;•&nbsp;
      Health: <b>${state.player.hp}</b>
      &nbsp;•&nbsp;
      Enemies Left: <b>${state.enemiesRemaining}</b>
    </div>

    <!-- Clickable HUD controls (only this wrapper allows pointer events) -->
    <div style="
      position:fixed;
      left:${hud.style.left};
      top:${statsTop}px;
      width:${hud.style.width};
      text-align:center;
      font-size:14px;
      line-height:1.2;
      opacity:.9;
      pointer-events:auto;">

      <div class="dim" style="margin-bottom:6px;opacity:.8;">
        Controls.exe: W A S D • Mouse / ← → • Click / Space • N nav • M mute • R reboot • T dither
      </div>

      <div style="display:inline-flex;gap:10px;align-items:center;justify-content:center;">
        <button id="hudMapToggle" type="button" style="pointer-events:auto;">${state.showMap ? 'Hide' : 'Show'} Map</button>
        <button id="hudMusicToggle" type="button" style="pointer-events:auto;">${musicMuted ? 'Unmute' : 'Mute'} Music</button>
        <span class="dim" style="opacity:.75;">
          Music: <b>${musicMuted ? 'Muted' : (musicStarted ? 'On' : 'Ready')}</b>
        </span>
      </div>
    </div>
  `;

  const mapBtn = document.getElementById('hudMapToggle');
  if (mapBtn) {
    mapBtn.onclick = () => {
      state.showMap = !state.showMap;
      updateHUD();
    };
  }

  const musicBtn = document.getElementById('hudMusicToggle');
  if (musicBtn) {
    musicBtn.onclick = () => toggleMusicMute();
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (!state.dead) {
    state.swingCooldown = Math.max(0, state.swingCooldown - dt);
    state.swingTimer = Math.max(0, state.swingTimer - dt);
    state.swingT = state.swingTimer > 0 ? state.swingTimer / cfg.SWING_ACTIVE : 0;

    movePlayer(dt);
    updateEnemies(dt);
  }

  // Select player overlay sprite (renderWeapon must use state.weaponTex)
  if (state.swingTimer > 0 && state.playerPunchTex) {
    state.weaponTex = state.playerPunchTex;
  } else if (state.playerIsMoving && state.playerWalkTex) {
    state.weaponTex = state.playerWalkTex;
  } else {
    state.weaponTex = state.playerWalkTex || null;
  }

  castRays(state, cfg);

  const img = { ctx2: offCtx, w: cfg.INTERNAL_W, h: cfg.INTERNAL_H, data: imgData.data };
  renderScene(state, cfg, img);
  renderSprites(state, cfg, img);
  renderWeapon(state, cfg, img);

  if (state.enableDither) {
    const d = ditherToMonochrome(imgData.data, cfg.INTERNAL_W, cfg.INTERNAL_H, cfg.DITHER_LEVELS);
    imgData.data.set(d);
  }

  offCtx.putImageData(imgData, 0, 0);

  display.imageSmoothingEnabled = false;
  display.clearRect(0, 0, canvas.width, canvas.height);
  display.drawImage(off, 0, 0, canvas.width, canvas.height);

  if (state.showMap) drawMinimap();

  updateHUD();
  requestAnimationFrame(frame);
}

resize();
initMusic();

// ✅ Load textures once, then start
(async () => {
  const enemyCandidates = [
    '/lib/DataDungeon_enemy.png',
    'lib/DataDungeon_enemy.png',
    new URL('../lib/DataDungeon_enemy.png', import.meta.url).href,
    new URL('./lib/DataDungeon_enemy.png', import.meta.url).href,
  ];

  const walkCandidates = [
    '/lib/PlayerWalk.png',
    'lib/PlayerWalk.png',
    new URL('../lib/PlayerWalk.png', import.meta.url).href,
    new URL('./lib/PlayerWalk.png', import.meta.url).href,
  ];

  const punchCandidates = [
    '/lib/PlayerPunch.png',
    'lib/PlayerPunch.png',
    new URL('../lib/PlayerPunch.png', import.meta.url).href,
    new URL('./lib/PlayerPunch.png', import.meta.url).href,
  ];

  // Your declared image sizes
  state.enemyTex = await loadFirstWorking(enemyCandidates, 1024, 1024, 'enemyTex');
  state.playerWalkTex = await loadFirstWorking(walkCandidates, 1376, 768, 'playerWalkTex');
  state.playerPunchTex = await loadFirstWorking(punchCandidates, 1376, 768, 'playerPunchTex');

  if (!state.enemyTex) console.error('🚫 Enemy sprite not found at any candidate path.');
  if (!state.playerWalkTex) console.error('🚫 PlayerWalk sprite not found at any candidate path.');
  if (!state.playerPunchTex) console.error('🚫 PlayerPunch sprite not found at any candidate path.');

  startRun();
  requestAnimationFrame(frame);
})();