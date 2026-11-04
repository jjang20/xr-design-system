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
for (const reduced of [false,true]) test(`R6: a same-frame acquire and short close lights the departing child (reduced=${reduced})`,()=>{
 const p=panel(),r=rig(p),child=p.levels[1];p.reducedMotion=reduced;
 movePalm(r,.04);movePalm(r,-.03);
 assert.equal(p.active,0,'accepted 25mm close behavior must not change');
 assert.ok(child.panel.skin.uniforms.uContactGlow.value>=.8,'committed close must remain visible even after its input owner is cleared');
 for(let i=0;i<6;i++)r.step();
 assert.ok(child.panel.skin.uniforms.uContactGlow.value>=.6,'first 100ms of existing exit should carry clear visual acknowledgement');
 assert.equal(p.levels[0].panel.skin.uniforms.uContactGlow.value,0,'the previous layer must not inherit child feedback');
 for(let i=0;i<90;i++)r.step();
 assert.equal(p.closing.length,0,'feedback must not delay dismissal');
});

test('R6: canceled Push recovers without a successful-close flash',()=>{
 const p=panel(),r=rig(p),child=p.levels[1];movePalm(r,.04);movePalm(r,-.005);
 assert.equal(p.palmOwner,r.src.id);const contact=child.panel.skin.uniforms.uContactGlow.value;
 movePalm(r,.03);assert.equal(p.active,1);assert.equal(p.palmOwner,undefined);
 for(let i=0;i<40;i++)r.step();
 assert.ok(child.panel.skin.uniforms.uContactGlow.value<contact*.01);
});
