import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens } from '../src/tokens.js';
import { InputSystem } from '../src/core/InputSystem.js';
import { ActionComparison } from '../demo/comparison/ActionComparison.js';
const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url))));
const p = (x,y,z) => new THREE.Vector3(x,y,z);
function rig() {
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),el=new THREE.EventDispatcher();
 const xr={isPresenting:false,getController:()=>new THREE.Group(),getControllerGrip:()=>new THREE.Group(),getHand:()=>new THREE.Group()};
 const input=new InputSystem({T,scene,camera,renderer:{domElement:el,xr}}),view=new ActionComparison(T,input);scene.add(view);
 const pointer={id:'public-ray',state:{}};
 function ray(button,pressed,{id=pointer,miss=false,y=0}={}) {
  scene.updateMatrixWorld(true);const origin=button.localToWorld(p(miss?1:0,y,.4));
  input.rayStep(id,new THREE.Ray(origin,p(0,0,-1).transformDirection(button.matrixWorld)),pressed,0,input.collect().items);view.update(1/60);
 }
 return {view,input,scene,pointer,ray};
}
test('visible standalone face acquisition then valid release publishes one independent action notice',()=>{
 const r=rig(),events=[];r.view.addEventListener('action',e=>events.push([e.side,e.action]));
 try{for(const side of ['flat','contour']){
  const b=r.view.sides[side].standalone;r.ray(b,false);r.ray(b,true);
  assert.equal(r.view.sides[side].notice.text,'아직 실행하지 않았습니다','press is not an action');
  assert.equal(b.press.pressed,true,'public visible hit actually acquires');r.ray(b,false);
  assert.equal(r.view.sides[side].notice.text,'마지막 실행: Action');
 }
 assert.deepEqual(events,[['flat','Action'],['contour','Action']]);
 }finally{r.view.dispose();}
});
test('each toolbar forwards one public action, including repeats, while disabled and bar remain inert',()=>{
 const r=rig(),events=[];r.view.addEventListener('action',e=>events.push([e.side,e.action]));
 try{for(const side of ['flat','contour']){
  const s=r.view.sides[side];assert.ok(s.toolbar,'both sides expose the toolbar');
  for(const index of [0,0,1,2,3]){const b=s.toolbar.buttons[index];r.ray(b,false);r.ray(b,true);r.ray(b,false);}
  assert.equal(s.notice.text,'마지막 실행: Action C');
  r.ray(s.toolbar.bar,false,{y:.019});r.ray(s.toolbar.bar,true,{y:.019});r.ray(s.toolbar.bar,false,{y:.019});
  assert.equal(s.notice.text,'마지막 실행: Action C');
 }
 assert.deepEqual(events,['flat','contour'].flatMap(s=>['Action A','Action A','Action B','Action C'].map(a=>[s,a])));
 }finally{r.view.dispose();}
});
test('reset cancels pending and held input without an action and permits a fresh click',()=>{
 const r=rig(),events=[];r.view.addEventListener('action',e=>events.push(e.action));
 try{for(const side of ['flat','contour']){
  const b=r.view.sides[side].standalone;r.ray(b,false);r.ray(b,true);
  r.view.reset();assert.equal(b.press.pressed,false);assert.equal(events.length,0);
  r.ray(b,true);r.ray(b,false);assert.equal(events.length,0,'held reset cannot release into select');
  r.ray(b,false);r.ray(b,true);r.ray(b,false);assert.equal(events.length,1);events.length=0;
  r.view.reset();assert.equal(r.view.sides[side].notice.text,'아직 실행하지 않았습니다');
 }
 }finally{r.view.dispose();}
});
for (const side of ['flat','contour']) test(`${side} far pose loss cancels instead of completing an action, and fresh input rearms`,()=>{
 const r=rig(),b=r.view.sides[side].standalone,src=r.input.xr[0],events=[];
 r.view.addEventListener('action',e=>events.push(e.action));
 try{
  r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
  const frame=()=>{r.scene.updateMatrixWorld(true);r.input.update();r.view.update(1/60);};
  src.ray.position.copy(b.getWorldPosition(p(0,0,0))).add(p(0,0,2));src.grip.position.copy(src.ray.position);
  frame();src.ray.dispatchEvent({type:'selectstart'});frame();assert.equal(b.press.pressed,true);
  src.ray.visible=false;frame();assert.equal(b.press.pressed,false,'cached invisible ray cannot remain pressed');assert.equal(events.length,0);
  src.ray.visible=true;frame();assert.equal(b.press.pressed,false);
  src.ray.dispatchEvent({type:'selectend'});frame();src.ray.dispatchEvent({type:'selectstart'});frame();
  src.ray.dispatchEvent({type:'selectend'});frame();assert.deepEqual(events,['Action']);
 }finally{r.view.dispose();}
});
test('semantic release/repress between frames completes one action each and reset release in empty space rearms',()=>{
 const r=rig(),b=r.view.sides.contour.standalone,src=r.input.xr[0],events=[];
 r.view.addEventListener('action',e=>events.push(e.action));
 try{r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
  const aim=(empty=false)=>{src.ray.position.copy(b.getWorldPosition(p(0,0,0))).add(p(empty?4:0,0,2));src.grip.position.copy(src.ray.position);r.scene.updateMatrixWorld(true);};
  const frame=()=>{r.input.update();r.view.update(1/60);};
  aim();frame();src.ray.dispatchEvent({type:'selectstart'});frame();
  src.ray.dispatchEvent({type:'selectend'});src.ray.dispatchEvent({type:'selectstart'});frame();
  assert.equal(events.length,1,'release edge is not lost when another down precedes the next frame');
  src.ray.dispatchEvent({type:'selectend'});frame();assert.equal(events.length,2);
  src.ray.dispatchEvent({type:'selectstart'});frame();r.view.reset();aim(true);
  src.ray.dispatchEvent({type:'selectend'});aim();src.ray.dispatchEvent({type:'selectstart'});frame();
  src.ray.dispatchEvent({type:'selectend'});frame();assert.equal(events.length,3,'fresh click after reset and empty release');
 }finally{r.view.dispose();}
});
for (const side of ['flat','contour']) test(`${side} physical approach/contact/retreat produces an action, and loss preserves the last notice`,()=>{
 const r=rig(),b=r.view.sides[side].standalone,src={id:'near',selecting:false},events=[];
 r.view.addEventListener('action',e=>events.push(e.action));
 const poke=z=>{r.scene.updateMatrixWorld(true);r.input.pokeStep(src,b.localToWorld(p(0,0,z)),r.input.collect().items);r.view.update(1/60);};
 try{poke(b.t+.03);poke(b.t-.002);assert.equal(b.press.pressed,true);poke(b.t+.03);assert.deepEqual(events,['Action']);
  poke(b.t-.002);assert.equal(b.press.pressed,true);r.view.update(1/60);assert.equal(events.length,1);assert.equal(b.press.pressed,false);
  assert.equal(r.view.sides[side].notice.text,'마지막 실행: Action');
 }finally{r.view.dispose();}
});
test('a competing ray cannot steal a held button; independent buttons can still act together',()=>{
 const r=rig(),a=r.view.sides.flat.standalone,b=r.view.sides.contour.standalone;
 const first={id:'first',state:{}},second={id:'second',state:{}},events=[];
 r.view.addEventListener('action',e=>events.push(e.side));
 const feed=(button,ptr,down)=>{r.scene.updateMatrixWorld(true);r.input.rayStep(ptr,new THREE.Ray(button.localToWorld(p(0,0,.4)),p(0,0,-1)),down,0,r.input.collect().items);};
 const frame=(entries)=>{for(const args of entries)feed(...args);r.view.update(1/60);};
 try{frame([[a,first,false],[a,second,false]]);frame([[a,first,true]]);
  frame([[a,first,true],[a,second,true]]);frame([[a,first,true],[a,second,false]]);assert.equal(events.length,0);
  frame([[a,first,false]]);assert.deepEqual(events,['flat']);events.length=0;
  frame([[a,first,false],[b,second,false]]);frame([[a,first,true],[b,second,true]]);
  frame([[a,first,false],[b,second,false]]);assert.deepEqual(events,['flat','contour']);
 }finally{r.view.dispose();}
});
test('pending probes are discarded by reset and native pinch alone does not become a far select',()=>{
 const r=rig(),b=r.view.sides.flat.standalone,src=r.input.xr[0],events=[];
 r.view.addEventListener('action',e=>events.push(e.action));
 try{r.ray(b,false);r.ray(b,true);
  r.input.rayStep(r.pointer,new THREE.Ray(b.localToWorld(p(0,0,.4)),p(0,0,-1)),false,0,r.input.collect().items);
  r.view.reset();assert.equal(events.length,0);assert.equal(b.press.pressed,false);
  r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
  src.ray.position.copy(b.getWorldPosition(p(0,0,0))).add(p(0,0,2));src.grip.position.copy(src.ray.position);
  src.hand.dispatchEvent({type:'pinchstart'});r.scene.updateMatrixWorld(true);r.input.update();r.view.update(1/60);
  src.hand.dispatchEvent({type:'pinchend'});r.input.update();r.view.update(1/60);assert.equal(events.length,0);
 }finally{r.view.dispose();}
});
test('desktop down/up with no intervening frame acts once; cancel never selects and fresh pointer rearms',()=>{
 const r=rig(),el=r.input.renderer.domElement,b=r.view.sides.flat.standalone,events=[];
 r.view.addEventListener('action',e=>events.push(e.action));
 el.setPointerCapture=()=>{};el.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:1000});
 const move=()=>{r.scene.updateMatrixWorld(true);r.input.camera.updateMatrixWorld(true);const v=b.getWorldPosition(p(0,0,0)).project(r.input.camera);el.dispatchEvent({type:'pointermove',clientX:(v.x+1)*500,clientY:(1-v.y)*500});};
 const event=type=>el.dispatchEvent({type,pointerId:1});
 try{r.view.position.z=-.6;move();event('pointerdown');event('pointerup');assert.deepEqual(events,['Action']);
  event('pointerdown');r.input.update();r.view.update(1/60);assert.equal(b.press.pressed,true);
  event('pointercancel');event('lostpointercapture');assert.equal(b.press.pressed,false);assert.equal(events.length,1);
  move();event('pointerdown');event('pointerup');assert.equal(events.length,2);
 }finally{r.view.dispose();}
});
test('scene reset uses the same cancel and notice semantics as direct reset, not a test action',()=>{
 const r=rig(),b=r.view.sides.contour.standalone,events=[];r.view.addEventListener('action',e=>events.push(e.action));
 try{r.ray(b,false);r.ray(b,true);r.ray(b,false);assert.equal(events.length,1);
  r.ray(r.view.resetControl,false);r.ray(r.view.resetControl,true);r.ray(r.view.resetControl,false);
  assert.equal(events.length,1);for(const s of Object.values(r.view.sides))assert.equal(s.notice.text,'아직 실행하지 않았습니다');
 }finally{r.view.dispose();}
});
test('a semantic event while a controller first appears behind a near face cannot invent front approach',()=>{
 const r=rig(),b=r.view.sides.contour.standalone,src=r.input.xr[0],events=[];
 r.view.addEventListener('action',e=>events.push(e.action));
 try{r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
  src.ray.position.copy(b.getWorldPosition(p(0,0,0))).add(p(0,0,2));src.grip.position.copy(b.localToWorld(p(0,0,b.t-.003)));
  r.scene.updateMatrixWorld(true);src.ray.dispatchEvent({type:'selectstart'});r.input.update();r.view.update(1/60);
  assert.equal(b.press.pressed,false,'far approach priming must not seed a near poke');
  src.ray.dispatchEvent({type:'selectend'});assert.equal(events.length,0);
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} near grip pose loss cannot release through a remaining far ray`,()=>{
 const r=rig(),b=r.view.sides[side].standalone,src=r.input.xr[0],events=[];
 r.view.addEventListener('action',e=>events.push(e.action));
 const frame=z=>{if(z!==null)src.grip.position.copy(b.localToWorld(p(0,0,z)));r.scene.updateMatrixWorld(true);r.input.update();r.view.update(1/60);};
 try{r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});src.ray.position.copy(b.getWorldPosition(p(0,0,0))).add(p(0,0,2));
  frame(b.t+.03);frame(b.t-.002);assert.equal(b.press.pressed,true);
  src.grip.visible=false;frame(null);frame(null);frame(null);assert.equal(events.length,0);assert.equal(b.press.pressed,false);
  src.grip.visible=true;frame(b.t-.002);assert.equal(events.length,0);assert.equal(b.press.pressed,false,'return behind face is not a fresh approach');
  frame(b.t+.03);frame(b.t-.002);frame(b.t+.03);assert.deepEqual(events,['Action']);
 }finally{r.view.dispose();}
});
test('a nearby wrist does not disable a fresh far semantic click whose tracked fingertip is far',()=>{
 const r=rig(),b=r.view.sides.flat.standalone,src=r.input.xr[0],events=[];
 r.view.addEventListener('action',e=>events.push(e.action));
 try{r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{hand:{}}});
  src.hand.joints={};for(const name of ['index-finger-tip','wrist']){const joint=new THREE.Group();src.hand.add(joint);src.hand.joints[name]=joint;}
  const centre=b.getWorldPosition(p(0,0,0));src.hand.joints['index-finger-tip'].position.copy(centre).add(p(0,0,2));src.hand.joints.wrist.position.copy(centre);
  src.ray.position.copy(centre).add(p(0,0,2));r.scene.updateMatrixWorld(true);
  src.ray.dispatchEvent({type:'selectstart'});r.input.update();r.view.update(1/60);assert.equal(b.press.pressed,true);
  src.ray.dispatchEvent({type:'selectend'});assert.deepEqual(events,['Action']);
 }finally{r.view.dispose();}
});
