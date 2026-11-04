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
function iconPoint(r,icon,degrees,gap){
 r.scene.updateMatrixWorld(true);const angle=degrees*Math.PI/180;
 return icon.localToWorld(icon.centre.clone().addScaledVector(new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)),icon.rb+(.008+gap)/icon.inputScale));
}
for(const start of [20,30,40])test('R6: icon3 natural '+start+' degree approach and contacting front rub remain usable',()=>{
 const r=rig('dock'),icon=r.obj.icons[3];let selects=0;icon.addEventListener('select',()=>selects++);
 for(let mm=70;mm>=-2;mm--)r.step('poke',0,iconPoint(r,icon,start,mm/1000));
 assert.equal(icon.press.pressed,true,'an untouched neighbor must not monopolize early feedback');
 for(let angle=start;angle>=-85;angle--){r.step('poke',0,iconPoint(r,icon,angle,-.002));assert.equal(icon.press.pressed,true,'still contacting actual front skin at '+angle);assert.equal(r.obj.icons.filter(i=>i.press.pressed).length,1);}
 r.step('poke',0,iconPoint(r,icon,-95,-.002));assert.equal(icon.press.pressed,false,'rear hemisphere remains cancel');assert.equal(selects,0);
});

for(const kind of ['first-seen','tracking-loss','jump','reset'])test('R6: '+kind+' cannot synthesize a new icon surface crossing',()=>{
 const r=rig('dock'),icon=r.obj.icons[3],surface=()=>iconPoint(r,icon,30,-.002);
 if(kind!=='first-seen')r.step('poke',0,iconPoint(r,icon,30,kind==='jump'?.08:.004));
 if(kind==='tracking-loss')r.lose(0);
 if(kind==='reset')r.input.reset();
 r.step('poke',0,surface());
 assert.equal(icon.press.pressed,false);assert.equal(r.events.length,0);
});

test('R6: shallow early plate feedback leaves visible deformation for physical pressure',()=>{
 const r=rig('dock'),d=r.obj,shape=d.shelfShape,rest=shape.geometry.attributes.position.array.slice();
 const [x,z]=d.arc(d.length/2-d.pad/2,0),probe=new THREE.Vector3(x,0,z),front=d.plateSample(probe).front;
 const frame=gap=>{probe.y=front+.008+gap;r.step('poke',0,d.shelf.localToWorld(probe.clone()));const pos=shape.geometry.attributes.position.array;let dip=0;for(let i=1;i<pos.length;i+=3)dip=Math.max(dip,rest[i]-pos[i]);return dip;};
 frame(.04);frame(.015);const early=frame(.004),deep=frame(-.003);
 assert.equal(d.shelf.press.pressed,true);assert.ok(deep>early+.001,'3mm physical pressure must add visible mesh travel');
});

test('R6: pinching an already depressed sphere cannot make its dent shallower',()=>{
 const r=rig('dock'),h=r.obj.handle,at=()=>r.point(h,.005);
 r.step('poke',0,r.point(h,.05));for(let i=0;i<90;i++)r.step('poke',0,at());
 const before=h.dent.x;assert.ok(before>.0019);
 for(let i=0;i<90;i++)r.step('poke',0,at(),true);
 assert.equal(r.obj.rail.held?.id,'xr0');assert.ok(h.dent.x>=before-.00001,'held feedback must be a floor, not replace deeper pressure');
});

for(const invalidation of ['disabled','removed','other-source','radius-growth','geometry-growth'])test('R6: '+invalidation+' does not fabricate contact history',()=>{
 const r=rig('dock'),icon=r.obj.icons[3],position=iconPoint(r,icon,0,.004);
 r.step('poke',0,position);assert.equal(icon.press.pressed,false);
 if(invalidation==='disabled'){icon.enabled=false;r.input.update();icon.enabled=true;}
 if(invalidation==='removed'){const parent=icon.parent;parent.remove(icon);r.input.update();parent.add(icon);}
 if(invalidation==='other-source'){r.sources[0].src.connected=false;r.step('poke',1,iconPoint(r,icon,0,-.002));}
 else if(invalidation==='radius-growth'){r.sources[0].tip.jointRadius=.02;r.step('poke',0,position);}
 else if(invalidation==='geometry-growth'){icon.scale.multiplyScalar(2);r.step('poke',0,position);}
 else r.step('poke',0,iconPoint(r,icon,0,-.002));
 assert.equal(icon.press.pressed,false);assert.equal(r.events.length,0);
});

test('R6: entering the rear skin and passing through to the front cannot click',()=>{
 const r=rig('dock'),icon=r.obj.icons[3];
 for(const [angle,gap] of [[180,.03],[180,.011],[180,-.008],[0,.001]])r.step('poke',0,iconPoint(r,icon,angle,gap));
 assert.equal(r.events.length,0);assert.equal(icon.press.pressed,false);
 for(const gap of [.03,.015,.004,-.002,.009])r.step('poke',0,iconPoint(r,icon,0,gap));
 assert.equal(r.events.length,1,'a subsequent real front approach must rearm');
});

for(const growth of ['radius','geometry'])test('R6: provisional feedback cannot turn stationary '+growth+' growth into a click',()=>{
 const r=rig('dock'),icon=r.obj.icons[3];
 for(const gap of [.03,.015,.004])r.step('poke',0,iconPoint(r,icon,0,gap));
 assert.equal(icon.press.pressed,true);assert.equal(icon.press.contacted,false);
 const fixed=r.sources[0].tip.position.clone(),oldScale=icon.scale.clone();
 if(growth==='radius')r.sources[0].tip.jointRadius=.02;else icon.scale.multiplyScalar(2);
 r.step('poke',0,fixed);
 if(growth==='radius')r.sources[0].tip.jointRadius=.008;else icon.scale.copy(oldScale);
 r.step('poke',0,fixed);
 assert.equal(r.events.length,0);
 for(const gap of [.03,.015,.004,-.002,.009])r.step('poke',0,iconPoint(r,icon,0,gap));
 assert.equal(r.events.length,1,'returning to a real front approach must rearm');
});
