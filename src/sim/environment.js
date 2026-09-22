// The world outside the nest: food that appears and rots, plants that shed
// seeds, other creatures, weather, the day/night cycle and random events.
import {
  W, H, SURF_D, DAY, TUNNEL, LOOSE, S_SURFACE, I_SEED, I_HUSK, I_PROTEIN,
  F_BERRY, F_FRUIT, F_INSECT, F_SUGAR, F_CARCASS, SOURCE_ITEM, SOURCE_NAMES, T_IDLE, T_DEFEND,
  R_QUEEN,
} from './constants.js';
import { P_FOOD, P_HOME, P_ALARM, U_ALARM } from './pheromones.js';
import { P_REPAIR } from './chambers.js';

let sourceIds = 1, creatureIds = 1;

const SOURCE_DEF = {
  [F_BERRY]: { amount: [22, 40], r: [0.9, 1.3], life: 2.2, q: 0.8, article: 'a' },
  [F_FRUIT]: { amount: [50, 90], r: [1.6, 2.4], life: 2.8, q: 0.9, article: 'a piece of' },
  [F_INSECT]: { amount: [12, 24], r: [0.8, 1.2], life: 3.0, q: 1.0, article: 'a' },
  [F_SUGAR]: { amount: [18, 32], r: [0.6, 1.0], life: 1.2, q: 1.0, article: 'a' },
  [F_CARCASS]: { amount: [25, 45], r: [1.2, 1.7], life: 4.0, q: 1.0, article: 'a' },
};

