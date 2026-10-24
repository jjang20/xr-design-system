import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens, Button, Dock, PackagingPanel, InputSystem } from '../src/index.js';

const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url))));
const dt = 1 / 60;
function rig(object) {
  const scene = new THREE.Scene(); scene.add(object);
  const group = () => new THREE.Group();
  const input = new InputSystem({ T, scene, camera: new THREE.PerspectiveCamera(), renderer: {
    domElement: { addEventListener() {} }, xr: { isPresenting: true, getController: group, getControllerGrip: group, getHand: group },
  } });
  const src = input.xr[0]; src.connected = true; src.grip.visible = false;
  src.hand.joints = {};
  const joint = (name, x, y, z, radius = 0.008) => {
    const j = new THREE.Group(); j.position.set(x, y, z); j.jointRadius = radius;
    src.hand.joints[name] = j; src.hand.add(j); return j;
  };
  const step = () => { scene.updateMatrixWorld(true); input.update(); object.update(dt); };
  return { scene, input, src, joint, step };
}
function catalog() {
  const p = new PackagingPanel(T, { title: 'Catalog', items: [
    { label: 'Sofas', items: [{ label: 'Modular', items: [{ label: 'Corner' }] }] },
  ] });
  p.levels[0].rows[0].dispatchEvent({ type: 'select' });
  for (let i = 0; i < 150; i++) p.update(dt);
  return p;
}
function openHand(r) {
  r.joint('wrist', 0, -0.04, 0, 0.012).rotation.x = Math.PI / 2;
  for (const [finger, x] of [['index', -0.025], ['middle', -0.008], ['ring', 0.009], ['pinky', 0.025]]) {
    r.joint(`${finger}-finger-phalanx-proximal`, x, 0.03, 0, 0.01);
    r.joint(`${finger}-finger-tip`, x, 0.1, 0, 0.008);
  }
  // Palm centre is between the wrist and middle proximal joint, not a fingertip.
  return z => { r.src.hand.position.z = z; r.step(); };
}

test('Quest follow-up: tracked fingertip presses with 6 mm remaining before visible contact', () => {
  const b = new Button(T), r = rig(b), tip = r.joint('index-finger-tip', 0, 0, b.t + 0.04);
  r.step(); tip.position.z = b.t + tip.jointRadius + 0.006; r.step();
  assert.equal(b.press.pressed, true);
  assert.ok(b.press.amount > 0, 'pressed has immediate visible depth before crossing the face');
});

test('Quest follow-up: Dock default is closer to the body', () => {
  const d = new Dock(T, { apps: [{ label: 'Home', icon: 'house' }] });
  const head = new THREE.PerspectiveCamera(); head.position.y = 1.6; head.updateMatrixWorld(true);
  d.update(dt, head);
  assert.ok(Math.abs(d.position.distanceTo(head.position) - 0.4) < 1e-9);
});

test('Quest follow-up: an open palm moves the full front layer and closes it', () => {
  const p = catalog(), r = rig(p), move = openHand(r), child = p.levels[1];
  const initial = child.cur.z, events = [];
  p.addEventListener('back', e => events.push(e.level));
  move(0.1); move(0.025); move(0.005);
  assert.ok(child.cur.z < initial - 0.01, 'the whole layer follows the palm before dismissal');
  assert.equal(p.active, 1);
  move(-0.04);
  assert.equal(p.active, 0, 'push closes only the top layer');
  for (let i = 0; i < 150; i++) r.step();
  assert.equal(p.closing.length, 0); assert.deepEqual(events, [0]);
  assert.equal(p.levels[0].item.label, 'Catalog');
});

test('Quest follow-up: withdrawing or losing a palm restores the layer without selection', () => {
  for (const lose of [false, true]) {
    const p = catalog(), r = rig(p), move = openHand(r), child = p.levels[1], events = [];
    p.addEventListener('select', () => events.push('select'));
    p.addEventListener('back', () => events.push('back'));
    move(0.1); move(0.025); move(0.005);
    assert.ok(child.cur.z < -0.01);
    if (lose) { r.src.connected = false; r.step(); } else move(0.1);
    for (let i = 0; i < 150; i++) r.step();
    assert.equal(p.active, 1); assert.deepEqual(events, []);
    assert.ok(Math.abs(child.cur.z) < 0.0001);
    assert.ok(child.rows.every(row => row.enabled));
  }
});

test('Quest follow-up: one palm push closes one layer and must withdraw before pushing again', () => {
  const p = catalog(); p.levels[1].rows[0].dispatchEvent({ type: 'select' });
  for (let i = 0; i < 150; i++) p.update(dt);
  const r = rig(p), move = openHand(r), back = [];
  p.addEventListener('back', e => back.push(e.level));
  move(0.1); move(0.025); move(-0.04);
  assert.equal(p.active, 1);
  for (let i = 0; i < 150; i++) r.step();
  move(-0.08); assert.equal(p.active, 1);
  move(0.1); move(0.025); move(-0.04);
  assert.equal(p.active, 0);
  for (let i = 0; i < 150; i++) r.step();
  move(0.1); move(0.025); move(-0.08);
  assert.equal(p.active, 0); assert.deepEqual(back, [1, 0]);
});

