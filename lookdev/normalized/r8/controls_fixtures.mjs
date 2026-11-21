// R8 software hand fixtures through the product's real XR source/event path.
// Selecting is the WebXR select event, not a claim of measured hand tracking.
export const STATES = Object.freeze(['rest', 'side-hover', 'side-held', 'side-released-hover', 'side-released-rest', 'corner-hover', 'corner-held', 'corner-released-hover', 'corner-released-rest']);
export const NEGATIVES = Object.freeze(['title-pinch', 'index-contact-only', 'tracking-loss', 'reset-cancel', 'one-owner']);

function requireValue(ok, message) { if (!ok) throw Error(message); }
export function createHarness({THREE, InputSystem, contour:c, contract}) {
  const p=c.panel,l=p?.levels[0],anchor=new THREE.Vector3(...contract.capture.fixedAnchorWorldM);
  requireValue(contract.r8?.controls?.heldPhysicalDentM===.0015,'R8 held dent must be physical/world metres');
  requireValue(p && p.levels.length===1 && !p.closing.length && l.moves.length===2 && l.corners.length===2,'Expected one R8 Catalog root with four controls');
  requireValue(new URL(location.href).searchParams.has('manual'),'Manual simulation required');
  c.renderer.setAnimationLoop(null); c.tick(180);
  requireValue(Math.abs(p.distance-contract.capture.productConstructionDistanceM)<1e-12,'Construction distance changed');
  requireValue(Math.abs(p.scale.x-1.5)<1e-12 && Math.abs(l.panel.w*1.5-.216)<1e-9 && Math.abs(l.panel.h*1.5-.24615)<1e-9,'Initial R8 dimensions changed');
  p.position.copy(anchor);p.updateMatrixWorld(true);c.camera.updateMatrixWorld(true);
  requireValue(Math.abs(l.panel.t-.004)<1e-12&&Math.abs(l.panel.frontZ-.004)<1e-12&&Math.abs(l.panel.skin.uniforms.uThick.value-.004)<1e-12,'R8 pane geometry/hit/optical thickness differs');
  requireValue(l.rows.every(r=>Math.abs(r.t-.004)<1e-12&&Math.abs(r.position.z-.004)<1e-12)&&[...l.moves,...l.corners].every(x=>Math.abs(x.position.z-.004)<1e-12),'Row/control front surface or unchanged row thickness differs');
  requireValue(Math.abs(l.panel.skin.uniforms.uFrontOpacity.value-.85)<1e-12&&Math.abs(l.panel.skin.uniforms.uBubbleOpacity.value-.995)<1e-12,'R8 pane-front/bubble alpha differs');
  const input=new InputSystem({T:p.T,camera:c.camera,scene:c.scene,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:()=>new THREE.Group(),getControllerGrip:()=>new THREE.Group(),getHand:()=>new THREE.Group()}}});
  const hands=input.xr.map(src=>{
    src.grip.visible=false;
    const index=new THREE.Group(),thumb=new THREE.Group();index.jointRadius=.008;thumb.jointRadius=.008;thumb.visible=false;
    src.hand.add(index,thumb);src.hand.joints={'index-finger-tip':index,'thumb-tip':thumb};
    return {src,index,thumb,point:null};
  });
  const all=[...l.moves,...l.corners], trace=[];let frames=0;
  const name=h=>l.moves.includes(h)?'side-'+l.moves.indexOf(h):l.corners.includes(h)?'corner-'+l.corners.indexOf(h):h===l.panel?'title':null;
  const worldScale=h=>h.getWorldScale(new THREE.Vector3()).x;
  function setHand(i,point,pinch=false) {
    const h=hands[i];h.point=point?.clone()??null;h.thumb.visible=!!point&&pinch;
    if(point){if(!h.src.connected)h.src.ray.dispatchEvent({type:'connected'});h.index.position.copy(point);h.thumb.position.copy(point).add(new THREE.Vector3(pinch?.012:.05,0,0));}
    else if(h.src.connected)h.src.ray.dispatchEvent({type:'disconnected'});
    if(h.src.selecting!==pinch)h.src.ray.dispatchEvent({type:pinch?'selectstart':'selectend'});
  }
  const at=h=>h.localToWorld(new THREE.Vector3(0,h===l.panel?h.hitMeshes[0].position.y:0,h.t)).add(new THREE.Vector3(0,0,.020));
  function step(n=1){for(let i=0;i<n;i++){c.scene.updateMatrixWorld(true);input.update();p.update(1/60);p.updateMatrixWorld(true);frames++;}}
  function controls(){return all.map(h=>({id:name(h),rectangular:h.rectangular,enabled:h.enabled,hovered:h.hovered,held:!!h.grab,visible:h.visible&&h.affordance.visible&&h.body.visible,pressOwner:h.pressOwner??null,pressed:h.press.pressed,pressDepthM:h.press.depth,worldScale:worldScale(h),physicalDentM:h.skin.uDent.value.w*h.r*worldScale(h),dentLocalM:h.dent.x,bodyOpacity:h.skin.uBodyOpacity.value,surfaceOpacity:h.skin.uOpacity.value,glow:h.skin.uGlow.value,squash:h.skin.uSquash.value,arrowPresent:!!h.arrow,arrowVisible:!!h.arrow&&h.visible&&h.affordance.visible&&h.arrow.visible,arrowOffsetLocalM:h.arrow?.position.z??null,arrowVertices:h.arrow?.geometry.attributes.position.count??0,arrowMirrorX:h.arrow?.scale.x??null,extraCount:h.skin.uExtraCount.value,extraDent:h.skin.uExtraDent.value.map(v=>v.toArray()),extraGlow:[...h.skin.uExtraGlow.value],contactDents:(h.contactDents??[]).map(v=>({id:v.id,x:v.x,y:v.y,z:v.z,depth:v.depth,glow:v.glow}))}));}
  function snapshot(){return {frame:frames,held:!!p.controls.held,owner:p.controls.held?.id??null,handle:name(p.controls.held?.handle),moved:!!p.controls.held?.moved,rootPositionUiM:p.position.clone().sub(anchor).toArray(),rootScale:p.scale.toArray(),manipulationOpacity:p.manipulationOpacity,sheetOpacity:l.panel.skin.uniforms.uOpacity.value,titleOpacity:l.title.fillOpacity,frontFaceOpacity:l.panel.skin.uniforms.uFrontOpacity.value,paneThicknessLocalM:l.panel.t,paneOpticalThicknessLocalM:l.panel.skin.uniforms.uThick.value,controls:controls(),sources:hands.map(h=>({id:h.src.id,connected:h.src.connected,pinch:h.src.selecting,indexWorldM:h.point?.toArray()??null,thumbWorldM:h.point?h.thumb.getWorldPosition(new THREE.Vector3()).toArray():null,indexRadiusM:h.index.jointRadius,thumbVisible:h.thumb.visible,resetBlocked:!!h.src.resetBlocked}))};}
  const note=label=>trace.push({label,...snapshot()});
  function stable(){
    step(240);const samples=[];
    for(let i=0;i<3;i++){step();const s=snapshot();delete s.frame;const numbers=[...p.matrixWorld.elements,...l.group.matrixWorld.elements,p.manipulationOpacity,l.panel.skin.uniforms.uOpacity.value,l.title.fillOpacity];for(const h of all)numbers.push(...h.body.matrixWorld.elements,...h.skin.uDent.value.toArray(),h.skin.uGlow.value,h.skin.uSquash.value,h.press.depth,h.dent.v,h.arrow?.position.z??0,h.skin.uExtraCount.value,...h.skin.uExtraDent.value.flatMap(v=>v.toArray()),...h.skin.uExtraGlow.value);samples.push({numbers,flags:JSON.stringify(s,(_k,v)=>typeof v==='number'?undefined:v)});}
    const delta=Math.max(0,...samples.slice(1).flatMap(s=>s.numbers.map((v,i)=>Math.abs(v-samples[0].numbers[i]))));
    requireValue(delta<=1e-9 && samples.every(s=>s.flags===samples[0].flags),'R8 state did not stabilize');
    return {successiveStableFrames:3,maxStableDelta:delta};
  }
  function assertRoot(){requireValue(p.levels.length===1&&!p.closing.length&&!p.palmPush,'Unexpected Catalog navigation/palm push');requireValue(l.rows.every(r=>!r.press.pressed),'Controls fixture pressed a row');}
  return {THREE,c,p,l,anchor,input,hands,trace,all,name,worldScale,setHand,at,step,controls,snapshot,note,stable,assertRoot};
}

