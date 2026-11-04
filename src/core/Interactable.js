import * as THREE from 'three';

// Anything a hand or ray can touch. The InputSystem feeds it "probes" each
// frame, already converted into this object's local space:
//   { kind: 'poke', point, radius, pressOffset, pinch } joint position; radius/offset in world metres
//   { kind: 'ray', point, ray, pressed }     ray hit (or ray-plane point while captured)
// Subclasses read this.probes in update(dt).
export class Interactable extends THREE.Group {
  constructor() {
    super();
    this.isInteractable = true;
    this.enabled = true;
    this.probes = [];
    this.hitMeshes = [];
  }
  feed(probe) {
    this.probes.push(probe);
  }
  // Called by the InputSystem when a ray press is captured by this object,
  // to turn the ray into a local point while the pointer is dragged.
  // Default: intersection with the front plane z = this.frontZ.
  rayPoint(localRay, out) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(this.frontZ ?? 0));
    return localRay.intersectPlane(plane, out);
  }
  consumeProbes() {
    const p = this.probes;
    this.probes = [];
    return p;
  }
}

// Which probe drives an object this frame, given each probe's distance to it.
// While a press is held, the source that started it (`owner`, a probe id)
// keeps it: another hand or ray on the same object can't take the press over
// or end it early. `lost` says that source is gone this frame (tracking lost,
// ray left without capture), which the caller treats as a cancel: no select.
// With no press, the nearest probe wins, and of rays that all hit (distance
// 0) the one whose pinch began on this object (captured) goes first.
export function pickProbe(probes, distance, owner = null) {
  if (owner != null) {
    const probe = probes.find(p => p.id === owner) ?? null;
    return { probe, distance: probe ? distance(probe) : Infinity, lost: !probe };
  }
  let probe = null, best = Infinity;
  for (const p of probes) {
    const d = distance(p);
    const tie = Number.isFinite(d) && Math.abs(d - best) <= 1e-9;
    const priority = probe && (Number(!!p.captured) - Number(!!probe.captured)
      || String(probe.id).localeCompare(String(p.id)));
    if ((!tie && d < best) || (tie && priority > 0)) { probe = p; best = d; }
  }
  return { probe, distance: best, lost: false };
}

// Top-level components (Button, ZSlider, PackagingPanel, Dock) carry this flag
// so the input system can measure hand distance for near/far switching.
export const markComponent = obj => { obj.isContourComponent = true; return obj; };
