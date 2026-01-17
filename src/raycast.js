import { clamp } from './util.js';
import { TILE, isSolid } from './dungeon.js';

export function castRays(state, cfg){
  const {grid, player} = state;
  const W = cfg.INTERNAL_W, H = cfg.INTERNAL_H;
  const fov = cfg.FOV;
  const halfFov = fov/2;
  const z = state.zbuf;
  z.length = W;

  // Precompute camera plane factor
  for(let x=0;x<W;x++){
    const camX = (2*x / (W-1) - 1); // -1..1
    const rayAng = player.a + Math.atan(camX * Math.tan(halfFov));
    const rayDirX = Math.cos(rayAng);
    const rayDirY = Math.sin(rayAng);

    let mapX = Math.floor(player.x);
    let mapY = Math.floor(player.y);

    const deltaDistX = Math.abs(1 / (rayDirX || 1e-9));
    const deltaDistY = Math.abs(1 / (rayDirY || 1e-9));

    let stepX, stepY;
    let sideDistX, sideDistY;

    if (rayDirX < 0){
      stepX = -1;
      sideDistX = (player.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
    }
    if (rayDirY < 0){
      stepY = -1;
      sideDistY = (player.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
    }

    let hit = 0;
    let side = 0;
    let tile = TILE.WALL;
    let maxSteps = cfg.MAX_DIST * 4;

    while(!hit && maxSteps-- > 0){
      if (sideDistX < sideDistY){
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      if (mapY<0||mapX<0||mapY>=grid.length||mapX>=grid[0].length){
        hit = 1; tile = TILE.WALL; break;
      }
      tile = grid[mapY][mapX];
      if (isSolid(tile) || tile === TILE.DOOR_OPEN){
        hit = 1;
      }
    }

    // calculate perpendicular distance
    let perpDist;
    if (side === 0){
      perpDist = (mapX - player.x + (1 - stepX) / 2) / (rayDirX || 1e-9);
    } else {
      perpDist = (mapY - player.y + (1 - stepY) / 2) / (rayDirY || 1e-9);
    }
    perpDist = Math.max(0.0001, perpDist);

    // texture coordinate (0..1) along wall
    let wallX;
    if (side === 0) wallX = player.y + perpDist * rayDirY;
    else wallX = player.x + perpDist * rayDirX;
    wallX -= Math.floor(wallX);

    z[x] = {dist: perpDist, side, tile, wallX, rayAng};
  }
}

export function raycastLOS(state, x0, y0, x1, y1, maxDist=10){
  // simple DDA along segment to test wall blocking
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx,dy);
  if (dist > maxDist) return false;
  const steps = Math.ceil(dist * 10);
  const grid = state.grid;
  for(let i=1;i<=steps;i++){
    const t=i/steps;
    const x=x0+dx*t, y=y0+dy*t;
    const gx=Math.floor(x), gy=Math.floor(y);
    if (gy<0||gx<0||gy>=grid.length||gx>=grid[0].length) return false;
    const tile = grid[gy][gx];
    if (isSolid(tile)) return false;
  }
  return true;
}
