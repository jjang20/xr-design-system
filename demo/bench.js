// Bench: one component at a fixed framing over a real room, for scored
// rounds against the visionOS bar (docs/catalog-spec.md).
// Query: ?rot=<backdrop yaw> &view=angle &fov=<deg> &hover=<lens|emboss> &absorb=&blur= (lab overrides)
import * as THREE from 'three';
import tokenJson from '../tokens.json';
import { createTokens, PackagingPanel, InputSystem } from '../src/index.js';
import { loadBackdrop } from './backdrop.js';
import { DEFAULTS } from '../src/core/defaults.js';
import { catalogItems } from './catalog-data.js';

const q = new URLSearchParams(location.search);
if (q.has('absorb')) DEFAULTS.look.glass.absorb = Number(q.get('absorb'));
if (q.has('hover')) DEFAULTS.look.hoverStyle = q.get('hover');
if (q.has('blur')) DEFAULTS.look.glass.blur = Number(q.get('blur'));
const T = createTokens(tokenJson);
const D = Number(q.get('dist') ?? 0.6), EYE = 1.6; // ?dist= places the window farther (m)

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, Number(q.get('dpr')) || 2)); // ?dpr=4 for 6K stills
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
// ?fov= narrows the view to match the path-traced reference frames (lookdev/).
const camera = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 40), innerWidth / innerHeight, 0.02, 50);
camera.position.set(0, EYE, 0);
// ?view=angle looks at the window from 35° to the side, to show thickness and layering.
if (q.get('view') === 'angle') {
  camera.position.set(Math.sin(0.6) * D, EYE + 0.06, -D + Math.cos(0.6) * D);
  camera.lookAt(0, EYE, -D);
}

await loadBackdrop(renderer, scene, { yaw: Number(q.get('rot') ?? 1.6) });

const panel = new PackagingPanel(T, { title: 'Catalog', subtitle: 'Living room · 4 categories', items: catalogItems, distance: D });
panel.position.set(Number(q.get('px') ?? 0), EYE, -D);
panel.lookAt(0, EYE, 0);
scene.add(panel);

const input = new InputSystem({ T, renderer, camera, scene });
const timer = new THREE.Timer();
const step = dt => {
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  input.update();
  panel.update(dt);
};
// ?manual: time only moves when the recorder calls tick(), so motion can be
// captured frame by frame on a slow software renderer.
if (q.has('manual')) renderer.setAnimationLoop(() => renderer.render(scene, camera));
else renderer.setAnimationLoop(time => {
  timer.update(time);
  step(Math.min(timer.getDelta(), 0.05));
  renderer.render(scene, camera);
});

window.contour = {
  panel, camera,
  tick(frames = 1, dt = 1 / 60) { for (let i = 0; i < frames; i++) step(dt); renderer.render(scene, camera); },
  screenOf(obj) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  },
};
window.ready = true;
