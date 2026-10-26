import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens, Dock, InputSystem } from '../src/index.js';

const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url))));
const dt = 1 / 60;
function rig() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  camera.position.y = 1.6; scene.add(camera);
  const dock = new Dock(T, { distance: .4, apps: ['house','ruler','scan','image','settings','notes','clock'].map(icon => ({ icon, label: icon })) });
  scene.add(dock);
  for (let n = 0; n < 120; n++) { scene.updateMatrixWorld(true); dock.update(dt, camera); }
  const group = () => new THREE.Group();
  const input = new InputSystem({ T, scene, camera, renderer: { domElement: { addEventListener() {} },
    xr: { isPresenting: true, getController: group, getControllerGrip: group, getHand: group } } });
  const hands = input.xr.map(src => {
    src.connected = false; src.handSource = true; src.grip.visible = false;
    const tip = new THREE.Group(); tip.jointRadius = .008;
    src.hand.add(tip); src.hand.joints = { 'index-finger-tip': tip };
    return { src, tip };
  });
  const frame = () => { scene.updateMatrixWorld(true); input.update(); dock.update(dt, camera, input.handPoints); scene.updateMatrixWorld(true); };
  const move = (point, pinch = false, index = 0) => {
    scene.updateMatrixWorld(true);
    const { src, tip } = hands[index]; src.connected = true; src.hand.visible = true; src.selecting = pinch;
    tip.position.copy(dock.handle.localToWorld(point.clone())); frame();
  };
  const approach = (direction = new THREE.Vector3(0, 0, 1), index = 0) => {
    for (const gap of [.04, .025, .015, .005, -.004]) move(direction.clone().multiplyScalar(dock.handle.r + .008 + gap), false, index);
    assert.equal(dock.handle.press.pressed, true, 'actual InputSystem approach acquires the sphere');
  };
  return { dock, h: dock.handle, hands, frame, move, approach };
}
const direction = h => new THREE.Vector3(h.skin.uDent.value.x, h.skin.uDent.value.y, h.skin.uDent.value.z);

for (const pinch of [false, true]) test(`R10: ${pinch ? 'pinch-held' : 'physical'} sphere dent keeps its entry direction through the centre`, () => {
  const r = rig(); r.approach();
  const entry = direction(r.h).clone();
  for (const z of [.001, 0, -.001, -.0079, -.0081, -.014, -.02]) {
    r.move(new THREE.Vector3(0, 0, z), pinch);
    assert.equal(r.h.press.pressed, true);
    assert.equal(r.h.pressOwner, 'xr0');
    if (pinch) assert.equal(r.dock.rail.held?.id, 'xr0');
    assert.ok(r.h.dent.x > .003, 'the active well remains deep');
    assert.ok(Math.abs(direction(r.h).length() - 1) < 1e-9, 'active dent direction cannot collapse at the centre');
    assert.ok(direction(r.h).distanceTo(entry) < 1e-9, 'deep penetration cannot move the well onto the hidden hemisphere');
  }
});

test('R10: the sphere still follows surface rubbing and re-acquires a new direction after loss', () => {
  const r = rig(); r.approach();
  const side = new THREE.Vector3(.5, 0, Math.sqrt(.75));
  r.move(side.clone().multiplyScalar(r.h.r + .004));
  assert.ok(direction(r.h).distanceTo(side) < 1e-9, 'a contact moving around the skin still moves its well');
  r.move(new THREE.Vector3());
  assert.ok(direction(r.h).distanceTo(side) < 1e-9, 'the last surface direction survives deep entry');
  r.hands[0].src.connected = false;
  for (let n = 0; n < 120; n++) r.frame();
  assert.equal(r.h.press.pressed, false); assert.equal(r.dock.rail.held, null);
  assert.ok(Math.abs(r.h.dent.x) < .00001, 'loss restores the shape');
  const other = new THREE.Vector3(-.5, 0, Math.sqrt(.75)); r.approach(other, 1);
  assert.equal(r.h.pressOwner, 'xr1');
  assert.ok(direction(r.h).distanceTo(other) < 1e-9, 'a new surface approach replaces the previous direction');
});

test('R10: a different hand can establish an opposite surface direction after release', () => {
  const r = rig(); r.approach();
  r.move(new THREE.Vector3(0, 0, r.h.r + .008 + .02));
  assert.equal(r.h.press.pressed, false);
  r.hands[0].src.connected = false; r.frame();
  r.approach(new THREE.Vector3(0, 0, -1), 1);
  assert.equal(r.h.pressOwner, 'xr1');
  assert.ok(direction(r.h).z < -.999, 'an old stroke cannot lock a new contact to the previous hemisphere');
});
