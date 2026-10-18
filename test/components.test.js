// Unit tests for the interaction logic behind the components. These run in
// Node without a browser: the logic is kept separate from rendering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createTokens } from '../src/tokens.js';
import { Hysteresis } from '../src/core/Hysteresis.js';
import { PressModel } from '../src/core/PressModel.js';
import { cubicBezier } from '../src/core/easing.js';
import { springStep } from '../src/core/spring.js';
import { packagingPose } from '../src/components/PackagingPanel.js';
import { magnifyScale, LazyFollow } from '../src/components/Dock.js';
import { detentIndex, shadowAt } from '../src/components/ZSlider.js';

const json = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url)));
const T = createTokens(json);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('tokens convert to scene units', () => {
  near(T.get('material.t.regular'), 0.008); // 8 mm
  near(T.get('material.density.firm.recover'), 0.14); // 140 ms
  near(T.dmm('size.button.default', 0.6), 0.036); // 60 dmm at 0.6 m
  near(T.get('anchor.eccentricity.vertical'), (-25 * Math.PI) / 180);
  assert.equal(T.get('anchor.mode'), 'body-lock');
  assert.throws(() => T.get('nope.missing'), /unknown token/);
  assert.throws(() => T.dmm('material.t.regular', 1), /not dmm/);
});

