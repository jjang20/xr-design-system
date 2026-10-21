// Reads ../tokens.json, applies an experiment variant's overrides, and
// resolves the values the scene and the checks need. tokens.json stays the
// single source of truth: a variant is only a list of "path": value patches.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TOKENS_PATH = fileURLToPath(new URL('../../tokens.json', import.meta.url));

export function loadTokens() {
  return JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
}

export function saveTokens(root) {
  writeFileSync(TOKENS_PATH, JSON.stringify(root, null, 2) + '\n');
}

const isAlias = v => typeof v === 'string' && /^\{[^{}]+\}$/.test(v);

// The token node at a path. Aliases ("{thickness.200}") are followed, so the
// returned node holds a real value; pass follow = false to get the alias itself.
export function getNode(root, path, follow = true) {
  const node = path.split('.').reduce((n, k) => n?.[k], root);
  if (!node || !('$value' in node)) throw new Error(`No token at ${path}`);
  return follow && isAlias(node.$value) ? getNode(root, node.$value.slice(1, -1)) : node;
}

// A patch value can be a bare number (keeps the token's unit) or a full
// {value, unit} object. Patching an alias replaces the link with a value for
// that token only; the primitive it pointed at is left alone.
export function setValue(root, path, patch) {
  const node = getNode(root, path, false);
  const v = getNode(root, path).$value;
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && typeof patch === 'number') {
    node.$value = { ...v, value: patch };
  } else {
    node.$value = patch;
  }
}

export function withOverrides(root, overrides = {}) {
  const copy = structuredClone(root);
  for (const [path, value] of Object.entries(overrides)) setValue(copy, path, value);
  return copy;
}

// Numeric value of a token in its own unit (vpt, m, deg, ms or plain number).
export function num(root, path) {
  const v = getNode(root, path).$value;
  return typeof v === 'object' && v !== null ? v.value : v;
}

// f(d): the distance the vpt formula uses (1:1 up to zone.room.growth.start, then slower).
export function effectiveDistance(root, distanceM) {
  const start = num(root, 'zone.room.growth.start'), rate = num(root, 'zone.room.growth.rate');
  return distanceM <= start ? distanceM : start + rate * (distanceM - start);
}

// Any dimension token in metres. vpt needs the panel's placement distance:
// real size = vpt x 0.00075 x f(d). m is already physical.
export function toM(root, path, distanceM) {
  const { value, unit } = getNode(root, path).$value;
  if (unit === 'm') return value;
  if (unit === 'vpt') return value * 0.00075 * effectiveDistance(root, distanceM);
  throw new Error(`${path}: cannot convert unit "${unit}" to metres`);
}

// Everything the arena scene needs, in metres / plain numbers.
export function sceneParams(root, fixtures) {
  const d = fixtures.distanceM;
  return {
    distanceM: d,
    eccentricityDeg: num(root, 'anchor.eccentricity.vertical'),
    button: {
      face: toM(root, 'size.interactive.default', d),
      gap: toM(root, 'spacing.gap.minimum', d),
      t: toM(root, 'material.thickness.regular'),
      pressRatio: num(root, 'material.firmness.firm.pressDepth'),
    },
    panel: { t: toM(root, 'material.thickness.thick'), opacity: num(root, 'material.opacity.default') },
    glowEdge: toM(root, 'material.glow.width', d),
    shadow: {
      scale: num(root, 'shadow.contact.scaleGain'),
      opacityMin: num(root, 'shadow.contact.opacity.minimum'),
      opacityMax: num(root, 'shadow.contact.opacity.maximum'),
    },
  };
}
