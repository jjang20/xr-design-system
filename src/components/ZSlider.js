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
// slider --option stem): an amber glass bead on a glass stem in a round glass
// plate. The stem flows into the plate and into the knob through curved
// joints (fillets), like blown glass (Jihoon: "the joints should be curved").
// The amber glass glows like a lamp, brighter as the value rises, and five
// etched detent rings on the plate light up amber, with a glow, up to it.
//
// Tokens used: zslider.travel, feedback.detent.*, feedback.shadow.press.*,
// size.button.default, material.t.*, proximity.hover.*, feedback.glow.edge,
// motion.hover.in.*, surface.*
import * as THREE from 'three';
import { Interactable, markComponent } from '../core/Interactable.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { cubicBezier, clamp } from '../core/easing.js';
import { DEFAULTS } from '../core/defaults.js';
import { flatMaterial, makeText, makeIcon, softTexture, glassSlabGeometry, glassBeadGeometry } from '../core/look.js';
import { refractiveGlass, refractiveMesh } from '../core/refract.js';
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
    // Thin glass (the lookdev's plate is regular, 8 mm; judge round 2 read
    // that rim as an inflated tyre), so the rim reads as a crisp edge.
    const plateT = T.get('material.t.thin');
    this.side = side;
    this.t = t;

    // Plate: a round disc of clear glass the stem rises out of. All the
    // slider's glass refracts what is behind it (core/refract.js): the stem
    // bends inside the knob as in the lookdev render. Drawn back to front.
    const plateD = side * 1.55;
    const plate = this.plate = refractiveMesh(glassSlabGeometry(plateD, plateD, plateT, plateD / 2 * 0.98), refractiveGlass('plate', { thick: plateT, flatBack: true }));
    plate.position.z = -plateT;
    plate.renderOrder = 1;
    this.add(plate);
    const G = DEFAULTS.look.lampGlow;
    this.lampColor = new THREE.Color(C.lampLit);

    // Contact shadow on the plate, under the knob.
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(side * 1.15, side * 1.15), flatMaterial(C.shadow, this.shadowMin, { map: softTexture() }));
    this.shadow.position.z = 0.0004;
    this.add(this.shadow);

    // Detents: five etched rings on the plate (a 1/10 step is too fine to
    // read at a glance); rings up to the value glow lamp amber.
    this.rings = [];
    const n = 5, ringW = dmm(0.9);
    const radii = Array.from({ length: n }, (_, i) => side * (0.34 + 0.07 * i));
    // Their glow: light spilling into the plate round each lit ring.
    this.ringGlow = new THREE.Mesh(new THREE.PlaneGeometry(plateD, plateD), ringGlowMaterial(radii, dmm(G.ringWidth), this.lampColor));
    this.ringGlow.position.z = 0.0002;
    this.ringGlow.renderOrder = 1.9;
    this.ringGlow.userData.glow = true;
    this.add(this.ringGlow);
    // The lamp's light on the plate: a warm pool round the stem's foot that
    // grows with the value, so the plate is lit by the knob rather than
    // lit flat (judge round 4).
    this.spill = new THREE.Mesh(new THREE.PlaneGeometry(side * G.spill.size, side * G.spill.size), new THREE.MeshBasicMaterial({
      map: softTexture(), color: this.lampColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.spill.position.z = 0.00025;
    this.spill.renderOrder = 1.95;
    this.spill.userData.glow = true;
    this.add(this.spill);
    for (let i = 0; i < n; i++) {
      const r = radii[i];
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - ringW / 2, r + ringW / 2, 96), flatMaterial(0xffffff, G.ringUnlit));
      ring.position.z = 0.0003;
      ring.renderOrder = 2;
      this.add(ring);
      this.rings.push(ring);
    }

    // Stem: amber glass; shorter as the knob goes in. At each end it flares
    // into a fillet (a concave curve, tangent to the plate and to the knob's
    // back), so plate, stem and knob read as one piece of blown glass. Stem
    // and fillets are one surface (judge round 2: separate pieces showed an
    // inner rod and its end through the glass).
    const stemR = side * 0.1;
    const F = G.fillet;
    this.stemShape = new StemGeometry(stemR, ...[F.plate, F.knob].map(f => ({ a: stemR * f.flare, b: side * f.length, p: f.shape })));
    this.stem = refractiveMesh(this.stemShape, refractiveGlass('rod', { thick: stemR * 2 }));
    this.stem.renderOrder = 2.5;  // over the rings
    this.add(this.stem);

    // Knob: a low bead of amber glass with the icon on its crown.
    this.knob = new THREE.Group();
    const knobH = side * 0.22;
    const knobBody = refractiveMesh(glassBeadGeometry(side, knobH), refractiveGlass('amber', { thick: knobH, flatBack: true }));
    knobBody.renderOrder = 3;
    this.knob.add(knobBody);
    this.knobSkin = knobBody.material;
    if (o.icon) {
      const icon = makeIcon(o.icon, side * 0.42);
      icon.position.z = knobH + 0.0004;
      icon.renderOrder = 4;
      this.knob.add(icon);
    }
    this.add(this.knob);
    this.hitMeshes.push(knobBody);
    // The lamp's halo: light round the knob's rim, in the knob's own plane,
    // so it hugs the knob from any angle (judge round 2: a camera-facing
    // ring left a dark gap beside the knob seen at an angle). Clear inside
    // the rim, so it never floods the glass; drawn just before the knob,
    // which bends its inner edge.
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(side * G.halo.size, side * G.halo.size), new THREE.MeshBasicMaterial({
      map: haloTexture(1 / G.halo.size), color: this.lampColor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.halo.position.z = 0.0003;
    this.halo.renderOrder = 2.8;
    this.halo.userData.glow = true;
    this.knob.add(this.halo);
    // The stem glows like a filament; the knob at its rim.
    this.glass = [[this.stem, G.emissive.stem], [knobBody, G.emissive.knob]].map(([m, k]) => [m.material, k]);
    this.knobH = knobH;
    // The knob's thickness for input: its back face to its crown.
    this.t = knobH;

    // Value label beside the plate, in the plate's plane (as in the lookdev
    // render), clear of the hand on the knob. It sits on a capsule of the
    // plate's own glass, smoked neutral grey (refract.label), as text in
    // Contour always sits on glass: legible over a bright room, and one
    // material with the plate (Jihoon, 2026-10-21: dark smoked glass, neutral
    // grey, as small as the text allows; judges in rounds 4 to 7 read the
    // room-coloured capsule as a taupe tag). The value leads: larger and
    // bolder than the name, and right-aligned so the digits stay put as the
    // value changes.
    const L = DEFAULTS.look.valueLabel;
    const lh = dmm(L.height), pad = dmm(L.pad);
    this.bubble = new THREE.Group();
    // Half the plate's thickness: a thin pane, not a pill (judge round 4
    // read its side wall as a plastic capsule).
    const labelT = plateT * L.thickness;
    const labelMaterial = refractiveGlass('label', { thick: labelT, flatBack: true });
    const bz = 0.0004;
    const name = o.label ? makeText(o.label, { size: dmm(L.name.size), weight: L.name.weight, anchorX: 'left' }) : null;
    this.valueLabel = makeText('0%', { size: dmm(L.value.size), weight: L.value.weight, anchorX: 'right' });
    // Room for any two-digit value, measured once (hidden), so the capsule
    // holds still while the value moves; only 100% widens it. Reserving room
    // for "100%" left a wide hole after "Lamp" at every other value.
    const widest = makeText('00%', { size: dmm(L.value.size), weight: L.value.weight, anchorX: 'right' });
    widest.visible = false;
    // The capsule fits its text: padding, the name, a word space, room for
    // the value, padding. A fixed width ran the name into the value when it
    // shrank ("Lamp40%"). Text lays out off the main thread, so the capsule
    // is rebuilt once the words are measured.
    const span = t => { const b = t.textRenderInfo?.blockBounds; return b ? b[2] - b[0] : 0; };
    const fit = () => {
      const words = (name ? span(name) + dmm(L.space) : 0) + Math.max(span(widest), span(this.valueLabel));
      const lw = 2 * pad + Math.max(words, lh);
      if (this.labelGlass && Math.abs(this.labelGlass.userData.width - lw) < 1e-6) return;
      if (this.labelGlass) { this.bubble.remove(this.labelGlass); this.labelGlass.geometry.dispose(); }
      this.labelGlass = refractiveMesh(glassSlabGeometry(lw, lh, labelT, lh / 2), labelMaterial);
      this.labelGlass.userData.width = lw;
      this.labelGlass.position.set(lw / 2, 0, -labelT);
      this.labelGlass.renderOrder = 1;
      this.bubble.add(this.labelGlass);
      this.valueLabel.position.set(lw - pad, 0, bz);
    };
    fit();
    if (name) {
      // Full white like the value (hierarchy comes from size and weight): at
      // secondary emphasis it fell to 4.1:1 on the smoked glass.
      name.position.set(pad, 0, bz);
      this.bubble.add(name);
      name.addEventListener('synccomplete', fit);
    }
    widest.addEventListener('synccomplete', fit);
    this.valueLabel.addEventListener('synccomplete', fit);
    this.bubble.add(this.valueLabel, widest);
    this.bubble.position.x = plateD / 2 + dmm(L.gap);
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
    this.stemShape.fit(this.knobZ);
    this.applyValue(false);

    // Feedback: contact shadow, value label, hover glow.
    const push = this.value;
    const s = shadowAt(push, this.shadowScale, this.shadowMin, this.shadowMax);
    this.shadow.scale.setScalar(s.scale);
    this.shadow.material.opacity = this.shadow.material.userData.baseOpacity = s.opacity;
    const text = `${Math.round(push * 100)}%`;
    if (this.valueLabel.text !== text) { this.valueLabel.text = text; this.valueLabel.sync(); }

    const hovered = this.hoverBand.update(hoverD) || engaged;
    this.engaged = engaged;
    this.hoverT = clamp(this.hoverT + (hovered ? 1 : -1) * dt / this.hoverIn, 0, 1);
    const K = DEFAULTS.look.knobHover;
    const h = this.hoverEase(this.hoverT) * (engaged ? 1 : K.idle);
    this.knobSkin.uniforms.uHover.value = h * K.glow;
    this.knob.scale.setScalar(1 + K.swell * h);  // swells a little toward you, like a bubble
    const lit = Math.round(push * this.rings.length);
    const G = DEFAULTS.look.lampGlow;
    this.rings.forEach((r, i) => {
      const on = i < lit;
      r.material.color.set(on ? C.lampLit : 0xffffff);
      r.material.opacity = r.material.userData.baseOpacity = on ? G.ringLit : G.ringUnlit;
      this.ringGlow.material.uniforms.uOn.value[i] = on ? 1 : 0;
    });
    // The lamp glows with its value: a floor so it reads as lit glass at
    // any value, rising to full at 100%.
    const glow = G.min + (1 - G.min) * push;
    for (const [m, k] of this.glass) m.uniforms.uEmissive.value.copy(this.lampColor).multiplyScalar(k * glow);
    this.halo.material.opacity = G.halo.opacity * glow;
    this.spill.material.opacity = G.spill.opacity * glow;
    this.ringGlow.material.uniforms.uStrength.value = G.ring * glow;
  }
}

// The stem with a fillet at each end, as one lathe round +z from the plate
// (z = 0) to the knob (z = length). Each fillet ({a, b, p}) flares the
// radius r to r + a over b, tangent to the stem and to the face it meets: a
// superellipse quarter, p = 2 an ellipse, lower p swelling sooner (a bell).
// On a stem shorter than both b together, both flatten in step.
// fit() moves the rings for a new length in place, so pushing the knob
// never rebuilds the mesh.
class StemGeometry extends THREE.BufferGeometry {
  constructor(r, plate, knob, steps = 20, around = 48) {
    super();
    Object.assign(this, { r, plate, knob, steps, around });
    const rings = 2 * (steps + 1), n = rings * (around + 1);
    this.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const index = [];
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < around; j++) {
        const p = i * (around + 1) + j, q = p + around + 1;
        index.push(p, p + 1, q, p + 1, q + 1, q);
      }
    }
    this.setIndex(index);
    this.fit(2 * (plate.b + knob.b));
  }

  fit(length) {
    const { r, steps, around } = this;
    const squeeze = Math.min(1, length / (this.plate.b + this.knob.b));
    const pos = this.attributes.position.array, nor = this.attributes.normal.array;
    let o = 0;
    // Ring k of 2 (steps + 1): the plate's fillet going up, then the knob's.
    for (let k = 0; k < 2 * (steps + 1); k++) {
      const top = k > steps, i = top ? 2 * steps + 1 - k : k;
      const { a, p } = top ? this.knob : this.plate;
      const b = Math.max(1e-5, (top ? this.knob : this.plate).b * squeeze);
      const u = i / steps, z = b * (1 - Math.cos(u * Math.PI / 2));   // denser near the face, where it curves most
      const t = 1 - z / b, root = Math.max(1e-6, 1 - t ** p);
      const rr = r + a * (1 - root ** (1 / p));
      const slope = -a / b * t ** (p - 1) * root ** (1 / p - 1);   // d radius / d z, toward the stem
      const zz = top ? length - z : z, nz = top ? slope : -slope;
      const len = Math.hypot(1, nz);
      for (let j = 0; j <= around; j++, o += 3) {
        const th = (j / around) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        pos[o] = rr * c; pos[o + 1] = rr * s; pos[o + 2] = zz;
        nor[o] = c / len; nor[o + 1] = s / len; nor[o + 2] = nz / len;
      }
    }
    this.attributes.position.needsUpdate = this.attributes.normal.needsUpdate = true;
    this.computeBoundingSphere();
  }
}

// A halo that rings the knob: clear inside its rim (at `rim` of the
// texture's radius), brightest at the rim and falling off outward like
// bloom, so light glows round the glass without flattening what is seen
// through it.
function haloTexture(rim) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  const at = (f, a) => grad.addColorStop(Math.min(1, rim + f * (1 - rim)), `rgba(255,255,255,${a})`);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(rim * 0.9, 'rgba(255,255,255,0)');
  at(0, 1);
  at(0.08, 0.6);
  at(0.25, 0.25);
  at(0.55, 0.07);
  at(1, 0);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// The detent rings' glow: a soft band of light round each lit ring.
function ringGlowMaterial(radii, width, color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: {
      uR: { value: radii }, uOn: { value: radii.map(() => 0) }, uW: { value: width },
      uColor: { value: color.clone() }, uStrength: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP;
      uniform float uR[${radii.length}], uOn[${radii.length}], uW, uStrength;
      uniform vec3 uColor;
      void main() {
        float r = length(vP), a = 0.0;
        for (int i = 0; i < ${radii.length}; i++) a += uOn[i] * exp(-pow((r - uR[i]) / uW, 2.0));
        gl_FragColor = vec4(uColor * a * uStrength, 1.0);
      }`,
  });
}
