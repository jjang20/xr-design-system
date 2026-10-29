// Capture current R5 Dock/Push behavior only. No material variants or native rendering.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';

const [sourceArg,outArg,suite='all']=process.argv.slice(2);
if(!sourceArg||!outArg||!['all','dock','push'].includes(suite))throw Error('Usage: dock_push_capture.mjs <pinned-source> <fresh-output> [all|dock|push]');
const source=path.resolve(sourceArg),out=path.resolve(outArg),adapter=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifestBytes=await fs.readFile(path.join(adapter,'baseline/manifest.json'));
const contractBytes=await fs.readFile(path.join(adapter,'baseline/comparison-contract.json'));
const manifest=JSON.parse(manifestBytes),contract=JSON.parse(contractBytes);
const entries=[...manifest.trackedInputs,...manifest.externalAssets];
const scenarioIds={palm:'observed-approach',fingertips:'broad-fingertip','one-child':'one-child','single-index':'single-index','pinch-excludes':'pinch-exclusion','patch-jump':'patch-jump',articulation:'articulation-only',behind:'initial-behind'};
const dockStateIds={rest:'rest','sphere-hover':'hover','sphere-held':'held','sphere-moved':'moved','sphere-released':'release','plate-held':'plate-held','plate-released':'plate-release'};
if(JSON.stringify(Object.values(scenarioIds))!==JSON.stringify(contract.states.push)||JSON.stringify(Object.values(dockStateIds))!==JSON.stringify(contract.states.dock))throw Error('Finite state inventory differs from contract');
if(sha(contractBytes)!==manifest.comparisonContractSha256||contract.sourceSha!==manifest.sourceSha||sha(JSON.stringify(entries.map(r=>({bytes:r.bytes,path:r.path,sha256:r.sha256}))))!==manifest.inputDigest)throw Error('Source/contract/digest identity mismatch');
for(const config of [contract.capture,contract.dockCapture])if(config.widthPx!==1600||config.heightPx!==1000||config.dpr!==1)throw Error('Frozen viewport differs');
async function verify(){for(const item of entries){const location=path.resolve(source,item.path);if(!location.startsWith(source+path.sep))throw Error('Source path escape');const data=await fs.readFile(location);if(data.length!==item.bytes||sha(data)!==item.sha256)throw Error('Source drift: '+item.path);}if(!(await fs.readFile(path.join(adapter,'baseline/manifest.json'))).equals(manifestBytes)||!(await fs.readFile(path.join(adapter,'baseline/comparison-contract.json'))).equals(contractBytes))throw Error('Baseline changed during capture');}
await verify();
const expectedDefaults=structuredClone((await import(pathToFileURL(path.join(source,'src/core/defaults.js')))).DEFAULTS);
await fs.mkdir(out,{recursive:false});
const pins={};for(const name of ['dock_push_capture.mjs','dock_push_fixtures.mjs']){const b=await fs.readFile(path.join(adapter,name));pins[name]=sha(b);await fs.writeFile(path.join(out,name),b,{flag:'wx'});}
const dependencies=await fs.realpath(path.join(source,'node_modules'));
const {createServer}=await import(pathToFileURL(path.join(dependencies,'vite/dist/node/index.js')));
const {chromium}=await import(pathToFileURL(path.join(dependencies,'playwright-core/index.mjs')));
const server=await createServer({configFile:false,root:path.join(source,'demo'),cacheDir:path.join(out,'vite-cache'),logLevel:'error',server:{host:'127.0.0.1',port:5196,strictPort:true,fs:{allow:[source,dependencies,adapter]}}});
const report={schemaVersion:1,sourceSha:manifest.sourceSha,contractSha256:sha(contractBytes),manifestSha256:sha(manifestBytes),inputDigest:manifest.inputDigest,codePins:pins,
  startedAt:new Date().toISOString(),suite,sourcePinsBefore:entries.length,contractScenarioMapping:scenarioIds,contractDockStateMapping:dockStateIds,checks:[],captures:[],errors:[],limits:['Synthetic WebXR provider and joints, not physical hand tracking.','Actual product InputSystem and component state/shader/geometry; no native/GPU or optical equivalence claim.','No-env screenshot has an opaque canvas; translucency is independently measured in the RGBA render target.','All numeric sizes and thresholds remain R5 trial values.']};
