// Shared by check-tokens.mjs and build-tokens.mjs: flattening tokens.json,
// resolving {alias} values, and the vpt maths.

export const UNITS = new Set(['vpt', 'm', 'deg', 'ms', 'dmm']);
export const VPT_M_AT_1M = 0.00075; // 1 vpt = 0.75 mm seen from 1 m (0.75 dmm)

export const isAlias = v => typeof v === 'string' && /^\{[^{}]+\}$/.test(v);

// One entry per token, with its dotted path. Groups that also hold a value
// are reported in errors.
export function collect(node, errors = [], path = [], inheritedType) {
  const type = node.$type ?? inheritedType;
  if ('$value' in node) {
    const name = path.join('.');
    const meta = node.$extensions?.['com.contour'] ?? {};
    const children = Object.keys(node).filter(k => !k.startsWith('$'));
    if (children.length) errors.push(`${name}: a token cannot also be a group (${children.join(', ')})`);
    return [{
      path, name, type,
      raw: node.$value,
      description: node.$description ?? '',
      evidence: meta.evidence,
      category: meta.category,
      status: meta.status,
      provisional: meta.status === 'provisional',
    }];
  }
  return Object.entries(node)
    .filter(([k]) => !k.startsWith('$'))
    .flatMap(([k, child]) => collect(child, errors, [...path, k], type));
}

// The value a token ends up with after following {alias} links.
export function resolve(t, byName, seen = []) {
  if (!isAlias(t.raw)) return t.raw;
  const target = t.raw.slice(1, -1);
  if (seen.includes(target)) throw new Error(`${t.name}: alias loop through ${target}`);
  const next = byName.get(target);
  if (!next) throw new Error(`${t.name}: alias ${t.raw} points at no token`);
  return resolve(next, byName, [...seen, t.name]);
}

// f(d): the distance the vpt formula uses. Grows 1:1 up to `start`, then at `rate`.
export const effectiveDistance = (d, start, rate) => (d <= start ? d : start + rate * (d - start));
