import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=new URL('../',import.meta.url).pathname.replace(/\/$/,'');
const THREE=await import(pathToFileURL(root+'/node_modules/three/build/three.module.js'));
const {createTokens,PackagingPanel,InputSystem}=await import(pathToFileURL(root+'/src/index.js'));
const T=createTokens(JSON.parse(readFileSync(root+'/tokens.json'))),dt=1/60;
const traces=[];
function rig({leaf=false}={}){
 const items=['A','B'].map(id=>({id,label:id,...(leaf?{}:{items:[{id:id+'1',label:id+'1'}]})}));
 const p=new PackagingPanel(T,{title:'Catalog',items});p.scale.setScalar(1.5);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.y=1.6;scene.add(camera,p);
 for(let n=0;n<120;n++){scene.updateMatrixWorld(true);p.update(dt);}
 const group=()=>new THREE.Group();const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 const sources=input.xr.map(src=>{src.connected=false;src.handSource=true;src.grip.visible=false;const tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={'index-finger-tip':tip};return{src,tip};});
 const events=[],frames=[],starts=new Map();const level=p.levels[0];
 for(const type of ['open','select','back'])p.addEventListener(type,e=>events.push({type,id:e.item?.id,level:e.level}));
 level.rows.forEach((row,i)=>{row.addEventListener('press',()=>starts.set(row,{matrix:row.matrixWorld.clone(),front:row.pokeFront}));for(const type of ['press','select','cancel'])row.addEventListener(type,()=>events.push({type:'row-'+type,id:i}));});
 const identify=o=>o===level.panel?'rear-title':level.rows.includes(o)?'row:'+level.rows.indexOf(o):level.moves.includes(o)?'side:'+level.moves.indexOf(o):level.corners.includes(o)?'corner:'+level.corners.indexOf(o):o.constructor.name;
 function frame(){scene.updateMatrixWorld(true);input.update();const routed=input.collect().items.filter(o=>o.probes.length).map(o=>({target:identify(o),probes:o.probes.map(q=>({id:q.id,kind:q.kind,pinch:q.pinch,captured:q.captured}))}));p.update(dt);scene.updateMatrixWorld(true);frames.push({frame:frames.length+1,routed,held:p.controls.held?{id:p.controls.held.id,handle:identify(p.controls.held.handle),resize:p.controls.held.resize}:null,pressed:level.rows.map(r=>r.press.pressed),position:p.position.toArray(),active:p.active});}
 function put(i,world,held=false,mode='poke') {const{src,tip}=sources[i];src.connected=true;src.selecting=held;if(mode==='poke'){src.handSource=true;src.hand.visible=tip.visible=true;tip.position.copy(src.hand.worldToLocal(world.clone()));}else{src.handSource=false;src.hand.visible=tip.visible=false;src.ray.position.copy(world).add(new THREE.Vector3(0,0,.5));src.ray.quaternion.identity();}}
 const step=(i,w,held=false,mode='poke')=>{put(i,w,held,mode);frame();};
 function edge(side=1,gap=.004){scene.updateMatrixWorld(true);const panel=p.levels.at(-1).panel,s=panel.getWorldScale(new THREE.Vector3());return panel.localToWorld(new THREE.Vector3(side*(panel.w/2-.003/s.x),0,panel.t+(.008+gap)/s.z));}
 function rowPoint(i,gap){scene.updateMatrixWorld(true);const r=level.rows[i],start=starts.get(r),m=start?.matrix??r.matrixWorld,s=new THREE.Vector3().setFromMatrixScale(m),q=new THREE.Vector3();q.z=(start?.front??r.surfaceZ(q))+(.008+gap)/s.z;return q.applyMatrix4(m);}
 const row=(i,gap)=>put(i,rowPoint(i,gap));
 const opens=()=>events.filter(e=>e.type==='open');
 function result(name){traces.push({name,events,frames});}
 return{p,input,level,sources,events,frames,frame,put,step,edge,rowPoint,row,opens,result};
}
function record(name,fn){test(name,()=>{const r=rig(name.includes('leaf')?{leaf:true}:{});try{fn(r);}finally{r.result(name);}});}
record('Q71: separate side move bubbles are removed',r=>{
 assert.equal(r.level.moves.length,0,'Q70 removes the two separate movement bubbles; corner resize remains');
 assert.equal(r.level.corners.length,2);assert.ok(r.level.corners.every(h=>h.arrow));
});
for(const mode of ['poke','ray'])record('Q71: pane edge '+mode+' captures full stack and holds one owner',r=>{
 const start=r.edge(),initial=r.p.position.clone(),axis=new THREE.Vector3(.04,.015,-.01);
 r.step(0,start,false,mode);assert.equal(r.p.controls.held,null);assert.ok(r.p.position.distanceTo(initial)<1e-9);
 r.step(0,start,true,mode);assert.equal(r.p.controls.held?.id,'xr0','direct front pane must acquire at its own skin');assert.equal(r.p.controls.held.resize,false);
 r.step(0,start.clone().add(axis),true,mode);const expected=axis.clone();if(mode==='ray')expected.z=0;assert.ok(r.p.position.clone().sub(initial).distanceTo(expected)<.003,'poke follows 3D drag; ray follows front-plane projection');
 const ownerPosition=r.p.position.clone();r.put(1,r.edge(-1),true);r.frame();assert.equal(r.p.controls.held?.id,'xr0');assert.ok(r.p.position.distanceTo(ownerPosition)<1e-8);
 r.sources[0].src.connected=r.sources[1].src.connected=false;r.frame();assert.equal(r.p.controls.held,null);assert.equal(r.opens().length,0);assert.equal(r.events.filter(e=>e.type==='back'||e.type==='select').length,0);
});
record('Q71: pane pinch cancels pending Q48 group without executing child',r=>{
 const gaps=[.04,.04];for(const i of [0,1])for(const g of [.04,.025,.015,.005,-.003]){gaps[i]=g;r.row(0,gaps[0]);r.row(1,gaps[1]);r.frame();}
 assert.ok(r.level.rows.every(q=>q.press.pressed));r.row(0,.015);r.row(1,-.003);r.frame();assert.equal(r.opens().length,0);
 const edge=r.edge();r.step(0,edge,false);r.step(0,edge,true);assert.equal(r.p.controls.held?.id,'xr0','pane capture must interrupt the pending parent claim');
 assert.equal(r.level.rows[1].press.pressed,false);r.step(0,edge,false);r.row(1,.015);r.frame();assert.equal(r.opens().length,0);assert.equal(r.p.levels.length,1);
});
record('R13 retained: two physical leaf contacts still select independently without pinch',r=>{
 for(const g of [.04,.025,.015,.005,-.003]){r.row(0,g);r.row(1,g);r.frame();}
 assert.ok(r.level.rows.every(q=>q.press.pressed));assert.equal(r.p.controls.held,null);
 r.row(0,.015);r.row(1,.015);r.frame();assert.deepEqual(r.events.filter(e=>e.type==='select').map(e=>e.id),['A','B']);assert.equal(r.opens().length,0);
});
record('R13 retained: corner resize keeps its own pinch owner and arrow',r=>{
 const h=r.level.corners[1];assert.ok(h.arrow);r.p.updateMatrixWorld(true);const scale=h.inputScale,start=h.localToWorld(new THREE.Vector3(0,0,h.r+.012/scale));
 r.step(0,start,false);r.step(0,start,true);assert.equal(r.p.controls.held?.id,'xr0');assert.equal(r.p.controls.held.handle,h);assert.equal(r.p.controls.held.resize,true);
 const prior=r.p.scale.x,axis=h.getWorldPosition(new THREE.Vector3()).sub(r.p.getWorldPosition(new THREE.Vector3())).normalize().multiplyScalar(.04);
 r.step(0,start.clone().add(axis),true);assert.ok(r.p.scale.x>prior);r.put(1,r.edge(),true);r.frame();assert.equal(r.p.controls.held.handle,h);
 r.sources[0].src.connected=r.sources[1].src.connected=false;r.frame();assert.equal(r.p.controls.held,null);assert.equal(r.opens().length,0);
});

