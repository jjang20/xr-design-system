// Bounded real-WebGL alpha + native pane path. Desktop, not Quest evidence.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=process.env.R15_SOURCE??fileURLToPath(new URL('../',import.meta.url));
const out=process.env.R15_OUT;if(!out)throw new Error('R15_OUT required');await mkdir(out,{recursive:true});
const mode=process.env.R15_ENV??'noenv',reduced=process.env.R15_REDUCED==='1',fixture=process.env.R15_ALPHA_FIXTURE==='1';
const result={root,mode,reduced,fixture,checks:[],errors:[]};let browser;
const server=await createServer({root:root+'/demo',configFile:root+'/vite.config.js',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0},plugins:[{name:'r15-alpha',configureServer(s){s.middlewares.use('/r15-alpha.html',(_q,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><style>body{margin:0;background:#30343b}canvas{display:block}</style>');});}}]});
const deadline=setTimeout(()=>{result.failure='180s deadline';browser?.close();},180000);
try{
 await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:reduced?'reduce':'no-preference'});
 page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});await page.goto(server.resolvedUrls.local[0]+'r15-alpha.html');
 const data=await page.evaluate(async({root,mode,fixture})=>{
  const THREE=await import('/@fs/'+root+'/node_modules/three/build/three.module.js');
  const {WebXRController}=await import('/@fs/'+root+'/node_modules/three/src/renderers/webxr/WebXRController.js');
  const {createTokens,PackagingPanel,InputSystem}=await import('/@fs/'+root+'/src/index.js');
  const {DEFAULTS}=await import('/@fs/'+root+'/src/core/defaults.js');
  const {ListSurfaceOpacity}=await import('/@fs/'+root+'/src/core/ListSurfaceOpacity.js');
  const {setBackdrop}=await import('/@fs/'+root+'/src/core/look.js');
  const targets=fixture?{idle:.21,hover:.31,pressed:.41}:DEFAULTS.listSurfaceOpacity;
  if(!targets)throw new Error('Q78 state targets not selected; production-mode validation cannot proceed');
  const T=createTokens(await(await fetch('/@fs/'+root+'/tokens.json')).json());
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,800);renderer.setPixelRatio(1);renderer.toneMapping=THREE.NeutralToneMapping;document.body.append(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1.6,.02,50);camera.position.set(0,0,.6);scene.add(camera);
  if(mode==='noenv')setBackdrop(null);else await(await import('/@fs/'+root+'/demo/backdrop.js')).loadBackdrop(renderer,scene,0);
  const p=new PackagingPanel(T,{title:'Catalog',items:[{label:'Sofas'},{label:'Lighting'},{label:'Tables'}]});p.scale.setScalar(1.5);scene.add(p);const dt=1/60;
  for(let i=0;i<120;i++){scene.updateMatrixWorld(true);p.update(dt);}scene.updateMatrixWorld(true);
  const l=p.levels[0],h=l.surface,row=l.rows[0];
  if(fixture){l.listOpacity?.dispose();l.listOpacity=new ListSurfaceOpacity(l.panel.skin,l.rows,targets);}
  const labels=[];p.traverse(o=>{if('textRenderInfo' in o)labels.push(o);});const until=performance.now()+15000;
  while(labels.some(t=>!t.textRenderInfo)){if(performance.now()>until)throw new Error('font deadline');await new Promise(r=>setTimeout(r,20));}
  const controllers=[new WebXRController(),new WebXRController()],xr={isPresenting:true,getController:i=>controllers[i].getTargetRaySpace(),getControllerGrip:i=>controllers[i].getGripSpace(),getHand:i=>controllers[i].getHandSpace()};
  const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr}}),controller=controllers[0];
  const spaces=['index-finger-tip','thumb-tip'].map(jointName=>({jointName})),source={hand:new Map(spaces.map(s=>[s.jointName,s])),targetRaySpace:{},handedness:'right'};controller.connect(source);
  let position=null,gap=.04;const events=[];for(const type of ['pinchstart','pinchend','selectstart'])input.xr[0].hand.addEventListener(type,()=>events.push(type));
  const frame=()=>{
   if(position){const thumb=position.clone().add(new THREE.Vector3(0,0,-gap));controller.update(source,{session:{visibilityState:'visible'},getJointPose:s=>({transform:{matrix:new THREE.Matrix4().makeTranslation(...(s.jointName==='thumb-tip'?thumb:position).toArray()).toArray()},radius:.008}),getPose:()=>null},{});}
   else input.xr[0].hand.visible=false;
   scene.updateMatrixWorld(true);input.update();p.update(dt);scene.updateMatrixWorld(true);
  };
  const rowAt=g=>{const q=new THREE.Vector3(0,0,0);q.z=(row.press.pressed?row.pokeFront:row.surfaceZ(q))+(.008+g)/h.inputScale;return row.localToWorld(q);};
  const images={},traces=[];
  function sample(state,expected){
   renderer.render(scene,camera);images[state]=renderer.domElement.toDataURL();
   const background=scene.background;scene.background=null;renderer.render(scene,camera);const gl=renderer.getContext();
   const read=q=>{q.project(camera);const bytes=new Uint8Array(4);gl.readPixels(Math.round((q.x+1)*640),Math.round((q.y+1)*400),1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return [...bytes];};
   const pixels=[];for(const x of [.20,.27,.34])for(const y of [-.25,.25]){const q=new THREE.Vector3(row.w*x,row.h*y,0);q.z=row.surfaceZ(q);pixels.push(read(row.localToWorld(q)));}
   const outside=read(h.localToWorld(new THREE.Vector3(h.panel.w*.4,h.panel.h*.42,h.panel.t)));
   scene.background=background;renderer.render(scene,camera);
   traces.push({state,expected,pixels,outside,alphaValues:[...l.listOpacity.values],mix:l.panel.skin.uniforms.uListStateMix.value,labels:labels.map(t=>t.fillOpacity),hover:row.hovered,pressed:row.press.pressed,contact:row.surfaceContact,slots:l.panel.skin.uniforms.uBulgeCount.value,held:p.controls.held?.handle===h,position:p.position.toArray()});
  }
  sample('idle',targets.idle);
  for(let i=0;i<120;i++){position=rowAt(.04);frame();}sample('hover',targets.hover);
  for(const g of [.025,.015,.005,-.003]){position=rowAt(g);frame();}
  for(let i=0;i<120;i++){position=rowAt(-.003);frame();}sample('pressed',targets.pressed);
  position=null;for(let i=0;i<180;i++)frame();sample('restored',targets.idle);
  position=h.localToWorld(new THREE.Vector3(h.panel.w/2+.003/h.inputScale,0,h.panel.t+.004/h.inputScale));gap=.04;frame();gap=.01;for(let i=0;i<30;i++)frame();sample('native-edge-held',targets.idle);
  const before=p.position.clone();position.add(new THREE.Vector3(.03,0,0));frame();const moved=p.position.distanceTo(before);
  gap=.04;frame();const released=!p.controls.held;position=null;for(let i=0;i<180;i++)frame();sample('native-restored',targets.idle);
  const native={events,moved,released},texture=l.listOpacity.texture;let disposed=0;texture.addEventListener('dispose',()=>disposed++);p.dispose();renderer.dispose();
  return{targets,traces,images,native,disposed};
 },{root,mode,fixture});
 for(const[name,png]of Object.entries(data.images))await writeFile(`${out}/${mode}-${reduced?'reduced':'normal'}-${name}.png`,Buffer.from(png.split(',')[1],'base64'));delete data.images;
 result.data=data;const label=data.traces[0].labels,outside=data.traces[0].outside[3];
 for(const t of data.traces){
  if(t.state!=='native-edge-held')result.checks.push({name:t.state+' framebuffer absolute alpha',pass:t.pixels.every(p=>Math.abs(p[3]/255-t.expected)<2/255),observed:t.pixels.map(p=>p[3])});
  result.checks.push({name:t.state+' content opacity unchanged',pass:JSON.stringify(t.labels)===JSON.stringify(label)});
  if(['idle','hover','pressed','restored'].includes(t.state))result.checks.push({name:t.state+' outside-row alpha unchanged',pass:Math.abs(t.outside[3]-outside)<=1});
 }
 result.checks.push({name:'actual joint-derived finite edge acquisition/move/release',pass:data.traces.find(t=>t.state==='native-edge-held').held&&Math.abs(data.native.moved-.03)<1e-7&&data.native.released&&data.native.events.includes('pinchstart')&&!data.native.events.includes('selectstart')});
 result.checks.push({name:'texture disposed',pass:data.disposed===1});
 result.checks.push({name:'browser errors',pass:result.errors.length===0});
 if(result.checks.some(x=>!x.pass))process.exitCode=1;
 await page.close();
}catch(e){result.failure=String(e.stack??e);process.exitCode=1;}finally{clearTimeout(deadline);await browser?.close();await server.close();result.cleanedUp=true;await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checks:result.checks,errors:result.errors,failure:result.failure,cleanedUp:result.cleanedUp}));}
