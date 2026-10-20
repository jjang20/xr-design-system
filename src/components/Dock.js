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
//
// Look (Jihoon, 2026-10-20; lookdev/dock_slider.py --option shelf): a Snow
// Leopard style dock. Upright tiles of tinted glass float over a thin, smoky
// glass shelf and are mirrored in it. Shelf and icons follow an arc centred
// on the user at the dock's distance, so every icon is the same reach away.
import * as THREE from 'three';
import { markComponent } from '../core/Interactable.js';
import { DEFAULTS } from '../core/defaults.js';
import { glassMaterial, glassSlabGeometry, makeText } from '../core/look.js';
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

    // Everything sits in a level frame: the group is pitched to face the
    // eye, but the shelf lies flat in the room and the tiles stand upright on
    // it, so you look down on them, as on a desk.
    this.level = new THREE.Group();
    this.level.rotation.x = -this.eccentricity;
    this.add(this.level);
    // App icons: upright tiles of tinted glass with a glyph. Names appear on hover.
    const dmm = v => (v / 1000) * dist;
    const S = DEFAULTS.look.dockShelf;
    this.icons = o.apps.map(app => {
      const b = new Button(T, { icon: app.icon, variant: 'tile', color: app.color, thickness: 'thin', density: 'firm', distance: dist });
      b.addEventListener('select', () => this.dispatchEvent({ type: 'select', app }));
      const name = makeText(app.label, { size: dmm(13), weight: 500, opacity: 0 });
      name.position.set(0, b.h / 2 + dmm(12), b.t);  // above: the shelf is below
      b.add(name);
      b.nameText = name;
      this.level.add(b);
      return b;
    });
    this.side = this.icons[0].w;
    this.lift = dmm(S.lift);
    this.pad = dmm(16);
    this.shelfT = S.thickness / 1000 * dist / 0.6;
    // The shelf, just under the floating icons.
    this.shelf = new THREE.Group();
    this.shelf.position.y = -this.side / 2 - this.lift;
    this.level.add(this.shelf);
    this.base = new THREE.Mesh(new THREE.BufferGeometry(), glassMaterial(T, { w: 0.3, h: 0.08, t: this.shelfT, kind: 'shelf' }));
    this.base.renderOrder = 1;
    this.shelf.add(this.base);
    // Reflections: each icon's colour lies in the glass in front of it,
    // fading toward you (a decal on the shelf top; the glass shader has no
    // planar mirror, and a mirrored tile would poke out under the thin shelf).
    this.reflections = this.icons.map((icon, i) => {
      const m = new THREE.MeshBasicMaterial({ color: o.apps[i].color ?? 0x8a8a90, map: fadeTexture(), transparent: true, opacity: S.reflection, depthWrite: false });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
      q.rotation.x = -Math.PI / 2;
      q.renderOrder = 1.5;  // on the shelf glass
      this.level.add(q);
      return q;
    });
    this.restX = this.icons.map((_, i) => (i - (this.icons.length - 1) / 2) * (this.side + this.gap));
    this.scales = this.icons.map(() => 1);
    this.layout();
  }

  // A point on the arc around the user: s along the arc, t toward the user.
  arc(s, t = 0) {
    const R = this.distance - t, a = s / this.distance;
    return [R * Math.sin(a), this.distance - R * Math.cos(a), -a];
  }

  layout() {
    const widths = this.scales.map(s => s * this.side);
    const total = widths.reduce((a, b) => a + b, 0) + this.gap * (widths.length - 1);
    let x = -total / 2;
    const top = -this.side / 2 - this.lift;
    this.icons.forEach((icon, i) => {
      const s = this.scales[i];
      const sx = x + widths[i] / 2;
      const [px, pz, yaw] = this.arc(sx);
      icon.scale.set(s, s, 1);
      // Grow upward from a shared float height, turned to face the user.
      const cy = (s - 1) * this.side / 2;
      icon.position.set(px, cy, pz);
      icon.rotation.y = yaw;
      const r = this.reflections[i], deep = this.side * s * 0.6;
      const [rx, rz] = this.arc(sx, this.side * 0.08 + deep / 2);
      r.position.set(rx, top + 0.0003, rz);
      r.rotation.z = yaw;  // flat on the shelf: its z spin is the arc's turn
      r.scale.set(this.side * s * 0.9, deep, 1);
      x += widths[i] + this.gap;
    });
    // The shelf stretches with the magnified row (rebuilt in 2 mm steps).
    const w = total + this.pad * 2, d = this.side * DEFAULTS.look.dockShelf.depth;
    if (this._baseW === undefined || Math.abs(this._baseW - w) > 0.002) {
      this._baseW = w;
      this.base.geometry.dispose();
      this.base.geometry = shelfGeometry(w, d, this.shelfT, this.distance);
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
    const inv = new THREE.Matrix4().copy(this.level.matrixWorld).invert();
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

// The shelf: a thin glass slab (w along the arc, d deep), laid flat and bent
// round an arc of radius R centred on the user.
function shelfGeometry(w, d, t, R) {
  const g = glassSlabGeometry(w, d, t, d / 2 * 0.98);
  g.rotateX(-Math.PI / 2);  // lie flat: slab y (depth) -> -z, thickness -> +y
  g.translate(0, -t, 0);    // top face at y = 0
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = p.getX(i), z = p.getZ(i), r = R - z, a = s / R;
    p.setXYZ(i, r * Math.sin(a), p.getY(i), R - r * Math.cos(a));
  }
  g.computeVertexNormals();
  return g;
}

// The reflection decal: a rounded tile shape, brightest at the tile's foot
// (canvas top = far edge, under the tile) and fading toward you.
let fade;
function fadeTexture() {
  if (fade) return fade;
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, n);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.filter = 'blur(3px)';
  x.beginPath(); x.roundRect(6, 4, n - 12, n * 1.4, n * 0.24); x.fill();
  fade = new THREE.CanvasTexture(c); fade.colorSpace = THREE.SRGBColorSpace;
  return fade;
}
