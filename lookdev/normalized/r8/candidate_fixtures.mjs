// R8 candidate observations. Actual software input and shader data; no design adoption.
import {applyControlsFixture} from './controls_fixtures.mjs';
export const CONDITIONS=Object.freeze([
 {id:'root-rest-front',kind:'controls',state:'rest',view:'front'},
 {id:'root-side-held-front',kind:'controls',state:'side-held',view:'front'},
 {id:'lighting-front',kind:'layers',fixture:'lighting',view:'front'},
 {id:'modular-angle',kind:'layers',fixture:'modular',view:'angle'},
]);
export const WINDOW_UNIFORMS=Object.freeze({albedo:'uAlbedo',knee:'uKnee',sat:'uSat',rimLine:'uRimLine',shoulder:'uShoulder',edge:'uEdge',frost:'uFrost',grain:'uGrain',key:'uKey'});
const ALL_WINDOW_UNIFORMS={...WINDOW_UNIFORMS,maxLum:'uMaxLum',rimClear:'uRimClear',veil:'uVeil'};
const need=(value,message)=>{if(!value)throw Error(message);};
export function subsetEqual(actual,expected,tolerance=1e-9){
 if(typeof actual==='number'||typeof expected==='number')return typeof actual==='number'&&typeof expected==='number'&&Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=tolerance;
 if(Array.isArray(actual)||Array.isArray(expected))return Array.isArray(actual)&&Array.isArray(expected)&&actual.length===expected.length&&actual.every((v,i)=>subsetEqual(v,expected[i],tolerance));
 if(actual&&expected&&typeof actual==='object'&&typeof expected==='object')return Object.keys(expected).every(k=>Object.hasOwn(actual,k)&&subsetEqual(actual[k],expected[k],tolerance));
 return actual===expected;
}
const uniformNumbers=u=>Object.fromEntries(Object.entries(u).flatMap(([k,{value:v}])=>typeof v==='number'||typeof v==='boolean'?[[k,v]]:v?.toArray?[[k,v.toArray()]]:Array.isArray(v)&&v.every(x=>typeof x==='number'||x?.toArray)?[[k,v.map(x=>x?.toArray?x.toArray():x)]]:[]));

