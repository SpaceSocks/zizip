// Shared navigation for the underground. Instead of per-ant A*, the colony
// keeps a handful of BFS flow fields (to the exit, the royal chamber, the
// nursery, the granary, ...). Every ant heading to the same kind of place
// reads the same field, and fields are only rebuilt when the tunnels change.
import { W, H, TUNNEL } from './constants.js';

export const NF_NONE = 0;
export const NF_EXIT = 1;
export const NF_QUEEN = 2;
export const NF_BROOD = 3;
export const NF_FOOD = 4;
export const NF_WASTE = 5;
export const NF_REST = 6;
export const NF_DIG = 7;
export const NF_CELL = 8;   // cached per-target field (ant.key selects it)
const N_STD = 8;

const UNREACH = 65535;
// 8 neighbours: dx, dy
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

export class Nav {
  constructor(world) {
    this.world = world;
    this.dist = [];
    this.next = [];   // precomputed best-neighbour direction per cell (0..7, 255 = none)
    for (let k = 0; k < N_STD; k++) {
      this.dist.push(new Uint16Array(W * H).fill(UNREACH));
      this.next.push(new Uint8Array(W * H).fill(255));
    }
    this.queue = new Int32Array(W * H);
    this.cache = new Map();   // cell -> {dist, next, used}
    this.builtTopo = -1;
    this.buildTime = -99;
    this.calcs = 0;           // BFS runs (perf stat)
    this.sources = [];
    this.dirty = true;
  }

  bfs(sources, dist, next) {
    const w = this.world, type = w.type, q = this.queue;
    dist.fill(UNREACH);
    let qh = 0, qt = 0;
    for (const s of sources) {
      if (type[s] !== TUNNEL || dist[s] === 0) continue;
      dist[s] = 0;
      q[qt++] = s;
    }
    while (qh < qt) {
      const c = q[qh++];
      const d = dist[c] + 1;
      const x = c % W;
      if (x < W - 1 && type[c + 1] === TUNNEL && dist[c + 1] > d) { dist[c + 1] = d; q[qt++] = c + 1; }
      if (x > 0 && type[c - 1] === TUNNEL && dist[c - 1] > d) { dist[c - 1] = d; q[qt++] = c - 1; }
      if (c + W < W * H && type[c + W] === TUNNEL && dist[c + W] > d) { dist[c + W] = d; q[qt++] = c + W; }
      if (c - W >= 0 && type[c - W] === TUNNEL && dist[c - W] > d) { dist[c - W] = d; q[qt++] = c - W; }
    }
    // direction table
    for (let k = 0; k < qt; k++) {
      const c = q[k];
      const dc = dist[c];
      if (dc === 0) { next[c] = 255; continue; }
      const x = c % W, y = (c / W) | 0;
      let best = 255, bd = dc;
      const off = (x * 7 + y * 3) & 7;
      for (let j = 0; j < 8; j++) {
        const n = (j + off) & 7;
        const nx = x + DX[n], ny = y + DY[n];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (type[ni] !== TUNNEL) continue;
        if (n >= 4 && (type[y * W + nx] !== TUNNEL || type[ny * W + x] !== TUNNEL)) continue;
        // diagonals count as a shortcut of the same "distance" budget
        const nd = dist[ni] + (n >= 4 ? 0.4 : 0);
        if (nd < bd) { bd = nd; best = n; }
      }
      next[c] = best;
    }
    this.calcs++;
    return qt;
  }

  // sourcesByField: array indexed by field id -> array of cell indices
  rebuild(sourcesByField, time) {
    for (let k = 1; k < N_STD; k++) {
      this.bfs(sourcesByField[k] || [], this.dist[k], this.next[k]);
    }
    this.cache.clear();
    this.builtTopo = this.world.topoVersion;
    this.buildTime = time;
    this.dirty = false;
  }

  cellField(cell) {
    let e = this.cache.get(cell);
    if (!e) {
      if (this.cache.size >= 24) {
        // evict least recently used
        let oldK = -1, oldU = Infinity;
        for (const [k, v] of this.cache) if (v.used < oldU) { oldU = v.used; oldK = k; }
        this.cache.delete(oldK);
      }
      e = { dist: new Uint16Array(W * H), next: new Uint8Array(W * H), used: 0 };
      this.bfs([cell], e.dist, e.next);
      this.cache.set(cell, e);
    }
    e.used = this.calcs + performanceCounter++;
    return e;
  }

  getDist(field, key, c) {
    if (field === NF_CELL) return this.cellField(key).dist[c];
    return this.dist[field][c];
  }

  getNext(field, key, c) {
    if (field === NF_CELL) return this.cellField(key).next[c];
    return this.next[field][c];
  }
}

let performanceCounter = 0;
export { DX, DY, UNREACH };
