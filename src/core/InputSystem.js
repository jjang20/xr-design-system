// One place that turns every input into probes for Contour objects:
//   - desktop mouse            -> a ray (click = press, wheel = push/pull)
//   - XR hand or controller    -> a poke (fingertip / grip) when near,
//                                 a ray (pinch / trigger = press) when far
// Near/far switching uses absolute input.direct.distance enter/exit edges, so a
// hand at the boundary doesn't flicker between poke and ray.
import * as THREE from 'three';
import { Hysteresis } from './Hysteresis.js';
import { DEFAULTS } from './defaults.js';

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
      this.mouse.seen = false;
      this.mouse.looking = !this.mouse.state.hover; // drag on empty space turns your view
    });
    // A click shorter than one frame still counts: keep it pressed until a frame has seen it.
    el.addEventListener('pointerup', () => {
      if (this.mouse.seen) { this.mouse.pressed = false; this.mouse.looking = false; } else this.mouse.upPending = true;
    });
    el.addEventListener('wheel', e => {
      if (this.mouse.state.hover) { e.preventDefault(); this.mouse.wheel += -Math.sign(e.deltaY); }
    }, { passive: false });

    // XR: two hands or controllers.
    const enter = T.get('input.direct.distance.enter');
    const exit = T.get('input.direct.distance.exit');
    this.xr = [0, 1].map(i => {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      scene.add(ray, grip, hand);
      const src = { id: `xr${i}`, ray, grip, hand, selecting: false, connected: false, near: new Hysteresis(enter, exit), state: {} };
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

  // A held trigger/pinch belongs to the old reference space. Require its
  // release before any new capture after session entry or recentering.
  reset() {
    this.handPoints = [];
    for (const src of this.xr) {
      src.state = {}; src.resetBlocked = src.selecting;
      src.pokeHistory = null; src.fingers = new Map();
      src.near.update(Infinity); src.line.visible = false;
    }
    this.mouse.state = {}; this.mouse.resetBlocked = this.mouse.pressed;
    this.mouse.upPending = false; this.mouse.looking = false;
  }

  collect() {
    const items = [], components = [], palms = [];
    this.scene.traverse(o => {
      if (o.isInteractable && o.enabled && visibleChain(o)) {
        items.push(o);
        for (const m of o.hitMeshes) m.userData.owner = o;
      }
      if (o.isContourComponent && !o.parent?.isContourComponent && visibleChain(o)) components.push(o);
      if (o.palmDistance && visibleChain(o)) palms.push(o);
    });
    return { items, components, palms };
  }

  // Fingertip position, or the grip for a plain controller.
  tipOf(src) {
    const tip = src.hand.joints?.['index-finger-tip'];
    if (tip && tip.visible) return tip.getWorldPosition(new THREE.Vector3());
    if (src.grip.visible) return src.grip.getWorldPosition(new THREE.Vector3());
    return null;
  }

  // WebXR exposes joints, not a palm point. Estimate its centre and plane
  // from the wrist and knuckles; at least three extended fingers distinguish
  // a flat push from an index poke or pinch. Missing joints never dismiss.
  palmOf(src) {
    if (src.selecting || !src.hand.visible) return null;
    const joints = src.hand.joints ?? {};
    const point = name => joints[name]?.visible ? joints[name].getWorldPosition(new THREE.Vector3()) : null;
    const wrist = point('wrist');
    const middle = point('middle-finger-phalanx-proximal');
    if (!wrist || !middle) return null;
    const extended = [];
    for (const finger of ['index', 'middle', 'ring', 'pinky']) {
      const base = point(`${finger}-finger-phalanx-proximal`), tip = point(`${finger}-finger-tip`);
      if (base && tip && tip.distanceTo(wrist) > base.distanceTo(wrist) * DEFAULTS.handInput.fingerExtension) extended.push({ finger, tip });
    }
    if (extended.length < 3) return null;
    // A leading index is a point. Several leading pads are a broad face.
    const normal = new THREE.Vector3(0, -1, 0).transformDirection(joints.wrist.matrixWorld);
    const centre = wrist.clone().lerp(middle, 0.5);
    const index = extended.find(f => f.finger === 'index');
    const others = extended.filter(f => f.finger !== 'index');
    const otherLead = others.reduce((sum, f) => sum + f.tip.clone().sub(centre).dot(normal), 0) / others.length;
    if (index && index.tip.clone().sub(centre).dot(normal) - otherLead > DEFAULTS.handInput.palmTipLead) return null;
    const pads = extended.reduce((sum, f) => sum.add(f.tip), new THREE.Vector3()).multiplyScalar(1 / extended.length);
    const key = `fingers:${extended.map(f => f.finger).join(',')}`;
    return { point: centre, normal, radius: DEFAULTS.handInput.palmRadius,
      contacts: [{ key: 'palm', point: centre, radius: DEFAULTS.handInput.palmRadius },
        { key, point: pads, radius: DEFAULTS.handInput.fingertipRadius }] };
  }

  palmStep(src, targets) {
    const owner = targets.find(t => t.palmOwner === src.id);
    const palm = this.palmOf(src);
    // Developer inspection only: never render recognizer details in the UI.
    src.palmDiagnostic = { state: palm ? 'flat-palm' : 'not-flat-or-untracked',
      samples: palm ? targets.map(t => { const s = t.palmSample(palm); return s && { gap: s.gap, inside: s.inside, alignment: s.alignment, facing: s.facing, manipulating: !!t.controls?.held }; }) : [] };
    // A brief recognizer dropout cannot turn a held palm into a row click.
    if (!palm) return !!owner;
    let target = owner ?? targets.find(t => t.palmBlocked.has(src.id));
    if (!target) {
      let best = DEFAULTS.handInput.palmReach;
      for (const t of targets) {
        const d = t.palmDistance(palm);
        if (d < best) { best = d; target = t; }
      }
    }
    if (!target) { src.palmDiagnostic.state = palm ? 'outside-or-angle-gate' : src.palmDiagnostic.state; return false; }
    src.palmDiagnostic.state = owner ? 'captured' : 'candidate';
    target.feedPalm({ ...palm, id: src.id });
    return !!owner || target.palmBlocks(palm);
  }

  update() {
    this.frame = (this.frame ?? 0) + 1;
    const { items, components, palms } = this.collect();
    this.handPoints = [];
    const presenting = this.renderer.xr.isPresenting;

    if (presenting) {
      for (const src of this.xr) {
        src.line.visible = false;
        if (!src.connected) { src.pokeHistory = null; src.fingers?.clear(); continue; }
        if (src.resetBlocked) {
          if (src.selecting) { src.pokeHistory = null; src.fingers?.clear(); continue; }
          src.resetBlocked = false;
        }
        // An existing manipulation owns its source through the release
        // frame too; an opening hand must not switch it to another panel.
        const manipulating = items.some(item => item.grab?.id === src.id);
        if (!manipulating && this.palmStep(src, palms)) { src.state = {}; src.pokeHistory = null; src.fingers?.clear(); continue; }
        const tip = this.tipOf(src);
        const joints = src.hand.visible ? ['index-finger-tip','thumb-tip','middle-finger-tip','ring-finger-tip','pinky-finger-tip']
          .map(name => src.hand.joints?.[name]).filter(j => j?.visible) : [];
        const points = joints.map(j => j.getWorldPosition(new THREE.Vector3()));
        if (!points.length && tip) points.push(tip);
        let dist = Infinity;
        for (const c of components) {
          _box.setFromObject(c);
          for (const point of points) dist = Math.min(dist, _box.distanceToPoint(point));
        }
        if (points.length && src.near.update(dist)) {
          const joint = src.hand.joints?.['index-finger-tip'];
          const hand = joints.length > 0;
          const radius = hand ? (Number.isFinite(joint?.jointRadius) && joint.jointRadius > 0 ? joint.jointRadius : DEFAULTS.handInput.fingertipRadius) : 0;
          if (tip && (!hand || joint?.visible)) {
            this.handPoints.push(tip);
            this.pokeStep(src, tip, items, radius, hand ? DEFAULTS.handInput.pressOffset : 0);
          } else src.pokeHistory = null;
          // History belongs to each fingertip, while pinch/palm capture
          // belongs to the hand. The index keeps the legacy source id.
          src.fingers ??= new Map();
          if (hand && !src.selecting && !manipulating) {
            for (const name of ['thumb-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip']) {
              const joint = src.hand.joints[name];
              if (!joint?.visible) { src.fingers.delete(name); continue; }
              let finger = src.fingers.get(name);
              if (!finger) { finger = { id: `${src.id}:${name}`, sourceId: src.id, selecting: false }; src.fingers.set(name, finger); }
              const point = joint.getWorldPosition(new THREE.Vector3());
              const r = Number.isFinite(joint.jointRadius) && joint.jointRadius > 0 ? joint.jointRadius : DEFAULTS.handInput.fingertipRadius;
              this.handPoints.push(point);
              this.pokeStep(finger, point, items, r, DEFAULTS.handInput.pressOffset);
            }
          } else src.fingers.clear();
          src.state = {};
        } else {
          src.pokeHistory = null; src.fingers?.clear();
          src.line.visible = true;
          const origin = new THREE.Vector3().setFromMatrixPosition(src.ray.matrixWorld);
          const dir = new THREE.Vector3(0, 0, -1).transformDirection(src.ray.matrixWorld);
          this.rayStep(src, new THREE.Ray(origin, dir), src.selecting, 0, items);
        }
      }
    } else if (this.mouse.resetBlocked && this.mouse.pressed) {
      this.mouse.seen = true;
    } else if (this.mouse.inside || this.mouse.pressed) {
      this.mouse.resetBlocked = false;
      this.raycaster.setFromCamera(this.mouse.ndc, this.camera);
      const wheel = this.mouse.wheel;
      this.mouse.wheel = 0;
      this.rayStep(this.mouse, this.raycaster.ray.clone(), this.mouse.pressed && !this.mouse.looking, wheel, items);
      this.mouse.seen = true;
      if (this.mouse.upPending) { this.mouse.upPending = false; this.mouse.pressed = false; this.mouse.looking = false; }
    } else {
      this.mouse.state = {};
    }
  }

  pokeStep(src, worldPoint, items, radius = 0, pressOffset = 0) {
    const probes = items.filter(item=>!item.continuingOwner || item.continuingOwner===src.id)
      .map(item => ({ item, point: item.inputCaptureInverse ? worldPoint.clone().applyMatrix4(item.inputCaptureInverse) : item.worldToLocal(worldPoint.clone()) }));
    const previous = src.pokeHistory;
    const continuous = previous && previous.frame === this.frame - 1
      && previous.point.distanceTo(worldPoint) <= DEFAULTS.handInput.iconApproachMaxStep;
    const samples = new Map(probes.filter(({ item }) => item.pokeContact)
      .map(({ item, point }) => [item, item.pokeContact(point, radius)]));
    const crossings = new Map(probes.map(({ item }) => {
      const before = continuous && previous.samples.get(item), current = samples.get(item);
      // Physical acquisition must cross the previously observed skin too:
      // radius/geometry growth around a stationary tip is not a touch.
      return [item, before?.separation > 0 && current?.separation <= 0
        && worldPoint.distanceTo(before.centre) <= before.radius
        ? { previousGap: before.separation } : null];
    }));
    src.pokeHistory = { frame: this.frame, point: worldPoint.clone(), samples };
    // One fingertip has one proximity target, including hover. Captured
    // presses/grabs keep that target until release or tracking loss.
    let target = probes.find(({ item, point }) => item.pokeDistance &&
      ((item.press?.pressed && item.pressKind === 'poke' && item.pressOwner === src.id
        && (item.retainsPokeCapture?.(point, radius, crossings.get(item)) ?? true))
        || item.grab?.id === src.id))?.item;
    if (!target) {
      let nearest = Infinity;
      for (const { item, point } of probes) {
        const distance = item.pokeDistance?.(point) ?? Infinity;
        if (distance < nearest) { nearest = distance; target = item; }
      }
    }
    // Special handles (the Dock shelf) retain their own arbitration.
    // Radius is in world metres; consumers convert it through their scale.
    for (const { item, point } of probes) if (!item.pokeDistance || item === target) {
      item.feed({ kind: 'poke', id: src.id, sourceId: src.sourceId ?? src.id, point, radius, pressOffset, pinch: src.selecting,
        surfaceCrossing: crossings.get(item) });
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
      const hit = this.raycaster.intersectObjects(items.filter(i=>!i.continuingOwner).flatMap(i => i.hitMeshes), false)[0];
      if (hit) { target = hit.object.userData.owner; worldPoint = hit.point; }
    }
    st.hover = !!target;
    if (!target) { st.wasPressed = pressed; return; }

    if (target.inputCaptureInverse) _m.copy(target.inputCaptureInverse);
    else _m.copy(target.matrixWorld).invert();
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
