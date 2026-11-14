import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens } from '../src/tokens.js';
import { SliderComparison } from '../demo/comparison/SliderComparison.js';
import { InputSystem } from '../src/core/InputSystem.js';

const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url))));

test('XR guidance distinguishes contact from far selection, and restore resets the shared visible result', () => {
  const view = new SliderComparison(T), x = view.controls.x;
  assert.equal(view.scopeLabel.text, '가상 화면 밝기');
  view.setScopeLabel('앱 화면과 보이는 주변 밝기');
  assert.equal(view.scopeLabel.text, '앱 화면과 보이는 주변 밝기');
  assert.match(view.guidance.x.text, /가까이: 닿아 가로 이동/);
  assert.match(view.guidance.x.text, /원거리 손: 지목 후 집은 채 이동/);
  assert.match(view.guidance.x.text, /컨트롤러: 트리거 누른 채 이동/);
  x.feed({ kind: 'ray', id: 'ray', pressed: false, captured: false, point: new THREE.Vector3() });
  view.update(1 / 60);
  const hoverColor = x.thumb.material.color.getHex();
  assert.equal(x.value, 1);
  x.feed({ kind: 'ray', id: 'ray', pressed: true, captured: true, point: new THREE.Vector3() });
  view.update(1 / 60);
  assert.notEqual(x.thumb.material.color.getHex(), hoverColor);
  view.restoreControl.dispatchEvent({ type: 'select' });
  assert.equal(view.results.x.number.text, '100%');
  assert.equal(view.results.z.number.text, '100%');
  view.dispose();
});

test('shared brightness keeps its owner, blocks a competing held source, and restores without stale input', () => {
  const view = new SliderComparison(T), { x, z } = view.controls;
  const ray = (control, id, pressed, point) => control.feed({ kind: 'ray', id, pressed, captured: true, point });
  const xp = new THREE.Vector3(0, 0, x.frontZ);
  ray(x, 'first', true, xp); view.update(1 / 60);
  const shared = x.value;
  const mirrorDetents = [], mirrorChanges = [];
  z.addEventListener('detent', e => mirrorDetents.push(e.index));
  z.addEventListener('change', e => mirrorChanges.push(e.value));
  ray(x, 'first', true, new THREE.Vector3(0.04, 0, x.frontZ));
  ray(z, 'second', true, new THREE.Vector3(0, 0, 0)); view.update(1 / 60);
  assert.equal(x.value, 0.75);
  assert.equal(z.value, 0.75);
  assert.deepEqual(mirrorChanges, []); assert.deepEqual(mirrorDetents, []);
  // Loss releases the owner but does not let a competitor's old hold acquire.
  ray(z, 'second', true, new THREE.Vector3(0, 0, -0.1)); view.update(1 / 60);
  assert.equal(z.value, 0.75);
  view.restoreBrightness();
  ray(x, 'first', true, xp); ray(z, 'second', true, new THREE.Vector3(0, 0, 0)); view.update(1 / 60);
  assert.equal(x.value, 1); assert.equal(z.value, 1);
  ray(x, 'first', false, xp); ray(z, 'second', false, new THREE.Vector3()); view.update(1 / 60);
  ray(x, 'first', true, xp); view.update(1 / 60);
  assert.equal(x.value, shared); assert.equal(z.value, shared);
  view.dispose();
});

test('unrelated hover does not change the source tie-break between acquired controls', () => {
  const view = new SliderComparison(T), { x, z } = view.controls;
  x.feed({ kind: 'ray', id: 'a-hover', pressed: false, captured: false, point: new THREE.Vector3() });
  x.feed({ kind: 'ray', id: 'c-acquired', pressed: true, captured: true, point: new THREE.Vector3(-0.08, 0, x.frontZ) });
  z.feed({ kind: 'ray', id: 'b-acquired', pressed: true, captured: true, point: new THREE.Vector3(0, 0, z.knobZ) });
  view.update(1 / 60);
  assert.equal(x.value, 1, 'b-acquired Z wins over c-acquired X regardless of a-hover');
  assert.equal(z.value, 1);
  z.feed({ kind: 'ray', id: 'b-acquired', pressed: true, captured: true, point: new THREE.Vector3(0, 0, 0) });
  view.update(1 / 60);
  assert.equal(x.value, 0); assert.equal(z.value, 0);
  view.dispose();
});