export async function captureCandidate({source,dependencies,contract,layersContract,records,expectedDefaults,profile,condition}){
 need(CONDITIONS.some(c=>JSON.stringify(c)===JSON.stringify(condition)),'Unsupported R8 observation');
 const producerUrls={};for(const name of ['InputSystem','defaults','look']){
  const urls=[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(u=>new URL(u).pathname.endsWith(source+'/src/core/'+name+'.js')))];
  need(urls.length===1,'Ambiguous actual producer '+name);producerUrls[name]=urls[0];
 }
 const THREE=await import('/@fs'+dependencies+'/three/build/three.module.js');
 const {InputSystem}=await import(producerUrls.InputSystem),{DEFAULTS}=await import(producerUrls.defaults),look=await import(producerUrls.look);
 need(JSON.stringify(DEFAULTS)===JSON.stringify(expectedDefaults),'Actual producer DEFAULTS drift');
 need(DEFAULTS.look.glass.blur===.36,'Shared glass blur changed');
 const c=window.contour,p=c.panel,cfg=contract.capture,anchor=new THREE.Vector3(...cfg.fixedAnchorWorldM);
 need(new URL(location.href).searchParams.has('manual')&&p?.levels.length===1&&!p.closing.length,'Fresh manual Catalog root required');
 need(p.levels[0].panel.skin.uniforms.envMap===look.backdropUniforms().envMap,'Actual backdrop module identity mismatch');
 need(JSON.stringify(p.levels[0].item)===JSON.stringify(contract.catalog),'Catalog content changed');
 let fixture,navigation=[];
 if(condition.kind==='controls')fixture=applyControlsFixture({THREE,InputSystem,contour:c,contract,state:condition.state});
 else{
  c.renderer.setAnimationLoop(null);p.position.copy(anchor);p.updateMatrixWorld(true);
  const view=layersContract.capture.views[condition.view],cameraUi=view.cameraUiM??[view.radiusM*Math.sin(view.azimuthRad),view.heightM,view.radiusM*Math.cos(view.azimuthRad)];
  c.camera.position.copy(anchor).add(new THREE.Vector3(...cameraUi));c.camera.lookAt(anchor);c.camera.updateProjectionMatrix();c.camera.updateMatrixWorld(true);
  const f=layersContract.fixtures[condition.fixture],lc=layersContract.capture;
  const settle=()=>{let frames=0;do{c.tick(1,lc.dtSeconds);frames++;}while((!p.settled||p.closing.length)&&frames<lc.maximumSettleFrames);need(p.settled&&!p.closing.length,'Layer settle failed');c.tick(lc.settleTailFrames,lc.dtSeconds);return frames+lc.settleTailFrames;};
  settle();for(const row of f.rowIndices){const l=p.levels.at(-1),item=l.item.items[row],before=p.levels.length;need(item?.items?.length,'Invalid actual navigation target');l.rows[row].dispatchEvent({type:'select'});const frames=settle();need(p.levels.length===before+1&&p.levels.at(-1).item===item,'Actual product navigation failed');navigation.push({from:l.item.label,row,to:item.label,frames,levels:p.levels.length});}
  need(JSON.stringify(p.levels.map(l=>l.item.label))===JSON.stringify(f.path)&&JSON.stringify(p.levels.map(l=>l.rows.length))===JSON.stringify(f.rowCounts),'Layer content/path drift');
 }
 const visible=o=>{for(let q=o;q;q=q.parent)if(!q.visible)return false;return !o.material||o.material.visible!==false;};
 const textObjects=[],iconObjects=[];
 p.levels.forEach((l,level)=>{
  l.group.traverse(o=>{if('textRenderInfo'in o&&visible(o))textObjects.push({o,level});});
  l.rows.forEach((row,ri)=>{const item=l.item.items[ri],names=[item.icon,...(item.items?.length?['chevron-right']:[])].filter(Boolean),sprites=row.face.children.filter(o=>o.geometry?.type==='PlaneGeometry'&&o.material?.map&&visible(o));need(sprites.length===names.length,'Icon inventory changed');sprites.forEach((o,slot)=>iconObjects.push({o,level,row:ri,slot,name:names[slot]}));});
 });
 const iconData=o=>{const canvas=o.material.map.image;if(!canvas?.getContext||!canvas.width||!canvas.height)return null;const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i])count++;return {rgba,count,width:canvas.width,height:canvas.height};};
 const deadline=performance.now()+30000;while(textObjects.some(({o})=>!o.textRenderInfo||o.textRenderInfo.parameters.text!==o.text)||iconObjects.some(({o})=>!iconData(o)?.count)){need(performance.now()<deadline,'Fonts/icons not ready');await new Promise(resolve=>setTimeout(resolve,20));}
 const {typesetterWorkerModule}=await import('/@fs'+dependencies+'/troika-three-text/src/TextBuilder.js'),{defineWorkerModule}=await import('/@fs'+dependencies+'/troika-worker-utils/dist/troika-worker-utils.esm.js');
 const shape=defineWorkerModule({dependencies:[typesetterWorkerModule],init:typesetter=>args=>new Promise(resolve=>typesetter.typeset(args,resolve))});
 const shapedRuns=[];for(const {o,level}of textObjects){const info=o.textRenderInfo,shaped=await shape({...info.parameters}),name=o.font.split('/').at(-1).split('?')[0],font=records.find(r=>r.path.endsWith('/'+name));const boundsError=Math.max(...info.visibleBounds.map((v,i)=>Math.abs(v-shaped.visibleBounds[i])));need(font&&shaped.fontData.length===1&&shaped.glyphFontIndices.every(i=>i===0)&&shaped.fontData[0].src.split('/').at(-1).split('?')[0]===name&&boundsError<=1e-7,'Fallback font or shaping drift');shapedRuns.push({o,level,font,name,shaped,boundsError});}
 let layerState=null;
 if(condition.kind==='layers'){
  const snapshots=[],lc=layersContract.capture;
  const numeric=v=>typeof v==='number'?[v]:Array.isArray(v)?v.flatMap(numeric):v&&typeof v==='object'?Object.values(v).flatMap(numeric):[];
  for(let i=0;i<lc.stableFrames;i++){c.tick(1,lc.dtSeconds);p.updateMatrixWorld(true);snapshots.push(numeric(p.levels.map(l=>({cur:{...l.cur},to:{...l.to},matrix:l.group.matrixWorld.toArray(),title:l.title.fillOpacity,uniforms:uniformNumbers(l.panel.skin.uniforms)}))));}
  const delta=Math.max(0,...snapshots.slice(1).flatMap(s=>s.map((n,i)=>Math.abs(n-snapshots[0][i]))));need(delta<=lc.stableTolerance&&p.settled&&!p.closing.length&&!p.controls.held&&!p.palmPush,'Layer state not stable');
  layerState={settled:p.settled,active:p.active,closing:p.closing.length,held:!!p.controls.held,palmPush:!!p.palmPush,stableFrames:snapshots.length,maxStableDelta:delta};
 }
 const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ArrayBuffer.isView(v)?v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength):v))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const hashText=s=>hash(new TextEncoder().encode(s));
 const texts=shapedRuns.map(({o,level,font,name,shaped,boundsError})=>({level,text:o.text,fontBasename:name,fontSha256:font.sha256,fontSize:o.fontSize,letterSpacing:o.letterSpacing,visibleBounds:Array.from(o.textRenderInfo.visibleBounds),blockBounds:Array.from(o.textRenderInfo.blockBounds),matrixWorld:o.matrixWorld.toArray(),fillOpacity:o.fillOpacity,baseOpacity:o.userData.baseOpacity??1,preserveTitle:!!o.userData.preserveTitle,hideWhenDim:!!o.userData.hideWhenDim,glyphIds:Array.from(shaped.glyphIds),glyphPositions:Array.from(shaped.glyphPositions),noFontFallback:true,shapedVisibleBoundsError:boundsError}));
 const icons=[];for(const {o,...meta}of iconObjects){const a=iconData(o),asset=records.find(r=>r.path==='node_modules/lucide-static/icons/'+meta.name+'.svg');need(asset&&a.count,'Missing pinned icon');icons.push({...meta,sha256:asset.sha256,rgbaSha256:await hash(a.rgba),width:a.width,height:a.height,nonzeroAlphaPixels:a.count,visible:visible(o),matrixWorld:o.matrixWorld.toArray(),opacity:o.material.opacity,baseOpacity:o.material.userData.baseOpacity??1});}
 const meshes=[],materials=[],levels=[],handles=[],optical=[],actualWindowUniforms=[],uniformInventories=[];
 for(const [level,l]of p.levels.entries()){
  const u=l.panel.skin.uniforms;need(u.envMap===look.backdropUniforms().envMap&&u.envMap.value&&u.uHasEnv.value===1,'Missing actual HDR backdrop');
  need(!('uRearMask'in u)&&!('uCoverRect'in u)&&!l.panel.skin.fragmentShader.includes('uRearMask'),'Hard rear mask changed');
  const actualOptics={};for(const [field,key]of Object.entries(ALL_WINDOW_UNIFORMS)){actualOptics[field]=u[key].value?.toArray?u[key].value.toArray():u[key].value;need(subsetEqual(actualOptics[field],profile.resolvedWindow[field],1e-12),'Actual window optical uniform mismatch '+field);}
  optical.push({level,values:actualOptics});actualWindowUniforms.push(uniformNumbers(u));uniformInventories.push(Object.keys(u).sort());
  const fixed=uniformNumbers(u);for(const key of Object.values(WINDOW_UNIFORMS))delete fixed[key];
  const g=l.panel.body.geometry;
  levels.push({level,path:p.levels.slice(0,level+1).map(x=>x.item.label),size:{W:l.size.W,H:l.size.H,titleBand:l.size.titleBand},cur:{...l.cur},groupMatrixWorld:l.group.matrixWorld.toArray(),bodyMatrixWorld:l.panel.body.matrixWorld.toArray(),titleOpacity:l.title.fillOpacity,windowPositionSha256:await hash(g.attributes.position.array),windowNormalSha256:await hash(g.attributes.normal.array),windowIndexSha256:await hash(g.index.array),windowFixedUniforms:fixed,inputs:[l.panel,...l.rows,...l.moves,...l.corners].map(h=>({hovered:h.hovered,pressed:h.press.pressed,owner:h.pressOwner??null,depth:h.press.depth,enabled:h.enabled,grab:h.grab?.id??null}))});
  const drawn=[];l.group.traverse(o=>{if((o.isMesh||o.isLineSegments)&&visible(o)&&o.geometry?.attributes.position)drawn.push(o);});
  for(const [index,o]of drawn.entries()){
   const g=o.geometry;meshes.push({level,index,type:o.type,geometryType:g.type,vertices:g.attributes.position.count,positionBufferSha256:await hash(g.attributes.position.array),normalBufferSha256:g.attributes.normal?await hash(g.attributes.normal.array):null,indexBufferSha256:g.index?await hash(g.index.array):null,matrixWorld:o.matrixWorld.toArray()});
   for(const [slot,m]of (Array.isArray(o.material)?o.material:[o.material]).entries()){
    const isWindow=m===l.panel.skin,isText='textRenderInfo'in o,uniforms=m.uniforms?uniformNumbers(m.uniforms):{};if(isWindow)for(const key of Object.values(WINDOW_UNIFORMS))delete uniforms[key];
    // Text atlas allocation is not a typography parameter. Actual glyph IDs,
    // positions, pinned font bytes, visible bounds and live material style remain.
    if(isText)for(const key of Object.keys(uniforms).filter(k=>/TroikaSDFTextureSize|TroikaSDFGlyphSize/.test(k)))delete uniforms[key];
    materials.push({level,index,slot,isWindow,isText,type:m.type,color:m.color?.toArray()??null,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,side:m.side,premultipliedAlpha:m.premultipliedAlpha,blending:m.blending,defines:!isText?structuredClone(m.defines??{}):{},vertexShaderSha256:!isText&&m.vertexShader?await hashText(m.vertexShader):null,fragmentShaderSha256:!isText&&m.fragmentShader?await hashText(m.fragmentShader):null,uniforms});
   }
  }
  for(const [i,h]of [...l.moves,...l.corners].entries()){
   need(h.skin.envMap===look.backdropUniforms().envMap&&h.skin.uBodyOpacity.value===.38,'Control shader identity/opacity drift');
   handles.push({level,id:i<2?'side-'+i:'corner-'+(i-2),bodyVisible:visible(h.body),matrixWorld:h.matrixWorld.toArray(),bodyMatrixWorld:h.body.matrixWorld.toArray(),hitMatrixWorld:h.hitMeshes[0].matrixWorld.toArray(),invisibleHitMaterial:h.hitMeshes[0].material.visible===false,uniforms:uniformNumbers(h.skin),arrow:h.arrow?{vertices:Array.from(h.arrow.geometry.attributes.position.array),matrixWorld:h.arrow.matrixWorld.toArray(),opacity:h.arrow.material.opacity,visible:visible(h.arrow)}:null});
  }
 }
 const camera={positionUiM:c.camera.getWorldPosition(new THREE.Vector3()).sub(anchor).toArray(),positionWorldM:c.camera.position.toArray(),quaternion:c.camera.quaternion.toArray(),matrixWorld:c.camera.matrixWorld.toArray(),projectionMatrix:c.camera.projectionMatrix.toArray(),fovY:c.camera.fov,near:c.camera.near,far:c.camera.far,width:c.renderer.domElement.width,height:c.renderer.domElement.height};
 const hdr={toneMapping:c.renderer.toneMapping,toneMappingExposure:c.renderer.toneMappingExposure,dpr:c.renderer.getPixelRatio(),backgroundPresent:!!c.scene.background,backgroundRotation:c.scene.backgroundRotation.toArray(),environmentRotation:c.scene.environmentRotation.toArray(),backgroundIntensity:c.scene.backgroundIntensity,envIntensity:look.backdropUniforms().uEnvIntensity.value,envRotationMatrix:look.backdropUniforms().uEnvRot.value.toArray()};
 const gl=c.renderer.getContext();hdr.outputColorSpace=c.renderer.outputColorSpace;
 hdr.context={attributes:gl.getContextAttributes(),version:gl.getParameter(gl.VERSION),shadingLanguageVersion:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),maximumTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};
 hdr.hdrAssetPins=records.filter(r=>/\.hdr$/i.test(r.path)).map(r=>({path:r.path,sha256:r.sha256,bytes:r.bytes}));
 need(camera.fovY===26&&camera.width===1600&&camera.height===1000&&hdr.toneMapping===THREE.NeutralToneMapping&&hdr.toneMappingExposure===1&&hdr.dpr===1&&hdr.backgroundPresent&&subsetEqual(hdr.environmentRotation,[0,1.6,0,'XYZ']),'Fixed camera/HDR drift');
 const invariants={meshes,materials,texts,icons,levels,handles,camera,hdr,fixture:fixture??null,navigation,layerState};
 return {verified:true,condition,profileId:profile.id,producerUrls,actualProducerIdentity:true,actualBackdropIdentity:true,runtimeDefaults:structuredClone(DEFAULTS),invariants,optical,actualWindowUniforms,uniformInventories,readiness:{noFontFallback:true,textRuns:texts.length,icons:icons.length},limitations:{fontAtlasAllocationIsNotFingerprint:true,actualWebGLShader:true,normalizedBlenderExportSupported:false,physicalOpticalEquivalence:false,questAccepted:false,designAdopted:false},png:c.pass('beauty')};
}

