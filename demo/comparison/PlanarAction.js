import * as THREE from 'three';
import { Button } from '../../src/components/Button.js';

// Comparison rendering only. Reuse Button's public press/release, touch floor,
// owner and disabled semantics without exporting another DS component.
export class PlanarAction extends Button {
  constructor(T, options) {
    super(T, { ...options, variant: 'secondary', hoverStyle: 'lens' });
    this.body.visible = false;
    if (this.fx) this.fx.visible = false;
    const x = this.w / 2, y = this.h / 2, r = this.r;
    const shape = new THREE.Shape();
    shape.moveTo(-x + r, -y); shape.lineTo(x - r, -y);
    shape.quadraticCurveTo(x, -y, x, -y + r); shape.lineTo(x, y - r);
    shape.quadraticCurveTo(x, y, x - r, y); shape.lineTo(-x + r, y);
    shape.quadraticCurveTo(-x, y, -x, y - r); shape.lineTo(-x, -y + r);
    shape.quadraticCurveTo(-x, -y, -x + r, -y);
    this.plane = new THREE.Mesh(new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: this.disabled ? 0x333b47 : 0x465775 }));
    this.plane.position.z = this.t;
    this.add(this.plane);
    this.hitMeshes = [this.plane];
  }
  // The flat face never moves with the material depth used by PressModel.
  layoutFront() { this.face.position.z = this.t; }
  surfaceZ() { return this.t; }
  updateFeedback(dt) {
    super.updateFeedback(dt);
    this.plane.material.color.set(this.disabled ? 0x333b47
      : this.press.pressed ? 0x3565a1 : this.hovered ? 0x627da5 : 0x465775);
  }
}
