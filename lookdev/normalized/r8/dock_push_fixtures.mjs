// R8 bounded actual product software input. Synthetic joints are not tracking proof.
import {pixelCounterfactual,geometryCounterfactual,inspectPlateGeometry,inspectCapOrdering,inspectSphereWell,near,assert} from './dock_push_delta.mjs';
const DT=1/60,FINGERS=['index','middle','ring','pinky'];
const need=assert,clone=value=>JSON.parse(JSON.stringify(value));
export const DOCK_SHOTS={hdr:['rest','plate-pressure','end-held','sphere-pressure','sphere-held','plate-multi','icon-multi','icon-release'],noenv:['rest','plate-multi']};

export function createDockFixture({THREE,InputSystem,Dock,contour:c,settings,mode}) {
  assert(['hdr','noenv'].includes(mode),'Unknown Dock mode');
  const D=settings.DEFAULTS,checks=[],events=[],trace=[];let frame=0;
  const check=(name,pass,detail={})=>{checks.push({name,pass:!!pass,detail});assert(pass,name);};
  c.renderer.setAnimationLoop(null);
  const previous=c.dock,apps=[
    {label:'Planner',icon:'house',color:0x2f7cf6,running:true},
    {label:'Measure',icon:'ruler',color:0xe08a1e},{label:'Scan',icon:'scan',color:0x23a26d},
    {label:'Photos',icon:'image',color:0xd9455f},{label:'Settings',icon:'settings',color:0x6b6f78},
  ];
  c.scene.remove(previous);const dock=new Dock(previous.T,{distance:.4,apps});c.scene.add(dock);
  const head=new THREE.Group();head.position.set(0,1.6,0);c.scene.add(head);
  const group=()=>new THREE.Group();
  const input=new InputSystem({T:dock.T,scene:c.scene,camera:c.camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
  const hands=input.xr.map(src=>{
    src.connected=false;src.grip.visible=false;src.hand.joints={};
    const index=new THREE.Group(),middle=new THREE.Group();
    for(const [name,joint]of [['index-finger-tip',index],['middle-finger-tip',middle]]){joint.jointRadius=.008;joint.visible=false;src.hand.add(joint);src.hand.joints[name]=joint;}
    return {src,index,middle};
  });
  function setHand(i,point,{pinch=false,middle=null}={}){
    const h=hands[i],connected=!!point||!!middle;
    if(h.src.connected!==connected)h.src.ray.dispatchEvent({type:connected?'connected':'disconnected'});
    h.src.hand.visible=true;h.index.visible=!!point;h.middle.visible=!!middle;
    if(point)h.index.position.copy(point);if(middle)h.middle.position.copy(middle);
    if(h.src.selecting!==pinch)h.src.ray.dispatchEvent({type:pinch?'selectstart':'selectend'});
  }
  function step(n=1){for(let i=0;i<n;i++){c.scene.updateMatrixWorld(true);input.update();dock.update(DT,head,input.handPoints);c.scene.updateMatrixWorld(true);frame++;}}
  step(180);c.camera.position.set(0,1.5,.25);c.camera.lookAt(0,dock.position.y-.025,dock.position.z);c.camera.fov=40;c.camera.updateProjectionMatrix();c.camera.updateMatrixWorld(true);
  dock.addEventListener('select',event=>events.push({frame,label:event.app.label}));
  const contact=object=>(object.contactDents??[]).map(d=>({id:d.id,x:d.x,y:d.y,z:d.z,depth:d.depth,glow:d.glow}));
  function snapshot(label){
    const u=dock.base.material.uniforms;
    return {label,frame,mode,sourceIds:hands.map(h=>({id:h.src.id,connected:h.src.connected,pinch:h.src.selecting,indexVisible:h.index.visible,middleVisible:h.middle.visible})),
      plate:{owner:dock.shelf.pressOwner??null,pressed:dock.shelf.press.pressed,heldOwner:dock.grip.held?.id??null,contactDepthM:dock.plateContactDent.x,heldDentM:dock.plateDent.x,dentAt:dock.plateDentAt.toArray(),contacts:contact(dock.shelf),extraTouchCount:u.uExtraTouchCount.value,extraTouch:u.uExtraTouch.value.map(v=>v.toArray()),extraGlow:u.uExtraTouchGlow.value.map(v=>v.toArray()),touch:u.uTouch.value.toArray(),glow:u.uTouchGlow.value.toArray()},
      sphere:{owner:dock.handle.pressOwner??null,pressed:dock.handle.press.pressed,heldOwner:dock.rail.held?.id??null,physicalDentM:dock.handle.dent.x*dock.handle.inputScale,bodyOpacity:dock.handle.skin.uBodyOpacity.value,glow:dock.handle.skin.uGlow.value,feedback:{...dock.handle.feedback}},
      icons:dock.icons.map((icon,i)=>({i,label:icon.app.label,owner:icon.pressOwner??null,pressed:icon.press.pressed,contacted:icon.press.contacted,contacts:contact(icon),extraCount:icon.skin.uExtraCount.value,extraDent:icon.skin.uExtraDent.value.map(v=>v.toArray()),extraGlow:Array.from(icon.skin.uExtraGlow.value),bodyOpacity:icon.skin.uBodyOpacity.value})),
      events:clone(events),camera:{position:c.camera.position.toArray(),quaternion:c.camera.quaternion.toArray(),fov:c.camera.fov}};
  }
  const note=label=>{const s=snapshot(label);trace.push(s);return s;};
  function reset(){hands.forEach((_,i)=>setHand(i,null));step(180);input.reset();dock.resetPlacement();step(180);note('reset');}
  function platePoint(side,gap,{captured=false,padFraction=.5}={}){
    c.scene.updateMatrixWorld(true);const[x,z]=dock.arc(side*(dock.length/2-dock.pad*padFraction),0),p=new THREE.Vector3(x,0,z);
    const front=captured&&dock.shelf.press.pressed?dock.plateFront:dock.plateSample(p).front;
    p.y=front+.008+gap;return dock.shelf.localToWorld(p);
  }
  function spherePoint(gap){c.scene.updateMatrixWorld(true);return dock.handle.localToWorld(new THREE.Vector3(0,0,dock.handle.r+.008+gap));}
  function iconPoint(index,angle,gap){c.scene.updateMatrixWorld(true);const icon=dock.icons[index],q=angle*Math.PI/180;return icon.localToWorld(icon.centre.clone().addScaledVector(new THREE.Vector3(Math.sin(q),0,Math.cos(q)),icon.rb+(.008+gap)/icon.inputScale));}
  check('R8 Dock physical construction and fixed observer',near(dock.distance,.4)&&c.camera.fov===40);
  check('R8 body and shelf alpha exact',D.look.dockBubble.bodyOpacity===.38&&dock.handle.skin.uBodyOpacity.value===.38&&dock.icons.every(i=>i.skin.uBodyOpacity.value===.38)&&dock.base.material.uniforms.uPassthroughAlpha.value===.42);
  check('R8 pressure and sphere feedback exact',D.handInput.platePressDepth===.005&&D.handInput.plateHoldDent===.0035&&D.handInput.plateDentRadius===.01&&dock.handle.feedback.depth===.004&&dock.handle.feedback.hold===.003&&dock.handle.feedback.width===.008&&dock.handle.feedback.core===.012);
  check('R8 fixed stem sphere and profile dimensions',near(dock.handle.w,.028)&&near(D.dockRail.stemLength,.055)&&D.look.dockPlate.edge===7&&D.look.dockPlate.under===7&&D.look.dockPlate.thicknessScale===1.2);
  check('R8 actual stem joins plate level and sphere',dock.stem.parent===dock.handle.parent&&near(dock.stem.geometry.parameters.height,.055)&&near(dock.stem.position.y+.055/2,dock.top)&&near(dock.stem.position.y-.055/2,dock.handle.position.y+dock.handle.r));
  return {THREE,InputSystem,c,D,dock,input,hands,setHand,step,reset,platePoint,spherePoint,iconPoint,snapshot,note,check,checks,events,trace,mode};
}

export function runDockFixture(r){
  const {THREE,c,dock:d,mode,check,setHand,step,reset,platePoint,spherePoint,iconPoint,note}=r,shots=[],diagnostics={};r.shots=shots;r.diagnostics=diagnostics;
  const shot=label=>{assert(DOCK_SHOTS[mode].includes(label),'Unapproved Dock shot');const s=note(label);shots.push({...s,png:c.pass('beauty')});return s;};
  const textReadiness=[];d.traverse(o=>{if('textRenderInfo'in o)textReadiness.push({text:o.text,ready:!!o.textRenderInfo&&o.textRenderInfo.parameters.text===o.text,visibleBounds:o.textRenderInfo?.visibleBounds?Array.from(o.textRenderInfo.visibleBounds):null});});
  check('All five Dock labels are shaped before any shot',textReadiness.length===5&&new Set(textReadiness.map(t=>t.text)).size===5&&textReadiness.every(t=>t.ready&&t.visibleBounds.length===4&&t.visibleBounds.every(Number.isFinite)));
  diagnostics.geometry=inspectPlateGeometry(THREE,d);const g=diagnostics.geometry;
  check('R8 flat symmetric rolled profile and 11.2mm thickness',near(g.nominalThicknessM,.0112)&&near(g.extentLocalM[1],.0112,1e-6)&&near(g.edgeM,g.underM)&&g.flatCentreDifferenceM<1e-8&&g.profile.every(p=>near(p.top+p.bottom,-.0112,1e-8)));
  check('R8 fixed 42mm input pads',near(g.padM,.042));
  check('R8 rounded-end analytic hit agrees with actual mesh',g.samples.length===48&&g.falseInside===0&&g.maximumInsideErrorM<.0001);
  const body=d.handle.skin.uBodyOpacity,savedBody=body.value;
  diagnostics.body=pixelCounterfactual({THREE,contour:c,change:()=>body.value=0,restore:()=>body.value=savedBody});
  check('R8 body contributes actual RGBA target and restores',diagnostics.body.changed>20&&diagnostics.body.maxDifference>=2&&diagnostics.body.restorationMax===0);
  if(mode==='noenv')check('R8 noenv body has alpha contribution',diagnostics.body.alphaChanged>20&&diagnostics.body.maxAlphaDifference>=8);
  shot('rest');
  if(mode==='hdr'){
    for(const gap of [.04,.025,.015,.004,-.005]){setHand(0,platePoint(1,gap,{captured:true}));step();note('plate-approach-'+gap);}
    const pressure=shot('plate-pressure');
    check('R8 actual end pressure reaches 5mm without icon action',near(pressure.plate.contactDepthM,.005,1e-6)&&pressure.plate.pressed&&pressure.icons.every(i=>!i.pressed)&&r.events.length===0);
    const contact=d.plateContactDent.x,held=d.plateDent.x;
    const centre=d.plateDentAt.clone();
    diagnostics.pressure=geometryCounterfactual(d,()=>{d.plateContactDent.x=0;d.plateDent.x=0;},()=>{d.plateContactDent.x=contact;d.plateDent.x=held;},{centre});
    diagnostics.caps=[];
    for(const side of [-1,1]){
      reset();for(const gap of [.04,.025,.015,.005,0,-.002,-.005]){setHand(0,platePoint(side,gap,{captured:true,padFraction:.05}));step();note('cap-'+side+'-approach-'+gap);}
      diagnostics.caps.push({...inspectCapOrdering(d),side,pressed:d.shelf.press.pressed,contactDepthM:d.plateContactDent.x});
    }
    check('R8 narrow actual mesh dent restores and both cap surfaces remain ordered',diagnostics.pressure.changedCoordinates>20&&diagnostics.pressure.maxCoordinateM>.0045&&diagnostics.pressure.restorationMaxM===0&&diagnostics.pressure.halfDepthVertices>10&&diagnostics.pressure.halfDepthRadiusM<.012&&diagnostics.pressure.maxXZDifferenceM===0&&diagnostics.caps.every(c=>c.pressed&&c.contactDepthM>=.0049&&c.pairs>0&&c.reversed===0&&c.allFinite));
    reset();for(const gap of [.04,.015,.004]){setHand(0,platePoint(1,gap));step();}
    setHand(0,platePoint(1,.004),{pinch:true});step(90);
    setHand(1,iconPoint(2,0,-.003));step(30);const heldShot=shot('end-held');
    check('R8 above-skin end pinch has 3.5mm floor and locks icons',heldShot.plate.heldOwner===r.hands[0].src.id&&near(heldShot.plate.heldDentM,.0035,1e-6)&&heldShot.icons.every(i=>!i.pressed)&&r.events.length===0);
    check('R8 plate Glow radius remains 22.4mm independently of pad',near(d.base.material.uniforms.uTouch.value.w,.0224));
    reset();for(const gap of [.05,.025,.012,.004]){setHand(0,spherePoint(gap));step();}
    setHand(0,spherePoint(.004),{pinch:true});step(120);const shallowSphere=note('sphere-held-above-skin');
    check('R8 above-skin sphere pinch has actual 3mm floor',shallowSphere.sphere.heldOwner===r.hands[0].src.id&&near(shallowSphere.sphere.physicalDentM,.003,1e-6)&&r.events.length===0);
    reset();for(const gap of [.05,.025,.012,.004,-.004]){setHand(0,spherePoint(gap));step();}step(120);
    const sphere=shot('sphere-pressure');
    diagnostics.sphereWell=inspectSphereWell(THREE,d.handle);
    const sphereDent=d.handle.skin.uDent,originalSphereDent=sphereDent.value.w;
    diagnostics.sphereDentPixels=pixelCounterfactual({THREE,contour:c,change:()=>sphereDent.value.w=0,restore:()=>sphereDent.value.w=originalSphereDent});
    check('R8 sphere physical pressure creates concave vertices and rendered dent contribution',near(sphere.sphere.physicalDentM,.004,1e-6)&&sphere.sphere.pressed&&!sphere.sphere.heldOwner&&diagnostics.sphereWell.on.concavityM>0&&diagnostics.sphereWell.off.concavityM<0&&diagnostics.sphereWell.restorationMaxM===0&&diagnostics.sphereDentPixels.changed>20&&diagnostics.sphereDentPixels.maxDifference>=2&&diagnostics.sphereDentPixels.restorationMax===0);
    setHand(0,spherePoint(-.004),{pinch:true});setHand(1,iconPoint(2,0,-.003));step(90);const sphereHeld=shot('sphere-held');
    check('R8 sphere pinch preserves deeper pressure and icon lock',sphereHeld.sphere.heldOwner===r.hands[0].src.id&&sphereHeld.sphere.physicalDentM>=sphere.sphere.physicalDentM-1e-6&&sphereHeld.icons.every(i=>!i.pressed)&&r.events.length===0);
    reset();check('R8 held ownership and deformation recover',!d.rail.held&&!d.grip.held&&d.handle.dent.x<1e-6&&d.plateDent.x<1e-6&&d.plateContactDent.x<1e-6);
  }
  for(const gap of [.04,.025,.015,.004,-.003]){setHand(0,platePoint(-1,gap));setHand(1,platePoint(1,gap));step();}
  for(let i=0;i<30;i++){setHand(0,platePoint(-1,-.003));setHand(1,platePoint(1,-.003));step();}
  const multi=shot('plate-multi'),extras=d.shelf.contactDents;
  check('R8 plate has independent spatial pressure and Glow',multi.plate.pressed&&multi.plate.contacts.length>=1&&multi.plate.contacts.every(v=>v.depth>0&&v.glow>0)&&multi.plate.extraTouchCount>=1&&multi.plate.contacts.some(v=>v.x*d.plateDentAt.x<0));
  const extraCount=d.base.material.uniforms.uExtraTouchCount;
  diagnostics.plateExtraGlow=pixelCounterfactual({THREE,contour:c,change:()=>extraCount.value=0,restore:()=>extraCount.value=extras.length});
  check('R8 secondary plate Glow contributes pixels and restores',diagnostics.plateExtraGlow.changed>20&&diagnostics.plateExtraGlow.maxDifference>5&&diagnostics.plateExtraGlow.restorationMax===0);
  diagnostics.plateExtraDent=geometryCounterfactual(d,()=>d.shelf.contactDents=[],()=>d.shelf.contactDents=extras);
  check('R8 secondary plate dent changes actual mesh and restores',diagnostics.plateExtraDent.changedCoordinates>20&&diagnostics.plateExtraDent.maxCoordinateM>.001&&diagnostics.plateExtraDent.restorationMaxM===0);
  reset();
  if(mode==='hdr'){
    const before=r.events.length;
    for(const gap of [.07,.05,.03,.015,.005,-.003]){setHand(0,iconPoint(1,0,gap),{middle:iconPoint(3,30,gap)});setHand(1,iconPoint(3,-30,gap));step();}
    for(let i=0;i<30;i++){setHand(0,iconPoint(1,0,-.003),{middle:iconPoint(3,30,-.003)});setHand(1,iconPoint(3,-30,-.003));step();}
    const icons=shot('icon-multi');
    check('R8 distinct icons acquire independent owners',icons.icons[1].pressed&&icons.icons[3].pressed&&icons.icons[1].owner!==icons.icons[3].owner&&r.events.length===before);
    check('R8 same icon additional fingertip exports dent and Glow',icons.icons[3].contacts.length>=1&&icons.icons[3].extraCount>=1&&icons.icons[3].contacts.some(v=>v.depth>0&&v.glow>0));
    const count=d.icons[3].skin.uExtraCount,saved=count.value;
    diagnostics.iconExtra=pixelCounterfactual({THREE,contour:c,change:()=>count.value=0,restore:()=>count.value=saved});
    check('R8 secondary icon feedback contributes pixels and restores',diagnostics.iconExtra.changed>20&&diagnostics.iconExtra.maxDifference>5&&diagnostics.iconExtra.restorationMax===0);
    // Retreat normal to the face; a radial retreat at 30 degrees can correctly cancel.
    const normal=new THREE.Vector3(0,0,1).transformDirection(d.icons[3].matrixWorld);
    setHand(0,iconPoint(1,0,.02),{middle:iconPoint(3,30,-.003)});setHand(1,iconPoint(3,-30,-.003));step();
    check('R8 first icon separation executes one item',r.events.length===before+1&&r.events.at(-1).label==='Measure');
    setHand(0,iconPoint(1,0,.02),{middle:iconPoint(3,30,-.003).addScaledVector(normal,.025)});setHand(1,iconPoint(3,-30,-.003).addScaledVector(normal,.025));step();
    shot('icon-release');check('R8 second item executes once despite two fingertips',r.events.length===before+2&&r.events.at(-1).label==='Photos');
    reset();check('R8 loss/reset creates no additional item action',r.events.length===before+2&&d.icons.every(i=>!i.press.pressed));
  }
  check('R8 owned fixture ends with no held manipulation',!d.rail.held&&!d.grip.held&&r.hands.every(h=>!h.src.connected));
  assert(shots.length===DOCK_SHOTS[mode].length,'Dock shot budget changed');
  return {mode,checks:r.checks,shots,trace:r.trace,diagnostics,textReadiness,hardwareTrackingVerified:false,geometryExportVerified:false,physicalOpticalEquivalence:false};
}

export function inputRig({THREE, InputSystem, T, scene, camera, broad = false}) {
  const group = () => new THREE.Group();
  const input = new InputSystem({T, scene, camera, renderer: {
    domElement: {addEventListener() {}},
    xr: {isPresenting: true, getController: group, getControllerGrip: group, getHand: group},
  }});
  const src = input.xr[0]; src.ray.dispatchEvent({type:'connected'}); src.grip.visible = false; src.hand.joints = {};
  const joint = (name, x, y, z, radius = .008) => {
    const j = new THREE.Group(); j.position.set(x, y, z); j.jointRadius = radius;
    src.hand.joints[name] = j; src.hand.add(j); return j;
  };
  if (broad) {
    joint('wrist', 0, -.04, 0, .012).rotation.x = Math.PI / 2;
    FINGERS.forEach((f, i) => {
      for (const [name, y] of [['phalanx-proximal', .03], ['phalanx-intermediate', .055], ['phalanx-distal', .08], ['tip', .1]])
        joint(`${f}-finger-${name}`, [-.025, -.008, .009, .025][i], y, 0);
    });
  } else joint('index-finger-tip', 0, 0, 0);
  return {input, src};
}

export async function createPushFixture({THREE, InputSystem, contour: c, scenario, contract, fingerCount=4,reducedMotion=false}) {
  need(contract.capture.productConstructionDistanceM===.6&&contract.capture.fovYDegrees===26&&JSON.stringify(contract.capture.fixedAnchorWorldM)==='[0,1.6,-0.8]'&&contract.r8.initialScale===1.5&&contract.r8.push.closeTravelM===.025,'Push capture settings differ from frozen contract');
  c.renderer.setAnimationLoop(null); const p = c.panel; p.reducedMotion=reducedMotion;
  need(p.distance===.6&&p.scale.x===1.5,'Push actual product construction drift');
  p.position.set(0, 1.6, -.8); c.camera.position.set(0, 1.6, 0); c.camera.quaternion.identity(); c.camera.fov = 26; c.camera.updateProjectionMatrix(); c.camera.updateMatrixWorld(true);
  need(scenario==='same-frame-glow','Only bounded R8 same-frame Glow replay is supported');
  p.levels[0].rows[0].dispatchEvent({type: 'select'});
  for (let i = 0; i < 180; i++) p.update(DT);
  const {input, src} = inputRig({THREE, InputSystem, T: p.T, scene: c.scene, camera: c.camera, broad: true});
  const frames = [], checks = [], events = []; let frame = 0;
  const child = p.levels.at(-1), initialActive = p.active;
  const frontLocal = new THREE.Vector3(child.cur.x, child.cur.y, child.cur.z + child.panel.t * Math.min(child.cur.sx, child.cur.sy));
  const frontWorld = p.localToWorld(frontLocal);
  for (const l of p.levels) for (const r of l.rows) r.addEventListener('select', () => events.push({frame, type: 'row-select'}));
  p.addEventListener('back', e => events.push({frame, type: 'back', level: e.level}));
  const rawCentre = () => { c.scene.updateMatrixWorld(true); return src.hand.joints.wrist.getWorldPosition(new THREE.Vector3()).lerp(src.hand.joints['middle-finger-phalanx-proximal'].getWorldPosition(new THREE.Vector3()), .5); };
  const snapshot = label => {
    c.scene.updateMatrixWorld(true); const probe = input.palmOf(src);
    return {label, frame, scenario, fingerCount, source: {id: src.id, pinch: src.selecting, connected: src.connected, visible: src.hand.visible,
      centreWorldM: rawCentre().toArray(), jointsWorldM: Object.fromEntries(Object.entries(src.hand.joints).map(([k,j]) => [k,j.getWorldPosition(new THREE.Vector3()).toArray()]))},
      recognized: probe ? {normal: probe.normal.toArray(), contacts: probe.contacts.map(q => ({key:q.key,pointWorldM:q.point.toArray(),radiusM:q.radius})),
        samples:p.palmSamples(probe).map(q=>({key:q.key,gapM:q.gap,inside:q.inside,alignment:q.alignment,facing:q.facing}))} : null,
      active: p.active, levels: p.levels.length, closing: p.closing.length, rootTitle:p.levels[0].title.text,
      owner:p.palmOwner??null, push:p.palmPush?{id:p.palmPush.id,patchKey:p.palmPush.patchKey,depthM:p.palmPush.depth,missingS:p.palmPush.missing,contactZ:p.palmPush.contactZ}:null,
      diagnostic:clone(p.palmDiagnostic), childPose:clone(child.cur), childGlow:child.panel.skin.uniforms.uContactGlow.value, childGlowHold:child.palmGlowHold??0, ancestorGlow:p.levels.filter(l=>l!==child).map(l=>l.panel.skin.uniforms.uContactGlow.value), childInStack:p.stack.all.includes(child), contactWidth:child.panel.skin.uniforms.uContactWidth.value, contactStrength:child.panel.skin.uniforms.uContactStrength.value,
      manipulationOwner:p.controls.held?.id??null, rows:child.rows.map(r=>({pressed:r.press.pressed,owner:r.pressOwner??null,enabled:r.enabled})),events:clone(events)};
  };
  const step = (count = 1) => { for (let i=0;i<count;i++) {c.scene.updateMatrixWorld(true);input.update();p.update(DT);frame++;frames.push(snapshot('frame'));} };
  const movePalm = gap => {src.hand.position.set(0,0,0); const centre=rawCentre();src.hand.position.copy(frontWorld).add(new THREE.Vector3(0,0,.022+gap)).sub(centre);step();};
  const check=(name,pass)=>{checks.push({name,pass:!!pass});need(pass,name);};
  const shots=[],diagnostics={};
  const shot=label=>{const s=snapshot(label);shots.push({...s,png:reducedMotion&&label!=='commit-0ms'?null:c.pass('beauty')});return s;};
  const run = () => {
    if(scenario==='same-frame-glow'){
      check('R8 preserves inner Glow settings',child.panel.skin.uniforms.uContactWidth.value===.016&&child.panel.skin.uniforms.uContactStrength.value===.12);
      movePalm(.04);movePalm(-.03);const commit=shot('commit-0ms');check('Same-frame acquire commits without delayed navigation',p.active===initialActive-1&&!p.palmPush&&commit.childGlow===1);
      const glow=child.panel.skin.uniforms.uContactGlow,saved=glow.value;diagnostics.commitGlowPixels=pixelCounterfactual({THREE,contour:c,change:()=>glow.value=0,restore:()=>glow.value=saved});check('Committed inner Glow changes actual pixels and restores',diagnostics.commitGlowPixels.changed>20&&diagnostics.commitGlowPixels.maxDifference>=2&&diagnostics.commitGlowPixels.restorationMax===0);
      const envelope=[];for(let i=1;i<=13;i++){step();const f=snapshot('envelope');envelope.push(f);if([6,12].includes(i))shot('after-'+Math.round(i*DT*1000)+'ms');}
      check('Committed Glow remains high for first100ms',envelope.slice(0,6).every(s=>s.childGlow>=.8));
      check('Following Glow recovers with100ms exponential decay',envelope.slice(7).every((s,i)=>Math.abs(s.childGlow/envelope[i+6].childGlow-Math.exp(-DT/.1))<1e-8));
      check('Success light stays on departing layer',envelope.every(s=>s.ancestorGlow.every(v=>v===0)));step(90);check('Glow does not keep closing layer alive',p.closing.length===0);
      check('R8 Catalog root survives committed child close',p.active===0&&p.levels[0].title.text==='Catalog'&&p.levels[0].title.fillOpacity===1);
      check('R8 source pane thickness and front alpha are explicit',near(child.panel.t,.004)&&near(child.panel.skin.uniforms.uThick.value,.004)&&near(child.panel.skin.uniforms.uFrontOpacity.value,.85));
    }
    check('No broad hand leaks a row click',events.every(e=>e.type!=='row-select'));
    return {scenario,fingerCount,reducedMotion,checks,shots,frames,diagnostics,proofLevel:'Synthetic WebXR joints and controller connection/select events -> InputSystem.update/palmOf/palmStep -> PackagingPanel.update. Navigation setup uses select dispatch, gesture states use real input path. No physical tracking or headset acceptance.'};
  };
  return {p,input,src,run,frames,snapshot,child,step,movePalm,shot,checks,shots,diagnostics};
}
