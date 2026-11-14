import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Text } from 'troika-three-text';
import tokenJson from '../tokens.json';
import { createTokens, InputSystem, unlockAudio } from '../src/index.js';
import { SliderComparison } from './comparison/SliderComparison.js';
import { BrightnessOverlay } from './comparison/BrightnessOverlay.js';
import { setBackdrop } from '../src/core/look.js';

// Standalone comparison fixture; the final composite leaves DS materials,
// lights, original demo and hardware settings untouched.
const status = document.getElementById('status'), xrButton = document.getElementById('xr');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const background = new THREE.Color(0x18212e);
scene.background = background;
const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(room);
scene.environment = environment.texture;
const showBackdrop = passthrough => {
  scene.background = passthrough ? null : background;
  // ZSlider's custom glass uses this shared API, not scene.environment.
  // As in the original demo, passthrough never claims a sampled real room.
  setBackdrop(passthrough ? null : environment.texture);
};
showBackdrop(false);
room.dispose(); pmrem.dispose();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 20);
camera.position.set(0, 1.6, 0);
camera.lookAt(0, 1.56, -0.6);
await document.fonts.ready;
const T = createTokens(tokenJson), comparison = new SliderComparison(T);
comparison.position.set(0, 1.48, -0.6);
scene.add(comparison);
const input = new InputSystem({ T, renderer, scene, camera });
comparison.inputSources = input.xr;
const dimmer = new BrightnessOverlay(); scene.add(dimmer);
const restoreButton = document.getElementById('restore');
const scopeLabel = document.getElementById('scope');
comparison.onRestore = () => input.reset();
comparison.onBrightness = value => {
  dimmer.setBrightness(value);
  // Only DOM content; never filter the canvas as well as its GL composite.
  document.documentElement.style.setProperty('--content-brightness', String(1 - dimmer.material.uniforms.opacity.value));
};
restoreButton.onclick = () => comparison.restoreBrightness();
const updateScope = mode => {
  dimmer.setBlendMode(mode); scopeLabel.textContent = dimmer.scopeLabel;
  comparison.setScopeLabel(dimmer.scopeLabel);
};
updateScope(undefined);
renderer.domElement.addEventListener('pointerdown', unlockAudio);
const cancelDesktop = () => {
  // InputSystem's legacy desktop path handles pointerup. Keep this fixture's
  // cancel/lost-capture adapter local; don't alter the original demo contract.
  Object.assign(input.mouse, { pressed: false, state: {}, upPending: false, looking: false, resetBlocked: false });
  for (const control of Object.values(comparison.controls)) {
    const remaining = control.consumeProbes().filter(probe => probe.id !== input.mouse.id);
    remaining.forEach(probe => control.feed(probe));
    if (control.grab?.id === input.mouse.id) control.update(0);
  }
};
renderer.domElement.addEventListener('pointercancel', cancelDesktop);
const lostDesktopCapture = () => {
  // Normal pointerup also releases capture. InputSystem keeps a sub-frame
  // click in upPending so one update can observe it; don't cancel that click.
  if (!input.mouse.upPending) cancelDesktop();
};
renderer.domElement.addEventListener('lostpointercapture', lostDesktopCapture);

// Wait for the actual text geometry, including the original Z value label.
const textReady = [];
comparison.update(0);
comparison.traverse(object => {
  if (object instanceof Text) textReady.push(new Promise(resolve => {
    const ready = () => {
      if (object.textRenderInfo?.parameters.text !== object.text) return;
      object.removeEventListener('synccomplete', ready);
      resolve();
    };
    object.addEventListener('synccomplete', ready);
    object.sync(); ready();
  }));
});
await Promise.all(textReady);
status.textContent = '';

const resize = () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
};
addEventListener('resize', resize);

