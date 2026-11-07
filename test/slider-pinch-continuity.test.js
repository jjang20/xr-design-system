import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {createTokens} from '../src/tokens.js';
import {SliderComparison} from '../demo/comparison/SliderComparison.js';
import {InputSystem} from '../src/core/InputSystem.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url))));
const point=(x,y,z)=>new THREE.Vector3(x,y,z);
function rig(key){
 const view=new SliderComparison(T),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();scene.add(view);
 // The Node font boundary never lays out the unrelated restore label.
 view.restoreControl.visible=false;
 const controllers=[new WebXRController(),new WebXRController()];
 const xr={isPresenting:true,getController:i=>controllers[i].getTargetRaySpace(),getControllerGrip:i=>controllers[i].getGripSpace(),getHand:i=>controllers[i].getHandSpace()};
 const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr}}),controller=controllers[0],src=input.xr[0],control=view.controls[key];
 const spaces=['index-finger-tip','thumb-tip'].map(jointName=>({jointName}));
 const source={hand:new Map(spaces.map(s=>[s.jointName,s])),handedness:'right',targetRaySpace:{}};
 controller.connect(source);
 function step(p,{gap=.01,semantic=null,thumb=null,missing=null,rayOrigin=point(0,.1,.5),rayTarget=null,rayMissing=false}={}){
  scene.updateMatrixWorld(true);
  const positions={'index-finger-tip':control.localToWorld(p.clone()),'thumb-tip':control.localToWorld(thumb?.clone()??p.clone().add(point(gap,0,0)))};
  const origin=control.localToWorld(rayOrigin.clone()),target=control.localToWorld(rayTarget?.clone()??point(0,0,control.frontZ));
  const q=new THREE.Quaternion().setFromUnitVectors(point(0,0,-1),target.sub(origin).normalize());
  const ray=new THREE.Matrix4().compose(origin,q,point(1,1,1));
  controller.update(source,{session:{visibilityState:'visible'},getJointPose:s=>s.jointName===missing?null:{radius:.008,transform:{matrix:new THREE.Matrix4().makeTranslation(...positions[s.jointName].toArray()).toArray()}},getPose:s=>!rayMissing&&s===source.targetRaySpace?{transform:{matrix:ray.toArray()}}:null},{});
  if(semantic)controller.dispatchEvent({type:semantic,data:source});
  scene.updateMatrixWorld(true);input.update();view.update(1/60);scene.updateMatrixWorld(true);
 }
 return{view,control,step,input,src,controller,source};
}

test('a native Z pinch on first contact grabs before pushing and drives the shared result',()=>{
 const r=rig('z');try{
  r.view.brightness=.5;r.view.syncResults();const at=r.control.frontZ+.007;
  r.step(point(0,0,at)); // native event from installed Three, no prior hover or semantic select
  assert.equal(r.view.results.z.number.text,'50%','first pinch must not push before grabbing');
  r.step(point(0,0,at+.014));
  assert.equal(r.view.results.z.number.text,'70%');assert.equal(r.view.results.x.number.text,'70%');
  const held=r.control.value;r.step(point(0,0,at+.02),{gap:.04});assert.equal(r.control.value,held,'opening does not apply another captured displacement');
 }finally{r.view.dispose();}
});

test('a near planar pinch keeps its drag beyond the contact strip until opening',()=>{
 const r=rig('x');try{
  r.step(point(0,0,.018),{gap:.04});r.step(point(0,0,.010));
  assert.equal(r.view.results.x.number.text,'50%');const pressed=r.control.thumb.material.color.getHex();
  r.step(point(.04,.020,.025));
  assert.equal(r.view.results.x.number.text,'75%','a held pinch is not released by leaving the old contact strip');
  assert.equal(r.control.thumb.material.color.getHex(),pressed);
  r.step(point(.06,.020,.025),{gap:.04});
  assert.equal(r.view.results.x.number.text,'75%','opening ends the drag without a final value');assert.equal(r.view.owner,null);
 }finally{r.view.dispose();}
});

