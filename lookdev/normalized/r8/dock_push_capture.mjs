// Bounded current R8 software-input diagnostics. The frozen runtime owns cleanup.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {withBrowserSession} from './runtime.mjs';

const [sourceArg,outArg,suite='all']=process.argv.slice(2);
if(!sourceArg||!outArg||!['all','dock','push'].includes(suite))throw Error('Usage: dock_push_capture.mjs <pinned-source> <fresh-output> [all|dock|push]');
const source=await fs.realpath(sourceArg),out=path.resolve(outArg),adapter=path.dirname(fileURLToPath(import.meta.url)),port=5196;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=name=>fs.readFile(path.join(adapter,name));
const schemaBytes=await read('dock-push-evidence-schema.json'),schema=JSON.parse(schemaBytes);
const pinned=schema.acceptedBaseline;
if(!pinned||Object.values(pinned).some(value=>!/^[a-f0-9]{64}$/.test(value??'')))throw Error('R8 baseline/runtime not frozen: refusing browser launch');
const manifestBytes=await read('baseline/manifest.json'),contractBytes=await read('baseline/comparison-contract.json');
const manifest=JSON.parse(manifestBytes),contract=JSON.parse(contractBytes),entries=[...manifest.trackedInputs,...manifest.externalAssets];
for(const [name,expected]of [['baseline/manifest.json',pinned.manifestSha256],['baseline/comparison-contract.json',pinned.contractSha256],['runtime.mjs',pinned.runtimeSha256],['guards/lifecycle.mjs',pinned.lifecycleSha256]])if(hash(await read(name))!==expected)throw Error('Unaccepted R8 pin: '+name);
if(contract.sourceSha!==schema.sourceSha||manifest.sourceSha!==schema.sourceSha||manifest.comparisonContractSha256!==hash(contractBytes)||hash(JSON.stringify(entries.map(r=>({bytes:r.bytes,path:r.path,sha256:r.sha256}))))!==manifest.inputDigest)throw Error('Source/contract/digest identity mismatch');
for(const config of [contract.capture,contract.dockCapture])if(config.widthPx!==1600||config.heightPx!==1000||config.dpr!==1)throw Error('Frozen viewport differs');
if(!contract.r8||contract.r8.initialScale!==1.5||contract.r8.push.closeTravelM!==.025)throw Error('Frozen R8 source settings absent');
const codeNames=['dock_push_capture.mjs','dock_push_fixtures.mjs','dock_push_delta.mjs','dock-push-evidence-schema.json','runtime.mjs','guards/lifecycle.mjs'];
const code=Object.fromEntries(await Promise.all(codeNames.map(async name=>[name,await read(name)])));
async function verify(){
  for(const item of entries){const location=path.resolve(source,item.path);if(!location.startsWith(source+path.sep))throw Error('Source path escape');const bytes=await fs.readFile(location);if(bytes.length!==item.bytes||hash(bytes)!==item.sha256)throw Error('Source drift: '+item.path);}
  for(const [name,bytes]of Object.entries(code))if(!(await read(name)).equals(bytes))throw Error('Adapter drift: '+name);
  if(!(await read('baseline/manifest.json')).equals(manifestBytes)||!(await read('baseline/comparison-contract.json')).equals(contractBytes))throw Error('Baseline changed');
}
await verify();
const expectedDefaults=structuredClone((await import(pathToFileURL(path.join(source,'src/core/defaults.js')))).DEFAULTS);
const dependencies=await fs.realpath(path.join(source,'node_modules'));
// Existing output is allowed only when empty; failed runs require a new directory.
try{await fs.mkdir(out,{recursive:false});}catch(error){if(error.code!=='EEXIST'||(await fs.readdir(out)).length)throw error;}
const report={schemaVersion:2,sourceSha:schema.sourceSha,contractSha256:hash(contractBytes),manifestSha256:hash(manifestBytes),inputDigest:manifest.inputDigest,
  codePins:Object.fromEntries(Object.entries(code).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:hash(bytes)}])),suite,startedAt:new Date().toISOString(),sourcePinsBefore:entries.length,checks:[],captures:[],errors:[],limits:schema.limits,allPassed:false};
