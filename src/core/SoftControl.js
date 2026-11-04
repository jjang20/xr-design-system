import * as THREE from 'three';
import { SoftSphere } from './SoftSphere.js';

// Existing window affordances keep their rest mesh. A side compresses its
// depth against its back plane; a round corner compresses along the contact
// or pinch axis about its own centre (it has no Dock stem).
export class SoftControl extends SoftSphere {
  constructor({ width, height, thickness, rectangular }) {
    super();
    this.rectangular = rectangular;
    this.half = new THREE.Vector3(width / 2, height / 2, thickness);
  }
  update(axis, depth, radius) {
    const extent = this.rectangular ? this.half.z : radius;
    const compression = THREE.MathUtils.clamp(depth / extent * .95, 0, .25);
    if (this.rectangular) {
      const z = 1 - compression, xy = Math.sqrt(1 / z);
      this.matrix.set(xy,0,0, 0,xy,0, 0,0,z);
      this.inverse.copy(this.matrix).invert();
      this.compression = compression;
    } else this.setShape(axis, compression);
    this.offset.set(0,0,0);
  }
  // Side poke proximity keeps the existing front-face domain, now measured
  // in the actual spread coordinates. Ray intersections use the real mesh.
  frontSample(point, radius) {
    const e = this.matrix.elements;
    const x = this.half.x * e[0], y = this.half.y * e[4], z = this.half.z * e[8];
    const nearest = new THREE.Vector3(THREE.MathUtils.clamp(point.x,-x,x),THREE.MathUtils.clamp(point.y,-y,y),z);
    const sign = point.z < z ? -1 : 1;
    return { point: nearest.clone().divideScalar(radius), distance: nearest.distanceTo(point)*sign/radius };
  }
}
