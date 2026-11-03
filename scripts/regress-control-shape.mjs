// Actual WindowControls + InputSystem, fixed normal-distance desktop WebGL.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
const root=process.env.CONTROL_SOURCE??fileURLToPath(new URL('../',import.meta.url));
const out=process.env.CONTROL_SHAPE_OUT;if(!out)throw new Error('CONTROL_SHAPE_OUT required');await mkdir(out,{recursive:true});
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const server=await createServer({root:root+'/demo',configFile:root+'/vite.config.js',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'control-case',configureServer(s){s.middlewares.use('/control-case.html',(_q,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><style>body{margin:0;background:#30343b}canvas{display:block}</style>');});}}]});
const result={root,port,checks:[],cases:[],errors:[]};let browser;
const deadline=setTimeout(()=>{result.failure='180s deadline';browser?.close();},180000);
try{
 await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const reduced of [false,true])for(const mode of ['noenv','hdr']){
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:reduced?'reduce':'no-preference'});
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});await page.goto(`http://127.0.0.1:${port}/control-case.html`);
  const data=await page.evaluate(async({root,mode})=>{
   const THREE=await import('/@fs/'+root+'/node_modules/three/build/three.module.js');
   const {createTokens,PackagingPanel,InputSystem}=await import('/@fs/'+root+'/src/index.js');
   const {setBackdrop}=await import('/@fs/'+root+'/src/core/look.js');
   const T=createTokens(await(await fetch('/@fs/'+root+'/tokens.json')).json());
   const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,800);renderer.setPixelRatio(1);renderer.toneMapping=THREE.NeutralToneMapping;document.body.append(renderer.domElement);
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1.6,.02,50);camera.position.set(0,0,.6);scene.add(camera);
   if(mode==='noenv')setBackdrop(null);else await(await import('/@fs/'+root+'/demo/backdrop.js')).loadBackdrop(renderer,scene,0);
   const p=new PackagingPanel(T,{title:'Catalog',items:[{label:'Sofas'},{label:'Lighting'},{label:'Tables'}]});p.scale.setScalar(1.5);scene.add(p);const dt=1/60;
   for(let i=0;i<120;i++){scene.updateMatrixWorld(true);p.update(dt);}scene.updateMatrixWorld(true);
   const labels=[];p.traverse(o=>{if('textRenderInfo' in o)labels.push(o);});const until=performance.now()+15000;
   while(labels.some(t=>!t.textRenderInfo)){if(performance.now()>until)throw new Error('font deadline');await new Promise(r=>setTimeout(r,20));}
   const group=()=>new THREE.Group(),input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});input.xr.forEach(s=>{s.connected=false;s.grip.visible=false;});
   const s=input.xr[0],tip=new THREE.Group(),thumb=new THREE.Group();tip.jointRadius=thumb.jointRadius=.008;s.hand.add(tip,thumb);s.hand.joints={'index-finger-tip':tip,'thumb-tip':thumb};thumb.visible=false;
   const step=()=>{scene.updateMatrixWorld(true);input.update();p.update(dt);scene.updateMatrixWorld(true);};
   const traces=[],images={};
   for(const type of ['side','corner']){
    const h=type==='side'?p.levels[0].moves[1]:p.levels[0].corners[1];
    const put=(gap,pinch=false)=>{s.connected=true;s.hand.visible=true;s.selecting=pinch;const at=new THREE.Vector3(0,0,h.t+(.008+gap)/h.inputScale);tip.position.copy(h.localToWorld(at.clone()));thumb.visible=pinch;thumb.position.copy(h.localToWorld(at.add(new THREE.Vector3(-.018/h.inputScale,0,0))));};
    const capture=state=>{const row={type,state,rectangular:h.rectangular,visible:h.affordance.visible,pressed:h.press.pressed,held:p.controls.held?.handle===h,dent:h.dent.x,compression:h.softShape?.compression??0,matrix:h.softShape?.matrix.toArray(),arrow:h.arrow?.matrix.toArray(),alpha:h.skin.uBodyOpacity.value,sheet:p.manipulationOpacity,marks:['uDentLight','uDentGlint','uDentShadow','uGlowCore','uRing'].map(k=>h.skin[k].value)};
     for(const angle of (state==='press'||state==='held'?[0,35]:[0])){camera.position.set(.6*Math.sin(angle*Math.PI/180),0,.6*Math.cos(angle*Math.PI/180));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);renderer.render(scene,camera);images[type+'-'+state+'-'+angle]=renderer.domElement.toDataURL();}
     camera.position.set(0,0,.6);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);traces.push(row);};
    capture('rest');for(let i=0;i<45;i++){put(.025);step();}capture('hover');
    for(const gap of [.025,.015,.005,-.0015]){put(gap);step();}for(let i=0;i<60;i++){put(-.0015);step();}capture('press');
    for(let i=0;i<60;i++){put(.005,true);step();}capture('held');put(.025,false);step();capture('release');s.connected=false;for(let i=0;i<180;i++)step();capture('restored');
   }
   renderer.dispose();return{traces,images};
  },{root,mode});
  const name=mode+'-'+(reduced?'reduced':'normal');for(const[label,png]of Object.entries(data.images))await writeFile(`${out}/${name}-${label}.png`,Buffer.from(png.split(',')[1],'base64'));delete data.images;
  result.cases.push({name,...data});for(const type of ['side','corner']){const t=data.traces.filter(x=>x.type===type);result.checks.push({name:name+' '+type+' actual shape and lifecycle',pass:!t[0].visible&&t[1].visible&&t[2].pressed&&t[2].compression>.08&&t[3].held&&t[3].compression>.08&&!t[4].held&&t[4].visible&&!t[5].visible&&t[5].compression<1e-5&&t[3].sheet<.95&&t[5].sheet>.999});result.checks.push({name:name+' '+type+' mark opt-in',pass:t.every(x=>x.marks.every(v=>v===0))});}await page.close();
 }
 result.checks.push({name:'browser errors',pass:result.errors.length===0});if(result.checks.some(x=>!x.pass))process.exitCode=1;
}catch(e){result.failure=String(e.stack??e);process.exitCode=1;}finally{clearTimeout(deadline);await browser?.close();await server.close();result.cleanedUp=true;await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
