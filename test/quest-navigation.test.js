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

function rig({ reversed = false, nested = false } = {}) {
  const alpha = { id: 'nav-alpha', label: 'Alpha', items: [{ id: 'alpha-leaf', label: 'Alpha leaf' }] };
  const beta = { id: 'nav-beta', label: 'Beta', items: [{ id: 'beta-leaf', label: 'Beta leaf' }] };
  const children = reversed ? [beta, alpha] : [alpha, beta];
  const p = new PackagingPanel(T, { title: 'Catalog', layerSpacing: .7,
    items: nested ? [{ id: 'nav-group', label: 'Group', items: children }] : children });
  p.scale.setScalar(1.5);
  if (nested) p.levels[0].rows[0].dispatchEvent({ type: 'select' }); // arrange original parent
  const scene = new THREE.Scene(); scene.add(p);
  const camera = new THREE.PerspectiveCamera(); camera.position.y = 1.6; scene.add(camera);
  for (let i = 0; i < 120; i++) { scene.updateMatrixWorld(true); p.update(dt); }
  const group = () => new THREE.Group();
  const input = new InputSystem({ T, scene, camera, renderer: { domElement: { addEventListener() {} },
    xr: { isPresenting: true, getController: group, getControllerGrip: group, getHand: group } } });
  const hands = input.xr.map(src => {
    src.connected = false; src.grip.visible = false;
    const tip = new THREE.Group(); tip.jointRadius = .008; src.hand.add(tip);
    src.hand.joints = { 'index-finger-tip': tip };
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
  const gaps = [.04, .04];
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
      'independent sibling navigation must never nest one sibling under the other');
  };
  return { p, scene, input, hands, parent, rows, children, events, starts, frames, frame, point, place, tick, arm, opens, final };
}

for (const order of [[1, 0], [0, 1]]) test('Q39: same-frame releases follow press-start epoch ' + order.join(','), () => {
  const r = rig(); r.arm(order);
  assert.ok(r.starts.get(r.rows[order[0]]).epoch < r.starts.get(r.rows[order[1]]).epoch);
  r.tick([.015, .015]);
  r.final(order.map(i => r.children[i].id));
  assert.equal(r.events.filter(e => e.type === 'select').length, 2);
});

test('Q39: equal press/release epochs use stable item IDs, not reverse row order', () => {
  const r = rig({ reversed: true }); r.arm([0, 1], true);
  assert.equal(r.starts.get(r.rows[0]).epoch, r.starts.get(r.rows[1]).epoch);
  r.tick([.015, .015]);
  r.final(['nav-alpha', 'nav-beta']);
});

for (const first of [0, 1]) test('Q39: release frames outrank press order and retained parent survives real recede, first=' + first, () => {
  const r = rig(); r.arm([1 - first, first]);
  const gaps = [-.003, -.003]; gaps[first] = .015; r.tick(gaps);
  assert.deepEqual(r.opens(), [r.children[first].id]);
  const pending = 1 - first, fixed = r.hands[pending].tip.getWorldPosition(new THREE.Vector3());
  assert.equal(r.rows[pending].press.pressed, true, 'an already-held original-parent contact must survive sibling open');
  for (let i = 0; i < 18; i++) {
    r.tick(gaps);
    assert.equal(r.rows[pending].press.pressed, true, 'visual recession must not fabricate physical separation');
    assert.equal(r.opens().length, 1);
    assert.ok(r.hands[pending].tip.getWorldPosition(new THREE.Vector3()).distanceTo(fixed) < 1e-8);
  }
  assert.ok(r.parent.cur.z < -.001, 'fixture must actually move the visible parent back');
  gaps[pending] = .015; r.tick(gaps);
  r.final([r.children[first].id, r.children[pending].id]);
});

test('Q39: an untouched rear row cannot acquire a new contact after sibling opens', () => {
  const r = rig();
  for (const gap of approach) { r.place(0, gap); r.frame(); }
  r.place(0, .015); r.frame();
  assert.deepEqual(r.opens(), ['nav-alpha']);
  r.hands[0].src.connected = false;
  for (let i = 0; i < 90; i++) r.frame();
  for (const gap of [...approach, .015]) {
    r.place(1, gap, { frozen: false }); r.frame();
    assert.equal(r.rows[1].press.pressed, false, 'rear row is only eligible for a previously-held contact');
  }
  assert.deepEqual(r.opens(), ['nav-alpha']);
  assert.equal(r.events.some(e => e.id === 'nav-beta' && e.type === 'select'), false);
});

