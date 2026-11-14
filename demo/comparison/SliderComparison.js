import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { ZSlider } from '../../src/components/ZSlider.js';
import { makeText } from '../../src/core/look.js';
import { PlanarSlider } from './PlanarSlider.js';
import { pickProbe } from '../../src/core/Interactable.js';
import { Button } from '../../src/components/Button.js';

function sceneLabel(lines, width, height) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, depthWrite: false }));
  label.userData.ownedMap = map;
  label.setText = nextLines => {
    ctx.font = '500 64px system-ui, sans-serif';
    canvas.width = Math.ceil(Math.max(...nextLines.map(line => ctx.measureText(line).width)) + 96);
    canvas.height = 128 * nextLines.length;
    ctx.font = '500 64px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    nextLines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 64 + 128 * i));
    label.text = nextLines.join('\n'); map.needsUpdate = true;
    // Fit the text canvas without stretching glyphs when the scope changes.
    const aspect = canvas.width / canvas.height;
    label.scale.set(Math.min(1, height * aspect / width), Math.min(1, width / aspect / height), 1);
  };
  label.setText(lines);
  return label;
}

// Only the comparison's programmatic mirror suppresses events. Real Z input
// keeps the existing change, detent and sound behavior of the public control.
class MirroredZSlider extends ZSlider {
  dispatchEvent(event) { if (!this.mirroring) super.dispatchEvent(event); }
  mirror(value) {
    this.mirroring = true;
    try { this.setValue(value, { silent: true }); this.update(0); }
    finally { this.mirroring = false; }
  }
}

function makeResult() {
  const result = new THREE.Group();
  const label = sceneLabel(['밝기'], 0.08, 0.02);
  label.position.y = 0.067;
  const number = makeText('100%', { size: 0.014 });
  number.position.y = -0.045;
  const sample = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.7, 0.7), toneMapped: false }));
  result.add(label, number, sample);
  return Object.assign(result, { number, sample });
}

export class SliderComparison extends THREE.Group {
  constructor(T) {
    super();
    this.controls = {
      x: new PlanarSlider(T, { value: 1 }),
      z: new MirroredZSlider(T, { value: 1, distance: 0.6, icon: 'sun' }),
    };
    // Reuse the original web-demo Z control. Capture transport remains a
    // fixture lifecycle guard; native joint pinch is not enabled for Z.
    this.controls.z.retainRayCapture = true;
    this.controls.z.retainPokeCapture = true;
    this.results = { x: makeResult(), z: makeResult() };
    for (const [key, x] of [['x', -0.14], ['z', 0.14]]) {
      this.controls[key].position.x = x;
      this.results[key].position.set(x, 0.16, 0);
      this.add(this.controls[key], this.results[key]);
    }
    // The original horizontal-plane ray mapping needs an oblique view.
    // This is a fixture orientation, not a change to ZSlider input/feedback.
    this.controls.z.rotation.y = -0.35;
    this.inputSources = [];
    this.guidance = {
      x: sceneLabel(['가까이: 닿아 가로 이동', '원거리 손: 지목 후 집은 채 이동', '컨트롤러: 트리거 누른 채 이동'], 0.25, 0.075),
      z: sceneLabel(['가까이: 누르거나 집어 앞뒤 이동', '원거리 손: 지목 후 집은 채 이동', '컨트롤러: 트리거 누른 채 이동'], 0.25, 0.075),
    };
    this.guidanceLines = Object.fromEntries(Object.entries(this.guidance).map(([key, label]) => [key, label.text.split('\n')]));
    for (const key of ['x', 'z']) {
      this.guidance[key].position.set(this.controls[key].position.x, -0.075, 0.004);
      this.add(this.guidance[key]);
    }
    this.scopeLabel = sceneLabel(['가상 화면 밝기'], 0.3, 0.025);
    this.scopeLabel.position.set(0, 0.28, 0);
    this.add(this.scopeLabel);
    this.restoreControl = new Button(T, { width: 170, height: 48, distance: 0.6, variant: 'secondary' });
    this.restoreControl.position.set(0, -0.15, 0);
    const restoreLabel = sceneLabel(['밝기 복원'], 0.08, 0.018);
    restoreLabel.position.z = this.restoreControl.t + 0.001;
    this.restoreControl.face.add(restoreLabel);
    this.restoreControl.addEventListener('select', () => this.restoreBrightness());
    this.add(this.restoreControl);
    this.brightness = 1;
    this.owner = null;
    this.blocked = new Set();
    this.lastProbes = { x: [], z: [] };
    for (const [key, control] of Object.entries(this.controls)) {
      control.addEventListener('change', event => {
        if (!this.owner || this.owner.key === key) this.brightness = event.value;
      });
    }
  }

  setScopeLabel(text) {
    if (this.scopeLabel.text !== text) this.scopeLabel.setText([text]);
  }

  updateGuidance(key, probe) {
    const source = probe && this.inputSources.find(s => s.connected && s.id === (probe.sourceId ?? probe.id));
    const priority = probe?.kind === 'ray' && source?.handSource !== undefined ? (source.handSource ? 1 : 2) : 0;
    const lines = this.guidanceLines[key];
    const ordered = [lines[priority], ...lines.filter((_, i) => i !== priority)];
    if (this.guidance[key].text !== ordered.join('\n')) this.guidance[key].setText(ordered);
  }

  released(control, probe) {
    if (probe.kind === 'ray') return !probe.pressed;
    const scale = Math.abs(control.getWorldScale(new THREE.Vector3()).z);
    return !probe.pinch && probe.point.z - (probe.radius ?? 0) / scale
      > control.frontZ + control.T.get('input.poke.distance.release') / scale;
  }

