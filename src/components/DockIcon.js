// One app in the Dock: a real object standing on the shelf, and the bubble
// that forms round it when a finger comes near (Jihoon, 2026-10-21).
//
//   rest    the object stands on the glass; no bubble
//   hover   a clear bubble grows round it, resting on the shelf, and the
//           object rises to its middle, as if the bubble had picked it up.
//           The bubble forms with a small settle, like a soap film (the list
//           bubble's emboss spring); it goes without one.
//   press   the bubble gives way where the finger pushes: the list bubble's
//           dent, with its glow, and the object inside dips a touch
//   release the dent springs back past flat once; 'select' fires
//
// Its origin is the point where the bubble touches the shelf, so the Dock's
// magnify scale grows it upward from the glass.
//
// Tokens used:
//   size.interactive.default                     the object's size (dmm)
//   input.hover.distance.enter / exit            hover, measured to the bubble's skin
//   input.poke.distance.release                  release hysteresis
//   motion.recovery.soft.duration           the skin's recovery
//   material.thickness.thin                         the name capsule's glass
import * as THREE from 'three';
import { Interactable, pickProbe } from '../core/Interactable.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { PressModel } from '../core/PressModel.js';
import { DEFAULTS } from '../core/defaults.js';
import { springTo, prefersReducedMotion } from '../core/spring.js';
import { makeAppObject } from '../core/objects.js';
import { makeBubble } from '../core/bubble.js';
import { contactFeedback, writeBubbleContacts } from '../core/contactFeedback.js';
import { makeText, glassSlabGeometry } from '../core/look.js';
import { refractiveGlass, refractiveMesh } from '../core/refract.js';

const inputScale = new THREE.Vector3();

