// Chambers and excavation plans. When a worker notices crowding (brood
// piling up, a full granary, nowhere to rest, corpses with nowhere to go) it
// lays out a new excavation site: a meandering tunnel ending in a flat
// floored chamber. Excavators are then drawn to the marked soil and dig it
// out cell by cell, hauling every pellet to the surface.
import {
  W, H, TUNNEL, ROCK, ROOT, ENTRANCE_Z, S_STORED, isFood, ITEM_FOOD,
  R_QUEEN, R_BROOD, R_FOOD, R_WASTE, R_REST, ROLE_NAMES,
} from './constants.js';
import { hash2 } from './rng.js';
import { NF_EXIT, NF_QUEEN, NF_BROOD, NF_FOOD, NF_WASTE, NF_REST, NF_DIG } from './nav.js';

export const P_ENTRANCE = 64;
export const P_EXPLORE = 128;
export const P_REPAIR = 256;
export const P_WIDEN = 512;

export const chambers = {
  makeChamber(role, cx, cy, rx, ry) {
    const ch = {
      id: this.chambers.length, role, cx, cy, rx, ry,
      interior: [], dug: 0, active: false, anchor: -1,
      floor: [], stack: new Map(), items: [], broodCount: 0,
      capacity: 0, flooded: false, born: this.time, name: '',
    };
    this.chambers.push(ch);
    return ch;
  },

  chamberName(ch) {
    if (ch.role & R_QUEEN) return 'Royal chamber';
    return ROLE_NAMES[ch.role] || 'Chamber';
  },

  chamberAt(x, y) {
    const c = (y | 0) * W + (x | 0);
    if (c < 0 || c >= W * H) return null;
    const id = this.world.chamberOf[c];
    return id >= 0 ? this.chambers[id] : null;
  },

  refreshChamber(ch) {
    const w = this.world;
    ch.floor.length = 0;
    let dug = 0, sx = 0, sy = 0;
    for (const c of ch.interior) {
      if (w.type[c] !== TUNNEL) continue;
      dug++; sx += c % W; sy += (c / W) | 0;
      if (w.type[c - W] !== TUNNEL) ch.floor.push(c);
    }
    ch.dug = dug;
    if (dug) {
      // anchor = the dug cell closest to the centroid
      const mx = sx / dug, my = sy / dug;
      let bd = 1e9;
      for (const c of ch.interior) {
        if (w.type[c] !== TUNNEL) continue;
        const d = (c % W - mx) ** 2 + (((c / W) | 0) - my) ** 2;
        if (d < bd) { bd = d; ch.anchor = c; }
      }
    }
    ch.capacity = Math.max(6, ch.floor.length * 5);
    if (!ch.active && dug >= ch.interior.length * 0.6) this.activateChamber(ch);
  },

  activateChamber(ch) {
    ch.active = true;
    this.navDirty = true;
    const royal = this.chambers[0];
    if (ch.id !== 0) {
      // a dedicated room takes over that job from the royal chamber
      if (ch.role & R_BROOD) royal.role &= ~R_BROOD;
      if (ch.role & R_FOOD) royal.role &= ~R_FOOD;
      if (ch.role & R_REST) royal.role &= ~R_REST;
      this.logEvent(`A new ${this.chamberName(ch).toLowerCase()} has been completed`, 'build', { chamber: ch.id });
    }
  },

  // ---- stacking objects on chamber floors ----
  stackSpot(ch, brood = false) {
    let best = -1, bs = 1e9;
    const f = ch.floor;
    if (!f.length) return { cell: -1, x: ch.cx, y: ch.cy };
    const r = this.rng;
    for (let n = 0; n < Math.min(12, f.length); n++) {
      const c = f[r.int(0, f.length - 1)];
      // brood near the middle, food and refuse towards the ends
      const dx = Math.abs(c % W + 0.5 - ch.cx) / ch.rx;
      const s = (ch.stack.get(c) || 0) + (brood ? dx * 1.5 : (1 - dx) * 0.8) + r.next() * 0.5;
      if (s < bs) { bs = s; best = c; }
    }
    return { cell: best, x: best % W + 0.5, y: ((best / W) | 0) + 0.5 };
  },

  storeItem(k, ch, cell) {
    const It = this.items, r = this.rng;
    if (cell < 0 || this.world.type[cell] !== TUNNEL) cell = this.stackSpot(ch).cell;
    It.state[k] = S_STORED;
    It.owner[k] = -1;
    It.chamber[k] = ch.id;
    It.cell[k] = cell;
    const n = ch.stack.get(cell) || 0;
    ch.stack.set(cell, n + 1);
    const x = cell >= 0 ? cell % W : ch.cx, y = cell >= 0 ? (cell / W) | 0 : ch.cy;
    It.x[k] = x + 0.5 + r.range(-0.4, 0.4);
    It.y[k] = y + 0.18 + Math.min(n, 5) * 0.3;
    It.z[k] = -0.35 - r.next() * 1.8;
    It.rot[k] = r.range(0, 6.28);
    ch.items.push(k);
  },

  unstack(k) {
    const It = this.items;
    const ch = this.chambers[It.chamber[k]];
    if (ch) {
      const j = ch.items.indexOf(k);
      if (j >= 0) { ch.items[j] = ch.items[ch.items.length - 1]; ch.items.pop(); }
      const n = ch.stack.get(It.cell[k]) || 0;
      if (n > 0) ch.stack.set(It.cell[k], n - 1);
    }
    It.chamber[k] = -1; It.cell[k] = -1;
  },

  takeStored(ch, preferProtein) {
    const It = this.items;
    let best = -1, bs = -1e9;
    for (let n = 0; n < ch.items.length; n++) {
      const k = ch.items[n];
      if (!isFood(It.kind[k])) continue;
      const [c, p] = ITEM_FOOD[It.kind[k]];
      const s = (preferProtein ? p * 2 + c * 0.3 : c + p * 0.4) - n * 0.001;
      if (s > bs) { bs = s; best = k; }
    }
    if (best >= 0) this.unstack(best);
    return best;
  },

  takeAnyStored(preferProtein) {
    for (const ch of this.chambers) {
      if (!(ch.role & R_FOOD) || !ch.items.length) continue;
      const k = this.takeStored(ch, preferProtein);
      if (k >= 0) return k;
    }
    for (const ch of this.chambers) {
      if (!ch.items.length || (ch.role & R_WASTE)) continue;
      const k = this.takeStored(ch, preferProtein);
      if (k >= 0) return k;
    }
    return -1;
  },

  placeBrood(b, ch, cell) {
    const B = this.brood, r = this.rng;
    if (cell < 0 || this.world.type[cell] !== TUNNEL || this.world.chamberOf[cell] !== ch.id) cell = this.stackSpot(ch, true).cell;
    const n = ch.stack.get(cell) || 0;
    ch.stack.set(cell, n + 1);
    B.chamber[b] = ch.id; B.cell[b] = cell;
    const x = cell >= 0 ? cell % W : ch.cx, y = cell >= 0 ? (cell / W) | 0 : ch.cy;
    B.x[b] = x + 0.5 + r.range(-0.35, 0.35);
    B.y[b] = y + 0.22 + Math.min(n, 5) * 0.26;
    B.z[b] = -0.4 - r.next() * 1.6;
    B.rot[b] = r.range(0, 6.28);
    ch.broodCount++;
  },

  unstackBrood(b) {
    const B = this.brood;
    const ch = this.chambers[B.chamber[b]];
    if (ch && B.cell[b] >= 0) {
      const n = ch.stack.get(B.cell[b]) || 0;
      if (n > 0) ch.stack.set(B.cell[b], n - 1);
      ch.broodCount = Math.max(0, ch.broodCount - 1);
    } else if (ch) ch.broodCount = Math.max(0, ch.broodCount - 1);
    B.cell[b] = -1;
  },

  // ---- excavation ----
  excavate(c) {
    const w = this.world;
    const pid = w.mark[c];
    if (!w.setOpen(c % W, (c / W) | 0)) return;
    this.openCells.push(c);
    this.navDirty = true;
    const chId = w.chamberOf[c];
    if (chId >= 0) this.refreshChamber(this.chambers[chId]);
    // a dig next to a chamber can widen its floor
    const below = w.chamberOf[c + W];
    if (below >= 0 && below !== chId) this.refreshChamber(this.chambers[below]);
    const p = this.plans[pid];
    if (p && !p.done) {
      p.remaining--;
      if (p.remaining <= 0) this.finishPlan(p);
    }
  },

  finishPlan(p) {
    p.done = true;
    if (p.kind === P_ENTRANCE) {
      const e = { x: p.topX + 1, z: ENTRANCE_Z - this.rng.range(0, 1.5), cellX: p.topX, cellY: p.topY, born: this.time };
      this.entrances.push(e);
      this.navDirty = true;
      this.logEvent('Workers broke through to the surface: a new nest entrance', 'build');
    }
  },

  // pick what (if anything) the colony should build next
  pendingNeed() {
    const active = this.plans.filter((p) => !p.done && p.kind !== P_WIDEN && p.kind !== P_REPAIR);
    const pop = this.ants.count;
    const maxPlans = pop < 40 ? 1 : pop < 160 ? 2 : pop < 500 ? 3 : 4;
    if (active.length >= maxPlans) return 0;
    const planned = active.reduce((m, p) => m | p.kind, 0);
    let broodCap = 0, foodCap = 0, restCap = 0, wasteCap = 0, hasWaste = false, stored = 0, waste = 0;
    for (const ch of this.chambers) {
      if (!ch.active) continue;
      if (ch.role & R_BROOD) broodCap += ch.capacity;
      if (ch.role & R_FOOD) { foodCap += ch.capacity; stored += ch.items.length; }
      if (ch.role & R_REST) restCap += ch.dug * 1.1;
      if (ch.role & R_WASTE) { hasWaste = true; wasteCap += ch.capacity; waste += ch.items.length; }
    }
    restCap += this.chambers.reduce((s, ch) => s + (ch.active && !(ch.role & R_REST) ? ch.dug * 0.35 : 0), 0);
    const inside = this.stats.underground;
    const count = (role) => this.chambers.reduce((n, ch) => n + (ch.id > 0 && (ch.role & role) ? 1 : 0), 0);
    if (!(planned & R_BROOD) && this.brood.count > broodCap * 0.7 && count(R_BROOD) < 1 + pop / 220) return R_BROOD;
    if (!(planned & R_FOOD) && stored > foodCap * 0.75 && count(R_FOOD) < 1 + pop / 300) return R_FOOD;
    if (!(planned & R_REST) && inside > restCap && count(R_REST) < 1 + pop / 260) return R_REST;
    if (!(planned & R_WASTE) && ((!hasWaste && pop > 22 && this.stats.totalDeaths > 2) || (hasWaste && waste > wasteCap * 0.75))) return R_WASTE;
    if (!(planned & P_ENTRANCE) && pop > 150 * this.entrances.length && this.entrances.length < 4) return P_ENTRANCE;
    if (!active.length && pop > 25 && this.rng.chance(0.25)) return P_EXPLORE;
    return 0;
  },

  tryPlan() {
    const need = this.pendingNeed();
    if (!need) return false;
    const ok = need === P_ENTRANCE ? this.planEntrance() : need === P_EXPLORE ? this.planTunnel() : this.planChamber(need);
    if (ok) this.navDirty = true;
    return ok;
  },

  nearestOpen(x, y, avoidChambers) {
    const w = this.world;
    let best = -1, bd = 1e9;
    const oc = this.openCells;
    for (let n = 0; n < oc.length; n++) {
      const c = oc[n];
      if (w.type[c] !== TUNNEL) continue;
      if (avoidChambers && w.chamberOf[c] >= 0 && (this.chambers[w.chamberOf[c]].role & R_QUEEN)) continue;
      const cx = c % W, cy = (c / W) | 0;
      if (cy >= w.ground[cx] - 3) continue;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  },

  // Meandering 2-wide path from (bx,by) toward (tx,ty). Returns cells or null.
  carvePath(bx, by, tx, ty, stopFn, maxLen = 70) {
    const w = this.world, r = this.rng;
    const cells = [];
    const seen = new Set();
    let x = bx + 0.5, y = by + 0.5;
    let lx = bx, ly = by;
    let wob = 0;
    for (let s = 0; s < maxLen; s++) {
      const base = Math.atan2(ty - y, tx - x);
      wob = Math.max(-0.75, Math.min(0.75, wob + r.gauss() * 0.28));
      let ok = false;
      for (const dev of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
        const a = base + wob + dev;
        const nx = x + Math.cos(a), ny = y + Math.sin(a);
        const t = w.t(nx | 0, ny | 0);
        if (t === ROCK || t === ROOT || nx < 3 || nx > W - 4 || ny < 3) continue;
        x = nx; y = ny; ok = true;
        if (dev !== 0) wob = dev * 0.5;
        break;
      }
      if (!ok) return null;
      const cx = x | 0, cy = y | 0;
      // width 2: add the cell beside the path (perpendicular to travel)
      const a = Math.atan2(ty - y, tx - x);
      const px = (x + Math.cos(a + Math.PI / 2) * 0.9) | 0, py = (y + Math.sin(a + Math.PI / 2) * 0.9) | 0;
      const pts = [[cx, cy], [px, py]];
      // keep the path 4-connected so it can be dug out step by step
      if (cx !== lx && cy !== ly) pts.push([cx, ly]);
      lx = cx; ly = cy;
      for (const [qx, qy] of pts) {
        const c = qy * W + qx;
        if (qx < 2 || qx > W - 3 || qy < 2 || qy >= H || seen.has(c)) continue;
        const t = w.type[c];
        if (t === ROCK || t === ROOT) continue;
        seen.add(c);
        cells.push(c);
      }
      if (stopFn(x, y)) return cells;
    }
    return null;
  },

  planChamber(role) {
    const w = this.world, r = this.rng;
    const royal = this.chambers[0];
    const pop = this.ants.count;
    const spread = 22 + Math.sqrt(pop) * 2.5 + this.chambers.length * 2.5;
    let best = null, bestScore = -1e9;
    for (let t = 0; t < 18; t++) {
      const sx = Math.round(Math.max(12, Math.min(W - 13, royal.cx + r.gauss() * spread)));
      const g = w.ground[sx];
      let dmin = 12, dmax = 60;
      if (role === R_BROOD) { dmin = 14; dmax = Math.min(75, 30 + pop * 0.06); }
      else if (role === R_FOOD) { dmin = 9; dmax = 34; }
      else if (role === R_WASTE) { dmin = 18; dmax = 80; }
      else if (role === R_REST) { dmin = 12; dmax = Math.min(90, 40 + pop * 0.05); }
      const sy = Math.round(g - r.range(dmin, dmax));
      if (sy < 7) continue;
      const rx = role === R_WASTE ? r.range(3.5, 5.5) + Math.min(2, pop / 500) : r.range(5, 8.5) + Math.min(4, pop / 250);
      const ry = role === R_WASTE ? r.range(2.2, 3) : r.range(2.4, 3.4) + Math.min(0.8, pop / 1000);
      const cells = [];
      let bad = 0, total = 0;
      for (let y = Math.floor(sy - ry - 1); y <= sy + ry + 1; y++) {
        for (let x = Math.floor(sx - rx - 1); x <= sx + rx + 1; x++) {
          const dx = (x + 0.5 - sx) / rx, dy = (y + 0.5 - sy) / ry;
          if (dy < -0.62) continue;   // flat floor
          const n = (hash2(x, y, this.seedNum + 5) - 0.5) * 0.35;
          if (dx * dx + dy * dy > 1 + n) continue;
          total++;
          if (x < 3 || x > W - 4 || y < 3 || y > w.ground[x] - 5) { bad += 5; continue; }
          const c = y * W + x, ty = w.type[c];
          if (ty === ROCK || ty === ROOT) { bad++; continue; }
          if (w.chamberOf[c] >= 0) { bad += 10; continue; }
          if (ty === TUNNEL) bad += 0.5;
          cells.push(c);
        }
      }
      if (bad > total * 0.3 || cells.length < 12) continue;
      // keep a wall of soil between rooms
      let crowd = 0;
      for (const ch of this.chambers) {
        const gx = Math.abs(ch.cx - sx) - ch.rx - rx, gy = Math.abs(ch.cy - sy) - ch.ry - ry;
        if (gx < 4 && gy < 3) crowd++;
      }
      if (crowd) continue;
      const b = this.nearestOpen(sx, sy, true);
      if (b < 0) continue;
      const bx = b % W, by = (b / W) | 0;
      const path = this.carvePath(bx, by, sx, sy, (x, y) => ((x - sx) / rx) ** 2 + ((y - sy) / ry) ** 2 < 0.8, 60);
      if (!path) continue;
      let score = -path.length * 0.5 - bad * 2 + r.next() * 6;
      if (role === R_BROOD) score -= Math.hypot(sx - royal.cx, sy - royal.cy) * 0.35;
      if (role === R_FOOD) score -= Math.hypot(sx - this.entrances[0].cellX, sy - this.entrances[0].cellY) * 0.25;
      if (role === R_WASTE) {
        let md = 1e9;
        for (const ch of this.chambers) if (ch.role & (R_BROOD | R_QUEEN)) md = Math.min(md, Math.hypot(ch.cx - sx, ch.cy - sy));
        score += Math.min(md, 60) * 0.4;
      }
      if (score > bestScore) { bestScore = score; best = { sx, sy, rx, ry, cells, path }; }
    }
    if (!best) return false;
    const ch = this.makeChamber(role, best.sx + 0.5, best.sy + 0.5, best.rx, best.ry);
    for (const c of best.cells) { this.world.chamberOf[c] = ch.id; ch.interior.push(c); }
    this.addPlan(role, [...best.path, ...best.cells], ch.id);
    this.logEvent(`Workers began excavating a new ${this.chamberName(ch).toLowerCase()}`, 'build', { chamber: ch.id });
    return true;
  },

  planTunnel() {
    const w = this.world, r = this.rng;
    const oc = this.openCells;
    for (let t = 0; t < 10; t++) {
      const b = oc[r.int(0, oc.length - 1)];
      if (w.type[b] !== TUNNEL) continue;
      const bx = b % W, by = (b / W) | 0;
      if (by > w.ground[bx] - 6) continue;
      const a = r.range(-Math.PI * 0.95, -Math.PI * 0.05) + (r.chance(0.4) ? Math.PI * 0.9 * (r.chance(0.5) ? 1 : -1) * 0.5 : 0);
      const len = r.range(12, 26);
      const tx = bx + Math.cos(a) * len, ty = Math.max(6, by + Math.sin(a) * len);
      const path = this.carvePath(bx, by, tx, ty, (x, y) => Math.hypot(x - tx, y - ty) < 1.5, 40);
      if (!path || path.length < 8) continue;
      this.addPlan(P_EXPLORE, path, -1);
      return true;
    }
    return false;
  },

  planEntrance() {
    const w = this.world, r = this.rng;
    for (let t = 0; t < 14; t++) {
      const ex = Math.round(this.entrances[0].cellX + (r.chance(0.5) ? 1 : -1) * r.range(18, 42));
      if (ex < 6 || ex > W - 7) continue;
      if (this.entrances.some((e) => Math.abs(e.cellX - ex) < 14)) continue;
      const gy = w.ground[ex] - 1;
      const b = this.nearestOpen(ex, gy - 14, true);
      if (b < 0) continue;
      const bx = b % W, by = (b / W) | 0;
      if (Math.abs(bx - ex) > 30) continue;
      let topX = ex, topY = gy;
      const path = this.carvePath(bx, by, ex + 0.5, gy + 2, (x, y) => {
        const gx = x | 0;
        if ((y | 0) >= w.ground[gx] - 1) { topX = gx; topY = w.ground[gx] - 1; return true; }
        return false;
      }, 70);
      if (!path) continue;
      // make sure the mouth itself is part of the plan, two cells wide
      for (const c of [topY * W + topX, (w.ground[topX + 1] - 1) * W + topX + 1]) if (!path.includes(c)) path.push(c);
      const p = this.addPlan(P_ENTRANCE, path, -1);
      p.topX = topX; p.topY = topY;
      this.logEvent('Workers started digging a second route to the surface', 'build');
      return true;
    }
    return false;
  },

  // Busy corridors get widened: workers stuck in traffic nibble at the walls.
  widenCongested() {
    const w = this.world, occ = this.occ, r = this.rng;
    const cand = [];
    for (let n = 0; n < this.occN; n++) {
      const c = this.occList[n];
      if (occ[c] >= 4 && w.chamberOf[c] < 0) cand.push(c);
    }
    if (!cand.length) return;
    const cells = [];
    for (let t = 0; t < Math.min(6, cand.length); t++) {
      const c = cand[r.int(0, cand.length - 1)];
      const x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, nc = ny * W + nx;
        if (nx < 3 || nx > W - 4 || ny < 3 || ny >= w.ground[nx] - 2) continue;
        if (!w.diggable(w.type[nc]) || w.mark[nc] >= 0) continue;
        // measure corridor width across this direction; keep it below 5
        let width = 0;
        for (let k = 0; k < 5; k++) { const qc = (y - dy * k) * W + x - dx * k; if (w.type[qc] === TUNNEL) width++; else break; }
        if (width >= 4) continue;
        cells.push(nc);
        break;
      }
    }
    if (cells.length) { this.addPlan(P_WIDEN, cells, -1); this.navDirty = true; }
  },

  addPlan(kind, cells, chamberId) {
    const w = this.world;
    const p = { id: this.plans.length, kind, chamber: chamberId, cells: [], order: new Map(), remaining: 0, done: false, born: this.time, stall: 0 };
    let n = 0;
    for (const c of cells) {
      if (!w.diggable(w.type[c])) continue;
      if (w.mark[c] >= 0 && this.plans[w.mark[c]] && !this.plans[w.mark[c]].done) continue;
      w.mark[c] = p.id;
      p.cells.push(c);
      p.order.set(c, n++);
    }
    p.remaining = p.cells.length;
    this.plans.push(p);
    if (!p.remaining) this.finishPlan(p);
    return p;
  },

  // Collect flow-field sources for every standard destination.
  navSources() {
    const w = this.world;
    const src = [];
    src[NF_EXIT] = this.entrances.flatMap((e) => [e.cellY * W + e.cellX, e.cellY * W + e.cellX + 1]).filter((c) => w.type[c] === TUNNEL);
    // storerooms that are full stop attracting deliveries, so new rooms fill up
    const byRole = (role, fill) => {
      const out = [], full = [];
      for (const ch of this.chambers) {
        if (!ch.active || !(ch.role & role) || ch.flooded) continue;
        const dst = fill && fill(ch) >= ch.capacity ? full : out;
        for (const c of ch.interior) if (w.type[c] === TUNNEL) dst.push(c);
      }
      return out.length ? out : full;
    };
    src[NF_QUEEN] = byRole(R_QUEEN);
    src[NF_BROOD] = byRole(R_BROOD, (ch) => ch.broodCount);
    if (!src[NF_BROOD].length) src[NF_BROOD] = src[NF_QUEEN];
    src[NF_FOOD] = byRole(R_FOOD, (ch) => ch.items.length);
    if (!src[NF_FOOD].length) src[NF_FOOD] = src[NF_QUEEN];
    src[NF_WASTE] = byRole(R_WASTE, (ch) => ch.items.length);
    src[NF_REST] = byRole(R_REST);
    // digging frontier: open cells touching marked soil
    const dig = [];
    let frontier = 0;
    const exitDist = this.nav.dist[NF_EXIT];
    const fresh = this.nav.builtTopo < 0;
    for (const p of this.plans) {
      if (p.done) continue;
      let pf = 0;
      for (const c of p.cells) {
        if (w.type[c] === TUNNEL || w.mark[c] !== p.id) continue;
        const nb = [c - 1, c + 1, c - W, c + W];
        let f = false;
        // only faces the colony can actually reach count (cells dug since the
        // last rebuild have no distance yet but are next to reachable ones)
        for (const n of nb) {
          if (w.type[n] !== TUNNEL) continue;
          if (!fresh && exitDist[n] === 65535 && ![n - 1, n + 1, n - W, n + W].some((m) => exitDist[m] !== 65535)) continue;
          dig.push(n); f = true;
        }
        if (f) pf++;
      }
      frontier += pf;
      if (!pf) {
        // unreachable plan (blocked by rock?) - abandon it after a while
        p.stall++;
        if (p.stall > 6) {
          for (const c of p.cells) if (w.mark[c] === p.id) w.mark[c] = -1;
          p.done = true;
        }
      } else p.stall = 0;
    }
    src[NF_DIG] = dig;
    this.frontier = frontier;
    this.hasField[NF_EXIT] = src[NF_EXIT].length > 0;
    this.hasField[NF_QUEEN] = src[NF_QUEEN].length > 0;
    this.hasField[NF_BROOD] = src[NF_BROOD].length > 0;
    this.hasField[NF_FOOD] = src[NF_FOOD].length > 0;
    this.hasField[NF_WASTE] = src[NF_WASTE].length > 0;
    this.hasField[NF_REST] = src[NF_REST].length > 0;
    this.hasField[NF_DIG] = dig.length > 0;
    return src;
  },
};
