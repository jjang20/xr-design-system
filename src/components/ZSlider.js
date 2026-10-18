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
import { cubicBezier, clamp, lerp } from '../core/easing.js';
import { DEFAULTS } from '../core/defaults.js';
import { slabGeometry, frameGeometry, surfaceMaterial, flatMaterial, Label } from '../core/surface.js';
import { playTick } from '../core/audio.js';

// Index of the detent band a value sits in. Crossing into a new band ticks.
export const detentIndex = (value, interval) => Math.floor(value / interval + 1e-9);

// Contact shadow grows with push depth (feedback.shadow.press.curve = proportional-to-push).
export const shadowAt = (push, scale, opMin, opMax) => ({
  scale: 1 + push * scale,
  opacity: lerp(opMin, opMax, push),
});

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

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
    const t = T.get('material.t.regular');
    const plateT = T.get('material.t.thick');
    this.side = side;
    this.t = t;

    // Back plate: the "wall" the knob is pushed into.
    const plateSide = side * 1.5;
    const plate = new THREE.Mesh(slabGeometry(plateSide, plateSide, plateT), surfaceMaterial(T, DEFAULTS.color.plate));
    plate.position.z = -plateT;
    this.add(plate);
    const outlineW = T.dmm('surface.outline.mr', distance);
    const plateOutline = new THREE.Mesh(frameGeometry(plateSide, plateSide, outlineW), flatMaterial(DEFAULTS.color.outline, 0.85));
    plateOutline.position.z = -plateT + 0.0002;
    this.add(plateOutline);

    // Contact shadow on the plate, under the knob.
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(side * 1.1, side * 1.1), flatMaterial(DEFAULTS.color.shadow, this.shadowMin, { map: shadowTexture() }));
    this.shadow.position.z = 0.0005;
    this.add(this.shadow);

    // Stem: joins the knob to the plate, like the stem of an air vent. It
    // gets shorter as the knob is pushed in.
    const railR = side * 0.06;
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(railR, railR, 1, 16), surfaceMaterial(T, DEFAULTS.color.disabled));
    this.stem.rotation.x = Math.PI / 2;
    this.add(this.stem);

    // Depth ruler under the knob: one tick per detent, so the push axis and
    // the steps are visible (a depth cue, since people judge depth poorly).
    const rulerY = -side / 2 - side * 0.14;
    const ruler = new THREE.Mesh(new THREE.BoxGeometry(railR * 0.5, railR * 0.5, this.travel), flatMaterial(DEFAULTS.color.outline, 0.35));
    ruler.position.set(0, rulerY, this.travel / 2);
    this.add(ruler);
    const marks = Math.round(1 / this.interval);
    for (let i = 0; i <= marks; i++) {
      const major = i % 5 === 0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(side * (major ? 0.3 : 0.18), railR * 0.5, railR * 0.5), flatMaterial(DEFAULTS.color.outline, major ? 0.8 : 0.45));
      m.position.set(0, rulerY, this.travel * (1 - i * this.interval));
      this.add(m);
    }

    // Knob.
    this.knob = new THREE.Group();
    const knobBody = new THREE.Mesh(slabGeometry(side, side, t), surfaceMaterial(T, DEFAULTS.color.surfaceRaised));
    this.knob.add(knobBody);
    const knobOutline = new THREE.Mesh(frameGeometry(side, side, outlineW), flatMaterial(DEFAULTS.color.outline, 0.85));
    knobOutline.position.z = 0.0002;
    this.knob.add(knobOutline);
    this.glow = new THREE.Mesh(frameGeometry(side, side, T.dmm('feedback.glow.edge', distance)), flatMaterial(DEFAULTS.color.accent, 0, { blending: THREE.AdditiveBlending }));
    this.glow.position.z = t + 0.0003;
    this.knob.add(this.glow);
    this.add(this.knob);
    this.hitMeshes.push(knobBody);

    // Value label beside the knob, not on it, so the hand doesn't cover it.
    this.valueLabel = new Label('0%', { height: side * 0.32, align: 'left' });
    this.valueLabel.position.set(0, 0, t / 2);
    this.knob.add(this.valueLabel);
    if (o.label) {
      const title = new Label(o.label, { height: side * 0.26, color: DEFAULTS.color.textMuted });
      title.position.set(0, plateSide / 2 + side * 0.25, -plateT);
      this.add(title);
    }

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
    this.valueLabel.setText(`${Math.round(push * 100)}%`);
    this.valueLabel.position.x = this.side / 2 + this.side * 0.12 + this.valueLabel.width / 2;

    const hovered = this.hoverBand.update(hoverD) || engaged;
    this.engaged = engaged;
    this.hoverT = clamp(this.hoverT + (hovered ? 1 : -1) * dt / this.hoverIn, 0, 1);
    const g = this.hoverEase(this.hoverT) * (engaged ? 1 : 0.6);
    this.glow.material.opacity = this.glow.material.userData.baseOpacity = g;
  }
}
