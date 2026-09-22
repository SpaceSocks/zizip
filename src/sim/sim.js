// Simulation orchestrator. Pure data + logic, no rendering: it can run in
// node for headless testing, or (later) inside a Web Worker.
import {
  TICK, THINK_EVERY, DAY, W, H, TUNNEL, MINOR, MAJOR, ENTRANCE_Z,
  T_IDLE, T_FORAGE, T_DIG, T_NURSE, T_CLEAN, T_DEFEND, T_EAT,
  I_SEED, I_CORPSE, S_UNDER, S_STORED, ITEM_FOOD, isFood,
  R_QUEEN, R_BROOD, R_FOOD, R_REST, R_WASTE,
} from './constants.js';
import { Rng, hashSeed } from './rng.js';
import { World } from './world.js';
import { Nav, NF_DIG } from './nav.js';
import { Pheromones } from './pheromones.js';
import { Ants, Items, Brood, B_EGG, B_LARVA, B_PUPA } from './stores.js';
import { movement } from './movement.js';
import { colony } from './colony.js';
import { chambers } from './chambers.js';
import { environment } from './environment.js';

export class Sim {
  constructor(seedStr) {
    this.seedStr = seedStr;
    this.seedNum = hashSeed(seedStr);
    this.rng = new Rng(this.seedNum);
    this.world = new World(new Rng(this.seedNum ^ 0x5bd1e995), this.seedNum);
    this.world.buildSurface();
    this.nav = new Nav(this.world);
    this.pher = new Pheromones(this.world);
    this.ants = new Ants();
    this.items = new Items();
    this.brood = new Brood();
    this.occ = new Uint8Array(W * H);
    this.occList = new Int32Array(this.ants.n);
    this.chambers = [];
    this.plans = [];
    this.sources = [];
    this.creatures = [];
    this.surfFood = [];
    this.corpses = [];
    this.husks = [];
    this.openCells = [];
    this.entrances = [];
    this.hasField = new Uint8Array(16);
    this.nextId = 1;   // sources and creatures
    this.taskOrder = [T_FORAGE, T_NURSE, T_DIG, T_CLEAN];
    this.time = 0;
    this.tick = 0;
    this.navDirty = true;
    this.frontier = 0;
    this.surfaceAlarm = 0;
    this.waterCells = 0;
    this.log = [];
    this.logVersion = 0;
    this.selected = -1;
    this.selectedDied = null;
    this.need = { forage: 0.5, nurse: 0.3, dig: 0, clean: 0 };
    this.lists = { moveBrood: [], hungryLarvae: [] };
    this.stock = { total: 0, carbs: 0, protein: 0, items: 0, eaten: 0 };
    this.stats = {
      deaths: {}, totalDeaths: 0, born: 0, kills: 0, underground: 0, surface: 0,
      roles: new Int32Array(9), majors: 0, eggs: 0, larvae: 0, pupae: 0, peak: 0,
    };
    this.history = { pop: [], brood: [], food: [] };
    this.milestones = new Set();
    this.extinct = false;

    this.weather = { rain: 0, rainTarget: 0, heat: 0, rainEnd: 0, heatEnd: 0, dry: 0, wind: 0.3 };
    this.initColony();
    this.initEnvironment();
    this.rebuildNav();
    this.updateNeeds();
  }

  logEvent(text, kind = 'info', ref = null) {
    this.log.push({ t: this.time, text, kind, ref });
    if (this.log.length > 120) this.log.shift();
    this.logVersion++;
  }

