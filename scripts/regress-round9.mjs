// Actual InputSystem + GPU diagnostics. Synthetic joints; no headset claim.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(process.env.ROUND9_ROOT??fileURLToPath(new URL('../',import.meta.url)))+'/';
const out=process.env.ROUND9_CHECK_OUT;if(!out)throw new Error('ROUND9_CHECK_OUT required');
const result={root,checks:[],traces:[],errors:[]};let browser;
const server=await createServer({root:path.join(root,'demo'),configFile:path.join(root,'vite.config.js'),logLevel:'error',server:{host:'127.0.0.1'}});
try{
 await mkdir(out,{recursive:true});await server.listen(0);
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const mode of ['hdr','mr'])for(const view of ['list','front','angle']){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  await page.goto(server.resolvedUrls.local[0]+'bench.html?manual&dpr=1&'+(view==='list'?'component=packaging&layout=quest':'part=dock&visible=7'));
  await page.waitForFunction(()=>window.ready,null,{timeout:180000});
  const trace=await page.evaluate(async({root,mode,view})=>{
   const THREE=await import(`/@fs/${root}node_modules/three/build/three.module.js`),{InputSystem}=await import(`/@fs/${root}src/core/InputSystem.js`);
   const c=window.contour;c.renderer.setAnimationLoop(null);c.tick(1);
   if(mode==='mr'){
    const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js'));
    (await import(url)).setBackdrop(null);c.scene.background=null;
   }
   const group=()=>new THREE.Group(),obj=c.panel??c.dock;
   const input=new InputSystem({T:obj.T,scene:c.scene,camera:c.camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
   input.xr.forEach(s=>{s.connected=false;s.grip.visible=false;});const src=input.xr[0];src.connected=true;src.hand.joints={};
   const put=(name,world)=>{let j=src.hand.joints[name];if(!j){j=new THREE.Group();j.jointRadius=.008;src.hand.add(j);src.hand.joints[name]=j;}j.position.copy(src.hand.worldToLocal(world.clone()));};
   const step=()=>{c.scene.updateMatrixWorld(true);input.update();c.hands.splice(0,c.hands.length,...input.handPoints);const render=c.renderer.render;c.renderer.render=()=>{};try{c.tick(1);}finally{c.renderer.render=render;}};
   const image=()=>c.pass('beauty');
   if(view==='list'){
    const rows=c.panel.levels[0].rows,at=(i,gap)=>{const r=rows[i],p=new THREE.Vector3();p.z=r.surfaceZ(p)+(.008+gap)/r.getWorldScale(new THREE.Vector3()).z;return r.localToWorld(p);};
    const index=at(0,.020),wrist=index.clone().add(new THREE.Vector3(0,-.155,0));put('wrist',wrist);src.hand.joints.wrist.rotation.x=Math.PI/2;
    for(const [f,x,y,lengths]of [['index',0,.070,[.040,.025,.020]],['middle',.021,.075,[.040,.025,.020]],['ring',.041,.069,[.037,.023,.019]],['pinky',.058,.057,[.030,.020,.017]]]){
     let p=wrist.clone().add(new THREE.Vector3(x,y,0));put(f+'-finger-phalanx-proximal',p);
     const angles=f==='index'?[0,0,0]:[50,90,130];for(let i=0;i<3;i++){const a=angles[i]*Math.PI/180;p=p.clone().add(new THREE.Vector3(0,lengths[i]*Math.cos(a),lengths[i]*Math.sin(a)));put(f+'-finger-'+['phalanx-intermediate','phalanx-distal','tip'][i],p);}
    }
    for(let i=0;i<90;i++)step();const u=c.panel.levels[0].panel.skin.uniforms;
    return {mode,view,hovered:rows.flatMap((r,i)=>r.hovered?[i]:[]),bulges:u.uBulgeCount.value,pressed:rows.filter(r=>r.press.pressed).length,pose:['index','middle','ring','pinky'].map(f=>({finger:f,eligible:input.fingerProximity(src,f+'-finger-tip')})),images:{settled:image()}};
   }
   const d=c.dock,h=d.handle,focus=h.getWorldPosition(new THREE.Vector3()),images={},states=[];
   // Two cameras inspect the same states: normal-size overview and close
   // shape evidence. Magnification is disclosed, never a Quest-scale claim.
   const initial={p:c.camera.position.clone(),q:c.camera.quaternion.clone(),fov:c.camera.fov};
   const camera=close=>{
    if(close){const delta=view==='front'?new THREE.Vector3(0,0,.105):new THREE.Vector3(.065,.016,.091);c.camera.position.copy(focus).add(delta);c.camera.lookAt(focus);c.camera.fov=32;}
    else{c.camera.position.copy(initial.p);c.camera.quaternion.copy(initial.q);c.camera.fov=initial.fov;}
    c.camera.updateProjectionMatrix();c.camera.updateMatrixWorld(true);
   };
   const gl=c.renderer.getContext(),w=gl.drawingBufferWidth,hh=gl.drawingBufferHeight;
   const read=()=>{c.renderer.render(c.scene,c.camera);const b=new Uint8Array(w*hh*4);gl.readPixels(0,0,w,hh,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
   const delta=(a,b)=>{let changed=0,max=0;for(let i=0;i<a.length;i+=4){const q=Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k])));if(q>2)changed++;max=Math.max(max,q);}return{changed,max};};
   const capture=label=>{
    camera(false);images[label+'-overview']=image();camera(true);const on=read();images[label]=image();
    const state={label,pressed:h.press.pressed,owner:h.pressOwner,held:d.rail.held?.id??null,dentMm:h.dent.x*h.inputScale*1000,glow:h.skin.uGlow.value,alpha:h.skin.uBodyOpacity.value,squash:h.skin.uSquash.value};
    if(['press','held'].includes(label)){
     const depth=h.skin.uDent.value.w,squash=h.skin.uSquash.value;h.skin.uDent.value.w=0;h.skin.uSquash.value=0;
     state.geometryDelta=delta(on,read());images[label+'-geometry-off']=image();h.skin.uDent.value.w=depth;h.skin.uSquash.value=squash;
     const glow=h.skin.uGlow.value;h.skin.uGlow.value=0;state.feedbackLightDelta=delta(on,read());images[label+'-feedback-light-off']=image();h.skin.uGlow.value=glow;
     // An opaque finger-sized disk is a diagnostic occluder only. It does
     // not model Quest tracking/hand rendering or establish usability.
     const disk=new THREE.Mesh(new THREE.CircleGeometry(.008,48),new THREE.MeshBasicMaterial({color:0x555555,side:THREE.DoubleSide}));
     h.add(disk);disk.position.set(0,0,h.r+.001);disk.updateMatrixWorld(true);const blocked=read();images[label+'-8mm-mask']=image();
     h.skin.uDent.value.w=0;h.skin.uSquash.value=0;state.maskedGeometryDelta=delta(blocked,read());h.skin.uDent.value.w=depth;h.skin.uSquash.value=squash;
     disk.removeFromParent();disk.geometry.dispose();disk.material.dispose();
    }
    states.push(state);
    // Dock placement uses the camera pose. Restore the real bench camera
    // before the next simulation frame; inspection must not move the Dock.
    camera(false);
   };
   const point=gap=>h.localToWorld(new THREE.Vector3(0,0,h.r+.008+gap));
   capture('rest');for(const gap of [.04,.025,.015,.005]){put('index-finger-tip',point(gap));step();}capture('early');
   put('index-finger-tip',point(-.004));step();capture('press');
   src.selecting=true;for(let i=0;i<60;i++){put('index-finger-tip',point(.005));step();}capture('held');
   src.selecting=false;put('index-finger-tip',point(.005));step();capture('release-hover');
   src.connected=false;for(let i=0;i<120;i++)step();capture('restored');
   return {mode,view,states,images};
  },{root,mode,view});
  for(const [state,data]of Object.entries(trace.images))await writeFile(path.join(out,`${mode}-${view}-${state}.png`),Buffer.from(data.split(',')[1],'base64'));
  delete trace.images;result.traces.push(trace);
  if(view==='list')result.checks.push({name:mode+' complete bent-hand proximity',pass:trace.hovered.length===1&&trace.hovered[0]===0&&trace.bulges===1&&trace.pressed===0});
  else{
   const at=label=>trace.states.find(s=>s.label===label),press=at('press'),held=at('held'),rest=at('restored');
   result.checks.push({name:mode+' '+view+' pressure/held/recovery',pass:press.pressed&&press.dentMm>=4&&held.held==='xr0'&&held.dentMm>=4.99&&held.glow===.8&&held.alpha===.38&&Math.abs(rest.dentMm)<.01&&rest.held===null});
   result.checks.push({name:mode+' '+view+' actual geometry pixels',pass:[press,held].every(s=>s.geometryDelta.changed>100&&s.geometryDelta.max>10&&s.maskedGeometryDelta.changed>20)});
  }
  await page.close();
 }
 await writeFile(path.join(out,'round9.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 if(result.errors.length||result.checks.some(c=>!c.pass))process.exitCode=1;
}finally{await browser?.close();await server.close();}
