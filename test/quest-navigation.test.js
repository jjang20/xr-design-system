import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Copy into <repo>/test unchanged, or run in /tmp with XR_REVIEW_ROOT.
const root = process.env.XR_REVIEW_ROOT ?? fileURLToPath(new URL('..', import.meta.url));
const THREE = await import(pathToFileURL(root + '/node_modules/three/build/three.module.js'));
const { createTokens, PackagingPanel, InputSystem } = await import(pathToFileURL(root + '/src/index.js'));
const T = createTokens(JSON.parse(readFileSync(root + '/tokens.json')));
const dt = 1 / 60;
const approach = [.04, .025, .015, .005, -.003];

function rig({ reversed = false, nested = false, extra = false, leaf = false, reduced = false } = {}) {
  const alpha = { id: 'nav-alpha', label: 'Alpha', items: [{ id: 'alpha-leaf', label: 'Alpha leaf' }] };
  const beta = { id: 'nav-beta', label: 'Beta', items: [{ id: 'beta-leaf', label: 'Beta leaf' }] };
  const children = reversed ? [beta, alpha] : [alpha, beta];
  if (leaf) children[0] = { id: 'leaf', label: 'Independent leaf' };
  if (extra) children.push({ id: 'nav-gamma', label: 'Gamma', items: [{ id: 'gamma-leaf', label: 'Gamma leaf' }] });
  const p = new PackagingPanel(T, { title: 'Catalog', layerSpacing: .7, reducedMotion: reduced,
    items: nested ? [{ id: 'nav-group', label: 'Group', items: children }] : children });
  p.scale.setScalar(1.5);
  if (nested) p.levels[0].rows[0].dispatchEvent({ type: 'select' }); // arrange original parent
  const scene = new THREE.Scene(); scene.add(p);
  const camera = new THREE.PerspectiveCamera(); camera.position.y = 1.6; scene.add(camera);
  for (let i = 0; i < 120; i++) { scene.updateMatrixWorld(true); p.update(dt); }
  const group = () => new THREE.Group();
  const input = new InputSystem({ T, scene, camera, renderer: { domElement: { addEventListener() {} },
    xr: { isPresenting: true, getController: group, getControllerGrip: group, getHand: group } } });
  input.xr.forEach(src => { src.connected=false; src.grip.visible=false; src.hand.joints={}; });
  const hands = children.map((_, index) => {
    const src=input.xr[index % 2], name=index<2?'index-finger-tip':'middle-finger-tip';
    const tip = new THREE.Group(); tip.jointRadius = .008; src.hand.add(tip);
    src.hand.joints[name] = tip;
    return { src, tip };
  });
  const parent = p.levels.at(-1), rows = parent.rows, frames = [], events = [], starts = new Map();
  let epoch = 0;
  rows.forEach((row, index) => {
    for (const type of ['press', 'release', 'select', 'cancel']) row.addEventListener(type, () => {
      if (type === 'press') starts.set(row, { epoch, matrix: row.matrixWorld.clone(), front: row.pokeFront });
      events.push({ epoch, type, id: children[index].id });
    });
  });
  p.addEventListener('open', e => events.push({ epoch, type: 'open', id: e.item.id }));
  p.addEventListener('back', e => events.push({ epoch, type: 'back', level: e.level }));
  const opens = () => events.filter(e => e.type === 'open').map(e => e.id);
  const frame = () => {
    epoch++; scene.updateMatrixWorld(true); input.update(); p.update(dt); scene.updateMatrixWorld(true);
    frames.push({ epoch, stack: p.levels.map(l => l.item.id ?? l.item.label),
      parentZ: parent.cur.z, pressed: rows.map(r => r.press.pressed), opens: opens() });
  };
  // A held finger remains in the world coordinate frame sampled at press.
  // It must not follow the receding visual parent and accidentally create a release.
  const point = (index, gap, { frozen = true, side = false } = {}) => {
    scene.updateMatrixWorld(true);
    const row = rows[index], start = frozen && starts.get(row);
    const matrix = start?.matrix ?? row.matrixWorld;
    const scale = new THREE.Vector3().setFromMatrixScale(matrix);
    const local = new THREE.Vector3(side ? row.touchW / 2 + .04 / scale.x : 0, 0, 0);
    const front = start?.front ?? row.surfaceZ(local);
    local.z = front + (.008 + gap) / scale.z;
    return local.applyMatrix4(matrix);
  };
  const place = (index, gap, options) => {
    const h = hands[index]; h.src.connected = true; h.src.selecting = false;
    h.src.hand.visible = h.tip.visible = true;
    h.tip.position.copy(h.src.hand.worldToLocal(point(index, gap, options)));
  };
  const gaps = children.map(() => .04);
  const tick = (next = gaps) => { next.forEach((gap, index) => { gaps[index] = gap; place(index, gap); }); frame(); };
  const arm = (order = [0, 1], simultaneous = false) => {
    if (simultaneous) for (const gap of approach) tick([gap, gap]);
    else {
      tick();
      for (const index of order) for (const gap of approach) { gaps[index] = gap; tick(); }
    }
    assert.ok(rows.every(row => row.press.pressed), 'fixture: both original-parent items must actually press');
    assert.deepEqual(opens(), [], 'physical contact alone must not execute');
  };
  const final = expected => {
    assert.deepEqual(opens(), expected, JSON.stringify({ events, frames }));
    assert.deepEqual(p.levels.map(l => l.item.id ?? l.item.label),
      [...(nested ? ['Catalog', 'nav-group'] : ['Catalog']), expected.at(-1)],
      'last sibling stays under the original parent in one stack');
  };
  return { p, scene, input, hands, parent, rows, children, events, starts, frames, frame, point, place, tick, arm, opens, final };
}


