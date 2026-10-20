// Bench: one component at a fixed framing over a real room, for scored
// rounds against the visionOS bar (docs/catalog-spec.md).
// Query: ?part=dock|slider (the Blender lookdev framings) &state=hover
//        ?rot=<backdrop yaw> &view=angle &fov=<deg> &hover=<lens|emboss> &absorb=&blur= (lab overrides)
import * as THREE from 'three';
import tokenJson from '../tokens.json';
import { createTokens, PackagingPanel, InputSystem, Dock, ZSlider } from '../src/index.js';
import { loadBackdrop } from './backdrop.js';
import { DEFAULTS } from '../src/core/defaults.js';
import { catalogItems } from './catalog-data.js';

const q = new URLSearchParams(location.search);
if (q.has('absorb')) DEFAULTS.look.glass.absorb = Number(q.get('absorb'));
if (q.has('hover')) DEFAULTS.look.hoverStyle = q.get('hover');
if (q.has('blur')) DEFAULTS.look.glass.blur = Number(q.get('blur'));
// ?set=<json>: deep-merged into DEFAULTS before anything is built (variant
// renders: node scripts/match.mjs slider --set '{"look":{...}}' --out name).
if (q.has('set')) (function merge(a, b) { for (const [k, v] of Object.entries(b)) v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] ??= {}, v) : (a[k] = v); })(DEFAULTS, JSON.parse(q.get('set')));
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

// ?part=: the Dock or Z-Slider, framed like lookdev/dock_slider.py renders
// them, so live and path-traced frames can be laid side by side.
const part = q.get('part');
let panel, dock, slider;
if (part === 'dock') {
  // Blender: shelf on an arc of R = 0.5 m, eye 0.28 m above and 0.48 m back.
  const R = 0.5, up = 0.28, back = 0.48;
  dock = new Dock(T, {
    distance: Math.hypot(up, back), eccentricity: -Math.atan2(up, back),
    apps: [
      { label: 'Planner', icon: 'house', color: 0x2f7cf6, running: true },
      { label: 'Measure', icon: 'ruler', color: 0xe08a1e },
      { label: 'Scan', icon: 'scan', color: 0x23a26d },
      { label: 'Photos', icon: 'image', color: 0xd9455f },
      { label: 'Settings', icon: 'settings', color: 0x6b6f78 },
    ],
  });
  scene.add(dock);
  camera.fov = 24;
  camera.lookAt(0, EYE - up, -back);
} else if (part === 'slider') {
  // Blender: the slider faces the camera's side; camera 0.6 m away, 0.75 rad
  // round to the right and 5 cm up, lens 11°.
  slider = new ZSlider(T, { label: 'Lamp', icon: 'sun', value: 0.4, distance: 0.6 });
  slider.position.set(0, EYE, -0.6);
  scene.add(slider);
  const a = 0.75;
  camera.position.set(Math.sin(a) * 0.6, EYE + 0.05, -0.6 + Math.cos(a) * 0.6);
  camera.fov = 11;
  camera.lookAt(slider.position);
} else {
  panel = new PackagingPanel(T, { title: 'Catalog', subtitle: 'Living room · 4 categories', items: catalogItems, distance: D });
  panel.position.set(Number(q.get('px') ?? 0), EYE, -D);
  panel.lookAt(0, EYE, 0);
  scene.add(panel);
}
camera.updateProjectionMatrix();

const input = new InputSystem({ T, renderer, camera, scene });
// ?state=hover on the Dock: a hand point at Scan, so it magnifies.
const hands = [];
const timer = new THREE.Timer();
const step = dt => {
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  input.update();
  panel?.update(dt);
  slider?.update(dt);
  dock?.update(dt, camera, hands);
};
// ?manual: time only moves when the recorder calls tick(), so motion can be
// captured frame by frame on a slow software renderer.
if (q.has('manual')) renderer.setAnimationLoop(() => renderer.render(scene, camera));
else renderer.setAnimationLoop(time => {
  timer.update(time);
  step(Math.min(timer.getDelta(), 0.05));
  renderer.render(scene, camera);
});

