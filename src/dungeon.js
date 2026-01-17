import { randInt, dist } from './util.js';

export const TILE = {
  WALL: 1,
  FLOOR: 0,
  DOOR_LOCKED: 2,
  DOOR_OPEN: 3,
};

function carveRect(grid, x, y, w, h, val=0){
  for(let j=y; j<y+h; j++){
    for(let i=x; i<x+w; i++){
      grid[j][i] = val;
    }
  }
}

function rectsOverlap(a,b){
  return !(a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y);
}

function inBounds(x,y,w,h){ return x>=1 && y>=1 && x<w-1 && y<h-1; }

function makeGrid(w,h,fill=1){
  const g = new Array(h);
  for(let y=0;y<h;y++){
    g[y]=new Array(w).fill(fill);
  }
  return g;
}

function digCorridor(grid, ax, ay, bx, by){
  // L-shaped: randomize order
  if (Math.random() < 0.5){
    digH(grid, ax, bx, ay);
    digV(grid, ay, by, bx);
  } else {
    digV(grid, ay, by, ax);
    digH(grid, ax, bx, by);
  }
}
function digH(grid, ax, bx, y){
  const step = ax < bx ? 1 : -1;
  for(let x=ax; x!==bx+step; x+=step){
    if (inBounds(x,y,grid[0].length,grid.length)) grid[y][x]=0;
  }
}
function digV(grid, ay, by, x){
  const step = ay < by ? 1 : -1;
  for(let y=ay; y!==by+step; y+=step){
    if (inBounds(x,y,grid[0].length,grid.length)) grid[y][x]=0;
  }
}

export function generateDungeon(cfg){
  const W = cfg.MAP_W, H = cfg.MAP_H;
  const grid = makeGrid(W, H, TILE.WALL);
  const rooms = [];

  for(let t=0; t<cfg.ROOM_TRIES; t++){
    const w = randInt(cfg.ROOM_MIN, cfg.ROOM_MAX);
    const h = randInt(cfg.ROOM_MIN, cfg.ROOM_MAX);
    const x = randInt(1, W - w - 2);
    const y = randInt(1, H - h - 2);
    const room = {x,y,w,h, cx: x + (w>>1), cy: y + (h>>1)};
    // keep a 1-tile buffer to reduce skinny walls
    const inflated = {x:x-1,y:y-1,w:w+2,h:h+2};
    let ok = true;
    for(const r of rooms){
      const inflR = {x:r.x-1,y:r.y-1,w:r.w+2,h:r.h+2};
      if (rectsOverlap(inflated, inflR)){ ok=false; break; }
    }
    if (!ok) continue;

    carveRect(grid, x, y, w, h, TILE.FLOOR);

    if (rooms.length){
      const prev = rooms[rooms.length-1];
      digCorridor(grid, prev.cx, prev.cy, room.cx, room.cy);
    }
    rooms.push(room);
  }

  // pick spawn room as first, door near farthest room
  const startRoom = rooms[0] ?? {cx:2, cy:2, x:2, y:2, w:4, h:4};
  const spawn = {x: startRoom.cx + 0.5, y: startRoom.cy + 0.5};

  // BFS distances from spawn across floor
  const distMap = bfsDistances(grid, Math.floor(spawn.x), Math.floor(spawn.y));
  let best = null;
  for(const r of rooms){
    const d = distMap[r.cy]?.[r.cx] ?? Infinity;
    if (!isFinite(d)) continue;
    if (!best || d > best.d) best = {d, r};
  }
  const exitRoom = best?.r ?? rooms[rooms.length-1] ?? startRoom;

  // place door on a wall tile adjacent to exit room interior, choose spot facing a corridor/floor
  const door = placeDoor(grid, exitRoom);

  return { grid, rooms, spawn, door, distMap };
}

function bfsDistances(grid, sx, sy){
  const H = grid.length, W = grid[0].length;
  const d = Array.from({length:H}, ()=>Array(W).fill(Infinity));
  const q = [];
  const push=(x,y,nd)=>{ d[y][x]=nd; q.push([x,y]); };
  push(sx,sy,0);
  let qi=0;
  while(qi<q.length){
    const [x,y]=q[qi++]; const cd=d[y][x];
    const nbs = [[1,0],[-1,0],[0,1],[0,-1]];
    for(const [dx,dy] of nbs){
      const nx=x+dx, ny=y+dy;
      if (nx<0||ny<0||nx>=W||ny>=H) continue;
      if (grid[ny][nx] !== TILE.FLOOR) continue;
      if (d[ny][nx] > cd+1) push(nx,ny,cd+1);
    }
  }
  return d;
}

function placeDoor(grid, room){
  // find a wall adjacent to room interior that has floor on the opposite side
  // try candidates around room perimeter
  const W=grid[0].length, H=grid.length;
  const candidates = [];
  for(let x=room.x; x<room.x+room.w; x++){
    candidates.push({x, y: room.y-1, nx: x, ny: room.y}); // north wall tile (outside)
    candidates.push({x, y: room.y+room.h, nx: x, ny: room.y+room.h-1}); // south
  }
  for(let y=room.y; y<room.y+room.h; y++){
    candidates.push({x: room.x-1, y, nx: room.x, ny: y}); // west
    candidates.push({x: room.x+room.w, y, nx: room.x+room.w-1, ny: y}); // east
  }
  // shuffle
  for(let i=candidates.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }

  for(const c of candidates){
    if (c.x<1||c.y<1||c.x>=W-1||c.y>=H-1) continue;
    if (grid[c.y][c.x] !== TILE.WALL) continue;
    // require inside tile is floor
    if (grid[c.ny][c.nx] !== TILE.FLOOR) continue;

    // Require outside neighbor is floor (corridor) so door leads somewhere
    const dx = c.x - c.nx;
    const dy = c.y - c.ny;
    const ox = c.x + dx;
    const oy = c.y + dy;
    if (ox<0||oy<0||ox>=W||oy>=H) continue;
    if (grid[oy][ox] !== TILE.FLOOR) continue;

    grid[c.y][c.x] = TILE.DOOR_LOCKED;
    return {x: c.x+0.5, y: c.y+0.5, tx: c.x, ty: c.y};
  }

  // fallback: place door at room center (as open) — should rarely happen
  grid[room.cy][room.cx] = TILE.DOOR_LOCKED;
  return {x: room.cx+0.5, y: room.cy+0.5, tx: room.cx, ty: room.cy};
}

export function isSolid(tile){
  return tile === TILE.WALL || tile === TILE.DOOR_LOCKED;
}

export function isDoor(tile){
  return tile === TILE.DOOR_LOCKED || tile === TILE.DOOR_OPEN;
}
