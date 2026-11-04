import * as THREE from 'three';
import { Interactable } from '../core/Interactable.js';
import { paneDentHeight, paneDeformedZ } from '../core/paneDent.js';
import { springTo, prefersReducedMotion } from '../core/spring.js';

// An input surface over the real pane, not another visible affordance.
// The caller supplies the approved start region; back/title input remains
// a separate target. Only WindowControls grants manipulation ownership.
export class WindowSurface extends Interactable {
  constructor(T, panel, contains) {
    super();
    if(typeof contains!=='function') throw new Error('WindowSurface requires an explicit start-region predicate');
    this.T=T; this.panel=panel; this.contains=contains;
    this.trackedPinch=true;
    this.frontZ=panel.t; this.dent={x:0,v:0};this.glow={x:0,v:0};this.spot=new THREE.Vector2();
    this.profile={halfWidth:panel.w/2,halfHeight:panel.h/2,cornerRadius:panel.r,edgeFade:panel.t};
    this.body=panel.body;this.skin=panel.skin;
    this.skin.defines.PANE_MANIPULATION='';this.skin.needsUpdate=true;
    const geometry=panel.body.geometry.clone();
    this.restPositions=geometry.attributes.position.array.slice();
    this.restNormals=geometry.attributes.normal.array.slice();
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    this.restBox=geometry.boundingBox.clone();this.restSphere=geometry.boundingSphere.clone();
    const hit=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({visible:false}));
    this.add(hit);this.hitMeshes=[hit];
    this.sampleMesh=new THREE.Mesh(geometry,hit.material);
    this.sampleRay=new THREE.Raycaster();
  }
  get inputScale(){return Math.abs(this.getWorldScale(new THREE.Vector3()).x);}
  inside(p){return this.contains(p,this.panel);}
  // A non-pinching pointer belongs to content, never this manipulation skin.
  pokeDistance(){return Infinity;}
  // A fingertip has volume: at the outer rim (or while straddling it), its
  // centre can be outside the front silhouette while its skin touches the
  // actual pane. Query nearby mesh triangles, never an expanded box target.
  contactPoint(p,radius){
    if(!(radius>0) || !Number.isFinite(radius) || ![p.x,p.y,p.z].every(Number.isFinite))return null;
    const reach=radius/this.inputScale,g=this.hitMeshes[0].geometry,a=g.attributes.position,idx=g.index;
    const cell=.008;
    if(!this.contactGrid){
      this.contactGrid=new Map();
      const count=idx?idx.count:a.count;
      for(let i=0;i<count;i+=3){
        const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k);
        const xs=ids.map(j=>a.getX(j)),ys=ids.map(j=>a.getY(j));
        for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)
          for(let y=Math.floor(Math.min(...ys)/cell);y<=Math.floor(Math.max(...ys)/cell);y++){
            const key=x+','+y,list=this.contactGrid.get(key)??[];list.push(ids);this.contactGrid.set(key,list);
          }
      }
    }
    const candidates=new Set(),triangle=new THREE.Triangle(),q=new THREE.Vector3();
    for(let x=Math.floor((p.x-reach)/cell);x<=Math.floor((p.x+reach)/cell);x++)
      for(let y=Math.floor((p.y-reach)/cell);y<=Math.floor((p.y+reach)/cell);y++)
        for(const ids of this.contactGrid.get(x+','+y)??[])candidates.add(ids);
    let best=reach+1e-8,point=null;
    for(const ids of candidates){
      triangle.a.fromBufferAttribute(a,ids[0]);triangle.b.fromBufferAttribute(a,ids[1]);triangle.c.fromBufferAttribute(a,ids[2]);
      triangle.closestPointToPoint(p,q);const distance=q.distanceTo(p);
      if(distance<=best && this.inside(q)){best=distance;point=q.clone();}
    }
    return point;
  }
  pinchPoint(p,radius=0){
    if(this.inside(p) && p.z>=paneDentHeight(p.x,p.y,this.profile,this.currentDent)){
      const z=this.surfaceZ(p);if(Number.isFinite(z))return new THREE.Vector3(p.x,p.y,z);
    }
    return this.contactPoint(p,radius);
  }
  pinchDistance(p,radius=0){
    const at=this.pinchPoint(p,radius);
    return at?Math.max(0,p.distanceTo(at)*this.inputScale-radius):Infinity;
  }
  surfaceZ(p){
    // Sample the actual tessellated front, including the bevel. This mesh
    // shares the deformed hit geometry but stays in local coordinates.
    this.sampleRay.set(new THREE.Vector3(p.x,p.y,this.panel.t*2),new THREE.Vector3(0,0,-1));
    const hit=this.sampleRay.intersectObject(this.sampleMesh,false)[0];
    return hit?.point.z ?? Infinity;
  }
  faceDistance(p,radius=0){return Math.max(0,Math.abs(p.z-this.surfaceZ(p))*this.inputScale-radius);}
  acceptRayHit(p){return this.inside(p)&&Math.abs(p.z-this.surfaceZ(p))<=1e-6/this.inputScale;}
  update(dt){
    const probes=this.consumeProbes(),probe=this.grab&&probes.find(q=>q.id===this.grab.id);
    const scale=this.inputScale;
    if(probe){const at=this.grab.localPoint??probe.point;this.spot.set(at.x,at.y);}
    // R14 trial: a 3.5 mm local bend, independent of sheet thickness.
    const limit=Math.min(.0035, this.bendClearanceWorld ?? Infinity)/scale;
    const depth=this.grab ? Math.max(0,limit) : 0;
    springTo(this.dent,depth,.09,prefersReducedMotion()?1:.85,dt);
    springTo(this.glow,this.grab?1:0,.09,prefersReducedMotion()?1:.85,dt);
    // R16 bounded trial: wider bend, same maximum depth and clearance.
    // The optical contribution follows this anchor without adding a ring.
    this.currentDent={x:this.spot.x,y:this.spot.y,radius:.028/scale,depth:Math.min(Math.max(0,limit),Math.max(0,this.dent.x)),
      thin:.35*Math.min(1,Math.max(0,this.glow.x)),frontZ:this.restBox.max.z};
    const d=this.currentDent,u=this.skin.uniforms;
    u.uPaneDent.value.set(d.x,d.y,d.radius,d.depth);
    u.uPaneGlow.value.set(.028/scale,.28*Math.min(1,Math.max(0,this.glow.x)));
    u.uPaneThin.value.set(d.thin,d.frontZ);
    u.uPaneExtent.value.set(this.profile.halfWidth,this.profile.halfHeight,this.profile.cornerRadius);
    u.uPaneEdgeFade.value=this.profile.edgeFade;
    // Same map as GLASS_VERT. Compression is <=35%, so dZ'/dZ>=.65;
    // the front stays on its accepted bend and no skins cross.
    const key=[d.x,d.y,d.radius,d.depth,d.thin].join(',');
    if(key!==this.geometryKey){
      const attr=this.hitMeshes[0].geometry.attributes.position;
      for(let i=0;i<attr.count;i++){
        const j=3*i,x=this.restPositions[j],y=this.restPositions[j+1],z=this.restPositions[j+2];
        attr.setZ(i,paneDeformedZ(x,y,z,this.profile,d));
      }
      attr.needsUpdate=true;this.geometryKey=key;
      // Bend moves -Z and compression moves the back towards the unchanged
      // front. Include positive motion even with zero bend clearance.
      const displacement=Math.max(d.depth,d.thin*(this.restBox.max.z-this.restBox.min.z));
      for(const geometry of [this.hitMeshes[0].geometry,this.body.geometry]){
        geometry.boundingBox??=this.restBox.clone();
        geometry.boundingSphere??=this.restSphere.clone();
        geometry.boundingBox.copy(this.restBox);geometry.boundingBox.min.z-=d.depth;
        geometry.boundingSphere.copy(this.restSphere);geometry.boundingSphere.radius+=displacement;
      }
    }
  }
}
