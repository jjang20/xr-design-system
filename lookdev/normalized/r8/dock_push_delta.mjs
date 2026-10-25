// R8 finite render/geometry diagnostics. No captures are launched by this module.
export const near=(a,b,tolerance=1e-8)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance;
export function assert(value,message){if(!value)throw new Error(message);}

export function pixelCounterfactual({THREE,contour:c,change,restore}) {
  const target=new THREE.WebGLRenderTarget(1600,1000,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType});
  const beforeTarget=c.renderer.getRenderTarget();
  const read=()=>{const bytes=new Uint8Array(1600*1000*4);c.renderer.render(c.scene,c.camera);c.renderer.readRenderTargetPixels(target,0,0,1600,1000,bytes);return bytes;};
  let on,off,again,reference,stabilityMax=0;
  // Fixed warmup for lazy GPU/environment setup. The extra unchanged read is
  // a control, not an adaptive search or a different acceptance threshold.
  try{c.renderer.setRenderTarget(target);read();read();reference=read();on=read();change();off=read();restore();again=read();}
  finally{try{restore();}finally{c.renderer.setRenderTarget(beforeTarget);target.dispose();}}
  let changed=0,maxDifference=0,alphaChanged=0,maxAlphaDifference=0,restorationMax=0;
  for(let i=0;i<on.length;i+=4){
    const delta=Math.max(...[0,1,2].map(k=>Math.abs(on[i+k]-off[i+k])));
    if(delta>=2)changed++;maxDifference=Math.max(maxDifference,delta);
    const alpha=Math.abs(on[i+3]-off[i+3]);if(alpha>=2)alphaChanged++;maxAlphaDifference=Math.max(maxAlphaDifference,alpha);
    for(let k=0;k<4;k++){restorationMax=Math.max(restorationMax,Math.abs(on[i+k]-again[i+k]));stabilityMax=Math.max(stabilityMax,Math.abs(reference[i+k]-on[i+k]));}
  }
  assert(stabilityMax===0,'Unchanged RGBA control is unstable after fixed warmup');
  return {method:'Same-scene explicit RGBA8 target; two fixed warmup frames, unchanged control, one changed quantity, exact restoration',changed,maxDifference,alphaChanged,maxAlphaDifference,restorationMax,stabilityMax,physicalOpticalEquivalence:false};
}

export function geometryCounterfactual(dock,change,restore,{centre=null}={}){
  const read=()=>Array.from(dock.base.geometry.attributes.position.array);
  const on=read();let off,again;
  try{change();dock.layout();off=read();restore();dock.layout();again=read();}
  finally{restore();dock.layout();}
  assert(on.length===off.length&&on.length===again.length,'Geometry diagnostic topology changed');
  let changedCoordinates=0,maxCoordinateM=0,restorationMaxM=0;
  for(let i=0;i<on.length;i++){
    const delta=Math.abs(on[i]-off[i]);if(delta>1e-7)changedCoordinates++;
    maxCoordinateM=Math.max(maxCoordinateM,delta);restorationMaxM=Math.max(restorationMaxM,Math.abs(on[i]-again[i]));
  }
  let maxXZDifferenceM=0;const halfDepthRadii=[];
  for(let i=0;i<on.length;i+=3){
    maxXZDifferenceM=Math.max(maxXZDifferenceM,Math.abs(on[i]-off[i]),Math.abs(on[i+2]-off[i+2]));
    if(centre&&off[i+1]-on[i+1]>maxCoordinateM*.5)halfDepthRadii.push(Math.hypot(off[i]-centre.x,off[i+2]-centre.z));
  }
  return {changedCoordinates,maxCoordinateM,restorationMaxM,maxXZDifferenceM,
    halfDepthVertices:halfDepthRadii.length,halfDepthRadiusM:halfDepthRadii.length?Math.max(...halfDepthRadii):null,
    method:'Actual CPU mesh positions with only physical dent disabled; same layout/swell restored'};
}

export function inspectCapOrdering(dock){
  const shape=dock.shelfShape,F=shape.flatP,FN=shape.flatN,now=shape.geometry.attributes.position.array;
  const groups=new Map();
  for(let i=0;i<F.length;i+=3){const key=F[i]+','+F[i+2];let group=groups.get(key);if(!group)groups.set(key,group={top:[],bottom:[]});if(FN[i+1]>.0001)group.top.push(i);if(FN[i+1]<-.0001)group.bottom.push(i);}
  let pairs=0,reversed=0,maxCrossM=0,minGapM=Infinity;
  for(const group of groups.values()){
    if(!group.top.length||!group.bottom.length)continue;pairs++;
    const topY=Math.min(...group.top.map(i=>now[i+1])),bottomY=Math.max(...group.bottom.map(i=>now[i+1])),cross=bottomY-topY;
    if(cross>1e-6)reversed++;maxCrossM=Math.max(maxCrossM,cross);minGapM=Math.min(minGapM,topY-bottomY);
  }
  return {pairs,reversed,maxCrossM,minGapM,allFinite:[...now,...shape.geometry.attributes.normal.array].every(Number.isFinite),method:'Paired actual CPU top/underside vertices with identical rest XZ under live input'};
}