  initColony() {
    const w = this.world, r = this.rng;
    const e = w.entrance;
    this.entrances.push({ x: e.cellX + 1, z: ENTRANCE_Z, cellX: e.cellX, cellY: e.cellY, born: 0 });
    const sc = w.startChamber;
    const royal = this.makeChamber(R_QUEEN | R_BROOD | R_FOOD | R_REST, sc.cx, sc.cy, sc.rx, sc.ry);
    for (let y = Math.floor(sc.cy - sc.ry - 1); y <= sc.cy + sc.ry + 1; y++) {
      for (let x = Math.floor(sc.cx - sc.rx - 1); x <= sc.cx + sc.rx + 1; x++) {
        const dx = (x + 0.5 - sc.cx) / sc.rx, dy = (y + 0.5 - sc.cy) / sc.ry;
        if (dy < -0.62 || dx * dx + dy * dy > 1) continue;
        const c = y * W + x;
        w.setOpen(x, y);
        w.chamberOf[c] = royal.id;
        royal.interior.push(c);
      }
    }
    // connect shaft bottom to the chamber
    for (let y = Math.floor(sc.cy); y < Math.floor(sc.cy + sc.ry + 3); y++) {
      let open = false;
      for (let x = Math.floor(sc.cx - 3); x <= sc.cx + 3; x++) if (w.type[y * W + x] === TUNNEL) open = true;
      if (!open) { w.setOpen(Math.floor(sc.cx), y); w.setOpen(Math.floor(sc.cx) + 1, y); }
    }
    for (let c = 0; c < W * H; c++) if (w.type[c] === TUNNEL) this.openCells.push(c);
    this.refreshChamber(royal);

    this.queen = {
      x: sc.cx, y: Math.floor(sc.cy - sc.ry * 0.6) + 0.9, z: -1.1, hd: 0, walk: 0, alive: true,
      fed: 0.9, protein: 0.5, health: 1, age: 0, eggs: 0, chamber: royal.id, claim: -1,
      tx: sc.cx, ty: sc.cy, timer: 5, moving: 0, eggClock: 0.4, px: sc.cx, py: sc.cy,
    };

    const nWorkers = r.int(10, 14);
    for (let k = 0; k < nWorkers; k++) {
      const c = royal.floor[r.int(0, royal.floor.length - 1)];
      this.spawnWorker(c % W + 0.5, ((c / W) | 0) + 0.5, r.range(0.5, 12));
    }
    const B = this.brood;
    const addBrood = (stage, dev, fed) => {
      const b = B.alloc();
      B.stage[b] = stage; B.dev[b] = dev; B.fed[b] = fed;
      this.placeBrood(b, royal, -1);
    };
    for (let k = 0; k < r.int(4, 7); k++) addBrood(B_EGG, r.range(0, 0.9), 0);
    for (let k = 0; k < r.int(3, 5); k++) addBrood(B_LARVA, r.range(0, 0.9), 0.6);
    for (let k = 0; k < r.int(2, 3); k++) addBrood(B_PUPA, r.range(0.3, 0.95), 0);
    for (let k = 0; k < 10; k++) {
      const it = this.items.alloc(I_SEED, S_STORED);
      this.storeItem(it, royal, -1);
    }
    this.planTunnel();
    this.logEvent('A young queen and her first workers have founded a colony', 'build');
  }

  rebuildNav() {
    const src = this.navSources();
    this.nav.rebuild(src, this.time);
  }

  // ------------------------------------------------------------------
  step() {
    const dt = TICK;
    this.tick++;
    this.time += dt;
    if (this.tick % 20 === 0) this.updateNeeds();
    if (this.navDirty && this.time - this.nav.buildTime > 0.75) { this.navDirty = false; this.rebuildNav(); }
    this.updateOccupancy();

    const A = this.ants, tk = this.tick;
    const ageStep = dt / DAY;
    for (let i = 0; i < A.hi; i++) {
      if (!A.alive[i]) continue;
      A.px[i] = A.x[i]; A.py[i] = A.y[i]; A.pz[i] = A.z[i];
      A.moving[i] = 0;
      A.age[i] += ageStep;
      const working = A.task[i] === T_FORAGE || A.task[i] === T_DIG || A.task[i] === T_DEFEND;
      A.energy[i] -= ageStep * (working ? 0.34 : 0.22);
      const think = ((tk + i) % THINK_EVERY) === 0;
      if (think) {
        if (A.energy[i] <= 0) {
          A.energy[i] = 0;
          A.health[i] -= ageStep * THINK_EVERY * 2.5;
          if (A.health[i] <= 0) { this.kill(i, 'starvation'); continue; }
        } else if (A.health[i] < 1) A.health[i] = Math.min(1, A.health[i] + ageStep * THINK_EVERY * 0.5);
        if (A.age[i] > A.life[i]) { this.kill(i, 'old age'); continue; }
        if (!A.surf[i] && this.world.water[(A.y[i] | 0) * W + (A.x[i] | 0)] > 200 && this.rng.chance(0.004)) { this.kill(i, 'drowning'); continue; }
        // brief antennal contact with a nestmate
        if (!A.surf[i] && A.pause[i] <= 0 && this.occ[(A.y[i] | 0) * W + (A.x[i] | 0)] >= 2 && A.carry[i] < 0 && this.rng.chance(0.03)) A.pause[i] = this.rng.range(0.4, 1.1);
      }
      if (A.pause[i] > 0) { A.pause[i] -= dt; continue; }
      this.updateAnt(i, dt, think);
    }
    if (this.queen.alive) this.updateQueen(dt);
    if (this.tick % 5 === 0) this.updateBrood(dt * 5);
    if (this.tick % 5 === 0) this.pher.update(dt * 5, this.tick % 10 === 0);
    this.updateEnvironment(dt);
    if (this.tick % 10 === 0 && (this.weather.rain > 0.05 || this.waterCells > 0)) this.updateWater();
    if (this.tick % 20 === 0) this.checkMilestones();
    if (this.tick % 60 === 0 && this.ants.count > 60) this.widenCongested();
    if (this.tick % Math.round(DAY / 30 / TICK) === 0) this.recordHistory();
  }

