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
// Look (Jihoon picked direction A, 2026-10-20; lookdev/dock_slider.py --part
// slider --option stem): an amber glass bead on a glass stem that rises
// from a flared foot in a round glass plate. Five etched detent rings on the
// plate light up lamp amber up to the value.
//
// Tokens used: zslider.travel, feedback.detent.*, feedback.shadow.press.*,
// size.button.default, material.t.*, proximity.hover.*, feedback.glow.edge,
// motion.hover.in.*, surface.*
import * as THREE from 'three';
import { Interactable, markComponent } from '../core/Interactable.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { cubicBezier, clamp } from '../core/easing.js';
import { DEFAULTS } from '../core/defaults.js';
import { bodyGeometry, bodyMaterial, faceMaterial, flatMaterial, makeText, makeIcon, softTexture, glassMaterial, glassSlabGeometry, glassBeadGeometry, setTint } from '../core/look.js';
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

    // Plate: a round disc of window glass the stem rises out of.
    const plateD = side * 1.55;
    const plate = new THREE.Mesh(glassSlabGeometry(plateD, plateD, plateT, plateD / 2 * 0.98), glassMaterial(T, { w: plateD, h: plateD, t: plateT }));
    plate.position.z = -plateT;
    plate.renderOrder = 1;
    this.add(plate);
    const amber = m => { setTint(m, { hw: 1, hh: 1, r: 0, albedo: DEFAULTS.color.lampGlass, amount: 1 }); return m; };

    // Contact shadow on the plate, under the knob.
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(side * 1.15, side * 1.15), flatMaterial(C.shadow, this.shadowMin, { map: softTexture() }));
    this.shadow.position.z = 0.0004;
    this.add(this.shadow);

    // Detents: five etched rings on the plate (a 1/10 step is too fine to
    // read at a glance); rings up to the value glow lamp amber.
    this.rings = [];
    const n = 5, ringW = dmm(0.9);
    for (let i = 0; i < n; i++) {
      const r = side * (0.34 + 0.07 * i);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - ringW / 2, r + ringW / 2, 96), flatMaterial(0xffffff, 0.22));
      ring.position.z = 0.0003;
      ring.renderOrder = 2;
      this.add(ring);
      this.rings.push(ring);
    }

    // Stem: amber glass, rising from a flared foot; shorter as the knob goes in.
    const stemR = side * 0.1;
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(stemR, stemR, 1, 48), amber(glassMaterial(T, { w: stemR * 2, h: stemR * 2, t: stemR * 2, kind: 'bead' })));
    this.stem.rotation.x = Math.PI / 2;
    this.stem.renderOrder = 2;
    this.add(this.stem);
    const foot = new THREE.Mesh(glassBeadGeometry(side * 0.5, side * 0.07), amber(glassMaterial(T, { w: side * 0.5, h: side * 0.5, t: side * 0.07, kind: 'bead' })));
    foot.renderOrder = 2;
    this.add(foot);

    // Knob: a low bead of amber glass with the icon on its crown.
    this.knob = new THREE.Group();
    const knobH = side * 0.22;
    const knobBody = new THREE.Mesh(glassBeadGeometry(side, knobH), amber(glassMaterial(T, { w: side, h: side, t: knobH, kind: 'bead' })));
    knobBody.renderOrder = 3;
    this.knob.add(knobBody);
    this.knobSkin = knobBody.material;
    this.knobSkin.uniforms.uSpotRadius.value = side * 0.6;
    if (o.icon) {
      const icon = makeIcon(o.icon, side * 0.42);
      icon.position.z = knobH + 0.0004;
      icon.renderOrder = 4;
      this.knob.add(icon);
    }
    this.add(this.knob);
    this.hitMeshes.push(knobBody);
    // The knob's thickness for input: its back face to its crown.
    this.t = knobH;

    // Value bubble beside the knob, not on it, so the hand doesn't cover it.
    const bw = dmm(120), bh = dmm(40);
    this.bubble = new THREE.Group();
    const bubbleBody = new THREE.Mesh(glassSlabGeometry(bw, bh, T.get('material.t.thin'), bh / 2 * 0.98), glassMaterial(T, { w: bw, h: bh, t: T.get('material.t.thin'), kind: 'lens' }));
    // Lens glass: darker than the window, so the value stays legible where
    // the knob sits in front of a bright window.
    bubbleBody.material.uniforms.uFade.value = 1;
    // It carries the value, so it may darken further than surface.scrim.max
    // over a bright window (proposed token: surface.scrim.label).
    bubbleBody.material.uniforms.uScrimMax.value = 0.7;
    bubbleBody.renderOrder = 1;
    this.bubble.add(bubbleBody);
    const bz = T.get('material.t.thin') + 0.0004;
    if (o.label) {
      const name = makeText(o.label, { size: dmm(14), weight: 500, anchorX: 'left', opacity: DEFAULTS.emphasis.secondary });
      name.position.set(-bw / 2 + dmm(16), 0, bz);
      this.bubble.add(name);
    }
    this.valueLabel = makeText('0%', { size: dmm(17), weight: 600, anchorX: 'right' });
    this.valueLabel.position.set(bw / 2 - dmm(16), 0, bz);
    this.bubble.add(this.valueLabel);
    this.bubble.position.x = plateD / 2 + dmm(10) + bw / 2;  // beside the plate, clear of the rings
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
    const h = this.hoverEase(this.hoverT) * (engaged ? 1 : 0.7);
    this.knobSkin.uniforms.uHover.value = h * 6;
    this.knob.scale.setScalar(1 + 0.06 * h);  // swells a little toward you, like a bubble
    const lit = Math.round(push * this.rings.length);
    this.rings.forEach((r, i) => {
      const on = i < lit;
      r.material.color.set(on ? C.lampLit : 0xffffff);
      r.material.opacity = r.material.userData.baseOpacity = on ? 0.95 : 0.22;
    });
  }
}
