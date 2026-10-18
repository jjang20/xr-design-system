// Contour Packaging panel: a list whose rows open into a child panel that
// comes out of the row, like a box inside a box. There is no slide-in,
// because XR has no frame edge to slide in from.
//
// When a child opens, the parent does one of three things (packaging.parent.mode):
//   compress  moves back, up and smaller, and fades to a silhouette (lab default)
//   replace   fades out in place
//   protrude  stays, and the child comes forward
// Receded parents stay visible and pressable: they are the breadcrumb
// (wayfinding). Press one to go back to it.
//
// Tokens used: packaging.*, motion.expand.dropdown.*, material.*, size.*,
// plus everything Button uses.
import * as THREE from 'three';
import { markComponent } from '../core/Interactable.js';
import { cubicBezier, clamp, lerp } from '../core/easing.js';
import { DEFAULTS } from '../core/defaults.js';
import { Label, setGroupOpacity } from '../core/surface.js';
import { Button } from './Button.js';

export const PACKAGING_MODES = ['compress', 'replace', 'protrude'];

// Where level `level` sits when level `active` is the one in front.
// Pure, so it can be tested and reused by other renderers.
export function packagingPose(p, mode, level, active) {
  const d = active - level;
  if (d < 0) return null; // closed
  const fade = d === 0 ? 1 : Math.max(p.opacityMin, p.opacityStart - (d - 1) * p.opacityStep);
  if (mode === 'replace') return { z: 0, y: 0, scale: 1, opacity: d === 0 ? 1 : 0 };
  if (mode === 'protrude') return { z: level * p.recedeZ, y: 0, scale: 1, opacity: fade };
  return { z: -d * p.recedeZ, y: d * p.recedeY, scale: 1 - d * p.recedeScale, opacity: fade };
}

export class PackagingPanel extends THREE.Group {
  /**
   * @param {object} T tokens
   * @param {object} o
   * @param {string} o.title
   * @param {{label: string, items?: object[]}[]} o.items
   * @param {'compress'|'replace'|'protrude'} [o.mode] default packaging.parent.mode
   * @param {number} [o.distance]
   */
  constructor(T, o) {
    super();
    markComponent(this);
    this.T = T;
    this.distance = o.distance ?? DEFAULTS.distance;
    this.mode = o.mode ?? T.get('packaging.parent.mode');
    this.maxDepth = T.get('packaging.depth.max');
    this.duration = T.get('motion.expand.dropdown.duration');
    this.ease = cubicBezier(T.get('motion.expand.dropdown.easing'));
    this.pose = {
      recedeZ: T.get('packaging.parent.recede.z'),
      recedeY: T.get('packaging.parent.recede.y'),
      recedeScale: T.get('packaging.parent.recede.scale'),
      opacityStart: T.get('packaging.parent.recede.opacity.start'),
      opacityStep: T.get('packaging.parent.recede.opacity.step'),
      opacityMin: T.get('packaging.parent.recede.opacity.min'),
    };
    this.levels = [];
    this.open({ label: o.title, items: o.items }, null);
  }

  get active() { return this.levels.filter(l => !l.closing).length - 1; }

  setMode(mode) {
    if (!PACKAGING_MODES.includes(mode)) throw new Error(`Unknown packaging mode ${mode}`);
    this.mode = mode;
    this.retarget();
  }

