import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens } from '../src/tokens.js';
import { InputSystem } from '../src/core/InputSystem.js';
import { WindowResizeComparison } from '../demo/comparison/WindowResizeComparison.js';

const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url))));
function rig() {
  const scene = new THREE.Scene();
  const renderer = { domElement: new THREE.EventDispatcher(), xr: {
    getController: () => new THREE.Group(), getControllerGrip: () => new THREE.Group(), getHand: () => new THREE.Group(),
  } };
  const input = new InputSystem({ T, renderer, scene, camera: new THREE.PerspectiveCamera() });
  const view = new WindowResizeComparison(T, input);
  view.onReset=()=>input.reset();
  scene.add(view); scene.updateMatrixWorld(true);
  const source = { id: 'pointer', state: {} };
  const aim = (point, pressed, ptr = source) => {
    scene.updateMatrixWorld(true);
    input.rayStep(ptr, new THREE.Ray(point.clone().add(new THREE.Vector3(0, 0, 0.4)), new THREE.Vector3(0, 0, -1)), pressed, 0, input.collect().items);
    view.update(1 / 60);
  };
  return { view, input, source, aim };
}

test('a corner drag grows the chosen outer window faster than content, without resizing its peer', () => {
  const { view, aim } = rig(), w = view.windows.flat;
  try {
    const h = w.handles[1], start = h.getWorldPosition(new THREE.Vector3()), centre = w.getWorldPosition(new THREE.Vector3());
    const end = start.clone().sub(centre).multiplyScalar(1.4).add(centre);
    aim(start, false); assert.equal(w.result.q, 1);
    aim(start, true); aim(end, true);
    assert.ok(Math.abs(w.result.width - .3024) < 1e-6);
    assert.ok(w.result.titleSize > .0189 && w.result.titleSize < .02646);
    assert.equal(view.windows.contour.result.q, 1);
    assert.equal(w.handles[1], h, 'the acquired visible handle is not replaced');
    const size = w.result.width;
    aim(start, false); assert.equal(w.result.width, size, 'release keeps the last size');
    assert.equal(w.owner, null);
  } finally { view.dispose(); }
});

test('loss preserves size and prevents a previously competing held input from stealing the window', () => {
  const { view, aim, input } = rig(), w=view.windows.flat, first={id:'first',state:{}}, second={id:'second',state:{}};
  try {
    const a=w.handles[1].getWorldPosition(new THREE.Vector3()), b=w.handles[0].getWorldPosition(new THREE.Vector3());
    aim(a,true,first);
    // Both actual ray sources feed one frame; hover from a third source is irrelevant.
    for(const [ptr,point] of [[first,a],[second,b]]) input.rayStep(ptr,new THREE.Ray(point.clone().add(new THREE.Vector3(0,0,.4)),new THREE.Vector3(0,0,-1)),true,0,input.collect().items);
    view.update(1/60);
    const q=w.result.q;
    aim(b,true,second); // first source lost while second remains held
    assert.equal(w.owner?.id,undefined);
    assert.equal(w.result.q,q);
    aim(b,false,second);aim(b,true,second);
    assert.equal(w.owner?.id,'second');
  } finally {view.dispose();}
});

