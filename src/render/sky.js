// Day/night lighting, sky gradient, sun & moon, stars and rain.
import * as THREE from 'three';
import { W, H, SURF_D } from '../sim/constants.js';
import { glowTexture } from './life.js';

const C = (h) => new THREE.Color(h);
// key frames over the day (t = 0 midnight, 0.5 noon)
const KEYS = [
  { t: 0.0, top: C('#0b1330'), bot: C('#1c2447'), sun: C('#6f86c9'), sunI: 0.35, hemi: 0.35, fill: 0.9 },
  { t: 0.2, top: C('#1b2350'), bot: C('#6d4a6b'), sun: C('#ff9a6a'), sunI: 0.5, hemi: 0.45, fill: 0.85 },
  { t: 0.27, top: C('#4f7fc0'), bot: C('#f2b27c'), sun: C('#ffc285'), sunI: 1.6, hemi: 0.7, fill: 0.7 },
  { t: 0.5, top: C('#5a95d6'), bot: C('#cfe2ef'), sun: C('#fff2da'), sunI: 2.6, hemi: 0.95, fill: 0.6 },
  { t: 0.73, top: C('#5078b8'), bot: C('#f5a36e'), sun: C('#ffb070'), sunI: 1.5, hemi: 0.7, fill: 0.7 },
  { t: 0.8, top: C('#21275a'), bot: C('#8a4f63'), sun: C('#ff8a5c'), sunI: 0.5, hemi: 0.45, fill: 0.85 },
  { t: 1.0, top: C('#0b1330'), bot: C('#1c2447'), sun: C('#6f86c9'), sunI: 0.35, hemi: 0.35, fill: 0.9 },
];

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    // gradient dome
    this.uniforms = { uTop: { value: C('#5a95d6') }, uBot: { value: C('#cfe2ef') } };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop; uniform vec3 uBot; varying vec3 vP;\nvoid main(){ float h = clamp(normalize(vP).y*1.6+0.35,0.0,1.0); gl_FragColor = vec4(mix(uBot,uTop,h),1.0);\n#include <colorspace_fragment>\n}',
    }));
    dome.position.set(W / 2, 40, -200);
    this.dome = dome;
    this.group.add(dome);

    // stars
    const n = 600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI - Math.PI / 2, b = Math.random() * 0.9 + 0.05;
      pos[i * 3] = W / 2 + Math.sin(a) * Math.cos(b) * 1200;
      pos[i * 3 + 1] = 40 + Math.sin(b) * 900;
      pos[i * 3 + 2] = -200 - Math.cos(a) * Math.cos(b) * 1200;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
    this.group.add(this.stars);

    const glow = glowTexture();
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#fff3c4', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sunSprite.scale.setScalar(160);
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#dfe8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.moonSprite.scale.setScalar(80);
    this.group.add(this.sunSprite, this.moonSprite);

    // lights
    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#4a3a2a', 0.9);
    this.sun = new THREE.DirectionalLight('#fff2da', 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -W * 0.55; sc.right = W * 0.55; sc.top = 60; sc.bottom = -60; sc.near = 10; sc.far = 600;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.sun.target.position.set(W / 2, H - 10, -SURF_D / 2);
    // warm lamp in front of the glass keeps the cross-section readable
    this.fill = new THREE.DirectionalLight('#ffd7a8', 0.7);
    this.fill.position.set(W / 2 - 40, H * 0.4 + 60, 180);
    this.fill.target.position.set(W / 2, H * 0.4, 0);
    this.group.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);

    // rain
    const rn = 2600;
    const rp = new Float32Array(rn * 6);
    this.rainSeeds = new Float32Array(rn * 3);
    for (let i = 0; i < rn; i++) {
      this.rainSeeds[i * 3] = Math.random() * (W + 20) - 10;
      this.rainSeeds[i * 3 + 1] = Math.random();
      this.rainSeeds[i * 3 + 2] = -0.4 - Math.random() * (SURF_D + 30);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#bcd3ea', transparent: true, opacity: 0.0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    this.night = 0;
    this.tmp = { top: C('#000'), bot: C('#000'), sun: C('#000') };
  }

  sample(t) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) if (t >= KEYS[i].t && t <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    const s = k * k * (3 - 2 * k);
    this.tmp.top.copy(a.top).lerp(b.top, s);
    this.tmp.bot.copy(a.bot).lerp(b.bot, s);
    this.tmp.sun.copy(a.sun).lerp(b.sun, s);
    return { sunI: a.sunI + (b.sunI - a.sunI) * s, hemi: a.hemi + (b.hemi - a.hemi) * s, fill: a.fill + (b.fill - a.fill) * s };
  }

  update(tod, weather, time, groundY, camera) {
    const v = this.sample(tod);
    const rain = weather.rain, heat = weather.heat;
    const grey = C('#7d8791');
    this.uniforms.uTop.value.copy(this.tmp.top).lerp(grey, rain * 0.6);
    this.uniforms.uBot.value.copy(this.tmp.bot).lerp(grey, rain * 0.5);
    if (heat > 0.05) this.uniforms.uBot.value.lerp(C('#f7d59a'), heat * 0.25 * (tod > 0.25 && tod < 0.75 ? 1 : 0));
    // sun arc across the terrarium (east -> west)
    const ang = (tod - 0.25) * Math.PI * 2;   // 0 at sunrise, PI at sunset
    const sx = W / 2 - Math.cos(ang) * 260, sy = groundY + Math.sin(ang) * 220, sz = 70;
    const day = Math.sin(ang) > -0.05;
    if (day) this.sun.position.set(sx, Math.max(groundY + 25, sy), sz);
    else this.sun.position.set(W / 2 + Math.cos(ang) * 200, groundY + Math.max(40, -Math.sin(ang) * 200), sz); // moon light
    this.sun.color.copy(this.tmp.sun);
    this.sun.intensity = v.sunI * (1 - rain * 0.55) * (1 + heat * 0.15);
    this.hemi.intensity = v.hemi * (1 - rain * 0.2);
    this.hemi.color.copy(this.tmp.top).lerp(C('#ffffff'), 0.5);
    this.fill.intensity = v.fill;
    this.night = 1 - Math.min(1, Math.max(0, (v.sunI - 0.4) / 1.0));
    this.stars.material.opacity = Math.max(0, this.night - 0.35) * (1 - rain) * 1.2;
    // celestial sprites far behind the tank
    this.sunSprite.position.set(W / 2 - Math.cos(ang) * 700, groundY + Math.sin(ang) * 500 - 40, -900);
    this.sunSprite.material.opacity = day ? 1 - rain * 0.8 : 0;
    this.moonSprite.position.set(W / 2 + Math.cos(ang) * 700, groundY - Math.sin(ang) * 500 - 40, -900);
    this.moonSprite.material.opacity = !day ? 0.9 * (1 - rain) : 0;
    // rain streaks
    this.rain.visible = rain > 0.02;
    if (this.rain.visible) {
      this.rain.material.opacity = Math.min(0.55, rain * 0.6);
      const p = this.rain.geometry.attributes.position.array, s = this.rainSeeds;
      const top = groundY + 70, span = 75;
      const n = Math.floor(s.length / 3 * Math.min(1, rain * 1.2));
      for (let i = 0; i < s.length / 3; i++) {
        if (i >= n) { p[i * 6 + 1] = p[i * 6 + 4] = -999; continue; }
        const y = top - ((s[i * 3 + 1] * span + time * 55) % span);
        const x = s[i * 3] + weather.wind * 2;
        p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = s[i * 3 + 2];
        p[i * 6 + 3] = x - weather.wind * 0.6; p[i * 6 + 4] = y + 1.6; p[i * 6 + 5] = s[i * 3 + 2];
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}
