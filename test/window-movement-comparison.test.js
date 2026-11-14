import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {createTokens} from '../src/tokens.js';
import {InputSystem} from '../src/core/InputSystem.js';
import {WindowMovementComparison} from '../demo/comparison/WindowMovementComparison.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url))));
function rig(native=false) {
  const controllers=[new WebXRController(),new WebXRController()];
  const scene=new THREE.Scene(),renderer={domElement:new THREE.EventDispatcher(),xr:native?{isPresenting:true,getController:i=>controllers[i].getTargetRaySpace(),getControllerGrip:i=>controllers[i].getGripSpace(),getHand:i=>controllers[i].getHandSpace()}:{getController:()=>new THREE.Group(),getControllerGrip:()=>new THREE.Group(),getHand:()=>new THREE.Group()}};
  const input=new InputSystem({T,renderer,scene,camera:new THREE.PerspectiveCamera()}),view=new WindowMovementComparison(T,input);
  view.onReset=()=>input.reset();scene.add(view);scene.updateMatrixWorld(true);
  const source={id:'pointer',state:{}};
  const ray=(point,pressed,src=source)=>{scene.updateMatrixWorld(true);input.rayStep(src,new THREE.Ray(point.clone().add(new THREE.Vector3(0,0,.4)),new THREE.Vector3(0,0,-1)),pressed,0,input.collect().items);};
  const frame=()=>{view.update(1/60);scene.updateMatrixWorld(true);};
  const aim=(p,down,src=source)=>{ray(p,down,src);frame();};
  return {scene,renderer,input,view,source,ray,frame,aim,controllers};
}
const point=(w,x=0,y=0)=>w.target.localToWorld(new THREE.Vector3(x,y,w.target.frontZ));
const startOf=w=>point(w,w.kind==='contour'?w.pane.w/2-.005:0);
const close=(actual,expected)=>assert.ok(actual.distanceTo(expected)<1e-7,`${actual.toArray()} != ${expected.toArray()}`);
test('flat visible bottom capsule first ray acquisition moves only its window on the captured front plane',()=>{
  const {view,aim}=rig(),w=view.windows.flat;
  try{const start=point(w),pose=w.position.clone(),delta=new THREE.Vector3(.04,.025,0);
    aim(start,false);close(w.position,pose);aim(start,true);aim(start.clone().add(delta),true);
    close(w.position,pose.clone().add(delta));close(view.windows.contour.position,view.windows.contour.initialPosition);
    aim(start.clone().add(delta),true);close(w.position,pose.clone().add(delta));
    aim(start,false);assert.equal(w.owner,null);close(w.position,pose.clone().add(delta));
  }finally{view.dispose();}
});

test('the capsule curved end is drawn and acquirable, its empty bounding-box corner and pane are not',()=>{
  const {view,aim,input}=rig(),w=view.windows.flat,h=w.target;
  try {
    const start=point(w,h.w/2-.001,0),pose=w.position.clone();
    aim(start,true);aim(start.clone().add(new THREE.Vector3(.02,0,0)),true);close(w.position,pose.clone().add(new THREE.Vector3(.02,0,0)));
    aim(start,false);
    for(const p of [point(w,h.w/2-.0001,h.h/2-.0001),w.localToWorld(new THREE.Vector3(0,0,w.pane.t)),w.localToWorld(new THREE.Vector3(.07,0,w.pane.t))]) {
      const before=w.position.clone();aim(p,true);aim(p.clone().add(new THREE.Vector3(.02,0,0)),true);close(w.position,before);assert.equal(w.owner,null);aim(p,false);
    }
    h.body.geometry.computeBoundingBox();const size=h.body.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(h.getWorldScale(new THREE.Vector3()));
    close(size,new THREE.Vector3(.08,.022,.003));
    const items=input.collect().items;assert.equal(items.length,3);assert.ok(items.every(i=>i===view.resetControl||Object.values(view.windows).some(w=>w.target===i)));
  }finally{view.dispose();}
});

test('Reset cancels an active public capture, restores both poses, and rejects the same held gesture',()=>{
  const {view,aim}=rig(),w=view.windows.flat;
  try {
    const start=point(w);aim(start,true);aim(start.clone().add(new THREE.Vector3(.03,.02,0)),true);
    view.resetPositions();close(w.position,w.initialPosition);assert.equal(w.owner,null);
    aim(start.clone().add(new THREE.Vector3(.04,.02,0)),true);close(w.position,w.initialPosition);
    aim(start,false);aim(start,true);aim(start.clone().add(new THREE.Vector3(.02,0,0)),true);close(w.position,w.initialPosition.clone().add(new THREE.Vector3(.02,0,0)));
  }finally{view.dispose();}
});

