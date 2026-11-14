import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { Button } from '../../src/components/Button.js';
import { Toolbar } from '../../src/components/Toolbar.js';
import { PlanarAction } from './PlanarAction.js';
import { HoverGroup } from '../../src/core/HoverGroup.js';
import { markComponent } from '../../src/core/Interactable.js';

const INITIAL = '아직 실행하지 않았습니다';
const TOOLS = [
  { label: 'Action A', icon: 'plus', primary: true, shape: 'capsule', width: 150, density: 'firm' },
  { name: 'Action B', icon: 'rotate-3d', shape: 'circle', density: 'soft' },
  { name: 'Action C', icon: 'lock', shape: 'circle', density: 'rigid' },
  { name: 'Unavailable', icon: 'trash-2', shape: 'circle', disabled: true },
];

function label(text, width = .27, height = .025) {
  const canvas = document.createElement('canvas'); canvas.height = 128; canvas.width = Math.round(canvas.height * width / height);
  const ctx = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.userData.ownedMap = texture;
  mesh.setText = value => {
    mesh.text = value; ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '500 70px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
    ctx.fillText(value, canvas.width / 2, canvas.height / 2, canvas.width - 32); texture.needsUpdate = true;
  };
  mesh.setText(text); return mesh;
}

export class ActionComparison extends THREE.Group {
  constructor(T, input = null) {
    super(); this.input = input; this.sides = {}; this.lostNear = new Map();
    const toolbar = new Toolbar(T, { tools: TOOLS, distance: .6, gap: 4, pad: 10 });
    for (const [key, sign] of [['flat', -1], ['contour', 1]]) {
      const group = new THREE.Group(); group.position.x = sign * (toolbar.size.W / 2 + .045);
      const standalone = new (key === 'flat' ? PlanarAction : Button)(T,
        { label: 'Action', icon: 'plus', distance: .6, variant: 'secondary', density: 'firm', thickness: 'regular' });
      standalone.position.y = .08;
      const heading = label(key === 'flat' ? '평면' : 'Contour'); heading.position.y = .2;
      const notice = label(INITIAL); notice.position.y = -.15;
      group.add(heading, standalone, notice); this.add(group);
      this.sides[key] = { group, standalone, notice, toolbar: null, buttons: [standalone] };
      standalone.addEventListener('select', () => this.runAction(key, 'Action'));
    }
    this.sides.contour.toolbar = toolbar; toolbar.position.y = -.04;
    this.sides.contour.group.add(toolbar); this.sides.contour.buttons.push(...toolbar.buttons);
    const flat = markComponent(new THREE.Group());
    flat.bar = new THREE.Mesh(new THREE.PlaneGeometry(toolbar.size.W, toolbar.size.H),
      new THREE.MeshBasicMaterial({ color: 0x253043 }));
    flat.bar.position.z = toolbar.bar.t;
    flat.add(flat.bar);
    flat.buttons = TOOLS.map((options, i) => {
      const button = new PlanarAction(T, { ...options, distance: .6, thickness: 'thin' });
      button.position.copy(toolbar.buttons[i].position); flat.add(button);
      button.addEventListener('select', () => flat.dispatchEvent({ type: 'select', tool: options, index: i }));
      return button;
    });
    const hoverGroup = new HoverGroup(flat.buttons);
    flat.update = dt => { hoverGroup.update(); for (const button of flat.buttons) button.update(dt); };
    flat.position.copy(toolbar.position); this.sides.flat.group.add(flat);
    this.sides.flat.toolbar = flat; this.sides.flat.buttons.push(...flat.buttons);
    for (const [key, side] of Object.entries(this.sides)) {
      side.toolbar.addEventListener('select', e => this.runAction(key, e.tool.label ?? e.tool.name));
      for (let i = 1; i < TOOLS.length; i++) {
        const caption = label(TOOLS[i].name, .065, .012);
        caption.position.set(side.toolbar.buttons[i].position.x, -.09, .002);
        side.group.add(caption);
      }
    }
    this.resetControl = new Button(T, { label: 'Reset', width: 110, distance: .6 });
    this.resetControl.position.y = -.235; this.add(this.resetControl);
    this.resetControl.addEventListener('select', () => { this.resetRequested = true; });
    this.unbind = [];
    if (input) {
      const bind = (target, type, callback) => {
        target.addEventListener(type, callback);
        this.unbind.push(() => target.removeEventListener(type, callback));
      };
      const sample = () => {
        input.scene.updateMatrixWorld(true); input.camera.updateMatrixWorld(true);
        input.update(); this.update(0);
      };
      for (const source of input.xr) {
        bind(source.ray, 'selectend', sample);
        bind(source.ray, 'selectstart', () => {
          if (!source.connected || !source.ray.visible || source.resetBlocked) return;
          input.scene.updateMatrixWorld(true);
          if (!this.isFarPose(source)) return;
          this.primeRay(source, new THREE.Ray(source.ray.getWorldPosition(new THREE.Vector3()),
            new THREE.Vector3(0, 0, -1).transformDirection(source.ray.matrixWorld)));
        });
      }
      const el = input.renderer.domElement;
      bind(el, 'pointerdown', () => {
        input.scene.updateMatrixWorld(true); input.camera.updateMatrixWorld(true);
        input.raycaster.setFromCamera(input.mouse.ndc, input.camera);
        if (!input.mouse.resetBlocked) this.primeRay(input.mouse, input.raycaster.ray.clone());
        input.mouse.looking = !input.mouse.state.hover;
      });
      bind(el, 'pointerup', event => {
        // Explicit capture loss can be delivered only with the next pointer
        // event. Do not let its trailing up become a normal Button release.
        if (el.hasPointerCapture && !el.hasPointerCapture(event.pointerId)) { this.cancelMouse(); return; }
        sample(); if (!input.mouse.pressed) sample();
      });
      bind(el, 'pointercancel', () => this.cancelMouse());
      bind(el, 'lostpointercapture', () => {
        if (input.mouse.pressed && !input.mouse.upPending) this.cancelMouse();
      });
    }
  }
  isFarPose(source) {
    // Evaluate the current pose before priming: the last rendered near flag
    // may be stale when a semantic edge arrives between frames. Use the
    // existing near thresholds/components, not a new interaction threshold.
    const points = source.hand.visible ? ['index-finger-tip','thumb-tip','middle-finger-tip','ring-finger-tip','pinky-finger-tip']
      .map(name => source.hand.joints?.[name]).filter(joint => joint?.visible)
      .map(joint => joint.getWorldPosition(new THREE.Vector3())) : [];
    const tip = this.input.tipOf(source); if (!points.length && tip) points.push(tip);
    const threshold = source.near.on ? source.near.exit : source.near.enter;
    const boxes = this.input.collect().components.map(c => new THREE.Box3().setFromObject(c));
    return points.every(point => boxes.every(box => source.near.on
      ? box.distanceToPoint(point) > threshold : box.distanceToPoint(point) >= threshold));
  }
  // A real fresh select/down can precede the first hover frame. Sample its
  // actual ray hit as a front approach; never seed a press or an owner.
  primeRay(source, ray) {
    if (source.state.wasPressed) return;
    this.input.rayStep(source, ray, false, 0, this.input.collect().items);
    for (const button of this.buttons) {
      if (!button.press.pressed && button.probes.some(p => p.id === source.id)) button.update(0);
      else button.probes = button.probes.filter(p => p.id !== source.id);
    }
  }
  cancelMouse() {
    const mouse = this.input.mouse;
    Object.assign(mouse, { pressed: false, state: {}, upPending: false, looking: false });
    for (const button of this.buttons) {
      button.probes = button.probes.filter(p => p.id !== mouse.id);
      if (button.press.pressed && button.pressOwner === mouse.id) {
        const pending = button.consumeProbes(); button.update(1); button.clearHoverFeedback();
        for (const probe of pending) button.feed(probe);
      }
    }
  }
  get buttons() { return [...Object.values(this.sides).flatMap(s => s.buttons), this.resetControl]; }
  cancelInput() {
    for (const button of this.buttons) button.consumeProbes();
    this.update(1); // No input is a cancel, never a synthetic release.
    for (const button of this.buttons) button.clearHoverFeedback();
    this.input?.reset();
  }
  reset() {
    this.cancelInput();
    for (const side of Object.values(this.sides)) side.notice.setText(INITIAL);
  }
  runAction(side, action) {
    this.sides[side].notice.setText(`마지막 실행: ${action}`);
    this.dispatchEvent({ type: 'action', side, action });
  }
  update(dt) {
    // A lost near grip/fingertip is not a release through its surviving ray.
    // Keep filtering that probe until its own pose returns; other fingers
    // and sources retain their independent contacts.
    const poseLive = (id, source) => id === source.id ? !!this.input.tipOf(source)
      : source.hand.visible && !!source.hand.joints?.[id.slice(source.id.length + 1)]?.visible;
    for (const button of this.buttons) if (button.press.pressed && button.pressKind === 'poke') {
      const source = this.input?.xr.find(s => button.pressOwner === s.id || button.pressOwner?.startsWith(`${s.id}:`));
      if (source && (!source.connected || !poseLive(button.pressOwner, source))) {
        this.lostNear.set(button.pressOwner, source);
        source.state = {}; source.resetBlocked ||= source.selecting;
      }
    }
    for (const [id, source] of this.lostNear) {
      if (source.connected && poseLive(id, source)) { this.lostNear.delete(id); continue; }
      for (const button of this.buttons) button.probes = button.probes.filter(p => p.id !== id);
    }
    // This fixture cancels stale far poses before Button sees a release.
    // Keep the shared InputSystem and other comparison entries unchanged.
    for (const source of this.input?.xr ?? []) {
      const live = source.connected && source.ray.visible && source.ray.matrixWorld.elements.every(Number.isFinite);
      if (live) continue;
      let removed = false;
      for (const button of this.buttons) {
        button.probes = button.probes.filter(probe => {
          const stale = probe.kind === 'ray' && probe.id === source.id;
          removed ||= stale; return !stale;
        });
      }
      if (removed) { source.state = {}; source.resetBlocked ||= source.selecting; }
    }
    for (const side of Object.values(this.sides)) { side.standalone.update(dt); side.toolbar?.update(dt); }
    this.resetControl.update(dt);
    if (this.resetRequested) { this.resetRequested = false; this.reset(); }
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const remove of this.unbind) remove(); this.unbind = [];
    this.cancelInput();
    const geometries = new Set(), materials = new Set();
    this.traverse(o => {
      if (o instanceof Text) o.dispose();
      if (o.isInteractable) { o.enabled = false; o.consumeProbes(); }
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [o.material].flat().filter(Boolean)) materials.add(m);
      o.userData.ownedMap?.dispose();
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.removeFromParent();
  }
}
