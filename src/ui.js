// DOM heads-up display: stats, journal, speed, seed, inspector, labels.
import {
  DAY, MAJOR, TASK_NAMES, ITEM_NAMES, SOURCE_NAMES, T_IDLE, W, TUNNEL,
  R_QUEEN, R_BROOD, R_FOOD, R_WASTE, R_REST,
} from './sim/constants.js';
import { ROLE_CSS } from './render/palette.js';

const $ = (id) => document.getElementById(id);

function fmtTime(t) {
  const day = Math.floor(t / DAY) + 1;
  const tod = ((t / DAY) + 0.3) % 1;
  const mins = Math.floor(tod * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
  return { day, clock: `${hh}:${mm}` };
}

function bar(v, label) {
  const cls = v < 0.25 ? 'bad' : v < 0.5 ? 'warn' : '';
  return `<div class="bar ${cls}" title="${label}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div>`;
}

export class UI {
  constructor(app) {
    this.app = app;
    this.sel = null;
    this.labelPool = [];
    this.lastLog = -1;
    this.timer = 0;
    this.fps = 60;
    this.frames = 0; this.fpsT = 0;
    this.bind();
  }

  bind() {
    const app = this.app;
    document.querySelectorAll('#speed button').forEach((b) => b.addEventListener('click', () => app.setSpeed(Number(b.dataset.speed))));
    document.querySelectorAll('#toggles button[data-opt]').forEach((b) => b.addEventListener('click', () => this.toggle(b.dataset.opt)));
    $('helpBtn').addEventListener('click', () => this.showHelp(true));
    $('helpClose').addEventListener('click', () => this.showHelp(false));
    $('help').addEventListener('click', (e) => { if (e.target.id === 'help') this.showHelp(false); });
    $('restartBtn').addEventListener('click', () => app.restart($('seedInput').value.trim().toUpperCase() || app.sim.seedStr));
    $('newBtn').addEventListener('click', () => app.restart(null));
    $('exRestart').addEventListener('click', () => app.restart(app.sim.seedStr));
    $('exNew').addEventListener('click', () => app.restart(null));
    $('seedInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.target.blur(); app.restart(e.target.value.trim().toUpperCase() || null); } e.stopPropagation(); });
    $('collapseStats').addEventListener('click', () => $('statsPanel').classList.toggle('collapsed'));
    $('collapseJournal').addEventListener('click', () => $('journal').classList.toggle('collapsed'));
    $('journalList').addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (li && li.dataset.ref) this.gotoRef(JSON.parse(li.dataset.ref));
    });
    $('inspector').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') this.select(null);
      if (b.dataset.act === 'follow') this.followSelected();
      if (b.dataset.act === 'focus') this.focusSelected();
    });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key;
      if (k === ' ') { e.preventDefault(); app.setSpeed(app.paused ? app.lastSpeed : 0); }
      else if (k >= '1' && k <= '5') app.setSpeed([1, 2, 4, 10, 20][Number(k) - 1]);
      else if (k === 'p' || k === 'P') this.toggle('pheromones');
      else if (k === 'g' || k === 'G') this.toggle('graph');
      else if (k === 'r' || k === 'R') this.toggle('roles');
      else if (k === 'l' || k === 'L') this.toggle('labels');
      else if (k === 'F3' || k === '`') { e.preventDefault(); this.toggle('perf'); }
      else if (k === 'h' || k === 'H' || k === '?') this.showHelp($('help').classList.contains('hidden'));
      else if (k === 'Escape') { if (app.renderer.rig.follow) app.renderer.rig.follow = null; else this.select(null); this.showHelp(false); }
      else if (k === 'f' || k === 'F') this.followSelected();
      else if (k === 'Home') { app.renderer.rig.follow = null; app.renderer.rig.frameAll(app.renderer.camera.aspect); }
      else if (k === 'n' || k === 'N') { const e0 = app.sim.entrances[0]; app.renderer.rig.follow = null; app.renderer.rig.focus(e0.x, e0.cellY - 8, 70); }
      else if (k.startsWith('Arrow') || 'wasd'.includes(k)) {
        const rig = app.renderer.rig, s = rig.goalDist * 0.08;
        if (k === 'ArrowLeft' || k === 'a') rig.goal.x -= s;
        if (k === 'ArrowRight' || k === 'd') rig.goal.x += s;
        if (k === 'ArrowUp' || k === 'w') rig.goal.y += s;
        if (k === 'ArrowDown' || k === 's') rig.goal.y -= s;
        rig.follow = null; rig.clamp();
      } else if (k === '+' || k === '=') app.renderer.rig.goalDist = Math.max(5, app.renderer.rig.goalDist * 0.8);
      else if (k === '-' || k === '_') app.renderer.rig.goalDist = Math.min(app.renderer.rig.maxDist(), app.renderer.rig.goalDist * 1.25);
    });
    const rig = app.renderer.rig;
    rig.onClick = (x, y) => this.select(app.renderer.pick(x, y));
    rig.onDoubleClick = (x, y) => {
      const p = app.renderer.pick(x, y);
      this.select(p);
      if (p && (p.type === 'ant' || p.type === 'queen' || p.type === 'creature')) this.followSelected();
    };
  }

  reset() {
    this.select(null);
    this.lastLog = -1;
    $('journalList').innerHTML = '';
    $('seedInput').value = this.app.sim.seedStr;
    $('extinct').classList.add('hidden');
    this.syncToggles();
    this.syncSpeed();
  }

  toggle(opt) {
    const o = this.app.renderer.opts;
    o[opt] = !o[opt];
    if (opt === 'perf') $('perf').classList.toggle('hidden', !o.perf);
    this.syncToggles();
    try { localStorage.setItem('formicarium.opts', JSON.stringify(o)); } catch (e) { /* storage unavailable */ }
  }

  syncToggles() {
    const o = this.app.renderer.opts;
    document.querySelectorAll('#toggles button[data-opt]').forEach((b) => b.classList.toggle('on', !!o[b.dataset.opt]));
    $('perf').classList.toggle('hidden', !o.perf);
  }

  syncSpeed() {
    const app = this.app;
    document.querySelectorAll('#speed button').forEach((b) => {
      const s = Number(b.dataset.speed);
      b.classList.toggle('on', app.paused ? s === 0 : s === app.speed);
    });
  }

  showHelp(v) { $('help').classList.toggle('hidden', !v); }

  select(p) {
    const sim = this.app.sim;
    this.sel = p;
    sim.selected = p && p.type === 'ant' ? p.id : p && p.type === 'queen' ? -2 : -1;
    if (p && p.type === 'ant') this.selId = sim.ants.id[p.id];
    sim.selectedDied = null;
    this.deadNote = null;
    if (!p) this.app.renderer.rig.follow = null;
    this.renderInspector();
  }

  followSelected() {
    const app = this.app, sim = app.sim, av = app.renderer.ants, rig = app.renderer.rig;
    const p = this.sel;
    if (!p) return;
    if (p.type === 'ant') {
      const i = p.id;
      rig.follow = () => (sim.ants.alive[i] && sim.ants.id[i] === this.selId ? [av.posX[i], sim.ants.surf[i] ? av.posY[i] + 1 : av.posY[i], 0] : null);
      rig.goalDist = Math.min(rig.goalDist, 38);
    } else if (p.type === 'queen') {
      rig.follow = () => (sim.queen.alive && av.queenPos ? [av.queenPos[0], av.queenPos[1], 0] : null);
      rig.goalDist = Math.min(rig.goalDist, 34);
    } else if (p.type === 'creature') {
      rig.follow = () => { const c = sim.creatureById(p.id); return c && c.alive ? [c.x, c.y + 2, 0] : null; };
      rig.goalDist = Math.min(rig.goalDist, 55);
    } else this.focusSelected();
  }

  focusSelected() {
    const p = this.sel, sim = this.app.sim, rig = this.app.renderer.rig;
    if (!p) return;
    if (p.type === 'chamber') { const ch = sim.chambers[p.id]; rig.follow = null; rig.focus(ch.cx, ch.cy, Math.min(rig.goalDist, 45)); }
    if (p.type === 'source') { const s = sim.sourceById(p.id); if (s) { rig.follow = null; rig.focus(s.x, sim.world.surfaceH(s.x, s.z) + 2, Math.min(rig.goalDist, 50)); } }
  }

  gotoRef(ref) {
    const sim = this.app.sim;
    if (ref.ant !== undefined && sim.ants.alive[ref.ant]) { this.select({ type: 'ant', id: ref.ant }); this.followSelected(); }
    else if (ref.chamber !== undefined) { this.select({ type: 'chamber', id: ref.chamber }); this.focusSelected(); }
    else if (ref.creature !== undefined) { const c = sim.creatureById(ref.creature); if (c && c.alive) { this.select({ type: 'creature', id: ref.creature }); this.followSelected(); } }
  }

  // ------------------------------------------------------------------
  update(dt, perf) {
    this.frames++; this.fpsT += dt;
    if (this.fpsT > 0.5) { this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0; }
    this.updateLabels();
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const app = this.app, sim = app.sim, st = sim.stats;
    const { day, clock } = fmtTime(sim.time);
    const night = sim.isNight();
    const wx = sim.weather.rain > 0.3 ? ' · rain' : sim.weather.heat > 0.5 ? ' · heat wave' : sim.weather.dry > 0 ? ' · dry spell' : '';
    $('clock').textContent = `Day ${day} · ${clock} ${night ? '☾' : '☀'}${wx}`;
    $('sPop').textContent = sim.ants.count;
    $('sBrood').textContent = sim.brood.count;
    $('sFood').textContent = Math.round(sim.stock.total);
    const q = sim.queen;
    $('sQueen').textContent = q.alive ? `${Math.round(q.health * 100)}%` : 'dead';
    $('sQueen').style.color = !q.alive ? 'var(--bad)' : q.health < 0.5 ? 'var(--accent)' : '';
    const r = st.roles;
    $('sDetail').innerHTML = `${st.eggs} eggs · ${st.larvae} larvae · ${st.pupae} pupae · ${st.majors} majors<br>` +
      `<span style="color:${ROLE_CSS[1]}">${r[1]} foraging</span> · <span style="color:${ROLE_CSS[2]}">${r[2]} digging</span> · <span style="color:${ROLE_CSS[3]}">${r[3]} nursing</span> · ${r[0]} resting`;
    this.drawSpark();
    this.updateJournal();
    this.renderInspector();
    this.syncSpeed();
    $('limited').classList.toggle('hidden', !app.limited);
    if (sim.extinct && $('extinct').classList.contains('hidden') && !this.extinctShown) {
      this.extinctShown = true;
      $('extinctText').textContent = `After ${Math.floor(sim.time / DAY) + 1} days the last ants are gone. At its peak the colony had ${st.peak} workers; ${st.born} were raised and ${st.totalDeaths} died.`;
      $('extinct').classList.remove('hidden');
    }
    if (!sim.extinct) this.extinctShown = false;
    if (app.renderer.opts.perf) this.updatePerf(perf);
  }

  drawSpark() {
    const cv = $('spark'), g = cv.getContext('2d');
    const h = this.app.sim.history;
    const w = cv.width, ht = cv.height;
    g.clearRect(0, 0, w, ht);
    const n = h.pop.length;
    if (n < 2) return;
    const max = Math.max(10, ...h.pop, ...h.brood);
    const maxF = Math.max(10, ...h.food);
    const line = (arr, m, color, fill) => {
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const x = (k / (n - 1)) * (w - 2) + 1, y = ht - 2 - (arr[k] / m) * (ht - 6);
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      if (fill) { g.lineTo(w - 1, ht); g.lineTo(1, ht); g.closePath(); g.fillStyle = fill; g.fill(); }
      else { g.strokeStyle = color; g.lineWidth = 1.5; g.stroke(); }
    };
    line(h.pop, max, null, 'rgba(242,180,90,0.22)');
    line(h.food, maxF, 'rgba(127,216,143,0.8)');
    line(h.brood, max, 'rgba(246,241,228,0.75)');
    line(h.pop, max, '#f2b45a');
  }

  updateJournal() {
    const sim = this.app.sim;
    if (sim.logVersion === this.lastLog) return;
    this.lastLog = sim.logVersion;
    const items = sim.log.slice(-7);
    $('journalList').innerHTML = items.map((e) => {
      const { day, clock } = fmtTime(e.t);
      const ref = e.ref ? ` data-ref='${JSON.stringify(e.ref)}'` : '';
      return `<li class="${e.kind}${e.ref ? ' link' : ''}"${ref}><time>D${day} ${clock}</time><span>${e.text}</span></li>`;
    }).join('');
  }

  updatePerf(perf) {
    const r = this.app.renderer.stats();
    const sim = this.app.sim;
    $('perf').textContent =
      `FPS            ${this.fps.toFixed(0)}\n` +
      `Ants           ${sim.ants.count}\n` +
      `Visible ants   ${r.visible}\n` +
      `Sim steps/s    ${perf.stepsPerSec.toFixed(0)}\n` +
      `Sim ms/frame   ${perf.simMs.toFixed(2)}\n` +
      `Render ms      ${perf.renderMs.toFixed(2)}\n` +
      `Draw calls     ${r.calls}\n` +
      `Triangles      ${(r.tris / 1000).toFixed(1)}k\n` +
      `Pheromone cells ${sim.pher.active}\n` +
      `Nav BFS/s      ${perf.navPerSec.toFixed(1)}\n` +
      `Chunk rebuilds ${r.chunks}\n` +
      `Items          ${sim.items.count}\n` +
      `Brood          ${sim.brood.count}`;
  }

  renderInspector() {
    const el = $('inspector'), sim = this.app.sim, p = this.sel;
    if (!p) {
      if (sim.selectedDied || this.deadNote) {
        this.deadNote = this.deadNote || sim.selectedDied;
        el.classList.remove('hidden');
        el.innerHTML = `<h3>Worker #${this.deadNote.id}</h3><div class="kind">Died of ${this.deadNote.cause}</div><div class="row"><button data-act="close">Close</button></div>`;
        return;
      }
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    let html = '';
    const follow = this.app.renderer.rig.follow ? 'Following' : 'Follow';
    if (p.type === 'ant') {
      const A = sim.ants, i = p.id;
      if (!A.alive[i] || A.id[i] !== this.selId) {
        const died = sim.selectedDied;
        this.sel = null;
        sim.selected = -1;
        this.deadNote = died || { id: this.selId, cause: 'unknown causes' };
        this.renderInspector();
        return;
      }
      const task = A.task[i];
      const carry = A.carry[i] >= 0 ? ITEM_NAMES[sim.items.kind[A.carry[i]]] : this.carriedBrood(i) || 'Nothing';
      const ch = !A.surf[i] ? sim.chamberAt(A.x[i], A.y[i]) : null;
      const where = A.surf[i] ? 'Surface' : ch ? sim.chamberName(ch) : 'Tunnels';
      html = `<h3>${A.caste[i] === MAJOR ? 'Major' : 'Worker'} #${A.id[i]}</h3>
        <div class="kind"><span class="role-dot" style="background:${ROLE_CSS[task]}"></span>${sim.roleOf(i)}</div>
        <dl>
          <dt>Age</dt><dd>${A.age[i].toFixed(1)} days</dd>
          <dt>Activity</dt><dd>${sim.activityText(i)}</dd>
          <dt>Carrying</dt><dd>${carry}</dd>
          <dt>Location</dt><dd>${where}</dd>
          ${A.mem[i] ? `<dt>Knows food at</dt><dd>${Math.round(Math.hypot(A.memX[i] - sim.entrances[0].x, A.memZ[i] - sim.entrances[0].z) * 3)} mm</dd>` : ''}
        </dl>
        <div class="note">Health</div>${bar(A.health[i], 'health')}
        <div class="note">Energy</div>${bar(A.energy[i], 'energy')}
        <div class="row"><button data-act="follow" class="${this.app.renderer.rig.follow ? 'on' : ''}">${follow}</button><button data-act="close">Close</button></div>`;
    } else if (p.type === 'queen') {
      const q = sim.queen;
      html = `<h3>The Queen</h3><div class="kind">${q.alive ? 'Founder and mother of every ant here' : 'Deceased'}</div>
        <dl>
          <dt>Age</dt><dd>${q.age.toFixed(1)} days</dd>
          <dt>Eggs laid</dt><dd>${q.eggs}</dd>
          <dt>Laying rate</dt><dd>${Math.round(q.rate || 0)} / day</dd>
          <dt>Brood</dt><dd>${sim.stats.eggs}e · ${sim.stats.larvae}l · ${sim.stats.pupae}p</dd>
          <dt>Colony food</dt><dd>${Math.round(sim.stock.total)}</dd>
        </dl>
        <div class="note">Health</div>${bar(q.health, 'health')}
        <div class="note">Nourishment</div>${bar(Math.min(1, q.fed), 'fed')}
        <div class="note">Laying slows when she is hungry, food runs low, or the colony is stressed.</div>
        <div class="row"><button data-act="follow">${follow}</button><button data-act="close">Close</button></div>`;
    } else if (p.type === 'chamber') {
      const ch = sim.chambers[p.id];
      const pct = Math.round(Math.min(1, ch.dug / Math.max(1, ch.interior.length)) * 100);
      const food = ch.items.filter((k) => sim.items.kind[k] <= 4).length;
      const waste = ch.items.length - food;
      html = `<h3>${sim.chamberName(ch)}</h3><div class="kind">${ch.active ? 'In use' : `Under construction · ${pct}% dug`}${ch.flooded ? ' · flooded!' : ''}</div>
        <dl>
          <dt>Size</dt><dd>${ch.dug} cells</dd>
          <dt>Depth</dt><dd>${Math.round((sim.world.ground[Math.floor(ch.cx)] - ch.cy) * 3)} mm</dd>
          ${ch.broodCount ? `<dt>Brood</dt><dd>${ch.broodCount}</dd>` : ''}
          ${food ? `<dt>Stored food</dt><dd>${food}</dd>` : ''}
          ${waste ? `<dt>Refuse</dt><dd>${waste}</dd>` : ''}
          <dt>Dug on</dt><dd>Day ${Math.floor(ch.born / DAY) + 1}</dd>
        </dl>
        <div class="note">${this.chamberBlurb(ch)}</div>
        <div class="row"><button data-act="focus">Focus</button><button data-act="close">Close</button></div>`;
    } else if (p.type === 'source') {
      const s = sim.sourceById(p.id);
      if (!s || !s.alive) { html = `<h3>Gone</h3><div class="kind">Nothing is left of this food.</div><div class="row"><button data-act="close">Close</button></div>`; }
      else {
        html = `<h3>${SOURCE_NAMES[s.kind]}</h3><div class="kind">${s.found ? 'Discovered by the colony' : 'Not yet discovered'}</div>
          <dl><dt>Remaining</dt><dd>${Math.round(s.amount)} portions</dd>
          ${s.kind === 4 ? `<dt>Ants hauling</dt><dd>${s.attached}${s.atNest ? ' (at nest)' : ''}</dd>` : ''}</dl>
          ${bar(s.amount / s.max, 'remaining')}
          <div class="row"><button data-act="focus">Focus</button><button data-act="close">Close</button></div>`;
      }
    } else if (p.type === 'creature') {
      const c = sim.creatureById(p.id);
      if (!c || !c.alive) { html = `<h3>Gone</h3><div class="kind">It left the terrarium, or became food.</div><div class="row"><button data-act="close">Close</button></div>`; }
      else {
        const name = { spider: 'Hunting spider', beetle: 'Ground beetle', caterpillar: 'Caterpillar' }[c.kind];
        const state = c.leaving ? 'Leaving' : c.eatTimer > 0 ? 'Eating' : c.biters > 0 ? `Under attack by ${c.biters} ants` : c.kind === 'spider' ? 'Hunting' : 'Wandering';
        html = `<h3>${name}</h3><div class="kind">${state}</div>
          <dl>${c.kills ? `<dt>Ants caught</dt><dd>${c.kills}</dd>` : ''}</dl>
          <div class="note">Health</div>${bar(c.hp / c.maxHp, 'hp')}
          <div class="row"><button data-act="follow">${follow}</button><button data-act="close">Close</button></div>`;
      }
    }
    el.innerHTML = html;
  }

  carriedBrood(i) {
    const B = this.app.sim.brood;
    for (let b = 0; b < B.hi; b++) if (B.alive[b] && B.carried[b] && B.carrier[b] === i) return ['Egg', 'Larva', 'Pupa'][B.stage[b]];
    return null;
  }

  chamberBlurb(ch) {
    if (ch.role & R_QUEEN) return 'Where the queen lives and lays her eggs. The colony started here.';
    if (ch.role & R_BROOD) return 'Nurses carry eggs here and feed the growing larvae.';
    if (ch.role & R_FOOD) return 'Foragers stockpile food here; hungry workers come to eat.';
    if (ch.role & R_WASTE) return 'Dead nestmates and refuse are dumped here, away from the brood.';
    if (ch.role & R_REST) return 'Idle workers gather here between jobs.';
    return '';
  }

  updateLabels() {
    const app = this.app, sim = app.sim, r = app.renderer;
    const holder = $('labels');
    const show = r.opts.labels && r.view.ppu > 2.2;
    let n = 0;
    const p = { x: 0, y: 0, z: 0 };
    const place = (x, y, z, html, cls) => {
      r.project(x, y, z, p);
      if (p.z > 1 || p.x < -50 || p.y < -20 || p.x > innerWidth + 50 || p.y > innerHeight + 20) return;
      let el = this.labelPool[n];
      if (!el) { el = document.createElement('div'); holder.appendChild(el); this.labelPool.push(el); }
      el.className = 'lbl ' + cls;
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      el.style.display = '';
      n++;
    };
    if (show) {
      for (const ch of sim.chambers) {
        let extra = '';
        if (!ch.active) extra = `<small>${Math.round(ch.dug / Math.max(1, ch.interior.length) * 100)}%</small>`;
        else if (ch.role & R_BROOD && ch.broodCount) extra = `<small>${ch.broodCount} brood</small>`;
        else if (ch.role & R_FOOD && ch.items.length) extra = `<small>${ch.items.length} food</small>`;
        else if (ch.role & R_WASTE && ch.items.length) extra = `<small>${ch.items.length} refuse</small>`;
        if (!ch.active && ch.dug === 0) continue;
        place(ch.cx, ch.cy + ch.ry + 0.8, 0.4, sim.chamberName(ch) + extra, ch.active ? '' : 'building');
      }
      if (r.view.ppu > 9) {
        for (const s of sim.sources) {
          if (!s.alive) continue;
          place(s.x, sim.world.surfaceH(s.x, s.z) + s.r * 2 + 1.2, s.z, `${SOURCE_NAMES[s.kind]}<small>${Math.round(s.amount / s.max * 100)}%</small>`, 'src');
        }
      }
    }
    for (let k = n; k < this.labelPool.length; k++) this.labelPool[k].style.display = 'none';
  }
}