for(const kind of ['flat','contour'])test(`${kind} semantic release outside every target rearms after loss even between frames`,()=>{
  const {view,input,scene,renderer}=rig(),w=view.windows[kind],src=input.xr[0];
  try {
    view.resetControl.visible=false;renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
    const frame=p=>{src.ray.position.copy(p).add(new THREE.Vector3(0,0,.4));src.grip.position.copy(src.ray.position);scene.updateMatrixWorld(true);input.update();view.update(1/60);scene.updateMatrixWorld(true);};
    const start=startOf(w);frame(start);src.ray.dispatchEvent({type:'selectstart'});frame(start);assert.equal(w.owner?.id,src.id);
    frame(start.clone().add(new THREE.Vector3(.02,.01,0)));const last=w.position.clone();
    src.ray.visible=false;frame(start);assert.equal(w.owner,null);close(w.position,last);
    src.ray.visible=true;frame(start);assert.equal(w.owner,null);
    src.ray.dispatchEvent({type:'selectend'});src.ray.dispatchEvent({type:'selectstart'});
    const next=startOf(w);frame(next);frame(next.clone().add(new THREE.Vector3(.02,0,0)));
    close(w.position,last.clone().add(new THREE.Vector3(.02,0,0)));
  }finally{view.dispose();}
});

for(const kind of ['flat','contour'])test(`${kind} near semantic motion includes depth with no transform feedback under a rotated/scaled parent`,()=>{
  const {view,input,scene}=rig(),w=view.windows[kind],src={id:'hand',selecting:false};
  try {
    view.position.set(.1,.2,-.3);view.rotation.set(.13,.24,.1);view.scale.setScalar(1.2);scene.updateMatrixWorld(true);
    const start=startOf(w),before=w.getWorldPosition(new THREE.Vector3()),rotation=w.getWorldQuaternion(new THREE.Quaternion()),scale=w.getWorldScale(new THREE.Vector3()),delta=new THREE.Vector3(.035,.02,.09);
    const step=(p,down)=>{src.selecting=down;scene.updateMatrixWorld(true);input.pokeStep(src,p,input.collect().items,.008);view.update(1/60);scene.updateMatrixWorld(true);};
    step(start,false);assert.equal(w.owner,null);step(start,true);assert.equal(w.owner?.id,src.id);step(start.clone().add(delta),true);
    close(w.getWorldPosition(new THREE.Vector3()),before.clone().add(delta));step(start.clone().add(delta),true);close(w.getWorldPosition(new THREE.Vector3()),before.clone().add(delta));
    close(w.getWorldScale(new THREE.Vector3()),scale);assert.ok(w.getWorldQuaternion(new THREE.Quaternion()).angleTo(rotation)<1e-7);
    const last=w.position.clone();step(start.clone().add(new THREE.Vector3(.2,.2,.2)),false);close(w.position,last);assert.equal(w.owner,null);
  }finally{view.dispose();}
});

for(const kind of ['flat','contour'])test(`${kind} far capture stays in the initial plane as a controller approaches`,()=>{
  const {view,input,scene,renderer}=rig(),w=view.windows[kind],src=input.xr[0];
  try {
    view.resetControl.visible=false;renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
    const start=startOf(w),before=w.position.clone();
    const step=(p,near=false)=>{src.ray.position.copy(p).add(new THREE.Vector3(0,0,.4));src.grip.position.copy(p).add(new THREE.Vector3(0,0,near?.008:.4));scene.updateMatrixWorld(true);input.update();view.update(1/60);};
    step(start);src.ray.dispatchEvent({type:'selectstart'});step(start);step(start.clone().add(new THREE.Vector3(.035,.02,.1)),true);
    close(w.position,before.clone().add(new THREE.Vector3(.035,.02,0)));assert.equal(w.owner?.kind,'ray');
  }finally{view.dispose();}
});

