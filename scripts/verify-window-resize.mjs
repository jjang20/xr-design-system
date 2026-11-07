// Finite desktop pointer + actual font/layout check, no XR session or upload.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const out=resolve(process.env.R02_OUTPUT??'shots/r02-resize');mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],requests:[],cleanup:{},kind:'desktop actual GL/pointer/text; no headset'};let server,browser;
try {
 server=await createServer({configFile:'vite.config.js',logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:true}});await server.listen();
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`);});page.on('request',r=>report.requests.push({method:r.method(),url:r.url()}));
 report.url=server.resolvedUrls.local[0]+'window-resize-comparison.html';await page.goto(report.url);await page.waitForFunction(()=>window.windowResizeComparison,null,{timeout:30000});
 const state=()=>page.evaluate(()=>Object.fromEntries(Object.entries(window.windowResizeComparison.comparison.windows).map(([k,w])=>[k,{...w.result,owner:w.owner?.id??null}])));
 const point=key=>page.evaluate(key=>{const a=window.windowResizeComparison;return a.screenOf(a.comparison.windows[key].handles[1]);},key);
 const endPoint=(key,factor)=>page.evaluate(({key,factor})=>{const a=window.windowResizeComparison,w=a.comparison.windows[key],h=w.handles[1],local=h.position.clone().multiplyScalar(factor);return a.screenOf(w,local);},{key,factor});
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await frame();report.initial=await state();
 for(const s of Object.values(report.initial)){assert.equal(s.q,1);assert.equal(s.textReady,true);assert.equal(s.headerFits,true);assert.equal(s.fullVisibleIds.length,5);assert.equal(s.partial,false);assert.equal(s.horizontalOverflow,false);}
 report.checks.push('actual-synced-font-header-five-whole-rows');await page.screenshot({path:`${out}/initial.png`});
 for(const key of ['flat','contour']) {
  const start=await point(key),end=await endPoint(key,1.6);await page.mouse.move(start.x,start.y);await frame();assert.equal((await state())[key].q,1);await page.mouse.down();await frame();await page.mouse.move(end.x,end.y,{steps:20});await frame();
  const held=(await state())[key];assert.equal(held.q,22/15);assert.equal(held.fullVisibleIds.length,6);assert.equal(held.headerFits,true);assert.equal(held.horizontalOverflow,false);assert.equal(held.partial,false);assert.ok(held.owner);report[`${key}Held`]=held;
  await page.screenshot({path:`${out}/${key}-held-max.png`});await page.mouse.up();await frame();assert.equal((await state())[key].q,held.q);assert.equal((await state())[key].owner,null);
 }
 report.checks.push('both-actual-pointer-drag-grow-five-to-six-with-release');
 const matched=await state();for(const field of ['width','height','titleSize','pitch','fullVisibleIds','viewport'])assert.deepEqual(matched.flat[field],matched.contour[field]);report.matched=matched;report.checks.push('equal-q-matched-metrics-and-measured-fit');
 await page.screenshot({path:`${out}/both-max.png`});
 await page.locator('#reset').click();await frame();for(const s of Object.values(await state()))assert.equal(s.q,1);report.checks.push('DOM-reset');
 const start=await point('flat'),middle=await endPoint('flat',1.2);await page.mouse.move(start.x,start.y);await page.mouse.down();await frame();await page.mouse.move(middle.x,middle.y,{steps:10});await frame();const before=(await state()).flat.q;
 await page.evaluate(()=>document.querySelector('body>canvas').releasePointerCapture(1));await frame();await page.mouse.move(middle.x+70,middle.y-50);await frame();assert.equal((await state()).flat.q,before);assert.equal((await state()).flat.owner,null);await page.mouse.move(25,25);await page.mouse.up();await frame();report.checks.push('actual-pointer-capture-loss-keeps-size');
 const regrab=await point('flat'),regrow=await endPoint('flat',1.1);await page.mouse.move(regrab.x,regrab.y);await page.mouse.down();await frame();await page.mouse.move(regrow.x,regrow.y,{steps:10});await frame();assert.ok((await state()).flat.q>before);await page.mouse.up();await frame();report.checks.push('empty-space-pointerup-then-fresh-drag-rearms');
 await page.evaluate(()=>window.windowResizeComparison.comparison.resetSizes());await frame();
 const c=await page.evaluate(()=>{const a=window.windowResizeComparison;return a.screenOf(a.comparison.resetControl);});
 // Resize first, then use the actual in-scene reset control.
 const p=await point('contour'),q=await endPoint('contour',1.25);await page.mouse.move(p.x,p.y);await page.mouse.down();await frame();await page.mouse.move(q.x,q.y,{steps:10});await page.mouse.up();await frame();await page.mouse.move(c.x,c.y);await page.waitForTimeout(100);await page.mouse.down();await page.waitForTimeout(80);await page.mouse.up();await page.waitForTimeout(100);assert.equal((await state()).contour.q,1);report.checks.push('actual-scene-reset');
 await page.emulateMedia({reducedMotion:'reduce'});await frame();report.reduced=await state();assert.equal(report.reduced.flat.fullVisibleIds.length,5);report.checks.push('reduced-state-layout-not-comfort');
 await page.screenshot({path:`${out}/reset-reduced.png`});assert.equal(await page.evaluate(()=>window.windowResizeComparison.renderer.xr.isPresenting),false);assert.deepEqual(report.errors,[]);assert.ok(report.requests.every(r=>r.method==='GET'));report.checks.push('no-errors-POST-XR');
 await page.evaluate(()=>window.windowResizeComparison.dispose());assert.equal(await page.locator('body>canvas').count(),0);report.checks.push('dispose-removes-owned-canvas');report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}
finally{await browser?.close();await server?.close();report.cleanup={browserClosed:!!browser,serverClosed:!!server,retainedPreviewsUntouched:true};writeFileSync(`${out}/checks.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:!!report.pass,checks:report.checks,errors:report.errors,failure:report.failure,cleanup:report.cleanup}));}
