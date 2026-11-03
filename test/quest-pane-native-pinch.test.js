import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rig,THREE} from './support/nativePaneRig.js';

function edge(r,side=1){return new THREE.Vector3(side*(r.h.panel.w/2-.003/r.scale),0,r.h.panel.t+.012/r.scale);}
function gesture(r,p,semantic=false,sign=1){
  r.step(p,{gap:sign*.04});r.step(p,{gap:sign*.01,semantic:semantic?'selectstart':null});
}
for(const side of [-1,1])for(const semantic of [false,true])test(`R15 native near edge ${side} semantic ${semantic} moves and releases one owner`,()=>{
 const r=rig(),p=edge(r,side);gesture(r,p,semantic);
 assert.equal(r.p.controls.held?.handle,r.h);
 const before=r.p.position.clone();r.step(p.clone().add(new THREE.Vector3(.03/r.scale,0,0)),{gap:.01});
 assert.ok(Math.abs(r.p.position.distanceTo(before)-.03)<1e-7);
 r.step(p,{gap:.04,semantic:semantic?'selectend':null});assert.equal(r.p.controls.held,null);
 assert.equal(r.p.levels.length,1);
});
for(const variant of ['outer','straddle'])test(`R15 finite fingertip contact acquires actual ${variant} edge`,()=>{
 const r=rig(),p=edge(r);
 if(variant==='outer')p.set(r.h.panel.w/2+.003/r.scale,0,r.h.panel.t+.004/r.scale);
 else p.set(r.h.panel.w/2-.006/r.scale,0,-.003/r.scale);
 assert.ok(r.meshDistance(p).distanceWorld<.008,'fixture must overlap actual triangles');
 gesture(r,p,true,variant==='straddle'?-1:1);assert.equal(r.p.controls.held?.handle,r.h);
 if(variant==='straddle'){
  const thumbLocal=r.h.worldToLocal(new THREE.Vector3(...r.frames.at(-1).thumb));
  assert.ok(p.z<0 && thumbLocal.z>r.h.panel.t,'joint centres straddle the actual pane');
 }
 assert.ok(r.h.inside(r.p.controls.held.localPoint),'dent anchor is on the approved physical edge');
});
test('R15 native fallback does not create far clicks, body grabs or noncontact outer grabs',()=>{
 for(const kind of ['far','body','outer','rear']){
  const r=rig(),p=edge(r);
  if(kind==='body')p.x=0;
  if(kind==='outer')p.x=r.h.panel.w/2+.012/r.scale;
  if(kind==='rear')p.z=-.020/r.scale;
  r.step(p,{gap:.04,far:kind==='far'});r.step(p,{gap:.01,far:kind==='far'});
  assert.equal(r.p.controls.held,null,kind);
  assert.equal(r.p.levels.length,1);
 }
});
for(const missing of ['thumb-tip','index-finger-tip'])test(`R15 native ${missing} loss cancels and requires opening before reacquisition`,()=>{
 const r=rig(),p=edge(r);gesture(r,p);assert.ok(r.p.controls.held);
 r.step(p,{gap:.01,missing});assert.equal(r.p.controls.held,null);
 r.step(p,{gap:.01});assert.equal(r.p.controls.held,null);
 r.step(p,{gap:.04});r.step(p,{gap:.01});assert.ok(r.p.controls.held);
 r.input.reset();r.p.resetInteraction();r.step(p,{gap:.01});assert.equal(r.p.controls.held,null);
 r.step(p,{gap:.04});r.step(p,{gap:.01});assert.ok(r.p.controls.held);
});
test('R15 semantic/native ordering cannot double-own or release the remaining valid signal',()=>{
 const r=rig(),p=edge(r);r.step(p,{gap:.04,semantic:'selectstart'});assert.ok(r.p.controls.held);
 const owner=r.p.controls.held;r.step(p,{gap:.01});assert.equal(r.p.controls.held,owner);
 r.step(p,{gap:.01,semantic:'selectend'});assert.equal(r.p.controls.held,owner);
 r.step(p,{gap:.04});assert.equal(r.p.controls.held,null);
 gesture(r,p,true);const next=r.p.controls.held;r.step(p,{gap:.04});assert.equal(r.p.controls.held,next);
 r.step(p,{gap:.04,semantic:'selectend'});assert.equal(r.p.controls.held,null);
});

test('R15 a stationary world-space hand does not accumulate window drift after translation',()=>{
 const r=rig(),p=edge(r);gesture(r,p);
 const world=new THREE.Vector3(...r.frames.at(-1).tip).add(new THREE.Vector3(.03,0,0));
 r.step(p,{gap:.01,world});const at=r.p.position.clone();
 for(let i=0;i<90;i++)r.step(p,{gap:.01,world});
 assert.ok(r.p.position.distanceTo(at)<1e-7);
 r.step(p,{gap:.04,world});assert.equal(r.p.controls.held,null);
});
