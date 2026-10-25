import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,PackagingPanel,Dock,InputSystem} from '../src/index.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url)))),dt=1/60;
const apps=['house','ruler','scan','image','settings','notes','clock'].map(icon=>({icon,label:icon}));
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
 const step=()=>{scene.updateMatrixWorld(true);input.update();delivered=rows.flatMap((r,i)=>r.probes.map(q=>({row:i,id:q.id,kind:q.kind,allowHover:q.allowHover,gap:(q.point.z-r.surfaceZ(q.point))*r.getWorldScale(new THREE.Vector3()).z-(q.radius??0),distance:r.faceDistance(q.point,q.radius)})));p.update(dt);scene.updateMatrixWorld(true);};
 const at=(i,gap,x=0)=>{scene.updateMatrixWorld(true);const r=rows[i],q=new THREE.Vector3(x,0,0);q.z=(r.press.pressed?r.pokeFront:r.surfaceZ(q))+(.008+gap)/r.getWorldScale(new THREE.Vector3()).z;return r.localToWorld(q);};
 const put=(name,world)=>{const j=src.hand.joints[name]??add(name);j.position.copy(src.hand.worldToLocal(world.clone()));};
 const snap=label=>({label,frame:input.frame,delivered:structuredClone(delivered),rows:rows.map((r,i)=>({i,hovered:r.hovered,hover:r.hover,bulge:r.bulge,pressed:r.press.pressed,contacted:r.press.contacted??false,glow:r.glow,dents:r.contactDents?.map(c=>({id:c.id,depth:c.depth,glow:c.glow}))??[]})),shader:{count:level.panel.skin.uniforms.uBulgeCount.value,heights:level.panel.skin.uniforms.uBulgeParam.value.map(v=>v.y),glows:level.panel.skin.uniforms.uBulgeGlow.value.map(v=>v.y)}});
 return {p,scene,camera,input,src,rows,tip,add,put,at,step,snap,events};
}

function kinematic(r,{angles=[50,90,130],missing=false}={}){
 const index=r.at(0,.020),wrist=index.clone().add(new THREE.Vector3(0,-.155,0));r.put('wrist',wrist);r.src.hand.joints.wrist.rotation.x=Math.PI/2;
 const pose={};
 for(const [f,x,baseY,lengths]of [['index',0,.070,[.040,.025,.020]],['middle',.021,.075,[.040,.025,.020]],['ring',.041,.069,[.037,.023,.019]],['pinky',.058,.057,[.030,.020,.017]]]){
  let p=wrist.clone().add(new THREE.Vector3(x,baseY,0));r.put(f+'-finger-phalanx-proximal',p);
  const a=f==='index'?[0,0,0]:angles;for(let i=0;i<3;i++){const q=a[i]*Math.PI/180;p=p.clone().add(new THREE.Vector3(0,lengths[i]*Math.cos(q),lengths[i]*Math.sin(q)));r.put(f+'-finger-'+(['phalanx-intermediate','phalanx-distal','tip'][i]),p);}
  pose[f]={angles:a,tip:p.toArray(),ratio:p.distanceTo(wrist)/Math.hypot(x,baseY)};
 }
 if(missing)for(const f of ['middle','ring','pinky'])r.src.hand.joints[f+'-finger-phalanx-proximal'].visible=false;
 return pose;
}
function dockRig(dockOptions={}){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.y=1.6;scene.add(camera);
 const d=new Dock(T,{apps,distance:.4,...dockOptions});scene.add(d);const group=()=>new THREE.Group();
 const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 const src=input.xr[0],tip=new THREE.Group();src.hand.add(tip);tip.jointRadius=.008;src.hand.joints={'index-finger-tip':tip};src.grip.visible=false;
 const frame=()=>{scene.updateMatrixWorld(true);input.update();d.update(dt,camera,input.handPoints);scene.updateMatrixWorld(true);};
 for(let i=0;i<120;i++)frame();src.connected=true;
 return {d,scene,src,tip,frame};
}

function actualVertexOutput(h,wanted){
 const a=h.body.children[0].geometry.attributes.position,u=h.skin;
 let p,nearest=Infinity;
 for(let i=0;i<a.count;i++){const v=new THREE.Vector3().fromBufferAttribute(a,i).normalize(),dd=v.distanceToSquared(wanted);if(dd<nearest){p=v;nearest=dd;}}
 assert.ok(nearest<1e-10,'centre and 15-degree samples must be actual mesh vertices');
 const d=new THREE.Vector3(u.uDent.value.x,u.uDent.value.y,u.uDent.value.z),q=p.clone().sub(d);
 const e=Math.exp(-q.lengthSq()/(u.uDentWidth.value**2));
 const pos=p.clone().multiplyScalar(1-u.uDent.value.w*e),along=d.clone().multiplyScalar(pos.dot(d)),transverse=pos.clone().sub(along);
 pos.addScaledVector(along,-u.uSquash.value).addScaledVector(transverse,u.uSquash.value*.5);
 pos.y=Math.max(-1,pos.y);return pos.multiplyScalar(h.r*h.inputScale);
}


