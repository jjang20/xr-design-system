import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,Dock,PackagingPanel,InputSystem} from '../src/index.js';
import {DEFAULTS} from '../src/core/defaults.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url)))),dt=1/60;
const apps=['house','ruler','scan','image','settings','notes','clock'].map(icon=>({icon,label:icon}));
function rig(){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.y=1.6;scene.add(camera);
 const d=new Dock(T,{apps,distance:.4});scene.add(d);const group=()=>new THREE.Group();
 const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 const src=input.xr[0],tip=new THREE.Group();src.hand.add(tip);tip.jointRadius=.008;src.hand.joints={'index-finger-tip':tip};src.grip.visible=false;
 const frame=()=>{scene.updateMatrixWorld(true);input.update();d.update(dt,camera,input.handPoints);scene.updateMatrixWorld(true);};
 for(let i=0;i<120;i++)frame();src.connected=true;
 return {d,scene,src,tip,frame};
}
test('R7: window slab alone has half thickness, front geometry and attachments agree',()=>{
 const p=new PackagingPanel(T,{title:'Catalog',items:[{label:'Child',items:[{label:'Leaf'}]}]});
 p.scale.setScalar(1.5);for(let i=0;i<90;i++)p.update(dt);
 p.levels[0].rows[0].dispatchEvent({type:'select'});for(let i=0;i<90;i++)p.update(dt);
 for(const l of p.levels){
  assert.equal(l.panel.t,T.get('material.thickness.regular')*.5);
  assert.equal(l.panel.frontZ,l.panel.t);assert.equal(l.panel.skin.uniforms.uThick.value,l.panel.t);
  l.panel.body.geometry.computeBoundingBox();const box=l.panel.body.geometry.boundingBox;
  // ExtrudeGeometry retains a 10 micrometre minimum straight bevel segment.
  assert.ok(Math.abs(box.max.z-box.min.z-l.panel.t)<.000015);
  assert.ok(l.rows.every(row=>row.position.z===l.panel.t&&row.t===T.get('material.thickness.thin')));
  assert.ok([...l.moves,...l.corners].every(h=>h.position.z===l.panel.t));
  assert.ok(l.title.position.z>l.panel.t);
 }
});

test('R7: Dock is flat between rolled sides and symmetric above/below its rim',()=>{
 const {d}=rig(),s=d.shelfShape,half=s.depth/2;
 assert.ok(Math.abs(s.top(half)-s.top(half*.65))<1e-7,'centre must not dome');
 const y=Array.from(s.geometry.attributes.position.array).filter((_,i)=>i%3===1),height=Math.max(...y)-Math.min(...y);
 assert.ok(height>.012,'plate thicker than the R6 10.24mm mesh');
 for(const inset of [0,half*.1,half*.3,half*.65,half])assert.ok(Math.abs(s.top(inset)+s.bottom(inset)+height)<1e-6,'upper/lower edge profile is symmetric');
});

for(const side of [-1,1])test('R7: enlarged '+side+' end has actual input clearance and deeper local pressure',()=>{
 const {d,scene,src,tip,frame}=rig(),events=[];d.addEventListener('select',()=>events.push('select'));
 assert.ok(d.pad>=.03,'end pad expands independently of icon layout');
 const [x,z]=d.arc(side*(d.length/2-d.pad/2),0),local=new THREE.Vector3(x,0,z),front=d.plateSample(local).front;
 const rest=d.shelfShape.geometry.attributes.position.array.slice();
 for(const gap of [.04,.015,.004,-.005]){local.y=front+.008+gap;tip.position.copy(d.shelf.localToWorld(local.clone()));frame();}
 assert.equal(d.shelf.press.pressed,true);assert.ok(d.icons.every(i=>!i.press.pressed));assert.equal(events.length,0);
 const now=d.shelfShape.geometry.attributes.position.array;let dip=0;for(let i=1;i<now.length;i+=3)dip=Math.max(dip,rest[i]-now[i]);
 assert.ok(dip>.0045,'5mm physical pressure must visibly exceed R6 3mm');
 assert.ok(d.base.material.uniforms.uTouch.value.w>.02,'wider local Glow footprint');
 src.selecting=true;for(let i=0;i<30;i++)frame();assert.equal(d.grip.held?.id,src.id);assert.ok(d.icons.every(i=>!i.press.pressed));
 src.connected=false;for(let i=0;i<120;i++)frame();assert.equal(d.grip.held,null);assert.ok(d.plateContactDent.x<1e-5);
});

test('R7: added opacity is scoped to bubble skins and Dock',()=>{
 const {d}=rig(),p=new PackagingPanel(T,{title:'Catalog',items:[{label:'Leaf'}]});
 assert.ok(d.handle.skin.uBodyOpacity.value>=.35&&d.icons.every(i=>i.skin.uBodyOpacity.value>=.35));
 assert.ok(DEFAULTS.look.refract.shelf.passthroughAlpha>=.4);
 assert.equal(p.levels[0].panel.skin.uniforms.uSolidOpacity.value,T.get('material.opacity.default'));
 assert.equal(DEFAULTS.windowManipulation.rearOpacity,.3);assert.equal(DEFAULTS.windowManipulation.olderOpacity,.12);
 assert.equal(DEFAULTS.handInput.palmCloseTravel,.025);assert.equal(DEFAULTS.look.palmGlow.commitHold,.1);
});

test('R7: rounded cap input matches the actual mesh',()=>{
const d=new Dock(T,{apps:['house','ruler','scan','image','settings','notes','clock'].map(icon=>({icon,label:icon})),distance:.4});
const cam=new THREE.PerspectiveCamera();cam.position.y=1.6;for(let i=0;i<120;i++){d.updateMatrixWorld(true);d.update(dt,cam);}
d.updateMatrixWorld(true);const ray=new THREE.Raycaster(),out=[];
for(const side of [-1,1])for(const padFraction of [.05,.15,.3,.5,.75,.95])for(const tFraction of [0,.5,.8,.95]){
 const s=side*(d.length/2-d.pad*padFraction),t=d.shelfShape.depth/2*d.neck*d.size*tFraction;
 const [x,z]=d.arc(s,t),point=new THREE.Vector3(x,.05,z),sample=d.plateSample(point);
 ray.set(d.shelf.localToWorld(point.clone()),new THREE.Vector3(0,-1,0).transformDirection(d.shelf.matrixWorld));
 const hit=ray.intersectObject(d.base,false)[0],y=hit?d.shelf.worldToLocal(hit.point.clone()).y:null;
 out.push({side,padFraction,tFraction,inside:sample.inside,predicted:sample.front,actual:y,error:y===null?null:sample.front-y,point:[x,z]});
}

 assert.equal(out.filter(x=>x.inside&&x.actual===null).length,0);
 assert.ok(out.filter(x=>x.inside&&x.actual!==null).every(x=>Math.abs(x.error)<.0001));
});
