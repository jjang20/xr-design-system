// Actual built desktop GL/pointer/glyph evidence. No native XR or uploads.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright-core';
const out=resolve(process.env.R06_OUTPUT??'shots/r06-dock-content');mkdirSync(out,{recursive:true});
const report={kind:'actual built desktop GL/pointer/glyphs; Quest UNKNOWN',checks:[],errors:[],requests:[],pages:[],cleanup:{}};
let server,browser;
try{
 server=await preview({configFile:'vite.config.js',logLevel:'error',preview:{host:'127.0.0.1',port:0,strictPort:true}});report.url=server.resolvedUrls.local[0]+'dock-content-comparison.html';
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`);});page.on('request',r=>report.requests.push({method:r.method(),url:r.url()}));
 await page.goto(report.url);await page.waitForFunction(()=>window.dockContentComparison);
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const settle=async()=>{await page.waitForFunction(()=>{let ready=true;window.dockContentComparison.comparison.traverse(o=>{let visible=true;for(let p=o;p;p=p.parent)visible&&=p.visible;if(typeof o.sync==='function'&&typeof o.text==='string'&&visible)ready&&=o.textRenderInfo?.parameters.text===o.text;});return ready;});await frame();};
 const state=()=>page.evaluate(()=>window.dockContentComparison.comparison.snapshot());
 const point=(side,index=0,back=false)=>page.evaluate(({side,index,back})=>{const a=window.dockContentComparison,s=a.comparison.sides[side],t=back?s.pane.back:s.targets[index];return a.screenOf(t,t.position.clone().set(0,t.rb??0,t.rb??t.t??0));},{side,index,back});
 const click=async p=>{await page.mouse.move(p.x,p.y);await frame();await page.mouse.down();await frame();await page.mouse.up();await settle();};
 const select=async(side,index)=>click(await point(side,index));
 const back=async side=>click(await point(side,0,true));
 const layout=()=>page.evaluate(()=>{
  const a=window.dockContentComparison;a.renderer.render(a.scene,a.camera);const gl=a.renderer.getContext();
  const pixel=p=>{const v=new Uint8Array(4);gl.readPixels(Math.round(p.x),gl.drawingBufferHeight-1-Math.round(p.y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,v);return [...v];};
  return Object.fromEntries(Object.entries(a.comparison.sides).map(([key,s])=>{
   const glyphs=[];s.group.traverse(t=>{let visible=true;for(let p=t;p;p=p.parent)visible&&=p.visible;if(typeof t.sync!=='function'||typeof t.text!=='string'||!visible)return;const b=t.textRenderInfo?.blockBounds;if(!b)return;const p=s.pane.worldToLocal(t.getWorldPosition(t.position.clone())),scale=t.getWorldScale(t.scale.clone()).divide(s.pane.getWorldScale(t.scale.clone()));const screen=[a.screenOf(t,t.position.clone().set(b[0],b[1],0)),a.screenOf(t,t.position.clone().set(b[2],b[3],0))];let inPane=false;for(let parent=t;parent;parent=parent.parent)inPane||=parent===s.pane;glyphs.push({text:t.text,ready:t.textRenderInfo?.parameters.text===t.text,block:b,position:p.toArray(),scale:scale.toArray(),screen,inPane,dockCaption:!!t.userData.dockCaption});});
   const targets=[...s.targets,...(s.pane.visible?[s.pane.back]:[])].map(t=>{const mesh=t.hitMeshes[0];mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;return {label:t.app?.label??t.label.text,screen:[a.screenOf(mesh,b.min),a.screenOf(mesh,b.max)],centre:a.screenOf(t,t.position.clone().set(0,t.rb??0,t.rb??t.t??0))};});
   return[key,{content:s.content,pane:[s.pane.w,s.pane.h],glyphs,targets,
    photo:s.content?.id==='photos'?{aspect:s.pane.photo.geometry.parameters.width/s.pane.photo.geometry.parameters.height,image:[s.pane.photo.material.map.image.width,s.pane.photo.material.map.image.height],pixels:[-.13,0,.13].map(x=>pixel(a.screenOf(s.pane.photo,s.pane.photo.position.clone().set(x,0,0))))}:null,
    footprints:s.content?.id==='measure'?s.pane.footprints.map(f=>({width:f.width,height:f.height,widthCm:f.widthCm,depthCm:f.depthCm,pixels:[pixel(a.screenOf(f.mesh)),pixel(a.screenOf(f.mesh,f.mesh.position.clone().set(f.width/2+.01,0,0)))]})):null}];
  }));
 });
 const checkLayout=values=>{for(const l of Object.values(values)){
  assert.ok(l.glyphs.length>=7,'all seven labels present');for(const g of l.glyphs){assert.ok(g.ready,`glyph ready ${g.text}`);for(const p of g.screen)assert.ok(p.x>0&&p.x<1600&&p.y>100&&p.y<970,`glyph viewport ${g.text}: ${JSON.stringify(p)}`);if(g.inPane){const b=g.block,p=g.position,s=g.scale;assert.ok(p[0]+b[0]*s[0]>=-l.pane[0]/2-1e-6&&p[0]+b[2]*s[0]<=l.pane[0]/2+1e-6,`horizontal pane fit ${g.text}`);assert.ok(p[1]+b[1]*s[1]>=-l.pane[1]/2-1e-6&&p[1]+b[3]*s[1]<=l.pane[1]/2+1e-6,`vertical pane fit ${g.text}`);}}
  const captions=l.glyphs.filter(g=>g.dockCaption).sort((a,b)=>a.screen[0].x-b.screen[0].x);for(let i=1;i<captions.length;i++)assert.ok(captions[i].screen[0].x>captions[i-1].screen[1].x+2,`adjacent Dock labels separated: ${captions[i-1].text}/${captions[i].text}`);
  if(l===values.contour)assert.equal(captions.length,7,'all seven permanent Dock labels checked');
  assert.ok(l.targets.length>=7);for(const t of l.targets)for(const p of t.screen)assert.ok(p.x>0&&p.x<1600&&p.y>100&&p.y<970,`finite visible target ${t.label}`);
  if(l.photo){assert.equal(l.photo.aspect,2);assert.deepEqual(l.photo.image,[1024,512]);assert.ok(new Set(l.photo.pixels.map(p=>p.join(','))).size>=2,'actual photo image colors');}
  for(const f of l.footprints??[]){assert.ok(Math.abs(f.width/f.height-f.widthCm/f.depthCm)<1e-10);assert.ok(Math.max(...f.pixels[0].slice(0,3).map((v,i)=>Math.abs(v-f.pixels[1][i])))>30,'actual footprint pixels');}
 }};
 await settle();report.initial=await state();report.initialLayout=await layout();checkLayout(report.initialLayout);await page.screenshot({path:`${out}/initial.png`});report.checks.push('initial seven finite targets and synced labels fit both sides');
 const ids=['planner','measure','scan','photos','settings','notes','clock'];
 await page.evaluate(()=>{window.dockEvents=[];window.dockContentComparison.comparison.addEventListener('select',e=>window.dockEvents.push([e.side,e.app.id]));});
 for(const [i,id]of ids.entries()){
  for(const side of ['flat','contour']){await select(side,i);assert.equal((await state())[side].id,id);}
  const l=await layout();report.pages.push(l);checkLayout(l);if(id!=='clock')assert.deepEqual(l.flat.content,l.contour.content);
  await page.screenshot({path:`${out}/${id}.png`});
  if(id==='clock')assert.equal(l.flat.content.timeZone,await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone));
 }
 report.checks.push('public pointer acquisition opens all seven distinct real pages; equal layout, captions, photo aspect and footprint pixels');
 const before=await page.evaluate(()=>dockEvents.length);await select('contour',6);assert.equal(await page.evaluate(()=>dockEvents.length),before+1);assert.equal((await state()).contour.id,'clock');await back('flat');assert.equal((await state()).flat,null);assert.equal((await state()).contour.id,'clock');await back('contour');assert.deepEqual(await state(),report.initial);report.checks.push('repeat callback and local Back without duplicate panes or peer change');
 const p=await point('flat',3);await page.mouse.move(p.x,p.y);await frame();await page.mouse.down();await frame();assert.equal(await page.evaluate(()=>dockContentComparison.comparison.sides.flat.targets[3].press.pressed),true);await page.evaluate(()=>{const c=document.querySelector('body>canvas');if(!c.hasPointerCapture(1))throw Error('missing actual capture');c.releasePointerCapture(1);});await frame();await page.mouse.up();await settle();assert.deepEqual(await state(),report.initial);report.checks.push('actual pointer capture loss cancels before content opening');
 await select('flat',5);await select('contour',0);const committed=await state();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await settle();assert.deepEqual(await state(),committed);report.checks.push('page input loss retains each committed pane');
 const resetPoint=await page.evaluate(()=>{const a=window.dockContentComparison;return a.screenOf(a.comparison.resetControl);});await click(resetPoint);assert.deepEqual(await state(),report.initial);report.checks.push('visible scene Reset closes both panes');
 await page.emulateMedia({reducedMotion:'reduce'});for(const side of ['flat','contour'])await select(side,1);report.reduced=await layout();checkLayout(report.reduced);await page.screenshot({path:`${out}/reduced-measure.png`});report.checks.push('reduced-motion actual content and glyph output');
 assert.equal(await page.evaluate(()=>dockContentComparison.renderer.xr.isPresenting),false);assert.equal(await page.evaluate(()=>dockContentComparison.renderer.getContext().isContextLost()),false);assert.ok(report.requests.every(r=>r.method==='GET'));assert.deepEqual(report.errors,[]);report.checks.push('actual desktop GL, no XR/POST/browser errors');
 await page.evaluate(()=>dockContentComparison.dispose());assert.equal(await page.locator('body>canvas').count(),0);report.checks.push('owned entry resources disposed');report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}
finally{if(browser){await browser.close();report.cleanup.browserClosed=true;}if(server){await new Promise(r=>server.httpServer.close(r));report.cleanup.serverClosed=true;}writeFileSync(`${out}/desktop.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:!!report.pass,checks:report.checks,errors:report.errors,failure:report.failure,cleanup:report.cleanup}));}
