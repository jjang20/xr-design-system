import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens, Dock, InputSystem, PackagingPanel } from '../src/index.js';
import { DEFAULTS } from '../src/core/defaults.js';
import { DockIcon } from '../src/components/DockIcon.js';
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
test('Early Dock icon acquisition leaves physical travel for visible pressure',()=>{
 const icon=new DockIcon(T,apps[0],.4),radius=.008;
 const feed=separation=>{icon.feed({kind:'poke',id:'finger',point:icon.centre.clone().add(new THREE.Vector3(0,0,icon.rb+radius+separation)),radius,pressOffset:.01});icon.sense();icon.update(dt);};
 feed(.06);for(let i=0;i<40;i++)feed(.002);
 assert.equal(icon.press.pressed,true,'early contact feedback must remain');
 const early=icon.dent.x;assert.ok(icon.skin.uGlow.value>0);
 for(let i=0;i<40;i++)feed(-.003);
 assert.ok(icon.dent.x>early+.002,'actual 3mm pressure must deepen the skin, not stay saturated');
 assert.ok(icon.dent.x<icon.dentMax);
});

test('Dock icon rubbing follows a finite fingertip until it leaves the front side',()=>{
 const icon=new DockIcon(T,apps[0],.4),radius=.008,events=[];
 for(const event of ['select','cancel'])icon.addEventListener(event,()=>events.push(event));
 const feed=(angle,separation)=>{icon.feed({kind:'poke',id:'finger',point:icon.centre.clone().add(new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)).multiplyScalar(icon.rb+radius+separation)),radius,pressOffset:.01});icon.sense();icon.update(dt);};
 feed(0,.06);feed(0,-.002);assert.equal(icon.press.pressed,true);
 for(let deg=1;deg<=70;deg++)feed(deg*Math.PI/180,-.002);
 assert.equal(icon.press.pressed,true,'the finger sphere is still touching the front hemisphere');
 assert.ok(icon.dentAt.x>.8,'local dent must follow the rubbing finger');
 feed(Math.PI/2+.01,-.002);
 assert.equal(icon.press.pressed,false);assert.deepEqual(events,['cancel']);
});

test('Dock icon sideways separation cancels instead of selecting',()=>{
 const icon=new DockIcon(T,apps[0],.4),radius=.008,events=[];
 for(const event of ['select','cancel'])icon.addEventListener(event,()=>events.push(event));
 const feed=(x,z)=>{icon.feed({kind:'poke',id:'finger',point:icon.centre.clone().add(new THREE.Vector3(x,0,z)),radius,pressOffset:.01});icon.sense();icon.update(dt);};
 feed(0,icon.rb+radius+.06);feed(0,icon.rb+radius-.002);
 feed(.020,icon.rb+radius-.002); // no retreat in the original front direction
 assert.equal(icon.press.pressed,false);assert.deepEqual(events,['cancel']);
});

test('Every Dock icon remains pressable at both 55 and 40 cm',()=>{
 for(const distance of [.55,.4]) for(const index of [0,1,2,3,4,5,6]) {
  const r=rig(distance,index);
  for(const gap of [.14,.10,.08,.06,.04,.025,.017]) for(let n=0;n<20;n++) r.move(gap);
  assert.equal(r.icon.press.pressed,true,`${distance}m icon ${index} is suppressed; gripping=${r.dock.gripping}`);
 }
});

