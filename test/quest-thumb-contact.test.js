import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,PackagingPanel,Button,InputSystem} from '../src/index.js';
import {prefersReducedMotion} from '../src/core/spring.js';
const media={matches:false};globalThis.matchMedia=()=>media;

// Synthetic regression only. The exact Q59 device pose stays in local evidence.
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url)))),dt=1/90;
const thumb='thumb-tip',index='index-finger-tip';
function rig({navigation=false,scale=1.5}={}){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.y=1.6;scene.add(camera);
 const items=['A','B','C'].map(label=>({id:label,label,...(navigation?{items:[{id:label+'-leaf',label:label+' leaf'}]}:{})}));
 const panel=new PackagingPanel(T,{title:'List',items});panel.scale.setScalar(scale);scene.add(panel);
 for(let n=0;n<120;n++){scene.updateMatrixWorld(true);panel.update(dt);}
 const group=()=>new THREE.Group();
 const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 for(const s of input.xr){s.connected=false;s.grip.visible=false;}
 const src=input.xr[0];src.ray.dispatchEvent({type:'connected',data:{hand:{}}});src.hand.joints={};
 const put=(name,pos)=>{let j=src.hand.joints[name];if(!j){j=new THREE.Group();src.hand.add(j);src.hand.joints[name]=j;j.jointRadius=.008;}j.visible=true;j.position.copy(pos);return j;};
 const rows=panel.levels[0].rows,events=[],opens=[];
 rows.forEach((r,row)=>['press','release','select','cancel'].forEach(type=>r.addEventListener(type,()=>events.push({row,type}))));
 panel.addEventListener('open',e=>opens.push(e.item.id));
 const at=(row,gap,x=0)=>{scene.updateMatrixWorld(true);const r=rows[row],p=new THREE.Vector3(x,0,0),zscale=r.getWorldScale(new THREE.Vector3()).z;p.z=(r.press.pressed?r.pokeFront:r.surfaceZ(p))+(.008+gap)/zscale;return r.localToWorld(p);};
 const step=(n=1)=>{for(let i=0;i<n;i++){scene.updateMatrixWorld(true);input.update();panel.update(dt);scene.updateMatrixWorld(true);}};
 const approach=(name,row)=>{for(const gap of [.06,.035,.015,.005,.001,-.001,-.003]){put(name,at(row,gap));step();}};
 return {scene,camera,panel,input,src,put,rows,events,opens,at,step,approach};
}

test('R10: a straight non-contact thumb cannot sustain a second row beside a pointing index',()=>{
 const r=rig();const ip=r.at(0,.02),tp=r.at(1,.045),w=tp.clone().add(new THREE.Vector3(0,-.12,.04));
 r.put('wrist',w);r.put(index,ip);r.put(thumb,tp);
 for(const [name,tip,names]of [['index',ip,['phalanx-proximal','phalanx-intermediate','phalanx-distal']],['thumb',tp,['phalanx-proximal','phalanx-distal']]]){
  names.forEach((part,i)=>r.put((name==='index'?'index-finger-':'thumb-')+part,w.clone().lerp(tip,.45+i*.2)));
 }
 r.scene.updateMatrixWorld(true);assert.equal(r.input.fingerProximity(r.src,thumb),true,'pose itself is straight, not a curled-finger fixture');
 r.step(180);assert.deepEqual(r.rows.map(x=>x.hovered),[true,false,false]);assert.equal(r.panel.levels[0].panel.skin.uniforms.uBulgeCount.value,1);
 assert.equal(r.events.length,0);
 r.src.hand.joints[index].visible=false;r.step(180);assert.equal(r.rows.some(x=>x.hovered),false,'index loss does not promote distant thumb');
});

for(const scale of [0.75,1.5,2.25])test('R10: thumb-only contact rubs, releases once and rearms at world scale '+scale,()=>{
 const r=rig({scale});r.approach(thumb,0);assert.ok(r.rows[0].press.pressed);assert.ok(r.rows[0].hovered);
 for(const x of [-.02,0,.02]){r.put(thumb,r.at(0,-.002,x));r.step();assert.ok(r.rows[0].press.pressed);}
 r.put(thumb,r.at(0,.02));r.step();assert.equal(r.events.filter(e=>e.type==='select').length,1);
 r.step(120);r.approach(thumb,0);assert.ok(r.rows[0].press.pressed);r.put(thumb,r.at(0,.02));r.step();assert.equal(r.events.filter(e=>e.type==='select').length,2);
});

for(const cancel of ['side','thumb-loss','source-loss'])test('R10: real thumb '+cancel+' cancels without a leaf action',()=>{
 const r=rig();r.approach(thumb,0);assert.ok(r.rows[0].press.pressed);
 if(cancel==='side')r.put(thumb,r.at(0,-.002,r.rows[0].w));
 else if(cancel==='thumb-loss')r.src.hand.joints[thumb].visible=false;
 else r.src.connected=false;
 r.step(120);assert.equal(r.events.filter(e=>e.type==='select').length,0);assert.equal(r.rows[0].press.pressed,false);
});

test('R10: index and thumb retain two actual contacts and independent leaf actions',()=>{
 const r=rig();for(const gap of [.08,.05,.025,.01,.002,-.003]){r.put(index,r.at(0,gap));r.put(thumb,r.at(1,gap));r.step();}
 assert.ok(r.rows[0].press.pressed&&r.rows[1].press.pressed);
 r.src.hand.joints[index].visible=false;r.step();assert.ok(r.rows[1].press.pressed,'index tracking loss does not cancel the thumb');
 r.put(thumb,r.at(1,.02));r.step();assert.deepEqual(r.events.filter(e=>e.type==='select').map(e=>e.row),[1]);
});

