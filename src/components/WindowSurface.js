import * as THREE from 'three';
import { Interactable } from '../core/Interactable.js';
import { paneDentHeight } from '../core/paneDent.js';
import { springTo, prefersReducedMotion } from '../core/spring.js';

// An input surface over the real pane, not another visible affordance.
// The caller supplies the approved start region; back/title input remains
// a separate target. Only WindowControls grants manipulation ownership.
export class WindowSurface extends Interactable {
  constructor(T, panel, contains) {
    super();
    if(typeof contains!=='function') throw new Error('WindowSurface requires an explicit start-region predicate');
    this.T=T; this.panel=panel; this.contains=contains;
    this.frontZ=panel.t; this.dent={x:0,v:0};this.spot=new THREE.Vector2();
    this.profile={halfWidth:panel.w/2,halfHeight:panel.h/2,cornerRadius:panel.r,edgeFade:panel.t};
    this.body=panel.body;this.skin=panel.skin;
    this.skin.defines.PANE_MANIPULATION='';this.skin.needsUpdate=true;
    const geometry=panel.body.geometry.clone();
    this.restPositions=geometry.attributes.position.array.slice();
    this.restNormals=geometry.attributes.normal.array.slice();
    const hit=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({visible:false}));
    this.add(hit);this.hitMeshes=[hit];
    this.sampleMesh=new THREE.Mesh(geometry,hit.material);
    this.sampleRay=new THREE.Raycaster();
  }
  get inputScale(){return Math.abs(this.getWorldScale(new THREE.Vector3()).x);}
  inside(p){return this.contains(p,this.panel);}
  // A non-pinching pointer belongs to content, never this manipulation skin.
  pokeDistance(){return Infinity;}
  pinchDistance(p,radius=0){
    if(!this.inside(p)||p.z < 0)return Infinity;
    return this.faceDistance(p,radius);
  }
  surfaceZ(p){
    // Sample the actual tessellated front, including the bevel. This mesh
    // shares the deformed hit geometry but stays in local coordinates.
    this.sampleRay.set(new THREE.Vector3(p.x,p.y,this.panel.t*2),new THREE.Vector3(0,0,-1));
    const hit=this.sampleRay.intersectObject(this.sampleMesh,false)[0];
    return hit?.point.z ?? Infinity;
  }
  faceDistance(p,radius=0){return Math.max(0,Math.abs(p.z-this.surfaceZ(p))*this.inputScale-radius);}
  acceptRayHit(p){return this.inside(p)&&p.z>=0;}
  update(dt){
    const probes=this.consumeProbes(),probe=this.grab&&probes.find(q=>q.id===this.grab.id);
    const scale=this.inputScale;
    if(probe){const at=this.grab.localPoint??probe.point;this.spot.set(at.x,at.y);}
    const depth=this.grab?Math.min(.0015/scale,this.panel.t*.4):0;
    springTo(this.dent,depth,.09,prefersReducedMotion()?1:.85,dt);
    this.currentDent={x:this.spot.x,y:this.spot.y,radius:.018/scale,depth:Math.min(this.panel.t*.4,Math.max(0,this.dent.x))};
    const d=this.currentDent,u=this.skin.uniforms;
    u.uPaneDent.value.set(d.x,d.y,d.radius,d.depth);
    u.uPaneExtent.value.set(this.profile.halfWidth,this.profile.halfHeight,this.profile.cornerRadius);
    u.uPaneEdgeFade.value=this.profile.edgeFade;
    // Same continuous thickness-weighted profile as GLASS_VERT.
    const key=[d.x,d.y,d.radius,d.depth].join(',');
    if(key!==this.geometryKey){
      const attr=this.hitMeshes[0].geometry.attributes.position;
      for(let i=0;i<attr.count;i++){
        const j=3*i,x=this.restPositions[j],y=this.restPositions[j+1],z=this.restPositions[j+2];
        attr.setZ(i,z+paneDentHeight(x,y,this.profile,d)*Math.max(z,0)/this.panel.t);
      }
      attr.needsUpdate=true;this.geometryKey=key;
    }
  }
}
