export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function randInt(a, b) { return (a + Math.floor(Math.random() * (b - a + 1))); }
export function randFloat(a, b) { return a + Math.random() * (b - a); }
export function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.hypot(dx, dy); }
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function wrapAngle(a){
  while (a < -Math.PI) a += Math.PI*2;
  while (a > Math.PI) a -= Math.PI*2;
  return a;
}
