// Builds tokens.json into the files other tools read. No dependencies.
//   dist/tokens.js             ES module for WebXR code (metres, radians, seconds)
//   dist/tokens.css            CSS custom properties for the website
//   dist/figma-variables.json  DTCG file for Figma's "Import variables"
// Run: node scripts/build-tokens.mjs           (writes dist/)
//      node scripts/build-tokens.mjs --check   (fails if dist/ is out of date)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('dist/', ROOT);
const source = JSON.parse(readFileSync(new URL('tokens.json', ROOT), 'utf8'));
const version = source.$extensions?.['com.contour']?.version ?? '0.0.0';
const HEADER = `Generated from tokens.json (Contour ${version}) by scripts/build-tokens.mjs. Do not edit by hand.`;

// ---- 1. Flatten: one entry per token, with its dotted path ----

function collect(node, path = [], inheritedType) {
  const type = node.$type ?? inheritedType;
  if ('$value' in node) {
    const meta = node.$extensions?.['com.contour'] ?? {};
    return [{
      path,
      name: path.join('.'),
      type,
      value: node.$value,
      description: node.$description ?? '',
      evidence: meta.evidence,
      category: meta.category,
      provisional: meta.status === 'provisional',
    }];
  }
  return Object.entries(node)
    .filter(([k]) => !k.startsWith('$'))
    .flatMap(([k, child]) => collect(child, [...path, k], type));
}

const tokens = collect(source);

// ---- 2. Unit conversion ----

// Scene units for WebXR code: everything becomes metres, radians or seconds,
// so it can be handed to three.js without further maths. dmm is the one
// exception: it becomes "metres at 1 m away" and must be multiplied by the
// real placement distance (see atDistance in the generated file).
const TO_SCENE = {
  mm: v => v / 1000,
  dmm: v => v / 1000,
  deg: v => (v * Math.PI) / 180,
  ms: v => v / 1000,
};
const SCENE_UNIT = { mm: 'm', dmm: 'm@1m', deg: 'rad', ms: 's' };

const round = v => Number(v.toPrecision(12));

function sceneValue(t) {
  if (t.type === 'dimension' || t.type === 'duration') {
    const { value, unit } = t.value;
    if (!TO_SCENE[unit]) throw new Error(`${t.name}: no scene conversion for unit "${unit}"`);
    return round(TO_SCENE[unit](value));
  }
  return t.value;
}

// CSS has real mm, deg and ms units. dmm has no CSS equivalent (it depends on
// viewing distance), so it is written as a plain number.
function cssValue(t) {
  const v = t.value;
  if (t.type === 'dimension' || t.type === 'duration') return v.unit === 'dmm' ? `${v.value}` : `${v.value}${v.unit}`;
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
// unitless. Tokens in dmm are "metres at 1 m away": scale them with
// atDistance(value, distanceM). units[name] says which tokens those are.

export const version = ${JSON.stringify(version)};

export const tokens = ${JSON.stringify(nested, null, 2)};

/** Scene unit of each dimension or duration token: m, m@1m (dmm), rad or s. */
export const units = ${JSON.stringify(units, null, 2)};

/** Tokens that are not decisions yet (status: provisional in tokens.json). */
export const provisional = ${JSON.stringify(provisional, null, 2)};

/** Turns a dmm token (metres at 1 m) into metres at the real placement distance. */
export const atDistance = (value, distanceM) => value * distanceM;

export default tokens;
`;
}

function buildCss() {
  const lines = tokens.map(t => {
    const unit = t.value?.unit === 'dmm' ? ' dmm' : '';
    const flag = t.provisional ? ' provisional' : '';
    return `  --contour-${t.path.join('-')}: ${cssValue(t)}; /* ${t.evidence}${flag}${unit} */`;
  });
  return `/* ${HEADER}
 * dmm values are plain numbers: multiply by the viewing distance in metres
 * to get millimetres, e.g. calc(var(--contour-size-button-default) * 0.75mm). */
:root {
${lines.join('\n')}
}
`;
}

// Figma Variables hold only number, string, boolean and color. Units are
// dropped from the number and written at the start of the variable's
// description, so a designer sees "60" with "Unit: dmm." beside it.
function figmaToken(t) {
  const v = t.value;
  const tag = `[${t.evidence}${t.provisional ? ', provisional' : ''}]`;
  let $type = 'number';
  let $value = v;
  let unit = '';
  if (t.type === 'dimension' || t.type === 'duration') { $value = v.value; unit = v.unit; }
  else if (t.type === 'cubicBezier') { $type = 'string'; $value = cssValue(t); }
  else if (t.type === 'string') { $type = 'string'; }
  const description = [unit && `Unit: ${unit}.`, t.description, tag].filter(Boolean).join(' ');
  return {
    $type,
    $value,
    $description: description,
    $extensions: { 'com.figma': { scopes: $type === 'string' ? ['ALL_SCOPES'] : figmaScopes(unit) } },
  };
}

function figmaScopes(unit) {
  if (unit === 'dmm') return ['WIDTH_HEIGHT', 'GAP', 'CORNER_RADIUS', 'STROKE_FLOAT'];
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
    console.error(`dist/ is out of date: ${stale.map(([f]) => f).join(', ')}. Run: npm run build`);
    process.exit(1);
  }
  console.log(`dist/ is up to date (${tokens.length} tokens).`);
} else {
  mkdirSync(DIST, { recursive: true });
  for (const [file, text] of Object.entries(outputs)) writeFileSync(new URL(file, DIST), text);
  console.log(`Built ${tokens.length} tokens into dist/: ${Object.keys(outputs).join(', ')}`);
}
