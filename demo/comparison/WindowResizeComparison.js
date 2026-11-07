import * as THREE from 'three';
import { Interactable, markComponent } from '../../src/core/Interactable.js';
import { BubbleHandle } from '../../src/components/BubbleHandle.js';
import { Button } from '../../src/components/Button.js';
import { DEFAULTS } from '../../src/core/defaults.js';
import { makeText } from '../../src/core/look.js';

// R02 engineering fixture, not a public token or general window contract.
export const RESIZE_FIXTURE = Object.freeze({ width: .216, height: .28935, pitch: .0432,
  header: .07335, title: .0189, subtitle: .01116, min: 1, max: 22 / 15, exponent: .6, root: 1.5 });
const DATA = Object.freeze(Array.from({ length: 8 }, (_, i) => Object.freeze({ id: `item-${String(i + 1).padStart(2, '0')}`, label: `Item ${String(i + 1).padStart(2, '0')}` })));
const holding = p => p.kind === 'ray' ? p.pressed && p.captured : p.pinch;
const finitePoint = p => p && [p.x, p.y, p.z].every(Number.isFinite);

class FlatCorner extends Interactable {
  constructor() {
    super(); this.w = .0192; this.frontZ = .0016;
    this.body = new THREE.Mesh(new THREE.BoxGeometry(this.w, this.w, this.frontZ), new THREE.MeshBasicMaterial({ color: 0xd5e5f5 }));
    this.add(this.body); this.hitMeshes = [this.body];
    const points = [[-.005,-.005],[.005,.005],[-.005,-.005],[-.005,0],[-.005,-.005],[0,-.005],[.005,.005],[0,.005],[.005,.005],[.005,0]];
    this.arrow = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points.map(([x,y]) => new THREE.Vector3(x,y,.002))), new THREE.LineBasicMaterial({color:0x152234}));
    this.add(this.arrow);
  }
  inside(p) { return Math.abs(p.x) <= this.w / 2 && Math.abs(p.y) <= this.w / 2; }
  faceDistance(p, radius = 0) { return Math.max(0, Math.hypot(Math.max(0,Math.abs(p.x)-this.w/2),Math.max(0,Math.abs(p.y)-this.w/2),p.z-this.frontZ) * this.getWorldScale(new THREE.Vector3()).x - radius); }
  pokeDistance(p) { return this.faceDistance(p); }
  update() {
    const probes = this.consumeProbes();
    this.body.material.color.setHex(this.grab ? 0x78cfff : probes.length ? 0xffffff : 0xd5e5f5);
  }
}

