// Bounded built-desktop GL/input checks. No XR session or participant logging.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright-core';
const out=resolve(process.env.R03_OUTPUT??'shots/r03-actions');mkdirSync(out,{recursive:true});
const report={kind:'built-desktop-pointer-GL',checks:[],errors:[],cleanup:{}};
let server,browser;
try{
 server=await preview({configFile:'vite.config.js',logLevel:'error',preview:{host:'127.0.0.1',port:0,strictPort:true}});
 report.url=`${server.resolvedUrls.local[0]}action-comparison.html`;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400)report.errors.push(`HTTP ${r.status()} ${r.url()}`);});
 await page.goto(report.url);await page.waitForFunction(()=>window.actionComparison,null,{timeout:30000});
 const state=()=>page.evaluate(()=>Object.fromEntries(Object.entries(window.actionComparison.comparison.sides).map(([k,s])=>[k,s.notice.text])));
 const point=(side,index=-1)=>page.evaluate(({side,index})=>{const a=window.actionComparison,s=a.comparison.sides[side],b=index<0?s.standalone:s.toolbar.buttons[index];return a.screenOf(b,b.position.clone().set(0,0,b.t));},{side,index});
 const click=async(side,index=-1)=>{const p=await point(side,index);await page.mouse.move(p.x,p.y);await page.waitForTimeout(50);await page.mouse.down();await page.waitForTimeout(40);await page.mouse.up();await page.waitForTimeout(50);};
 await page.screenshot({path:`${out}/initial.png`});
 assert.deepEqual(await state(),{flat:'아직 실행하지 않았습니다',contour:'아직 실행하지 않았습니다'});
 for(const side of ['flat','contour']){
  await click(side);assert.equal((await state())[side],'마지막 실행: Action');
  for(const [i,name] of [[0,'Action A'],[0,'Action A'],[1,'Action B'],[2,'Action C'],[3,'Action C']]){await click(side,i);assert.equal((await state())[side],`마지막 실행: ${name}`);}
 }
 report.checks.push('real-pointer-both-standalone-toolbar-repeat-disabled');
 await page.screenshot({path:`${out}/actions.png`});
 const b=await point('flat');await page.mouse.move(b.x,b.y);await page.mouse.down();await page.waitForTimeout(60);
 assert.equal(await page.evaluate(()=>window.actionComparison.comparison.sides.flat.standalone.press.pressed),true);
 await page.evaluate(()=>{const c=document.querySelector('body > canvas');if(!c.hasPointerCapture(1))throw Error('missing actual pointer capture');c.releasePointerCapture(1);});
 await page.waitForTimeout(60);await page.mouse.up();assert.equal((await state()).flat,'마지막 실행: Action C');report.checks.push('actual-DOM-capture-loss-no-select');
 await click('flat');assert.equal((await state()).flat,'마지막 실행: Action');
 await page.click('#reset');assert.deepEqual(await state(),{flat:'아직 실행하지 않았습니다',contour:'아직 실행하지 않았습니다'});report.checks.push('DOM-reset');
 await click('contour');const reset=await page.evaluate(()=>{const a=window.actionComparison;return a.screenOf(a.comparison.resetControl);});
 await page.mouse.move(reset.x,reset.y);await page.waitForTimeout(40);await page.mouse.click(reset.x,reset.y);await page.waitForTimeout(60);
 assert.deepEqual(await state(),{flat:'아직 실행하지 않았습니다',contour:'아직 실행하지 않았습니다'});report.checks.push('scene-reset');
 report.bounds=await page.evaluate(()=>{
  const a=window.actionComparison;
  return Object.fromEntries(Object.entries(a.comparison.sides).map(([key,s])=>[key,{
   notice:s.notice.text, noticeBounds:{width:s.notice.geometry.parameters.width,height:s.notice.geometry.parameters.height},
   controls:s.buttons.map(b=>({w:b.w,h:b.h,t:b.t,scale:b.getWorldScale(b.position.clone()).toArray(),world:b.getWorldPosition(b.position.clone()).toArray(),touch:[b.touchW,b.touchH],glyphs:b.face.children.filter(c=>c.textRenderInfo).map(c=>({text:c.text,fontSize:c.fontSize,block:c.textRenderInfo.blockBounds,position:c.position.toArray(),synced:c.textRenderInfo.parameters.text===c.text,visible:c.visible})),icon:b.icon?{size:b.icon.geometry.parameters,position:b.icon.position.toArray()}:null,hits:b.hitMeshes.length})),
  }]));
 });
 for(let i=0;i<5;i++)for(const k of ['w','h'])assert.equal(report.bounds.flat.controls[i][k],report.bounds.contour.controls[i][k]);
 for(const side of Object.values(report.bounds)) {
  assert.equal(side.controls.flatMap(c=>c.glyphs).length,2,'standalone and primary text were actually laid out');
  for(const b of side.controls) for(const g of b.glyphs){
   assert.equal(g.synced,true);assert.ok(g.block[0]+g.position[0]>=-b.w/2 && g.block[2]+g.position[0]<=b.w/2,'glyph fits face width');
   assert.ok(g.block[1]+g.position[1]>=-b.h/2 && g.block[3]+g.position[1]<=b.h/2,'glyph fits face height');
  }
 }
 report.checks.push('same-face-dimensions-and-font-sync-recorded');
 assert.equal(await page.evaluate(()=>window.actionComparison.renderer.getContext().isContextLost()),false);report.checks.push('actual-WebGL-context');
 await page.screenshot({path:`${out}/reset.png`});
 await page.evaluate(()=>window.actionComparison.dispose());assert.equal(await page.locator('body > canvas').count(),0);report.checks.push('owned-scene-dispose');
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure={message:e.message,stack:e.stack};process.exitCode=1;}
finally{
 if(browser){await browser.close();report.cleanup.browserClosed=true;}
 if(server){await new Promise(resolve=>server.httpServer.close(resolve));report.cleanup.serverClosed=true;}
 writeFileSync(`${out}/desktop.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({checks:report.checks,errors:report.errors,failure:report.failure,cleanup:report.cleanup}));
}