for(const key of ['flat','contour']) test(`${key} bounds size, keeps capture stable under rotated parents, and resets held input safely`, () => {
  const {view,input,aim}=rig(),w=view.windows[key];
  try {
    view.rotation.z=.2;view.updateMatrixWorld(true);
    const h=w.handles[1], start=h.getWorldPosition(new THREE.Vector3()),centre=w.getWorldPosition(new THREE.Vector3());
    const radial=f=>start.clone().sub(centre).multiplyScalar(f).add(centre);
    aim(start,false);aim(start,true);aim(radial(2),true);
    assert.equal(w.result.q,22/15);assert.ok(Math.abs(w.result.width-.3168)<1e-9);
    const paneMesh=w.pane.body??w.pane;paneMesh.geometry.computeBoundingBox();
    const physical=paneMesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(paneMesh.getWorldScale(new THREE.Vector3()));
    assert.ok(Math.abs(physical.x-.3168)<1e-6,'visible pane geometry matches the declared width');
    assert.ok(Math.abs(physical.y-.42438)<1e-6,'visible pane geometry matches the declared height');
    assert.ok(Math.abs(w.title.fontSize*w.title.getWorldScale(new THREE.Vector3()).x-w.result.titleSize)<1e-9);
    assert.ok(w.result.titleSize>.0237&&w.result.titleSize<.0239);
    assert.equal(h,w.handles[1]);assert.equal(h.grab?.id,'pointer');
    aim(radial(2),true);assert.equal(w.result.q,22/15,'stationary held input cannot compound scale');
    aim(radial(.5),true);assert.equal(w.result.q,1);
    aim(radial(1.3),true);const valid=w.result.width;
    w.setSize(NaN);w.setSize(Infinity);assert.equal(w.result.width,valid);
    view.update(1/60);assert.equal(w.owner?.id,undefined,'loss releases capture');assert.equal(w.result.width,valid);
    aim(radial(1.4),true);assert.equal(w.result.width,valid,'lost held input cannot rearm');
    aim(start,false);aim(h.getWorldPosition(new THREE.Vector3()),true);
    view.resetSizes();assert.equal(w.result.q,1);assert.equal(w.owner?.id,undefined);
    aim(radial(2),true);assert.equal(w.result.q,1);
    aim(start,false);aim(start,true);aim(radial(1.4),true);assert.ok(Math.abs(w.result.width-.3024)<1e-6);
    assert.equal(w.result.textReady,false,'Node font stand-ins do not prove actual row fit');
    view.dispose();assert.equal(input.collect().items.length,0);
  }finally{view.dispose();}
});

test('both windows share growth metrics at equal sizes while targets stay confined to corners and reset', () => {
  const {view,input,aim}=rig();
  try {
    for(const w of Object.values(view.windows)) {
      const h=w.handles[1],start=h.getWorldPosition(new THREE.Vector3()),centre=w.getWorldPosition(new THREE.Vector3());
      aim(start,false);aim(start,true);aim(start.clone().sub(centre).multiplyScalar(1.4).add(centre),true);aim(start,false);
    }
    for(const key of ['q','width','height','titleSize','subtitleSize','pitch'])assert.ok(Math.abs(view.windows.flat.result[key]-view.windows.contour.result[key])<1e-10);
    const items=input.collect().items;
    assert.equal(items.length,5);assert.ok(items.every(i=>i===view.resetControl||Object.values(view.windows).some(w=>w.handles.includes(i))));
    assert.equal(view.windows.flat.dataset,view.windows.contour.dataset);
  }finally{view.dispose();}
});

for(const key of ['flat','contour']) test(`${key} semantic XR drag retains its start frame and cancels on ray pose loss`, () => {
  const {view,input}=rig(),w=view.windows[key],h=w.handles[1],src=input.xr[0];
  try {
    view.resetControl.visible=false; // Node font boundary must not enter distance bounds.
    input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
    const start=h.getWorldPosition(new THREE.Vector3()),centre=w.getWorldPosition(new THREE.Vector3());
    const frame=(factor,near=false)=>{
      const p=start.clone().sub(centre).multiplyScalar(factor).add(centre);
      src.ray.position.copy(p).add(new THREE.Vector3(0,0,.4));src.grip.position.copy(p).add(new THREE.Vector3(0,0,near ? .01 : .4));
      view.parent.updateMatrixWorld(true);input.update();view.update(1/60);
    };
    frame(1);src.ray.dispatchEvent({type:'selectstart'});frame(1);frame(1.2,true);
    assert.ok(Math.abs(w.result.q-1.2)<1e-6);assert.equal(w.owner?.id,src.id);
    src.ray.visible=false;frame(1.3,true);assert.equal(w.owner?.id,undefined);const q=w.result.q;
    src.ray.visible=true;frame(1.4);assert.equal(w.result.q,q);
    src.ray.dispatchEvent({type:'selectend'});frame(1.2);
    src.ray.dispatchEvent({type:'selectstart'});frame(1.2);frame(1.4);
    assert.ok(w.result.q>q);
  }finally{view.dispose();}
});