export function applyControlsFixture(options){
  const {state}=options;requireValue(STATES.includes(state),'Unsupported R8 controls state: '+state);
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
  requireValue(h.controls().every(v=>v.bodyOpacity===.38&&Math.abs(v.surfaceOpacity-(held?options.contract.r8.controls.heldStackOpacity:1))<1e-9),'R8 control body/stack opacity changed');
  requireValue(h.controls().every(v=>Math.abs(v.physicalDentM-v.dentLocalM*v.worldScale)<1e-12),'Physical/local dent conversion mismatch');
  requireValue(h.controls().every(v=>v.visible===(hovered&&v.id===h.name(target))),'Rest/hover/held visibility mismatch');
  if(targetEvidence){requireValue(Math.abs(targetEvidence.physicalDentM-(held?options.contract.r8.controls.heldPhysicalDentM:0))<1e-9,'Physical held dent mismatch');requireValue(Math.abs(targetEvidence.glow-(held?.8:hovered?.12:0))<1e-9,'Glow mismatch');requireValue(!targetEvidence.pressed,'Pinch fixture became physical press');}
  requireValue(Math.abs(l.panel.skin.uniforms.uOpacity.value-(held?.9:1))<1e-9&&Math.abs(l.title.fillOpacity-1)<1e-9,'Sheet/title opacity mismatch');
  requireValue(l.corners.every(c=>c.arrow&&c.arrow.geometry.attributes.position.count===10),'Restored resize arrow missing');
  return {verified:true,state,inputPath:'WebXR source select events -> InputSystem.update -> pokeStep -> WindowControls -> BubbleHandle',inputKind:'synthetic XR hand with index/thumb joints',hardwareTrackingVerified:false,thumbIndexPinchRecognizerVerified:false,nonPinchThumbHiddenToIsolatePrimaryFixture:true,rayPathVerified:false,held,hovered,manipulated,handle:target?h.name(target):null,...stability,trace:h.trace,final:h.snapshot(),geometrySupport:{actualBrowserShader:true,rawGeometryEqualsEvaluatedSurface:false,normalizedBlenderExportSupported:false,reason:'BubbleHandle planar/spherical GLSL dent and squash are evaluated in product WebGL; raw BufferGeometry is not exported as the evaluated surface.'}};
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
  const recovery=h.stable();h.note('negative-stable');h.assertRoot();
  requireValue(h.controls().every(v=>v.bodyOpacity===.38&&Math.abs(v.surfaceOpacity-p.manipulationOpacity)<1e-9&&Math.abs(v.physicalDentM-v.dentLocalM*v.worldScale)<1e-12),'Negative opacity/dent contract mismatch');
  if(scenario==='tracking-loss'||scenario==='reset-cancel')requireValue(h.controls().every(v=>Math.abs(v.physicalDentM)<1e-9&&v.glow===0&&!v.visible),'Cancelled handle did not recover');
  return {verified:true,scenario,...recovery,trace:h.trace,final:h.snapshot(),hardwareTrackingVerified:false};
}

