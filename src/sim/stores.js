// Structure-of-arrays storage for ants, items and brood. Keeping per-agent
// data in typed arrays keeps the per-tick loop cache friendly and avoids
// thousands of small JS objects.
import { MAX_ANTS, MAX_ITEMS, MAX_BROOD, S_FREE } from './constants.js';

export class Ants {
  constructor(n = MAX_ANTS) {
    this.n = n;
    this.hi = 0;       // highest used slot + 1
    this.count = 0;
    this.nextId = 1;
    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.z = f();
    this.px = f(); this.py = f(); this.pz = f();
    this.hd = f();        // heading (xy plane underground, xz plane on the surface)
    this.walk = f();      // accumulated walking distance (drives leg animation)
    this.age = f();       // days
    this.life = f();      // lifespan, days
    this.energy = f();
    this.health = f();
    this.timer = f();
    this.tx = f(); this.ty = f();
    this.trail = f();     // seconds since last trail event
    this.lane = f();
    this.thF = f(); this.thN = f(); this.thD = f(); this.thC = f();
    this.memX = f(); this.memZ = f();
    this.pause = f();
    this.stuck = f();
    this.alive = new Uint8Array(n);
    this.caste = new Uint8Array(n);
    this.task = new Uint8Array(n);
    this.sub = new Uint8Array(n);
    this.surf = new Uint8Array(n);
    this.mem = new Uint8Array(n);
    this.field = new Uint8Array(n);   // nav field being followed
    this.moving = new Uint8Array(n);  // 1 while walking (for animation)
    this.carry = new Int32Array(n).fill(-1);
    this.tgt = new Int32Array(n).fill(-1);
    this.key = new Int32Array(n).fill(-1);   // cached-path key
    this.id = new Int32Array(n);
    this.free = [];
  }

  alloc() {
    let i;
    if (this.free.length) i = this.free.pop();
    else if (this.hi < this.n) i = this.hi++;
    else return -1;
    this.alive[i] = 1;
    this.count++;
    this.id[i] = this.nextId++;
    this.carry[i] = -1; this.tgt[i] = -1; this.key[i] = -1;
    this.task[i] = 0; this.sub[i] = 0; this.mem[i] = 0; this.surf[i] = 0;
    this.timer[i] = 0; this.pause[i] = 0; this.stuck[i] = 0; this.trail[i] = 0; this.walk[i] = 0;
    return i;
  }

  release(i) {
    this.alive[i] = 0;
    this.count--;
    this.free.push(i);
  }
}

export class Items {
  constructor(n = MAX_ITEMS) {
    this.n = n;
    this.hi = 0;
    this.count = 0;
    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.z = f(); this.rot = f(); this.age = f();
    this.kind = new Uint8Array(n);
    this.state = new Uint8Array(n);
    this.owner = new Int32Array(n).fill(-1);   // carrying ant
    this.chamber = new Int16Array(n).fill(-1);
    this.cell = new Int32Array(n).fill(-1);    // floor cell used for stacking
    this.claim = new Int32Array(n).fill(-1);
    this.free = [];
  }

  alloc(kind, state) {
    let i;
    if (this.free.length) i = this.free.pop();
    else if (this.hi < this.n) i = this.hi++;
    else return -1;
    this.kind[i] = kind;
    this.state[i] = state;
    this.owner[i] = -1; this.chamber[i] = -1; this.cell[i] = -1; this.claim[i] = -1;
    this.age[i] = 0;
    this.count++;
    return i;
  }

  release(i) {
    if (this.state[i] === S_FREE) return;
    this.state[i] = S_FREE;
    this.count--;
    this.free.push(i);
  }
}

export const B_EGG = 0, B_LARVA = 1, B_PUPA = 2;
export const BROOD_NAMES = ['Egg', 'Larva', 'Pupa'];

export class Brood {
  constructor(n = MAX_BROOD) {
    this.n = n;
    this.hi = 0;
    this.count = 0;
    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.z = f(); this.rot = f();
    this.dev = f();       // 0..1 progress within the current stage
    this.fed = f();       // food buffer (larvae)
    this.protein = f();   // protein received (drives caste)
    this.starve = f();
    this.alive = new Uint8Array(n);
    this.stage = new Uint8Array(n);
    this.carried = new Uint8Array(n);
    this.carrier = new Int32Array(n).fill(-1);
    this.claim = new Int32Array(n).fill(-1);
    this.chamber = new Int16Array(n).fill(-1);
    this.cell = new Int32Array(n).fill(-1);
    this.free = [];
  }

  alloc() {
    let i;
    if (this.free.length) i = this.free.pop();
    else if (this.hi < this.n) i = this.hi++;
    else return -1;
    this.alive[i] = 1;
    this.count++;
    this.stage[i] = 0; this.dev[i] = 0; this.fed[i] = 0; this.protein[i] = 0; this.starve[i] = 0;
    this.carried[i] = 0; this.carrier[i] = -1; this.claim[i] = -1; this.chamber[i] = -1; this.cell[i] = -1;
    return i;
  }

  release(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.count--;
    this.free.push(i);
  }
}
