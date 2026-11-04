// Checks tokens.json: every token has a value, a type, an evidence tag,
// aliases point at real tokens, and no token also acts as a group. Prints
// one line per token. Run: node scripts/check-tokens.mjs
import { readFileSync } from 'node:fs';
import { collect, resolve, isAlias, UNITS } from './tokens-lib.mjs';

const EVIDENCE = new Set(['M', 'T', 'G', 'D', 'N']);
const STATUS = new Set(['provisional']);

const root = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));
const { renames } = JSON.parse(readFileSync(new URL('./renames.json', import.meta.url), 'utf8'));
const errors = [];
const rows = [];
const tokens = collect(root, errors);
const byName = new Map(tokens.map(t => [t.name, t]));

for (const t of tokens) {
  if (!t.type) errors.push(`${t.name}: missing $type`);
  if (!EVIDENCE.has(t.evidence)) errors.push(`${t.name}: evidence must be one of M T G D N`);
  if (t.status && !STATUS.has(t.status)) errors.push(`${t.name}: unknown status "${t.status}"`);
  let v;
  try { v = resolve(t, byName); } catch (e) { errors.push(e.message); continue; }
  if ((t.type === 'dimension' || t.type === 'duration') && !(typeof v?.value === 'number' && UNITS.has(v?.unit)))
    errors.push(`${t.name}: ${t.type} needs {value:number, unit: ${[...UNITS].join('|')}}`);
  if (isAlias(t.raw) && byName.get(t.raw.slice(1, -1))?.type !== t.type)
    errors.push(`${t.name}: alias ${t.raw} has a different $type`);
  const shown = typeof v === 'object' && !Array.isArray(v) ? `${v.value}${v.unit}` : JSON.stringify(v);
  rows.push(`${t.status ? '~' : ' '} ${t.evidence}  ${t.name.padEnd(40)} ${shown}${isAlias(t.raw) ? `  <- ${t.raw}` : ''}`);
}
for (const [from, to] of Object.entries(renames))
  if (typeof to === 'string' && !byName.has(to)) errors.push(`renames.json: ${from} -> ${to}, which does not exist`);

console.log(rows.join('\n'));

// Known conflict: a press shallower than the release pull-back makes the button
// feel sticky (the finger must lift above the resting surface before it lets go).
const val = name => resolve(byName.get(name), byName);
const release = val('input.poke.distance.release').value;
const sticky = [];
for (const t of ['thin', 'regular', 'thick'])
  for (const f of ['soft', 'firm', 'rigid']) {
    const travel = val(`material.thickness.${t}`).value * val(`material.firmness.${f}.pressDepth`);
    if (travel < release) sticky.push(`${f} x ${t} (${(travel * 1000).toFixed(1)}mm)`);
  }
if (sticky.length)
  console.warn(`\nwarning: press travel is shorter than input.poke.distance.release (${release * 1000}mm) for: ${sticky.join(', ')}`);
const provisional = rows.filter(r => r.startsWith('~')).length;
const aliases = tokens.filter(t => isAlias(t.raw)).length;
console.log(`\n${rows.length} tokens (${aliases} aliases, ${provisional} provisional, marked ~)`);
if (errors.length) {
  console.error('\n' + errors.join('\n'));
  process.exit(1);
}