for (const first of [0,1]) for (const reduced of [false,true]) test(`Q48: wait with no intermediate child, first=${first}, reduced=${reduced}`,()=>{
 const r=rig({reduced});r.arm([1-first,first]);const gaps=[-.003,-.003];gaps[first]=.015;r.tick(gaps);
 assert.deepEqual(r.opens(),[]);assert.equal(r.rows[1-first].press.pressed,true);
 const z=r.parent.cur.z;
 for(let i=0;i<18;i++){r.tick(gaps);assert.deepEqual(r.opens(),[]);assert.equal(r.p.levels.length,1);}
 assert.equal(r.parent.cur.z,z,'waiting must not start parent recession');
 gaps[1-first]=.015;r.tick(gaps);r.final([r.children[1-first].id]);
 assert.equal(r.events.filter(e=>e.type==='select').length,2);
});

for(const order of [[0,1],[1,0]])test('Q48: simultaneous release takes latest press-start '+order.join(','),()=>{
 const r=rig();r.arm(order);r.tick([.015,.015]);r.final([r.children[order.at(-1)].id]);
});
test('Q48: exact ties take final stable item ID independent of row traversal',()=>{
 const r=rig({reversed:true});r.arm([0,1],true);r.tick([.015,.015]);r.final(['nav-beta']);
});
for(const index of [0,1])test('Q48: singleton navigation opens on complete separation without a timer '+index,()=>{
 const r=rig();for(const gap of approach){r.place(index,gap);r.frame();}
 r.place(index,.015);r.frame();r.final([r.children[index].id]);
});

