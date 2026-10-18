// One place that turns every input into probes for Contour objects:
//   - desktop mouse            -> a ray (click = press, wheel = push/pull)
//   - XR hand or controller    -> a poke (fingertip / grip) when near,
//                                 a ray (pinch / trigger = press) when far
// Near/far switching uses proximity.nearfar.threshold +/- hysteresis, so a
// hand at the boundary doesn't flicker between poke and ray.
import * as THREE from 'three';
import { Hysteresis } from './Hysteresis.js';

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

function visibleChain(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export class InputSystem {
  constructor({ T, renderer, camera, scene }) {
    Object.assign(this, { T, renderer, camera, scene });
    this.raycaster = new THREE.Raycaster();
    this.handPoints = []; // world points near the UI this frame (for dock magnify)
    this.onLook = null; // (dx, dy) when the mouse drags empty space

    // Desktop mouse.
    const el = renderer.domElement;
    this.mouse = { id: 'mouse', ndc: new THREE.Vector2(), inside: false, pressed: false, wheel: 0, ray: new THREE.Ray(), state: {} };
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      this.mouse.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.mouse.inside = true;
      if (this.mouse.looking && this.onLook) this.onLook(e.movementX, e.movementY);
    });
    el.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      this.mouse.pressed = true;
      this.mouse.looking = !this.mouse.state.hover; // drag on empty space turns your view
    });
    el.addEventListener('pointerup', () => { this.mouse.pressed = false; this.mouse.looking = false; });
    el.addEventListener('wheel', e => {
      if (this.mouse.state.hover) { e.preventDefault(); this.mouse.wheel += -Math.sign(e.deltaY); }
    }, { passive: false });

    // XR: two hands or controllers.
    const T_ = T.get('proximity.nearfar.threshold');
    const hy = T.get('proximity.nearfar.hysteresis');
    this.xr = [0, 1].map(i => {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      scene.add(ray, grip, hand);
      const src = { id: `xr${i}`, ray, grip, hand, selecting: false, connected: false, near: new Hysteresis(T_ - hy, T_ + hy), state: {} };
      ray.addEventListener('connected', () => { src.connected = true; });
      ray.addEventListener('disconnected', () => { src.connected = false; src.selecting = false; });
      ray.addEventListener('selectstart', () => { src.selecting = true; });
      ray.addEventListener('selectend', () => { src.selecting = false; });
      // A visible ray for far mode.
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
      );
      line.visible = false;
      ray.add(line);
      src.line = line;
      return src;
    });
  }

  collect() {
    const items = [], components = [];
    this.scene.traverse(o => {
      if (o.isInteractable && o.enabled && visibleChain(o)) {
        items.push(o);
        for (const m of o.hitMeshes) m.userData.owner = o;
      }
      if (o.isContourComponent && !o.parent?.isContourComponent && visibleChain(o)) components.push(o);
    });
    return { items, components };
  }

  // Fingertip position, or the grip for a plain controller.
  tipOf(src) {
    const tip = src.hand.joints?.['index-finger-tip'];
    if (tip && tip.visible) return tip.getWorldPosition(new THREE.Vector3());
    if (src.grip.visible) return src.grip.getWorldPosition(new THREE.Vector3());
    return null;
  }

  update() {
    const { items, components } = this.collect();
    this.handPoints = [];
    const presenting = this.renderer.xr.isPresenting;

    if (presenting) {
      for (const src of this.xr) {
        src.line.visible = false;
        if (!src.connected) continue;
        const tip = this.tipOf(src);
        let dist = Infinity;
        if (tip) for (const c of components) dist = Math.min(dist, _box.setFromObject(c).distanceToPoint(tip));
        if (tip && src.near.update(dist)) {
          this.handPoints.push(tip);
          for (const it of items) {
            _m.copy(it.matrixWorld).invert();
            it.feed({ kind: 'poke', id: src.id, point: tip.clone().applyMatrix4(_m), pinch: src.selecting });
          }
          src.state = {};
        } else {
          src.line.visible = true;
          const origin = new THREE.Vector3().setFromMatrixPosition(src.ray.matrixWorld);
          const dir = new THREE.Vector3(0, 0, -1).transformDirection(src.ray.matrixWorld);
          this.rayStep(src, new THREE.Ray(origin, dir), src.selecting, 0, items);
        }
      }
    } else if (this.mouse.inside || this.mouse.pressed) {
      this.raycaster.setFromCamera(this.mouse.ndc, this.camera);
      const wheel = this.mouse.wheel;
      this.mouse.wheel = 0;
      this.rayStep(this.mouse, this.raycaster.ray.clone(), this.mouse.pressed && !this.mouse.looking, wheel, items);
    } else {
      this.mouse.state = {};
    }
  }

  rayStep(ptr, worldRay, pressed, wheel, items) {
    const st = ptr.state;
    let target = null, worldPoint = null;
    if (st.captured && items.includes(st.captured)) {
      target = st.captured;
    } else {
      st.captured = null;
      this.raycaster.ray.copy(worldRay);
      const hit = this.raycaster.intersectObjects(items.flatMap(i => i.hitMeshes), false)[0];
      if (hit) { target = hit.object.userData.owner; worldPoint = hit.point; }
    }
    st.hover = !!target;
    if (!target) { st.wasPressed = pressed; return; }

    _m.copy(target.matrixWorld).invert();
    const localRay = worldRay.clone().applyMatrix4(_m);
    if (pressed && !st.wasPressed) st.captured = target;
    const captured = st.captured === target;
    let point;
    if (captured) {
      point = target.rayPoint(localRay, new THREE.Vector3()) ?? st.lastPoint ?? new THREE.Vector3();
      worldPoint = point.clone().applyMatrix4(target.matrixWorld);
    } else {
      point = worldPoint.clone().applyMatrix4(_m);
    }
    st.lastPoint = point;
    this.handPoints.push(worldPoint);
    target.feed({ kind: 'ray', id: ptr.id, point, ray: localRay, pressed, captured, wheel });
    if (!pressed) st.captured = null;
    st.wasPressed = pressed;
  }
}
