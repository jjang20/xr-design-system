// Current R5 WebGL controls evidence. Does not emit Blender geometry or adopt design.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {STATES,NEGATIVES} from './controls_fixtures.mjs';
const [sourceArg,outArg,selection='all']=process.argv.slice(2);
if(!sourceArg||!outArg)throw Error('Usage: controls_capture.mjs <pinned-source> <fresh-output> [all|negatives|state|negative:scenario]');
if(selection!=='all'&&selection!=='negatives'&&!STATES.includes(selection)&&!(selection.startsWith('negative:')&&NEGATIVES.includes(selection.slice(9))))throw Error('Unsupported R5 selection');
const source=path.resolve(sourceArg),out=path.resolve(outArg),adapter=path.dirname(fileURLToPath(import.meta.url));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const paths={manifest:path.join(adapter,'baseline/manifest.json'),contract:path.join(adapter,'baseline/comparison-contract.json'),script:fileURLToPath(import.meta.url),fixture:path.join(adapter,'controls_fixtures.mjs')};
const pinned=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([k,p])=>[k,await fs.readFile(p)])));
const manifest=JSON.parse(pinned.manifest),contract=JSON.parse(pinned.contract);
const records=[...manifest.trackedInputs,...manifest.externalAssets];
const inventoryDigest=sha(JSON.stringify(records.map(r=>({bytes:r.bytes,path:r.path,sha256:r.sha256}))));
if(sha(pinned.contract)!==manifest.comparisonContractSha256||contract.sourceSha!==manifest.sourceSha||inventoryDigest!==manifest.inputDigest)throw Error('R5 source/contract identity mismatch');
async function verifyPins(){
 for(const item of records){const location=path.resolve(source,item.path);if(!location.startsWith(source+path.sep))throw Error('Input path escapes source');const b=await fs.readFile(location);if(b.length!==item.bytes||sha(b)!==item.sha256)throw Error('Pinned input mismatch: '+item.path);}
 for(const [key,p]of Object.entries(paths))if(!(await fs.readFile(p)).equals(pinned[key]))throw Error('Capture code/settings changed: '+key);
}
await verifyPins();
const expectedDefaults=structuredClone((await import(pathToFileURL(path.join(source,'src/core/defaults.js')))).DEFAULTS);
await fs.mkdir(out,{recursive:false});
const identity={schemaVersion:1,sourceSha:manifest.sourceSha,contractSha256:sha(pinned.contract),manifestSha256:sha(pinned.manifest),inputDigest:manifest.inputDigest,scriptSha256:sha(pinned.script),fixtureSha256:sha(pinned.fixture),sourceInputsVerified:manifest.trackedInputs.length+manifest.externalAssets.length,profile:'current-r5',adopted:false,headsetAcceptance:false,normalizedBlenderExportSupported:false};
const jobs=selection==='all'?[...STATES.map(state=>({state})),...NEGATIVES.map(scenario=>({scenario}))]:selection==='negatives'?NEGATIVES.map(scenario=>({scenario})):selection.startsWith('negative:')?[{scenario:selection.slice(9)}]:[{state:selection}];
await fs.writeFile(path.join(out,'capture-input.json'),JSON.stringify({...identity,jobs,nodeVersion:process.version},null,2),{flag:'wx'});
const dependencies=await fs.realpath(path.join(source,'node_modules'));
const {createServer}=await import(pathToFileURL(path.join(dependencies,'vite/dist/node/index.js')));
const {chromium}=await import(pathToFileURL(path.join(dependencies,'playwright-core/index.mjs')));
const server=await createServer({configFile:false,root:path.join(source,'demo'),cacheDir:path.join(out,'vite-cache'),logLevel:'error',server:{host:'127.0.0.1',port:5194,strictPort:true,fs:{allow:[source,dependencies,adapter]}}});
let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const job of jobs){
  await verifyPins();const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1}),errors=[],networkFailures=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});page.on('requestfailed',r=>networkFailures.push({url:r.url(),error:r.failure()?.errorText}));
  const id=job.state??'negative-'+job.scenario;
  try{
   await page.goto(new URL(contract.capture.webQuery,'http://127.0.0.1:5194/').href,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.ready===true,null,{timeout:90000});
   const result=await page.evaluate(captureInBrowser,{source,dependencies,adapter,contract,expectedDefaults,...job});
   if(errors.length||networkFailures.length)throw Error('Browser errors: '+JSON.stringify({errors,networkFailures}));
   await verifyPins();const artifacts=[];
   if(result.png){const b=Buffer.from(result.png.split(',')[1],'base64');await fs.writeFile(path.join(out,id+'-front.png'),b,{flag:'wx'});artifacts.push({path:id+'-front.png',bytes:b.length,sha256:sha(b),widthPx:1600,heightPx:1000});delete result.png;}
   const evidence={...identity,...job,verified:true,result,errors,networkFailures,artifacts};
   const bytes=JSON.stringify(evidence,null,2);await fs.writeFile(path.join(out,id+'-evidence.json'),bytes,{flag:'wx'});
   results.push({id,verified:true,artifacts,evidence:{path:id+'-evidence.json',bytes:Buffer.byteLength(bytes),sha256:sha(bytes)}});
   console.log(JSON.stringify({id,verified:true,artifacts}));
  }catch(error){await fs.writeFile(path.join(out,id+'-failure.json'),JSON.stringify({job,error:String(error),errors,networkFailures,url:page.url()},null,2),{flag:'wx'});throw error;}finally{await page.close();}
 }
 await verifyPins();await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({...identity,browserChecksPassed:true,geometryExportPassed:false,geometryExportStatus:'unsupported-fail-closed',results},null,2),{flag:'wx'});
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({...identity,error:String(error),completed:results},null,2),{flag:'wx'});throw error;}
finally{await browser?.close();await server.close();}