const errorJson=error=>error instanceof Error?{name:error.name,message:error.message,stack:error.stack,code:error.code}:{name:'ThrownValue',value:error};
let ctx;
const writeJson=(name,value)=>ctx.writeFile(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
async function saveImage(name,data){if(!data?.startsWith('data:image/png;base64,'))throw Error('Invalid PNG data');const bytes=Buffer.from(data.split(',')[1],'base64');await ctx.writeFile(path.join(out,name+'.png'),bytes,{flag:'wx'});return {path:name+'.png',bytes:bytes.length,sha256:hash(bytes)};}
async function open(query){
  const page=await ctx.browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(errorJson(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push({name:'ConsoleError',message:m.text()});});
  await ctx.step(()=>page.goto('http://127.0.0.1:'+port+'/bench.html?manual&dpr=1&'+query,{waitUntil:'domcontentloaded',timeout:60000}));
  await ctx.step(()=>page.waitForFunction(()=>window.ready===true,null,{timeout:120000}));
  await ctx.step(()=>page.evaluate(async({source,dependencies,adapter,expectedDefaults})=>{
    const producerUrls={};for(const name of ['InputSystem','defaults','look']){const urls=[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(u=>new URL(u).pathname.endsWith(source+'/src/core/'+name+'.js')))];if(urls.length!==1)throw Error('Producer ESM identity ambiguous: '+name);producerUrls[name]=urls[0];}
    const input=await import(producerUrls.InputSystem),settings=await import(producerUrls.defaults),look=await import(producerUrls.look);
    if(JSON.stringify(settings.DEFAULTS)!==JSON.stringify(expectedDefaults))throw Error('Actual DEFAULTS changed');
    window.xr08modules={THREE:await import('/@fs/'+dependencies+'/three/build/three.module.js'),product:{InputSystem:input.InputSystem,Dock:window.contour.dock?.constructor},look,settings,producerUrls,fixtures:await import('/@fs/'+adapter+'/dock_push_fixtures.mjs')};
    window.contour.renderer.setAnimationLoop(null);
  },{source,dependencies,adapter,expectedDefaults}));
  return page;
}
async function fonts(page,kind){
  await ctx.step(()=>page.waitForFunction(kind=>{const text=[];(kind==='dock'?window.xr08.dock:window.contour.scene).traverse(o=>{if('textRenderInfo'in o)text.push(o);});return (kind!=='dock'||text.length===5)&&text.length>0&&text.every(o=>o.textRenderInfo?.parameters.text===o.text&&o.textRenderInfo.visibleBounds.length===4&&Array.from(o.textRenderInfo.visibleBounds).every(Number.isFinite));},kind,{timeout:120000}));
  return ctx.step(()=>page.evaluate(kind=>{const text=[];(kind==='dock'?window.xr08.dock:window.contour.scene).traverse(o=>{if('textRenderInfo'in o)text.push({text:o.text,renderedText:o.textRenderInfo.parameters.text,visibleBounds:Array.from(o.textRenderInfo.visibleBounds)});});return text;},kind));
}
function checkInventory(checks,expected){if(checks.length!==expected.length||checks.some((check,i)=>check.name!==expected[i]||check.pass!==true))throw Error('Actual check inventory/pass differs from frozen schema');}
async function consume(result,{prefix,kind,mode,reducedMotion,expectedChecks,expectedShots}){
  const shots=result.shots??[],images=shots.filter(shot=>shot.png!=null);
  // Save partial evidence before asserting inventory; failed output is never a pass.
  for(const shot of shots){if(shot.png){const saved=await saveImage(prefix+'-'+shot.label,shot.png);report.captures.push({...saved,kind,mode,reducedMotion,state:shot.label,partial:!!result.error});}delete shot.png;}
  await writeJson(prefix+(result.error?'-failure.json':'-trace.json'),result);
  report.checks.push(...(result.checks??[]).map(check=>({...check,lane:prefix})));
  if(result.error)throw Error(result.error.message??String(result.error));
  if(JSON.stringify(images.map(shot=>shot.label))!==JSON.stringify(expectedShots))throw Error('Actual PNG budget differs from schema');
  checkInventory(result.checks,expectedChecks);
}
const outcome=await withBrowserSession({source,adapter,out,port,workTimeoutMs:240000,reportTimeoutMs:5000,cleanupTimeoutMs:8000,
  work:async context=>{
    ctx=context;
    for(const [name,bytes]of Object.entries(code))await ctx.writeFile(path.join(out,path.basename(name)),bytes,{flag:'wx'});
    await ctx.writeFile(path.join(out,'baseline-manifest.json'),manifestBytes,{flag:'wx'});await ctx.writeFile(path.join(out,'baseline-comparison-contract.json'),contractBytes,{flag:'wx'});
    if(suite==='all'||suite==='dock')for(const mode of ['hdr','noenv'])await ctx.phase({label:'dock '+mode+' setup/font/evaluation',timeoutMs:120000},async()=>{
      const page=await open('part=dock&visible=5&dist=.4&rot=1.6');
      await ctx.step(()=>page.evaluate(mode=>{const {THREE,product,fixtures,settings,look}=window.xr08modules,c=window.contour;if(mode==='noenv'){look.setBackdrop(null);c.scene.background=null;c.scene.environment=null;c.renderer.setClearAlpha(0);}window.xr08=fixtures.createDockFixture({THREE,InputSystem:product.InputSystem,Dock:product.Dock,contour:c,settings,mode});if(window.xr08.dock.base.material.uniforms.uHasRoom!==look.backdropUniforms().uHasEnv)throw Error('Dock/backdrop producer mismatch');},mode));
      const textReadiness=await fonts(page,'dock');
      const result=await ctx.capture(()=>page.evaluate(()=>{try{return window.xr08modules.fixtures.runDockFixture(window.xr08);}catch(error){return {error:{name:error.name,message:error.message,stack:error.stack},checks:window.xr08.checks,trace:window.xr08.trace,shots:window.xr08.shots,diagnostics:window.xr08.diagnostics};}}));
      result.hostFontReadiness=textReadiness;await consume(result,{prefix:'dock-'+mode,kind:'dock',mode,expectedChecks:schema.dock[mode].checks,expectedShots:schema.dock[mode].shots});await ctx.step(()=>page.close());
    });
    if(suite==='all'||suite==='push')for(const [mode,reducedMotion]of [['hdr',false],['noenv',false],['hdr',true]])await ctx.phase({label:'push '+mode+' '+reducedMotion+' setup/font/evaluation',timeoutMs:120000},async()=>{
      const lane=mode+'-'+(reducedMotion?'reduced':'normal'),page=await open('component=packaging&layout=quest&dist=.6&fov=26&rot=1.6');
      await ctx.step(()=>page.evaluate(async({mode,reducedMotion,contract})=>{const {THREE,product,fixtures,look}=window.xr08modules,c=window.contour;if(mode==='noenv'){look.setBackdrop(null);c.scene.background=null;c.scene.environment=null;c.renderer.setClearAlpha(0);}window.xr08=await fixtures.createPushFixture({THREE,InputSystem:product.InputSystem,contour:c,scenario:'same-frame-glow',contract,reducedMotion});},{mode,reducedMotion,contract}));
      const textReadiness=await fonts(page,'push');
      const result=await ctx.capture(()=>page.evaluate(()=>{try{return window.xr08.run();}catch(error){return {error:{name:error.name,message:error.message,stack:error.stack},checks:window.xr08.checks,frames:window.xr08.frames,shots:window.xr08.shots,diagnostics:window.xr08.diagnostics};}}));
      result.hostFontReadiness=textReadiness;await consume(result,{prefix:'push-glow-'+lane,kind:'push-delta',mode,reducedMotion,expectedChecks:schema.pushGlow.checks,expectedShots:schema.pushGlow.shotsByLane[lane]});await ctx.step(()=>page.close());
    });
    await ctx.step(verify);report.sourcePinsAfter=entries.length;
    const expectedImages=suite==='all'?17:suite==='dock'?10:7;
    report.allPassed=report.errors.length===0&&report.checks.every(check=>check.pass)&&report.captures.length===expectedImages;
    if(!report.allPassed)throw Error('Capture checks or finite budget failed');return report;
  },
  writeSummary:async({primaryError})=>{report.completedAt=new Date().toISOString();if(primaryError!==undefined&&primaryError!==null){report.allPassed=false;report.errors.push(errorJson(primaryError));}await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
});
console.log(JSON.stringify({allPassed:outcome.ok&&report.allPassed,checks:report.checks.length,captures:report.captures.length,output:out,cleanup:outcome.lifecycle.resourceReadback}));
if(!outcome.ok||!report.allPassed)process.exitCode=1;
