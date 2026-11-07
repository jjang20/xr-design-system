// Actual built desktop GL/pointer/glyph evidence, without native XR or uploads.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright-core';
const out=resolve(process.env.R05_OUTPUT??'shots/r05-hierarchy');mkdirSync(out,{recursive:true});
const report={kind:'actual built desktop GL, pointer and glyphs; Quest UNKNOWN',checks:[],errors:[],requests:[],details:[],cleanup:{}};
let server,browser;
try{
 server=await preview({configFile:'vite.config.js',logLevel:'error',preview:{host:'127.0.0.1',port:0,strictPort:true}});report.url=server.resolvedUrls.local[0]+'hierarchy-comparison.html';
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`);});page.on('request',r=>report.requests.push({method:r.method(),url:r.url()}));
 await page.goto(report.url);await page.waitForFunction(()=>window.hierarchyComparison);
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const settle=async()=>{await page.waitForFunction(()=>Object.values(window.hierarchyComparison.comparison.sides).every(s=>s.panel.settled),null,{timeout:10000});await page.waitForFunction(()=>{let ready=true;window.hierarchyComparison.comparison.traverse(o=>{if(typeof o.sync==='function'&&typeof o.text==='string'&&o.visible)ready&&=o.textRenderInfo?.parameters.text===o.text;});return ready;});await frame();};
 const state=()=>page.evaluate(()=>window.hierarchyComparison.comparison.snapshot());
 const point=(side,index=0,back=false)=>page.evaluate(({side,index,back})=>{
  const a=window.hierarchyComparison,p=a.comparison.sides[side].panel,l=p.levels.at(back&&side==='contour'?-2:-1),t=back?(side==='flat'?l.backControl:l.panel):l.rows[index];
  const v=t.position.clone().set(0,back&&side==='contour'?t.h/2-l.size.titleBand/2:0,t.t??0);return a.screenOf(t,v);
 },{side,index,back});
 const click=async p=>{await page.mouse.move(p.x,p.y);await frame();await page.mouse.down();await frame();await page.mouse.up();await settle();};
 const select=async(side,index=0)=>click(await point(side,index));
 const back=async side=>click(await point(side,0,true));
 const reset=async()=>{await page.click('#reset');await settle();};
 const layout=()=>page.evaluate(()=>{
  const a=window.hierarchyComparison;a.renderer.render(a.scene,a.camera);const gl=a.renderer.getContext();const pixel=p=>{const v=new Uint8Array(4);gl.readPixels(Math.round(p.x),gl.drawingBufferHeight-1-Math.round(p.y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,v);return [...v];};return Object.fromEntries(Object.entries(a.comparison.sides).map(([key,s])=>{
   const l=s.panel.levels.at(-1),glyphs=[];l.group.traverse(t=>{if(typeof t.sync==='function'&&typeof t.text==='string'&&t.visible){const p=l.group.worldToLocal(t.getWorldPosition(t.position.clone())),scale=t.getWorldScale(t.scale.clone()).divide(l.group.getWorldScale(t.scale.clone()));glyphs.push({text:t.text,ready:t.textRenderInfo?.parameters.text===t.text,block:t.textRenderInfo?.blockBounds,position:p.toArray(),scale:scale.toArray()});}});
   const targets=[...l.rows,...(l.backControl?[l.backControl]:[])].map(t=>{const m=t.hitMeshes[0];m.geometry.computeBoundingBox();const b=m.geometry.boundingBox;return{screen:[a.screenOf(m,b.min),a.screenOf(m,b.max)],w:t.w,h:t.h};});
   return[key,{path:s.panel.levels.map(x=>x.item.id??x.item.label),pane:[l.size.W,l.size.H],glyphs,targets,detail:l.detail??null,footprint:l.footprint?{position:l.footprint.position.toArray(),width:l.detail.footprint.width,height:l.detail.footprint.height,pixels:[pixel(a.screenOf(l.footprint)),pixel(a.screenOf(l.footprint,l.footprint.position.clone().set(l.detail.footprint.width/2+.006,0,0)))]}:null}];
  }));
 });
 const checkLayout=values=>{for(const l of Object.values(values)){
  assert.ok(l.glyphs.length>0,'glyph enumeration cannot be empty');for(const g of l.glyphs){assert.ok(g.ready,`actual glyph ready ${g.text}`);const b=g.block,p=g.position,s=g.scale;assert.ok(b&&p[0]+b[0]*s[0]>=-l.pane[0]/2-1e-6&&p[0]+b[2]*s[0]<=l.pane[0]/2+1e-6,`horizontal glyph fit ${g.text}`);assert.ok(p[1]+b[1]*s[1]>=-l.pane[1]/2-1e-6&&p[1]+b[3]*s[1]<=l.pane[1]/2+1e-6,`vertical glyph fit ${g.text}`);}
  for(const t of l.targets)for(const p of t.screen)assert.ok(p.x>0&&p.x<1440&&p.y>0&&p.y<1000,'finite target fully in initial view');
  if(l.footprint){const f=l.footprint;assert.ok(Math.max(...f.pixels[0].slice(0,3).map((v,i)=>Math.abs(v-f.pixels[1][i])))>30,'actual diagram pixels must differ from surrounding pane');assert.ok(Math.abs(f.position[0])+f.width/2<l.pane[0]/2&&Math.abs(f.position[1])+f.height/2<l.pane[1]/2);const dim=l.glyphs.find(g=>g.text===l.detail.dimensions),caption=l.glyphs.find(g=>g.text==='Demo catalog');assert.ok(dim.position[1]+dim.block[1]>f.position[1]+f.height/2,'dimensions clear diagram');assert.ok(caption.position[1]+caption.block[3]<f.position[1]-f.height/2,'caption clear diagram');const b=l.glyphs.find(g=>g.text==='Back');if(b)assert.ok(b.position[1]+b.block[3]<caption.position[1]+caption.block[1],'Back clear caption');}
 }};
 await settle();report.initial=await state();report.initialLayout=await layout();checkLayout(report.initialLayout);await page.screenshot({path:`${out}/initial.png`});report.checks.push('initial actual glyphs and finite target viewport');
 const expected=[['lounge-chair',0,0,'78 × 82 cm'],['dining-chair',0,1,'46 × 52 cm'],['coffee-table',1,0,'100 × 55 cm'],['side-table',1,1,'45 × 45 cm']];
 for(const [id,category,item,dimensions]of expected){
  await reset();for(const side of ['flat','contour']){await select(side,category);assert.equal((await state())[side].path.length,2);await select(side,item);assert.equal((await state())[side].content.id,id);}
  const l=await layout();report.details.push(l);checkLayout(l);assert.deepEqual(l.flat.detail,l.contour.detail);assert.ok(l.flat.glyphs.some(g=>g.text===dimensions));assert.ok(l.contour.glyphs.some(g=>g.text==='Demo catalog'));
  await page.screenshot({path:`${out}/${id}.png`});
  for(const side of ['flat','contour']){await back(side);assert.deepEqual((await state())[side].path,['Catalog',category?'tables':'chairs']);await back(side);assert.deepEqual((await state())[side].path,['Catalog']);}
 }
 report.checks.push('four equal substantive details via actual pointer, parent Back twice, actual glyph and diagram clearance');
 await reset();const p=await point('flat');await page.mouse.move(p.x,p.y);await frame();await page.mouse.down();await frame();assert.equal(await page.evaluate(()=>window.hierarchyComparison.comparison.sides.flat.panel.levels[0].rows[0].press.pressed),true);
 await page.evaluate(()=>{const c=document.querySelector('body>canvas');if(!c.hasPointerCapture(1))throw Error('missing actual capture');c.releasePointerCapture(1);});await frame();await page.mouse.up();await settle();assert.deepEqual(await state(),report.initial);report.checks.push('actual pointer capture loss cancels without navigation');
 await select('flat');await select('flat');const committed=await state();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await settle();assert.deepEqual(await state(),committed);report.checks.push('page loss preserves committed content');
 await reset();const resetPoint=await page.evaluate(()=>{const a=window.hierarchyComparison;return a.screenOf(a.comparison.resetControl);});await select('contour');await click(resetPoint);assert.deepEqual(await state(),report.initial);report.checks.push('in-scene Reset roots both sides');
 await page.emulateMedia({reducedMotion:'reduce'});for(const side of ['flat','contour']){await select(side,1);await select(side,0);}report.reduced=await layout();checkLayout(report.reduced);await page.screenshot({path:`${out}/reduced-coffee.png`});report.checks.push('reduced motion settled actual content');
 assert.equal(await page.evaluate(()=>window.hierarchyComparison.renderer.xr.isPresenting),false);assert.equal(await page.evaluate(()=>window.hierarchyComparison.renderer.getContext().isContextLost()),false);assert.ok(report.requests.every(r=>r.method==='GET'));assert.deepEqual(report.errors,[]);report.checks.push('live desktop GL no native XR no POST no browser errors');
 await page.evaluate(()=>window.hierarchyComparison.dispose());assert.equal(await page.locator('body>canvas').count(),0);report.checks.push('owned resources disposed');report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}
finally{if(browser){await browser.close();report.cleanup.browserClosed=true;}if(server){await new Promise(r=>server.httpServer.close(r));report.cleanup.serverClosed=true;}writeFileSync(`${out}/desktop.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:!!report.pass,checks:report.checks,errors:report.errors,failure:report.failure,cleanup:report.cleanup}));}
