import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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

for(const kind of ['window','dock'])test('R7: distinct '+kind+' items execute independently through InputSystem',()=>{
 const r=rig(kind),controls=kind==='dock'?r.obj.icons:r.obj.levels.at(-1).rows, a=kind==='dock'?2:0,b=kind==='dock'?4:1;
 const point=(n,gap)=>kind==='dock'?iconPoint(r,controls[n?a:b],0,gap):rowPoint(r,controls[n?a:b],0,gap);
 for(const gap of [.04,.025,.015,.005,-.003]){r.hand(0,point(0,gap));r.hand(1,point(1,gap));r.frame();}
 assert.equal(controls[a].press.pressed,true);assert.equal(controls[b].press.pressed,true);
 r.hand(0,point(0,.015));r.hand(1,point(1,.015));r.frame();assert.equal(r.events.length,2);
});
for(const kind of ['window','dock'])test('R7: same '+kind+' bubble shows two spatial dents with one item action',()=>{
 const r=rig(kind),c=kind==='dock'?r.obj.icons[3]:r.obj.levels.at(-1).rows[0];
 const point=(n,gap)=>kind==='dock'?iconPoint(r,c,n?-30:30,gap):rowPoint(r,c,n?-.025:.025,gap);
 for(const gap of [.04,.025,.015,.005,-.003]){r.hand(0,point(0,gap));r.hand(1,point(1,gap));r.frame();}
 for(let i=0;i<20;i++){r.hand(0,point(0,-.003));r.hand(1,point(1,-.003));r.frame();}
 assert.ok(c.contactDents?.length>=1,'secondary fingertip needs its own dent');
 assert.ok(c.contactDents[0].depth>0);assert.equal(c.press.pressed,true);
 // Retreat normal to the face; a radial 30-degree retreat leaves the silhouette and correctly cancels.
 const out=n=>kind==='dock'?point(n,-.003).addScaledVector(new THREE.Vector3(0,0,1).transformDirection(c.matrixWorld),.025):point(n,.015);
 r.hand(0,out(0));r.hand(1,out(1));r.frame();assert.equal(r.events.length,1);
});
test('R7: five fingertips independently route once each; loss cancels and cannot synthesize a new click',()=>{
 const r=rig('window'),rows=r.obj.levels.at(-1).rows,src=r.sources[0].src;
 // Two rows suffice to observe all five joints, including multiple contacts on each.
 const names=['index-finger-tip','thumb-tip','middle-finger-tip','ring-finger-tip','pinky-finger-tip'];
 for(const name of names.slice(1)){const tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints[name]=tip;}
 const put=gap=>{src.connected=true;names.forEach((name,i)=>src.hand.joints[name].position.copy(rowPoint(r,rows[i%2],(i-2)*.01,gap)));};
 for(const gap of [.04,.025,.015,.005,-.003]){put(gap);r.frame();}
 const ids=r.delivered.filter(d=>rows.includes(d.item)).flatMap(d=>d.probes.map(p=>p.id));
 assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);assert.ok(rows.every(row=>row.press.pressed));
 src.connected=false;r.frame();assert.ok(rows.every(row=>!row.press.pressed));assert.equal(r.events.length,0);
 put(-.003);r.frame();assert.ok(rows.every(row=>!row.press.pressed));
});

test('R7: a tracked middle fingertip works while index is untracked',()=>{
 const r=rig('window'),row=r.obj.levels.at(-1).rows[0],src=r.sources[0].src;
 src.connected=true;r.sources[0].tip.visible=false;
 const tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints['middle-finger-tip']=tip;
 for(const gap of [.04,.025,.015,.005,-.003]){tip.position.copy(rowPoint(r,row,0,gap));r.frame();}
 assert.equal(row.press.pressed,true);assert.equal(row.pressOwner,'xr0:middle-finger-tip');
 tip.position.copy(rowPoint(r,row,0,.015));r.frame();assert.equal(r.events.length,1);
});

test('R7: same-hand distinct items select independently on full separation',()=>{
 const r=rig('window'),rows=r.obj.levels.at(-1).rows,src=r.sources[0].src;
 const middle=new THREE.Group();middle.jointRadius=.008;src.hand.add(middle);src.hand.joints['middle-finger-tip']=middle;
 const step=gap=>{r.hand(0,rowPoint(r,rows[0],0,gap));middle.position.copy(rowPoint(r,rows[1],0,gap));r.frame();};
 for(const gap of [.04,.025,.015,.005,-.003])step(gap);
 assert.ok(rows.every(row=>row.press.pressed));step(.015);assert.equal(r.events.length,2);
});

test('R7: a hand pinch captures the window control and cancels its other fingertip action',()=>{
 const r=rig('window'),l=r.obj.levels.at(-1),row=l.rows[0],h=l.moves[0],src=r.sources[0].src;
 const middle=new THREE.Group();middle.jointRadius=.008;src.hand.add(middle);src.hand.joints['middle-finger-tip']=middle;
 for(const gap of [.04,.025,.015,.005,-.003]){
  r.hand(0,r.point(h,.012));middle.position.copy(rowPoint(r,row,0,gap));r.frame();
 }
 assert.equal(row.press.pressed,true);
 src.selecting=true;r.frame();assert.equal(r.obj.controls.held?.id,src.id);assert.equal(row.press.pressed,false);assert.equal(r.events.length,0);
 src.selecting=false;r.frame();assert.equal(r.obj.controls.held,null);assert.equal(r.events.length,0);
});

