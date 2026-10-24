import * as THREE from 'three';
import { DEFAULTS } from './defaults.js';

// A session-local placement, not a torso tracker. Head rotation and Y never
// alter it after initialization. Only horizontal displacement beyond a
// deadzone moves the anchor. A pinch owns all three placement dimensions.
export class DockRail {
  constructor(handle, { radius, height } = {}) {
    this.handle = handle;
    this.initial = { radius: radius ?? DEFAULTS.dockRail.radius, height: height ?? DEFAULTS.dockRail.height };
    this.reset();
  }

  reset() {
    this.anchor = null;
    this.held = this.handle.grab = null;
    this.radius = this.initial.radius;
    this.height = this.initial.height;
    this.angle = 0;
  }

  offset() {
    return new THREE.Vector3(-DEFAULTS.dockRail.aspect * this.radius * Math.sin(this.angle),
      this.height, -this.radius * Math.cos(this.angle));
  }

  update(head, dt) {
    const D = DEFAULTS.dockRail, h = this.handle;
    const centre = head.getWorldPosition(new THREE.Vector3());
    if (!this.anchor) {
      this.anchor = centre.clone();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      this.yaw = Math.atan2(-fwd.x, -fwd.z);
    }
    const holding = p => p.kind === 'poke' ? p.pinch : p.pressed && p.captured;
    const probe = this.held ? h.probes.find(p => p.id === this.held.id)
      : h.probes.find(p => holding(p) && (p.kind === 'ray' || h.faceDistance(p.point, p.radius) <= D.handleReach));
    if (!probe || !holding(probe)) this.held = h.grab = null;
    else {
      const point = h.localToWorld(probe.point.clone());
      if (!this.held) this.held = { id: probe.id, point, offset: this.offset() };
      const delta = point.clone().sub(this.held.point).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
      const desired = this.held.offset.clone().add(delta);
      this.height = THREE.MathUtils.clamp(desired.y, ...D.heightRange);
      this.angle = THREE.MathUtils.clamp(Math.atan2(-desired.x / D.aspect, -desired.z), -D.angleLimit, D.angleLimit);
      const reach = Math.sqrt(D.maxReach ** 2 - this.height ** 2)
        / Math.hypot(D.aspect * Math.sin(this.angle), Math.cos(this.angle));
      this.radius = THREE.MathUtils.clamp(Math.hypot(desired.x / D.aspect, desired.z), D.radiusRange[0], Math.min(D.radiusRange[1], reach));
      h.grab = this.held;
    }
    if (!this.held) {
      const shift = centre.clone().sub(this.anchor); shift.y = 0;
      const distance = shift.length();
      if (distance > D.deadzone) this.anchor.addScaledVector(shift,
        (distance - D.deadzone) / distance * (1 - Math.exp(-D.followRate * dt)));
    }
    this.position = this.offset().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.anchor);
    return !!this.held;
  }
}
