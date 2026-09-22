// Instanced rendering of workers, the queen, brood and loose/carried items.
import * as THREE from 'three';
import { buildAntGeometry, makeAntMaterial } from './antModel.js';
import { ANT_COLOR, MAJOR_COLOR, QUEEN_COLOR, ROLE_COLORS } from './palette.js';
import {
  MAX_ANTS, MAX_ITEMS, MAX_BROOD, S_FREE, S_SURFACE, S_CARRIED,
  I_SEED, I_BERRY, I_PROTEIN, I_SUGAR, I_FRUIT, I_DIRT, I_CORPSE, I_HUSK, MAJOR,
} from '../sim/constants.js';

const _m = new Float32Array(16);

// Write a TRS matrix from forward/up vectors straight into an instance array.
function writeBasis(arr, o, px, py, pz, fx, fy, fz, ux, uy, uz, s) {
  const rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
  arr[o] = fx * s; arr[o + 1] = fy * s; arr[o + 2] = fz * s; arr[o + 3] = 0;
  arr[o + 4] = ux * s; arr[o + 5] = uy * s; arr[o + 6] = uz * s; arr[o + 7] = 0;
  arr[o + 8] = rx * s; arr[o + 9] = ry * s; arr[o + 10] = rz * s; arr[o + 11] = 0;
  arr[o + 12] = px; arr[o + 13] = py; arr[o + 14] = pz; arr[o + 15] = 1;
}

function simpleMesh(geo, color, max, extra = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, ...extra });
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = true;
  return m;
}

export class AntsView {
  constructor(scene, sim) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.setSim(sim);

    this.mat = makeAntMaterial();
    this.geoHi = buildAntGeometry('worker', 1);
    this.geoLo = buildAntGeometry('worker', 0);
    this.hi = this.makeInstanced(this.geoHi, MAX_ANTS);
    this.lo = new THREE.InstancedMesh(this.geoLo, this.mat, MAX_ANTS);
    // share per-instance buffers between the two detail levels
    this.lo.instanceMatrix = this.hi.instanceMatrix;
    this.lo.instanceColor = this.hi.instanceColor;
    this.lo.geometry.setAttribute('aAnim', this.hi.geometry.getAttribute('aAnim'));
    this.lo.frustumCulled = false;
    this.lo.castShadow = true;
    this.lo.visible = false;
    this.group.add(this.hi, this.lo);

    this.queenMesh = this.makeInstanced(buildAntGeometry('queen', 1), 1);
    this.queenMesh.setColorAt(0, QUEEN_COLOR);
    this.group.add(this.queenMesh);

    // head positions (for carried items) per ant slot
    this.headX = new Float32Array(MAX_ANTS);
    this.headY = new Float32Array(MAX_ANTS);
    this.headZ = new Float32Array(MAX_ANTS);
    this.posX = new Float32Array(MAX_ANTS);
    this.posY = new Float32Array(MAX_ANTS);
    this.posZ = new Float32Array(MAX_ANTS);

    this.buildItems();

