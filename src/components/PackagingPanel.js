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
import { makeText, setGroupOpacity } from '../core/look.js';
import { PACKAGING_MODES, packagingPose } from '../core/packaging.js';
import { Button } from './Button.js';

export { PACKAGING_MODES, packagingPose };

export class PackagingPanel extends THREE.Group {
  /**
   * @param {object} T tokens
   * @param {object} o
   * @param {string} o.title
   * @param {string} [o.subtitle]
   * @param {{label: string, icon?: string, sublabel?: string, items?: object[]}[]} o.items
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
    this.open({ label: o.title, subtitle: o.subtitle, items: o.items }, null);
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
    const gap = dmm(2);
    const rowH = dmm(DEFAULTS.rowHeight);
    const headerH = dmm(item.subtitle ? 58 : 44);
    const items = item.items ?? [];
    const W = dmm(DEFAULTS.panelWidth);
    const H = pad * 2 + headerH + items.length * rowH + Math.max(0, items.length - 1) * gap;

    const group = new THREE.Group();
    // The window itself is a rigid, thick object: structural, barely gives.
    // Once it has receded it becomes the way back (the breadcrumb).
    const panel = new Button(T, {
      width: DEFAULTS.panelWidth, height: H / dist * 1000, radius: DEFAULTS.radius.window,
      thickness: 'thick', density: 'rigid', variant: 'window', distance: dist,
    });
    group.add(panel);
    const front = panel.t + 0.0006;

    // Header: large title, optional subtitle.
    const top = H / 2 - pad;
    const title = makeText(item.label, { size: dmm(24), weight: 700, anchorX: 'left' });
    title.position.set(-W / 2 + pad + dmm(6), top - dmm(16), front);
    group.add(title);
    if (item.subtitle) {
      const sub = makeText(item.subtitle, { size: dmm(14), weight: 400, anchorX: 'left', color: DEFAULTS.color.textSecondary });
      sub.position.set(-W / 2 + pad + dmm(6), top - dmm(40), front);
      group.add(sub);
    }

    const rows = items.map((child, i) => {
      const canOpen = !!child.items?.length;
      const tooDeep = canOpen && levelIndex >= this.maxDepth;
      const row = new Button(T, {
        label: child.label,
        sublabel: child.sublabel ?? (canOpen ? `${child.items.length} ${child.items.length === 1 ? 'item' : 'items'}` : undefined),
        icon: child.icon,
        accessory: canOpen ? 'chevron' : null,
        layout: 'row',
        variant: 'plain',
        width: DEFAULTS.panelWidth - DEFAULTS.panelPadding * 2,
        height: DEFAULTS.rowHeight,
        radius: DEFAULTS.radius.control,
        thickness: 'thin',
        density: 'firm',
        distance: dist,
        disabled: tooDeep,
      });
      row.position.set(0, top - headerH - rowH / 2 - i * (rowH + gap), panel.t);
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
        // Uniform scale, so text is never squashed while it grows out of the row.
        sx: sourceRow.w / level.size.W, sy: sourceRow.w / level.size.W, opacity: 0,
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
