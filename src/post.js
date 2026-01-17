import { clamp } from './util.js';

const BAYER_8 = [
  [0,48,12,60,3,51,15,63],
  [32,16,44,28,35,19,47,31],
  [8,56,4,52,11,59,7,55],
  [40,24,36,20,43,27,39,23],
  [2,50,14,62,1,49,13,61],
  [34,18,46,30,33,17,45,29],
  [10,58,6,54,9,57,5,53],
  [42,26,38,22,41,25,37,21],
];

export function ditherToMonochrome(srcRGBA, w, h, levels=2){
  // levels=2 => 1-bit output, levels>2 => posterize with ordered dither
  const out = new Uint8ClampedArray(srcRGBA.length);
  const m = 8;
  const maxT = 64;

  // Terminal tint (phosphor-ish). Adjust these to taste.
  const TINT_R = 1.00;
  const TINT_G = 1.00;
  const TINT_B = 0.35;

  // Subtle vertical brightness gradient (top a bit dimmer than bottom)
  const GRAD_TOP = 0.90;
  const GRAD_BOTTOM = 1.05;

  for(let y=0; y<h; y++){
    for(let x=0; x<w; x++){
      const i = (y*w + x)*4;
      const r = srcRGBA[i], g=srcRGBA[i+1], b=srcRGBA[i+2];
      // luma in 0..1
      let l = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      // gentle contrast curve for readability
      l = clamp((l - 0.08) * 1.18, 0, 1);

      const t = (BAYER_8[y % m][x % m] + 0.5) / maxT; // 0..1

      let q;
      if (levels <= 2){
        q = l > t ? 1 : 0;
      } else {
        const step = 1 / (levels - 1);
        // dither between nearest levels
        const base = Math.floor(l / step) * step;
        const next = clamp(base + step, 0, 1);
        const frac = (l - base) / step;
        q = (frac > t) ? next : base;
      }

      const v = Math.round(q * 255);

      // Vertical gradient multiplier
      const gy = h <= 1 ? 1 : (y / (h - 1));
      const grad = GRAD_TOP + (GRAD_BOTTOM - GRAD_TOP) * gy;

      // Terminal tint mapping (still driven by luminance)
      const rr = clamp(v * TINT_R * grad, 0, 255);
      const gg = clamp(v * TINT_G * grad, 0, 255);
      const bb = clamp(v * TINT_B * grad, 0, 255);

      out[i] = rr;
      out[i + 1] = gg;
      out[i + 2] = bb;
      out[i + 3] = 255;
    }
  }
  return out;
}
