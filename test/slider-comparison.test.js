import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens } from '../src/tokens.js';
import { SliderComparison } from '../demo/comparison/SliderComparison.js';
import { InputSystem } from '../src/core/InputSystem.js';

const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url))));

test('comparison starts both independent controls at 40% with matching visible results', () => {
  const view = new SliderComparison(T);
  view.update(1 / 60);
  for (const key of ['x', 'z']) {
    assert.equal(view.controls[key].value, 0.4);
    assert.equal(view.results[key].number.text, '40%');
    assert.deepEqual(view.results[key].sample.material.color.toArray(), [0.4, 0.4, 0.4]);
    assert.equal(view.results[key].sample.material.transparent, false);
  }
  view.dispose();
});

test('X hover leaves values alone; a captured ray changes only X and retains it after release/loss', () => {
  const view = new SliderComparison(T), x = view.controls.x;
  const changes = [];
  x.addEventListener('change', event => changes.push(event.value));
  const frame = (position, pressed, captured = pressed, id = 'ray') => {
    x.feed({ kind: 'ray', id, point: new THREE.Vector3(position, 0, x.frontZ), pressed, captured });
    view.update(1 / 60);
  };
  frame(0.04, false);
  assert.equal(x.value, 0.4);
  assert.deepEqual(changes, []);
  frame(0.04, true);
  assert.equal(x.value, 0.75);
  assert.equal(view.results.x.number.text, '75%');
  assert.deepEqual(view.results.x.sample.material.color.toArray(), [0.75, 0.75, 0.75]);
  assert.equal(view.controls.z.value, 0.4);
  // InputSystem's release frame still carries captured:true.
  frame(-0.08, false, true);
  assert.equal(x.value, 0.75);
  frame(0, true, true, 'other');
  assert.equal(x.value, 0.5);
  view.update(1 / 60); // no source: release ownership, keep the last value
  frame(-0.08, true);
  assert.equal(x.value, 0);
  assert.deepEqual(changes, [0.75, 0.5, 0]);
  view.dispose();
});

test('X requires front contact, keeps one contact owner, clamps a drag and releases on lift', () => {
  const view = new SliderComparison(T), x = view.controls.x;
  const frame = (px, pz, id = 'finger', extra = []) => {
    for (const probe of [{ kind: 'poke', id, point: new THREE.Vector3(px, 0, pz), radius: 0.008 }, ...extra]) x.feed(probe);
    view.update(1 / 60);
  };
  frame(0.04, 0.04); // proximity is not contact
  assert.equal(x.value, 0.4);
  frame(0.04, 0.010); // radius reaches frontZ=.003
  assert.equal(x.value, 0.75);
  frame(0.09, 0.010, 'finger', [{ kind: 'ray', id: 'other', point: new THREE.Vector3(-0.08, 0, 0), pressed: true, captured: true }]);
  assert.equal(x.value, 1);
  frame(-0.08, 0.04); // retreat does not update the value on release
  assert.equal(x.value, 1);
  frame(-0.08, 0.010);
  assert.equal(x.value, 0);
  view.update(1 / 60); // tracking loss
  frame(0.04, -0.08); // arriving from well behind the surface is not a touch
  assert.equal(x.value, 0);
  view.dispose();
});

test('continuous values drive equal samples even when rounded labels conceal a difference', () => {
  const view = new SliderComparison(T), { x, z } = view.controls;
  const events = [];
  x.addEventListener('change', e => events.push(e.value));
  x.setValue(0.333);
  z.setValue(0.333);
  assert.equal(view.results.x.number.text, '40%', 'result is flushed on update');
  view.update(1 / 60);
  assert.equal(view.results.x.number.text, '33%');
  assert.deepEqual(view.results.x.sample.material.color.toArray(), view.results.z.sample.material.color.toArray());
  z.setValue(0.334);
  view.update(1 / 60);
  assert.equal(view.results.x.number.text, view.results.z.number.text);
  assert.notEqual(view.results.x.sample.material.color.r, view.results.z.sample.material.color.r);
  assert.deepEqual(events, [0.333], 'result updates never reinject a change');
  x.setValue(-1); z.setValue(2);
  view.update(1 / 60);
  assert.equal(view.results.x.number.text, '0%');
  assert.equal(view.results.z.number.text, '100%');
  assert.deepEqual(view.results.x.sample.material.color.toArray(), [0, 0, 0]);
  assert.deepEqual(view.results.z.sample.material.color.toArray(), [1, 1, 1]);
  const detents = [], changes = [];
  z.addEventListener('detent', e => detents.push(e.index));
  z.addEventListener('change', e => changes.push(e.value));
  x.setValue(0.4, { silent: true }); z.setValue(0.4, { silent: true });
  view.update(1 / 60);
  assert.equal(detents.length, 1, 'existing silent detent remains distinct from change');
  assert.deepEqual(changes, []);
  assert.equal(view.results.z.number.text, '40%');
  view.dispose();
});