class ReadOnlyWindow extends THREE.Group {
  constructor(T, kind) {
    super(); this.kind = kind; this.q = 1; this.owner = null; this.dataset = DATA;
    const F = RESIZE_FIXTURE, W = F.width / F.root, H = F.height / F.root;
    if (kind === 'contour') {
      this.pane = new Button(T, { width: 240, height: H / .0006, radius: DEFAULTS.radius.window, thickness: 'regular', thicknessScale: DEFAULTS.windowPreview.thicknessScale, density: 'rigid', variant: 'glass', distance: .6 });
      this.pane.enabled = false; this.pane.isInteractable = false;
    } else {
      this.pane = markComponent(new THREE.Mesh(new THREE.BoxGeometry(W, H, .0016), new THREE.MeshBasicMaterial({ color: 0x293b50 })));
      this.pane.t = .0016;
    }
    this.add(this.pane);
    this.handles = [-1, 1].map(side => {
      const h = kind === 'contour' ? new BubbleHandle(T, { width:32, distance:.6, reveal:false, resize:true, feedback:{ controlShape:true, followInput:true } }) : new FlatCorner();
      h.position.set(side * (W/2 + h.w/2 + .0048), -H/2, this.pane.t);
      h.arrow.scale.x = side; h.retainRayCapture = true; h.retainPokeCapture = true; markComponent(h);
      this.add(h); return h;
    });
    this.content = new THREE.Group(); this.add(this.content);
    this.title = makeText('Items', { size:F.title/F.root, weight:700, anchorX:'left' }); this.title.anchorY='top';
    this.subtitle = makeText('Resize preview', { size:F.subtitle/F.root, anchorX:'left' }); this.subtitle.anchorY='top';
    this.content.add(this.title,this.subtitle);
    this.rows = DATA.map(item => {
      const text = makeText(item.label, { size:.01116/F.root, weight:500, anchorX:'left' });
      this.content.add(text); return { ...item, text };
    });
    this.texts = [this.title,this.subtitle,...this.rows.map(r=>r.text)];
    this.setSize(1);
  }
  setSize(value) {
    if (!Number.isFinite(value)) return;
    this.q = THREE.MathUtils.clamp(value, RESIZE_FIXTURE.min, RESIZE_FIXTURE.max);
    this.scale.setScalar(RESIZE_FIXTURE.root*this.q);
    this.layout(); this.updateMatrixWorld(true);
  }
  layout() {
    const F=RESIZE_FIXTURE, g=this.q**F.exponent, s=g/this.q;
    this.content.scale.setScalar(s);
    // Physical local pane/hit geometry stays fixed. Only this non-input node
    // compensates the outer scale, so its world metric grows by g.
    const halfW=F.width/F.root/2/s, halfH=F.height/F.root/2/s;
    const padX=.0162/F.root, topPad=.0171/F.root, bottomPad=.0072/F.root;
    const pitch=F.pitch/F.root, header=F.header/F.root;
    this.content.position.z=this.pane.t+.0005;
    this.title.position.set(-halfW+padX,halfH-topPad,0);
    this.subtitle.position.set(-halfW+padX,halfH-topPad-.02448/F.root,0);
    const viewport={left:-halfW+padX,right:halfW-padX,top:halfH-(header-bottomPad),bottom:-halfH+bottomPad};
    const bounds = text => {
      const info=text.textRenderInfo, b=info?.blockBounds;
      if (info?.parameters.text !== text.text || !b || !Array.from(b).every(Number.isFinite)) return null;
      return {left:text.position.x+b[0],bottom:text.position.y+b[1],right:text.position.x+b[2],top:text.position.y+b[3]};
    };
    const inside=(b,v)=>b && b.left>=v.left-1e-7 && b.right<=v.right+1e-7 && b.bottom>=v.bottom-1e-7 && b.top<=v.top+1e-7;
    const rows=this.rows.map((row,i)=>{
      row.text.position.set(viewport.left,viewport.top-pitch*(i+.5),0);
      const rect={left:viewport.left,right:viewport.right,top:viewport.top-pitch*i,bottom:viewport.top-pitch*(i+1)}, glyph=bounds(row.text);
      const horizontalOverflow=!!glyph && (glyph.left<viewport.left-1e-7 || glyph.right>viewport.right+1e-7);
      const full=!!inside(rect,viewport)&&!!inside(glyph,rect);
      row.text.visible=full;
      return {id:row.id,rect,glyph,full,horizontalOverflow,partial:false};
    });
    const headerViewport={left:viewport.left,right:viewport.right,top:halfH,bottom:viewport.top};
    this.result={q:this.q,g,width:F.width*this.q,height:F.height*this.q,titleSize:F.title*g,subtitleSize:F.subtitle*g,pitch:F.pitch*g,
      viewport,units:'content-local metres; world length factor=1.5*g',rows,
      textReady:rows.every(r=>r.glyph)&&!!bounds(this.title)&&!!bounds(this.subtitle),
      headerFits:!!inside(bounds(this.title),headerViewport)&&!!inside(bounds(this.subtitle),headerViewport),
      fullVisibleIds:rows.filter(r=>r.full).map(r=>r.id),hiddenIds:rows.filter(r=>!r.full).map(r=>r.id),partial:false,
      horizontalOverflow:rows.some(r=>r.horizontalOverflow)};
  }
}

