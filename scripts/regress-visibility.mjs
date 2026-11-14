// R6 material footprint: actual shader alpha, not a claim of Quest visibility.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(process.env.R6_SOURCE??fileURLToPath(new URL('../',import.meta.url)));
const out=process.env.VISIBILITY_CHECK_OUT;
const result={root,checks:[],traces:{},errors:[]};
const check=(name,pass)=>result.checks.push({name,pass});
const server=await createServer({root:path.join(root,'demo'),configFile:path.join(root,'vite.config.js'),logLevel:'error',server:{host:'127.0.0.1'}});
let browser;
try{
 await server.listen(0);
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:800,height:600}});
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await page.goto(server.resolvedUrls.local[0]+'bench.html?manual&component=packaging&layout=quest');
 await page.waitForFunction(()=>window.ready,null,{timeout:180000});
 const capture=await page.evaluate(async root=>{
  const THREE=await import(`/@fs${root}/node_modules/three/build/three.module.js`);
  const {BubbleHandle}=await import(`/@fs${root}/src/components/BubbleHandle.js`);
  const {DockIcon}=await import(`/@fs${root}/src/components/DockIcon.js`);
  const look=await import(`/@fs${root}/src/core/look.js`);
  const c=window.contour;c.renderer.setAnimationLoop(null);look.setBackdrop(null);
  for(const url of new Set(performance.getEntriesByType('resource').map(r=>r.name).filter(u=>u.includes('/src/core/look.js'))))(await import(url)).setBackdrop(null);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(25,800/600,.01,2),target=new THREE.WebGLRenderTarget(800,600);
  c.renderer.setClearColor(0,0);c.renderer.setRenderTarget(target);
  const samples={};
  for(const kind of ['side','corner','dock-sphere','dock-icon']){
   const icon=kind==='dock-icon';
   const h=icon?new DockIcon(c.panel.T,{icon:'house',label:'House'},.4):new BubbleHandle(c.panel.T,{width:kind==='dock-sphere'?70:32,height:kind==='side'?64:32,distance:.4,rectangular:kind==='side',reveal:true});
   scene.add(h);const centre=icon?h.centre:new THREE.Vector3(),radius=icon?h.rb:h.r;
   const point=centre.clone().add(new THREE.Vector3(0,0,radius+.02));
   for(let i=0;i<120;i++){h.feed({kind:'poke',id:'finger',point,radius:.008,pressOffset:.01});if(icon)h.sense();h.update(1/60);}
   if(icon){h.holder.visible=false;h.nameTag.visible=false;}
   camera.position.copy(centre).add(new THREE.Vector3(0,0,radius*8));camera.lookAt(centre);camera.updateMatrixWorld(true);
   scene.updateMatrixWorld(true);c.renderer.render(scene,camera);
   const rgba=new Uint8Array(9*9*4);c.renderer.readRenderTargetPixels(target,396,296,9,9,rgba);
   const alpha=[];for(let i=3;i<rgba.length;i+=4)alpha.push(rgba[i]);alpha.sort((a,b)=>a-b);
   samples[kind]={hasEnvUniform:h.skin.uHasEnv.value,medianAlpha:alpha[40],minimumAlpha:alpha[0],maximumAlpha:alpha.at(-1),visible:icon?h.bubble.visible:h.affordance.visible,hasEnv:Object.hasOwn(h.body?.children?.[0]?.material?.defines??h.bubble?.children?.[0]?.material?.defines??{},'ENVMAP_TYPE_CUBE_UV')};
   scene.remove(h);
  }
  const w=.12,h=.10,t=.004,mat=look.glassMaterial(c.panel.T,{w,h,t,r:.01}),mesh=new THREE.Mesh(look.glassSlabGeometry(w,h,t,.01,{tessellate:.002}),mat);scene.add(mesh);
  camera.position.set(0,0,.3);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const alphaAt=(x,y)=>{const pos=new THREE.Vector3(x,y,t).project(camera),pixel=new Uint8Array(4);c.renderer.render(scene,camera);c.renderer.readRenderTargetPixels(target,Math.round((pos.x+1)*400),Math.round((pos.y+1)*300),1,1,pixel);return pixel[3];};
  const rest=alphaAt(0,0),outsideRest=alphaAt(.05,0);
  look.setBulge(mat,0,{x:0,y:0,hw:.025,hh:.02,r:.008,height:.006,scale:1});
  const raised=alphaAt(0,0),outsideRaised=alphaAt(.05,0);
  samples.raisedRow={rest,raised,outsideRest,outsideRaised,tokenAlpha:c.panel.T.get('material.opacity.default')};
  scene.remove(mesh);
  for(const kind of ['lens','bead']){const m=look.glassMaterial(c.panel.T,{w,h,t,r:.01,kind}),b=new THREE.Mesh(mesh.geometry,m);m.uniforms.uFade.value=1;scene.add(b);samples[kind]={alpha:alphaAt(0,0)};scene.remove(b);}
  c.renderer.setRenderTarget(null);target.dispose();
  return samples;
 },root);
 result.traces.bubbles=capture;
 for(const name of ['side','corner','dock-sphere','dock-icon']){const s=capture[name];
  check(name+' has a visible but translucent no-env centre',s.visible&&s.medianAlpha>=64&&s.medianAlpha<220);
  check(name+' actually uses no environment shader',!s.hasEnv);
 }
 const row=capture.raisedRow;
 check('raised row strengthens alpha only inside the bubble',row.raised>row.rest+8&&row.outsideRest===row.outsideRaised&&Math.abs(row.rest-row.tokenAlpha*255)<2);
 check('lens and bead bubbles are stronger than the unchanged window',capture.lens.alpha>row.rest+8&&capture.bead.alpha>row.rest+8);
 await page.close();
 console.log(JSON.stringify(result,null,2));
 if(out){await mkdir(out,{recursive:true});await writeFile(path.join(out,'visibility.json'),JSON.stringify(result,null,2));}
 if(result.checks.some(c=>!c.pass)||result.errors.length)process.exitCode=1;
}finally{if(browser)await browser.close();await server.close();}