let browser;
async function writeJson(name,data){await fs.writeFile(path.join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});}
async function image(name,data){const b=Buffer.from(data.split(',')[1],'base64');await fs.writeFile(path.join(out,name+'.png'),b,{flag:'wx'});return {path:name+'.png',bytes:b.length,sha256:sha(b)};}
async function open(query){
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto('http://127.0.0.1:5196/bench.html?manual&dpr=1&'+query,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.ready===true,null,{timeout:180000});
  await page.evaluate(async({source,dependencies,adapter,expectedDefaults})=>{
    const producerUrls={};for(const name of ['InputSystem','defaults','look']){const urls=[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(u=>new URL(u).pathname.endsWith(source+'/src/core/'+name+'.js')))];if(urls.length!==1)throw Error('Producer ESM identity ambiguous: '+name);producerUrls[name]=urls[0];}
    const input=await import(producerUrls.InputSystem),settings=await import(producerUrls.defaults),look=await import(producerUrls.look);
    if(JSON.stringify(settings.DEFAULTS)!==JSON.stringify(expectedDefaults))throw Error('Actual DEFAULTS changed');
    window.r5modules={THREE:await import('/@fs/'+dependencies+'/three/build/three.module.js'),
      product:{InputSystem:input.InputSystem,Dock:window.contour.dock?.constructor},look,producerUrls,
      fixtures:await import('/@fs/'+adapter+'/dock_push_fixtures.mjs')};
    window.contour.renderer.setAnimationLoop(null);
  },{source,dependencies,adapter,expectedDefaults});
  return page;
}
try{
  await server.listen();
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  if(suite==='all'||suite==='dock')for(const mode of ['hdr','noenv']){
    const page=await open('part=dock&visible=5&dist=.4&rot=1.6');
    await page.evaluate(async({mode,contract,source})=>{
      const {THREE,product,fixtures}=window.r5modules,c=window.contour;
      if(mode==='noenv'){window.r5modules.look.setBackdrop(null);c.scene.background=null;c.scene.environment=null;c.renderer.setClearAlpha(0);}
      window.r5=await fixtures.createDockFixture({THREE,InputSystem:product.InputSystem,Dock:product.Dock,contour:c,contract,mode});
      if(window.r5.dock.base.material.uniforms.uHasRoom!==window.r5modules.look.backdropUniforms().uHasEnv)throw Error('Dock producer shader/backdrop identity mismatch');
    },{mode,contract,source});
    await page.waitForFunction(()=>{const ts=[];window.contour.scene.traverse(o=>{if('textRenderInfo'in o)ts.push(o);});return ts.every(o=>!!o.textRenderInfo);},null,{timeout:180000});
    const alpha=await page.evaluate(()=>{
      const {THREE}=window.r5modules,c=window.contour,d=window.r5.dock,target=new THREE.WebGLRenderTarget(1600,1000);
      const [x,z]=d.arc(d.length/2-d.pad/2,0),point=d.shelf.localToWorld(new THREE.Vector3(x,0,z)).project(c.camera);
      const pixelXY=[Math.round((point.x+1)*800),Math.round((point.y+1)*500)],rgba=new Uint8Array(4),read=()=>{c.renderer.render(c.scene,c.camera);c.renderer.readRenderTargetPixels(target,...pixelXY,1,1,rgba);return Array.from(rgba);};
      c.renderer.setRenderTarget(target);const shown=read(),before=d.base.visible;d.base.visible=false;const hidden=read();d.base.visible=before;c.renderer.setRenderTarget(null);target.dispose();
      return {pixelXY,shown,hidden,hasRoom:d.base.material.uniforms.uHasRoom.value,passthroughAlpha:d.base.material.uniforms.uPassthroughAlpha.value,method:'Actual RGBA offscreen target; exposed plate endpoint with same-mesh visibility counterfactual'};
    });
    report.checks.push({name:mode+' actual plate RGBA alpha',pass:mode==='hdr'?alpha.shown[3]===255&&alpha.hasRoom===1:alpha.shown[3]>0&&alpha.shown[3]<128&&alpha.hidden[3]===0&&alpha.hasRoom===0});
    await writeJson('dock-'+mode+'-alpha.json',alpha);
    for(const action of ['rest','sphereHover','sphereHeld','sphereMoved','sphereReleased','plateHeld','plateReleased']){
      const r=await page.evaluate(action=>{try{const state=window.r5.actions[action]();return {state,png:window.contour.pass('beauty')};}catch(e){return {error:String(e),frames:window.r5.frames,checks:window.r5.checks};}},action);
      if(r.error){await writeJson('dock-'+mode+'-'+action+'-failure.json',r);throw Error(r.error);}
      const saved=await image('dock-'+mode+'-'+r.state.label,r.png);await writeJson('dock-'+mode+'-'+r.state.label+'.json',r.state);report.captures.push({...saved,kind:'dock',mode,state:r.state.label,contractState:dockStateIds[r.state.label]});
    }
    const evidence=await page.evaluate(()=>({checks:window.r5.checks,frames:window.r5.frames,proofLevel:window.r5.proofLevel}));
    await writeJson('dock-'+mode+'-trace.json',evidence);report.checks.push(...evidence.checks.map(x=>({...x,name:mode+' '+x.name})));await page.close();
  }
  if(suite==='all'||suite==='push')for(const scenario of Object.keys(scenarioIds))for(const fingerCount of scenario==='fingertips'?[4,3,2]:[4]){
    const id=scenario+(scenario==='fingertips'?'-'+fingerCount+'pads':'');
    const page=await open('component=packaging&layout=quest&dist=.6&fov=26&rot=1.6');
    await page.evaluate(async({scenario,contract,fingerCount})=>{const {THREE,product,fixtures}=window.r5modules;window.r5=await fixtures.createPushFixture({THREE,InputSystem:product.InputSystem,contour:window.contour,scenario,contract,fingerCount});},{scenario,contract,fingerCount});
    await page.waitForFunction(()=>{const ts=[];window.contour.scene.traverse(o=>{if('textRenderInfo'in o)ts.push(o);});return ts.every(o=>!!o.textRenderInfo);},null,{timeout:180000});
    const result=await page.evaluate(()=>{try{return window.r5.run();}catch(e){return {error:String(e),frames:window.r5.frames};}});
    if(result.error){await writeJson('push-'+id+'-failure.json',result);throw Error(result.error);}
    result.contractScenario=scenarioIds[scenario];result.subcase=scenario==='fingertips'?fingerCount+'-extended-pads':null;
    for(const shot of result.shots){const saved=await image('push-'+id+'-'+shot.label,shot.png);delete shot.png;report.captures.push({...saved,kind:'push',scenario,contractScenario:scenarioIds[scenario],subcase:result.subcase,state:shot.label});}
    await writeJson('push-'+id+'-trace.json',result);report.checks.push(...result.checks.map(x=>({...x,name:id+' '+x.name})));await page.close();
  }
  await verify();report.sourcePinsAfter=entries.length;
  for(const [name,pin]of Object.entries(pins))if(sha(await fs.readFile(path.join(adapter,name)))!==pin)throw Error('Capture adapter changed mid-run: '+name);
  report.allPassed=report.checks.every(x=>x.pass)&&report.errors.length===0;
  if(!report.allPassed)throw Error('Capture checks failed');
}catch(error){report.allPassed=false;report.errors.push(String(error));throw error;}
finally{report.completedAt=new Date().toISOString();await writeJson('summary.json',report);await browser?.close();await server.close();}
console.log(JSON.stringify({allPassed:report.allPassed,checks:report.checks.length,captures:report.captures.length,output:out}));