for(const kind of ['flat','contour'])for(const quick of [false,true])test(`${kind} native installed Three pinch acquires and rearms after loss; between-frame release=${quick}`,()=>{
  const {view,input,scene,controllers}=rig(true),w=view.windows[kind],controller=controllers[0],src=input.xr[0];
  try {
    view.resetControl.visible=false;
    const spaces=['index-finger-tip','thumb-tip'].map(jointName=>({jointName})),source={hand:new Map(spaces.map(s=>[s.jointName,s])),handedness:'right',targetRaySpace:{}};controller.connect(source);
    const step=(world,{gap=.01,missing=null,semantic=[],flush=true}={})=>{
      const positions={'index-finger-tip':world,'thumb-tip':world.clone().add(new THREE.Vector3(gap,0,0))};
      controller.update(source,{session:{visibilityState:'visible'},getJointPose:s=>s.jointName===missing?null:{radius:.008,transform:{matrix:new THREE.Matrix4().makeTranslation(...positions[s.jointName].toArray()).toArray()}},getPose:s=>s===source.targetRaySpace?{transform:{matrix:new THREE.Matrix4().makeTranslation(10,10,1).toArray()}}:null},{});
      for(const type of semantic)controller.dispatchEvent({type,data:source});if(!flush)return;scene.updateMatrixWorld(true);input.update();view.update(1/60);scene.updateMatrixWorld(true);
    };
    const start=startOf(w),initial=w.position.clone(),delta=new THREE.Vector3(.03,.02,.35);
    step(start);assert.equal(w.owner?.id,src.id,'no prior hover or injected grab');step(start.clone().add(delta));close(w.position,initial.clone().add(delta));assert.equal(w.owner?.kind,'poke');
    // Late semantic event cannot restart an already held native gesture.
    step(start.clone().add(delta),{semantic:['selectstart']});close(w.position,initial.clone().add(delta));
    step(start.clone().add(delta),{semantic:['selectend']});assert.equal(w.owner?.id,src.id,'native remains held');
    step(start.clone().add(delta),{missing:'thumb-tip'});assert.equal(w.owner,null);const last=w.position.clone();
    step(start.clone().add(delta));assert.equal(w.owner,null);close(w.position,last);
    step(start.clone().add(delta),{gap:.04,flush:!quick});step(startOf(w));assert.equal(w.owner?.id,src.id);
    const at=startOf(w),next=new THREE.Vector3(.01,0,.01);step(at.clone().add(next));close(w.position,last.clone().add(next));
    step(at.clone().add(next),{gap:.04});assert.equal(w.owner,null);
  }finally{view.dispose();}
});

test('first owner survives competitors; one source cannot own both; actual loss does not transfer ownership',()=>{
  const {view,ray,frame,aim}=rig(),a=view.windows.flat,b=view.windows.contour,first={id:'a',state:{}},second={id:'b',state:{}};
  try {
    const start=startOf(a),peer=startOf(b);ray(start,true,first);frame();assert.equal(a.owner?.id,first.id);
    ray(start,true,second);ray(start.clone().add(new THREE.Vector3(.02,0,0)),true,first);frame();assert.equal(a.owner?.id,first.id);
    const last=a.position.clone();ray(peer,true,first);frame();assert.equal(b.owner,null,'retained source stays with first target');
    frame();assert.equal(a.owner,null);const ended=a.position.clone();aim(startOf(a),true,second);close(a.position,ended);assert.equal(a.owner,null);
    view.resetPositions();aim(startOf(a),false,second);aim(startOf(a),true,second);assert.equal(a.owner?.id,second.id);assert.ok(last.x>-.23);
  }finally{view.dispose();}
});

test('disabled, rear, content, top and corner regions cannot acquire movement',()=>{
  const {view,aim,ray,input,frame,source}=rig(),w=view.windows.contour;
  try {
    for(const p of [point(w,0,0),point(w,0,w.pane.h/2-.005),point(w,w.pane.w/2+.006,-w.pane.h/2-.006)]){aim(p,true);assert.equal(w.owner,null);aim(p,false);}
    const start=startOf(w);w.target.enabled=false;aim(start,true);assert.equal(w.owner,null);aim(start,false);w.target.enabled=true;
    input.rayStep({id:'rear',state:{}},new THREE.Ray(start.clone().add(new THREE.Vector3(0,0,-.4)),new THREE.Vector3(0,0,1)),true,0,input.collect().items);frame();assert.equal(w.owner,null);
    ray(start,true);frame();assert.ok(w.owner);const last=w.position.clone();
    input.rayStep(source,new THREE.Ray(start.clone(),new THREE.Vector3(1,0,0)),true,0,input.collect().items);frame();assert.equal(w.owner,null);close(w.position,last);
  }finally{view.dispose();}
});

for(const reverse of [false,true])test(`equal-frame ray ownership uses explicit source-id tie break; reverse=${reverse}`,()=>{
  const {view,ray,frame}=rig(),w=view.windows.flat;
  try {
    const p=startOf(w),sources=[{id:'b',state:{}},{id:'a',state:{}}];if(reverse)sources.reverse();
    for(const s of sources)ray(p,true,s);frame();assert.equal(w.owner?.id,'a');
  }finally{view.dispose();}
});

test('desktop down at the drawn capsule needs no preceding hover frame',()=>{
  const {view,input,scene,renderer}=rig(),w=view.windows.flat;
  try {
    const camera=input.camera;camera.position.set(0,0,.7);camera.aspect=1.4;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const p=startOf(w).project(camera);renderer.domElement.getBoundingClientRect=()=>({left:0,top:0,width:1400,height:1000});renderer.domElement.setPointerCapture=()=>{};
    renderer.domElement.dispatchEvent({type:'pointerdown',clientX:(p.x+1)*700,clientY:(1-p.y)*500,pointerId:1});
    scene.updateMatrixWorld(true);input.update();view.update(1/60);assert.equal(w.owner?.id,'mouse');
    view.cancelInput();assert.equal(w.owner,null);const pose=w.position.clone();input.update();view.update(1/60);close(w.position,pose);assert.equal(w.owner,null);
  }finally{view.dispose();}
});

