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

export function getNode(root, path) {
  const node = path.split('.').reduce((n, k) => n?.[k], root);
  if (!node || !('$value' in node)) throw new Error(`No token at ${path}`);
  return node;
}

// A patch value can be a bare number (keeps the token's unit) or a full
// {value, unit} object.
export function setValue(root, path, patch) {
  const node = getNode(root, path);
  const v = node.$value;
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

// Numeric value of a token in its own unit (mm, dmm, deg, ms or plain number).
export function num(root, path) {
  const v = getNode(root, path).$value;
  return typeof v === 'object' && v !== null ? v.value : v;
}

// dmm -> metres at a viewing distance; mm -> metres.
export const dmmToM = (dmm, distanceM) => (dmm / 1000) * distanceM;
export const mmToM = mm => mm / 1000;

// Everything the arena scene needs, in metres / plain numbers.
export function sceneParams(root, fixtures) {
  const d = fixtures.distanceM;
  return {
    distanceM: d,
    eccentricityDeg: num(root, 'anchor.eccentricity.vertical'),
    button: {
      face: dmmToM(num(root, 'size.button.default'), d),
      gap: dmmToM(num(root, 'size.gap.min'), d),
      t: mmToM(num(root, 'material.t.regular')),
      pressRatio: num(root, 'material.density.firm.press'),
    },
    panel: { t: mmToM(num(root, 'material.t.thick')), opacity: num(root, 'surface.opacity.base') },
    glowEdge: dmmToM(num(root, 'feedback.glow.edge'), d),
    shadow: {
      scale: num(root, 'feedback.shadow.press.scale'),
      opacityMin: num(root, 'feedback.shadow.press.opacity.min'),
      opacityMax: num(root, 'feedback.shadow.press.opacity.max'),
    },
  };
}
