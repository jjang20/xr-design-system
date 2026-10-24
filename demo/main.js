// Demo: a Room planner scene in a real (photographed) room. Every core
// component at real-world scale, usable with a mouse on desktop and with
// hands or controllers in a headset.
import * as THREE from 'three';
import tokenJson from '../tokens.json';
import {
  createTokens, Button, ZSlider, PackagingPanel, PACKAGING_MODES, Dock, Toolbar, InputSystem, unlockAudio, makePlatter,
} from '../src/index.js';
import { loadBackdrop } from './backdrop.js';
import { catalogItems } from './catalog-data.js';

const T = createTokens(tokenJson);
const EYE = 1.6; // m, standing eye height for the desktop camera
const D = 0.6; // m, placement distance the dmm sizes are computed for

// Renderer, scene, camera ----------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true; // the Dock's objects shade themselves (DEFAULTS.look.dockObjects.shadow)
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 50);
camera.position.set(0, EYE, 0);
camera.rotation.order = 'YXZ';
const look = { yaw: 0, pitch: -0.13 };

const room = await loadBackdrop(renderer, scene);
const setLamp = v => room.setBrightness(v);

// UI ---------------------------------------------------------------------------
const toast = document.getElementById('log');
const say = text => { toast.textContent = text; };
const place = (obj, x, y, z) => { obj.position.set(x, y, z); obj.lookAt(0, EYE, 0); scene.add(obj); return obj; };
const dmm = v => (v / 1000) * D;

// Catalog window: packaging, three levels deep.
const catalog = place(new PackagingPanel(T, {
  title: 'Catalog',
  subtitle: 'Living room · 4 categories',
  items: catalogItems,
  distance: D,
}), -0.02, 1.62, -0.68);
catalog.addEventListener('open', e => say(`Opened ${e.item.label}`));
catalog.addEventListener('back', () => say('Back'));
catalog.addEventListener('select', e => say(`${e.item.label} selected`));

// Toolbar ornament under the window: one glass bar whose buttons are
// bubbles in its glass; the primary action is accent-tinted glass. The three
// densities sit side by side.
const tools = [
  { label: 'Place', icon: 'plus', primary: true, shape: 'capsule', width: 150, density: 'firm' },
  { icon: 'rotate-3d', shape: 'circle', density: 'soft', name: 'Rotate (soft)' },
  { icon: 'lock', shape: 'circle', density: 'rigid', name: 'Lock (rigid)' },
  { icon: 'trash-2', shape: 'circle', disabled: true, name: 'Delete' },
];
const ornament = place(new Toolbar(T, { tools, distance: D }), -0.02, 1.455, -0.66);
ornament.addEventListener('select', e => say(`${e.tool.label ?? e.tool.name}`));
const toolButtons = [ornament];

// Z-Slider: lamp brightness. Pull away from the base = brighter.
const slider = place(new ZSlider(T, { label: 'Lamp', icon: 'sun', value: 0.4, distance: D }), 0.215, 1.53, -0.6);
slider.rotateY(-0.45); // turned a little, so the push axis is visible on a flat screen
setLamp(0.4);
slider.addEventListener('change', e => setLamp(e.value));

// Dock: body-locked below your view.
const dock = new Dock(T, {
  apps: [
    { label: 'Planner', icon: 'house', color: 0x2f7cf6, running: true },
    { label: 'Measure', icon: 'ruler', color: 0xe08a1e },
    { label: 'Scan', icon: 'scan', color: 0x23a26d },
    { label: 'Photos', icon: 'image', color: 0xd9455f },
    { label: 'Settings', icon: 'settings', color: 0x6b6f78 },
    { label: 'Notes', icon: 'notes', color: 0xf7d046 },
    { label: 'Clock', icon: 'clock', color: 0x3f8fd8 },
  ],
});
dock.addEventListener('select', e => say(`Opened ${e.app.label}`));
scene.add(dock);

const input = new InputSystem({ T, renderer, camera, scene });

// HUD --------------------------------------------------------------------------
const modes = document.getElementById('modes');
for (const m of PACKAGING_MODES) {
  const b = document.createElement('button');
  b.textContent = m;
  b.setAttribute('aria-pressed', String(m === catalog.mode));
  b.onclick = () => {
    catalog.setMode(m);
    for (const x of modes.children) x.setAttribute('aria-pressed', String(x === b));
  };
  modes.append(b);
}

input.onLook = (dx, dy) => {
  look.yaw -= dx * 0.004;
  look.pitch = THREE.MathUtils.clamp(look.pitch - dy * 0.004, -1.2, 1.2);
};
const keys = new Set();
addEventListener('keydown', e => keys.add(e.key));
addEventListener('keyup', e => keys.delete(e.key));
addEventListener('pointerdown', unlockAudio);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Enter XR: mixed reality if the device supports it, otherwise VR.
const xrButton = document.getElementById('xr');
(async () => {
  const xr = navigator.xr;
  const mode = xr && (await xr.isSessionSupported('immersive-ar').catch(() => false)) ? 'immersive-ar'
    : xr && (await xr.isSessionSupported('immersive-vr').catch(() => false)) ? 'immersive-vr' : null;
  if (!mode) { xrButton.textContent = 'Open in a headset browser for XR'; return; }
  xrButton.disabled = false;
  xrButton.textContent = mode === 'immersive-ar' ? 'Enter mixed reality' : 'Enter VR';
  xrButton.onclick = async () => {
    unlockAudio();
    const session = await xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
    room.show(mode !== 'immersive-ar');
    await renderer.xr.setSession(session);
    session.addEventListener('end', () => room.show(true));
  };
})();

// Loop -------------------------------------------------------------------------
const timer = new THREE.Timer();
renderer.setAnimationLoop(time => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.05);
  if (keys.has('ArrowLeft')) look.yaw += dt * 1.6;
  if (keys.has('ArrowRight')) look.yaw -= dt * 1.6;
  if (!renderer.xr.isPresenting) camera.rotation.set(look.pitch, look.yaw, 0);
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();

  input.update();
  toolButtons.forEach(b => b.update(dt));
  slider.update(dt);
  catalog.update(dt);
  dock.update(dt, camera, input.handPoints);
  renderer.render(scene, camera);
});

// Hooks for automated screenshots and checks (scripts/screenshot.mjs).
window.contour = {
  T, camera, panel: catalog, slider, dock, buttons: ornament.buttons, look,
  screenOf(obj) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  },
};
