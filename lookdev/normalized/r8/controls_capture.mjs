// Current R8 WebGL controls evidence. Technical diagnostics only; no design adoption.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {STATES,NEGATIVES} from './controls_fixtures.mjs';
import {MULTIPOINT_CASES} from './controls_multipoint.mjs';
const [sourceArg,outArg,selection='all']=process.argv.slice(2);
if(!sourceArg||!outArg)throw Error('Usage: controls_capture.mjs <pinned-source> <fresh-output> [all|negatives|multipoint|state|negative:name|multipoint:name]');
const allJobs=[...STATES.map(state=>({state})),...NEGATIVES.map(scenario=>({scenario})),...MULTIPOINT_CASES.map(multipoint=>({multipoint}))];
const jobId=job=>job.state??(job.scenario?'negative-'+job.scenario:'multipoint-'+job.multipoint);
const jobs=selection==='all'?allJobs:selection==='remaining-states'?allJobs.filter(j=>j.state&&!['rest','side-held'].includes(j.state)):selection==='negatives'?allJobs.filter(j=>j.scenario):selection==='multipoint'?allJobs.filter(j=>j.multipoint):selection==='multipoint-followup'?allJobs.filter(j=>j.multipoint&&!['same-handle','same-row','distinct-leaves'].includes(j.multipoint)):allJobs.filter(j=>jobId(j)===selection.replace(':','-'));
if(!jobs.length)throw Error('Unsupported R8 selection');
const source=path.resolve(sourceArg),out=path.resolve(outArg),adapter=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fileNames={manifest:'baseline/manifest.json',contract:'baseline/comparison-contract.json',script:'controls_capture.mjs',fixture:'controls_fixtures.mjs',multipoint:'controls_multipoint.mjs',browser:'controls_browser.mjs',plan:'controls-plan.json',runtime:'runtime.mjs',lifecycle:'guards/lifecycle.mjs'};
const paths=Object.fromEntries(Object.entries(fileNames).map(([k,v])=>[k,path.join(adapter,v)]));
const pinned=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([k,p])=>[k,await fs.readFile(p)])));
const manifest=JSON.parse(pinned.manifest),contract=JSON.parse(pinned.contract);
if(Number(process.versions.node.split('.')[0])<22)throw Error('Existing Node22+ runtime required; no implicit installation');
if(manifest.sourceSha!=='61c7ba019eb6c1a535a7dbd8ce05265fc0be818e'||!contract.r8||contract.r8.controls.heldPhysicalDentM!==.0015)throw Error('Unsupported R8 source/physical dent contract');
if(sha(pinned.contract)!=='2c2d61074534eacce56b42a7e3ef8b571ae558ab3831ce6f8b33a30f34090fdc'||sha(pinned.manifest)!=='b064f5d65df1d2ee17cbc0360b2ab114d47fd5318125893f0cdbb2dac1a34fd9'||sha(pinned.runtime)!=='f6c0fbb22d5c8bfb37a10e91b1a01199eaf0e79b4ad531dad27dc1b2c8303657')throw Error('Unaccepted R8 baseline/runtime pin');
const records=[...manifest.trackedInputs,...manifest.externalAssets];
const inventoryDigest=sha(JSON.stringify(records.map(r=>({bytes:r.bytes,path:r.path,sha256:r.sha256}))));
if(sha(pinned.contract)!==manifest.comparisonContractSha256||contract.sourceSha!==manifest.sourceSha||inventoryDigest!==manifest.inputDigest)throw Error('R8 source/contract identity mismatch');
async function verifyPins(){
 for(const item of records){const location=path.resolve(source,item.path);if(!location.startsWith(source+path.sep))throw Error('Input path escapes source');const b=await fs.readFile(location);if(b.length!==item.bytes||sha(b)!==item.sha256)throw Error('Pinned input mismatch: '+item.path);}
 for(const[key,p]of Object.entries(paths))if(!(await fs.readFile(p)).equals(pinned[key]))throw Error('Capture code/settings changed: '+key);
}
await verifyPins();
const expectedDefaults=structuredClone((await import(pathToFileURL(path.join(source,'src/core/defaults.js')))).DEFAULTS);
const dependencies=await fs.realpath(path.join(source,'node_modules'));
await fs.mkdir(out,{recursive:false});
const identity={schemaVersion:2,taskId:'XR07-R8-STATES-20261025-1312',sourceSha:manifest.sourceSha,contractSha256:sha(pinned.contract),manifestSha256:sha(pinned.manifest),inputDigest:manifest.inputDigest,scriptSha256:sha(pinned.script),fixtureSha256:sha(pinned.fixture),multipointSha256:sha(pinned.multipoint),browserModuleSha256:sha(pinned.browser),runtimeSha256:sha(pinned.runtime),lifecycleSha256:sha(pinned.lifecycle),sourceInputsVerified:records.length,profile:'current-r8',adopted:false,headsetAcceptance:false,normalizedBlenderExportSupported:false};
const implementation=[],results=[];let jobFailure=null;
const {withBrowserSession}=await import('./runtime.mjs');
const outcome=await withBrowserSession({source,adapter,out,port:5194,workTimeoutMs:240000,reportTimeoutMs:10000,cleanupTimeoutMs:8000,
 work:async ctx=>{
  await ctx.step(()=>fs.mkdir(path.join(out,'implementation')));
  for(const[key,bytes]of Object.entries(pinned)){
   const relative='implementation/'+fileNames[key].replaceAll('/','-');await ctx.writeFile(path.join(out,relative),bytes,{flag:'wx'});implementation.push({key,path:relative,bytes:bytes.length,sha256:sha(bytes)});
  }
  await ctx.writeFile(path.join(out,'capture-input.json'),JSON.stringify({...identity,jobs,nodeVersion:process.version,implementation,maximumJobs:27,maximumTechnicalPngs:31,geometryExport:'unsupported-fail-closed'},null,2),{flag:'wx'});
  for(const job of jobs){
   await ctx.step(verifyPins);const id=jobId(job),errors=[],networkFailures=[];
   const page=await ctx.phase({label:id+' page creation',timeoutMs:20000},()=>ctx.browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1}));
   page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});page.on('requestfailed',r=>networkFailures.push({url:r.url(),error:r.failure()?.errorText}));
   try{
    await ctx.phase({label:id+' load',timeoutMs:90000},async()=>{
     await ctx.step(()=>page.goto(new URL(contract.capture.webQuery,'http://127.0.0.1:5194/').href,{waitUntil:'domcontentloaded',timeout:60000}));
     await ctx.step(()=>page.waitForFunction(()=>window.ready===true,null,{timeout:60000}));
    });
    await ctx.phase({label:id+' actual fixture',timeoutMs:30000},()=>ctx.step(()=>page.evaluate(async args=>{window.__r8Controls=await import('/@fs/'+args.adapter+'/controls_browser.mjs');return window.__r8Controls.prepare(args);},{source,dependencies,adapter,contract,expectedDefaults,...job})));
    await ctx.phase({label:id+' total font readiness',timeoutMs:20000},()=>ctx.step(()=>page.waitForFunction(()=>window.__r8Controls.readiness().ready,null,{timeout:19000,polling:50})));
    const result=await ctx.phase({label:id+' bounded capture',timeoutMs:60000},()=>ctx.capture(()=>page.evaluate(()=>window.__r8Controls.capture())));
    if(errors.length||networkFailures.length)throw Error('Browser errors: '+JSON.stringify({errors,networkFailures}));
    await ctx.step(verifyPins);const artifacts=[];
    const writeImage=async(image,name)=>{const b=Buffer.from(image.png.split(',')[1],'base64');await ctx.writeFile(path.join(out,name),b,{flag:'wx'});artifacts.push({path:name,bytes:b.length,sha256:sha(b),widthPx:1600,heightPx:1000,...(image.kind?{kind:image.kind}:{})});};
    if(result.png){await writeImage({png:result.png},id+'-front.png');delete result.png;}
    if(result.optics?.images){for(const image of result.optics.images)await writeImage(image,id+'-'+image.kind+'.png');delete result.optics.images;}
    const evidence={...identity,...job,verified:true,result,errors,networkFailures,artifacts};const bytes=JSON.stringify(evidence,null,2);
    await ctx.writeFile(path.join(out,id+'-evidence.json'),bytes,{flag:'wx'});
    results.push({id,verified:true,artifacts,evidence:{path:id+'-evidence.json',bytes:Buffer.byteLength(bytes),sha256:sha(bytes)}});
    console.log(JSON.stringify({id,verified:true,pngs:artifacts.length}));
    // On failure the session helper closes every page independently of reporting.
    await ctx.phase({label:id+' page close',timeoutMs:5000},()=>ctx.step(()=>page.close()));
   }catch(error){jobFailure={job,error:String(error),errors,networkFailures,url:page.url()};throw error;}
  }
  await ctx.step(verifyPins);return {completedJobs:results.length,pngs:results.reduce((n,r)=>n+r.artifacts.length,0)};
 },
 writeSummary:async({value,primaryError})=>{
  // The helper has closed work capture permission and separately bounds this report.
  if(jobFailure)await fs.writeFile(path.join(out,jobId(jobFailure.job)+'-failure.json'),JSON.stringify(jobFailure,null,2),{flag:'wx'});
  const summary={...identity,implementation,browserChecksPassed:!primaryError&&results.length===jobs.length,geometryExportPassed:false,geometryExportStatus:'unsupported-fail-closed',results,value:value??null,primaryError:primaryError?{name:primaryError.name,message:primaryError.message,code:primaryError.code}:null};
  await fs.writeFile(path.join(out,primaryError?'failure.json':'summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});
 }
});
if(!outcome.ok){console.error(JSON.stringify({completedJobs:results.length,lifecycle:outcome.lifecycle}));process.exitCode=1;}
else console.log(JSON.stringify({ok:true,completedJobs:results.length,lifecycle:outcome.lifecycle.resourceReadback}));
