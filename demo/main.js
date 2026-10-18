// Demo scene: every core component at real-world scale, usable with a mouse
// on desktop and with hands or controllers in a headset.
import * as THREE from 'three';
import tokenJson from '../tokens.json';
import {
  createTokens, flattenTokens, Button, ZSlider, PackagingPanel, PACKAGING_MODES, Dock, InputSystem, unlockAudio,
} from '../src/index.js';

const T = createTokens(tokenJson);
const EYE = 1.6; // m, standing eye height for the desktop camera

// Renderer, scene, camera ----------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.02, 50);
camera.position.set(0, EYE, 0);
camera.rotation.order = 'YXZ';
const look = { yaw: 0, pitch: -0.22 };

scene.add(new THREE.HemisphereLight(0xffffff, 0x404650, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(0.6, 2.5, 1.2);
scene.add(sun);

// A plain room, so the objects have something to sit in front of.
// Hidden in mixed reality, where the real room shows through.
const room = new THREE.Group();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x2a2d33 }));
floor.rotation.x = -Math.PI / 2;
room.add(floor);
const grid = new THREE.GridHelper(20, 20, 0x555a63, 0x3a3e45);
grid.position.y = 0.001;
room.add(grid);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 6), new THREE.MeshStandardMaterial({ color: 0xbfc3c9 }));
wall.position.set(0, 3, -2.2);
room.add(wall);
const desk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
desk.position.set(0, 0.74, -0.75);
room.add(desk);
scene.add(room);
scene.background = new THREE.Color(0x15171b);

// Components -----------------------------------------------------------------
const log = document.getElementById('log');
const say = text => { log.textContent = text; };
const facing = (obj, x, y, z) => { obj.position.set(x, y, z); obj.lookAt(0, EYE, 0); scene.add(obj); return obj; };

// Buttons: the three densities, plus a disabled one (always rigid).
const buttons = [
  ['Soft', { density: 'soft' }],
  ['Firm', { density: 'firm' }],
  ['Rigid', { density: 'rigid' }],
  ['Off', { disabled: true }],
].map(([label, o], i) => {
  const b = new Button(T, { label, ...o });
  b.addEventListener('select', () => say(`Pressed ${label}`));
  return facing(b, -0.22, 1.62 - i * 0.055, -0.55);
});

const panel = facing(new PackagingPanel(T, {
  title: 'Settings',
  items: [
    { label: 'Sound', items: [
      { label: 'Volume' }, { label: 'Spatial audio' },
      { label: 'Output', items: [{ label: 'Headset' }, { label: 'Speaker', items: [{ label: 'Left' }, { label: 'Right' }] }] },
    ] },
    { label: 'Display', items: [{ label: 'Brightness' }, { label: 'Passthrough' }] },
    { label: 'Hands', items: [{ label: 'Poke' }, { label: 'Pinch' }] },
    { label: 'About' },
  ],
}), 0, 1.56, -0.62);
panel.addEventListener('open', e => say(`Opened ${e.item.label} (level ${e.level})`));
panel.addEventListener('back', e => say(`Back to level ${e.level}`));
panel.addEventListener('select', e => say(`Selected ${e.item.label}`));

const slider = facing(new ZSlider(T, { label: 'Volume', value: 0.4 }), 0.22, 1.5, -0.52);
slider.rotateY(-0.55); // turned a little, so the push axis is visible on a flat screen
slider.addEventListener('detent', e => say(`Z-Slider detent ${e.index}`));

const dock = new Dock(T, {
  apps: [
    { label: 'Mail', color: 0x2f6fb0 }, { label: 'Web', color: 0x2f8f6a }, { label: 'Photos', color: 0xb05a2f },
    { label: 'Music', color: 0x9a3fa0 }, { label: 'Notes', color: 0x8f7d2f },
  ],
});
dock.addEventListener('select', e => say(`Opened ${e.app.label} from the dock`));
scene.add(dock);

const input = new InputSystem({ T, renderer, camera, scene });

// HUD --------------------------------------------------------------------------
const modes = document.getElementById('modes');
for (const m of PACKAGING_MODES) {
  const b = document.createElement('button');
  b.textContent = m;
  b.setAttribute('aria-pressed', String(m === panel.mode));
  b.onclick = () => {
    panel.setMode(m);
    for (const x of modes.children) x.setAttribute('aria-pressed', String(x === b));
  };
  modes.append(b);
}
const table = document.getElementById('tokens');
for (const [name, t] of flattenTokens(tokenJson)) {
  const row = table.insertRow();
  if (t.provisional) row.className = 'p';
  row.innerHTML = `<td class="e" title="evidence">${t.evidence}</td><td>${t.provisional ? '~ ' : ''}${name}</td><td class="v">${typeof t.raw === 'object' ? JSON.stringify(t.raw) : t.raw}${t.unit ?? ''}</td>`;
}

// Desktop: drag empty space or use arrow keys to turn.
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
  if (!mode) { xrButton.textContent = 'No headset found: open this page in a headset browser'; return; }
  xrButton.disabled = false;
  xrButton.textContent = mode === 'immersive-ar' ? 'Enter mixed reality' : 'Enter VR';
  xrButton.onclick = async () => {
    unlockAudio();
    const session = await xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
    room.visible = mode !== 'immersive-ar';
    scene.background = mode === 'immersive-ar' ? null : scene.background;
    await renderer.xr.setSession(session);
    session.addEventListener('end', () => { room.visible = true; scene.background = new THREE.Color(0x15171b); });
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
  buttons.forEach(b => b.update(dt));
  slider.update(dt);
  panel.update(dt);
  dock.update(dt, camera, input.handPoints);
  renderer.render(scene, camera);
});

// Hooks for automated screenshots and checks (scripts/screenshot.mjs).
window.contour = {
  T, camera, panel, slider, dock, buttons, look,
  screenOf(obj) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  },
};