test('a near semantic pinch uses the visible corner, and loss preserves its last size', () => {
  const {view,input}=rig(),w=view.windows.contour,h=w.handles[1],src={id:'hand',selecting:true};
  try {
    const start=h.localToWorld(new THREE.Vector3(0,0,h.t)),centre=w.getWorldPosition(new THREE.Vector3());
    const step=(f,pinch=true)=>{src.selecting=pinch;view.parent.updateMatrixWorld(true);input.pokeStep(src,start.clone().sub(centre).multiplyScalar(f).add(centre),input.collect().items,.008);view.update(1/60);};
    step(1,false);assert.equal(w.result.q,1);step(1);step(1.3);
    assert.ok(Math.abs(w.result.q-1.3)<1e-6);const q=w.result.q;
    step(1,false);assert.equal(w.result.q,q);assert.equal(w.owner?.id,undefined);
  }finally{view.dispose();}
});


for(const key of ['flat','contour']) for(const reason of ['pose-loss','reset']) for(const releaseFrame of [true,false]) test(`${key} semantic release rearms after ${reason}; release frame=${releaseFrame}, no extra hover frame`, () => {
  const {view,input}=rig(), w=view.windows[key], h=w.handles[1], src=input.xr[0];
  try {
    view.resetControl.visible=false;
    input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
    const frame=point=>{
      src.ray.position.copy(point).add(new THREE.Vector3(0,0,.4));src.grip.position.copy(src.ray.position);
      view.parent.updateMatrixWorld(true);input.update();view.update(1/60);
    };
    const start=h.getWorldPosition(new THREE.Vector3());
    frame(start);src.ray.dispatchEvent({type:'selectstart'});frame(start);
    assert.equal(w.owner?.id,src.id);
    if(reason==='pose-loss'){src.ray.visible=false;frame(start);src.ray.visible=true;}else view.resetSizes();
    assert.equal(w.owner,null);frame(start);assert.equal(w.owner,null,'still held cannot rearm after loss/reset');
    const empty=new THREE.Vector3(10,10,0);
    src.ray.dispatchEvent({type:'selectend'});if(releaseFrame){frame(empty);assert.equal(src.state.hover,false,'the release has no UI hit or probe');}
    const q=w.result.q;src.ray.dispatchEvent({type:'selectstart'});frame(start);
    const centre=w.getWorldPosition(new THREE.Vector3());frame(start.clone().sub(centre).multiplyScalar(1.2).add(centre));
    assert.ok(w.result.q>q,'a fresh drag after empty-space release must resize again');
  } finally {view.dispose();}
});


for(const key of ['flat','contour']) test(`${key} desktop release away from UI rearms only its source after reset`, () => {
  const {view,input,aim}=rig(), w=view.windows[key], peer=view.windows[key==='flat'?'contour':'flat'];
  const mouse=input.mouse,other={id:'other',state:{}};
  try {
    const start=w.handles[1].getWorldPosition(new THREE.Vector3()),peerStart=peer.handles[0].getWorldPosition(new THREE.Vector3());
    for(const [ptr,p] of [[mouse,start],[other,peerStart]])input.rayStep(ptr,new THREE.Ray(p.clone().add(new THREE.Vector3(0,0,.4)),new THREE.Vector3(0,0,-1)),true,0,input.collect().items);
    view.update(1/60);assert.ok(w.owner);assert.ok(peer.owner);
    view.resetSizes();mouse.state={};other.state={};
    aim(start,true,mouse);assert.equal(w.result.q,1);assert.equal(w.owner,null);
    input.renderer.domElement.dispatchEvent({type:'pointerup'});
    aim(new THREE.Vector3(10,10,0),false,mouse);
    aim(start,true,mouse);const centre=w.getWorldPosition(new THREE.Vector3());
    aim(start.clone().sub(centre).multiplyScalar(1.2).add(centre),true,mouse);
    assert.ok(w.result.q>1,'fresh mouse drag can grow again');
    aim(peerStart,true,other);assert.equal(peer.result.q,1);assert.equal(peer.owner,null,'mouse release does not rearm another held source');
  }finally{view.dispose();}
});


