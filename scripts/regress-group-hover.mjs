// Real InputSystem -> row state -> shared glass shader, with synthetic tips.
// Desktop rendering is not Quest optics or frame-time acceptance.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
const root=process.env.GROUP_SOURCE ?? fileURLToPath(new URL('../',import.meta.url));
const out=process.env.GROUP_CHECK_OUT;
const expected=Number(process.env.GROUP_EXPECT_HOVERS ?? 1);
const kinds=process.env.GROUP_KINDS?.split(',')??['list','toolbar','dock'];
if(kinds.some(k=>!['list','toolbar','dock'].includes(k)))throw new Error('Unknown group fixture');
const result={source:root,expected,kinds,checks:[],cases:[],errors:[]};
const reservation=net.createServer();
await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
const port=reservation.address().port;
await new Promise((resolve,reject)=>reservation.close(e=>e?reject(e):resolve()));
const server=await createServer({root:path.join(root,'demo'),configFile:path.join(root,'vite.config.js'),logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port,strictPort:true}});
let browser;
try {
 await server.listen();
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 if(out)await mkdir(out,{recursive:true});
 for(const kind of kinds)for(const mode of ['hdr','noenv'])for(const reduced of [false,true]) {
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:reduced?'reduce':'no-preference'});
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  try {
   await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/bench.html?manual&${kind==='dock'?'part=dock&visible=7':'component=packaging&layout=quest'}`);
   await page.waitForFunction(()=>window.ready,null,{timeout:90000});
   const state=await page.evaluate(async({root,mode,kind})=>{
    const THREE=await import(`/@fs/${root}/node_modules/three/build/three.module.js`);
    const {InputSystem}=await import(`/@fs/${root}/src/core/InputSystem.js`);
    const c=window.contour;c.renderer.setAnimationLoop(null);c.tick(180,1/90);
    if(mode==='noenv'){(await import(`/@fs/${root}/src/core/look.js`)).setBackdrop(null);c.scene.background=null;}
    const group=()=>new THREE.Group();let p=kind==='dock'?c.dock:c.panel;const T=p.T;
    if(kind==='toolbar'){
     const {Toolbar}=await import(`/@fs/${root}/src/components/Toolbar.js`);
     const toolbar=new Toolbar(p.T,{tools:['A','B','C'].map(label=>({label,width:80}))});
     toolbar.position.copy(p.position);toolbar.quaternion.copy(p.quaternion);toolbar.scale.copy(p.scale);
     c.scene.remove(p);c.scene.add(toolbar);p=toolbar;c.scene.updateMatrixWorld(true);
     const labels=[];p.traverse(o=>{if('textRenderInfo' in o)labels.push(o);});
     const deadline=performance.now()+15000;
     while(labels.some(t=>!t.textRenderInfo)){if(performance.now()>deadline)throw new Error('toolbar font deadline');await new Promise(r=>setTimeout(r,20));}
    }
    const input=new InputSystem({T,scene:c.scene,camera:c.camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
    input.xr.forEach(s=>{s.connected=false;s.grip.visible=false;});
    const s=input.xr[0];s.connected=true;s.handSource=true;s.hand.joints={};
    const tips=['index-finger-tip','middle-finger-tip'].map(name=>{const j=new THREE.Group();j.jointRadius=.008;s.hand.add(j);s.hand.joints[name]=j;return j;});
    const rows=p.icons ?? p.buttons ?? p.levels[0].rows,glass=p.bar ?? p.levels?.[0].panel;
    const targets=kind==='dock'?[rows[2],rows[4]]:rows;
    const put=(i,gap)=>{const r=targets[i],v=new THREE.Vector3();if(kind==='dock'){v.copy(r.centre).z+=r.rb+(.008+gap)/r.inputScale;tips[i].position.copy(r.localToWorld(v));return;}v.z=(r.press.pressed?r.pokeFront:r.surfaceZ(v))+(.008+gap)/r.getWorldScale(new THREE.Vector3()).z;tips[i].position.copy(r.localToWorld(v));};
    const step=()=>{c.scene.updateMatrixWorld(true);input.update();if(kind==='dock')p.update(1/90,c.camera,input.handPoints);else p.update(1/90);c.scene.updateMatrixWorld(true);};
    const state=()=>({hovered:rows.map(r=>r.hovered),pressed:targets.map(r=>r.press.pressed),bulges:rows.map(r=>r.bulge??r.grow?.x),glow:targets.map(r=>r.glow??r.skin.uGlow.value),shaderCount:kind==='dock'?rows.filter(r=>r.bubble.visible).length:glass.skin.uniforms.uBulgeCount.value,shaderGlow:kind==='dock'?rows.map(r=>r.skin.uGlow.value):glass.skin.uniforms.uBulgeGlow.value.map(v=>v.y),names:kind==='dock'?rows.map(r=>r.nameTag.visible):undefined,scales:kind==='dock'?p.scales:undefined});
    put(0,.04);put(1,.055);for(let i=0;i<180;i++)step();window.groupReplay={put,step,state,input,rows};return state();
   },{root,mode,kind});
   const name=`${kind}-${mode}-${reduced?'reduced':'normal'}`;
   result.checks.push({name:name+' sustained proximity',pass:state.hovered.filter(Boolean).length===expected && state.shaderCount===expected});
   const capture=async label=>{if(out){const png=await page.evaluate(()=>window.contour.pass('beauty'));await writeFile(path.join(out,`${name}-${label}.png`),Buffer.from(png.split(',')[1],'base64'));}};
   await capture('hover');
   const contact=await page.evaluate(()=>{const r=window.groupReplay;for(const gap of [.04,.025,.01,.005,.001,-.003]){r.put(0,gap);r.put(1,gap);r.step();}for(let i=0;i<30;i++){r.put(0,-.003);r.put(1,-.003);r.step();}return r.state();});
   result.checks.push({name:name+' two physical contacts',pass:contact.pressed[0] && contact.pressed[1] && contact.glow[0]>0 && contact.glow[1]>0 && contact.shaderCount>=2});
   await capture('contact');result.cases.push({name,state,contact});
  }finally{await page.close();}
 }
 result.checks.push({name:'no browser errors',pass:result.errors.length===0});
 if(result.checks.some(c=>!c.pass))process.exitCode=1;
}catch(e){result.failure=String(e.stack??e);process.exitCode=1;}
finally{await browser?.close();await server.close();result.cleanedUp=true;if(out)await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
