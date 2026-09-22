// Pheromone fields: plain Float32 grids that decay and diffuse. The surface
// uses an (x, z) grid, the underground uses the same (x, y) grid as the soil.
import { W, H, SURF_D, TUNNEL } from './constants.js';

export const P_FOOD = 0;
export const P_HOME = 1;
export const P_ALARM = 2;
export const U_ALARM = 0;
export const U_TRAFFIC = 1;

const SW = W, SD = SURF_D;

export class Pheromones {
  constructor(world) {
    this.world = world;
    this.surf = [new Float32Array(SW * SD), new Float32Array(SW * SD), new Float32Array(SW * SD)];
    this.under = [new Float32Array(W * H), new Float32Array(W * H)];
    this.tmp = new Float32Array(Math.max(SW * SD, W * H));
    // per-second retention
    this.surfKeep = [0.982, 0.992, 0.8];
    this.underKeep = [0.82, 0.975];
    this.weatherMul = 1;   // rain / heat speed up evaporation
    this.active = 0;
    this.version = 0;
  }

  sIdx(x, z) {
    const ix = x | 0, iz = (-z) | 0;
    if (ix < 0 || iz < 0 || ix >= SW || iz >= SD) return -1;
    return iz * SW + ix;
  }

  depositS(f, x, z, amt) {
    const i = this.sIdx(x, z);
    if (i < 0) return;
    const a = this.surf[f];
    a[i] = Math.min(a[i] + amt, 12);
  }

  sampleS(f, x, z) {
    const i = this.sIdx(x, z);
    return i < 0 ? -1 : this.surf[f][i];
  }

  depositU(f, x, y, amt) {
    const ix = x | 0, iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const a = this.under[f], i = iy * W + ix;
    a[i] = Math.min(a[i] + amt, 12);
  }

  sampleU(f, x, y) {
    const ix = x | 0, iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return 0;
    return this.under[f][iy * W + ix];
  }

  // dt = seconds since last call
  update(dt, diffuse) {
    let active = 0;
    for (let f = 0; f < 3; f++) {
      const a = this.surf[f];
      const keep = Math.pow(f === P_ALARM ? this.surfKeep[f] : Math.pow(this.surfKeep[f], this.weatherMul), dt);
      for (let i = 0; i < a.length; i++) {
        const v = a[i];
        if (v > 0.002) { a[i] = v * keep; active++; } else if (v !== 0) a[i] = 0;
      }
      if (diffuse) this.blur(a, SW, SD, f === P_ALARM ? 0.2 : 0.06, null);
    }
    for (let f = 0; f < 2; f++) {
      const a = this.under[f];
      const keep = Math.pow(this.underKeep[f], dt);
      for (let i = 0; i < a.length; i++) {
        const v = a[i];
        if (v > 0.002) { a[i] = v * keep; active++; } else if (v !== 0) a[i] = 0;
      }
      if (diffuse && f === U_ALARM) this.blur(a, W, H, 0.22, this.world.type);
    }
    this.active = active;
    this.version++;
  }

  blur(a, w, h, k, mask) {
    const t = this.tmp;
    t.set(a);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (mask && mask[i] !== TUNNEL) continue;
        const v = t[i];
        const s = t[i - 1] + t[i + 1] + t[i - w] + t[i + w];
        if (v === 0 && s === 0) continue;
        a[i] = v * (1 - k) + s * 0.25 * k;
      }
    }
  }

  wash(f, factor) {
    const a = this.surf[f];
    for (let i = 0; i < a.length; i++) a[i] *= factor;
  }
}

export { SW, SD };
