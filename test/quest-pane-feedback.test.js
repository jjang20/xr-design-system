import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rig,THREE} from './support/nativePaneRig.js';
import {paneDentHeight} from '../src/core/paneDent.js';
for(const side of [-1,1])test('R16 accepted native edge retains owner with wider local bend and light '+side,()=>{
 const r=rig(),h=r.h,at=new THREE.Vector3(side*(h.panel.w/2-.003/r.scale),0,h.frontZ+.004/r.scale);
 r.step(at);assert.equal(r.p.controls.held,null);
 assert.equal(h.skin.uniforms.uPaneGlow?.value.y??0,0);
 for(let i=0;i<90;i++)r.step(at,{gap:.01});
 assert.equal(r.p.controls.held?.handle,h);
 const d=h.currentDent,dy=.020/r.scale;
 assert.ok(-paneDentHeight(d.x,d.y+dy,h.profile,d)*r.scale>=.0016,'20mm from grab still visibly bends, not only a tiny contact dimple');
 assert.ok(d.depth*r.scale<=.003501,'accepted maximum bend and clearance remain bounded');
 assert.ok(h.skin.uniforms.uPaneGlow?.value.y>0,'held pane has its own local light');
 assert.equal(r.level.panel.skin.uniforms.uContactGlow.value,0,'Push acknowledgement is independent');
 const heldId=r.p.controls.held.id,position=r.p.position.clone();
 r.step(at,{gap:.01,world:h.localToWorld(at.clone()).add(new THREE.Vector3(.025,0,0))});
 assert.equal(r.p.controls.held.id,heldId);assert.ok(r.p.position.distanceTo(position)>.02);
 r.step(at,{gap:.04});assert.equal(r.p.controls.held,null);
 r.input.xr[0].connected=false;
 for(let i=0;i<180;i++){r.scene.updateMatrixWorld(true);r.input.update();r.p.update(1/60);}
 assert.ok(h.currentDent.depth<1e-8);assert.ok(h.skin.uniforms.uPaneGlow.value.y<1e-8);
});