for(const reason of ['tracking-loss','side-exit'])test('Q48: final cancelled contact leaves the earlier valid release '+reason,()=>{
 const r=rig();r.arm();r.tick([.015,-.003]);assert.deepEqual(r.opens(),[]);
 if(reason==='tracking-loss')r.hands[1].src.connected=false;else r.place(1,-.003,{side:true});
 r.frame();r.final(['nav-alpha']);assert.equal(r.events.filter(e=>e.type==='select').length,1);
});
for(const reason of ['tracking-loss','side-exit'])test('Q48: cancelled first contact is excluded from the later valid choice '+reason,()=>{
 const r=rig();r.arm();
 if(reason==='tracking-loss')r.hands[0].src.connected=false;else r.place(0,-.003,{side:true});
 r.frame();assert.deepEqual(r.opens(),[]);r.place(1,.015);r.frame();r.final(['nav-beta']);
});
test('Q48: all cancelled contacts produce no navigation',()=>{
 const r=rig();r.arm();r.hands[0].src.connected=false;r.place(1,-.003,{side:true});r.frame();
 assert.deepEqual(r.opens(),[]);assert.equal(r.p.levels.length,1);assert.equal(r.events.filter(e=>e.type==='select').length,0);
});
test('Q48: overlapping third contact extends only its original parent group',()=>{
 const r=rig({extra:true});const gaps=[.04,.04,.04];
 for(const i of [0,1])for(const gap of approach){gaps[i]=gap;r.tick(gaps);}
 gaps[0]=.015;r.tick(gaps);assert.deepEqual(r.opens(),[]);
 for(const gap of approach){gaps[2]=gap;r.tick(gaps);}
 assert.equal(r.rows[2].press.pressed,true);gaps[1]=.015;r.tick(gaps);assert.deepEqual(r.opens(),[]);
 gaps[2]=.015;r.tick(gaps);r.final(['nav-gamma']);assert.equal(r.events.filter(e=>e.type==='select').length,3);
});
test('Q48: a rearmed item can become the latest choice while a sibling remains held',()=>{
 const r=rig();r.arm();r.tick([.015,-.003]);assert.deepEqual(r.opens(),[]);
 for(const gap of approach)r.tick([gap,-.003]);assert.equal(r.rows[0].press.pressed,true);
 r.tick([.015,-.003]);r.hands[1].src.connected=false;r.frame();r.final(['nav-alpha']);
 assert.equal(r.events.filter(e=>e.type==='select'&&e.id==='nav-alpha').length,2);
});
test('Q48: leaf selection executes immediately while a navigation contact remains held',()=>{
 const r=rig({leaf:true}),selected=[];r.p.addEventListener('select',e=>selected.push(e.item.id));r.arm();
 r.tick([.015,-.003]);assert.deepEqual(selected,['leaf']);assert.deepEqual(r.opens(),[]);
 r.tick([.015,.015]);r.final(['nav-beta']);assert.deepEqual(selected,['leaf']);
});
test('Q48: a held leaf does not delay navigation and remains independently releasable',()=>{
 const r=rig({leaf:true}),selected=[];r.p.addEventListener('select',e=>selected.push(e.item.id));r.arm();
 r.tick([-.003,.015]);r.final(['nav-beta']);assert.equal(r.rows[0].press.pressed,true);
 for(let i=0;i<18;i++)r.tick([-.003,.015]);r.tick([.015,.015]);
 assert.deepEqual(selected,['leaf']);r.final(['nav-beta']);
});
test('Q48: a fresh rear contact cannot execute after singleton navigation',()=>{
 const r=rig();for(const gap of [...approach,.015]){r.place(0,gap);r.frame();}
 r.final(['nav-alpha']);r.hands[0].src.connected=false;for(let i=0;i<90;i++)r.frame();
 for(const gap of [...approach,.015]){r.place(1,gap,{frozen:false});r.frame();assert.equal(r.rows[1].press.pressed,false);}
 r.final(['nav-alpha']);
});

