import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {rig,naturalEdge,THREE} from './support/panePriorityRig.js';
const results=[];const out=process.env.XR_R14_TRACE;
function record(name,run){test(name,()=>{const r=rig();let failure;try{run(r);}catch(e){failure=String(e);throw e;}finally{results.push({name,failure,events:r.events,frames:r.frames});if(out)writeFileSync(out,JSON.stringify({source:process.env.XR_REVIEW_ROOT??'/tmp/xr-r14-spec/checkout',results},null,2)+'\n');}});}
record('R14: valid edge pinch must stop drawing the prior noncontact row feedback in the same frame',r=>{
 const at=naturalEdge(r,.003),before=r.frames.at(-1);assert.equal(before.rows[0].hovered,true);assert.equal(before.rows[0].pressed,false);
 r.step(at,true,'pinch');const acquired=r.frames.at(-1);assert.equal(acquired.held?.handle,'pane','negative evidence: capture itself already works');
 assert.ok(acquired.rows.every(x=>!x.hovered&&!x.pressed));
 assert.equal(acquired.slots,0,'the shared sheet must not keep painting an old noncontact row during explicit pane manipulation');
 for(let n=0;n<30;n++){r.step(at,true,'held');assert.equal(r.frames.at(-1).slots,0);}
});
record('R14: 7.3mm inner edge pinch lies within the new bounded12mm trial and must acquire',r=>{
 const at=naturalEdge(r,.0073),before=r.p.position.clone();r.step(at,true,'pinch');assert.equal(r.p.controls.held?.handle===r.h,true,'old6.3mm inset cap must not route this valid edge pinch back to a row');
 const delta=new THREE.Vector3(.04,.015,-.01);r.step(at.clone().add(delta),true,'drag');assert.ok(r.p.position.clone().sub(before).distanceTo(delta)<1e-8);
 r.step(at.clone().add(delta),false,'release');assert.equal(r.p.controls.held,null);assert.equal(r.events.filter(e=>e.type==='select').length,0);
});

for(const scale of [.9,2.2])for(const inset of [.0119,.0121])test(`R14 physical edge boundary scale=${scale} inset=${inset}`,()=>{
 const r=rig({scale}),at=naturalEdge(r,inset);r.step(at,true,'pinch');assert.equal(r.p.controls.held?.handle===r.h,inset<.012);
});
record('R14 row input follows recovering pane base at the physical grabbed edge',r=>{
 const at=naturalEdge(r,.0073);r.step(at,true,'pinch');for(let n=0;n<60;n++)r.step(at,true,'held');
 const row=r.rows[0],point=new THREE.Vector3(r.h.spot.x-row.position.x,r.h.spot.y-row.position.y,0);
 r.step(at,false,'release');
 const base=row.surfaceZ(point,0);assert.ok(base<-.001,'recovery input uses bent skin, not old front plane');
 assert.ok(Math.abs(base-r.h.currentDent.depth*-1)<.0001);
});

test('R14 list hover opacity applies only to noncontact skin, with text and other groups unchanged',()=>{
 const r=rig(),at=naturalEdge(r,.003),u=r.level.panel.skin.uniforms,row=r.rows[0];
 assert.ok(row.hovered&&!row.press.pressed);assert.equal(u.uBulgeOpacity.value[0],.58);
 assert.ok(row.label); const label=row.label.fillOpacity,point=new THREE.Vector3(0,0,0);
 for(const gap of [.02,.01,0,-.003]){point.set(0,0,row.surfaceZ(new THREE.Vector3())+(.008+gap)/row.getWorldScale(new THREE.Vector3()).z);r.step(row.localToWorld(point.clone()),false,'row-contact');}
 assert.ok(row.press.pressed);assert.ok(u.uBulgeOpacity.value.every(v=>v===1),'actual press restores accepted contact surface opacity');
 assert.equal(row.label.fillOpacity,label,'text opacity independent');
});

test('R14 a stationary thumb cannot click when the manipulated pane recovers into it',()=>{
 const r=rig(),at=naturalEdge(r,.0073);r.step(at,true,'pinch');for(let i=0;i<60;i++)r.step(at,true,'held');
 r.events.length=0; // exclude the cancelled approach press before manipulation
 const other=r.input.xr[1],thumb=new THREE.Group();thumb.jointRadius=.008;other.hand.add(thumb);other.hand.joints={'thumb-tip':thumb};other.connected=true;other.hand.visible=true;other.handSource=true;
 const world=r.h.localToWorld(new THREE.Vector3(r.h.spot.x,r.h.spot.y,r.h.panel.t+(.008-.001)/r.h.inputScale));thumb.position.copy(world);
 for(let i=0;i<90;i++)r.step(at,false,'release-recovery');
 assert.equal(r.events.filter(e=>e.type==='press'||e.type==='select').length,0,'stationary second thumb is not a new gesture');
});
