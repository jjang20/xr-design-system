import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,Dock,InputSystem} from '../../src/index.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../../tokens.json',import.meta.url))));
const dt=1/60;
export function rig() {
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
