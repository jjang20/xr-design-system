import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { Interactable, markComponent } from '../../src/core/Interactable.js';
import { Button } from '../../src/components/Button.js';
import { WindowSurface } from '../../src/components/WindowSurface.js';
import { DEFAULTS } from '../../src/core/defaults.js';
import { makeText } from '../../src/core/look.js';

// R04 engineering fixture in world metres at rest, not design-system tokens.
export const MOVEMENT_FIXTURE = Object.freeze({ width:.216, height:.28935, root:1.5,
  capsuleWidth:.080, capsuleHeight:.022, capsuleDepth:.003, gap:.014 });
const DATA = Object.freeze(Array.from({length:5},(_,i)=>`Item ${String(i+1).padStart(2,'0')}`));
const holding=p=>p.kind==='ray'?p.pressed&&p.captured:!!p.pinch;
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const valid=p=>finite(p?.point)&&(p.kind!=='ray'||(finite(p.ray?.origin)&&finite(p.ray?.direction)&&Math.abs(p.ray.direction.z)>1e-8));

class BottomHandle extends Interactable {
  constructor() {
    super();
    const F=MOVEMENT_FIXTURE;
    this.w=F.capsuleWidth/F.root;this.h=F.capsuleHeight/F.root;this.frontZ=F.capsuleDepth/F.root;
    const r=this.h/2,a=this.w/2-r,shape=new THREE.Shape();
    shape.moveTo(-a,-r);shape.lineTo(a,-r);shape.absarc(a,0,r,-Math.PI/2,Math.PI/2,false);
    shape.lineTo(-a,r);shape.absarc(-a,0,r,Math.PI/2,Math.PI*1.5,false);
    this.body=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:this.frontZ,bevelEnabled:false,curveSegments:32}),new THREE.MeshBasicMaterial({color:0xd5e5f5}));
    this.add(this.body);this.hitMeshes=[this.body];this.trackedPinch=true;
  }
  inside(p) {const r=this.h/2;return Math.hypot(Math.max(0,Math.abs(p.x)-(this.w/2-r)),p.y)<=r+1e-9;}
  pinchDistance(p,radius=0) {
    if(!this.inside(p)||p.z<0)return Infinity;
    return Math.max(0,Math.abs(p.z-this.frontZ)*Math.abs(this.getWorldScale(new THREE.Vector3()).z)-radius);
  }
  pokeDistance(p) {return this.pinchDistance(p);}
  acceptRayHit(p) {return this.inside(p)&&Math.abs(p.z-this.frontZ)<1e-6;}
  update() {const probes=this.consumeProbes();this.body.material.color.setHex(this.grab?0x78cfff:probes.length?0xffffff:0xd5e5f5);}
}

class MovementWindow extends THREE.Group {
  constructor(T,kind) {
    super();this.kind=kind;this.owner=null;
    const F=MOVEMENT_FIXTURE,W=F.width/F.root,H=F.height/F.root;
    this.scale.setScalar(F.root);
    if(kind==='contour') {
      this.pane=new Button(T,{width:240,height:H/.0006,radius:DEFAULTS.radius.window,thickness:'regular',thicknessScale:DEFAULTS.windowPreview.thicknessScale,density:'rigid',variant:'glass',distance:.6});
      this.pane.enabled=false;this.pane.isInteractable=false;
      this.target=new WindowSurface(T,this.pane,(p,panel)=>{
        const x=Math.abs(p.x),y=Math.abs(p.y),r=panel.r,qx=x-(panel.w/2-r),qy=y-(panel.h/2-r);
        return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r<=1e-8
          &&x>=panel.w/2-.012/this.target.inputScale;
      });
    } else {
      this.pane=new THREE.Mesh(new THREE.BoxGeometry(W,H,.0016),new THREE.MeshBasicMaterial({color:0x293b50}));this.pane.t=.0016;
      this.target=new BottomHandle();
      this.target.position.set(0,-H/2-F.gap/F.root-this.target.h/2,this.pane.t);
    }
    this.target.retainRayCapture=true;this.target.retainPokeCapture=true;
    markComponent(this.target);this.add(this.pane,this.target);
    this.content=new THREE.Group();this.content.position.z=this.pane.t+.0005;this.add(this.content);
    this.title=makeText('Items',{size:.0189/F.root,weight:700,anchorX:'left'});this.title.anchorY='top';
    this.subtitle=makeText('Move preview',{size:.01116/F.root,anchorX:'left'});this.subtitle.anchorY='top';
    this.title.position.set(-W/2+.0162/F.root,H/2-.0171/F.root,0);
    this.subtitle.position.copy(this.title.position).y-=.02448/F.root;
    this.rows=DATA.map((text,i)=>{const row=makeText(text,{size:.01116/F.root,weight:500,anchorX:'left'});row.position.set(-W/2+.0162/F.root,H/2-.06615/F.root-.0432/F.root*(i+.5),0);return row;});
    this.content.add(this.title,this.subtitle,...this.rows);
    this.label=makeText(kind==='flat'?'Flat window':'Contour window',{size:.015/F.root,weight:600});this.label.position.set(0,H/2+.025/F.root,this.pane.t);this.add(this.label);
    this.texts=[this.title,this.subtitle,...this.rows,this.label];
  }
}