export async function captureInBrowser({source,dependencies,adapter,contract,expectedDefaults,state,scenario}){
 const producerUrls={};
 for(const name of ['InputSystem','defaults','look']){
  const urls=[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(u=>new URL(u).pathname.endsWith(source+'/src/core/'+name+'.js')))];
  if(urls.length!==1)throw Error('Producer ESM identity ambiguous: '+name);producerUrls[name]=urls[0];
 }
 const THREE=await import('/@fs/'+dependencies+'/three/build/three.module.js');
 const {InputSystem}=await import(producerUrls.InputSystem),{DEFAULTS}=await import(producerUrls.defaults),look=await import(producerUrls.look);
 const {applyControlsFixture,runControlNegative}=await import('/@fs/'+adapter+'/controls_fixtures.mjs');
 if(JSON.stringify(DEFAULTS)!==JSON.stringify(expectedDefaults))throw Error('Actual DEFAULTS changed');
 const c=window.contour,p=c.panel,l=p.levels[0],anchor=new THREE.Vector3(...contract.capture.fixedAnchorWorldM),handles=[...l.moves,...l.corners];
 if(look.backdropUniforms().envMap!==l.panel.skin.uniforms.envMap||handles.some(h=>h.skin.envMap!==look.backdropUniforms().envMap))throw Error('Actual shader/backdrop identity mismatch');
 if(!l.panel.skin.uniforms.envMap.value||handles.some(h=>h.body.children.some(m=>!('ENVMAP_TYPE_CUBE_UV'in m.material.defines))))throw Error('Actual HDR shader not ready');
 if('uRearMask'in l.panel.skin.uniforms||l.panel.body.material.fragmentShader.includes('uRearMask'))throw Error('R4 hard mask remains');
 const options={THREE,InputSystem,contour:c,contract,state,scenario};
 const fixture=scenario?runControlNegative(options):applyControlsFixture(options);
 const visible=o=>{for(let q=o;q;q=q.parent)if(!q.visible)return false;return !o.material||o.material.visible!==false;};
 const texts=[];l.group.traverse(o=>{if(o.textRenderInfo&&visible(o))texts.push(o);});
 if(texts.length!==10||texts.some(t=>t.textRenderInfo.parameters.text!==t.text||t.textRenderInfo.visibleBounds.length!==4||!Array.from(t.textRenderInfo.visibleBounds).every(Number.isFinite)))throw Error('Canonical text readiness mismatch');
 const icons=[];
 for(const [row,r]of l.rows.entries()){
  const glyphs=r.face.children.filter(o=>o.geometry?.type==='PlaneGeometry'&&o.material?.map&&visible(o));if(glyphs.length!==2)throw Error('Missing icon/chevron');
  for(const [slot,o]of glyphs.entries()){
   const canvas=o.material.map.image;if(!canvas?.getContext||!canvas.width||!canvas.height)throw Error('Icon canvas not ready');const a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let covered=0;for(let k=3;k<a.length;k+=4)if(a[k])covered++;if(!covered)throw Error('Blank icon canvas');icons.push({row,slot,width:canvas.width,height:canvas.height,nonzeroAlphaPixels:covered});
  }
 }
 const cameraInUiM=c.camera.getWorldPosition(new THREE.Vector3()).sub(anchor).toArray(),cameraQuaternionUi=c.camera.getWorldQuaternion(new THREE.Quaternion()).toArray();
 if(cameraInUiM.some((v,i)=>Math.abs(v-[0,0,.8][i])>1e-9)||cameraQuaternionUi.some((v,i)=>Math.abs(v-[0,0,0,1][i])>1e-9)||c.camera.fov!==26||c.renderer.domElement.width!==1600||c.renderer.domElement.height!==1000)throw Error('R5 camera/framing changed');
 const hash=async array=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',array))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const drawn=[];l.group.traverse(o=>{if((o.isMesh||o.isLineSegments)&&visible(o)&&o.geometry?.attributes.position)drawn.push(o);});
 const geometry=[];
 for(const [id,o]of drawn.entries()){
  const pos=o.geometry.attributes.position,box=new THREE.Box3();for(let i=0;i<pos.count;i++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).sub(anchor));
  geometry.push({id,type:o.type,geometryType:o.geometry.type,vertices:pos.count,positionBufferSha256:await hash(pos.array),indexBufferSha256:o.geometry.index?await hash(o.geometry.index.array):null,matrixWorld:o.matrixWorld.toArray(),baseBufferBoundsUiM:{min:box.min.toArray(),max:box.max.toArray()},boundsAreShaderEvaluated:false});
 }
 const handleEvidence=[];
 for(const [i,h]of handles.entries()){
  const shaders=[];for(const m of h.body.children)shaders.push({vertexShaderSha256:await hash(new TextEncoder().encode(m.material.vertexShader)),fragmentShaderSha256:await hash(new TextEncoder().encode(m.material.fragmentShader)),defines:structuredClone(m.material.defines),side:m.material.side,premultipliedAlpha:m.material.premultipliedAlpha,depthWrite:m.material.depthWrite});
  const numericUniforms={};for(const [k,u]of Object.entries(h.skin))if(typeof u.value==='number'||u.value?.toArray)numericUniforms[k]=u.value?.toArray?u.value.toArray():u.value;
  handleEvidence.push({id:i<2?'side-'+i:'corner-'+(i-2),worldScale:h.getWorldScale(new THREE.Vector3()).toArray(),bodyMatrixWorld:h.body.matrixWorld.toArray(),hitMatrixWorld:h.hitMeshes[0].matrixWorld.toArray(),baseSizeLocalM:[h.w,h.h,h.t],radiusLocalM:h.r,bodyVisible:visible(h.body),invisibleHitMaterial:h.hitMeshes[0].material.visible===false,numericUniforms,shaders,arrow:h.arrow?{vertices:Array.from(h.arrow.geometry.attributes.position.array),matrixWorld:h.arrow.matrixWorld.toArray(),opacity:h.arrow.material.opacity,visible:visible(h.arrow)}:null});
 }
 const rootShaderUniforms={};for(const [k,u]of Object.entries(l.panel.skin.uniforms))if(typeof u.value==='number'||u.value?.toArray||Array.isArray(u.value))rootShaderUniforms[k]=Array.isArray(u.value)?u.value.map(v=>v?.toArray?v.toArray():v):u.value?.toArray?u.value.toArray():u.value;
 return {fixture,producerUrls,actualProducerModuleIdentity:true,actualShaderBackdropIdentity:true,noRearHardMask:true,cameraInUiM,cameraQuaternionUi,fovY:c.camera.fov,geometry,handleEvidence,rootShaderUniforms,texts:texts.map(t=>({text:t.text,font:t.font,fontSize:t.fontSize,letterSpacing:t.letterSpacing,visibleBounds:t.textRenderInfo.visibleBounds,blockBounds:t.textRenderInfo.blockBounds,matrixWorld:t.matrixWorld.toArray(),fillOpacity:t.fillOpacity})),readiness:{textRuns:10,icons,windowReady:window.ready},settings:{defaults:structuredClone(DEFAULTS),toneMapping:c.renderer.toneMapping,toneMappingExposure:c.renderer.toneMappingExposure,environmentRotation:c.scene.environmentRotation.toArray(),dpr:c.renderer.getPixelRatio()},geometryExport:{status:'unsupported-fail-closed',passed:false,reason:'Recorded base buffers and live shader uniforms are evidence only. No evaluated dent/squash mesh or Blender equivalent is emitted.'},png:scenario?null:c.pass('beauty')};
}