test('a thumb contact can become the same hand pinch without surrendering the common owner',()=>{
 const r=rig('z');try{
  r.view.brightness=.5;r.view.syncResults();const f=r.control.frontZ;
  // Open hand; thumb is the first physical contact and owns the push.
  r.step(point(0,0,f+.04),{thumb:point(.01,0,f+.007)});
  const before=r.control.value;assert.ok(before<.5);
  const at=r.control.frontZ+.009;
  r.step(point(0,0,at),{thumb:point(.01,0,at-.002),semantic:'selectstart'});
  r.step(point(0,0,at+.014),{thumb:point(.01,0,at+.012)});
  assert.ok(r.control.value>before+.19,'the same hand continues from thumb push to index pinch');
  assert.equal(r.view.results.x.number.text,r.view.results.z.number.text);
 }finally{r.view.dispose();}
});

test('a captured Z ray keeps its coordinate mapping while the hand approaches',()=>{
 const r=rig('z');try{
  r.view.brightness=.5;r.view.syncResults();const opts={rayTarget:point(0,0,r.control.frontZ-.001)};
  r.step(point(0,0,.6),{...opts,gap:.04});r.step(point(0,0,.6),{...opts,gap:.04,semantic:'selectstart'});
  assert.equal(r.control.value,.5);
  r.step(point(0,0,r.control.frontZ+.016),{...opts,gap:.01});
  assert.equal(r.control.value,.5,'approach alone cannot reinterpret a captured ray offset as a fingertip offset');
  r.step(point(0,0,r.control.frontZ+.016),{...opts,gap:.04,semantic:'selectend'});
  assert.equal(r.view.owner,null);
 }finally{r.view.dispose();}
});

test('a planar near pinch retains its acquired mapping across the near/far distance boundary',()=>{
 const r=rig('x');try{
  r.step(point(0,0,.018),{gap:.04});r.step(point(0,0,.010));
  r.step(point(.04,.5,.5));assert.equal(r.view.results.x.number.text,'75%');
  assert.ok(r.view.owner,'distance alone does not lose a held pinch');
  r.step(point(.06,.5,.5),{gap:.04});assert.equal(r.view.owner,null);assert.equal(r.view.results.x.number.text,'75%');
 }finally{r.view.dispose();}
});

for(const key of ['x','z'])for(const missing of ['index-finger-tip','thumb-tip'])test(`${key} pinch cancels on ${missing} loss and requires a new gesture`,()=>{
 const r=rig(key);try{
  r.view.brightness=.5;r.view.syncResults();const f=r.control.frontZ,at=point(0,0,f+.007);
  r.step(point(0,0,f+.016),{gap:.04});r.step(at,{semantic:'selectstart'});
  const held=r.control.value;
  const moved=key==='x'?point(.04,0,at.z):point(0,0,at.z+.014);
  r.step(moved,{missing});assert.equal(r.view.owner,null);assert.equal(r.control.value,held);
  r.step(moved);assert.equal(r.view.owner,null,'returning closed hand cannot rearm');assert.equal(r.control.value,held);
  r.step(point(0,0,f+.04),{gap:.04,semantic:'selectend'});
  r.step(point(0,0,r.control.frontZ+.007),{semantic:'selectstart'});assert.ok(r.view.owner);
 }finally{r.view.dispose();}
});

for(const key of ['x','z'])test(`${key} native-only pinch loss and restore cannot rearm while closed`,()=>{
 const r=rig(key);try{
  r.view.brightness=.5;r.view.syncResults();const f=r.control.frontZ,p=point(0,0,f+.007);
  r.step(point(0,0,f+.016),{gap:.04});r.step(p);const held=r.control.value;
  r.step(p,{missing:'thumb-tip'});assert.equal(r.view.owner,null);
  r.step(p);assert.equal(r.view.owner,null);assert.equal(r.control.value,held);
  r.step(point(0,0,f+.04),{gap:.04});r.step(p);assert.ok(r.view.owner);
  r.view.restoreBrightness();r.input.reset();r.step(p);assert.equal(r.view.owner,null);assert.equal(r.view.brightness,1);
 }finally{r.view.dispose();}
});