function inputRig(view) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.add(view); scene.updateMatrixWorld(true);
  const renderer = {
    domElement: { addEventListener() {} },
    xr: { getController: () => new THREE.Group(), getControllerGrip: () => new THREE.Group(), getHand: () => new THREE.Group() },
  };
  return { scene, input: new InputSystem({ T, scene, camera, renderer }) };
}

test('actual InputSystem ray routing uses X hit geometry, rejects hover and retains values on parallel rays', () => {
  const view = new SliderComparison(T), x = view.controls.x;
  const { input } = inputRig(view), pointer = { id: 'controller', state: {} };
  const aim = (px, pressed) => {
    const origin = x.localToWorld(new THREE.Vector3(px, 0, 0.4));
    input.rayStep(pointer, new THREE.Ray(origin, new THREE.Vector3(0, 0, -1)), pressed, 0, input.collect().items);
    view.update(1 / 60);
  };
  aim(0.04, false);
  assert.equal(x.value, 0.4);
  aim(0.04, true);
  assert.ok(Math.abs(x.value - 0.75) < 1e-12);
  input.rayStep(pointer, new THREE.Ray(new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(1, 0, 0)), true, 0, input.collect().items);
  view.update(1 / 60);
  assert.ok(Math.abs(x.value - 0.75) < 1e-12);
  aim(-0.07, false);
  assert.equal(view.results.x.number.text, '75%');
  view.dispose();
  assert.equal(input.collect().items.length, 0, 'disposed comparison leaves no input targets');
  view.dispose(); // idempotent cleanup
});

test('actual InputSystem near routing requires a moving front contact, including at scaled transforms', () => {
  const view = new SliderComparison(T);
  view.scale.setScalar(0.5);
  view.rotation.y = 0.4;
  const { input } = inputRig(view), x = view.controls.x;
  const source = { id: 'finger', selecting: false };
  const tip = (px, pz, radius = 0.004) => {
    input.pokeStep(source, x.localToWorld(new THREE.Vector3(px, 0, pz)), input.collect().items, radius);
    view.update(1 / 60);
  };
  tip(0, 0.03);
  tip(0, 0.03, 0.016); // radius growth around stationary point is not acquisition
  assert.equal(x.value, 0.4);
  tip(0.04, 0.04);
  tip(0.04, 0.010);
  assert.ok(Math.abs(x.value - 0.75) < 1e-12);
  tip(-0.09, 0.010);
  assert.equal(x.value, 0);
  tip(0.06, 0.04);
  assert.equal(x.value, 0);
  view.dispose();
});

test('Z public near push and semantic pinch keep their existing value and loss behavior', () => {
  const view = new SliderComparison(T), z = view.controls.z;
  const poke = (depth, pinch = false) => {
    z.feed({ kind: 'poke', id: 'semantic', point: new THREE.Vector3(0, 0, depth), radius: 0, pinch });
    view.update(1 / 60);
  };
  poke(z.frontZ + 0.001); // hover primes the existing band
  poke(z.frontZ - 0.001);
  assert.ok(z.value < 0.4);
  const at = z.frontZ;
  poke(at, true);
  poke(at + 0.02, true);
  const held = z.value;
  assert.ok(held > 0.4);
  view.update(1 / 60);
  assert.equal(z.value, held);
  assert.equal(view.controls.x.value, 0.4);
  assert.equal(view.results.z.number.text, z.valueLabel.text);
  view.dispose();
});

test('a lost X ray must release before reacquiring, and coplanar drag cannot invent a new value', () => {
  const view = new SliderComparison(T), x = view.controls.x;
  const press = (pressed, ray) => {
    x.feed({ kind: 'ray', id: 'same', point: new THREE.Vector3(0.04, 0, x.frontZ), captured: true, pressed, ray });
    view.update(1 / 60);
  };
  press(true);
  assert.equal(x.value, 0.75);
  press(true, new THREE.Ray(new THREE.Vector3(-0.08, 0, x.frontZ), new THREE.Vector3(1, 0, 0)));
  assert.equal(x.value, 0.75, 'coplanar ray has no unique intersection');
  view.update(1 / 60); // source disappeared while held
  press(true, new THREE.Ray(new THREE.Vector3(-0.08, 0, 0.3), new THREE.Vector3(0, 0, -1)));
  assert.equal(x.value, 0.75, 'held source after loss is not a new press');
  press(false);
  press(true, new THREE.Ray(new THREE.Vector3(-0.08, 0, 0.3), new THREE.Vector3(0, 0, -1)));
  assert.equal(x.value, 0);
  view.dispose();
});
