// Contour Z-Slider: a value set by pushing a knob away from you (and pulling
// it back), like the air vents in a Rolls-Royce, instead of sliding sideways.
//
// Local space: +z points at the user. The back plate's front face is z = 0.
// The knob's back face moves between z = 0 (fully pushed, value 1) and
// z = zslider.travel (fully pulled, value 0).
//
// Input:
//   poke   the fingertip pushes the knob (a finger can only push)
//   pinch  near the knob grabs it, so it can be pulled back too
//   ray    press on the knob and drag: moving the pointer away pushes
//
// Tokens used: zslider.travel, feedback.detent.*, feedback.shadow.press.*,
// size.button.default, material.t.*, proximity.hover.*, feedback.glow.edge,
// motion.hover.in.*, surface.*
import * as THREE from 'three';
import { Interactable, markComponent } from '../core/Interactable.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { cubicBezier, clamp } from '../core/easing.js';
import { DEFAULTS } from '../core/defaults.js';
import { bodyGeometry, bodyMaterial, faceMaterial, flatMaterial, makeText, makeIcon, softTexture } from '../core/look.js';
import { detentIndex, shadowAt } from '../core/detent.js';
import { playTick } from '../core/audio.js';

export { detentIndex, shadowAt };
const C = DEFAULTS.color;

export class ZSlider extends Interactable {
  constructor(T, o = {}) {
    super();
    markComponent(this);
    this.T = T;
    const distance = o.distance ?? DEFAULTS.distance;
    this.travel = T.get('zslider.travel');
    this.interval = T.get('feedback.detent.interval');
    this.tickGain = T.get('feedback.detent.audio.gain');
    this.tickLength = T.get('feedback.detent.audio.length');
    this.shadowScale = T.get('feedback.shadow.press.scale');
    this.shadowMin = T.get('feedback.shadow.press.opacity.min');
    this.shadowMax = T.get('feedback.shadow.press.opacity.max');
    this.hoverIn = T.get('motion.hover.in.duration');
    this.hoverEase = cubicBezier(T.get('motion.hover.in.easing'));
    this.hoverBand = new Hysteresis(T.dmm('proximity.hover.enter', distance), T.dmm('proximity.hover.exit', distance));
    this.hoverT = 0;

    const side = T.dmm('size.button.default', distance);
    const dmm = v => (v / 1000) * distance;
    const t = T.get('material.t.regular');
    const plateT = T.get('material.t.thick');
    this.side = side;
    this.t = t;

    // Plate: a round socket the knob is pushed into.
    const plateD = side * 1.55;
    const plate = new THREE.Mesh(bodyGeometry(plateD, plateD, plateT, plateD / 2), bodyMaterial(T, { color: C.window }));
    plate.position.z = -plateT;
    this.add(plate);
    const plateFx = new THREE.Mesh(new THREE.PlaneGeometry(plateD, plateD), faceMaterial(T, { w: plateD, h: plateD, r: plateD / 2, distance }));
    plateFx.position.z = 0.0002;
    this.add(plateFx);

    // Contact shadow on the plate, under the knob.
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(side * 1.15, side * 1.15), flatMaterial(C.shadow, this.shadowMin, { map: softTexture() }));
    this.shadow.position.z = 0.0004;
    this.add(this.shadow);