for(const key of ['flat','contour'])test(`${key} release-reset event and disposal leave no owner, queued movement, or live target`,()=>{
  const {view,aim,input}=rig(),w=view.windows[key];
  const p=startOf(w);aim(p,true);aim(p.clone().add(new THREE.Vector3(.02,0,0)),true);const last=w.position.clone();
  view.cancelInput();assert.equal(w.owner,null);close(w.position,last);view.update(1/60);close(w.position,last);
  view.dispose();view.dispose();assert.equal(input.collect().items.length,0);view.update(1/60);close(w.position,last);
});

for(const kind of ['flat','contour'])test(`${kind} disconnect/reconnect between frames cannot transfer the old near capture to a new source`,()=>{
  const {view,input,scene,renderer}=rig(),w=view.windows[kind],src=input.xr[0];
  try {
    view.resetControl.visible=false;renderer.xr.isPresenting=true;src.ray.dispatchEvent({type:'connected',data:{}});
    const frame=p=>{src.grip.position.copy(p);src.ray.position.set(10,10,1);scene.updateMatrixWorld(true);input.update();view.update(1/60);scene.updateMatrixWorld(true);};
    const start=startOf(w);frame(start);src.ray.dispatchEvent({type:'selectstart'});frame(start);assert.equal(w.owner?.id,src.id);const last=w.position.clone();
    src.ray.dispatchEvent({type:'disconnected'});src.ray.dispatchEvent({type:'connected',data:{}});src.ray.dispatchEvent({type:'selectstart'});
    frame(start.clone().add(new THREE.Vector3(.3,.2,.15)));assert.equal(w.owner,null);close(w.position,last);
    src.ray.dispatchEvent({type:'selectend'});src.ray.dispatchEvent({type:'selectstart'});frame(start);assert.equal(w.owner?.id,src.id,'fresh source can acquire at actual target');
  }finally{view.dispose();}
});

for(const side of [-1,1])test(`Contour original ${side<0?'left':'right'} actual pane skin starts movement`,()=>{
  const {view,aim}=rig(),w=view.windows.contour;
  try{const start=point(w,side*(w.pane.w/2-.005)),before=w.position.clone();aim(start,true);assert.ok(w.owner);aim(start.clone().add(new THREE.Vector3(.01,.01,0)),true);close(w.position,before.clone().add(new THREE.Vector3(.01,.01,0)));}
  finally{view.dispose();}
});

for(const kind of ['flat','contour'])test(`${kind} rotated front plane and local/world mapping preserve orientation, depth and hit position`,()=>{
  const {view,input,scene}=rig(),w=view.windows[kind],src={id:'tilted-ray',state:{}};
  try {
    view.rotation.set(.17,.32,.08);view.scale.setScalar(1.2);scene.updateMatrixWorld(true);
    const start=startOf(w),before=w.getWorldPosition(new THREE.Vector3()),q=w.getWorldQuaternion(new THREE.Quaternion()),normal=new THREE.Vector3(0,0,1).applyQuaternion(q),delta=new THREE.Vector3(.03,.015,0).applyQuaternion(q);
    const step=p=>{input.rayStep(src,new THREE.Ray(p.clone().addScaledVector(normal,.5),normal.clone().negate()),true,0,input.collect().items);view.update(1/60);scene.updateMatrixWorld(true);};
    step(start);assert.ok(w.owner);step(start.clone().add(delta));close(w.getWorldPosition(new THREE.Vector3()),before.clone().add(delta));
    step(start.clone().add(delta));close(w.getWorldPosition(new THREE.Vector3()),before.clone().add(delta));assert.ok(w.getWorldQuaternion(new THREE.Quaternion()).angleTo(q)<1e-7);
    close(startOf(w),start.clone().add(delta));
  }finally{view.dispose();}
});

test('a nonfinite near pose cancels without moving or allowing held recovery',()=>{
  const {view,input}=rig(),w=view.windows.flat,src={id:'finite-hand',selecting:true};
  try {
    const start=startOf(w);input.pokeStep(src,start,input.collect().items,.008);view.update(1/60);assert.ok(w.owner);const last=w.position.clone();
    input.pokeStep(src,new THREE.Vector3(NaN,0,0),input.collect().items,.008);view.update(1/60);assert.equal(w.owner,null);close(w.position,last);
    input.pokeStep(src,start,input.collect().items,.008);view.update(1/60);assert.equal(w.owner,null);close(w.position,last);
  }finally{view.dispose();}
});
