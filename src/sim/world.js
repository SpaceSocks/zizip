import {
  W, H, SURF_D, AIR, TUNNEL, SOIL, CLAY, SAND, ROCK, ROOT, LOOSE, ENTRANCE_Z,
} from './constants.js';
import { fbm, hash2 } from './rng.js';

export const CHUNK = 24;
export const CX = Math.ceil(W / CHUNK);
export const CY = Math.ceil(H / CHUNK);
const SV = W + 1;             // surface vertex columns
const SVZ = SURF_D + 1;       // surface vertex rows

export class World {
  constructor(rng, seedNum) {
    this.rng = rng;
    this.seed = seedNum;
    this.type = new Uint8Array(W * H);
    this.moist = new Uint8Array(W * H);
    this.water = new Uint8Array(W * H);
    this.dig = new Float32Array(W * H);     // dig progress per cell
    this.mark = new Int16Array(W * H).fill(-1); // excavation plan id
    this.chamberOf = new Int16Array(W * H).fill(-1);
    this.ground = new Int16Array(W);         // first non-solid row per column
    this.groundF = new Float32Array(W + 1);  // smooth ground height at the front glass
    this.baseSurf = new Float32Array(SV * SVZ);
    this.mound = new Float32Array(SV * SVZ);
    this.moundVersion = 0;
    this.moundDirty = null;
    this.dirtyChunks = new Set();
    this.topoVersion = 0;
    this.moistVersion = 0;
    this.rocks = [];     // {x, y, r} for rendering boulders
    this.roots = [];     // polylines [{x,y}] for rendering
    this.dugCells = 0;
    this.dirtDeposited = 0;
    this.generate();
  }

  idx(x, y) { return y * W + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  t(x, y) { return (x < 0 || y < 0 || x >= W || y >= H) ? ROCK : this.type[y * W + x]; }
  passable(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const t = this.type[y * W + x];
    return t === TUNNEL;
  }
  isSolid(t) { return t >= SOIL; }
  diggable(t) { return t === SOIL || t === CLAY || t === SAND || t === LOOSE; }

  generate() {
    const rng = this.rng, s = this.seed;
    const baseG = H - 11 + rng.range(-1.5, 1.5);
    const hillAmp = rng.range(2, 5);
    for (let x = 0; x <= W; x++) {
      const g = baseG + (fbm(x * 0.018, 3.3, s + 1, 3) - 0.5) * hillAmp * 2 + (fbm(x * 0.09, 7.1, s + 2, 2) - 0.5) * 1.2;
      this.groundF[x] = g;
    }
    for (let x = 0; x < W; x++) this.ground[x] = Math.round((this.groundF[x] + this.groundF[x + 1]) * 0.5);

    // soil strata with wobbly boundaries
    const clayTop = rng.range(38, 55), clayThick = rng.range(10, 22);
    const sandiness = rng.range(0.6, 0.75);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const g = this.ground[x];
        if (y >= g) { this.type[i] = AIR; continue; }
        const d = g - y;
        const wob = (fbm(x * 0.03, y * 0.05, s + 3) - 0.5) * 16;
        const lv = d + wob;
        let t = SOIL;
        if (lv > clayTop && lv < clayTop + clayThick) t = CLAY;
        else if (lv > clayTop + clayThick + 18 && fbm(x * 0.05, y * 0.05, s + 9) > 0.55) t = CLAY;
        if (d > 5 && fbm(x * 0.07, y * 0.09, s + 5) > sandiness) t = SAND;
        if (y < 2) t = ROCK;
        this.type[i] = t;
        let m = 50 + d * 1.1 + (fbm(x * 0.05, y * 0.05, s + 11) - 0.5) * 90;
        if (t === CLAY) m += 30;
        if (t === SAND) m -= 30;
        this.moist[i] = Math.max(10, Math.min(230, m));
      }
    }

    // nest location
    this.nestX = Math.round(rng.range(W * 0.34, W * 0.62));

