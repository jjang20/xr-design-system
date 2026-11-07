import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens} from '../src/tokens.js';
import {InputSystem} from '../src/core/InputSystem.js';
import {HierarchyComparison} from '../demo/comparison/HierarchyComparison.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url))));
const vec=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),dt=1/60;
function rig(){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),el=new THREE.EventDispatcher();el.setPointerCapture=()=>{};el.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:1000});
 const xr={isPresenting:false,getController:()=>new THREE.Group(),getControllerGrip:()=>new THREE.Group(),getHand:()=>new THREE.Group()};
 const input=new InputSystem({T,scene,camera,renderer:{domElement:el,xr}}),view=new HierarchyComparison(T,input);scene.add(view);
 const pointer={id:'public-ray',state:{}};
 const tick=()=>{scene.updateMatrixWorld(true);view.update(dt);scene.updateMatrixWorld(true);};
 const settle=()=>{for(let i=0;i<150;i++)tick();};
 const feed=(button,down,src=pointer,point=null)=>{scene.updateMatrixWorld(true);const origin=button.localToWorld(point??vec(0,0,.5));input.rayStep(src,new THREE.Ray(origin,vec(0,0,-1).transformDirection(button.matrixWorld)),down,0,input.collect().items);};
 const click=button=>{feed(button,false);tick();feed(button,true);tick();assert.equal(button.press.pressed,true,'actual public face acquisition');feed(button,false);tick();settle();};
 const row=(side,i)=>view.sides[side].panel.levels.at(-1).rows[i];settle();
 return{scene,camera,el,input,view,pointer,tick,settle,feed,click,row};
}
test('public root and item acquisition opens substantive detail on each independent side',()=>{
 const r=rig();try{
  for(const side of ['flat','contour']){
   r.click(r.row(side,0));assert.deepEqual(r.view.snapshot()[side].path,['Catalog','chairs']);
   r.click(r.row(side,0));const s=r.view.snapshot()[side];
   assert.deepEqual(s.path,['Catalog','chairs','lounge-chair']);
   assert.equal(s.content.name,'Lounge chair');assert.equal(s.content.category,'Chairs');assert.equal(s.content.dimensions,'78 × 82 cm');assert.equal(s.content.caption,'Demo catalog');
   assert.equal(r.view.sides[side].panel.levels.at(-1).rows.length,0,'detail is read-only content, not fake rows');
  }
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} four details retain exact parent order and proportional read-only content`,()=>{
 const r=rig();const expected=[['chairs',0,'lounge-chair','78 × 82 cm',78/82],['chairs',1,'dining-chair','46 × 52 cm',46/52],['tables',0,'coffee-table','100 × 55 cm',100/55],['tables',1,'side-table','45 × 45 cm',1]];
 const back=()=>{const p=r.view.sides[side].panel;if(side==='flat')r.click(p.levels.at(-1).backControl);else{
  const l=p.levels.at(-2),point=vec(0,l.panel.h/2-l.size.titleBand/2,.5);
  for(const down of [false,true,false]){r.feed(l.panel,down,r.pointer,point.clone());r.tick();}r.settle();
 }};
 try{for(const [category,index,id,dimensions,ratio]of expected){
  r.click(r.row(side,category==='chairs'?0:1));r.click(r.row(side,index));const s=r.view.snapshot()[side];assert.equal(s.content.id,id);assert.equal(s.content.dimensions,dimensions);assert.ok(Math.abs(s.content.footprint.width/s.content.footprint.height-ratio)<1e-10);back();
  assert.deepEqual(r.view.snapshot()[side].path,['Catalog',category]);assert.deepEqual(r.view.sides[side].panel.levels.at(-1).rows.map(b=>b.label.text),category==='chairs'?['Lounge chair','Dining chair']:['Coffee table','Side table']);back();assert.deepEqual(r.view.snapshot()[side].path,['Catalog']);
 }
 }finally{r.view.dispose();}
});
test('explicit Reset cancels held/pending work and restores both roots; loss alone retains committed detail',()=>{
 const r=rig();try{
  for(const side of ['flat','contour']){r.click(r.row(side,0));r.click(r.row(side,0));}
  r.view.cancelInput();assert.equal(r.view.snapshot().flat.content.id,'lounge-chair');assert.equal(r.view.snapshot().contour.content.id,'lounge-chair');
  r.view.reset();for(const side of ['flat','contour'])assert.deepEqual(r.view.snapshot()[side].path,['Catalog']);
  const row=r.row('contour',0);r.feed(row,false);r.tick();r.feed(row,true);r.tick();r.view.reset();r.feed(row,false);r.tick();r.settle();assert.deepEqual(r.view.snapshot().contour.path,['Catalog']);
  r.click(r.row('contour',1));assert.deepEqual(r.view.snapshot().contour.path,['Catalog','tables']);
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])for(const cancellation of ['none','second-loss','all-loss'])test(`${side} original-parent overlap: ${cancellation}`,()=>{
 const r=rig(),a=r.row(side,0),b=r.row(side,1),one={id:'one',state:{}},two={id:'two',state:{}};
 const frame=(ad,bd)=>{if(ad!==null)r.feed(a,ad,one);if(bd!==null)r.feed(b,bd,two);r.tick();};
 try{
  frame(false,false);frame(true,false);frame(true,true);assert.ok(a.press.pressed&&b.press.pressed);frame(cancellation==='all-loss'?null:false,true);assert.deepEqual(r.view.snapshot()[side].path,['Catalog']);
  frame(null,cancellation==='none'?false:null);r.settle();assert.deepEqual(r.view.snapshot()[side].path,cancellation==='all-loss'?['Catalog']:['Catalog',cancellation==='none'?'tables':'chairs']);
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} independently observed leaf callbacks attach the final detail to the acquisition parent`,()=>{
 const r=rig(),events=[];r.view.addEventListener('select',e=>events.push([e.side,e.item.id]));
 try{r.click(r.row(side,0));const a=r.row(side,0),b=r.row(side,1),one={id:'one',state:{}},two={id:'two',state:{}};
  const frame=(ad,bd)=>{r.feed(a,ad,one);r.feed(b,bd,two);r.tick();};
  frame(false,false);frame(true,false);frame(true,true);frame(false,false);r.settle();
  assert.deepEqual(events,[[side,'lounge-chair'],[side,'dining-chair']]);assert.deepEqual(r.view.snapshot()[side].path,['Catalog','chairs','dining-chair']);
  assert.equal(r.view.sides[side].panel.levels.length,3);assert.equal(r.view.sides[side==='flat'?'contour':'flat'].panel.active,0);
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} no outside/body/edge/corner actions and no competing-owner theft`,()=>{
 const r=rig(),a=r.row(side,0),one={id:'one',state:{}},two={id:'two',state:{}};
 try{
  for(const point of [vec(.4,0,.5),vec(0,-.15,.5)])for(const down of [false,true,false]){r.feed(a,down,one,point.clone());r.tick();}
  assert.deepEqual(r.view.snapshot()[side].path,['Catalog']);
  r.feed(a,false,one);r.tick();r.feed(a,true,one);r.tick();
  for(const down of [true,false]){r.feed(a,true,one);r.feed(a,down,two);r.tick();assert.equal(a.pressOwner,'one');assert.equal(r.view.sides[side].panel.active,0);}
  r.feed(a,false,one);r.tick();assert.deepEqual(r.view.snapshot()[side].path,['Catalog','chairs']);
  for(const l of r.view.sides[side].panel.stack.all){assert.equal(l.surface.enabled,false);assert.ok(l.corners.every(h=>!h.enabled&&!h.visible));}
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} near physical contact selects; pose loss cancels without hidden far release`,()=>{
 const r=rig(),src=r.input.xr[0],row=r.row(side,0);const front=row.surfaceZ(vec());r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
 const frame=z=>{r.scene.updateMatrixWorld(true);if(z!==null)src.grip.position.copy(row.localToWorld(vec(0,0,z)));src.ray.position.copy(row.getWorldPosition(vec())).add(vec(0,0,2));r.scene.updateMatrixWorld(true);r.input.update();r.tick();};
 try{frame(front+.03);frame(front-.002);assert.equal(row.press.pressed,true);src.grip.visible=false;frame(null);frame(null);assert.equal(row.press.pressed,false);assert.deepEqual(r.view.snapshot()[side].path,['Catalog']);
  src.grip.visible=true;frame(front-.002);assert.equal(row.press.pressed,false);frame(front+.03);frame(front-.002);frame(front+.03);assert.deepEqual(r.view.snapshot()[side].path,['Catalog','chairs']);
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} semantic first frame and release/rearm; source replacement cannot inherit a press`,()=>{
 const r=rig(),src=r.input.xr[0],row=r.row(side,0);r.input.renderer.xr.isPresenting=true;
 const aim=()=>{r.scene.updateMatrixWorld(true);src.ray.position.copy(row.getWorldPosition(vec())).add(vec(0,0,2));src.grip.position.copy(src.ray.position);r.scene.updateMatrixWorld(true);};
 const frame=()=>{r.input.update();r.tick();};
 try{src.ray.dispatchEvent({type:'connected',data:{}});aim();src.ray.dispatchEvent({type:'selectstart'});frame();assert.equal(row.press.pressed,true);
  src.ray.dispatchEvent({type:'disconnected'});src.ray.dispatchEvent({type:'connected',data:{}});src.ray.dispatchEvent({type:'selectend'});frame();assert.deepEqual(r.view.snapshot()[side].path,['Catalog']);
  aim();src.ray.dispatchEvent({type:'selectstart'});frame();src.ray.dispatchEvent({type:'selectend'});frame();assert.deepEqual(r.view.snapshot()[side].path,['Catalog','chairs']);
 }finally{r.view.dispose();}
});
test('a reset issued synchronously by a valid leaf callback cancels queued detail opening',()=>{
 const r=rig();try{r.click(r.row('contour',0));r.view.addEventListener('select',()=>r.view.reset());r.click(r.row('contour',0));assert.deepEqual(r.view.snapshot().contour.path,['Catalog']);}finally{r.view.dispose();}
});
function handRig(r){
 const src=r.input.xr[0];r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{hand:{}}});src.grip.visible=false;src.hand.joints={};src.hand.visible=true;
 const joint=(name,x,y,z,radius=.008)=>{const j=new THREE.Group();j.position.set(x,y,z);j.jointRadius=radius;src.hand.add(j);src.hand.joints[name]=j;return j;};
 joint('wrist',0,-.04,0,.012).rotation.x=Math.PI/2;
 for(const [finger,x]of [['index',-.025],['middle',-.008],['ring',.009],['pinky',.025]]){joint(finger+'-finger-phalanx-proximal',x,.03,0);joint(finger+'-finger-tip',x,.1,0);}
 r.scene.updateMatrixWorld(true);const panel=r.view.sides.contour.panel,l=panel.levels.at(-1),front=l.group.localToWorld(vec(0,0,l.panel.t));
 const move=gap=>{src.hand.position.set(0,0,0);r.scene.updateMatrixWorld(true);const center=src.hand.joints.wrist.getWorldPosition(vec()).lerp(src.hand.joints['middle-finger-phalanx-proximal'].getWorldPosition(vec()),.5);src.hand.position.copy(front).add(vec(0,0,.022+gap)).sub(center);r.scene.updateMatrixWorld(true);r.input.update();r.tick();};
 return {src,panel,move};
}
for(const loss of [false,true])test(`public hand joints Push precommit ${loss?'loss':'withdrawal'} retains exact detail`,()=>{
 const r=rig();try{r.click(r.row('contour',0));r.click(r.row('contour',0));const h=handRig(r);h.move(.04);h.move(-.01);assert.ok(h.panel.palmPush);if(loss){h.src.connected=false;for(let i=0;i<20;i++){r.input.update();r.tick();}}else h.move(.04);r.settle();assert.deepEqual(r.view.snapshot().contour.path,['Catalog','chairs','lounge-chair']);assert.equal(h.panel.palmPush,null);}finally{r.view.dispose();}
});
test('public hand Push returns exactly one child and retreat is required; root never exits',()=>{
 const r=rig();try{r.click(r.row('contour',0));r.click(r.row('contour',0));const h=handRig(r);h.move(.04);h.move(-.01);h.move(-.04);h.move(-.065);assert.deepEqual(r.view.snapshot().contour.path,['Catalog','chairs']);r.settle();h.move(-.08);assert.deepEqual(r.view.snapshot().contour.path,['Catalog','chairs']);h.move(.05);h.move(-.01);h.move(-.04);h.move(-.065);assert.deepEqual(r.view.snapshot().contour.path,['Catalog']);r.settle();h.move(.05);h.move(-.01);h.move(-.065);assert.deepEqual(r.view.snapshot().contour.path,['Catalog']);}finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} held semantic arrival and Reset require release before reacquiring`,()=>{
 const r=rig(),src=r.input.xr[0];r.input.renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
 const aim=row=>{r.scene.updateMatrixWorld(true);src.ray.position.copy(row.getWorldPosition(vec())).add(vec(0,0,2));src.grip.position.copy(src.ray.position);r.scene.updateMatrixWorld(true);};
 const frame=()=>{r.input.update();r.tick();};
 try{
  src.ray.position.set(4,4,2);src.grip.position.copy(src.ray.position);r.scene.updateMatrixWorld(true);src.ray.dispatchEvent({type:'selectstart'});frame();aim(r.row(side,0));frame();assert.equal(r.row(side,0).press.pressed,false);src.ray.dispatchEvent({type:'selectend'});frame();
  src.ray.dispatchEvent({type:'selectstart'});frame();assert.equal(r.row(side,0).press.pressed,true);r.view.reset();aim(r.row(side,0));frame();assert.equal(r.row(side,0).press.pressed,false);src.ray.dispatchEvent({type:'selectend'});frame();assert.deepEqual(r.view.snapshot()[side].path,['Catalog']);
  src.ray.dispatchEvent({type:'selectstart'});frame();src.ray.dispatchEvent({type:'selectend'});frame();assert.deepEqual(r.view.snapshot()[side].path,['Catalog','chairs']);
 }finally{r.view.dispose();}
});
for(const side of ['flat','contour'])test(`${side} fresh rear/closing data cannot be acquired; callback repeats after Back`,()=>{
 const r=rig(),events=[];r.view.addEventListener('select',e=>events.push(e.item.id));
 try{r.click(r.row(side,0));const old=r.row(side,0);r.click(old);for(const down of [false,true,false]){r.feed(old,down);r.tick();}assert.equal(old.press.pressed,false);assert.deepEqual(events,['lounge-chair']);
  const p=r.view.sides[side].panel;
  const back=side==='flat'?p.levels.at(-1).backControl:p.levels.at(-2).panel;
  const point=side==='flat'?vec(0,0,.5):vec(0,back.h/2-p.levels.at(-2).size.titleBand/2,.5);
  for(const down of [false,true,false]){r.feed(back,down,r.pointer,point.clone());r.tick();}r.settle();r.click(r.row(side,0));assert.deepEqual(events,['lounge-chair','lounge-chair']);
 }finally{r.view.dispose();}
});
test('dispose removes fixture listeners and targets; original input lifetime remains outside fixture',()=>{
 const r=rig(),src=r.input.xr[0],count=t=>(t._listeners?.selectstart??[]).length,before=count(src.ray);r.view.dispose();r.view.dispose();assert.equal(r.view.parent,null);assert.ok(count(src.ray)<before);assert.equal(r.input.collect().items.length,0);
});
for(const side of ['flat','contour'])test(`${side} held semantic source replacement cannot acquire until an actual end edge`,()=>{
 const r=rig(),src=r.input.xr[0];r.input.renderer.xr.isPresenting=true;
 const frame=()=>{r.scene.updateMatrixWorld(true);r.input.update();r.tick();};
 const aim=()=>{r.scene.updateMatrixWorld(true);src.ray.position.copy(r.row(side,0).getWorldPosition(vec())).add(vec(0,0,2));src.grip.position.copy(src.ray.position);r.scene.updateMatrixWorld(true);};
 try{src.ray.dispatchEvent({type:'connected',data:{}});aim();src.ray.dispatchEvent({type:'selectstart'});frame();assert.equal(r.row(side,0).press.pressed,true);
  src.ray.dispatchEvent({type:'disconnected'});src.ray.dispatchEvent({type:'connected',data:{}});frame();aim();src.ray.dispatchEvent({type:'selectstart'});frame();assert.equal(r.row(side,0).press.pressed,false,'replacement still-held source cannot press');src.ray.dispatchEvent({type:'selectend'});frame();assert.deepEqual(r.view.snapshot()[side].path,['Catalog']);
  src.ray.dispatchEvent({type:'selectstart'});frame();src.ray.dispatchEvent({type:'selectend'});frame();assert.deepEqual(r.view.snapshot()[side].path,['Catalog','chairs']);
 }finally{r.view.dispose();}
});
test('Contour closing detail blocks fresh occluded parent rows, then reopens after it clears',()=>{
 const r=rig();try{r.click(r.row('contour',0));r.click(r.row('contour',0));const p=r.view.sides.contour.panel,parent=p.levels.at(-2),back=parent.panel,point=vec(0,back.h/2-parent.size.titleBand/2,.5);
  for(const down of [false,true,false]){r.feed(back,down,r.pointer,point.clone());r.tick();}assert.equal(p.closing.length,1);assert.ok(p.closing[0].cur.opacity>.1);const row=r.row('contour',1),fresh={id:'fresh',state:{}};
  for(const down of [false,true,false]){r.feed(row,down,fresh);r.tick();assert.equal(row.press.pressed,false,'covered row cannot freshly acquire during closing');}
  assert.deepEqual(r.view.snapshot().contour.path,['Catalog','chairs']);r.settle();r.click(row);assert.deepEqual(r.view.snapshot().contour.path,['Catalog','chairs','dining-chair']);
 }finally{r.view.dispose();}
});
