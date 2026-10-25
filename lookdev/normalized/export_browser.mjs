// Extract the actual fixed Catalog geometry and Troika shaping, using existing dependencies.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
const [sourceArg,bundleArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: export_browser.mjs <pinned-source> <bundle> <new-evidence-dir>');
const source=path.resolve(sourceArg),bundle=path.resolve(bundleArg),out=path.resolve(outArg);
const manifest=JSON.parse(await fs.readFile(new URL('./baseline/manifest.json',import.meta.url)));
const expectedContract=await fs.readFile(new URL('./baseline/comparison-contract.json',import.meta.url));
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
async function verifySource(){
 for(const item of [...manifest.trackedInputs,...manifest.externalAssets]){
  const bytes=await fs.readFile(path.join(source,item.path));
  if(bytes.length!==item.bytes||digest(bytes)!==item.sha256)throw Error('Pinned source mismatch: '+item.path);
 }
}
await verifySource();
try{await fs.stat(path.join(bundle,'normalized.json'));throw Error('Existing normalized input; use a fresh bundle');}
catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(out,{recursive:false});
const dependencies=await fs.realpath(path.join(source,'node_modules'));
const {createServer}=await import(pathToFileURL(path.join(dependencies,'vite/dist/node/index.js')));
const {chromium}=await import(pathToFileURL(path.join(dependencies,'playwright-core/index.mjs')));
const assets=JSON.parse(await fs.readFile(path.join(bundle,'assets.json')));
const contractBytes=await fs.readFile(path.join(bundle,'contract.json'));
if(digest(contractBytes)!==manifest.comparisonContractSha256||!contractBytes.equals(expectedContract))throw Error('Frozen contract mismatch');
if(assets.sourceSha!==manifest.sourceSha||assets.inputDigest!==manifest.inputDigest||assets.contractSha256!==manifest.comparisonContractSha256)throw Error('Bundle identity mismatch');
const contract=JSON.parse(contractBytes);
const icons=Object.fromEntries(await Promise.all(contract.assetPolicy.glyphs.map(async n=>[n,await fs.readFile(path.join(bundle,'icons',n+'.svg'),'utf8')])));
const server=await createServer({configFile:false,root:path.join(source,'demo'),cacheDir:path.join(out,'vite-cache'),logLevel:'error',server:{host:'127.0.0.1',port:5194,strictPort:true,fs:{allow:[source,dependencies,bundle]}}});
let browser;
try {
 await server.listen();
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:5194/bench.html?dist=0.6&fov=26&rot=1.6&hover=emboss&dpr=1&manual',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.ready===true,{timeout:60000});
 const result=await page.evaluate(async ({dependencies,assets,contract,icons})=>{
  const THREE=await import('/@fs/'+dependencies+'/three/build/three.module.js');
  const {SVGLoader}=await import('/@fs/'+dependencies+'/three/examples/jsm/loaders/SVGLoader.js');
  const {typesetterWorkerModule}=await import('/@fs/'+dependencies+'/troika-three-text/src/TextBuilder.js');
  const {defineWorkerModule}=await import('/@fs/'+dependencies+'/troika-worker-utils/dist/troika-worker-utils.esm.js');
  const shape=defineWorkerModule({dependencies:[typesetterWorkerModule],init:typesetter=>args=>new Promise(resolve=>typesetter.typeset(args,resolve))});
  const c=window.contour,p=c.panel,l=p.levels[0];c.tick(180);p.updateMatrixWorld(true);
  const stableFrames=[];
  for(let frame=0;frame<3;frame++){c.tick(1);p.updateMatrixWorld(true);stableFrames.push(JSON.stringify({pose:l.cur,rows:l.rows.map(r=>({position:r.position.toArray(),face:r.face.position.toArray()}))}));}
  if(new Set(stableFrames).size!==1)throw Error('Catalog pose is not stable across three frames');
  const inputState=[l.panel,...l.rows].map(r=>({pressed:r.press.pressed,depth:r.press.depth,amount:r.press.amount,hovered:r.hovered,hover:r.hover??0}));
  const bulgeHeights=l.panel.skin.uniforms.uBulgeParam.value.map(v=>v.y);
  if(!p.settled||p.closing.length||p.levels.length!==1||inputState.some(r=>r.pressed||r.hovered||Math.abs(r.depth)>1e-9||Math.abs(r.amount)>1e-9||r.hover>1e-9)||bulgeHeights.some(h=>Math.abs(h)>1e-9))throw Error('Rest state not settled');
  const inv=p.matrixWorld.clone().invert(),meshes=[],texts=[],iconMeta=[],checks=[],iconReadiness=[];
  const bounds=vs=>({min:[0,1,2].map(i=>Math.min(...vs.map(v=>v[i]))),max:[0,1,2].map(i=>Math.max(...vs.map(v=>v[i])))});
  function addMesh(id,role,geo,matrix,opacity=1){
   const g=geo.clone().applyMatrix4(matrix),pos=g.attributes.position,n=g.attributes.normal;
   const vs=Array.from({length:pos.count},(_,i)=>[pos.getX(i),pos.getY(i),pos.getZ(i)]);
   const indices=g.index?Array.from(g.index.array):Array.from({length:pos.count},(_,i)=>i);
   const triangles=[];for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3));
   const record={id,role,material:role,verticesUiM:vs,triangles,expectedBoundsUiM:bounds(vs),opacity};
   if(n)record.normalsUi=Array.from({length:n.count},(_,i)=>[n.getX(i),n.getY(i),n.getZ(i)]);
   meshes.push(record);g.dispose();return record;
  }
  const matrix=o=>new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld);
  addMesh('window','window',l.panel.body.geometry,matrix(l.panel.body));
  l.separators.forEach((s,i)=>addMesh('separator-'+i,'separator',s.geometry,matrix(s),s.material.opacity));
  for(let i=0;i<l.rows.length;i++){
   const row=l.rows[i];const bead=row.face.children.find(o=>o.geometry?.type==='SphereGeometry');
   if(!bead)throw Error('Missing bead '+i);
   addMesh('bead-'+i,'bead',bead.geometry,matrix(bead));
  }
  const ts=[];l.group.traverse(o=>{if(o.textRenderInfo)ts.push(o)});
  const loader=new SVGLoader();
  for(let i=0;i<ts.length;i++){
   const t=ts[i],info=t.textRenderInfo;
   const shaped=await shape({...info.parameters});
   const delta=Math.max(...info.visibleBounds.map((v,k)=>Math.abs(v-shaped.visibleBounds[k])));
   if(delta>1e-7)throw Error('Shaping bounds drift '+t.text);
   if(shaped.fontData.length!==1)throw Error('Font fallback '+t.text);
   const weight=Number(t.font.match(/latin-(\d+)-normal/)[1]);
   const font=assets.fonts.find(f=>f.weight===weight),style=Object.entries(contract.typeRamp).find(([k,v])=>Math.abs(v.sizeM-t.fontSize)<1e-9&&v.weight===weight&&v.tracking===t.letterSpacing)?.[0];
   if(!font||!style)throw Error('Unknown type ramp '+t.text);
   const meshIds=[];const parentMatrix=matrix(t);
   for(let g=0;g<shaped.glyphIds.length;g++){
    const fd=shaped.fontData[shaped.glyphFontIndices[g]],gd=shaped.glyphData[fd.src][shaped.glyphIds[g]];
    const svg=loader.parse('<svg xmlns="http://www.w3.org/2000/svg"><path fill="white" d="'+gd.path+'"/></svg>');
    const shapes=svg.paths.flatMap(p=>SVGLoader.createShapes(p));
    const geo=new THREE.ShapeGeometry(shapes,32);
    const k=t.fontSize/fd.unitsPerEm;
    const local=new THREE.Matrix4().makeTranslation(shaped.glyphPositions[g*2],shaped.glyphPositions[g*2+1],0).multiply(new THREE.Matrix4().makeScale(k,k,k));
    const id='text-'+i+'-glyph-'+g;
    addMesh(id,'text',geo,parentMatrix.clone().multiply(local),t.fillOpacity);meshIds.push(id);geo.dispose();
   }
   const vertices=meshIds.flatMap(id=>meshes.find(m=>m.id===id).verticesUiM);
   const glyphBounds=bounds(vertices);
   const b0=new THREE.Vector3(info.visibleBounds[0],info.visibleBounds[1],0).applyMatrix4(parentMatrix),b1=new THREE.Vector3(info.visibleBounds[2],info.visibleBounds[3],0).applyMatrix4(parentMatrix);
   const outlineError=Math.max(...glyphBounds.min.map((v,k)=>Math.abs(v-b0.getComponent(k))),...glyphBounds.max.map((v,k)=>Math.abs(v-b1.getComponent(k))));
   if(outlineError>2e-6)throw Error('Outline bounds mismatch '+t.text+': '+outlineError);
   texts.push({id:'text-'+i,text:t.text,style,fontId:font.id,fontSha256:font.sha256,sizeM:t.fontSize,trackingEm:t.letterSpacing,advanceM:info.blockBounds[2]-info.blockBounds[0],boundsUiM:glyphBounds,meshIds,opacity:t.fillOpacity});
   checks.push({text:t.text,actualShapingBoundsErrorM:delta,meshOutlineBoundsErrorM:outlineError,fontSrc:shaped.fontData[0].src});
  }
  for(let ri=0;ri<l.rows.length;ri++){
   const row=l.rows[ri];const sprites=row.face.children.filter(o=>o.geometry?.type==='PlaneGeometry'&&o.material?.map);
   if(sprites.length!==2)throw Error('Expected bead glyph and chevron');
   for(let k=0;k<sprites.length;k++){
    const o=sprites[k],name=k===0?contract.resolvedLevels[0].rows[ri].icon:'chevron-right',size=o.geometry.parameters.width;
    const canvas=o.material.map.image;
    if(!canvas?.width||!canvas?.height||!canvas.getContext)throw Error('Icon canvas unavailable '+name);
    const alpha=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let covered=0;for(let ai=3;ai<alpha.length;ai+=4)if(alpha[ai]>0)covered++;
    if(!covered)throw Error('Icon canvas is still blank '+name);
    iconReadiness.push({id:'icon-'+ri+'-'+k,name,width:canvas.width,height:canvas.height,nonzeroAlphaPixels:covered});
    const parsed=loader.parse(icons[name]),meshIds=[];
    for(let pi=0;pi<parsed.paths.length;pi++){
     const sp=parsed.paths[pi];
     for(let si=0;si<sp.subPaths.length;si++){
      const geo=SVGLoader.pointsToStroke(sp.subPaths[si].getPoints(48),sp.userData.style,24,.00001);
      if(!geo)continue;
      const local=new THREE.Matrix4().makeScale(size/24,-size/24,1).multiply(new THREE.Matrix4().makeTranslation(-12,-12,0));
      const id='icon-'+ri+'-'+k+'-'+pi+'-'+si;
      addMesh(id,'icon',geo,matrix(o).multiply(local),o.material.opacity);meshIds.push(id);geo.dispose();
     }
    }
    const asset=assets.assets.find(a=>a.path==='icons/'+name+'.svg');
    iconMeta.push({id:'icon-'+ri+'-'+k,name,sourceSha256:asset.sha256,sizeM:size,boundsUiM:bounds(meshIds.flatMap(id=>meshes.find(m=>m.id===id).verticesUiM)),meshIds,opacity:o.material.opacity});
   }
  }
  const palette={window:.18,bead:.35,text:1,icon:1,separator:.4,background:.05};
  const actualCamera=c.camera.position.clone().applyMatrix4(inv).toArray();
  const normalized={schemaVersion:1,sourceSha:assets.sourceSha,contractSha256:assets.contractSha256,inputDigest:assets.inputDigest,state:'rest',view:'front',fonts:assets.fonts,assets:assets.assets,meshes,texts,icons:iconMeta,calibration:{palette,opacity:1,viewTransform:'Standard',look:'None'},browser:{settled:p.settled,closingLevels:p.closing.length,fontAndIconReady:window.ready&&iconReadiness.length===8,iconReadiness,successiveStableFrames:stableFrames.length,inputState,bulgeHeights,cameraInUiM:actualCamera,fovY:c.camera.fov,near:c.camera.near,far:c.camera.far,checks}};
  const beauty=c.pass('beauty');
  // Actual component calibration: preserve real text SDF and icon textures.
  c.scene.background=new THREE.Color().setRGB(palette.background,palette.background,palette.background);
  c.renderer.toneMapping=THREE.NoToneMapping;c.renderer.outputColorSpace=THREE.SRGBColorSpace;
  const flat=(o,color,map=null)=>{o.onBeforeRender=()=>{};o.material=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(color,color,color),map,alphaTest:map ? 0.5 : 0,side:THREE.DoubleSide,toneMapped:false});};
  flat(l.panel.body,palette.window);for(const s of l.separators)flat(s,palette.separator);
  for(const row of l.rows)for(const o of row.face.children){if(o.geometry?.type==='SphereGeometry')flat(o,palette.bead);else if(o.geometry?.type==='PlaneGeometry'&&o.material.map)flat(o,1,o.material.map);}
  for(const t of ts){t.color=0xffffff;t.fillOpacity=1;t.outlineOpacity=0;}
  c.renderer.render(c.scene,c.camera);
  const gl=c.renderer.getContext(),px=new Uint8Array(1600*1000*4);gl.readPixels(0,0,1600,1000,gl.RGBA,gl.UNSIGNED_BYTE,px);
  const cv=document.createElement('canvas');cv.width=1600;cv.height=1000;const ctx=cv.getContext('2d'),im=ctx.createImageData(1600,1000);for(let y=0;y<1000;y++)im.data.set(px.subarray((999-y)*6400,(1000-y)*6400),y*6400);ctx.putImageData(im,0,0);
  return {normalized,beauty,calibration:cv.toDataURL('image/png')};
 },{dependencies,assets,contract,icons});
 if(errors.length)throw Error(errors.join('\n'));
 await verifySource();
 await fs.writeFile(path.join(bundle,'normalized.json'),JSON.stringify(result.normalized),{flag:'wx'});
 await fs.writeFile(path.join(out,'browser-calibration.png'),Buffer.from(result.calibration.split(',')[1],'base64'));
 await fs.writeFile(path.join(out,'browser-beauty.png'),Buffer.from(result.beauty.split(',')[1],'base64'));
 await fs.writeFile(path.join(out,'browser-preflight.json'),JSON.stringify(result.normalized.browser,null,2));
 console.log(JSON.stringify({meshCount:result.normalized.meshes.length,textCount:result.normalized.texts.length,iconCount:result.normalized.icons.length,normalizedSha256:crypto.createHash('sha256').update(await fs.readFile(path.join(bundle,'normalized.json'))).digest('hex')}));
} finally {await browser?.close();await server.close();}
