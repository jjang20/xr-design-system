import * as THREE from 'three';

// CPU mirror of the material vertex path, for geometry invariants only.
// Actual rendered readability is checked by regress-soft-sphere.mjs.
export function evaluateBubbleVertex(h, wanted) {
  const a=h.body.children[0].geometry.attributes.position,u=h.skin;
  let p,nearest=Infinity;
  for(let i=0;i<a.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(a,i).normalize(),dd=v.distanceToSquared(wanted);
    if(dd<nearest){p=v;nearest=dd;}
  }
  const map=(dent,secondary)=>{
    const at=new THREE.Vector3(dent.x,dent.y,dent.z);
    if(!h.softShape)return{at,depth:dent.w};
    const radius=secondary?h.softShape.radiusAt(at):1;
    const target=at.multiplyScalar(radius-dent.w).sub(u.uShapeOffset.value).applyMatrix3(u.uShapeInverse.value);
    return{at:target.clone().normalize(),depth:Math.max(0,Math.min(.75,1-target.length()))};
  };
  const dents=[map(u.uDent.value,false),...u.uExtraDent.value.slice(0,u.uExtraCount.value).map(d=>map(d,true))];
  const width=u.uDentWidth.value*(h.softShape ? .6 : 1);
  const depth=Math.max(...dents.map(d=>d.depth*Math.exp(-p.distanceToSquared(d.at)/(width**2))));
  const pos=p.clone().multiplyScalar(1-depth);
  if(h.softShape)pos.applyMatrix3(u.uShape.value).add(u.uShapeOffset.value);
  else{
    const d=dents[0].at,along=d.clone().multiplyScalar(pos.dot(d)),transverse=pos.clone().sub(along);
    pos.addScaledVector(along,-u.uSquash.value).addScaledVector(transverse,u.uSquash.value*.5);
    pos.y=Math.max(-1,pos.y);
  }
  return pos.multiplyScalar(h.r*h.inputScale);
}