export class DockIcon extends Interactable {
  /**
   * @param {object} T tokens
   * @param {{label: string, icon: string, color?: number}} app
   * @param {number} distance placement distance in m, for dmm
   */
  constructor(T, app, distance) {
    super();
    this.T = T;
    this.app = app;
    const B = DEFAULTS.look.dockBubble, E = DEFAULTS.look.emboss;
    const dmm = v => (v / 1000) * T.effectiveDistance(distance);
    this.k = T.effectiveDistance(distance) / T.effectiveDistance(DEFAULTS.distance);   // emboss sizes (mm at 0.6 m) grow with distance
    const side = this.side = T.viewSize('size.interactive.default', distance);
    // The object, standing on the glass.
    this.object = makeAppObject(app.icon, { color: app.color, style: app.style });
    this.object.scale.setScalar(side);
    this.holder = new THREE.Group();
    this.holder.add(this.object);
    this.add(this.holder);
    this.objectHeight = this.object.userData.size.y * side;
    this.footprint = this.object.userData.size.clone().multiplyScalar(side);
    // The bubble: big enough to hold the object, resting on the shelf.
    this.rb = B.size * side / 2;
    this.centre = new THREE.Vector3(0, this.rb, 0);
    this.bubble = makeBubble();
    this.bubble.position.copy(this.centre);
    this.bubble.visible = false;
    this.add(this.bubble);
    this.skin = this.bubble.uniforms;
    // Hit area: the bubble's volume, there even before it shows.
    this.hit = new THREE.Mesh(new THREE.SphereGeometry(this.rb, 24, 16), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.copy(this.centre);
    this.add(this.hit);
    this.hitMeshes.push(this.hit);
    // Name, above the bubble on hover, on a capsule of smoked glass: the
    // Z-Slider label's (Jihoon, 2026-10-21: dark smoked, neutral grey), as
    // text in Contour sits on glass, so it reads over a bright room.
    const L = DEFAULTS.look.valueLabel;
    const lh = dmm(L.height), pad = dmm(L.pad), lt = T.get('material.thickness.thin') * L.thickness;
    this.nameTag = new THREE.Group();
    this.nameTag.position.set(0, 2 * this.rb + dmm(B.nameGap) + lh / 2, 0);
    this.nameTag.visible = false;
    this.add(this.nameTag);
    this.nameText = makeText(app.label, { size: dmm(L.name.size), weight: L.name.weight, opacity: 0 });
    this.nameText.position.z = 0.0004;
    this.nameTag.add(this.nameText);
    this.nameGlass = refractiveGlass('label', { thick: lt, flatBack: true });
    const fit = () => {
      const b = this.nameText.textRenderInfo?.blockBounds;
      const w = 2 * pad + Math.max(b ? b[2] - b[0] : 0, lh);
      if (this.nameCapsule && Math.abs(this.nameCapsule.userData.width - w) < 1e-6) return;
      if (this.nameCapsule) { this.nameTag.remove(this.nameCapsule); this.nameCapsule.geometry.dispose(); }
      this.nameCapsule = refractiveMesh(glassSlabGeometry(w, lh, lt, lh / 2), this.nameGlass);
      this.nameCapsule.userData.width = w;
      this.nameCapsule.position.z = -lt;
      this.nameCapsule.renderOrder = 1;
      this.nameTag.add(this.nameCapsule);
    };
    fit();
    this.nameText.addEventListener('synccomplete', fit);

    this.dentMax = E.dent.depth * B.dentDepth * this.k / 1000;
    this.press = new PressModel({ thickness: this.dentMax, pressRatio: 1, recover: T.get('motion.recovery.soft.duration'), release: T.get('input.poke.distance.release') });
    this.hoverBand = new Hysteresis(T.get('input.hover.distance.enter'), T.get('input.hover.distance.exit'));
    this.hovered = false;
    this.exclusive = true;     // the Dock clears this on every icon but the nearest
    this.distanceToSkin = Infinity;
    this.grow = { x: 0, v: 0 };   // 0 no bubble, 1 formed (overshoots a little)
    this.dent = { x: 0, v: 0 };   // metres
    this.dentAt = new THREE.Vector3(0, 0, 1);
    this.spot = new THREE.Vector3(0, 0, 1);
    this.hover = 0;
  }

  // Dock scales icons uniformly for magnification and user resizing.
  get inputScale() { return Math.abs(this.getWorldScale(inputScale).x); }
  get touchRadius() { return Math.max(this.rb, this.T.get('input.touch.size.minimum') / (2 * this.inputScale)); }

  pokeDistance(p) { return Math.max(0, p.distanceTo(this.centre) - this.rb) * this.inputScale; }

  // Early proximity can show a press, but only actual contact locks the
  // finger to this app. A neighboring skin may be the intended target.
  pokeContact(p, fingertipRadius = 0) {
    const centre = this.localToWorld(this.centre.clone());
    const radius = this.rb * this.inputScale + fingertipRadius;
    return { centre, radius, separation: p.distanceTo(this.centre) * this.inputScale - radius };
  }
  retainsPokeCapture(p, radius = 0, crossing) {
    return this.press.contacted || p.z > this.centre.z && (crossing === undefined
      ? this.pokeContact(p, radius).separation <= 0 : !!crossing);
  }

  // A ray held on the bubble while pressed meets its sphere.
  rayPoint(localRay, out) {
    return localRay.intersectSphere(new THREE.Sphere(this.centre, this.rb), out);
  }

  // Read this frame's probes: distance from the nearest to the skin (or, while
  // pressed, from the source that pressed; see pickProbe), and where it is.
  // The Dock compares icons before any of them reacts.
  sense() {
    this.frameProbes = this.consumeProbes();
    const { probe, distance } = pickProbe(this.frameProbes,
      p => p.kind === 'ray' ? 0 : Math.max(0, (p.point.distanceTo(this.centre) - this.touchRadius) * this.inputScale - (p.radius ?? 0)),
      this.press.pressed ? this.pressOwner : null);
    this.best = probe;
    const hover=pickProbe(this.frameProbes,p=>p.kind==='ray' ? 0 : Math.max(0,(p.point.distanceTo(this.centre)-this.touchRadius)*this.inputScale-(p.radius??0)));
    this.hoverBest=hover.probe; this.hoverDistance=hover.distance;
    this.distanceToSkin = distance;
    return distance;
  }

  update(dt) {
    const B = DEFAULTS.look.dockBubble, E = DEFAULTS.look.emboss;
    const scale = this.inputScale;
    this.press.release = this.T.get('input.poke.distance.release') / scale;
    const best = this.exclusive ? this.best : null;
    if (!this.press.pressed && best?.kind === 'poke' && this.probeId !== best.id) this.press.lastPenetration = this.press.lastSeparation = null;
    this.probeId = best?.id;
    this.hovered = this.exclusive && this.hoverBest?.kind === 'ray' ? true : this.hoverBand.update(this.exclusive ? this.hoverDistance : Infinity);
    // Press: a finger pushes the skin in by how far it is inside it; a
    // ray press pushes it all the way.
    let penetration = null, inside = false, separation = null;
    if (best && this.enabled) {
      const r = best.point.distanceTo(this.centre);
      inside = r < (best.kind === 'poke' ? this.touchRadius : this.rb) + this.hoverBand.exit / scale;
      if (best.kind === 'poke') {
        separation = r - this.rb - (best.radius ?? 0) / scale;
        inside &&= best.point.z > this.centre.z;
        // InputSystem supplies crossing evidence even for an already
        // provisional press. Do not promote radius jitter to real contact.
        if ((!this.press.pressed || !this.press.contacted) && separation <= 0 && best.surfaceCrossing === null) inside = false;
        // Routing may change during early proximity. A one-frame physical
        // crossing observed by InputSystem can arm this newly chosen skin;
        // first appearance behind it, gaps and jumps cannot.
        if (!this.press.pressed && best.surfaceCrossing && separation <= 0 && best.point.z > this.centre.z) {
          this.press.rearmAtSurface = true;
          this.press.lastSeparation = best.surfaceCrossing.previousGap / scale;
        }
        if (this.press.pressed && this.pressDirection) {
          const delta = best.point.clone().sub(this.centre), axial = delta.z;
          // Keep the contacting fingertip sphere, not only its centre,
          // inside the front silhouette while touching. Once separated,
          // restore the item boundary so a sideways exit cannot select.
          // The actual front hemisphere stays stable across entry angles.
          const contactRadius = this.touchRadius + (separation <= 0 ? (best.radius ?? 0) / scale : 0);
          inside &&= axial > 0 && delta.lengthSq() - axial * axial <= contactRadius ** 2;
        }
      }
      // Only a pinch that began on this app presses it (captured).
      penetration = best.kind === 'poke' ? this.touchRadius - r + ((best.radius ?? 0) + (best.pressOffset ?? 0)) / scale : best.pressed && best.captured ? this.press.maxDepth : -Infinity;
      this.spot.copy(best.point).sub(this.centre).normalize();
    }
    if (best && this.press.amount < 0.01) this.pressKind = best.kind;
    const ev = this.press.update(dt, penetration, inside, separation);
    if (ev === 'press') { this.pressDirection = this.spot.clone(); this.pressOwner = best.id; this.dispatchEvent({ type: 'press' }); }
    if (ev === 'release') { this.dispatchEvent({ type: 'release' }); this.dispatchEvent({ type: 'select' }); }
    if (ev === 'cancel') this.dispatchEvent({ type: 'cancel' });

    // The bubble forms with a small settle (emboss response and damping)
    // and goes without one. Reduced motion: no settle.
    const calm = prefersReducedMotion();
    const on = this.hovered && this.enabled;
    springTo(this.grow, on ? 1 : 0, E.response, on && !calm ? E.damping : 1, dt);
    const g = Math.max(0, this.grow.x);
    this.hover = Math.min(1, g);
    // The dent: placed where the press lands, springing back past flat once
    // (emboss.dent). A fingertip drags it along; a ray (gaze and pinch) pins
    // it where the pinch began, as on a Button: eye tracking wobbles about
    // 1° (35 mm at 2 m), and the dent must not wander with it.
    if (this.press.amount > 0.01 && !this.dent.x) this.dentAt.copy(this.spot);
    if (this.press.amount > 0.01 && this.pressKind === 'poke') this.dentAt.lerp(this.spot, 1 - Math.exp(-dt * 18)).normalize();
    // The early acquisition allowance is for feedback/ownership, not
    // physical deformation. Leave travel available after skin contact.
    let physicalDepth = this.dentMax * this.press.amount;
    if (best?.kind === 'poke') physicalDepth = this.press.pressed
      ? Math.min(this.dentMax, this.dentMax * B.contactDent + Math.max(0, -separation)) : 0;
    springTo(this.dent, on ? physicalDepth : 0, E.dent.response, calm ? 1 : E.dent.damping, dt);
    if (Math.abs(this.dent.x) < 1e-6 && Math.abs(this.dent.v) < 1e-5) this.dent.x = this.dent.v = 0;

    const contacts = contactFeedback(this, on ? this.frameProbes : [], this.press.pressed ? this.pressOwner : null, dt, p => {
      const delta = p.point.clone().sub(this.centre), separation = delta.length() - this.rb - (p.radius ?? 0) / scale;
      if (delta.z <= 0 || separation > 0 || delta.length() > this.touchRadius + (p.radius ?? 0) / scale) return null;
      const at = delta.normalize();
      return { x: at.x, y: at.y, z: at.z, depth: Math.min(this.dentMax, this.dentMax * B.contactDent - separation), maxDepth: this.dentMax };
    });
    writeBubbleContacts(this.skin, contacts, this.rb);

    // Draw it. The bubble grows from a little smaller, never from nothing.
    const u = this.skin;
    this.bubble.visible = g > 0.002;
    u.uOpacity.value = Math.min(1, g);
    this.bubble.scale.setScalar(this.rb * (B.from + (1 - B.from) * g));
    u.uDent.value.set(this.dentAt.x, this.dentAt.y, this.dentAt.z, this.dent.x / this.rb);
    const w = u.uDentWidth.value = E.dent.width * this.k / 2000 / Math.sqrt(Math.LN2) / this.rb;
    // The steepest the dent's wall gets (at w/√2 from its centre), so the
    // shader can find the wall at any depth.
    u.uDentSlope.value = Math.max(1e-3, Math.SQRT2 * Math.exp(-0.5) * Math.abs(this.dent.x / this.rb) / w);
    u.uLipWidth.value = B.lipWidth * this.k / 1000 / this.rb;   // mm, like the dent
    u.uCoreWidth.value = E.glow.coreRadius * this.k / 1000 / this.rb;
    u.uGlow.value = Math.max(this.dent.x > 0 ? Math.min(1, this.dent.x / this.dentMax) : 0,
      this.press.pressed ? E.glow.contact : 0);
    u.uSquash.value = B.squash * this.dent.x / this.dentMax;
    // The object rises to the bubble's middle, and when pressed gives way
    // with the skin: it moves back from the finger and shrinks a touch.
    const lift = Math.max(0, this.rb - this.objectHeight / 2) * B.lift;
    this.holder.position.set(0, lift * g, 0).addScaledVector(this.dentAt, -Math.max(0, this.dent.x) * B.push);
    this.holder.scale.setScalar(1 - B.pressScale * Math.max(0, Math.min(1, this.dent.x / this.dentMax)));
    this.nameTag.visible = this.hover > 0.01;
    this.nameText.fillOpacity = this.hover;
    this.nameGlass.uniforms.uOpacity.value = this.hover;
    this.nameTag.scale.setScalar(B.from + (1 - B.from) * Math.min(1, this.hover));
  }
}
