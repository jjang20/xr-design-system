import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,Dock,PackagingPanel,InputSystem} from '../src/index.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url)))),dt=1/60;
const apps=['house','ruler','scan','image','settings','notes','clock'].map(icon=>({icon,label:icon}));
function rig(kind='window'){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.y=1.6;scene.add(camera);
 const obj=kind==='dock'?new Dock(T,{apps,distance:.4}):new PackagingPanel(T,{title:'Catalog',items:[{label:'Sofas',items:[{label:'Chair'},{label:'Table'}]}]});scene.add(obj);
 if(kind==='window'){obj.scale.setScalar(1.5);obj.levels[0].rows[0].dispatchEvent({type:'select'});}
 const settle=()=>{for(let n=0;n<120;n++){scene.updateMatrixWorld(true);if(kind==='dock')obj.update(dt,camera);else obj.update(dt);}};settle();
 const group=()=>new THREE.Group(),input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 const sources=input.xr.map(src=>{src.connected=false;src.grip.visible=false;const tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={'index-finger-tip':tip};return {src,tip};});
 const events=[];obj.addEventListener('select',e=>events.push('select'));obj.addEventListener('back',e=>events.push('back'));
 const frame=()=>{scene.updateMatrixWorld(true);input.update();if(kind==='dock')obj.update(dt,camera,input.handPoints);else obj.update(dt);scene.updateMatrixWorld(true);};
 const normal=h=>new THREE.Vector3(0,0,1).transformDirection(h.matrixWorld);
 const point=(h,gap=.012)=>{scene.updateMatrixWorld(true);const inv=h.matrixWorld.clone().invert(),box=new THREE.Box3();for(const m of h.hitMeshes){m.geometry.computeBoundingBox();box.union(m.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld)));}assert.equal(box.isEmpty(),false,'handle needs actual hit geometry');const p=box.getCenter(new THREE.Vector3());p.z=box.max.z+gap/Math.abs(h.getWorldScale(new THREE.Vector3()).z);return h.localToWorld(p);};
 const hand=(n,p,pinch=false)=>{const{src,tip}=sources[n];src.connected=true;src.selecting=pinch;src.hand.visible=tip.visible=true;tip.position.copy(p);};
 const ray=(n,p,down=false,axis=new THREE.Vector3(0,0,1))=>{const{src,tip}=sources[n];src.connected=true;src.selecting=down;src.hand.visible=tip.visible=false;src.ray.position.copy(p).addScaledVector(axis,.5);src.ray.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),axis.clone().negate());};
 const put=(mode,n,p,held=false,axis)=>mode==='poke'?hand(n,p,held):ray(n,p,held,axis);
 const step=(mode,n,p,held=false,axis)=>{put(mode,n,p,held,axis);frame();};
 const lose=n=>{sources[n].src.connected=false;frame();};
 return {obj,scene,camera,input,sources,events,frame,point,normal,hand,ray,put,step,lose};
}
function visual(h){const node=h.affordance??h.bubble??h.body;assert.ok(node,'API assumption: affordance or bubble/body');for(let p=node;p;p=p.parent)if(!p.visible)return false;return true;}
function moves(r){const l=r.obj.levels.at(-1);assert.ok(Array.isArray(l.moves)&&l.moves.length===2,'new contract: level.moves contains two side movement bubbles');return l.moves;}
function capture(r){return r.obj.controls?.held??r.obj.rail?.held;}
const same=(a,b,msg)=>assert.ok(a.distanceTo(b)<1e-6,msg);

for(const mode of ['poke','ray'])test('Title '+mode+' cannot drag; movement is confined to side bubbles',()=>{
 const r=rig(),h=r.obj.levels.at(-1).panel,start=r.point(h,.012),axis=r.normal(h),position=r.obj.position.clone();
 r.step(mode,0,start,false,axis);r.step(mode,0,start,true,axis);r.step(mode,0,start.clone().add(new THREE.Vector3(.04,0,0)),true,axis);
 assert.equal(!!capture(r),false,'title must not own WindowControls');same(r.obj.position,position,'title must not move the stack');
});

test('Rear title remains a direct finger back target',()=>{
 const r=rig(),h=r.obj.levels[0].panel;for(const gap of [.06,.025,.017,.004,.002,.012,.04])r.step('poke',0,r.point(h,gap));
 assert.equal(r.obj.active,0);assert.equal(r.events.filter(e=>e==='back').length,1);
});

