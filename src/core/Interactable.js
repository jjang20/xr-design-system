import * as THREE from 'three';

// Anything a hand or ray can touch. The InputSystem feeds it "probes" each
// frame, already converted into this object's local space:
//   { kind: 'poke', point, pinch }           fingertip position
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

// Top-level components (Button, ZSlider, PackagingPanel, Dock) carry this flag
// so the input system can measure hand distance for near/far switching.
export const markComponent = obj => { obj.isContourComponent = true; return obj; };
