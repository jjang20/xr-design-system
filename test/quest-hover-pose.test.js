import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,PackagingPanel,InputSystem} from '../src/index.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url)))),dt=1/60;
function rig(){
 const p=new PackagingPanel(T,{title:'List',items:['A','B','C','D'].map(label=>({id:label,label}))});p.scale.setScalar(1.5);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.y=1.6;scene.add(p,camera);
 for(let i=0;i<120;i++){scene.updateMatrixWorld(true);p.update(dt);}
 const group=()=>new THREE.Group();
 const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 input.xr.forEach(s=>{s.connected=false;s.grip.visible=false;});const src=input.xr[0];src.ray.dispatchEvent({type:'connected',data:{hand:{}}});src.hand.joints={};
 const add=(name)=>{const j=new THREE.Group();j.jointRadius=.008;src.hand.add(j);src.hand.joints[name]=j;return j;};const tip=add('index-finger-tip');
 const level=p.levels[0],rows=level.rows,events=[];rows.forEach((r,i)=>['press','release','cancel','select'].forEach(type=>r.addEventListener(type,()=>events.push({frame:input.frame,row:i,type}))));
 let delivered=[];
 const step=()=>{scene.updateMatrixWorld(true);input.update();delivered=rows.flatMap((r,i)=>r.probes.map(q=>({row:i,id:q.id,kind:q.kind,gap:(q.point.z-r.surfaceZ(q.point))*r.getWorldScale(new THREE.Vector3()).z-(q.radius??0),distance:r.faceDistance(q.point,q.radius)})));p.update(dt);scene.updateMatrixWorld(true);};
 const at=(i,gap,x=0)=>{scene.updateMatrixWorld(true);const r=rows[i],q=new THREE.Vector3(x,0,0);q.z=(r.press.pressed?r.pokeFront:r.surfaceZ(q))+(.008+gap)/r.getWorldScale(new THREE.Vector3()).z;return r.localToWorld(q);};
 const put=(name,world)=>{const j=src.hand.joints[name]??add(name);j.position.copy(src.hand.worldToLocal(world.clone()));};
 const snap=label=>({label,frame:input.frame,delivered:structuredClone(delivered),rows:rows.map((r,i)=>({i,hovered:r.hovered,hover:r.hover,bulge:r.bulge,pressed:r.press.pressed,contacted:r.press.contacted??false,glow:r.glow,dents:r.contactDents?.map(c=>({id:c.id,depth:c.depth,glow:c.glow}))??[]})),shader:{count:level.panel.skin.uniforms.uBulgeCount.value,heights:level.panel.skin.uniforms.uBulgeParam.value.map(v=>v.y),glows:level.panel.skin.uniforms.uBulgeGlow.value.map(v=>v.y)}});
 return {p,scene,camera,input,src,rows,tip,add,put,at,step,snap,events};
}

function curlPose(r, middleGap=.04) {
 r.put('index-finger-tip',r.at(0,.02));
 for(const [name,row,x] of [['middle',1,-.012],['ring',1,.012],['pinky',2,.02]])r.put(name+'-finger-tip',r.at(row,name==='middle'?middleGap:.04,x));
 const wrist=r.at(2,.04).add(new THREE.Vector3(0,-.03,0));r.put('wrist',wrist);
 for(const f of ['middle','ring','pinky']){
  const pt=r.src.hand.joints[f+'-finger-tip'].getWorldPosition(new THREE.Vector3());
  r.put(f+'-finger-phalanx-proximal',pt.clone().add(new THREE.Vector3(0,.025,0)));
 }
 r.put('index-finger-phalanx-proximal',r.at(0,.02).add(new THREE.Vector3(0,-.04,.035)));
}

test('R8: fixed single pointing finger with curled non-contact neighbors has one row and one visual bulge',()=>{
 const r=rig();curlPose(r);for(let n=0;n<60;n++)r.step();
 const s=r.snap('settled');assert.equal(s.rows.filter(row=>row.hovered).length,1);
 assert.equal(s.shader.count,1);assert.ok(s.delivered.every(p=>p.gap>0));assert.equal(r.events.length,0);
});

