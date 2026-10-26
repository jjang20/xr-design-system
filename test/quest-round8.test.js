import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createTokens,Dock,PackagingPanel,InputSystem} from '../src/index.js';
import {DEFAULTS} from '../src/core/defaults.js';
const T=createTokens(JSON.parse(readFileSync(new URL('../tokens.json',import.meta.url)))),dt=1/60;
const apps=['house','ruler','scan','image','settings','notes','clock'].map(icon=>({icon,label:icon}));
function rig(dockOptions={}){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.y=1.6;scene.add(camera);
 const d=new Dock(T,{apps,distance:.4,...dockOptions});scene.add(d);const group=()=>new THREE.Group();
 const input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
 const src=input.xr[0],tip=new THREE.Group();src.hand.add(tip);tip.jointRadius=.008;src.hand.joints={'index-finger-tip':tip};src.grip.visible=false;
 const frame=()=>{scene.updateMatrixWorld(true);input.update();d.update(dt,camera,input.handPoints);scene.updateMatrixWorld(true);};
 for(let i=0;i<120;i++)frame();src.connected=true;
 return {d,scene,src,tip,frame};
}
test('R8: Dock is slightly thinner and end clearance grows without changing icons',()=>{
 const {d}=rig(),g=d.shelfShape.geometry;g.computeBoundingBox();
 const thickness=g.boundingBox.max.y-g.boundingBox.min.y;
 assert.ok(thickness>.010&&thickness<.012,'trial thickness between10 and12mm (R7=12.8)');
 assert.ok(d.pad>=.04,'at least40mm clear end pad (R7=32)');
 assert.ok(d.icons.every(icon=>icon.w===d.icons[0].w),'icon sizes stay uniform');
 assert.equal(DEFAULTS.look.dockBubble.bodyOpacity,.38);
 assert.equal(DEFAULTS.look.refract.shelf.passthroughAlpha,.42);
 assert.equal(DEFAULTS.windowPreview.frontOpacity,.85);
 assert.equal(DEFAULTS.handInput.palmCloseTravel,.025);
});

for(const side of [-1,1])test('R8: narrow '+side+' plate pressure changes geometry and retains accepted Glow',()=>{
 const {d,src,tip,frame}=rig();
 const [x,z]=d.arc(side*(d.length/2-d.pad/2),0),local=new THREE.Vector3(x,0,z),front=d.plateSample(local).front;
 const rest=d.shelfShape.geometry.attributes.position.array.slice();
 for(const gap of [.04,.015,.004,-.005]){local.y=front+.008+gap;tip.position.copy(d.shelf.localToWorld(local.clone()));frame();}
 assert.equal(d.shelf.press.pressed,true);assert.ok(d.icons.every(i=>!i.press.pressed));
 const now=d.shelfShape.geometry.attributes.position.array;let dip=0;
 for(let i=1;i<now.length;i+=3)dip=Math.max(dip,rest[i]-now[i]);
 const band=[];for(let i=0;i<now.length;i+=3)if(rest[i+1]-now[i+1]>dip*.5)band.push(Math.hypot(rest[i]-x,rest[i+2]-z));
 assert.ok(dip>.0045,'real mesh needs at least4.5mm of the preserved5mm depth');
 assert.ok(band.length>10,'dent has enough actual vertices');
 assert.ok(Math.max(...band)<.012,'half-depth footprint narrower than24mm diameter (R7 about42mm)');
 assert.ok(Math.abs(d.base.material.uniforms.uTouch.value.w-.0224)<1e-8,'accepted22.4mm Glow radius is independent of larger pads');
 src.connected=false;for(let i=0;i<120;i++)frame();
 assert.ok(d.plateContactDent.x<1e-5,'loss restores pressure smoothly');
 assert.ok([...d.shelfShape.geometry.attributes.position.array,...d.shelfShape.geometry.attributes.normal.array].every(Number.isFinite));
});

