// Normal-distance actual Dock/InputSystem comparison. Desktop WebGL only.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
const root=process.env.SPHERE_SOURCE??fileURLToPath(new URL('../',import.meta.url));
const out=process.env.SPHERE_OUT;if(!out)throw new Error('SPHERE_OUT required');
await mkdir(out,{recursive:true});
const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const server=await createServer({root:root+'/demo',configFile:root+'/vite.config.js',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},
 plugins:[{name:'sphere-case',configureServer(s){s.middlewares.use('/sphere-case.html',(_q,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><style>body{margin:0;background:#30343b}canvas{display:block}</style>');});}}],
 server:{host:'127.0.0.1',port,strictPort:true}});
const result={root,port,checks:[],cases:[],errors:[]};let browser;
const deadline=setTimeout(()=>{result.failure='180s bounded browser deadline';browser?.close();},180000);
try{
 await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const reduced of [false,true])for(const mode of ['noenv','hdr']){
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:reduced?'reduce':'no-preference'});
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${port}/sphere-case.html`);
  const data=await page.evaluate(async({root,mode})=>{
   const THREE=await import('/@fs/'+root+'/node_modules/three/build/three.module.js');
   const {createTokens,Dock,InputSystem}=await import('/@fs/'+root+'/src/index.js');
   await (await import('/@fs/'+root+'/src/core/objects.js')).objectFontsReady;
   const {setBackdrop}=await import('/@fs/'+root+'/src/core/look.js');
   const T=createTokens(await(await fetch('/@fs/'+root+'/tokens.json')).json());
   const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(1280,800);renderer.toneMapping=THREE.NeutralToneMapping;document.body.append(renderer.domElement);
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1.6,.02,50);camera.position.set(0,1.6,0);scene.add(camera);
   if(mode==='noenv')setBackdrop(null);else await (await import('/@fs/'+root+'/demo/backdrop.js')).loadBackdrop(renderer,scene,0);
   const d=new Dock(T,{apps:['house','ruler','scan','image','settings','notes','clock'].map(icon=>({icon,label:icon}))});scene.add(d);
   const dt=1/60;for(let i=0;i<120;i++){scene.updateMatrixWorld(true);d.update(dt,camera);}
   const h=d.handle;scene.updateMatrixWorld(true);const focus=h.getWorldPosition(new THREE.Vector3());camera.lookAt(focus);camera.updateMatrixWorld(true);
   const eye=camera.position.clone(),direction=h.worldToLocal(eye.clone()).normalize();
   const group=()=>new THREE.Group(),input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
   input.xr.forEach(s=>{s.connected=false;s.grip.visible=false;});const src=input.xr[0],tip=new THREE.Group(),thumb=new THREE.Group();tip.jointRadius=thumb.jointRadius=.008;src.hand.add(tip,thumb);src.hand.joints={'index-finger-tip':tip,'thumb-tip':thumb};thumb.visible=false;
   const put=(gap,pinch=false)=>{src.connected=true;src.hand.visible=tip.visible=true;src.selecting=pinch;const point=direction.clone().multiplyScalar(h.r+.008+gap);tip.position.copy(h.localToWorld(point.clone()));thumb.visible=pinch;thumb.position.copy(h.localToWorld(point.add(new THREE.Vector3(-.018,0,0))));};
   const step=()=>{scene.updateMatrixWorld(true);input.update();d.update(dt,camera,input.handPoints);scene.updateMatrixWorld(true);};
   const images={},traces=[];
   const capture=label=>{
    const row={label,eyeDistance:eye.distanceTo(focus),radius:h.r,pressed:h.press.pressed,held:d.rail.held?.id??null,dent:h.dent.x,glow:h.skin.uGlow.value,alpha:h.skin.uBodyOpacity.value,shape:h.softShape?{matrix:h.softShape.matrix.toArray(),offset:h.softShape.offset.toArray(),axis:h.shapeAxis.toArray(),compression:h.softShape.compression}:null};
    for(const angle of [0,35]){
     camera.position.copy(focus).add(eye.clone().sub(focus).applyAxisAngle(new THREE.Vector3(0,1,0),angle*Math.PI/180));camera.lookAt(focus);camera.updateMatrixWorld(true);renderer.render(scene,camera);images[label+'-'+angle]=renderer.domElement.toDataURL();
    }
    camera.position.copy(eye);camera.lookAt(focus);camera.updateMatrixWorld(true);traces.push(row);
   };
   capture('rest');for(const gap of [.04,.025,.015,.005,-.004]){put(gap);step();}for(let i=0;i<60;i++){put(-.004);step();}capture('press');
   for(let i=0;i<60;i++){put(.005,true);step();}capture('held');
   put(.025,false);step();capture('release');src.connected=false;for(let i=0;i<180;i++)step();capture('restored');
   renderer.dispose();return{traces,images};
  },{root,mode});
  const name=mode+'-'+(reduced?'reduced':'normal');
  for(const [label,png]of Object.entries(data.images))await writeFile(`${out}/${name}-${label}.png`,Buffer.from(png.split(',')[1],'base64'));
  delete data.images;result.cases.push({name,...data});
  const t=data.traces;result.checks.push({name:name+' actual press/pinch/loss',pass:t[1].pressed&&t[2].held==='xr0'&&t[4].held===null&&Math.abs(t[4].dent)<1e-5});
  result.checks.push({name:name+' material/scale unchanged',pass:t.every(s=>s.alpha===.38&&s.radius===t[0].radius)&&t[1].glow===.8&&t[2].glow===.8});
  await page.close();
 }
 result.checks.push({name:'no browser errors',pass:result.errors.length===0});
 if(result.checks.some(x=>!x.pass))process.exitCode=1;
}catch(e){result.failure=String(e.stack??e);process.exitCode=1;}
finally{clearTimeout(deadline);await browser?.close();await server.close();result.cleanedUp=true;await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
