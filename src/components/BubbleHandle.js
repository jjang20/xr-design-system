import * as THREE from 'three';
import { Interactable, pickProbe } from '../core/Interactable.js';
import { PressModel } from '../core/PressModel.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { DEFAULTS } from '../core/defaults.js';
import { makeBubble } from '../core/bubble.js';
import { glassSlabGeometry } from '../core/look.js';
import { springTo, prefersReducedMotion } from '../core/spring.js';

// A material handle, not a navigation button. Contact supplies feedback;
// WindowControls/DockRail alone decide when pinch/ray capture manipulates.
export class BubbleHandle extends Interactable {
  constructor(T, { width, height = width, distance, rectangular = false, reveal = false, resize = false }) {
    super(); this.T = T; this.reveal = reveal; this.rectangular = rectangular;
    const dmm = v => v * T.effectiveDistance(distance) / 1000;
    this.w = dmm(width); this.h = dmm(height); this.r = this.w / 2;
    this.t = rectangular ? this.w * .45 : this.r;
    this.frontZ = this.t;
    this.userData.resize = resize;
    const geometry = rectangular
      ? glassSlabGeometry(this.w, this.h, this.t, this.w * .3, { tessellate: .002 }).scale(1 / this.r, 1 / this.r, 1 / this.r)
      : new THREE.SphereGeometry(1, 48, 32);
    this.affordance = new THREE.Group(); this.add(this.affordance);
    this.body = makeBubble({ geometry, planar: rectangular });
    this.body.scale.setScalar(this.r); this.affordance.add(this.body);
    this.skin = this.body.uniforms;
    const hit = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
    hit.scale.setScalar(this.r); this.add(hit); this.hitMeshes = [hit];
    if (resize) {
      // Local diagonal with two arrowheads; mirrored at the left corner.
      const pts = [[-.36,-.36],[.36,.36],[-.36,-.36],[-.36,-.06],[-.36,-.36],[-.06,-.36],
        [.36,.36],[.06,.36],[.36,.36],[.36,.06]];
      const g = new THREE.BufferGeometry().setFromPoints(pts.map(([x,y]) => new THREE.Vector3(x*this.r,y*this.r,this.t+.0007)));
      this.arrow = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .92 }));
      this.affordance.add(this.arrow);
    }
    this.press = new PressModel({ thickness: .002, pressRatio: 1, recover: T.get('motion.recovery.soft.duration'), release: T.get('input.poke.distance.release') });
    this.hoverBand = new Hysteresis(T.get('input.hover.distance.enter'), T.get('input.hover.distance.exit'));
    this.dent = { x: 0, v: 0 }; this.spot = new THREE.Vector3(0,0,1);
    this.hovered = false; this.affordance.visible = !reveal;
  }

  get inputScale() { return Math.abs(this.getWorldScale(new THREE.Vector3()).x); }
  inside(p, touch = false) {
    const minimum = touch ? this.T.get('input.touch.size.minimum') / this.inputScale : 0;
    const w = Math.max(this.w, minimum), h = Math.max(this.h, minimum);
    return this.rectangular ? Math.abs(p.x) <= w / 2 && Math.abs(p.y) <= h / 2
      : p.x * p.x + p.y * p.y <= w * w / 4;
  }
  surfaceZ() { return this.t; }
  faceDistance(p, radius = 0) {
    const d = this.rectangular ? Math.hypot(Math.max(0,Math.abs(p.x)-this.w/2),Math.max(0,Math.abs(p.y)-this.h/2),p.z-this.t)
      : Math.abs(p.length()-this.r);
    return Math.max(0,d*this.inputScale-radius);
  }
  pokeDistance(p) { return this.inside(p, true) || !this.rectangular ? this.faceDistance(p) : Infinity; }

  update(dt) {
    const D = DEFAULTS.look.emboss, scale = this.inputScale;
    const probes = this.consumeProbes();
    const owner = this.grab?.id ?? (this.press.pressed ? this.pressOwner : null);
    const { probe } = pickProbe(this.enabled ? probes : [],
      p => p.kind === 'ray' ? 0 : this.faceDistance(p.point, p.radius), owner);
    this.hovered = !!probe && (probe.kind === 'ray' || this.hoverBand.update(this.faceDistance(probe.point, probe.radius)));
    if (!probe) this.hoverBand.update(Infinity);
    let separation = null, penetration = null;
    if (probe) {
      separation = (this.rectangular ? probe.point.z - this.t : probe.point.length() - this.r) * scale - (probe.radius ?? 0);
      penetration = probe.kind === 'poke' ? -separation + (probe.pressOffset ?? 0)
        : probe.pressed && probe.captured ? this.press.maxDepth : -Infinity;
      if (!this.press.pressed && this.probeId !== probe.id) this.press.lastPenetration = null;
      this.probeId = probe.id;
    }
    const event = this.press.update(dt, penetration, !!probe && (!!this.grab || this.inside(probe.point, probe.kind === 'poke')),
      probe?.kind === 'poke' ? separation : null);
    if (event === 'press') { this.pressOwner = probe.id; this.pressKind = probe.kind; }
    const held = !!this.grab;
    if (probe && (held || this.press.pressed)) {
      if (this.rectangular) this.spot.set(
        THREE.MathUtils.clamp(probe.point.x, -this.w / 2, this.w / 2) / this.r,
        THREE.MathUtils.clamp(probe.point.y, -this.h / 2, this.h / 2) / this.r, this.t / this.r);
      else this.spot.copy(probe.point).normalize();
    }
    const depth = held ? .0015 : this.press.pressed ? Math.min(.002, .0003 + Math.max(0, -(separation ?? -.002))) : 0;
    springTo(this.dent, depth / scale, D.dent.response, prefersReducedMotion() ? 1 : D.dent.damping, dt);
    const u = this.skin;
    u.uOpacity.value = 1;
    u.uDent.value.set(this.spot.x, this.spot.y, this.spot.z, this.dent.x / this.r);
    u.uDentWidth.value = .012 / (scale * this.r);
    u.uCoreWidth.value = .007 / (scale * this.r);
    u.uLipWidth.value = .001 / (scale * this.r);
    u.uDentSlope.value = this.dent.x / .012;
    u.uGlow.value = held || this.press.pressed ? .8 : this.hovered ? .12 : 0;
    u.uSquash.value = this.rectangular ? 0 : .03 * Math.min(1, this.dent.x / .002);
    this.affordance.visible = !this.reveal || this.hovered || held;
    if (this.arrow) this.arrow.position.z = -Math.max(0, this.dent.x);
  }
}