for(const mode of ['poke','ray'])for(const kind of ['move','resize'])test(kind+' '+mode+' captures, drags beyond initial bounds, releases with hover and hides on loss',()=>{
 const r=rig(),h=kind==='move'?moves(r)[0]:r.obj.levels.at(-1).corners[1],p=r.obj;
 assert.equal(visual(h),false,'window affordance hidden at rest');
 const start=r.point(h,.012),axis=r.normal(h);r.step(mode,0,start,false,axis);assert.equal(h.hovered,true);assert.equal(visual(h),true);
 const pos=p.position.clone(),scale=p.scale.x;r.step(mode,0,start,true,axis);assert.equal(capture(r)?.id,'xr0');
 const delta=kind==='move'?new THREE.Vector3(.04,.015,0):h.getWorldPosition(new THREE.Vector3()).sub(p.getWorldPosition(new THREE.Vector3())).normalize().multiplyScalar(.04);
 r.step(mode,0,start.clone().add(delta),true,axis);assert.equal(capture(r)?.id,'xr0');assert.equal(visual(h),true);
 if(kind==='move'){assert.ok(p.position.clone().sub(pos).distanceTo(delta)<.003);assert.equal(p.scale.x,scale);}else{assert.ok(p.scale.x>scale+.03);same(p.position,pos,'resize keeps stack centre');assert.equal(p.scale.x,p.scale.y);assert.equal(p.scale.y,p.scale.z);}
 r.step(mode,0,r.point(h,.012),false,axis);assert.equal(!!capture(r),false);assert.equal(h.hovered,true);assert.equal(visual(h),true,'release while hovering must not flash hidden');
 assert.equal(p.active,1);assert.equal(r.events.length,0,'manipulation must not navigate');r.lose(0);assert.equal(visual(h),false);
 r.step(mode,0,r.point(h,.012),false,axis);r.step(mode,0,r.point(h,.012),true,axis);assert.equal(capture(r)?.id,'xr0','fresh input reacquires');
});

for(const kind of ['move','resize'])test(kind+' physical press alone gives feedback without dragging',()=>{
 const r=rig(),h=kind==='move'?moves(r)[0]:r.obj.levels.at(-1).corners[1],p=r.obj,pos=p.position.clone(),scale=p.scale.x;
 for(const gap of [.06,.03,.017,.004])r.step('poke',0,r.point(h,gap),false);
 assert.equal(h.press.pressed,true,'physical press remains independent feedback');
 r.step('poke',0,r.point(h,.004).add(new THREE.Vector3(.008,.003,0)),false);
 assert.equal(!!capture(r),false);same(p.position,pos,'no pinch means no movement');assert.equal(p.scale.x,scale);
});

test('Window one owner blocks the other hand and loss permits fresh acquisition',()=>{
 const r=rig(),[left,right]=moves(r),p=r.obj;
 r.step('poke',0,r.point(left,.012),false);r.step('poke',0,r.point(left,.012),true);
 const heldPoint=r.point(left,.012),pos=p.position.clone();r.hand(0,heldPoint,true);r.hand(1,r.point(right,.012),true);r.frame();
 assert.equal(capture(r)?.id,'xr0');same(p.position,pos,'second hand must not take over');
 r.hand(1,r.point(right,.012).add(new THREE.Vector3(.04,0,0)),true);r.frame();assert.equal(capture(r)?.id,'xr0');same(p.position,pos,'non-owner motion is ignored');
 r.sources[0].src.connected=r.sources[1].src.connected=false;r.frame();assert.equal(!!capture(r),false);
 r.step('poke',1,r.point(right,.012),false);r.step('poke',1,r.point(right,.012),true);assert.equal(capture(r)?.id,'xr1');
});

test('Dock central icon accepts its 45 degree below/front natural approach',()=>{
 const r=rig('dock'),i=r.obj.icons[3],centre=i.localToWorld(i.centre.clone()),dir=new THREE.Vector3(0,-1,1).normalize().transformDirection(i.matrixWorld),rb=i.rb*i.inputScale;
 for(let mm=120;mm>=-3;mm--)r.step('poke',0,centre.clone().addScaledVector(dir,rb+.008+mm/1000),false);
 assert.equal(i.press.pressed,true,'sphere/stem must not swallow the central icon approach');assert.equal(!!r.obj.rail.held,false);
});

