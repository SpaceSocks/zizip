// Food sources and other creatures on the surface, plus ambient life
// (flies around food, fireflies at night).
import * as THREE from 'three';
import { W, SURF_D, F_BERRY, F_FRUIT, F_INSECT, F_SUGAR, F_CARCASS } from '../sim/constants.js';
import { Rng } from '../sim/rng.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, ...extra });

function beetleModel(shell = '#23301f', legs = '#1a1a14', scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), flat(shell, { roughness: 0.25, metalness: 0.35 }));
  body.scale.set(1.25, 0.55, 0.85);
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 4), flat(legs));
  head.position.set(1.3, 0.45, 0);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.05, 0.05), flat('#0d120b'));
  seam.position.set(0, 1.08, 0);
  g.add(body, head, seam);
  g.userData.legs = [];
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.Group();
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 1.1, 3), flat(legs));
      seg.position.set(0, -0.2, 0.45 * s);
      seg.rotation.x = 1.0 * s;
      leg.add(seg);
      leg.position.set(0.6 - k * 0.6, 0.45, 0.55 * s);
      g.add(leg);
      g.userData.legs.push({ leg, s, k });
    }
  }
  g.scale.setScalar(scale);
  return g;
}

function spiderModel() {
  const g = new THREE.Group();
  const dark = flat('#2b2420', { roughness: 0.5 });
  const abd = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), flat('#3d3128', { roughness: 0.45 }));
  abd.scale.set(1.1, 0.8, 0.9); abd.position.set(-1.1, 0.9, 0);
  const ceph = new THREE.Mesh(new THREE.SphereGeometry(0.65, 7, 5), dark);
  ceph.scale.set(1.1, 0.7, 0.9); ceph.position.set(0.3, 0.75, 0);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 4, 10), flat('#8a6a4a'));
  band.rotation.y = Math.PI / 2; band.position.set(-1.1, 0.95, 0); band.scale.set(1, 0.9, 1);
  g.add(abd, ceph, band);
  const eyeM = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#3a0a0a', roughness: 0.1, metalness: 0.6 });
  for (const [y, z] of [[0.95, 0.18], [0.95, -0.18], [1.05, 0.3], [1.05, -0.3]]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), eyeM);
    e.position.set(0.95, y, z); g.add(e);
  }
  g.userData.legs = [];
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 0; k < 4; k++) {
      const leg = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 1.6, 3), dark);
      upper.geometry.translate(0, 0.8, 0);
      upper.rotation.x = -1.0 * s;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.035, 1.9, 3), dark);
      lower.geometry.translate(0, -0.95, 0);
      lower.position.set(0, 0.8 * Math.cos(1.0), 1.35 * s);
      lower.rotation.x = 0.35 * s;
      leg.add(upper, lower);
      leg.position.set(0.5 - k * 0.3, 0.75, 0.3 * s);
      leg.rotation.y = (k - 1.5) * 0.45 * -s;
      g.add(leg);
      g.userData.legs.push({ leg, s, k });
    }
  }
  return g;
}

function caterpillarModel() {
  const g = new THREE.Group();
  g.userData.segs = [];
  for (let k = 0; k < 9; k++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 - Math.abs(k - 3) * 0.015, 1), flat(k === 0 ? '#3f5a1d' : k % 2 ? '#86b33c' : '#6c9a2e', { roughness: 0.7 }));
    m.position.set(-k * 0.55, 0.42, 0);
    g.add(m);
    g.userData.segs.push(m);
  }
  const stripe = flat('#e8d24a');
  for (let k = 1; k < 9; k += 2) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 3), stripe);
    d.position.set(-k * 0.55, 0.8, 0);
    g.add(d);
    g.userData.segs.push(d);
  }
  return g;
}

