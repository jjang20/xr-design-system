// Where packaging level `level` sits when level `active` is in front.
// Pure, so it can be tested and reused by other renderers.
export const PACKAGING_MODES = ['compress', 'replace', 'protrude'];

export function packagingPose(p, mode, level, active) {
  const d = active - level;
  if (d < 0) return null; // closed
  const fade = d === 0 ? 1 : Math.max(p.opacityMin, p.opacityStart - (d - 1) * p.opacityStep);
  if (mode === 'replace') return { z: 0, y: 0, scale: 1, opacity: d === 0 ? 1 : 0 };
  if (mode === 'protrude') return { z: level * p.recedeZ, y: 0, scale: 1, opacity: fade };
  return { z: -d * p.recedeZ, y: d * p.recedeY, scale: 1 - d * p.recedeScale, opacity: fade };
}