export class WindowResizeComparison extends THREE.Group {
  constructor(T, input) {
    super(); this.windows={flat:new ReadOnlyWindow(T,'flat'),contour:new ReadOnlyWindow(T,'contour')}; this.blocked=new Set();
    this.labels=[];
    for (const [i,[key,w]] of Object.entries(this.windows).entries()) {
      w.position.x=i===0?-.23:.23;this.add(w);
      const label=makeText(key==='flat'?'Flat window':'Contour window',{size:.015,weight:600});label.position.set(w.position.x,.265,0);this.add(label);this.labels.push(label);
    }
    this.resetControl=new Button(T,{label:'Reset size',width:120,height:32,distance:.6});this.resetControl.position.set(0,-.34,0);this.add(this.resetControl);
    this.resetControl.addEventListener('select',()=>this.resetSizes());
    this.texts=[...Object.values(this.windows).flatMap(w=>w.texts),...this.labels,this.resetControl.label].filter(Boolean);
    this.updateMatrixWorld(true);
    // Release is a source event even when the ray no longer hits a control.
    // Pose loss/cancel/reset do not count as release and cannot rearm a hold.
    this.releaseListeners=[];
    if(input) {
      const bind=(target,type,source)=>{
        const release=()=>{
          const owners=Object.values(this.windows).filter(w=>w.owner?.id===source.id);
          // A release and new press can happen between rendered frames. Clear
          // this fixture's stale capture without discarding unrelated clicks.
          if(owners.length||this.blocked.has(source.id)) {
            source.state={};source.pinchCaptureBlocked=false;
          }
          source.resetBlocked=false;
          for(const w of owners)this.cancel(w,false);
          this.blocked.delete(source.id);
        };
        target.addEventListener(type,release);this.releaseListeners.push(()=>target.removeEventListener(type,release));
      };
      bind(input.renderer.domElement.ownerDocument?.defaultView??input.renderer.domElement,'pointerup',input.mouse);
      for(const source of input.xr)bind(source.ray,'selectend',source);
    }
  }
  cancel(w, block=true) {
    if (!w.owner) return;
    const h=w.owner.handle;
    if (block) this.blocked.add(w.owner.id);
    h.grab=null;h.inputCaptureInverse=null;h.continuingOwner=null;w.owner=null;
  }
  resetSizes() {
    for (const w of Object.values(this.windows)) {this.cancel(w);w.setSize(1);for(const h of w.handles){h.probes=[];h.update(0);}}
    this.onReset?.();
  }
  update(dt) {
    const entries=Object.values(this.windows).flatMap(w=>w.handles.map(h=>({w,h})));
    for (const {h} of entries) for(const p of h.probes) if(!holding(p))this.blocked.delete(p.id);
    const owned=new Set(Object.values(this.windows).filter(w=>w.owner).map(w=>w.owner.id));
    for(const w of Object.values(this.windows)) {
      if(w.owner) for(const h of w.handles) for(const p of h.probes) {
        if(holding(p) && p.id!==w.owner.id)this.blocked.add(p.id);
      }
      let o=w.owner, probe=o?.handle.probes.find(p=>p.id===o.id);
      if(o && (!probe || !holding(probe) || !o.handle.enabled)) {this.cancel(w, !probe || holding(probe));o=null;}
      if(!o) {
        const candidates=w.handles.filter(h=>h.enabled).flatMap(h=>h.probes.filter(p=>holding(p)&&finitePoint(p.point)&&!owned.has(p.id)&&!this.blocked.has(p.id)
          &&h.inside(p.point,p.kind==='poke')&&(p.kind==='ray'||h.faceDistance(p.point,p.radius)<=DEFAULTS.dockRail.handleReach)).map(p=>({h,p})));
        candidates.sort((a,b)=>String(a.p.id).localeCompare(String(b.p.id))||w.handles.indexOf(a.h)-w.handles.indexOf(b.h));
        if(candidates.length) {
          const {h,p}=candidates[0], matrix=h.matrixWorld.clone(), point=p.point.clone().applyMatrix4(matrix);
          const centre=w.getWorldPosition(new THREE.Vector3());
          const normal=new THREE.Vector3(0,0,1).transformDirection(w.matrixWorld);
          const axis=h.getWorldPosition(new THREE.Vector3()).sub(centre).projectOnPlane(normal),extent=axis.length();
          o=w.owner={id:p.id,handle:h,kind:p.kind,start:point,q:w.q,matrix,axis:axis.normalize(),extent};
          h.inputCaptureInverse=matrix.clone().invert();h.continuingOwner=p.id;h.grab={id:p.id,kind:p.kind==='poke'?'pinch':p.kind};owned.add(p.id);probe=p;
        }
      }
      if(o && finitePoint(probe?.point)) {
        const point=probe.point.clone().applyMatrix4(o.matrix),factor=1+point.sub(o.start).dot(o.axis)/o.extent;
        w.setSize(o.q*factor);
      }
      for(const h of w.handles)h.update(dt);
      w.layout();w.updateMatrixWorld(true);
    }
    this.resetControl.update(dt);
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    for(const unbind of this.releaseListeners)unbind();this.releaseListeners=[];
    for(const w of Object.values(this.windows))this.cancel(w);
    const geometries=new Set(),materials=new Set();
    this.traverse(o=>{if(o.isInteractable){o.enabled=false;o.probes=[];}if(o.dispose&&o!==this&&o.isTroikaText)o.dispose();if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))materials.add(m);});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();this.removeFromParent();
  }
}
