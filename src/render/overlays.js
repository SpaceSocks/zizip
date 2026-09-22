// Data overlays: pheromone fields, excavation plans, flood water and the
// tunnel graph. Grid data is uploaded as small DataTextures.
import * as THREE from 'three';
import { W, H, SURF_D, TUNNEL_D, TUNNEL } from '../sim/constants.js';
import { NF_EXIT, DX, DY } from '../sim/nav.js';

function dataTex(w, h) {
  const data = new Uint8Array(w * h * 4);
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export class Overlays {
  constructor(scene, sim, terrain) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sim = sim;
    // surface pheromones drape over the surface geometry
    this.surfTex = dataTex(W, SURF_D);
    this.surfMesh = new THREE.Mesh(terrain.surfGeo, new THREE.MeshBasicMaterial({
      map: this.surfTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      blending: THREE.NormalBlending,
    }));
    this.surfMesh.renderOrder = 2;
    this.surfMesh.visible = false;
    this.group.add(this.surfMesh);
    // underground pheromones on the tunnel back wall
    this.underTex = dataTex(W, H);
    this.underTex.magFilter = THREE.NearestFilter;
    const up = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.underTex, transparent: true, depthWrite: false }));
    up.position.set(W / 2, H / 2, -TUNNEL_D + 0.08);
    up.renderOrder = 1;
    up.visible = false;
    this.underMesh = up;
    this.group.add(up);
    // water in flooded tunnels, drawn in front of the ants
    this.waterTex = dataTex(W, H);
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: this.waterTex, transparent: true, depthWrite: false, roughness: 0.1, metalness: 0.1 }));
    wm.position.set(W / 2, H / 2, 0.0);
    wm.renderOrder = 3;
    wm.visible = false;
    this.waterMesh = wm;
    this.group.add(wm);
    // tunnel graph
    this.graph = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffe38a', transparent: true, opacity: 0.85, depthTest: false }));
    this.graph.renderOrder = 8;
    this.graph.visible = false;
    this.nodes = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#fff4c2', size: 7, sizeAttenuation: false, depthTest: false }));
    this.nodes.renderOrder = 9;
    this.nodes.visible = false;
    this.group.add(this.graph, this.nodes);
    this.timer = 0;
    this.lastNav = -1;
    this.lastWater = false;
  }

  dispose() { this.scene.remove(this.group); }

  update(dt, opts) {
    const sim = this.sim;
    this.timer -= dt;
    const showP = opts.pheromones;
    this.surfMesh.visible = showP;
    this.underMesh.visible = showP;
    const hasWater = sim.waterCells > 0;
    this.waterMesh.visible = hasWater;
    if (this.timer <= 0) {
      this.timer = 0.15;
      if (showP) { this.fillSurface(); this.fillUnder(); }
      if (hasWater || this.lastWater) this.fillWater();
      this.lastWater = hasWater;
    }
    this.graph.visible = this.nodes.visible = opts.graph;
    if (opts.graph && sim.nav.buildTime !== this.lastNav) { this.lastNav = sim.nav.buildTime; this.buildGraph(); }
  }

  fillSurface() {
    const P = this.sim.pher, d = this.surfTex.image.data;
    const f = P.surf[0], h = P.surf[1], a = P.surf[2];
    for (let i = 0; i < W * SURF_D; i++) {
      const fv = Math.min(1, f[i] * 0.5), hv = Math.min(1, h[i] * 0.35), av = Math.min(1, a[i] * 0.3);
      // food trail dominates; home trail is a faint blue wash; alarm is red
      let r = 40 * hv, g = 90 * hv, b = 200 * hv, al = hv * 0.35;
      if (fv > 0.02) { const k = Math.min(1, fv * 1.4); r = r * (1 - k) + 70 * k; g = g * (1 - k) + 235 * k; b = b * (1 - k) + 90 * k; al = Math.max(al, fv * 0.85); }
      if (av > 0.02) { const k = Math.min(1, av * 1.4); r = r * (1 - k) + 255 * k; g = g * (1 - k) + 60 * k; b = b * (1 - k) + 50 * k; al = Math.max(al, av * 0.85); }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
      d[i * 4 + 3] = Math.min(220, al * 255);
    }
    this.surfTex.needsUpdate = true;
  }

  fillUnder() {
    const sim = this.sim, P = sim.pher, w = sim.world, d = this.underTex.image.data;
    const al = P.under[0], tr = P.under[1];
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      let r = 0, g = 0, b = 0, a = 0;
      if (w.mark[i] >= 0 && w.type[i] !== TUNNEL) { r = 255; g = 150; b = 40; a = 150; }
      else if (w.type[i] === TUNNEL) {
        const av = Math.min(1, al[i] * 0.5), tv = Math.min(1, tr[i] * 0.25);
        r = av * 255 + tv * 200; g = tv * 190; b = tv * 60;
        a = Math.max(av, tv * 0.6) * 220;
      }
      d[o] = Math.min(255, r); d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
    }
    this.underTex.needsUpdate = true;
  }

  fillWater() {
    const w = this.sim.world, d = this.waterTex.image.data;
    for (let i = 0; i < W * H; i++) {
      const v = w.water[i];
      const o = i * 4;
      d[o] = 70; d[o + 1] = 130; d[o + 2] = 190;
      d[o + 3] = v > 4 ? Math.min(200, 70 + v * 0.6) : 0;
    }
    this.waterTex.needsUpdate = true;
  }

  // Each chamber traces its route to the exit through the shared flow field;
  // the union of those routes is the colony's road network.
  buildGraph() {
    const sim = this.sim, nav = sim.nav, w = sim.world;
    const seg = [], nodes = [];
    const used = new Uint8Array(W * H);
    const dist = nav.dist[NF_EXIT], next = nav.next[NF_EXIT];
    for (const e of sim.entrances) nodes.push(e.cellX + 1, e.cellY + 0.5, 0.4);
    for (const ch of sim.chambers) {
      if (!ch.active || ch.anchor < 0) continue;
      nodes.push(ch.cx, ch.cy, 0.4);
      let c = ch.anchor, px = ch.cx, py = ch.cy, steps = 0;
      while (dist[c] !== 0 && dist[c] !== 65535 && steps++ < 600) {
        const n = next[c];
        if (n === 255) break;
        const x = c % W, y = (c / W) | 0;
        const nc = (y + DY[n]) * W + x + DX[n];
        if (steps % 3 === 0 || dist[nc] === 0) {
          const qx = (nc % W) + 0.5, qy = ((nc / W) | 0) + 0.5;
          seg.push(px, py, 0.4, qx, qy, 0.4);
          px = qx; py = qy;
        }
        if (used[nc]) { nodes.push((nc % W) + 0.5, ((nc / W) | 0) + 0.5, 0.4); break; }
        used[nc] = 1;
        c = nc;
      }
    }
    this.graph.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.graph.geometry = g;
    this.nodes.geometry.dispose();
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(nodes, 3));
    this.nodes.geometry = ng;
  }
}
