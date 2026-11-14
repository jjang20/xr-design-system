import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url)));

// Exercise the public checker CLI with a disposable authored input. The real
// tokens and generated artifacts must never be changed by a negative test.
function check(t, mutate) {
  const root = mkdtempSync(join(tmpdir(), 'contour-token-validation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  for (const file of ['check-tokens.mjs', 'tokens-lib.mjs', 'renames.json']) {
    copyFileSync(new URL(`../scripts/${file}`, import.meta.url), join(root, 'scripts', file));
  }
  const patched = structuredClone(source);
  mutate(patched);
  writeFileSync(join(root, 'tokens.json'), JSON.stringify(patched));
  return spawnSync(process.execPath, ['scripts/check-tokens.mjs'], { cwd: root, encoding: 'utf8', timeout: 10000 });
}

test('checker reports the token path for a null dimension instead of crashing', t => {
  const result = check(t, tokens => { tokens.thickness['200'].$value = null; });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /thickness\.200: dimension needs/);
  assert.doesNotMatch(result.stderr, /TypeError|\n\s+at /);
});

test('an invalid warning input does not hide other token diagnostics', t => {
  const result = check(t, tokens => {
    tokens.material.thickness.regular.$value = '{missing.thickness}';
    tokens.size['2000'].$extensions['com.contour'].evidence = 'INVALID';
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /material\.thickness\.regular: alias.*no token/);
  assert.match(result.stderr, /size\.2000: evidence must/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});
