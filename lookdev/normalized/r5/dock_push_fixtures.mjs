// R5 bounded replay through actual InputSystem.update and component updates.
// Joint transforms and the XR provider are synthetic; this is not tracking evidence.
const DT = 1 / 60;
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const need = (value, message) => { if (!value) throw Error(message); };
const clone = value => JSON.parse(JSON.stringify(value));

function inputRig({THREE, InputSystem, T, scene, camera, broad = false}) {
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

export async function createDockFixture({THREE, InputSystem, Dock, contour: c, contract, mode}) {
  const capture=contract.dockCapture;
  need(capture.constructionDistanceM===.4&&capture.apps===5&&capture.fovYDegrees===40&&JSON.stringify(capture.placementHeadWorldM)==='[0,1.6,0]'&&JSON.stringify(capture.cameraWorldM)==='[0,1.5,0.25]'&&JSON.stringify(capture.placementHeadQuaternion)==='[0,0,0,1]'&&capture.lookAt==='[0, initialDockY - 0.025, initialDockZ]'&&capture.cameraFixedAcrossStates&&capture.modes.includes(mode),'Dock capture settings differ from frozen contract');
  c.renderer.setAnimationLoop(null);
  // The legacy bench Dock uses a different construction distance. Replace it
  // with the actual component constructed at the declared R5 0.4 m distance.
  c.scene.remove(c.dock);
  const apps = [
    {label: 'Planner', icon: 'house', color: 0x2f7cf6, running: true},
    {label: 'Measure', icon: 'ruler', color: 0xe08a1e},
    {label: 'Scan', icon: 'scan', color: 0x23a26d},
    {label: 'Photos', icon: 'image', color: 0xd9455f},
    {label: 'Settings', icon: 'settings', color: 0x6b6f78},
  ];
  const dock = new Dock(c.dock.T, {distance: .4, apps}); c.scene.add(dock);
  const head = new THREE.Group(); head.position.set(0, 1.6, 0); c.scene.add(head);
  const {input, src} = inputRig({THREE, InputSystem, T: dock.T, scene: c.scene, camera: c.camera});
  const tip = src.hand.joints['index-finger-tip'];
  const other = input.xr[1], otherTip = new THREE.Group(); otherTip.jointRadius=.008;
  other.grip.visible=false;other.hand.add(otherTip);other.hand.joints={'index-finger-tip':otherTip};
  src.connected = false;
  for (let i = 0; i < 180; i++) { c.scene.updateMatrixWorld(true); input.update(); dock.update(DT, head, input.handPoints); }
  // Observer pose is fixed independently of the head used for Dock placement.
  c.camera.position.set(0, 1.5, .25); c.camera.lookAt(0, dock.position.y - .025, dock.position.z);
  c.camera.fov = 40; c.camera.updateProjectionMatrix(); c.camera.updateMatrixWorld(true); c.scene.updateMatrixWorld(true);
  const frames = [], events = []; let frame = 0;
  dock.addEventListener('select', e => events.push({frame, label: e.app.label}));
  const shape = () => Array.from(dock.base.geometry.attributes.position.array);
  const originalShape = shape();
  const snapshot = label => {
    c.scene.updateMatrixWorld(true);
    const stemTop = dock.stem.localToWorld(new THREE.Vector3(0, .055 / 2, 0));
    const stemBottom = dock.stem.localToWorld(new THREE.Vector3(0, -.055 / 2, 0));
    const sphereCentre = dock.handle.getWorldPosition(new THREE.Vector3());
    const u = dock.base.material.uniforms;
    return {label, frame, source: {id: src.id, connected: src.connected, pinch: src.selecting,
      indexTipWorldM: tip.getWorldPosition(new THREE.Vector3()).toArray()},
      rail: {owner: dock.rail.held?.id ?? null, radiusM: dock.rail.radius, heightM: dock.rail.height, angle: dock.rail.angle,
        anchorWorldM: dock.rail.anchor.toArray(), positionWorldM: dock.position.toArray()},
      handle: {owner: dock.handle.grab?.id ?? null, hovered: dock.handle.hovered, diameterM: dock.handle.w,
        stemLengthM: stemTop.distanceTo(stemBottom), stemToSphereGapM: stemBottom.distanceTo(sphereCentre) - dock.handle.r,
        stemTopWorldM: stemTop.toArray(), stemBottomWorldM: stemBottom.toArray(), sphereCentreWorldM: sphereCentre.toArray(),
        dent: dock.handle.skin.uDent.value.toArray(), glow: dock.handle.skin.uGlow.value},
      plate: {owner: dock.grip.held?.id ?? null, heldDentM: dock.plateDent.x, directDepthM: dock.shelf.press.depth,
        dentAtLocalM: dock.plateDentAt.toArray(), size: dock.size, lengthM: dock.length, vertices: dock.base.geometry.attributes.position.count,
        hasRoom: u.uHasRoom.value, passthroughAlpha: u.uPassthroughAlpha.value, touchGlow: u.uTouchGlow.value.toArray()},
      icons: dock.icons.map((icon, i) => ({i, exclusive: icon.exclusive, hovered: icon.hovered, pressed: icon.press.pressed,
        pressOwner: icon.pressOwner ?? null, hover: icon.hover, scale: icon.scale.toArray(), glow: icon.skin.uGlow.value})),
      otherSource:{id:other.id,connected:other.connected,pinch:other.selecting,indexTipWorldM:otherTip.getWorldPosition(new THREE.Vector3()).toArray(),middleIconDistanceM:dock.icons[2].pokeDistance(dock.icons[2].worldToLocal(otherTip.getWorldPosition(new THREE.Vector3())))},
      selections: clone(events), camera: {positionWorldM: c.camera.position.toArray(), quaternion: c.camera.quaternion.toArray(), fov: c.camera.fov},
      mode};
  };
  const step = (point, pinch = false, count = 1, connected = true) => {
    if(src.connected!==connected)src.ray.dispatchEvent({type:connected?'connected':'disconnected'});
    if(src.selecting!==pinch)src.ray.dispatchEvent({type:pinch?'selectstart':'selectend'});
    if (point) tip.position.copy(point);
    for (let i = 0; i < count; i++) {
      c.scene.updateMatrixWorld(true); input.update(); dock.update(DT, head, input.handPoints); frame++;
      frames.push(snapshot('frame'));
    }
  };
  const handlePoint = () => dock.handle.localToWorld(new THREE.Vector3(0, 0, dock.handle.r + .012));
  const atMiddleIcon=()=>{const icon=dock.icons[2];return icon.localToWorld(icon.centre.clone().add(new THREE.Vector3(0,0,icon.rb+.015)));};
  const checks = [];
  const check = (name, pass) => { checks.push({name, pass: !!pass}); need(pass, name); };
  check('Dock actual construction distance 0.4m', dock.distance === .4);
  check('Dock sphere 28mm and fixed stem 55mm', Math.abs(dock.handle.w - .028) < 1e-10 && Math.abs(snapshot('start').handle.stemLengthM - .055) < 1e-9);
  const actions = {
    rest() { step(null, false, 1, false); return snapshot('rest'); },
    sphereHover() { step(handlePoint(), false, 30); const s = snapshot('sphere-hover'); check('Sphere hover does not move Dock', !s.rail.owner && s.handle.hovered); return s; },
    sphereHeld() { step(handlePoint(), true, 30);other.connected=true;otherTip.position.copy(atMiddleIcon());step(tip.position.clone(),true,30);const s = snapshot('sphere-held');check('Pinch acquires actual DockRail owner', s.rail.owner === src.id && s.handle.owner === src.id);check('Captured sphere locks icon response despite another fingertip at icon',s.otherSource.connected&&s.otherSource.middleIconDistanceM<.03&&s.icons.every(x=>!x.exclusive&&!x.pressed));return s; },
    sphereMoved() {
      const before = dock.position.clone(), p = tip.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(.018, .01, -.012));
      step(p, true, 30); const s = snapshot('sphere-moved');
      check('Held sphere moves the actual placement', dock.position.distanceTo(before) > .01 && s.rail.owner === src.id);
      check('Stem remains fixed and attached after move', Math.abs(s.handle.stemLengthM - .055) < 1e-9 && Math.abs(s.handle.stemToSphereGapM) < 1e-9);
      check('Icon responses remain locked during movement', s.icons.every(x => !x.exclusive && !x.pressed) && events.length === 0); return s;
    },
    sphereReleased() {otherTip.position.copy(atMiddleIcon());step(tip.position.clone(), false, 30);const s=snapshot('sphere-released');check('Releasing pinch releases rail owner',!s.rail.owner&&!s.handle.owner);check('Icon proximity response resumes after rail release',s.icons.some(x=>x.exclusive&&x.hovered));other.connected=false;return s;},
    plateHeld() {
      step(null, false, 120, false);
      const s0 = dock.length / 2 - dock.pad / 2, [x, z] = dock.arc(s0, 0);
      const local = new THREE.Vector3(x, 0, z); local.y = dock.plateSample(local).front + .02;
      const p = dock.shelf.localToWorld(local); step(p, false, 30);
      const noDent = shape(); step(p, true, 60); const s = snapshot('plate-held'), after = shape();
      let max = 0, changed = 0; for (let i = 0; i < after.length; i++) { const d = Math.abs(after[i] - noDent[i]); max = Math.max(max, d); if (d > 1e-7) changed++; }
      s.plate.actualVertexChanges = {changedCoordinates: changed, maximumDisplacementCoordinateM: max, baselineVertices: originalShape.length / 3};
      // Diagnostic only: isolate dent from the plate's simultaneous hover
      // swell, then restore the same captured state before taking its image.
      const heldDepth = dock.plateDent.x, pressDepth = dock.shelf.press.depth;
      dock.plateDent.x = 0; dock.shelf.press.depth = 0; dock.layout(); const withoutDent = shape();
      dock.plateDent.x = heldDepth; dock.shelf.press.depth = pressDepth; dock.layout(); const restored = shape();
      let dentMax = 0, dentCoordinates = 0, restoreMax = 0;
      for (let i=0;i<after.length;i++) {const delta=Math.abs(after[i]-withoutDent[i]);dentMax=Math.max(dentMax,delta);if(delta>1e-7)dentCoordinates++;restoreMax=Math.max(restoreMax,Math.abs(after[i]-restored[i]));}
      s.plate.dentGeometryCounterfactual = {method:'Same captured state and layout; zero only held/direct dent, restore before capture',changedCoordinates:dentCoordinates,maximumDisplacementCoordinateM:dentMax,maximumRestorationErrorM:restoreMax};
      check('Plate pinch owns shelf and supplies local held dent', s.plate.owner === src.id && s.plate.heldDentM > .0019);
      check('Held dent changes actual plate vertices', changed > 20 && max > .0001);
      check('Dent-only geometry counterfactual is visible in mesh and exactly restored',dentCoordinates>20&&dentMax>.0001&&restoreMax===0);
      check('Plate hold suppresses icons', s.icons.every(x => !x.exclusive && !x.pressed) && events.length === 0); return s;
    },
    plateReleased() { step(tip.position.clone(), false, 120); const s = snapshot('plate-released'); check('Plate releases owner and held dent recovers', !s.plate.owner && s.plate.heldDentM < 1e-5); return s; },
  };
  return {dock, input, src, checks, frames, snapshot, actions, proofLevel: 'Synthetic XR provider and joint transforms through actual InputSystem.update -> Dock.update; real WebGL shaders and geometry; no hardware tracking.'};
}