  restoreBrightness() {
    if (this.disposed) return;
    for (const [key, control] of Object.entries(this.controls)) {
      for (const probe of this.lastProbes[key]) {
        if (!this.released(control, probe)) this.blocked.add(probe.id);
      }
      if (control.grab) this.blocked.add(control.grab.id);
      control.grab = null;
      control.consumeProbes();
    }
    this.owner = null;
    this.brightness = 1;
    this.syncResults();
    this.onRestore?.();
  }

  update(dt) {
    if (this.disposed) return;
    const batches = Object.fromEntries(Object.entries(this.controls).map(([key, control]) => [key, control.consumeProbes()]));
    this.lastProbes = batches;
    this.restoreControl.update(dt);
    for (const [key, probes] of Object.entries(batches)) for (const probe of probes) {
      if (this.released(this.controls[key], probe)) this.blocked.delete(probe.id);
    }
    // Physical fingers have independent contact ids. A pinch belongs to the
    // same tracked hand; promote only that hand's current contact owner.
    // Its index may have been excluded while the thumb held the contact.
    // A fresh pinch can promote it before the competing-source filter.
    if (this.owner) {
      const owner = this.owner, control = this.controls[owner.key];
      const pinch = batches[owner.key].find(p => p.kind === 'poke' && p.pinch && p.pinchStarted !== false
        && (p.sourceId ?? p.id) === owner.sourceId);
      if (pinch && pinch.id !== owner.id) {
        this.blocked.delete(pinch.id);
        if (control.grab?.id === owner.id) control.grab.id = pinch.id;
        this.owner = { ...owner, id: pinch.id };
      }
    }
    const eligible = Object.fromEntries(Object.entries(batches).map(([key, probes]) => [key,
      probes.filter(p => !this.blocked.has(p.id))
        .map(p => p.kind === 'ray' && !p.pressed ? { ...p, captured: false } : p),
    ]));
    const choose = (key, probes) => {
      const control = this.controls[key];
      return pickProbe(probes, p => p.kind === 'ray' ? 0 : control.pokeDistance(p.point), control.grab?.id).probe;
    };
    const candidates = Object.fromEntries(Object.keys(this.controls).map(key => [key, choose(key, eligible[key])]));
    const previousOwner = this.owner;
    // On a simultaneous acquisition, source id then control key is the fixed
    // tie-break. A prior owner always runs first, even on its release frame.
    const keys = Object.keys(this.controls).sort((a, b) => {
      if (previousOwner?.key === a) return -1;
      if (previousOwner?.key === b) return 1;
      const id = key => candidates[key]?.id ?? '\uffff';
      return id(a).localeCompare(id(b)) || a.localeCompare(b);
    });
    let frameOwner = previousOwner;
    for (const key of keys) {
      const control = this.controls[key];
      const probes = eligible[key].filter(probe => {
        const excluded = frameOwner && (frameOwner.key !== key || frameOwner.id !== probe.id);
        if (excluded && !this.released(control, probe)) this.blocked.add(probe.id);
        return !excluded && !this.blocked.has(probe.id);
      });
      const selected = choose(key, probes);
      this.updateGuidance(key, selected);
      const before = control.value;
      probes.forEach(p => control.feed(p));
      control.update(dt);
      // The original Z grab stores only id/offset. Annotate the acquired
      // mapping for InputSystem's loss/capture guard, without changing its
      // acquisition, offset, public value or feedback implementation.
      if (key === 'z' && control.grab && selected?.id === control.grab.id) {
        control.grab.kind = selected.kind === 'ray' ? 'ray' : 'pinch';
      }
      const active = selected && (control.grab || control.engaged || control.value !== before);
      if (active && !frameOwner) frameOwner = { key, id: selected.id, sourceId: selected.sourceId ?? selected.id };
      if (frameOwner?.key === key) {
        this.owner = active ? frameOwner : null;
        if (!active && !batches[key].some(p => p.id === frameOwner.id && this.released(control, p))) {
          this.blocked.add(frameOwner.id);
        }
      }
    }
    this.syncResults();
  }

  syncResults() {
    for (const key of ['x', 'z']) {
      const control = this.controls[key], result = this.results[key];
      if (control.value !== this.brightness) {
        if (key === 'z') control.mirror(this.brightness);
        else control.setValue(this.brightness, { silent: true });
      }
      // Mirroring is presentation, never a user change or detent commit.
      const value = control.value;
      const text = `${Math.round(value * 100)}%`;
      if (result.number.text !== text) { result.number.text = text; result.number.sync(); }
      // A neutral reference patch; the scene dimmer is the brightness result.
      result.sample.material.color.setRGB(0.7, 0.7, 0.7);
    }
    this.onBrightness?.(this.brightness);
  }

  dispose() {
    if (this.disposed) return;
    this.restoreBrightness();
    this.disposed = true;
    for (const control of Object.values(this.controls)) {
      control.enabled = false; control.grab = null; control.consumeProbes();
    }
    const geometries = new Set(), materials = new Set(), texts = [];
    this.restoreControl.enabled = false;
    this.traverse(object => {
      if (object instanceof Text) texts.push(object);
      else if (object.geometry) geometries.add(object.geometry);
      if (object.material && !(object instanceof Text)) materials.add(object.material);
      object.userData.ownedMap?.dispose();
    });
    texts.forEach(text => text.dispose());
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    // haloTexture() creates this map per ZSlider instance, unlike softTexture
    // and the icon atlas. Material disposal does not dispose its map.
    this.controls.z.halo.material.map.dispose();
    // Shared ZSlider texture caches belong to the existing renderer path.
    this.removeFromParent();
  }
}
