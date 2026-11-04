// Regression tests for the arena checks. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTokens, withOverrides, getNode, affectedPaths } from '../lib/tokens.mjs';
import { runChecks } from '../lib/checks.mjs';

const base = loadTokens();
const experiment = variants => ({
  exp: { variants, baseline: 'base' },
  variants: Object.entries(variants).map(([name, o]) => ({ name, tokens: withOverrides(base, o) })),
  baseTokens: base,
});

test('motion.enter.duration still points at duration.120', () => {
  assert.equal(getNode(base, 'motion.enter.duration', false).$value, '{duration.120}');
});

test('affectedPaths follows aliases to the primitive they point at', () => {
  const affected = affectedPaths(base, ['duration.120']);
  assert.ok(affected.has('duration.120'));
  assert.ok(affected.has('motion.enter.duration'));
  assert.ok(!affected.has('motion.expand.duration'));
});

test('a primitive patch that breaks a motion rule through an alias fails the variant', () => {
  const { results, system } = runChecks(experiment({ base: {}, slow: { 'duration.120': 1000 } }));
  const row = results.slow.rows.find(r => r.id === 'motion:ui-under-300ms');
  assert.equal(results.slow.level, 'fail');
  assert.equal(row?.level, 'fail');
  assert.match(row.detail, /^motion\.enter\.duration: 1000 ms/);
  assert.ok(!system.some(f => f.path === 'motion.enter.duration'), 'a varied token is not a system finding');
});

test('patching the alias directly still fails the variant', () => {
  const { results } = runChecks(experiment({ base: {}, slow: { 'motion.enter.duration': 1000 } }));
  assert.equal(results.slow.level, 'fail');
});

test('the unpatched baseline is not blocked by motion rules', () => {
  const { results } = runChecks(experiment({ base: {}, slow: { 'duration.120': 1000 } }));
  assert.ok(!results.base.rows.some(r => r.id.startsWith('motion:') && r.level === 'fail'));
});

test('catalog metrics retain their checks and do not run button pixel checks', () => {
  const input = experiment({ base: {}, slow: { 'duration.120': 1000 } });
  input.exp.fixtures = { scene: 'catalog-stack' };
  input.metrics = { base: { levels: [
    { depth: 0, label: 'Front', contrast: 6 },
    { depth: 1, label: 'Parent', contrast: 2, below: { contrast: 1.1 } },
  ] } };
  const { results } = runChecks(input);
  assert.ok(!results.base.rows.some(r => r.id === 'press-visible'));
  assert.equal(results.base.rows.find(r => r.id === 'breadcrumb-legible').level, 'fail');
  assert.equal(results.base.rows.find(r => r.id === 'parent-list-hidden').level, 'pass');
  assert.equal(results.slow.rows.find(r => r.id === 'motion:ui-under-300ms').level, 'fail');
});
