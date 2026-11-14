import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import tokenJson from '../tokens.json';
import { createTokens, InputSystem, unlockAudio } from '../src/index.js';
import { setBackdrop, makeText } from '../src/core/look.js';
import { ActionComparison } from './comparison/ActionComparison.js';

const status=document.getElementById('status'), xrButton=document.getElementById('xr'), resetButton=document.getElementById('reset');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.NeutralToneMapping;renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');document.body.prepend(renderer.domElement);
const scene=new THREE.Scene(), background=new THREE.Color(0x18212e);scene.background=background;
const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(room);scene.environment=env.texture;setBackdrop(env.texture);room.dispose();pmrem.dispose();
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.02,20);camera.position.set(0,1.6,0);camera.lookAt(0,1.48,-.6);
await document.fonts.ready;
const T=createTokens(tokenJson),input=new InputSystem({T,renderer,scene,camera}),comparison=new ActionComparison(T,input);comparison.position.set(0,1.48,-.6);scene.add(comparison);
const guidance=makeText('Test actions only. Touch the face nearby; point + trigger/pinch at a distance.',{size:.011});
guidance.position.set(0,-.285,0);comparison.add(guidance);
resetButton.onclick=()=>comparison.reset();
renderer.domElement.addEventListener('pointerdown',unlockAudio);
const textReady=[];
comparison.traverse(o=>{if(o instanceof Text)textReady.push(new Promise(resolve=>{const ready=()=>{if(o.textRenderInfo?.parameters.text!==o.text)return;o.removeEventListener('synccomplete',ready);resolve();};o.addEventListener('synccomplete',ready);o.sync();ready();}));});
await Promise.all(textReady);comparison.update(0);status.textContent='';
let disposed=false,placeInXR=false,disposePromise;
const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};addEventListener('resize',resize);
const timer=new THREE.Timer();renderer.setAnimationLoop((time,frame)=>{
 timer.update(time);
 if(placeInXR&&frame){const pose=frame.getViewerPose(renderer.xr.getReferenceSpace());if(pose){const head=new THREE.Matrix4().fromArray(pose.transform.matrix),origin=new THREE.Vector3().setFromMatrixPosition(head),forward=new THREE.Vector3(0,0,-1).transformDirection(head),yaw=Math.atan2(-forward.x,-forward.z);comparison.position.copy(new THREE.Vector3(0,-.12,-.6).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(origin));comparison.rotation.set(0,yaw,0);comparison.cancelInput();placeInXR=false;}}
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);if(renderer.xr.getSession() && renderer.xr.getSession().visibilityState!=='visible')comparison.cancelInput();else{input.update();comparison.update(Math.min(timer.getDelta(),.05));}renderer.render(scene,camera);
});
const xr=navigator.xr;
const mode=xr&&await xr.isSessionSupported('immersive-ar').catch(()=>false)?'immersive-ar':xr&&await xr.isSessionSupported('immersive-vr').catch(()=>false)?'immersive-vr':null;
xrButton.disabled=!mode;xrButton.textContent=mode?'XR 열기':'XR 기기에서 열기';
xrButton.onclick=async()=>{
 if(disposed)return;if(renderer.xr.getSession()){await renderer.xr.getSession().end();return;}xrButton.disabled=true;let session;
 try{unlockAudio();session=await xr.requestSession(mode,{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking']});if(disposed){await session.end();return;}
 session.addEventListener('visibilitychange',()=>{if(session.visibilityState!=='visible')comparison.cancelInput();});
 session.addEventListener('end',()=>{if(disposed)return;scene.background=background;setBackdrop(env.texture);input.reset();comparison.cancelInput();comparison.position.set(0,1.48,-.6);comparison.rotation.set(0,0,0);placeInXR=false;xrButton.textContent='XR 열기';},{once:true});
 await renderer.xr.setSession(session);if(disposed){await session.end();return;}scene.background=mode==='immersive-ar'?null:background;setBackdrop(mode==='immersive-ar'?null:env.texture);placeInXR=true;xrButton.textContent='XR 종료';
 }catch(error){await session?.end().catch(()=>{});comparison.cancelInput();status.textContent=`XR을 열 수 없습니다: ${error.message}`;}finally{xrButton.disabled=disposed;}
};
window.actionComparison={comparison,input,scene,camera,renderer,
 screenOf(object,point=new THREE.Vector3()){const p=object.localToWorld(point.clone()).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},
 dispose(){if(disposed)return disposePromise;disposed=true;renderer.setAnimationLoop(null);xrButton.disabled=true;resetButton.disabled=true;xrButton.onclick=resetButton.onclick=null;removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('pointerdown',unlockAudio);comparison.cancelInput();
 const release=()=>{comparison.dispose();for(const s of input.xr){s.line.geometry.dispose();s.line.material.dispose();}setBackdrop(null);env.dispose();renderer.dispose();renderer.domElement.remove();};
 const session=renderer.xr.getSession();if(session)disposePromise=session.end().catch(error=>{status.textContent=`XR 종료 미확인: ${error.message}`;}).finally(release);else{release();disposePromise=Promise.resolve();}return disposePromise;}
};
const visibility=()=>{if(document.hidden)comparison.cancelInput();};document.addEventListener('visibilitychange',visibility);
addEventListener('pagehide',event=>{comparison.cancelInput();if(!event.persisted)window.actionComparison.dispose();});
