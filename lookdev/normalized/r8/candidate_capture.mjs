// Exact R8 bounded comparison. No product writes or implicit gate bypass.
// Usage: node candidate_capture.mjs SOURCE FRESH_OUTPUT ACCEPTANCE_JSON first|remaining
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {withBrowserSession} from './runtime.mjs';
import {CONDITIONS,WINDOW_UNIFORMS,compareCurrentReference} from './candidate_fixtures.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const need=(ok,message)=>{if(!ok)throw Error(message);};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const encoded=v=>JSON.stringify(canonical(v));
const [sourceArg,outArg,acceptArg,stage,...extra]=process.argv.slice(2);
need(sourceArg&&outArg&&acceptArg&&['first','remaining'].includes(stage)&&!extra.length,'Usage: candidate_capture.mjs SOURCE FRESH_OUTPUT ACCEPTANCE_JSON first|remaining');
need(Number(process.versions.node.split('.')[0])>=22,'Existing Node22+ required');
const source=await fs.realpath(sourceArg),out=path.resolve(outArg),adapter=path.dirname(fileURLToPath(import.meta.url));
const paths={script:fileURLToPath(import.meta.url),fixture:path.join(adapter,'candidate_fixtures.mjs'),controls:path.join(adapter,'controls_fixtures.mjs'),layers:path.join(adapter,'layers-contract.json'),manifest:path.join(adapter,'baseline/manifest.json'),contract:path.join(adapter,'baseline/comparison-contract.json'),defaults:path.join(adapter,'baseline/defaults.json'),runtime:path.join(adapter,'runtime.mjs'),lifecycle:path.join(adapter,'guards/lifecycle.mjs'),plan:path.join(adapter,'comparison-plan.json'),acceptance:path.resolve(acceptArg)};
const bytes=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([k,p])=>[k,await fs.readFile(p)])));
const parse=k=>JSON.parse(bytes[k]),manifest=parse('manifest'),contract=parse('contract'),plan=parse('plan'),acceptance=parse('acceptance'),layersContract=parse('layers');
const pins=Object.fromEntries(Object.entries(bytes).map(([k,b])=>[k,sha(b)]));
const inputRecords=[...manifest.trackedInputs,...manifest.externalAssets];
need(pins.contract==='2c2d61074534eacce56b42a7e3ef8b571ae558ab3831ce6f8b33a30f34090fdc'&&pins.manifest==='b064f5d65df1d2ee17cbc0360b2ab114d47fd5318125893f0cdbb2dac1a34fd9','Unaccepted R8 baseline');
need(manifest.sourceSha==='61c7ba019eb6c1a535a7dbd8ce05265fc0be818e'&&contract.sourceSha===manifest.sourceSha&&plan.sourceSha===manifest.sourceSha&&plan.contractSha256===pins.contract,'Source/plan identity mismatch');
need(inputRecords.length===100&&sha(JSON.stringify(inputRecords.map(r=>({bytes:r.bytes,path:r.path,sha256:r.sha256}))))===manifest.inputDigest&&plan.inputDigest===manifest.inputDigest,'Input inventory mismatch');
const allowed=Object.keys(WINDOW_UNIFORMS).map(k=>'look.glass.window.'+k);
need(encoded(plan.scope.allowedOverrideLeaves)===encoded(allowed)&&allowed.length===9&&plan.scope.sharedBlurFixed===.36,'Window-only nine-leaf scope drift');
need(encoded(plan.boundedMatrix.profiles)===encoded(['current','neutral-frost','clear-edge'])&&plan.maximumSelectionImages===12&&encoded(plan.boundedMatrix.conditions.map(c=>c.id))===encoded(CONDITIONS.map(c=>c.id)),'Unapproved matrix');
need(acceptance.schemaVersion===2&&acceptance.generation==='R8'&&acceptance.executionAllowed===true&&acceptance.independentReviewAccepted===true,'Execution requires independently reviewed R8 state and adapter evidence');
need(acceptance.sourceSha===manifest.sourceSha&&acceptance.contractSha256===pins.contract&&acceptance.planSha256===pins.plan,'Acceptance identity mismatch');
const codeKeys=['script','fixture','controls','layers','runtime','lifecycle'];
need(encoded(acceptance.reviewedCodePins)===encoded(Object.fromEntries(codeKeys.map(k=>[k,pins[k]]))),'Code changed since review');
async function readPinned(r){need(r&&typeof r.path==='string'&&Number.isInteger(r.bytes)&&/^[a-f0-9]{64}$/.test(r.sha256),'Invalid pinned receipt');const b=await fs.readFile(r.path);need(b.length===r.bytes&&sha(b)===r.sha256,'Receipt changed '+r.path);return b;}
const auditBytes=await readPinned(acceptance.audit),reviewBytes=await readPinned(acceptance.reviewRecord),audit=JSON.parse(auditBytes);
need(audit.sourceSha===manifest.sourceSha&&audit.contractSha256===pins.contract&&audit.inputDigest===manifest.inputDigest&&audit.candidateGatePassed===true,'Actual source-state/reference/runtime audit gate not passed');
need(audit.sourceInputCount===100&&audit.actualUniformCoverage===true&&audit.adapterDeadlineVerified===true&&audit.adapterCleanupVerified===true,'Incomplete adapter evidence');
const references={};
for(const condition of CONDITIONS){
 const r=acceptance.references?.[condition.id];need(r?.accepted===true&&r.scope==='same-source-independent-reference','Independent reference missing: '+condition.id);
 const receipt=await readPinned(r.receipt),image=await readPinned(r.image),data=JSON.parse(receipt);
 need(data.sourceSha===manifest.sourceSha&&data.contractSha256===pins.contract&&data.inputDigest===manifest.inputDigest,'Reference identity drift');
 if(condition.kind==='controls')need(data.verified===true&&data.result.fixture.state===condition.state&&data.fixtureSha256===pins.controls,'Controls reference changed');
 else need(data.allPassed===true&&data.layersContractSha256===pins.layers&&data.profileId==='current'&&!Object.keys(data.overrides).length,'Layer reference lacks required current scope');
 references[condition.id]={record:r,data,receipt,image};
}
const canonicalDefaults=parse('defaults');
const importedDefaults=structuredClone((await import(pathToFileURL(path.join(source,'src/core/defaults.js')))).DEFAULTS);
need(encoded(canonicalDefaults)===encoded(importedDefaults),'Pinned defaults mismatch');
const leafPaths=(v,prefix='')=>Object.entries(v).flatMap(([k,x])=>{const p=prefix?prefix+'.'+k:k;return x&&typeof x==='object'&&!Array.isArray(x)?leafPaths(x,p):[p];});
const merge=(target,value)=>{for(const[k,v]of Object.entries(value)){need(!['__proto__','constructor','prototype'].includes(k),'Unsafe key');if(v&&typeof v==='object'&&!Array.isArray(v)){need(target[k]&&typeof target[k]==='object','Unknown branch');merge(target[k],v);}else target[k]=structuredClone(v);}return target;};
need(encoded(plan.profiles.map(p=>p.id))===encoded(plan.boundedMatrix.profiles),'Profiles differ');
const profiles=plan.profiles.map(p=>{
 const leaves=leafPaths(p.overrides);need(leaves.every(l=>allowed.includes(l))&&(p.id==='current'?leaves.length===0:leaves.length===9),'Forbidden override');
 const expected=merge(structuredClone(canonicalDefaults),p.overrides);need(encoded(expected.look.glass.window)===encoded(p.resolvedWindow),'Resolved window mismatch');
 for(const[k,v]of Object.entries(p.resolvedWindow))need(Array.isArray(v)?k==='albedo'&&v.length===3&&v.every(Number.isFinite):Number.isFinite(v),'Nonfinite profile');
 return {...p,expected};
});
let firstReceipt=null,firstReview=null;
if(stage==='remaining'){
 need(acceptance.firstCurrent?.dataAccepted===true&&acceptance.firstCurrent?.imageAccepted===true,'First Current independent data/image review required');
 firstReceipt=JSON.parse(await readPinned(acceptance.firstCurrent.receipt));firstReview=JSON.parse(await readPinned(acceptance.firstCurrent.review));
 need(firstReceipt.condition.id==='root-rest-front'&&firstReceipt.profileId==='current'&&firstReceipt.verified&&firstReceipt.referenceCheck.matched,'Invalid first Current receipt');
 need(firstReceipt.sourceSha===manifest.sourceSha&&firstReceipt.planSha256===pins.plan&&encoded(firstReceipt.codePins)===encoded(Object.fromEntries(codeKeys.map(k=>[k,pins[k]]))),'First Current code/source drift');
 await readPinned(acceptance.firstCurrent.image);
 const firstImage=acceptance.firstCurrent.image,firstImageRecord=firstReceipt.image,firstDirectory=path.dirname(path.resolve(acceptance.firstCurrent.receipt.path));
 need(firstImageRecord&&path.resolve(firstDirectory,firstImageRecord.path)===path.resolve(firstImage.path)&&firstImage.bytes===firstImageRecord.bytes&&firstImage.sha256===firstImageRecord.sha256,'First Current image is not the image recorded by its receipt');
 need(firstReview.sourceSha===manifest.sourceSha&&firstReview.dataAccepted===true&&firstReview.imageAccepted===true&&firstReview.normalLifecycleAccepted===true,'First Current review does not accept this source/data/image/normal lifecycle');
 for(const key of ['receipt','image','lifecycle'])need(encoded(firstReview[key])===encoded(acceptance.firstCurrent[key]),'First Current review is not bound to the accepted '+key);
 const firstLifecycle=JSON.parse(await readPinned(acceptance.firstCurrent.lifecycle));
 need(firstLifecycle.source===source&&firstLifecycle.adapter===adapter&&firstLifecycle.out===path.dirname(path.resolve(acceptance.firstCurrent.receipt.path))&&firstLifecycle.resourceReadback.ownedPort===5197&&firstLifecycle.resourceReadback.setupComplete===true,'First lifecycle is not bound to the actual Current source/adapter/run/port');
 need(firstLifecycle.ok===true&&firstLifecycle.primaryError===null&&firstLifecycle.reportError===null&&firstLifecycle.resourceReadback.chromeAlive===false&&firstLifecycle.resourceReadback.portListening===false&&firstLifecycle.resourceReadback.acquisitionPending===false&&firstLifecycle.resourceReadback.serverAcquisitionPending===false&&firstLifecycle.resourceReadback.serverListenPending===false,'First Current requires its own passing normal lifecycle before remaining comparisons');
}
async function verifyPins(){
 for(const item of inputRecords){const p=path.resolve(source,item.path);need(p.startsWith(source+path.sep),'Source escape');const b=await fs.readFile(p);need(b.length===item.bytes&&sha(b)===item.sha256,'Source changed: '+item.path);}
 for(const[k,p]of Object.entries(paths))need((await fs.readFile(p)).equals(bytes[k]),'Code/settings changed: '+k);
 need((await readPinned(acceptance.audit)).equals(auditBytes)&&(await readPinned(acceptance.reviewRecord)).equals(reviewBytes),'Review/audit changed');
 for(const ref of Object.values(references)){await readPinned(ref.record.receipt);await readPinned(ref.record.image);}
}
await verifyPins();
const jobs=CONDITIONS.flatMap(condition=>profiles.map(profile=>({condition,profile}))).filter(({condition,profile})=>stage==='first'?(condition.id==='root-rest-front'&&profile.id==='current'):!(condition.id==='root-rest-front'&&profile.id==='current'));
need(jobs.length===(stage==='first'?1:11),'Stage budget mismatch');
await fs.mkdir(out,{recursive:false});
const dependencies=await fs.realpath(path.join(source,'node_modules'));
const identity={schemaVersion:2,taskId:'XR07-R7-STATES-20261025-0238',runId:contract.runId,sourceSha:manifest.sourceSha,contractSha256:pins.contract,inputDigest:manifest.inputDigest,planSha256:pins.plan,codePins:Object.fromEntries(codeKeys.map(k=>[k,pins[k]])),auditSha256:sha(auditBytes),stage,profileAdopted:false,questAccepted:false,normalizedBlenderExportSupported:false};
const completed=[],currentFingerprints=new Map();if(firstReceipt)currentFingerprints.set('root-rest-front',firstReceipt.invariantSha256);
let jobFailure=null;
const outcome=await withBrowserSession({source,adapter,out,port:5197,workTimeoutMs:stage==='first'?180000:900000,reportTimeoutMs:10000,cleanupTimeoutMs:10000,
 work:async ctx=>{
  await ctx.step(()=>fs.mkdir(path.join(out,'implementation')));
  for(const[k,b]of Object.entries(bytes))await ctx.writeFile(path.join(out,'implementation',k+(k==='script'||k==='fixture'||k==='controls'||k==='runtime'||k==='lifecycle'?'.mjs':'.json')),b,{flag:'wx'});
  await ctx.writeFile(path.join(out,'capture-input.json'),JSON.stringify({...identity,sourceInputCount:100,jobs:jobs.map(({condition,profile})=>({condition:condition.id,profile:profile.id})),selectionImageLimit:12,stageImageLimit:jobs.length,referencePins:acceptance.references},null,2),{flag:'wx'});
  for(const {condition,profile}of jobs){
   await ctx.step(verifyPins);const id=condition.id+'--'+profile.id,errors=[],networkFailures=[],started=performance.now();
   const page=await ctx.phase({label:id+' page',timeoutMs:15000},()=>ctx.browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1}));
   page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>networkFailures.push({url:r.url(),error:r.failure()?.errorText}));
   try{
    const url=new URL(contract.capture.webQuery,'http://127.0.0.1:5197/');if(profile.id!=='current')url.searchParams.set('set',JSON.stringify(profile.overrides));
    await ctx.phase({label:id+' load',timeoutMs:60000},async()=>{await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:55000});await page.waitForFunction(()=>window.ready===true,null,{timeout:55000});});
    const result=await ctx.phase({label:id+' entire fixture/font/capture',timeoutMs:90000},()=>ctx.capture(()=>page.evaluate(async args=>{const m=await import('/@fs'+args.adapter+'/candidate_fixtures.mjs');return m.captureCandidate(args);},{source,dependencies,adapter,contract,layersContract,records:inputRecords,expectedDefaults:profile.expected,profile:{id:profile.id,resolvedWindow:profile.resolvedWindow},condition})));
    need(!errors.length&&!networkFailures.length,'Browser errors');await ctx.step(verifyPins);
    const referenceCheck=compareCurrentReference(condition,result,references[condition.id].data,profile),fingerprint=sha(encoded(result.invariants));
    if(profile.id==='current')currentFingerprints.set(condition.id,fingerprint);else need(fingerprint===currentFingerprints.get(condition.id),'Non-window geometry/type/input/state/optical fingerprint changed');
    const image=Buffer.from(result.png.split(',')[1],'base64');delete result.png;const imageRecord={path:id+'.png',bytes:image.length,sha256:sha(image),widthPx:1600,heightPx:1000};
    const currentReferencePngByteEqual=profile.id==='current'?image.equals(references[condition.id].image):null;
    const receipt={...identity,condition,profileId:profile.id,overrides:profile.overrides,verified:true,referenceCheck,invariantSha256:fingerprint,currentReferencePngByteEqual,pngDifferencePolicy:'record-only; separate image review required, not automatic acceptance',result,errors,networkFailures,image:imageRecord,measurement:{wallMs:performance.now()-started,scope:'Desktop synthetic fixture/font/capture latency, not headset frame time'}};
    await ctx.writeFile(path.join(out,imageRecord.path),image,{flag:'wx'});const rb=Buffer.from(JSON.stringify(receipt,null,2));await ctx.writeFile(path.join(out,id+'.json'),rb,{flag:'wx'});
    completed.push({condition:condition.id,profileId:profile.id,image:imageRecord,receipt:{path:id+'.json',bytes:rb.length,sha256:sha(rb)},invariantSha256:fingerprint,currentReferencePngByteEqual});
    console.log(JSON.stringify({id,verified:true,currentReferencePngByteEqual}));
    await ctx.phase({label:id+' page close',timeoutMs:10000},()=>page.close());
   }catch(error){jobFailure={id,error:String(error),errors,networkFailures};throw error;}
  }
  need(completed.length===jobs.length,'Incomplete stage');return {images:completed.length};
 },
 writeSummary:async({value,primaryError})=>{
  if(jobFailure)await fs.writeFile(path.join(out,'job-failure.json'),JSON.stringify(jobFailure,null,2),{flag:'wx'});
  await fs.writeFile(path.join(out,primaryError?'failure.json':'summary.json'),JSON.stringify({...identity,technicalStagePassed:!primaryError&&completed.length===jobs.length,selectionImageLimit:12,completed,value:value??null,primaryError:primaryError?String(primaryError):null,independentImageReviewRequired:true},null,2),{flag:'wx'});
 }
});
if(!outcome.ok){console.error(JSON.stringify({ok:false,completed:completed.length,lifecycle:outcome.lifecycle}));process.exitCode=1;}
else console.log(JSON.stringify({ok:true,stage,completed:completed.length,lifecycle:outcome.lifecycle.resourceReadback}));