    // selection marker
    const ring = new THREE.RingGeometry(0.94, 1.0, 40);
    this.marker = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.9, depthTest: false }));
    this.marker.renderOrder = 10;
    this.marker.visible = false;
    this.group.add(this.marker);
    this.visibleAnts = 0;
    this.lod = 1;
  }

  setSim(sim) { this.sim = sim; }

  makeInstanced(geo, max) {
    geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.InstancedMesh(geo, this.mat, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true;
    m.count = 0;
    return m;
  }

  buildItems() {
    const ico = (r, d, sx, sy, sz) => { const g = new THREE.IcosahedronGeometry(r, d); g.scale(sx, sy, sz); return g; };
    const dod = (r, sx, sy, sz) => { const g = new THREE.DodecahedronGeometry(r, 0); g.scale(sx, sy, sz); return g; };
    this.itemMeshes = {};
    const add = (kind, geo, color, extra, max = 3000) => {
      const m = simpleMesh(geo, color, max, extra);
      this.itemMeshes[kind] = m;
      this.group.add(m);
    };
    add(I_SEED, ico(0.17, 0, 1.45, 0.8, 1), '#caa46a');
    add(I_BERRY, ico(0.18, 0, 1, 1, 1), '#b8203a', { roughness: 0.35 });
    add(I_PROTEIN, dod(0.18, 1.2, 0.9, 1), '#a0604d');
    add(I_SUGAR, ico(0.16, 1, 1, 0.85, 1), '#ffc85a', { emissive: new THREE.Color('#ff9d1a'), emissiveIntensity: 0.55, roughness: 0.15 });
    add(I_FRUIT, new THREE.BoxGeometry(0.3, 0.24, 0.26), '#ead27e', { roughness: 0.5 });
    add(I_DIRT, dod(0.16, 1, 0.85, 1), '#7c5a3a', { roughness: 1 });
    const husk = new THREE.SphereGeometry(0.9, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    husk.scale(1.3, 0.55, 0.9);
    add(I_HUSK, husk, '#2f3a26', { roughness: 0.3, metalness: 0.3, side: THREE.DoubleSide }, 200);
    // corpses reuse the low-detail ant, lying on its back
    const corpseGeo = buildAntGeometry('worker', 0);
    corpseGeo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(3000 * 3), 3));
    this.corpseMat = makeAntMaterial({ roughness: 0.8 });
    const cm = new THREE.InstancedMesh(corpseGeo, this.corpseMat, 3000);
    cm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3000 * 3), 3);
    cm.frustumCulled = false; cm.count = 0; cm.castShadow = true;
    this.itemMeshes[I_CORPSE] = cm;
    this.group.add(cm);
    // brood
    this.broodMeshes = [
      simpleMesh(ico(0.12, 1, 1.5, 1, 1), '#f6f1e4', MAX_BROOD, { roughness: 0.3, emissive: new THREE.Color('#403a30'), emissiveIntensity: 0.4 }),
      simpleMesh(ico(0.17, 1, 1.6, 1, 1.05), '#f1e5c6', MAX_BROOD, { roughness: 0.45, emissive: new THREE.Color('#3a3226'), emissiveIntensity: 0.35 }),
      simpleMesh(ico(0.2, 1, 1.9, 1.05, 1.1), '#dcc393', MAX_BROOD, { roughness: 0.7, emissive: new THREE.Color('#2e2618'), emissiveIntensity: 0.3 }),
    ];
    for (const m of this.broodMeshes) this.group.add(m);
  }

  // camera view rectangle (world units at z = 0) for culling
  update(alpha, time, view, opts) {
    const sim = this.sim, A = sim.ants;
    const arr = this.hi.instanceMatrix.array;
    const col = this.hi.instanceColor.array;
    const anim = this.hi.geometry.getAttribute('aAnim').array;
    const roleMode = opts.roles;
    const speedMul = opts.simSpeed || 1;
    const ampScale = speedMul > 6 ? 0.5 : 1;
    let n = 0;
    const x0 = view.x0 - 4, x1 = view.x1 + 4, y0 = view.y0 - 4, y1 = view.y1 + 4;
    for (let i = 0; i < A.hi; i++) {
      if (!A.alive[i]) continue;
      const px = A.px[i] + (A.x[i] - A.px[i]) * alpha;
      const py = A.py[i] + (A.y[i] - A.py[i]) * alpha;
      const pz = A.pz[i] + (A.z[i] - A.pz[i]) * alpha;
      this.posX[i] = px; this.posY[i] = py; this.posZ[i] = pz;
      const s = A.caste[i] === MAJOR ? 1.3 : 1.0;
      const h = A.hd[i], c = Math.cos(h), sn = Math.sin(h);
      let fx, fy, fz, ux, uy, uz;
      if (A.surf[i]) { fx = c; fy = 0; fz = sn; ux = 0; uy = 1; uz = 0; }
      else { fx = c; fy = sn; fz = 0; ux = 0; uy = 0; uz = 1; }
      this.headX[i] = px + fx * 0.88 * s + ux * 0.05; this.headY[i] = py + fy * 0.88 * s + uy * 0.05 + (A.surf[i] ? 0.12 : 0); this.headZ[i] = pz + fz * 0.88 * s + uz * 0.14;
      // cull, but always keep the selected ant
      const vx = px, vy = A.surf[i] ? py + pz * 0.15 : py;
      if ((vx < x0 || vx > x1 || vy < y0 || vy > y1) && i !== sim.selected) continue;
      writeBasis(arr, n * 16, px, py + (A.surf[i] ? 0.17 * s : 0), pz, fx, fy, fz, ux, uy, uz, s);
      let cr, cg, cb;
      if (roleMode) { const rc = ROLE_COLORS[A.task[i]]; cr = rc.r; cg = rc.g; cb = rc.b; }
      else {
        const bc = A.caste[i] === MAJOR ? MAJOR_COLOR : ANT_COLOR;
        const young = Math.max(0, 1 - A.age[i] * 2.5);   // callows are pale
        cr = bc.r + (0.55 - bc.r) * young * 0.6; cg = bc.g + (0.42 - bc.g) * young * 0.6; cb = bc.b + (0.3 - bc.b) * young * 0.6;
        if (!A.surf[i]) { cr *= 1.35; cg *= 1.2; cb *= 1.05; }
      }
      col[n * 3] = cr; col[n * 3 + 1] = cg; col[n * 3 + 2] = cb;
      const mv = A.moving[i];
      anim[n * 3] = A.walk[i] * 7.5 + i;
      anim[n * 3 + 1] = mv === 1 ? ampScale : 0;
      anim[n * 3 + 2] = mv === 2 || A.pause[i] > 0 ? 1 : 0;
      n++;
    }
    this.visibleAnts = n;
    this.hi.count = n; this.lo.count = n;
    this.hi.instanceMatrix.needsUpdate = true;
    this.hi.instanceColor.needsUpdate = true;
    this.hi.geometry.getAttribute('aAnim').needsUpdate = true;
    // level of detail by zoom (pixels per world unit)
    const ppu = view.ppu;
    if (this.lod === 1 && ppu < 3.2) this.lod = 0;
    else if (this.lod === 0 && ppu > 3.8) this.lod = 1;
    this.hi.visible = this.lod === 1;
    this.lo.visible = this.lod === 0;
    this.mat.userData.uniforms.uTime.value = time;

    // queen
    const q = sim.queen;
    if (q.alive) {
      const qx = q.px + (q.x - q.px) * alpha, qy = q.py + (q.y - q.py) * alpha;
      writeBasis(this.queenMesh.instanceMatrix.array, 0, qx, qy, q.z, Math.cos(q.hd), Math.sin(q.hd), 0, 0, 0, 1, 2.1);
      const qa = this.queenMesh.geometry.getAttribute('aAnim').array;
      qa[0] = q.walk * 6; qa[1] = q.moving ? 0.6 : 0; qa[2] = 0.2;
      this.queenMesh.geometry.getAttribute('aAnim').needsUpdate = true;
      if (roleMode) this.queenMesh.setColorAt(0, ROLE_COLORS[7]); else this.queenMesh.setColorAt(0, QUEEN_COLOR);
      this.queenMesh.instanceColor.needsUpdate = true;
      this.queenMesh.count = 1;
      this.queenMesh.instanceMatrix.needsUpdate = true;
      this.queenPos = [qx, qy, q.z];
    } else this.queenMesh.count = 0;

    this.updateItems(alpha);
    this.updateBrood();
    this.updateMarker(time, view);
  }

  updateItems() {
    const sim = this.sim, It = sim.items;
    const counts = {};
    for (const k in this.itemMeshes) counts[k] = 0;
    for (let k = 0; k < It.hi; k++) {
      const st = It.state[k];
      if (st === S_FREE) continue;
      const kind = It.kind[k];
      const mesh = this.itemMeshes[kind];
      if (!mesh) continue;
      let x, y, z, fx = Math.cos(It.rot[k]), fz = Math.sin(It.rot[k]), fy = 0, ux = 0, uy = 1, uz = 0, s = 1;
      if (st === S_CARRIED) {
        const o = It.owner[k];
        if (o < 0) continue;
        x = this.headX[o]; y = this.headY[o]; z = this.headZ[o];
        if (kind === I_CORPSE) {
          // carried corpse: held in the mandibles, dangling in front
          const A = sim.ants;
          const c = Math.cos(A.hd[o]), sn = Math.sin(A.hd[o]);
          if (A.surf[o]) { fx = c; fy = 0; fz = sn; x += c * 0.6; z += sn * 0.6; }
          else { fx = c; fy = sn; fz = 0; ux = 0; uy = 0; uz = -1; x += c * 0.6; y += sn * 0.6; }
          s = 0.9;
        }
      } else {
        x = It.x[k]; y = It.y[k]; z = It.z[k];
        if (kind === I_HUSK) s = 1;
        if (st === S_SURFACE) y += kind === I_CORPSE ? 0.15 : 0.08;
        if (st !== S_SURFACE) { // underground: lie on the tunnel floor facing the glass
          fx = Math.cos(It.rot[k]); fy = 0; fz = Math.sin(It.rot[k]);
        }
      }
      if (kind === I_CORPSE && st !== S_CARRIED) { uy = -1; s = It.age[k] % 100 >= 2 ? 2.0 : (It.age[k] % 100 >= 1 ? 1.25 : 0.95); y += 0.12; }
      const idx = counts[kind]++;
      if (idx >= mesh.instanceMatrix.count) continue;
      writeBasis(mesh.instanceMatrix.array, idx * 16, x, y, z, fx, fy, fz, ux, uy, uz, s);
    }
    for (const k in this.itemMeshes) {
      const m = this.itemMeshes[k];
      m.count = Math.min(counts[k], m.instanceMatrix.count);
      m.instanceMatrix.needsUpdate = true;
    }
    const cm = this.itemMeshes[I_CORPSE];
    if (cm.count) {
      const ca = cm.instanceColor.array;
      for (let n = 0; n < cm.count; n++) { ca[n * 3] = 0.22; ca[n * 3 + 1] = 0.16; ca[n * 3 + 2] = 0.13; }
      cm.instanceColor.needsUpdate = true;
    }
  }

  updateBrood() {
    const sim = this.sim, B = sim.brood, A = sim.ants;
    const counts = [0, 0, 0];
    for (let b = 0; b < B.hi; b++) {
      if (!B.alive[b]) continue;
      const st = B.stage[b];
      const m = this.broodMeshes[st];
      let x, y, z;
      let fx = Math.cos(B.rot[b]), fy = Math.sin(B.rot[b]) * 0.3, fz = 0;
      if (B.carried[b] && B.carrier[b] >= 0) {
        const o = B.carrier[b];
        x = this.headX[o]; y = this.headY[o]; z = this.headZ[o];
        fx = Math.cos(A.hd[o]); fy = Math.sin(A.hd[o]);
      } else { x = B.x[b]; y = B.y[b]; z = B.z[b]; }
      const l = Math.hypot(fx, fy) || 1; fx /= l; fy /= l;
      const s = st === 1 ? 0.65 + B.dev[b] * 0.7 : st === 0 ? 0.9 + B.dev[b] * 0.2 : 1;
      writeBasis(m.instanceMatrix.array, counts[st]++ * 16, x, y, z, fx, fy, fz, 0, 0, 1, s);
    }
    for (let k = 0; k < 3; k++) { this.broodMeshes[k].count = counts[k]; this.broodMeshes[k].instanceMatrix.needsUpdate = true; }
  }

  updateMarker(time, view) {
    const sim = this.sim, i = sim.selected;
    const mk = this.marker;
    let p = null, surf = false, s = 1;
    if (i === -2 && sim.queen.alive && this.queenPos) { p = this.queenPos; s = 1.9; }
    else if (i >= 0 && sim.ants.alive[i]) { p = [this.posX[i], this.posY[i], this.posZ[i]]; surf = !!sim.ants.surf[i]; s = sim.ants.caste[i] === MAJOR ? 1.3 : 1; }
    if (!p) { mk.visible = false; return; }
    mk.visible = true;
    const pulse = 1 + Math.sin(time * 5) * 0.08;
    const k = Math.max(1.1, 6 / Math.max(1, view.ppu)) * s * pulse;
    mk.scale.setScalar(k);
    if (surf) { mk.position.set(p[0], p[1] + 0.06, p[2]); mk.rotation.set(-Math.PI / 2, 0, 0); }
    else { mk.position.set(p[0], p[1], 0.3); mk.rotation.set(0, 0, 0); }
  }
}
