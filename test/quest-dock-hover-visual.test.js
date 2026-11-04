import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prefersReducedMotion} from '../src/core/spring.js';
const media={matches:false};globalThis.matchMedia=()=>media;
import * as THREE from 'three';
import {createTokens,Dock,PackagingPanel,InputSystem} from '../src/index.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url)))),dt=1/60;
const apps=['house','ruler','scan','image','settings','notes','clock'].map(icon=>({icon,label:icon}));
function rig(kind='window', dockOptions={}){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.y=1.6;scene.add(camera);
 const obj=kind==='dock'?new Dock(T,{apps,distance:.4,...dockOptions}):new PackagingPanel(T,{title:'Catalog',items:[{label:'Sofas',items:[{label:'Chair'},{label:'Table'}]}]});scene.add(obj);
 if(kind==='window'){obj.scale.setScalar(1.5);obj.levels[0].rows[0].dispatchEvent({type:'select'});}
 const settle=()=>{for(let n=0;n<120;n++){scene.updateMatrixWorld(true);if(kind==='dock')obj.update(dt,camera);else obj.update(dt);}};settle();
 const group=()=>new THREE.Group(),input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 const sources=input.xr.map(src=>{src.connected=false;src.grip.visible=false;const tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={'index-finger-tip':tip};return {src,tip};});
 const events=[];obj.addEventListener('select',e=>events.push('select'));obj.addEventListener('back',e=>events.push('back'));
 let delivered=[]; const frame=()=>{scene.updateMatrixWorld(true);input.update();delivered=input.collect().items.filter(i=>i.probes.length).map(i=>({item:i,probes:i.probes.map(p=>({id:p.id,kind:p.kind,point:p.point.toArray()}))}));if(kind==='dock')obj.update(dt,camera,input.handPoints);else obj.update(dt);scene.updateMatrixWorld(true);};
 const normal=h=>new THREE.Vector3(0,0,1).transformDirection(h.matrixWorld);
 const point=(h,gap=.012)=>{scene.updateMatrixWorld(true);const inv=h.matrixWorld.clone().invert(),box=new THREE.Box3();for(const m of h.hitMeshes){m.geometry.computeBoundingBox();box.union(m.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld)));}assert.equal(box.isEmpty(),false,'handle needs actual hit geometry');const p=box.getCenter(new THREE.Vector3());p.z=box.max.z+gap/Math.abs(h.getWorldScale(new THREE.Vector3()).z);return h.localToWorld(p);};
 const hand=(n,p,pinch=false)=>{const{src,tip}=sources[n];src.connected=true;src.selecting=pinch;src.hand.visible=tip.visible=true;tip.position.copy(p);};
 const ray=(n,p,down=false,axis=new THREE.Vector3(0,0,1))=>{const{src,tip}=sources[n];src.connected=true;src.selecting=down;src.hand.visible=tip.visible=false;src.ray.position.copy(p).addScaledVector(axis,.5);src.ray.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),axis.clone().negate());};
 const put=(mode,n,p,held=false,axis)=>mode==='poke'?hand(n,p,held):ray(n,p,held,axis);
 const step=(mode,n,p,held=false,axis)=>{put(mode,n,p,held,axis);frame();};
 const lose=n=>{sources[n].src.connected=false;frame();};
 return {obj,scene,camera,input,sources,events,frame,point,normal,hand,ray,put,step,lose,get delivered(){return delivered;}};
}
function iconPoint(r,icon,degrees,gap){
 r.scene.updateMatrixWorld(true);const angle=degrees*Math.PI/180;
 return icon.localToWorld(icon.centre.clone().addScaledVector(new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)),icon.rb+(.008+gap)/icon.inputScale));
}

function rowPoint(r,row,x,gap){r.scene.updateMatrixWorld(true);const p=new THREE.Vector3(x,0,0),front=row.press.pressed?row.pokeFront:row.surfaceZ(p);p.z=front+(.008+gap)/Math.abs(row.getWorldScale(new THREE.Vector3()).z);return row.localToWorld(p);}




function snapshot(d){return d.icons.map((i,index)=>({index,hover:i.hovered,pressed:i.press.pressed,contacted:!!i.press.contacted,visible:i.bubble.visible,opacity:i.skin.uOpacity.value,name:i.nameTag.visible,probes:(i.frameProbes??[]).map(p=>({id:p.id,gap:(p.point.distanceTo(i.centre)-i.rb)*i.inputScale-(p.radius??0)}))}));}
const check=(name,fn)=>test(name,fn);
function oneNoncontact(d,frame){const icons=snapshot(d),physical=icons.some(i=>i.probes.some(p=>p.gap<=0));assert.equal(physical,false,'this fixture must stay wholly separated');if(icons.filter(i=>i.visible&&i.opacity>.01).length>1){const e=new Error('Q66: at most one visible noncontact bubble, not merely one active target');Object.assign(e,{frame,icons});throw e;}}
for(const reduced of [false,true]){
 check('single fingertip noncontact visual handover '+reduced,()=>{
  media.matches=reduced;assert.equal(prefersReducedMotion(),reduced);const r=rig('dock'),d=r.obj;r.hand(0,iconPoint(r,d.icons[2],0,.04));for(let n=0;n<180;n++)r.frame();
  const from=r.sources[0].tip.position.clone(),to=iconPoint(r,d.icons[4],0,.04);
  for(let n=1;n<=12;n++){r.hand(0,from.clone().lerp(to,n/12));r.frame();oneNoncontact(d,n);}
 });
 check('true separated retained press competes for one visual slot '+reduced,()=>{
  media.matches=reduced;const r=rig('dock'),d=r.obj;
  const step=ga=>{r.hand(0,iconPoint(r,d.icons[2],0,ga));r.hand(1,iconPoint(r,d.icons[4],0,.04));r.frame();};
  for(const gap of [.05,.03,.015,.005,-.0001])step(gap);for(let n=0;n<120;n++)step(.0001);oneNoncontact(d,120);
 });
}