test('every token name used in src/ exists in tokens.json', () => {
  const files = ['src/components', 'src/core'].flatMap(d =>
    readdirSync(new URL(`../${d}`, import.meta.url)).map(f => `${d}/${f}`));
  const used = new Set();
  for (const f of files) {
    const code = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const m of code.matchAll(/T\.(?:get|dmm)\(\s*'([^']+)'/g)) used.add(m[1]);
    // Template names like `material.density.${density}.press`.
    for (const m of code.matchAll(/T\.(?:get|dmm)\(\s*`([^`]+)`/g)) {
      for (const v of ['soft', 'firm', 'rigid', 'thin', 'regular', 'thick']) {
        const name = m[1].replace(/\$\{[^}]+\}/, v);
        if (T.names().includes(name)) used.add(name);
      }
    }
  }
  const missing = [...used].filter(n => !T.names().includes(n));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 30, `expected the components to read many tokens, found ${used.size}`);
});

test('hysteresis does not flicker inside the band', () => {
  const h = new Hysteresis(0.1, 0.14);
  assert.equal(h.update(0.12), false); // approaching, not yet in
  assert.equal(h.update(0.09), true); // in
  assert.equal(h.update(0.13), true); // still in: inside the band
  assert.equal(h.update(0.15), false); // out
});

test('press depth is density x thickness, and follows the finger', () => {
  const t = T.get('material.t.regular');
  const p = new PressModel({ thickness: t, pressRatio: 0.4, recover: 0.14, release: T.get('proximity.poke.release') });
  near(p.maxDepth, 0.0032); // firm 0.4 x 8 mm
  assert.equal(p.update(0.016, -0.01, true), null); // hovering in front
  assert.equal(p.update(0.016, 0.001, true), 'press'); // touched
  near(p.depth, 0.001);
  p.update(0.016, 0.02, true); // finger goes far past: depth caps
  near(p.depth, 0.0032);
});

test('release needs the finger to retreat proximity.poke.release', () => {
  const p = new PressModel({ thickness: 0.008, pressRatio: 0.4, recover: 0.14, release: 0.003 });
  p.update(0.016, -0.01, true);
  p.update(0.016, 0.003, true); // pressed, deepest 3 mm
  assert.equal(p.update(0.016, 0.001, true), null); // 2 mm back: still pressed
  assert.equal(p.pressed, true);
  assert.equal(p.update(0.016, -0.0005, true), 'release'); // 3.5 mm back
});

test('recovery takes exactly the density recover time', () => {
  const p = new PressModel({ thickness: 0.008, pressRatio: 0.6, recover: 0.22, release: 0.003 });
  p.update(0.016, -0.01, true);
  p.update(0.016, 0.01, true);
  p.update(0.016, -0.01, true); // release
  for (let i = 0; i < 9; i++) p.update(0.02, null, false); // 196 ms after release
  assert.ok(p.depth > 0, 'still recovering before 220 ms');
  p.update(0.03, null, false); // 226 ms
  near(p.depth, 0);
});

test('a finger already behind the face cannot start a press', () => {
  const p = new PressModel({ thickness: 0.008, pressRatio: 0.4, recover: 0.14, release: 0.003 });
  assert.equal(p.update(0.016, null, false), null); // no finger yet
  assert.equal(p.update(0.016, 0.005, true), null); // appears behind the face
});

test('a soft surface lags behind a retreating finger', () => {
  const p = new PressModel({ thickness: 0.008, pressRatio: 0.6, recover: 0.22, release: 0.003 });
  p.update(0.016, -0.01, true);
  p.update(0.016, 0.0048, true); // full soft depth
  p.update(0.016, 0.0025, true); // finger lifts 2.3 mm in one frame
  assert.ok(p.depth > 0.0025, 'surface is still on its way back up');
});

test('ease-out curve from tokens', () => {
  const ease = cubicBezier(T.get('motion.hover.in.easing'));
  near(ease(0), 0);
  near(ease(1), 1);
  assert.ok(ease(0.5) > 0.5, 'ease-out is ahead of linear at the midpoint');
});

test('critically damped follow never overshoots', () => {
  const s = { x: 0, v: 0 };
  let max = 0;
  for (let i = 0; i < 200; i++) max = Math.max(max, springStep(s, 1, T.get('anchor.follow.frequency'), 1 / 60));
  assert.ok(max <= 1 + 1e-9, `overshot to ${max}`);
  near(s.x, 1, 1e-3);
});

test('dock waits anchor.follow.delay before following a turn', () => {
  const f = new LazyFollow({ delay: T.get('anchor.follow.delay'), omega: 6, threshold: 0.35 });
  f.update(1 / 60, 0);
  for (let t = 0; t < 0.3; t += 1 / 60) f.update(1 / 60, 1); // turned 57 degrees, 300 ms
  near(f.yaw.x, 0); // still waiting
  for (let t = 0; t < 2; t += 1 / 60) f.update(1 / 60, 1);
  near(f.yaw.x, 1, 0.02); // followed
});

test('dock ignores a short glance', () => {
  const f = new LazyFollow({ delay: 0.35, omega: 6, threshold: 0.35 });
  f.update(1 / 60, 0);
  for (let t = 0; t < 0.2; t += 1 / 60) f.update(1 / 60, 1);
  for (let t = 0; t < 1; t += 1 / 60) f.update(1 / 60, 0);
  near(f.yaw.x, 0);
});

test('dock magnify uses the cosine falloff', () => {
  const r = T.dmm('dock.magnify.radius', 0.55), max = T.get('dock.magnify.scale.max');
  near(magnifyScale(0, r, max), 1.6);
  near(magnifyScale(r, r, max), 1);
  near(magnifyScale(r / 2, r, max), 1 + 0.6 * Math.cos(Math.PI / 4));
});

test('packaging compress recedes, fades and never drops below the minimum', () => {
  const p = {
    recedeZ: T.get('packaging.parent.recede.z'), recedeY: T.get('packaging.parent.recede.y'),
    recedeScale: T.get('packaging.parent.recede.scale'), opacityStart: T.get('packaging.parent.recede.opacity.start'),
    opacityStep: T.get('packaging.parent.recede.opacity.step'), opacityMin: T.get('packaging.parent.recede.opacity.min'),
  };
  assert.deepEqual(packagingPose(p, 'compress', 2, 2), { z: -0, y: 0, scale: 1, opacity: 1 });
  const one = packagingPose(p, 'compress', 1, 2);
  near(one.z, -0.05); near(one.y, 0.035); near(one.scale, 0.92); near(one.opacity, 0.6);
  near(packagingPose(p, 'compress', 0, 3).opacity, 0.32);
  near(packagingPose(p, 'compress', 0, 9).opacity, 0.3);
  assert.equal(packagingPose(p, 'replace', 0, 1).opacity, 0);
  near(packagingPose(p, 'protrude', 2, 2).z, 0.1);
  assert.equal(packagingPose(p, 'compress', 3, 2), null);
});

test('z-slider detents tick every interval, shadow grows with push', () => {
  const i = T.get('feedback.detent.interval');
  assert.equal(detentIndex(0.05, i), 0);
  assert.equal(detentIndex(0.1, i), 1);
  assert.equal(detentIndex(0.3, i), 3); // floating point safe
  assert.equal(detentIndex(1, i), 10);
  const s = shadowAt(1, T.get('feedback.shadow.press.scale'), 0.15, 0.6);
  near(s.scale, 1.9); near(s.opacity, 0.6);
});
