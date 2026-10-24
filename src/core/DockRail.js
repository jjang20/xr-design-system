import * as THREE from 'three';
import { DEFAULTS } from './defaults.js';
import { wrapAngle } from './spring.js';

// The user places the Dock on a sphere around the estimated body anchor.
// Keep the grabbed point's angular offset, so grabbing never snaps the Dock.
// The head supplies translation/yaw because WebXR has no torso pose.
export class DockRail {
  constructor(handle, elevation) {
    Object.assign(this, { handle, elevation });
    this.yawOffset = 0;
    this.held = null;
  }

  update(head, bodyYaw) {
    const h = this.handle, probes = h.probes;
    const centre = head.getWorldPosition(new THREE.Vector3());
    const holding = p => p.kind === 'poke' ? p.pinch : p.pressed && p.captured;
    const probe = this.held ? probes.find(p => p.id === this.held.id)
      : probes.find(p => holding(p) && (p.kind === 'ray' || h.faceDistance(p.point, p.radius) <= h.hoverBand.enter));
    if (!probe || !holding(probe)) { this.held = null; h.grab = null; return false; }
    const point = h.localToWorld(probe.point.clone());
    const direction = point.sub(centre);
    if (direction.lengthSq() < 1e-6) { this.held = null; h.grab = null; return false; }
    const azimuth = Math.atan2(-direction.x, -direction.z);
    const elevation = Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
    if (!this.held) this.held = { id: probe.id, azimuth, elevation, yaw: bodyYaw + this.yawOffset, pitch: this.elevation };
    const yaw = this.held.yaw + wrapAngle(azimuth - this.held.azimuth);
    this.yawOffset = wrapAngle(yaw - bodyYaw);
    this.elevation = THREE.MathUtils.clamp(this.held.pitch + elevation - this.held.elevation,
      ...DEFAULTS.dockRail.elevationRange);
    h.grab = this.held;
    return true;
  }
}
