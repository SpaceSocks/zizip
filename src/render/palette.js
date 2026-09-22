import * as THREE from 'three';

// Soil and nature colours, tuned for ACES tone mapping.
export const SOIL_COLORS = {
  2: new THREE.Color('#6a4a33'),   // loam
  3: new THREE.Color('#8b5236'),   // clay
  4: new THREE.Color('#b4935f'),   // sand
  5: new THREE.Color('#77716b'),   // rock
  6: new THREE.Color('#7d5b3b'),   // root
  7: new THREE.Color('#5e4433'),   // loose
};
export const TOPSOIL = new THREE.Color('#3f2d20');
export const DEEP = new THREE.Color('#58402e');
export const GRASS = new THREE.Color('#62803a');
export const GRASS2 = new THREE.Color('#7f9443');
export const DIRT = new THREE.Color('#735437');
export const MOUND = new THREE.Color('#8f6a45');

export const ANT_COLOR = new THREE.Color('#3b2016');
export const MAJOR_COLOR = new THREE.Color('#57281a');
export const QUEEN_COLOR = new THREE.Color('#2c1911');

export const ROLE_COLORS = [
  new THREE.Color('#8fa3b8'), // idle
  new THREE.Color('#47d16a'), // forage
  new THREE.Color('#ff9a3c'), // dig
  new THREE.Color('#ff6fb5'), // nurse
  new THREE.Color('#b9b9b9'), // clean
  new THREE.Color('#ff3b3b'), // defend
  new THREE.Color('#ffe14d'), // eat
  new THREE.Color('#d9a6ff'), // queen
  new THREE.Color('#333333'),
];
export const ROLE_CSS = ROLE_COLORS.map((c) => '#' + c.getHexString());
