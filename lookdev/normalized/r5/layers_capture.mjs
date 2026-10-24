// Browser-only layer evidence. Never interprets row select dispatch as hand tracking.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import crypto from 'node:crypto';

const [sourceArg, outArg, fixtureName, view] = process.argv.slice(2);
if (!sourceArg || !outArg || !['lighting', 'modular'].includes(fixtureName) || !['front', 'angle', 'side', 'back'].includes(view)) {
  throw Error('Usage: layers_capture.mjs <pinned-source> <fresh-output> <lighting|modular> <front|angle|side|back>');
}
const source = await fs.realpath(sourceArg), out = path.resolve(outArg);
const scriptPath = fileURLToPath(import.meta.url);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const scriptBytes = await fs.readFile(scriptPath);
const contractBytes = await fs.readFile(new URL('./layers-contract.json', import.meta.url));
const parentBytes = await fs.readFile(new URL('./baseline/comparison-contract.json', import.meta.url));
const manifestBytes = await fs.readFile(new URL('./baseline/manifest.json', import.meta.url));
const contract = JSON.parse(contractBytes), parent = JSON.parse(parentBytes), manifest = JSON.parse(manifestBytes);
const records = [...manifest.trackedInputs, ...manifest.externalAssets];
const inventoryDigest = sha(JSON.stringify(records.map(r => ({bytes:r.bytes, path:r.path, sha256:r.sha256}))));
if (sha(parentBytes) !== contract.parentR5ContractSha256 || manifest.comparisonContractSha256 !== sha(parentBytes)
  || parent.sourceSha !== contract.sourceSha || manifest.sourceSha !== contract.sourceSha
  || manifest.inputDigest !== contract.inputDigest || inventoryDigest !== contract.inputDigest
  || records.length !== contract.sourceRecordCount) throw Error('R5 source inventory or parent contract identity changed');
async function verifySource() {
  for (const r of records) {
    const location = path.resolve(source, r.path);
    if (!location.startsWith(source + path.sep)) throw Error('Source inventory path escapes snapshot');
    const bytes = await fs.readFile(location);
    if (bytes.length !== r.bytes || sha(bytes) !== r.sha256) throw Error('Pinned source mismatch: ' + r.path);
  }
  return {passed:true, records:records.length, inputDigest:inventoryDigest};
}
const before = await verifySource();
const {DEFAULTS} = await import(pathToFileURL(path.join(source,'src/core/defaults.js')));
const canonicalDefaults = structuredClone(DEFAULTS), expectedDefaults = structuredClone(DEFAULTS);
await fs.mkdir(out, {recursive:false});
const implementationEvidence = [];
for (const [name,bytes] of [['capture-script.mjs',scriptBytes],['layers-contract.json',contractBytes],['parent-r5-contract.json',parentBytes],['source-inventory.json',manifestBytes]]) {
  await fs.writeFile(path.join(out,name),bytes,{flag:'wx'});
  implementationEvidence.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
}
const dependencies = await fs.realpath(path.join(source, 'node_modules'));
const {createServer} = await import(pathToFileURL(path.join(dependencies, 'vite/dist/node/index.js')));
const {chromium} = await import(pathToFileURL(path.join(dependencies, 'playwright-core/index.mjs')));
const server = await createServer({configFile:false, root:path.join(source, 'demo'), cacheDir:path.join(out, 'vite-cache'), logLevel:'error',
  server:{host:'127.0.0.1', port:5195, strictPort:true, fs:{allow:[source, dependencies]}}});
