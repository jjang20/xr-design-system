import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import tokenJson from '../tokens.json';
import { createTokens, unlockAudio } from '../src/index.js';
import { setBackdrop, makeText } from '../src/core/look.js';
import { createOwnedDockInput } from './comparison/DockContentInput.js';
import { objectFontsReady } from '../src/core/objects.js';
import { DockContentComparison } from './comparison/DockContentComparison.js';

const status=document.getElementById('status'), xrButton=document.getElementById('xr'), resetButton=document.getElementById('reset');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.NeutralToneMapping;renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');document.body.prepend(renderer.domElement);
const scene=new THREE.Scene(), background=new THREE.Color(0x18212e);scene.background=background;
const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(room);scene.environment=env.texture;setBackdrop(env.texture);room.dispose();pmrem.dispose();
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.02,20);camera.position.set(0,1.6,0);camera.lookAt(0,1.5,-1.05);
await Promise.all([document.fonts.ready,objectFontsReady]);
const photoTexture=await new HDRLoader().loadAsync('./env/lebombo_1k.hdr');
const T=createTokens(tokenJson),input=createOwnedDockInput({T,renderer,scene,camera}),comparison=new DockContentComparison(T,input,{photoTexture});comparison.position.set(0,1.48,-1.05);scene.add(comparison);
const guidance=makeText('Choose an app to open its sample. Back closes only the content pane.\nNear: press the front surface. Far: point, then trigger/select and release.',{size:.012});guidance.position.set(0,-.44,0);comparison.add(guidance);
resetButton.onclick=()=>comparison.reset();
renderer.domElement.addEventListener('pointerdown',unlockAudio);
const textReady=[];
comparison.traverse(o=>{if(o instanceof Text)textReady.push(new Promise(resolve=>{const ready=()=>{if(o.textRenderInfo?.parameters.text!==o.text)return;o.removeEventListener('synccomplete',ready);resolve();};o.addEventListener('synccomplete',ready);o.sync();ready();}));});
await Promise.all(textReady);comparison.update(0);status.textContent='';
let disposed=false,placeInXR=false,placedInXR=false,disposePromise,resolveDisposal;
let activeSession=null,requestPending=false,sessionFailed=false,released=false;
const finishDisposal=()=>{
 if(!disposed||released||requestPending||activeSession)return;
 released=true;xrButton.disabled=true;xrButton.onclick=null;
 comparison.dispose();setBackdrop(null);env.dispose();photoTexture.dispose();renderer.dispose();renderer.domElement.remove();resolveDisposal();
};
const observeSession=session=>{
 activeSession=session;
 const visibility=()=>{if(!disposed&&session.visibilityState!=='visible')comparison.cancelInput();};
 const ended=()=>{
  session.removeEventListener('visibilitychange',visibility);
  if(activeSession===session)activeSession=null;
  if(!disposed){scene.background=background;setBackdrop(env.texture);comparison.cancelInput();placeInXR=false;sessionFailed=false;xrButton.textContent='XR 열기';}
  // WebXRManager's end listener must finish before its resources are released.
  queueMicrotask(finishDisposal);
 };
 session.addEventListener('visibilitychange',visibility);session.addEventListener('end',ended,{once:true});
};
const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};addEventListener('resize',resize);
const timer=new THREE.Timer();renderer.setAnimationLoop((time,frame)=>{
 timer.update(time);
 if(placeInXR&&frame){const pose=frame.getViewerPose(renderer.xr.getReferenceSpace());if(pose){const head=new THREE.Matrix4().fromArray(pose.transform.matrix),origin=new THREE.Vector3().setFromMatrixPosition(head),forward=new THREE.Vector3(0,0,-1).transformDirection(head),yaw=Math.atan2(-forward.x,-forward.z);comparison.position.copy(new THREE.Vector3(0,-.12,-1.05).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(origin));comparison.rotation.set(0,yaw,0);comparison.cancelInput();placeInXR=false;placedInXR=true;}}
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);if(sessionFailed||(renderer.xr.getSession()&&renderer.xr.getSession().visibilityState!=='visible'))comparison.cancelInput();else{input.update();comparison.update(Math.min(timer.getDelta(),.05));}renderer.render(scene,camera);
});
const xr=navigator.xr;
const mode=xr&&await xr.isSessionSupported('immersive-ar').catch(()=>false)?'immersive-ar':xr&&await xr.isSessionSupported('immersive-vr').catch(()=>false)?'immersive-vr':null;
xrButton.disabled=!mode;xrButton.textContent=mode?'XR 열기':'XR 기기에서 열기';
xrButton.onclick=async()=>{
 // Only this explicit user action requests native session termination.
 if(activeSession){xrButton.disabled=true;try{await activeSession.end();}catch(error){status.textContent=`XR 종료 미확인: ${error.message}`;}finally{xrButton.disabled=disposed&&!activeSession;}return;}
 if(disposed||requestPending)return;xrButton.disabled=true;requestPending=true;sessionFailed=false;
 try{unlockAudio();const session=await xr.requestSession(mode,{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking']});observeSession(session);
  if(disposed){status.textContent='정리가 대기 중입니다. XR 종료 버튼 또는 기기의 정상 종료를 사용해 주세요.';return;}
  await renderer.xr.setSession(session);if(disposed||activeSession!==session)return;
  scene.background=mode==='immersive-ar'?null:background;setBackdrop(mode==='immersive-ar'?null:env.texture);placeInXR=!placedInXR;
 }catch(error){sessionFailed=!!activeSession;if(!disposed)comparison.cancelInput();status.textContent=`XR을 열 수 없습니다: ${error.message}${activeSession?' · XR 종료 버튼 또는 기기의 정상 종료를 사용해 주세요.':''}`;}
 finally{requestPending=false;xrButton.textContent=activeSession?'XR 종료':'XR 열기';xrButton.disabled=disposed&&!activeSession;finishDisposal();}
};
window.dockContentComparison={comparison,input,scene,camera,renderer,
 screenOf(object,point=new THREE.Vector3()){const p=object.localToWorld(point.clone()).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},
 dispose(){if(disposed)return disposePromise;disposed=true;disposePromise=new Promise(resolve=>{resolveDisposal=resolve;});renderer.setAnimationLoop(null);xrButton.disabled=!activeSession;resetButton.disabled=true;resetButton.onclick=null;removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);removeEventListener('blur',blur);removeEventListener('pagehide',pagehide);renderer.domElement.removeEventListener('pointerdown',unlockAudio);comparison.cancelInput();comparison.router.dispose();input.dispose();
 if(activeSession||requestPending)status.textContent='정리가 대기 중입니다. XR 종료 버튼 또는 기기의 정상 종료를 사용해 주세요.';
 finishDisposal();return disposePromise;}
};
const visibility=()=>{if(document.hidden)comparison.cancelInput();},blur=()=>comparison.cancelInput();
const pagehide=event=>{comparison.cancelInput();if(!event.persisted)window.dockContentComparison.dispose();};
document.addEventListener('visibilitychange',visibility);addEventListener('blur',blur);addEventListener('pagehide',pagehide);
