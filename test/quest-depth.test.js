import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,Dock,PackagingPanel} from '../src/index.js';
import {DEFAULTS} from '../src/core/defaults.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url)))),dt=1/60;
const items=[{label:'Child',items:[{label:'Grandchild',items:[{label:'One'},{label:'Two'},{label:'Three'}]}]},{label:'Extra'}];
for(const reducedMotion of [false,true])for(const scale of [1,1.5,2])test(`R6: older full sheets fade and pack closer, scale=${scale}, reduced=${reducedMotion}`,()=>{
 const p=new PackagingPanel(T,{title:'Catalog',items,layerSpacing:.7,reducedMotion});p.scale.setScalar(scale);
 const settle=()=>{for(let n=0;n<120;n++){p.updateMatrixWorld(true);p.update(dt);}};
 settle();p.levels[0].rows[0].dispatchEvent({type:'select'});settle();p.levels[1].rows[0].dispatchEvent({type:'select'});settle();
 const [old,middle,front]=p.levels;
 const frontGap=(front.cur.z-middle.cur.z)*scale,oldGap=(middle.cur.z-old.cur.z)*scale;
 assert.ok(oldGap>old.panel.t*scale,'solid sheets must not intersect');assert.ok(oldGap<frontGap*.85,'older interval must be visibly tighter');
 assert.ok(Math.abs(frontGap-p.pose.recedeZ*scale)<1e-5,'nearest gap remains the existing distance');
 assert.ok(old.rearOpacity<=.1&&middle.rearOpacity>=.25&&middle.rearOpacity<=.3);
 assert.equal(DEFAULTS.windowManipulation.rearTitleOpacity,1);
 for(let i=0;i<2;i++){
  const rear=p.levels[i],ahead=p.levels[i+1];
  const exposed=rear.cur.y+rear.size.H*rear.cur.sy/2-(ahead.cur.y+ahead.size.H*ahead.cur.sy/2);
  assert.ok(Math.abs(exposed-rear.size.titleBand*rear.cur.sy)<1e-5,'variable height leaves the entire rear title');
  assert.equal(rear.panel.enabled,true);assert.ok(rear.rows.every(r=>!r.enabled));
 }
 p.back();settle();assert.ok(Math.abs(p.levels[1].cur.z-p.levels[0].cur.z-p.pose.recedeZ)<1e-5,'back restores the nearest interval');
});

test('R6: thicker Dock preserves its footprint and analytic contact follows the drawn skin',()=>{
 const P=DEFAULTS.look.dockPlate,trial=P.thicknessScale;
 const make=()=>{const d=new Dock(T,{apps:['house','ruler','scan','image','settings','notes','clock'].map(icon=>({icon,label:icon})),distance:.4});const camera=new THREE.PerspectiveCamera();camera.position.y=1.6;for(let n=0;n<120;n++){d.updateMatrixWorld(true);d.update(dt,camera);}d.shelfShape.geometry.computeBoundingBox();return d;};
 let old;try{P.thicknessScale=1;old=make();}finally{P.thicknessScale=trial;}
 const d=make(),a=old.shelfShape.geometry.boundingBox.getSize(new THREE.Vector3()),b=d.shelfShape.geometry.boundingBox.getSize(new THREE.Vector3());
 assert.ok(b.y>a.y*1.1&&b.y<a.y*1.35,'thickness is a modest trial increase');
 assert.ok(Math.abs(a.x-b.x)<1e-7&&Math.abs(a.z-b.z)<1e-7,'width/depth footprint is unchanged');
 assert.deepEqual(old.handle.position.toArray(),d.handle.position.toArray());
 const positions=d.shelfShape.geometry.attributes.position,ray=new THREE.Raycaster();d.updateMatrixWorld(true);
 for(const side of [-1,1]){
  const [x,z]=d.arc(side*(d.length/2-d.pad/2),0),point=new THREE.Vector3(x,.04,z),sample=d.plateSample(point);
  assert.equal(sample.inside,true);
  ray.set(d.shelf.localToWorld(point.clone()),new THREE.Vector3(0,-1,0).transformDirection(d.shelf.matrixWorld));
  const hit=ray.intersectObject(d.base,false)[0];assert.ok(hit);
  assert.ok(Math.abs(d.shelf.worldToLocal(hit.point).y-sample.front)<.0001,'visible mesh and finger contact agree');
 }
 assert.ok(positions.count>0);
});
