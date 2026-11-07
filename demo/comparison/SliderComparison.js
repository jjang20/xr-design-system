import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { ZSlider } from '../../src/components/ZSlider.js';
import { makeText } from '../../src/core/look.js';
import { PlanarSlider } from './PlanarSlider.js';

function makeResult() {
  const result = new THREE.Group();
  // Use the same local system-font Hangul label on both sides. No remote
  // fallback font or image asset is needed for this fixture's common name.
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '500 64px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('밝기', 256, 64);
  const labelMap = new THREE.CanvasTexture(canvas);
  labelMap.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.02),
    new THREE.MeshBasicMaterial({ map: labelMap, transparent: true, toneMapped: false }));
  label.position.y = 0.067;
  const number = makeText('40%', { size: 0.014 });
  number.position.y = -0.045;
  const sample = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.4, 0.4), toneMapped: false }));
  result.add(label, number, sample);
  return Object.assign(result, { number, sample, labelMap });
}

export class SliderComparison extends THREE.Group {
  constructor(T) {
    super();
    this.controls = {
      x: new PlanarSlider(T),
      z: new ZSlider(T, { value: 0.4, distance: 0.6, icon: 'sun' }),
    };
    this.results = { x: makeResult(), z: makeResult() };
    for (const [key, x] of [['x', -0.14], ['z', 0.14]]) {
      this.controls[key].position.x = x;
      this.results[key].position.set(x, 0.16, 0);
      this.add(this.controls[key], this.results[key]);
    }
    // The original horizontal-plane ray mapping needs an oblique view.
    // This is a fixture orientation, not a change to ZSlider input/feedback.
    this.controls.z.rotation.y = -0.35;
  }

  update(dt) {
    if (this.disposed) return;
    for (const key of ['x', 'z']) {
      const control = this.controls[key], result = this.results[key];
      control.update(dt);
      // Public value also covers silent initialization/reset. Never feed a
      // result back into a control, or interpret a detent as a commit.
      const value = control.value;
      const text = `${Math.round(value * 100)}%`;
      if (result.number.text !== text) { result.number.text = text; result.number.sync(); }
      result.sample.material.color.setRGB(value, value, value);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const control of Object.values(this.controls)) {
      control.enabled = false; control.grab = null; control.consumeProbes();
    }
    const geometries = new Set(), materials = new Set(), texts = [];
    this.traverse(object => {
      if (object instanceof Text) texts.push(object);
      else if (object.geometry) geometries.add(object.geometry);
      if (object.material && !(object instanceof Text)) materials.add(object.material);
    });
    texts.forEach(text => text.dispose());
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    Object.values(this.results).forEach(result => result.labelMap.dispose());
    // haloTexture() creates this map per ZSlider instance, unlike softTexture
    // and the icon atlas. Material disposal does not dispose its map.
    this.controls.z.halo.material.map.dispose();
    // Shared ZSlider texture caches belong to the existing renderer path.
    this.removeFromParent();
  }
}
