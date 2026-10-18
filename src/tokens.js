// Turns tokens.json into scene units, so components never do unit maths:
// mm -> metres, dmm -> metres at 1 m (scale with atDistance), deg -> radians,
// ms -> seconds. Numbers, strings and easing curves pass through unchanged.
// This mirrors the shape of the token pipeline's dist/tokens.js, so swapping
// the source later only changes this file.

const TO_SCENE = {
  mm: v => v / 1000,
  dmm: v => v / 1000,
  deg: v => (v * Math.PI) / 180,
  ms: v => v / 1000,
};

export function flattenTokens(json) {
  const out = new Map();
  (function walk(node, path, inheritedType) {
    const type = node.$type ?? inheritedType;
    if ('$value' in node) {
      const meta = node.$extensions?.['com.contour'] ?? {};
      const v = node.$value;
      const isUnit = v && typeof v === 'object' && !Array.isArray(v) && 'unit' in v;
      out.set(path.join('.'), {
        type,
        unit: isUnit ? v.unit : null,
        raw: isUnit ? v.value : v,
        value: isUnit ? TO_SCENE[v.unit](v.value) : v,
        evidence: meta.evidence,
        provisional: meta.status === 'provisional',
      });
      return;
    }
    for (const [k, child] of Object.entries(node)) {
      if (!k.startsWith('$')) walk(child, [...path, k], type);
    }
  })(json, [], undefined);
  return out;
}

// A dmm value (already in metres at 1 m) at a real placement distance.
export const atDistance = (size, distanceM) => size * distanceM;

export function createTokens(json) {
  const map = flattenTokens(json);
  const entry = name => {
    const t = map.get(name);
    if (!t) throw new Error(`Contour: unknown token "${name}"`);
    return t;
  };
  return {
    // Scene-unit value: metres, radians, seconds, or the plain value.
    get: name => entry(name).value,
    // dmm token at a placement distance, in metres.
    dmm: (name, distanceM) => {
      const t = entry(name);
      if (t.unit !== 'dmm') throw new Error(`Contour: "${name}" is ${t.unit}, not dmm`);
      return atDistance(t.value, distanceM);
    },
    meta: entry,
    names: () => [...map.keys()],
  };
}
