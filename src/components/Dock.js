// Contour Dock: the app launcher, body-locked below your view.
//
// Anchor (anchor.mode = body-lock): like a bag strapped to your waist. It
// stays put when you glance around, and follows when your body turns:
// after anchor.follow.delay, with a critically damped spring (no wobble).
// WebXR does not track the torso, so the body's direction is estimated from
// a sustained head turn (see DEFAULTS.followThreshold).
//
// Magnify: icons grow as the hand approaches (dock.magnify.*), so targets get
// bigger before you reach them (a Fitts's-law aid, not decoration).
import * as THREE from 'three';
import { markComponent } from '../core/Interactable.js';
import { DEFAULTS } from '../core/defaults.js';
import { slabGeometry, frameGeometry, surfaceMaterial, flatMaterial } from '../core/surface.js';
import { springStep, wrapAngle } from '../core/spring.js';
import { Button } from './Button.js';

// dock.magnify.falloff = cosine: scale = 1 + (max - 1) * cos(d / radius * pi/2).
export function magnifyScale(d, radius, max) {
  if (d >= radius) return 1;
  return 1 + (max - 1) * Math.cos((d / radius) * Math.PI / 2);
}

// Lazy follow on yaw: waits `delay` seconds of a sustained turn beyond
// `threshold`, then springs to the body direction. Pure state machine.
export class LazyFollow {
  constructor({ delay, omega, threshold, settle = (2 * Math.PI) / 180 }) {
    Object.assign(this, { delay, omega, threshold, settle });
    this.yaw = { x: 0, v: 0 };
    this.target = 0;
    this.waited = 0;
    this.following = false;
    this.started = false;
  }
  update(dt, bodyYaw) {
    if (!this.started) {
      this.started = true;
      this.yaw.x = this.target = bodyYaw;
      return this.yaw.x;
    }
    const off = Math.abs(wrapAngle(bodyYaw - this.yaw.x));
    if (!this.following) {
      this.waited = off > this.threshold ? this.waited + dt : 0;
      if (this.waited >= this.delay) this.following = true;
    }
    if (this.following) {
      this.target = this.yaw.x + wrapAngle(bodyYaw - this.yaw.x);
      if (off < this.settle && Math.abs(this.yaw.v) < 0.05) { this.following = false; this.waited = 0; }
    }
    return springStep(this.yaw, this.target, this.omega, dt);
  }
}

export class Dock extends THREE.Group {
  /**
   * @param {object} T tokens
   * @param {object} o
   * @param {{label: string, color?: number}[]} o.apps
   * @param {number} [o.distance] body-lock distance in m
   */
  constructor(T, o) {
    super();
    markComponent(this);
    this.T = T;
    if (T.get('anchor.mode') !== 'body-lock') console.warn('Contour Dock only implements anchor.mode = body-lock');
    const dist = this.distance = o.distance ?? DEFAULTS.dockDistance;
    this.eccentricity = T.get('anchor.eccentricity.vertical');
    this.radius = T.dmm('dock.magnify.radius', dist);
    this.maxScale = T.get('dock.magnify.scale.max');
    this.gap = T.dmm('size.gap.min', dist);
    this.follow = new LazyFollow({
      delay: T.get('anchor.follow.delay'),
      omega: T.get('anchor.follow.frequency'),
      threshold: (DEFAULTS.followThreshold * Math.PI) / 180,
    });
    this.pos = ['x', 'y', 'z'].map(() => ({ x: 0, v: 0 }));
    this.posStarted = false;
    this.rotation.order = 'YXZ';

    this.icons = o.apps.map(app => {
      const b = new Button(T, { label: app.label, thickness: 'regular', density: 'firm', distance: dist, color: app.color });
      b.addEventListener('select', () => this.dispatchEvent({ type: 'select', app }));
      this.add(b);
      return b;
    });
    this.side = this.icons[0].w;
    this.tBase = T.get('material.t.thick');
    this.base = new THREE.Mesh(new THREE.BufferGeometry(), surfaceMaterial(T, DEFAULTS.color.surface));
    this.base.position.z = -this.tBase;
    this.add(this.base);
    this.outlineW = T.dmm('surface.outline.mr', dist);
    this.baseOutline = new THREE.Mesh(new THREE.BufferGeometry(), flatMaterial(DEFAULTS.color.outline, 0.85));
    this.add(this.baseOutline);
    this.restX = this.icons.map((_, i) => (i - (this.icons.length - 1) / 2) * (this.side + this.gap));
    this.scales = this.icons.map(() => 1);
    this.layout();
  }

  layout() {
    const widths = this.scales.map(s => s * this.side);
    const total = widths.reduce((a, b) => a + b, 0) + this.gap * (widths.length - 1);
    let x = -total / 2;
    this.icons.forEach((icon, i) => {
      const s = this.scales[i];
      icon.scale.set(s, s, 1);
      // Grow upward from a shared baseline, like a shelf.
      icon.position.set(x + widths[i] / 2, (s - 1) * this.side / 2, 0);
      x += widths[i] + this.gap;
    });
    const w = total + this.gap * 2, h = this.side + this.gap * 2;
    if (this._baseW !== w) {
      this._baseW = w;
      this.base.geometry.dispose();
      this.base.geometry = slabGeometry(w, h, this.tBase);
      this.baseOutline.geometry.dispose();
      this.baseOutline.geometry = frameGeometry(w, h, this.outlineW);
      this.baseOutline.position.z = -this.tBase + 0.0002;
    }
  }

  /**
   * @param {number} dt
   * @param {THREE.Object3D} head  the camera
   * @param {THREE.Vector3[]} hands  world points of fingertips / ray hits
   */
  update(dt, head, hands = []) {
    // Body-lock with lazy follow.
    const headPos = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    const headYaw = Math.atan2(-fwd.x, -fwd.z);
    const yaw = this.follow.update(dt, headYaw);
    const ecc = this.eccentricity; // negative = below eye level
    const target = [
      headPos.x - Math.sin(yaw) * Math.cos(ecc) * this.distance,
      headPos.y + Math.sin(ecc) * this.distance,
      headPos.z - Math.cos(yaw) * Math.cos(ecc) * this.distance,
    ];
    target.forEach((v, i) => {
      if (!this.posStarted) this.pos[i].x = v;
      springStep(this.pos[i], v, this.follow.omega, dt);
    });
    this.posStarted = true;
    this.position.set(this.pos[0].x, this.pos[1].x, this.pos[2].x);
    this.rotation.set(ecc, yaw, 0);
    this.updateMatrixWorld();

    // Magnify from the nearest hand, measured to each icon's rest position.
    const inv = new THREE.Matrix4().copy(this.matrixWorld).invert();
    const local = hands.map(h => h.clone().applyMatrix4(inv));
    this.scales = this.restX.map(x => {
      let s = 1;
      for (const p of local) {
        const d = Math.hypot(p.x - x, p.y, Math.max(0, p.z));
        s = Math.max(s, magnifyScale(d, this.radius, this.maxScale));
      }
      return s;
    });
    this.layout();
    this.icons.forEach(i => i.update(dt));
  }
}
