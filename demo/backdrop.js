// The room behind the UI: a photographed interior (Poly Haven "lebombo",
// CC0) used as background and as the light the UI is lit by. Window glass
// shows a blurred view of it (setBackdrop). In mixed reality the real room
// replaces it, and glass falls back to a tinted surface.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { setBackdrop, setBackdropIntensity } from '../src/core/look.js';

export async function loadBackdrop(renderer, scene, { yaw = 1.6 } = {}) {
  const hdr = await new HDRLoader().loadAsync('./env/lebombo_1k.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const rotation = new THREE.Euler(0, yaw, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const blurred = pmrem.fromEquirectangular(hdr).texture;
  scene.backgroundRotation.copy(rotation);
  scene.environmentRotation.copy(rotation);
  const show = on => {
    scene.background = on ? hdr : null;
    scene.environment = hdr; // keeps lighting the UI in mixed reality too
    setBackdrop(on ? blurred : null, { rotation });
  };
  show(true);
  return {
    show,
    // Room brightness (the demo's "Lamp"): 0..1.
    setBrightness(v) {
      const k = THREE.MathUtils.lerp(0.35, 1.15, v);
      scene.backgroundIntensity = k;
      setBackdropIntensity(k);
    },
  };
}
