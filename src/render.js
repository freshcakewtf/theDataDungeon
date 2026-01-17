import { clamp } from './util.js';
import { TILE } from './dungeon.js';

function portalRGB(x, y, dist, locked) {
  const t = performance.now() * 0.001;

  // Normalize coords for patterning (tuned for 320x200 internal res)
  const nx = x * 0.045;
  const ny = y * 0.07;

  // Swirl + scanline + ring pulse
  const swirl = Math.sin(nx + t * 3.0 + Math.sin(ny - t * 2.2) * 1.6);
  const scan = Math.sin(ny * 2.8 + t * 7.0);
  const ring = Math.sin((nx * nx + ny * ny) * 0.35 - t * 4.0);

  // Door-visibility: stronger when close, slight fog falloff
  const fade = 1.0 / (1.0 + dist * 0.22);
  // Stronger / faster pulse, plus a subtle strobe for "flash" moments
  const pulse = 0.55 + 0.45 * Math.sin(t * 3.8 - dist * 0.55);
  const strobe = 0.65 + 0.35 * Math.sin(t * 12.0 + nx * 2.0 - ny * 1.5);

  // Base palette
  // Locked: magenta/purple; Open: cyan/green
  let r, g, b;
  if (locked) {
    r = 130 + 95 * (0.5 + 0.5 * swirl);
    g = 25 + 70 * (0.5 + 0.5 * scan);
    b = 150 + 85 * (0.5 + 0.5 * ring);
  } else {
    r = 60 + 70 * (0.5 + 0.5 * ring);
    g = 120 + 95 * (0.5 + 0.5 * swirl);
    b = 140 + 95 * (0.5 + 0.5 * scan);
  }

  // Add a subtle "stairs" diagonal highlight so it's readable even if animation is subtle
  const stairs = (((x >> 2) + (y >> 2)) & 7) === 0 ? 1.45 : 1.0;

  const mul = pulse * strobe * (0.60 + 1.10 * fade) * stairs;
  // Micro-pop: nonlinear boost so bright parts get brighter
  const pop = 1.0 + 0.35 * (0.5 + 0.5 * swirl);
  r = r * mul * pop;
  g = g * mul * pop;
  b = b * mul * pop;

  // Clamp
  r = r < 0 ? 0 : r > 255 ? 255 : r;
  g = g < 0 ? 0 : g > 255 ? 255 : g;
  b = b < 0 ? 0 : b > 255 ? 255 : b;

  return [r | 0, g | 0, b | 0];
}

