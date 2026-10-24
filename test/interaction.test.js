// Regression tests for the PR #3 review: interrupted Packaging navigation,
// press ownership with several hands or rays, the Dock's ray-pinned dent,
// and reduced motion. These build the real components in Node (run with
// test/support/register.mjs; nothing draws, the interaction logic runs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTokens } from '../src/tokens.js';
import { pickProbe } from '../src/core/Interactable.js';
import { PackagingStack, packagingPose } from '../src/core/packaging.js';
import { springTo } from '../src/core/spring.js';
import { Button } from '../src/components/Button.js';
import { DockIcon } from '../src/components/DockIcon.js';
import { nearestApp } from '../src/components/Dock.js';
import { PackagingPanel } from '../src/components/PackagingPanel.js';

const T = createTokens(JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url))));
const dt = 1 / 60;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// ---------------------------------------------------------------------------
// Packaging: interrupted navigation

const catalog = () => new PackagingPanel(T, {
  title: 'Catalog',
  items: [
    { label: 'Sofas', items: [{ label: 'Modular', items: [{ label: 'Ottoman' }] }, { label: 'Sectional', items: [{ label: 'Corner' }] }] },
    { label: 'Tables', items: [{ label: 'Dining' }] },
  ],
});
const run = (panel, frames) => { for (let i = 0; i < frames; i++) panel.update(dt); };
const select = row => row.dispatchEvent({ type: 'select' });
const labels = levels => levels.map(l => l.item.label);

// Who takes input: only the front level's rows, and the panels behind it.
function assertGates(panel) {
  panel.levels.forEach((l, i) => {
    const front = i === panel.active;
    assert.ok(l.rows.every(r => r.enabled === front), `${l.item.label} rows enabled = ${front}`);
    assert.equal(l.panel.enabled, true, `${l.item.label} title is a move/back target`);
    assert.equal(l.panel.inside(new THREE.Vector3(0, 0, 0)), false, 'body is not a back target');
  });
  for (const l of panel.closing) {
    assert.ok(l.rows.every(r => !r.enabled), `closing ${l.item.label} rows take no input`);
    assert.equal(l.panel.enabled, false, `closing ${l.item.label} panel takes no input`);
  }
}

test('packaging: open A, back, open B before A has closed', () => {
  const p = catalog();
  select(p.levels[0].rows[0]);           // Sofas
  run(p, 3);
  p.back();                              // Sofas starts closing
  run(p, 1);
  assert.ok(p.closing.length === 1 && !p.settled, 'Sofas is still on its way out');
  select(p.levels[0].rows[1]);           // Tables, at once
  run(p, 2);                             // used to throw: Tables was posed as level 2 of 1
  assert.equal(p.active, 1);
  assert.deepEqual(labels(p.levels), ['Catalog', 'Tables']);
  assert.deepEqual(labels(p.closing), ['Sofas']);
  assertGates(p);
  // Tables goes where Sofas was going: the front position.
  const front = packagingPose(p.pose, p.mode, 1, 1);
  near(p.levels[1].to.z, front.z); near(p.levels[1].to.sx, front.scale);
  run(p, 400);
  assert.ok(p.settled);
  assert.deepEqual(p.closing, []);
  assert.equal(p.children.filter(c => c.isGroup).length, 2, 'the closed level is removed');
});

test('packaging: nested back and reopen while levels are still moving', () => {
  const p = catalog();
  select(p.levels[0].rows[0]); run(p, 2);       // Sofas
  select(p.levels[1].rows[0]); run(p, 2);       // Modular
  p.back(0); run(p, 1);                         // both close at once
  assert.deepEqual(labels(p.closing), ['Sofas', 'Modular']);
  select(p.levels[0].rows[0]); run(p, 1);       // Sofas again, a new level
  select(p.levels[1].rows[0]); run(p, 1);       // and Modular
  p.back(); run(p, 1);
  select(p.levels[1].rows[1]); run(p, 1);       // Sectional
  assert.deepEqual(labels(p.levels), ['Catalog', 'Sofas', 'Sectional']);
  assert.equal(p.active, 2);
  assertGates(p);
  p.levels[0].panel.dispatchEvent({ type: 'select' });   // press the root: back to it
  run(p, 1);
  assert.equal(p.active, 0);
  assertGates(p);
  run(p, 400);
  assert.ok(p.settled);
  assert.deepEqual(p.closing, []);
});