export class WindowMovementComparison extends THREE.Group {
  constructor(T,input) {
    super();this.input=input;this.blocked=new Set();this.windows={flat:new MovementWindow(T,'flat'),contour:new MovementWindow(T,'contour')};
    for(const [i,w] of Object.values(this.windows).entries()){w.position.x=i===0?-.23:.23;w.initialPosition=w.position.clone();this.add(w);}
    this.resetControl=new Button(T,{label:'Reset position',width:150,height:32,distance:.6});this.resetControl.position.set(0,-.30,0);this.add(this.resetControl);
    this.resetControl.addEventListener('select',()=>this.resetPositions());
    this.texts=[...Object.values(this.windows).flatMap(w=>w.texts),this.resetControl.label].filter(Boolean);
    this.releaseListeners=[];
    if(input) {
      const bind=(target,type,source)=>{
        const release=()=>{
          if(source.selecting||source.handPinching)return;
          if(type==='pinchend') {
            const index=source.hand.joints?.['index-finger-tip'],thumb=source.hand.joints?.['thumb-tip'];
            // A cached missing joint can emit pinchend. Only a live open hand
            // is a native release; tracking loss is handled by update instead.
            if(!source.hand.visible||!index?.visible||!thumb?.visible||!finite(index.position)||!finite(thumb.position)||index.position.distanceTo(thumb.position)<=.025)return;
            source.nativePinchBlocked=false;
          }
          const owners=Object.values(this.windows).filter(w=>w.owner?.id===source.id);
          if(owners.length||this.blocked.has(source.id)){source.state={};source.pinchCaptureBlocked=false;source.resetBlocked=false;}
          for(const w of owners)this.cancel(w,false);
          this.blocked.delete(source.id);
        };
        target.addEventListener(type,release);this.releaseListeners.push(()=>target.removeEventListener(type,release));
      };
      bind(input.renderer.domElement.ownerDocument?.defaultView??input.renderer.domElement,'pointerup',input.mouse);
      for(const source of input.xr){
        bind(source.ray,'selectend',source);bind(source.hand,'pinchend',source);
        const changed=()=>{
          for(const w of Object.values(this.windows))if(w.owner?.id===source.id)this.cancel(w,false);
          this.blocked.delete(source.id);
          for(const w of Object.values(this.windows))w.target.probes=w.target.probes.filter(p=>p.id!==source.id);
        };
        source.ray.addEventListener('disconnected',changed);source.ray.addEventListener('connected',changed);
        this.releaseListeners.push(()=>{source.ray.removeEventListener('disconnected',changed);source.ray.removeEventListener('connected',changed);});
      }
      const down=event=>{
        const rect=input.renderer.domElement.getBoundingClientRect();
        input.mouse.ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
        // This fixture has no empty-space camera rotation. A down event at
        // a drawn handle must not depend on a preceding hover render frame.
        input.mouse.looking=false;
      };
      input.renderer.domElement.addEventListener('pointerdown',down);
      this.releaseListeners.push(()=>input.renderer.domElement.removeEventListener('pointerdown',down));
    }
  }
  cancel(w,block=true) {
    if(!w.owner)return;
    if(block)this.blocked.add(w.owner.id);
    const h=w.target;h.grab=null;h.inputCaptureInverse=null;h.continuingOwner=null;w.owner=null;
  }
  update(dt) {
    if(this.disposed)return;
    const windows=Object.values(this.windows);
    for(const w of windows)for(const p of w.target.probes)if(!holding(p))this.blocked.delete(p.id);
    // Process every existing owner before selecting any new owner. A source
    // cannot own both windows; equal-frame ties use source id, then kind name.
    for(const w of windows)if(w.owner) {
      for(const p of w.target.probes)if(holding(p)&&p.id!==w.owner.id)this.blocked.add(p.id);
      const p=w.target.probes.find(p=>p.id===w.owner.id);
      if(!p||!holding(p)||!valid(p)||p.kind!==w.owner.kind||!w.target.enabled)this.cancel(w,!p||holding(p));
    }
    const owned=new Set(windows.filter(w=>w.owner).map(w=>w.owner.id));
    const candidates=windows.filter(w=>!w.owner&&w.target.enabled).flatMap(w=>w.target.probes
      .filter(p=>holding(p)&&valid(p)&&!owned.has(p.id)&&!this.blocked.has(p.id)
        // InputSystem already checked the actual ray/skin intersection. A
        // captured probe is projected onto frontZ, not the bevel's exact Z.
        &&(p.kind==='ray'?w.target.inside(p.point):w.target.pinchDistance(p.point,p.radius)<DEFAULTS.dockRail.handleReach))
      .map(p=>({w,p})));
    candidates.sort((a,b)=>String(a.p.id).localeCompare(String(b.p.id))||a.w.kind.localeCompare(b.w.kind));
    for(const {w,p} of candidates)if(!w.owner&&!owned.has(p.id)) {
      const h=w.target,matrix=h.matrixWorld.clone();
      w.owner={id:p.id,kind:p.kind,matrix,start:p.point.clone().applyMatrix4(matrix),position:w.getWorldPosition(new THREE.Vector3())};
      h.inputCaptureInverse=matrix.clone().invert();h.continuingOwner=p.id;
      h.grab={id:p.id,kind:p.kind==='poke'?'pinch':'ray',localPoint:p.point.clone()};owned.add(p.id);
    }
    for(const w of windows) {
      const o=w.owner,p=o&&w.target.probes.find(p=>p.id===o.id);
      if(o&&valid(p)) {
        const next=p.point.clone().applyMatrix4(o.matrix).sub(o.start).add(o.position);
        w.position.copy(w.parent.worldToLocal(next));w.updateMatrixWorld(true);
      }
      w.target.update(dt);
    }
    this.resetControl.update(dt);
  }
  cancelInput() {
    for(const w of Object.values(this.windows)){this.cancel(w);w.target.consumeProbes();w.target.update(0);}
    this.resetControl.consumeProbes();this.resetControl.update(0);this.resetControl.clearHoverFeedback();
    this.input?.reset();
  }
  resetPositions(){this.cancelInput();for(const w of Object.values(this.windows))w.position.copy(w.initialPosition);this.updateMatrixWorld(true);this.onReset?.();}
  dispose(){if(this.disposed)return;this.disposed=true;for(const unbind of this.releaseListeners)unbind();this.releaseListeners=[];for(const w of Object.values(this.windows))this.cancel(w);const gs=new Set(),ms=new Set();this.traverse(o=>{if(o.isInteractable){o.enabled=false;o.probes=[];}if(o instanceof Text)o.dispose();else if(o.geometry)gs.add(o.geometry);for(const m of[o.material].flat().filter(Boolean))ms.add(m);});for(const g of gs)g.dispose();for(const m of ms)m.dispose();this.removeFromParent();}
}
