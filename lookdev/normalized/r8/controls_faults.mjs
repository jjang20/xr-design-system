// Three bounded actual-adapter integration faults; separate from 27 state traces.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {withBrowserSession} from './runtime.mjs';
const[sourceArg,outArg]=process.argv.slice(2);
if(!sourceArg||!outArg)throw Error('Usage: controls_faults.mjs <fixed-source> <fresh-output>');
const source=path.resolve(sourceArg),out=path.resolve(outArg),adapter=path.dirname(fileURLToPath(import.meta.url));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const files=['baseline/comparison-contract.json','baseline/manifest.json','runtime.mjs','guards/lifecycle.mjs','controls_fixtures.mjs','controls_multipoint.mjs','controls_browser.mjs','controls_faults.mjs'];
const bytes=Object.fromEntries(await Promise.all(files.map(async f=>[f,await fs.readFile(path.join(adapter,f))])));
const contract=JSON.parse(bytes[files[0]]),manifest=JSON.parse(bytes[files[1]]),pins=Object.fromEntries(files.map(f=>[f,{bytes:bytes[f].length,sha256:sha(bytes[f])}]));
if(manifest.sourceSha!=='61c7ba019eb6c1a535a7dbd8ce05265fc0be818e'||sha(bytes[files[0]])!=='2c2d61074534eacce56b42a7e3ef8b571ae558ab3831ce6f8b33a30f34090fdc'||sha(bytes['runtime.mjs'])!=='f6c0fbb22d5c8bfb37a10e91b1a01199eaf0e79b4ad531dad27dc1b2c8303657')throw Error('Unaccepted input');
const verify=async()=>{for(const f of files)if(!(await fs.readFile(path.join(adapter,f))).equals(bytes[f]))throw Error('Adapter drift '+f);for(const r of [...manifest.trackedInputs,...manifest.externalAssets]){const b=await fs.readFile(path.join(source,r.path));if(b.length!==r.bytes||sha(b)!==r.sha256)throw Error('Source drift '+r.path);}};
await verify();await fs.mkdir(out,{recursive:false});
const dependencies=await fs.realpath(path.join(source,'node_modules')),expectedDefaults=structuredClone((await import(pathToFileURL(path.join(source,'src/core/defaults.js')))).DEFAULTS),results=[];
for(const name of ['actual-eval-deadline','actual-font-deadline','actual-report-failure']){
 const dir=path.join(out,name);await fs.mkdir(dir);let page,ctxRef,readiness=null,prepared=null,late=null,hostCaptureRejected=null;
 const outcome=await withBrowserSession({source,adapter,out:dir,port:5194,workTimeoutMs:120000,reportTimeoutMs:5000,cleanupTimeoutMs:8000,
  work:async ctx=>{
   ctxRef=ctx;page=await ctx.browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
   await ctx.phase({label:name+' actual load',timeoutMs:60000},async()=>{await ctx.step(()=>page.goto(new URL(contract.capture.webQuery,'http://127.0.0.1:5194/').href,{waitUntil:'domcontentloaded'}));await ctx.step(()=>page.waitForFunction(()=>window.ready===true));});
   prepared=await ctx.phase({label:name+' actual rest fixture',timeoutMs:30000},()=>ctx.step(()=>page.evaluate(async args=>{window.__r8Controls=await import('/@fs/'+args.adapter+'/controls_browser.mjs');return window.__r8Controls.prepare(args);},{source,adapter,dependencies,contract,expectedDefaults,state:'rest'})));
   await ctx.phase({label:name+' real fonts ready',timeoutMs:20000},()=>ctx.step(()=>page.waitForFunction(()=>window.__r8Controls.readiness().ready,null,{timeout:19000})));
   readiness=await ctx.step(()=>page.evaluate(()=>window.__r8Controls.readiness()));
   if(name==='actual-eval-deadline')await ctx.phase({label:'actual adapter delayed capture eval',timeoutMs:250},()=>ctx.step(()=>page.evaluate(async()=>{await new Promise(r=>setTimeout(r,750));try{await window.__r8Controls.capture();window.actualLate={captureSucceeded:true};}catch(e){window.actualLate={error:String(e),guard:structuredClone(window.__xrCaptureGuard)};}return window.actualLate;})));
   if(name==='actual-font-deadline')await ctx.phase({label:'actual font-readiness total loop',timeoutMs:250},()=>ctx.step(()=>page.waitForFunction(()=>{window.actualFontPolls=(window.actualFontPolls??0)+1;window.actualFontState=window.__r8Controls.readiness();return false;},null,{timeout:2000,polling:30})));
   return {prepared,readiness,noCaptureRequested:true};
  },
  writeSummary:async({value,primaryError})=>{
   if(name==='actual-eval-deadline'){await page.waitForFunction(()=>!!window.actualLate,null,{timeout:2500});late=await page.evaluate(()=>window.actualLate);}
   if(primaryError){try{await ctxRef.capture(()=>{throw Error('Host capture operation must not run after deadline');});hostCaptureRejected={unexpectedSuccess:true};}catch(e){hostCaptureRejected={error:String(e)};}}
   const report={name,sourceSha:manifest.sourceSha,inputDigest:manifest.inputDigest,prepared,readiness,value:value??null,primaryError:primaryError?{name:primaryError.name,message:primaryError.message,code:primaryError.code}:null,late,hostCaptureRejected,pins,claim:'Actual rest fixture/actual font producer plus injected host-evaluation, readiness-loop or report failure. No physical Quest or candidate output.'};
   await fs.writeFile(path.join(dir,'integration-report.json'),JSON.stringify(report,null,2),{flag:'wx'});
   if(name==='actual-report-failure')throw Object.assign(Error('INJECTED_ACTUAL_ADAPTER_REPORT_EIO'),{code:'EIO'});
  }
 });
 await verify();const l=outcome.lifecycle,r=l.resourceReadback;
 const cleanup=l.cleanupResults.every(c=>c.status==='completed')&&r.chromeAlive===false&&r.portListening===false&&r.acquisitionPending===false&&r.serverAcquisitionPending===false&&r.serverListenPending===false;
 const pass=cleanup&&prepared?.prepared&&readiness?.ready&&(name==='actual-report-failure'?l.primaryError===null&&l.reportError?.code==='EIO':l.primaryError?.code==='DEADLINE_EXCEEDED'&&l.reportError===null&&hostCaptureRejected?.error==='Error: XR_SESSION_CLOSED'&&(name!=='actual-eval-deadline'||late?.guard?.refused>0&&late.error.includes('XR_CAPTURE_DEADLINE_CLOSED')));
 results.push({name,pass:!!pass,cleanup,primaryError:l.primaryError,reportError:l.reportError,late,readiness,prepared,resourceReadback:r});console.log(JSON.stringify(results.at(-1)));
 if(!pass)break;
}
await verify();await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({sourceSha:manifest.sourceSha,pins,results,allPassed:results.length===3&&results.every(x=>x.pass),normalTraceCount:0,outputPngs:0,scope:'Three actual-adapter fault integrations; no shared helper suite rerun.'},null,2),{flag:'wx'});
if(results.length!==3||results.some(x=>!x.pass))process.exitCode=1;
