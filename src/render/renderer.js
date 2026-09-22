// Scene assembly and per-frame rendering. Reads simulation state directly;
// never mutates it (except the selection, via the UI).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { W, H, SURF_D, MAJOR } from '../sim/constants.js';
import { Terrain } from './terrain.js';
import { AntsView } from './antsView.js';
import { Decor } from './decor.js';
import { Life } from './life.js';
import { Sky } from './sky.js';
import { Overlays } from './overlays.js';
import { CameraRig } from './cameraRig.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 1, 4000);
    this.rig = new CameraRig(this.camera, canvas);
    this.sky = new Sky(this.scene);
    this.opts = { pheromones: false, graph: false, roles: false, labels: true, bloom: true, simSpeed: 1 };
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.time = 0;
    this.view = { x0: 0, x1: W, y0: 0, y1: H, ppu: 4 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setSim(sim, keepCamera = false) {
    if (this.terrain) { this.terrain.dispose(); this.decor.dispose(); this.life.dispose(); this.overlays.dispose(); }
    this.sim = sim;
    this.terrain = new Terrain(this.scene, sim);
    this.decor = new Decor(this.scene, sim);
    this.life = new Life(this.scene, sim);
    this.overlays = new Overlays(this.scene, sim, this.terrain);
    if (!this.ants) this.ants = new AntsView(this.scene, sim);
    else this.ants.setSim(sim);
    const g = sim.world.groundF[Math.floor(W / 2)];
    this.groundY = g;
    if (!keepCamera) {
      // open on the nest: close enough to see individual ants
      const e = sim.entrances[0];
      const ch = sim.chambers[0];
      this.rig.focus(e.x, ch.cy + (e.cellY - ch.cy) * 0.42, 105);
      this.rig.target.copy(this.rig.goal);
      this.rig.target.y += 10;
      this.rig.dist = 170;
      this.rig.goalPitch = 0.16;
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  computeView() {
    const c = this.camera;
    const fov = THREE.MathUtils.degToRad(c.fov);
    const hh = Math.tan(fov / 2) * this.rig.dist;
    const hw = hh * c.aspect;
    const t = this.rig.target;
    this.view.x0 = t.x - hw * 1.1; this.view.x1 = t.x + hw * 1.1;
    this.view.y0 = t.y - hh * 1.25; this.view.y1 = t.y + hh * 1.25;
    this.view.ppu = this.canvas.clientHeight / (2 * hh);
  }

  render(alpha, dt) {
    const sim = this.sim;
    this.time += dt;
    this.rig.update(dt);
    this.computeView();
    const tod = sim.timeOfDay();
    this.sky.update(tod, sim.weather, this.time, this.groundY, this.camera);
    this.terrain.update(dt);
    this.decor.update(this.time, sim.weather.wind);
    this.life.update(dt, this.time, this.sky.night);
    this.ants.update(alpha, this.time, this.view, this.opts);
    this.overlays.update(dt, this.opts);
    this.renderer.toneMappingExposure = 1.0 + this.sky.night * 0.25;
    this.renderer.info.reset();
    if (this.opts.bloom) {
      this.bloom.strength = 0.28 + this.sky.night * 0.35;
      this.composer.render(dt);
    } else this.renderer.render(this.scene, this.camera);
  }

  // Screen-space picking (cheaper and more forgiving than raycasting instances)
  project(x, y, z, out) {
    const v = this._v || (this._v = new THREE.Vector3());
    v.set(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    out.x = (v.x + 1) / 2 * r.width + r.left;
    out.y = (1 - v.y) / 2 * r.height + r.top;
    out.z = v.z;
    return out;
  }

  pick(cx, cy) {
    const sim = this.sim, A = sim.ants, av = this.ants;
    const p = { x: 0, y: 0, z: 0 };
    let best = null, bd = 22 * 22;
    const consider = (type, id, x, y, z, bonus = 0) => {
      this.project(x, y, z, p);
      if (p.z > 1) return;
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2 - bonus;
      if (d < bd) { bd = d; best = { type, id }; }
    };
    for (let i = 0; i < A.hi; i++) if (A.alive[i]) consider('ant', i, av.posX[i], av.posY[i], av.posZ[i]);
    if (sim.queen.alive && av.queenPos) consider('queen', -2, ...av.queenPos, 150);
    for (const c of sim.creatures) if (c.alive) consider('creature', c.id, c.x, c.y + 0.6, c.z, 300);
    for (const s of sim.sources) if (s.alive) consider('source', s.id, s.x, sim.world.surfaceH(s.x, s.z) + s.r * 0.5, s.z, 200);
    if (best) return best;
    // chambers: point on the glass plane
    const wp = this.rig.screenToPlane(cx, cy);
    const ch = sim.chamberAt(wp.x, wp.y);
    if (ch) return { type: 'chamber', id: ch.id };
    return null;
  }

  stats() {
    const info = this.renderer.info;
    return { calls: info.render.calls, tris: info.render.triangles, visible: this.ants.visibleAnts, chunks: this.terrain.rebuilt };
  }
}