export class Life {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sourceObjs = new Map();
    this.creatureObjs = new Map();
    this.rng = new Rng(12345);
    this.buildFlies();
    this.buildFireflies();
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(this.group);
  }

  makeSource(s) {
    const g = new THREE.Group();
    const rr = new Rng(s.id * 97 + 3);
    if (s.kind === F_BERRY) {
      const colors = ['#b3172f', '#5b1f6e', '#c4302a', '#2a2d6b'];
      const c = colors[s.variant % colors.length];
      const n = s.variant === 1 || s.variant === 3 ? 5 : 1; // blackberry-ish clusters or a single berry
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(n > 1 ? 0.55 : 1, 1), flat(c, { roughness: 0.25 }));
        b.position.set(n > 1 ? rr.range(-0.4, 0.4) : 0, n > 1 ? 0.5 + rr.range(0, 0.4) : 0.85, n > 1 ? rr.range(-0.4, 0.4) : 0);
        b.castShadow = true;
        g.add(b);
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 4), flat('#4b5e2a'));
      stem.position.set(0.1, 1.9, 0); stem.rotation.z = 0.4;
      g.add(stem);
    } else if (s.kind === F_FRUIT) {
      // an apple wedge: red skin, cream flesh
      const wedge = new THREE.CylinderGeometry(2, 2, 1.5, 9, 1, false, 0, Math.PI * 0.8);
      const m = new THREE.Mesh(wedge, [flat('#c8352c', { roughness: 0.35 }), flat('#f4e3b1'), flat('#f4e3b1')]);
      m.rotation.x = Math.PI / 2; m.rotation.z = rr.range(0, 6);
      m.position.y = 0.75;
      m.castShadow = true;
      const seed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), flat('#4a2c17'));
      seed.position.set(0.3, 1.5, 0.3);
      g.add(m, seed);
    } else if (s.kind === F_INSECT) {
      const b = beetleModel(rr.pick(['#3b5f2a', '#4b3a24', '#2d3a4a']), '#231d18', 0.7);
      b.rotation.z = Math.PI; b.position.y = 0.8;
      g.add(b);
    } else if (s.kind === F_SUGAR) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffcf70', transparent: true, opacity: 0.78, roughness: 0.05, metalness: 0.1, emissive: '#ff9a20', emissiveIntensity: 0.55 }));
      d.scale.set(1, 0.55, 1);
      g.add(d);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff7dd' }));
      hl.position.set(-0.3, 0.45, 0.3);
      g.add(hl);
    } else if (s.kind === F_CARCASS) {
      let b;
      if (s.from === 'spider') { b = spiderModel(); b.scale.setScalar(0.65); }
      else if (s.from === 'caterpillar') { b = caterpillarModel(); b.scale.setScalar(0.9); }
      else b = beetleModel(rr.pick(['#2f3a1f', '#3b2a1c', '#1f2a36']), '#1a1511', 1.05);
      if (s.from !== 'caterpillar') { b.rotation.z = Math.PI; b.position.y = 0.9; }
      g.add(b);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    return { g, s, base: s.kind === F_CARCASS ? s.r / 1.3 : s.r };
  }

  makeCreature(c) {
    let g;
    if (c.kind === 'spider') g = spiderModel();
    else if (c.kind === 'beetle') g = beetleModel('#1f2b33', '#141414', 1.05);
    else g = caterpillarModel();
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    return { g, c };
  }

  buildFlies() {
    const geo = new THREE.IcosahedronGeometry(0.22, 0);
    geo.scale(1.3, 0.8, 0.8);
    this.flies = new THREE.InstancedMesh(geo, flat('#1d2226', { metalness: 0.5, roughness: 0.3 }), 24);
    const wing = new THREE.PlaneGeometry(0.5, 0.25);
    this.flyWings = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: '#dfe9ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), 48);
    this.flies.frustumCulled = this.flyWings.frustumCulled = false;
    this.flies.count = 0; this.flyWings.count = 0;
    this.flyState = [];
    this.group.add(this.flies, this.flyWings);
  }

  buildFireflies() {
    const n = 40;
    const geo = new THREE.BufferGeometry();
    this.ffPos = new Float32Array(n * 3);
    this.ffPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ffPos[i * 3] = this.rng.range(2, W - 2);
      this.ffPos[i * 3 + 1] = 0;
      this.ffPos[i * 3 + 2] = -this.rng.range(2, SURF_D - 2);
      this.ffPhase[i] = this.rng.range(0, 100);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.ffPos, 3));
    const tex = glowTexture();
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, color: '#d8ff7a', size: 1.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.fireflies.frustumCulled = false;
    this.group.add(this.fireflies);
  }

  update(dt, time, night) {
    const sim = this.sim, w = sim.world;
    // sources
    const seen = new Set();
    for (const s of sim.sources) {
      if (!s.alive) continue;
      seen.add(s.id);
      let o = this.sourceObjs.get(s.id);
      if (!o) { o = this.makeSource(s); this.sourceObjs.set(s.id, o); }
      const frac = Math.max(0.15, Math.cbrt(s.amount / s.max));
      const sc = o.base * frac;
      o.g.scale.setScalar(sc);
      const dropY = s.drop > 0 ? s.drop * s.drop * 30 : 0;
      o.g.position.set(s.x, w.surfaceH(s.x, s.z) + dropY, s.z);
      o.g.rotation.y = s.rot;
    }
    for (const [id, o] of this.sourceObjs) {
      if (!seen.has(id)) { this.group.remove(o.g); o.g.traverse((m) => m.geometry && m.geometry.dispose()); this.sourceObjs.delete(id); }
    }
    // creatures
    const seenC = new Set();
    for (const c of sim.creatures) {
      if (!c.alive) continue;
      seenC.add(c.id);
      let o = this.creatureObjs.get(c.id);
      if (!o) { o = this.makeCreature(c); this.creatureObjs.set(c.id, o); o.x = c.x; o.z = c.z; o.hd = c.hd; }
      // smooth towards the simulated pose
      const k = Math.min(1, dt * 12);
      o.x += (c.x - o.x) * k; o.z += (c.z - o.z) * k;
      let dh = c.hd - o.hd;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      o.hd += dh * k;
      o.g.position.set(o.x, w.surfaceH(Math.max(0, Math.min(W, o.x)), o.z), o.z);
      o.g.rotation.y = -o.hd;
      const ph = c.walk * (c.kind === 'spider' ? 3.2 : 4);
      if (o.g.userData.legs) {
        for (const { leg, s, k: kk } of o.g.userData.legs) {
          const alt = (kk + (s > 0 ? 1 : 0)) % 2 ? Math.PI : 0;
          leg.rotation.z = Math.sin(ph + alt) * 0.35;
          leg.position.y = (c.kind === 'spider' ? 0.75 : 0.45) + Math.max(0, Math.cos(ph + alt)) * 0.12;
        }
      }
      if (o.g.userData.segs && c.kind === 'caterpillar') {
        const segs = o.g.userData.segs;
        for (let k2 = 0; k2 < 9; k2++) {
          const m = segs[k2];
          m.position.y = 0.42 + Math.max(0, Math.sin(ph * 1.5 - k2 * 0.7)) * 0.35;
          m.position.z = Math.sin(time * 0.8 + k2 * 0.5) * 0.08;
        }
        for (let k2 = 9; k2 < segs.length; k2++) {
          const ref = segs[(k2 - 9) * 2 + 1];
          segs[k2].position.y = ref.position.y + 0.38;
        }
      }
      // flash red when bitten
      const hurt = sim.time - c.lastBit < 0.3;
      o.g.traverse((m) => { if (m.isMesh && m.material.emissive) m.material.emissive.set(hurt ? '#551010' : '#000000'); });
    }
    for (const [id, o] of this.creatureObjs) {
      if (!seenC.has(id)) { this.group.remove(o.g); this.creatureObjs.delete(id); }
    }
    this.updateFlies(dt, time);
    // fireflies at night
    const ffOpacity = Math.max(0, night - 0.3) / 0.7;
    this.fireflies.material.opacity = ffOpacity;
    this.fireflies.visible = ffOpacity > 0.01;
    if (this.fireflies.visible) {
      for (let i = 0; i < this.ffPhase.length; i++) {
        const ph = this.ffPhase[i] + time * 0.3;
        const x = this.ffPos[i * 3], z = this.ffPos[i * 3 + 2];
        const nx = x + Math.sin(ph * 1.3) * dt * 1.2, nz = Math.max(-SURF_D + 1, Math.min(-1, z + Math.cos(ph) * dt * 0.8));
        this.ffPos[i * 3] = Math.max(1, Math.min(W - 1, nx));
        this.ffPos[i * 3 + 2] = nz;
        this.ffPos[i * 3 + 1] = w.surfaceH(this.ffPos[i * 3], nz) + 3 + Math.sin(ph * 2) * 1.5;
      }
      this.fireflies.geometry.attributes.position.needsUpdate = true;
      this.fireflies.material.size = 1.2 + Math.sin(time * 3) * 0.2;
    }
  }

  updateFlies(dt, time) {
    const sim = this.sim, r = this.rng, w = sim.world;
    const targets = sim.sources.filter((s) => s.alive && (s.kind === F_FRUIT || s.kind === F_CARCASS || s.kind === F_INSECT || s.kind === F_BERRY));
    const wanted = Math.min(24, targets.length * 2);
    while (this.flyState.length < wanted) this.flyState.push({ x: r.range(0, W), y: 30, z: -r.range(2, SURF_D - 2), t: -1, vx: 0, vy: 0, vz: 0, land: 0 });
    this.flyState.length = Math.min(this.flyState.length, wanted);
    const d = new THREE.Object3D();
    let n = 0;
    for (const f of this.flyState) {
      if (!targets.length) break;
      if (f.t < 0 || !targets.some((s) => s.id === f.t) || r.next() < dt * 0.05) f.t = r.pick(targets).id;
      const s = targets.find((q) => q.id === f.t);
      const gy = w.surfaceH(s.x, s.z) + s.r * 1.2;
      let tx = s.x + Math.sin(time * 2 + n) * 3, ty = gy + 2 + Math.sin(time * 3.3 + n * 2) * 1.5, tz = s.z + Math.cos(time * 1.7 + n) * 2;
      if (f.land > 0) { f.land -= dt; tx = s.x + (n % 3 - 1) * 0.5; ty = gy; tz = s.z; }
      else if (r.next() < dt * 0.15) f.land = r.range(1, 4);
      f.vx += (tx - f.x) * dt * 6 - f.vx * dt * 3 + r.gauss() * dt * 20;
      f.vy += (ty - f.y) * dt * 6 - f.vy * dt * 3 + r.gauss() * dt * 20;
      f.vz += (tz - f.z) * dt * 6 - f.vz * dt * 3 + r.gauss() * dt * 20;
      if (f.land > 0) { f.vx *= 0.5; f.vy *= 0.5; f.vz *= 0.5; }
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      d.position.set(f.x, f.y, f.z);
      d.rotation.set(0, -Math.atan2(f.vz, f.vx), 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.flies.setMatrixAt(n, d.matrix);
      for (let k = 0; k < 2; k++) {
        const flap = f.land > 0 ? 0.2 : Math.sin(time * 60 + n) * 0.8;
        d.rotation.set((k ? 1 : -1) * (0.3 + flap), -Math.atan2(f.vz, f.vx), 0);
        d.position.set(f.x, f.y + 0.15, f.z);
        d.updateMatrix();
        this.flyWings.setMatrixAt(n * 2 + k, d.matrix);
      }
      n++;
    }
    this.flies.count = n; this.flyWings.count = n * 2;
    this.flies.instanceMatrix.needsUpdate = true;
    this.flyWings.instanceMatrix.needsUpdate = true;
  }
}

export function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  return t;
}