let placeInXR = false, disposed = false, disposePromise;
const timer = new THREE.Timer();
renderer.setAnimationLoop((time, frame) => {
  timer.update(time);
  if (placeInXR && frame) {
    const pose = frame.getViewerPose(renderer.xr.getReferenceSpace());
    if (pose) {
      const head = new THREE.Matrix4().fromArray(pose.transform.matrix);
      const origin = new THREE.Vector3().setFromMatrixPosition(head);
      const forward = new THREE.Vector3(0, 0, -1).transformDirection(head);
      const yaw = Math.atan2(-forward.x, -forward.z);
      comparison.position.copy(new THREE.Vector3(0, -0.12, -0.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(origin));
      comparison.rotation.set(0, yaw, 0);
      input.reset(); placeInXR = false;
    }
  }
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  input.update();
  comparison.update(Math.min(timer.getDelta(), 0.05));
  renderer.render(scene, camera);
});

const xr = navigator.xr;
const mode = xr && await xr.isSessionSupported('immersive-ar').catch(() => false) ? 'immersive-ar'
  : xr && await xr.isSessionSupported('immersive-vr').catch(() => false) ? 'immersive-vr' : null;
xrButton.disabled = !mode;
xrButton.textContent = mode ? 'XR 열기' : 'XR 기기에서 열기';
xrButton.onclick = async () => {
  if (disposed) return;
  if (renderer.xr.getSession()) { await renderer.xr.getSession().end(); return; }
  xrButton.disabled = true;
  let session;
  try {
    unlockAudio();
    session = await xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
    if (disposed) { await session.end(); return; }
    session.addEventListener('end', () => {
      if (disposed) return;
      showBackdrop(false); input.reset();
      comparison.restoreBrightness(); updateScope(undefined);
      for (const control of Object.values(comparison.controls)) { control.consumeProbes(); control.update(0); }
      comparison.position.set(0, 1.48, -0.6); comparison.rotation.set(0, 0, 0);
      placeInXR = false;
      xrButton.textContent = 'XR 열기';
    }, { once: true });
    await renderer.xr.setSession(session);
    if (disposed) { await session.end(); return; }
    showBackdrop(mode === 'immersive-ar');
    updateScope(session.environmentBlendMode);
    placeInXR = true;
    xrButton.textContent = 'XR 종료';
  } catch (error) {
    await session?.end().catch(() => {});
    comparison.restoreBrightness(); updateScope(undefined);
    status.textContent = `XR을 열 수 없습니다: ${error.message}`;
  } finally { xrButton.disabled = disposed; }
};

// Local inspection hooks, like demo/main.js. No recording/transmission.
window.sliderComparison = {
  comparison, input, camera, renderer, scene, dimmer,
  screenOf(control, point = new THREE.Vector3()) {
    const p = control.localToWorld(point.clone()).project(camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  },
  dispose() {
    if (disposed) return disposePromise;
    disposed = true;
    xrButton.disabled = true;
    restoreButton.disabled = true; restoreButton.onclick = null;
    xrButton.onclick = null;
    // Request native session shutdown too; renderer.dispose() alone does not
    // end WebXR. A late requestSession result is ended by the guard above.
    renderer.setAnimationLoop(null);
    removeEventListener('resize', resize);
    renderer.domElement.removeEventListener('pointerdown', unlockAudio);
    renderer.domElement.removeEventListener('pointercancel', cancelDesktop);
    renderer.domElement.removeEventListener('lostpointercapture', lostDesktopCapture);
    cancelDesktop();
    comparison.restoreBrightness();
    const release = () => {
      comparison.dispose(); dimmer.dispose(); setBackdrop(null); environment.dispose();
      for (const source of input.xr) { source.line.geometry.dispose(); source.line.material.dispose(); }
      renderer.dispose(); renderer.domElement.remove();
    };
    const session = renderer.xr.getSession();
    if (session) {
      disposePromise = session.end().catch(error => {
        status.textContent = `XR 종료를 확인할 수 없습니다: ${error.message}`;
      }).finally(release);
    } else {
      release(); disposePromise = Promise.resolve();
    }
    return disposePromise;
  },
};
addEventListener('pagehide', event => {
  comparison.restoreBrightness();
  if (!event.persisted) window.sliderComparison.dispose();
});
