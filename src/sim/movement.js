// Low-level locomotion shared by every behaviour: following shared flow
// fields underground, walking to points, and steering on the surface.
import { W, H, TUNNEL, SURF_D, ENTRANCE_Z } from './constants.js';
import { NF_CELL, DX, DY, UNREACH } from './nav.js';

const TAU = Math.PI * 2;

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

export const MOVING = 0, ARRIVED = 1, LOST = 2;

export const movement = {
  antSpeed(i) {
    const A = this.ants;
    let s = A.surf[i] ? 3.3 : 2.5;
    if (A.caste[i] === 1) s *= 0.9;
    if (A.carry[i] >= 0) s *= 0.85;
    if (A.energy[i] < 0.2) s *= 0.75;
    if (A.health[i] < 0.5) s *= 0.8;
    if (!A.surf[i]) {
      const c = (A.y[i] | 0) * W + (A.x[i] | 0);
      const occ = this.occ[c];
      if (occ > 3) s *= 0.55; else if (occ > 2) s *= 0.8;
      if (this.world.water[c] > 40) s *= 0.4;
    } else if (this.weather.rain > 0.3) s *= 0.8;
    return s;
  },

  turnToward(i, target, rate, dt) {
    const A = this.ants;
    if (A.surf[i] && A.stuck[i] > 0) { A.stuck[i] -= dt; return; }
    const d = angDiff(A.hd[i], target);
    const m = rate * dt;
    A.hd[i] += d > m ? m : d < -m ? -m : d;
  },

  // Underground: step forward along heading with wall collision.
  stepU(i, dt, speed) {
    const A = this.ants, w = this.world;
    const dist = speed * dt;
    const cx = Math.cos(A.hd[i]), cy = Math.sin(A.hd[i]);
    const x = A.x[i], y = A.y[i];
    let nx = x + cx * dist, ny = y + cy * dist;
    // probe a little ahead of the body along each axis we are really moving on
    const sx = cx > 0.25 ? 0.28 : cx < -0.25 ? -0.28 : 0;
    const sy = cy > 0.25 ? 0.28 : cy < -0.25 ? -0.28 : 0;
    if (this.okU(nx, ny, sx, sy)) { A.x[i] = nx; A.y[i] = ny; A.walk[i] += dist; return true; }
    if (Math.abs(cx) > 0.2 && this.okU(nx, y, sx, 0)) { A.x[i] = nx; A.walk[i] += dist * 0.7; return true; }
    if (Math.abs(cy) > 0.2 && this.okU(x, ny, 0, sy)) { A.y[i] = ny; A.walk[i] += dist * 0.7; return true; }
    return false;
  },

  okU(px, py, sx, sy) {
    const w = this.world;
    return w.passable(Math.floor(px), Math.floor(py)) &&
      w.passable(Math.floor(px + sx), Math.floor(py)) &&
      w.passable(Math.floor(px), Math.floor(py + sy));
  },

  // Follow a shared flow field. Looks two cells ahead so paths are smooth,
  // and keeps to the right of the direction of travel, which naturally
  // separates two-way traffic into lanes.
  goField(i, field, key, dt) {
    const A = this.ants, nav = this.nav, w = this.world;
    let c = (A.y[i] | 0) * W + (A.x[i] | 0);
    if (w.type[c] !== TUNNEL) { this.unstick(i); return MOVING; }
    const d = nav.getDist(field, key, c);
    if (d === 0) return ARRIVED;
    if (d === UNREACH) return LOST;
    let n = nav.getNext(field, key, c);
    if (n === 255) return LOST;
    let tx = (c % W) + DX[n], ty = ((c / W) | 0) + DY[n];
    const c2 = ty * W + tx;
    const n2 = nav.getNext(field, key, c2);
    let ax = tx + 0.5, ay = ty + 0.5;
    if (n2 !== 255 && nav.getDist(field, key, c2) > 0) {
      ax = (ax + tx + DX[n2] + 0.5) * 0.5;
      ay = (ay + ty + DY[n2] + 0.5) * 0.5;
    }
    let dx = ax - A.x[i], dy = ay - A.y[i];
    const len = Math.hypot(dx, dy) || 1;
    // keep right (plus a personal sideways habit), squeezing in where the tunnel is narrow
    const off = A.lane[i] * 0.55 + (((i * 0.3819) % 1) - 0.5) * 0.5;
    for (let k = 0; k < 2; k++) {
      const s = k ? off * 0.5 : off;
      const ox = ax + (dy / len) * s, oy = ay + (-dx / len) * s;
      if (w.passable(ox | 0, oy | 0) && w.passable((ox + (dy / len) * 0.25 * Math.sign(s)) | 0, (oy - (dx / len) * 0.25 * Math.sign(s)) | 0)) { ax = ox; ay = oy; break; }
    }
    const want = Math.atan2(ay - A.y[i], ax - A.x[i]);
    this.turnToward(i, want, 9, dt);
    const sp = this.antSpeed(i);
    if (Math.abs(angDiff(A.hd[i], want)) > 1.3) {
      // sharp corner: pivot mostly in place
      this.stepU(i, dt, sp * 0.3);
    } else if (!this.stepU(i, dt, sp)) {
      // blocked (lookahead/lane cut a corner): aim straight at the next cell's centre
      A.hd[i] = Math.atan2(ty + 0.5 - A.y[i], tx + 0.5 - A.x[i]);
      A.stuck[i] += dt;
      if (A.stuck[i] > 1.5) { this.unstick(i); A.stuck[i] = 0; }
    } else A.stuck[i] = Math.max(0, A.stuck[i] - dt);
    A.moving[i] = 1;
    return MOVING;
  },

  // Walk straight to a point underground (inside a chamber).
  goPointU(i, tx, ty, dt, r = 0.45) {
    const A = this.ants;
    const dx = tx - A.x[i], dy = ty - A.y[i];
    if (dx * dx + dy * dy < r * r) return ARRIVED;
    const want = Math.atan2(dy, dx);
    this.turnToward(i, want, 8, dt);
    if (!this.stepU(i, dt, this.antSpeed(i) * 0.8)) {
      A.hd[i] += (this.rng.next() - 0.5) * 2;
      A.stuck[i] += dt;
      if (A.stuck[i] > 2.5) { A.stuck[i] = 0; return ARRIVED; }
    }
    A.moving[i] = 1;
    return MOVING;
  },

  // Random amble inside the tunnels (resting/tending ants).
  wanderU(i, dt, speedMul = 0.35) {
    const A = this.ants;
    A.hd[i] += (this.rng.next() - 0.5) * 5 * dt;
    if (!this.stepU(i, dt, this.antSpeed(i) * speedMul)) A.hd[i] += Math.PI * (0.5 + this.rng.next());
    A.moving[i] = 1;
  },

  // Put an ant that ended up inside solid soil back into the nearest opening.
  unstick(i) {
    const A = this.ants, w = this.world;
    const x0 = A.x[i] | 0, y0 = A.y[i] | 0;
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (w.passable(x0 + dx, y0 + dy)) {
            A.x[i] = x0 + dx + 0.5; A.y[i] = y0 + dy + 0.5;
            return;
          }
        }
      }
    }
  },

  // ---- surface ----
  stepS(i, dt, speed) {
    const A = this.ants;
    const dist = speed * dt;
    let nx = A.x[i] + Math.cos(A.hd[i]) * dist;
    let nz = A.z[i] + Math.sin(A.hd[i]) * dist;
    const st = this.stones;
    for (let k = 0; k < st.length; k++) {
      const s = st[k];
      const dx = nx - s.x, dz = nz - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < s.r * s.r) {
        const d = Math.sqrt(d2) || 1;
        nx = s.x + dx / d * s.r; nz = s.z + dz / d * s.r;
        // slide around the stone, and keep going that way for a moment so the
        // steering doesn't flip back and forth against it
        if (A.stuck[i] <= 0) A.side[i] = angDiff(Math.atan2(dz, dx), A.hd[i]) > 0 ? 1 : -1;
        const side = A.side[i];
        A.hd[i] = Math.atan2(dz, dx) + side * Math.PI / 2;
        A.stuck[i] = 0.9;
      }
    }
    let bounced = false;
    if (nx < 1.2 || nx > W - 1.2) { A.hd[i] = Math.PI - A.hd[i]; nx = Math.max(1.2, Math.min(W - 1.2, nx)); bounced = true; }
    if (nz > -0.4 || nz < -SURF_D + 1.2) { A.hd[i] = -A.hd[i]; nz = Math.max(-SURF_D + 1.2, Math.min(-0.4, nz)); bounced = true; }
    A.x[i] = nx; A.z[i] = nz;
    A.y[i] = this.world.surfaceH(nx, nz);
    A.walk[i] += dist;
    A.moving[i] = 1;
    return !bounced;
  },

  goPointS(i, tx, tz, dt, r = 0.6, speedMul = 1) {
    const A = this.ants;
    const dx = tx - A.x[i], dz = tz - A.z[i];
    if (dx * dx + dz * dz < r * r) return ARRIVED;
    const want = Math.atan2(dz, dx) + (this.rng.next() - 0.5) * 0.25;
    this.turnToward(i, want, 6, dt);
    this.stepS(i, dt, this.antSpeed(i) * speedMul);
    return MOVING;
  },

  nearestEntrance(x, z) {
    let best = null, bd = Infinity;
    for (const e of this.entrances) {
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },

  // Head home on the surface: nest vector (path integration) blended with
  // pheromone trails, so returning ants converge onto shared highways.
  goHomeS(i, dt, layFood, strength = 1) {
    const A = this.ants, P = this.pher;
    const e = this.nearestEntrance(A.x[i], A.z[i]);
    const dx = e.x - A.x[i], dz = e.z - A.z[i];
    const d2 = dx * dx + dz * dz;
    if (d2 < 1.1 * 1.1) { this.enterNest(i, e); return ARRIVED; }
    const home = Math.atan2(dz, dx);
    if (((this.tick + i) & 1) === 0) {
      let best = 0, bestS = -1e9;
      for (let k = -1; k <= 1; k++) {
        const a = A.hd[i] + k * 0.55;
        const sx = A.x[i] + Math.cos(a) * 2.2, sz = A.z[i] + Math.sin(a) * 2.2;
        const f = P.sampleS(0, sx, sz), h = P.sampleS(1, sx, sz);
        if (f < 0) continue;
        const s = Math.min(f, 3) * 0.35 + Math.min(h, 3) * 0.25 + Math.cos(angDiff(a, home)) * 1.4;
        if (s > bestS) { bestS = s; best = a; }
      }
      A.tx[i] = best;
    }
    const target = d2 < 16 ? home : A.tx[i] + angDiff(A.tx[i], home) * 0.35;
    this.turnToward(i, target + (this.rng.next() - 0.5) * 0.3, 5, dt);
    this.stepS(i, dt, this.antSpeed(i));
    if (layFood) {
      const amt = strength * Math.max(0.12, Math.exp(-A.trail[i] / 55)) * 5 * dt;
      P.depositS(0, A.x[i], A.z[i], amt);
    }
    return MOVING;
  },

  enterNest(i, e) {
    const A = this.ants;
    A.surf[i] = 0;
    A.x[i] = e.cellX + 0.5 + (this.rng.next() - 0.5) * 0.6;
    A.y[i] = e.cellY + 0.5;
    A.z[i] = this.antZ(i);
    A.hd[i] = -Math.PI / 2;
    A.px[i] = A.x[i]; A.py[i] = A.y[i]; A.pz[i] = A.z[i];
  },

  emerge(i, e) {
    const A = this.ants;
    A.stuck[i] = 0;
    A.surf[i] = 1;
    A.x[i] = e.x + (this.rng.next() - 0.5) * 0.8;
    A.z[i] = e.z + (this.rng.next() - 0.5) * 0.6;
    A.y[i] = this.world.surfaceH(A.x[i], A.z[i]);
    A.hd[i] = this.rng.range(-Math.PI, 0) + (this.rng.next() < 0.5 ? 0 : Math.PI * 0.2);
    A.px[i] = A.x[i]; A.py[i] = A.y[i]; A.pz[i] = A.z[i];
    A.trail[i] = 0;
  },

  entranceAtCell(c) {
    for (const e of this.entrances) if (e.cellY * W + e.cellX === c || e.cellY * W + e.cellX + 1 === c) return e;
    // the exit field's sources are the entrance top cells; pick nearest
    return this.nearestEntrance(c % W, ENTRANCE_Z);
  },

  antZ(i) {
    return -0.35 - ((i * 0.6180339) % 1) * 1.7;
  },
};

export { angDiff };
