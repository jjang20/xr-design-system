// R5 software hand fixtures through the product's real XR source/event path.
// Selecting is the WebXR select event, not a claim of measured hand tracking.
export const STATES = Object.freeze(['rest', 'side-hover', 'side-held', 'side-released-hover', 'side-released-rest', 'corner-hover', 'corner-held', 'corner-released-hover', 'corner-released-rest']);
export const NEGATIVES = Object.freeze(['title-pinch', 'index-contact-only', 'tracking-loss', 'reset-cancel', 'one-owner']);

function requireValue(ok, message) { if (!ok) throw Error(message); }
export function createHarness({THREE, InputSystem, contour:c, contract}) {
  const p=c.panel,l=p?.levels[0],anchor=new THREE.Vector3(...contract.capture.fixedAnchorWorldM);
  requireValue(p && p.levels.length===1 && !p.closing.length && l.moves.length===2 && l.corners.length===2,'Expected one R5 Catalog root with four controls');
  requireValue(new URL(location.href).searchParams.has('manual'),'Manual simulation required');
  c.renderer.setAnimationLoop(null); c.tick(180);
  requireValue(Math.abs(p.distance-contract.capture.productConstructionDistanceM)<1e-12,'Construction distance changed');
  requireValue(Math.abs(p.scale.x-1.5)<1e-12 && Math.abs(l.panel.w*1.5-.216)<1e-9 && Math.abs(l.panel.h*1.5-.24615)<1e-9,'Initial R5 dimensions changed');
  p.position.copy(anchor);p.updateMatrixWorld(true);c.camera.updateMatrixWorld(true);
  const input=new InputSystem({T:p.T,camera:c.camera,scene:c.scene,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:()=>new THREE.Group(),getControllerGrip:()=>new THREE.Group(),getHand:()=>new THREE.Group()}}});
  const hands=input.xr.map(src=>{
    src.grip.visible=false;
    const index=new THREE.Group(),thumb=new THREE.Group();index.jointRadius=.008;thumb.jointRadius=.008;
    src.hand.add(index,thumb);src.hand.joints={'index-finger-tip':index,'thumb-tip':thumb};
    return {src,index,thumb,point:null};
  });
  const all=[...l.moves,...l.corners], trace=[];let frames=0;
  const name=h=>l.moves.includes(h)?'side-'+l.moves.indexOf(h):l.corners.includes(h)?'corner-'+l.corners.indexOf(h):h===l.panel?'title':null;
  const worldScale=h=>h.getWorldScale(new THREE.Vector3()).x;
  function setHand(i,point,pinch=false) {
    const h=hands[i];h.point=point?.clone()??null;
    if(point){if(!h.src.connected)h.src.ray.dispatchEvent({type:'connected'});h.index.position.copy(point);h.thumb.position.copy(point).add(new THREE.Vector3(pinch?.012:.05,0,0));}
    else if(h.src.connected)h.src.ray.dispatchEvent({type:'disconnected'});
    if(h.src.selecting!==pinch)h.src.ray.dispatchEvent({type:pinch?'selectstart':'selectend'});
  }
  const at=h=>h.localToWorld(new THREE.Vector3(0,h===l.panel?h.hitMeshes[0].position.y:0,h.t)).add(new THREE.Vector3(0,0,.020));
  function step(n=1){for(let i=0;i<n;i++){c.scene.updateMatrixWorld(true);input.update();p.update(1/60);p.updateMatrixWorld(true);frames++;}}
  function controls(){return all.map(h=>({id:name(h),rectangular:h.rectangular,enabled:h.enabled,hovered:h.hovered,held:!!h.grab,visible:h.visible&&h.affordance.visible&&h.body.visible,pressOwner:h.pressOwner??null,pressed:h.press.pressed,pressDepthM:h.press.depth,worldScale:worldScale(h),physicalDentM:h.skin.uDent.value.w*h.r*worldScale(h),dentLocalM:h.dent.x,glow:h.skin.uGlow.value,squash:h.skin.uSquash.value,arrowPresent:!!h.arrow,arrowVisible:!!h.arrow&&h.visible&&h.affordance.visible&&h.arrow.visible,arrowOffsetLocalM:h.arrow?.position.z??null,arrowVertices:h.arrow?.geometry.attributes.position.count??0,arrowMirrorX:h.arrow?.scale.x??null}));}
  function snapshot(){return {frame:frames,held:!!p.controls.held,owner:p.controls.held?.id??null,handle:name(p.controls.held?.handle),moved:!!p.controls.held?.moved,rootPositionUiM:p.position.clone().sub(anchor).toArray(),rootScale:p.scale.toArray(),manipulationOpacity:p.manipulationOpacity,sheetOpacity:l.panel.skin.uniforms.uOpacity.value,titleOpacity:l.title.fillOpacity,controls:controls(),sources:hands.map(h=>({id:h.src.id,connected:h.src.connected,pinch:h.src.selecting,indexWorldM:h.point?.toArray()??null,thumbWorldM:h.point?h.thumb.getWorldPosition(new THREE.Vector3()).toArray():null,indexRadiusM:h.index.jointRadius,resetBlocked:!!h.src.resetBlocked}))};}
  const note=label=>trace.push({label,...snapshot()});
  function stable(){
    step(240);const samples=[];
    for(let i=0;i<3;i++){step();const s=snapshot();delete s.frame;const numbers=[...p.matrixWorld.elements,...l.group.matrixWorld.elements,p.manipulationOpacity,l.panel.skin.uniforms.uOpacity.value,l.title.fillOpacity];for(const h of all)numbers.push(...h.body.matrixWorld.elements,...h.skin.uDent.value.toArray(),h.skin.uGlow.value,h.skin.uSquash.value,h.press.depth,h.dent.v,h.arrow?.position.z??0);samples.push({numbers,flags:JSON.stringify(s,(_k,v)=>typeof v==='number'?undefined:v)});}
    const delta=Math.max(0,...samples.slice(1).flatMap(s=>s.numbers.map((v,i)=>Math.abs(v-samples[0].numbers[i]))));
    requireValue(delta<=1e-9 && samples.every(s=>s.flags===samples[0].flags),'R5 state did not stabilize');
    return {successiveStableFrames:3,maxStableDelta:delta};
  }
  function assertRoot(){requireValue(p.levels.length===1&&!p.closing.length&&!p.palmPush,'Unexpected Catalog navigation/palm push');requireValue(l.rows.every(r=>!r.press.pressed),'Controls fixture pressed a row');}
  return {THREE,c,p,l,anchor,input,hands,trace,all,name,worldScale,setHand,at,step,controls,snapshot,note,stable,assertRoot};
}