test('Dock natural sphere approach does not acquire a central icon and press alone cannot drag',()=>{
 const r=rig('dock'),d=r.obj,h=d.handle,pos=d.position.clone(),axis=r.normal(h),surface=r.point(h,0);
 for(let mm=120;mm>=4;mm--){r.step('poke',0,surface.clone().addScaledVector(axis,mm/1000),false);assert.equal(d.icons.some(i=>i.press.pressed),false,'handle approach cannot be captured by an app');}
 assert.equal(h.hovered,true);assert.equal(h.press.pressed,true);assert.equal(!!d.rail.held,false);same(d.position,pos,'no pinch means no Dock motion');
});

for(const mode of ['poke','ray'])test('Dock sphere '+mode+' owns placement, suppresses apps, retains release hover and recovers after loss',()=>{
 const r=rig('dock'),d=r.obj,h=d.handle,start=r.point(h,.012),axis=r.normal(h),before=d.position.clone();
 r.step(mode,0,start,false,axis);r.step(mode,0,start,true,axis);assert.equal(d.rail.held?.id,'xr0');
 r.step(mode,0,start.clone().add(new THREE.Vector3(.04,-.025,-.02)),true,axis);assert.ok(d.position.distanceTo(before)>.02);assert.equal(d.rail.held?.id,'xr0');assert.ok(d.icons.every(i=>!i.hovered&&!i.press.pressed));
 r.step(mode,0,r.point(h,.012),false,axis);assert.equal(d.rail.held,null);assert.equal(h.hovered,true);
 r.lose(0);assert.equal(d.rail.held,null);r.step(mode,0,r.point(h,.012),false,axis);r.step(mode,0,r.point(h,.012),true,axis);assert.equal(d.rail.held?.id,'xr0');assert.equal(r.events.length,0);
});

test('Dock captured sphere keeps the first hand as owner',()=>{
 const r=rig('dock'),d=r.obj,h=d.handle;let at=r.point(h,.012);r.step('poke',0,at,false);r.step('poke',0,at,true);
 const pos=d.position.clone();r.hand(0,at,true);r.hand(1,at,true);r.frame();assert.equal(d.rail.held?.id,'xr0');
 r.hand(1,at.clone().add(new THREE.Vector3(.06,0,0)),true);r.frame();assert.equal(d.rail.held?.id,'xr0');same(d.position,pos,'other hand cannot move Dock');
 r.sources[0].src.connected=r.sources[1].src.connected=false;r.frame();assert.equal(d.rail.held,null);
 r.step('poke',1,r.point(h,.012),false);r.step('poke',1,r.point(h,.012),true);assert.equal(d.rail.held?.id,'xr1');
});

