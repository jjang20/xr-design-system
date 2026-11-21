// Browser-only staged controls evidence. The host runtime owns deadlines/capture hooks.
import {applyControlsFixture,runControlNegative,captureControlOptics} from './controls_fixtures.mjs';
import {runMultipointFixture,captureMultipointOptics} from './controls_multipoint.mjs';
let job;
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const visible=o=>{for(let q=o;q;q=q.parent)if(!q.visible)return false;return !o.material||o.material.visible!==false;};
const serialUniforms=u=>Object.fromEntries(Object.entries(u).filter(([,x])=>typeof x.value==='number'||x.value?.toArray||Array.isArray(x.value)).map(([k,x])=>[k,Array.isArray(x.value)?x.value.map(v=>v?.toArray?v.toArray():v):x.value?.toArray?x.value.toArray():x.value]));
const labelsFor=level=>{const labels=[];level.group.traverse(o=>{if(o.geometry?.type==='GlyphsGeometry'||'textRenderInfo'in o)labels.push(o);});return labels;};
const expectedLabels=level=>[level.item.label,...(level.item.subtitle?[level.item.subtitle]:[]),...(level.item.items??[]).flatMap(item=>[item.label,...(item.sublabel?[item.sublabel]:item.items?.length?[`${item.items.length} ${item.items.length===1?'item':'items'}`]:[])])];

export async function prepare({source,dependencies,contract,expectedDefaults,state,scenario,multipoint}){
 requireValue(!job,'One controls job per fresh page');
 const producerUrls={};
 for(const name of ['InputSystem','defaults','look']){
  const urls=[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(u=>new URL(u).pathname.endsWith(source+'/src/core/'+name+'.js')))];
  requireValue(urls.length===1,'Producer ESM identity ambiguous: '+name);producerUrls[name]=urls[0];
 }
 const THREE=await import('/@fs/'+dependencies+'/three/build/three.module.js');
 const {InputSystem}=await import(producerUrls.InputSystem),{DEFAULTS}=await import(producerUrls.defaults),look=await import(producerUrls.look);
 requireValue(JSON.stringify(DEFAULTS)===JSON.stringify(expectedDefaults),'Actual DEFAULTS changed');
 const c=window.contour,p=c.panel,l=p.levels[0],anchor=new THREE.Vector3(...contract.capture.fixedAnchorWorldM),handles=[...l.moves,...l.corners];
 requireValue(look.backdropUniforms().envMap===l.panel.skin.uniforms.envMap&&handles.every(h=>h.skin.envMap===look.backdropUniforms().envMap),'Actual shader/backdrop identity mismatch');
 requireValue(handles.every(h=>h.skin.uBodyOpacity.value===DEFAULTS.look.dockBubble.bodyOpacity&&h.skin.uBodyOpacity.value===.38),'R8 bubble body opacity mismatch');
 requireValue(l.panel.skin.uniforms.envMap.value&&handles.every(h=>h.body.children.every(m=>'ENVMAP_TYPE_CUBE_UV'in m.material.defines)),'Actual HDR shader not ready');
 requireValue(!('uRearMask'in l.panel.skin.uniforms)&&!l.panel.body.material.fragmentShader.includes('uRearMask'),'R4 hard mask remains');
 const options={THREE,InputSystem,contour:c,contract,state,scenario:multipoint??scenario};
 const multi=multipoint?runMultipointFixture(options):null;
 const fixture=multi?null:scenario?runControlNegative(options):applyControlsFixture(options);
 job={THREE,DEFAULTS,look,c,p,l,anchor,handles,producerUrls,contract,state,scenario,multipoint,multi,fixture};
 return {prepared:true,state,scenario,multipoint,levels:p.stack.all.map(level=>level.item.label),visualMultipoint:!!multi?.visual};
}

export function readiness(){
 requireValue(job,'Controls job has not been prepared');
 const levels=[];let pending=0;
 for(const level of job.p.stack.all){
  const labels=labelsFor(level),expected=expectedLabels(level);
  requireValue(JSON.stringify(labels.map(t=>t.text).sort())===JSON.stringify(expected.sort()),'Canonical text/content mismatch: '+level.item.label);
  const awaiting=labels.filter(t=>!t.textRenderInfo||t.textRenderInfo.parameters.text!==t.text||!t.textRenderInfo.visibleBounds?.every(Number.isFinite));
  pending+=awaiting.length;levels.push({label:level.item.label,textRuns:labels.length,pending:awaiting.map(t=>t.text)});
 }
 return {ready:pending===0,pending,levels};
}

