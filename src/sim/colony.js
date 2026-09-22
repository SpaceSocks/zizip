// Worker behaviour. Every ant runs a small state machine per task and picks
// tasks with a response-threshold model: colony-wide stimuli (food shortage,
// hungry brood, unfinished digging, corpses) are compared with each ant's own
// age-dependent thresholds. Nobody assigns work; labour divides itself.
import {
  W, TUNNEL, DAY, MINOR, MAJOR,
  T_IDLE, T_FORAGE, T_DIG, T_NURSE, T_CLEAN, T_DEFEND, T_EAT,
  I_DIRT, I_CORPSE, I_HUSK, I_SEED, I_PROTEIN, ITEM_FOOD, isFood,
  S_SURFACE, S_UNDER, S_CARRIED, S_STORED,
  R_QUEEN, R_BROOD, R_FOOD, R_WASTE, R_REST, F_CARCASS, SOURCE_ITEM, SOURCE_NAMES,
} from './constants.js';
import { NF_EXIT, NF_QUEEN, NF_BROOD, NF_FOOD, NF_WASTE, NF_REST, NF_DIG, NF_CELL, DX, DY } from './nav.js';
import { MOVING, ARRIVED, LOST, angDiff } from './movement.js';
import { P_FOOD, P_HOME, P_ALARM, U_ALARM, U_TRAFFIC } from './pheromones.js';
import { B_EGG, B_LARVA, B_PUPA } from './stores.js';

// sub-states
const F_EXIT = 0, F_SEARCH = 1, F_APPROACH = 2, F_CUT = 3, F_RETURN = 4, F_STORE = 5, F_DROP = 6, F_HOME = 7, F_DRAG = 8, F_ITEM = 9;
const D_GO = 0, D_DIG = 1, D_UP = 2, D_DUMP = 3, D_BACK = 4;
const N_GO = 0, N_TO = 1, N_CARRY = 2, N_PLACE = 3, N_FOOD = 4, N_TAKE = 5, N_GO2 = 6, N_FEED = 7, N_TEND = 8, N_NEAR = 9;
const C_GO = 0, C_EXIT = 1, C_SEEK = 2, C_HOME = 3, C_WASTE = 4, C_PLACE = 5, C_OUT = 6, C_MIDDEN = 7, C_BACK = 8;
const DF_GO = 0, DF_HUNT = 1, DF_BITE = 2, DF_BACK = 3;
const E_GO = 0, E_TAKE = 1;
const I_GO = 0, I_REST = 1, I_HOMEWARD = 2;

// nurse job types kept in ant.key while nursing
const J_MOVE = 1, J_LARVA = 2, J_QUEEN = 3, J_TEND = 4;

const SUB_TEXT = {
  [T_FORAGE]: ['Heading out', 'Searching for food', 'Approaching food', 'Cutting food', 'Returning with food', 'Carrying food to granary', 'Storing food', 'Returning empty-handed', 'Dragging prey', 'Picking up food'],
  [T_DIG]: ['Heading to dig site', 'Excavating', 'Hauling soil up', 'Dumping soil', 'Returning to dig'],
  [T_NURSE]: ['Going to brood', 'Collecting brood', 'Carrying brood', 'Placing brood', 'Fetching food', 'Taking food', 'Bringing food', 'Feeding', 'Tending brood', 'Bringing food'],
  [T_CLEAN]: ['Going to corpse', 'Heading out', 'Searching', 'Returning', 'Carrying to refuse', 'Dumping refuse', 'Carrying to midden', 'Dumping at midden', 'Returning'],
  [T_DEFEND]: ['Rushing to alarm', 'Hunting intruder', 'Attacking', 'Returning'],
  [T_EAT]: ['Going to granary', 'Eating'],
  [T_IDLE]: ['Going to rest', 'Resting', 'Heading home'],
};