for(const key of ['flat','contour']) test(`${key} retains a live near semantic capture across the far distance boundary`, () => {
  const {view,input}=rig(),w=view.windows[key],h=w.handles[1],src=input.xr[0];
  try {
    view.resetControl.visible=false;input.renderer.xr.isPresenting=true;
    src.ray.dispatchEvent({type:'connected',data:{}});
    src.ray.position.set(10,10,1); // A valid unrelated ray must not replace the acquired grip.
    const start=h.localToWorld(new THREE.Vector3(0,0,h.t??h.frontZ)),centre=w.getWorldPosition(new THREE.Vector3());
    const frame=p=>{src.grip.position.copy(p);view.parent.updateMatrixWorld(true);input.update();view.update(1/60);};
    frame(start);src.ray.dispatchEvent({type:'selectstart'});frame(start);assert.equal(w.owner?.id,src.id);
    for(let i=1;i<=9;i++)frame(start.clone().add(new THREE.Vector3(0,0,.05*i)));
    assert.equal(w.owner?.id,src.id,'distance alone cannot release the existing source');
    assert.equal(w.owner?.handle,h);assert.equal(w.result.q,1,'pure depth motion cannot resize');
    frame(start.clone().sub(centre).multiplyScalar(1.2).add(centre).add(new THREE.Vector3(0,0,.45)));
    assert.ok(Math.abs(w.result.q-1.2)<1e-6,'captured XY delta remains in its original frame');
    const q=w.result.q;src.grip.visible=false;frame(start);assert.equal(w.owner,null);assert.equal(w.result.q,q);
    src.grip.visible=true;frame(start);assert.equal(w.owner,null,'pose recovery while held cannot reacquire');
    src.ray.dispatchEvent({type:'selectend'});frame(start);src.ray.dispatchEvent({type:'selectstart'});frame(h.localToWorld(new THREE.Vector3(0,0,h.t??h.frontZ)));assert.equal(w.owner?.id,src.id);
  }finally{view.dispose();}
});


for(const key of ['flat','contour']) test(`${key} semantic hand release rearms after joint loss without enabling native capture`, () => {
  const {view,input}=rig(),w=view.windows[key],h=w.handles[1],src=input.xr[0];
  try {
    view.resetControl.visible=false;input.renderer.xr.isPresenting=true;
    src.hand.joints={'index-finger-tip':new THREE.Group(),'thumb-tip':new THREE.Group()};
    for(const joint of Object.values(src.hand.joints)){src.hand.add(joint);joint.jointRadius=.008;}
    src.ray.dispatchEvent({type:'connected',data:{hand:{}}});
    const start=h.localToWorld(new THREE.Vector3(0,0,h.t??h.frontZ)),centre=w.getWorldPosition(new THREE.Vector3());
    const frame=p=>{src.hand.joints['index-finger-tip'].position.copy(p);src.hand.joints['thumb-tip'].position.copy(p).add(new THREE.Vector3(.03,0,0));view.parent.updateMatrixWorld(true);input.update();view.update(1/60);};
    frame(start);src.ray.dispatchEvent({type:'selectstart'});frame(start);assert.equal(w.owner?.id,src.id);
    src.hand.visible=false;frame(start);assert.equal(w.owner,null);
    src.hand.visible=true;frame(start);assert.equal(w.owner,null,'held pose recovery cannot recapture');
    // Both semantic events occur before the next frame. Native fallback remains off.
    src.ray.dispatchEvent({type:'selectend'});src.ray.dispatchEvent({type:'selectstart'});frame(start);
    frame(start.clone().sub(centre).multiplyScalar(1.2).add(centre));
    assert.ok(Math.abs(w.result.q-1.2)<1e-6,'real semantic release rearms the same hand after loss');
    src.ray.dispatchEvent({type:'selectend'});frame(start);
    src.hand.dispatchEvent({type:'pinchstart'});frame(h.localToWorld(new THREE.Vector3(0,0,h.t??h.frontZ)));
    assert.equal(w.owner,null,'native pinch alone still cannot acquire a fixture corner');
  }finally{view.dispose();}
});
