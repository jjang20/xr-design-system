import * as THREE from 'three';
import {Button} from '../../src/components/Button.js';
import {Text} from 'troika-three-text';
import {makeText} from '../../src/core/look.js';
import {HierarchyInput} from './HierarchyInput.js';
import {HierarchyPanel} from './HierarchyPanel.js';
import { catalogItems } from '../catalog-data.js';

const IDS = { 'Lounge chair':'lounge-chair', 'Dining chair':'dining-chair', 'Coffee table':'coffee-table', 'Side table':'side-table' };
export const HIERARCHY_ITEMS = catalogItems.filter(c => ['Chairs','Tables'].includes(c.label)).map(c => ({
  ...c, id:c.label.toLowerCase(), items:c.items.map(item => ({...item,id:IDS[item.label],category:c.label})),
}));
export class HierarchyComparison extends THREE.Group {
  constructor(T,input=null) {
    super();this.input=input;this.sides={};
    for(const [key,sign] of [['flat',-1],['contour',1]]) {
      const panel=new HierarchyPanel(T,{title:'Catalog',items:HIERARCHY_ITEMS,mode:key==='flat'?'replace':'compress',distance:.6});
      panel.rootItems=HIERARCHY_ITEMS;panel.scale.setScalar(1.5);panel.position.x=sign*.23;this.add(panel);this.sides[key]={panel};
      const label=makeText(key==='flat'?'Flat Catalog':'Contour Catalog',{size:.016});label.position.set(sign*.23,.285,0);this.add(label);
      panel.addEventListener('select',e=>this.dispatchEvent({type:'select',side:key,item:e.item}));
    }
    this.resetControl=new Button(T,{label:'Reset',width:110,distance:.6});this.resetControl.position.y=-.24;this.add(this.resetControl);this.resetControl.addEventListener('select',()=>{this.resetRequested=true;});
    this.router=new HierarchyInput(input,()=>this.buttons,dt=>this.update(dt));
  }
  get buttons(){return [...Object.values(this.sides).flatMap(s=>s.panel.stack.all.flatMap(l=>[...l.rows,l.panel,...(l.backControl?[l.backControl]:[])])),this.resetControl];}
  update(dt){this.router?.update();for(const s of Object.values(this.sides))s.panel.update(dt);this.resetControl.update(dt);if(this.resetRequested){this.resetRequested=false;this.reset();}}
  cancelInput(){this.input?.reset();for(const s of Object.values(this.sides)){s.panel.resetInteraction();for(const l of s.panel.stack.all){l.backControl?.consumeProbes();l.backControl?.press.update(0,null,false);}}this.resetControl.consumeProbes();this.resetControl.press.update(0,null,false);}
  reset(){this.cancelInput();for(const s of Object.values(this.sides))s.panel.resetToRoot();}
  snapshot(){return Object.fromEntries(Object.entries(this.sides).map(([k,s])=>[k,{path:s.panel.levels.map(l=>l.item.id??l.item.label),content:s.panel.levels.at(-1).detail??null}]));}
  dispose(){if(this.disposed)return;this.disposed=true;this.cancelInput();this.router.dispose();for(const s of Object.values(this.sides))s.panel.dispose();this.traverse(o=>{if(o instanceof Text)o.dispose();o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean))m.dispose();});this.removeFromParent();}
}