for(const angles of [[50,90,130],[60,100,140]])test('R9: articulated bent neighbors '+angles+' do not sustain list hover without contact',()=>{
 const r=rig();kinematic(r,{angles});for(let i=0;i<90;i++)r.step();
 const s=r.snap('settled');assert.equal(s.rows.filter(x=>x.hovered).length,1);
 assert.equal(s.shader.count,1);assert.equal(r.events.length,0);assert.ok(s.delivered.every(x=>x.gap>0));
});
test('R9: rigidly rotating a bent hand cannot turn its curled neighbors into pointers',()=>{
 for(const axis of [new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)])for(const angle of [-.25,.25]){
  const r=rig();kinematic(r);r.src.hand.quaternion.setFromAxisAngle(axis,angle);r.scene.updateMatrixWorld(true);
  assert.equal(r.input.fingerProximity(r.src,'index-finger-tip'),true);
  for(const f of ['middle','ring','pinky'])assert.equal(r.input.fingerProximity(r.src,f+'-finger-tip'),false);
 }
});
test('R9: genuinely straight fingers and incomplete pose retain independent eligibility',()=>{
 const r=rig();kinematic(r,{angles:[0,0,0]});r.scene.updateMatrixWorld(true);
 for(const f of ['index','middle','ring','pinky'])assert.equal(r.input.fingerProximity(r.src,f+'-finger-tip'),true);
 kinematic(r);r.scene.updateMatrixWorld(true);r.src.hand.joints['middle-finger-phalanx-intermediate'].visible=false;
 assert.equal(r.input.fingerProximity(r.src,'middle-finger-tip'),true,'unknown curvature retains legacy radial fallback');
});
test('R9: curled physical contact and extended contact still execute independent leaves',()=>{
 const r=rig();kinematic(r);
 const base=Object.fromEntries(['phalanx-proximal','phalanx-intermediate','phalanx-distal','tip'].map(s=>{const name='middle-finger-'+s;return[name,r.src.hand.joints[name].getWorldPosition(new THREE.Vector3())];}));
 for(const gap of [.10,.06,.025,.015,.005,-.003]){
  r.put('index-finger-tip',r.at(0,gap));const delta=r.at(1,gap).sub(base['middle-finger-tip']);
  for(const [n,p]of Object.entries(base))r.put(n,p.clone().add(delta));r.step();
 }
 assert.ok(r.rows[0].press.pressed&&r.rows[1].press.pressed);
 r.put('index-finger-tip',r.at(0,.02));r.put('middle-finger-tip',r.at(1,.02));r.step();
 assert.equal(r.events.filter(e=>e.type==='select').length,2);
});
for(const distance of [.4,Math.hypot(.28,.48)])test('R9: Dock sphere follows real pressure immediately and held shape has a clear concave well at '+distance,()=>{
 const r=dockRig({distance}),h=r.d.handle,at=gap=>h.localToWorld(new THREE.Vector3(0,0,h.r+.008+gap));
 for(const gap of [.04,.025,.015,.005]){r.tip.position.copy(at(gap));r.frame();}
 const early=h.dent.x*h.inputScale;r.tip.position.copy(at(-.004));r.frame();
 assert.ok(h.dent.x*h.inputScale>=.004,'physical penetration must not wait behind a second spring');
 assert.ok(h.dent.x*h.inputScale>early+.003);
 r.src.selecting=true;for(let i=0;i<60;i++){r.tip.position.copy(at(.005));r.frame();}
 assert.equal(r.d.rail.held?.id,'xr0');const theta=Math.PI/12;
 const centre=actualVertexOutput(h,new THREE.Vector3(0,0,1)),left=actualVertexOutput(h,new THREE.Vector3(-Math.sin(theta),0,Math.cos(theta))),right=actualVertexOutput(h,new THREE.Vector3(Math.sin(theta),0,Math.cos(theta)));
 assert.ok((left.z+right.z)/2-centre.z>=.001,'held centre at least1mm behind its15degree neighbors (R9 trial)');
 assert.equal(h.skin.uGlow.value,.8);assert.equal(h.skin.uBodyOpacity.value,.38);
 r.src.connected=false;for(let i=0;i<120;i++)r.frame();assert.ok(Math.abs(h.dent.x)<1e-5);assert.equal(r.d.rail.held,null);
});
