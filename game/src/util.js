// Shared helpers: seeded RNG, math, persistence. No browser in here except storage.
export function mulberry(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const angLerp = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
export function loadSave(key) {
  try { const s = window.localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function storeSave(key, obj) {
  try { window.localStorage.setItem(key, JSON.stringify(obj)); } catch { /* private mode */ }
}
