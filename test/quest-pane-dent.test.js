import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paneDentHeight} from '../src/core/paneDent.js';
test('R14 full-thickness pane bend remains bounded and reaches the grabbed edge',()=>{
 const panel={halfWidth:.108,halfHeight:.124,cornerRadius:.01,edgeFade:.003};
 const d={x:.1,y:0,radius:.018,depth:.0012};
 assert.equal(paneDentHeight(0,0,panel,null),0);
 assert.ok(paneDentHeight(.108,0,panel,d)<-.0009);
 assert.ok(paneDentHeight(.1,0,panel,d)<-.001);
 for(let x=-.108;x<=.108;x+=.003)for(let y=-.124;y<=.124;y+=.003){
  const h=paneDentHeight(x,y,panel,d);assert.ok(h>=-d.depth-1e-9&&h<=0);
 }
});

import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createTokens} from '../src/index.js';
import {Button} from '../src/components/Button.js';
import {WindowSurface} from '../src/components/WindowSurface.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url))));
for(const scale of [.75,1.5,2.25])test(`R14 unconnected pane pressure profile matches shader data, scale=${scale}`,()=>{
 const b=new Button(T,{variant:'glass',width:360,height:360,thickness:'regular',thicknessScale:.5});
 const h=new WindowSurface(T,b,()=>false);h.scale.setScalar(scale);h.updateMatrixWorld(true);
 assert.equal(h.inside(new THREE.Vector3()),false,'test supplies no production start policy');
 h.grab={id:'test'};h.probes=[{id:'test',point:new THREE.Vector3(b.w/2-.008,0,b.t)}];
 for(let i=0;i<90;i++)h.update(1/60);
 const u=b.skin.uniforms,d=h.currentDent;
 assert.ok(d.depth>0 && d.depth*scale<=.0035+1e-6);
 assert.deepEqual(u.uPaneDent.value.toArray(),[d.x,d.y,d.radius,d.depth]);
 const a=h.hitMeshes[0].geometry.attributes.position;
 let moved=0;
 for(let i=0;i<a.count;i++){
   const j=3*i,z=h.restPositions[j+2];
   const expect=z+paneDentHeight(a.getX(i),a.getY(i),h.profile,d);
   assert.ok(Math.abs(a.getZ(i)-expect)<1e-7);if(a.getZ(i)<z-1e-5)moved++;
   if(z<=0 && Math.abs(a.getX(i)-d.x)<d.radius && Math.abs(a.getY(i)-d.y)<d.radius) assert.ok(a.getZ(i)<z,'back follows same bend, preserving thickness');
 }
 assert.ok(moved>0);h.grab=null;for(let i=0;i<180;i++)h.update(1/60);
 assert.ok(h.currentDent.depth<1e-7);
});