export async function createPushFixture({THREE, InputSystem, contour: c, scenario, contract, fingerCount=4}) {
  need(contract.capture.productConstructionDistanceM===.6&&contract.capture.fovYDegrees===26&&JSON.stringify(contract.capture.fixedAnchorWorldM)==='[0,1.6,-0.8]'&&contract.r5.initialScale===1.5&&contract.r5.push.closeTravelM===.025,'Push capture settings differ from frozen contract');
  c.renderer.setAnimationLoop(null); const p = c.panel;
  need(p.distance===.6&&p.scale.x===1.5,'Push actual product construction drift');
  p.position.set(0, 1.6, -.8); c.camera.position.set(0, 1.6, 0); c.camera.quaternion.identity(); c.camera.fov = 26; c.camera.updateProjectionMatrix(); c.camera.updateMatrixWorld(true);
  const deep = scenario === 'one-child';
  p.levels[0].rows[0].dispatchEvent({type: 'select'});
  for (let i = 0; i < 180; i++) p.update(DT);
  if (deep) { p.levels[1].rows[1].dispatchEvent({type: 'select'}); for (let i = 0; i < 180; i++) p.update(DT); }
  const {input, src} = inputRig({THREE, InputSystem, T: p.T, scene: c.scene, camera: c.camera, broad: true});
  const frames = [], checks = [], events = []; let frame = 0;
  const child = p.levels.at(-1), initialActive = p.active;
  const frontLocal = new THREE.Vector3(child.cur.x, child.cur.y, child.cur.z + child.panel.t * Math.min(child.cur.sx, child.cur.sy));
  const frontWorld = p.localToWorld(frontLocal);
  const row = child.rows[0];
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
      diagnostic:clone(p.palmDiagnostic), childPose:clone(child.cur), childGlow:child.panel.skin.uniforms.uContactGlow.value,
      manipulationOwner:p.controls.held?.id??null, rows:child.rows.map(r=>({pressed:r.press.pressed,owner:r.pressOwner??null,enabled:r.enabled})),events:clone(events)};
  };
  const step = (count = 1) => { for (let i=0;i<count;i++) {c.scene.updateMatrixWorld(true);input.update();p.update(DT);frame++;frames.push(snapshot('frame'));} };
  const movePalm = gap => {src.hand.position.set(0,0,0); const centre=rawCentre();src.hand.position.copy(frontWorld).add(new THREE.Vector3(0,0,.022+gap)).sub(centre);step();};
  const moveIndex = gap => {c.scene.updateMatrixWorld(true);const point=row.localToWorld(new THREE.Vector3(0,0,row.surfaceZ(new THREE.Vector3()))).add(new THREE.Vector3(0,0,.008+gap));src.hand.position.set(0,0,0);c.scene.updateMatrixWorld(true);const tip=src.hand.joints['index-finger-tip'].getWorldPosition(new THREE.Vector3());src.hand.position.copy(point.sub(tip));step();};
  const fold = () => {for(const f of ['middle','ring','pinky'])for(const [n,y]of[['phalanx-intermediate',.025],['phalanx-distal',.015],['tip',.01]])src.hand.joints[`${f}-finger-${n}`].position.y=y;};
  const check=(name,pass)=>{checks.push({name,pass:!!pass});need(pass,name);};
  const shots=[];
  const shot=label=>{const s=snapshot(label);shots.push({...s,png:c.pass('beauty')});return s;};
  const run = () => {
    if (scenario==='single-index') {fold();for(let i=0;i<40;i++)moveIndex(.05);moveIndex(.015);moveIndex(0);shot('index-contact');moveIndex(.009);shot('index-released');check('One extended index selects once without Push',events.filter(e=>e.type==='row-select').length===1&&!p.palmOwner);}
    else if(scenario==='pinch-excludes') {src.ray.dispatchEvent({type:'selectstart'});for(const gap of [.04,-.01,-.04])movePalm(gap);shot('pinch-open-hand');check('Pinch excludes broad-hand Push',input.palmOf(src)===null&&!p.palmOwner&&p.active===initialActive);}
    else if(scenario==='patch-jump') {movePalm(.04);const centre=rawCentre().clone();for(const f of FINGERS)src.hand.joints[`${f}-finger-tip`].position.z=-.1;step();shot('patch-jump-rejected');check('Contact patch teleport cannot invent travel',centre.distanceTo(rawCentre())<1e-9&&p.active===initialActive&&(!p.palmPush||p.palmPush.depth===0));}
    else if(scenario==='articulation') {movePalm(.04);movePalm(-.01);check('Articulation control first owns a real palm push',p.palmOwner===src.id);const centre=rawCentre().clone(),z=child.cur.z;for(const f of FINGERS){src.hand.joints[`${f}-finger-tip`].position.z=-.04;src.hand.joints[`${f}-finger-phalanx-distal`].position.z=-.03;}step();shot('articulation-no-travel');check('No centre translation means no closing displacement',centre.distanceTo(rawCentre())<1e-9&&Math.abs(child.cur.z-z)<1e-7&&p.active===initialActive);}
    else if(scenario==='fingertips') {
      need([2,3,4].includes(fingerCount),'Unsupported broad fingertip subcase');
      for(const f of FINGERS.slice(fingerCount))for(const [n,y]of[['phalanx-intermediate',.025],['phalanx-distal',.015],['tip',.01]])src.hand.joints[`${f}-finger-${n}`].position.y=y;
      src.hand.rotation.x=-Math.PI/6;for(let i=0;i<40;i++)moveIndex(.05);moveIndex(.015);moveIndex(0);
      const s=shot(fingerCount+'-fingertips-contact');
      if(fingerCount>=3){check(fingerCount+' extended fingertip face owns Push before palm',p.palmOwner===src.id&&p.palmPush.patchKey==='fingers:'+FINGERS.slice(0,fingerCount).join(',')&&s.recognized.contacts.length===2);check('Broad face suppresses row press',child.rows.every(r=>!r.press.pressed));}
      else check('Two extended fingers cannot acquire broad-hand Push',input.palmOf(src)===null&&!p.palmOwner&&p.active===initialActive);
    }
    else if(scenario==='behind') {movePalm(-.04);movePalm(-.065);shot('initial-behind-rejected');check('Initial appearance behind cannot acquire',!p.palmOwner&&p.active===initialActive);}
    else {
      movePalm(.04);shot('observed-approach');movePalm(-.005);shot('palm-contact');check('Observed palm approach acquires',p.palmOwner===src.id&&p.palmPush.patchKey==='palm');
      const z=child.cur.z;movePalm(-.02);shot('palm-20mm');check('Below 25mm preserves child with real following',p.active===initialActive&&p.palmPush.depth>.019&&p.palmPush.depth<.025&&child.cur.z<z);
      if(scenario==='palm'){
        movePalm(.04);step(120);shot('withdrawal-cancel');check('Withdrawal before threshold cancels and preserves child',!p.palmOwner&&p.active===initialActive&&events.every(e=>e.type!=='back'));
        movePalm(.04);movePalm(-.005);movePalm(-.02);check('Fresh observed approach reacquires after cancellation',p.palmOwner===src.id&&p.palmPush.depth<.025);
      }
      movePalm(-.026);shot('palm-close-26mm');check('Crossing 25mm closes exactly one child',p.active===initialActive-1&&events.filter(e=>e.type==='back').length===1);
      step(120);movePalm(-.07);shot('no-cascade');check('Held hand cannot cascade and Catalog remains',p.active===initialActive-1&&p.levels[0].title.text==='Catalog'&&events.filter(e=>e.type==='back').length===1);
      if(scenario==='one-child'){
        check('Deep stack retains parent child',p.active===1);
        movePalm(.1);movePalm(.04);movePalm(-.005);movePalm(-.026);step(120);shot('retreat-rearm-second-child');check('Real retreat rearms a fresh gesture for only the next child',p.active===0&&events.filter(e=>e.type==='back').length===2);
        movePalm(.1);movePalm(.04);movePalm(-.005);movePalm(-.026);shot('root-preserved-after-new-gesture');check('Fresh gesture cannot dismiss Catalog root',p.active===0&&p.levels[0].title.text==='Catalog'&&events.filter(e=>e.type==='back').length===2);
      }
    }
    if(scenario!=='single-index'&&!(scenario==='fingertips'&&fingerCount<3))check('No broad hand leaks a row click',events.every(e=>e.type!=='row-select'));
    return {scenario,fingerCount,checks,shots,frames,proofLevel:'Synthetic WebXR joints and controller connection/select events -> InputSystem.update/palmOf/palmStep -> PackagingPanel.update. Navigation setup uses select dispatch, gesture states use real input path. No physical tracking or headset acceptance.'};
  };
  return {p,input,src,run,frames,snapshot};
}
