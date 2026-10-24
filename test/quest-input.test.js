import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens, Button, ZSlider, InputSystem } from '../src/index.js';

const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url))));
const dt = 1 / 60;
function rig(...objects) {
  const scene = new THREE.Scene(); scene.add(...objects);
  const group = () => new THREE.Group();
  const input = new InputSystem({ T, scene, camera: new THREE.PerspectiveCamera(), renderer: {
    domElement: { addEventListener() {} }, xr: { isPresenting: true,
      getController: group, getControllerGrip: group, getHand: group },
  } });
  const source = input.xr[0]; source.connected = true; source.grip.visible = false;
  const tip = new THREE.Group(); tip.jointRadius = 0.008;
  source.hand.joints = { 'index-finger-tip': tip }; source.hand.add(tip);
  return { input, source, tip, step(x, y, z) {
    tip.position.set(x, y, z); scene.updateMatrixWorld(true);
    input.update(); objects.forEach(o => o.update(dt));
  } };
}

test('Quest: one fingertip hovers only the nearest adjacent control', () => {
  const a = new Button(T), b = new Button(T); b.position.x = 0.045;
  const hand = rig(a, b); hand.step(0, 0, a.t + 0.05);
  assert.equal(a.hovered, true);
  assert.equal(b.hovered, false, 'the same fingertip must not inflate its neighbour');
});

test('Quest: fingertip contact presses before the tracked joint passes through the face', () => {
  const b = new Button(T), hand = rig(b);
  hand.step(0, 0, b.t + 0.02);
  hand.step(0, 0, b.t + hand.tip.jointRadius - 0.0001);
  assert.equal(b.press.pressed, true, 'the fingertip surface, not its joint centre, touches the face');
  assert.ok(hand.tip.position.z > b.t, 'joint centre remains outside the component');
});

test('Quest: an inflated row presses at its visible crown', () => {
  const b = new Button(T, { variant: 'plain', hoverStyle: 'emboss', thickness: 'thin' });
  const feed = z => { b.feed({ kind: 'poke', id: 'finger', point: new THREE.Vector3(0, 0, z) }); b.update(dt); };
  for (let i = 0; i < 90; i++) feed(0.03);
  const crown = b.bulge;
  assert.ok(crown > b.t);
  feed(crown - 0.0001);
  assert.equal(b.press.pressed, true, 'inflated glass must not be only a visual surface');
});

test('Quest: extending the Z-Slider away from its base increases the percentage', () => {
  const s = new ZSlider(T, { value: 0.5 }); s.update(dt);
  const start = s.frontZ + 0.001;
  const feed = z => { s.feed({ kind: 'poke', id: 'hand', pinch: true, point: new THREE.Vector3(0, 0, z) }); s.update(dt); };
  feed(start); feed(start); feed(start + 0.01);
  assert.ok(s.value > 0.5, `outward pull produced ${s.value}`);
  s.setValue(0); s.update(dt); assert.equal(s.knobZ, 0);
  s.setValue(1); s.update(dt); assert.equal(s.knobZ, s.travel);
});

test('Quest: two hands can hover separate controls without one finger lighting both', () => {
  const a = new Button(T), b = new Button(T); b.position.x = 0.045;
  const { input } = rig(a, b), items = input.collect().items;
  const step = fingers => {
    for (const [id, x] of fingers) input.pokeStep({ id }, new THREE.Vector3(x, 0, a.t + 0.05), items, 0.008);
    a.update(dt); b.update(dt);
  };
  step([['left', 0], ['right', b.position.x]]);
  assert.ok(a.hovered && b.hovered);
  step([['left', 0]]);
  assert.equal(a.hovered, true); assert.equal(b.hovered, false);
});

test('Quest: physical fingertip radius and release distance survive component scale', () => {
  for (const scale of [0.5, 1.5]) {
    const b = new Button(T); b.scale.setScalar(scale);
    const hand = rig(b), contact = b.t * scale + hand.tip.jointRadius;
    hand.step(0, 0, contact + 0.01);
    hand.step(0, 0, contact - 0.001);
    assert.equal(b.press.pressed, true);
    hand.step(0, 0, contact + 0.0015);
    assert.equal(b.press.pressed, true, '2.5 mm retreat retains press');
    hand.step(0, 0, contact + 0.0022);
    assert.equal(b.press.pressed, false, '3.2 mm retreat releases');
  }
});

test('Quest: replacing a hovering hand with one behind the face does not fabricate contact', () => {
  const b = new Button(T);
  b.feed({ kind: 'poke', id: 'left', point: new THREE.Vector3(0, 0, b.t + 0.01) }); b.update(dt);
  b.feed({ kind: 'poke', id: 'right', point: new THREE.Vector3(0, 0, b.t - 0.01) }); b.update(dt);
  assert.equal(b.press.pressed, false);
});

test('Quest: slider capture survives a second hand and tracking loss leaves the value still', () => {
  const s = new ZSlider(T, { value: 0.5 }); s.update(dt);
  const initial = s.frontZ + 0.001;
  const probe = (id, z) => ({ kind: 'poke', id, pinch: true, point: new THREE.Vector3(0, 0, z) });
  for (let i = 0; i < 2; i++) { s.feed(probe('owner', initial)); s.update(dt); }
  s.feed(probe('owner', initial + 0.01)); s.feed(probe('other', initial - 0.01)); s.update(dt);
  const value = s.value;
  assert.ok(value > 0.5);
  s.feed(probe('other', initial - 0.01)); s.update(dt);
  assert.equal(s.value, value);
  assert.equal(s.grab, null);
});

test('Quest: hover chooses between a slider and an adjacent button', () => {
  const s = new ZSlider(T, { value: 0.5 }), b = new Button(T); b.position.x = 0.045;
  s.update(dt);
  const hand = rig(s, b); hand.step(0, 0, s.frontZ + 0.02);
  assert.equal(s.hoverBand.on, true);
  assert.equal(b.hovered, false);
});
