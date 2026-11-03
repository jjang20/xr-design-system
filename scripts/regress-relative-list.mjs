// R16 actual pane-relative alpha/RGB parity and local manipulation light. Desktop, not Quest evidence.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=process.env.R16_SOURCE??fileURLToPath(new URL('../',import.meta.url));
const out=process.env.R16_OUT;if(!out)throw new Error('R16_OUT required');await mkdir(out,{recursive:true});
const mode=process.env.R16_ENV??'noenv',reduced=process.env.R16_REDUCED==='1';
const result={root,mode,reduced,checks:[],errors:[]};let browser;
const server=await createServer({root:root+'/demo',configFile:root+'/vite.config.js',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0},plugins:[{name:'r16-alpha',configureServer(s){s.middlewares.use('/r16-alpha.html',(_q,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><style>body{margin:0;background:#30343b}canvas{display:block}</style>');});}}]});
const deadline=setTimeout(()=>{result.failure='180s deadline';browser?.close();},180000);
try{
 await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:reduced?'reduce':'no-preference'});
 page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});await page.goto(server.resolvedUrls.local[0]+'r16-alpha.html');
 const data=await page.evaluate(async({root,mode})=>{
  const THREE=await import('/@fs/'+root+'/node_modules/three/build/three.module.js');
  const {WebXRController}=await import('/@fs/'+root+'/node_modules/three/src/renderers/webxr/WebXRController.js');
  const {createTokens,PackagingPanel,InputSystem}=await import('/@fs/'+root+'/src/index.js');
  const {DEFAULTS}=await import('/@fs/'+root+'/src/core/defaults.js');
  const {setBackdrop}=await import('/@fs/'+root+'/src/core/look.js');
  const targets={idle:0,hover:.04,pressed:.07};
  
  const T=createTokens(await(await fetch('/@fs/'+root+'/tokens.json')).json());
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,800);renderer.setPixelRatio(1);renderer.toneMapping=THREE.NeutralToneMapping;document.body.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1.6,.02,50);camera.position.set(0,0,.6);scene.add(camera);
  if(mode==='noenv')setBackdrop(null);else await(await import('/@fs/'+root+'/demo/backdrop.js')).loadBackdrop(renderer,scene,0);
  const p=new PackagingPanel(T,{title:'Catalog',items:[{label:'Sofas'},{label:'Lighting'},{label:'Tables'}]});p.scale.setScalar(1.5);scene.add(p);const dt=1/60;
  for(let i=0;i<120;i++){scene.updateMatrixWorld(true);p.update(dt);}scene.updateMatrixWorld(true);
  const l=p.levels[0],h=l.surface,row=l.rows[0];
  const labels=[];p.traverse(o=>{if('textRenderInfo' in o)labels.push(o);});const until=performance.now()+15000;
  while(labels.some(t=>!t.textRenderInfo)){if(performance.now()>until)throw new Error('font deadline');await new Promise(r=>setTimeout(r,20));}
  const controllers=[new WebXRController(),new WebXRController()],xr={isPresenting:true,getController:i=>controllers[i].getTargetRaySpace(),getControllerGrip:i=>controllers[i].getGripSpace(),getHand:i=>controllers[i].getHandSpace()};
  const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr}}),controller=controllers[0];
  const spaces=['index-finger-tip','thumb-tip'].map(jointName=>({jointName})),source={hand:new Map(spaces.map(s=>[s.jointName,s])),targetRaySpace:{},handedness:'right'};controller.connect(source);
  let position=null,gap=-.04;const events=[];for(const type of ['pinchstart','pinchend','selectstart'])input.xr[0].hand.addEventListener(type,()=>events.push(type));
  const frame=()=>{
   if(position){const thumb=position.clone().add(new THREE.Vector3(0,0,-gap));controller.update(source,{session:{visibilityState:'visible'},getJointPose:s=>({transform:{matrix:new THREE.Matrix4().makeTranslation(...(s.jointName==='thumb-tip'?thumb:position).toArray()).toArray()},radius:.008}),getPose:()=>null},{});}
   else input.xr[0].hand.visible=false;
   scene.updateMatrixWorld(true);input.update();p.update(dt);scene.updateMatrixWorld(true);
  };
  const rowAt=g=>{const q=new THREE.Vector3(0,0,0);q.z=(row.press.pressed?row.pokeFront:row.surfaceZ(q))+(.008+g)/h.inputScale;return row.localToWorld(q);};
  const images={},traces=[],parity=[];
  const raw=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),d=new Uint8Array(1280*800*4);gl.readPixels(0,0,1280,800,gl.RGBA,gl.UNSIGNED_BYTE,d);return d;};
  const diff=(a,b)=>{let changed=0,max=0;for(let i=0;i<a.length;i+=4){const d=Math.max(...[0,1,2,3].map(k=>Math.abs(a[i+k]-b[i+k])));if(d>1)changed++;max=Math.max(max,d);}return {changed,max};};
  function sample(state,offset){
   const u=l.panel.skin.uniforms,base=(mode==='hdr'?1:u.uSolidOpacity.value)*u.uFrontOpacity.value;
   const expected=(base+offset)*u.uOpacity.value*u.uFade.value;
   if(['idle','restored','native-restored','isolated-group-fade','alternate-baseline'].includes(state)){
    const bg=scene.background;scene.background=null;const on=raw(),mix=u.uListStateMix.value;u.uListStateMix.value=0;const off=raw();u.uListStateMix.value=mix;scene.background=bg;parity.push({state,...diff(on,off)});
   }
   renderer.render(scene,camera);images[state]=renderer.domElement.toDataURL();
   const background=scene.background;scene.background=null;renderer.render(scene,camera);const gl=renderer.getContext();
   const read=q=>{q.project(camera);const bytes=new Uint8Array(4);gl.readPixels(Math.round((q.x+1)*640),Math.round((q.y+1)*400),1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return [...bytes];};
   const pixels=[];for(const x of [.20,.27,.34])for(const y of [-.25,.25]){const q=new THREE.Vector3(row.w*x,row.h*y,0);q.z=row.surfaceZ(q);pixels.push(read(row.localToWorld(q)));}
   const outside=read(h.localToWorld(new THREE.Vector3(h.panel.w*.4,h.panel.h*.42,h.panel.t)));
   scene.background=background;renderer.render(scene,camera);
   traces.push({state,offset,base,expected,pixels,outside,alphaValues:[...l.listOpacity.values],mix:l.panel.skin.uniforms.uListStateMix.value,labels:labels.map(t=>t.fillOpacity),labelExpected:labels.map(t=>(t.userData.baseOpacity??1)*(t.userData.preserveTitle?1:p.manipulationOpacity)),groupAlpha:l.panel.skin.uniforms.uOpacity.value*l.panel.skin.uniforms.uFade.value,hover:row.hovered,pressed:row.press.pressed,contact:row.surfaceContact,slots:l.panel.skin.uniforms.uBulgeCount.value,held:p.controls.held?.handle===h,position:p.position.toArray()});
  }
  sample('idle',targets.idle);
  for(let i=0;i<120;i++){position=rowAt(.04);frame();}sample('hover',targets.hover);
  for(const g of [.025,.015,.005]){position=rowAt(g);frame();}
  for(let i=0;i<120;i++){position=rowAt(.005);frame();}sample('early-pressed',targets.pressed);
  position=rowAt(-.003);frame();
  for(let i=0;i<120;i++){position=rowAt(-.003);frame();}sample('pressed',targets.pressed);
  position=rowAt(.04);const releaseAlpha=[];for(let i=0;i<120;i++){frame();releaseAlpha.push(l.listOpacity.values[0]);}sample('release-hover',targets.hover);
  position=null;for(let i=0;i<180;i++)frame();sample('restored',targets.idle);
  position=h.localToWorld(new THREE.Vector3(h.panel.w/2+.003/h.inputScale,0,h.panel.t+.004/h.inputScale));gap=-.04;frame();gap=-.01;for(let i=0;i<30;i++)frame();sample('native-edge-held',targets.idle);
  const pane=[];
  for(const angle of [0,35]){
   camera.position.set(.6*Math.sin(angle*Math.PI/180),0,.6*Math.cos(angle*Math.PI/180));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
   const u=h.skin.uniforms,on=raw();images['pane-held-'+angle]=renderer.domElement.toDataURL();
   const amount=u.uPaneGlow?.value.y??0;if(u.uPaneGlow)u.uPaneGlow.value.y=0;
   const noGlow=raw();images['pane-shape-only-'+angle]=renderer.domElement.toDataURL();
   const depth=u.uPaneDent.value.w;u.uPaneDent.value.w=0;const off=raw();images['pane-off-'+angle]=renderer.domElement.toDataURL();u.uPaneDent.value.w=depth;if(u.uPaneGlow)u.uPaneGlow.value.y=amount;
   pane.push({angle,glow:diff(on,noGlow),shape:diff(noGlow,off),radiusWorld:h.currentDent.radius*h.inputScale,depthWorld:depth*h.inputScale,glowUniform:u.uPaneGlow?.value.toArray()??null});
  }
  camera.position.set(0,0,.6);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const before=p.position.clone();position.add(new THREE.Vector3(.03,0,0));frame();const moved=p.position.distanceTo(before);
  gap=-.04;frame();const released=!p.controls.held;position=null;for(let i=0;i<180;i++)frame();sample('native-restored',targets.idle);
  const u=l.panel.skin.uniforms,saved=[u.uOpacity.value,u.uFade.value];u.uOpacity.value=.5;u.uFade.value=.4;sample('isolated-group-fade',targets.idle);u.uOpacity.value=saved[0];u.uFade.value=saved[1];
  const old=[u.uSolidOpacity.value,u.uFrontOpacity.value];u.uSolidOpacity.value=.44;u.uFrontOpacity.value=.65;sample('alternate-baseline',0);u.uSolidOpacity.value=old[0];u.uFrontOpacity.value=old[1];
  const native={events,moved,released},texture=l.listOpacity.texture;let disposed=0;texture.addEventListener('dispose',()=>disposed++);p.dispose();renderer.dispose();
  return{targets,traces,images,native,disposed,releaseAlpha,parity,pane,glowRestored:h.skin.uniforms.uPaneGlow?.value.y??null};
 },{root,mode});
 for(const[name,png]of Object.entries(data.images))await writeFile(`${out}/${mode}-${reduced?'reduced':'normal'}-${name}.png`,Buffer.from(png.split(',')[1],'base64'));delete data.images;
 result.data=data;const label=data.traces[0].labels,outside=data.traces[0].outside[3];
 for(const t of data.traces){
  result.checks.push({name:t.state+' framebuffer pane-relative alpha',pass:t.pixels.every(p=>Math.abs(p[3]/255-t.expected)<2/255),observed:t.pixels.map(p=>p[3])});
  result.checks.push({name:t.state+' existing content fade preserved',pass:t.labels.every((v,i)=>Math.abs(v-t.labelExpected[i])<1e-9)});

  if(['idle','hover','pressed','restored'].includes(t.state))result.checks.push({name:t.state+' outside-row alpha unchanged',pass:Math.abs(t.outside[3]-outside)<=1});
 }
 result.checks.push({name:'hover fixture has no actual contact/press',pass:data.traces.find(t=>t.state==='hover').hover&&!data.traces.find(t=>t.state==='hover').pressed&&!data.traces.find(t=>t.state==='hover').contact});
 result.checks.push({name:'actual joint-derived finite edge acquisition/move/release',pass:data.traces.find(t=>t.state==='native-edge-held').held&&Math.abs(data.native.moved-.03)<1e-7&&data.native.released&&data.native.events.includes('pinchstart')&&!data.native.events.includes('selectstart')});
 result.checks.push({name:'release-hover no idle dip',pass:data.releaseAlpha.every((v,i)=>v>=data.targets.hover-1e-6&&v<=data.targets.pressed+1e-6&&(!i||v<=data.releaseAlpha[i-1]+1e-6))});
 result.checks.push({name:'early pressed selected alpha',pass:data.traces.find(t=>t.state==='early-pressed').pressed&&!data.traces.find(t=>t.state==='early-pressed').contact});
 for(const p of data.parity)result.checks.push({name:p.state+' full-frame pane RGB/alpha/mask parity',pass:p.changed===0,observed:p});
 for(const p of data.pane){result.checks.push({name:'pane local Glow contributes at '+p.angle,pass:p.glow.changed>30,observed:p.glow});result.checks.push({name:'pane shape independent of Glow at '+p.angle,pass:p.shape.changed>0&&p.radiusWorld>.025&&p.depthWorld<=.003501,observed:p});}
 result.checks.push({name:'pane Glow recovers after release',pass:data.glowRestored!==null&&data.glowRestored<1e-7});
 result.checks.push({name:'texture disposed',pass:data.disposed===1});
 result.checks.push({name:'browser errors',pass:result.errors.length===0});
 if(result.checks.some(x=>!x.pass))process.exitCode=1;
 await page.close();
}catch(e){result.failure=String(e.stack??e);process.exitCode=1;}finally{clearTimeout(deadline);await browser?.close();await server.close();result.cleanedUp=true;await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checks:result.checks,errors:result.errors,failure:result.failure,cleanedUp:result.cleanedUp}));}