test('a native pinch far from or behind Z cannot acquire the knob or change the shared value',()=>{
 for(const location of ['far','behind']){
  const r=rig('z');try{
   r.view.brightness=.5;r.view.syncResults();r.step(point(0,0,location==='far'?.7:-.2));
   assert.equal(r.view.owner,null,location);assert.equal(r.control.value,.5,location);
  }finally{r.view.dispose();}
 }
});

test('another hand cannot promote itself over the existing contact owner',()=>{
 const view=new SliderComparison(T),z=view.controls.z;try{
  view.brightness=.5;view.syncResults();const f=z.frontZ;
  z.feed({kind:'poke',id:'left:thumb-tip',sourceId:'left',point:point(0,0,f+.007),radius:.008,pinch:false});view.update(1/60);
  const held=z.value;
  z.feed({kind:'poke',id:'right',sourceId:'right',point:point(0,0,z.frontZ+.007),radius:.008,pinch:true});view.update(1/60);
  assert.equal(z.value,held);assert.equal(view.owner,null,'source loss releases the old owner, without transfer to another hand');
  z.feed({kind:'poke',id:'right',sourceId:'right',point:point(0,0,z.frontZ+.02),radius:.008,pinch:true});view.update(1/60);assert.equal(z.value,held);
 }finally{view.dispose();}
});

for(const key of ['x','z'])test(`${key} cannot acquire a new target with a pinch that began away from it`,()=>{
 const r=rig(key);try{
  r.view.brightness=.5;r.view.syncResults();const f=r.control.frontZ;
  r.step(point(.3,.3,.3),{gap:.04});r.step(point(.3,.3,.3));
  r.step(point(0,0,f+.007));assert.equal(r.view.owner,null,'held arrival is not a new acquisition');assert.equal(r.control.value,.5);
  r.step(point(0,0,f+.016),{gap:.04});r.step(point(0,0,f+.007));assert.ok(r.view.owner,'actual reopening permits a new local pinch');
 }finally{r.view.dispose();}
});

for(const key of ['x','z'])test(`${key} first semantic contact and native/select ordering share one gesture`,()=>{
 const r=rig(key);try{
  r.view.brightness=.5;r.view.syncResults();const p=point(0,0,r.control.frontZ+.007);
  r.step(p,{gap:.04,semantic:'selectstart'});assert.ok(r.view.owner,'semantic select acquires without prior hover');assert.equal(r.control.value,.5);
  r.step(p);assert.ok(r.view.owner,'joining native signal preserves the owner');
  r.step(p,{semantic:'selectend'});assert.ok(r.view.owner,'native pinch still holds');
  r.step(point(0,0,r.control.frontZ+.016),{gap:.04});assert.equal(r.view.owner,null);
  r.step(point(.3,.3,.3));r.step(p,{semantic:'selectstart'});
  assert.equal(r.view.owner,null,'a late semantic event cannot restart a held native gesture at a new target');
 }finally{r.view.dispose();}
});


test('same-hand pinch can promote the thumb owner even after a nearby index was excluded',()=>{
 const r=rig('z');try{
  r.view.brightness=.5;r.view.syncResults();
  for(let i=0;i<2;i++){
   const f=r.control.frontZ;
   r.step(point(.04,0,f+.008),{thumb:point(0,0,f+.007)});
  }
  const before=r.control.value,f=r.control.frontZ;
  r.step(point(0,0,f+.008),{thumb:point(.01,0,f+.006),semantic:'selectstart'});
  assert.ok(r.view.owner,'same hand current contact owner must not block its fresh pinch');
  r.step(point(0,0,f+.022),{thumb:point(.01,0,f+.020)});
  assert.ok(r.control.value>before+.19);
  assert.equal(r.view.results.x.number.text,r.view.results.z.number.text);
 }finally{r.view.dispose();}
});
