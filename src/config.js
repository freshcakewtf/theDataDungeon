export const CONFIG = {
  // Internal low-res render target (scaled up to fit window)
  INTERNAL_W: 424,
  INTERNAL_H: 240,
  SCALE: 3, // starting scale; auto-adjusts to fit

  FOV: Math.PI / 3, // 60°
  MAX_DIST: 24,

  MOVE_SPEED: 3.2, // tiles/sec
  TURN_SPEED: 2.2, // rad/sec (keyboard)

  // Dungeon
  MAP_W: 48,
  MAP_H: 48,
  ROOM_TRIES: 140,
  ROOM_MIN: 4,
  ROOM_MAX: 10,

  // Enemies / progression
  BASE_ENEMIES: 6,
  ENEMY_GROWTH: 2,
  ENEMY_SPEED: 1.2, // tiles/sec base (scales slightly with floor)
  ENEMY_HP: 2,

  // Melee
  SWING_COOLDOWN: 0.42,
  SWING_ACTIVE: 0.16,
  SWORD_RANGE: 1.55,
  SWING_ARC: Math.PI / 2, // 90°
  DAMAGE: 1,

  // Visuals
  ENABLE_DITHER: true,
  DITHER_LEVELS: 2, // 2 => 1-bit, 3-5 => more levels
  FOG: 0.085, // higher => foggier, helps readability
};
