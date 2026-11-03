import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=new URL('../../',import.meta.url).pathname.replace(/\/$/,'');
const THREE=await import(pathToFileURL(root+'/node_modules/three/build/three.module.js'));
const {WebXRController}=await import(pathToFileURL(root+'/node_modules/three/src/renderers/webxr/WebXRController.js'));
const {createTokens,PackagingPanel,InputSystem}=await import(pathToFileURL(root+'/src/index.js'));
const {catalogItems}=await import(pathToFileURL(root+'/demo/catalog-data.js'));
const T=createTokens(JSON.parse(readFileSync(root+'/tokens.json'))),dt=1/60;
export function rig(){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.6,0);scene.add(camera);
 const p=new PackagingPanel(T,{title:'Catalog',subtitle:'Living room · 4 categories',items:catalogItems,distance:.6});p.scale.setScalar(1.5);p.position.set(-.02,1.62,-.68);p.lookAt(0,1.6,0);scene.add(p);for(let i=0;i<120;i++){scene.updateMatrixWorld(true);p.update(dt);}scene.updateMatrixWorld(true);
 const controllers=[new WebXRController(),new WebXRController()],xr={isPresenting:true,getController:i=>controllers[i].getTargetRaySpace(),getControllerGrip:i=>controllers[i].getGripSpace(),getHand:i=>controllers[i].getHandSpace()};
 const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr}}),controller=controllers[0];
 const names=['index-finger-tip','thumb-tip'];const spaces=names.map(jointName=>({jointName})),source={hand:new Map(spaces.map(s=>[s.jointName,s])),handedness:'right',targetRaySpace:{}};
 const events=[],frames=[];for(const type of ['connected','pinchstart','pinchend','selectstart','selectend'])input.xr[0].ray.addEventListener(type,()=>events.push({frame:frames.length+1,type}));controller.connect(source);
 const level=p.levels[0],h=level.surface,scale=h.inputScale;const target=o=>o===h?'pane':o===level.panel?'title':level.rows.includes(o)?'row:'+level.rows.indexOf(o):level.corners.includes(o)?'corner:'+level.corners.indexOf(o):o.constructor.name;
 function step(local,{gap=.04,semantic=null,far=false,radius=.008,missing=null,world=null}={}){
  const index=world?.clone()??h.localToWorld(local.clone()),thumb=index.clone().add(new THREE.Vector3(0,0,-gap).applyQuaternion(p.quaternion)),aim=index.clone(),normal=new THREE.Vector3(0,0,1).applyQuaternion(p.quaternion);
  if(far){index.addScaledVector(normal,.5);thumb.addScaledVector(normal,.5);}
  const positions=new Map([['index-finger-tip',index],['thumb-tip',thumb]]),origin=aim.clone().addScaledVector(normal,.6),rayMatrix=new THREE.Matrix4().compose(origin,p.quaternion,new THREE.Vector3(1,1,1));
  const frame={session:{visibilityState:'visible'},getJointPose:s=>{const point=s.jointName===missing?null:positions.get(s.jointName);return point?{transform:{matrix:new THREE.Matrix4().makeTranslation(...point.toArray()).toArray()},radius}:null;},getPose:s=>s===source.targetRaySpace?{transform:{matrix:rayMatrix.toArray()}}:null};
  controller.update(source,frame,{});for(const type of [].concat(semantic??[]))controller.dispatchEvent({type,data:source});scene.updateMatrixWorld(true);input.update();const src=input.xr[0];
  const routed=input.collect().items.filter(o=>o.probes.length).map(o=>({target:target(o),probes:o.probes.map(q=>({id:q.id,kind:q.kind,pinch:q.pinch,pressed:q.pressed,captured:q.captured,radius:q.radius}))}));
  p.update(dt);scene.updateMatrixWorld(true);frames.push({frame:frames.length+1,local:local.toArray(),handSource:src.handSource,connected:src.connected,pinching:src.hand.inputState.pinching,selecting:src.selecting,near:src.near.on,handVisible:src.hand.visible,indexVisible:src.hand.joints['index-finger-tip'].visible,tip:src.hand.joints['index-finger-tip'].getWorldPosition(new THREE.Vector3()).toArray(),thumb:src.hand.joints['thumb-tip'].getWorldPosition(new THREE.Vector3()).toArray(),routed,held:p.controls.held?{id:p.controls.held.id,handle:target(p.controls.held.handle)}:null,position:p.position.toArray()});
 }
 function meshDistance(local){const g=h.hitMeshes[0].geometry,a=g.attributes.position,idx=g.index,tri=new THREE.Triangle(),q=new THREE.Vector3();let best=Infinity,at=null;const count=idx?idx.count:a.count;for(let i=0;i<count;i+=3){const v=k=>idx?idx.getX(k):k;tri.a.fromBufferAttribute(a,v(i));tri.b.fromBufferAttribute(a,v(i+1));tri.c.fromBufferAttribute(a,v(i+2));tri.closestPointToPoint(local,q);const d=q.distanceTo(local);if(d<best){best=d;at=q.toArray();}}return{distanceWorld:best*scale,nearestLocal:at};}
 return{root,THREE,scene,p,input,controller,source,level,h,scale,step,meshDistance,events,frames};
}
export {THREE};
