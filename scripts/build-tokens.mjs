// Builds tokens.json into the files other tools read. No dependencies.
//   dist/tokens.js             ES module for WebXR code (metres, radians, seconds)
//                              plus viewSize() for vpt and the renamed-token map
//   dist/tokens.css            CSS custom properties for the website
//   dist/figma-variables.json  DTCG file for Figma's "Import variables"
// Run: node scripts/build-tokens.mjs           (writes dist/)
//      node scripts/build-tokens.mjs --check   (fails if dist/ is out of date)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { collect, resolve, isAlias, sceneValue as toSceneValue } from './tokens-lib.mjs';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('dist/', ROOT);
const source = JSON.parse(readFileSync(new URL('tokens.json', ROOT), 'utf8'));
const version = source.$extensions?.['com.contour']?.version ?? '0.0.0';
const HEADER = `Generated from tokens.json (Contour ${version}) by scripts/build-tokens.mjs. Do not edit by hand.`;

// ---- 1. Flatten and resolve aliases ----

const tokens = collect(source);
const byName = new Map(tokens.map(t => [t.name, t]));
for (const t of tokens) {
  t.value = resolve(t, byName);
  t.alias = isAlias(t.raw) ? t.raw : null;
}
const { renames } = JSON.parse(readFileSync(new URL('scripts/renames.json', ROOT), 'utf8'));

// ---- 2. Unit conversion ----

// Scene units for WebXR code: everything becomes metres, radians or seconds,
// so it can be handed to three.js without further maths. vpt is the one
// exception: it becomes "metres at 1 m away" and must be scaled by the
// placement distance with viewSize() in the generated file.
const SCENE_UNIT = { m: 'm', vpt: 'm@1m', dmm: 'm@1m', deg: 'rad', ms: 's' };

const round = v => Number(v.toPrecision(12));

const sceneValue = t => toSceneValue(t.value, t.name);

// How a physical length is shown to people: cm, or mm below 1 cm.
function displayLength(m) {
  return m < 0.01 ? { value: round(m * 1000), unit: 'mm' } : { value: round(m * 100), unit: 'cm' };
}

// CSS has real mm, deg and ms units. vpt has no CSS equivalent (it depends on
// viewing distance), so it is written as a plain number.
function cssValue(t) {
  const v = t.value;
  if (t.type === 'dimension' || t.type === 'duration') {
    if (v.unit === 'vpt' || v.unit === 'dmm') return `${v.value}`;
    if (v.unit === 'm') return `${round(v.value * 1000)}mm`;
    return `${v.value}${v.unit}`;
  }
  if (t.type === 'cubicBezier') return `cubic-bezier(${v.join(', ')})`;
  if (t.type === 'string') return JSON.stringify(v);
  return `${v}`;
}

// ---- 3. Writers ----

function setDeep(obj, path, value) {
  let o = obj;
  for (const k of path.slice(0, -1)) o = o[k] ??= {};
  o[path.at(-1)] = value;
}

function buildJs() {
  const nested = {};
  const units = {};
  for (const t of tokens) {
    setDeep(nested, t.path, sceneValue(t));
    if (t.value?.unit) units[t.name] = SCENE_UNIT[t.value.unit];
  }
  const provisional = tokens.filter(t => t.provisional).map(t => t.name);
  return `// ${HEADER}
//
// Every number is in scene units: metres (m), radians (rad), seconds (s), or
// unitless. Tokens in vpt are "metres at 1 m away": scale them with
// viewSize(value, distanceM). units[name] says which tokens those are.

export const version = ${JSON.stringify(version)};

export const tokens = ${JSON.stringify(nested, null, 2)};

/** Scene unit of each dimension or duration token: m, m@1m (vpt), rad or s. */
export const units = ${JSON.stringify(units, null, 2)};

/** Tokens that are not decisions yet (status: provisional in tokens.json). */
export const provisional = ${JSON.stringify(provisional, null, 2)};

/** Old token names (v0.1) and their new names; null means removed. */
export const renamed = ${JSON.stringify(Object.fromEntries(Object.entries(renames).map(([k, v]) => [k, typeof v === 'string' ? v : null])), null, 2)};

/** f(d): the distance the vpt formula uses. 1:1 up to zone.room.growth.start, then slower. */
export const effectiveDistance = (distanceM) => {
  const start = tokens.zone.room.growth.start, rate = tokens.zone.room.growth.rate;
  return distanceM <= start ? distanceM : start + rate * (distanceM - start);
};

/**
 * Real size in metres of a vpt token for a panel placed distanceM away.
 * Measure distanceM once, when the panel is placed, not every frame.
 */
export const viewSize = (value, distanceM) => value * effectiveDistance(distanceM);

/** Hit size of a touch target: its view size, but never under the fingertip floor. */
export const touchSize = (value, distanceM) =>
  Math.max(viewSize(value, distanceM), tokens.input.touch.size.minimum);

export default tokens;
`;
}

