import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTokens, flattenTokens } from '../src/tokens.js';
import { tokens as built, viewSize, touchSize } from '../dist/tokens.js';

const source = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url)));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('vpt and metre tokens convert at the runtime loading boundary', () => {
  const map = flattenTokens({
    face: { $type: 'dimension', $value: { value: 80, unit: 'vpt' } },
    depth: { $type: 'dimension', $value: { value: 0.008, unit: 'm' } },
  });
  near(map.get('face').value, 0.06);
  near(map.get('depth').value, 0.008);
});

test('live JSON aliases agree with generated scene values', () => {
  const T = createTokens(source);
  for (const name of T.names()) {
    const expected = name.split('.').reduce((v, key) => v[key], built);
    assert.deepEqual(T.get(name), expected, name);
  }
  assert.equal(T.meta('material.thickness.regular').unit, 'm');
  assert.equal(T.meta('material.thickness.regular').alias, '{thickness.200}');
});

test('runtime uses the patched input, not a cached generated token module', () => {
  const patched = structuredClone(source);
  patched.thickness['200'].$value.value = 0.012;
  patched.duration['120'].$value.value = 180;
  const T = createTokens(patched);
  near(T.get('material.thickness.regular'), 0.012);
  near(T.get('motion.enter.duration'), 0.18);
});

test('placement sizing agrees at hand, reach, knee and room distances', () => {
  const T = createTokens(source);
  for (const d of [0.1, 0.6, 1, 1.75, 3]) {
    near(T.viewSize('size.interactive.default', d), viewSize(0.06, d));
    near(T.touchSize('size.interactive.default', d), touchSize(0.06, d));
    near(T.get('input.hover.distance.enter'), 0.1);
  }
  near(T.viewSize('size.interactive.default', 3), 0.1425);
  near(T.touchSize('size.interactive.default', 0.1), 0.022);
  assert.throws(() => T.viewSize('input.hover.distance.enter', 1), /not a view size/);
});

test('bad aliases and units report the token path', () => {
  assert.throws(() => flattenTokens({ face: { $value: '{missing}' } }), /face.*no token/);
  assert.throws(() => flattenTokens({ a: { $value: '{b}' }, b: { $value: '{a}' } }), /alias loop/);
  assert.throws(() => flattenTokens({ face: { $type: 'dimension', $value: { value: 1, unit: 'px' } } }), /face.*px/);
});
