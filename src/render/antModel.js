// Procedural low-poly ant. One merged geometry per detail level; legs and
// antennae are animated in the vertex shader (tripod gait) from a per-
// instance phase, so thousands of ants cost a single draw call.
import * as THREE from 'three';

// part ids: 0 body, 1..6 legs, 7..8 antennae, 9 mandibles, 10 gaster
function pushGeo(list, geo, part, hip, color) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const n = geo.attributes.position.count;
  const parts = new Float32Array(n).fill(part);
  const hips = new Float32Array(n * 3);
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    hips[i * 3] = hip[0]; hips[i * 3 + 1] = hip[1]; hips[i * 3 + 2] = hip[2];
    cols[i * 3] = color[0]; cols[i * 3 + 1] = color[1]; cols[i * 3 + 2] = color[2];
  }
  geo.setAttribute('aPart', new THREE.BufferAttribute(parts, 1));
  geo.setAttribute('aHip', new THREE.BufferAttribute(hips, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  list.push(geo);
}

function blob(r, sx, sy, sz, x, y, z, detail = 0) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

// thin 3-sided prism between two points
function segment(a, b, r) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r * 0.75, r, len, 3, 1, false);
  g.translate(0, len / 2, 0);
  const dir = vb.clone().sub(va).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  g.translate(va.x, va.y, va.z);
  return g;
}

function merge(geos) {
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'aPart', 'aHip']) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

// kind: 'worker' | 'queen' ; detail: 0 low, 1 high
export function buildAntGeometry(kind = 'worker', detail = 1) {
  const L = [];
  const body = [1, 1, 1], leg = [0.8, 0.8, 0.8], gasterC = [1.15, 1.1, 1.05];
  const queen = kind === 'queen';
  const d = detail ? 1 : 0;
  // head
  pushGeo(L, blob(0.2, 1.1, 0.85, 1.0, 0.58, 0.05, 0, d), 0, [0, 0, 0], body);
  // mandibles
  if (detail) {
    pushGeo(L, segment([0.72, 0.0, 0.07], [0.86, -0.02, 0.02], 0.035), 9, [0.72, 0, 0], leg);
    pushGeo(L, segment([0.72, 0.0, -0.07], [0.86, -0.02, -0.02], 0.035), 9, [0.72, 0, 0], leg);
  }
  // thorax (mesosoma) + petiole
  pushGeo(L, blob(0.2, 1.45, 0.72, 0.72, 0.24, 0.07, 0, d), 0, [0, 0, 0], body);
  pushGeo(L, blob(0.07, 1, 1.3, 1, -0.02, 0.07, 0, 0), 0, [0, 0, 0], body);
  // gaster
  if (queen) pushGeo(L, blob(0.3, 2.1, 1.25, 1.3, -0.62, 0.1, 0, 1), 10, [0, 0, 0], gasterC);
  else pushGeo(L, blob(0.26, 1.35, 1.05, 1.1, -0.32, 0.08, 0, d), 10, [0, 0, 0], gasterC);
  // legs: hips along the thorax; femur goes up and out, tibia down to the ground
  const hipsX = [0.36, 0.24, 0.12];
  const reach = [0.28, 0.02, -0.3];
  const lw = detail ? 0.028 : 0.04;
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; k < 3; k++) {
      const id = 1 + k + (side > 0 ? 3 : 0);
      const hip = [hipsX[k], 0.02, 0.06 * side];
      const knee = [hipsX[k] + reach[k] * 0.45, 0.18, 0.34 * side];
      const foot = [hipsX[k] + reach[k], -0.16, 0.5 * side];
      pushGeo(L, segment(hip, knee, lw), id, hip, leg);
      pushGeo(L, segment(knee, foot, lw * 0.85), id, hip, leg);
    }
  }
  // antennae: elbowed
  if (detail || true) {
    for (let side = -1; side <= 1; side += 2) {
      const id = side < 0 ? 7 : 8;
      const base = [0.68, 0.12, 0.06 * side];
      const elbow = [0.78, 0.34, 0.14 * side];
      const tip = [1.02, 0.28, 0.3 * side];
      pushGeo(L, segment(base, elbow, 0.022), id, base, leg);
      pushGeo(L, segment(elbow, tip, 0.018), id, base, leg);
    }
  }
  if (queen) {
    // wing scars / thicker thorax
    pushGeo(L, blob(0.12, 1.4, 0.8, 1.2, 0.2, 0.2, 0, 0), 0, [0, 0, 0], body);
  }
  const g = merge(L);
  g.computeBoundingSphere();
  return g;
}

// Adds gait animation to a MeshStandardMaterial. Instance attribute aAnim:
// x = gait phase, y = stride amplitude (0 when still), z = "work" wiggle.
export function makeAntMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.15, flatShading: true, ...opts });
  mat.userData.uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = mat.userData.uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPart;
        attribute vec3 aHip;
        attribute vec3 aAnim;
        uniform float uTime;
        vec3 rotY(vec3 p, vec3 o, float a){ vec3 d=p-o; float c=cos(a), s=sin(a); return o+vec3(c*d.x+s*d.z, d.y, -s*d.x+c*d.z); }
        vec3 rotZ(vec3 p, vec3 o, float a){ vec3 d=p-o; float c=cos(a), s=sin(a); return o+vec3(c*d.x-s*d.y, s*d.x+c*d.y, d.z); }
      `)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float ph = aAnim.x;
          float amp = aAnim.y;
          float work = aAnim.z;
          if (aPart > 0.5 && aPart < 6.5) {
            float k = aPart - 1.0;
            float side = k < 2.5 ? -1.0 : 1.0;
            float idx = mod(k, 3.0);
            // tripod gait: L1,R2,L3 vs R1,L2,R3
            float grp = mod(idx + (side > 0.0 ? 1.0 : 0.0), 2.0);
            float s = sin(ph + grp * 3.14159);
            transformed = rotY(transformed, aHip, s * 0.45 * amp * side);
            float lift = max(0.0, cos(ph + grp * 3.14159)) * 0.09 * amp;
            float reachF = clamp(abs(transformed.z - aHip.z) * 2.0, 0.0, 1.0);
            transformed.y += lift * reachF;
            // digging / carrying: front legs paddle
            if (idx < 0.5) transformed = rotZ(transformed, aHip, sin(uTime * 14.0 + ph) * 0.35 * work);
          } else if (aPart > 6.5 && aPart < 8.5) {
            float side = aPart < 7.5 ? -1.0 : 1.0;
            float w = sin(uTime * (3.0 + work * 6.0) + ph * 0.7 + side * 1.7) * (0.18 + work * 0.2);
            transformed = rotY(transformed, aHip, w * side);
            transformed = rotZ(transformed, aHip, sin(uTime * 2.3 + side + ph) * 0.12);
          } else if (aPart > 8.5 && aPart < 9.5) {
            transformed = rotY(transformed, aHip, sin(uTime * 18.0) * 0.25 * work * sign(transformed.z));
          } else if (aPart > 9.5) {
            transformed.y += sin(ph * 2.0) * 0.012 * amp;
          }
        }
      `);
  };
  mat.customProgramCacheKey = () => 'ant-gait';
  return mat;
}