test('Quest follow-up: a back-of-hand, edge-on hand, pinch or missing joints cannot dismiss', () => {
  for (const kind of ['back', 'edge', 'pinch', 'missing', 'fist']) {
    const p = catalog(), r = rig(p), move = openHand(r);
    if (kind === 'back') r.src.hand.joints.wrist.rotation.x = -Math.PI / 2;
    if (kind === 'edge') r.src.hand.joints.wrist.rotation.x = 0;
    if (kind === 'pinch') r.src.selecting = true;
    if (kind === 'missing') r.src.hand.joints.wrist.visible = false;
    if (kind === 'fist') for (const f of ['index', 'middle', 'ring', 'pinky']) r.src.hand.joints[`${f}-finger-tip`].position.y = 0.01;
    move(0.1); move(0.025); move(-0.04);
    assert.equal(p.active, 1, kind);
    assert.equal(p.palmPush, null, kind);
  }
});

test('Quest follow-up: a palm first appearing behind the layer does not close it', () => {
  const p = catalog(), r = rig(p), move = openHand(r);
  move(-0.04); move(-0.08);
  assert.equal(p.active, 1); assert.equal(p.palmPush, null);
});

test('Quest follow-up: palm push uses world distance under rotation and scaling', () => {
  for (const scale of [0.5, 1.5]) {
    const p = catalog(); p.scale.setScalar(scale); p.rotation.y = 0.6; p.position.set(0.2, 1.5, -0.6);
    const r = rig(p); openHand(r);
    const orientation = p.quaternion.clone(); r.src.hand.quaternion.copy(orientation);
    const move = gap => {
      p.updateMatrixWorld(true);
      r.src.hand.position.copy(p.localToWorld(new THREE.Vector3(0, 0, p.levels.at(-1).panel.t + (0.022 + gap) / scale)));
      r.step();
    };
    const initial = p.levels[1].cur.z;
    move(0.06); move(-0.02);
    assert.ok(Math.abs((initial - p.levels[1].cur.z) * scale - 0.02) < 1e-6);
    move(-0.049); assert.equal(p.active, 1);
    move(-0.051); assert.equal(p.active, 0);
  }
});

test('Quest follow-up: reduced motion keeps the pushed pose while fading out', () => {
  const p = catalog(); p.reducedMotion = true;
  const r = rig(p), move = openHand(r), child = p.levels[1];
  move(0.1); move(0.025); move(0.005);
  assert.ok(child.cur.z < -0.01, 'direct manipulation still follows the hand');
  move(-0.04);
  const z = child.cur.z;
  for (let i = 0; i < 10; i++) r.step();
  assert.equal(child.cur.z, z);
  assert.ok(child.cur.opacity < 1);
});

test('Quest follow-up: a palm overlapping a row suppresses that finger and other-hand selection', () => {
  const p = catalog(), r = rig(p), move = openHand(r), child = p.levels[1], row = child.rows[0], events = [];
  r.src.hand.rotation.z = Math.PI / 2;
  r.src.hand.position.x = 0.045;
  r.src.hand.position.y = row.position.y + 0.025;
  row.addEventListener('press', () => events.push('press'));
  row.addEventListener('select', () => events.push('select'));
  move(0.08); move(0.025);
  assert.equal(p.palmOwner, 'xr0');
  // Other hand's captured ray is also gated during a whole-layer push.
  row.feed({ kind: 'ray', id: 'xr1', point: new THREE.Vector3(0, 0, row.t), pressed: true, captured: true });
  move(0.005);
  assert.deepEqual(events, []);
  move(-0.04); assert.equal(p.active, 0);
});

test('Quest follow-up: pushing the root Catalog cannot become a row selection', () => {
  const p = catalog(); p.back(0);
  for (let i = 0; i < 150; i++) p.update(dt);
  const r = rig(p), move = openHand(r), root = p.levels[0], row = root.rows[0], events = [];
  r.src.hand.rotation.z = Math.PI / 2;
  r.src.hand.position.x = 0.045;
  r.src.hand.position.y = row.position.y + 0.025;
  for (const type of ['press', 'select']) row.addEventListener(type, () => events.push(type));
  for (const z of [0.08, 0.025, 0.005, -0.04, 0.08]) move(z);
  assert.equal(p.active, 0);
  assert.equal(p.levels[0], root);
  assert.equal(p.palmPush, null);
  assert.deepEqual(events, []);
  assert.ok(Math.abs(root.cur.z) < 1e-9);
});

test('Quest follow-up: second palm cannot take ownership or close after first loses tracking', () => {
  const p = catalog(), first = { id: 'first', normal: new THREE.Vector3(0, 0, -1), radius: 0.012 };
  const frame = probes => { for (const [id, z] of probes) p.feedPalm({ ...first, id, point: new THREE.Vector3(0, 0, z) }); p.update(dt); };
  frame([['first', 0.08]]); frame([['first', 0.025]]);
  frame([['second', -0.08], ['first', 0.005]]);
  assert.equal(p.palmOwner, 'first'); assert.equal(p.active, 1);
  frame([['second', -0.08]]);
  assert.equal(p.palmOwner, undefined); assert.equal(p.active, 1);
  frame([['second', -0.08]]); assert.equal(p.active, 1);
});

test('Quest follow-up: late tracking radius uses fallback while controller contact stays unchanged', () => {
  const b = new Button(T), r = rig(b), tip = r.joint('index-finger-tip', 0, 0, b.t + 0.04, 0);
  r.step(); tip.position.z = b.t + 0.014; r.step();
  assert.equal(b.press.pressed, true);
  const c = new Button(T), grip = rig(c);
  grip.src.grip.visible = true; grip.src.grip.position.z = c.t + 0.03; grip.step();
  grip.src.grip.position.z = c.t + 0.006; grip.step();
  assert.equal(c.press.pressed, false, 'the hand offset does not move controller contact');
  grip.src.grip.position.z = c.t - 0.001; grip.step();
  assert.equal(c.press.pressed, true);
});
