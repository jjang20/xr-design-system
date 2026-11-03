import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rig,naturalEdge,THREE} from './support/panePriorityRig.js';
const media={matches:false};globalThis.matchMedia=()=>media;
function frame(r,dt=1/60){r.scene.updateMatrixWorld(true);r.input.update();r.p.update(dt);r.scene.updateMatrixWorld(true);}
for(const reduced of [false,true])for(const ending of ['loss','release'])for(const kind of ['thumb-tip','middle-finger-tip','index-finger-tip'])test(`R14 recovering pane cannot press a stationary ${kind}: ${ending}, reduced=${reduced}`,()=>{
 media.matches=reduced;
 try{
  const r=rig(),at=naturalEdge(r,.0073);r.step(at,true,'pinch');for(let i=0;i<40;i++)frame(r);assert.equal(r.p.controls.held?.handle===r.h,true);
  r.events.length=0;const src=r.input.xr[1],tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={[kind]:tip};src.connected=true;src.handSource=true;src.hand.visible=tip.visible=true;
  const world=r.h.localToWorld(new THREE.Vector3(r.h.spot.x,r.h.spot.y,r.h.panel.t+(.008-.0001)/r.h.inputScale));tip.position.copy(world);
  if(kind==='middle-finger-tip'){
   const wrist=new THREE.Group(),base=new THREE.Group();src.hand.add(wrist,base);src.hand.joints.wrist=wrist;src.hand.joints['middle-finger-phalanx-proximal']=base;
   wrist.position.copy(world).add(new THREE.Vector3(0,-.05,0));base.position.copy(wrist.position).add(new THREE.Vector3(0,.08,0));
  }
  if(ending==='loss')r.s.connected=false;else r.s.selecting=false;
  for(let i=0;i<90;i++){frame(r);assert.ok(tip.getWorldPosition(new THREE.Vector3()).distanceTo(world)<1e-12);}
  tip.position.add(new THREE.Vector3(0,0,.03).applyQuaternion(r.p.quaternion));for(let i=0;i<3;i++)frame(r);
  assert.equal(r.events.filter(e=>['press','select','open'].includes(e.type)).length,0);
 }finally{media.matches=false;}
});
for(const reduced of [false,true])test(`R14 moving fingertip can press the recovering pane, reduced=${reduced}`,()=>{
 media.matches=reduced;
 try{
  const r=rig(),at=naturalEdge(r,.0073);r.step(at,true,'pinch');for(let i=0;i<18;i++)frame(r);r.s.connected=false;frame(r);r.events.length=0;
  const src=r.input.xr[1],tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={'thumb-tip':tip};src.connected=true;src.handSource=true;src.hand.visible=tip.visible=true;
  const row=r.rows[0],q=new THREE.Vector3(r.h.spot.x-row.position.x,r.h.spot.y-row.position.y,0),point=gap=>row.localToWorld(q.clone().setZ(row.surfaceZ(q)+(.008+gap)/r.h.inputScale));
  tip.position.copy(point(.004));frame(r);assert.equal(row.press.pressed,false);
  tip.position.copy(point(-.003));frame(r);assert.equal(row.press.pressed,true);
  tip.position.copy(row.localToWorld(q.clone().setZ(row.pokeFront+.028/r.h.inputScale)));frame(r);assert.equal(r.events.filter(e=>e.type==='open').length,1);
 }finally{media.matches=false;}
});
for(const hz of [60,90,120])for(const reduced of [false,true])test(`R14 bent outer edge can be released and regrasped: ${hz}Hz reduced=${reduced}`,()=>{
 media.matches=reduced;
 try{
  const r=rig({scale:.9}),h=r.h,q=new THREE.Vector3(h.panel.w/2-.0002/h.inputScale,0,0);q.z=h.surfaceZ(q);const at=h.localToWorld(q.clone()),dt=1/hz;
  const ray=(world,pinch)=>{r.s.connected=true;r.s.handSource=false;r.s.hand.visible=false;r.s.selecting=pinch;r.s.ray.position.copy(world).add(new THREE.Vector3(0,0,.5).applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion())));r.s.ray.quaternion.copy(h.getWorldQuaternion(new THREE.Quaternion()));frame(r,dt);};
  ray(at,false);ray(at,true);assert.equal(r.p.controls.held?.handle===h,true);for(let i=0;i<hz;i++)ray(at,true);
  const front=h.surfaceZ(q),bent=h.localToWorld(q.clone().setZ(front));assert.equal(h.acceptRayHit(q.clone().setZ(front)),true);
  assert.equal(h.acceptRayHit(q.clone().setZ(front-h.panel.t)),false,'back point is not a front hit');
  ray(bent,false);ray(bent,true);assert.equal(r.p.controls.held?.handle===h,true);
 }finally{media.matches=false;}
});
