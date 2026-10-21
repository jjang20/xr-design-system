import { springStep } from './spring.js';

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

// The navigation stack behind a Packaging panel, apart from rendering.
// `levels` is the logical stack, root first and the front level last;
// `closing` holds levels on their way out. Those still draw but no longer
// count, so opening B while A is still closing puts B where A was. (Indexing
// both together crashed: PR #3 review, interrupted back then open.)
export class PackagingStack {
  constructor() {
    this.levels = [];
    this.closing = [];
  }

  get active() { return this.levels.length - 1; }

  // Every level that still draws: the live ones, then the ones closing.
  get all() { return [...this.levels, ...this.closing]; }

  push(level) {
    level.depth = this.levels.length;
    this.levels.push(level);
    return level.depth;
  }

  // Close every level above `toLevel`; returns them.
  popTo(toLevel) {
    if (toLevel < 0 || toLevel >= this.active) return [];
    const out = this.levels.splice(toLevel + 1);
    for (const l of out) l.closing = true;
    this.closing.push(...out);
    return out;
  }

  // Drop the closing levels that are done; returns them.
  sweep(done) {
    const out = this.closing.filter(done);
    if (out.length) this.closing = this.closing.filter(l => !out.includes(l));
    return out;
  }

  // Where each level goes now, and what takes input: only the front level's
  // rows, and the panels of the levels behind it (the way back). Closing
  // levels take none. `reduced` (reduced motion): a closing level fades
  // where it is instead of shrinking back into its row.
  retarget(pose, mode, { reduced = false } = {}) {
    const active = this.active;
    this.levels.forEach((l, i) => {
      const p = packagingPose(pose, mode, i, active);
      const vanish = mode === 'replace' && i < active;
      // Pushed-back levels darken (dim) rather than turn see-through, and
      // show only their title (back): how far a level dims is a token, but
      // whether its list shows is not (the design arena found a light dim
      // left the list ghosting behind the level in front, 2026-10-21).
      l.to = { x: 0, y: p.y, z: p.z, sx: p.scale, sy: p.scale, opacity: vanish ? 0 : 1, dim: i < active ? 1 - p.opacity : 0, back: i < active ? 1 : 0 };
      l.rowsEnabled = i === active;
      l.panelEnabled = i < active;
    });
    for (const l of this.closing) {
      l.to = { ...(reduced || !l.from ? l.cur : l.from), opacity: 0, dim: 0, back: 0 };
      l.rowsEnabled = l.panelEnabled = false;
    }
  }
}

const TRANSFORM = ['x', 'y', 'z', 'sx', 'sy'];
export const PACKAGING_KEYS = [...TRANSFORM, 'opacity', 'dim', 'back'];

// One frame of a level's motion; returns whether it has settled. Every
// channel is a critically damped spring: it starts from where the level is
// now, keeps its speed if retargeted mid-way, and never overshoots (nothing
// was thrown). Reduced motion: the level does not travel or grow; it is
// where it belongs at once and only fades (opacity, dim, back), so depth
// still reads without the movement.
export function stepPackagingLevel(l, omega, dt, reduced = false) {
  let moving = false;
  for (const k of PACKAGING_KEYS) {
    if (reduced && TRANSFORM.includes(k)) {
      l.cur[k] = l.to[k]; l.vel[k] = 0;
      continue;
    }
    const st = { x: l.cur[k], v: l.vel[k] };
    springStep(st, l.to[k], omega, dt);
    l.cur[k] = st.x; l.vel[k] = st.v;
    if (Math.abs(st.x - l.to[k]) > 1e-4 || Math.abs(st.v) > 1e-3) moving = true;
  }
  return !moving;
}
