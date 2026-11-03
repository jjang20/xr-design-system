import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=new URL('../../',import.meta.url).pathname.replace(/\/$/,'');
const THREE=await import(pathToFileURL(root+'/node_modules/three/build/three.module.js'));
const {createTokens,PackagingPanel,InputSystem}=await import(pathToFileURL(root+'/src/index.js'));
const {DEFAULTS}=await import(pathToFileURL(root+'/src/core/defaults.js'));
const {catalogItems}=await import(pathToFileURL(root+'/demo/catalog-data.js'));
const T=createTokens(JSON.parse(readFileSync(root+'/tokens.json'))),dt=1/60;
export function rig({scale=DEFAULTS.windowPreview.scale}={}){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.6,0);scene.add(camera);
 const p=new PackagingPanel(T,{title:'Catalog',subtitle:'Living room · 4 categories',items:catalogItems,distance:.6,layerSpacing:DEFAULTS.windowPreview.layerSpacing/DEFAULTS.windowPreview.scale});p.position.set(-.02,1.62,-.68);p.lookAt(0,1.6,0);p.scale.setScalar(scale);scene.add(p);
 for(let n=0;n<120;n++){scene.updateMatrixWorld(true);p.update(dt);}scene.updateMatrixWorld(true);
 const group=()=>new THREE.Group(),input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 input.xr.forEach(s=>{s.connected=false;s.handSource=true;s.grip.visible=false;});const s=input.xr[0],tip=new THREE.Group();tip.jointRadius=.008;s.hand.add(tip);s.hand.joints={'index-finger-tip':tip};
 const level=p.levels[0],h=level.surface,rows=level.rows,events=[],frames=[];p.addEventListener('open',e=>events.push({type:'open',label:e.item.label}));
 rows.forEach((r,i)=>{for(const type of ['press','select','cancel'])r.addEventListener(type,()=>events.push({frame:frames.length+1,row:i,type}));});
 const restMesh=new THREE.Mesh(h.hitMeshes[0].geometry.clone(),h.hitMeshes[0].material),restRay=new THREE.Raycaster();
 const restZ=point=>{restRay.set(new THREE.Vector3(point.x,point.y,h.panel.t*2),new THREE.Vector3(0,0,-1));return restRay.intersectObject(restMesh,false)[0]?.point.z??Infinity;};
 const identify=o=>o===h?'pane':o===level.panel?'title':rows.includes(o)?'row:'+rows.indexOf(o):level.corners.includes(o)?'corner:'+level.corners.indexOf(o):o.constructor.name;
 function step(world,pinch,phase){s.connected=true;s.hand.visible=tip.visible=true;s.selecting=pinch;tip.position.copy(world);scene.updateMatrixWorld(true);input.update();
  const probes=input.collect().items.filter(o=>o.probes.length).map(o=>({target:identify(o),ids:o.probes.map(q=>q.id)}));const local=h.worldToLocal(world.clone());const inside=h.inside(local),distance=pinch?h.pinchDistance(local,.008):null;
  p.update(dt);scene.updateMatrixWorld(true);const u=level.panel.skin.uniforms;
  frames.push({frame:frames.length+1,phase,probes,pinch,inside,distance:Number.isFinite(distance)?distance:null,held:p.controls.held?{id:p.controls.held.id,handle:identify(p.controls.held.handle)}:null,position:p.position.toArray(),rows:rows.map(r=>({hovered:r.hovered,pressed:r.press.pressed,contacted:r.groupContacted,owner:r.pressOwner??null,bulge:r.bulge,glow:r.glow})),slots:u.uBulgeCount.value,slotHeights:u.uBulgeParam.value.map(v=>v.y),paneDent:u.uPaneDent.value.toArray(),panePhysicalDepth:h.currentDent?.depth>0?(restZ(h.spot)-h.surfaceZ(new THREE.Vector3(h.spot.x,h.spot.y,0)))*h.inputScale:0,events:events.length});
 }
 return{scene,p,input,s,tip,level,h,rows,events,frames,step};
}

export function naturalEdge(r,inset){
 const {h,rows}=r,scale=h.inputScale;const local=new THREE.Vector3(h.panel.w/2-inset/scale,rows[0].position.y,0);
 const at=gap=>h.localToWorld(local.clone().setZ(h.panel.t+(.008+gap)/scale));
 for(let n=0;n<60;n++)r.step(at(.10+(.004-.10)*n/59),false,'approach');
 const world=at(.004);for(let n=0;n<60;n++)r.step(world,false,'hover');return world;
}
export {THREE};
