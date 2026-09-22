// Static scenery: the terrarium frame and glass, grass, plants, stones,
// leaves, twigs and pebbles. Everything is instanced or merged; grass sways
// in a vertex shader.
import * as THREE from 'three';
import { W, H, SURF_D } from '../sim/constants.js';
import { Rng, fbm } from '../sim/rng.js';

function mergeGeos(geos) {
  let total = 0;
  const gs = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of gs) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'color'];
  for (const name of names) {
    if (!gs[0].attributes[name]) continue;
    const size = gs[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of gs) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

function colorGeo(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function windMaterial(opts) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide, ...opts });
  mat.userData.uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = mat.userData.uniforms.uTime;
    shader.uniforms.uWind = mat.userData.uniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          float h = max(0.0, transformed.y);
          float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.2) * 0.5 + sin(uTime * 3.1 + wp.x * 0.9) * 0.2;
          transformed.x += sway * h * h * 0.035 * (0.4 + uWind * 1.6);
          transformed.z += cos(uTime * 1.3 + wp.x * 0.3) * h * h * 0.012 * (0.4 + uWind);
        }`);
  };
  mat.customProgramCacheKey = () => 'wind';
  return mat;
}

export class Decor {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.windMats = [];
    const r = new Rng(sim.decorSeed || 1);
    this.r = r;
    this.buildFrame();
    this.buildGrass(r);
    this.buildPlants(r);
    this.buildStones(r);
    this.buildLitter(r);
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(this.group);
  }

  buildFrame() {
    const w = this.sim.world;
    const top = Math.max(...w.groundF) + 16;
    this.glassTop = top;
    const wood = new THREE.MeshStandardMaterial({ color: '#6e4a2f', roughness: 0.75, flatShading: true });
    const woodDark = new THREE.MeshStandardMaterial({ color: '#4f3321', roughness: 0.8, flatShading: true });
    const D = SURF_D + 1.5;
    // base
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 7, 4, D + 3), wood);
    base.position.set(W / 2, -2, -D / 2 + 0.6);
    base.receiveShadow = true; base.castShadow = true;
    this.group.add(base);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 8, 0.8, D + 4), woodDark);
    lip.position.set(W / 2, -4.2, -D / 2 + 0.6);
    this.group.add(lip);
    // side posts
    for (const x of [-1.6, W + 1.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(3.2, top + 4, D + 3), wood);
      post.position.set(x, (top + 4) / 2 - 4, -D / 2 + 0.6);
      post.castShadow = true; post.receiveShadow = true;
      this.group.add(post);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1, D + 3.6), woodDark);
      cap.position.set(x, top + 0.4, -D / 2 + 0.6);
      this.group.add(cap);
    }
    // glass panes (front + back), faint with a streaky sheen
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0)'; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 7; k++) {
      const x = 20 + k * 37 + (k * 53) % 17;
      const grd = g.createLinearGradient(x, 0, x + 40, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, `rgba(255,255,255,${0.05 + (k % 3) * 0.03})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(128, 128); g.rotate(-0.5); g.translate(-128, -128);
      g.fillStyle = grd; g.fillRect(x - 60, -100, 30 + (k % 2) * 25, 460);
      g.restore();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    const glassMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glassMat = glassMat;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, top + 4), glassMat);
    front.position.set(W / 2, (top + 4) / 2 - 4, 0.25);
    front.renderOrder = 5;
    this.group.add(front);
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(W, top + 4), new THREE.MeshStandardMaterial({ color: '#cfe7ee', transparent: true, opacity: 0.045, roughness: 0.05, metalness: 0.2, depthWrite: false }));
    tint.position.copy(front.position); tint.position.z = 0.24;
    this.group.add(tint);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, top + 4), new THREE.MeshStandardMaterial({ color: '#cfe7ee', transparent: true, opacity: 0.08, roughness: 0.1, depthWrite: false }));
    back.position.set(W / 2, (top + 4) / 2 - 4, -D + 0.3);
    this.group.add(back);
    // glass edge highlight along the top of the front pane
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: '#dff3ff', transparent: true, opacity: 0.35, roughness: 0.1 }));
    edge.position.set(W / 2, top - 0.1, 0.25);
    this.group.add(edge);
    // tabletop
    const table = new THREE.Mesh(new THREE.PlaneGeometry(W * 6, 400), new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 0.9 }));
    table.rotation.x = -Math.PI / 2;
    table.position.set(W / 2, -4.6, -40);
    table.receiveShadow = true;
    this.group.add(table);
  }

  buildGrass(r) {
    const w = this.sim.world;
    const blade = (hgt, lean, color) => {
      const g = new THREE.BufferGeometry();
      const v = [-0.09, 0, 0, 0.09, 0, 0, lean * 0.5, hgt * 0.55, 0.02, lean * 0.5, hgt * 0.55, 0.02, 0.09, 0, 0, lean, hgt, 0];
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0, 0, 0.09, 0, 0, lean * 0.5 + 0.05, hgt * 0.55, 0, -0.09, 0, 0, lean * 0.5 + 0.05, hgt * 0.55, 0, lean * 0.5 - 0.04, hgt * 0.55, 0, lean * 0.5 - 0.04, hgt * 0.55, 0, lean * 0.5 + 0.05, hgt * 0.55, 0, lean, hgt, 0], 3));
      g.computeVertexNormals();
      return colorGeo(g, color);
    };
    const tuftGeos = [];
    const greens = ['#5f8a34', '#7a9a3d', '#4d7a2e', '#8fa64a', '#6d8f3a'];
    for (let t = 0; t < 4; t++) {
      const parts = [];
      const nb = 5 + t;
      for (let k = 0; k < nb; k++) {
        const b = blade(r.range(0.5, 1.4) * (t === 3 ? 1.7 : 1), r.range(-0.5, 0.5), r.pick(greens));
        b.rotateY(r.range(0, Math.PI));
        b.translate(r.range(-0.25, 0.25), 0, r.range(-0.25, 0.25));
        parts.push(b);
      }
      tuftGeos.push(mergeGeos(parts));
    }
    const mat = windMaterial({});
    this.windMats.push(mat);
    const seed = this.sim.seedNum;
    const e = this.sim.entrances[0];
    for (let t = 0; t < tuftGeos.length; t++) {
      const max = 520;
      const m = new THREE.InstancedMesh(tuftGeos[t], mat, max);
      const d = new THREE.Object3D();
      let n = 0;
      for (let tries = 0; tries < 6000 && n < max; tries++) {
        const x = r.range(1, W - 1), z = -r.range(0.4, SURF_D - 0.6);
        const dens = fbm(x * 0.045, -z * 0.12, seed + 41, 3);
        const front = -z < 4 ? 0.15 : -z < 8 ? 0.5 : 1;
        if (r.next() > (dens - 0.38) * 2.6 * front) continue;
        if (Math.hypot(x - e.x, z - e.z) < 5) continue;
        if (this.sim.stones.some((s) => Math.hypot(s.x - x, s.z - z) < s.r)) continue;
        d.position.set(x, w.surfaceH(x, z) - 0.05, z);
        d.rotation.set(0, r.range(0, Math.PI * 2), 0);
        const s = r.range(0.6, 1.15) * (-z > 14 ? 1.5 : -z < 6 ? 0.7 : 1);
        d.scale.set(s, s * r.range(0.8, 1.3), s);
        d.updateMatrix();
        m.setMatrixAt(n++, d.matrix);
      }
      m.count = n;
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  buildPlants(r) {
    const w = this.sim.world;
    this.plantMeshes = [];
    for (const p of this.sim.plants) {
      const grp = new THREE.Group();
      const y0 = w.surfaceH(p.x, p.z);
      const parts = [];
      const stemC = '#557a2f';
      const nStem = p.kind === 'grass' ? 5 : p.kind === 'clover' ? 6 : 3;
      for (let s = 0; s < nStem; s++) {
        const h = p.h * r.range(0.6, 1.1) * (p.kind === 'clover' ? 0.35 : 1);
        const lean = r.range(-0.35, 0.35), lean2 = r.range(-0.35, 0.35);
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * h * 0.3, h * 0.55, lean2 * h * 0.2), new THREE.Vector3(lean * h * 0.6, h, lean2 * h * 0.4));
        const stem = new THREE.TubeGeometry(curve, 5, p.kind === 'weed' ? 0.12 : 0.08, 4, false);
        parts.push(colorGeo(stem, stemC));
        const top = curve.getPoint(1);
        if (p.kind === 'flower') {
          const petalC = ['#f2e36b', '#f7f4ee', '#e98bb0', '#b58cf0'][p.color];
          for (let k = 0; k < 6; k++) {
            const pet = new THREE.SphereGeometry(0.45, 5, 3);
            pet.scale(1.3, 0.25, 0.6);
            pet.translate(0.55, 0, 0);
            pet.rotateY(k * Math.PI / 3);
            pet.translate(top.x, top.y, top.z);
            parts.push(colorGeo(pet, petalC));
          }
          const c = new THREE.IcosahedronGeometry(0.28, 0); c.translate(top.x, top.y + 0.1, top.z);
          parts.push(colorGeo(c, '#e0a43a'));
        } else if (p.kind === 'clover') {
          for (let k = 0; k < 3; k++) {
            const leaf = new THREE.CircleGeometry(0.55, 6);
            leaf.rotateX(-Math.PI / 2 + 0.3);
            leaf.translate(0.45, 0, 0);
            leaf.rotateY(k * Math.PI * 2 / 3);
            leaf.translate(top.x, top.y, top.z);
            parts.push(colorGeo(leaf, '#4f8a33'));
          }
        } else if (p.kind === 'weed') {
          for (let k = 0; k < 4; k++) {
            const t = 0.3 + k * 0.17;
            const pt = curve.getPoint(t);
            const leaf = new THREE.SphereGeometry(0.9, 5, 2);
            leaf.scale(1.2, 0.12, 0.45);
            leaf.translate(1.0, 0, 0);
            leaf.rotateY(r.range(0, Math.PI * 2));
            leaf.rotateZ(0.25);
            leaf.translate(pt.x, pt.y, pt.z);
            parts.push(colorGeo(leaf, '#5d8c35'));
          }
          const head = new THREE.ConeGeometry(0.35, 1.1, 5); head.translate(top.x, top.y + 0.4, top.z);
          parts.push(colorGeo(head, '#a88a4a'));
        } else {
          // seed-grass: a drooping seed head
          const head = new THREE.CylinderGeometry(0.16, 0.08, 1.6, 5); head.translate(top.x, top.y + 0.6, top.z);
          parts.push(colorGeo(head, '#b99a5a'));
        }
      }
      // base leaves
      for (let k = 0; k < 4; k++) {
        const leaf = new THREE.SphereGeometry(1.2, 5, 2);
        leaf.scale(1.3, 0.1, 0.35);
        leaf.translate(1.1, 0.15, 0);
        leaf.rotateY(k * Math.PI / 2 + r.range(0, 0.6));
        parts.push(colorGeo(leaf, '#4a7a2c'));
      }
      const geo = mergeGeos(parts);
      geo.computeVertexNormals();
      const mat = windMaterial({});
      this.windMats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, y0 - 0.1, p.z);
      m.castShadow = true;
      this.group.add(m);
    }
  }

  buildStones(r) {
    const w = this.sim.world;
    const mat = new THREE.MeshStandardMaterial({ color: '#8d8883', flatShading: true, roughness: 0.85 });
    const mat2 = new THREE.MeshStandardMaterial({ color: '#a39a8c', flatShading: true, roughness: 0.9 });
    for (const s of this.sim.stones) {
      const geo = new THREE.DodecahedronGeometry(1, 1);
      const p = geo.attributes.position;
      const rr = new Rng(s.seed);
      for (let i = 0; i < p.count; i++) {
        const n = 0.82 + rr.next() * 0.3;
        p.setXYZ(i, p.getX(i) * n, p.getY(i) * n, p.getZ(i) * n);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, rr.chance(0.5) ? mat : mat2);
      m.position.set(s.x, w.surfaceH(s.x, s.z) + s.h * 0.25, s.z);
      m.scale.set(s.r, s.h, s.r * 0.85);
      m.rotation.y = rr.range(0, 6);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    // pebbles
    const peb = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ color: '#8a8177', flatShading: true, roughness: 0.9 }), 260);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < 260; i++) {
      const x = r.range(1, W - 1), z = -r.range(0.5, SURF_D - 0.5);
      d.position.set(x, w.surfaceH(x, z) + 0.05, z);
      d.rotation.set(r.range(0, 3), r.range(0, 3), 0);
      d.scale.set(r.range(0.5, 1.6), r.range(0.4, 1), r.range(0.5, 1.4));
      d.updateMatrix();
      peb.setMatrixAt(i, d.matrix);
      peb.setColorAt(i, col.setHSL(0.08, 0.12, r.range(0.35, 0.6)));
    }
    peb.receiveShadow = true;
    this.group.add(peb);
  }

  buildLitter(r) {
    const w = this.sim.world;
    // fallen leaves
    const leafGeo = new THREE.BufferGeometry();
    const pts = [];
    const outline = [[0, 0], [0.35, 0.35], [0.6, 0.9], [0.5, 1.5], [0, 2.1], [-0.5, 1.5], [-0.6, 0.9], [-0.35, 0.35]];
    for (let k = 0; k < outline.length; k++) {
      const a = outline[k], b = outline[(k + 1) % outline.length];
      pts.push(0, 0.05, 1.05, a[0], (k % 2) * 0.06, a[1], b[0], ((k + 1) % 2) * 0.06, b[1]);
    }
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    leafGeo.computeVertexNormals();
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8, side: THREE.DoubleSide }), 40);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    const leafCols = ['#b5652b', '#c98d34', '#8f4a24', '#9a8b3a', '#6f7b35'];
    for (let i = 0; i < 40; i++) {
      const x = r.range(2, W - 2), z = -r.range(1, SURF_D - 1);
      d.position.set(x, w.surfaceH(x, z) + 0.06, z);
      d.rotation.set(r.range(-0.2, 0.2), r.range(0, 6.28), r.range(-0.2, 0.2));
      d.scale.setScalar(r.range(0.8, 1.8));
      d.updateMatrix();
      leaves.setMatrixAt(i, d.matrix);
      leaves.setColorAt(i, c.set(r.pick(leafCols)));
    }
    leaves.receiveShadow = true;
    this.group.add(leaves);
    // twigs
    const twigMat = new THREE.MeshStandardMaterial({ color: '#6b4f36', flatShading: true, roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      const x = r.range(4, W - 4), z = -r.range(2, SURF_D - 2);
      const len = r.range(3, 9);
      const g = new THREE.CylinderGeometry(0.14, 0.2, len, 5);
      g.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(g, twigMat);
      m.position.set(x, w.surfaceH(x, z) + 0.18, z);
      m.rotation.y = r.range(0, Math.PI);
      m.castShadow = true;
      this.group.add(m);
      if (r.chance(0.6)) {
        const g2 = new THREE.CylinderGeometry(0.08, 0.12, len * 0.35, 4);
        g2.rotateZ(Math.PI / 2);
        g2.translate(len * 0.17, 0, 0);
        g2.rotateY(0.7);
        g2.translate(r.range(-len / 4, len / 4), 0, 0);
        const m2 = new THREE.Mesh(g2, twigMat);
        m.add(m2);
      }
    }
    // mushrooms near the back
    const capMat = new THREE.MeshStandardMaterial({ color: '#c9774a', flatShading: true, roughness: 0.6 });
    const stemMat = new THREE.MeshStandardMaterial({ color: '#efe3cc', flatShading: true, roughness: 0.8 });
    for (let i = 0; i < r.int(2, 4); i++) {
      const x = r.range(6, W - 6), z = -r.range(SURF_D * 0.55, SURF_D - 1.5);
      const grp = new THREE.Group();
      const n = r.int(2, 4);
      for (let k = 0; k < n; k++) {
        const h = r.range(1.2, 2.6);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, h, 6), stemMat);
        st.position.set(k * 0.8 - n * 0.4, h / 2, r.range(-0.4, 0.4));
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.9, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        cap.scale.set(1, 0.6, 1);
        cap.position.set(st.position.x, h - 0.05, st.position.z);
        st.castShadow = cap.castShadow = true;
        grp.add(st, cap);
      }
      grp.position.set(x, w.surfaceH(x, z), z);
      this.group.add(grp);
    }
  }

  update(time, wind) {
    for (const m of this.windMats) { m.userData.uniforms.uTime.value = time; m.userData.uniforms.uWind.value = wind; }
  }
}
