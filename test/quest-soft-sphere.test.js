import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rig } from './support/dockSphereRig.js';
import { SoftSphere } from '../src/core/SoftSphere.js';
import { prefersReducedMotion } from '../src/core/spring.js';

const media = { matches: false }; globalThis.matchMedia = () => media;
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const near = (a,b,e=1e-6) => assert.ok(Math.abs(a-b)<e, `${a} != ${b}`);

for (const reduced of [false,true]) test(`Q64: actual pressure and pinch deform only lower sphere and restore, reduced=${reduced}`,()=>{
  media.matches=reduced; assert.equal(prefersReducedMotion(),reduced);
  const r=rig(),h=r.h,rest=h.position.clone(),radius=h.r;
  assert.ok(h.body.children.every(m=>m.material.defines.SOFT_SPHERE!==undefined));
  assert.ok(r.dock.icons.every(i=>!i.bubble?.children?.some(m=>m.material?.defines?.SOFT_SPHERE!==undefined)));
  r.approach(); const shape=h.softShape;
  assert.ok(shape.compression>.2 && shape.compression<=.28);
  const right=new THREE.Vector3(1,0,0).applyMatrix3(shape.matrix),up=Y.clone().applyMatrix3(shape.matrix);
  assert.ok(right.length()/up.length()>1.12,'a frontal compression must change outline aspect, not merely enlarge a circle');
  const thumb=new THREE.Group();thumb.jointRadius=.008;r.hands[0].src.hand.add(thumb);
  r.hands[0].src.hand.joints['thumb-tip']=thumb;
  for(let i=0;i<60;i++){
    const point=new THREE.Vector3(0,0,h.r+.008+.005);
    thumb.position.copy(h.localToWorld(point.clone().add(new THREE.Vector3(-.018,0,0))));
    r.move(point,true);
  }
  assert.equal(r.dock.rail.held?.id,'xr0'); assert.ok(Math.abs(h.shapeAxis.x)>.99,'tracked pinch direction, not index radial direction');
  assert.ok(h.dent.x>=.00499);assert.equal(h.skin.uGlow.value,.8);assert.equal(h.skin.uBodyOpacity.value,.38);
  r.hands[0].src.connected=false;for(let i=0;i<180;i++)r.frame();
  assert.equal(r.dock.rail.held,null);near(h.softShape.compression,0,1e-5);
  assert.ok(h.softShape.offset.length()<1e-5);near(h.r,radius);assert.ok(h.position.distanceTo(rest)<1e-10);
  media.matches=false;
});

test('Q64: missing/coincident pinch joints use a finite radial fallback without altering capture',()=>{
  for(const coincident of [false,true]){
    const r=rig();r.approach();
    if(coincident){const thumb=new THREE.Group();r.hands[0].src.hand.add(thumb);r.hands[0].src.hand.joints['thumb-tip']=thumb;thumb.position.copy(r.hands[0].tip.position);}
    r.move(new THREE.Vector3(0,0,r.h.r+.008),true);
    assert.equal(r.dock.rail.held?.id,'xr0');assert.ok(r.h.shapeAxis.z>.99);
    assert.ok(r.h.skin.uShape.value.elements.every(Number.isFinite));
  }
});

test('Q64: volume, stem attachment, physical dent target and ray envelope agree over safe radii/axes',()=>{
  const s=new SoftSphere();
  for(const radius of [.007,.014,.028,.042])for(const a of [Z,Y,Y.clone().negate(),new THREE.Vector3(.7,.7,.1).normalize()]){
    const depth=Math.min(.006,radius*.45);s.update(a,depth,radius,a);
    near(s.matrix.determinant(),1,1e-9);
    assert.ok(Y.clone().applyMatrix3(s.matrix).add(s.offset).distanceTo(Y)<1e-10,'stem pole stays attached');
    const target=a.clone().multiplyScalar(1-depth/radius),pre=target.clone().sub(s.offset).applyMatrix3(s.inverse);
    assert.ok(pre.length()<=1+1e-9 && pre.length()>.2,'local well remains inside an uninverted surface');
    assert.ok(pre.clone().applyMatrix3(s.matrix).add(s.offset).distanceTo(target)<1e-10,'whole squash cannot add a gap under the physical dent centre');
    for(const d of [Z,Y,new THREE.Vector3(1,0,0)])near(d.clone().multiplyScalar(s.radiusAt(d)).sub(s.offset).applyMatrix3(s.inverse).length(),1,1e-9);
  }
});

test('Q64: polar spread has no direction jump and affine normals match tangent geometry',()=>{
  const a=new SoftSphere(),b=new SoftSphere();
  a.update(new THREE.Vector3(1e-7,1,0).normalize(),.006,.014,Y);
  b.update(new THREE.Vector3(-1e-7,1,0).normalize(),.006,.014,Y);
  assert.ok(Math.max(...a.matrix.elements.map((v,i)=>Math.abs(v-b.matrix.elements[i])))<1e-6);
  const normal=new THREE.Vector3(.3,.5,.8).normalize(),tangent=new THREE.Vector3(0,1,0).cross(normal).normalize();
  const bitangent=normal.clone().cross(tangent);
  const actual=tangent.applyMatrix3(a.matrix).cross(bitangent.applyMatrix3(a.matrix)).normalize();
  assert.ok(actual.distanceTo(normal.applyMatrix3(a.inverse).normalize())<1e-10);
});

test('Q64: second hand can touch the spread skin and cannot take the existing pinch',()=>{
  const r=rig();r.approach();for(let i=0;i<30;i++)r.frame();
  const direction=new THREE.Vector3(.8,0,.6),skin=r.h.softShape.radiusAt(direction)*r.h.r;
  for(const gap of [.03,.015,.005,-.001])r.move(direction.clone().multiplyScalar(skin+.008+gap),false,1);
  assert.equal(r.h.pressOwner,'xr0');assert.ok(r.h.skin.uExtraCount.value>0,'actual secondary contact is retained on the spread skin');
  const hit=r.h.hitMeshes[0];r.h.updateMatrixWorld(true);
  const p=direction.clone().multiplyScalar(skin);
  near(r.h.faceDistance(p,0),0,1e-6);
  const hitLocal=p.clone().applyMatrix4(hit.matrix.clone().invert());near(hitLocal.length(),1,1e-6);
  r.move(new THREE.Vector3(0,0,r.h.r+.008),true);assert.equal(r.dock.rail.held?.id,'xr0');
  r.move(direction.clone().multiplyScalar(skin+.008),true,1);assert.equal(r.dock.rail.held?.id,'xr0');
});

for(const reduced of [false,true])test(`Q64: a tip normal to the oblique ellipsoid skin contacts before its radial gap closes, reduced=${reduced}`,()=>{
  media.matches=reduced;
  const r=rig();r.approach();for(let i=0;i<60;i++)r.frame();
  const h=r.h,p=new THREE.Vector3(Math.SQRT1_2,0,Math.SQRT1_2);
  const skin=p.clone().applyMatrix3(h.softShape.matrix).add(h.softShape.offset).multiplyScalar(h.r);
  const normal=p.clone().applyMatrix3(h.softShape.inverse).normalize();
  const centre=skin.clone().addScaledVector(normal,.0079);
  near(h.softShape.sample(centre.clone().divideScalar(h.r)).distance*h.r,.0079,1e-8);
  r.move(centre,false,1);
  assert.equal(h.pressOwner,'xr0');assert.ok(h.skin.uExtraCount.value>0,'100um physical overlap must not disappear under a radial approximation');
  media.matches=false;
});