    // Stem: joins the knob to the plate, like the stem of an air vent. It
    // gets shorter as the knob is pushed in.
    const stemR = side * 0.07;
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(stemR, stemR, 1, 24), bodyMaterial(T, { color: C.metal, metal: true, opacity: 1 }));
    this.stem.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.stem.geometry.attributes.position.count * 3).fill(0.8), 3));
    this.stem.rotation.x = Math.PI / 2;
    this.add(this.stem);

    // Depth ruler under the knob: one dot per detent, so the push axis and
    // the steps are visible (a depth cue, since people judge depth poorly).
    const rulerY = -side / 2 - dmm(10);
    const marks = Math.round(1 / this.interval);
    const dotGeo = new THREE.CircleGeometry(dmm(1.6), 16);
    for (let i = 0; i <= marks; i++) {
      const major = i % 5 === 0;
      const m = new THREE.Mesh(dotGeo, flatMaterial(0xffffff, major ? 0.75 : 0.35));
      m.scale.setScalar(major ? 1.4 : 1);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, rulerY, this.travel * (1 - i * this.interval));
      this.add(m);
    }

    // Knob: a round metal puck with an icon.
    this.knob = new THREE.Group();
    const knobBody = new THREE.Mesh(bodyGeometry(side, side, t, side / 2), bodyMaterial(T, { color: C.metal, metal: true, opacity: 1 }));
    this.knob.add(knobBody);
    this.fx = new THREE.Mesh(new THREE.PlaneGeometry(side, side), faceMaterial(T, { w: side, h: side, r: side / 2, distance, rimStrength: 0.35 }));
    this.fx.position.z = t + 0.0002;
    this.fx.renderOrder = 2;
    this.knob.add(this.fx);
    if (o.icon) {
      const icon = makeIcon(o.icon, side * 0.42, { color: 0x2a2c31 });
      icon.position.z = t + 0.0004;
      this.knob.add(icon);
    }
    this.add(this.knob);
    this.hitMeshes.push(knobBody);

    // Value bubble beside the knob, not on it, so the hand doesn't cover it.
    const bw = dmm(120), bh = dmm(40);
    this.bubble = new THREE.Group();
    const bubbleBody = new THREE.Mesh(bodyGeometry(bw, bh, T.get('material.t.thin'), bh / 2), bodyMaterial(T, { color: C.window }));
    this.bubble.add(bubbleBody);
    const bubbleFx = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), faceMaterial(T, { w: bw, h: bh, r: bh / 2, distance }));
    bubbleFx.position.z = T.get('material.t.thin') + 0.0002;
    this.bubble.add(bubbleFx);
    const bz = T.get('material.t.thin') + 0.0004;
    if (o.label) {
      const name = makeText(o.label, { size: dmm(14), weight: 500, anchorX: 'left', color: C.textSecondary });
      name.position.set(-bw / 2 + dmm(16), 0, bz);
      this.bubble.add(name);
    }
    this.valueLabel = makeText('0%', { size: dmm(17), weight: 600, anchorX: 'right' });
    this.valueLabel.position.set(bw / 2 - dmm(16), 0, bz);
    this.bubble.add(this.valueLabel);
    this.bubble.position.x = side / 2 + dmm(14) + bw / 2;
    this.add(this.bubble);

    this.knobZ = this.travel; // back face of the knob
    this.grab = null; // { offset } while pinched or ray-dragged
    this.value = -1;
    this.setValue(o.value ?? 0, { silent: true });
  }

  get frontZ() { return this.knobZ + this.t; }

  setValue(v, { silent = false } = {}) {
    v = clamp(v, 0, 1);
    this.knobZ = this.travel * (1 - v);
    this.applyValue(silent);
  }

  applyValue(silent) {
    const v = 1 - this.knobZ / this.travel;
    const before = this.value;
    this.value = v;
    if (before >= 0 && detentIndex(v, this.interval) !== detentIndex(before, this.interval)) {
      if (!silent) playTick(this.tickGain, this.tickLength);
      this.dispatchEvent({ type: 'detent', index: detentIndex(v, this.interval) });
    }
    if (!silent && v !== before) this.dispatchEvent({ type: 'change', value: v });
  }

  // While a ray drags the knob, use the horizontal plane through the rail:
  // moving the pointer further away pushes, closer pulls.
  rayPoint(localRay, out) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return localRay.intersectPlane(plane, out);
  }

  insideKnob(p, margin = 0) {
    const h = this.side / 2 + margin;
    return Math.abs(p.x) <= h && Math.abs(p.y) <= h;
  }

  update(dt) {
    const probes = this.consumeProbes();
    let hoverD = Infinity;
    let z = this.knobZ;
    let engaged = false;

    for (const p of probes) {
      if (p.kind === 'poke') {
        const front = z + this.t;
        const d = Math.hypot(
          Math.max(0, Math.abs(p.point.x) - this.side / 2),
          Math.max(0, Math.abs(p.point.y) - this.side / 2),
          Math.max(0, p.point.z - front),
        );
        hoverD = Math.min(hoverD, d);
        if (p.pinch && (this.grab?.id === p.id || (!this.grab && this.hoverBand.on))) {
          this.grab ??= { id: p.id, offset: p.point.z - z };
          z = p.point.z - this.grab.offset;
          engaged = true;
        } else if (this.insideKnob(p.point) && p.point.z < front && p.point.z > z - this.t) {
          z = p.point.z - this.t; // the finger pushes the face
          engaged = true;
        }
      } else if (p.kind === 'ray') {
        if (p.captured) {
          this.grab ??= { id: p.id, offset: p.point.z - z };
          z = p.point.z - this.grab.offset;
          engaged = true;
          hoverD = 0;
        } else {
          hoverD = 0;
          // Desktop wheel: one notch moves half a detent. Positive = push away.
          if (p.wheel) z -= p.wheel * this.travel * this.interval * 0.5;
        }
      }
    }
    if (this.grab && !probes.some(p => p.id === this.grab.id && (p.pinch || p.captured))) this.grab = null;

    this.knobZ = clamp(z, 0, this.travel);
    this.knob.position.z = this.knobZ;
    this.stem.scale.y = Math.max(1e-4, this.knobZ);
    this.stem.position.z = this.knobZ / 2;
    this.applyValue(false);

    // Feedback: contact shadow, value label, hover glow.
    const push = this.value;
    const s = shadowAt(push, this.shadowScale, this.shadowMin, this.shadowMax);
    this.shadow.scale.setScalar(s.scale);
    this.shadow.material.opacity = this.shadow.material.userData.baseOpacity = s.opacity;
    const text = `${Math.round(push * 100)}%`;
    if (this.valueLabel.text !== text) { this.valueLabel.text = text; this.valueLabel.sync(); }
    this.bubble.position.z = this.knobZ + this.t / 2;

    const hovered = this.hoverBand.update(hoverD) || engaged;
    this.engaged = engaged;
    this.hoverT = clamp(this.hoverT + (hovered ? 1 : -1) * dt / this.hoverIn, 0, 1);
    this.fx.material.uniforms.uHover.value = this.hoverEase(this.hoverT) * (engaged ? 1 : 0.7);
  }
}