test('simultaneous controls use the source tie-break, and near restore requires withdrawal', () => {
  const view = new SliderComparison(T), { x, z } = view.controls;
  x.feed({ kind: 'ray', id: 'z-source', pressed: true, captured: true, point: new THREE.Vector3(-0.08, 0, x.frontZ) });
  z.feed({ kind: 'ray', id: 'a-source', pressed: true, captured: true, point: new THREE.Vector3(0, 0, z.knobZ) });
  view.update(1 / 60);
  assert.equal(x.value, 1, 'Z wins despite X being inserted first');
  z.feed({ kind: 'ray', id: 'a-source', pressed: true, captured: true, point: new THREE.Vector3(0, 0, 0) });
  view.update(1 / 60);
  assert.equal(x.value, 0); assert.equal(z.value, 0);
  view.update(0);
  const contact = depth => x.feed({ kind: 'poke', id: 'finger', radius: 0.008, point: new THREE.Vector3(0, 0, depth) });
  contact(0.04); view.update(0); contact(0.01); view.update(0);
  assert.equal(x.value, 0.5);
  view.restoreBrightness(); contact(0.01); view.update(0);
  assert.equal(x.value, 1);
  contact(0.04); view.update(0); contact(0.01); view.update(0);
  assert.equal(x.value, 0.5); assert.equal(z.value, 0.5);
  view.dispose();
});

test('comparison starts at full brightness and X changes both visible control results', () => {
  const view = new SliderComparison(T);
  view.update(1 / 60);
  for (const key of ['x', 'z']) {
    assert.equal(view.controls[key].value, 1);
    assert.equal(view.results[key].number.text, '100%');
    assert.equal(view.results[key].sample.material.transparent, false);
  }
  view.controls.x.feed({ kind: 'ray', id: 'hand', pressed: true, captured: true, point: new THREE.Vector3(0, 0, 0.003) });
  view.update(1 / 60);
  for (const key of ['x', 'z']) {
    assert.equal(view.controls[key].value, 0.5);
    assert.equal(view.results[key].number.text, '50%');
  }
  view.dispose();
});

