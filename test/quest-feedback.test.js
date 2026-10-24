import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens, Dock, InputSystem, PackagingPanel } from '../src/index.js';
import { DEFAULTS } from '../src/core/defaults.js';
const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url)))), dt=1/60;
const apps=['house','ruler','scan','image','settings','notes','clock'].map(icon=>({icon,label:icon}));
function rig(distance, index){
 const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(); camera.position.y=1.6; scene.add(camera);
 const dock=new Dock(T,{apps,distance}); scene.add(dock); scene.updateMatrixWorld(true); dock.update(dt,camera);
 const group=()=>new THREE.Group(), input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 const src=input.xr[0]; src.connected=true;src.grip.visible=false;const tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={'index-finger-tip':tip};
 const icon=dock.icons[index], events=[];icon.addEventListener('press',()=>events.push('press'));icon.addEventListener('select',()=>events.push('select'));
 const move=gap=>{scene.updateMatrixWorld(true); const p=icon.centre.clone().add(new THREE.Vector3(0,0,icon.rb+gap/icon.inputScale)); tip.position.copy(icon.localToWorld(p));scene.updateMatrixWorld(true);input.update();dock.update(dt,camera,input.handPoints);return {gap,gripping:dock.gripping,hovered:icon.hovered,pressed:icon.press.pressed,scale:icon.scale.x,probed:!!icon.best,near:icon.distanceToSkin};};
 return {dock,icon,events,move,tip,scene,input,camera};
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
test('Every Dock icon remains pressable at both 55 and 40 cm',()=>{
 for(const distance of [.55,.4]) for(const index of [0,1,2,3,4,5,6]) {
  const r=rig(distance,index);
  for(const gap of [.14,.10,.08,.06,.04,.025,.017]) for(let n=0;n<20;n++) r.move(gap);
  assert.equal(r.icon.press.pressed,true,`${distance}m icon ${index} is suppressed; gripping=${r.dock.gripping}`);
 }
});
test('Dock plate fingertip contact dents without selecting an end icon',()=>{
 const r=rig(.4,3), {dock,input,scene,camera,tip}=r;
 const s=dock.length/2-dock.pad/2,[x,z]=dock.arc(s,0);
 const events=[];dock.addEventListener('select',e=>events.push(e.app.label));
 const move=y=>{tip.position.copy(dock.shelf.localToWorld(new THREE.Vector3(x,y,z)));scene.updateMatrixWorld(true);input.update();dock.update(dt,camera,input.handPoints);};
 move(.08);move(.06);move(.05);
 const hover=dock.base.material.uniforms.uTouchGlow.value.r;
 for(const y of [.04,.03,.025,.02,.017,.012,.004])move(y);
 assert.equal(dock.shelf.press.pressed,true);
 assert.ok(dock.shelf.press.depth>.002);
 assert.deepEqual(events,[],'plate approach must not select the outer icon');
 assert.ok(dock.base.material.uniforms.uTouchGlow.value.r>hover+.01);
 const shape=dock.shelfShape,pressed=shape.geometry.attributes.position.array.slice();
 const swell=DEFAULTS.look.dockPlate.swell*Math.max(0,dock.grip.hover.x);
 shape.fit(dock.length,dock.arcR,{neck:dock.neck,size:dock.size,swell:[0,swell]});
 const restored=shape.geometry.attributes.position.array;
 let dent=0;for(let i=1;i<pressed.length;i+=3)dent=Math.max(dent,restored[i]-pressed[i]);
 assert.ok(dent>.001,'pressed must deform actual plate geometry');
});

function palmRig(options={}) {
 const p=new PackagingPanel(T,{title:'Catalog',...options,items:[{label:'Sofas',items:[{label:'Chair',items:[{label:'Detail'}]}]}]});
 p.levels[0].rows[0].dispatchEvent({type:'select'}); for(let i=0;i<150;i++)p.update(dt);
 const scene=new THREE.Scene();scene.add(p); const group=()=>new THREE.Group();
 const input=new InputSystem({T,scene,camera:new THREE.PerspectiveCamera(),renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 const src=input.xr[0];src.connected=true;src.grip.visible=false;src.hand.joints={};
 const joint=(name,x,y)=>{const j=new THREE.Group();j.position.set(x,y,0);j.jointRadius=.008;src.hand.add(j);src.hand.joints[name]=j;return j;};
 joint('wrist',0,-.04).rotation.x=Math.PI/2;
 for(const [f,x] of [['index',-.025],['middle',-.008],['ring',.009],['pinky',.025]]){
  joint(`${f}-finger-phalanx-proximal`,x,.03);joint(`${f}-finger-tip`,x,.1);
 }
 const step=()=>{scene.updateMatrixWorld(true);input.update();p.update(dt);};
 const move=z=>{src.hand.position.z=z;step();};
 return {p,src,input,scene,step,move};
}

test('An unrelated palm behind a window does not swallow input',()=>{
 const r=palmRig();r.src.hand.position.z=-2;r.scene.updateMatrixWorld(true);
 assert.equal(r.input.palmStep(r.src,[r.p]),false);
});

test('A forward pointing index finger is not a whole-palm push',()=>{
 const r=palmRig();r.src.hand.joints['index-finger-tip'].position.z=-.055;
 r.scene.updateMatrixWorld(true);
 assert.equal(r.input.palmOf(r.src),null);
});

test('One frame of palm orientation noise does not break a held push',()=>{
 const r=palmRig();r.move(.08);r.move(.025);r.move(.005);
 r.src.hand.joints.wrist.rotation.x=Math.PI/2+Math.acos(.69);r.step();
 r.src.hand.joints.wrist.rotation.x=Math.PI/2;r.move(.005);
 assert.equal(r.p.palmOwner,'xr0');
 r.move(-.04);assert.equal(r.p.active,0);
});

test('A brief tracking dropout freezes push without counting unseen movement',()=>{
 const r=palmRig();r.move(.08);r.move(.025);r.move(.005);const child=r.p.levels[1],z=child.cur.z;
 r.src.hand.visible=false;r.step();assert.equal(child.cur.z,z);
 r.src.hand.visible=true;r.move(-.06);
 assert.equal(r.p.active,1,'reacquisition must not close based on an unseen jump');
 assert.ok(Math.abs(child.cur.z-z)<1e-9);
 r.move(-.09);assert.equal(r.p.active,0,'continued deliberate push still works');
});

test('A shallow finger press lights a row immediately',()=>{
 const r=palmRig(),row=r.p.levels[1].rows[0];
 const feed=z=>{row.feed({kind:'poke',id:'finger',point:new THREE.Vector3(0,0,z),radius:.008,pressOffset:.01});r.p.update(dt);};
 for(let i=0;i<30;i++)feed(.05);
 feed(row.surfaceZ(new THREE.Vector3())+.0179);
 assert.equal(row.press.pressed,true);
 assert.ok(row.glow>=.6,`first contact glow=${row.glow}`);
});

test('Pushed child never crosses its parent before dismissal',()=>{
 const r=palmRig();r.move(.08);r.move(.025);r.move(-.015);
 assert.equal(r.p.active,1);
 const [parent,child]=r.p.levels;
 assert.ok(child.cur.z-parent.cur.z>=r.p.pose.recedeZ-.0001);
});

test('A different hand can push after the first hand closes a child and leaves',()=>{
 const r=palmRig();r.p.levels[1].rows[0].dispatchEvent({type:'select'});
 for(let i=0;i<150;i++)r.p.update(dt);
 for(const z of [.08,.025,.005,-.04])r.move(z);
 assert.equal(r.p.active,1);
 r.src.connected=false;for(let i=0;i<150;i++)r.step();
 const second=r.input.xr[1];second.connected=true;second.grip.visible=false;
 second.hand.joints={};
 for(const [name,original] of Object.entries(r.src.hand.joints)){
  const joint=original.clone();joint.jointRadius=original.jointRadius;second.hand.add(joint);second.hand.joints[name]=joint;
 }
 for(const z of [.08,.025,.005,-.04]){second.hand.position.z=z;r.step();}
 assert.equal(r.p.active,0,'an absent first hand must not lock out a fresh second-hand approach');
});

test('Scaled close preserves layer order until fade and never reverses its exit',()=>{
 const r=palmRig({layerSpacing:.7/1.5});r.p.scale.setScalar(1.5);
 const child=r.p.levels[1],parent=r.p.levels[0],front=child.panel.t;
 const move=gap=>{r.src.hand.position.z=front*1.5+.022+gap;r.step();};
 move(.06);move(-.02);move(-.051);assert.equal(r.p.active,0);
 let last=child.cur.z;
 for(let i=0;i<40;i++){
  if(child.cur.opacity>.1)assert.ok((child.cur.z-parent.cur.z)*1.5>=.035-1e-6);
  assert.ok(child.cur.z<=last+1e-8,'exit must not rebound toward the user');
  last=child.cur.z;r.step();
 }
 for(let i=0;i<100;i++)r.step();
 assert.ok(Math.abs(parent.cur.z)<1e-5);assert.equal(r.p.closing.length,0);
});

test('Dock handle repositions on a fixed-radius sphere and keeps the released placement',()=>{
 const r=rig(.4,3),d=r.dock,src=r.input.xr[0];
 assert.ok(d.handle,'a dedicated positioning handle must exist');
 const frame=world=>{r.tip.position.copy(world);r.scene.updateMatrixWorld(true);r.input.update();d.update(dt,r.camera,r.input.handPoints);};
 const at=d.handle.localToWorld(new THREE.Vector3(0,0,d.handle.t+.012));
 frame(at);src.selecting=true;frame(at);
 assert.equal(d.rail.held?.id,'xr0');
 const start=d.position.clone();frame(at.clone().add(new THREE.Vector3(.12,-.12,0)));
 assert.ok(d.position.x>start.x+.04);assert.ok(d.position.y<start.y-.015);
 assert.ok(Math.abs(d.position.distanceTo(r.camera.position)-.4)<1e-8);
 const placed=d.position.clone();src.selecting=false;frame(at.clone().add(new THREE.Vector3(.12,-.12,0)));
 assert.equal(d.rail.held,null);
 for(let i=0;i<90;i++)d.update(dt,r.camera);
 assert.ok(d.position.distanceTo(placed)<.001,'release must not restore the initial height');
});

function rayRig() {
 const r=rig(.4,3),src=r.input.xr[0];r.tip.visible=false;src.hand.visible=false;
 const aim=(point,origin,pressed)=>{
  src.ray.position.copy(origin);
  src.ray.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),point.clone().sub(origin).normalize());
  src.selecting=pressed;r.scene.updateMatrixWorld(true);r.input.update();r.dock.update(dt,r.camera,r.input.handPoints);
 };
 return {...r,src,aim};
}

test('Controller ray can reposition and release the spherical Dock handle',()=>{
 const r=rayRig(),d=r.dock,h=d.handle,origin=r.camera.position.clone();
 const at=h.localToWorld(new THREE.Vector3(0,0,h.t+.012));
 r.aim(at,origin,false);r.aim(at,origin,true);const start=d.position.clone();
 r.aim(at.clone().add(new THREE.Vector3(.12,-.12,0)),origin,true);
 assert.ok(d.position.x>start.x+.04);assert.ok(d.position.y<start.y-.02);
 assert.ok(Math.abs(d.position.distanceTo(origin)-.4)<1e-8);
 r.aim(at,origin,false);assert.equal(d.rail.held,null);
});

test('Captured ray resizing keeps the plate pressed across its new bounds',()=>{
 const r=rayRig(),d=r.dock,arc=d.length/2-.003;
 const move=(s,pressed)=>{
  const [x,z]=d.arc(s,0),point=d.shelf.localToWorld(new THREE.Vector3(x,0,z));
  r.aim(point,point.clone().add(new THREE.Vector3(0,.3,0)),pressed);
 };
 move(arc,false);move(arc,true);
 assert.equal(d.grip.held?.id,'xr0');assert.equal(d.shelf.press.pressed,true);
 move(arc+.025,true);
 assert.equal(d.grip.held?.id,'xr0');assert.equal(d.shelf.press.pressed,true);
 assert.ok(d.shelf.press.depth>.002);assert.ok(d.size>1);
});
