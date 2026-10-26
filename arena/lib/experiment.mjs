// Loads an experiment file and gives each step the paths it reads and writes.
import { readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadTokens, withOverrides } from './tokens.mjs';

export const ARENA = fileURLToPath(new URL('..', import.meta.url));

export function loadExperiment(id) {
  if (!id) throw new Error('Pass an experiment id, e.g. button-thickness (see arena/experiments/)');
  const exp = JSON.parse(readFileSync(join(ARENA, 'experiments', `${id}.json`), 'utf8'));
  const dir = join(ARENA, 'runs', exp.id);
  mkdirSync(dir, { recursive: true });
  const tokens = loadTokens();
  const variants = Object.entries(exp.variants).map(([name, overrides]) => ({
    name, overrides, tokens: withOverrides(tokens, overrides),
    image: join(dir, `${name}.png`),
  }));
  return { exp, dir, tokens, variants, file: f => join(dir, f) };
}

export function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

export function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

export function appendJsonl(path, row) {
  appendFileSync(path, JSON.stringify(row) + '\n');
}

// Every unordered pair of variants that passed the checks.
export function pairs(names) {
  const out = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) out.push([names[i], names[j]]);
  return out;
}
