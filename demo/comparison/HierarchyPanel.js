import * as THREE from 'three';
import {Text} from 'troika-three-text';
import {PackagingPanel} from '../../src/components/PackagingPanel.js';
import {PlanarAction} from './PlanarAction.js';
import {makeText,setGroupOpacity} from '../../src/core/look.js';

// Local catalog view. Retain Packaging's original-parent selection queue,
// continuing-owner exception, compress material and supported hand Push.
export class HierarchyPanel extends PackagingPanel {
  get flat(){return this.mode==='replace';}
  levelLayout(item){return {...super.levelLayout(item),H:.20};}
  buildLevel(item,index){
    const l=super.buildLevel(item,index);(this.ownedLevels??=new Set()).add(l);
    // Movement/resize are outside this fixture; their original source stays.
    l.surface.enabled=false;
    l.corners.forEach(h=>{h.enabled=false;h.visible=false;});
    if(this.flat){
      l.listOpacity?.dispose();l.listOpacity=null;
      l.panel.body.visible=false;
      l.flatPane=new THREE.Mesh(new THREE.PlaneGeometry(l.size.W,l.size.H),new THREE.MeshBasicMaterial({color:0x173449}));
      l.flatPane.renderOrder=1;l.flatPane.position.z=l.panel.t;l.group.add(l.flatPane);
      for(const row of l.rows){
        row.body.visible=false;if(row.fx)row.fx.visible=false;
        row.flatFace=new THREE.Mesh(new THREE.PlaneGeometry(row.w,row.h),new THREE.MeshBasicMaterial({color:0x29465b}));
        row.flatFace.renderOrder=2;row.flatFace.position.z=row.t;row.add(row.flatFace);row.hitMeshes=[row.flatFace];
        row.surfaceZ=()=>row.t;row.layoutFront=()=>{row.face.position.z=row.t;};
        // Contact geometry matches the drawn finite rectangular list row.
        row.baseSurfaceOffset=()=>0;
      }
      if(index>0){
        l.backControl=new PlanarAction(this.T,{label:'Back',width:100,height:32,distance:this.distance,thickness:'thin'});
        l.backControl.plane.renderOrder=2;l.backControl.position.set(0,-.087,l.panel.t);l.group.add(l.backControl);
        l.backControl.addEventListener('select',()=>this.back(index-1));
      }
    }
    if(item.category){
      const values=item.sublabel.split(' × ').map(v=>parseFloat(v));
      const scale=Math.min(.097/values[0],.075/values[1]);
      const width=values[0]*scale,height=values[1]*scale;
      const add=(text,y,size)=>{const t=makeText(text,{size,anchorX:'left'});t.position.set(-.0612,y,l.panel.t+.0008);l.group.add(t);return t;};
      l.detail={id:item.id,name:item.label,category:item.category,dimensions:item.sublabel,caption:'Demo catalog',footprint:{width,height,widthCm:values[0],depthCm:values[1],metresPerCm:scale}};
      l.detailTexts=[add(item.category,.058,.0084),add(item.sublabel,.038,.0102),add('Demo catalog',-.063,.0084)];
      l.footprint=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({color:0x9bd4df,transparent:true,depthWrite:false}));
      l.footprint.renderOrder=3; // Foreground, after the pane/transparent skin; retain depth testing.
      l.footprint.position.set(0,-.012,l.panel.t+.0008);l.group.add(l.footprint);
    }
    return l;
  }
  runSelection(request){
    if(request.canOpen){super.runSelection(request);return;}
    if(!this.levels.includes(request.parent)||request.parent.closing||this.palmPush||this.controls.held)return;
    // Queue before emitting: an explicit Back/Reset in a callback clears it.
    (this.detailRequests??=[]).push(request);
    super.runSelection(request);
  }
  cancelSelections(){this.detailRequests=[];super.cancelSelections();}
  rowCoveredByClosing(row,level){
    // Treat any overlap with an in-front departing pane as covered. Back
    // titles remain separate and existing captured owners keep their claim.
    row.updateWorldMatrix(true,false);
    return this.closing.some(closing=>{
      if(closing.depth<=level.depth||!closing.group.visible)return false;
      closing.group.updateWorldMatrix(true,false);
      const corners=[-1,1].flatMap(x=>[-1,1].map(y=>closing.group.worldToLocal(row.localToWorld(new THREE.Vector3(x*row.w/2,y*row.h/2,row.surfaceZ(new THREE.Vector3()))))));
      return Math.max(...corners.map(p=>p.z))<closing.panel.t &&
        Math.min(...corners.map(p=>p.x))<closing.size.W/2 && Math.max(...corners.map(p=>p.x))>-closing.size.W/2 &&
        Math.min(...corners.map(p=>p.y))<closing.size.H/2 && Math.max(...corners.map(p=>p.y))>-closing.size.H/2;
    });
  }
  applyInputGates(){
    super.applyInputGates();
    for(const l of this.stack.all){
      l.surface.enabled=false;l.corners.forEach(h=>{h.enabled=false;h.visible=false;});
      if(this.flat)l.panel.enabled=false;
      else for(const row of l.rows)if(!row.press.pressed&&this.rowCoveredByClosing(row,l))row.enabled=false;
      if(l.backControl)l.backControl.enabled=l===this.levels.at(-1)&&!l.closing;
    }
  }
  palmDistance(probe){return this.flat?Infinity:super.palmDistance(probe);}
  palmBlocks(probe){return !this.flat&&super.palmBlocks(probe);}
  update(dt){
    const before=[...this.stack.all];
    super.update(dt);
    const requests=this.detailRequests??[];this.detailRequests=[];
    for(const request of requests){
      const parentIndex=this.levels.indexOf(request.parent);
      if(parentIndex<0||request.parent.closing)continue;
      // Previous valid callbacks stay observable, but only the final child
      // remains. Never append to the last opened sibling's detail.
      if(this.active>parentIndex)super.back(parentIndex,{preserveClaims:true});
      this.open(request.child,request.row);
    }
    for(const l of this.stack.all){
      l.backControl?.update(dt);
      l.corners.forEach(h=>{h.enabled=false;h.visible=false;});
      if(this.flat){
        // Flat is same-pane replacement, not a second stack animation.
        const visible=l===this.levels.at(-1)&&!l.closing;
        l.group.position.set(0,0,0);l.group.scale.setScalar(1);
        Object.assign(l.cur,{x:0,y:0,z:0,sx:1,sy:1,opacity:visible?1:0});
        setGroupOpacity(l.group,visible?1:0,0,0);
        // Keep an already captured rear owner in the input graph, without
        // drawing its old page. Fresh rear acquisition stays disabled.
        l.group.visible=true;
        l.panel.body.visible=false;
        if(l.backControl){l.backControl.body.visible=false;if(l.backControl.fx)l.backControl.fx.visible=false;}
        for(const row of l.rows){
          if(row.continuingOwner)row.visible=true;
          row.body.visible=false;if(row.fx)row.fx.visible=false;
          row.flatFace.material.color.set(row.press.pressed?0x3565a1:row.hovered?0x49687c:0x29465b);
        }
        l.corners.forEach(h=>{h.enabled=false;h.visible=false;});
      }
    }
    for(const l of before)if(!this.stack.all.includes(l))this.disposeLevel(l);
    this.applyInputGates();
  }
  resetToRoot(){
    this.resetInteraction();
    for(const l of [...this.stack.all])this.disposeLevel(l);
    this.stack.levels=[];this.stack.closing=[];
    this.open({label:'Catalog',items:this.rootItems},null);
  }
  disposeLevel(l){
    if(!this.ownedLevels.delete(l))return;
    l.listOpacity?.dispose();
    const geometry=new Set(),material=new Set();
    l.group.traverse(o=>{if(o instanceof Text)o.dispose();if(o.geometry)geometry.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))material.add(m);});
    geometry.forEach(g=>g.dispose());material.forEach(m=>m.dispose());l.group.removeFromParent();
  }
  dispose(){for(const l of [...this.ownedLevels])this.disposeLevel(l);this.removeFromParent();}
}
