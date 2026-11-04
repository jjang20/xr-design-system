import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rig } from './support/dockSphereRig.js';
import { makeBubble } from '../src/core/bubble.js';
const media={matches:false};globalThis.matchMedia=()=>media;
for(const reduced of [false,true]) test(`R13 sphere Glow is pressure-only without local stamp, reduced=${reduced}`,()=>{
 media.matches=reduced;
 const r=rig(),h=r.h,u=h.skin;
 assert.ok(u.uGlowCore.value>0 && u.uRing.value>0,'Q69 lower sphere has independently enabled soft core/edge Glow');
 for(const k of ['uDentLight','uDentGlint','uDentShadow']) assert.equal(u[k].value,0,k+' remains disabled');
 assert.ok(h.body.children.every(m=>'DEFORMATION_ONLY' in m.material.defines),'no local geometric/normal well');
 r.move(new THREE.Vector3(0,0,h.r+.008+.015));
 assert.equal(u.uGlow.value,0,'no press Glow while hovering');
 r.approach(); for(let i=0;i<20;i++)r.frame();
 assert.ok(u.uGlow.value>0 && h.softShape.compression>0,'pressure emits light and preserves shape');
 r.move(new THREE.Vector3(0,0,h.r+.008+.005),true);for(let i=0;i<10;i++)r.frame();
 assert.equal(r.dock.rail.held?.id,'xr0');assert.ok(u.uGlow.value>0,'held emits light');
 r.hands[0].src.connected=false;for(let i=0;i<180;i++)r.frame();
 assert.equal(u.uGlow.value,0);assert.ok(h.softShape.compression<1e-5,'loss restores');
});
test('R13 Glow opt-in leaves ordinary bubble and no-mark controls unchanged',()=>{
 const plain=makeBubble(),off=makeBubble({contactMark:false});
 assert.ok(plain.uniforms.uDentLight.value>0 && plain.uniforms.uGlowCore.value>0);
 for(const k of ['uDentLight','uDentGlint','uDentShadow','uGlowCore','uRing'])assert.equal(off.uniforms[k].value,0);
});