export function applyControlsFixture(options){
  const {state}=options;requireValue(STATES.includes(state),'Unsupported R5 controls state: '+state);
  const h=createHarness(options),{p,l,THREE}=h;h.note('initialized');
  const target=state.startsWith('side-')?l.moves[1]:state.startsWith('corner-')?l.corners[1]:null;
  if(target){
    h.setHand(0,h.at(target));h.step(60);h.note('hover');
    requireValue(target.hovered&&!p.controls.held&&!target.press.pressed,'Hover target/arbitration failed');
    if(!state.endsWith('-hover')||state.includes('-released-')){
      h.setHand(0,h.hands[0].point,true);h.step();h.note('capture');
      requireValue(p.controls.held?.handle===target&&p.controls.held.id===h.hands[0].src.id,'Real input did not capture requested handle');
      const point=h.hands[0].point.clone();
      if(state.startsWith('side-'))point.add(new THREE.Vector3(.012,.006,0));
      else point.addScaledVector(p.controls.held.axis,p.controls.held.extent*-.05);
      h.setHand(0,point,true);h.step(120);h.note('manipulated');
      requireValue(p.controls.held?.moved,'Manipulation did not cross drag slop');
      if(state.includes('-released-')){
        h.setHand(0,point,false);h.step();h.note('release');
        requireValue(!p.controls.held&&!target.grab&&target.hovered,'Release did not preserve hover');
        if(state.endsWith('-rest')){h.setHand(0,null);h.step();h.note('withdrawal');}
      }
    }
  }
  const stability=h.stable();h.note('stable');h.assertRoot();
  const held=state.endsWith('-held'),hovered=state!=='rest'&&!state.endsWith('-rest'),manipulated=state.includes('-held')||state.includes('-released-');
  requireValue(!!p.controls.held===held&&(!target||target.hovered===hovered),'Final capture/hover mismatch');
  const scale=state.startsWith('corner-')&&manipulated?1.425:1.5;
  requireValue(p.scale.toArray().every(v=>Math.abs(v-scale)<1e-9),'Resize scale mismatch');
  const position=state.startsWith('side-')&&manipulated?[.012,.006,0]:[0,0,0];
  requireValue(p.position.clone().sub(h.anchor).toArray().every((v,i)=>Math.abs(v-position[i])<1e-9),'Move pose mismatch');
  const targetEvidence=h.controls().find(v=>v.id===h.name(target));
  requireValue(h.controls().every(v=>v.visible===(hovered&&v.id===h.name(target))),'Rest/hover/held visibility mismatch');
  if(targetEvidence){requireValue(Math.abs(targetEvidence.physicalDentM-(held?.0015:0))<1e-9,'Physical held dent mismatch');requireValue(Math.abs(targetEvidence.glow-(held?.8:hovered?.12:0))<1e-9,'Glow mismatch');requireValue(!targetEvidence.pressed,'Pinch fixture became physical press');}
  requireValue(Math.abs(l.panel.skin.uniforms.uOpacity.value-(held?.9:1))<1e-9&&Math.abs(l.title.fillOpacity-1)<1e-9,'Sheet/title opacity mismatch');
  requireValue(l.corners.every(c=>c.arrow&&c.arrow.geometry.attributes.position.count===10),'Restored resize arrow missing');
  return {verified:true,state,inputPath:'WebXR source select events -> InputSystem.update -> pokeStep -> WindowControls -> BubbleHandle',inputKind:'synthetic XR hand with index/thumb joints',hardwareTrackingVerified:false,thumbIndexPinchRecognizerVerified:false,rayPathVerified:false,held,hovered,manipulated,handle:target?h.name(target):null,...stability,trace:h.trace,final:h.snapshot(),geometrySupport:{actualBrowserShader:true,rawGeometryEqualsEvaluatedSurface:false,normalizedBlenderExportSupported:false,reason:'BubbleHandle planar/spherical GLSL dent and squash are evaluated in product WebGL; raw BufferGeometry is not exported as the evaluated surface.'}};
}

