import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens, Button, ZSlider, PackagingPanel, Dock, Toolbar, InputSystem } from '../src/index.js';
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
  const s = new ZSlider(T, { distance: 0.1, value: 0 });
  const old = s.value;
  s.feed({ kind: 'poke', id: 'finger', point: new THREE.Vector3(0.01, 0, s.frontZ - 0.002) });
  s.update(dt);
  assert.ok(s.value > old);
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
