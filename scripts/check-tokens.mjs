// Checks tokens.json: every token has a value, a type, an evidence tag,
// and no token also acts as a group. Prints one line per token.
// Run: node scripts/check-tokens.mjs
import { readFileSync } from 'node:fs';

const EVIDENCE = new Set(['M', 'T', 'G', 'D', 'N']);
const STATUS = new Set(['provisional']);
const UNITS = new Set(['dmm', 'mm', 'deg', 'ms']);

const root = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));
const errors = [];
const rows = [];

function walk(node, path, inheritedType) {
  const type = node.$type ?? inheritedType;
  if ('$value' in node) {
    const name = path.join('.');
    const meta = node.$extensions?.['com.contour'] ?? {};
    const children = Object.keys(node).filter(k => !k.startsWith('$'));
    if (children.length) errors.push(`${name}: a token cannot also be a group (${children.join(', ')})`);
    if (!type) errors.push(`${name}: missing $type`);
    if (!EVIDENCE.has(meta.evidence)) errors.push(`${name}: evidence must be one of M T G D N`);
    if (meta.status && !STATUS.has(meta.status)) errors.push(`${name}: unknown status "${meta.status}"`);
    const v = node.$value;
    if ((type === 'dimension' || type === 'duration') && !(typeof v?.value === 'number' && UNITS.has(v?.unit)))
      errors.push(`${name}: ${type} needs {value:number, unit: ${[...UNITS].join('|')}}`);
    const shown = typeof v === 'object' && !Array.isArray(v) ? `${v.value}${v.unit}` : JSON.stringify(v);
    rows.push(`${meta.status ? '~' : ' '} ${meta.evidence}  ${name.padEnd(42)} ${shown}`);
    return;
  }
  for (const [k, child] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    walk(child, [...path, k], type);
  }
}

walk(root, [], undefined);
console.log(rows.join('\n'));

// Known conflict: a press shallower than the release pull-back makes the button
// feel sticky (the finger must lift above the resting surface before it lets go).
const release = root.proximity.poke.release.$value.value;
const sticky = [];
for (const [t, tok] of Object.entries(root.material.t))
  for (const [d, dens] of Object.entries(root.material.density)) {
    const travel = tok.$value.value * dens.press.$value;
    if (travel < release) sticky.push(`${d} x ${t} (${travel.toFixed(1)}mm)`);
  }
if (sticky.length)
  console.warn(`\nwarning: press travel is shorter than proximity.poke.release (${release}mm) for: ${sticky.join(', ')}`);
const provisional = rows.filter(r => r.startsWith('~')).length;
console.log(`\n${rows.length} tokens (${rows.length - provisional} v0.1, ${provisional} provisional, marked ~)`);
if (errors.length) {
  console.error('\n' + errors.join('\n'));
  process.exit(1);
}