export function compareCurrentReference(condition,result,reference,profile={id:"current",resolvedWindow:{}}){
 const fullUniformCheck=compareAllWindowUniforms(condition,result,reference,profile);
 const a=result.invariants,checks=[],check=(name,actual,expected)=>{need(subsetEqual(actual,expected),'Accepted current reference mismatch: '+name);checks.push(name);};
 if(condition.kind==='controls'){
  const r=reference.result;check('actual fixture trace',a.fixture,r.fixture);check('camera position',a.camera.positionUiM,r.cameraInUiM);check('camera quaternion',a.camera.quaternion,r.cameraQuaternionUi);
  need(a.meshes.length===r.geometry.length,'Current root visible mesh count differs');a.meshes.forEach((m,i)=>{const g=r.geometry[i];check('mesh '+i,m,{index:g.id,type:g.type,geometryType:g.geometryType,vertices:g.vertices,positionBufferSha256:g.positionBufferSha256,indexBufferSha256:g.indexBufferSha256,matrixWorld:g.matrixWorld});});
  need(a.texts.length===r.texts.length,'Current text count differs');a.texts.forEach((t,i)=>{const x=r.texts[i];check('text '+i,t,{text:x.text,fontBasename:x.font.split('/').at(-1).split('?')[0],fontSize:x.fontSize,letterSpacing:x.letterSpacing,visibleBounds:x.visibleBounds,blockBounds:x.blockBounds,matrixWorld:x.matrixWorld,fillOpacity:x.fillOpacity});});
  check('icon readiness',a.icons.map(i=>({row:i.row,slot:i.slot,width:i.width,height:i.height,nonzeroAlphaPixels:i.nonzeroAlphaPixels,visible:i.visible})),r.readiness.icons);
  check('HDR',a.hdr,{toneMapping:r.settings.toneMapping,toneMappingExposure:r.settings.toneMappingExposure,dpr:r.settings.dpr,environmentRotation:r.settings.environmentRotation});
  const fixed={...r.rootShaderUniforms};for(const name of Object.values(WINDOW_UNIFORMS))delete fixed[name];check('root fixed shader uniforms',a.levels[0].windowFixedUniforms,fixed);
  need(a.handles.length===r.handleEvidence.length,'Control count differs');a.handles.forEach((h,i)=>{const x=r.handleEvidence[i];check('actual control '+i,h,{id:x.id,bodyMatrixWorld:x.bodyMatrixWorld,hitMatrixWorld:x.hitMatrixWorld,invisibleHitMaterial:x.invisibleHitMaterial,bodyVisible:x.bodyVisible,uniforms:x.numericUniforms,arrow:x.arrow});});
 }else{
  check('navigation',a.navigation,reference.navigation);check('settled state',a.layerState,reference.state);check('camera',a.camera,reference.camera);check('HDR',a.hdr,reference.renderSettings);
  need(a.levels.length===reference.levels.length,'Layer count differs');a.levels.forEach((l,i)=>{const x=reference.levels[i];check('layer '+i,l,{level:x.index,path:x.path,size:x.size,cur:x.cur,groupMatrixWorld:x.groupMatrixWorld,bodyMatrixWorld:x.bodyMatrixWorld,titleOpacity:x.titleOpacity,windowPositionSha256:x.geometry.attributes.position.sha256,windowNormalSha256:x.geometry.attributes.normal.sha256,windowIndexSha256:x.geometry.index.sha256});});
  need(a.texts.length===reference.texts.length,'Layer text count differs');a.texts.forEach((t,i)=>{const x=reference.texts[i];check('layer text '+i,t,{level:x.level,text:x.text,fontBasename:x.fontBasename,fontSha256:x.fontSha256,fontSize:x.sizeM,letterSpacing:x.trackingEm,fillOpacity:x.opacity,visibleBounds:x.visibleBounds,matrixWorld:x.matrixWorld,baseOpacity:x.baseOpacity,preserveTitle:x.preserveTitle,hideWhenDim:x.hideWhenDim});});
  need(a.icons.length===reference.icons.length,'Layer icon count differs');a.icons.forEach((i,n)=>check('layer icon '+n,i,reference.icons[n]));
 }
 return {matched:true,checks,numericTolerance:1e-9,fullUniformCheck};
}

