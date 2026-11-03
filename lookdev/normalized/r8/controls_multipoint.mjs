// Finite R8 software contact/navigation evidence using the unchanged Catalog.
// Setup navigation uses select dispatch; every tested press/release uses InputSystem.
import {createHarness} from './controls_fixtures.mjs';
export const MULTIPOINT_CASES=Object.freeze(['same-handle','same-row','distinct-leaves','full-hand-curled',
  'navigation-release-01','navigation-release-10','navigation-press-order','navigation-stable-key',
  'navigation-retained-loss','navigation-retained-side-exit','navigation-singleton','navigation-all-cancel','navigation-leaf-callback-cancel']);
const APPROACH=[.04,.025,.015,.005,-.003],DT=1/60;
const fail=(ok,message)=>{if(!ok)throw Error(message);};
const copy=value=>JSON.parse(JSON.stringify(value));

export function runMultipointFixture({scenario,...options}){
  fail(MULTIPOINT_CASES.includes(scenario),'Unknown R8 multipoint scenario');
  const h=createHarness(options),{THREE,c,p}=h,events=[],trace=[],checks=[];let epoch=0;
  const check=(name,pass,detail={})=>{checks.push({name,pass:!!pass,detail});fail(pass,name);};
  const setup=[];
  if(['same-row','distinct-leaves','full-hand-curled','navigation-leaf-callback-cancel'].includes(scenario)){
    p.levels[0].rows[0].dispatchEvent({type:'select'});h.step(360);setup.push({method:'programmatic setup only',path:p.levels.map(l=>l.item.label)});
    fail(p.levels.at(-1).item.label==='Sofas','Canonical Sofas setup failed');
  }
  const parent=p.levels.at(-1),rows=parent.rows,starts=new Map(),initialRoot=p.levels[0];
  rows.forEach((row,index)=>{for(const type of ['press','release','select','cancel'])row.addEventListener(type,()=>{
    if(type==='press')starts.set(row,{epoch,matrix:row.matrixWorld.clone(),front:row.pokeFront,key:row.navigationClaim?.key??null,productPressEpoch:row.navigationClaim?.started??null,scale:row.getWorldScale(new THREE.Vector3()).toArray()});
    events.push({epoch,type,row:index,label:parent.item.items[index].label,owner:row.pressOwner??null,key:starts.get(row)?.key??null,originalParent:parent.item.label});
  });});
  p.addEventListener('open',e=>events.push({epoch,type:'open',label:e.item.label,parent:p.levels.at(-2)?.item.label??null,stack:p.levels.map(l=>l.item.label)}));
  p.addEventListener('select',e=>events.push({epoch,type:'leaf',label:e.item.label}));
  const uniforms=u=>Object.fromEntries(Object.entries(u).filter(([,x])=>typeof x.value==='number'||x.value?.toArray||Array.isArray(x.value)).map(([k,x])=>[k,Array.isArray(x.value)?x.value.map(v=>v?.toArray?v.toArray():v):x.value?.toArray?x.value.toArray():x.value]));
  const rowState=(row,index)=>({index,label:parent.item.items[index].label,pressed:row.press.pressed,owner:row.pressOwner??null,enabled:row.enabled,continuingOwner:row.continuingOwner??null,
    claim:row.navigationClaim?{started:row.navigationClaim.started,key:row.navigationClaim.key,parent:row.navigationClaim.parent.item.label,inverse:row.navigationClaim.inverse.toArray()}:null,
    contacts:(row.contactDents??[]).map(x=>({id:x.id,x:x.x,y:x.y,z:x.z,depth:x.depth,glow:x.glow})),matrixWorld:row.matrixWorld.toArray()});
  const frame=()=>{
    epoch++;c.scene.updateMatrixWorld(true);h.input.update();
    const delivered=h.input.collect().items.filter(x=>x.probes.length).map(x=>({target:rows.includes(x)?'row-'+rows.indexOf(x):parent.moves.includes(x)?'side-'+parent.moves.indexOf(x):'other',probes:x.probes.map(q=>({id:q.id,sourceId:q.sourceId,point:q.point.toArray(),pinch:q.pinch}))}));
    p.update(DT);p.updateMatrixWorld(true);
    trace.push({epoch,delivered,stack:p.levels.map(l=>l.item.label),active:p.active,closing:p.closing.length,parentZ:parent.cur.z,rows:rows.map(rowState),held:!!p.controls.held,
      hands:h.hands.map(({src,index})=>({id:src.id,connected:src.connected,indexVisible:index.visible,pinch:src.selecting,pointWorldM:index.getWorldPosition(new THREE.Vector3()).toArray()}))});
  };
  const rowPoint=(index,gap,x=0,{frozen=true,side=false}={})=>{
    c.scene.updateMatrixWorld(true);const row=rows[index],start=frozen&&starts.get(row),matrix=start?.matrix??row.matrixWorld;
    const scale=new THREE.Vector3().setFromMatrixScale(matrix),q=new THREE.Vector3(side?row.touchW/2+.04/scale.x:x,0,0);
    q.z=(start?.front??row.surfaceZ(q))+(.008+gap)/scale.z;return q.applyMatrix4(matrix);
  };
  const place=(hand,index,gap,x=0,config)=>h.setHand(hand,rowPoint(index,gap,x,config));
  const leafEvents=()=>events.filter(x=>x.type==='leaf');const opened=()=>events.filter(x=>x.type==='open').map(x=>x.label);
  let visual=null;
  if(scenario==='same-handle'){
    const target=parent.moves[1],point=(hand,gap)=>{c.scene.updateMatrixWorld(true);const q=new THREE.Vector3(0,(hand?1:-1)*target.h*.3,target.t+(.008+gap)/target.inputScale);return target.localToWorld(q);};
    const step=gap=>{h.setHand(0,point(0,gap));h.setHand(1,point(1,gap));frame();};
    for(const gap of APPROACH)step(gap);for(let i=0;i<30;i++)step(-.003);
    check('same handle uses actual physical press without pinch manipulation',target.press.pressed&&!p.controls.held&&h.hands.every(x=>!x.src.selecting));
    check('secondary handle contact reaches actual bounded shader wells',target.contactDents.length>=1&&target.skin.uExtraCount.value>=1&&target.skin.uExtraCount.value<=9&&target.skin.uExtraDent.value.some(v=>v.w>0)&&target.skin.uExtraGlow.value.some(v=>v>0));
    visual={kind:'handle',target,level:parent,uniforms:uniforms(target.skin),contacts:copy(target.contactDents.map(x=>({id:x.id,x:x.x,y:x.y,z:x.z,depth:x.depth,glow:x.glow})))};
  }else if(scenario==='same-row'){
    const step=gap=>{place(0,0,gap,-.025);place(1,0,gap,.025);frame();};
    for(const gap of APPROACH)step(gap);for(let i=0;i<30;i++)step(-.003);
    const row=rows[0],extra=row.contactDents?.[0],u=parent.panel.skin.uniforms;
    const index=extra?u.uBulgeDent.value.findIndex(v=>Math.abs(v.x-(row.position.x+extra.x))<1e-6&&Math.abs(v.y-(row.position.y+extra.y))<1e-6&&v.w>0):-1;
    check('same leaf has real primary and spatial secondary contact',row.press.pressed&&!!extra&&extra.depth>0&&index>=0&&u.uBulgeCount.value>index&&u.uBulgeGlow.value[index].y>0);
    visual={kind:'row',target:row,level:parent,index,uniforms:uniforms(u),contacts:copy(row.contactDents.map(x=>({id:x.id,x:x.x,y:x.y,z:x.z,depth:x.depth,glow:x.glow})))};
    // The visual callback executes before actual release below.
  }else if(scenario==='distinct-leaves'){
    const source=h.hands[0],middle=new THREE.Group();middle.jointRadius=.008;source.src.hand.add(middle);source.src.hand.joints['middle-finger-tip']=middle;
    const step=gap=>{place(0,0,gap);middle.position.copy(source.src.hand.worldToLocal(rowPoint(2,gap)));frame();};
    for(const gap of APPROACH)step(gap);
    check('distinct same-hand leaves have separate actual owners',rows[0].press.pressed&&rows[2].press.pressed&&rows[0].pressOwner!==rows[2].pressOwner);
    const delivered=trace.at(-1).delivered.filter(x=>x.target.startsWith('row-')).flatMap(x=>x.probes.map(q=>q.id));
    check('one target per tracked fingertip',new Set(delivered).size===delivered.length&&delivered.length===2);
    step(.015);check('both independent leaf actions execute once',JSON.stringify(leafEvents().map(x=>x.label))==='["Lounge 3-seat","Loveseat"]');
    check('leaf execution does not navigate',p.levels.length===2&&p.levels[1]===parent);
  }else if(scenario==='full-hand-curled'){
    const src=h.hands[0].src;
    const put=(name,world)=>{let joint=src.hand.joints[name];if(!joint){joint=new THREE.Group();joint.jointRadius=.008;src.hand.add(joint);src.hand.joints[name]=joint;}joint.visible=true;joint.position.copy(src.hand.worldToLocal(world.clone()));};
    place(0,0,.02);
    const wrist=rowPoint(2,.04).add(new THREE.Vector3(0,-.03,0));put('wrist',wrist);
    for(const[name,row,x]of [['middle',1,-.012],['ring',1,.012],['pinky',2,.02]]){
      const point=rowPoint(row,.04,x);put(name+'-finger-tip',point);put(name+'-finger-phalanx-proximal',point.clone().add(new THREE.Vector3(0,.025,0)));
    }
    put('index-finger-phalanx-proximal',rowPoint(0,.02).add(new THREE.Vector3(0,-.04,.035)));
    for(let i=0;i<60;i++)frame();
    const pose=['index','middle','ring','pinky'].map(f=>({finger:f,proximity:h.input.fingerProximity(src,f+'-finger-tip'),tip:src.hand.joints[f+'-finger-tip'].getWorldPosition(new THREE.Vector3()).toArray(),proximal:src.hand.joints[f+'-finger-phalanx-proximal'].getWorldPosition(new THREE.Vector3()).toArray()}));
    check('full hand has extended index and three known curled fingers',pose[0].proximity&&pose.slice(1).every(x=>!x.proximity),{pose,wrist:wrist.toArray()});
    check('curled non-contact fingers do not hover other rows after 60 frames',rows.filter(r=>r.hovered).length===1&&rows[0].hovered&&parent.panel.skin.uniforms.uBulgeCount.value===1&&events.length===0);
    // True curled contact remains actionable; only proximity is filtered.
    // A 1mm contact followed by 0.1mm separation retreats less than the 3mm release hysteresis.
    for(const gap of [.04,.025,.015,.005,-.001]){put('middle-finger-tip',rowPoint(2,gap,.012));frame();}
    check('curled true contact still acquires independent leaf',rows[2].press.pressed&&rows[2].pressOwner==='xr0:middle-finger-tip'&&rows[2].pokePressOffset===0);
    const middleTip=src.hand.joints['middle-finger-tip'].getWorldPosition(new THREE.Vector3());
    put('middle-finger-phalanx-proximal',wrist.clone().lerp(middleTip,.3));frame();
    check('changing pose alone preserves captured physical offset',rows[2].press.pressed&&rows[2].pokePressOffset===0);
    put('middle-finger-tip',rowPoint(2,.0001,.012));frame();check('sub-hysteresis retreat does not execute',rows[2].press.pressed&&leafEvents().length===0);
    put('middle-finger-tip',rowPoint(2,.015,.012));frame();check('complete curled contact release executes once',leafEvents().length===1&&leafEvents()[0].label==='Loveseat');
  }else if(scenario==='navigation-singleton'){
    for(const gap of APPROACH){place(0,0,gap);frame();}
    check('singleton actually acquired',rows[0].press.pressed&&opened().length===0);
    place(0,0,.015);frame();
    check('singleton opens in its physical release frame',JSON.stringify(opened())==='["Sofas"]'&&events.find(e=>e.type==='open').epoch===epoch&&p.levels.length===2);
  }else if(scenario==='navigation-leaf-callback-cancel'){
    // Canonical Sofas mixes leaf 0 with navigation 1. Test real callback mutation.
    let callbackCount=0;p.addEventListener('select',e=>{if(e.item===parent.item.items[0]){callbackCount++;p.back(0);}});
    for(const row of [0,1])for(const gap of APPROACH){place(row,row,gap);frame();}
    check('leaf and navigation were actually held',rows[0].press.pressed&&rows[1].press.pressed);
    place(0,0,.015);place(1,1,.015);frame();
    check('leaf callback executes and cancels pending navigation without resurrection',callbackCount===1&&leafEvents().length===1&&opened().length===0&&p.levels.length===1&&parent.pendingNavigation==null&&p.pendingSelections.length===0);
  }else{
    check('navigation uses original Catalog siblings',parent===initialRoot&&parent.item.items[0].label==='Sofas'&&parent.item.items[1].label==='Chairs');
    const handFor=scenario==='navigation-stable-key'?[1,0]:[0,1],gaps=[.04,.04];
    const tick=next=>{next.forEach((gap,i)=>{gaps[i]=gap;place(handFor[i],i,gap);});frame();};
    const simultaneous=scenario==='navigation-stable-key',firstRelease=scenario.endsWith('-10')?1:0;
    const order=scenario==='navigation-press-order'?[1,0]:[1-firstRelease,firstRelease];
    if(simultaneous)for(const gap of APPROACH)tick([gap,gap]);
    else {tick(gaps);for(const i of order)for(const gap of APPROACH){gaps[i]=gap;tick(gaps);}}
    check('both original-parent navigation rows acquired without execution',rows.slice(0,2).every(r=>r.press.pressed)&&opened().length===0);
    let expected=[],validSelects=2;
    if(scenario==='navigation-all-cancel'){
      h.setHand(handFor[0],null);place(handFor[1],1,-.003,0,{side:true});frame();validSelects=0;
      check('all cancelled group opens nothing',rows.slice(0,2).every(r=>!r.press.pressed)&&opened().length===0&&parent.pendingNavigation==null&&p.levels.length===1);
    }else if(scenario==='navigation-press-order'||simultaneous){
      const startsInOrder=rows.slice(0,2).map((r,i)=>({started:starts.get(r).epoch,key:String(parent.item.items[i].id??`${parent.depth}:${i}:${parent.item.items[i].label??''}`),label:parent.item.items[i].label}));
      check('actual product claims match independent input order and canonical fallback keys',rows.slice(0,2).every((r,i)=>r.navigationClaim.key===startsInOrder[i].key)&&rows[0].navigationClaim.started-rows[1].navigationClaim.started===starts.get(rows[0]).epoch-starts.get(rows[1]).epoch);
      expected=[startsInOrder.sort((a,b)=>a.started-b.started||(a.key<b.key?-1:a.key>b.key?1:0)).at(-1).label];
      check('tie fixture is established',simultaneous?starts.get(rows[0]).epoch===starts.get(rows[1]).epoch:starts.get(rows[1]).epoch<starts.get(rows[0]).epoch);
      tick([.015,.015]);
    }else if(scenario==='navigation-retained-side-exit'){
      place(handFor[0],0,-.003,0,{side:true});frame();validSelects=1;
      check('cancelled first contact cannot queue navigation',!rows[0].press.pressed&&rows[1].press.pressed&&opened().length===0&&parent.pendingNavigation==null);
      place(handFor[1],1,.015);frame();expected=['Chairs'];
    }else{
      const z=parent.cur.z;gaps[firstRelease]=.015;tick(gaps);
      check('first valid release is deferred while another navigation contact holds',opened().length===0&&p.levels.length===1&&parent.pendingNavigation?.child===parent.item.items[firstRelease]);
      const pending=1-firstRelease;
      for(let i=0;i<18;i++){tick(gaps);fail(rows[pending].press.pressed,'Pending contact lost before group completion');}
      check('original parent stays still with no intermediate child',Math.abs(parent.cur.z-z)<1e-12&&opened().length===0&&p.levels.length===1);
      if(scenario==='navigation-retained-loss'){h.setHand(handFor[pending],null);frame();expected=[parent.item.items[firstRelease].label];validSelects=1;check('loss cannot replace prior valid release',!rows[pending].press.pressed);}
      else{gaps[pending]=.015;tick(gaps);expected=[parent.item.items[pending].label];}
    }
    check('Q48 opens only last valid result after group completion',JSON.stringify(opened())===JSON.stringify(expected));
    check('actual valid select count differs from navigation commit count',events.filter(e=>e.type==='select').length===validSelects);
    check('one original parent and at most one final sibling stack',p.levels[0]===initialRoot&&p.levels.length===(expected.length?2:1)&&(!expected.length||p.levels[1].item.label===expected[0])&&events.filter(e=>e.type==='open').every(e=>e.parent==='Catalog'&&e.stack.length===2));
  }
  const finish=()=>{
    if(scenario==='same-row'){
      place(0,0,.015,-.025);place(1,0,.015,.025);frame();
      check('same leaf multiple contacts execute one action',leafEvents().length===1&&leafEvents()[0].label==='Lounge 3-seat');
    }else if(scenario==='same-handle'){
      h.setHand(0,null);h.setHand(1,null);for(let i=0;i<180;i++)frame();
      check('released handle wells recover without navigation',parent.moves[1].skin.uExtraCount.value===0&&Math.abs(parent.moves[1].dent.x)<1e-9&&events.every(e=>!['leaf','open'].includes(e.type)));
    }
    check('Catalog root identity survives',p.levels[0]===initialRoot);
    return {verified:true,scenario,setup,checks,trace,events,final:{path:p.levels.map(l=>l.item.label),rootPreserved:p.levels[0]===initialRoot,held:!!p.controls.held},
      visualState:visual?{kind:visual.kind,uniforms:visual.uniforms,contacts:visual.contacts}:null,
      proofLevel:'Synthetic XR joint/select provider through actual InputSystem and PackagingPanel; no physical tracking or Quest acceptance',stableKeyLimit:'Canonical Catalog fallback depth:rowIndex:label only; explicit-ID reverse ordering is not exercised here',normalizedBlenderExportSupported:false};
  };
  return {visual,finish,context:{THREE,c,p,parent,uniforms}};
}

