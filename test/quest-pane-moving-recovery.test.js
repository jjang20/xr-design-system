import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const media={matches:false};globalThis.matchMedia=()=>media;
const {rig,naturalEdge,THREE}=await import('./support/panePriorityRig.js');
const {springTo,prefersReducedMotion}=await import('../src/core/spring.js');
const results=[],out=process.env.XR_R14_MOVING_TRACE;
for(const reduced of [false,true])for(const kind of ['thumb-tip','middle-finger-tip','index-finger-tip'])test(`R14 real0.2mm inward motion crosses prior visible recovering skin: ${kind}, reduced=${reduced}`,()=>{
 media.matches=reduced;assert.equal(prefersReducedMotion(),reduced);let failure,evidence={};
 try{
  const r=rig(),at=naturalEdge(r,.0073);r.step(at,true,'pinch');
  const frame=()=>{r.scene.updateMatrixWorld(true);r.input.update();r.p.update(1/60);r.scene.updateMatrixWorld(true);};
  for(let i=0;i<40;i++)frame();r.s.connected=false;frame();
  const src=r.input.xr[1],tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={[kind]:tip};src.connected=true;src.handSource=true;src.hand.visible=tip.visible=true;
  // Arrange an independently asserted +100um gap on the next displayed base.
  const next={...r.h.dent};springTo(next,0,.09,reduced?1:.85,1/60);
  tip.position.copy(r.h.localToWorld(new THREE.Vector3(r.h.spot.x,r.h.spot.y,r.h.panel.t-next.x+(.008+.0001)/r.h.inputScale)));
  if(kind==='middle-finger-tip'){
   const wrist=new THREE.Group(),base=new THREE.Group();src.hand.add(wrist,base);src.hand.joints.wrist=wrist;src.hand.joints['middle-finger-phalanx-proximal']=base;wrist.position.copy(tip.position).add(new THREE.Vector3(0,-.05,0));base.position.copy(wrist.position).add(new THREE.Vector3(0,.08,0));assert.equal(r.input.fingerProximity(src,kind),false);
  }
  const world0=tip.position.clone();frame();const row=r.rows[0],local0=row.worldToLocal(tip.getWorldPosition(new THREE.Vector3())),priorVisible=row.surfaceZ(local0),radius=.008/r.h.inputScale,gap0=local0.z-priorVisible-radius;
  assert.equal(row.press.pressed,false);assert.ok(gap0>0,'fixture is actually outside the prior displayed skin');
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(r.p.quaternion);tip.position.addScaledVector(normal,-.0002);const local1=row.worldToLocal(tip.getWorldPosition(new THREE.Vector3())),pastPrior=local1.z-priorVisible-radius;
  assert.ok(pastPrior<0,'the finger independently crossed the prior displayed skin');assert.ok(Math.abs(world0.distanceTo(tip.position)-.0002)<1e-12);
  frame();evidence={priorVisible,gap0,pastPrior,movementWorld:world0.distanceTo(tip.position),baseAfter:row.surfaceZ(local1,0),pressed:row.press.pressed,lastSeparation:row.press.lastSeparation,lastPenetration:row.press.lastPenetration,events:r.events};
  assert.equal(row.press.pressed,true,'real motion through the previously visible surface must remain a valid touch');
 }catch(e){failure=String(e);throw e;}finally{results.push({reduced,kind,failure,...evidence});if(out)writeFileSync(out,JSON.stringify({results},null,2)+'\n');media.matches=false;}
});