function buildCss() {
  const lines = tokens.map(t => {
    const unit = t.value?.unit === 'vpt' || t.value?.unit === 'dmm' ? ` ${t.value.unit}` : '';
    const flag = t.provisional ? ' provisional' : '';
    return `  --contour-${t.path.join('-')}: ${cssValue(t)}; /* ${t.evidence}${flag}${unit} */`;
  });
  return `/* ${HEADER}
 * vpt values are plain numbers: multiply by 0.75mm and the viewing distance
 * in metres, e.g. calc(var(--contour-size-interactive-default) * 0.75mm * 0.75). */
:root {
${lines.join('\n')}
}
`;
}

// Figma Variables hold only number, string, boolean and color. Units are
// dropped from the number and written at the start of the variable's
// description. vpt maps 1:1 to Figma px; physical metres are shown in cm, or
// mm below 1 cm, so a designer sees "3" with "Unit: mm." beside it.
function figmaToken(t) {
  const v = t.value;
  const tag = `[${t.evidence}${t.provisional ? ', provisional' : ''}]`;
  let $type = 'number';
  let $value = v;
  let unit = '';
  if (t.type === 'dimension' || t.type === 'duration') {
    ({ value: $value, unit } = v.unit === 'm' ? displayLength(v.value) : v);
  }
  else if (t.type === 'cubicBezier') { $type = 'string'; $value = cssValue(t); }
  else if (t.type === 'string') { $type = 'string'; }
  const description = [unit && `Unit: ${unit}.`, t.alias && `Points at ${t.alias}.`, t.description, tag].filter(Boolean).join(' ');
  return {
    $type,
    $value,
    $description: description,
    $extensions: { 'com.figma': { scopes: $type === 'string' ? ['ALL_SCOPES'] : figmaScopes(unit) } },
  };
}

function figmaScopes(unit) {
  if (unit === 'vpt' || unit === 'dmm') return ['WIDTH_HEIGHT', 'GAP', 'CORNER_RADIUS', 'STROKE_FLOAT'];
  return ['ALL_SCOPES'];
}

function buildFigma() {
  const out = { $description: HEADER };
  for (const t of tokens) setDeep(out, t.path, figmaToken(t));
  return JSON.stringify(out, null, 2) + '\n';
}

// ---- 4. Write, or check that dist/ is current ----

const outputs = {
  'tokens.js': buildJs(),
  'tokens.css': buildCss(),
  'figma-variables.json': buildFigma(),
};

if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([file, text]) => {
    const url = new URL(file, DIST);
    return !existsSync(url) || readFileSync(url, 'utf8') !== text;
  });
  if (stale.length) {
    console.error(`dist/ is out of date: ${stale.map(([f]) => f).join(', ')}. Run: npm run build:tokens`);
    process.exit(1);
  }
  console.log(`dist/ is up to date (${tokens.length} tokens).`);
} else {
  mkdirSync(DIST, { recursive: true });
  for (const [file, text] of Object.entries(outputs)) writeFileSync(new URL(file, DIST), text);
  console.log(`Built ${tokens.length} tokens into dist/: ${Object.keys(outputs).join(', ')}`);
}