// Actual secondary shader contribution at the captured state. Save on/off/restore
// to permit independent pixel re-read; never equate alpha with the legacy RGB gate.
export function captureMultipointOptics({visual,context}){
  if(!visual)return null;
  const{THREE,c}=context,r=c.renderer,w=1600,h=1000,target=new THREE.WebGLRenderTarget(w,h,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType});
  const original=r.getRenderTarget(),beauty=c.pass('beauty'),u=visual.kind==='row'?visual.level.panel.skin.uniforms:visual.target.skin;
  const before=visual.kind==='row'?[u.uBulgeDent.value[visual.index].w,u.uBulgeGlow.value[visual.index].y]:u.uExtraCount.value;
  const restore=()=>{if(visual.kind==='row'){u.uBulgeDent.value[visual.index].w=before[0];u.uBulgeGlow.value[visual.index].y=before[1];}else u.uExtraCount.value=before;};
  const read=()=>{r.setRenderTarget(target);r.render(c.scene,c.camera);const b=new Uint8Array(w*h*4);r.readRenderTargetPixels(target,0,0,w,h,b);return b;};
  const png=b=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),im=ctx.createImageData(w,h);for(let y=0;y<h;y++)im.data.set(b.subarray(y*w*4,(y+1)*w*4),(h-y-1)*w*4);ctx.putImageData(im,0,0);return canvas.toDataURL('image/png');};
  let on,off,restored;
  try{on=read();if(visual.kind==='row'){u.uBulgeDent.value[visual.index].w=0;u.uBulgeGlow.value[visual.index].y=0;}else u.uExtraCount.value=0;off=read();restore();restored=read();}
  finally{restore();r.setRenderTarget(original);target.dispose();}
  // BubbleHandle contacts use radius-normalized shader coordinates; row contacts use row-local metres.
  const contact=visual.contacts[0],contactMatrix=visual.kind==='handle'?visual.target.body.matrixWorld:visual.target.matrixWorld;
  const centre=new THREE.Vector3(contact.x,contact.y,contact.z).applyMatrix4(contactMatrix).project(c.camera);
  const px=(centre.x+1)*w/2,py=(centre.y+1)*h/2,roi={x:Math.max(0,Math.floor(px)-70),y:Math.max(0,Math.floor(py)-70),right:Math.min(w,Math.ceil(px)+70),top:Math.min(h,Math.ceil(py)+70),origin:'bottom-left',basis:'actual secondary contact centre projected through fixed camera, fixed70px radius',contactCoordinates:visual.kind==='handle'?'radius-normalized shader coordinate via body.matrixWorld':'row-local metres via row.matrixWorld'};
  fail(roi.x<roi.right&&roi.y<roi.top,'Secondary actual contact ROI outside capture');
  let changed=0,maxDifference=0,restorationMax=0;
  for(let y=roi.y;y<roi.top;y++)for(let x=roi.x;x<roi.right;x++){const i=(y*w+x)*4,d=Math.max(...[0,1,2].map(k=>Math.abs(on[i+k]-off[i+k])));if(d>2)changed++;maxDifference=Math.max(maxDifference,d);}
  for(let i=0;i<on.length;i++)restorationMax=Math.max(restorationMax,Math.abs(on[i]-restored[i]));
  fail(changed>20&&maxDifference>5&&restorationMax===0,'Secondary actual RGB contribution/restoration insufficient');
  fail(c.pass('beauty')===beauty,'Multipoint default beauty not restored');
  return{verified:true,target:'explicit RGBA8; HDR current product shader',kind:visual.kind,roi,changed,maxDifference,restorationMax,thresholds:{rgbDifferenceGreaterThan:2,changedGreaterThan:20,maxDifferenceGreaterThan:5},originalBeautyRestoredExactly:true,physicalOpticalEquivalence:false,
    images:[{kind:'secondary-on',png:png(on)},{kind:'secondary-off',png:png(off)},{kind:'secondary-restored',png:png(restored)}]};
}
