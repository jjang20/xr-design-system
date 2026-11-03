import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens, PackagingPanel, Toolbar, InputSystem } from '../src/index.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url)))),dt=1/90;
const media={matches:false};globalThis.matchMedia=()=>media;
function rig({scale=1.5,navigation=false,twoGroups=false,toolbar=false}={}) {
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.y=1.6;scene.add(camera);
 const panels=Array.from({length:twoGroups?2:1},(_,n)=>{
  const p=toolbar ? new Toolbar(T,{tools:['A','B','C'].map(label=>({label,width:80}))})
    : new PackagingPanel(T,{title:'Group '+n,items:['A','B','C'].map(id=>({id,label:id,...(navigation?{items:[{id:id+'x',label:id+' child'}]}:{})}))});
  p.scale.setScalar(scale);p.position.x=n*.6;scene.add(p);return p;
 });
 const group=()=>new THREE.Group();
 const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 input.xr.forEach(s=>{s.connected=false;s.grip.visible=false;});
 const step=(n=1)=>{for(let i=0;i<n;i++){scene.updateMatrixWorld(true);input.update();panels.forEach(p=>p.update(dt));scene.updateMatrixWorld(true);}};step(120);
 const rows=panels.map(p=>p.buttons ?? p.levels[0].rows),events=[],opens=[];
 rows.forEach((rs,g)=>rs.forEach((r,i)=>r.addEventListener('select',()=>events.push([g,i]))));
 panels.forEach(p=>p.addEventListener('open',e=>opens.push(e.item.id)));
 const at=(g,i,gap,x=0)=>{scene.updateMatrixWorld(true);const r=rows[g][i],p=new THREE.Vector3(x,0,0),s=r.getWorldScale(new THREE.Vector3()).z;p.z=(r.press.pressed?r.pokeFront:r.surfaceZ(p))+(.008+gap)/s;return r.localToWorld(p);};
 const put=(hand,name,g,i,gap)=>{
  const s=input.xr[hand];s.connected=true;s.handSource=true;s.hand.joints??={};
  let j=s.hand.joints[name];if(!j){j=new THREE.Group();j.jointRadius=.008;s.hand.add(j);s.hand.joints[name]=j;}j.visible=true;j.position.copy(at(g,i,gap));return j;
 };
 return {scene,input,panels,rows,events,opens,at,put,step};
}
const index='index-finger-tip',middle='middle-finger-tip';
for(const scale of [.75,1.5,2.25])test('R11 group: closest world surface wins across two tips at scale '+scale,()=>{
 const r=rig({scale});r.put(0,index,0,0,.035);r.put(0,middle,0,1,.02);r.step(180);
 assert.deepEqual(r.rows[0].map(x=>x.hovered),[false,true,false]);
 assert.equal(r.panels[0].levels[0].panel.skin.uniforms.uBulgeCount.value,1,'actual panel feedback has one sustained hover');
 assert.equal(r.events.length,0);
});
for(const reduced of [false,true])test('R11 group: similar distance retains current, real nearest switch and loss release (reduced='+reduced+')',()=>{
 media.matches=reduced;
 try {
  const r=rig();r.put(0,index,0,0,.03);r.step(120);
  for(let n=0;n<120;n++){r.put(0,index,0,0,.03);r.put(1,index,0,1,.03+(n%2?.0005:-.0005));r.step();assert.deepEqual(r.rows[0].map(x=>x.hovered),[true,false,false]);}
  for(let n=0;n<90;n++){r.put(0,index,0,0,.045);r.put(1,index,0,1,.015);r.step();}
  assert.deepEqual(r.rows[0].map(x=>x.hovered),[false,true,false]);
  r.input.xr[1].connected=false;r.step(150);assert.deepEqual(r.rows[0].map(x=>x.hovered),[true,false,false]);
  r.input.xr[0].connected=false;r.step(180);assert.equal(r.rows[0].some(x=>x.hovered),false);
  assert.equal(r.panels[0].levels[0].panel.skin.uniforms.uBulgeCount.value,0);
 }finally{media.matches=false;}
});
test('R11 group: separate lists independently hover across hands',()=>{
 const r=rig({twoGroups:true});r.put(0,index,0,0,.02);r.put(1,index,1,1,.03);r.step(180);
 assert.deepEqual(r.rows.map(rs=>rs.map(x=>x.hovered)),[[true,false,false],[false,true,false]]);
});
for(const navigation of [false,true])test('R11 group: nonwinning tips can contact both items and retain '+(navigation?'Q48':'independent actions'),()=>{
 const r=rig({navigation});
 for(const gap of [.06,.04,.02,.005,.001,-.003]){r.put(0,index,0,0,gap);r.put(0,middle,0,1,gap+.0001);r.step();}
 assert.ok(r.rows[0][0].press.pressed && r.rows[0][1].press.pressed,'hover loser must still acquire physical contact');
 r.put(0,index,0,0,.02);r.step();if(navigation)assert.deepEqual(r.opens,[]);else assert.deepEqual(r.events,[[0,0]]);
 r.put(0,middle,0,1,.02);r.step();if(navigation)assert.deepEqual(r.opens,['B']);else assert.deepEqual(r.events,[[0,0],[0,1]]);
});
test('R11 group: contact and independent noncontact hover coexist; loss cancels contact',()=>{
 const r=rig();for(const gap of [.05,.025,.01,.001,-.003]){r.put(0,index,0,0,gap);r.step();}
 r.put(1,index,0,1,.02);r.step(90);assert.ok(r.rows[0][0].press.pressed);assert.ok(r.rows[0][1].hovered);
 r.input.xr[0].connected=false;r.step(120);assert.equal(r.rows[0][0].press.pressed,false);assert.equal(r.events.length,0);assert.ok(r.rows[0][1].hovered);
});