test('packaging: a level on its way out opens nothing and goes nowhere', () => {
  const p = catalog();
  const opened = [], back = [];
  p.addEventListener('open', e => opened.push(e.level));
  p.addEventListener('back', e => back.push(e.level));
  select(p.levels[0].rows[0]); run(p, 2);
  const sofas = p.levels[1];
  p.back(); run(p, 1);
  select(sofas.rows[0]);                          // a row of the closing level
  sofas.panel.dispatchEvent({ type: 'select' });  // its window
  p.back(); p.back(-1); p.back(5);                // nothing to go back to
  assert.deepEqual(opened, [1]);
  assert.deepEqual(back, [0]);
  assert.equal(p.active, 0);
});

test('packaging stack: depth is the logical index, closing levels kept apart', () => {
  const s = new PackagingStack();
  const mk = () => ({ cur: {}, from: { x: 0, y: 0, z: 0, sx: 0.5, sy: 0.5 } });
  const [root, a, b] = [mk(), mk(), mk()];
  s.push(root); s.push(a);
  assert.deepEqual(s.popTo(0), [a]);
  assert.equal(s.push(b), 1);
  assert.equal(b.depth, 1);
  assert.deepEqual(s.all, [root, b, a]);
  assert.deepEqual(s.popTo(1), []);       // already in front
  assert.deepEqual(s.sweep(l => l === a), [a]);
  assert.deepEqual(s.all, [root, b]);
});

// ---------------------------------------------------------------------------
// Packaging: reduced motion

const transform = c => [c.x, c.y, c.z, c.sx, c.sy];

test('packaging, reduced motion: levels fade in place instead of travelling', () => {
  const p = catalog();
  p.reducedMotion = true;
  select(p.levels[0].rows[0]);
  const sofas = p.levels[1], root = p.levels[0];
  run(p, 1);
  // No growth out of the row, no recede travel: both are where they belong at once.
  assert.deepEqual(transform(sofas.cur), transform(sofas.to));
  assert.deepEqual(transform(root.cur), transform(root.to));
  // Hierarchy still reads, by fading: the child fades in, the parent dims.
  assert.ok(sofas.cur.opacity > 0 && sofas.cur.opacity < 1, `child fading in (${sofas.cur.opacity})`);
  assert.ok(root.cur.dim > 0 && root.cur.dim < root.to.dim, 'parent dimming');
  run(p, 300);
  near(sofas.cur.opacity, 1, 1e-3);
  // Back: the child fades where it is, it doesn't shrink into its row.
  const at = transform(sofas.cur);
  p.back(); run(p, 2);
  assert.deepEqual(transform(sofas.cur), at);
  assert.ok(sofas.cur.opacity < 1);
  // Interrupting still works.
  select(p.levels[0].rows[1]); run(p, 1);
  assert.deepEqual(labels(p.levels), ['Catalog', 'Tables']);
  assertGates(p);
});

test('packaging, full motion: the child grows out of its row', () => {
  const p = catalog();
  p.reducedMotion = false;
  select(p.levels[0].rows[0]);
  run(p, 1);
  const sofas = p.levels[1];
  assert.ok(sofas.cur.sx < 0.99 * sofas.to.sx, 'still growing');
  assert.ok(Math.abs(sofas.cur.z - sofas.to.z) > 1e-4, 'still travelling');
});

