// R7 real InputSystem + rendered secondary contact contribution.
// Synthetic joints and desktop MR fallback are not Quest acceptance.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.MULTIPOINT_CHECK_OUT;
const kinds=process.env.MULTIPOINT_KINDS?.split(',')??['row','icon','handle','plate'];
if(!kinds.length||kinds.some(k=>!['row','icon','handle','plate'].includes(k)))throw new Error('Unknown multipoint fixture kind');
const result={kinds,checks:[],errors:[],traces:[]};
const server=await createServer({configFile:path.join(root,'vite.config.js'),logLevel:'error',server:{host:'127.0.0.1'}});let browser;
try{
 await server.listen(0);browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const kind of kinds)for(const mode of ['hdr','mr']){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  await page.goto(server.resolvedUrls.local[0]+'bench.html?manual&'+(['icon','plate'].includes(kind)?'part=dock&visible=7':'component=packaging&layout=quest'));
  await page.waitForFunction(()=>window.ready,null,{timeout:180000});
  const trace=await page.evaluate(async({root,kind,mode})=>{
   const THREE=await import(`/@fs/${root}node_modules/three/build/three.module.js`),{InputSystem}=await import(`/@fs/${root}src/core/InputSystem.js`);
   const c=window.contour;c.renderer.setAnimationLoop(null);c.tick(1);
   if(c.dock){c.camera.fov=32;c.camera.updateProjectionMatrix();}
   if(mode==='mr'){
    const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js'));
    (await import(url)).setBackdrop(null);c.scene.background=null;
   }
   const group=()=>new THREE.Group(),obj=c.panel??c.dock;
   const input=new InputSystem({T:obj.T,scene:c.scene,camera:c.camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
   const tips=input.xr.map(src=>{src.connected=true;src.grip.visible=false;const tip=new THREE.Group();tip.jointRadius=.008;src.hand.add(tip);src.hand.joints={'index-finger-tip':tip};return tip;});
   const target=kind==='row'?c.panel.levels[0].rows[0]:kind==='icon'?c.dock.icons[3]:kind==='handle'?c.panel.levels[0].moves[0]:c.dock.shelf;
   const point=(n,gap)=>{
    const side=n?1:-1;
    if(kind==='plate'){
     const d=c.dock,[x,z]=d.arc(side*(d.length/2-d.pad/2),0),p=new THREE.Vector3(x,0,z);
     p.y=d.plateSample(p).front+.008+gap;return d.shelf.localToWorld(p);
    }
    const scale=target.getWorldScale(new THREE.Vector3()).z;
    if(kind==='icon')return target.localToWorld(target.centre.clone().addScaledVector(new THREE.Vector3(side*.5,0,Math.sqrt(.75)),target.rb+(.008+gap)/scale));
    const p=kind==='row'?new THREE.Vector3(side*.025,0,0):new THREE.Vector3(0,side*target.h*.3,0);
    p.z=(kind==='row'?(target.press.pressed?target.pokeFront:target.surfaceZ(p)):target.frontZ)+(.008+gap)/scale;return target.localToWorld(p);
   };
   const step=gap=>{c.scene.updateMatrixWorld(true);tips.forEach((tip,i)=>tip.position.copy(point(i,gap)));c.scene.updateMatrixWorld(true);input.update();c.hands.splice(0,c.hands.length,...input.handPoints);c.tick(1);};
   for(const gap of [.04,.025,.015,.005,-.003])step(gap);for(let i=0;i<20;i++)step(-.003);
   const extra=target.contactDents?.[0];if(!extra)throw new Error(kind+' secondary contact missing');
   const gl=c.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
   const read=()=>{c.renderer.render(c.scene,c.camera);const data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
   const on=read();let restore,at;
   if(kind==='row'){
    const u=c.panel.levels[0].panel.skin.uniforms,x=target.position.x+extra.x,y=target.position.y+extra.y;
    const i=u.uBulgeDent.value.findIndex(d=>Math.abs(d.x-x)<1e-6&&Math.abs(d.y-y)<1e-6&&d.w>0);
    if(i<0)throw new Error('secondary row not exported to shader');
    const d=u.uBulgeDent.value[i].w,g=u.uBulgeGlow.value[i].y;u.uBulgeDent.value[i].w=0;u.uBulgeGlow.value[i].y=0;
    restore=()=>{u.uBulgeDent.value[i].w=d;u.uBulgeGlow.value[i].y=g;};
    at=target.localToWorld(new THREE.Vector3(extra.x,extra.y,target.surfaceZ(new THREE.Vector3(extra.x,extra.y,0))));
   }else{
    const u=kind==='plate'?c.dock.base.material.uniforms:target.skin,key=kind==='plate'?'uExtraTouchCount':'uExtraCount',count=u[key].value;
    u[key].value=0;restore=()=>u[key].value=count;
    at=kind==='plate'?target.localToWorld(new THREE.Vector3(extra.x,extra.y,extra.z)):(kind==='icon'?target.bubble:target.body).localToWorld(new THREE.Vector3(extra.x,extra.y,extra.z));
   }
   const off=read();restore();at.project(c.camera);const px=Math.round((at.x+1)*w/2),py=Math.round((at.y+1)*h/2);let changed=0,maxDelta=0;
   for(let y=Math.max(0,py-70);y<Math.min(h,py+70);y++)for(let x=Math.max(0,px-70);x<Math.min(w,px+70);x++){
    const i=(y*w+x)*4,d=Math.max(...[0,1,2].map(k=>Math.abs(on[i+k]-off[i+k])));if(d>2)changed++;maxDelta=Math.max(maxDelta,d);
   }
   return {kind,mode,contacts:target.contactDents.length,pressed:target.press.pressed,changed,maxDelta,position:[px,py],onScreen:px>=0&&px<w&&py>=0&&py<h};
  },{root,kind,mode});
  result.traces.push(trace);result.checks.push({name:kind+' '+mode+' secondary spatial feedback',pass:trace.contacts>=1&&trace.pressed&&trace.onScreen&&trace.changed>20&&trace.maxDelta>5});
  if(out){await mkdir(out,{recursive:true});const png=await page.evaluate(()=>window.contour.pass('beauty'));await writeFile(path.join(out,kind+'-'+mode+'.png'),Buffer.from(png.split(',')[1],'base64'));}
  await page.close();
 }
 console.log(JSON.stringify(result,null,2));if(out)await writeFile(path.join(out,'multipoint.json'),JSON.stringify(result,null,2));
 if(result.errors.length||result.checks.some(c=>!c.pass))process.exitCode=1;
}finally{await browser?.close();await server.close();}