export function runControlNegative(options){
  const {scenario}=options;requireValue(NEGATIVES.includes(scenario),'Unknown negative scenario');
  const h=createHarness(options),{p,l,THREE}=h,side=l.moves[1];h.note('initialized');
  const assertNoHold=message=>requireValue(!p.controls.held&&h.all.every(x=>!x.grab),message);
  if(scenario==='title-pinch'){
    const point=h.at(l.panel);h.setHand(0,point);h.step(60);
    const titleLocal=l.panel.worldToLocal(point.clone()),collected=h.input.collect().items;
    requireValue(l.panel.inside(titleLocal)&&Math.abs(l.panel.pokeDistance(titleLocal)-.020)<1e-9,'Title probe missed actual title geometry');
    requireValue(!l.panel.enabled&&!collected.includes(l.panel)&&!l.panel.hovered,'Root title must remain a noninteractive back target');
    requireValue(h.input.handPoints.some(v=>v.distanceTo(point)<1e-9),'Actual InputSystem did not process tracked title probe');
    h.trace.push({label:'title-region-targeted',titleLocalM:titleLocal.toArray(),insideActualTitle:true,titleEnabled:l.panel.enabled,titleIncludedInInputItems:collected.includes(l.panel),trackedByActualInput:true});
    h.setHand(0,point,true);h.step();h.note('title-pinch');
    h.setHand(0,point.clone().add(new THREE.Vector3(.020,.010,0)),true);h.step(120);h.note('title-drag-attempt');assertNoHold('Title unexpectedly captured manipulation');
    requireValue(p.position.distanceTo(h.anchor)<1e-12&&p.scale.x===1.5,'Title drag changed pose');
  }else if(scenario==='index-contact-only'){
    const point=h.at(side);h.setHand(0,point);h.step(60);
    const contact=side.localToWorld(new THREE.Vector3(0,0,side.t)).add(new THREE.Vector3(0,0,.005));
    for(let i=1;i<=20;i++){h.setHand(0,point.clone().lerp(contact,i/20));h.step();}
    h.step(60);h.note('physical-contact');assertNoHold('Index contact captured manipulation');
    requireValue(side.press.pressed&&side.pressOwner===h.hands[0].src.id&&side.skin.uGlow.value===.8&&side.dent.x>0,'Contact feedback was not actually established');
    const pose=p.position.clone();h.setHand(0,contact.clone().add(new THREE.Vector3(.012,.006,0)));h.step(60);h.note('index-drag-attempt');assertNoHold('Index drag captured manipulation');requireValue(p.position.distanceTo(pose)<1e-12,'Index contact moved stack');
  }else{
    h.setHand(0,h.at(side));h.step(60);h.setHand(0,h.hands[0].point,true);h.step();
    h.setHand(0,h.hands[0].point.clone().add(new THREE.Vector3(.012,.006,0)),true);h.step(60);h.note('owner-captured');
    requireValue(p.controls.held?.id===h.hands[0].src.id&&p.controls.held.moved,'Initial owner capture failed');
    if(scenario==='one-owner'){
      h.setHand(1,h.at(l.moves[0]),true);h.step(60);h.note('other-hand-opposite');
      requireValue(p.controls.held?.id===h.hands[0].src.id&&h.all.filter(x=>x.grab).length===1,'Second hand stole manipulation');
      h.setHand(1,h.hands[0].point,true);h.step(60);h.note('other-hand-same');requireValue(p.controls.held?.id===h.hands[0].src.id,'Second hand stole same handle');
      h.setHand(1,null);h.setHand(0,h.hands[0].point,false);h.step();assertNoHold('Owner release did not release');h.note('owner-release');
    }else if(scenario==='tracking-loss'){
      h.setHand(0,null);h.step();h.note('source-disconnected');assertNoHold('Tracking loss retained capture');
    }else{
      h.input.reset();p.resetInteraction();h.step(30);h.note('reference-reset-held');assertNoHold('Held pinch recaptured across reset');requireValue(h.hands[0].src.resetBlocked,'Held source not blocked across reset');
      h.setHand(0,h.hands[0].point,false);h.step();h.note('reset-release');requireValue(!h.hands[0].src.resetBlocked,'Reset block did not clear on release');
      h.setHand(0,h.at(side),true);h.step();h.note('fresh-pinch');requireValue(p.controls.held?.id===h.hands[0].src.id,'Fresh post-reset pinch failed');
      h.setHand(0,null);h.step();assertNoHold('Cleanup tracking loss retained capture');
    }
  }
  h.assertRoot();return {verified:true,scenario,trace:h.trace,final:h.snapshot(),hardwareTrackingVerified:false};
}