export async function capture(){
 requireValue(readiness().ready,'Actual glyph/font readiness has not completed');
 const {THREE,DEFAULTS,look,c,p,l,anchor,producerUrls,state,scenario,multipoint,multi,fixture}=job;
 const cameraInUiM=c.camera.getWorldPosition(new THREE.Vector3()).sub(anchor).toArray(),cameraQuaternionUi=c.camera.getWorldQuaternion(new THREE.Quaternion()).toArray();
 requireValue(cameraInUiM.every((v,i)=>Math.abs(v-[0,0,.8][i])<=1e-9)&&cameraQuaternionUi.every((v,i)=>Math.abs(v-[0,0,0,1][i])<=1e-9)&&c.camera.fov===26&&c.renderer.domElement.width===1600&&c.renderer.domElement.height===1000,'R8 camera/framing changed');
 const hash=async array=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',array))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const levels=[];
 for(const level of p.stack.all){
  const texts=labelsFor(level),icons=[];
  for(const[row,r]of level.rows.entries()){
   const expected=(level.item.items[row].icon?1:0)+(level.item.items[row].items?.length?1:0);
   const glyphs=r.face.children.filter(o=>o.geometry?.type==='PlaneGeometry'&&o.material?.map);
   requireValue(glyphs.length===expected,'Missing actual icon/chevron for '+level.item.label+'/'+row);
   for(const[slot,o]of glyphs.entries()){
    const canvas=o.material.map.image;requireValue(canvas?.getContext&&canvas.width&&canvas.height,'Icon canvas not ready');
    const a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let covered=0;for(let k=3;k<a.length;k+=4)if(a[k])covered++;
    requireValue(covered>0,'Blank icon canvas');icons.push({row,slot,width:canvas.width,height:canvas.height,nonzeroAlphaPixels:covered,visible:visible(o)});
   }
  }
  const drawn=[];level.group.traverse(o=>{if((o.isMesh||o.isLineSegments)&&visible(o)&&o.geometry?.attributes.position)drawn.push(o);});
  const geometry=[];
  for(const[id,o]of drawn.entries()){
   const pos=o.geometry.attributes.position,box=new THREE.Box3();for(let i=0;i<pos.count;i++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).sub(anchor));
   geometry.push({id,type:o.type,geometryType:o.geometry.type,vertices:pos.count,positionBufferSha256:await hash(pos.array),indexBufferSha256:o.geometry.index?await hash(o.geometry.index.array):null,matrixWorld:o.matrixWorld.toArray(),baseBufferBoundsUiM:{min:box.min.toArray(),max:box.max.toArray()},boundsAreShaderEvaluated:false});
  }
  const handleEvidence=[];
  for(const[i,h]of [...level.moves,...level.corners].entries()){
   const shaders=[];for(const m of h.body.children)shaders.push({vertexShaderSha256:await hash(new TextEncoder().encode(m.material.vertexShader)),fragmentShaderSha256:await hash(new TextEncoder().encode(m.material.fragmentShader)),defines:structuredClone(m.material.defines),side:m.material.side,premultipliedAlpha:m.material.premultipliedAlpha,depthWrite:m.material.depthWrite});
   handleEvidence.push({id:i<2?'side-'+i:'corner-'+(i-2),worldScale:h.getWorldScale(new THREE.Vector3()).toArray(),bodyMatrixWorld:h.body.matrixWorld.toArray(),hitMatrixWorld:h.hitMeshes[0].matrixWorld.toArray(),baseSizeLocalM:[h.w,h.h,h.t],radiusLocalM:h.r,bodyVisible:visible(h.body),invisibleHitMaterial:h.hitMeshes[0].material.visible===false,numericUniforms:serialUniforms(h.skin),shaders,arrow:h.arrow?{vertices:Array.from(h.arrow.geometry.attributes.position.array),matrixWorld:h.arrow.matrixWorld.toArray(),opacity:h.arrow.material.opacity,visible:visible(h.arrow)}:null});
  }
  levels.push({label:level.item.label,active:p.levels.includes(level),closing:!!level.closing,geometry,handleEvidence,shaderUniforms:serialUniforms(level.panel.skin.uniforms),paneThicknessLocalM:level.panel.t,frontZLocalM:level.panel.frontZ,texts:texts.map(t=>({text:t.text,font:t.font,fontSize:t.fontSize,letterSpacing:t.letterSpacing,visibleBounds:t.textRenderInfo.visibleBounds,blockBounds:t.textRenderInfo.blockBounds,matrixWorld:t.matrixWorld.toArray(),fillOpacity:t.fillOpacity,visible:visible(t)})),icons});
 }
 const root=levels.find(level=>level.label==='Catalog');requireValue(root,'Root evidence missing');
 const png=state?c.pass('beauty'):null;
 const optics=multi?captureMultipointOptics(multi):scenario?null:captureControlOptics({THREE,contour:c,look,state});
 const finalFixture=multi?multi.finish():fixture;
 return {fixture:finalFixture,optics,producerUrls,actualProducerModuleIdentity:true,actualShaderBackdropIdentity:true,noRearHardMask:true,cameraInUiM,cameraQuaternionUi,fovY:c.camera.fov,
  geometry:root.geometry,handleEvidence:root.handleEvidence,rootShaderUniforms:root.shaderUniforms,texts:root.texts,levels,
  readiness:{...readiness(),windowReady:window.ready,rootTextRuns:root.texts.length,icons:root.icons},
  settings:{defaults:structuredClone(DEFAULTS),toneMapping:c.renderer.toneMapping,toneMappingExposure:c.renderer.toneMappingExposure,environmentRotation:c.scene.environmentRotation.toArray(),dpr:c.renderer.getPixelRatio()},
  geometryExport:{status:'unsupported-fail-closed',passed:false,reason:'Base buffers and live shader uniforms only; no evaluated dent/squash/multipoint mesh or Blender equivalent.'},png};
}