for(const reason of ['external-back','manipulation','palm'])test('Q48: ownership change cancels the entire pending navigation '+reason,()=>{
 const r=rig({nested:true});r.arm();r.tick([.015,-.003]);assert.deepEqual(r.opens(),[]);
 if(reason==='external-back'){r.p.back(0);r.frame();assert.equal(r.p.levels.includes(r.parent),false);}
 if(reason==='manipulation'){
  const h=r.p.levels.at(-1).moves[0],src=r.hands[0].src;r.scene.updateMatrixWorld(true);
  const scale=h.getWorldScale(new THREE.Vector3()).z,world=h.localToWorld(new THREE.Vector3(0,0,h.frontZ+.012/scale));
  r.hands[0].tip.position.copy(src.hand.worldToLocal(world));src.selecting=false;r.frame();
  src.selecting=true;r.frame();assert.ok(r.p.controls.held,'fixture: actual pinch capture');
 }
 if(reason==='palm'){
  const src=r.hands[0].src;src.hand.clear();src.hand.joints={};src.selecting=false;src.hand.position.set(0,0,0);src.hand.quaternion.identity();
  const joint=(name,x,y,z,radius=.008)=>{const j=new THREE.Group();j.position.set(x,y,z);j.jointRadius=radius;src.hand.add(j);src.hand.joints[name]=j;return j;};
  joint('wrist',0,-.04,0,.012).rotation.x=Math.PI/2;
  for(const[finger,x]of[['index',-.025],['middle',-.008],['ring',.009],['pinky',.025]]){joint(finger+'-finger-phalanx-proximal',x,.03,0);joint(finger+'-finger-tip',x,.1,0);}
  const level=r.p.levels.at(-1);r.scene.updateMatrixWorld(true);const front=level.group.localToWorld(new THREE.Vector3(0,0,level.panel.t));
  const move=gap=>{src.hand.position.set(0,0,0);r.scene.updateMatrixWorld(true);const centre=src.hand.joints.wrist.getWorldPosition(new THREE.Vector3()).lerp(src.hand.joints['middle-finger-phalanx-proximal'].getWorldPosition(new THREE.Vector3()),.5);src.hand.position.copy(front).add(new THREE.Vector3(0,0,.022+gap)).sub(centre);r.frame();};
  move(.04);move(-.01);assert.equal(r.p.palmOwner,src.id,'fixture: actual broad-hand acquisition');
 }
 assert.equal(r.rows[1].press.pressed,false);r.place(1,.015);r.frame();assert.deepEqual(r.opens(),[]);
});

for(const sameFrame of [false,true])test('Q48: controller ray capture shares the delayed navigation policy, sameFrame='+sameFrame,()=>{
 const r=rig();
 const ray=(i,down)=>{const{src,tip}=r.hands[i];src.connected=true;src.hand.visible=tip.visible=false;src.selecting=down;const target=r.point(i,0,{frozen:false});src.ray.position.copy(target).add(new THREE.Vector3(0,0,.5));src.ray.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,0,-1));};
 ray(0,false);ray(1,false);r.frame();ray(0,true);ray(1,true);r.frame();assert.ok(r.rows.every(row=>row.press.pressed));
 ray(0,false);if(sameFrame)ray(1,false);r.frame();
 if(!sameFrame){assert.deepEqual(r.opens(),[]);ray(1,false);r.frame();}
 r.final(['nav-beta']);
});
test('Q48: multiple contacts on the same item cannot create duplicate navigation',()=>{
 const r=rig();
 for(const gap of approach){for(const{src,tip}of r.hands){src.connected=true;tip.position.copy(src.hand.worldToLocal(r.point(0,gap)));}r.frame();}
 assert.equal(r.rows[0].press.pressed,true);assert.equal(r.rows[1].press.pressed,false);
 for(const{src,tip}of r.hands)tip.position.copy(src.hand.worldToLocal(r.point(0,.015)));r.frame();
 r.final(['nav-alpha']);assert.equal(r.events.filter(e=>e.type==='select').length,1);
});

for(const action of ['back','resetInteraction','cancelSelections'])for(const order of [[0,1],[1,0]])
 test('Q48: a leaf callback cancellation invalidates same-frame navigation '+action+' order='+order,()=>{
  const r=rig({leaf:true}),selected=[];
  r.p.addEventListener('select',e=>{selected.push(e.item.id);if(action==='back')r.p.back(0);else r.p[action]();});
  r.arm(order);r.tick([.015,.015]);assert.deepEqual(selected,['leaf']);
  assert.deepEqual(r.opens(),[],'cancelled collected navigation cannot reappear after a callback');assert.equal(r.p.levels.length,1);
 });
