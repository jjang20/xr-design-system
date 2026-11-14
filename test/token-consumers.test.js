import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens, Button, ZSlider, PackagingPanel, Dock, Toolbar, InputSystem, DEFAULTS } from '../src/index.js';
import { DockIcon } from '../src/components/DockIcon.js';

const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url))));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const dt = 1 / 60;

test('all component consumers accept v0.2, with finite geometry at room distance', () => {
  const distance = 3;
  const components = [
    new Button(T, { distance }),
    new ZSlider(T, { distance }),
    new PackagingPanel(T, { distance, items: [{ label: 'Sofas' }] }),
    new Dock(T, { distance, apps: [{ label: 'Home', icon: 'house' }] }),
    new Toolbar(T, { distance, tools: [{ icon: 'plus' }] }),
  ];
  for (const c of components) c.traverse(o => {
    assert.ok(o.position.toArray().every(Number.isFinite), `${c.constructor.name} position`);
    const positions = o.geometry?.attributes.position?.array;
    if (positions) assert.ok(positions.every(Number.isFinite), `${c.constructor.name} geometry`);
  });
  near(components[0].w, 0.1425);
  near(components[1].side, 0.1425);
  near(components[3].radius, 0.2375); // recovered 100 dmm, scaled with f(3)
  near(components[3].maxScale, 1.2);
  near(components[0].hoverBand.enter, 0.1); // physical reach, not scaled
  near(new Button(T, { distance, width: 100 }).w, 0.2375); // legacy dmm option
});

test('direct input uses the absolute enter and exit distances', () => {
  const group = () => new THREE.Group();
  const input = new InputSystem({ T, renderer: {
    domElement: { addEventListener() {} },
    xr: { getController: group, getControllerGrip: group, getHand: group },
  }, camera: new THREE.PerspectiveCamera(), scene: new THREE.Scene() });
  const band = input.xr[0].near;
  assert.equal(band.update(0.36), false);
  assert.equal(band.update(0.34), true);
  assert.equal(band.update(0.39), true);
  assert.equal(band.update(0.41), false);
});

test('a small button accepts direct touch in the 22 mm floor without growing its face', () => {
  const b = new Button(T, { distance: 0.1 });
  near(b.w, 0.006);
  const poke = z => { b.feed({ kind: 'poke', id: 'finger', point: new THREE.Vector3(0.01, 0, z) }); b.update(dt); };
  poke(b.t + 0.001);
  poke(b.t - 0.001);
  assert.equal(b.press.pressed, true);
  near(b.w, 0.006);
});

test('a small slider accepts a push within the fingertip floor', () => {
  const s = new ZSlider(T, { distance: 0.1, value: 1 });
  const old = s.value;
  s.feed({ kind: 'poke', id: 'finger', point: new THREE.Vector3(0.01, 0, s.frontZ - 0.002) });
  s.update(dt);
  assert.ok(s.value < old); // pushing toward the base now lowers the value
  near(s.side, 0.006);
});

test('a small Dock object keeps a fingertip-sized direct hit volume', () => {
  const icon = new DockIcon(T, { label: 'Home', icon: 'house' }, 0.1);
  const poke = r => {
    icon.feed({ kind: 'poke', id: 'finger', point: icon.centre.clone().add(new THREE.Vector3(0, 0, r)) });
    icon.sense(); icon.update(dt);
  };
  poke(0.012);
  poke(0.01);
  assert.equal(icon.press.pressed, true);
  assert.ok(icon.rb < 0.011, 'visual bubble remains the original size');
});

test('room-distance row and header text use the same sizing as their containers', () => {
  const distance = 3, f = T.effectiveDistance(distance);
  const row = new Button(T, { distance, layout: 'row', label: 'Chair', sublabel: 'Oak' });
  near(row.label.fontSize, DEFAULTS.type.headline.size / 1000 * f);
  const sub = row.face.children.find(o => o.text === 'Oak');
  near(sub.fontSize, DEFAULTS.type.footnote.size / 1000 * f);
  const panel = new PackagingPanel(T, { distance, title: 'Catalog', subtitle: 'Furniture', items: [] });
  const title = panel.levels[0].group.children.find(o => o.text === 'Catalog');
  near(title.fontSize, DEFAULTS.type.title.size / 1000 * f);
});

const inputFor = scene => {
  const group = () => new THREE.Group();
  return new InputSystem({ T, renderer: { domElement: { addEventListener() {} },
    xr: { getController: group, getControllerGrip: group, getHand: group } },
  camera: new THREE.PerspectiveCamera(), scene });
};

test('one direct touch selects one action where small Toolbar hit areas overlap', () => {
  const bar = new Toolbar(T, { distance: 0.1, tools: [{ label: 'A' }, { label: 'B' }] });
  const scene = new THREE.Scene(); scene.add(bar); scene.updateMatrixWorld(true);
  const input = inputFor(scene), selected = [];
  bar.addEventListener('select', e => selected.push(e.index));
  // Outside the tiny visible faces, the 22 mm floor lies on the bar's
  // actual surface at 8 mm, not the hidden 12 mm hit-mesh front.
  for (const z of [0.013, 0.007, 0.016]) {
    // Exercise the actual direct-input dispatch path, with a tracked fingertip.
    const src = input.xr[0]; src.connected = true; src.grip.visible = true;
    src.grip.position.set(0, 0, z); scene.updateMatrixWorld(true);
    input.renderer.xr.isPresenting = true;
    input.update(); bar.update(dt);
  }
  assert.deepEqual(selected, [0]);
});