let browser;
const errors = [], failedRequests = [];
try {
  await server.listen();
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true,
    args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  const page = await browser.newPage({viewport:{width:contract.capture.widthPx, height:contract.capture.heightPx}, deviceScaleFactor:1});
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', message => {if(message.type()==='error')errors.push('console: '+message.text());});
  page.on('requestfailed', r => failedRequests.push({url:r.url(), failure:r.failure()}));
  const captureUrl=new URL('http://127.0.0.1:5195/' + contract.capture.webQuery);
  await page.goto(captureUrl.href, {waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(() => window.ready === true, null, {timeout:90000});
  const result = await page.evaluate(async ({source, dependencies, contract, parent, fixtureName, view, records, expectedDefaults}) => {
    const THREE = await import('/@fs/' + dependencies + '/three/build/three.module.js');
    // Import the exact resource URL used by the bench. /@fs//absolute-path can
    // create a second ESM instance whose DEFAULTS/backdrop are not the product's.
    const moduleUrl = suffix => {
      const matches=[...new Set(performance.getEntriesByType('resource').map(r=>r.name).filter(name=>new URL(name).pathname.endsWith(suffix)))];
      if(matches.length!==1)throw Error('Ambiguous or missing live product module: '+suffix);
      return matches[0];
    };
    const lookUrl=moduleUrl('/src/core/look.js'),defaultsUrl=moduleUrl('/src/core/defaults.js');
    const look = await import(lookUrl);
    const {DEFAULTS:runtimeDefaults} = await import(defaultsUrl);
    const runtimeDefaultsJson=JSON.stringify(runtimeDefaults);
    if(runtimeDefaultsJson!==JSON.stringify(expectedDefaults))throw Error('Runtime DEFAULTS differ from the pinned current source defaults');
    const {typesetterWorkerModule} = await import('/@fs/' + dependencies + '/troika-three-text/src/TextBuilder.js');
    const {defineWorkerModule} = await import('/@fs/' + dependencies + '/troika-worker-utils/dist/troika-worker-utils.esm.js');
    const shape = defineWorkerModule({dependencies:[typesetterWorkerModule], init:typesetter => args => new Promise(resolve => typesetter.typeset(args, resolve))});
    const c = window.contour, p = c.panel, cfg = contract.capture, fixture = contract.fixtures[fixtureName];
    const checks = [], images = {}, navigation = [];
    const check = (name, passed, detail = {}) => checks.push({name, passed:!!passed, detail});
    check('complete runtime defaults equal pinned current source',true);
    const near = (a,b,t=1e-8) => Math.abs(a-b) <= t;
    const same = (a,b,t=1e-8) => a.length === b.length && a.every((v,i) => near(v,b[i],t));
    const vec = a => new THREE.Vector3(...a);
    if (!p || p.levels.length !== 1 || p.closing.length) throw Error('Expected initial Catalog root');
    if(p.levels[0].panel.skin.uniforms.envMap!==look.backdropUniforms().envMap)throw Error('Diagnostic module is not the actual product backdrop instance');
    const moduleIdentity={lookUrl,defaultsUrl,liveBackdropUniformIdentity:true};
    c.renderer.setAnimationLoop(null);
    const anchor = vec(cfg.fixedAnchorWorldM);
    p.position.copy(anchor);
    const v = cfg.views[view];
    const cameraUi = v.cameraUiM ?? [v.radiusM*Math.sin(v.azimuthRad),v.heightM,v.radiusM*Math.cos(v.azimuthRad)];
    c.camera.position.copy(anchor).add(vec(cameraUi)); c.camera.lookAt(anchor);
    c.camera.updateProjectionMatrix(); c.camera.updateMatrixWorld(true); p.updateMatrixWorld(true);
    const settle = () => {
      let frames = 0;
      do { c.tick(1,cfg.dtSeconds); frames++; } while ((!p.settled || p.closing.length) && frames < cfg.maximumSettleFrames);
      if (!p.settled || p.closing.length) throw Error('Navigation did not settle');
      // Product settled permits visual tolerances; capture also needs stable numeric inputs.
      c.tick(cfg.settleTailFrames,cfg.dtSeconds); frames += cfg.settleTailFrames;
      return frames;
    };
    settle();
    check('construction and root scale', near(p.distance,cfg.constructionDistanceM) && same(p.scale.toArray(),[cfg.rootScale,cfg.rootScale,cfg.rootScale]));
    for (const index of fixture.rowIndices) {
      const level = p.levels.at(-1), selected = level.item.items[index];
      if (!selected?.items?.length) throw Error('Fixture row cannot open');
      const previous = p.levels.length;
      level.rows[index].dispatchEvent({type:'select'});
      const frames = settle();
      if (p.levels.length !== previous+1 || p.levels.at(-1).item !== selected) throw Error('Actual navigation dispatch failed');
      navigation.push({from:level.item.label, row:index, to:selected.label, frames, levels:p.levels.length});
    }
    const texts = [], iconSprites = [];
    p.levels.forEach((level, li) => {
      level.group.traverse(o => {if ('textRenderInfo' in o) texts.push({o,li});});
      level.rows.forEach((row,ri) => {
        const names = [level.item.items[ri].icon, ...(level.item.items[ri].items?.length ? ['chevron-right'] : [])].filter(Boolean);
        const sprites = row.face.children.filter(o => o.geometry?.type === 'PlaneGeometry' && o.material?.map);
        if (sprites.length !== names.length) throw Error('Actual icon count mismatch');
        sprites.forEach((o,si) => iconSprites.push({o,li,ri,name:names[si]}));
      });
    });
    const iconPixels = o => {
      const canvas = o.material.map.image;
      if (!canvas?.width || !canvas?.height || !canvas.getContext) return 0;
      const rgba = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let nonzero=0; for(let i=3;i<rgba.length;i+=4) if(rgba[i]) nonzero++;
      return nonzero;
    };
    const deadline = performance.now()+30000;
    while (texts.some(({o}) => !o.textRenderInfo || o.textRenderInfo.parameters.text !== o.text) || iconSprites.some(({o}) => !iconPixels(o))) {
      if (performance.now() > deadline) throw Error('New layer fonts or icons did not become ready');
      await new Promise(resolve => setTimeout(resolve,20));
    }
    const textEvidence = [];
    for (const {o,li} of texts) {
      const info=o.textRenderInfo, shaped=await shape({...info.parameters});
      const basename=o.font.split('/').at(-1).split('?')[0];
      const fontRecord=records.find(r => r.path.endsWith('/'+basename));
      const boundsError=Math.max(...info.visibleBounds.map((v,i)=>Math.abs(v-shaped.visibleBounds[i])));
      const noFallback=shaped.fontData.length===1 && shaped.glyphFontIndices.every(i=>i===0)
        && shaped.fontData[0].src.split('/').at(-1).split('?')[0]===basename;
      check('font '+li+': '+o.text, !!fontRecord && noFallback && boundsError<=1e-7, {boundsError,noFallback});
      textEvidence.push({level:li,text:o.text,fontBasename:basename,fontSha256:fontRecord?.sha256,
        glyphCount:shaped.glyphIds.length,sizeM:o.fontSize,trackingEm:o.letterSpacing,opacity:o.fillOpacity,baseOpacity:o.userData.baseOpacity??1,
        preserveTitle:!!o.userData.preserveTitle,hideWhenDim:!!o.userData.hideWhenDim,visibleBounds:Array.from(info.visibleBounds),matrixWorld:o.matrixWorld.toArray()});
    }
    const iconEvidence=iconSprites.map(({o,li,ri,name})=>{
      const asset=records.find(r=>r.path==='node_modules/lucide-static/icons/'+name+'.svg');
      if(!asset)throw Error('Unpinned icon '+name);
      return {level:li,row:ri,name,sha256:asset.sha256,nonzeroAlphaPixels:iconPixels(o),opacity:o.material.opacity,baseOpacity:o.material.userData.baseOpacity??1,matrixWorld:o.matrixWorld.toArray()};
    });
    const uniformSnapshot = () => p.levels.map(l => {
      const u=l.panel.skin.uniforms;
      return {opacity:u.uOpacity.value,fade:u.uFade.value,dim:u.uDim.value,solidOpacity:u.uSolidOpacity.value,
        bulge:u.uBulgeParam.value.map(v=>v.toArray()),dent:u.uBulgeDent.value.map(v=>v.toArray())};
    });
    const stateSample=()=>({poses:p.levels.map(l=>({cur:{...l.cur},to:{...l.to},matrix:l.group.matrixWorld.toArray(),titleOpacity:l.title.fillOpacity})),uniforms:uniformSnapshot()});
    const stable=[];for(let i=0;i<cfg.stableFrames;i++){c.tick(1,cfg.dtSeconds);p.updateMatrixWorld(true);stable.push(stateSample());}
    const values=o=>typeof o==='number'?[o]:Array.isArray(o)?o.flatMap(values):o&&typeof o==='object'?Object.values(o).flatMap(values):[];
    const numeric=stable.map(values),stableDelta=Math.max(...numeric.slice(1).flatMap(a=>a.map((v,i)=>Math.abs(v-numeric[0][i]))));
    check('stable evaluated levels',stableDelta<=cfg.stableTolerance&&p.settled&&!p.closing.length,{frames:stable.length,maxDelta:stableDelta});
    check('exact canonical navigation path',same(p.levels.map(l=>l.rows.length),fixture.rowCounts)&&JSON.stringify(p.levels.map(l=>l.item.label))===JSON.stringify(fixture.path));
    check('canonical Catalog content unchanged',JSON.stringify(p.levels[0].item)===JSON.stringify(parent.catalog));
    const hashBuffer=async array=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',array.buffer.slice(array.byteOffset,array.byteOffset+array.byteLength)))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const hashText=async text=>hashBuffer(new TextEncoder().encode(text));
    const levels=[];
    for(const [i,l] of p.levels.entries()){
      const resolved=parent.resolvedLevels.find(r=>JSON.stringify(r.path)===JSON.stringify(fixture.path.slice(0,i+1)));
      check('canonical rows level '+i,!!resolved&&l.rows.length===resolved.rows.length&&l.item.items.every((r,k)=>r.label===resolved.rows[k].label&&r.icon===resolved.rows[k].icon));
      check('dimensions level '+i,near(l.size.W,contract.r5.localWidthM)&&near(l.size.H,fixture.localHeightsM[i])&&near(l.size.titleBand,contract.r5.localTitleBandM));
      const u=l.panel.skin.uniforms, rear=i<p.active;
      const G=expectedDefaults.look.glass,K=G.window;
      const expectedOptics={uBlur:G.blur,uReflBlur:G.reflBlur,uAbsorb:G.absorb,uIor:G.ior,uF0:G.f0,
        uGrain:K.grain,uVeil:K.veil,uKey:K.key,uMaxLum:K.maxLum,uEdge:K.edge,uFrost:K.frost,
        uKnee:K.knee??0,uSat:K.sat??1,uDimFloor:G.dimFloor,uRimLine:K.rimLine??.5,uShoulder:K.shoulder??0,uRimClear:K.rimClear??0};
      const opticalUniforms=Object.fromEntries(Object.keys(expectedOptics).map(name=>[name,u[name].value]));
      opticalUniforms.uAlbedo=u.uAlbedo.value.toArray();
      check('actual optical profile level '+i,Object.entries(expectedOptics).every(([name,value])=>near(opticalUniforms[name],value))&&same(opticalUniforms.uAlbedo,K.albedo));
      const opacity=rear?(p.active-i>1?contract.r5.olderSheetMultiplier:contract.r5.rearSheetMultiplier):1;
      check('sheet and title level '+i,near(u.uOpacity.value,opacity)&&near(l.title.fillOpacity,1));
      const content=Math.max(.2,Math.min(1,1-1.25*l.cur.dim))*opacity;
      check('full faint rear content level '+i,!rear||textEvidence.filter(t=>t.level===i&&!t.preserveTitle).every(t=>t.opacity>0&&near(t.opacity,t.baseOpacity*content))&&iconEvidence.filter(t=>t.level===i).every(t=>near(t.opacity,t.baseOpacity*content)));
      check('no interaction or deformation level '+i,[l.panel,...l.rows,...l.corners,...l.moves].every(h=>!h.hovered&&!h.press.pressed&&Math.abs(h.press.depth)<1e-9)
        &&u.uBulgeParam.value.every(v=>Math.abs(v.y)<1e-9)&&u.uBulgeDent.value.every(v=>Math.abs(v.w)<1e-9)&&[...l.corners,...l.moves].every(h=>!h.affordance.visible&&!h.body.visible));
      if(rear){
        const f=p.levels[i+1], expectedY=f.to.y+f.size.H*f.to.sy/2+l.size.titleBand*l.to.sy-l.size.H*l.to.sy/2;
        check('retarget title overlap level '+i,near(l.to.y,expectedY)&&near((f.cur.z-l.cur.z)*p.scale.z,contract.r5.rootDepthGapM));
      }
      const geom=l.panel.body.geometry,reference=look.glassSlabGeometry(l.panel.w,l.panel.h,l.panel.t,l.panel.r,{tessellate:.002});
      const attrs={};let geometryEqual=true;
      for(const name of ['position','normal']){const a=geom.attributes[name].array,b=reference.attributes[name].array;const equal=a.length===b.length&&a.every((v,k)=>v===b[k]);geometryEqual&&=equal;attrs[name]={count:geom.attributes[name].count,itemSize:geom.attributes[name].itemSize,bytes:a.byteLength,sha256:await hashBuffer(a),referenceSha256:await hashBuffer(b),exact:equal};}
      const ix=geom.index?.array,refIx=reference.index?.array;const indexEqual=!!ix&&!!refIx&&ix.length===refIx.length&&ix.every((v,k)=>v===refIx[k]);geometryEqual&&=indexEqual;
      geom.computeBoundingBox();reference.computeBoundingBox();const box=geom.boundingBox,referenceBox=reference.boundingBox;
      const surfaces={front:0,back:0,side:0},pos=geom.attributes.position;
      for(let k=0;k<ix.length;k+=3){const a=new THREE.Vector3().fromBufferAttribute(pos,ix[k]),b=new THREE.Vector3().fromBufferAttribute(pos,ix[k+1]),d=new THREE.Vector3().fromBufferAttribute(pos,ix[k+2]);const n=b.clone().sub(a).cross(d.clone().sub(a)).normalize();surfaces[n.z>.99?'front':n.z<-.99?'back':'side']++;}
      const geometry={attributes:attrs,index:{count:ix.length,bytes:ix.byteLength,sha256:await hashBuffer(ix),referenceSha256:await hashBuffer(refIx),exact:indexEqual},bounds:{min:box.min.toArray(),max:box.max.toArray()},referenceBounds:{min:referenceBox.min.toArray(),max:referenceBox.max.toArray()},nominalThicknessM:l.panel.t,actualDepthM:box.max.z-box.min.z,nominalDepthDeltaM:box.max.z-box.min.z-l.panel.t,surfaces,fullReferenceExact:geometryEqual};reference.dispose();
      check('complete original slab geometry level '+i,geometryEqual&&Object.values(surfaces).every(n=>n>0)&&same(box.min.toArray(),referenceBox.min.toArray(),1e-9)&&same(box.max.toArray(),referenceBox.max.toArray(),1e-9));
      const factory=look.glassMaterial(p.T,{w:l.panel.w,h:l.panel.h,t:l.panel.t,r:l.panel.r});
      const shader={vertexSha256:await hashText(l.panel.skin.vertexShader),fragmentSha256:await hashText(l.panel.skin.fragmentShader),factoryExact:l.panel.skin.vertexShader===factory.vertexShader&&l.panel.skin.fragmentShader===factory.fragmentShader,side:l.panel.skin.side,depthWrite:l.panel.skin.depthWrite,hasLegacyMaskUniforms:['uRearMask','uCoverRect','uCoverRadius'].some(k=>Object.hasOwn(u,k)),hasLegacyMaskCode:/uRearMask|uCoverRect|uCoverRadius/.test(l.panel.skin.fragmentShader)};factory.dispose();
      check('actual R5 shader has no legacy hard mask level '+i,shader.factoryExact&&!shader.hasLegacyMaskUniforms&&!shader.hasLegacyMaskCode&&shader.side===THREE.FrontSide&&shader.depthWrite);
      levels.push({index:i,path:fixture.path.slice(0,i+1),depth:l.depth,closing:!!l.closing,size:{...l.size},cur:{...l.cur},to:{...l.to},
        groupMatrixWorld:l.group.matrixWorld.toArray(),bodyMatrixWorld:l.panel.body.matrixWorld.toArray(),worldScale:l.group.getWorldScale(new THREE.Vector3()).toArray(),
        titleOpacity:l.title.fillOpacity,rows:l.item.items.map(r=>({label:r.label,icon:r.icon,items:r.items?.length??0})),uniforms:uniformSnapshot()[i],opticalUniforms,geometry,shader});
    }
    const actualUi=c.camera.position.clone().sub(anchor).toArray(),direction=c.camera.getWorldDirection(new THREE.Vector3());
    const expectedDirection=anchor.clone().sub(c.camera.position).normalize();
    check('camera and output contract',same(actualUi,cameraUi)&&same(direction.toArray(),expectedDirection.toArray())&&near(c.camera.fov,cfg.fovYDegrees)
      &&near(c.camera.near,cfg.nearM)&&near(c.camera.far,cfg.farM)&&near(c.camera.aspect,cfg.widthPx/cfg.heightPx)
      &&c.renderer.domElement.width===cfg.widthPx&&c.renderer.domElement.height===cfg.heightPx);
    const renderSettings={toneMapping:c.renderer.toneMapping,toneMappingExposure:c.renderer.toneMappingExposure,dpr:c.renderer.getPixelRatio(),backgroundPresent:!!c.scene.background,backgroundRotation:c.scene.backgroundRotation.toArray(),environmentRotation:c.scene.environmentRotation.toArray(),backgroundIntensity:c.scene.backgroundIntensity,envIntensity:look.backdropUniforms().uEnvIntensity.value,envRotationMatrix:look.backdropUniforms().uEnvRot.value.toArray()};
    check('original HDR and colour configuration',renderSettings.toneMapping===THREE.NeutralToneMapping&&near(renderSettings.toneMappingExposure,1)&&near(renderSettings.dpr,1)&&renderSettings.backgroundPresent&&same(renderSettings.backgroundRotation.slice(0,3),[0,1.6,0])&&same(renderSettings.environmentRotation.slice(0,3),[0,1.6,0])&&near(renderSettings.backgroundIntensity,1)&&near(renderSettings.envIntensity,1)&&p.levels.every(l=>l.panel.skin.uniforms.envMap.value&&l.panel.skin.uniforms.uHasEnv.value===1&&Object.hasOwn(l.panel.skin.defines,'ENVMAP_TYPE_CUBE_UV')));
    const gl=c.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
    const read=()=>{c.renderer.render(c.scene,c.camera);const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
    const png=data=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),im=ctx.createImageData(width,height);
      for(let y=0;y<height;y++)im.data.set(data.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);ctx.putImageData(im,0,0);return canvas.toDataURL('image/png');};
    const beauty=read();images['browser-beauty.png']=png(beauty);
    const originalUniforms=JSON.stringify(uniformSnapshot());
    const backdrop=look.backdropUniforms(),savedEnv=backdrop.envMap.value,savedRotation=backdrop.uEnvRot.value.clone(),savedIntensity=backdrop.uEnvIntensity.value,savedBackground=c.scene.background;
    const visibility=[];c.scene.traverse(o=>{if(o.isMesh||o.isSprite)visibility.push([o,o.visible]);});
    const diagnostics=[];
    const metric=(a,b,roi)=>{let changed=0,maxDifference=0,total=0;for(const at of roi){const d=Math.max(...[0,1,2].map(k=>Math.abs(a[at+k]-b[at+k])));if(d>=contract.diagnostics.minimumRgbDifference)changed++;maxDifference=Math.max(maxDifference,d);total+=d;}return{pixels:roi.size,changed,changedFraction:changed/Math.max(1,roi.size),maxDifference,meanDifference:total/Math.max(1,roi.size)};};
    const bodies=p.levels.map(l=>l.panel.body),raycaster=new THREE.Raycaster();
    try {
      look.setBackdrop(null);const grey=contract.diagnostics.backgroundLinearRgb;c.scene.background=new THREE.Color().setRGB(grey,grey,grey);
      check('no environment applied to actual product shader',p.levels.every(l=>l.panel.skin.uniforms.envMap.value===null&&l.panel.skin.uniforms.uHasEnv.value===0&&!Object.hasOwn(l.panel.skin.defines,'ENVMAP_TYPE_CUBE_UV')));
      for(const l of p.levels.slice(0,-1)){
        const body=l.panel.body,u=l.panel.skin.uniforms,opacity=u.uOpacity.value;
        const pos=body.geometry.attributes.position,idx=body.geometry.index.array,cameraLocal=body.worldToLocal(c.camera.position.clone());
        const faceName=view==='back'?'back':view==='side'?'side':'front',raw=new Map();
        for(let k=0;k<idx.length;k+=3){
          const a=new THREE.Vector3().fromBufferAttribute(pos,idx[k]),b=new THREE.Vector3().fromBufferAttribute(pos,idx[k+1]),d=new THREE.Vector3().fromBufferAttribute(pos,idx[k+2]);
          const centre=a.clone().add(b).add(d).multiplyScalar(1/3),n=b.clone().sub(a).cross(d.clone().sub(a)).normalize();
          if(centre.y>=l.size.H/2-l.size.titleBand-contract.diagnostics.roiMarginLocalM||centre.y<=-l.size.H/2+contract.diagnostics.roiMarginLocalM)continue;
          if(n.dot(cameraLocal.clone().sub(centre))<=0)continue;
          if(faceName==='front'&&n.z<.999||faceName==='back'&&n.z>-.999||faceName==='side'&&Math.abs(n.x)<.7)continue;
          const screen=body.localToWorld(centre).project(c.camera),px=Math.floor((screen.x+1)*width/2),py=Math.floor((screen.y+1)*height/2);
          if(px<2||px>=width-2||py<2||py>=height-2)continue;
          const at=(py*width+px)*4;raw.set(at,{px,py});
        }
        const step=Math.max(1,Math.ceil(raw.size/contract.diagnostics.maximumSamplePixels));
        const samples=[...raw.entries()].filter((_,i)=>i%step===0);
        const isolatedRoi=new Set(),exposedRoi=new Set();
        for(const [at,{px,py}] of samples){
          raycaster.setFromCamera(new THREE.Vector2((px+.5)/width*2-1,(py+.5)/height*2-1),c.camera);
          if(!raycaster.intersectObject(body,false).length)continue;
          isolatedRoi.add(at);
          if(raycaster.intersectObjects(bodies,false)[0]?.object===body)exposedRoi.add(at);
        }
        for(const [o,visible] of visibility)o.visible=visible;
        const sceneOn=read();u.uOpacity.value=0;const sceneOff=read();u.uOpacity.value=opacity;
        const sceneMetric=metric(sceneOn,sceneOff,exposedRoi);
        for(const [o] of visibility)o.visible=o===body;
        body.visible=false;const empty=read();body.visible=true;const isolated=read();
        const isolatedMetric=metric(isolated,empty,isolatedRoi);
        const restoredIsolation=read();const exactIsolation=isolated.every((n,i)=>n===restoredIsolation[i]);
        check('full '+faceName+' surface contributes actual pixels level '+l.depth,isolatedMetric.pixels>=contract.diagnostics.minimumRoiPixels&&isolatedMetric.changedFraction>=contract.diagnostics.minimumIsolatedChangedFraction&&exactIsolation,isolatedMetric);
        const applicable=exposedRoi.size>=contract.diagnostics.minimumRoiPixels;
        if(applicable)check('actual scene rear body contribution level '+l.depth,sceneMetric.changed>=contract.diagnostics.minimumSceneChangedPixels&&sceneMetric.maxDifference>=3,sceneMetric);
        diagnostics.push({level:l.depth,view,surface:faceName,isolatedOriginalShader:true,softwareNoEnvironment:true,backgroundLinearRgb:grey,candidatePixels:raw.size,sampledPixels:samples.length,roi:{encoding:"RGBA byte offsets in bottom-up WebGL readback",isolated:[...isolatedRoi],exposedInScene:[...exposedRoi]},isolated:isolatedMetric,fullScene:sceneMetric,sceneApplicable:applicable,sceneNotApplicableReason:applicable?null:'Canonical stack occludes this body below its title or leaves fewer than minimum interior samples; isolated full-body proof remains separate',opacityRestored:u.uOpacity.value===opacity,pixelsRestoredExactly:exactIsolation});
        images['diagnostic-level-'+l.depth+'-empty.png']=png(empty);images['diagnostic-level-'+l.depth+'-isolated-'+faceName+'.png']=png(isolated);
        images['diagnostic-level-'+l.depth+'-scene-on.png']=png(sceneOn);images['diagnostic-level-'+l.depth+'-scene-body-off.png']=png(sceneOff);
      }
    } finally {
      p.levels.forEach((l,i)=>{l.panel.skin.uniforms.uOpacity.value=JSON.parse(originalUniforms)[i].opacity;});
      for(const [o,visible] of visibility)o.visible=visible;
      look.setBackdrop(savedEnv,{intensity:savedIntensity});backdrop.uEnvRot.value.copy(savedRotation);c.scene.background=savedBackground;
    }
    const restoredBeauty=read();const beautyRestored=beauty.every((n,i)=>n===restoredBeauty[i]);
    check('view scene contribution measured or explicitly not applicable',diagnostics.every(d=>d.sceneApplicable?d.fullScene.changed>=contract.diagnostics.minimumSceneChangedPixels&&d.fullScene.maxDifference>=3:d.fullScene.pixels<contract.diagnostics.minimumRoiPixels));
    images['browser-beauty-restored.png']=png(restoredBeauty);
    check('uniforms and original beauty restored',JSON.stringify(uniformSnapshot())===originalUniforms&&beautyRestored,{beautyPixelsIdentical:beautyRestored});
    return {images,checks,allPassed:checks.every(c=>c.passed),navigation,levels,texts:textEvidence,icons:iconEvidence,diagnostics,sceneContributionMatrixGate:contract.diagnostics.matrixGate,matrixGateEvaluated:false,runtimeDefaultsJson,moduleIdentity,renderSettings,
      state:{settled:p.settled,active:p.active,closing:p.closing.length,held:!!p.controls.held,palmPush:!!p.palmPush,stableFrames:stable.length,maxStableDelta:stableDelta},
      camera:{positionUiM:actualUi,positionWorldM:c.camera.position.toArray(),quaternion:c.camera.quaternion.toArray(),matrixWorld:c.camera.matrixWorld.toArray(),projectionMatrix:c.camera.projectionMatrix.toArray(),fovY:c.camera.fov,near:c.camera.near,far:c.camera.far,width,height},
      evidenceScope:'Actual browser pixels and synthetic software navigation; not physical hand tracking, Blender multi-layer support, optical equivalence or adopted design'};
  }, {source,dependencies,contract,parent,fixtureName,view,records,expectedDefaults});
  const imageRecords=[];
  for(const [name,url] of Object.entries(result.images)){
    const bytes=Buffer.from(url.split(',')[1],'base64');await fs.writeFile(path.join(out,name),bytes,{flag:'wx'});imageRecords.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
  }
  delete result.images;
  const settingsBytes=Buffer.from(result.runtimeDefaultsJson);
  await fs.writeFile(path.join(out,'runtime-defaults.json'),settingsBytes,{flag:'wx'});
  implementationEvidence.push({path:'runtime-defaults.json',bytes:settingsBytes.length,sha256:sha(settingsBytes)});
  delete result.runtimeDefaultsJson;
  const after=await verifySource();
  if(sha(await fs.readFile(scriptPath))!==sha(scriptBytes)||sha(await fs.readFile(new URL('./layers-contract.json',import.meta.url)))!==sha(contractBytes)
    ||sha(await fs.readFile(new URL('./baseline/comparison-contract.json',import.meta.url)))!==sha(parentBytes)
    ||sha(await fs.readFile(new URL('./baseline/manifest.json',import.meta.url)))!==sha(manifestBytes))throw Error('Capture implementation changed while running');
  result.errors=errors;result.failedRequests=failedRequests;result.allPassed&&=errors.length===0&&failedRequests.length===0;
  Object.assign(result,{fixture:fixtureName,view,sourceSha:contract.sourceSha,inputDigest:inventoryDigest,parentR5ContractSha256:sha(parentBytes),layersContractSha256:sha(contractBytes),captureScriptSha256:sha(scriptBytes),sourceVerification:{before,after},implementationEvidence,images:imageRecords,unsupported:contract.unsupported});
  Object.assign(result,{contractSha256:sha(parentBytes),profileId:'current',overrides:{},
    scriptSha256:sha(scriptBytes),settingsSha256:sha(settingsBytes),canonicalDefaultsSha256:sha(JSON.stringify(canonicalDefaults)),
    stateName:'layers-'+fixtureName+'-rest',cameraInUiM:result.camera.positionUiM,cameraQuaternionUi:result.camera.quaternion,
    initialConstructionDistanceM:contract.capture.constructionDistanceM,fixedAnchorWorldM:contract.capture.fixedAnchorWorldM,
    artifacts:imageRecords,presetAdopted:false,physicalAcceptance:false,headsetAcceptance:false});
  await fs.writeFile(path.join(out,'capture.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({allPassed:result.allPassed,fixture:fixtureName,view,profileId:'current',checks:result.checks.length,failed:result.checks.filter(c=>!c.passed),images:imageRecords.length,sourceRecords:records.length,out}));
  if(!result.allPassed)process.exitCode=1;
} catch(error) {
  let after;try{after=await verifySource();}catch(e){after={passed:false,error:String(e)};}
  await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),stack:error.stack,errors,failedRequests,sourceVerification:{before,after}},null,2)+'\n',{flag:'wx'});
  throw error;
} finally {await browser?.close();await server.close();}
