import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,PackagingPanel,InputSystem} from '../src/index.js';
import {DEFAULTS} from '../src/core/defaults.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url)))),dt=1/60;
const fingers=['index','middle','ring','pinky'];
function panel(deep=false){
 const leaf=Array.from({length:6},(_,i)=>({label:'Leaf'+i}));
 const p=new PackagingPanel(T,{title:'Catalog',items:[{label:'Items',items:deep?[{label:'Inner',items:leaf}]:leaf}]});
 p.levels[0].rows[0].dispatchEvent({type:'select'});
 if(deep)p.levels[1].rows[0].dispatchEvent({type:'select'});
 for(let i=0;i<150;i++)p.update(dt);return p;
}
function rig(p){
 const scene=new THREE.Scene();scene.add(p);const group=()=>new THREE.Group();
 const input=new InputSystem({T,scene,camera:new THREE.PerspectiveCamera(),renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 const src=input.xr[0];src.connected=true;src.grip.visible=false;src.hand.joints={};
 const joint=(name,x,y,z,radius=.008)=>{const j=new THREE.Group();j.position.set(x,y,z);j.jointRadius=radius;src.hand.joints[name]=j;src.hand.add(j);return j;};
 joint('wrist',0,-.04,0,.012).rotation.x=Math.PI/2;
 fingers.forEach((finger,i)=>{const x=[-.025,-.008,.009,.025][i];for(const [name,y] of [['phalanx-proximal',.03],['phalanx-intermediate',.055],['phalanx-distal',.08],['tip',.1]])joint(`${finger}-finger-${name}`,x,y,0);});
 const step=()=>{scene.updateMatrixWorld(true);input.update();p.update(dt);};
 const level=p.levels.at(-1),front=level.cur.z+level.panel.t*Math.min(level.cur.sx,level.cur.sy);
 return {p,scene,input,src,step,front};
}
function rawCentre(r){r.scene.updateMatrixWorld(true);return r.src.hand.joints.wrist.getWorldPosition(new THREE.Vector3()).lerp(r.src.hand.joints['middle-finger-phalanx-proximal'].getWorldPosition(new THREE.Vector3()),.5);}
function movePalm(r,gap){r.src.hand.position.set(0,0,0);const c=rawCentre(r);r.src.hand.position.set(-c.x,-c.y,r.front+.022+gap-c.z);r.step();}
function moveIndex(r,row,gap){r.scene.updateMatrixWorld(true);const target=row.localToWorld(new THREE.Vector3(0,0,row.surfaceZ(new THREE.Vector3())+.008+gap));r.src.hand.position.set(0,0,0);r.scene.updateMatrixWorld(true);const tip=r.src.hand.joints['index-finger-tip'].getWorldPosition(new THREE.Vector3());r.src.hand.position.copy(target.sub(tip));r.step();}
function foldExceptIndex(r){for(const f of ['middle','ring','pinky'])for(const [n,y]of[['phalanx-intermediate',.025],['phalanx-distal',.015],['tip',.01]])r.src.hand.joints[`${f}-finger-${n}`].position.y=y;}
function approachPalm(r){movePalm(r,.04);movePalm(r,-.01);assert.equal(r.p.palmOwner,r.src.id,'control fixture must acquire');}

// Red: accepted Q24 contact geometry, independent of the final close distance.
test('Q24: 30-degree extended distal face acquires Push before the palm centre reaches the sheet',()=>{
 const r=rig(panel()),row=r.p.levels[1].rows[0];r.src.hand.rotation.x=-Math.PI/6;let selects=0;row.addEventListener('select',()=>selects++);
 for(let i=0;i<40;i++)moveIndex(r,row,.05);moveIndex(r,row,.015);moveIndex(r,row,0);
 const probe=r.input.palmOf(r.src),sample=probe&&r.p.palmSample(probe);
 assert.equal(r.p.palmOwner,r.src.id,`finger at skin; current palm gap=${sample?.gap}, alignment=${sample?.alignment}`);
 assert.equal(row.press.pressed,false,'broad face owns the source instead of row click');
 moveIndex(r,row,.02);assert.equal(selects,0);
});
test('Q24: several extended fingers leading 40mm are an open-hand face, not an index-only rejection',()=>{
 const r=rig(panel());for(const f of fingers){r.src.hand.joints[`${f}-finger-tip`].position.z=-.04;r.src.hand.joints[`${f}-finger-phalanx-distal`].position.z=-.03;r.src.hand.joints[`${f}-finger-phalanx-intermediate`].position.z=-.015;}
 movePalm(r,.07);assert.ok(r.input.palmOf(r.src),'multiple broad fingertips must remain a Push candidate');
 movePalm(r,.045);movePalm(r,.025);assert.equal(r.p.palmOwner,r.src.id,'distal face contact must acquire before the representative palm centre');
});
test('Q24: a one-frame near-gate confidence change at contact retains observed approach',()=>{
 const r=rig(panel());r.src.hand.rotation.x=-Math.acos(.69);movePalm(r,.09);movePalm(r,.065);
 // The distal pads are still outside here; the .71 frame crosses their surface.
 r.src.hand.rotation.x=-Math.acos(.71);movePalm(r,.05);
 assert.equal(r.p.palmOwner,r.src.id,'bounded recent approach must not be lost solely at .69 -> .71 while crossing the face');
});

// Preserved safety and ownership. These must stay green during the geometry change.
test('Q24: one extended index still clicks once and never acquires Push',()=>{
 const r=rig(panel()),row=r.p.levels[1].rows[0];foldExceptIndex(r);let selects=0;row.addEventListener('select',()=>selects++);
 for(let i=0;i<40;i++)moveIndex(r,row,.05);for(const gap of [.015,0,.009])moveIndex(r,row,gap);
 assert.equal(r.p.palmOwner,undefined);assert.equal(selects,1);
});
test('Q24: a forward single index with other fingers folded stays a click pose',()=>{
 const r=rig(panel()),row=r.p.levels[1].rows[0];foldExceptIndex(r);r.src.hand.joints['index-finger-tip'].position.z=-.04;
 let selects=0;row.addEventListener('select',()=>selects++);
 for(let i=0;i<40;i++)moveIndex(r,row,.05);for(const gap of [.015,0,.009])moveIndex(r,row,gap);
 assert.equal(r.input.palmOf(r.src),null);assert.equal(r.p.palmOwner,undefined);assert.equal(selects,1);
});
test('Q20/Q22/Q24: pinch excludes Push even while all other joints look open',()=>{
 const r=rig(panel());r.src.selecting=true;for(const gap of [.04,-.01,-.04])movePalm(r,gap);
 assert.equal(r.input.palmOf(r.src),null);assert.equal(r.p.palmOwner,undefined);assert.equal(r.p.active,1);
});
test('Q24: the owned source cannot become a row click during open-hand recognizer loss',()=>{
 const r=rig(panel());approachPalm(r);let selects=0;for(const row of r.p.levels[1].rows)row.addEventListener('select',()=>selects++);
 foldExceptIndex(r);moveIndex(r,r.p.levels[1].rows[0],0);
 assert.equal(r.p.palmOwner,r.src.id);assert.equal(selects,0);assert.ok(r.p.levels[1].rows.every(row=>!row.press.pressed));
});
test('Q24: candidate geometry changing without palm translation cannot invent closing depth',()=>{
 const r=rig(panel());approachPalm(r);const child=r.p.levels[1],z=child.cur.z;
 // The contact estimator may now prefer a distal patch. Its new offset is not whole-hand travel.
 for(const f of fingers){r.src.hand.joints[`${f}-finger-tip`].position.z=-.04;r.src.hand.joints[`${f}-finger-phalanx-distal`].position.z=-.03;}
 r.step();assert.equal(r.p.active,1);assert.ok(Math.abs(child.cur.z-z)<1e-6,'patch identity/offset changes must freeze or rebase, not count as a push');
});
test('Q24: brief tracked-owner loss never integrates unseen travel',()=>{
 const r=rig(panel());approachPalm(r);const child=r.p.levels[1],z=child.cur.z;
 r.src.hand.visible=false;for(let i=0;i<4;i++)r.step();r.src.hand.visible=true;movePalm(r,-.04);
 assert.equal(r.p.palmOwner,r.src.id);assert.equal(r.p.active,1);assert.ok(Math.abs(child.cur.z-z)<1e-6);
});
test('Q24: reset while behind requires a fresh real approach',()=>{
 const r=rig(panel());approachPalm(r);r.input.reset();r.p.resetInteraction();movePalm(r,-.04);
 assert.equal(r.p.palmOwner,undefined);assert.equal(r.p.active,1);
});
test('Q24: first appearance behind or an entry teleport does not acquire',()=>{
 for(const kind of ['behind','jump']){const r=rig(panel());if(kind==='jump')movePalm(r,.08);movePalm(r,-.04);movePalm(r,-.065);assert.equal(r.p.palmOwner,undefined,kind);assert.equal(r.p.active,1,kind);}
});
test('Q24: one push closes one child; real retreat rearms; Catalog persists',()=>{
 const r=rig(panel(true)),back=[];r.p.addEventListener('back',e=>back.push(e.level));
 const close=()=>{movePalm(r,.04);movePalm(r,-.01);movePalm(r,-Math.min(.07,DEFAULTS.handInput.palmCloseTravel+.005));};
 close();assert.equal(r.p.active,1);for(let i=0;i<150;i++)r.step();movePalm(r,-.075);assert.equal(r.p.active,1,'held hand cannot cascade');
 movePalm(r,.1);close();assert.equal(r.p.active,0);for(let i=0;i<150;i++)r.step();movePalm(r,.1);close();assert.equal(r.p.active,0);assert.deepEqual(back,[1,0]);
});