export const colony = {
  activityText(i) {
    const A = this.ants;
    const t = SUB_TEXT[A.task[i]];
    if (A.pause[i] > 0 && A.task[i] !== T_DIG) return 'Antennating a nestmate';
    return t ? (t[A.sub[i]] || '') : '';
  },

  roleOf(i) {
    const A = this.ants;
    if (A.task[i] === T_FORAGE) {
      if (A.sub[i] === F_STORE || A.sub[i] === F_DROP) return 'Food transporter';
      return A.mem[i] ? 'Forager' : 'Scout';
    }
    if (A.task[i] === T_NURSE) return A.key[i] === J_QUEEN ? 'Queen attendant' : A.key[i] === J_MOVE ? 'Brood carrier' : 'Nurse';
    return ['Resting', 'Forager', 'Excavator', 'Nurse', 'Cleaner', 'Defender', 'Feeding'][A.task[i]] || '';
  },

  // ------------------------------------------------------------------
  spawnWorker(x, y, ageDays, caste = MINOR) {
    const A = this.ants, r = this.rng;
    const i = A.alloc();
    if (i < 0) return -1;
    A.x[i] = A.px[i] = x; A.y[i] = A.py[i] = y; A.z[i] = A.pz[i] = this.antZ(i);
    A.hd[i] = r.range(-Math.PI, Math.PI);
    A.caste[i] = caste;
    A.age[i] = ageDays;
    A.life[i] = caste === MAJOR ? r.range(22, 40) : r.range(14, 30);
    A.energy[i] = r.range(0.6, 1);
    A.health[i] = 1;
    A.lane[i] = r.range(0.35, 1);
    A.thF[i] = r.range(0.55, 1.45); A.thN[i] = r.range(0.55, 1.45);
    A.thD[i] = r.range(0.55, 1.45); A.thC[i] = r.range(0.55, 1.45);
    A.task[i] = T_IDLE; A.sub[i] = I_REST; A.timer[i] = r.range(1, 5);
    return i;
  },

  kill(i, cause) {
    const A = this.ants, It = this.items;
    if (!A.alive[i]) return;
    this.dropCarried(i);
    this.releaseClaims(i);
    const k = It.alloc(I_CORPSE, A.surf[i] ? S_SURFACE : S_UNDER);
    if (k >= 0) {
      It.x[k] = A.x[i]; It.y[k] = A.y[i]; It.z[k] = A.z[i]; It.rot[k] = A.hd[i];
      if (!A.surf[i]) this.settleUnder(k);
      else It.y[k] = this.world.surfaceH(It.x[k], It.z[k]);
      It.age[k] = A.caste[i];   // remember caste for the corpse model
      this.corpses.push(k);
    }
    this.stats.deaths[cause] = (this.stats.deaths[cause] || 0) + 1;
    this.stats.totalDeaths++;
    if (this.selected === i) this.selectedDied = { id: A.id[i], cause };
    A.release(i);
  },

  releaseClaims(i) {
    const A = this.ants, B = this.brood, It = this.items;
    if (A.task[i] === T_NURSE) {
      const b = A.tgt[i];
      if (A.key[i] === J_MOVE || A.key[i] === J_LARVA) {
        if (b >= 0 && B.alive[b] && B.claim[b] === i) B.claim[b] = -1;
        if (b >= 0 && B.alive[b] && B.carrier[b] === i) this.dropBrood(i, b);
      }
      if (A.key[i] === J_QUEEN && this.queen.claim === i) this.queen.claim = -1;
    }
    if (A.task[i] === T_CLEAN || (A.task[i] === T_FORAGE && A.sub[i] === F_ITEM)) {
      const k = A.tgt[i];
      if (k >= 0 && It.claim[k] === i) It.claim[k] = -1;
    }
    if (A.task[i] === T_FORAGE && A.sub[i] === F_DRAG) {
      const s = this.sourceById(A.tgt[i]);
      if (s) s.attached = Math.max(0, s.attached - 1);
    }
  },

  // put an underground item on the tunnel floor
  settleUnder(k) {
    const It = this.items, w = this.world;
    let x = It.x[k] | 0, y = It.y[k] | 0;
    let n = 0;
    while (y > 1 && w.type[(y - 1) * W + x] === TUNNEL && n++ < 6) y--;
    It.y[k] = y + 0.28 + (this.rng.next() * 0.1);
    It.z[k] = -0.5 - this.rng.next() * 1.4;
  },

  pickup(i, k) {
    const It = this.items;
    It.state[k] = S_CARRIED;
    It.owner[k] = i;
    It.claim[k] = -1;
    this.ants.carry[i] = k;
    if (It.chamber[k] >= 0) this.unstack(k);
  },

  dropCarried(i) {
    const A = this.ants, It = this.items;
    const k = A.carry[i];
    if (k < 0) return;
    A.carry[i] = -1;
    It.owner[k] = -1;
    It.x[k] = A.x[i]; It.y[k] = A.y[i]; It.z[k] = A.z[i];
    if (A.surf[i]) {
      It.state[k] = S_SURFACE;
      It.y[k] = this.world.surfaceH(It.x[k], It.z[k]);
      if (isFood(It.kind[k])) this.surfFood.push(k);
      if (It.kind[k] === I_CORPSE) this.corpses.push(k);
      if (It.kind[k] === I_DIRT) { this.world.depositDirt(It.x[k], It.z[k]); It.release(k); }
    } else {
      It.state[k] = S_UNDER;
      this.settleUnder(k);
      if (It.kind[k] === I_DIRT) { It.release(k); return; } // backfilled
      const ch = this.chamberAt(It.x[k], It.y[k]);
      if (ch && isFood(It.kind[k]) && (ch.role & (R_FOOD | R_QUEEN))) this.storeItem(k, ch, -1);
      else this.corpses.push(k);   // litter: cleaners will tidy it away
    }
  },

  dropBrood(i, b) {
    const A = this.ants, B = this.brood;
    B.carried[b] = 0; B.carrier[b] = -1; B.claim[b] = -1;
    B.x[b] = A.x[i]; B.y[b] = A.y[i];
    const c = (A.y[i] | 0) * W + (A.x[i] | 0);
    B.chamber[b] = this.world.chamberOf[c];
    B.cell[b] = -1;
    // lie on the floor
    let y = A.y[i] | 0, x = A.x[i] | 0, n = 0;
    while (y > 1 && this.world.type[(y - 1) * W + x] === TUNNEL && n++ < 6) y--;
    B.y[b] = y + 0.3;
  },

  // ------------------------------------------------------------------
  // Task choice (response thresholds)
  decide(i) {
    const A = this.ants, r = this.rng, N = this.need;
    A.timer[i] = 0; A.sub[i] = 0; A.tgt[i] = -1; A.key[i] = -1;
    if (A.surf[i]) { A.task[i] = T_IDLE; A.sub[i] = I_HOMEWARD; return; }
    if (A.energy[i] < 0.32 && this.stock.total > 0.5) { A.task[i] = T_EAT; return; }
    const alarm = this.pher.sampleU(U_ALARM, A.x[i], A.y[i]);
    if (alarm > 0.4 && (A.caste[i] === MAJOR || r.chance(0.35))) { this.startDefend(i); return; }

    const af = Math.min(1, A.age[i] / A.life[i]);
    let thF = A.thF[i] * (1.25 - 1.1 * af);
    let thN = A.thN[i] * (0.12 + 1.1 * af);
    let thD = A.thD[i] * 0.5;
    let thC = A.thC[i] * 0.45;
    if (A.caste[i] === MAJOR) { thN *= 3; thD *= 0.7; thF *= 0.9; }
    if (A.mem[i] && N.forage > 0.05) thF *= 0.35;   // site fidelity
    const tasks = this.taskOrder;
    for (let k = 3; k > 0; k--) { const j = r.int(0, k); const t = tasks[k]; tasks[k] = tasks[j]; tasks[j] = t; }
    for (const t of tasks) {
      let s, th;
      if (t === T_FORAGE) { s = N.forage; th = thF; }
      else if (t === T_NURSE) { s = N.nurse; th = thN; }
      else if (t === T_DIG) { s = N.dig; th = thD; }
      else { s = N.clean; th = thC; }
      th = Math.max(0.05, th);
      const p = (s * s) / (s * s + th * th);
      if (r.next() < p) {
        if (t === T_FORAGE) { A.task[i] = T_FORAGE; A.sub[i] = F_EXIT; return; }
        if (t === T_DIG) { A.task[i] = T_DIG; A.sub[i] = D_GO; return; }
        if (t === T_NURSE && this.startNurse(i)) return;
        if (t === T_CLEAN && this.startClean(i)) return;
      }
    }
    A.task[i] = T_IDLE; A.sub[i] = I_GO; A.timer[i] = 0;
  },

  endTask(i) {
    this.decide(i);
  },

  // ------------------------------------------------------------------
  updateAnt(i, dt, think) {
    const A = this.ants;
    switch (A.task[i]) {
      case T_FORAGE: this.doForage(i, dt, think); break;
      case T_DIG: this.doDig(i, dt, think); break;
      case T_NURSE: this.doNurse(i, dt, think); break;
      case T_CLEAN: this.doClean(i, dt, think); break;
      case T_DEFEND: this.doDefend(i, dt, think); break;
      case T_EAT: this.doEat(i, dt, think); break;
      default: this.doIdle(i, dt, think);
    }
    // hunger interrupt: eat what you carry, or go to the granary
    if (think && A.energy[i] < 0.15 && A.task[i] !== T_EAT) {
      const k = A.carry[i];
      if (k >= 0 && isFood(this.items.kind[k])) { A.carry[i] = -1; this.consume(i, k); }
      else if (!A.surf[i] && this.stock.total > 0.5 && A.carry[i] < 0) { this.releaseClaims(i); A.task[i] = T_EAT; A.sub[i] = 0; A.timer[i] = 0; }
    }
    // interrupt: alarm nearby underground pulls workers into defence
    if (think && !A.surf[i] && A.task[i] !== T_DEFEND && A.carry[i] < 0 && A.task[i] !== T_NURSE) {
      const al = this.pher.sampleU(U_ALARM, A.x[i], A.y[i]);
      if (al > 1.2 && (A.caste[i] === MAJOR || this.rng.chance(0.25))) { this.releaseClaims(i); this.startDefend(i); }
    }
  },

  // ---------------- IDLE ----------------
  doIdle(i, dt, think) {
    const A = this.ants;
    if (A.sub[i] === I_HOMEWARD) {
      if (!A.surf[i]) { this.decide(i); return; }
      if (this.goHomeS(i, dt, false) === ARRIVED) this.decide(i);
      return;
    }
    if (A.sub[i] === I_GO) {
      const f = this.hasField[NF_REST] ? NF_REST : NF_QUEEN;
      const res = this.goField(i, f, 0, dt);
      A.timer[i] += dt;
      if (res !== MOVING || A.timer[i] > 25) {
        A.sub[i] = I_REST;
        A.timer[i] = this.rng.range(4, 14);
      }
      return;
    }
    // resting: mostly still, occasional shuffle
    A.timer[i] -= dt;
    // the queen's retinue: rested ants near a hungry queen go and feed her
    const q = this.queen;
    if (think && q.alive && q.fed < 0.5 && q.claim < 0 && this.stock.total > 0.5 && Math.abs(A.x[i] - q.x) + Math.abs(A.y[i] - q.y) < 14) {
      q.claim = i; A.task[i] = T_NURSE; A.key[i] = J_QUEEN; A.sub[i] = N_FOOD; A.timer[i] = 0; A.tgt[i] = -1;
      return;
    }
    if (this.rng.next() < 0.25 * dt) A.pause[i] = this.rng.range(1, 4);
    else this.wanderU(i, dt, 0.25);
    if (A.timer[i] <= 0) this.decide(i);
  },

  // ---------------- EAT ----------------
  doEat(i, dt) {
    const A = this.ants;
    if (A.sub[i] === E_GO) {
      const res = this.goField(i, NF_FOOD, 0, dt);
      if (res === ARRIVED) {
        const ch = this.chamberAt(A.x[i], A.y[i]);
        const k = ch ? this.takeStored(ch, false) : -1;
        if (k < 0) {
          const k2 = this.takeAnyStored(false);
          if (k2 < 0) { this.decide(i); A.task[i] = T_IDLE; return; }
          this.consume(i, k2);
        } else this.consume(i, k);
        A.sub[i] = E_TAKE; A.timer[i] = 2.5; A.moving[i] = 2;
      } else if (res === LOST) this.decide(i);
      return;
    }
    A.timer[i] -= dt; A.moving[i] = 2;
    if (A.timer[i] <= 0) this.decide(i);
  },

  consume(i, k) {
    const A = this.ants, It = this.items;
    const [c, p] = ITEM_FOOD[It.kind[k]];
    A.energy[i] = Math.min(1, A.energy[i] + (c + p) * 0.75);
    A.health[i] = Math.min(1, A.health[i] + 0.2);
    this.stock.eaten += c + p;
    It.release(k);
  },

  // ---------------- FORAGE ----------------
  doForage(i, dt, think) {
    const A = this.ants, r = this.rng, P = this.pher;
    switch (A.sub[i]) {
      case F_EXIT: {
        const res = this.goField(i, NF_EXIT, 0, dt);
        if (res === ARRIVED) { this.emerge(i, this.entranceAtCell((A.y[i] | 0) * W + (A.x[i] | 0))); A.sub[i] = F_SEARCH; A.timer[i] = 0; }
        else if (res === LOST) { A.task[i] = T_IDLE; A.sub[i] = I_REST; A.timer[i] = 3; }
        return;
      }
      case F_SEARCH: {
        if (!A.surf[i]) { A.sub[i] = F_EXIT; return; }
        A.timer[i] += dt; A.trail[i] += dt;
        // outbound ants lay a faint home trail
        P.depositS(P_HOME, A.x[i], A.z[i], Math.max(0.05, Math.exp(-A.trail[i] / 50)) * 1.2 * dt);
        this.forageSteer(i, dt);
        if (think) {
          if (this.lookForFood(i)) return;
          if (this.checkThreat(i)) return;
          const giveUp = A.timer[i] > 90 + A.thF[i] * 40 || A.energy[i] < 0.2 ||
            (this.isNight() && A.timer[i] > 30) || this.weather.rain > 0.35;
          if (giveUp) { A.sub[i] = F_HOME; if (A.timer[i] > 90) A.mem[i] = 0; }
        }
        return;
      }
      case F_APPROACH: {
        const s = this.sourceById(A.tgt[i]);
        if (!s || !s.alive) { A.sub[i] = F_SEARCH; A.mem[i] = 0; return; }
        const res = this.goPointS(i, s.x, s.z, dt, s.r + 0.3);
        if (res === ARRIVED) {
          if (s.kind === F_CARCASS && !s.atNest) {
            A.sub[i] = F_DRAG; s.attached++; A.timer[i] = 0;
            A.tx[i] = r.range(-Math.PI, Math.PI);
          } else { A.sub[i] = F_CUT; A.timer[i] = r.range(1.2, 2.6); }
          if (!s.found) this.discovered(i, s);
        }
        return;
      }
      case F_CUT: {
        A.timer[i] -= dt; A.moving[i] = 2;
        if (A.energy[i] < 0.5 && A.timer[i] > 0.5) A.energy[i] = Math.min(1, A.energy[i] + dt * 0.1);
        if (A.timer[i] > 0) return;
        const s = this.sourceById(A.tgt[i]);
        if (!s || !s.alive) { A.sub[i] = F_SEARCH; A.mem[i] = 0; return; }
        const kind = this.takeFromSource(s);
        const k = this.items.alloc(kind, S_CARRIED);
        if (k >= 0) this.pickup(i, k);
        A.mem[i] = 1; A.memX[i] = s.x; A.memZ[i] = s.z;
        A.trail[i] = 0; A.sub[i] = F_RETURN;
        A.hd[i] += Math.PI;
        A.tgt[i] = s.quality * 100 | 0;
        return;
      }
      case F_ITEM: {
        const k = A.tgt[i], It = this.items;
        if (k < 0 || It.state[k] !== S_SURFACE || It.claim[k] !== i) { A.sub[i] = F_SEARCH; return; }
        if (this.goPointS(i, It.x[k], It.z[k], dt, 0.5) === ARRIVED) {
          this.removeSurfFood(k);
          this.pickup(i, k);
          A.trail[i] = 0; A.sub[i] = F_RETURN; A.tgt[i] = 60;
          A.mem[i] = 1; A.memX[i] = It.x[k]; A.memZ[i] = It.z[k];
          A.hd[i] += Math.PI;
        }
        return;
      }
      case F_DRAG: {
        const s = this.sourceById(A.tgt[i]);
        A.timer[i] += dt; A.moving[i] = 2;
        if (!s || !s.alive) { A.sub[i] = F_SEARCH; return; }
        if (s.atNest) { s.attached = Math.max(0, s.attached - 1); A.sub[i] = F_CUT; A.timer[i] = r.range(0.8, 2); return; }
        // hold on to the prey at a spot around its edge
        const a = A.tx[i];
        A.x[i] = s.x + Math.cos(a) * (s.r + 0.35);
        A.z[i] = s.z + Math.sin(a) * (s.r + 0.35);
        A.y[i] = this.world.surfaceH(A.x[i], A.z[i]);
        A.hd[i] = a + Math.PI;
        A.walk[i] += s.moved * 1.5;
        if (A.timer[i] > 40) { s.attached = Math.max(0, s.attached - 1); A.sub[i] = F_CUT; A.timer[i] = 2; }
        return;
      }
      case F_RETURN: {
        A.trail[i] += dt;
        const q = (A.tgt[i] >= 0 ? A.tgt[i] : 60) / 100;
        if (this.goHomeS(i, dt, true, q) === ARRIVED) { A.sub[i] = F_STORE; A.timer[i] = 0; }
        return;
      }
      case F_STORE: {
        if (A.surf[i]) { A.sub[i] = F_RETURN; return; }
        const res = this.goField(i, NF_FOOD, 0, dt);
        if (res === ARRIVED) {
          const ch = this.chamberAt(A.x[i], A.y[i]);
          if (!ch) { this.dropCarried(i); this.decide(i); return; }
          const spot = this.stackSpot(ch);
          A.tx[i] = spot.x; A.ty[i] = spot.y; A.tgt[i] = ch.id; A.key[i] = spot.cell;
          A.sub[i] = F_DROP;
        } else if (res === LOST) { this.dropCarried(i); this.decide(i); }
        return;
      }
      case F_DROP: {
        if (this.goPointU(i, A.tx[i], A.ty[i] - 0.1, dt, 0.7) === ARRIVED) {
          const ch = this.chambers[A.tgt[i]];
          const k = A.carry[i];
          if (k >= 0 && ch) { A.carry[i] = -1; this.storeItem(k, ch, A.key[i]); }
          else this.dropCarried(i);
          A.key[i] = -1;
          // keep going if we know a good source and the colony needs food
          this.stats.delivered = (this.stats.delivered || 0) + 1;
          if (A.mem[i] && this.need.forage > 0.08 && A.energy[i] > 0.4 && !this.isNight() && this.rng.chance(0.85)) { A.sub[i] = F_EXIT; A.tgt[i] = -1; }
          else this.decide(i);
        }
        return;
      }
      case F_HOME: {
        if (!A.surf[i]) { this.decide(i); return; }
        if (this.goHomeS(i, dt, false) === ARRIVED) this.decide(i);
        if (think) this.lookForFood(i);
        return;
      }
    }
  },

  // Pheromone-guided searching on the surface.
  forageSteer(i, dt) {
    const A = this.ants, P = this.pher, r = this.rng;
    if (((this.tick + i) & 1) === 0) {
      let bestA = A.hd[i], bestS = -1e9, total = 0;
      const memDir = A.mem[i] ? Math.atan2(A.memZ[i] - A.z[i], A.memX[i] - A.x[i]) : 0;
      for (let k = -1; k <= 1; k++) {
        const a = A.hd[i] + k * 0.6;
        const sx = A.x[i] + Math.cos(a) * 2.4, sz = A.z[i] + Math.sin(a) * 2.4;
        const f = P.sampleS(P_FOOD, sx, sz);
        if (f < 0) continue;
        total += f;
        let s = Math.min(f, 4) + r.next() * 0.15;
        if (A.mem[i]) s += Math.cos(angDiff(a, memDir)) * 0.9;
        if (s > bestS) { bestS = s; bestA = a; }
      }
      const here = P.sampleS(P_FOOD, A.x[i], A.z[i]);
      if (total > 0.08 || A.mem[i]) {
        A.tx[i] = bestA;
        // walking down the gradient towards home? turn around
        if (!A.mem[i] && here > 0.3 && total / 3 < here * 0.55 && r.chance(0.2)) A.tx[i] = A.hd[i] + Math.PI;
      } else {
        A.tx[i] = A.hd[i] + r.gauss() * 0.9;
      }
      // don't search forever near the entrance
      const e = this.entrances[0];
      if (A.timer[i] < 6 && Math.hypot(A.x[i] - e.x, A.z[i] - e.z) < 3) A.tx[i] = Math.atan2(A.z[i] - e.z, A.x[i] - e.x) + r.gauss() * 0.6;
    }
    this.turnToward(i, A.tx[i], 4, dt);
    this.stepS(i, dt, this.antSpeed(i) * (A.mem[i] ? 1 : 0.85));
    // reached remembered spot but nothing here -> forget
    if (A.mem[i] && (A.memX[i] - A.x[i]) ** 2 + (A.memZ[i] - A.z[i]) ** 2 < 2.5) {
      A.mem[i] = 0;
    }
  },

  lookForFood(i) {
    const A = this.ants, It = this.items;
    if (A.carry[i] >= 0) return false;
    const x = A.x[i], z = A.z[i];
    let best = null, bd = 4.2 * 4.2;
    for (const s of this.sources) {
      if (!s.alive) continue;
      const rr = (s.r + 3.6) ** 2;
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < rr && d < bd + s.r * s.r) { bd = d; best = s; }
    }
    if (best) { A.tgt[i] = best.id; A.sub[i] = F_APPROACH; return true; }
    let bk = -1; bd = 4.2 * 4.2;
    for (let n = 0; n < this.surfFood.length; n++) {
      const k = this.surfFood[n];
      if (It.claim[k] >= 0) continue;
      const d = (It.x[k] - x) ** 2 + (It.z[k] - z) ** 2;
      if (d < bd) { bd = d; bk = k; }
    }
    if (bk >= 0) { It.claim[bk] = i; A.tgt[i] = bk; A.sub[i] = F_ITEM; return true; }
    return false;
  },

  // Surface ants that meet an intruder raise the alarm and either fight or run.
  checkThreat(i) {
    const A = this.ants;
    for (const c of this.creatures) {
      if (!c.alive || !c.hostile) continue;
      const d2 = (c.x - A.x[i]) ** 2 + (c.z - A.z[i]) ** 2;
      if (d2 < (c.r + 4) ** 2) {
        this.pher.depositS(P_ALARM, A.x[i], A.z[i], 4);
        const allies = this.pher.sampleS(P_ALARM, c.x, c.z);
        if (A.caste[i] === MAJOR || allies > 2.5 || this.rng.chance(0.3)) {
          A.task[i] = T_DEFEND; A.sub[i] = DF_HUNT; A.tgt[i] = c.id; A.timer[i] = 0;
        } else {
          A.hd[i] = Math.atan2(A.z[i] - c.z, A.x[i] - c.x);
          A.task[i] = T_IDLE; A.sub[i] = I_HOMEWARD;
        }
        return true;
      }
    }
    return false;
  },

  discovered(i, s) {
    s.found = true;
    const A = this.ants;
    const e = this.entrances[0];
    const dist = Math.hypot(s.x - e.x, s.z - e.z);
    const who = A.mem[i] ? 'Forager' : 'Scout';
    this.logEvent(`${who} #${A.id[i]} discovered ${s.article} ${SOURCE_NAMES[s.kind].toLowerCase()} ${Math.round(dist * 3)} mm from the nest`, 'food', { ant: i });
  },

  // ---------------- DIG ----------------
  doDig(i, dt, think) {
    const A = this.ants, w = this.world, r = this.rng;
    switch (A.sub[i]) {
      case D_GO: {
        if (A.surf[i]) { if (this.goHomeS(i, dt, false) !== ARRIVED) return; }
        if (!this.hasField[NF_DIG]) {
          if (think && !this.tryPlan(i)) { A.task[i] = T_IDLE; A.sub[i] = I_REST; A.timer[i] = r.range(3, 8); }
          else this.wanderU(i, dt, 0.4);
          return;
        }
        const res = this.goField(i, NF_DIG, 0, dt);
        if (res === ARRIVED) {
          const c = this.findDigCell(i);
          if (c < 0) { this.wanderU(i, dt); if (think) A.timer[i] += 1; if (A.timer[i] > 4) this.decide(i); return; }
          A.key[i] = c; A.sub[i] = D_DIG; A.timer[i] = 0;
          A.hd[i] = Math.atan2(((c / W) | 0) + 0.5 - A.y[i], (c % W) + 0.5 - A.x[i]);
        } else if (res === LOST) { A.timer[i] += dt; this.wanderU(i, dt); if (A.timer[i] > 3) this.decide(i); }
        return;
      }
      case D_DIG: {
        const c = A.key[i];
        A.moving[i] = 2;
        if (w.type[c] === TUNNEL) { A.sub[i] = D_GO; return; }
        w.dig[c] += dt;
        this.pher.depositU(U_TRAFFIC, A.x[i], A.y[i], dt * 0.5);
        if (w.dig[c] >= w.digTime(c % W, (c / W) | 0)) {
          this.excavate(c);
          const k = this.items.alloc(I_DIRT, S_CARRIED);
          if (k >= 0) this.pickup(i, k);
          A.sub[i] = D_UP; A.timer[i] = 0;
        }
        return;
      }
      case D_UP: {
        const res = this.goField(i, NF_EXIT, 0, dt);
        if (res === ARRIVED) {
          this.emerge(i, this.entranceAtCell((A.y[i] | 0) * W + (A.x[i] | 0)));
          const e = this.nearestEntrance(A.x[i], A.z[i]);
          // crater ring: soil is dropped a short walk from the mouth
          const a = r.range(-Math.PI, Math.PI);
          const rad = r.range(2.2, 4.5) + Math.sqrt(w.dirtDeposited) * 0.05;
          A.tx[i] = e.x + Math.cos(a) * rad;
          A.ty[i] = Math.min(-0.5, Math.max(-12, e.z + Math.sin(a) * rad * 0.8));
          A.sub[i] = D_DUMP;
        } else if (res === LOST) { this.dropCarried(i); this.decide(i); }
        return;
      }
      case D_DUMP: {
        if (this.goPointS(i, A.tx[i], A.ty[i], dt, 0.5) === ARRIVED) {
          this.dropCarried(i);
          A.sub[i] = D_BACK;
        }
        return;
      }
      case D_BACK: {
        if (this.goHomeS(i, dt, false) === ARRIVED) {
          if (this.need.dig > 0.2 && A.energy[i] > 0.4 && r.chance(0.55)) { A.sub[i] = D_GO; A.timer[i] = 0; }
          else this.decide(i);
        }
        return;
      }
    }
  },

  findDigCell(i) {
    const A = this.ants, w = this.world;
    const x = A.x[i] | 0, y = A.y[i] | 0;
    let best = -1, bs = 1e9;
    for (let n = 0; n < 8; n++) {
      const nx = x + DX[n], ny = y + DY[n];
      if (nx < 1 || ny < 1 || nx >= W - 1) continue;
      const c = ny * W + nx;
      if (w.mark[c] < 0 || !w.diggable(w.type[c])) continue;
      const plan = this.plans[w.mark[c]];
      const s = (plan ? plan.order.get(c) || 0 : 0) + (n >= 4 ? 3 : 0) + this.rng.next() * 4;
      if (s < bs) { bs = s; best = c; }
    }
    return best;
  },

  // ---------------- NURSE ----------------
  startNurse(i) {
    const A = this.ants, L = this.lists, B = this.brood, r = this.rng, q = this.queen;
    const opts = [];
    if (L.moveBrood.length) opts.push(J_MOVE, J_MOVE);
    if (L.hungryLarvae.length && this.stock.total > 0) opts.push(J_LARVA, J_LARVA, J_LARVA);
    if (q.alive && q.fed < 0.65 && q.claim < 0 && this.stock.total > 0) opts.push(J_QUEEN, J_QUEEN);
    if (B.count > 0) opts.push(J_TEND);
    if (!opts.length) return false;
    const job = r.pick(opts);
    A.task[i] = T_NURSE; A.key[i] = job; A.timer[i] = 0;
    if (job === J_MOVE || job === J_LARVA) {
      const list = job === J_MOVE ? L.moveBrood : L.hungryLarvae;
      let b = -1;
      for (let n = 0; n < 6 && list.length; n++) {
        const j = r.int(0, list.length - 1);
        const c = list[j];
        list[j] = list[list.length - 1]; list.pop();
        if (B.alive[c] && B.claim[c] < 0 && !B.carried[c]) { b = c; break; }
      }
      if (b < 0) { A.key[i] = J_TEND; A.sub[i] = N_TEND; A.timer[i] = r.range(6, 14); return true; }
      B.claim[b] = i; A.tgt[i] = b;
      A.sub[i] = job === J_MOVE ? N_GO : N_FOOD;
      return true;
    }
    if (job === J_QUEEN) { q.claim = i; A.sub[i] = N_FOOD; return true; }
    A.sub[i] = N_TEND; A.timer[i] = r.range(6, 16);
    return true;
  },

  goChamber(i, ch, dt) {
    const A = this.ants;
    const c = (A.y[i] | 0) * W + (A.x[i] | 0);
    if (this.world.chamberOf[c] === ch.id && this.world.type[c] === TUNNEL) return ARRIVED;
    if (ch.anchor < 0) return LOST;
    const res = this.goField(i, NF_CELL, ch.anchor, dt);
    return res;
  },

  doNurse(i, dt, think) {
    const A = this.ants, B = this.brood, r = this.rng, q = this.queen;
    const b = A.tgt[i];
    const job = A.key[i];
    if (A.surf[i]) { this.releaseClaims(i); A.task[i] = T_IDLE; A.sub[i] = I_HOMEWARD; return; }
    switch (A.sub[i]) {
      case N_GO: { // go to the brood item's chamber
        if (!B.alive[b] || B.claim[b] !== i) { this.decide(i); return; }
        const ch = this.chambers[B.chamber[b]];
        let res;
        if (ch) res = this.goChamber(i, ch, dt);
        else {
          const bc = (B.y[b] | 0) * W + (B.x[b] | 0);
          res = this.world.type[bc] === TUNNEL ? this.goField(i, NF_CELL, bc, dt) : LOST;
          if (Math.abs(A.x[i] - B.x[b]) + Math.abs(A.y[i] - B.y[b]) < 2.5) res = ARRIVED;
        }
        if (res === ARRIVED) A.sub[i] = N_TO;
        else if (res === LOST) { B.claim[b] = -1; this.decide(i); }
        return;
      }
      case N_TO: {
        if (!B.alive[b] || B.claim[b] !== i) { this.decide(i); return; }
        if (this.goPointU(i, B.x[b], B.y[b] + 0.2, dt, 0.8) === ARRIVED) {
          if (job === J_MOVE) {
            B.carried[b] = 1; B.carrier[b] = i;
            this.unstackBrood(b);
            A.sub[i] = N_CARRY;
          } else { A.sub[i] = N_FEED; A.timer[i] = 1.6; }
        }
        return;
      }
      case N_CARRY: {
        if (!B.alive[b]) { this.decide(i); return; }
        const dest = this.broodDest(b);
        const res = dest ? this.goChamber(i, dest, dt) : this.goField(i, NF_BROOD, 0, dt);
        if (res === ARRIVED) {
          const ch = dest || this.chamberAt(A.x[i], A.y[i]);
          if (!ch) { this.dropBrood(i, b); this.decide(i); return; }
          const spot = this.stackSpot(ch, true);
          A.tx[i] = spot.x; A.ty[i] = spot.y; A.sub[i] = N_PLACE; A.timer[i] = spot.cell;
        } else if (res === LOST) { this.dropBrood(i, b); this.decide(i); }
        return;
      }
      case N_PLACE: {
        if (!B.alive[b]) { this.decide(i); return; }
        if (this.goPointU(i, A.tx[i], A.ty[i], dt, 0.7) === ARRIVED) {
          const ch = this.chamberAt(A.x[i], A.y[i]) || this.chamberAt(A.tx[i], A.ty[i]);
          B.carried[b] = 0; B.carrier[b] = -1; B.claim[b] = -1;
          if (ch) this.placeBrood(b, ch, A.timer[i] | 0);
          else this.dropBrood(i, b);
          this.decide(i);
        }
        return;
      }
      case N_FOOD: {
        if (job === J_LARVA && (!B.alive[b] || B.claim[b] !== i)) { this.decide(i); return; }
        if (job === J_QUEEN && (!q.alive || q.claim !== i)) { this.decide(i); return; }
        // the queen is often fed from the royal chamber's own larder
        if (job === J_QUEEN) {
          const qc = this.chambers[q.chamber];
          if (qc && qc.items.length && A.timer[i] >= 0) {
            const res = this.goChamber(i, qc, dt);
            if (res === ARRIVED) { const k = this.takeStored(qc, false); if (k >= 0) { this.pickup(i, k); A.sub[i] = N_GO2; } else A.timer[i] = -1; }
            else if (res === LOST) { q.claim = -1; this.decide(i); }
            return;
          }
        }
        const res = this.goField(i, NF_FOOD, 0, dt);
        if (res === ARRIVED) {
          const ch = this.chamberAt(A.x[i], A.y[i]);
          let k = ch ? this.takeStored(ch, job === J_LARVA) : -1;
          if (k < 0) k = this.takeAnyStored(job === J_LARVA);
          if (k < 0) { this.releaseClaims(i); this.decide(i); return; }
          this.pickup(i, k);
          A.sub[i] = N_GO2;
        } else if (res === LOST) { this.releaseClaims(i); this.decide(i); }
        return;
      }
      case N_GO2: {
        let ch;
        if (job === J_QUEEN) { if (!q.alive) { this.dropCarried(i); this.decide(i); return; } ch = this.chambers[q.chamber]; }
        else { if (!B.alive[b]) { this.dropCarried(i); this.decide(i); return; } ch = this.chambers[B.chamber[b]]; }
        const res = ch ? this.goChamber(i, ch, dt) : ARRIVED;
        if (res === ARRIVED) A.sub[i] = N_NEAR;
        else if (res === LOST) { this.dropCarried(i); this.releaseClaims(i); this.decide(i); }
        return;
      }
      case N_NEAR: { // walk up to the patient
        const tx = job === J_QUEEN ? q.x : B.x[b], ty = job === J_QUEEN ? q.y : B.y[b] + 0.2;
        if (job !== J_QUEEN && !B.alive[b]) { this.dropCarried(i); this.decide(i); return; }
        if (this.goPointU(i, tx, ty, dt, job === J_QUEEN ? 1.6 : 0.8) === ARRIVED) { A.sub[i] = N_FEED; A.timer[i] = 1.8; }
        return;
      }
      case N_FEED: {
        A.timer[i] -= dt; A.moving[i] = 2;
        if (A.timer[i] > 0) return;
        const k = A.carry[i];
        if (k >= 0) {
          const [c, p] = ITEM_FOOD[this.items.kind[k]];
          if (job === J_QUEEN) {
            q.fed = Math.min(1.2, q.fed + (c + p) * 0.4);
            q.protein = Math.min(1, q.protein + p * 0.5);
            if (q.claim === i) q.claim = -1;
          } else if (B.alive[b]) {
            B.fed[b] += c * 0.5 + p;
            B.protein[b] += p;
            B.claim[b] = -1;
          }
          this.stock.eaten += c + p;
          A.carry[i] = -1;
          this.items.release(k);
        }
        this.decide(i);
        return;
      }
      case N_TEND: {
        // linger around the brood, grooming
        if (!this.hasField[NF_BROOD]) { this.decide(i); return; }
        const c = (A.y[i] | 0) * W + (A.x[i] | 0);
        const ch = this.chambers[this.world.chamberOf[c]];
        if (!ch || !(ch.role & (R_BROOD | R_QUEEN))) { if (this.goField(i, NF_BROOD, 0, dt) === LOST) this.decide(i); return; }
        A.timer[i] -= dt;
        if (r.next() < 0.6 * dt) { A.pause[i] = r.range(0.8, 2.5); A.moving[i] = 2; }
        else this.wanderU(i, dt, 0.3);
        if (A.timer[i] <= 0) this.decide(i);
        return;
      }
      default:
        this.releaseClaims(i); this.decide(i);
    }
  },

  // where should this brood item live?
  broodDest(b) {
    const B = this.brood;
    let best = null, bd = 1e9;
    const src = this.chambers[B.chamber[b]];
    for (const ch of this.chambers) {
      if (!ch.active || !(ch.role & R_BROOD) || ch.flooded) continue;
      const d = src ? Math.hypot(ch.cx - src.cx, ch.cy - src.cy) : 0;
      const crowd = ch.broodCount / Math.max(1, ch.capacity);
      const s = d + crowd * 40;
      if (s < bd) { bd = s; best = ch; }
    }
    return best;
  },

  // ---------------- CLEAN ----------------
  startClean(i) {
    const A = this.ants, It = this.items;
    let best = -1, bd = 1e9;
    for (const k of this.corpses) {
      if (It.state[k] !== S_SURFACE && It.state[k] !== S_UNDER) continue;
      if (It.claim[k] >= 0 || It.chamber[k] >= 0) continue;
      if (It.kind[k] === I_CORPSE && It.age[k] > 99) continue; // already at the midden
      const d = It.state[k] === S_UNDER ? Math.hypot(It.x[k] - A.x[i], It.y[k] - A.y[i]) : 30 + Math.hypot(It.x[k] - this.entrances[0].x, It.z[k] - this.entrances[0].z);
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return false;
    It.claim[best] = i;
    A.task[i] = T_CLEAN; A.tgt[i] = best; A.timer[i] = 0;
    A.sub[i] = It.state[best] === S_UNDER ? C_GO : C_EXIT;
    return true;
  },

  doClean(i, dt) {
    const A = this.ants, It = this.items, r = this.rng;
    const k = A.tgt[i];
    const valid = () => k >= 0 && It.claim[k] === i && (It.state[k] === S_SURFACE || It.state[k] === S_UNDER);
    switch (A.sub[i]) {
      case C_GO: {
        if (A.surf[i]) { A.sub[i] = C_HOME; return; }
        if (!valid()) { this.decide(i); return; }
        const cell = (It.y[k] | 0) * W + (It.x[k] | 0);
        const tc = this.world.type[cell] === TUNNEL ? cell : cell + W;
        let res = this.goField(i, NF_CELL, tc, dt);
        if (res === ARRIVED || (Math.abs(A.x[i] - It.x[k]) < 1.5 && Math.abs(A.y[i] - It.y[k]) < 1.5)) {
          if (this.goPointU(i, It.x[k], It.y[k], dt, 0.8) === ARRIVED || res === ARRIVED) {
            this.pickup(i, k); this.removeCorpse(k);
            A.sub[i] = this.hasField[NF_WASTE] ? C_WASTE : C_OUT;
          }
        } else if (res === LOST) { It.claim[k] = -1; this.decide(i); }
        return;
      }
      case C_EXIT: {
        if (!valid()) { this.decide(i); return; }
        if (A.surf[i]) { A.sub[i] = C_SEEK; return; }
        const res = this.goField(i, NF_EXIT, 0, dt);
        if (res === ARRIVED) { this.emerge(i, this.entranceAtCell((A.y[i] | 0) * W + (A.x[i] | 0))); A.sub[i] = C_SEEK; }
        else if (res === LOST) { It.claim[k] = -1; this.decide(i); }
        return;
      }
      case C_SEEK: {
        if (!valid()) { A.sub[i] = C_BACK; return; }
        if (this.goPointS(i, It.x[k], It.z[k], dt, 0.6) === ARRIVED) {
          this.pickup(i, k); this.removeCorpse(k);
          A.sub[i] = this.hasField[NF_WASTE] && r.chance(0.5) ? C_HOME : C_MIDDEN;
        }
        return;
      }
      case C_HOME: {
        if (!A.surf[i]) { A.sub[i] = A.carry[i] >= 0 ? C_WASTE : C_GO; return; }
        if (this.goHomeS(i, dt, false) === ARRIVED) A.sub[i] = A.carry[i] >= 0 ? C_WASTE : C_GO;
        return;
      }
      case C_WASTE: {
        if (A.carry[i] < 0) { this.decide(i); return; }
        const res = this.goField(i, NF_WASTE, 0, dt);
        if (res === ARRIVED) {
          const ch = this.chamberAt(A.x[i], A.y[i]);
          if (!ch) { this.dropCarried(i); this.decide(i); return; }
          const spot = this.stackSpot(ch);
          A.tx[i] = spot.x; A.ty[i] = spot.y; A.key[i] = spot.cell; A.tgt[i] = ch.id;
          A.sub[i] = C_PLACE;
        } else if (res === LOST) A.sub[i] = C_OUT;
        return;
      }
      case C_PLACE: {
        if (this.goPointU(i, A.tx[i], A.ty[i], dt, 0.7) === ARRIVED) {
          const ch = this.chambers[A.tgt[i]];
          const kk = A.carry[i];
          if (kk >= 0 && ch) { A.carry[i] = -1; this.storeItem(kk, ch, A.key[i]); }
          else this.dropCarried(i);
          this.decide(i);
        }
        return;
      }
      case C_OUT: {
        if (A.surf[i]) { A.sub[i] = C_MIDDEN; return; }
        const res = this.goField(i, NF_EXIT, 0, dt);
        if (res === ARRIVED) { this.emerge(i, this.entranceAtCell((A.y[i] | 0) * W + (A.x[i] | 0))); A.sub[i] = C_MIDDEN; }
        else if (res === LOST) { this.dropCarried(i); this.decide(i); }
        return;
      }
      case C_MIDDEN: {
        const m = this.midden;
        if (A.tx[i] === 0 || this.rng.chance(0.002)) { A.tx[i] = m.x + r.gauss() * 1.2; A.ty[i] = m.z + r.gauss() * 0.9; }
        if (this.goPointS(i, A.tx[i], A.ty[i], dt, 0.6) === ARRIVED) {
          const kk = A.carry[i];
          if (kk >= 0) {
            A.carry[i] = -1;
            It.owner[kk] = -1; It.state[kk] = S_SURFACE;
            It.x[kk] = A.x[i]; It.z[kk] = A.z[i];
            m.count++;
            It.y[kk] = this.world.surfaceH(It.x[kk], It.z[kk]) + Math.min(1.2, m.count * 0.012) * r.next();
            It.age[kk] = 100 + (It.age[kk] | 0); // mark as settled at the midden
            It.rot[kk] = r.range(0, 6.28);
          }
          A.tx[i] = 0;
          A.sub[i] = C_BACK;
        }
        return;
      }
      case C_BACK: {
        if (!A.surf[i]) { this.decide(i); return; }
        if (this.goHomeS(i, dt, false) === ARRIVED) this.decide(i);
        return;
      }
    }
  },

  // ---------------- DEFEND ----------------
  startDefend(i) {
    const A = this.ants;
    A.task[i] = T_DEFEND; A.sub[i] = DF_GO; A.timer[i] = 0; A.tgt[i] = -1;
  },

  doDefend(i, dt, think) {
    const A = this.ants, r = this.rng;
    A.timer[i] += dt;
    switch (A.sub[i]) {
      case DF_GO: {
        // underground: rush up towards the alarm at the entrance
        if (A.surf[i]) { A.sub[i] = DF_HUNT; return; }
        const al = this.pher.sampleU(U_ALARM, A.x[i], A.y[i]);
        if (A.timer[i] > 40 || (think && this.surfaceAlarm < 0.3 && al < 0.1)) { this.decide(i); return; }
        const res = this.goField(i, NF_EXIT, 0, dt);
        if (res === ARRIVED) { this.emerge(i, this.entranceAtCell((A.y[i] | 0) * W + (A.x[i] | 0))); A.sub[i] = DF_HUNT; A.timer[i] = 0; }
        else if (res === LOST) this.decide(i);
        return;
      }
      case DF_HUNT: {
        let c = this.creatureById(A.tgt[i]);
        if (think && (!c || !c.alive)) {
          // nearest hostile within reach of the alarm
          let bd = 30 * 30; c = null;
          for (const cr of this.creatures) {
            if (!cr.alive || !cr.hostile) continue;
            const d = (cr.x - A.x[i]) ** 2 + (cr.z - A.z[i]) ** 2;
            if (d < bd) { bd = d; c = cr; }
          }
          A.tgt[i] = c ? c.id : -1;
        }
        if (!c || !c.alive) {
          if (A.timer[i] > 6) { A.sub[i] = DF_BACK; }
          else this.forageSteer(i, dt);
          return;
        }
        this.pher.depositS(P_ALARM, A.x[i], A.z[i], 1.2 * dt);
        if (this.goPointS(i, c.x, c.z, dt, c.r + 0.4, 1.15) === ARRIVED) {
          A.sub[i] = DF_BITE; A.tx[i] = Math.atan2(A.z[i] - c.z, A.x[i] - c.x); A.timer[i] = 0;
          c.biters++;
        }
        if (A.timer[i] > 60) A.sub[i] = DF_BACK;
        return;
      }
      case DF_BITE: {
        const c = this.creatureById(A.tgt[i]);
        if (!c || !c.alive || c.fleeing > 0 && c.leaving) { if (c) c.biters = Math.max(0, c.biters - 1); A.sub[i] = DF_BACK; A.timer[i] = 0; return; }
        // cling to the intruder
        const a = A.tx[i];
        A.x[i] = c.x + Math.cos(a) * (c.r + 0.3);
        A.z[i] = c.z + Math.sin(a) * (c.r + 0.3);
        A.y[i] = this.world.surfaceH(A.x[i], A.z[i]) + 0.1;
        A.hd[i] = a + Math.PI;
        A.moving[i] = 2;
        c.hp -= dt * (A.caste[i] === MAJOR ? 2.6 : 1);
        c.lastBit = this.time;
        this.pher.depositS(P_ALARM, A.x[i], A.z[i], 2 * dt);
        if (A.timer[i] > 25) { c.biters = Math.max(0, c.biters - 1); A.sub[i] = DF_BACK; }
        return;
      }
      case DF_BACK: {
        if (!A.surf[i]) { this.decide(i); return; }
        if (think && this.checkThreat(i)) return;
        if (this.goHomeS(i, dt, false) === ARRIVED) this.decide(i);
        return;
      }
    }
  },
};

export { J_MOVE, J_LARVA, J_QUEEN, J_TEND, F_DRAG, F_CUT, D_DIG, DF_BITE };
