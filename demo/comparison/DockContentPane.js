import * as THREE from 'three';
import {Text} from 'troika-three-text';
import {makeText} from '../../src/core/look.js';
import {PlanarAction} from './PlanarAction.js';
import {catalogItems} from '../catalog-data.js';

export const ROOM_PHOTO={path:'./env/lebombo_1k.hdr',width:1024,height:512};
// Use the triangles of the drawn rounded face for near eligibility as well
// as ray picking. Button's general rectangular touch region is not this
// fixture's finite silhouette. No global Button/hit policy is changed.
export class DockFlatAction extends PlanarAction {
  inside(point){
    if(!this.plane)return super.inside(point);
    const geometry=this.plane.geometry,positions=geometry.attributes.position,index=geometry.index;
    for(let i=0;i<index.count;i+=3){
      const [a,b,c]=[0,1,2].map(n=>index.getX(i+n));
      const cross=(u,v)=>(positions.getX(v)-positions.getX(u))*(point.y-positions.getY(u))-(positions.getY(v)-positions.getY(u))*(point.x-positions.getX(u));
      const signs=[cross(a,b),cross(b,c),cross(c,a)];
      if(signs.every(x=>x>=-1e-12)||signs.every(x=>x<=1e-12))return true;
    }
    return false;
  }
}
const catalog=catalogItems.filter(c=>['Chairs','Tables'].includes(c.label)).flatMap(c=>c.items.map(item=>({name:item.label,category:c.label,dimensions:item.sublabel,widthCm:parseFloat(item.sublabel),depthCm:parseFloat(item.sublabel.split(' × ')[1])})));

// Runtime values are sampled at action time; no clock timers or telemetry.
export function dockContent(app,{now=new Date(),locale='unknown',inputSource='unknown'}={}){
  const common={id:app.id,title:app.label};
  switch(app.id){
    case 'planner':return {...common,caption:'Demo catalog / workspace',rows:catalog.map(x=>({...x}))};
    case 'measure':return {...common,caption:'Catalog dimensions · not live measurement',rows:catalog.map(x=>({...x}))};
    case 'scan':return {...common,caption:'Sample room model · no sensing',widthM:4,depthM:3,wall:'Sample wall',floor:'Sample floor'};
    case 'photos':return {...common,caption:'Sample room image · Lebombo / Poly Haven (CC0)',photo:{...ROOM_PHOTO}};
    case 'settings':return {...common,caption:'Read-only fixture facts · no OS controls',facts:[['Locale',locale],['Input source',inputSource],['Content','Local demo / no persistence'],['Quest validation','Unknown']]};
    case 'notes':return {...common,caption:'Sample note · read only',paragraphs:['Keep the reading corner clear.','Leave a path beside the lounge chair.','Place a small table within reach of the chair.','Keep the sample wall available for soft light.']};
    case 'clock':return {...common,caption:'Local time at opening · no background timer',time:now.toLocaleTimeString(),date:now.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone??'Unknown'};
    default:throw new Error(`Unknown fixture destination: ${app.id}`);
  }
}
export function disposeContentGroup(group){
  const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o instanceof Text)o.dispose();if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();
}
export class DockContentPane extends THREE.Group {
  constructor(T,photoTexture=null){
    super();this.w=.54;this.h=.36;this.photoTexture=photoTexture;
    this.background=new THREE.Mesh(new THREE.PlaneGeometry(this.w,this.h),new THREE.MeshBasicMaterial({color:0x23364a}));this.add(this.background);
    this.back=new DockFlatAction(T,{label:'Back to Dock',width:155,height:36,distance:.6,thickness:'thin'});this.back.label.fontSize=.012;this.back.label.sync();this.back.position.set(0,-.15,.002);this.add(this.back);
    this.body=new THREE.Group();this.add(this.body);this.close();
  }
  text(value,x,y,size=.013,anchorX='left'){
    const text=makeText(value,{size,anchorX});text.position.set(x,y,.003);this.body.add(text);return text;
  }
  rect(x,y,width,height,color){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({color}));mesh.position.set(x,y,.002);this.body.add(mesh);return mesh;
  }
  open(content){
    disposeContentGroup(this.body);this.body=new THREE.Group();this.add(this.body);this.visible=true;this.back.enabled=true;this.content=content;
    this.text(content.title,-.24,.145,.021);this.text(content.caption,-.24,-.108,.010);
    if(content.id==='planner'){
      this.text('Chairs',-.24,.095,.014);this.text('Tables',.018,.095,.014);
      content.rows.forEach((r,i)=>{const x=i<2?-.24:.018,y=.055-(i%2)*.065;this.text(r.name,x,y,.014);this.text(r.dimensions,x,y-.023,.012);});
    }else if(content.id==='measure'){
      this.text('Catalog item',-.24,.095,.012);this.text('Width × depth',-.045,.095,.012);this.text('Footprint',.14,.095,.012);
      this.footprints=content.rows.map((r,i)=>{const y=.055-i*.044;this.text(r.name,-.24,y,.012);this.text(r.dimensions,-.045,y,.012);const scale=Math.min(.065/r.widthCm,.035/r.depthCm),mesh=this.rect(.18,y,r.widthCm*scale,r.depthCm*scale,0x9bd4df);return {mesh,widthCm:r.widthCm,depthCm:r.depthCm,width:r.widthCm*scale,height:r.depthCm*scale};});
    }else if(content.id==='scan'){
      this.rect(-.065,0,.24,.18,0x63867c);this.rect(-.065,.096,.26,.012,0xa4b8ca);
      this.text(content.wall,.085,.085,.012);this.text(content.floor,.085,.018,.012);
      this.text('4 m',-.065,-.066,.013,'center');this.text('3 m',-.225,0,.013);
    }else if(content.id==='photos'){
      const width=.36,height=width*content.photo.height/content.photo.width;
      this.photo=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:this.photoTexture,color:this.photoTexture?0xffffff:0x334155}));
      this.photo.position.set(0,.004,.002);this.body.add(this.photo);
      if(!this.photoTexture)this.text('Sample image unavailable',0,0,.014,'center');
    }else if(content.id==='settings'){
      content.facts.forEach(([label,value],i)=>{const y=.084-i*.045;this.text(label,-.24,y,.012);this.text(value,-.08,y,.012);});
    }else if(content.id==='notes')content.paragraphs.forEach((p,i)=>this.text(p,-.24,.08-i*.045,.013));
    else if(content.id==='clock'){this.text(content.time,0,.063,.036,'center');this.text(content.date,0,.003,.022,'center');this.text(content.timeZone,0,-.047,.016,'center');}
  }
  close(){this.visible=false;this.back.enabled=false;this.content=null;}
  dispose(){disposeContentGroup(this);}
}
