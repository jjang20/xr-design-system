// Contour Button: a thick object that compresses when poked.
//
// Tokens used:
//   material.t.{thin|regular|thick}        thickness
//   material.density.{soft|firm|rigid}.*   press ratio and recover time
//   proximity.hover.enter / exit           hover hysteresis (dmm)
//   proximity.poke.release                 release hysteresis
//   size.button.default                    face size (dmm)
//   motion.hover.in.*                      hover glow fade
//   feedback.glow.edge                     glow width (dmm)
//   surface.opacity.base / outline.mr      opaque surface, MR outline
import * as THREE from 'three';
import { Interactable, markComponent } from '../core/Interactable.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { PressModel } from '../core/PressModel.js';
import { cubicBezier, clamp } from '../core/easing.js';
import { DEFAULTS } from '../core/defaults.js';
import { slabGeometry, frameGeometry, surfaceMaterial, flatMaterial, Label } from '../core/surface.js';

export class Button extends Interactable {
  /**
   * @param {object} T  tokens from createTokens()
   * @param {object} o
   * @param {string} [o.label]
   * @param {'soft'|'firm'|'rigid'} [o.density='firm']
   * @param {'thin'|'regular'|'thick'} [o.thickness='regular']
   * @param {number} [o.width]  face width in dmm (default size.button.default)
   * @param {number} [o.height] face height in dmm (default size.button.default)
   * @param {number} [o.distance] placement distance in m, for dmm
   * @param {boolean} [o.disabled]
   * @param {number} [o.color]
   */
  constructor(T, o = {}) {
    super();
    markComponent(this);
    this.T = T;
    const distance = o.distance ?? DEFAULTS.distance;
    const dmm = v => (v / 1000) * distance;
    this.disabled = !!o.disabled;
    // Disabled elements are rigid: they barely give, which reads as "not now".
    this.density = this.disabled ? 'rigid' : (o.density ?? 'firm');
    this.t = T.get(`material.t.${o.thickness ?? 'regular'}`);
    const side = T.dmm('size.button.default', distance);
    this.w = o.width != null ? dmm(o.width) : side;
    this.h = o.height != null ? dmm(o.height) : side;
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
    this.hoverT = 0; // 0..1 progress of the glow fade
    this.hovered = false;

    // Body: the compressible slab.
    const color = this.disabled ? DEFAULTS.color.disabled : (o.color ?? DEFAULTS.color.surfaceRaised);
    this.body = new THREE.Mesh(slabGeometry(this.w, this.h, this.t), surfaceMaterial(T, color));
    this.add(this.body);
    this.hitMeshes.push(this.body);

    // MR outline: a thin high-contrast ring at the back edge, always on.
    const outlineW = T.dmm('surface.outline.mr', distance);
    this.outline = new THREE.Mesh(frameGeometry(this.w, this.h, outlineW), flatMaterial(DEFAULTS.color.outline, 0.85));
    this.outline.position.z = 0.0002;
    this.add(this.outline);

    // Hover glow: a ring on the front face, faded in by motion.hover.in.
    const glowW = T.dmm('feedback.glow.edge', distance);
    this.glow = new THREE.Mesh(frameGeometry(this.w, this.h, glowW), flatMaterial(DEFAULTS.color.accent, 0, { blending: THREE.AdditiveBlending }));
    this.add(this.glow);

    if (o.label) {
      this.label = new Label(o.label, {
        height: Math.min(this.h * 0.32, dmm(18)),
        maxWidth: this.w * 0.9,
        color: this.disabled ? DEFAULTS.color.textMuted : DEFAULTS.color.text,
      });
      this.add(this.label);
    }
    this.layoutFront();
  }

  layoutFront() {
    const front = this.t - this.press.depth;
    this.body.scale.z = Math.max(0.001, front / this.t);
    this.glow.position.z = front + 0.0003;
    if (this.label) this.label.position.z = front + 0.0004;
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

    // Glow fade, eased by motion.hover.in (out mirrors in, see DEFAULTS).
    const target = this.hovered && !this.disabled ? 1 : 0;
    this.hoverT = clamp(this.hoverT + (target ? 1 : -1) * dt / this.hoverIn, 0, 1);
    const glow = this.hoverEase(this.hoverT) * (0.6 + 0.4 * this.press.amount);
    this.glow.material.userData.baseOpacity = glow;
    this.glow.material.opacity = glow;

    this.layoutFront();
  }
}
