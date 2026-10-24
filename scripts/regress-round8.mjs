// R8 actual InputSystem and GPU feedback checks. Synthetic joints + desktop
// HDR/no-env MR fallback; this does not establish physical Quest usability.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.ROUND8_CHECK_OUT;
if(!out)throw new Error('ROUND8_CHECK_OUT is required');
const result={checks:[],traces:[],errors:[]};
const server=await createServer({configFile:path.join(root,'vite.config.js'),logLevel:'error',server:{host:'127.0.0.1'}});let browser;
try{
 await mkdir(out,{recursive:true});await server.listen(0);
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const kind of ['hover','plate','sphere'])for(const mode of ['hdr','mr']){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  await page.goto(server.resolvedUrls.local[0]+'bench.html?manual&dpr=1&'+(kind==='hover'?'component=packaging&layout=quest':'part=dock&visible=7'));
  await page.waitForFunction(()=>window.ready,null,{timeout:180000});
  const trace=await page.evaluate(async({root,kind,mode})=>{
   const THREE=await import(`/@fs/${root}node_modules/three/build/three.module.js`),{InputSystem}=await import(`/@fs/${root}src/core/InputSystem.js`);
   const c=window.contour;c.renderer.setAnimationLoop(null);c.tick(1);
   if(mode==='mr'){
    const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js'));
    (await import(url)).setBackdrop(null);c.scene.background=null;
   }
   const group=()=>new THREE.Group(),obj=c.panel??c.dock;
   const input=new InputSystem({T:obj.T,scene:c.scene,camera:c.camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
   input.xr.forEach(s=>{s.connected=false;s.grip.visible=false;});
   const src=input.xr[0];src.connected=true;src.hand.joints={};
   const put=(name,world)=>{let j=src.hand.joints[name];if(!j){j=new THREE.Group();j.jointRadius=.008;src.hand.add(j);src.hand.joints[name]=j;}j.position.copy(src.hand.worldToLocal(world.clone()));};
   const step=()=>{c.scene.updateMatrixWorld(true);input.update();c.hands.splice(0,c.hands.length,...input.handPoints);c.tick(1);};
   const capture=()=>c.pass('beauty');
   if(kind==='hover'){
    const rows=c.panel.levels[0].rows;
    const at=(i,gap,x=0)=>{const r=rows[i],p=new THREE.Vector3(x,0,0);p.z=r.surfaceZ(p)+(.008+gap)/r.getWorldScale(new THREE.Vector3()).z;return r.localToWorld(p);};
    put('index-finger-tip',at(0,.02));
    for(const [f,row,x] of [['middle',1,-.012],['ring',1,.012],['pinky',2,.02]])put(f+'-finger-tip',at(row,.04,x));
    put('wrist',at(2,.04).add(new THREE.Vector3(0,-.03,0)));
    for(const f of ['middle','ring','pinky'])put(f+'-finger-phalanx-proximal',src.hand.joints[f+'-finger-tip'].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.025,0)));
    put('index-finger-phalanx-proximal',at(0,.02).add(new THREE.Vector3(0,-.04,.035)));
    for(let i=0;i<60;i++)step();
    const u=c.panel.levels[0].panel.skin.uniforms;
    return {kind,mode,hovered:rows.map((r,i)=>r.hovered?i:null).filter(i=>i!==null),pressed:rows.filter(r=>r.press.pressed).length,bulges:u.uBulgeCount.value,poses:['index','middle','ring','pinky'].map(f=>({finger:f,proximity:input.fingerProximity(src,f+'-finger-tip')})),images:{on:capture()}};
   }
   const d=c.dock,h=d.handle,g=d.shelfShape.geometry;
   const restP=g.attributes.position.array.slice(),restN=g.attributes.normal.array.slice();
   let point,focus;
   if(kind==='plate'){
    const [x,z]=d.arc(d.length/2-d.pad/2,0),p=new THREE.Vector3(x,0,z),front=d.plateSample(p).front;
    point=gap=>d.shelf.localToWorld(new THREE.Vector3(x,front+.008+gap,z));focus=d.shelf.localToWorld(new THREE.Vector3(x,front,z));
   }else{point=gap=>h.localToWorld(new THREE.Vector3(0,0,h.r+.008+gap));focus=h.getWorldPosition(new THREE.Vector3());}
   for(const gap of [.04,.025,.015,.005,0,-.002,-.005]){put('index-finger-tip',point(gap));step();}
   for(let i=0;i<60;i++){put('index-finger-tip',point(-.005));step();}
   const overview=capture();
   c.camera.position.copy(focus).add(kind==='plate'?new THREE.Vector3(.035,.10,.12):new THREE.Vector3(.025,.008,.09));c.camera.lookAt(focus);c.camera.fov=32;c.camera.updateProjectionMatrix();c.camera.updateMatrixWorld(true);
   const gl=c.renderer.getContext(),w=gl.drawingBufferWidth,hh=gl.drawingBufferHeight;
   const read=()=>{c.renderer.render(c.scene,c.camera);const b=new Uint8Array(w*hh*4);gl.readPixels(0,0,w,hh,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
   const on=read(),images={overview,on:capture()};let restore,depth,pressed;
   if(kind==='plate'){
    const nowP=g.attributes.position.array.slice(),nowN=g.attributes.normal.array.slice();depth=0;
    for(let i=1;i<nowP.length;i+=3)depth=Math.max(depth,restP[i]-nowP[i]);
    g.attributes.position.array.set(restP);g.attributes.normal.array.set(restN);g.attributes.position.needsUpdate=g.attributes.normal.needsUpdate=true;
    restore=()=>{g.attributes.position.array.set(nowP);g.attributes.normal.array.set(nowN);g.attributes.position.needsUpdate=g.attributes.normal.needsUpdate=true;};pressed=d.shelf.press.pressed;
   }else{const v=h.skin.uDent.value.w;depth=h.dent.x*h.inputScale;h.skin.uDent.value.w=0;restore=()=>h.skin.uDent.value.w=v;pressed=h.press.pressed;}
   // No simulation step: Glow, alpha, camera and all other uniforms stay
   // fixed. The difference is actual geometry/dent, not a light-only mark.
   const off=read();images.geometryOff=capture();restore();read();
   let changed=0,maxDelta=0;for(let i=0;i<on.length;i+=4){const q=Math.max(...[0,1,2].map(k=>Math.abs(on[i+k]-off[i+k])));if(q>2)changed++;maxDelta=Math.max(maxDelta,q);}
   return {kind,mode,pressed,depth,changed,maxDelta,images};
  },{root,kind,mode});
  for(const [state,data]of Object.entries(trace.images))await writeFile(path.join(out,kind+'-'+mode+'-'+state+'.png'),Buffer.from(data.split(',')[1],'base64'));
  delete trace.images;result.traces.push(trace);
  result.checks.push({name:kind+' '+mode,pass:kind==='hover'?trace.hovered.length===1&&trace.hovered[0]===0&&trace.bulges===1&&trace.pressed===0:trace.pressed&&trace.depth>.003&&trace.changed>100&&trace.maxDelta>10});
  await page.close();
 }
 console.log(JSON.stringify(result,null,2));await writeFile(path.join(out,'round8.json'),JSON.stringify(result,null,2));
 if(result.errors.length||result.checks.some(c=>!c.pass))process.exitCode=1;
}finally{await browser?.close();await server.close();}
