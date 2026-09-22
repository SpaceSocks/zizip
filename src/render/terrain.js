// Soil cross-section, back wall, roots, rocks and the surface ground.
// The front face of the soil is built per chunk with marching squares over a
// jittered corner field, so tunnels have organic edges even though the
// simulation grid is square. Only chunks touched by digging are rebuilt.
import * as THREE from 'three';
import { W, H, SURF_D, TUNNEL_D, SOIL, AIR, TUNNEL, ROCK } from '../sim/constants.js';
import { CHUNK, CX, CY, SV, SVZ } from '../sim/world.js';
import { hash2, fbm } from '../sim/rng.js';
import { SOIL_COLORS, TOPSOIL, DEEP, GRASS, GRASS2, DIRT, MOUND } from './palette.js';

const tmpC = new THREE.Color();
const cellRGB = [0, 0, 0], vRGB = [0, 0, 0];

export class Terrain {
  constructor(scene, sim) {
    this.scene = scene;
    this.sim = sim;
    this.world = sim.world;
    this.seed = sim.seedNum;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.97, metalness: 0 });
    this.chunks = new Array(CX * CY).fill(null);
    this.corner = new Float32Array((W + 1) * (H + 1));
    this.cellCol = new Float32Array(W * H * 3);
    this.cornerCol = new Float32Array((W + 1) * (H + 1) * 3);
    this.rebuilt = 0;
    this.buildCellColors(0, 0, W, H);
    this.buildCornerField(0, 0, W, H);
    for (let i = 0; i < CX * CY; i++) this.buildChunk(i);
    this.buildBackWall();
    this.buildRocksAndRoots();
    this.buildSurface();
    this.lastMoist = this.world.moistVersion;
    this.moundTimer = 0;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    this.scene.remove(this.group);
  }

  solidAt(x, y) {
    if (x < 0 || x >= W || y < 0) return 1;
    if (y >= H) return 0;
    const t = this.world.type[y * W + x];
    return t >= SOIL ? 1 : 0;
  }

  buildCellColors(x0, y0, x1, y1) {
    const w = this.world, cc = this.cellCol;
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const yy = Math.min(y, w.ground[x] - 1);
        this.cellColor(x, Math.max(0, yy), tmpC);
        const i = (y * W + x) * 3;
        cc[i] = tmpC.r; cc[i + 1] = tmpC.g; cc[i + 2] = tmpC.b;
      }
    }
  }

  buildCornerField(x0, y0, x1, y1) {
    const f = this.corner, s = this.seed, cc = this.cellCol, col = this.cornerCol;
    for (let cy = Math.max(0, y0); cy <= Math.min(H, y1); cy++) {
      for (let cx = Math.max(0, x0); cx <= Math.min(W, x1); cx++) {
        let v = (this.solidAt(cx - 1, cy - 1) + this.solidAt(cx, cy - 1) + this.solidAt(cx - 1, cy) + this.solidAt(cx, cy)) * 0.25;
        if (v > 0 && v < 1) v += (hash2(cx, cy, s + 99) - 0.5) * 0.36;
        const ci = cy * (W + 1) + cx;
        f[ci] = v;
        // colour: average of the surrounding cells (dug cells keep their soil colour)
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
          const x = Math.min(W - 1, Math.max(0, cx + dx)), y = Math.min(H - 1, Math.max(0, cy + dy));
          const i = (y * W + x) * 3;
          r += cc[i]; g += cc[i + 1]; b += cc[i + 2]; n++;
        }
        col[ci * 3] = r / n; col[ci * 3 + 1] = g / n; col[ci * 3 + 2] = b / n;
      }
    }
  }

  cellColor(x, y, out) {
    const w = this.world;
    const t = w.type[y * W + x];
    const g = w.ground[Math.min(W - 1, Math.max(0, x))];
    const d = g - y;
    const base = SOIL_COLORS[t] || SOIL_COLORS[2];
    out.copy(base);
    if (t === SOIL) {
      if (d < 6) out.lerp(TOPSOIL, 1 - d / 6 * 0.6);
      else if (d > 50) out.lerp(DEEP, Math.min(1, (d - 50) / 40) * 0.6);
    }
    // soft horizontal banding makes the strata read like a real ant farm
    const band = fbm(x * 0.02, y * 0.35, this.seed + 7, 2);
    out.multiplyScalar(0.86 + band * 0.26);
    const m = w.moist[y * W + x] / 255;
    out.multiplyScalar(1.08 - m * 0.3);
    return out;
  }

  buildChunk(ci) {
    const cx0 = (ci % CX) * CHUNK, cy0 = Math.floor(ci / CX) * CHUNK;
    const cx1 = Math.min(W, cx0 + CHUNK), cy1 = Math.min(H, cy0 + CHUNK);
    const pos = [], col = [];
    const f = this.corner, s = this.seed;
    const W1 = W + 1, D = TUNNEL_D, iso = 0.5;
    const cz = (x, y, v) => (v >= 0.999 ? (hash2(x, y, s + 3) - 0.5) * 0.3 : 0);
    const P = new Array(8);
    for (let y = cy0; y < cy1; y++) {
      for (let x = cx0; x < cx1; x++) {
        // corners CCW: BL, BR, TR, TL
        const v0 = f[y * W1 + x], v1 = f[y * W1 + x + 1], v2 = f[(y + 1) * W1 + x + 1], v3 = f[(y + 1) * W1 + x];
        const vs = [v0, v1, v2, v3];
        const cxs = [x, x + 1, x + 1, x], cys = [y, y, y + 1, y + 1];
        let inside = 0;
        for (let k = 0; k < 4; k++) if (vs[k] >= iso) inside++;
        if (inside === 0) continue;
        // skip air above ground entirely
        const t = this.world.type[y * W + x];
        const cellSolid = t >= SOIL;
        let n = 0;
        for (let k = 0; k < 4; k++) {
          const a = vs[k], b = vs[(k + 1) & 3];
          if (a >= iso) P[n++] = { x: cxs[k], y: cys[k], v: a, e: false };
          if ((a >= iso) !== (b >= iso)) {
            const tt = (iso - a) / (b - a);
            const k2 = (k + 1) & 3;
            P[n++] = { x: cxs[k] + (cxs[k2] - cxs[k]) * tt, y: cys[k] + (cys[k2] - cys[k]) * tt, v: iso, e: true };
          }
        }
        const cc = this.cornerCol, W1c = W + 1;
        const colAt = (px, py, out) => {
          // bilinear colour inside this cell
          const tx = px - x, ty = py - y;
          const i00 = (y * W1c + x) * 3, i10 = i00 + 3, i01 = ((y + 1) * W1c + x) * 3, i11 = i01 + 3;
          for (let k = 0; k < 3; k++) out[k] = (cc[i00 + k] * (1 - tx) + cc[i10 + k] * tx) * (1 - ty) + (cc[i01 + k] * (1 - tx) + cc[i11 + k] * tx) * ty;
          return out;
        };
        colAt(x + 0.5, y + 0.5, cellRGB);
        tmpC.setRGB(cellRGB[0], cellRGB[1], cellRGB[2]);
        // front face: fan
        for (let k = 1; k < n - 1; k++) {
          const tri = [P[0], P[k], P[k + 1]];
          const shade = 0.95 + hash2(x * 4 + k, y, s + 13) * 0.1;
          for (const p of tri) {
            pos.push(p.x, p.y, 0.02 + cz(p.x, p.y, p.v));
            const ao = 0.6 + 0.4 * Math.min(1, (p.v - iso) * 2 + (p.e ? 0 : 0.35));
            colAt(p.x, p.y, vRGB);
            col.push(vRGB[0] * shade * ao, vRGB[1] * shade * ao, vRGB[2] * shade * ao);
          }
        }
        // tunnel walls: consecutive edge points form the contour
        for (let k = 0; k < n; k++) {
          const p = P[k], q = P[(k + 1) % n];
          if (!p.e || !q.e) continue;
          if (n === 2) continue;
          // CCW polygon: solid on the left of p->q, empty on the right
          const wallC = 0.85 + hash2(x, y * 3 + k, s + 17) * 0.12;
          const r0 = tmpC.r * wallC, g0 = tmpC.g * wallC, b0 = tmpC.b * wallC;
          const r1 = r0 * 0.55, g1 = g0 * 0.48, b1 = b0 * 0.42;
          const zm = -D * 0.55;
          // two bands in depth for a slightly rounded wall
          const jx = (hash2(Math.round(p.x * 8), Math.round(p.y * 8), s) - 0.5) * 0.25;
          const jy = (hash2(Math.round(p.y * 8), Math.round(p.x * 8), s + 1) - 0.5) * 0.25;
          const kx = (hash2(Math.round(q.x * 8), Math.round(q.y * 8), s) - 0.5) * 0.25;
          const ky = (hash2(Math.round(q.y * 8), Math.round(q.x * 8), s + 1) - 0.5) * 0.25;
          const quad = (ax, ay, az, bx, by, bz, cr, cg, cb, dr, dg, db) => {
            // (a at p side, b at q side) front edge at z=az, back edge at z=bz
            pos.push(p.x + ax, p.y + ay, az, q.x + bx, q.y + by, az, q.x + bx, q.y + by, bz);
            col.push(cr, cg, cb, cr, cg, cb, dr, dg, db);
            pos.push(p.x + ax, p.y + ay, az, q.x + bx, q.y + by, bz, p.x + ax, p.y + ay, bz);
            col.push(cr, cg, cb, dr, dg, db, dr, dg, db);
          };
          // front band flares out a touch, back band tucks in
          const mr = (r0 + r1) * 0.55, mg = (g0 + g1) * 0.55, mb = (b0 + b1) * 0.55;
          quad(0, 0, 0.02, 0, 0, zm, r0, g0, b0, mr, mg, mb);
          // second band shifted by jitter so walls are not perfectly straight
          pos.push(p.x, p.y, zm, q.x, q.y, zm, q.x + kx, q.y + ky, -D);
          col.push(mr, mg, mb, mr, mg, mb, r1, g1, b1);
          pos.push(p.x, p.y, zm, q.x + kx, q.y + ky, -D, p.x + jx, p.y + jy, -D);
          col.push(mr, mg, mb, r1, g1, b1, r1, g1, b1);
        }
      }
    }
    // Orientation of wall triangles: we emitted p->q with solid on the left.
    // Viewed from the empty side the winding p, q, q_back is clockwise, so flip.
    this.fixWinding(pos, col);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    let mesh = this.chunks[ci];
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geo;
    } else {
      mesh = new THREE.Mesh(geo, this.mat);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.chunks[ci] = mesh;
      this.group.add(mesh);
    }
    this.rebuilt++;
  }

  // Front faces are generated CCW seen from +z (correct). Wall faces need
  // to face into the tunnel; flip any triangle whose normal points into soil.
  fixWinding(pos, col) {
    for (let i = 0; i < pos.length; i += 9) {
      const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
      const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
      const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const isWall = Math.abs(nz) < Math.hypot(nx, ny) * 0.9;
      let flip;
      if (!isWall) flip = nz < 0;
      else {
        // sample the corner field slightly along the normal (in xy)
        const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3;
        const l = Math.hypot(nx, ny) || 1;
        flip = this.fieldAt(mx + nx / l * 0.35, my + ny / l * 0.35) > 0.5;
      }
      if (flip) {
        for (let k = 0; k < 3; k++) {
          const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t;
          const tc = col[i + 3 + k]; col[i + 3 + k] = col[i + 6 + k]; col[i + 6 + k] = tc;
        }
      }
    }
  }

  fieldAt(x, y) {
    const cx = Math.max(0, Math.min(W - 1e-3, x)), cy = Math.max(0, Math.min(H - 1e-3, y));
    const ix = Math.floor(cx), iy = Math.floor(cy), tx = cx - ix, ty = cy - iy;
    const f = this.corner, W1 = W + 1;
    const a = f[iy * W1 + ix], b = f[iy * W1 + ix + 1], c = f[(iy + 1) * W1 + ix], d = f[(iy + 1) * W1 + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  buildBackWall() {
    const w = this.world;
    const step = 2;
    const pos = [], col = [];
    const nx = Math.ceil(W / step), ny = Math.ceil(H / step);
    const vcol = (x, y) => {
      const cx = Math.min(W - 1, x), cy = Math.min(H - 1, Math.max(0, Math.min(y, w.ground[cx] - 1)));
      this.cellColor(cx, cy, tmpC);
      const sh = 0.58 + hash2(x, y, this.seed + 55) * 0.1;
      return [tmpC.r * sh * 1.05, tmpC.g * sh * 0.95, tmpC.b * sh * 0.85];
    };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = i * step, y0 = j * step, x1 = Math.min(W, x0 + step), y1 = Math.min(H, y0 + step);
        const g = Math.max(w.ground[Math.min(W - 1, x0)], w.ground[Math.min(W - 1, x1 - 1)]);
        if (y0 >= g) continue;
        const Y1 = Math.min(y1, g);
        const z = -TUNNEL_D;
        const c0 = vcol(x0, y0), c1 = vcol(x1, y0), c2 = vcol(x1, Y1), c3 = vcol(x0, Y1);
        const jz = (a, b) => z + (hash2(a, b, this.seed + 8) - 0.5) * 0.18;
        pos.push(x0, y0, jz(x0, y0), x1, y0, jz(x1, y0), x1, Y1, jz(x1, Y1));
        col.push(...c0, ...c1, ...c2);
        pos.push(x0, y0, jz(x0, y0), x1, Y1, jz(x1, Y1), x0, Y1, jz(x0, Y1));
        col.push(...c0, ...c2, ...c3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: new THREE.Color('#3a1a08'), emissiveIntensity: 0.6 }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  buildRocksAndRoots() {
    const w = this.world;
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8f8a84', flatShading: true, roughness: 0.8 });
    for (const r of w.rocks) {
      if (r.y > w.ground[Math.floor(r.x)] - 1) continue;
      const geo = new THREE.DodecahedronGeometry(1, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const n = 0.8 + hash2(i, Math.floor(r.x * 10), this.seed) * 0.35;
        p.setXYZ(i, p.getX(i) * n, p.getY(i) * n, p.getZ(i) * n);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, rockMat);
      m.position.set(r.x, r.y, -0.2);
      m.scale.set(r.r * 0.95, r.ry * 0.95, 0.9);
      m.rotation.z = hash2(r.x | 0, r.y | 0, 3) * 3;
      this.group.add(m);
    }
    const rootMat = new THREE.MeshStandardMaterial({ color: '#8c6a47', flatShading: true, roughness: 0.9 });
    for (const root of w.roots) {
      if (root.pts.length < 3) continue;
      const curve = new THREE.CatmullRomCurve3(root.pts.map((p) => new THREE.Vector3(p.x, p.y, 0.05)));
      const geo = new THREE.TubeGeometry(curve, Math.max(4, root.pts.length), root.w, 4, false);
      const m = new THREE.Mesh(geo, rootMat);
      this.group.add(m);
    }
  }

  // ---- surface ground ----
  // Quads are laid out in a fixed order (iz * W + ix, then the front skirt)
  // so the dirt mound can be updated in place, region by region.
  buildSurface() {
    const nTri = W * SURF_D * 2 + W * 4;
    const geo = new THREE.BufferGeometry();
    this.surfPos = new Float32Array(nTri * 9);
    this.surfCol = new Float32Array(nTri * 9);
    this.surfNrm = new Float32Array(nTri * 9);
    this.surfUv = new Float32Array(nTri * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.surfPos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.surfNrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.surfCol, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.surfUv, 2));
    this.surfGeo = geo;
    // static base colour per quad: grass / bare dirt with a little jitter
    this.quadBase = new Float32Array(W * SURF_D * 3);
    const c = new THREE.Color();
    for (let iz = 0; iz < SURF_D; iz++) for (let ix = 0; ix < W; ix++) {
      const f = fbm(ix * 0.045, iz * 0.12, this.seed + 41, 3);
      const g = Math.max(0, Math.min(1, (f - 0.38) * 2.6)) * Math.min(1, iz / 2.5 + 0.3);
      c.copy(DIRT).lerp(g > 0.5 ? GRASS2 : GRASS, g).multiplyScalar(0.92 + hash2(ix, iz, this.seed + 71) * 0.16);
      const k = (iz * W + ix) * 3;
      this.quadBase[k] = c.r; this.quadBase[k + 1] = c.g; this.quadBase[k + 2] = c.b;
    }
    this.surfH = new Float32Array(SV * SVZ);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    this.surface = new THREE.Mesh(geo, mat);
    this.surface.receiveShadow = true;
    this.surface.frustumCulled = false;
    this.group.add(this.surface);
    this.updateSurface(null);
  }

  updateSurface(region) {
    const w = this.world, pos = this.surfPos, col = this.surfCol, nrm = this.surfNrm, uv = this.surfUv, hv = this.surfH;
    const x0 = region ? Math.max(0, region.x0 - 1) : 0, x1 = region ? Math.min(W - 1, region.x1 + 1) : W - 1;
    const z0 = region ? Math.max(0, region.z0 - 1) : 0, z1 = region ? Math.min(SURF_D - 1, region.z1 + 1) : SURF_D - 1;
    for (let iz = z0; iz <= z1 + 1; iz++) for (let ix = x0; ix <= x1 + 1; ix++) {
      const i = iz * SV + ix;
      hv[i] = w.baseSurf[i] + w.mound[i] - this.craterDip(ix, -iz);
    }
    const midden = this.sim.midden;
    const mTint = midden ? Math.min(0.6, midden.count * 0.01) : 0;
    const MID = tmpC.set('#4a3a2c');
    const mr = MID.r, mg = MID.g, mb = MID.b;
    let o = 0;
    const put = (x, y, z, r, g, b, u0, u1) => {
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      col[o] = r; col[o + 1] = g; col[o + 2] = b;
      uv[(o / 3) * 2] = u0; uv[(o / 3) * 2 + 1] = u1;
      o += 3;
    };
    const tri = (base) => {
      // flat normal for the triangle starting at float offset base
      const ax = pos[base], ay = pos[base + 1], az = pos[base + 2];
      const ux = pos[base + 3] - ax, uy = pos[base + 4] - ay, uz = pos[base + 5] - az;
      const vx = pos[base + 6] - ax, vy = pos[base + 7] - ay, vz = pos[base + 8] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      if (ny < 0 && Math.abs(nz) < 0.9 * l) { nx = -nx; ny = -ny; nz = -nz; }
      nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 9; k += 3) { nrm[base + k] = nx; nrm[base + k + 1] = ny; nrm[base + k + 2] = nz; }
    };
    for (let iz = z0; iz <= z1; iz++) {
      const moistRow = true;
      for (let ix = x0; ix <= x1; ix++) {
        const qk = iz * W + ix;
        let r = this.quadBase[qk * 3], g = this.quadBase[qk * 3 + 1], b = this.quadBase[qk * 3 + 2];
        const m = w.mound[iz * SV + ix];
        if (m > 0.02) { const t = Math.min(1, m * 1.6); r += (MOUND.r - r) * t; g += (MOUND.g - g) * t; b += (MOUND.b - b) * t; }
        const dip = this.craterDip(ix, -iz);
        if (dip > 0) { r *= 1 - dip * 0.5; g *= 1 - dip * 0.5; b *= 1 - dip * 0.5; }
        if (mTint > 0) {
          const dm = Math.hypot(ix - midden.x, -iz - midden.z);
          if (dm < 3) { const t = mTint * (1 - dm / 3); r += (mr - r) * t; g += (mg - g) * t; b += (mb - b) * t; }
        }
        if (moistRow) {
          const cx = Math.min(W - 1, ix);
          const wet = 1.06 - w.moist[Math.max(0, w.ground[cx] - 2) * W + cx] / 255 * 0.25;
          r *= wet; g *= wet; b *= wet;
        }
        const a = hv[iz * SV + ix], bb = hv[iz * SV + ix + 1], d = hv[(iz + 1) * SV + ix], e = hv[(iz + 1) * SV + ix + 1];
        o = qk * 18;
        const base = o;
        const u0 = ix / W, v0 = iz / SURF_D, u1 = (ix + 1) / W, v1 = (iz + 1) / SURF_D;
        if ((ix + iz) & 1) {
          put(ix, a, -iz, r, g, b, u0, v0); put(ix + 1, bb, -iz, r, g, b, u1, v0); put(ix + 1, e, -iz - 1, r, g, b, u1, v1);
          put(ix, a, -iz, r * 0.96, g * 0.96, b * 0.96, u0, v0); put(ix + 1, e, -iz - 1, r * 0.96, g * 0.96, b * 0.96, u1, v1); put(ix, d, -iz - 1, r * 0.96, g * 0.96, b * 0.96, u0, v1);
        } else {
          put(ix, a, -iz, r, g, b, u0, v0); put(ix + 1, bb, -iz, r, g, b, u1, v0); put(ix, d, -iz - 1, r, g, b, u0, v1);
          put(ix + 1, bb, -iz, r * 0.96, g * 0.96, b * 0.96, u1, v0); put(ix + 1, e, -iz - 1, r * 0.96, g * 0.96, b * 0.96, u1, v1); put(ix, d, -iz - 1, r * 0.96, g * 0.96, b * 0.96, u0, v1);
        }
        tri(base); tri(base + 9);
      }
    }
    // front skirt: covers the seam between the surface and the soil section,
    // and shows the excavated mound in cross-section against the glass
    if (z0 === 0) {
      const skirt = W * SURF_D * 18;
      const quad = (x0q, x1q, y00, y01, y10, y11, cr, cg, cb) => {
        const start = o;
        put(x0q, y00, 0.03, cr, cg, cb, 0, 0); put(x1q, y01, 0.03, cr, cg, cb, 0, 0); put(x1q, y11, 0.03, cr, cg, cb, 0, 0);
        put(x0q, y00, 0.03, cr, cg, cb, 0, 0); put(x1q, y11, 0.03, cr, cg, cb, 0, 0); put(x0q, y10, 0.03, cr, cg, cb, 0, 0);
        for (let k = start; k < o; k += 3) { nrm[k] = 0; nrm[k + 1] = 0; nrm[k + 2] = 1; }
      };
      for (let ix = x0; ix <= x1; ix++) {
        o = skirt + ix * 36;
        const b0 = w.baseSurf[ix], b1 = w.baseSurf[ix + 1];
        const top0 = hv[ix], top1 = hv[ix + 1];
        const isEntrance = this.sim.entrances.some((e) => ix >= e.cellX - 1 && ix <= e.cellX + 2);
        const sh = 0.9 + hash2(ix, 7, this.seed) * 0.2;
        const bot = isEntrance ? Math.min(b0, b1) - 0.05 : Math.min(w.ground[Math.min(W - 1, ix)], b0, b1) - 1.2;
        quad(ix, ix + 1, bot, bot, Math.min(b0, top0), Math.min(b1, top1), TOPSOIL.r * sh, TOPSOIL.g * sh, TOPSOIL.b * sh);
        const sm = 0.85 + hash2(ix, 9, this.seed) * 0.25;
        quad(ix, ix + 1, Math.min(b0, top0), Math.min(b1, top1), Math.max(b0, top0), Math.max(b1, top1), MOUND.r * sm, MOUND.g * sm, MOUND.b * sm);
      }
    }
    const ga = this.surfGeo.attributes;
    ga.position.needsUpdate = true; ga.color.needsUpdate = true; ga.normal.needsUpdate = true; ga.uv.needsUpdate = true;
  }

  craterDip(x, z) {
    let dip = 0;
    for (const e of this.sim.entrances) {
      const d = Math.hypot(x - e.x, z - e.z);
      if (d < 1.8) dip = Math.max(dip, (1 - d / 1.8) * 0.9);
    }
    return dip;
  }

  update(dt) {
    const w = this.world;
    // rebuild dirty chunks within a small time budget per frame
    if (w.dirtyChunks.size) {
      const t0 = performance.now();
      for (const ci of w.dirtyChunks) {
        const x0 = (ci % CX) * CHUNK, y0 = Math.floor(ci / CX) * CHUNK;
        this.buildCornerField(x0, y0, x0 + CHUNK, y0 + CHUNK);
        this.buildChunk(ci);
        w.dirtyChunks.delete(ci);
        if (performance.now() - t0 > 3) break;
      }
    }
    this.moundTimer -= dt;
    const entrancesChanged = this.sim.entrances.length !== this.lastEntrances;
    if (entrancesChanged) {
      this.lastEntrances = this.sim.entrances.length;
      this.updateSurface(null);
      w.moundDirty = null;
    } else if (w.moundDirty && this.moundTimer <= 0) {
      this.moundTimer = 0.25;
      this.updateSurface(w.moundDirty);
      w.moundDirty = null;
    }
    if (w.moistVersion - this.lastMoist > 30) {
      this.lastMoist = w.moistVersion;
      // only the top band of chunks changes colour
      this.buildCellColors(0, H - CHUNK * 2, W, H);
      this.updateSurface(null);
      for (let cx = 0; cx < CX; cx++) w.dirtyChunks.add((CY - 1) * CX + cx), w.dirtyChunks.add((CY - 2) * CX + cx);
    }
  }
}
