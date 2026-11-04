// Live JSON and generated dist/tokens.js use the same alias and unit rules.
// Keeping JSON input lets Arena patch primitives before creating components.
import { collect, resolve, isAlias, sceneValue, effectiveDistance } from '../scripts/tokens-lib.mjs';

export function flattenTokens(json) {
  const errors = [];
  const tokens = collect(json, errors);
  if (errors.length) throw new Error(errors.join('\n'));
  const byName = new Map(tokens.map(t => [t.name, t]));
  return new Map(tokens.map(t => {
    const v = resolve(t, byName);
    const isUnit = v && typeof v === 'object' && !Array.isArray(v) && 'unit' in v;
    return [t.name, {
      type: t.type,
      unit: isUnit ? v.unit : null,
      raw: isUnit ? v.value : v,
      value: sceneValue(v, t.name),
      alias: isAlias(t.raw) ? t.raw : null,
      evidence: t.evidence,
      provisional: t.provisional,
    }];
  }));
}

// Legacy linear dmm sizing. v0.2 consumers use T.viewSize(), with f(d).
export const atDistance = (size, distanceM) => size * distanceM;

export function createTokens(json) {
  const map = flattenTokens(json);
  const entry = name => {
    const t = map.get(name);
    if (!t) throw new Error(`Contour: unknown token "${name}"`);
    return t;
  };
  const distance = d => effectiveDistance(d, entry('zone.room.growth.start').value, entry('zone.room.growth.rate').value);
  const viewSize = (name, d) => {
    const t = entry(name);
    if (t.unit !== 'vpt' && t.unit !== 'dmm') throw new Error(`Contour: "${name}" is ${t.unit}, not a view size`);
    return t.value * distance(d);
  };
  return {
    // Physical lengths stay in metres; view sizes are metres at 1 m.
    get: name => entry(name).value,
    effectiveDistance: distance,
    viewSize,
    touchSize: (name, d) => Math.max(viewSize(name, d), entry('input.touch.size.minimum').value),
    // Retained for callers supplying a legacy dmm token file.
    dmm: (name, d) => {
      const t = entry(name);
      if (t.unit !== 'dmm') throw new Error(`Contour: "${name}" is ${t.unit}, not dmm`);
      return atDistance(t.value, d);
    },
    meta: entry,
    names: () => [...map.keys()],
  };
}