  updateOccupancy() {
    const A = this.ants, occ = this.occ, list = this.occList;
    for (let n = 0; n < this.occN; n++) occ[list[n]] = 0;
    let n = 0;
    for (let i = 0; i < A.hi; i++) {
      if (!A.alive[i] || A.surf[i]) continue;
      const c = (A.y[i] | 0) * W + (A.x[i] | 0);
      if (occ[c] < 250) occ[c]++;
      list[n++] = c;
    }
    this.occN = n;
  }

  // ------------------------------------------------------------------
  updateQueen(dt) {
    const q = this.queen, r = this.rng;
    q.px = q.x; q.py = q.y;
    q.age += dt / DAY;
    q.fed -= dt / (DAY * 1.8);
    q.moving = 0;
    if (q.fed <= 0) {
      q.fed = 0;
      q.health -= dt / (DAY * 3.5);
      if (q.health < 0.5 && !this.milestones.has('qweak')) { this.milestones.add('qweak'); this.logEvent('The queen is starving!', 'danger'); }
      if (q.health <= 0) { this.killQueen('starvation'); return; }
    } else q.health = Math.min(1, q.health + dt / DAY);

    // amble slowly around her chamber
    const ch = this.chambers[q.chamber];
    q.timer -= dt;
    if (q.timer <= 0 && ch.floor.length) {
      const c = ch.floor[r.int(0, ch.floor.length - 1)];
      q.tx = c % W + 0.5; q.ty = ((c / W) | 0) + 0.9;
      q.timer = r.range(15, 45);
    }
    const dx = q.tx - q.x, dy = q.ty - q.y, d = Math.hypot(dx, dy);
    if (d > 0.3) {
      const want = Math.atan2(dy, dx);
      let da = want - q.hd;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      q.hd += Math.max(-dt * 1.5, Math.min(dt * 1.5, da));
      const s = 0.35 * dt;
      q.x += Math.cos(q.hd) * s; q.y += Math.sin(q.hd) * s;
      q.walk += s; q.moving = 1;
    }

    // egg laying depends on her nutrition, the stores, the workforce and stress
    const workers = this.ants.count;
    const base = Math.min(170, 22 + workers * 0.42);
    const fedF = Math.min(1, q.fed / 0.45);
    const foodF = Math.max(0.1, Math.min(1.25, 0.15 + this.stock.total / (workers * 0.9 + 8)));
    let stress = 1;
    if (this.weather.rain > 0.5) stress *= 0.7;
    if (this.weather.heat > 0.5) stress *= 0.8;
    if (this.surfaceAlarm > 1) stress *= 0.8;
    const care = this.brood.count > workers * 1.3 + 14 ? 0.15 : 1;
    const rate = base * fedF * foodF * stress * care;
    q.rate = rate;
    q.eggClock += dt * rate / DAY;
    while (q.eggClock >= 1) {
      q.eggClock -= 1;
      const b = this.brood.alloc();
      if (b < 0) break;
      this.brood.stage[b] = B_EGG;
      this.placeBrood(b, ch, -1);
      this.brood.x[b] = q.x - Math.cos(q.hd) * 1.6 + r.range(-0.3, 0.3);
      q.fed -= 0.025;
      q.eggs++;
      this.stats.eggsLaid = (this.stats.eggsLaid || 0) + 1;
    }
  }