  buildLevel(item, levelIndex) {
    const T = this.T, dist = this.distance;
    const dmm = v => (v / 1000) * dist;
    const pad = dmm(DEFAULTS.panelPadding);
    const gap = T.dmm('size.gap.min', dist) * 0.5;
    const rowH = dmm(DEFAULTS.rowHeight);
    const titleH = dmm(22);
    const items = item.items ?? [];
    const W = dmm(DEFAULTS.panelWidth);
    const H = pad * 2 + titleH + gap + items.length * rowH + Math.max(0, items.length - 1) * gap;

    const group = new THREE.Group();
    // The panel itself is a rigid, thick object: structural, barely gives.
    const panel = new Button(T, { width: DEFAULTS.panelWidth, height: H / dist * 1000, thickness: 'thick', density: 'rigid', distance: dist, color: DEFAULTS.color.surface });
    group.add(panel);
    const tPanel = panel.t;

    const title = new Label(item.label, { height: titleH * 0.75, align: 'left', color: DEFAULTS.color.textMuted, maxWidth: W - pad * 2 });
    title.position.set(-W / 2 + pad + title.width / 2, H / 2 - pad - titleH / 2, tPanel + 0.0005);
    group.add(title);

    const rows = items.map((child, i) => {
      const canOpen = !!child.items?.length;
      const tooDeep = canOpen && levelIndex >= this.maxDepth;
      const row = new Button(T, {
        label: canOpen ? `${child.label}  +` : child.label,
        width: DEFAULTS.panelWidth - DEFAULTS.panelPadding * 2,
        height: DEFAULTS.rowHeight,
        thickness: 'thin',
        density: 'firm',
        distance: dist,
        disabled: tooDeep,
      });
      row.position.set(0, H / 2 - pad - titleH - gap - rowH / 2 - i * (rowH + gap), tPanel);
      row.addEventListener('select', () => {
        if (canOpen && !tooDeep) this.open(child, row);
        else this.dispatchEvent({ type: 'select', item: child });
      });
      group.add(row);
      return row;
    });

    panel.addEventListener('select', () => {
      const idx = this.levels.findIndex(l => l.panel === panel);
      if (idx < this.active) this.back(idx);
    });

    return { item, group, panel, rows, size: { W, H } };
  }

  // Open a child level out of `sourceRow` (null for the root).
  open(item, sourceRow) {
    const index = this.active + 1;
    const level = this.buildLevel(item, index);
    // Start the child inside the row it comes out of.
    if (sourceRow) {
      const parent = this.levels[index - 1];
      const p = sourceRow.position;
      level.from = {
        z: parent.anim.cur.z + p.z, y: parent.anim.cur.y + p.y, x: p.x,
        sx: sourceRow.w / level.size.W, sy: sourceRow.h / level.size.H, opacity: 0,
      };
    }
    level.anim = { cur: level.from ?? { x: 0, y: 0, z: 0, sx: 1, sy: 1, opacity: 1 }, t: 1 };
    this.levels.push(level);
    this.add(level.group);
    this.retarget();
    if (sourceRow) this.dispatchEvent({ type: 'open', level: index, item });
  }

  // Go back so that `toLevel` is in front again.
  back(toLevel = this.active - 1) {
    if (toLevel < 0) return;
    for (const l of this.levels.slice(toLevel + 1)) l.closing = true;
    this.retarget();
    this.dispatchEvent({ type: 'back', level: toLevel });
  }

  retarget() {
    const active = this.active;
    this.levels.forEach((l, i) => {
      let to;
      if (l.closing) {
        to = l.from ?? { x: 0, y: 0, z: 0, sx: 1, sy: 1, opacity: 0 };
        to = { ...to, opacity: 0 };
      } else {
        const p = packagingPose(this.pose, this.mode, i, active);
        to = { x: 0, y: p.y, z: p.z, sx: p.scale, sy: p.scale, opacity: p.opacity };
      }
      l.anim = { from: { ...l.anim.cur }, to, cur: l.anim.cur, t: 0 };
      // Only the front level's rows take input; receded panels act as "back".
      const front = i === active && !l.closing;
      l.rows.forEach(r => { r.enabled = front; });
      l.panel.enabled = !l.closing && i < active;
    });
  }

  update(dt) {
    for (const l of this.levels) {
      l.panel.update(dt);
      l.rows.forEach(r => r.update(dt));
      const a = l.anim;
      a.t = clamp(a.t + dt / this.duration, 0, 1);
      const k = this.ease(a.t);
      const c = {};
      for (const key of ['x', 'y', 'z', 'sx', 'sy', 'opacity']) c[key] = lerp(a.from[key] ?? 0, a.to[key] ?? 0, k);
      a.cur = c;
      l.group.position.set(c.x, c.y, c.z);
      l.group.scale.set(c.sx, c.sy, Math.min(c.sx, c.sy));
      setGroupOpacity(l.group, c.opacity);
    }
    // Remove levels that finished closing.
    const done = this.levels.filter(l => l.closing && l.anim.t >= 1);
    for (const l of done) this.remove(l.group);
    if (done.length) this.levels = this.levels.filter(l => !done.includes(l));
  }
}
