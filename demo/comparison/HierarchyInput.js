import * as THREE from 'three';

// Current Button input lifecycle for the hierarchy fixture. Existing action
// fixture remains byte-frozen; this owns only new entry listeners and probes.
export class HierarchyInput {
  constructor(input,getButtons,tick){
    this.input=input;this.getButtons=getButtons;this.tick=tick;this.lostNear=new Map();this.semanticHeld=new Set();this.replacementBlocked=new Set();
    this.unbind = [];
    if (input) {
      const bind = (target, type, callback) => {
        target.addEventListener(type, callback);
        this.unbind.push(() => target.removeEventListener(type, callback));
      };
      const sample = () => {
        input.scene.updateMatrixWorld(true); input.camera.updateMatrixWorld(true);
        input.update(); this.tick(0);
      };
      for (const source of input.xr) {
        bind(source.ray, 'selectend', () => {this.semanticHeld.delete(source.id);this.replacementBlocked.delete(source.id);sample();});
        bind(source.ray, 'selectstart', () => {
          this.semanticHeld.add(source.id);
          if (this.replacementBlocked.has(source.id)) {source.resetBlocked=true;return;}
          if (!source.connected || !source.ray.visible || source.resetBlocked) return;
          input.scene.updateMatrixWorld(true);
          if (!this.isFarPose(source)) return;
          this.primeRay(source, new THREE.Ray(source.ray.getWorldPosition(new THREE.Vector3()),
            new THREE.Vector3(0, 0, -1).transformDirection(source.ray.matrixWorld)));
        });
      }
      const el = input.renderer.domElement;
      bind(el, 'pointerdown', event => {
        const rect=el.getBoundingClientRect();if(Number.isFinite(event.clientX))input.mouse.ndc.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
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
    for(const source of input?.xr??[]){
      const cancel=()=>this.cancelSource(source);
      for(const type of ['connected','disconnected']){source.ray.addEventListener(type,cancel);this.unbind.push(()=>source.ray.removeEventListener(type,cancel));}
    }
  }
  get buttons(){return this.getButtons();}
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
        const pending = button.consumeProbes(); button.updatePress(0); button.clearHoverFeedback();
        for (const probe of pending) button.feed(probe);
      }
    }
  }

  cancelSource(source){
    // Shared source listeners clear selecting before our event callback.
    // Retain our own semantic edge history across disconnect/connect.
    if(this.semanticHeld.has(source.id))this.replacementBlocked.add(source.id);
    for(const button of this.buttons){
      button.probes=button.probes.filter(p=>p.id!==source.id&&!p.id.startsWith(source.id+':'));
      if(button.press.pressed&&(button.pressOwner===source.id||button.pressOwner?.startsWith(source.id+':'))){const pending=button.consumeProbes();button.updatePress(0);button.clearHoverFeedback();for(const p of pending)button.feed(p);}
    }
    source.state={};source.resetBlocked||=source.selecting||this.replacementBlocked.has(source.id);
  }
  update(){
    for(const source of this.input?.xr??[])if(this.replacementBlocked.has(source.id)){
      source.state={};source.resetBlocked=true;
      for(const button of this.buttons)button.probes=button.probes.filter(p=>p.id!==source.id&&!p.id.startsWith(source.id+':'));
    }
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
  }
  dispose(){for(const f of this.unbind)f();this.unbind=[];this.lostNear.clear();this.semanticHeld.clear();this.replacementBlocked.clear();}
}
