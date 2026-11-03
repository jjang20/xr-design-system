import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,PackagingPanel,InputSystem} from '../src/index.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url))));
const media={matches:false};globalThis.matchMedia=()=>media;
function rig(type,scale=1.5){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),p=new PackagingPanel(T,{title:'Catalog',items:[{label:'One'},{label:'Two'}]});scene.add(camera,p);p.scale.setScalar(scale);
 for(let n=0;n<120;n++){scene.updateMatrixWorld(true);p.update(1/60);}scene.updateMatrixWorld(true);
 const h=type==='side'?p.levels[0].moves[1]:p.levels[0].corners[1];
 const group=()=>new THREE.Group(),input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 input.xr.forEach(s=>{s.connected=false;s.grip.visible=false;});const s=input.xr[0],tip=new THREE.Group(),thumb=new THREE.Group();tip.jointRadius=thumb.jointRadius=.008;s.hand.add(tip,thumb);s.hand.joints={'index-finger-tip':tip,'thumb-tip':thumb};thumb.visible=false;
 const frame=()=>{scene.updateMatrixWorld(true);input.update();p.update(1/60);scene.updateMatrixWorld(true);};
 const move=(gap,pinch=false)=>{s.connected=true;s.hand.visible=tip.visible=true;s.selecting=pinch;const at=new THREE.Vector3(0,0,h.t+(.008+gap)/h.inputScale);tip.position.copy(h.localToWorld(at.clone()));thumb.visible=pinch;thumb.position.copy(h.localToWorld(at.add(new THREE.Vector3(-.018/h.inputScale,0,0))));frame();};
 return{scene,p,h,s,tip,thumb,frame,move};
}
for(const reduced of [false,true])for(const type of ['side','corner'])test(`R12 ${type} actual press/pinch deforms body and restores; reduced=${reduced}`,()=>{
 media.matches=reduced;const r=rig(type),{h,p}=r,position=h.position.clone(),rest=h.hitMeshes[0].geometry.attributes.position.array.slice();
 assert.equal(h.rectangular,type==='side');assert.equal(!!h.arrow,type==='corner');assert.equal(h.affordance.visible,false);
 for(const gap of [.04,.02,.005,-.0015])r.move(gap);for(let n=0;n<60;n++)r.move(-.0015);
 assert.equal(h.press.pressed,true);assert.equal(p.controls.held,null);
 assert.ok(h.softShape?.compression>.08,'physical press must deform the whole existing control');
 assert.ok(h.softShape.matrix.determinant()>0);assert.ok(h.softShape.matrix.elements.every(Number.isFinite));
 const front=new THREE.Vector3(0,0,h.t/h.r).applyMatrix3(h.softShape.matrix).add(h.softShape.offset).multiplyScalar(h.r);
 assert.ok(Math.abs(h.faceDistance(front,0))<1e-6,'proximity surface follows shape');
 for(let n=0;n<60;n++)r.move(.005,true);
 assert.equal(p.controls.held?.handle,h);assert.ok(h.softShape.compression>.08,'pinch-held whole-body feedback');assert.equal(h.affordance.visible,true);
 const old=h.softShape.matrix.toArray();r.thumb.visible=false;r.frame();assert.ok(Math.max(...old.map((v,i)=>Math.abs(v-h.softShape.matrix.elements[i])))<1e-6,'optional thumb loss cannot jump shape');
 r.move(.025,false);assert.equal(p.controls.held,null);assert.equal(h.affordance.visible,true,'release-hover remains visible');
 r.s.connected=false;for(let n=0;n<180;n++)r.frame();
 assert.equal(h.affordance.visible,false);assert.ok(h.softShape.compression<1e-5);assert.ok(h.position.distanceTo(position)<1e-9);assert.deepEqual(h.hitMeshes[0].geometry.attributes.position.array,rest);
 assert.ok(p.manipulationOpacity>.999);media.matches=false;
});
for(const scale of [.9,2.2])test(`R12 arrow and visible hit surface agree at scale ${scale}`,()=>{
 const r=rig('corner',scale),{h}=r;for(let n=0;n<60;n++)r.move(.005,true);
 assert.ok(h.softShape,'corner uses centred shape');assert.ok(h.softShape.offset.length()<1e-9,'corner has no hanging-stem anchor');
 assert.ok(h.arrow.matrixAutoUpdate===false,'arrow transform follows the body, not an unrelated Z translation');
 const ray=new THREE.Raycaster(h.localToWorld(new THREE.Vector3(0,0,.1)),new THREE.Vector3(0,0,-1).transformDirection(h.matrixWorld));
 const hit=ray.intersectObjects(h.hitMeshes,false)[0];assert.ok(hit);
 const p=h.worldToLocal(hit.point.clone());assert.ok(h.faceDistance(p,0)<1e-5);
});

for(const type of ['side','corner'])test(`R12 ${type} stationary owner is not moved by body deformation or another hand`,()=>{
 const r=rig(type),{h,p}=r;r.move(.005,true);const point=r.tip.position.clone(),position=p.position.clone(),scale=p.scale.x;
 for(let i=0;i<120;i++)r.frame();
 assert.ok(p.position.distanceTo(position)<1e-9);assert.equal(p.scale.x,scale);assert.ok(r.tip.position.distanceTo(point)<1e-9);assert.equal(p.controls.held?.handle,h);
});