test('packaging follows the viewer\'s reduced-motion setting by default', () => {
  const query = { matches: true };
  globalThis.matchMedia = () => query;
  try {
    const p = catalog();
    select(p.levels[0].rows[0]); run(p, 1);
    assert.deepEqual(transform(p.levels[1].cur), transform(p.levels[1].to));
    query.matches = false;
    p.back(); run(p, 30);
    select(p.levels[0].rows[1]); run(p, 1);
    assert.ok(p.levels[1].cur.sx < 0.99 * p.levels[1].to.sx, 'full motion again');
  } finally { query.matches = false; }
});

// ---------------------------------------------------------------------------
// Press ownership

test('pickProbe: the pressing source keeps the press; ties go to a captured ray', () => {
  const d = () => 0;
  const hover = { id: 'xr0', kind: 'ray', pressed: false };
  const pinch = { id: 'xr1', kind: 'ray', pressed: true, captured: true };
  assert.equal(pickProbe([hover, pinch], d).probe, pinch);
  assert.equal(pickProbe([hover, pinch], d, 'xr1').probe, pinch);
  assert.equal(pickProbe([hover], d, 'xr1').lost, true);
  assert.equal(pickProbe([hover], d, 'xr1').probe, null);
  assert.equal(pickProbe([], d).probe, null);
});

// A ray probe at a point on the button's face.
const ray = (b, id, { pressed = false, captured = pressed, x = 0, y = 0 } = {}) =>
  ({ kind: 'ray', id, point: new THREE.Vector3(x, y, b.t), pressed, captured });
function frame(target, probes) {
  for (const p of probes) target.feed(p);
  target.update(dt);
}
function record(target) {
  const ev = [];
  for (const t of ['press', 'release', 'select', 'cancel']) target.addEventListener(t, () => ev.push(t));
  return ev;
}

test('button: a hovering ray neither steals nor ends another ray\'s press', () => {
  const b = new Button(T, { width: 60, height: 44, variant: 'glass' });
  const ev = record(b);
  frame(b, [ray(b, 'xr0'), ray(b, 'xr1')]);
  frame(b, [ray(b, 'xr0'), ray(b, 'xr1', { pressed: true })]);   // xr1 pinches
  assert.deepEqual(ev, ['press']);
  for (let i = 0; i < 10; i++) frame(b, [ray(b, 'xr0'), ray(b, 'xr1', { pressed: true })]);
  assert.deepEqual(ev, ['press'], 'no early release while xr0 hovers');
  frame(b, [ray(b, 'xr0'), ray(b, 'xr1')]);                     // xr1 lets go
  assert.deepEqual(ev, ['press', 'release', 'select']);
});

test('button: if the pressing source disappears the press is cancelled, no select', () => {
  const b = new Button(T, { width: 60, height: 44, variant: 'glass' });
  const ev = record(b);
  frame(b, [ray(b, 'xr0'), ray(b, 'xr1')]);
  frame(b, [ray(b, 'xr0'), ray(b, 'xr1', { pressed: true })]);
  frame(b, [ray(b, 'xr0')]);                                     // xr1's tracking is lost
  assert.deepEqual(ev, ['press', 'cancel']);
  for (let i = 0; i < 5; i++) frame(b, [ray(b, 'xr0')]);
  assert.deepEqual(ev, ['press', 'cancel']);
});

test('button: a pinch dragged onto it does not press it', () => {
  const b = new Button(T, { width: 60, height: 44, variant: 'glass' });
  const ev = record(b);
  frame(b, [ray(b, 'xr0')]);
  for (let i = 0; i < 5; i++) frame(b, [ray(b, 'xr0'), ray(b, 'xr1', { pressed: true, captured: false })]);
  assert.deepEqual(ev, []);
});

// ---------------------------------------------------------------------------
// Dock

const dockIcon = () => { const i = new DockIcon(T, { label: 'Clock', icon: 'clock' }, 0.6); i.exclusive = true; return i; };
// A probe on the bubble's skin (r = 1) or inside it (r < 1), in direction `dir`.
const at = (icon, dir, r = 1) => icon.centre.clone().addScaledVector(dir.clone().normalize(), icon.rb * r);
function dockFrame(icon, probes) {
  for (const p of probes) icon.feed(p);
  icon.sense();
  icon.update(dt);
}
const front = new THREE.Vector3(0, 0, 1), upLeft = new THREE.Vector3(-0.5, 0.5, 1);