// A fixed receipt is loaded before the new observation. Never infer expected
// current uniforms from the new observation or strip fixed optical fields.
export function compareAllWindowUniforms(condition,result,reference,profile={id:'current',resolvedWindow:{}}){
 const maps=condition.kind==='controls'?[reference.result.rootShaderUniforms]:reference.levels.map(level=>{
  const names={opacity:'uOpacity',fade:'uFade',dim:'uDim',solidOpacity:'uSolidOpacity',frontOpacity:'uFrontOpacity',bulge:'uBulgeParam',dent:'uBulgeDent'};
  const state=Object.fromEntries(Object.entries(level.uniforms).map(([k,v])=>[names[k]??k,v]));
  return {...state,...level.opticalUniforms,uHasEnv:level.environment.hasEnvironment,uEnvIntensity:level.environment.intensity,uEnvRot:level.environment.rotation};
 });
 need(Array.isArray(result.actualWindowUniforms)&&result.actualWindowUniforms.length===maps.length,'Actual full window uniform maps missing');
 const checks=[];
 maps.forEach((baseline,i)=>{
  const expected=structuredClone(baseline),actual=result.actualWindowUniforms[i];
  if(profile.id!=='current')for(const [field,name]of Object.entries(WINDOW_UNIFORMS)){
   need(Object.hasOwn(profile.resolvedWindow,field),'Profile optical value missing '+field);expected[name]=profile.resolvedWindow[field];
  }
  const keys=Object.keys(expected).sort();need(JSON.stringify(Object.keys(actual).sort())===JSON.stringify(keys),'Actual full uniform key inventory differs level '+i);
  need(subsetEqual(actual,expected,1e-9),'Actual full uniforms/opticalUniforms differ level '+i);
  if(condition.kind==='layers')need(JSON.stringify(result.uniformInventories[i])===JSON.stringify(reference.levels[i].uniformInventory),'Actual complete uniform inventory differs level '+i);
  need(Object.hasOwn(actual,'uFrostScale')&&Object.hasOwn(actual,'uFrontOpacity'),'Required fixed optics/state missing');
  checks.push({level:i,numericUniformCount:keys.length,fullFixedAndOpticalCompared:true,frostScale:actual.uFrostScale});
 });
 return {matched:true,checks,allowedCandidateUniforms:Object.values(WINDOW_UNIFORMS),referenceIndependent:true};
}