for(const reduced of [false,true])test('R11 Toolbar: shared bar proximity is singular, two contacts and independent selects survive (reduced='+reduced+')',()=>{
 media.matches=reduced;
 try{
  const r=rig({toolbar:true});r.put(0,index,0,0,.04);r.put(1,index,0,1,.055);r.step(180);
  assert.deepEqual(r.rows[0].map(x=>x.hovered),[true,false,false]);
  assert.equal(r.panels[0].bar.skin.uniforms.uBulgeCount.value,1);
  for(const gap of [.04,.025,.01,.001,-.003]){r.put(0,index,0,0,gap);r.put(1,index,0,1,gap);r.step();}
  assert.ok(r.rows[0][0].press.pressed&&r.rows[0][1].press.pressed);
  r.put(0,index,0,0,.025);r.step();r.put(1,index,0,1,.025);r.step();
  assert.deepEqual(r.events,[[0,0],[0,1]]);
 }finally{media.matches=false;}
});
test('R11 Toolbar groups do not steal each others hover',()=>{
 const r=rig({toolbar:true,twoGroups:true});r.put(0,index,0,0,.04);r.put(1,index,1,1,.055);r.step(180);
 assert.deepEqual(r.rows.map(rs=>rs.map(x=>x.hovered)),[[true,false,false],[false,true,false]]);
});

for(const reduced of [false,true])test('R11: frozen press plane cannot bypass current-skin group hover (reduced='+reduced+')',()=>{
 media.matches=reduced;
 try{
  const r=rig();r.put(0,index,0,0,.03);r.step(180);
  for(const gap of [.06,.03,.015,.008]){r.put(1,index,0,1,gap);r.step();}
  const gaps=()=>r.rows[0].slice(0,2).map((b,i)=>{const p=b.worldToLocal(r.input.xr[i].hand.joints[index].getWorldPosition(new THREE.Vector3()));return (p.z-b.surfaceZ(p))*b.getInputScale(new THREE.Vector3()).z-.008;});
  for(let n=0;n<180;n++){
   for(const [hand,row,gap] of [[0,0,.001],[1,1,.008]]){
    const b=r.rows[0][row],p=new THREE.Vector3();p.z=b.surfaceZ(p)+(.008+gap)/b.getInputScale(new THREE.Vector3()).z;
    r.input.xr[hand].hand.joints[index].position.copy(b.localToWorld(p));
   }
   r.step();assert.ok(gaps().every(g=>g>0),'fixture never overlaps visible skin');
  }
  r.step(180);assert.equal(r.rows[0].filter(b=>b.hovered).length,1);
  assert.equal(r.panels[0].levels[0].panel.skin.uniforms.uBulgeCount.value,1);
  assert.equal(r.events.length,0);
 }finally{media.matches=false;}
});