test('dock: a ray press pins the dent where the pinch began', () => {
  const icon = dockIcon();
  const r = (dir, pressed) => ({ kind: 'ray', id: 'xr1', point: at(icon, dir), pressed, captured: pressed });
  for (let i = 0; i < 20; i++) dockFrame(icon, [r(front, false)]);
  for (let i = 0; i < 3; i++) dockFrame(icon, [r(front, true)]);
  const start = icon.dentAt.clone();
  for (let i = 0; i < 20; i++) dockFrame(icon, [r(upLeft, true)]);  // eyes drift while pinching
  assert.ok(icon.dentAt.angleTo(start) < 1e-6, `dent moved ${icon.dentAt.angleTo(start)} rad`);
});

test('dock: a fingertip still drags the dent along', () => {
  const icon = dockIcon();
  const poke = (dir, r) => ({ kind: 'poke', id: 'xr0', point: at(icon, dir, r) });
  for (let i = 0; i < 20; i++) dockFrame(icon, [poke(front, 1.2)]);
  for (let i = 0; i < 3; i++) dockFrame(icon, [poke(front, 0.9)]);
  const start = icon.dentAt.clone();
  for (let i = 0; i < 20; i++) dockFrame(icon, [poke(upLeft, 0.9)]);
  assert.ok(icon.dentAt.angleTo(start) > 0.3, 'dent follows the finger');
});

test('dock: a hovering ray neither steals nor ends another ray\'s press', () => {
  const icon = dockIcon();
  const ev = record(icon);
  const r = (id, pressed = false) => ({ kind: 'ray', id, point: at(icon, front), pressed, captured: pressed });
  for (let i = 0; i < 20; i++) dockFrame(icon, [r('xr0'), r('xr1')]);
  dockFrame(icon, [r('xr0'), r('xr1', true)]);
  for (let i = 0; i < 10; i++) dockFrame(icon, [r('xr0'), r('xr1', true)]);
  assert.deepEqual(ev, ['press']);
  dockFrame(icon, [r('xr0'), r('xr1')]);
  assert.deepEqual(ev, ['press', 'release', 'select']);
});

test('dock: a pressed app keeps the one bubble while a ray passes a neighbour', () => {
  const app = (pressed, best) => ({ press: { pressed }, best });
  // App 2 is pressed; app 0 is hovered by another ray (also distance 0).
  assert.equal(nearestApp([app(false, { captured: false }), app(false, null), app(true, { captured: true })], [0, Infinity, 0]), 2);
  // Before the press starts: of two rays on two apps, the one pinching goes first.
  assert.equal(nearestApp([app(false, { captured: false }), app(false, { captured: true })], [0, 0]), 1);
  // A finger: the nearest.
  assert.equal(nearestApp([app(false, {}), app(false, {})], [0.02, 0.01]), 1);
});

// ---------------------------------------------------------------------------
// Shared spring

test('springTo matches the spring Button used to carry (same response and damping)', () => {
  // Button's former local integrator, kept here as the reference.
  function spring(x, v, target, response, damping, dt) {
    const w = 2 * Math.PI / response;
    for (let i = 0, n = 4, h = dt / n; i < n; i++) {
      v += (-w * w * (x - target) - 2 * damping * w * v) * h;
      x += v * h;
    }
    return { x, v };
  }
  for (const [response, damping] of [[0.35, 0.6], [0.2, 1], [0.12, 0.45]]) {
    let a = { x: 0, v: 0 };
    const b = { x: 0, v: 0 };
    for (let i = 0; i < 120; i++) {
      const target = i < 60 ? 0.004 : 0;
      a = spring(a.x, a.v, target, response, damping, dt);
      springTo(b, target, response, damping, dt);
      assert.equal(b.x, a.x); assert.equal(b.v, a.v);
    }
  }
});
