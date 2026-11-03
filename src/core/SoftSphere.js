import * as THREE from 'three';

// The hanging handle's bounded material response. This is not a gesture or
// a second pressure model. Local dent depth still comes from physical input.
export class SoftSphere {
  constructor() {
    this.matrix = new THREE.Matrix3();
    this.inverse = new THREE.Matrix3();
    this.offset = new THREE.Vector3();
    this.axis = new THREE.Vector3(0, 0, 1);
    this.compression = 0;
  }

  setShape(axis, compression) {
    const d = axis.clone().normalize(), side = new THREE.Vector3(0, 1, 0).cross(d);
    if (side.lengthSq() < 1e-12) side.set(1, 0, 0);
    else side.normalize();
    const up = d.clone().cross(side), axial = 1 - compression;
    // The stem limits vertical spread: a frontal press has a readable oval
    // outline. At the pole the two transverse stretches converge, avoiding
    // a tangent-frame discontinuity. The affine determinant is exactly one.
    const bias = .5 + .3 * (1 - d.y * d.y);
    const lateral = Math.pow(1 / axial, bias), vertical = Math.pow(1 / axial, 1 - bias);
    const axes = [d, side, up], scales = [axial, lateral, vertical];
    const e = this.matrix.elements;
    for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) {
      e[col * 3 + row] = axes.reduce((n, a, i) => n + a.getComponent(row) * a.getComponent(col) * scales[i], 0);
    }
    this.inverse.copy(this.matrix).invert();
    // Keep the north pole attached to the fixed stem, including a vertical
    // press. Rest size and position remain exactly the original sphere.
    this.offset.set(0, 1, 0).sub(new THREE.Vector3(0, 1, 0).applyMatrix3(this.matrix));
    this.axis.copy(d); this.compression = compression;
  }

  update(axis, depth, radius, contact) {
    const normalizedDepth = THREE.MathUtils.clamp(depth / radius, 0, .45);
    let compression = Math.min(.28, normalizedDepth * .7);
    this.setShape(axis, compression);
    const target = contact.clone().multiplyScalar(1 - normalizedDepth * .5);
    // Compression must not move the whole surface past the fingertip's
    // existing dent centre. Reduce it for the underside / large-scale case,
    // rather than creating an outward 'dent' or a gap under the finger.
    // Reserve at least half the measured travel for the local hollow; a
    // body-wide flatten must not erase the previously visible local well.
    if (target.clone().sub(this.offset).applyMatrix3(this.inverse).length() > 1) {
      let low = 0, high = compression;
      for (let i = 0; i < 16; i++) {
        compression = (low + high) / 2; this.setShape(axis, compression);
        if (target.clone().sub(this.offset).applyMatrix3(this.inverse).length() > 1) high = compression;
        else low = compression;
      }
      this.setShape(axis, low);
    }
  }

  radiusAt(direction) {
    const v = direction.clone().normalize().applyMatrix3(this.inverse);
    const w = this.offset.clone().applyMatrix3(this.inverse), b = v.dot(w), a = v.lengthSq();
    return (b + Math.sqrt(Math.max(0, b * b - a * (w.lengthSq() - 1)))) / a;
  }
}

// Shared by both faces of the same actual mesh. The primary well preserves
// its existing physical target; additional contacts indent the current skin.
export const softSphereGLSL = /* glsl */`
  uniform mat3 uShape, uShapeInverse;
  uniform vec3 uShapeOffset;
  vec4 shapeDent(vec4 dent, bool secondary) {
    float radius = 1.0;
    if (secondary) {
      vec3 v = uShapeInverse * dent.xyz, w = uShapeInverse * uShapeOffset;
      float a = dot(v, v), b = dot(v, w);
      radius = (b + sqrt(max(0.0, b*b-a*(dot(w,w)-1.0)))) / a;
    }
    vec3 target = uShapeInverse * ((radius-dent.w)*dent.xyz-uShapeOffset);
    float len = length(target);
    return vec4(target/max(len, 1e-5), clamp(1.0-len, 0.0, .75));
  }
`;