// Eval passes (scripts/match.mjs --eval): a part drawn as a flat mask on
// black, or the frame with one feature switched off, so a script can
// measure shape, glow, reflection and refraction from real renders.
function parts() {
  const P = {};
  const add = (k, o) => { if (o) (P[k] ??= []).push(o); };
  if (dock) {
    add('shelf', dock.base);
    dock.icons.forEach((b, i) => { add('icon' + i, b.body); add('glyph', b.icon); });
    dock.mirrors.forEach(m => add('mirror', m));
    dock.dots.forEach(d => add('dot', d));
  }
  if (slider) {
    add('knob', slider.knobSkin && slider.knob.children.find(c => c.material === slider.knobSkin));
    add('stem', slider.stem);
    slider.joints?.forEach(j => add('joint', j));
    add('plate', slider.plate);
    add('glyph', slider.knob.children.find(c => c.material?.map));
    slider.bubble.children.filter(c => typeof c.sync === 'function').forEach(t => add('label', t));
    add('bubble', slider.bubble);
    add('labelglass', slider.labelGlass);
  }
  scene.traverse(o => { if (o.userData.glow) add('glow', o); });
  return P;
}
const undo = [];
function restore() { while (undo.length) undo.pop()(); }
function set(o, k, v) { const old = o[k]; undo.push(() => { o[k] = old; }); o[k] = v; }
const drawn = m => m.isMesh || m.isSprite;
function eachMesh(objs, f) { for (const o of objs ?? []) o.traverse(m => { if (drawn(m)) f(m); }); }
function eachUniform(name, v) {
  scene.traverse(m => { const u = m.material?.uniforms?.[name]; if (u) set(u, 'value', typeof v === 'function' ? v(u.value) : v); });
}
function pass(name) {
  restore();
  const P = parts();
  if (name.startsWith('mask:')) {
    // mask:a,b=0.5 draws parts a (white) and b (grey 0.5), nothing else.
    const want = Object.fromEntries(name.slice(5).split(',').map(s => { const [k, g] = s.split('='); return [k, Number(g ?? 1)]; }));
    set(scene, 'background', new THREE.Color(0));
    scene.traverse(m => { if (drawn(m)) set(m, 'visible', false); });
    for (const [k, g] of Object.entries(want)) eachMesh(P[k], m => {
      set(m, 'visible', true);
      set(m, 'onBeforeRender', () => {});
      const map = m.material.map ?? null;
      set(m, 'material', new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(g, g, g, THREE.SRGBColorSpace), map, alphaTest: map ? 0.5 : 0, toneMapped: false, side: THREE.DoubleSide }));
    });
  } else if (name === 'nolabel') eachMesh(P.label, m => set(m, 'visible', false));
  else if (name === 'nomirror') eachMesh(P.mirror, m => set(m, 'visible', false));
  else if (name === 'noglyph') { eachMesh(P.glyph, m => set(m, 'visible', false)); eachUniform('uGlyphOn', 0); }
  else if (name === 'noglow') { eachUniform('uEmissive', new THREE.Color(0)); eachMesh(P.glow, m => set(m, 'visible', false)); }
  else if (name.startsWith('hide:')) for (const k of name.slice(5).split(',')) eachMesh(P[k], m => set(m, 'visible', false));
  // The room swapped for flat grey: what changes inside a piece of glass is
  // the room seen through it.
  // Globes see the room as the backdrop's light (uHasRoom): here they fall
  // back to the frame behind them, so they see the grey too.
  else if (name === 'flatroom') { set(scene, 'background', new THREE.Color().setRGB(0.5, 0.5, 0.5, THREE.SRGBColorSpace)); eachUniform('uHasRoom', 0); }
  else if (name === 'norefract') eachUniform('uDistort', 0);
  else if (name === 'physical-refract') eachUniform('uDistort', 1);
  else if (name === 'noreflect') eachUniform('uReflect', 0);
  else if (name === 'physical-reflect') eachUniform('uReflect', 1);
  else if (name !== 'beauty') throw new Error('unknown pass ' + name);
  return capture();
}
// The frame as a PNG data URL, read back right after drawing (a page
// screenshot on a software renderer sometimes catches a blank buffer).
function capture() {
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

window.contour = {
  panel, dock, slider, camera, hands, scene, pass, renderer,
  // Screen points (px) of local points of an object, for eval scripts.
  screenPoints(obj, pts) {
    obj.updateMatrixWorld();
    return pts.map(p => { const v = new THREE.Vector3(...p).applyMatrix4(obj.matrixWorld).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
  },
  tick(frames = 1, dt = 1 / 60) { for (let i = 0; i < frames; i++) step(dt); renderer.render(scene, camera); },
  screenOf(obj) {
    const v = obj.getWorldPosition(new THREE.Vector3()).project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  },
};
window.ready = true;