for(const scale of [.9,2.2])for(const side of [-1,1])record(`Q71 physical edge and restored skin at scale ${scale}, side ${side}`,r=>{
 r.p.scale.setScalar(scale);r.p.updateMatrixWorld(true);const h=r.level.surface,rest=h.restPositions.slice();
 const start=r.edge(side);r.step(0,start,true);assert.equal(r.p.controls.held?.handle,h);
 const at=h.spot.clone(),position=r.p.position.clone();for(let i=0;i<90;i++)r.frame();
 assert.ok(r.p.position.distanceTo(position)<1e-9);assert.ok(h.currentDent.depth>0);assert.ok(h.currentDent.depth*h.inputScale<=.0035+1e-9);
 const local=new THREE.Vector3(at.x,at.y,0);assert.ok(h.surfaceZ(local)<h.panel.t);
 const translated=start.clone().add(new THREE.Vector3(.04,.01,-.02));r.step(0,translated,true);
 assert.ok(h.spot.distanceTo(at)<1e-9,'dent stays on the grabbed pane point');
 r.step(0,translated,false);assert.equal(r.p.controls.held,null);
 r.sources[0].src.connected=false;for(let i=0;i<180;i++)r.frame();
 assert.ok(h.currentDent.depth<1e-8);assert.ok(r.p.manipulationOpacity>.999);
 assert.ok(h.hitMeshes[0].geometry.attributes.position.array.every((v,i)=>Math.abs(v-rest[i])<1e-8),'restored front vertices match rest within float precision');
});
for(const mode of ['poke','ray'])record('Q71 centre, title and outside edge do not start movement '+mode,r=>{
 const h=r.level.surface,p=r.level.panel,scale=h.inputScale;
 for(const local of [new THREE.Vector3(0,0,p.t+.012/scale),new THREE.Vector3(0,p.h/2-r.level.size.titleBand/2,p.t+.012/scale),new THREE.Vector3(p.w/2+.003/scale,0,p.t+.012/scale)]){
  const at=h.localToWorld(local);r.step(0,at,false,mode);r.step(0,at,true,mode);
  assert.equal(r.p.controls.held,null);r.step(0,at,false,mode);
 }
});
record('Q71 index loss and reference reset require a new pinch',r=>{
 const start=r.edge();r.step(0,start,true);assert.ok(r.p.controls.held);
 r.sources[0].tip.visible=false;r.frame();assert.equal(r.p.controls.held,null);
 r.sources[0].tip.visible=true;r.frame();assert.equal(r.p.controls.held,null);
 r.step(0,start,false);r.step(0,start,true);assert.ok(r.p.controls.held);
 r.input.reset();r.p.resetInteraction();r.frame();assert.equal(r.p.controls.held,null,'cancelled pane cannot reacquire an unchanged held pinch');
});
