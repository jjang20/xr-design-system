import * as THREE from 'three';

// Last transparent draw in each camera viewport, not a spatial hit target.
// Normal blending attenuates virtual RGB and adds coverage in transparent
// regions. Only an alpha-blend XR compositor can dim displayed passthrough.
export class BrightnessOverlay extends THREE.Mesh {
  constructor() {
    super(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { opacity: { value: 0 } },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform float opacity; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, opacity); }',
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.frustumCulled = false;
    this.renderOrder = 1000000;
    this.setBlendMode(undefined);
  }
  setBrightness(value) {
    if (Number.isFinite(value)) this.material.uniforms.opacity.value = 0.75 * (1 - THREE.MathUtils.clamp(value, 0, 1));
  }
  setBlendMode(mode) {
    this.scopeLabel = mode === 'alpha-blend' ? '앱 화면과 보이는 주변 밝기' : '가상 화면 밝기';
  }
  dispose() {
    this.setBrightness(1); this.removeFromParent(); this.geometry.dispose(); this.material.dispose();
  }
}
