import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,PackagingPanel,InputSystem} from '../src/index.js';
import {ListSurfaceOpacity} from '../src/core/ListSurfaceOpacity.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url)))),dt=1/60;
// Deliberately neither proposed Q78 sequence: structural fixture, not product defaults.
const targets={idle:.21,hover:.31,pressed:.41};
function rig(reduced=false,count=2){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();scene.add(camera);
 const p=new PackagingPanel(T,{title:'Opacity fixture',items:Array.from({length:count},(_,i)=>({label:'Leaf '+i})),reducedMotion:reduced});p.scale.setScalar(1.5);scene.add(p);
 for(let i=0;i<120;i++){scene.updateMatrixWorld(true);p.update(dt);}scene.updateMatrixWorld(true);
 const level=p.levels[0],rows=level.rows;level.listOpacity?.dispose();const opacity=level.listOpacity=new ListSurfaceOpacity(level.panel.skin,rows,targets);
 const group=()=>new THREE.Group(),input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 input.xr.forEach(s=>{s.connected=false;s.handSource=true;s.grip.visible=false;const tip=new THREE.Group();tip.jointRadius=.008;s.hand.add(tip);s.hand.joints={'index-finger-tip':tip};});
 const frame=()=>{scene.updateMatrixWorld(true);input.update();p.update(dt);scene.updateMatrixWorld(true);};
 const hand=(n,row,gap,x=0)=>{const s=input.xr[n],tip=s.hand.joints['index-finger-tip'];s.connected=true;s.hand.visible=tip.visible=true;const point=new THREE.Vector3(x,0,0);point.z=(row.press.pressed?row.pokeFront:row.surfaceZ(point))+(.008+gap)/Math.abs(row.getWorldScale(new THREE.Vector3()).z);tip.position.copy(row.localToWorld(point));};
 const tick=(gap0,gap1)=>{if(gap0!==null)hand(0,rows[0],gap0);if(gap1!==null)hand(1,rows[1],gap1);frame();};
 const value=i=>opacity.texture.image.data[i];
 return{scene,p,level,rows,opacity,input,frame,hand,tick,value};
}
for(const reduced of [false,true])test('R15 list state alpha endpoints, independent rows and loss recovery '+reduced,()=>{
 const r=rig(reduced),[a,b]=r.rows,label=a.label.fillOpacity;
 assert.equal(r.level.panel.skin.uniforms.uBulgeCount.value,0);
 assert.ok(r.opacity.values.every(v=>v===targets.idle),'idle exists without geometry slots');
 for(let i=0;i<120;i++)r.tick(.04,null);
 assert.ok(a.hovered&&!a.press.pressed);assert.ok(Math.abs(r.value(0)-targets.hover)<1e-6);assert.ok(Math.abs(r.value(1)-targets.idle)<1e-6);
 for(const gap of [.04,.025,.015,.005,-.003])r.tick(-.003,gap);
 for(let i=0;i<120;i++)r.tick(-.003,-.003);
 assert.ok(a.surfaceContact&&b.surfaceContact);assert.ok(Math.abs(r.value(0)-targets.pressed)<1e-6&&Math.abs(r.value(1)-targets.pressed)<1e-6);
 r.input.xr.forEach(s=>s.connected=false);let previous=r.value(0);
 for(let i=0;i<120;i++){r.frame();const current=r.value(0);assert.ok(current<=previous+1e-7&&current>=targets.idle-1e-7);previous=current;}
 assert.ok(Math.abs(previous-targets.idle)<1e-6);assert.equal(a.label.fillOpacity,label);
 assert.equal(r.level.panel.skin.uniforms.uListStateMix.value,1);
 const version=r.opacity.texture.version;for(let i=0;i<30;i++)r.frame();assert.equal(r.opacity.texture.version,version,'settled values do not upload repeatedly');
});
test('R15 alpha remains monotonic on interrupted recovery and ignores geometric rebound',()=>{
 const r=rig();for(const gap of [.04,.025,.015,.005,-.003])r.tick(gap,null);for(let i=0;i<60;i++)r.tick(-.003,null);
 r.input.xr[0].connected=false;for(let i=0;i<7;i++)r.frame();const recovering=r.value(0);assert.ok(recovering<targets.pressed);
 for(let i=0;i<120;i++){r.tick(.04,null);assert.ok(r.value(0)>=Math.min(recovering,targets.hover)-1e-6&&r.value(0)<=Math.max(recovering,targets.hover)+1e-6);}
 assert.ok(Math.abs(r.value(0)-targets.hover)<1e-6);
});
test('R15 opacity storage is independent of twelve bulge slots; disposal is idempotent',()=>{
 const r=rig(false,15);assert.equal(r.opacity.values.length,15);assert.ok(Math.abs(r.value(14)-targets.idle)<1e-6);
 assert.equal(r.level.panel.skin.uniforms.uBulgeCount.value,0);let disposed=0;r.opacity.texture.addEventListener('dispose',()=>disposed++);
 r.level.panel.skin.dispose();r.opacity.dispose();assert.equal(disposed,1);
});
test('R15 rear alpha gate restores legacy sheet and retained closing texture survives until sweep',()=>{
 const r=rig();r.p.open({label:'Child',items:[{label:'Leaf'}]},null);
 for(let i=0;i<120;i++)r.frame();assert.ok(r.level.panel.skin.uniforms.uListStateMix.value<1e-6);
 const child=r.p.levels.at(-1);child.listOpacity?.dispose();child.listOpacity=new ListSurfaceOpacity(child.panel.skin,child.rows,targets);
 r.p.back(0);assert.equal(child.listOpacity.disposed,undefined);
 for(let i=0;i<180;i++)r.frame();assert.equal(child.listOpacity.disposed,true);assert.ok(r.level.panel.skin.uniforms.uListStateMix.value>.999999);
 r.p.dispose();assert.equal(r.opacity.disposed,true);
});
