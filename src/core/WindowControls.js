import * as THREE from 'three';
import { DEFAULTS } from './defaults.js';

// One gesture owns the complete window stack. Root transforms keep text,
// icons, hit targets and palm coordinates in the same frame.
export class WindowControls {
  constructor(panel) { this.panel = panel; this.held = null; }

  cancel({ keepProbes = false } = {}) {
    if (this.held) {
      const h = this.held.handle;
      h.grab = null;
      h.press.update(0, null, false);
      if (!keepProbes) h.probes = [];
    }
    this.held = null;
  }

  update() {
    const p = this.panel, D = DEFAULTS.windowManipulation;
    if (p.palmPush) { this.cancel(); return; }
    const holding = probe => probe.kind === 'poke' ? probe.pinch : probe.pressed && probe.captured;
    const handles = p.levels.flatMap(l => [l.panel, ...l.corners]);
    let h = this.held?.handle;
    let probe = h?.probes.find(q => q.id === this.held.id);
    if (!this.held) {
      for (const candidate of handles.filter(h => h.enabled)) {
        probe = candidate.probes.find(q => holding(q) && candidate.inside(q.point, q.kind === 'poke')
          && (q.kind === 'ray' || candidate.faceDistance(q.point, q.radius) <= DEFAULTS.dockRail.handleReach));
        if (probe) { h = candidate; break; }
      }
    }
    if (!probe || !holding(probe)) {
      // A released drag cancels selection, not the current proximity sample.
      // Keep hover visible until the source actually leaves or is lost.
      if (this.held?.moved || !probe) this.cancel({ keepProbes: !!probe });
      else if (this.held) { this.held.handle.grab = null; this.held = null; }
      return;
    }
    const world = h.localToWorld(probe.point.clone());
    const point = p.parent ? p.parent.worldToLocal(world.clone()) : world;
    if (!this.held) {
      const centre = h.getWorldPosition(new THREE.Vector3());
      const localCentre = p.parent ? p.parent.worldToLocal(centre) : centre;
      const axis = localCentre.sub(p.position);
      this.held = { id: probe.id, handle: h, point, position: p.position.clone(), scale: p.scale.x,
        axis: axis.clone().normalize(), extent: axis.length(), resize: !!h.userData.resize, moved: false };
    }
    const g = this.held, delta = point.clone().sub(g.point);
    g.moved ||= delta.length() > D.dragSlop;
    if (g.resize) {
      const factor = 1 + delta.dot(g.axis) / Math.max(g.extent, 1e-4);
      p.scale.setScalar(THREE.MathUtils.clamp(g.scale * factor, ...D.scaleRange));
    } else p.position.copy(g.position).add(delta);
    h.grab = g;
    if (g.moved) h.press.update(0, null, false);
    p.updateMatrixWorld(true);
  }
}
