// Q48 synthetic InputSystem and rendered navigation, HDR/no-env MR.
// Desktop SwiftShader evidence does not establish Quest comfort/performance.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.NAVIGATION_CHECK_OUT;
if(!out)throw new Error('NAVIGATION_CHECK_OUT required');
const result={checks:[],traces:[],errors:[]},server=await createServer({configFile:path.join(root,'vite.config.js'),logLevel:'error',server:{host:'127.0.0.1'}});let browser;
try{
 await mkdir(out,{recursive:true});await server.listen(0);
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const mode of ['hdr','mr'])for(const scenario of ['normal','reduced','last-loss','all-cancel']){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  await page.goto(server.resolvedUrls.local[0]+'bench.html?manual&dpr=1&component=packaging&layout=quest');await page.waitForFunction(()=>window.ready,null,{timeout:180000});
  const trace=await page.evaluate(async({root,mode,scenario})=>{
   const THREE=await import(`/@fs/${root}node_modules/three/build/three.module.js`),{InputSystem}=await import(`/@fs/${root}src/core/InputSystem.js`);
   const c=window.contour,p=c.panel;c.renderer.setAnimationLoop(null);c.tick(1);p.reducedMotion=scenario==='reduced';
   if(mode==='mr'){const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js'));(await import(url)).setBackdrop(null);c.scene.background=null;}
   const group=()=>new THREE.Group(),input=new InputSystem({T:p.T,scene:c.scene,camera:c.camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
   const rows=p.levels[0].rows.slice(0,2),events=[],frames=[],images={};let epoch=0;
   p.addEventListener('open',e=>events.push({epoch,type:'open',label:e.item.label}));
   rows.forEach((r,i)=>['press','release','cancel','select'].forEach(type=>r.addEventListener(type,()=>events.push({epoch,type,row:i}))));
   const tips=input.xr.map(src=>{src.connected=true;src.grip.visible=false;const tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={'index-finger-tip':tip};return tip;});
   const point=(i,gap)=>{const r=rows[i],v=new THREE.Vector3();v.z=(r.press.pressed?r.pokeFront:r.surfaceZ(v))+(.008+gap)/r.getWorldScale(new THREE.Vector3()).z;return r.localToWorld(v);};
   const opens=()=>events.filter(e=>e.type==='open').map(e=>e.label);
   const step=(gaps)=>{
    epoch++;c.scene.updateMatrixWorld(true);if(gaps)tips.forEach((t,i)=>t.position.copy(input.xr[i].hand.worldToLocal(point(i,gaps[i]))));
    c.scene.updateMatrixWorld(true);input.update();const render=c.renderer.render;c.renderer.render=()=>{};
    try{c.tick(1);}finally{c.renderer.render=render;}
    const front=p.levels.at(-1);frames.push({epoch,active:p.active,opens:opens(),pressed:rows.map(r=>r.press.pressed),front:{opacity:front.cur.opacity,y:front.cur.y,z:front.cur.z,sx:front.cur.sx}});
   };
   for(const gap of [.04,.025,.015,.005,-.003])step([gap,gap]);
   const bothPressed=rows.every(r=>r.press.pressed);images.bothPressed=c.pass('beauty');
   if(scenario==='all-cancel'){
    input.xr.forEach(s=>s.connected=false);step();images.final=c.pass('beauty');
    return{mode,scenario,bothPressed,opens:opens(),active:p.active,events,frames,images,pass:bothPressed&&opens().length===0&&p.active===0&&rows.every(r=>!r.press.pressed)};
   }
   step([.015,-.003]);for(let i=0;i<18;i++)step([.015,-.003]);
   const waiting={opens:opens(),active:p.active,secondHeld:rows[1].press.pressed};images.waiting=c.pass('beauty');
   if(scenario==='last-loss'){input.xr[1].connected=false;step([.015,-.003]);}else step([.015,.015]);
   const first=frames.at(-1).front;images.transitionStart=c.pass('beauty');input.xr.forEach(s=>s.connected=false);
   for(let i=0;i<20;i++)step();const after=frames.at(-1).front;
   // New child labels layout in a worker. Keep simulation frozen while
   // awaiting them, so the screenshot and recorded motion state agree.
   c.renderer.render(c.scene,c.camera);const deadline=performance.now()+5000;
   while(true){let pending=false;c.scene.traverse(o=>{if('textRenderInfo'in o&&!o.textRenderInfo)pending=true;});if(!pending)break;if(performance.now()>deadline)throw new Error('Child text layout deadline');await new Promise(r=>setTimeout(r,20));}
   images.final=c.pass('beauty');
   const expected=scenario==='last-loss'?'Sofas':'Chairs';
   const moving=scenario==='reduced'?Math.abs(after.y-first.y)<1e-8:Math.abs(after.y-first.y)>.001;
   return{mode,scenario,bothPressed,waiting,opens:opens(),active:p.active,first,after,moving,events,frames,images,
    pass:bothPressed&&waiting.active===0&&waiting.opens.length===0&&waiting.secondHeld&&opens().length===1&&opens()[0]===expected&&p.active===1&&after.opacity>first.opacity&&moving};
  },{root,mode,scenario});
  for(const[state,data]of Object.entries(trace.images))await writeFile(path.join(out,mode+'-'+scenario+'-'+state+'.png'),Buffer.from(data.split(',')[1],'base64'));
  delete trace.images;result.traces.push(trace);result.checks.push({name:mode+' '+scenario,pass:trace.pass});await page.close();
 }
 console.log(JSON.stringify(result,null,2));await writeFile(path.join(out,'navigation.json'),JSON.stringify(result,null,2));
 if(result.errors.length||result.checks.some(c=>!c.pass))process.exitCode=1;
}finally{await browser?.close();await server.close();}