const hits=[];
function hitReceipt(r,h,name){
 const p=r.point(h,.012),axis=r.normal(h),origin=p.clone().addScaledVector(axis,.5),ray=new THREE.Raycaster(origin,axis.clone().negate());
 r.scene.updateMatrixWorld(true);const found=ray.intersectObjects(h.hitMeshes,false);
 assert.ok(found.length>0,name+' must hit actual geometry');
 const local=h.worldToLocal(found[0].point.clone());
 hits.push({name,geometry:h.hitMeshes[0].geometry.type,origin:origin.toArray(),direction:axis.clone().negate().toArray(),hit:found[0].point.toArray(),local:local.toArray(),frontZ:h.frontZ,scale:h.inputScale});
}
test('Explicit real ray geometry receipts for side, corner and Dock sphere',()=>{
 const w=rig();hitReceipt(w,moves(w)[0],'side');hitReceipt(w,w.obj.levels.at(-1).corners[1],'corner');const d=rig('dock');hitReceipt(d,d.obj.handle,'dock');
});
function combined(){
 const r=rig('dock'),d=r.obj,p=new PackagingPanel(T,{title:'Catalog',items:[{label:'Sofas',items:[{label:'Chair'},{label:'Table'}]}]});
 p.scale.setScalar(1.5);p.levels[0].rows[0].dispatchEvent({type:'select'});r.scene.add(p);for(let i=0;i<120;i++)p.update(dt);r.scene.updateMatrixWorld(true);
 const h=p.levels.at(-1).moves[0],target=r.point(d.handle,.012).add(new THREE.Vector3(-.08,0,0));p.position.add(target.sub(r.point(h,.012)));r.scene.updateMatrixWorld(true);
 r.frame=()=>{r.scene.updateMatrixWorld(true);r.input.update();p.update(dt);d.update(dt,r.camera,r.input.handPoints);r.scene.updateMatrixWorld(true);};
 r.step=(mode,n,pt,hold,axis)=>{r.put(mode,n,pt,hold,axis);r.frame();};r.p=p;r.d=d;r.h=h;return r;
}
function openPose(r,n,at,pinch){
 const {src,tip}=r.sources[n];r.hand(n,at,pinch);const add=(name,x,y)=>{let j=src.hand.joints[name];if(!j){j=new THREE.Group();src.hand.joints[name]=j;src.hand.add(j);}j.visible=true;j.position.copy(at).add(new THREE.Vector3(x,y,0));return j;};
 add('wrist',.025,-.14).rotation.x=Math.PI/2;
 ['index','middle','ring','pinky'].forEach((f,i)=>{const x=[0,.017,.034,.05][i];add(f+'-finger-phalanx-proximal',x,-.07);if(f!=='index')add(f+'-finger-tip',x,0);});
}
for(const mode of ['poke','ray'])for(const owner of ['window','dock'])test('Cross component '+owner+' '+mode+' capture cannot transfer while crossing another handle',()=>{
 const r=combined(),h=owner==='window'?r.h:r.d.handle,other=owner==='window'?r.d.handle:r.h,start=r.point(h,.012),axis=r.normal(h);
 r.step(mode,0,start,false,axis);r.step(mode,0,start,true,axis);
 assert.equal(owner==='window'?r.p.controls.held?.id:r.d.rail.held?.id,'xr0');
 const end=r.point(other,.012);r.step(mode,0,end,true,axis);
 assert.equal(owner==='window'?r.p.controls.held?.id:r.d.rail.held?.id,'xr0');
 assert.equal(!!(owner==='window'?r.d.rail.held:r.p.controls.held),false);
 assert.equal(r.p.palmOwner,undefined);assert.equal(r.p.active,1);assert.equal(r.events.length,0);
});
for(const owner of ['window','dock'])test('Open pose cannot preempt '+owner+' pinch capture or release frame',()=>{
 const r=combined(),h=owner==='window'?r.h:r.d.handle,start=r.point(h,.012);
 r.step('poke',0,start,false);r.step('poke',0,start,true);
 openPose(r,0,start,true);r.frame();assert.equal(r.input.palmOf(r.sources[0].src),null);
 assert.equal(owner==='window'?r.p.controls.held?.id:r.d.rail.held?.id,'xr0');assert.equal(r.p.palmOwner,undefined);
 openPose(r,0,start,false);r.scene.updateMatrixWorld(true);assert.ok(r.input.palmOf(r.sources[0].src),'release fixture really looks open');r.frame();
 assert.equal(r.p.palmOwner,undefined,'release frame remains owned');assert.equal(r.p.active,1);assert.equal(!!r.p.controls.held,false);assert.equal(!!r.d.rail.held,false);
});
for(const owner of ['window','dock'])test('Mixed ray and fingertip owners cannot steal the same '+owner+' handle or dent',()=>{
 const r=combined(),h=owner==='window'?r.h:r.d.handle,start=r.point(h,.012),axis=r.normal(h);
 r.step('poke',0,start,false);r.step('poke',0,start,true);const initial=h.spot.clone(),pos=(owner==='window'?r.p:r.d).position.clone();
 r.ray(1,start,true,axis);r.frame();assert.equal(owner==='window'?r.p.controls.held?.id:r.d.rail.held?.id,'xr0');
 r.ray(1,start.clone().add(new THREE.Vector3(.04,0,0)),true,axis);r.frame();
 assert.equal(owner==='window'?r.p.controls.held?.id:r.d.rail.held?.id,'xr0');same(h.spot,initial,'dent remains owner position');same((owner==='window'?r.p:r.d).position,pos,'other source cannot move owner');
});