    // rocks: irregular blobs, kept away from the nest start
    const nRocks = rng.int(7, 13);
    for (let k = 0; k < nRocks; k++) {
      let cx, cy, tries = 0;
      do {
        cx = rng.range(6, W - 6);
        cy = rng.range(6, this.ground[Math.floor(cx)] - 4);
        tries++;
      } while (Math.abs(cx - this.nestX) < 14 && cy > this.ground[this.nestX] - 30 && tries < 20);
      const r = rng.range(1.8, 5.5) * (k < 2 ? 1.5 : 1);
      const ry = r * rng.range(0.55, 0.9);
      for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) {
        for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
          if (!this.inb(x, y) || y >= this.ground[x]) continue;
          const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry;
          const n = (hash2(x, y, s + 21) - 0.5) * 0.35;
          if (dx * dx + dy * dy < 1 + n) this.type[y * W + x] = ROCK;
        }
      }
      this.rocks.push({ x: cx, y: cy, r, ry });
    }

    // roots descending from the surface (from plants rendered above)
    const nRoots = rng.int(2, 4);
    this.rootAnchors = [];
    for (let k = 0; k < nRoots; k++) {
      let rx = rng.range(12, W - 12);
      if (Math.abs(rx - this.nestX) < 18) rx += rx < this.nestX ? -20 : 20;
      rx = Math.max(10, Math.min(W - 10, rx));
      this.rootAnchors.push(rx);
      this.growRoot(rx, this.ground[Math.floor(rx)] - 0.5, -Math.PI / 2 + rng.range(-0.3, 0.3), rng.range(22, 48), 2);
    }

    // the starter nest: a slightly wandering shaft and a small chamber
    const nx = this.nestX;
    const top = this.ground[nx];
    const depth = rng.int(13, 19);
    let x = nx;
    this.clearArea(nx, top - depth, 9);
    for (let y = top - 1; y >= top - depth; y--) {
      if (rng.chance(0.18)) x += rng.chance(0.5) ? 1 : -1;
      x = Math.max(nx - 3, Math.min(nx + 3, x));
      this.setOpen(x, y); this.setOpen(x + 1, y);
      if (rng.chance(0.4)) this.setOpen(x - 1, y);
    }
    this.entrance = { x: nx + 0.5, cellX: nx, cellY: top - 1, z: ENTRANCE_Z };
    // make sure the column at the entrance is open to the top
    this.setOpen(nx, top - 1); this.setOpen(nx + 1, top - 1);
    this.startChamber = { cx: x + 0.5, cy: top - depth - 2, rx: 5.5, ry: 2.6 };
  }

  clearArea(cx, cy, r) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inb(x, y) || y >= this.ground[x]) continue;
        const i = y * W + x;
        if (this.type[i] === ROCK || this.type[i] === ROOT) this.type[i] = SOIL;
      }
    }
  }

  growRoot(x, y, ang, len, gen) {
    const pts = [{ x, y }];
    for (let i = 0; i < len; i++) {
      ang += this.rng.range(-0.25, 0.25);
      ang = Math.max(-Math.PI + 0.35, Math.min(-0.35, ang));
      x += Math.cos(ang); y += Math.sin(ang);
      if (!this.inb(Math.floor(x), Math.floor(y)) || y < 4) break;
      const ci = Math.floor(y) * W + Math.floor(x);
      if (this.type[ci] === ROCK) break;
      this.type[ci] = ROOT;
      pts.push({ x, y });
      if (gen > 0 && i > 6 && this.rng.chance(0.07)) {
        this.growRoot(x, y, ang + this.rng.pick([-0.8, 0.8]), len * 0.5, gen - 1);
      }
    }
    this.roots.push({ pts, w: 0.25 + gen * 0.18 });
  }

  setOpen(x, y) {
    if (!this.inb(x, y) || x < 1 || x >= W - 1 || y < 2) return false;
    const i = y * W + x;
    if (this.type[i] === TUNNEL || this.type[i] === AIR) return false;
    this.type[i] = TUNNEL;
    this.dig[i] = 0;
    this.mark[i] = -1;
    this.dugCells++;
    this.topoVersion++;
    this.markDirty(x, y);
    return true;
  }

  fill(x, y, t = LOOSE) {
    if (!this.inb(x, y)) return;
    const i = y * W + x;
    this.type[i] = t;
    this.topoVersion++;
    this.markDirty(x, y);
  }

  markDirty(x, y) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    this.dirtyChunks.add(cy * CX + cx);
    // neighbours share marching-squares corners
    const lx = x % CHUNK, ly = y % CHUNK;
    if (lx <= 1 && cx > 0) this.dirtyChunks.add(cy * CX + cx - 1);
    if (lx >= CHUNK - 2 && cx < CX - 1) this.dirtyChunks.add(cy * CX + cx + 1);
    if (ly <= 1 && cy > 0) this.dirtyChunks.add((cy - 1) * CX + cx);
    if (ly >= CHUNK - 2 && cy < CY - 1) this.dirtyChunks.add((cy + 1) * CX + cx);
  }

  // seconds of work for one ant to excavate a cell
  digTime(x, y) {
    const i = y * W + x, t = this.type[i];
    let base = t === CLAY ? 5.5 : t === SAND ? 1.6 : t === LOOSE ? 0.9 : 2.6;
    base *= 0.8 + hash2(x, y, this.seed + 77) * 0.45;
    base *= 1.15 - this.moist[i] / 255 * 0.35;
    return base;
  }

  // ---- surface ----
  buildSurface() {
    const s = this.seed;
    for (let iz = 0; iz < SVZ; iz++) {
      for (let ix = 0; ix < SV; ix++) {
        const z = -iz;
        const g = this.groundF[ix];
        const back = Math.min(1, iz / 6);
        const n = (fbm(ix * 0.05, iz * 0.09, s + 31, 3) - 0.5) * 4.5;
        const rise = iz * 0.06;
        this.baseSurf[iz * SV + ix] = g + (n + rise) * back * back * (3 - 2 * back);
      }
    }
  }

  surfaceH(x, z) {
    const fx = Math.max(0, Math.min(W - 0.001, x));
    const fz = Math.max(0, Math.min(SURF_D - 0.001, -z));
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const i = iz * SV + ix;
    const h00 = this.baseSurf[i] + this.mound[i], h10 = this.baseSurf[i + 1] + this.mound[i + 1];
    const h01 = this.baseSurf[i + SV] + this.mound[i + SV], h11 = this.baseSurf[i + SV + 1] + this.mound[i + SV + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  // Drop a soil pellet on the surface; it settles like a sand pile.
  depositDirt(x, z, amount = 0.2) {
    const ex = this.entrance.x, ez = this.entrance.z;
    let dx = x - ex, dz = z - ez;
    let d = Math.hypot(dx, dz);
    if (d < 1.6) { // keep the crater mouth open
      if (d < 0.01) { dx = 1; dz = -0.5; d = Math.hypot(dx, dz); }
      x = ex + dx / d * 1.8; z = ez + dz / d * 1.8;
    }
    const ix = Math.round(Math.max(0, Math.min(W, x)));
    const iz = Math.round(Math.max(0, Math.min(SURF_D, -z)));
    this.mound[iz * SV + ix] += amount;
    this.relaxMound(ix, iz, 3);
    // region the renderer needs to refresh
    const md = this.moundDirty || (this.moundDirty = { x0: ix, x1: ix, z0: iz, z1: iz });
    md.x0 = Math.min(md.x0, ix - 4); md.x1 = Math.max(md.x1, ix + 4);
    md.z0 = Math.min(md.z0, Math.max(0, iz - 4)); md.z1 = Math.max(md.z1, iz + 4);
    this.dirtDeposited++;
    this.moundVersion++;
  }

  relaxMound(cx, cz, r) {
    const maxSlope = 0.55;
    for (let it = 0; it < 3; it++) {
      for (let iz = Math.max(0, cz - r); iz <= Math.min(SURF_D, cz + r); iz++) {
        for (let ix = Math.max(0, cx - r); ix <= Math.min(W, cx + r); ix++) {
          const i = iz * SV + ix;
          const h = this.baseSurf[i] + this.mound[i];
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [ox, oz] of nb) {
            const jx = ix + ox, jz = iz + oz;
            if (jx < 0 || jz < 0 || jx > W || jz > SURF_D) continue;
            const j = jz * SV + jx;
            const hj = this.baseSurf[j] + this.mound[j];
            const diff = h - hj;
            if (diff > maxSlope && this.mound[i] > 0) {
              const mv = Math.min(this.mound[i], (diff - maxSlope) * 0.5);
              this.mound[i] -= mv;
              this.mound[j] += mv;
            }
          }
        }
      }
    }
  }

  // ---- moisture / flooding ----
  soakTop(amount) {
    for (let x = 0; x < W; x++) {
      const g = this.ground[x];
      for (let d = 1; d < 10; d++) {
        const y = g - d;
        if (y < 0) break;
        const i = y * W + x;
        this.moist[i] = Math.min(255, this.moist[i] + amount * (1 - d / 10));
      }
    }
    this.moistVersion++;
  }

  dryTop(amount) {
    for (let x = 0; x < W; x++) {
      const g = this.ground[x];
      for (let d = 1; d < 10; d++) {
        const y = g - d;
        if (y < 0) break;
        const i = y * W + x;
        const floor = 50 + d * 1.1;
        if (this.moist[i] > floor) this.moist[i] = Math.max(floor, this.moist[i] - amount);
      }
    }
    this.moistVersion++;
  }
}

export { SV, SVZ };