export function inspectSphereWell(THREE,handle){
  const u=handle.skin,mesh=handle.body.children[0].geometry.attributes.position;
  const targets=[new THREE.Vector3(0,0,1),new THREE.Vector3(-Math.sin(Math.PI/12),0,Math.cos(Math.PI/12)),new THREE.Vector3(Math.sin(Math.PI/12),0,Math.cos(Math.PI/12))];
  const selected=targets.map(wanted=>{
    let p,nearest=Infinity,index=-1;
    for(let i=0;i<mesh.count;i++){const v=new THREE.Vector3().fromBufferAttribute(mesh,i).normalize(),distance=v.distanceToSquared(wanted);if(distance<nearest){p=v;nearest=distance;index=i;}}
    assert(nearest<1e-10,'Sphere diagnostic sample is not an actual mesh vertex');return {p,index,nearest};
  });
  const evaluate=()=>{
    const dent=new THREE.Vector3(u.uDent.value.x,u.uDent.value.y,u.uDent.value.z);
    const points=selected.map(({p})=>{const q=p.clone().sub(dent),e=Math.exp(-q.lengthSq()/(u.uDentWidth.value**2));const pos=p.clone().multiplyScalar(1-u.uDent.value.w*e),along=dent.clone().multiplyScalar(pos.dot(dent)),transverse=pos.clone().sub(along);pos.addScaledVector(along,-u.uSquash.value).addScaledVector(transverse,u.uSquash.value*.5);pos.y=Math.max(-1,pos.y);return pos.multiplyScalar(handle.r*handle.inputScale);});
    return {pointsM:points.map(p=>p.toArray()),concavityM:(points[1].z+points[2].z)/2-points[0].z};
  };
  const saved=u.uDent.value.w,on=evaluate();let off,again;
  try{u.uDent.value.w=0;off=evaluate();u.uDent.value.w=saved;again=evaluate();}finally{u.uDent.value.w=saved;}
  return {on,off,restorationMaxM:Math.max(...on.pointsM.flat().map((v,i)=>Math.abs(v-again.pointsM.flat()[i]))),vertices:selected.map(({index,nearest})=>({index,nearest})),widthM:u.uDentWidth.value*handle.r*handle.inputScale,physicalDepthM:handle.dent.x*handle.inputScale,squash:u.uSquash.value,
    method:'CPU product vertex equation with actual mesh samples and live uniforms; GPU contribution measured separately',gpuVertexReadback:false};
}

export function inspectPlateGeometry(THREE,dock){
  dock.updateMatrixWorld(true);dock.base.geometry.computeBoundingBox();
  const bounds=dock.base.geometry.boundingBox,extent=bounds.getSize(new THREE.Vector3()).toArray();
  const shape=dock.shelfShape,half=shape.depth/2;
  const profile=[0,.1,.3,.65,1].map(t=>({inset:t*half,top:shape.top(t*half),bottom:shape.bottom(t*half)}));
  const ray=new THREE.Raycaster(),samples=[];
  // Fixed 48 samples on both rounded ends; no adaptive camera or threshold search.
  for(const side of [-1,1])for(const padFraction of [.05,.15,.3,.5,.75,.95])for(const depthFraction of [0,.5,.8,.95]){
    const s=side*(dock.length/2-dock.pad*padFraction),t=half*dock.neck*dock.size*depthFraction;
    const[x,z]=dock.arc(s,t),point=new THREE.Vector3(x,.05,z),analytic=dock.plateSample(point);
    ray.set(dock.shelf.localToWorld(point.clone()),new THREE.Vector3(0,-1,0).transformDirection(dock.shelf.matrixWorld));
    const hit=ray.intersectObject(dock.base,false)[0],meshY=hit?dock.shelf.worldToLocal(hit.point.clone()).y:null;
    samples.push({side,padFraction,depthFraction,inside:analytic.inside,analyticY:analytic.front,meshY,errorM:meshY===null?null:Math.abs(meshY-analytic.front)});
  }
  assert(samples.some(s=>s.inside&&s.meshY!==null),'No inside geometry samples');
  return {profile,extentLocalM:extent,nominalThicknessM:dock.thick,padM:dock.pad,lengthM:dock.length,sideM:dock.side,pitchM:dock.pitch,
    edgeM:shape.edge,underM:shape.under,flatCentreDifferenceM:Math.abs(shape.top(half)-shape.top(.65*half)),samples,
    maximumInsideErrorM:Math.max(...samples.filter(s=>s.inside&&s.meshY!==null).map(s=>s.errorM)),falseInside:samples.filter(s=>s.inside&&s.meshY===null).length};
}
