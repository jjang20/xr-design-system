// Browser-only layer evidence. Never interprets row select dispatch as hand tracking.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {withBrowserSession} from './runtime.mjs';

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
if (!contract.executionGate?.baselineFrozen || !contract.executionGate?.runtimeHelperVerified) throw Error('R8 layer capture gate is closed: baseline/runtime helper not accepted');
if (!contract.plannedRuntimeMatrix.some(c=>c.fixture===fixtureName&&c.view===view)) throw Error('Layer view is outside the accepted bounded capture scope');
const records = [...manifest.trackedInputs, ...manifest.externalAssets];
const inventoryDigest = sha(JSON.stringify(records.map(r => ({bytes:r.bytes, path:r.path, sha256:r.sha256}))));
if (sha(parentBytes) !== contract.parentR8ContractSha256 || manifest.comparisonContractSha256 !== sha(parentBytes)
  || parent.sourceSha !== contract.sourceSha || manifest.sourceSha !== contract.sourceSha
  || manifest.inputDigest !== contract.inputDigest || inventoryDigest !== contract.inputDigest
  || records.length !== contract.sourceRecordCount) throw Error('R8 source inventory or parent contract identity changed');
async function verifySource() {
  for (const r of records) {
    const location = path.resolve(source, r.path);
    if (!location.startsWith(source + path.sep)) throw Error('Source inventory path escapes snapshot');
    const bytes = await fs.readFile(location);
    if (bytes.length !== r.bytes || sha(bytes) !== r.sha256) throw Error('Pinned source mismatch: ' + r.path);
  }
  return {passed:true, records:records.length, inputDigest:inventoryDigest};
}
const helperPins=contract.runtimeLifecycle.pins;
const helperEvidence=[];
for(const [name,expected] of Object.entries(helperPins)){
  const bytes=await fs.readFile(new URL('./'+name,import.meta.url));
  if(sha(bytes)!==expected)throw Error('Runtime helper pin changed: '+name);
  helperEvidence.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
}
if(sha(manifestBytes)!==contract.manifestSha256)throw Error('Manifest bytes changed');
const before = await verifySource();
const {DEFAULTS} = await import(pathToFileURL(path.join(source,'src/core/defaults.js')));
const baselineDefaults=JSON.parse(await fs.readFile(new URL('./baseline/defaults.json',import.meta.url)));
if(JSON.stringify(DEFAULTS)!==JSON.stringify(baselineDefaults))throw Error('Host source defaults differ from pinned baseline');
const canonicalDefaults = structuredClone(DEFAULTS), expectedDefaults = structuredClone(DEFAULTS);
await fs.mkdir(out, {recursive:false});
const implementationEvidence = [];
for (const [name,bytes] of [['capture-script.mjs',scriptBytes],['layers-contract.json',contractBytes],['parent-r8-contract.json',parentBytes],['source-inventory.json',manifestBytes]]) {
  await fs.writeFile(path.join(out,name),bytes,{flag:'wx'});
  implementationEvidence.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
}
const dependencies = await fs.realpath(path.join(source, 'node_modules'));
const errors = [], failedRequests = [];
const outcome = await withBrowserSession({source, adapter:path.dirname(scriptPath), out, port:5195,
  workTimeoutMs:contract.runtimeLifecycle.wholeWorkTimeoutMs,
  reportTimeoutMs:contract.runtimeLifecycle.reportTimeoutMs,
  cleanupTimeoutMs:contract.runtimeLifecycle.eachCleanupTimeoutMs,
  writeSummary:async ({value,primaryError})=>{
    if(primaryError){
      let after;try{after=await verifySource();}catch(error){after={passed:false,error:String(error)};}
      await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(primaryError),stack:primaryError.stack,errors,failedRequests,sourceVerification:{before,after}},null,2)+'\n',{flag:'wx'});
    }else await fs.writeFile(path.join(out,'capture.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  },
  work:async ctx=>{
  const page = await ctx.browser.newPage({viewport:{width:contract.capture.widthPx, height:contract.capture.heightPx}, deviceScaleFactor:1});
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', message => {if(message.type()==='error')errors.push('console: '+message.text());});
  page.on('requestfailed', r => failedRequests.push({url:r.url(), failure:r.failure()}));
  const captureUrl=new URL('http://127.0.0.1:5195/' + contract.capture.webQuery);
  await page.goto(captureUrl.href, {waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(() => window.ready === true, null, {timeout:90000});
  const result = await ctx.phase({label:'layers-eval-and-font',timeoutMs:contract.runtimeLifecycle.evalFontPhaseTimeoutMs}, async()=>page.evaluate(async ({source, dependencies, contract, parent, fixtureName, view, records, expectedDefaults}) => {
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
    const hashBuffer=async array=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',array.buffer.slice(array.byteOffset,array.byteOffset+array.byteLength)))).map(v=>v.toString(16).padStart(2,'0')).join('');
    const hashText=async text=>hashBuffer(new TextEncoder().encode(text));
    check('complete runtime defaults equal pinned current source',true);
    const near = (a,b,t=1e-8) => Math.abs(a-b) <= t;
    const same = (a,b,t=1e-8) => a.length === b.length && a.every((v,i) => near(v,b[i],t));
    const vec = a => new THREE.Vector3(...a);
    if (!p || p.levels.length !== 1 || p.closing.length) throw Error('Expected initial Catalog root');
    if(p.levels[0].panel.skin.uniforms.envMap!==look.backdropUniforms().envMap)throw Error('Diagnostic module is not the actual product backdrop instance');
    const moduleIdentity={lookUrl,defaultsUrl,liveBackdropUniformIdentity:true,actualFactoryShaderIdentityCheckedPerLevel:true,actualDefaultsExact:true};
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
        preserveTitle:!!o.userData.preserveTitle,hideWhenDim:!!o.userData.hideWhenDim,visibleBounds:Array.from(info.visibleBounds),blockBounds:Array.from(info.blockBounds),
        glyphIds:Array.from(shaped.glyphIds),glyphPositions:Array.from(shaped.glyphPositions),noFontFallback:noFallback,shapedVisibleBoundsError:boundsError,matrixWorld:o.matrixWorld.toArray()});
    }
    const iconEvidence=await Promise.all(iconSprites.map(async ({o,li,ri,name})=>{
      const asset=records.find(r=>r.path==='node_modules/lucide-static/icons/'+name+'.svg');
      if(!asset)throw Error('Unpinned icon '+name);
      const canvas=o.material.map.image,rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      return {level:li,row:ri,name,sha256:asset.sha256,rgbaSha256:await hashBuffer(rgba),width:canvas.width,height:canvas.height,
        nonzeroAlphaPixels:iconPixels(o),opacity:o.material.opacity,baseOpacity:o.material.userData.baseOpacity??1,matrixWorld:o.matrixWorld.toArray()};
    }));
    // Export every numeric optical uniform and every non-optical state uniform.
    // The independent Current guard can then reject common drift, not only the
    // small list of values anticipated by an individual profile comparison.
    const opticalNames = ['uBlur','uReflBlur','uAbsorb','uThick','uAlbedo','uIor','uF0','uGrain','uVeil','uKey','uMaxLum','uEdge','uFrost','uFrostScale',
      'uScrimMax','uTint','uBubbleOpacity','uContactWidth','uContactStrength','uGlowColor','uGlowMix','uDentShade','uDentShadow','uGlowCore','uClear','uClearAlbedo','uGloss',
      'uKnee','uSat','uDimFloor','uRimLine','uShoulder','uRimClear'];
    const environmentNames = ['envMap','uEnvRot','uEnvIntensity','uHasEnv'];
    const uniformValue = value => {
      if(typeof value==='number'&&Number.isFinite(value))return value;
      if(Array.isArray(value))return value.map(uniformValue);
      if(value?.toArray)return value.toArray().map(uniformValue);
      throw Error('Unsupported actual numeric uniform value');
    };
    const stateUniforms = u => {
      return {opacity:u.uOpacity.value,fade:u.uFade.value,dim:u.uDim.value,solidOpacity:u.uSolidOpacity.value,
        frontOpacity:u.uFrontOpacity.value,
        bulge:u.uBulgeParam.value.map(v=>v.toArray()),dent:u.uBulgeDent.value.map(v=>v.toArray()),
        ...Object.fromEntries(Object.keys(u).filter(k=>!opticalNames.includes(k)&&!environmentNames.includes(k)
          &&!['uOpacity','uFade','uDim','uSolidOpacity','uFrontOpacity','uBulgeParam','uBulgeDent'].includes(k)).map(k=>[k,uniformValue(u[k].value)]))};
    };
    const uniformSnapshot=()=>p.levels.map(l=>stateUniforms(l.panel.skin.uniforms));
    const stateSample=()=>({poses:p.levels.map(l=>({cur:{...l.cur},to:{...l.to},matrix:l.group.matrixWorld.toArray(),titleOpacity:l.title.fillOpacity})),uniforms:uniformSnapshot()});
    const stable=[];for(let i=0;i<cfg.stableFrames;i++){c.tick(1,cfg.dtSeconds);p.updateMatrixWorld(true);stable.push(stateSample());}
    const values=o=>typeof o==='number'?[o]:Array.isArray(o)?o.flatMap(values):o&&typeof o==='object'?Object.values(o).flatMap(values):[];
    const numeric=stable.map(values),stableDelta=Math.max(...numeric.slice(1).flatMap(a=>a.map((v,i)=>Math.abs(v-numeric[0][i]))));
    check('stable evaluated levels',stableDelta<=cfg.stableTolerance&&p.settled&&!p.closing.length,{frames:stable.length,maxDelta:stableDelta});
    check('exact canonical navigation path',same(p.levels.map(l=>l.rows.length),fixture.rowCounts)&&JSON.stringify(p.levels.map(l=>l.item.label))===JSON.stringify(fixture.path));
    check('actual progressive depth ratio',near(p.pose.recedeRatio,contract.r8.recedeRatio)&&near(p.pose.recedeZ*p.scale.z,contract.r8.rootDepthGapM));
    check('canonical Catalog content unchanged',JSON.stringify(p.levels[0].item)===JSON.stringify(parent.catalog));
    const levels=[];
    for(const [i,l] of p.levels.entries()){
      const resolved=parent.resolvedLevels.find(r=>JSON.stringify(r.path)===JSON.stringify(fixture.path.slice(0,i+1)));
      check('canonical rows level '+i,!!resolved&&l.rows.length===resolved.rows.length&&l.item.items.every((r,k)=>r.label===resolved.rows[k].label&&r.icon===resolved.rows[k].icon));
      check('dimensions level '+i,near(l.size.W,contract.r8.localWidthM)&&near(l.size.H,fixture.localHeightsM[i])&&near(l.size.titleBand,contract.r8.localTitleBandM));
      const u=l.panel.skin.uniforms, rear=i<p.active;
      const depth=p.active-i,expectedDepth=depth===0?0:contract.r8.rootDepthGapM*(1-contract.r8.recedeRatio**depth)/(1-contract.r8.recedeRatio);
      check('progressive position level '+i,near(l.cur.z*p.scale.z,-expectedDepth)&&near(l.to.z*p.scale.z,-expectedDepth),{depth,expectedWorldOffsetM:-expectedDepth,actualWorldOffsetM:l.cur.z*p.scale.z});
      const titlePoint=new THREE.Vector3(0,l.size.H/2-l.size.titleBand/2,l.panel.t);
      check('title-only navigation and active input gates level '+i,l.panel.enabled===rear&&l.panel.hitMeshes.length===1&&l.panel.hitMeshes[0].geometry.type==='PlaneGeometry'&&l.panel.inside(titlePoint)&&!l.panel.inside(new THREE.Vector3(0,0,l.panel.t))&&l.rows.every(r=>r.enabled===!rear)&&[...l.moves,...l.corners].every(h=>h.enabled===!rear));
      const G=expectedDefaults.look.glass,K=G.window;
      const expectedOptics={uBlur:G.blur,uReflBlur:G.reflBlur,uAbsorb:G.absorb,uIor:G.ior,uF0:G.f0,uFrostScale:G.frostScale,
        uGrain:K.grain,uVeil:K.veil,uKey:K.key,uMaxLum:K.maxLum,uEdge:K.edge,uFrost:K.frost,
        uKnee:K.knee??0,uSat:K.sat??1,uDimFloor:G.dimFloor,uRimLine:K.rimLine??.5,uShoulder:K.shoulder??0,uRimClear:K.rimClear??0};
      const opticalUniforms=Object.fromEntries(opticalNames.map(name=>[name,uniformValue(u[name].value)]));
      check('actual optical profile level '+i,Object.entries(expectedOptics).every(([name,value])=>near(opticalUniforms[name],value))&&same(opticalUniforms.uAlbedo,K.albedo));
      const opacity=rear?(p.active-i>1?contract.r8.olderSheetMultiplier:contract.r8.rearSheetMultiplier):1;
      const expectedFront=rear?contract.r8.rearFrontFaceMultiplier:contract.r8.frontFaceMultiplier;
      check('sheet front-face multiplier and title level '+i,near(u.uOpacity.value,opacity)&&near(u.uFrontOpacity.value,expectedFront)&&near(l.title.fillOpacity,1),
        {actualSheetOpacity:u.uOpacity.value,actualFrontFaceMultiplier:u.uFrontOpacity.value,expectedFrontFaceMultiplier:expectedFront,titleOpacity:l.title.fillOpacity});
      check('R8 pane and row thickness remain separate level '+i,near(l.panel.t,contract.r8.paneLocalThicknessM)&&near(l.panel.press.maxDepth,p.T.get('material.firmness.rigid.pressDepth')*l.panel.t)
        &&near(l.panel.frontZ,l.panel.t)&&near(u.uThick.value,l.panel.t)&&l.rows.every(row=>near(row.t,contract.r8.rowLocalThicknessM)),
        {paneLocalM:l.panel.t,paneNominalPhysicalAtRootM:l.panel.t*cfg.rootScale,rowLocalM:l.rows.map(row=>row.t),hitFrontZ:l.panel.frontZ,pressMaxDepth:l.panel.press.maxDepth});
      const titleHit=l.panel.hitMeshes[0];
      check('title hit geometry tracks thin pane level '+i,near(titleHit.position.z,l.panel.t)&&near(titleHit.geometry.parameters.width,l.size.W)
        &&near(titleHit.geometry.parameters.height,l.size.titleBand)&&near(l.panel.pokeDistance(titlePoint.clone().add(new THREE.Vector3(0,0,.002))),.002*l.panel.getWorldScale(new THREE.Vector3()).z));
      const content=Math.max(.2,Math.min(1,1-1.25*l.cur.dim))*opacity;
      check('full faint rear content level '+i,!rear||textEvidence.filter(t=>t.level===i&&!t.preserveTitle).every(t=>t.opacity>0&&near(t.opacity,t.baseOpacity*content))&&iconEvidence.filter(t=>t.level===i).every(t=>near(t.opacity,t.baseOpacity*content)));
      check('no interaction or deformation level '+i,[l.panel,...l.rows,...l.corners,...l.moves].every(h=>!h.hovered&&!h.press.pressed&&Math.abs(h.press.depth)<1e-9)
        &&u.uBulgeParam.value.every(v=>Math.abs(v.y)<1e-9)&&u.uBulgeDent.value.every(v=>Math.abs(v.w)<1e-9)&&[...l.corners,...l.moves].every(h=>!h.affordance.visible&&!h.body.visible));
      if(rear){
        const f=p.levels[i+1], expectedY=f.to.y+f.size.H*f.to.sy/2+l.size.titleBand*l.to.sy-l.size.H*l.to.sy/2;
        check('retarget title overlap level '+i,near(l.to.y,expectedY)&&near((f.cur.z-l.cur.z)*p.scale.z,contract.r8.rootDepthGapM*contract.r8.recedeRatio**(p.active-i-1)),{expectedY,actualY:l.to.y,depthFromFront:p.active-i,expectedPhysicalGapM:contract.r8.rootDepthGapM*contract.r8.recedeRatio**(p.active-i-1),actualPhysicalGapM:(f.cur.z-l.cur.z)*p.scale.z});
      }
      const geom=l.panel.body.geometry,reference=look.glassSlabGeometry(l.panel.w,l.panel.h,l.panel.t,l.panel.r,{tessellate:.002});
      const attrs={};let geometryEqual=true;
      for(const name of ['position','normal']){const a=geom.attributes[name].array,b=reference.attributes[name].array;const equal=a.length===b.length&&a.every((v,k)=>v===b[k]);geometryEqual&&=equal;attrs[name]={count:geom.attributes[name].count,itemSize:geom.attributes[name].itemSize,bytes:a.byteLength,sha256:await hashBuffer(a),referenceSha256:await hashBuffer(b),exact:equal};}
      const ix=geom.index?.array,refIx=reference.index?.array;const indexEqual=!!ix&&!!refIx&&ix.length===refIx.length&&ix.every((v,k)=>v===refIx[k]);geometryEqual&&=indexEqual;
      geom.computeBoundingBox();reference.computeBoundingBox();const box=geom.boundingBox,referenceBox=reference.boundingBox;
      const surfaces={front:0,back:0,side:0},pos=geom.attributes.position;
      for(let k=0;k<ix.length;k+=3){const a=new THREE.Vector3().fromBufferAttribute(pos,ix[k]),b=new THREE.Vector3().fromBufferAttribute(pos,ix[k+1]),d=new THREE.Vector3().fromBufferAttribute(pos,ix[k+2]);const n=b.clone().sub(a).cross(d.clone().sub(a)).normalize();surfaces[n.z>.99?'front':n.z<-.99?'back':'side']++;}
      const geometry={attributes:attrs,index:{count:ix.length,bytes:ix.byteLength,sha256:await hashBuffer(ix),referenceSha256:await hashBuffer(refIx),exact:indexEqual},bounds:{min:box.min.toArray(),max:box.max.toArray()},referenceBounds:{min:referenceBox.min.toArray(),max:referenceBox.max.toArray()},nominalThicknessM:l.panel.t,actualDepthM:box.max.z-box.min.z,nominalDepthDeltaM:box.max.z-box.min.z-l.panel.t,surfaces,fullReferenceExact:geometryEqual};reference.dispose();
      check('complete original slab geometry level '+i,geometryEqual&&Object.values(surfaces).every(n=>n>0)&&same(box.min.toArray(),referenceBox.min.toArray(),1e-9)&&same(box.max.toArray(),referenceBox.max.toArray(),1e-9)
        &&Math.abs(geometry.nominalDepthDeltaM)<=contract.r8.geometryNominalToleranceM);
      const factory=look.glassMaterial(p.T,{w:l.panel.w,h:l.panel.h,t:l.panel.t,r:l.panel.r});
      const factoryOptics=Object.fromEntries(opticalNames.map(name=>[name,uniformValue(factory.uniforms[name].value)]));
      check('all optical uniforms match pinned-source Current factory level '+i,JSON.stringify(opticalUniforms)===JSON.stringify(factoryOptics),
        {uniformCount:opticalNames.length,requiredFrostScale:G.frostScale});
      // Reconstruct settled state on a distinct material from the live source
      // factory. Expected values come from pinned defaults and canonical target
      // poses, never by copying the measured state uniforms.
      const clamp01=v=>Math.max(0,Math.min(1,v)),target=l.to;
      factory.uniforms.uOpacity.value=Math.min(1,clamp01(target.opacity)*2.5)*(1-clamp01(target.back)*(1-opacity));
      factory.uniforms.uDim.value=clamp01(target.dim);factory.uniforms.uFrontOpacity.value=expectedFront;
      for(let slot=0;slot<12;slot++)look.setBulge(factory,slot);
      const next=p.levels[i+1];
      if(next){const q=next.to,k=q.sx/target.sx;look.setContactShadow(factory,0,{x:(q.x-target.x)/target.sx,y:(q.y-target.y)/target.sy,
        hw:next.size.W/2*k,hh:next.size.H/2*k,r:next.panel.r*k,gap:Math.max(0,q.z-target.z),amount:expectedDefaults.look.contactShadow.child*clamp01(q.opacity)});}
      else look.setContactShadow(factory,0);
      look.setContactShadow(factory,1);
      for(let slot=0;slot<2;slot++){const back=p.levels[i-1-slot];
        if(!back){look.setBehind(factory,slot);continue;}
        const q=back.to,k=q.sx/target.sx;look.setBehind(factory,slot,{x:(q.x-target.x)/target.sx,y:(q.y-target.y)/target.sy,
          hw:back.size.W/2*k,hh:back.size.H/2*k,r:back.panel.r*k,gap:Math.max(0,target.z-q.z),scale:target.sx,amount:expectedDefaults.look.behind.amount*clamp01(q.opacity)});
      }
      const expectedStateUniforms=stateUniforms(factory.uniforms),actualStateUniforms=uniformSnapshot()[i];
      const stateKeys=Object.keys(expectedStateUniforms).sort(),actualKeys=Object.keys(actualStateUniforms).sort();
      const allNumericEqual=(a,b)=>typeof a==='number'&&typeof b==='number'?near(a,b,1e-8):Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,k)=>allNumericEqual(v,b[k]));
      const stateMismatches=stateKeys.filter(k=>!allNumericEqual(actualStateUniforms[k],expectedStateUniforms[k]));
      check('all actual state uniforms match source factory and canonical settled target level '+i,JSON.stringify(stateKeys)===JSON.stringify(actualKeys)&&!stateMismatches.length,
        {stateKeys,maximumTolerance:1e-8,mismatches:stateMismatches.map(name=>({name,actual:actualStateUniforms[name],expected:expectedStateUniforms[name]}))});
      check('complete uniform key inventory matches source factory level '+i,JSON.stringify(Object.keys(u).sort())===JSON.stringify(Object.keys(factory.uniforms).sort()));
      const shader={vertexSha256:await hashText(l.panel.skin.vertexShader),fragmentSha256:await hashText(l.panel.skin.fragmentShader),factoryExact:l.panel.skin.vertexShader===factory.vertexShader&&l.panel.skin.fragmentShader===factory.fragmentShader,side:l.panel.skin.side,depthWrite:l.panel.skin.depthWrite,hasLegacyMaskUniforms:['uRearMask','uCoverRect','uCoverRadius'].some(k=>Object.hasOwn(u,k)),hasLegacyMaskCode:/uRearMask|uCoverRect|uCoverRadius/.test(l.panel.skin.fragmentShader)};factory.dispose();
      check('actual R8 shader has no legacy hard mask level '+i,shader.factoryExact&&!shader.hasLegacyMaskUniforms&&!shader.hasLegacyMaskCode&&shader.side===THREE.FrontSide&&shader.depthWrite);
      levels.push({index:i,path:fixture.path.slice(0,i+1),depth:l.depth,closing:!!l.closing,size:{...l.size},cur:{...l.cur},to:{...l.to},
        groupMatrixWorld:l.group.matrixWorld.toArray(),bodyMatrixWorld:l.panel.body.matrixWorld.toArray(),worldScale:l.group.getWorldScale(new THREE.Vector3()).toArray(),
        titleOpacity:l.title.fillOpacity,rows:l.item.items.map(r=>({label:r.label,icon:r.icon,items:r.items?.length??0})),uniforms:uniformSnapshot()[i],opticalUniforms,expectedStateUniforms,geometry,shader,
        uniformInventory:Object.keys(u).sort(),environment:{hasEnvironment:u.uHasEnv.value,intensity:u.uEnvIntensity.value,rotation:u.uEnvRot.value.toArray(),texturePresent:!!u.envMap.value},
        inputGeometry:{panelEnabled:l.panel.enabled,frontZ:l.panel.frontZ,pressMaxDepth:l.panel.press.maxDepth,titleHit:{type:titleHit.geometry.type,position:titleHit.position.toArray(),width:titleHit.geometry.parameters.width,height:titleHit.geometry.parameters.height},rows:l.rows.map(row=>({enabled:row.enabled,t:row.t,frontZ:row.frontZ}))},
        texts:textEvidence.filter(t=>t.level===i),icons:iconEvidence.filter(t=>t.level===i)});
    }
    const actualUi=c.camera.position.clone().sub(anchor).toArray(),direction=c.camera.getWorldDirection(new THREE.Vector3());
    const expectedDirection=anchor.clone().sub(c.camera.position).normalize();
    check('camera and output contract',same(actualUi,cameraUi)&&same(direction.toArray(),expectedDirection.toArray())&&near(c.camera.fov,cfg.fovYDegrees)
      &&near(c.camera.near,cfg.nearM)&&near(c.camera.far,cfg.farM)&&near(c.camera.aspect,cfg.widthPx/cfg.heightPx)
      &&c.renderer.domElement.width===cfg.widthPx&&c.renderer.domElement.height===cfg.heightPx);
    const renderSettings={toneMapping:c.renderer.toneMapping,toneMappingExposure:c.renderer.toneMappingExposure,dpr:c.renderer.getPixelRatio(),backgroundPresent:!!c.scene.background,backgroundRotation:c.scene.backgroundRotation.toArray(),environmentRotation:c.scene.environmentRotation.toArray(),backgroundIntensity:c.scene.backgroundIntensity,envIntensity:look.backdropUniforms().uEnvIntensity.value,envRotationMatrix:look.backdropUniforms().uEnvRot.value.toArray()};
    check('original HDR and colour configuration',renderSettings.toneMapping===THREE.NeutralToneMapping&&near(renderSettings.toneMappingExposure,1)&&near(renderSettings.dpr,1)&&renderSettings.backgroundPresent&&same(renderSettings.backgroundRotation.slice(0,3),[0,1.6,0])&&same(renderSettings.environmentRotation.slice(0,3),[0,1.6,0])&&near(renderSettings.backgroundIntensity,1)&&near(renderSettings.envIntensity,1)&&p.levels.every(l=>l.panel.skin.uniforms.envMap.value&&l.panel.skin.uniforms.uHasEnv.value===1&&Object.hasOwn(l.panel.skin.defines,'ENVMAP_TYPE_CUBE_UV')));
    const gl=c.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
    renderSettings.outputColorSpace=c.renderer.outputColorSpace;
    renderSettings.context={attributes:gl.getContextAttributes(),version:gl.getParameter(gl.VERSION),shadingLanguageVersion:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maximumTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),width,height};
    renderSettings.hdrAssetPins=records.filter(r=>/\.hdr$/i.test(r.path)).map(r=>({path:r.path,sha256:r.sha256,bytes:r.bytes}));
    const read=()=>{c.renderer.render(c.scene,c.camera);const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
    const png=data=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),im=ctx.createImageData(width,height);
      for(let y=0;y<height;y++)im.data.set(data.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);ctx.putImageData(im,0,0);return canvas.toDataURL('image/png');};
    const beauty=read();images['browser-beauty.png']=png(beauty);
    const originalUniforms=JSON.stringify(uniformSnapshot());
    const backdrop=look.backdropUniforms(),savedEnv=backdrop.envMap.value,savedRotation=backdrop.uEnvRot.value.clone(),savedIntensity=backdrop.uEnvIntensity.value,savedBackground=c.scene.background;
    const visibility=[];c.scene.traverse(o=>{if(o.isMesh||o.isSprite)visibility.push([o,o.visible]);});
    const diagnostics=[],alphaDiagnostics=[];
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
        // Separate alpha contribution evidence. The bench's opaque default
        // framebuffer cannot establish alpha. Keep the canonical Catalog,
        // camera and material unchanged and never relabel alpha as RGB visibility.
        for(const [o,visible]of visibility)o.visible=visible;
        const target=new THREE.WebGLRenderTarget(width,height),previousTarget=c.renderer.getRenderTarget();
        const previousClearAlpha=c.renderer.getClearAlpha(),previousClearColor=c.renderer.getClearColor(new THREE.Color()).clone(),previousBackground=c.scene.background;
        const alphaRead=()=>{c.renderer.render(c.scene,c.camera);const pixels=new Uint8Array(width*height*4);c.renderer.readRenderTargetPixels(target,0,0,width,height,pixels);return pixels;};
        let alphaOn,alphaZero,alphaRemoved;
        try{
          c.scene.background=null;c.renderer.setRenderTarget(target);c.renderer.setClearColor(0x000000,0);
          alphaOn=alphaRead();u.uOpacity.value=0;alphaZero=alphaRead();u.uOpacity.value=opacity;
          body.visible=false;alphaRemoved=alphaRead();body.visible=true;
        }finally{
          u.uOpacity.value=opacity;for(const [o,visible]of visibility)o.visible=visible;
          c.renderer.setRenderTarget(previousTarget);c.renderer.setClearColor(previousClearColor,previousClearAlpha);c.scene.background=previousBackground;target.dispose();
        }
        const alphaMetric=(a,b,roi)=>{let changed=0,maxDifference=0;const zones=Array.from({length:3},()=>({samples:0,changed:0,maxDifference:0}));
          const xs=[...isolatedRoi].map(at=>(at/4)%width),left=Math.min(...xs),right=Math.max(...xs);
          for(const at of roi){const d=Math.abs(a[at+3]-b[at+3]),x=(at/4)%width,zone=zones[Math.min(2,Math.floor((x-left)/Math.max(1,right-left+1)*3))];zone.samples++;if(d>=2){changed++;zone.changed++;}maxDifference=Math.max(maxDifference,d);zone.maxDifference=Math.max(zone.maxDifference,d);}
          return {pixels:roi.size,changed,maxDifference,zones};};
        const alphaContribution=alphaMetric(alphaOn,alphaZero,exposedRoi),alphaNegative=alphaMetric(alphaRemoved,alphaZero,exposedRoi);
        const alphaApplicable=exposedRoi.size>=contract.diagnostics.minimumRoiPixels;
        const threeZoneApplicable=alphaContribution.zones.every(z=>z.samples>=contract.diagnostics.minimumRoiPixels);
        if(alphaApplicable)check('separate RGBA rear body contribution level '+l.depth,alphaContribution.changed>=contract.diagnostics.minimumSceneChangedPixels&&alphaContribution.maxDifference>=2,alphaContribution);
        check('RGBA removed and zero-alpha negative control level '+l.depth,alphaNegative.maxDifference===0,alphaNegative);
        alphaDiagnostics.push({level:l.depth,view,surface:faceName,kind:'separate-transparent-RGBA-target',originalShader:true,canonicalGeometryUnmodified:true,
          roi:[...exposedRoi],roiEncoding:'RGBA byte offsets in bottom-up render-target readback',fullScene:alphaContribution,negativeControl:alphaNegative,
          sceneApplicable:alphaApplicable,threeZoneApplicable,threeZonePass:threeZoneApplicable?alphaContribution.zones.every(z=>z.changed>=contract.diagnostics.minimumSceneChangedPixels):null,
          notApplicableReason:alphaApplicable?null:'Canonical overlap leaves fewer than24 exposed body samples; no exposure manufactured',
          pixelComparisonUsesAlphaOnly:true,rgbVisibilityEstablished:false,frontMultiplier:u.uFrontOpacity.value,opacityRestored:u.uOpacity.value===opacity});
        images['alpha-level-'+l.depth+'-scene-on.png']=png(alphaOn);images['alpha-level-'+l.depth+'-scene-opacity-zero.png']=png(alphaZero);images['alpha-level-'+l.depth+'-scene-body-removed.png']=png(alphaRemoved);
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
    // The image/state receipt above remains the canonical rest view. The following
    // API diagnostics consume that page afterwards and are exported separately.
    const captureState={settled:p.settled,active:p.active,closing:p.closing.length,held:!!p.controls.held,palmPush:!!p.palmPush,stableFrames:stable.length,maxStableDelta:stableDelta};
    const rootIdentity=p.levels[0],originalPosition=p.position.clone(),originalScale=p.scale.clone(),originalPath=p.levels.map(l=>l.item.label);
    const rootWorld=p.getWorldPosition(new THREE.Vector3());
    const nodes=[];p.traverse(o=>{if(o!==p)nodes.push({o,local:o.matrix.toArray(),world:o.getWorldPosition(new THREE.Vector3()).toArray(),scale:o.getWorldScale(new THREE.Vector3()).toArray()});});
    const apiTrace={kind:'Synthetic software probes passed directly to the actual WindowControls.update API; not InputSystem, hand tracking, or held beauty evidence',wholeStack:{},rearTitleNavigation:[]};
    const inject=(h,world,pinch)=>{h.probes=[{id:'layer-api-probe',kind:'poke',point:h.worldToLocal(world.clone()),radius:0,pinch,pressOffset:0}];p.controls.update();p.updateMatrixWorld(true);};
    const clear=()=>{for(const l of p.levels)for(const h of [...l.moves,...l.corners])h.probes=[];p.controls.update();p.applyInputGates();};
    try {
      const move=p.levels.at(-1).moves[1],start=move.localToWorld(new THREE.Vector3(0,0,move.t+.005));
      inject(move,start,true);const capturedMove=p.controls.held?.handle===move;
      const delta=new THREE.Vector3(...contract.r8.apiDiagnostics.moveDeltaWorldM);inject(move,start.clone().add(delta),true);
      const translationError=Math.max(...nodes.map(n=>n.o.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...n.world).add(delta))));
      const localUnchanged=nodes.every(n=>same(n.o.matrix.toArray(),n.local,1e-9));
      apiTrace.wholeStack.move={captured:capturedMove,actualRootDeltaM:p.position.clone().sub(originalPosition).toArray(),maximumNodeWorldErrorM:translationError,localMatricesUnchanged:localUnchanged,nodeCount:nodes.length};
      check('whole-stack actual move API preserves all child transforms',capturedMove&&translationError<1e-8&&localUnchanged&&same(p.position.clone().sub(originalPosition).toArray(),delta.toArray()));
      clear();p.position.copy(originalPosition);p.updateMatrixWorld(true);
      const resize=p.levels.at(-1).corners[1],resizeStart=resize.localToWorld(new THREE.Vector3(0,0,resize.t+.005));
      inject(resize,resizeStart,true);const g=p.controls.held,capturedResize=g?.handle===resize;
      if(!capturedResize)throw Error('Whole-stack API resize did not capture');
      const factor=contract.r8.apiDiagnostics.resizeFactor;
      inject(resize,resizeStart.clone().addScaledVector(g.axis,g.extent*(factor-1)),true);
      const scalingError=Math.max(...nodes.map(n=>n.o.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...n.world).sub(rootWorld).multiplyScalar(factor).add(rootWorld))));
      const scaleError=Math.max(...nodes.flatMap(n=>n.o.getWorldScale(new THREE.Vector3()).toArray().map((v,k)=>Math.abs(v-n.scale[k]*factor))));
      apiTrace.wholeStack.resize={captured:capturedResize,factor,actualRootScale:p.scale.toArray(),maximumNodeWorldErrorM:scalingError,maximumNodeScaleError:scaleError,nodeCount:nodes.length};
      check('whole-stack actual resize API preserves proportions and navigation',capturedResize&&scalingError<1e-8&&scaleError<1e-8&&same(p.scale.toArray(),originalScale.toArray().map(v=>v*factor))&&JSON.stringify(p.levels.map(l=>l.item.label))===JSON.stringify(originalPath)&&p.levels[0]===rootIdentity);
    } finally {clear();p.position.copy(originalPosition);p.scale.copy(originalScale);p.updateMatrixWorld(true);}
    const transformRestored=nodes.every(n=>same(n.o.matrix.toArray(),n.local,1e-9)&&same(n.o.getWorldPosition(new THREE.Vector3()).toArray(),n.world,1e-8));
    check('whole-stack API transforms restore canonical rest',transformRestored&&!p.controls.held&&JSON.stringify(uniformSnapshot())===originalUniforms);
    const apiRestoredBeauty=read(),apiBeautyRestored=beauty.every((n,i)=>n===apiRestoredBeauty[i]);
    check('original beauty restored after whole-stack API diagnostics',apiBeautyRestored);
    apiTrace.wholeStack.restored=transformRestored;apiTrace.wholeStack.originalBeautyPixelsRestored=apiBeautyRestored;
    while(p.active>0){
      const beforePath=p.levels.map(l=>l.item.label),rear=p.levels[p.active-1],target=p.active-1;
      const point=new THREE.Vector3(0,rear.size.H/2-rear.size.titleBand/2,rear.panel.t);
      const enabledTitle=rear.panel.enabled&&rear.panel.inside(point)&&!rear.panel.inside(new THREE.Vector3(0,0,rear.panel.t));
      rear.panel.dispatchEvent({type:'select'});const frames=settle();
      const expectedPath=beforePath.slice(0,-1),actualPath=p.levels.map(l=>l.item.label);
      const pass=enabledTitle&&p.active===target&&p.levels[0]===rootIdentity&&!p.closing.length&&JSON.stringify(actualPath)===JSON.stringify(expectedPath);
      check('actual rear-title back API to level '+target,pass);
      apiTrace.rearTitleNavigation.push({beforePath,actualPath,enabledTitle,frames,rootIdentityPreserved:p.levels[0]===rootIdentity,passed:pass});
      if(!pass)break;
    }
    p.levels[0].panel.dispatchEvent({type:'select'});settle();
    const rootPreserved=p.active===0&&p.levels.length===1&&p.levels[0]===rootIdentity&&!p.closing.length&&JSON.stringify(p.levels[0].item)===JSON.stringify(parent.catalog);
    check('Catalog root survives rear-title navigation and root select',rootPreserved);
    apiTrace.final={rootPreserved,path:p.levels.map(l=>l.item.label),active:p.active,closing:p.closing.length,held:!!p.controls.held};
    return {images,checks,allPassed:checks.every(c=>c.passed),navigation,levels,texts:textEvidence,icons:iconEvidence,diagnostics,alphaDiagnostics,
      legacyRgbObservation:{thresholdsUnchanged:true,failedChecks:checks.filter(c=>!c.passed&&/surface contributes actual pixels|actual scene rear body contribution|view scene contribution/.test(c.name)),
        separateFromAlphaEvidence:true,sourceProductLegacyFailurePreserved:contract.sourceProductThinSheetEvidence.legacyRGB},
      postCaptureApiDiagnostics:apiTrace,sceneContributionMatrixGate:contract.diagnostics.matrixGate,matrixGateEvaluated:false,runtimeDefaultsJson,moduleIdentity,renderSettings,
      state:captureState,
      camera:{positionUiM:actualUi,positionWorldM:c.camera.position.toArray(),quaternion:c.camera.quaternion.toArray(),matrixWorld:c.camera.matrixWorld.toArray(),projectionMatrix:c.camera.projectionMatrix.toArray(),fovY:c.camera.fov,near:c.camera.near,far:c.camera.far,width,height},
      evidenceScope:'Actual browser pixels and synthetic software navigation; not physical hand tracking, Blender multi-layer support, optical equivalence or adopted design'};
  }, {source,dependencies,contract,parent,fixtureName,view,records,expectedDefaults}));
  ctx.assertActive();
  const imageRecords=[];
  for(const [name,url] of Object.entries(result.images)){
    const bytes=Buffer.from(url.split(',')[1],'base64');await ctx.writeFile(path.join(out,name),bytes,{flag:'wx'});imageRecords.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
  }
  delete result.images;
  const settingsBytes=Buffer.from(result.runtimeDefaultsJson);
  await ctx.writeFile(path.join(out,'runtime-defaults.json'),settingsBytes,{flag:'wx'});
  implementationEvidence.push({path:'runtime-defaults.json',bytes:settingsBytes.length,sha256:sha(settingsBytes)});
  delete result.runtimeDefaultsJson;
  const after=await verifySource();
  for(const [name,expected] of Object.entries(helperPins))if(sha(await fs.readFile(new URL('./'+name,import.meta.url)))!==expected)throw Error('Runtime helper changed during capture: '+name);
  if(sha(await fs.readFile(scriptPath))!==sha(scriptBytes)||sha(await fs.readFile(new URL('./layers-contract.json',import.meta.url)))!==sha(contractBytes)
    ||sha(await fs.readFile(new URL('./baseline/comparison-contract.json',import.meta.url)))!==sha(parentBytes)
    ||sha(await fs.readFile(new URL('./baseline/manifest.json',import.meta.url)))!==sha(manifestBytes))throw Error('Capture implementation changed while running');
  result.errors=errors;result.failedRequests=failedRequests;result.allPassed&&=errors.length===0&&failedRequests.length===0;
  Object.assign(result,{fixture:fixtureName,view,sourceSha:contract.sourceSha,inputDigest:inventoryDigest,parentR8ContractSha256:sha(parentBytes),layersContractSha256:sha(contractBytes),captureScriptSha256:sha(scriptBytes),sourceVerification:{before,after},helperEvidence,implementationEvidence,images:imageRecords,unsupported:contract.unsupported});
  Object.assign(result,{contractSha256:sha(parentBytes),profileId:'current',overrides:{},
    scriptSha256:sha(scriptBytes),settingsSha256:sha(settingsBytes),canonicalDefaultsSha256:sha(JSON.stringify(canonicalDefaults)),
    stateName:'layers-'+fixtureName+'-rest',cameraInUiM:result.camera.positionUiM,cameraQuaternionUi:result.camera.quaternion,
    initialConstructionDistanceM:contract.capture.constructionDistanceM,fixedAnchorWorldM:contract.capture.fixedAnchorWorldM,
    artifacts:imageRecords,presetAdopted:false,physicalAcceptance:false,headsetAcceptance:false});
  if(imageRecords.length!==contract.plannedImageBudget[fixtureName==='lighting'?'lightingFront':'modularAngle'].totalPng)throw Error('Diagnostic image count differs from bounded contract');
  ctx.assertActive();
  return result;
}});
if(outcome.value)console.log(JSON.stringify({allPassed:outcome.value.allPassed,fixture:fixtureName,view,profileId:'current',checks:outcome.value.checks.length,failed:outcome.value.checks.filter(c=>!c.passed),images:outcome.value.images.length,sourceRecords:records.length,out}));
if(!outcome.ok || !outcome.value?.allPassed)process.exitCode=1;