for(const kind of ['window','dock'])test('R7: '+kind+' owner loss cancels action but preserves remaining physical dent and Glow',()=>{
 const r=rig(kind),c=kind==='dock'?r.obj.icons[3]:r.obj.levels.at(-1).rows[0];
 const point=(n,gap)=>kind==='dock'?iconPoint(r,c,n?-30:30,gap):rowPoint(r,c,n?-.025:.025,gap);
 for(const gap of [.04,.025,.015,.005,-.003]){r.hand(0,point(0,gap));r.hand(1,point(1,gap));r.frame();}
 const idx=r.sources.findIndex(s=>s.src.id===c.pressOwner),other=1-idx;
 assert.ok(idx>=0,'an actual primary press is required');
 r.sources[idx].src.connected=false;
 for(let i=0;i<90;i++){r.hand(other,point(other,-.003));r.frame();}
 assert.equal(c.press.pressed,false);assert.equal(c.hovered,true);assert.equal(r.events.length,0);
 assert.ok(c.contactDents.some(d=>d.id===r.sources[other].src.id&&d.depth>0&&d.glow>0),'surviving fingertip must still visibly dent and glow');
 r.hand(other,point(other,.02));r.frame();assert.equal(r.events.length,0,'surviving feedback is not an action reacquisition');
});

for(const staleGrip of [false,true])test('R7: hidden hand cancels without stale joint/grip or ray fallback, grip='+staleGrip,()=>{
 const r=rig('window'),row=r.obj.levels.at(-1).rows[0],src=r.sources[0].src;
 for(const gap of [.04,.025,.015,.005,-.003]){r.hand(0,rowPoint(r,row,0,gap));r.frame();}
 assert.equal(row.press.pressed,true);src.hand.visible=false;src.grip.visible=staleGrip;
 src.grip.position.copy(r.sources[0].tip.position);
 for(let i=0;i<3;i++)r.frame();
 assert.equal(row.press.pressed,false);assert.equal(r.events.length,0);
 assert.equal(src.line.visible,false,'untracked hand must not turn into a controller ray');
 r.hand(0,rowPoint(r,row,0,-.003));r.frame();assert.equal(row.press.pressed,false);
 for(const gap of [.04,.025,.015,.005,-.003]){r.hand(0,rowPoint(r,row,0,gap));r.frame();}
 assert.equal(row.press.pressed,true);r.hand(0,rowPoint(r,row,0,.02));r.frame();assert.equal(r.events.length,1);
});

for(const schedule of [
 [.04,.025,.015,.005,-.003].map(g=>[g,g]),
 [[.04,.05],[.03,.02],[.004,.005],[.003,-.003]],
])test('R7: plate keeps per-source approach when end candidates exchange proximity '+JSON.stringify(schedule),()=>{
 const r=rig('dock',{distance:Math.hypot(.28,.48),eccentricity:-Math.atan2(.28,.48)}),d=r.obj;
 const tick=gaps=>{for(let n=0;n<2;n++){
  r.scene.updateMatrixWorld(true);const [x,z]=d.arc((n?1:-1)*(d.length/2-d.pad/2),0),p=new THREE.Vector3(x,0,z);
  p.y=d.plateSample(p).front+.008+gaps[n];r.hand(n,d.shelf.localToWorld(p));
 }r.frame();};
 for(const gaps of schedule)tick(gaps);
 assert.equal(d.shelf.press.pressed,true,'continuous front approaches must acquire plate pressure');
 assert.ok(r.delivered.some(x=>x.item===d.shelf&&x.probes.length===2));
 const owner=d.shelf.pressOwner;
 r.sources.forEach(h=>h.src.connected=false);r.frame();assert.equal(d.shelf.press.pressed,false);
 tick([-.003,-.003]);assert.equal(d.shelf.press.pressed,false,'loss must discard both approach histories');
});

for(const loss of ['index-only','all-tips'])test('R7: visible hand with '+loss+' tracking loss cancels instead of ray release',()=>{
 const r=rig('window'),row=r.obj.levels.at(-1).rows[0],src=r.sources[0].src;
 for(const gap of [.04,.025,.015,.005,-.003]){r.hand(0,rowPoint(r,row,0,gap));r.frame();}
 assert.equal(row.press.pressed,true);
 r.sources[0].tip.visible=false;
 if(loss==='index-only'){
  const tip=new THREE.Group();tip.position.set(0,2,2);tip.jointRadius=.008;src.hand.add(tip);src.hand.joints['middle-finger-tip']=tip;
 }
 src.ray.position.copy(rowPoint(r,row,0,.5));
 src.ray.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,0,-1).transformDirection(row.matrixWorld));
 r.frame();assert.equal(row.press.pressed,false);assert.equal(r.events.length,0);assert.equal(src.line.visible,false);
});

test('R7: explicit controller reconnect after hand loss retains ray click support',()=>{
 const r=rig('window'),row=r.obj.levels.at(-1).rows[0],src=r.sources[0].src;
 r.hand(0,rowPoint(r,row,0,.04));r.frame();src.hand.visible=false;r.frame();
 src.ray.dispatchEvent({type:'disconnected'});src.ray.dispatchEvent({type:'connected',data:{targetRayMode:'tracked-pointer'}});
 const at=row.localToWorld(new THREE.Vector3(0,0,row.frontZ));
 r.ray(0,at,false);r.frame();r.ray(0,at,true);r.frame();r.ray(0,at,false);r.frame();
 assert.equal(r.events.length,1);
});