export function renderScene(state, cfg, img) {
  const { w, h, data } = img;
  const z = state.zbuf;
  const W = w,
    H = h;

  // background
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const v = y < H / 2 ? 18 + 26 * (1 - t) : 12 + 22 * t;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  // walls
  for (let x = 0; x < W; x++) {
    const hit = z[x];
    const dist = hit.dist;
    const lineH = Math.min(H, Math.floor(H / dist));
    const drawStart = Math.max(0, (H >> 1) - (lineH >> 1));
    const drawEnd = Math.min(H - 1, (H >> 1) + (lineH >> 1));
    const shadeBase = 1 - clamp(dist * cfg.FOG, 0, 0.88);

    const isLockedDoor = hit.tile === TILE.DOOR_LOCKED;
    const isOpenDoor = hit.tile === TILE.DOOR_OPEN;
    const isDoor = isLockedDoor || isOpenDoor;

    // side darkening
    const sideMul = hit.side ? 0.82 : 1.0;

    if (isDoor) {
      // Animated portal door: very visible vs walls
      for (let y = drawStart; y <= drawEnd; y++) {
        const i = (y * W + x) * 4;
        let [r, g, b] = portalRGB(x, y, dist, isLockedDoor);

        // Apply fog + side darkening
        r = clamp(Math.floor(r * shadeBase * sideMul), 0, 255);
        g = clamp(Math.floor(g * shadeBase * sideMul), 0, 255);
        b = clamp(Math.floor(b * shadeBase * sideMul), 0, 255);

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    } else {
      // Regular walls (flat grayscale)
      const base = 110;
      const v = clamp(Math.floor(base * shadeBase * sideMul), 0, 255);
      for (let y = drawStart; y <= drawEnd; y++) {
        const i = (y * W + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
  }
}

// ---- helper: alpha blend a source pixel over destination (straight alpha) ----
function blendOver(dst, di, sr, sg, sb, sa) {
  // sa: 0..255
  if (sa >= 255) {
    dst[di] = sr;
    dst[di + 1] = sg;
    dst[di + 2] = sb;
    dst[di + 3] = 255;
    return;
  }
  if (sa <= 0) return;

  const a = sa / 255;
  const inv = 1 - a;

  dst[di] = (sr * a + dst[di] * inv) | 0;
  dst[di + 1] = (sg * a + dst[di + 1] * inv) | 0;
  dst[di + 2] = (sb * a + dst[di + 2] * inv) | 0;
  dst[di + 3] = 255;
}

// ---- helper: sample texel nearest ----
function sampleNearest(tex, u, v) {
  // u,v in [0,1]
  const x = clamp((u * (tex.w - 1)) | 0, 0, tex.w - 1);
  const y = clamp((v * (tex.h - 1)) | 0, 0, tex.h - 1);
  const ti = (y * tex.w + x) * 4;
  const d = tex.data;
  return [d[ti], d[ti + 1], d[ti + 2], d[ti + 3]];
}

export function renderSprites(state, cfg, img) {
  const { w: W, h: H, data } = img;
  const z = state.zbuf;
  const p = state.player;

  const sprites = state.sprites;

  // compute distances first, then sort back-to-front
  for (const s of sprites) {
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    s._dist = Math.hypot(dx, dy);
  }
  sprites.sort((a, b) => (b._dist ?? 0) - (a._dist ?? 0));

  for (const s of sprites) {
    if (!s.alive) continue;

    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const dist = s._dist ?? Math.hypot(dx, dy);

    if (dist < 0.001 || dist > cfg.MAX_DIST) continue;

    const angTo = Math.atan2(dy, dx);
    let rel = angTo - p.a;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;

    if (Math.abs(rel) > cfg.FOV * 0.65) continue;

    // project horizontally
    const screenX =
      (0.5 + (Math.tan(rel) / Math.tan(cfg.FOV / 2)) * 0.5) * (W - 1);

    // sprite size in pixels (billboard)
    const size = clamp((H / dist) * 0.62, 2, H * 2);
    const sx0 = Math.floor(screenX - size / 2);
    const sx1 = Math.floor(screenX + size / 2);
    const sy0 = Math.floor(H / 2 - size / 2);
    const sy1 = Math.floor(H / 2 + size / 2);

    // fog shade
    const shade = 1 - clamp(dist * cfg.FOG, 0, 0.9);

    const tex = s.tex || state.enemyTex; // allow per-sprite or global
    const hasTex = tex && tex.data && tex.w && tex.h;

    for (let x = sx0; x <= sx1; x++) {
      if (x < 0 || x >= W) continue;

      // depth test vs wall at this column
      if (z[x].dist < dist - 0.1) continue;

      const u = (x - sx0) / Math.max(1, sx1 - sx0);

      for (let y = sy0; y <= sy1; y++) {
        if (y < 0 || y >= H) continue;

        const v = (y - sy0) / Math.max(1, sy1 - sy0);

        // If no texture, fallback to old blob
        if (!hasTex) {
          const cx = u - 0.5,
            cy = v - 0.5;
          const r2 = cx * cx + cy * cy;

          let alpha = 0;
          if (r2 < 0.22) alpha = 1;
          if (cx * cx + (cy + 0.18) * (cy + 0.18) < 0.18) alpha = 1;
          if ((cx + 0.13) * (cx + 0.13) + (cy - 0.02) * (cy - 0.02) < 0.006)
            alpha = 0;
          if ((cx - 0.13) * (cx - 0.13) + (cy - 0.02) * (cy - 0.02) < 0.006)
            alpha = 0;
          if (!alpha) continue;

          const base = s.hitFlash > 0 ? 230 : 200;
          const vv = clamp(Math.floor(base * shade), 0, 255);
          const i = (y * W + x) * 4;
          data[i] = vv;
          data[i + 1] = vv;
          data[i + 2] = vv;
          data[i + 3] = 255;
          continue;
        }

        // sample texture
        let [r, g, b, a] = sampleNearest(tex, u, v);

        // alpha test (skip near-transparent)
        if (a < 12) continue;

        // apply fog shading
        r = clamp((r * shade) | 0, 0, 255);
        g = clamp((g * shade) | 0, 0, 255);
        b = clamp((b * shade) | 0, 0, 255);

        // hit flash: push toward bright
        if (s.hitFlash > 0) {
          const f = clamp(s.hitFlash, 0, 1);
          r = clamp((r * (1 - f) + 255 * f) | 0, 0, 255);
          g = clamp((g * (1 - f) + 255 * f) | 0, 0, 255);
          b = clamp((b * (1 - f) + 255 * f) | 0, 0, 255);
        }

        const di = (y * W + x) * 4;
        blendOver(data, di, r, g, b, a);
      }
    }
  }
}

export function renderWeapon(state, cfg, img) {
  const { w: W, h: H, data } = img;

  // main.js sets this each frame:
  // - walk sprite when moving
  // - punch sprite while swinging
  const tex = state.weaponTex;
  if (!tex || !tex.data) {
    // fallback to old sword silhouette if you want:
    // (keeping your original behavior when no textures exist)
    const t = state.swingT;
    if (t <= 0) return;

    const centerX = (W / 2) | 0;
    const baseY = H - 1;
    const sway = Math.sin(t * Math.PI) * 10;

    const bladeH = 70;
    const bladeW = 10;
    const x0 = centerX + 40 + sway;
    const y0 = baseY - 10 - sway;

    for (let y = 0; y < bladeH; y++) {
      for (let x = 0; x < bladeW; x++) {
        const px = (x0 + x) | 0;
        const py = (y0 - y) | 0;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const taper = y / bladeH;
        if (x < bladeW * (0.2 * taper) || x > bladeW * (1 - 0.2 * taper)) continue;
        const i = (py * W + px) * 4;
        const v = 220;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    for (let y = 0; y < 14; y++) {
      for (let x = 0; x < 6; x++) {
        const px = (x0 + 2 + x) | 0;
        const py = (y0 + 2 + y) | 0;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const i = (py * W + px) * 4;
        const v = 150;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    return;
  }

  // ---- Draw textured weapon overlay (HUD) ----
  // Scale it down to fit internal 320x200 nicely.
  // Your player images are 1376x768, so we MUST scale.
  const t = clamp(state.swingT, 0, 1);
  const swingBob = Math.sin(t * Math.PI) * 6;

  // Target weapon height: about 85% of screen height
  const targetH = H * 0.85;
  const scale = Math.min((W * 0.95) / tex.w, targetH / tex.h);

  const drawW = Math.max(1, (tex.w * scale) | 0);
  const drawH = Math.max(1, (tex.h * scale) | 0);

  // bottom-center placement, with slight swing motion
  const x0 = ((W - drawW) / 2) | 0;
  const y0 = (H - drawH + (swingBob | 0)) | 0;

  // Blit scaled with nearest-neighbor + alpha
  for (let y = 0; y < drawH; y++) {
    const v = y / Math.max(1, drawH - 1);
    const ty = clamp((v * (tex.h - 1)) | 0, 0, tex.h - 1);

    const py = y0 + y;
    if (py < 0 || py >= H) continue;

    for (let x = 0; x < drawW; x++) {
      const u = x / Math.max(1, drawW - 1);
      const tx = clamp((u * (tex.w - 1)) | 0, 0, tex.w - 1);

      const px = x0 + x;
      if (px < 0 || px >= W) continue;

      const ti = (ty * tex.w + tx) * 4;
      const r = tex.data[ti];
      const g = tex.data[ti + 1];
      const b = tex.data[ti + 2];
      const a = tex.data[ti + 3];

      if (a < 12) continue;

      const di = (py * W + px) * 4;
      blendOver(data, di, r, g, b, a);
    }
  }
}