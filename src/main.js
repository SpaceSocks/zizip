// Entry point: fixed-timestep simulation loop + rendering.
import { Sim } from './sim/sim.js';
import { TICK } from './sim/constants.js';
import { randomSeedString } from './sim/rng.js';
import { Renderer } from './render/renderer.js';
import { UI } from './ui.js';

const SIM_BUDGET_MS = 11;   // max simulation time per frame before we let it fall behind

function seedFromUrl() {
  const m = location.hash.match(/seed=([A-Za-z0-9]{1,16})/);
  return m ? m[1].toUpperCase() : null;
}

class App {
  constructor() {
    const canvas = document.getElementById('scene');
    this.renderer = new Renderer(canvas);
    try {
      const saved = JSON.parse(localStorage.getItem('formicarium.opts') || 'null');
      if (saved) Object.assign(this.renderer.opts, saved);
    } catch (e) { /* storage unavailable */ }
    this.speed = 1;
    this.lastSpeed = 1;
    this.paused = false;
    this.limited = false;
    this.acc = 0;
    this.perf = { stepsPerSec: 0, simMs: 0, renderMs: 0, navPerSec: 0 };
    this.stepCount = 0; this.perfT = 0; this.navStart = 0;
    this.sim = new Sim(seedFromUrl() || randomSeedString());
    this.renderer.setSim(this.sim);
    this.ui = new UI(this);
    this.ui.reset();
    this.updateHash();
    let firstVisit = true;
    try { firstVisit = !localStorage.getItem('formicarium.seenHelp'); localStorage.setItem('formicarium.seenHelp', '1'); } catch (e) { /* ignore */ }
    if (firstVisit) this.ui.showHelp(true);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  updateHash() {
    history.replaceState(null, '', `#seed=${this.sim.seedStr}`);
  }

  restart(seed) {
    this.sim = new Sim(seed || randomSeedString());
    this.renderer.setSim(this.sim);
    this.acc = 0;
    this.ui.reset();
    this.updateHash();
  }

  setSpeed(s) {
    if (s === 0) { this.paused = true; }
    else { this.paused = false; this.speed = s; this.lastSpeed = s; }
    this.renderer.opts.simSpeed = this.paused ? 0 : this.speed;
    this.ui.syncSpeed();
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const sim = this.sim;
    const t0 = performance.now();
    let steps = 0;
    if (!this.paused && !sim.extinct) {
      this.acc += dt * this.speed;
      this.limited = false;
      while (this.acc >= TICK) {
        sim.step();
        this.acc -= TICK;
        steps++;
        if (performance.now() - t0 > SIM_BUDGET_MS) { this.acc = Math.min(this.acc, TICK); this.limited = this.speed > 2; break; }
      }
    }
    const t1 = performance.now();
    const alpha = this.paused ? 1 : Math.min(1, this.acc / TICK);
    this.renderer.render(alpha, dt);
    const t2 = performance.now();
    // perf bookkeeping
    this.stepCount += steps;
    this.perfT += dt;
    const k = 0.1;
    this.perf.simMs += (t1 - t0 - this.perf.simMs) * k;
    this.perf.renderMs += (t2 - t1 - this.perf.renderMs) * k;
    if (this.perfT >= 1) {
      this.perf.stepsPerSec = this.stepCount / this.perfT;
      this.perf.navPerSec = (sim.nav.calcs - this.navStart) / this.perfT;
      this.navStart = sim.nav.calcs;
      this.stepCount = 0; this.perfT = 0;
    }
    this.ui.update(dt, this.perf);
    requestAnimationFrame((t) => this.frame(t));
  }
}

window.app = new App();