for (const reason of ['tracking-loss', 'side-exit', 'external-back', 'manipulation', 'palm'])
  test('Q39: retained parent claim cancels on ' + reason + ' and cannot execute on later separation', () => {
    const r = rig({ nested: true }); r.arm([1, 0]);
    r.tick([.015, -.003]);
    assert.deepEqual(r.opens(), ['nav-alpha']);
    assert.equal(r.rows[1].press.pressed, true, 'fixture needs an actual retained parent claim');
    if (reason === 'tracking-loss') { r.hands[1].src.connected = false; r.frame(); }
    if (reason === 'side-exit') { r.place(1, -.003, { side: true }); r.frame(); }
    if (reason === 'external-back') { r.p.back(0); r.frame(); assert.equal(r.p.levels.includes(r.parent), false); }
    if (reason === 'manipulation') {
      const h = r.p.levels.at(-1).moves[0], src = r.hands[0].src;
      r.scene.updateMatrixWorld(true);
      const scale = h.getWorldScale(new THREE.Vector3()).z;
      const world = h.localToWorld(new THREE.Vector3(0, 0, h.frontZ + .012 / scale));
      r.hands[0].tip.position.copy(src.hand.worldToLocal(world)); src.selecting = false; r.frame();
      src.selecting = true; r.frame(); assert.ok(r.p.controls.held, 'fixture: actual pinch must capture the side handle');
    }
    if (reason === 'palm') {
      const src = r.hands[0].src; src.hand.clear(); src.hand.joints = {}; src.selecting = false;
      src.hand.position.set(0, 0, 0); src.hand.quaternion.identity();
      const joint = (name, x, y, z, radius = .008) => {
        const j = new THREE.Group(); j.position.set(x, y, z); j.jointRadius = radius;
        src.hand.add(j); src.hand.joints[name] = j; return j;
      };
      joint('wrist', 0, -.04, 0, .012).rotation.x = Math.PI / 2;
      for (const [finger, x] of [['index', -.025], ['middle', -.008], ['ring', .009], ['pinky', .025]]) {
        joint(finger + '-finger-phalanx-proximal', x, .03, 0);
        joint(finger + '-finger-tip', x, .1, 0);
      }
      const level = r.p.levels.at(-1); r.scene.updateMatrixWorld(true);
      const front = level.group.localToWorld(new THREE.Vector3(0, 0, level.panel.t));
      const movePalm = gap => {
        src.hand.position.set(0, 0, 0); r.scene.updateMatrixWorld(true);
        const centre = src.hand.joints.wrist.getWorldPosition(new THREE.Vector3())
          .lerp(src.hand.joints['middle-finger-phalanx-proximal'].getWorldPosition(new THREE.Vector3()), .5);
        src.hand.position.copy(front).add(new THREE.Vector3(0, 0, .022 + gap)).sub(centre); r.frame();
      };
      movePalm(.04); movePalm(-.01);
      assert.equal(r.p.palmOwner, src.id, 'fixture: broad hand must acquire Push through InputSystem');
    }
    assert.equal(r.rows[1].press.pressed, false, 'invalidated original-parent contact must cancel');
    r.place(1, .015); r.frame();
    assert.deepEqual(r.opens(), ['nav-alpha']);
    assert.equal(r.events.some(e => e.id === 'nav-beta' && e.type === 'select'), false);
  });

test('Q39: retaining one rear owner does not license a new hand on that same row', () => {
  const r = rig(); r.arm([1, 0]); r.tick([.015, -.003]);
  assert.equal(r.rows[1].press.pressed, true, 'fixture needs a retained Beta owner');
  assert.deepEqual(r.opens(), ['nav-alpha']);
  // xr1 owns Beta. xr0 is fresh on Beta's CURRENT visible rear surface.
  for (const gap of approach) {
    const src = r.hands[0].src;
    r.hands[0].tip.position.copy(src.hand.worldToLocal(r.point(1, gap, { frozen: false })));
    r.frame();
    assert.deepEqual(r.opens(), ['nav-alpha']);
  }
  r.hands[1].src.connected = false; r.frame();
  const src = r.hands[0].src;
  r.hands[0].tip.position.copy(src.hand.worldToLocal(r.point(1, .015, { frozen: false }))); r.frame();
  assert.deepEqual(r.opens(), ['nav-alpha']);
  assert.equal(r.events.some(e => e.id === 'nav-beta' && e.type === 'select'), false,
    'loss of the original owner cannot leave a new rear claim that executes');
});