  killQueen(cause) {
    const q = this.queen;
    q.alive = false;
    const k = this.items.alloc(I_CORPSE, S_UNDER);
    if (k >= 0) { this.items.x[k] = q.x; this.items.y[k] = q.y; this.items.z[k] = q.z; this.items.rot[k] = q.hd; this.items.age[k] = 2; this.settleUnder(k); this.corpses.push(k); }
    this.logEvent(`The queen has died (${cause}). Without her, the colony cannot survive`, 'danger');
  }

  updateBrood(dt) {
    const B = this.brood, r = this.rng;
    for (let b = 0; b < B.hi; b++) {
      if (!B.alive[b]) continue;
      const ch = this.chambers[B.chamber[b]];
      const wet = ch && ch.flooded ? 0.4 : 1;
      if (B.stage[b] === B_EGG) {
        B.dev[b] += dt / (0.32 * DAY) * wet;
        if (B.dev[b] >= 1) { B.stage[b] = B_LARVA; B.dev[b] = 0; B.fed[b] = 0.25; }
      } else if (B.stage[b] === B_LARVA) {
        if (B.fed[b] > 0) {
          B.dev[b] += dt / (0.5 * DAY) * wet;
          B.fed[b] -= dt * (1.2 / (0.5 * DAY));
          B.starve[b] = 0;
        } else {
          B.fed[b] = 0;
          B.starve[b] += dt;
          if (B.starve[b] > DAY * 0.6) {
            if (B.carried[b]) { const i = B.carrier[b]; if (i >= 0) this.ants.tgt[i] = -1; }
            this.unstackBrood(b); B.release(b);
            this.stats.larvaeLost = (this.stats.larvaeLost || 0) + 1;
            // starving colonies recycle their brood: the queen gets the protein
            if (this.queen.alive) this.queen.fed = Math.min(1, this.queen.fed + 0.12);
            if (!this.milestones.has('starveL')) { this.milestones.add('starveL'); this.logEvent('Larvae are starving: the colony needs protein', 'danger'); }
            continue;
          }
        }
        if (B.dev[b] >= 1) { B.stage[b] = B_PUPA; B.dev[b] = 0; }
      } else {
        B.dev[b] += dt / (0.36 * DAY) * wet;
        if (B.dev[b] >= 1 && !B.carried[b]) {
          const workers = this.ants.count;
          const majorP = workers > 35 ? Math.min(0.3, 0.06 + B.protein[b] * 0.08) : 0;
          const caste = r.chance(majorP) ? MAJOR : MINOR;
          const i = this.spawnWorker(B.x[b], B.y[b] + 0.2, 0, caste);
          if (i >= 0) {
            this.stats.born++;
            if (this.world.type[(this.ants.y[i] | 0) * W + (this.ants.x[i] | 0)] !== TUNNEL) this.unstick(i);
            if (this.stats.born === 1) this.logEvent(`The first new worker (#${this.ants.id[i]}) has emerged from its cocoon`, 'birth', { ant: i });
            if (caste === MAJOR && !this.milestones.has('major')) { this.milestones.add('major'); this.logEvent(`A big-headed major worker (#${this.ants.id[i]}) has emerged: the colony now has soldiers`, 'birth', { ant: i }); }
          }
          this.unstackBrood(b);
          B.release(b);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Colony-wide stimuli. Each ant samples these (with its own thresholds)
  // when choosing work - the only "global" information in the model.
  updateNeeds() {
    const A = this.ants, B = this.brood, It = this.items;
    const roles = this.stats.roles;
    roles.fill(0);
    let under = 0, surf = 0, majors = 0;
    for (let i = 0; i < A.hi; i++) {
      if (!A.alive[i]) continue;
      roles[A.task[i]]++;
      if (A.surf[i]) surf++; else under++;
      if (A.caste[i] === MAJOR) majors++;
    }
    this.stats.underground = under;
    this.stats.surface = surf;
    this.stats.majors = majors;
    this.stats.peak = Math.max(this.stats.peak, A.count);

    let carbs = 0, protein = 0, items = 0;
    for (const ch of this.chambers) {
      if (ch.role & R_WASTE) continue;
      for (const k of ch.items) {
        if (!isFood(It.kind[k])) continue;
        const [c, p] = ITEM_FOOD[It.kind[k]];
        carbs += c; protein += p; items++;
      }
    }
    this.stock.carbs = carbs; this.stock.protein = protein; this.stock.items = items;
    this.stock.total = carbs + protein;

    const mv = this.lists.moveBrood, hl = this.lists.hungryLarvae;
    mv.length = 0; hl.length = 0;
    let eggs = 0, larvae = 0, pupae = 0;
    let nursery = false;
    for (const ch of this.chambers) if (ch.active && (ch.role & R_BROOD) && !ch.flooded) nursery = true;
    for (let b = 0; b < B.hi; b++) {
      if (!B.alive[b]) continue;
      if (B.stage[b] === B_EGG) eggs++; else if (B.stage[b] === B_LARVA) larvae++; else pupae++;
      if (B.carried[b] || B.claim[b] >= 0) continue;
      const ch = this.chambers[B.chamber[b]];
      const misplaced = !ch || !(ch.role & R_BROOD) || ch.flooded || B.cell[b] < 0;
      if (misplaced && nursery) mv.push(b);
      else if (B.stage[b] === B_LARVA && B.fed[b] < 0.6) hl.push(b);
    }
    this.stats.eggs = eggs; this.stats.larvae = larvae; this.stats.pupae = pupae;

    const workers = A.count;
    const N = this.need;
    const desired = 8 + workers * 1.5 + larvae * 1.6;
    let forage = Math.max(0.1, Math.min(1, 1.15 * (1 - this.stock.total / desired)));
    if (this.isNight()) forage *= 0.45;
    if (this.weather.rain > 0.3) forage *= 0.1;
    const tod = this.timeOfDay();
    if (this.weather.heat > 0.4 && tod > 0.4 && tod < 0.65) forage *= 0.45;
    N.forage = forage;
    const q = this.queen;
    const jobs = mv.length * 1.2 + hl.length + (q.alive && q.fed < 0.65 ? 3 : 0);
    N.nurse = Math.max(0.05, Math.min(1, jobs / (roles[T_NURSE] * 2 + 2)));
    const pend = this.frontier > 0 ? 0 : (this.pendingNeed() ? 1 : 0);
    N.dig = this.frontier > 0 ? Math.min(0.75, 0.18 + this.frontier / (roles[T_DIG] * 3 + 4)) : pend ? 0.4 : 0;
    const pendingCorpses = this.corpses.length;
    N.clean = Math.min(1, pendingCorpses / (roles[T_CLEAN] + 1) * 0.6);

    if (!this.extinct && A.count === 0 && (!q.alive || B.count === 0)) {
      this.extinct = true;
      this.logEvent('The colony has died out', 'danger');
    }
  }

  recordHistory() {
    const h = this.history;
    h.pop.push(this.ants.count);
    h.brood.push(this.brood.count);
    h.food.push(Math.round(this.stock.total));
    const max = 600;
    if (h.pop.length > max) { h.pop.splice(0, h.pop.length - max); h.brood.splice(0, h.brood.length - max); h.food.splice(0, h.food.length - max); }
  }

  checkMilestones() {
    const n = this.ants.count;
    for (const m of [25, 50, 100, 250, 500, 1000, 2000]) {
      if (n >= m && !this.milestones.has('p' + m)) {
        this.milestones.add('p' + m);
        this.logEvent(`The colony has grown to ${m} workers`, 'birth');
      }
    }
  }

  get day() { return this.time / DAY; }
}

Object.assign(Sim.prototype, movement, colony, chambers, environment);