// Four existing hover/held observations only. These reversible counterfactuals
// demonstrate desktop shader contribution, not alpha equivalence or Quest visibility.
export function captureControlOptics({THREE,contour:c,look,state}) {
  if(!['side-hover','side-held','corner-hover','corner-held'].includes(state))return null;
  const p=c.panel,l=p.levels[0],h=state.startsWith('side-')?l.moves[1]:l.corners[1],r=c.renderer;
  requireValue(h.affordance.visible&&h.skin.uBodyOpacity.value===.38,'Expected actual visible R8 bubble');
  const gl=r.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,backdrop=look.backdropUniforms();
  const originalBeauty=c.pass('beauty'),rgbaTarget=new THREE.WebGLRenderTarget(width,height,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType});
  const saved={background:c.scene.background,environment:c.scene.environment,texture:backdrop.envMap.value,intensity:backdrop.uEnvIntensity.value,rotation:backdrop.uEnvRot.value.toArray(),color:r.getClearColor(new THREE.Color()).clone(),alpha:r.getClearAlpha(),target:r.getRenderTarget(),bodyOpacity:h.skin.uBodyOpacity.value};
  const drawn=[];c.scene.traverse(o=>{if(o.isMesh||o.isSprite||o.isLine||o.isPoints)drawn.push({o,visible:o.visible});});
  const uniforms=()=>JSON.stringify([l.panel.skin.uniforms.uOpacity.value,...[...l.moves,...l.corners].map(o=>({body:o.skin.uBodyOpacity.value,opacity:o.skin.uOpacity.value,dent:o.skin.uDent.value.toArray(),glow:o.skin.uGlow.value,squash:o.skin.uSquash.value,matrix:o.matrixWorld.toArray(),grab:o.grab?.id??null,hover:o.hovered,pressed:o.press.pressed}))]);
  const originalState=uniforms();
  function pixels(){r.setRenderTarget(rgbaTarget);r.render(c.scene,c.camera);const bytes=new Uint8Array(width*height*4);r.readRenderTargetPixels(rgbaTarget,0,0,width,height,bytes);return bytes;}
  function png(bytes){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height);for(let y=0;y<height;y++)image.data.set(bytes.subarray(y*width*4,(y+1)*width*4),(height-y-1)*width*4);ctx.putImageData(image,0,0);return canvas.toDataURL('image/png');}
  const bounds={min:[Infinity,Infinity],max:[-Infinity,-Infinity]};
  for(const m of h.body.children){const pos=m.geometry.attributes.position;for(let i=0;i<pos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(m.matrixWorld).project(c.camera),q=[(v.x+1)*width/2,(v.y+1)*height/2];for(let k=0;k<2;k++){bounds.min[k]=Math.min(bounds.min[k],q[k]);bounds.max[k]=Math.max(bounds.max[k],q[k]);}}}
  const roi={x:Math.max(0,Math.floor(bounds.min[0])-2),y:Math.max(0,Math.floor(bounds.min[1])-2),right:Math.min(width,Math.ceil(bounds.max[0])+2),top:Math.min(height,Math.ceil(bounds.max[1])+2),origin:'bottom-left',basis:'projected undeformed body bounds plus 2px; no claim of evaluated mesh export'};
  requireValue(roi.right>roi.x&&roi.top>roi.y,'Empty material ROI');
  function delta(a,b,region=roi){let changedRgb=0,changedAlpha=0,maxRgb=0,maxAlpha=0;for(let y=region.y;y<region.top;y++)for(let x=region.x;x<region.right;x++){const i=(y*width+x)*4,d=Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k]))),da=Math.abs(a[i+3]-b[i+3]);if(d>=2)changedRgb++;if(da>=2)changedAlpha++;maxRgb=Math.max(maxRgb,d);maxAlpha=Math.max(maxAlpha,da);}return {changedRgb,changedAlpha,maxRgb,maxAlpha};}
  const hdr=pixels();let noenv,on,off,noenvRestored,diagnostic,restored;
  try{
    look.setBackdrop(null);c.scene.background=null;c.scene.environment=null;r.setClearColor(0,0);
    requireValue(backdrop.envMap.value===null&&backdrop.uHasEnv.value===0&&h.body.children.every(m=>!('ENVMAP_TYPE_CUBE_UV'in m.material.defines)),'Actual no-env shader switch failed');
    noenv=pixels();
    const targetMeshes=new Set(h.body.children);for(const item of drawn)item.o.visible=targetMeshes.has(item.o)?item.visible:false;
    on=pixels();h.skin.uBodyOpacity.value=0;off=pixels();h.skin.uBodyOpacity.value=saved.bodyOpacity;noenvRestored=pixels();
    const contribution=delta(on,off),recovery=delta(on,noenvRestored,{x:0,y:0,right:width,top:height});
    requireValue(contribution.changedAlpha>20&&contribution.maxAlpha>=8,'R8 body opacity has insufficient actual alpha contribution');
    requireValue(recovery.maxRgb===0&&recovery.maxAlpha===0,'No-env counterfactual did not restore');
    diagnostic={verified:true,state,explicitRGBA8Target:true,targetFormat:'RGBA',targetType:'UnsignedByte',targetSamples:0,defaultFramebufferAlpha:gl.getContextAttributes().alpha,framebuffer:'Explicit RGBA8 offscreen render target; default opaque framebuffer alpha is not used',roi,bodyOpacity:saved.bodyOpacity,bodyOpacityCounterfactual:0,actualNoEnv:true,actualBodyShader:true,isolatedBodyOnly:true,contribution,counterfactualRestoration:recovery,thresholds:{changedAlphaGreaterThan:20,maxAlphaAtLeast:8},alphaIsCombinedFrontAndBackFaces:true,physicalAlphaEquivalence:false,headsetVisibilityVerified:false};
  }finally{
    h.skin.uBodyOpacity.value=saved.bodyOpacity;for(const item of drawn)item.o.visible=item.visible;
    c.scene.background=saved.background;c.scene.environment=saved.environment;look.setBackdrop(saved.texture,{intensity:saved.intensity});
    r.setClearColor(saved.color,saved.alpha);r.setRenderTarget(saved.target);
  }
  requireValue(uniforms()===originalState&&backdrop.envMap.value===saved.texture&&backdrop.uHasEnv.value===1&&JSON.stringify(backdrop.uEnvRot.value.toArray())===JSON.stringify(saved.rotation)&&h.body.children.every(m=>'ENVMAP_TYPE_CUBE_UV'in m.material.defines),'HDR state not restored');
  restored=pixels();const hdrRestoration=delta(hdr,restored,{x:0,y:0,right:width,top:height});
  requireValue(hdrRestoration.maxRgb===0&&hdrRestoration.maxAlpha===0,'HDR RGBA target pixels not restored');
  r.setRenderTarget(saved.target);rgbaTarget.dispose();
  requireValue(c.pass('beauty')===originalBeauty,'Original default framebuffer beauty not restored');
  return {...diagnostic,hdrRestoration,originalBeautyPngRestoredExactly:true,originalInputAndUniformsRestored:true,images:[{kind:'noenv-scene',png:png(noenv)},{kind:'noenv-body',png:png(on)},{kind:'noenv-body-opacity0',png:png(off)},{kind:'hdr-restored',png:png(restored)}]};
}