test('R8: real curled-tip contact still presses, selects and retains its offset through pose changes',()=>{
 const r=rig();curlPose(r);r.step();const row=r.rows[1],name='middle-finger-tip';
 for(const gap of [.025,.015,.005,-.001]){r.put(name,r.at(1,gap,-.012));r.step();}
 assert.equal(row.press.pressed,true);assert.equal(row.pressOwner,'xr0:middle-finger-tip');assert.equal(row.pokePressOffset,0);
 // Move only the proximal joint, keeping the tip stationary: now it points.
 const tip=r.src.hand.joints[name].getWorldPosition(new THREE.Vector3());
 r.put('middle-finger-phalanx-proximal',r.src.hand.joints.wrist.getWorldPosition(new THREE.Vector3()).lerp(tip,.3));r.step();
 assert.equal(row.press.pressed,true);assert.equal(row.pokePressOffset,0);
 r.put(name,r.at(1,.0001,-.012));r.step();assert.equal(row.press.pressed,true,'sub-hysteresis physical retreat must not release');
 r.put(name,r.at(1,.015,-.012));r.step();assert.equal(row.press.pressed,false);
 assert.equal(r.events.filter(e=>e.type==='select').length,1);
});

test('R8: extended press keeps physical release behavior when the finger curls',()=>{
 const r=rig();curlPose(r);const name='index-finger-tip',row=r.rows[0];
 for(const gap of [.04,.025,.015,.005,-.001]){r.put(name,r.at(0,gap));r.step();}
 assert.equal(row.press.pressed,true);assert.equal(row.pokePressOffset,.01);
 const w=r.src.hand.joints.wrist.getWorldPosition(new THREE.Vector3()),tip=r.src.hand.joints[name].getWorldPosition(new THREE.Vector3());
 r.put('index-finger-phalanx-proximal',w.clone().add(tip.clone().sub(w).multiplyScalar(1.6)));r.step();
 assert.equal(row.press.pressed,true);assert.equal(row.pokePressOffset,.01);
 r.put(name,r.at(0,.0001));r.step();assert.equal(row.press.pressed,true);
 r.put(name,r.at(0,.015));r.step();assert.equal(r.events.filter(e=>e.type==='select').length,1);
});

test('R8: two physically contacted same-hand rows retain independent execution',()=>{
 const r=rig();curlPose(r);
 for(const gap of [.04,.025,.015,.005,-.003]){r.put('index-finger-tip',r.at(0,gap));r.put('middle-finger-tip',r.at(1,gap));r.step();}
 assert.ok(r.rows[0].press.pressed&&r.rows[1].press.pressed);
 r.put('index-finger-tip',r.at(0,.02));r.put('middle-finger-tip',r.at(1,.02));r.step();
 assert.equal(r.events.filter(e=>e.type==='select').length,2);
});

test('R8: unknown finger pose retains proximity and loss cancels a direct contact',()=>{
 const r=rig();r.add('middle-finger-tip');
 r.put('index-finger-tip',r.at(0,.025));r.put('middle-finger-tip',r.at(1,.025));for(let i=0;i<40;i++)r.step();
 assert.equal(r.rows.filter(row=>row.hovered).length,2,'missing pose is not a global one-row policy');
 for(const gap of [.015,.005,-.003]){r.put('middle-finger-tip',r.at(1,gap));r.step();}
 assert.equal(r.rows[1].press.pressed,true);r.src.hand.joints['middle-finger-tip'].visible=false;r.step();
 assert.equal(r.rows[1].press.pressed,false);assert.equal(r.events.filter(e=>e.type==='select').length,0);
});

test('R8: a curled fingertip separated behind the sheet cannot use the contact hover exception',()=>{
 const r=rig();r.put('index-finger-tip',r.at(0,.02));
 const tip=r.at(1,-.05);r.put('middle-finger-tip',tip);
 r.put('wrist',tip.clone().add(new THREE.Vector3(0,-.06,.04)));
 r.put('middle-finger-phalanx-proximal',tip.clone().add(new THREE.Vector3(0,.025,0)));
 for(let n=0;n<60;n++)r.step();
 assert.equal(r.input.fingerProximity(r.src,'middle-finger-tip'),false);
 const row=r.rows[1],local=row.worldToLocal(tip.clone()),scale=row.getWorldScale(new THREE.Vector3()).z;
 assert.ok(local.z+.008/scale < -row.t);
 assert.equal(row.hovered,false);assert.equal(r.snap('rear separated').shader.count,1);
 assert.equal(r.events.length,0);
});