test('X hover leaves values alone; a captured ray updates the shared result and retains it after release/loss', () => {
  const view = new SliderComparison(T), x = view.controls.x;
  const changes = [];
  x.addEventListener('change', event => changes.push(event.value));
  const frame = (position, pressed, captured = pressed, id = 'ray') => {
    x.feed({ kind: 'ray', id, point: new THREE.Vector3(position, 0, x.frontZ), pressed, captured });
    view.update(1 / 60);
  };
  frame(0.04, false);
  assert.equal(x.value, 1);
  assert.deepEqual(changes, []);
  frame(0.04, true);
  assert.equal(x.value, 0.75);
  assert.equal(view.results.x.number.text, '75%');
  assert.equal(view.results.z.number.text, '75%');
  assert.equal(view.controls.z.value, 0.75);
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
  assert.equal(x.value, 1);
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

test('common values retain precision and mirroring never reinjects changes or detents', () => {
  const view = new SliderComparison(T), { x, z } = view.controls;
  const detents = [], changes = [];
  z.addEventListener('detent', e => detents.push(e.index));
  z.addEventListener('change', e => changes.push(e.value));
  x.setValue(0.333); view.update(1 / 60);
  assert.equal(z.value, 0.333);
  assert.equal(view.results.x.number.text, '33%');
  assert.equal(view.results.z.number.text, '33%');
  x.setValue(0.334); view.update(1 / 60);
  assert.equal(z.value, 0.334);
  assert.deepEqual(changes, []); assert.deepEqual(detents, []);
  z.setValue(0.7); view.update(1 / 60);
  assert.equal(x.value, 0.7);
  assert.equal(changes.length, 1);
  assert.ok(detents.length > 0, 'real Z setter keeps its original detent semantics');
  const before = [...detents];
  view.restoreBrightness();
  assert.deepEqual(detents, before);
  assert.equal(view.results.z.number.text, '100%');
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

function xrPlanarRig(hand = false) {
  const view = new SliderComparison(T), { input, scene } = inputRig(view), x = view.controls.x;
  // No restoration action is involved. The Node text/canvas boundary does
  // not lay out its label, so exclude that unrelated component's bounds.
  view.restoreControl.visible = false;
  input.renderer.xr.isPresenting = true;
  const source = input.xr[0];
  source.ray.dispatchEvent({ type: 'connected', data: hand ? { hand: {} } : {} });
  if (hand) {
    source.hand.joints = {};
    for (const name of ['index-finger-tip', 'thumb-tip']) {
      const joint = new THREE.Group(); joint.jointRadius = 0.008;
      source.hand.add(joint); source.hand.joints[name] = joint;
    }
  }
  const frame = (px, gripZ) => {
    source.ray.position.copy(x.localToWorld(new THREE.Vector3(px, 0, 0.4)));
    source.grip.position.copy(x.localToWorld(new THREE.Vector3(px, 0, gripZ)));
    if (hand) {
      source.hand.joints['index-finger-tip'].position.copy(source.grip.position);
      source.hand.joints['thumb-tip'].position.copy(source.grip.position).add(new THREE.Vector3(0.03, 0, 0));
    }
    scene.updateMatrixWorld(true);
    input.update(); view.update(1 / 60);
  };
  return { view, input, x, source, frame };
}

for (const hand of [false, true]) test(`an XR planar ray drag (${hand ? 'hand' : 'controller'}) keeps pressed feedback when approaching until actual release`, () => {
  const { view, x, source, frame } = xrPlanarRig(hand);
  try {
    frame(0, 0.4);
    source.ray.dispatchEvent({ type: 'selectstart' });
    frame(0, 0.4);
    const pressedColor = x.thumb.material.color.getHex();
    assert.equal(view.results.x.number.text, '50%');
    frame(0.04, 0.4);
    assert.equal(view.results.x.number.text, '75%');
    frame(0.06, 0.02); // no release, disconnection or tracking loss
    assert.equal(x.thumb.material.color.getHex(), pressedColor, 'pressed feedback persists during the same held drag');
    assert.equal(view.results.x.number.text, '88%', 'the same captured ray still changes the shared value');
    assert.equal(view.results.z.number.text, '88%');
    source.ray.dispatchEvent({ type: 'selectend' });
    frame(-0.04, 0.02);
    assert.equal(view.results.x.number.text, '88%', 'release does not apply a final drag value');
    assert.notEqual(x.thumb.material.color.getHex(), pressedColor);
    assert.equal(view.owner, null);
    frame(-0.04, 0.02);
    assert.equal(source.near.on, true, 'normal near routing resumes after release');
  } finally { view.dispose(); }
});

for (const hand of [false, true]) test(`a retained planar ray (${hand ? 'hand' : 'controller'}) cancels on ray pose loss and cannot rearm while held`, () => {
  const { view, x, source, frame } = xrPlanarRig(hand);
  try {
    frame(0, 0.4); source.ray.dispatchEvent({ type: 'selectstart' }); frame(0, 0.4);
    frame(0.04, 0.02);
    const pressedColor = x.thumb.material.color.getHex();
    source.ray.visible = false; // Three retains the last matrix when the target pose is unavailable.
    frame(0.04, 0.02);
    assert.equal(view.results.x.number.text, '75%');
    assert.equal(view.owner, null, 'ray pose loss releases the common owner even with live joints/grip');
    assert.notEqual(x.thumb.material.color.getHex(), pressedColor);
    source.ray.visible = true;
    frame(-0.06, 0.5);
    assert.equal(view.results.x.number.text, '75%', 'pose recovery alone cannot rearm a held drag');
    assert.equal(view.owner, null);
    source.ray.dispatchEvent({ type: 'selectend' }); frame(-0.06, 0.5);
    source.ray.dispatchEvent({ type: 'selectstart' }); frame(-0.06, 0.5);
    assert.equal(view.results.x.number.text, '13%');
    assert.equal(view.results.z.number.text, '13%');
  } finally { view.dispose(); }
});

test('a retained planar ray cancels on tracked-hand loss and requires release before another drag', () => {
  const { view, input, x, source, frame } = xrPlanarRig(true);
  try {
    frame(0, 0.4); source.ray.dispatchEvent({ type: 'selectstart' }); frame(0, 0.4);
    const pressedColor = x.thumb.material.color.getHex();
    frame(0.04, 0.02);
    source.hand.joints['index-finger-tip'].visible = false;
    frame(-0.06, 0.02);
    assert.equal(view.results.x.number.text, '75%');
    assert.equal(view.owner, null);
    assert.notEqual(x.thumb.material.color.getHex(), pressedColor);
    source.hand.joints['index-finger-tip'].visible = true;
    frame(-0.06, 0.5);
    assert.equal(view.results.x.number.text, '75%', 'a returning held source cannot rearm');
    source.ray.dispatchEvent({ type: 'selectend' }); frame(-0.06, 0.5);
    source.ray.dispatchEvent({ type: 'selectstart' }); frame(-0.06, 0.5);
    assert.equal(view.results.x.number.text, '13%');
    input.reset(); frame(0.04, 0.5);
    assert.equal(view.owner, null);
    assert.equal(view.results.x.number.text, '13%', 'reference reset blocks the still-held source');
  } finally { view.dispose(); }
});

for (const loss of ['disconnect', 'disabled-target']) test(`a retained controller drag ends on ${loss} without a final value change`, () => {
  const { view, x, source, frame } = xrPlanarRig();
  try {
    frame(0, 0.4); source.ray.dispatchEvent({ type: 'selectstart' }); frame(0, 0.4);
    frame(0.04, 0.02);
    const pressedColor = x.thumb.material.color.getHex();
    if (loss === 'disconnect') source.ray.dispatchEvent({ type: 'disconnected' });
    else x.enabled = false;
    frame(-0.06, 0.02);
    assert.equal(view.results.x.number.text, '75%');
    assert.equal(view.owner, null);
    assert.notEqual(x.thumb.material.color.getHex(), pressedColor);
  } finally { view.dispose(); }
});

test('confirmed XR source identity prioritizes its guidance without guessing unknown sources', () => {
  const view = new SliderComparison(T), { input } = inputRig(view), source = input.xr[0], x = view.controls.x;
  view.inputSources = input.xr;
  const aim = () => {
    input.rayStep(source, new THREE.Ray(x.localToWorld(new THREE.Vector3(0, 0, 0.4)), new THREE.Vector3(0, 0, -1)), false, 0, input.collect().items);
    view.update(1 / 60);
  };
  source.ray.dispatchEvent({ type: 'connected', data: {} }); aim();
  assert.match(view.guidance.x.text.split('\n')[0], /^컨트롤러:/);
  source.ray.dispatchEvent({ type: 'connected', data: { hand: {} } }); aim();
  assert.match(view.guidance.x.text.split('\n')[0], /^원거리 손:/);
  source.ray.dispatchEvent({ type: 'disconnected' }); aim();
  assert.match(view.guidance.x.text.split('\n')[0], /^가까이:/);
  assert.equal(view.controls.x.value, 1);
  view.dispose();
});

test('actual InputSystem selection of the in-scene restore button restores both controls', () => {
  const view = new SliderComparison(T), { input } = inputRig(view);
  view.controls.x.setValue(0); view.update(0);
  const source = { id: 'restore-ray', state: {} }, button = view.restoreControl;
  const origin = button.localToWorld(new THREE.Vector3(0, 0, 0.4));
  for (const pressed of [false, true, false]) {
    input.rayStep(source, new THREE.Ray(origin, new THREE.Vector3(0, 0, -1)), pressed, 0, input.collect().items);
    view.update(1 / 60);
  }
  assert.equal(view.controls.x.value, 1);
  assert.equal(view.controls.z.value, 1);
  view.dispose();
});

test('actual InputSystem ray routing uses X hit geometry, rejects hover and retains values on parallel rays', () => {
  const view = new SliderComparison(T), x = view.controls.x;
  const { input } = inputRig(view), pointer = { id: 'controller', state: {} };
  const aim = (px, pressed) => {
    const origin = x.localToWorld(new THREE.Vector3(px, 0, 0.4));
    input.rayStep(pointer, new THREE.Ray(origin, new THREE.Vector3(0, 0, -1)), pressed, 0, input.collect().items);
    view.update(1 / 60);
  };
  aim(0.04, false);
  assert.equal(x.value, 1);
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
  assert.equal(x.value, 1);
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
  z.setValue(0.4); view.update(0);
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
  assert.equal(view.controls.x.value, held);
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


for(const start of [0,1])test(`actual XR semantic ray acquires the visible outer endpoint thumb at ${start}`,()=>{
 const {view,x,source,frame}=xrPlanarRig();try{
  view.brightness=start;view.syncResults();view.update(0);
  const target=start===1?.0845:-.0845,move=start===1?.04:-.04;
  // Keep the synthetic grip beyond mock font bounds so this case is far-ray acquisition.
  frame(target,1);assert.equal(source.near.on,false);const hover=x.thumb.material.color.getHex();
  source.ray.dispatchEvent({type:'selectstart'});frame(target,1);
  assert.notEqual(x.thumb.material.color.getHex(),hover,'visible handle hit enters pressed feedback');
  frame(move,1);assert.equal(view.results.x.number.text,start===1?'75%':'25%');
  source.ray.dispatchEvent({type:'selectend'});frame(-move,1);
  assert.equal(view.results.x.number.text,start===1?'75%':'25%','release keeps last value');
 }finally{view.dispose();}
});

test('actual near contact uses the drawn endpoint disk and rejects space beyond it',()=>{
 for(const start of [0,1]){
  const view=new SliderComparison(T),{input}=inputRig(view),x=view.controls.x;
  try{
   view.brightness=start;view.syncResults();view.update(0);
   const sign=start===1?1:-1,source={id:'finger'},target=sign*.0845;
   const contact=(px,z)=>{
    x.updateMatrixWorld(true);
    input.pokeStep(source,x.localToWorld(new THREE.Vector3(px,0,z)),input.collect().items,.008);
    view.update(1/60);
   };
   contact(sign*.105,.03);contact(sign*.105,.010);
   assert.equal(x.value,start,'empty space outside the drawn handle is not a contact');
   contact(target,.03);contact(target,.010);contact(sign*.04,.010);
   assert.equal(view.results.x.number.text,start===1?'75%':'25%');
  }finally{view.dispose();}
 }
});
