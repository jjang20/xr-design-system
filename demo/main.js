// Demo: a Room planner scene. Every core component at real-world scale,
// usable with a mouse on desktop and with hands or controllers in a headset.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import tokenJson from '../tokens.json';
import {
  createTokens, Button, ZSlider, PackagingPanel, PACKAGING_MODES, Dock, InputSystem, unlockAudio, makePlatter,
} from '../src/index.js';
import { buildRoom } from './room.js';

const T = createTokens(tokenJson);
const EYE = 1.6; // m, standing eye height for the desktop camera
const D = 0.6; // m, placement distance the dmm sizes are computed for

// Renderer, scene, camera ----------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
renderer.toneMappingExposure = 0.95;

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 50);
camera.position.set(0, EYE, 0);
camera.rotation.order = 'YXZ';
const look = { yaw: 0, pitch: -0.13 };

const { room, setLamp } = buildRoom();
scene.add(room);

// UI ---------------------------------------------------------------------------
const toast = document.getElementById('log');
const say = text => { toast.textContent = text; };
const place = (obj, x, y, z) => { obj.position.set(x, y, z); obj.lookAt(0, EYE, 0); scene.add(obj); return obj; };
const dmm = v => (v / 1000) * D;

// Catalog window: packaging, three levels deep.
const catalog = place(new PackagingPanel(T, {
  title: 'Catalog',
  subtitle: 'Living room · 4 categories',
  items: [
    { label: 'Sofas', icon: 'sofa', items: [
      { label: 'Lounge 3-seat', icon: 'sofa', sublabel: '214 × 96 cm' },
      { label: 'Modular', icon: 'layers', items: [
        { label: 'Corner unit', icon: 'square-dashed', sublabel: '96 × 96 cm' },
        { label: 'Ottoman', icon: 'square-dashed', items: [{ label: 'Round', icon: 'square-dashed' }, { label: 'Square', icon: 'square-dashed' }] },
      ] },
      { label: 'Loveseat', icon: 'sofa', sublabel: '152 × 90 cm' },
    ] },
    { label: 'Chairs', icon: 'armchair', items: [{ label: 'Lounge chair', icon: 'armchair', sublabel: '78 × 82 cm' }, { label: 'Dining chair', icon: 'armchair', sublabel: '46 × 52 cm' }] },
    { label: 'Tables', icon: 'table-2', items: [{ label: 'Coffee table', icon: 'table-2', sublabel: '100 × 55 cm' }, { label: 'Side table', icon: 'table-2', sublabel: '45 × 45 cm' }] },
    { label: 'Lighting', icon: 'lamp-floor', items: [{ label: 'Floor lamp', icon: 'lamp-floor', sublabel: '165 cm' }] },
  ],
  distance: D,
}), -0.02, 1.62, -0.68);
catalog.addEventListener('open', e => say(`Opened ${e.item.label}`));
catalog.addEventListener('back', () => say('Back'));
catalog.addEventListener('select', e => say(`${e.item.label} selected`));

// Toolbar ornament under the window: the three densities side by side.
const ornament = new THREE.Group();
const ornW = dmm(60 * 3 + 150 + 8 * 4 + 28), ornH = dmm(60 + 20);
const plat = makePlatter(T, { w: ornW, h: ornH, r: ornH / 2, distance: D, thickness: 'regular' });
ornament.add(plat);
const tools = [
  { label: 'Place', icon: 'plus', variant: 'primary', shape: 'capsule', width: 150, density: 'firm' },
  { icon: 'rotate-3d', shape: 'circle', density: 'soft', name: 'Rotate (soft)' },
  { icon: 'lock', shape: 'circle', density: 'rigid', name: 'Lock (rigid)' },
  { icon: 'trash-2', shape: 'circle', disabled: true, name: 'Delete' },
];
let tx = -ornW / 2 + dmm(10);
const toolButtons = tools.map(o => {
  const b = new Button(T, { ...o, thickness: 'regular', distance: D });
  tx += b.w / 2 + dmm(4);
  b.position.set(tx, 0, plat.userData.front);
  tx += b.w / 2 + dmm(4);
  b.addEventListener('select', () => say(`${o.label ?? o.name}`));
  ornament.add(b);
  return b;
});
place(ornament, -0.02, 1.455, -0.66);

// Z-Slider: lamp brightness. Push away = brighter.
const slider = place(new ZSlider(T, { label: 'Lamp', icon: 'sun', value: 0.4, distance: D }), 0.215, 1.53, -0.6);
slider.rotateY(-0.45); // turned a little, so the push axis is visible on a flat screen
setLamp(0.4);
slider.addEventListener('change', e => setLamp(e.value));

// Dock: body-locked below your view.
const dock = new Dock(T, {
  apps: [
    { label: 'Planner', icon: 'house', color: 0x2f7cf6 },
    { label: 'Measure', icon: 'ruler', color: 0xe08a1e },
    { label: 'Scan', icon: 'scan', color: 0x23a26d },
    { label: 'Photos', icon: 'image', color: 0xd9455f },
    { label: 'Settings', icon: 'settings', color: 0x6b6f78 },
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
    room.visible = mode !== 'immersive-ar';
    await renderer.xr.setSession(session);
    session.addEventListener('end', () => { room.visible = true; });
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
  T, camera, panel: catalog, slider, dock, buttons: toolButtons, look,
  screenOf(obj) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  },
};