test('Dock hover and release thresholds stay in world metres under magnification', () => {
  for (const scale of [1, 1.5]) {
    const icon = new DockIcon(T, { label: 'Home', icon: 'house' }, 0.6);
    icon.scale.setScalar(scale); icon.updateMatrixWorld(true);
    const probe = gap => {
      icon.feed({ kind: 'poke', id: 'finger', point: icon.centre.clone().add(new THREE.Vector3(0, 0, icon.rb + gap / scale)) });
      icon.sense(); icon.update(dt);
    };
    probe(0.12); assert.equal(icon.hovered, false, `120 mm at scale ${scale}`);
    probe(0.09); assert.equal(icon.hovered, true);
    probe(0.13); assert.equal(icon.hovered, true);
    probe(0.15); assert.equal(icon.hovered, false);
    probe(0.001); probe(-0.001); assert.equal(icon.press.pressed, true);
    probe(0.0015); assert.equal(icon.press.pressed, true); // 2.5 mm retreat
    probe(0.0022); assert.equal(icon.press.pressed, false); // 3.2 mm retreat
  }
});

test('overlapping direct targets keep the pressed button and allow two independent fingers', () => {
  const bar = new Toolbar(T, { distance: 0.1, tools: [{ label: 'A' }, { label: 'B' }] });
  const scene = new THREE.Scene(); scene.add(bar); scene.updateMatrixWorld(true);
  const input = inputFor(scene), selected = [];
  bar.addEventListener('select', e => selected.push(e.index));
  const x = bar.buttons.map(b => b.position.x);
  const step = fingers => {
    scene.updateMatrixWorld(true);
    for (const [id, px, z] of fingers) input.pokeStep({ id }, new THREE.Vector3(px, 0, z), input.collect().items);
    bar.update(dt);
  };
  step([['left', x[0], 0.013]]); step([['left', x[0], 0.007]]);
  step([['left', x[1], 0.007]]); // same finger moves toward the neighbouring face
  assert.equal(bar.buttons[0].press.pressed, true);
  assert.equal(bar.buttons[1].press.pressed, false);
  step([['left', x[1], 0.016]]);
  assert.deepEqual(selected, [0]);
  selected.length = 0;
  step([]);
  step([['left', x[0], 0.013], ['right', x[1], 0.013]]);
  step([['left', x[0], 0.007], ['right', x[1], 0.007]]);
  assert.ok(bar.buttons.every(b => b.press.pressed));
  step([['left', x[0], 0.016], ['right', x[1], 0.016]]);
  assert.deepEqual(selected, [0, 1]);
});

test('scaled buttons keep a physical touch floor, hover band and release retreat', () => {
  const b = new Button(T, { distance: 0.1 });
  b.scale.setScalar(0.5); b.updateMatrixWorld(true);
  near(b.touchW * 0.5, 0.022);
  near(b.touchH * 0.5, 0.022);
  const poke = gap => {
    b.feed({ kind: 'poke', id: 'finger', point: new THREE.Vector3(0.02, 0, b.t + gap / 0.5) });
    b.update(dt);
  };
  poke(0.12); assert.equal(b.hovered, false);
  poke(0.09); assert.equal(b.hovered, true);
  poke(0.001); poke(-0.001); assert.equal(b.press.pressed, true);
  poke(0.0015); assert.equal(b.press.pressed, true);
  poke(0.0022); assert.equal(b.press.pressed, false);
});

test('direct-input routing preserves lateral hover enter and exit distances', () => {
  const b = new Button(T), scene = new THREE.Scene(); scene.add(b);
  const input = inputFor(scene), src = input.xr[0];
  src.connected = true; src.grip.visible = true; input.renderer.xr.isPresenting = true;
  const approach = gap => {
    src.grip.position.set(b.w / 2 + gap, 0, b.t + 0.001);
    scene.updateMatrixWorld(true); input.update(); b.update(dt);
  };
  approach(0.09); assert.equal(b.hovered, true);
  approach(0.13); assert.equal(b.hovered, true);
  approach(0.15); assert.equal(b.hovered, false);
  assert.equal(b.press.pressed, false);
});

test('direct-input routing preserves disabled press/release feedback without selection', () => {
  const b = new Button(T, { disabled: true }), scene = new THREE.Scene(); scene.add(b);
  const input = inputFor(scene), events = [];
  for (const name of ['press', 'release', 'select']) b.addEventListener(name, () => events.push(name));
  for (const gap of [0.001, -0.001, 0.004]) {
    input.pokeStep({ id: 'finger' }, new THREE.Vector3(0, 0, b.t + gap), input.collect().items);
    b.update(dt);
  }
  assert.deepEqual(events, ['press', 'release']);
});

test('a far press-eligible finger does not hide a closer lateral hover', () => {
  const b = new Button(T), scene = new THREE.Scene(); scene.add(b);
  const input = inputFor(scene), items = input.collect().items;
  input.pokeStep({ id: 'near' }, new THREE.Vector3(b.w / 2 + 0.09, 0, b.t + 0.001), items);
  input.pokeStep({ id: 'far' }, new THREE.Vector3(0, 0, b.t + 0.2), items);
  b.update(dt);
  assert.equal(b.hovered, true);
  assert.equal(b.press.pressed, false);
});