test('R10: both index and thumb actual contacts execute their own leaf once',()=>{
 const r=rig();for(const gap of [.08,.05,.025,.01,.002,-.003]){r.put(index,r.at(0,gap));r.put(thumb,r.at(1,gap));r.step();}
 assert.ok(r.rows[0].press.pressed&&r.rows[1].press.pressed);
 r.put(index,r.at(0,.02));r.step();assert.deepEqual(r.events.filter(e=>e.type==='select').map(e=>e.row),[0]);
 r.put(thumb,r.at(1,.02));r.step(20);assert.deepEqual(r.events.filter(e=>e.type==='select').map(e=>e.row),[0,1]);
});

test('R10: Q48 index+thumb navigation waits for both contacts and opens only last valid release',()=>{
 const r=rig({navigation:true});for(const gap of [.08,.05,.025,.01,.002,-.003]){r.put(index,r.at(0,gap));r.put(thumb,r.at(1,gap));r.step();}
 assert.ok(r.rows[0].press.pressed&&r.rows[1].press.pressed);
 r.put(index,r.at(0,.02));r.step();assert.deepEqual(r.opens,[]);
 r.put(thumb,r.at(1,.02));r.step();assert.deepEqual(r.opens,['B']);
});

test('R10: row inflation cannot recruit a separated stationary thumb or retain it after actual exit',()=>{
 const r=rig();r.put(index,r.at(0,.02));r.step(120);
 const separated=r.rows[0].localToWorld(new THREE.Vector3(0,0,(.008+.025)/1.5));r.put(thumb,separated);
 r.src.hand.joints[index].visible=false;r.step(180);assert.equal(r.rows[0].hovered,false);assert.ok(Math.abs(r.rows[0].bulge)<1e-6);
 // Jitter remains outside both the flat face and maximum inflated skin.
 for(let i=0;i<180;i++){r.put(thumb,separated.clone().add(new THREE.Vector3(0,0,i%2?.0002:-.0002)));r.step();assert.equal(r.rows[0].hovered,false);}
 r.approach(thumb,0);assert.ok(r.rows[0].press.pressed);r.put(thumb,separated);r.step(180);
 assert.equal(r.rows[0].hovered,false);assert.equal(r.events.filter(e=>e.type==='select').length,1);
});

test('R10: detached thumb behind the finite sheet is neither hover nor a fresh press',()=>{
 const r=rig();r.put(thumb,r.at(0,-.08));r.step(120);assert.equal(r.rows[0].hovered,false);assert.equal(r.rows[0].press.pressed,false);assert.equal(r.events.length,0);
});

test('R10: non-list embossed buttons retain existing thumb proximity',()=>{
 const r=rig();r.scene.remove(r.panel);const b=new Button(T,{label:'Standalone',variant:'plain',width:200});r.scene.add(b);
 r.put(thumb,new THREE.Vector3(0,0,.04));for(let n=0;n<120;n++){r.scene.updateMatrixWorld(true);r.input.update();b.update(dt);}
 assert.equal(b.hovered,true);
});

for(const reduced of [false,true])test('R10: stationary thumb cannot acquire from another finger growing its row (reduced='+reduced+')',()=>{
 media.matches=reduced;assert.equal(prefersReducedMotion(),reduced);
 try{
  const r=rig(),row=r.rows[0],fixed=r.at(0,.002,.025);
  r.put(thumb,fixed);r.step();r.put(index,r.at(0,.02,-.025));r.step(120);
  assert.equal(row.press.pressed,false,'row inflation alone must not press a stationary thumb');
  assert.equal(r.events.length,0);
  r.src.hand.joints[index].visible=false;r.step(180);
  assert.equal(row.hovered,false,'inflation must not give the stationary thumb a self-sustained hover');
  assert.ok(Math.abs(row.bulge)<1e-6);
  r.put(thumb,r.at(0,.025,.025));r.step();assert.equal(r.events.length,0);
  // Reapproach the visible face while an independent index holds its inflation.
  r.put(index,r.at(0,.02,-.025));r.put(thumb,r.at(0,.04,.025));r.step(120);
  for(const gap of [.025,.01,.005,.001,-.001,-.003]){r.put(thumb,r.at(0,gap,.025));r.step();}
  assert.equal(row.press.pressed,true);assert.equal(row.pressOwner,'xr0:thumb-tip');
  r.put(thumb,r.at(0,.025,.025));r.step();assert.equal(r.events.filter(e=>e.type==='select').length,1);
 }finally{media.matches=false;}
});

for(const reduced of [false,true])for(const arriving of ['index','other-thumb'])test('R10: suppressed stationary thumb cannot hide '+arriving+' approach (reduced='+reduced+')',()=>{
 media.matches=reduced;assert.equal(prefersReducedMotion(),reduced);
 try{
  const r=rig(),row=r.rows[0];r.put(thumb,r.at(0,.002,.025));r.step(2);
  let put=p=>r.put(index,p);
  if(arriving==='other-thumb'){
   const src=r.input.xr[1];src.connected=true;src.handSource=true;src.grip.visible=false;
   const tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={[thumb]:tip};
   put=p=>tip.position.copy(p);
  }
  for(const gap of [.06,.035,.015,.005,.001,-.001,-.003]){put(r.at(0,gap,-.025));r.step();}
  assert.equal(row.press.pressed,true,'previously observed front approach must survive candidate change');
  assert.equal(row.pressOwner,arriving==='index'?'xr0':'xr1:thumb-tip');
  put(r.at(0,.025,-.025));r.step();assert.equal(r.events.filter(e=>e.type==='select').length,1);
 }finally{media.matches=false;}
});
