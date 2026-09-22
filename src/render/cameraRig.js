// Diorama camera: pan, zoom-to-cursor, gentle orbit, and smooth follow.
import * as THREE from 'three';
import { W, H } from '../sim/constants.js';

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(W / 2, H * 0.72, 0);
    this.goal = this.target.clone();
    this.dist = 150; this.goalDist = 150;
    this.yaw = 0; this.goalYaw = 0;
    this.pitch = 0.12; this.goalPitch = 0.12;
    this.follow = null;          // function returning [x,y,z] or null
    this.pointers = new Map();
    this.dragged = false;
    this.onClick = null;
    this.onDoubleClick = null;
    this.bind();
  }

  frameAll(aspect) {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const needW = (W + 16) / 2 / Math.tan(fov / 2) / aspect;
    const needH = (H + 34) / 2 / Math.tan(fov / 2);
    this.goalDist = Math.max(needW, needH);
    this.goal.set(W / 2, (H + 14) / 2, 0);
    this.goalYaw = 0; this.goalPitch = 0.14;
  }

  maxDist() {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    return Math.max((W + 60) / 2 / Math.tan(fov / 2) / this.camera.aspect, (H + 80) / 2 / Math.tan(fov / 2));
  }

  focus(x, y, dist) {
    this.goal.set(x, y, 0);
    if (dist) this.goalDist = dist;
  }

  // world point on the z = 0 plane under a screen position
  screenToPlane(cx, cy, out = new THREE.Vector3()) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    return ray.ray.intersectPlane(plane, out) || out.copy(this.target);
  }

  unitsPerPixel() {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    return (2 * this.dist * Math.tan(fov / 2)) / this.dom.clientHeight;
  }

  bind() {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button });
      this.dragged = false;
      if (this.pointers.size === 2) this.pinch = this.pinchState();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 5) this.dragged = true;
      if (!this.dragged) return;
      if (this.pointers.size === 2) {
        const s = this.pinchState();
        if (this.pinch) {
          const k = this.pinch.d / Math.max(1, s.d);
          this.zoomAt(s.cx, s.cy, k);
          this.panBy(s.cx - this.pinch.cx, s.cy - this.pinch.cy);
        }
        this.pinch = s;
        return;
      }
      if (p.button === 2 || e.shiftKey) {
        this.goalYaw = THREE.MathUtils.clamp(this.goalYaw - dx * 0.004, -0.75, 0.75);
        this.goalPitch = THREE.MathUtils.clamp(this.goalPitch + dy * 0.004, -0.15, 0.85);
      } else this.panBy(dx, dy);
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (p && !this.dragged && p.button === 0 && this.onClick) this.onClick(e.clientX, e.clientY);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.pinch = null; });
    el.addEventListener('dblclick', (e) => this.onDoubleClick && this.onDoubleClick(e.clientX, e.clientY));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const k = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0012));
      this.zoomAt(e.clientX, e.clientY, k);
    }, { passive: false });
  }

  pinchState() {
    const ps = [...this.pointers.values()];
    return { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), cx: (ps[0].x + ps[1].x) / 2, cy: (ps[0].y + ps[1].y) / 2 };
  }

  panBy(dx, dy) {
    const u = this.unitsPerPixel() * (this.goalDist / this.dist);
    this.goal.x -= dx * u * Math.cos(this.yaw);
    this.goal.y += dy * u;
    this.clamp();
    if (this.follow && Math.hypot(dx, dy) > 2) this.follow = null;
  }

  zoomAt(cx, cy, k) {
    const before = this.screenToPlane(cx, cy);
    const nd = THREE.MathUtils.clamp(this.goalDist * k, 5, this.maxDist());
    const f = 1 - nd / this.goalDist;
    if (!this.follow) {
      this.goal.x += (before.x - this.goal.x) * f;
      this.goal.y += (before.y - this.goal.y) * f;
    }
    this.goalDist = nd;
    this.clamp();
  }

  clamp() {
    this.goal.x = THREE.MathUtils.clamp(this.goal.x, -10, W + 10);
    this.goal.y = THREE.MathUtils.clamp(this.goal.y, -6, H + 30);
  }

  update(dt) {
    if (this.follow) {
      const p = this.follow();
      if (p) { this.goal.set(p[0], p[1], 0); }
      else this.follow = null;
    }
    const k = 1 - Math.exp(-dt * 7);
    this.target.lerp(this.goal, k);
    this.dist += (this.goalDist - this.dist) * k;
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.pitch += (this.goalPitch - this.pitch) * k;
    const c = this.camera;
    const cp = Math.cos(this.pitch);
    // look slightly down onto the surface when zoomed out
    c.position.set(
      this.target.x + Math.sin(this.yaw) * this.dist * cp,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * this.dist * cp,
    );
    c.lookAt(this.target);
    c.near = Math.max(0.5, this.dist * 0.05);
    c.far = this.dist + 3000;
    c.updateProjectionMatrix();
  }
}
