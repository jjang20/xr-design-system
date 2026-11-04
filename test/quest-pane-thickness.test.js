import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rig,THREE} from './support/nativePaneRig.js';
import {paneDentHeight} from '../src/core/paneDent.js';

for(const scale of [.9,2.2])for(const side of [-1,1])test(`R17 local thickness reduces with accepted front preserved ${scale}/${side}`,()=>{
 const r=rig();r.p.scale.setScalar(scale);r.scene.updateMatrixWorld(true);
 const h=r.h,s=h.inputScale,at=new THREE.Vector3(side*(h.panel.w/2-.003/s),0,h.frontZ+.004/s);
 r.step(at);for(let i=0;i<90;i++)r.step(at,{gap:.01});
 assert.equal(r.p.controls.held?.handle,h);
 const a=h.hitMeshes[0].geometry.attributes.position,d=h.currentDent,front=h.restBox.max.z;
 let nearBack=0,frontCount=0,farCount=0;
 const v=new THREE.Vector3();
 for(let i=0;i<a.count;i++){
  const j=3*i,x=h.restPositions[j],y=h.restPositions[j+1],z=h.restPositions[j+2],bend=paneDentHeight(x,y,h.profile,d),actual=a.getZ(i);
  const distance=Math.hypot(x-d.x,y-d.y)*s;
  if(Math.abs(z-front)<1e-8){assert.ok(Math.abs(actual-z-bend)<1e-7,'accepted front dent unchanged');frontCount++;}
  if(distance<.003 && z<.00001){
   const ratio=(front+bend-actual)/(front-z);
   assert.ok(ratio>.60 && ratio<.80,`positive and locally thinner: ${ratio}`);nearBack++;
  }
  if(distance>.029){assert.ok(Math.abs(actual-z-bend)<1e-7,'outside support retains thickness');farCount++;}
  v.fromBufferAttribute(a,i);
  for(const g of [h.hitMeshes[0].geometry,h.body.geometry]){
   assert.ok(g.boundingBox.distanceToPoint(v)<1e-7);
   assert.ok(v.distanceTo(g.boundingSphere.center)<=g.boundingSphere.radius+1e-7);
  }
 }
 assert.ok(nearBack>0&&frontCount>0&&farCount>0,'actual back/front/outside coverage');
 r.step(at,{gap:.01,missing:'index-finger-tip'});assert.equal(r.p.controls.held,null);
 r.input.xr[0].connected=false;
 for(let i=0;i<180;i++){r.scene.updateMatrixWorld(true);r.input.update();r.p.update(1/60);}
 for(let i=0;i<a.count;i++)assert.ok(Math.abs(a.getZ(i)-h.restPositions[3*i+2])<1e-8,'loss restores all surfaces');
});

test('R17 new selected relative offsets supersede R16 endpoints',()=>{
 const r=rig();assert.deepEqual(r.level.listOpacity.targets,{idle:0,hover:.06,pressed:.10});
});