export const environment = {
  initEnvironment() {
    const r = this.rng, w = this.world;
    // stones (obstacles on the surface)
    this.stones = [];
    const nStones = r.int(5, 9);
    for (let k = 0; k < nStones; k++) {
      const x = r.range(6, W - 6), z = -r.range(2.5, SURF_D - 2.5);
      if (Math.abs(x - w.entrance.x) < 6 && z > -6) continue;
      this.stones.push({ x, z, r: r.range(0.9, 2.6), h: r.range(0.6, 1.6), seed: r.int(0, 1e6) });
    }
    // plants: they drop seeds; roots were grown below some of them
    this.plants = [];
    for (const rx of w.rootAnchors) this.plants.push(this.makePlant(rx, -r.range(0.8, 3)));
    const extra = r.int(2, 4);
    for (let k = 0; k < extra; k++) this.plants.push(this.makePlant(r.range(8, W - 8), -r.range(4, SURF_D - 3)));
    this.decorSeed = r.int(0, 1e9);
    this.midden = null;
    // a refuse heap site, a short walk from the entrance
    const side = r.chance(0.5) ? 1 : -1;
    this.midden = { x: w.entrance.x + side * r.range(16, 26), z: -r.range(4, 9), count: 0 };

    this.weather = { rain: 0, rainTarget: 0, heat: 0, rainEnd: 0, heatEnd: 0, dry: 0, wind: 0.3 };
    this.nextEvent = DAY * r.range(0.12, 0.2);
    this.foodClock = 0;
    // a couple of early food sources so the first scouts have something to find
    this.spawnSource(r.pick([F_BERRY, F_INSECT, F_SUGAR]), true);
    this.spawnSource(F_BERRY, true);
    for (let k = 0; k < 2; k++) this.plantSeeds(r.pick(this.plants), r.int(3, 6));
  },

  makePlant(x, z) {
    const r = this.rng;
    return {
      x, z, kind: r.pick(['grass', 'flower', 'clover', 'weed']),
      h: r.range(4, 10), color: r.int(0, 3), seedClock: r.range(0.1, 0.6) * DAY,
    };
  },

  sourceById(id) {
    for (const s of this.sources) if (s.id === id) return s;
    return null;
  },

  creatureById(id) {
    if (id < 0) return null;
    for (const c of this.creatures) if (c.id === id) return c;
    return null;
  },

  spawnSource(kind, near = false, at = null) {
    const r = this.rng, def = SOURCE_DEF[kind];
    const e = this.entrances[0];
    let x, z, tries = 0;
    do {
      if (at) { x = at.x; z = at.z; break; }
      x = near ? e.x + r.range(12, 34) * (r.chance(0.5) ? 1 : -1) : r.range(6, W - 6);
      z = -r.range(2, SURF_D - 2);
      tries++;
    } while ((Math.hypot(x - e.x, z - e.z) < 12 || this.stones.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 2)) && tries < 30);
    x = Math.max(4, Math.min(W - 4, x));
    const amount = Math.round(r.range(def.amount[0], def.amount[1]));
    const s = {
      id: sourceIds++, kind, x, z, amount, max: amount, alive: true, found: false,
      r: r.range(def.r[0], def.r[1]), rot: r.range(0, 6.28), quality: def.q, article: def.article,
      rot0: 0, decay: amount / (def.life * DAY), attached: 0, atNest: false, moved: 0,
      born: this.time, drop: kind === F_CARCASS || at ? 0 : 1, variant: r.int(0, 3),
    };
    this.sources.push(s);
    return s;
  },

  takeFromSource(s) {
    s.amount -= 1;
    if (s.amount <= 0.5) this.depleteSource(s);
    return SOURCE_ITEM[s.kind];
  },

  depleteSource(s) {
    if (!s.alive) return;
    s.alive = false;
    if (s.found) this.logEvent(`The ${SOURCE_NAMES[s.kind].toLowerCase()} has been ${s.amount <= 0.5 ? 'stripped bare' : 'lost'}`, 'food');
    if (s.kind === F_INSECT || s.kind === F_CARCASS) {
      const k = this.items.alloc(I_HUSK, S_SURFACE);
      if (k >= 0) {
        this.items.x[k] = s.x; this.items.z[k] = s.z; this.items.y[k] = this.world.surfaceH(s.x, s.z);
        this.items.rot[k] = s.rot; this.items.age[k] = 0;
        this.husks.push(k);
      }
    }
  },

  plantSeeds(p, n) {
    const r = this.rng;
    for (let k = 0; k < n; k++) {
      const kk = this.items.alloc(I_SEED, S_SURFACE);
      if (kk < 0) return;
      const x = Math.max(2, Math.min(W - 2, p.x + r.gauss() * 3.5));
      const z = Math.max(-SURF_D + 1.5, Math.min(-0.6, p.z + r.gauss() * 2.5));
      this.items.x[kk] = x; this.items.z[kk] = z;
      this.items.y[kk] = this.world.surfaceH(x, z);
      this.items.rot[kk] = r.range(0, 6.28);
      this.items.age[kk] = 0;
      this.surfFood.push(kk);
    }
  },

  removeSurfFood(k) {
    const j = this.surfFood.indexOf(k);
    if (j >= 0) { this.surfFood[j] = this.surfFood[this.surfFood.length - 1]; this.surfFood.pop(); }
  },

  removeCorpse(k) {
    const j = this.corpses.indexOf(k);
    if (j >= 0) { this.corpses[j] = this.corpses[this.corpses.length - 1]; this.corpses.pop(); }
  },

  timeOfDay() { return ((this.time / DAY) + 0.3) % 1; },   // 0 = midnight, 0.5 = noon
  isNight() { const t = this.timeOfDay(); return t < 0.22 || t > 0.8; },

  // ---------------------------------------------------------------
  updateEnvironment(dt) {
    const r = this.rng, w = this.world;
    // sources rot / evaporate; carcasses get dragged
    for (const s of this.sources) {
      if (!s.alive) continue;
      if (s.drop > 0) s.drop = Math.max(0, s.drop - dt * 1.5);
      s.amount -= s.decay * dt;
      if (s.amount <= 0.5) { this.depleteSource(s); continue; }
      s.moved = 0;
      if (s.kind === F_CARCASS && !s.atNest) {
        const need = 4;
        if (s.attached >= 2) {
          const e = this.nearestEntrance(s.x, s.z);
          const dx = e.x - s.x, dz = e.z - s.z;
          const d = Math.hypot(dx, dz);
          if (d < 2.4) { s.atNest = true; this.logEvent('Workers hauled a carcass all the way to the nest entrance', 'food'); }
          else {
            const sp = 0.45 * Math.min(1.6, (s.attached - 1) / need);
            s.x += dx / d * sp * dt + r.gauss() * 0.02; s.z += dz / d * sp * dt + r.gauss() * 0.02;
            s.rot += r.gauss() * 0.01;
            s.moved = sp * dt;
          }
        }
      }
    }
    if (this.tick % 40 === 0) this.sources = this.sources.filter((s) => s.alive);

    // steady arrival of food
    this.foodClock -= dt;
    if (this.foodClock <= 0) {
      const scarcity = this.weather.dry > 0 ? 2.2 : 1;
      this.foodClock = DAY * r.range(0.05, 0.13) * scarcity;
      const alive = this.sources.filter((s) => s.alive).length;
      if (alive < 14) {
        const roll = r.next();
        const kind = roll < 0.34 ? F_BERRY : roll < 0.52 ? F_INSECT : roll < 0.7 ? F_SUGAR : roll < 0.86 ? F_FRUIT : F_CARCASS;
        const s = this.spawnSource(kind);
        if (kind === F_FRUIT) this.logEvent('A piece of fruit fell into the terrarium', 'env');
        if (kind === F_CARCASS) this.logEvent('A dead beetle landed on the surface', 'env');
        s.quiet = kind !== F_FRUIT && kind !== F_CARCASS;
      }
    }
    // plants shed seeds
    for (const p of this.plants) {
      p.seedClock -= dt * (this.weather.dry > 0 ? 0.4 : 1);
      if (p.seedClock <= 0) {
        p.seedClock = DAY * r.range(0.25, 0.7);
        if (this.surfFood.length < 70) this.plantSeeds(p, r.int(3, 8));
      }
    }
    // husks weather away slowly
    if (this.tick % 100 === 0) {
      for (let n = this.husks.length - 1; n >= 0; n--) {
        const k = this.husks[n];
        this.items.age[k] += 5;
        if (this.items.age[k] > DAY * 3) { this.items.release(k); this.husks.splice(n, 1); }
      }
    }

    this.updateWeather(dt);
    this.updateCreatures(dt);

    // random events
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) {
      this.nextEvent = DAY * r.range(0.35, 0.9);
      this.randomEvent();
    }
  },

  randomEvent() {
    const r = this.rng;
    const age = this.time / DAY;
    const opts = [];
    opts.push(['fruit', 3], ['seedburst', 2], ['beetle', 2], ['caterpillar', 2]);
    if (age > 0.6) opts.push(['rain', 2]);
    if (this.ants.count > 30) opts.push(['spider', 2]);
    if (age > 1.2) opts.push(['heat', 1], ['dry', 0.8], ['collapse', 0.9]);
    if (this.ants.count > 60) opts.push(['spider', 1.5], ['carcass', 1.2]);
    const tot = opts.reduce((s, o) => s + o[1], 0);
    let roll = r.next() * tot;
    let ev = opts[0][0];
    for (const [name, wgt] of opts) { roll -= wgt; if (roll <= 0) { ev = name; break; } }
    switch (ev) {
      case 'fruit': this.spawnSource(r.chance(0.5) ? F_FRUIT : F_BERRY); this.logEvent('Ripe fruit dropped into the terrarium', 'env'); break;
      case 'carcass': this.spawnSource(F_CARCASS); this.logEvent('A large dead insect fell nearby', 'env'); break;
      case 'seedburst': {
        const p = r.pick(this.plants);
        this.plantSeeds(p, r.int(8, 14));
        this.logEvent('A plant scattered a burst of seeds', 'env');
        break;
      }
      case 'beetle': this.spawnCreature('beetle'); break;
      case 'caterpillar': this.spawnCreature('caterpillar'); break;
      case 'spider': this.spawnCreature('spider'); break;
      case 'rain':
        if (this.weather.rain < 0.1) {
          this.weather.rainTarget = r.range(0.5, 1);
          this.weather.rainEnd = this.time + DAY * r.range(0.12, 0.3);
          this.logEvent('Rain begins to fall', 'weather');
        }
        break;
      case 'heat':
        this.weather.heatEnd = this.time + DAY * r.range(0.6, 1.2);
        this.logEvent('A heat wave settles over the terrarium', 'weather');
        break;
      case 'dry':
        this.weather.dry = DAY * r.range(0.8, 1.6);
        this.logEvent('A dry spell: food is getting scarce', 'weather');
        break;
      case 'collapse': this.collapse(); break;
    }
  },

  updateWeather(dt) {
    const wt = this.weather, r = this.rng;
    if (wt.rainTarget > 0 && this.time > wt.rainEnd) { wt.rainTarget = 0; this.logEvent('The rain has stopped', 'weather'); }
    wt.rain += (wt.rainTarget - wt.rain) * Math.min(1, dt * 0.15);
    const heatOn = this.time < wt.heatEnd;
    wt.heat += ((heatOn ? 1 : 0) - wt.heat) * Math.min(1, dt * 0.05);
    if (wt.dry > 0) wt.dry -= dt;
    this.pher.weatherMul = 1 + wt.rain * 4 + wt.heat * 1.5;
    if (this.tick % 20 === 0) {
      if (wt.rain > 0.2) this.world.soakTop(wt.rain * 6);
      else if (this.tick % 200 === 0) this.world.dryTop(2 + wt.heat * 4);
    }
    // flooding: heavy rain pours into the entrances
    if (wt.rain > 0.55) {
      for (const e of this.entrances) {
        const c = e.cellY * W + e.cellX;
        this.world.water[c] = Math.min(255, this.world.water[c] + wt.rain * dt * 90);
      }
    }
    wt.wind = 0.3 + wt.rain * 0.8 + Math.sin(this.time * 0.05) * 0.1;
  },

  // Water cellular automaton inside the tunnels.
  updateWater() {
    const w = this.world, wat = w.water, type = w.type;
    let any = 0;
    for (let y = 1; y < H; y++) {
      for (let x = 1; x < W - 1; x++) {
        const c = y * W + x;
        let v = wat[c];
        if (!v) continue;
        any++;
        const below = c - W;
        if (type[below] === TUNNEL && wat[below] < 255) {
          const mv = Math.min(v, 255 - wat[below]);
          wat[below] += mv; v -= mv;
        }
        if (v > 8) {
          for (const n of [c - 1, c + 1]) {
            if (type[n] === TUNNEL && wat[n] < v - 4) {
              const mv = (v - wat[n]) >> 2;
              wat[n] += mv; v -= mv;
            }
          }
        }
        // soil soaks water up
        v = Math.max(0, v - (type[below] === TUNNEL ? 0.5 : 2.2));
        wat[c] = v;
      }
    }
    this.waterCells = any;
    // chambers under water are abandoned until they drain
    for (const ch of this.chambers) {
      if (!ch.active) continue;
      let wet = 0;
      for (const c of ch.floor) if (wat[c] > 60) wet++;
      const fl = wet > ch.floor.length * 0.3;
      if (fl !== ch.flooded) {
        ch.flooded = fl;
        this.navDirty = true;
        if (fl) this.logEvent(`Water is seeping into the ${this.chamberName(ch).toLowerCase()}!`, 'weather', { chamber: ch.id });
      }
    }
  },

  collapse() {
    const w = this.world, r = this.rng;
    for (let t = 0; t < 20; t++) {
      const c = this.openCells[r.int(0, this.openCells.length - 1)];
      if (w.type[c] !== TUNNEL) continue;
      const x = c % W, y = (c / W) | 0;
      if (y > w.ground[x] - 4 || y < 4) continue;
      const chId = w.chamberOf[c];
      if (chId >= 0 && (this.chambers[chId].role & R_QUEEN)) continue;
      if (this.entrances.some((e) => Math.abs(e.cellX - x) < 3)) continue;
      const cells = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
        const cc = (y + dy) * W + x + dx;
        if (w.type[cc] === TUNNEL && r.chance(0.8)) cells.push(cc);
      }
      if (cells.length < 3) continue;
      for (const cc of cells) w.fill(cc % W, (cc / W) | 0, LOOSE);
      // ants caught inside get pushed out; brood and items get buried and lost
      const A = this.ants;
      for (let i = 0; i < A.hi; i++) if (A.alive[i] && !A.surf[i] && w.type[(A.y[i] | 0) * W + (A.x[i] | 0)] !== TUNNEL) this.unstick(i);
      for (const ch of this.chambers) if (ch.interior.includes(c)) this.refreshChamber(ch);
      this.addPlan(P_REPAIR, cells, -1);
      this.navDirty = true;
      this.logEvent('Part of a tunnel collapsed! Workers begin clearing the rubble', 'danger');
      return;
    }
  },

  // ---------------------------------------------------------------
  spawnCreature(kind) {
    const r = this.rng;
    const fromLeft = r.chance(0.5);
    const c = {
      id: creatureIds++, kind, alive: true, x: fromLeft ? 1.5 : W - 1.5, z: -r.range(3, SURF_D - 3),
      hd: fromLeft ? 0 : Math.PI, walk: 0, timer: 0, target: -1, biters: 0, fleeing: 0, leaving: false,
      lastBit: -99, eatTimer: 0, kills: 0, born: this.time, y: 0,
    };
    if (kind === 'spider') Object.assign(c, { hp: 34, maxHp: 34, r: 1.5, speed: 3.8, hostile: true, life: DAY * r.range(0.25, 0.45) });
    if (kind === 'beetle') Object.assign(c, { hp: 55, maxHp: 55, r: 1.3, speed: 1.3, hostile: true, life: DAY * r.range(0.2, 0.4), passive: true });
    if (kind === 'caterpillar') Object.assign(c, { hp: 14, maxHp: 14, r: 1.1, speed: 0.45, hostile: true, life: DAY * r.range(0.3, 0.6), passive: true });
    c.y = this.world.surfaceH(c.x, c.z);
    this.creatures.push(c);
    const names = { spider: 'A hunting spider crept into the terrarium', beetle: 'A ground beetle wandered in', caterpillar: 'A caterpillar is inching across the surface' };
    this.logEvent(names[kind], kind === 'spider' ? 'danger' : 'env', { creature: c.id });
    return c;
  },

  updateCreatures(dt) {
    const A = this.ants, r = this.rng, P = this.pher;
    let alarmNearNest = 0;
    for (const c of this.creatures) {
      if (!c.alive) continue;
      c.timer += dt;
      const e = this.entrances[0];
      if (c.hp <= 0) {
        c.alive = false;
        const s = this.spawnSource(F_CARCASS, false, { x: c.x, z: c.z });
        s.found = true; s.r = c.r; s.amount = s.max = c.kind === 'spider' ? 30 : c.kind === 'beetle' ? 40 : 18;
        s.decay = s.amount / (DAY * 4); s.drop = 0; s.from = c.kind;
        const who = { spider: 'spider', beetle: 'beetle', caterpillar: 'caterpillar' }[c.kind];
        this.logEvent(`The colony overwhelmed the ${who}! Its body becomes food`, 'win');
        this.stats.kills++;
        continue;
      }
      if (c.timer > c.life && !c.leaving) c.leaving = true;
      if (c.hp < c.maxHp * 0.3 && c.kind === 'spider' && !c.leaving) { c.leaving = true; this.logEvent('The wounded spider retreats', 'win'); }
      let tx = c.x + Math.cos(c.hd) * 5, tz = c.z + Math.sin(c.hd) * 5;
      let sp = c.speed;
      if (c.leaving) {
        tx = c.x < W / 2 ? -5 : W + 5; tz = c.z;
        sp *= 1.2;
        if (c.x < 0.5 || c.x > W - 0.5) { c.alive = false; continue; }
      } else if (c.kind === 'spider') {
        // stalk the nearest surface ant
        if (c.eatTimer > 0) { c.eatTimer -= dt; sp = 0; }
        else {
          let bi = -1, bd = 14 * 14;
          if (this.tick % 5 === 0 || c.target < 0 || !A.alive[c.target] || !A.surf[c.target]) {
            for (let i = 0; i < A.hi; i++) {
              if (!A.alive[i] || !A.surf[i]) continue;
              const d = (A.x[i] - c.x) ** 2 + (A.z[i] - c.z) ** 2;
              if (d < bd) { bd = d; bi = i; }
            }
            c.target = bi;
          }
          if (c.target >= 0 && A.alive[c.target] && A.surf[c.target]) {
            const i = c.target;
            tx = A.x[i]; tz = A.z[i];
            const d = Math.hypot(tx - c.x, tz - c.z);
            if (d < c.r + 0.6) {
              this.pher.depositS(P_ALARM, c.x, c.z, 6);
              this.kill(i, 'predator');
              c.kills++;
              c.eatTimer = r.range(3, 6);
              if (c.kills === 1) this.logEvent('The spider has caught a worker!', 'danger', { creature: c.id });
            }
          } else {
            // wander, drifting towards the entrance traffic
            if (r.next() < dt * 0.5) c.hd += r.gauss() * 1.2;
            if (r.next() < dt * 0.2) c.hd = Math.atan2(e.z - c.z, e.x - c.x) + r.gauss() * 0.5;
            sp *= 0.6;
          }
        }
      } else {
        if (r.next() < dt * 0.4) c.hd += r.gauss() * 1.0;
        // bitten beetles and caterpillars try to escape
        if (this.time - c.lastBit < 2) { sp *= 1.4; if (c.kind === 'beetle' && c.biters > 3 && !c.leaving && r.next() < dt * 0.05) c.leaving = true; }
      }
      // move
      if (sp > 0) {
        const want = Math.atan2(tz - c.z, tx - c.x);
        let d = want - c.hd;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        c.hd += Math.max(-dt * 3, Math.min(dt * 3, d));
        // slowed by biting ants
        const drag = 1 / (1 + c.biters * (c.kind === 'spider' ? 0.25 : 0.35));
        const step = sp * drag * dt;
        c.x += Math.cos(c.hd) * step; c.z += Math.sin(c.hd) * step;
        if (!c.leaving) {
          if (c.x < 1.5 || c.x > W - 1.5) c.hd = Math.PI - c.hd;
          c.x = Math.max(c.leaving ? -5 : 1.5, Math.min(c.leaving ? W + 5 : W - 1.5, c.x));
        }
        if (c.z > -1 || c.z < -SURF_D + 1.5) { c.hd = -c.hd; c.z = Math.max(-SURF_D + 1.5, Math.min(-1, c.z)); }
        for (const s of this.stones) {
          const dx = c.x - s.x, dz = c.z - s.z, dd = Math.hypot(dx, dz);
          if (dd < s.r + c.r * 0.6) { c.x = s.x + dx / dd * (s.r + c.r * 0.6); c.z = s.z + dz / dd * (s.r + c.r * 0.6); c.hd += 0.5; }
        }
        c.walk += step;
      }
      c.y = this.world.surfaceH(Math.max(0, Math.min(W, c.x)), c.z);
      // passive creatures near foragers get noticed too
      if (!c.leaving) P.depositS(P_ALARM, c.x, c.z, (c.kind === 'spider' ? 1.2 : 0.35) * dt * (c.biters > 0 ? 3 : 1));
      const dn = Math.hypot(c.x - e.x, c.z - e.z);
      if (dn < 18 && !c.leaving) alarmNearNest = Math.max(alarmNearNest, (c.kind === 'spider' ? 3 : 1.4) * (1 - dn / 18) + c.biters * 0.2);
    }
    this.surfaceAlarm = alarmNearNest;
    // alarm near the nest mouth seeps down the shaft
    if (alarmNearNest > 0.2) {
      for (const en of this.entrances) this.pher.depositU(U_ALARM, en.cellX + 0.5, en.cellY + 0.5, alarmNearNest * dt * 6);
    }
    if (this.tick % 40 === 0) this.creatures = this.creatures.filter((c) => c.alive);
  },
};