// CPU evaluation of the product sphere vertex equation using actual mesh
// vertices and live InputSystem-driven uniforms. This is not GPU/Quest evidence.
function actualVertexOutput(h,wanted){
 const a=h.body.children[0].geometry.attributes.position,u=h.skin;
 let p,nearest=Infinity;
 for(let i=0;i<a.count;i++){const v=new THREE.Vector3().fromBufferAttribute(a,i).normalize(),dd=v.distanceToSquared(wanted);if(dd<nearest){p=v;nearest=dd;}}
 assert.ok(nearest<1e-10,'centre and 15-degree samples must be actual mesh vertices');
 const d=new THREE.Vector3(u.uDent.value.x,u.uDent.value.y,u.uDent.value.z),q=p.clone().sub(d);
 const e=Math.exp(-q.lengthSq()/(u.uDentWidth.value**2));
 const pos=p.clone().multiplyScalar(1-u.uDent.value.w*e),along=d.clone().multiplyScalar(pos.dot(d)),transverse=pos.clone().sub(along);
 pos.addScaledVector(along,-u.uSquash.value).addScaledVector(transverse,u.uSquash.value*.5);
 pos.y=Math.max(-1,pos.y);return pos.multiplyScalar(h.r*h.inputScale);
}
for(const distance of [.4,Math.hypot(.28,.48)])test(`Dock sphere actual vertices form a local concave well after 4mm physical press, distance=${distance}`,()=>{
 const r=rig({distance}),h=r.d.handle;
 const point=gap=>h.localToWorld(new THREE.Vector3(0,0,h.r+.008+gap));
 for(const gap of [.04,.02,.01,.005,0,-.002,-.004]){r.tip.position.copy(point(gap));r.frame();}
 for(let i=0;i<60;i++){r.tip.position.copy(point(-.004));r.frame();}
 // R9 increases sphere-only response gain/depth; retain R8's real concavity
 // and unchanged Glow contract without freezing the superseded 4mm trial.
 assert.equal(h.press.pressed,true);assert.ok(h.dent.x*h.inputScale>=.004);assert.equal(h.skin.uGlow.value,.8);
 const theta=Math.PI/12,centre=actualVertexOutput(h,new THREE.Vector3(0,0,1)),left=actualVertexOutput(h,new THREE.Vector3(-Math.sin(theta),0,Math.cos(theta))),right=actualVertexOutput(h,new THREE.Vector3(Math.sin(theta),0,Math.cos(theta)));
 const concavity=(left.z+right.z)/2-centre.z;
 console.log(JSON.stringify({distance,radius:h.r*h.inputScale,width:h.skin.uDentWidth.value*h.r*h.inputScale,dent:h.dent.x*h.inputScale,glow:h.skin.uGlow.value,bodyAlpha:h.skin.uBodyOpacity.value,centre:centre.toArray(),left:left.toArray(),right:right.toArray(),concavity,method:'CPU shader equation with actual vertices; not rendered pixel evidence'}));
 assert.ok(concavity>0,'pressed centre must lie behind both 15-degree neighbours instead of remaining convex');
});

// Compare paired top/underside vertices at the same XZ after a real input
// approach. This is actual CPU geometry, independent of material shading.
for(const side of [-1,1])test(`real ${side} cap press preserves plate top/underside ordering`,()=>{
 const r=rig(),d=r.d,shape=d.shelfShape;
 const [x,z]=d.arc(side*(d.length/2-d.pad*.05),0),base=new THREE.Vector3(x,0,z),front=d.plateSample(base).front;
 assert.equal(d.plateSample(base).inside,true);
 const groups=new Map(),F=shape.flatP,FN=shape.flatN;
 for(let i=0;i<F.length;i+=3){const key=F[i]+','+F[i+2];let g=groups.get(key);if(!g)groups.set(key,g={top:[],bottom:[]});if(FN[i+1]>.0001)g.top.push(i);if(FN[i+1]<-.0001)g.bottom.push(i);}
 const trace=[];
 for(const gap of [.04,.025,.015,.005,0,-.002,-.005]){
  const p=base.clone();p.y=front+.008+gap;r.tip.position.copy(d.shelf.localToWorld(p));r.frame();trace.push({gap,pressed:d.shelf.press.pressed,dent:d.plateContactDent.x,owner:d.shelf.pressOwner??null});
 }
 assert.equal(d.shelf.press.pressed,true);assert.ok(d.plateContactDent.x>=.0049);
 const now=shape.geometry.attributes.position.array;let reversed=0,maxCross=0,worst=null;
 for(const g of groups.values()){if(!g.top.length||!g.bottom.length)continue;const top=g.top.reduce((a,b)=>now[a+1]<now[b+1]?a:b),bottom=g.bottom.reduce((a,b)=>now[a+1]>now[b+1]?a:b),cross=now[bottom+1]-now[top+1];if(cross>1e-6){reversed++;if(cross>maxCross){maxCross=cross;worst={x:now[top],z:now[top+2],topY:now[top+1],bottomY:now[bottom+1]};}}}
 console.log(JSON.stringify({side,point:base.toArray(),front,pad:d.pad,thickness:d.thick,trace,reversed,maxCross,worst}));
 assert.equal(reversed,0,'a valid cap press must not push the upper surface below the underside');
});
