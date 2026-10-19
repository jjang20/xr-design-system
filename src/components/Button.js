// Contour Button: a thick object that compresses when poked.
//
// Tokens used:
//   material.t.{thin|regular|thick}        thickness
//   material.density.{soft|firm|rigid}.*   press ratio and recover time
//   proximity.hover.enter / exit           hover hysteresis (dmm)
//   proximity.poke.release                 release hysteresis
//   size.button.default                    default face size (dmm)
//   motion.hover.in.*                      hover fade
//   feedback.glow.edge                     hover edge glow width (dmm)
//   surface.opacity.base / outline.mr      opaque surface, luminous MR edge
//
// Appearance options (not behaviour): shape, variant, icon, label, sublabel,
// accessory, layout. See docs/components.md.
import * as THREE from 'three';
import { Interactable, markComponent } from '../core/Interactable.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { PressModel } from '../core/PressModel.js';
import { cubicBezier, clamp, lerp } from '../core/easing.js';
import { DEFAULTS } from '../core/defaults.js';
import { bodyGeometry, bodyMaterial, faceMaterial, makeText, makeIcon } from '../core/look.js';

const C = DEFAULTS.color;

export class Button extends Interactable {
  /**
   * @param {object} T  tokens from createTokens()
   * @param {object} o
   * @param {string} [o.label]
   * @param {string} [o.sublabel]   secondary text (row layout)
   * @param {string} [o.icon]       Lucide icon name (see src/core/icons.js)
   * @param {'chevron'|null} [o.accessory]
   * @param {'center'|'row'} [o.layout='center']
   * @param {'rounded'|'capsule'|'circle'} [o.shape='rounded']
   * @param {'secondary'|'primary'|'plain'|'window'|'tinted'} [o.variant='secondary']
   * @param {number} [o.color]      fill colour override (tinted variant)
   * @param {'soft'|'firm'|'rigid'} [o.density='firm']
   * @param {'thin'|'regular'|'thick'} [o.thickness='regular']
   * @param {number} [o.width]      face width in dmm (default size.button.default)
   * @param {number} [o.height]     face height in dmm (default size.button.default)
   * @param {number} [o.radius]     corner radius in dmm
   * @param {number} [o.distance]   placement distance in m, for dmm
   * @param {boolean} [o.disabled]
   */
  constructor(T, o = {}) {
    super();
    markComponent(this);
    this.T = T;
    const distance = this.distance = o.distance ?? DEFAULTS.distance;
    const dmm = v => (v / 1000) * distance;
    this.disabled = !!o.disabled;
    this.variant = o.variant ?? 'secondary';
    // Disabled elements are rigid: they barely give, which reads as "not now".
    this.density = this.disabled ? 'rigid' : (o.density ?? 'firm');
    this.t = T.get(`material.t.${o.thickness ?? 'regular'}`);
    const side = T.dmm('size.button.default', distance);
    this.w = o.width != null ? dmm(o.width) : side;
    this.h = o.height != null ? dmm(o.height) : side;
    if (o.shape === 'circle') this.w = this.h = Math.min(this.w, this.h);
    this.r = o.shape === 'circle' || o.shape === 'capsule' ? Math.min(this.w, this.h) / 2
      : dmm(o.radius ?? DEFAULTS.radius.control);
    this.frontZ = this.t;

    this.press = new PressModel({
      thickness: this.t,
      pressRatio: T.get(`material.density.${this.density}.press`),
      recover: T.get(`material.density.${this.density}.recover`),
      release: T.get('proximity.poke.release'),
    });
    this.hoverBand = new Hysteresis(
      T.dmm('proximity.hover.enter', distance),
      T.dmm('proximity.hover.exit', distance),
    );
    this.hoverIn = T.get('motion.hover.in.duration');
    this.hoverEase = cubicBezier(T.get('motion.hover.in.easing'));
    this.hoverT = 0;
    this.hovered = false;
    this.spot = new THREE.Vector2();

    // Body: the compressible solid.
    const fill = this.disabled ? C.disabled
      : o.color ?? { primary: C.accent, plain: C.row, window: C.window, tinted: C.control }[this.variant] ?? C.control;
    this.restOpacity = this.variant === 'plain' ? 0 : undefined;
    this.body = new THREE.Mesh(bodyGeometry(this.w, this.h, this.t, this.r), bodyMaterial(T, { color: fill, opacity: this.restOpacity }));
    this.body.castShadow = this.variant === 'window';
    this.add(this.body);
    this.hitMeshes.push(this.body);
    if (this.variant === 'plain') this.body.material.depthWrite = false;

    // Face: everything that sits on the front and moves with it when pressed.
    this.face = new THREE.Group();
    this.add(this.face);
    this.fx = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h),
      faceMaterial(T, { w: this.w, h: this.h, r: this.r, distance, rimStrength: this.variant === 'plain' ? 0 : undefined }));
    this.fx.position.z = 0.0002;
    this.fx.renderOrder = 2;
    this.face.add(this.fx);
    this.buildContent(o, dmm);
    this.layoutFront();
  }

  buildContent(o, dmm) {
    const dim = this.disabled ? 0.4 : 1;
    const z = 0.0004;
    if (o.layout === 'row') {
      // Icon, label (+ sublabel) left-aligned, accessory on the right.
      const pad = dmm(14);
      let x = -this.w / 2 + pad;
      if (o.icon) {
        const s = dmm(22);
        const icon = makeIcon(o.icon, s, { opacity: dim });
        icon.position.set(x + s / 2, 0, z);
        this.face.add(icon);
        x += s + dmm(12);
      }
      const hasSub = !!o.sublabel;
      const label = makeText(o.label ?? '', { size: dmm(17), weight: 500, anchorX: 'left', opacity: dim });
      label.position.set(x, hasSub ? dmm(8) : 0, z);
      this.face.add(label);
      if (hasSub) {
        const sub = makeText(o.sublabel, { size: dmm(13), weight: 400, anchorX: 'left', color: C.textSecondary, opacity: dim });
        sub.position.set(x, -dmm(10), z);
        this.face.add(sub);
      }
      if (o.accessory === 'chevron') {
        const s = dmm(18);
        const chev = makeIcon('chevron-right', s, { color: C.textTertiary, opacity: dim });
        chev.position.set(this.w / 2 - pad - s / 2 + dmm(4), 0, z);
        this.face.add(chev);
      }
      this.label = label;
      return;
    }
    // Centered: icon, label, or icon above label.
    const both = o.icon && o.label;
    const narrow = this.w < this.h * 1.6;
    if (o.icon) {
      const s = Math.min(this.h, this.w) * (both && narrow ? 0.36 : 0.42);
      const icon = makeIcon(o.icon, s, { opacity: dim });
      if (both && !narrow) icon.position.set(-this.w / 2 + this.h * 0.42 + s / 2, 0, z);
      else icon.position.set(0, both ? this.h * 0.1 : 0, z);
      icon.position.z = z;
      this.face.add(icon);
      this.icon = icon;
    }
    if (o.label) {
      const size = both && narrow ? this.h * 0.16 : Math.min(this.h * 0.3, dmm(17));
      const label = makeText(o.label, { size, weight: this.variant === 'primary' ? 600 : 500, opacity: dim });
      if (both && !narrow) { label.anchorX = 'left'; label.position.set(-this.w / 2 + this.h * 0.42 + this.h * 0.42 + dmm(8), 0, z); }
      else label.position.set(0, both ? -this.h * 0.26 : 0, z);
      label.sync();
      this.face.add(label);
      this.label = label;
    }
  }

  layoutFront() {
    const front = this.t - this.press.depth;
    this.body.scale.z = Math.max(0.001, front / this.t);
    this.face.position.z = front;
  }

  // Distance from a local point to the face rectangle at the front plane.
  faceDistance(p) {
    const dx = Math.max(0, Math.abs(p.x) - this.w / 2);
    const dy = Math.max(0, Math.abs(p.y) - this.h / 2);
    const dz = Math.max(0, p.z - this.t);
    return Math.hypot(dx, dy, dz);
  }

  inside(p) {
    return Math.abs(p.x) <= this.w / 2 && Math.abs(p.y) <= this.h / 2;
  }

  update(dt) {
    const probes = this.consumeProbes();
    // Pick the probe closest to the face; rays that hit count as distance 0.
    let best = null, bestD = Infinity;
    for (const p of probes) {
      const d = p.kind === 'ray' ? (this.inside(p.point) ? 0 : Infinity) : this.faceDistance(p.point);
      if (d < bestD) { best = p; bestD = d; }
    }

    // Hover with hysteresis (pokes) or direct hit (rays).
    this.hovered = best?.kind === 'ray' ? bestD === 0 : this.hoverBand.update(bestD);
    if (!best) this.hoverBand.update(Infinity);

    // Press: pokes press by depth; a ray press pushes all the way in.
    let penetration = null, inside = false;
    if (best && this.enabled) {
      inside = this.inside(best.point);
      if (best.kind === 'poke') penetration = this.t - best.point.z;
      // A ray has no depth: press goes all the way in, and letting go is a
      // clean release (no retreat distance to cover).
      else penetration = best.pressed ? this.press.maxDepth : -Infinity;
    }
    const ev = this.press.update(dt, penetration, inside);
    if (ev === 'press') this.dispatchEvent({ type: 'press' });
    if (ev === 'release') {
      this.dispatchEvent({ type: 'release' });
      if (!this.disabled) this.dispatchEvent({ type: 'select' });
    }
    if (ev === 'cancel') this.dispatchEvent({ type: 'cancel' });

    // Hover fade, eased by motion.hover.in (out mirrors in, see DEFAULTS).
    const target = this.hovered && !this.disabled ? 1 : 0;
    this.hoverT = clamp(this.hoverT + (target ? 1 : -1) * dt / this.hoverIn, 0, 1);
    const hover = this.hoverEase(this.hoverT);
    this.hover = hover;

    // The highlight spot drifts after the pointer instead of jumping.
    if (best) this.spot.lerp(new THREE.Vector2(best.point.x, best.point.y), 1 - Math.exp(-dt * 18));
    const u = this.fx.material.uniforms;
    u.uHover.value = hover;
    u.uPress.value = this.press.amount;
    u.uSpot.value.copy(this.spot);

    // Plain rows are invisible at rest and fill in on hover, like a list row.
    if (this.variant === 'plain') {
      const o = hover * DEFAULTS.look.plainHoverFill * (1 - 0.25 * this.press.amount);
      this.body.material.userData.baseOpacity = o;
      this.body.material.opacity = o;
    }
    this.layoutFront();
  }
}
