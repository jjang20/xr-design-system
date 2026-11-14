import * as THREE from 'three';
import {Dock} from '../../src/components/Dock.js';
import {Button} from '../../src/components/Button.js';
import {makeText} from '../../src/core/look.js';
import {DockContentInput} from './DockContentInput.js';
import {DockContentPane,DockFlatAction,dockContent,disposeContentGroup} from './DockContentPane.js';

export const DOCK_APPS=[
  {id:'planner',label:'Planner',icon:'house',color:0x2f7cf6,running:true},
  {id:'measure',label:'Measure',icon:'ruler',color:0xe08a1e},
  {id:'scan',label:'Scan',icon:'scan',color:0x23a26d},
  {id:'photos',label:'Photos',icon:'image',color:0xd9455f},
  {id:'settings',label:'Settings',icon:'settings',color:0x6b6f78},
  {id:'notes',label:'Notes',icon:'notes',color:0xf7d046},
  {id:'clock',label:'Clock',icon:'clock',color:0x3f8fd8},
];
export class DockContentComparison extends THREE.Group {
  constructor(T,input=null,options={}){
    super();this.input=input;this.options=options;this.sides={};this.pending=[];
    this.referenceHead=new THREE.Object3D();this.referenceHead.position.set(0,0,.4);this.referenceHead.updateMatrixWorld();
    for(const [key,sign]of [['flat',-1],['contour',1]]){
      const group=new THREE.Group();group.position.x=sign*.32;this.add(group);
      const side=this.sides[key]={group,content:null};
      side.pane=new DockContentPane(T,options.photoTexture);side.pane.position.y=.065;group.add(side.pane);
      side.pane.back.addEventListener('select',()=>this.pending.push({side:key,close:true}));
      if(key==='contour'){
        side.dock=new Dock(T,{apps:DOCK_APPS.map(a=>({...a})),distance:.4});group.add(side.dock);side.dock.scale.setScalar(1.5);
        this.objectTextures=new Set();for(const icon of side.dock.icons)icon.object.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))for(const value of Object.values(m))if(value?.isCanvasTexture)this.objectTextures.add(value);});
        // Fixed fixture reference; manipulation and head-follow are outside
        // this selection slice. Original DockRail/source remain unchanged.
        side.dock.rail.initial={radius:.4,height:-.29};side.dock.rail.reset();
        side.dock.shelf.enabled=false;side.dock.handle.enabled=false;
        side.targets=side.dock.icons;
        side.dock.addEventListener('select',e=>this.choose(key,e.app));
      }else{
        side.targets=DOCK_APPS.map((app,i)=>{
          const target=new DockFlatAction(T,{label:app.label,width:90,height:56,distance:.6,thickness:'thin'});
          target.label.fontSize=.012;target.label.sync();
          target.position.set((i-3)*.074,-.26,0);group.add(target);
          target.addEventListener('select',()=>this.choose(key,app));return target;
        });
      }
      const heading=makeText(key==='flat'?'Flat app row':'Contour Dock',{size:.019});heading.position.y=.29;group.add(heading);
    }
    this.resetControl=new Button(T,{label:'Reset',width:110,distance:.6});this.resetControl.position.y=-.5;this.add(this.resetControl);
    this.resetControl.label.fontSize=.012;this.resetControl.label.sync();
    this.resetControl.addEventListener('select',()=>{this.resetRequested=true;});
    this.router=new DockContentInput(input,()=>this.targets,dt=>this.update(dt));
    this.update(0);
    const s=this.sides.contour;for(const [i,app]of DOCK_APPS.entries()){const caption=makeText(app.label,{size:.012});caption.position.set(s.dock.icons[i].position.x*1.5,-.35,.01);caption.userData.dockCaption=true;s.group.add(caption);}
  }
  get targets(){return [...Object.values(this.sides).flatMap(s=>[...s.targets,s.pane.back]),this.resetControl];}
  choose(side,app){
    if(this.disposed)return;
    const index=DOCK_APPS.findIndex(a=>a.id===app.id),target=this.sides[side].targets[index];
    const owner=target.pressOwner??'unknown';
    // pressKind belongs to material recovery and can outlive that input mode.
    // Report the probe that actually produced this opening action instead.
    const kind=this.frameInputs?.get(target)?.find(p=>p.id===owner)?.kind??'unknown';
    const content=dockContent(app,{now:this.options.now?.()??new Date(),locale:this.options.locale??globalThis.navigator?.language??'unknown',inputSource:`${owner} / ${kind}`});
    this.pending.push({side,content});this.dispatchEvent({type:'select',side,app});
  }
  update(dt){
    if(this.disposed)return;
    this.router?.update();
    this.frameInputs=new Map(this.targets.map(target=>[target,target.probes.slice()]));
    for(const side of Object.values(this.sides)){
      if(side.dock){side.dock.shelf.probes=[];side.dock.handle.probes=[];side.dock.update(dt,this.referenceHead,this.input?.handPoints??[]);}
      else side.targets.forEach(t=>t.update(dt));
      side.pane.back.update(dt);
    }
    this.resetControl.update(dt);this.router.rememberCaptures(this.frameInputs);
    if(this.resetRequested){this.resetRequested=false;this.reset();}
    const pending=this.pending;this.pending=[];
    for(const action of pending){if(this.disposed)break;const s=this.sides[action.side];s.content=action.content??null;if(action.close)s.pane.close();else s.pane.open(action.content);}
  }
  cancelInput(){this.input?.reset();this.pending=[];for(const t of this.targets){t.consumeProbes();this.router.cancelTarget(t);}}
  reset(){this.cancelInput();for(const s of Object.values(this.sides)){s.content=null;s.pane.close();}}
  snapshot(){return Object.fromEntries(Object.entries(this.sides).map(([key,s])=>[key,s.content]));}
  dispose(){if(this.disposed)return;this.disposed=true;this.cancelInput();this.router.dispose();for(const texture of this.objectTextures??[])texture.dispose();this.sides.contour.dock.key.shadow?.dispose();disposeContentGroup(this);}
}
