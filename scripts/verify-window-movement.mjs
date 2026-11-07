// Bounded built-desktop GL/pointer/text evidence. No XR session, upload or participant capture.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright-core';
const out=resolve(process.env.R04_OUTPUT??'shots/r04-movement');mkdirSync(out,{recursive:true});
const report={kind:'actual built desktop GL/pointer/text; Quest not tested',checks:[],errors:[],requests:[],cleanup:{}};
let server,browser;
try {
  server=await preview({configFile:'vite.config.js',logLevel:'error',preview:{host:'127.0.0.1',port:0,strictPort:true}});
  report.url=server.resolvedUrls.local[0]+'window-movement-comparison.html';
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`);});page.on('request',r=>report.requests.push({method:r.method(),url:r.url()}));
  await page.goto(report.url);await page.waitForFunction(()=>window.windowMovementComparison,null,{timeout:30000});
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const state=()=>page.evaluate(()=>Object.fromEntries(Object.entries(window.windowMovementComparison.comparison.windows).map(([k,w])=>[k,{position:w.position.toArray(),rotation:w.quaternion.toArray(),scale:w.scale.toArray(),owner:w.owner?.id??null,target:w.target.getWorldPosition(w.position.clone()).toArray(),font:w.title.fontSize}])));
  const point=(key,region='target')=>page.evaluate(({key,region})=>{
    const a=window.windowMovementComparison,w=a.comparison.windows[key],h=w.target;
    const p=h.position.clone().set(key==='contour'?w.pane.w/2-.005:0,0,h.frontZ);
    if(region==='rounded')p.x=h.w/2-.001;
    if(region==='outside'){p.x=h.w/2-.0001;p.y=h.h/2-.0001;}
    return region==='body'?a.screenOf(w,w.position.clone().set(0,0,w.pane.t)):a.screenOf(h,p);
  },{key,region});
  const click=async(p)=>{await page.mouse.move(p.x,p.y);await frame();await page.mouse.down();await frame();await page.mouse.up();await frame();};
  await frame();report.initial=await state();
  report.layout=await page.evaluate(()=>{
    const a=window.windowMovementComparison;
    return Object.fromEntries(Object.entries(a.comparison.windows).map(([k,w])=>[k,{
      glyphs:[w.title,w.subtitle,...w.rows].map(t=>({text:t.text,block:t.textRenderInfo?.blockBounds,ready:t.textRenderInfo?.parameters.text===t.text,position:t.position.toArray(),font:t.fontSize})),
      pane:[.216/1.5,.28935/1.5],
      targetBounds:(()=>{const mesh=w.target.hitMeshes[0];mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;return [a.screenOf(mesh,b.min),a.screenOf(mesh,b.max)];})(),
      labelsFollowWindow:w.label.parent===w,
    }]));
  });
  for(const s of Object.values(report.layout)) {
    assert.equal(s.glyphs.length,7);assert.equal(s.labelsFollowWindow,true);
    for(const g of s.glyphs){assert.equal(g.ready,true);const [x,y]=g.position,b=g.block;assert.ok(x+b[0]>=-s.pane[0]/2&&x+b[2]<=s.pane[0]/2);assert.ok(y+b[1]>=-s.pane[1]/2&&y+b[3]<=s.pane[1]/2);}
    for(const p of s.targetBounds)assert.ok(p.x>0&&p.x<1440&&p.y>0&&p.y<1000,'complete finite target inside initial camera');
  }
  report.checks.push('actual-font-seven-labels-fit-and-rest-target-bounds');await page.screenshot({path:`${out}/initial.png`});
  for(const key of ['flat','contour']) {
    const p=await point(key,key==='flat'?'rounded':'target'),before=await state();
    await page.mouse.move(p.x,p.y);await frame();assert.deepEqual(await state(),before);
    await page.mouse.down();await frame();assert.equal((await state())[key].owner,'mouse');
    await page.mouse.move(p.x+50,p.y-25,{steps:12});await frame();const moved=(await state())[key];assert.ok(moved.position[0]>before[key].position[0]+.02);assert.ok(moved.position[1]>before[key].position[1]+.01);assert.ok(Math.abs(moved.position[2]-before[key].position[2])<1e-7);
    assert.deepEqual(moved.rotation,before[key].rotation);assert.deepEqual(moved.scale,before[key].scale);assert.equal(moved.font,before[key].font);
    await page.screenshot({path:`${out}/${key}-held.png`});await page.mouse.up();await frame();assert.deepEqual((await state())[key].position,moved.position);assert.equal((await state())[key].owner,null);
    report[`${key}Moved`]=moved;
  }
  report.checks.push('drawn-rounded-end-and-pane-edge-acquire-move-release');await page.screenshot({path:`${out}/both-moved.png`});
  await page.click('#reset');await frame();assert.deepEqual(await state(),report.initial);report.checks.push('DOM-reset-restores-independent-poses');
  for(const region of ['outside','body']){const p=await point('flat',region),before=await state();await page.mouse.move(p.x,p.y);await frame();await page.mouse.down();await frame();await page.mouse.move(p.x+15,p.y-5);await frame();await page.mouse.up();await frame();assert.deepEqual(await state(),before);}
  report.checks.push('actual-empty-capsule-corner-and-flat-body-do-not-acquire');
  const p=await point('flat');await page.mouse.move(p.x,p.y);await page.mouse.down();await frame();await page.mouse.move(p.x+30,p.y-15);await frame();const held=(await state()).flat.position;
  await page.evaluate(()=>{const c=document.querySelector('body>canvas');if(!c.hasPointerCapture(1))throw Error('no actual pointer capture');c.releasePointerCapture(1);});await frame();await page.mouse.move(p.x+80,p.y-50);await frame();assert.deepEqual((await state()).flat.position,held);assert.equal((await state()).flat.owner,null);
  await page.mouse.move(20,20);await page.mouse.up();await frame();const next=await point('flat');await page.mouse.move(next.x,next.y);await page.mouse.down();await frame();await page.mouse.move(next.x+20,next.y);await frame();await page.mouse.up();await frame();assert.ok((await state()).flat.position[0]>held[0]);report.checks.push('actual-capture-loss-last-pose-empty-release-rearm');
  const reset=await page.evaluate(()=>{const a=window.windowMovementComparison;return a.screenOf(a.comparison.resetControl);});await click(reset);assert.deepEqual(await state(),report.initial);report.checks.push('actual-in-scene-reset');
  const fresh=await point('flat');await page.mouse.move(fresh.x,fresh.y);await page.mouse.down();await frame();assert.equal((await state()).flat.owner,'mouse');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await frame();assert.equal((await state()).flat.owner,null);report.checks.push('page-blur-cancels-without-action');
  await page.emulateMedia({reducedMotion:'reduce'});await page.click('#reset');await frame();await page.screenshot({path:`${out}/reset-reduced.png`});
  assert.equal(await page.evaluate(()=>window.windowMovementComparison.renderer.xr.isPresenting),false);assert.equal(await page.evaluate(()=>window.windowMovementComparison.renderer.getContext().isContextLost()),false);assert.ok(report.requests.every(r=>r.method==='GET'));assert.deepEqual(report.errors,[]);report.checks.push('no-errors-POST-XR-and-live-WebGL');
  // Isolated JS session double: exercises entry event wiring only. No XR
  // request reaches the native browser, no WebXR frame or device is produced.
  const sessionPage=await browser.newPage({viewport:{width:1440,height:1000}});
  sessionPage.on('pageerror',e=>report.errors.push(`session double: ${e.message}`));
  await sessionPage.addInitScript(()=>{
    const fakeXR={isSessionSupported:async()=>true,requestSession:async()=>{
      const s=new EventTarget();s.visibilityState='visible';s.end=async()=>{s.dispatchEvent(new Event('end'));};window.r04FakeSession=s;return s;
    }};
    Object.defineProperty(navigator,'xr',{value:fakeXR,configurable:true});
  });
  await sessionPage.goto(report.url);await sessionPage.waitForFunction(()=>window.windowMovementComparison);
  await sessionPage.evaluate(()=>{const xr=window.windowMovementComparison.renderer.xr;let session=null;xr.setSession=async s=>{session=s;s.addEventListener('end',()=>{session=null;},{once:true});};xr.getSession=()=>session;});
  const syntheticFrame=()=>sessionPage.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await sessionPage.click('#xr');await syntheticFrame();
  const sp=await sessionPage.evaluate(()=>{const a=window.windowMovementComparison,w=a.comparison.windows.flat;return a.screenOf(w.target,w.position.clone().set(0,0,w.target.frontZ));});
  await sessionPage.mouse.move(sp.x,sp.y);await syntheticFrame();await sessionPage.mouse.down();await syntheticFrame();await sessionPage.mouse.move(sp.x+45,sp.y-15);await syntheticFrame();
  const beforeEnd=await sessionPage.evaluate(()=>{const a=window.windowMovementComparison;return {window:a.comparison.windows.flat.position.toArray(),root:a.comparison.position.toArray(),nativePresenting:a.renderer.xr.isPresenting};});
  assert.ok(beforeEnd.window[0]>-.21);assert.equal(beforeEnd.nativePresenting,false);
  await sessionPage.evaluate(()=>window.r04FakeSession.end());await syntheticFrame();
  const afterEnd=await sessionPage.evaluate(()=>{const a=window.windowMovementComparison;return {window:a.comparison.windows.flat.position.toArray(),root:a.comparison.position.toArray(),owner:a.comparison.windows.flat.owner?.id??null};});
  assert.deepEqual(afterEnd.window,beforeEnd.window);assert.deepEqual(afterEnd.root,beforeEnd.root);assert.equal(afterEnd.owner,null);
  report.syntheticSessionWiring={beforeEnd,afterEnd,kind:'JS EventTarget/session stub; native XR never requested; first-viewer placement not exercised'};
  await sessionPage.evaluate(()=>window.windowMovementComparison.dispose());await sessionPage.close();report.checks.push('synthetic-entry-session-end-keeps-pose');
  await page.evaluate(()=>window.windowMovementComparison.dispose());assert.equal(await page.locator('body>canvas').count(),0);report.checks.push('owned-dispose');report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}
finally{if(browser){await browser.close();report.cleanup.browserClosed=true;}if(server){await new Promise(r=>server.httpServer.close(r));report.cleanup.serverClosed=true;}writeFileSync(`${out}/desktop.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:!!report.pass,checks:report.checks,errors:report.errors,failure:report.failure,cleanup:report.cleanup}));}
