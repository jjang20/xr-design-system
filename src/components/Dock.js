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
import { bodyGeometry, bodyMaterial, faceMaterial, makeText } from '../core/look.js';
import { springStep } from '../core/spring.js';
import { magnifyScale, LazyFollow } from '../core/follow.js';
import { Button } from './Button.js';

export { magnifyScale, LazyFollow };

export class Dock extends THREE.Group {
  /**
   * @param {object} T tokens
   * @param {object} o
   * @param {{label: string, icon?: string, color?: number}[]} o.apps
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

    // App icons: round, tinted, with a glyph. Names appear on hover.
    const dmm = v => (v / 1000) * dist;
    this.icons = o.apps.map(app => {
      const b = new Button(T, { icon: app.icon, shape: 'circle', variant: 'tinted', color: app.color, thickness: 'regular', density: 'firm', distance: dist });
      b.addEventListener('select', () => this.dispatchEvent({ type: 'select', app }));
      const name = makeText(app.label, { size: dmm(13), weight: 500, opacity: 0 });
      name.position.set(0, -b.h / 2 - dmm(14), b.t);
      b.add(name);
      b.nameText = name;
      this.add(b);
      return b;
    });
    this.side = this.icons[0].w;
    this.tBase = T.get('material.t.thick');
    this.pad = dmm(14);
    this.base = new THREE.Mesh(new THREE.BufferGeometry(), bodyMaterial(T, { color: DEFAULTS.color.window }));
    this.base.position.z = -this.tBase;
    this.add(this.base);
    this.baseFx = new THREE.Mesh(new THREE.BufferGeometry(), faceMaterial(T, { w: 1, h: 1, r: 0.5, distance: dist }));
    this.add(this.baseFx);
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
    // The capsule platter stretches with the magnified row (rebuilt in 2 mm steps).
    const w = total + this.pad * 2, h = this.side + this.pad * 2;
    if (this._baseW === undefined || Math.abs(this._baseW - w) > 0.002) {
      this._baseW = w;
      this.base.geometry.dispose();
      this.base.geometry = bodyGeometry(w, h, this.tBase, h / 2);
      this.baseFx.geometry.dispose();
      this.baseFx.geometry = new THREE.PlaneGeometry(w, h);
      const u = this.baseFx.material.uniforms;
      u.uSize.value.set(w, h);
      u.uRadius.value = h / 2;
      this.baseFx.position.z = 0.0002;
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
    for (const icon of this.icons) {
      icon.update(dt);
      icon.nameText.fillOpacity = icon.hover;
    }
  }
}
