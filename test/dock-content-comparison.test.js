import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens} from '../src/tokens.js';
import {InputSystem} from '../src/core/InputSystem.js';
import {createOwnedDockInput} from '../demo/comparison/DockContentInput.js';
import {DockContentComparison,DOCK_APPS} from '../demo/comparison/DockContentComparison.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url))));
const vec=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),dt=1/60;
function rig(options={}){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),el=new THREE.EventDispatcher();el.setPointerCapture=()=>{};el.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:1000});
  const xr={isPresenting:false,getController:()=>new THREE.Group(),getControllerGrip:()=>new THREE.Group(),getHand:()=>new THREE.Group()};
  const input=new InputSystem({T,scene,camera,renderer:{domElement:el,xr}}),view=new DockContentComparison(T,input,options);scene.add(view);
  const pointer={id:'public-ray',state:{}};
  const tick=()=>{scene.updateMatrixWorld(true);view.update(dt);scene.updateMatrixWorld(true);};
  const target=(side,i)=>view.sides[side].targets[i];
  const feed=(t,down,src=pointer,point=null)=>{scene.updateMatrixWorld(true);const local=point??vec(0,t.rb??0,.5);input.rayStep(src,new THREE.Ray(t.localToWorld(local),vec(0,0,-1).transformDirection(t.matrixWorld)),down,0,input.collect().items);};
  const click=t=>{feed(t,false);tick();feed(t,true);tick();assert.equal(t.press.pressed,true,'actual visible target acquisition');feed(t,false);tick();};
  tick();return{scene,camera,el,input,view,pointer,tick,target,feed,click};
}
test('public first acquisition opens each of seven substantive pages on independent sides',()=>{
  const r=rig();try{for(const side of ['flat','contour'])for(const [i,app]of DOCK_APPS.entries()){
    r.click(r.target(side,i));assert.equal(r.view.snapshot()[side]?.id,app.id);assert.ok(r.view.snapshot()[side].caption);
  }}finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} visible Back closes only its pane; repeats and replacements are real callbacks`,()=>{
 const r=rig(),events=[];r.view.addEventListener('select',e=>events.push([e.side,e.app.id]));
 try{r.click(r.target('flat',0));r.click(r.target('contour',0));r.click(r.target(side,0));r.click(r.target(side,1));assert.equal(r.view.snapshot()[side].id,'measure');assert.equal(r.view.sides[side].group.children.filter(x=>x===r.view.sides[side].pane).length,1);
 r.click(r.view.sides[side].pane.back);assert.equal(r.view.snapshot()[side],null);assert.equal(r.view.snapshot()[side==='flat'?'contour':'flat'].id,'planner');assert.deepEqual(events.slice(2),[[side,'planner'],[side,'measure']]);assert.ok(r.view.sides[side].targets.every(t=>t.visible));}finally{r.view.dispose();}
});
test('all destinations have actual distinct authored or runtime content and matched layouts',()=>{
 let time=new Date(2026,10,8,3,4,5);const r=rig({now:()=>time,locale:'en-KR'});
 try{for(let i=0;i<7;i++){for(const s of ['flat','contour'])r.click(r.target(s,i));const {flat,contour}=r.view.snapshot();assert.deepEqual(flat,contour);assert.equal(r.view.sides.flat.pane.w,r.view.sides.contour.pane.w);
 if(i===0)assert.deepEqual(flat.rows.map(x=>x.name),['Lounge chair','Dining chair','Coffee table','Side table']);
 if(i===1)for(const side of Object.values(r.view.sides))for(const f of side.pane.footprints)assert.ok(Math.abs(f.width/f.height-f.widthCm/f.depthCm)<1e-12);
 if(i===2)assert.equal(flat.widthM/flat.depthM,4/3);
 if(i===3)assert.equal(flat.photo.width/flat.photo.height,2);
 if(i===4){assert.equal(flat.facts[0][1],'en-KR');assert.equal(flat.facts[1][1],'public-ray / ray');}
 if(i===5)assert.ok(flat.paragraphs.join(' ').length>100);
 if(i===6){assert.equal(flat.time,time.toLocaleTimeString());assert.equal(flat.timeZone,Intl.DateTimeFormat().resolvedOptions().timeZone);}
 }
 time=new Date(2026,10,9,4,5,6);r.click(r.target('flat',6));assert.equal(r.view.snapshot().flat.time,time.toLocaleTimeString());assert.notEqual(r.view.snapshot().flat.date,r.view.snapshot().contour.date);
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} hover, missing probe and non-owner cannot execute or steal`,()=>{
 const r=rig(),t=r.target(side,3),other={id:'other',state:{}};try{
 r.feed(t,false);r.tick();assert.equal(r.view.snapshot()[side],null);r.feed(t,true);r.tick();assert.ok(t.press.pressed);
 r.feed(t,true);r.feed(t,true,other);r.tick();assert.equal(t.pressOwner,'public-ray');r.feed(t,true);r.feed(t,false,other);r.tick();assert.equal(t.pressOwner,'public-ray');assert.equal(r.view.snapshot()[side],null);
 r.tick();assert.equal(t.press.pressed,false);assert.equal(r.view.snapshot()[side],null);r.click(t);assert.equal(r.view.snapshot()[side].id,'photos');r.view.cancelInput();assert.equal(r.view.snapshot()[side].id,'photos');
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} finite drawn target outside misses and empty-space release rearms`,()=>{
 const r=rig(),t=r.target(side,3);try{
 for(const down of [false,true,false]){r.feed(t,down,r.pointer,vec(2,2,.5));r.tick();}assert.equal(r.view.snapshot()[side],null);assert.equal(t.press.pressed,false);r.click(t);assert.equal(r.view.snapshot()[side].id,'photos');
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} actual near contact crossing selects; pose loss cancels and requires retreat`,()=>{
 const r=rig(),src=r.input.xr[0],t=r.target(side,3),front=t.rb??t.surfaceZ(vec()),y=t.rb??0;r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
 const frame=z=>{r.scene.updateMatrixWorld(true);if(z!==null)src.grip.position.copy(t.localToWorld(vec(0,y,z)));src.ray.position.copy(t.getWorldPosition(vec())).add(vec(0,0,2));r.scene.updateMatrixWorld(true);r.input.update();r.tick();};
 try{frame(front+.03);frame(front-.002);assert.equal(t.press.pressed,true);src.grip.visible=false;frame(null);frame(null);assert.equal(t.press.pressed,false);assert.equal(r.view.snapshot()[side],null);
 src.grip.visible=true;frame(front-.002);assert.equal(t.press.pressed,false);frame(front+.03);frame(front-.002);frame(front+.03);assert.equal(r.view.snapshot()[side].id,'photos');
 }finally{r.view.dispose();}
});
function semantic(r,side){
 const src=r.input.xr[0],target=r.target(side,3);r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
 const aim=(empty=false)=>{r.scene.updateMatrixWorld(true);src.ray.position.copy(target.localToWorld(vec(empty?3:0,target.rb??0,2)));src.ray.quaternion.copy(target.getWorldQuaternion(new THREE.Quaternion()));src.grip.position.copy(src.ray.position);r.scene.updateMatrixWorld(true);};
 const frame=()=>{r.input.update();r.tick();},start=()=>{src.ray.dispatchEvent({type:'selectstart'});frame();},end=()=>{src.ray.dispatchEvent({type:'selectend'});frame();};
 return{src,target,aim,frame,start,end};
}
for(const side of ['flat','contour'])for(const loss of ['reset','replacement','ray-loss'])test(`${side} first semantic acquisition, ${loss}, held rearm and fresh reacquisition`,()=>{
 const r=rig(),s=semantic(r,side);try{
 s.aim();s.start();assert.equal(s.target.press.pressed,true,'no pre-hover required');
 if(loss==='reset')r.view.reset();else if(loss==='replacement'){s.src.ray.dispatchEvent({type:'disconnected'});s.src.ray.dispatchEvent({type:'connected',data:{}});}else{s.src.ray.visible=false;s.frame();s.src.ray.visible=true;}
 s.frame();s.aim();s.start();assert.equal(s.target.press.pressed,false);s.end();assert.equal(r.view.snapshot()[side],null);s.aim();s.start();assert.equal(s.target.press.pressed,true);s.end();assert.equal(r.view.snapshot()[side].id,'photos');
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} held empty arrival cannot activate and real empty release enables new press`,()=>{
 const r=rig(),s=semantic(r,side);try{s.aim(true);s.start();s.aim();s.frame();assert.equal(s.target.press.pressed,false);s.aim(true);s.end();s.aim();s.start();assert.equal(s.target.press.pressed,true);s.end();assert.equal(r.view.snapshot()[side].id,'photos');}finally{r.view.dispose();}
});
test('simultaneous independent releases have deterministic order without duplicate panes',()=>{
 const r=rig(),a=r.target('contour',0),b=r.target('contour',6),one={id:'one',state:{}},two={id:'two',state:{}},events=[];r.view.addEventListener('select',e=>events.push(e.app.id));
 try{for(const down of [false,true,false]){r.feed(a,down,one);r.feed(b,down,two);r.tick();}assert.deepEqual(events,['planner','clock']);assert.equal(r.view.snapshot().contour.id,'clock');assert.equal(r.view.snapshot().flat,null);}finally{r.view.dispose();}
});
for(const action of ['reset','dispose'])test(`synchronous ${action} cancels queued callback opening`,()=>{
 const r=rig();try{r.view.addEventListener('select',()=>r.view[action]());r.click(r.target('contour',0));assert.equal(r.view.snapshot().contour,null);}finally{r.view.dispose();}
});
test('scope excludes manipulation, disposal removes listeners and preserves borrowed photo texture',()=>{
 const photo=new THREE.Texture();let disposed=0;photo.addEventListener('dispose',()=>disposed++);const r=rig({photoTexture:photo}),src=r.input.xr[0],before=src.ray._listeners.selectstart.length;
 assert.equal(r.view.sides.contour.dock.shelf.enabled,false);assert.equal(r.view.sides.contour.dock.handle.enabled,false);assert.ok(r.view.sides.contour.dock.shelf.visible&&r.view.sides.contour.dock.handle.visible);
 r.click(r.target('flat',3));r.click(r.target('contour',3));r.view.dispose();assert.equal(disposed,0);assert.ok(src.ray._listeners.selectstart.length<before);assert.equal(r.input.collect().items.length,0);photo.dispose();
});
for(const side of ['flat','contour'])test(`${side} native joint contact and tracking loss are independent of pinch events`,()=>{
 const r=rig(),src=r.input.xr[0],t=r.target(side,3);r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{hand:{}}});src.grip.visible=false;src.hand.visible=true;src.hand.joints={};
 const joint=new THREE.Group();joint.jointRadius=.008;src.hand.joints['index-finger-tip']=joint;src.hand.add(joint);const front=t.rb??t.surfaceZ(vec()),y=t.rb??0;
 const frame=z=>{r.scene.updateMatrixWorld(true);joint.position.copy(t.localToWorld(vec(0,y,z)));src.ray.position.copy(t.getWorldPosition(vec())).add(vec(0,0,2));r.scene.updateMatrixWorld(true);r.input.update();r.tick();};
 try{frame(front+.035);frame(front+.004);assert.equal(t.press.pressed,true);joint.visible=false;r.input.update();r.tick();assert.equal(t.press.pressed,false);assert.equal(r.view.snapshot()[side],null);
 joint.visible=true;frame(front+.004);assert.equal(t.press.pressed,false);frame(front+.035);frame(front+.004);frame(front+.035);assert.equal(r.view.snapshot()[side].id,'photos');assert.ok(!t.trackedPinch);
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} Back semantic first-hit opens no new content and closes its own pane`,()=>{
 const r=rig();r.click(r.target(side,0));const src=r.input.xr[0],target=r.view.sides[side].pane.back;r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
 const aim=()=>{r.scene.updateMatrixWorld(true);src.ray.position.copy(target.localToWorld(vec(0,0,2)));src.ray.quaternion.copy(target.getWorldQuaternion(new THREE.Quaternion()));src.grip.position.copy(src.ray.position);r.scene.updateMatrixWorld(true);};
 try{aim();src.ray.dispatchEvent({type:'selectstart'});r.input.update();r.tick();assert.equal(target.press.pressed,true);src.ray.dispatchEvent({type:'selectend'});r.input.update();r.tick();assert.equal(r.view.snapshot()[side],null);}finally{r.view.dispose();}
});
test('flat rounded corner outside the drawn shape does not acquire',()=>{
 const r=rig(),t=r.target('flat',0);try{for(const down of [false,true,false]){r.feed(t,down,r.pointer,vec(t.w/2-.00001,t.h/2-.00001,.5));r.tick();}assert.equal(t.press.pressed,false);assert.equal(r.view.snapshot().flat,null);r.click(t);assert.equal(r.view.snapshot().flat.id,'planner');}finally{r.view.dispose();}
});
for(const where of ['corner','outside'])test(`flat near ${where} outside the drawn target cannot acquire`,()=>{
 const r=rig(),src=r.input.xr[0],t=r.target('flat',3);r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
 const x=where==='corner'?t.w/2-.00001:0,y=where==='corner'?t.h/2-.00001:t.h/2+.004;
 try{for(const z of [t.t+.03,t.t-.002,t.t+.03]){r.scene.updateMatrixWorld(true);src.grip.position.copy(t.localToWorld(vec(x,y,z)));src.ray.position.copy(t.localToWorld(vec(x,y,2)));r.scene.updateMatrixWorld(true);r.input.update();r.tick();assert.equal(t.press.pressed,false,'outside the drawn skin');}assert.equal(r.view.snapshot().flat,null);}finally{r.view.dispose();}
});

test('entry-owned InputSystem listeners are removed without clearing a peer listener',()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),el=new THREE.EventDispatcher(),parts=[0,1].map(()=>({ray:new THREE.Group(),grip:new THREE.Group(),hand:new THREE.Group()}));
 const xr={getController:i=>parts[i].ray,getControllerGrip:i=>parts[i].grip,getHand:i=>parts[i].hand};let peer=0;const listener=()=>peer++;el.addEventListener('pointermove',listener);
 const input=createOwnedDockInput({T,scene,camera,renderer:{domElement:el,xr}});assert.equal(el._listeners.pointermove.length,2);input.dispose();input.dispose();assert.equal(el._listeners.pointermove.length,1);el.dispatchEvent({type:'pointermove'});assert.equal(peer,1);assert.equal(parts[0].ray._listeners.selectstart.length,0);assert.equal(scene.children.length,0);
});
for(const side of ['flat','contour'])test(`${side} Settings reports actual opening probe kind during visual recovery`,()=>{
 const r=rig(),src=r.input.xr[0],t=r.target(side,4);try{r.click(t);assert.equal(r.view.snapshot()[side].facts[1][1],'public-ray / ray');r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});const y=t.rb??0,front=t.rb??t.surfaceZ(vec());
 for(const z of [front+.03,front-.002,front+.03]){r.scene.updateMatrixWorld(true);src.grip.position.copy(t.localToWorld(vec(0,y,z)));src.ray.position.copy(t.localToWorld(vec(0,y,2)));src.ray.quaternion.copy(t.getWorldQuaternion(new THREE.Quaternion()));r.scene.updateMatrixWorld(true);r.input.update();r.tick();}
 assert.equal(r.view.snapshot()[side].facts[1][1],'xr0 / poke');}finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} ray recovery cannot convert a new near pose loss into release`,()=>{
 const r=rig(),src=r.input.xr[0],t=r.target(side,4),events=[];r.view.addEventListener('select',e=>events.push(e.app.id));try{r.click(t);r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});const y=t.rb??0,front=t.rb??t.surfaceZ(vec());
 for(const z of [front+.03,front-.002]){r.scene.updateMatrixWorld(true);src.grip.position.copy(t.localToWorld(vec(0,y,z)));src.ray.position.copy(t.localToWorld(vec(0,y,2)));src.ray.quaternion.copy(t.getWorldQuaternion(new THREE.Quaternion()));r.scene.updateMatrixWorld(true);r.input.update();r.tick();}assert.equal(t.press.pressed,true);assert.equal(t.pressKind,'ray','reproduce still-recovering visual state');
 src.grip.visible=false;r.input.update();r.tick();assert.equal(t.press.pressed,false);assert.deepEqual(events,['settings']);assert.equal(r.view.snapshot()[side].facts[1][1],'public-ray / ray');
 }finally{r.view.dispose();}
});
