import * as THREE from 'three';
import { Interactable, markComponent, pickProbe } from '../../src/core/Interactable.js';

// Comparison fixture only; not a Contour component export or a token default.
export class PlanarSlider extends Interactable {
  constructor(T, { value = 0.4 } = {}) {
    super();
    markComponent(this);
    this.T = T;
    this.width = 0.16;
    this.height = 0.032;
    this.frontZ = 0.003;
    // A captured drag keeps its ray mapping until release/loss, even if
    // the hand or controller enters the direct-touch distance meanwhile.
    this.retainRayCapture = true;
    this.grab = null;
    this.rayPressed = new Set();
    this.rayBlocked = new Set();
    this.contacts = new Map();
    this.track = new THREE.Mesh(new THREE.PlaneGeometry(this.width, this.height),
      new THREE.MeshBasicMaterial({ color: 0x333b47 }));
    const line = new THREE.Mesh(new THREE.PlaneGeometry(this.width, 0.003),
      new THREE.MeshBasicMaterial({ color: 0xaab3c1 }));
    line.position.z = 0.001;
    this.thumb = new THREE.Mesh(new THREE.CircleGeometry(0.009, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.thumb.position.z = this.frontZ;
    this.add(this.track, line, this.thumb);
    this.hitMeshes = [this.track, this.thumb];
    this.setValue(value, { silent: true });
  }

  setValue(value, { silent = false } = {}) {
    if (!Number.isFinite(value)) return;
    const before = this.value;
    this.value = THREE.MathUtils.clamp(value, 0, 1);
    this.thumb.position.x = (this.value - 0.5) * this.width;
    if (!silent && this.value !== before) this.dispatchEvent({ type: 'change', value: this.value });
  }

  pokeDistance(point) {
    const scale = this.getWorldScale(new THREE.Vector3());
    return Math.hypot(Math.max(0, Math.abs(point.x) - this.width / 2) * scale.x,
      Math.max(0, Math.abs(point.y) - this.height / 2) * scale.y,
      (point.z - this.frontZ) * scale.z);
  }

  rayPoint(ray, out) {
    // A coplanar or nearly parallel ray has no stable, unique track point.
    return Math.abs(ray.direction.z) < 1e-6 ? null : super.rayPoint(ray, out);
  }

  update() {
    const probes = this.consumeProbes();
    const { probe } = pickProbe(probes, p => p.kind === 'ray' ? 0 : this.pokeDistance(p.point), this.grab?.id);
    if (this.grab?.kind === 'ray' && (!probe || probe.kind !== 'ray')) this.rayBlocked.add(this.grab.id);
    for (const p of probes) if (p.kind === 'ray' && !p.pressed) this.rayBlocked.delete(p.id);
    const wasPressed = probe && this.rayPressed.has(probe.id);
    this.rayPressed = new Set(probes.filter(p => p.kind === 'ray' && p.pressed).map(p => p.id));
    const scale = this.getWorldScale(new THREE.Vector3());
    const previous = probe && this.contacts.get(probe.id);
    this.contacts = new Map(probes.filter(p => p.kind === 'poke').map(p => {
      const radius = (p.radius ?? 0) / Math.abs(scale.z);
      return [p.id, { z: p.point.z, radius, gap: p.point.z - radius - this.frontZ }];
    }));
    let active = false;
    if (probe?.kind === 'ray' && probe.captured && probe.pressed
      && !this.rayBlocked.has(probe.id)
      && (this.grab?.kind === 'ray' || (!this.grab && !wasPressed))) {
      this.grab ??= { id: probe.id, kind: 'ray' };
      active = true;
      // Recheck the actual plane: InputSystem retains a previous point on
      // a ray-plane miss. That fallback must not fabricate a fresh value.
      const point = probe.ray ? this.rayPoint(probe.ray, new THREE.Vector3()) : probe.point;
      if (point) this.setValue(point.x / this.width + 0.5);
    } else if (probe?.kind === 'poke') {
      const contact = this.contacts.get(probe.id);
      const insideY = Math.abs(probe.point.y) <= this.height / 2;
      const insideX = Math.abs(probe.point.x) <= this.width / 2;
      const crossing = previous?.gap > 0 && contact.gap <= 0
        && probe.point.z - previous.radius <= this.frontZ;
      const holding = this.grab?.kind === 'poke';
      // A front crossing acquires. During a drag X can leave the ends (clamp),
      // but retreat, deep penetration, lateral exit or source loss releases.
      active = insideY && contact.gap >= -0.02 / Math.abs(scale.z)
        && (holding ? contact.gap <= this.T.get('input.poke.distance.release') / Math.abs(scale.z)
          : !this.grab && insideX && crossing);
      if (active) {
        this.grab ??= { id: probe.id, kind: 'poke' };
        this.setValue(probe.point.x / this.width + 0.5);
      }
    }
    if (!active) this.grab = null;
    const hovered = probe && (probe.kind === 'ray'
      || this.pokeDistance(probe.point) < this.T.get('input.hover.distance.enter'));
    this.track.material.color.set(this.grab ? 0x53647d : hovered ? 0x434f61 : 0x333b47);
    this.thumb.material.color.set(this.grab ? 0x78cfff : hovered ? 0xd1efff : 0xffffff);
    this.thumb.scale.setScalar(this.grab ? 1.15 : hovered ? 1.08 : 1);
  }
}