test('Holding a Dock plate end above the skin still makes a local dent',()=>{
 const r=rig(.4,3),d=r.dock,src=r.input.xr[0];
 const s=d.length/2-d.pad/2,[x,z]=d.arc(s,0);
 const frame=()=>{r.tip.position.copy(d.shelf.localToWorld(new THREE.Vector3(x,.025,z)));r.scene.updateMatrixWorld(true);r.input.update();d.update(dt,r.camera,r.input.handPoints);};
 frame();src.selecting=true;for(let i=0;i<30;i++)frame();
 assert.equal(d.grip.held?.id,'xr0');
 const shape=d.shelfShape,pressed=shape.geometry.attributes.position.array.slice();
 const swell=DEFAULTS.look.dockPlate.swell*Math.max(0,d.grip.hover.x);
 shape.fit(d.length,d.arcR,{neck:d.neck,size:d.size,swell:[0,swell]});
 const restored=shape.geometry.attributes.position.array;
 let dent=0;for(let i=1;i<pressed.length;i+=3)dent=Math.max(dent,restored[i]-pressed[i]);
 assert.ok(dent>.001,'capture feedback must deform the plate even without surface penetration');
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

test('A tracking jump on first palm contact cannot dismiss a layer',()=>{
 const r=palmRig();r.move(.08);r.move(-.04);
 assert.equal(r.p.active,1,'120mm frame movement cannot become a 70mm deliberate push');
 assert.equal(r.p.palmOwner,undefined);
});

test('Pushing an opening child does not freeze its fade or an unrelated exit',()=>{
 const {p}=palmRig(),old=p.levels[1];
 p.back(0);p.open(p.levels[0].item.items[0],p.levels[0].rows[0]);
 const child=p.levels[1],normal=new THREE.Vector3(0,0,-1);
 const frame=z=>{p.feedPalm({id:'fresh',normal,radius:.012,point:new THREE.Vector3(0,child.cur.y,z)});p.update(dt);};
 const front=()=>child.cur.z+child.panel.t*Math.min(child.cur.sx,child.cur.sy)+.022;
 frame(front()+.06);const contact=front()-.01;frame(contact);
 assert.equal(p.palmOwner,'fresh');
 for(let i=0;i<60;i++)frame(contact);
 assert.ok(child.cur.opacity>.99,'opening fade must complete during a held push');
 assert.ok(old.cur.opacity<.01,'unrelated closing layer must finish fading');
 assert.equal(p.closing.length,0);
});

test('Prepared window geometry stays independent during overlapping navigation',()=>{
 const {p}=palmRig();p.prepareGeometry();const first=p.levels[1].panel.body.geometry;
 p.back(0);p.open(p.levels[0].item.items[0],p.levels[0].rows[0]);
 const second=p.levels[1].panel.body.geometry;
 assert.notEqual(first,second);assert.deepEqual(first.attributes.position.array,second.attributes.position.array);
 const x=second.attributes.position.getX(0);first.attributes.position.setX(0,x+1);first.dispose();
 assert.equal(second.attributes.position.getX(0),x,'one closing mesh cannot mutate the newly opened window');
 const firstRow=p.levels[0].rows[0].body.geometry,secondRow=p.levels[1].rows[0].body.geometry;
 assert.notEqual(firstRow,secondRow);const rowX=secondRow.attributes.position.getX(0);
 firstRow.attributes.position.setX(0,rowX+1);firstRow.dispose();
 assert.equal(secondRow.attributes.position.getX(0),rowX,'reused row bevels must also be independently owned');
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

test('Dock handle repositions on a bounded oval and keeps the released placement',()=>{
 const r=rig(.4,3),d=r.dock,src=r.input.xr[0];
 assert.ok(d.handle,'a dedicated positioning handle must exist');
 const frame=world=>{r.tip.position.copy(world);r.scene.updateMatrixWorld(true);r.input.update();d.update(dt,r.camera,r.input.handPoints);};
 const at=d.handle.localToWorld(new THREE.Vector3(0,0,d.handle.t+.012));
 frame(at);src.selecting=true;frame(at);
 assert.equal(d.rail.held?.id,'xr0');
 const start=d.position.clone();frame(at.clone().add(new THREE.Vector3(.12,-.12,0)));
 assert.ok(d.position.x>start.x+.04);assert.ok(d.position.y<start.y-.015);
 assert.ok(d.position.distanceTo(d.rail.anchor)<=DEFAULTS.dockRail.maxReach);
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

test('Controller ray can reposition and release the Dock handle',()=>{
 const r=rayRig(),d=r.dock,h=d.handle,origin=r.camera.position.clone();
 const at=h.localToWorld(new THREE.Vector3(0,0,h.t+.012));
 r.aim(at,origin,false);r.aim(at,origin,true);const start=d.position.clone();
 r.aim(at.clone().add(new THREE.Vector3(.12,-.12,0)),origin,true);
 assert.ok(d.position.x>start.x+.04);assert.ok(d.position.y<start.y-.02);
 assert.ok(d.position.distanceTo(d.rail.anchor)<=DEFAULTS.dockRail.maxReach);
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


test('Continuous approach to the central handle never gives icon3 a press',()=>{
 const r=rig(.4,3),h=r.dock.handle;
 const frame=gap=>{r.tip.position.copy(h.localToWorld(new THREE.Vector3(0,0,h.t+gap)));r.scene.updateMatrixWorld(true);r.input.update();r.dock.update(dt,r.camera,r.input.handPoints);};
 for(const gap of [.12,.08,.06,.04,.025,.017,.012]) frame(gap);
 r.input.xr[0].selecting=true;frame(.012);
 assert.equal(r.dock.rail.held?.id,'xr0');
 assert.equal(r.dock.icons.some(i=>i.press.pressed),false);
 assert.deepEqual(r.events,[]);
});

test('Dock icon release waits for surface separation; lateral exit and loss cancel',()=>{
 for(const ending of ['out','side','loss']) {
  const r=rig(.4,3);
  for(const gap of [.12,.08,.04,.017,.004,-.004])for(let n=0;n<12;n++)r.move(gap);
  r.move(0);assert.equal(r.events.includes('select'),false,'4mm retreat still overlaps fingertip sphere');
  if(ending==='out')r.move(.04);
  else if(ending==='side'){
   r.tip.position.copy(r.icon.localToWorld(r.icon.centre.clone().add(new THREE.Vector3(r.icon.touchRadius*1.3,0,0))));
   r.scene.updateMatrixWorld(true);r.input.update();r.dock.update(dt,r.camera,r.input.handPoints);
  } else {r.input.xr[0].connected=false;r.input.update();r.dock.update(dt,r.camera);}
  assert.equal(r.events.filter(e=>e==='select').length,ending==='out'?1:0);
 }
});

test('Scaled row holds selection while finger still overlaps its contact crown',()=>{
 const r=palmRig(),row=r.p.levels[1].rows[0];r.p.scale.setScalar(1.5);r.scene.updateMatrixWorld(true);
 const events=[];row.addEventListener('select',()=>events.push('select'));
 const feed=gap=>{const scale=row.getWorldScale(new THREE.Vector3()).z;row.feed({kind:'poke',id:'finger',point:new THREE.Vector3(0,0,row.surfaceZ(new THREE.Vector3())+gap/scale),radius:.008,pressOffset:.01});r.p.update(dt);};
 for(let n=0;n<30;n++)feed(.05);
 for(const gap of [.017,.004,-.004,0])feed(gap);
 assert.equal(events.length,0);
 feed(.04);assert.equal(events.length,1);
});


test('Placed Dock ignores yaw and head height; only large horizontal movement follows',()=>{
 const r=rig(.4,3),d=r.dock,start=d.position.clone(),q=d.quaternion.clone();
 r.camera.rotation.y=1;r.camera.position.y-=.2;r.camera.position.x+=.05;r.scene.updateMatrixWorld(true);
 for(let i=0;i<120;i++)d.update(dt,r.camera);
 assert.ok(d.position.distanceTo(start)<.001);assert.ok(d.quaternion.angleTo(q)<.001);
 r.camera.position.x+=.5;r.scene.updateMatrixWorld(true);
 for(let i=0;i<180;i++)d.update(dt,r.camera);
 assert.ok(d.position.x>start.x+.3);assert.ok(Math.abs(d.position.y-start.y)<1e-8);
});

test('Window overlap exposes each actual header despite variable heights; back only hits titles',()=>{
 const r=palmRig(),p=r.p;
 for(let i=0;i<120;i++)p.update(dt);
 const [back,front]=p.levels;
 const backTop=back.cur.y+back.size.H*back.cur.sy/2,frontTop=front.cur.y+front.size.H*front.cur.sy/2;
 assert.ok(Math.abs(backTop-frontTop-back.size.titleBand*back.cur.sy)<1e-6);
 assert.equal(back.panel.inside(new THREE.Vector3(0,0,back.panel.t)),false);
 assert.ok(back.title.fillOpacity>.8);assert.ok(back.panel.skin.uniforms.uOpacity.value<.5);
});


test('Window title drag and corner resize capture whole stack for hand and ray',()=>{
 for(const kind of ['poke','ray']) {
  const r=palmRig(),p=r.p,h=p.levels[1].panel;
  const start=h.localToWorld(new THREE.Vector3(0,h.h/2-p.levels[1].size.titleBand/2,h.t+.012));
  const frame=(handle,point,hold)=>{p.updateMatrixWorld(true);handle.feed({kind,id:'owner',point:handle.worldToLocal(point.clone()),radius:.008,pinch:hold,pressed:hold,captured:hold});p.update(dt);};
  frame(h,start,true);const initial=p.position.clone();frame(h,start.clone().add(new THREE.Vector3(.06,-.03,.02)),true);
  assert.ok(p.position.distanceTo(initial.clone().add(new THREE.Vector3(.06,-.03,.02)))<1e-8);
  assert.equal(p.levels.some(l=>l.rows.some(row=>row.enabled)),false);
  assert.equal(p.palmDistance({point:start,normal:new THREE.Vector3(0,0,-1),radius:.012}),Infinity);
  frame(h,start,false);assert.equal(p.controls.held,null);assert.equal(p.active,1,'drag release must not navigate back');
  const corner=p.levels[1].corners[1],point=corner.getWorldPosition(new THREE.Vector3());
  const size=p.scale.x;frame(corner,point,true);
  const dir=point.clone().sub(p.getWorldPosition(new THREE.Vector3())).normalize();frame(corner,point.clone().addScaledVector(dir,.04),true);
  assert.ok(p.scale.x>size);assert.equal(p.scale.x,p.scale.y);assert.equal(p.scale.x,p.scale.z);
  p.update(dt);assert.equal(p.controls.held,null,'tracking loss ends capture without selection');assert.equal(p.active,1);
 }
});

test('Dock distance and height manipulation preserves oval ratio and icon physical size',()=>{
 const r=rig(.4,3),d=r.dock,h=d.handle;
 const frame=point=>{r.tip.position.copy(point);r.scene.updateMatrixWorld(true);r.input.update();d.update(dt,r.camera,r.input.handPoints);};
 const point=h.localToWorld(new THREE.Vector3(0,0,h.t+.012));
 frame(point);r.input.xr[0].selecting=true;frame(point);
 const side=d.side;frame(point.clone().add(new THREE.Vector3(.12,-.05,-.08)));
 assert.ok(d.rail.radius>DEFAULTS.dockRail.radius);assert.ok(d.rail.height<DEFAULTS.dockRail.height);
 assert.equal(d.side,side);assert.equal(d.size,1);assert.equal(d.icons.some(i=>i.hovered||i.press.pressed),false);
 const off=d.rail.offset();assert.ok(Math.abs(Math.hypot(off.x/DEFAULTS.dockRail.aspect,off.z)-d.rail.radius)<1e-8);
 d.resetPlacement();r.camera.position.set(1,1.2,2);r.scene.updateMatrixWorld(true);d.update(dt,r.camera);
 assert.ok(d.rail.anchor.distanceTo(r.camera.position)<1e-8);assert.equal(d.rail.held,null);
});


test('Palm push uses transformed physical travel and late-valid diagnostics keep the root safe',()=>{
 const r=palmRig(),p=r.p;p.position.set(.2,1.3,-.5);p.rotation.y=.6;p.scale.setScalar(2);p.updateMatrixWorld(true);
 const child=p.levels[1],front=child.cur.z+child.panel.t*child.cur.sx;
 const normal=new THREE.Vector3(0,0,-1).transformDirection(p.matrixWorld);
 const feed=gap=>{p.updateMatrixWorld(true);p.feedPalm({id:'palm',normal,radius:.012,point:p.localToWorld(new THREE.Vector3(0,child.cur.y,front+(.022+gap)/2))});p.update(dt);};
 feed(-.003);assert.equal(p.palmOwner,undefined);assert.equal(p.palmDiagnostic.state,'approach-required');
 feed(.04);feed(-.005);assert.equal(p.palmOwner,'palm');feed(-.055);assert.equal(p.active,0);
 for(let i=0;i<180;i++)p.update(dt);assert.equal(p.levels[0].item.label,'Catalog');
 p.resetInteraction();assert.equal(p.controls.held,null);assert.equal(p.palmOwner,undefined);
});


test('Actual separation rearms repeated shallow taps without requiring the early-offset distance',()=>{
 const p=new PackagingPanel(T,{title:'Catalog',items:[{label:'Chair'}]}),row=p.levels[0].rows[0],events=[];row.addEventListener('select',()=>events.push(1));
 // A leaf avoids changing the stack while testing repeated input.
 const feed=gap=>{row.feed({kind:'poke',id:'finger',point:new THREE.Vector3(0,0,front+gap),radius:.008,pressOffset:.01});row.update(dt);};
 for(let i=0;i<90;i++){row.feed({kind:'poke',id:'finger',point:new THREE.Vector3(0,0,.05),radius:.008,pressOffset:.01});row.update(dt);}
 const front=row.surfaceZ(new THREE.Vector3());
 for(const gap of [.017,.004,.009])feed(gap);
 assert.equal(events.length,1);for(let i=0;i<10;i++)feed(.009);assert.equal(row.press.pressed,false,'separated hold must not immediately repress');
 for(const gap of [.004,.009])feed(gap);assert.equal(events.length,2);
});

test('Reference reset blocks held controller capture until release and a new press',()=>{
 for(const target of ['dock','window']) {
  const r=target==='dock'?rayRig():palmRig();
  const p=r.dock??r.p,src=r.src??r.input.xr[0];src.hand.visible=false;src.grip.visible=false;
  if(r.tip)r.tip.visible=false;else Object.values(src.hand.joints).forEach(j=>{j.visible=false;});
  const h=r.dock?.handle??r.p.levels.at(-1).panel;
  const at=()=>h.localToWorld(new THREE.Vector3(0,r.p?h.h/2-r.p.levels.at(-1).size.titleBand/2:0,h.t));
  const frame=pressed=>{const point=at();src.selecting=pressed;src.ray.position.copy(point.clone().add(new THREE.Vector3(0,0,1)));src.ray.quaternion.identity();r.scene.updateMatrixWorld(true);r.input.update();if(r.dock)p.update(dt,r.camera,r.input.handPoints);else p.update(dt);};
  frame(false);frame(true);assert.ok(r.dock?p.rail.held:p.controls.held);
  r.input.reset();if(r.dock)p.resetPlacement();else p.resetInteraction();
  frame(true);assert.equal(!!(r.dock?p.rail.held:p.controls.held),false);
  frame(false);frame(true);assert.ok(r.dock?p.rail.held:p.controls.held);
 }
});


test('Window resize controls hide their visuals until hover and keep a separate hit target',()=>{
 const r=palmRig(),p=r.p,h=p.levels[1].corners[0];p.update(dt);
 assert.equal(h.affordance.visible,false);assert.equal(h.body.visible,false);assert.equal(h.visible,true);assert.notEqual(h.hitMeshes[0],h.body);
 h.feed({kind:'poke',id:'finger',point:new THREE.Vector3(0,0,h.t+.03),radius:.008});p.update(dt);
 assert.equal(h.affordance.visible,true);assert.equal(h.body.visible,true);p.update(dt);assert.equal(h.affordance.visible,false);assert.equal(h.body.visible,false);
 assert.equal(h.icon,undefined);
});

test('Releasing a moved window control preserves current hover without navigating',()=>{
 for(const kind of ['poke','ray']) {
  const r=palmRig(),p=r.p,h=p.levels[1].corners[1];
  const feed=(point,hold)=>{p.updateMatrixWorld(true);h.feed({kind,id:'owner',point:h.worldToLocal(point.clone()),radius:.008,pinch:hold,pressed:hold,captured:hold});p.update(dt);};
  const start=h.localToWorld(new THREE.Vector3(0,0,h.t+.012));
  feed(start,true);feed(start.clone().add(new THREE.Vector3(.04,0,0)),true);
  assert.ok(p.controls.held?.moved);
  const at=h.localToWorld(new THREE.Vector3(0,0,h.t+.012));feed(at,false);
  assert.equal(p.controls.held,null);assert.equal(h.hovered,true);assert.equal(h.affordance.visible,true);
  assert.equal(p.active,1);p.update(dt);assert.equal(h.affordance.visible,false);
 }
});

test('Every exposed rear title keeps its full opacity while sheets fade',()=>{
 const r=palmRig(),p=r.p;
 p.open({label:'Short child',items:[{label:'One'}]},null);
 for(let i=0;i<180;i++)p.update(dt);
 for(const rear of p.levels.slice(0,-1)) {
  assert.ok(Math.abs(rear.title.fillOpacity-1)<1e-8);
  assert.ok(rear.panel.skin.uniforms.uOpacity.value<1);
 }
});
