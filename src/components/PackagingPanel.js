// Contour Packaging panel: a list whose rows open into a child panel that
// comes out of the row, like a box inside a box. There is no slide-in,
// because XR has no frame edge to slide in from.
//
// When a child opens, the parent does one of three things (packaging.parent.mode):
//   compress  moves back, up and smaller, and darkens (lab default)
//   replace   fades out in place
//   protrude  stays, and the child comes forward
// Receded parents stay visible and pressable: they are the breadcrumb
// (wayfinding). Press one to go back to it. The level in front casts a soft
// contact shadow on the one behind, and a hovered row lifts out as a glass
// lens that shadows its window.
//
// Tokens used: packaging.*, motion.expand.dropdown.*, material.*, size.*,
// plus everything Button uses.
import * as THREE from 'three';
import { markComponent } from '../core/Interactable.js';
import { clamp } from '../core/easing.js';
import { springStep } from '../core/spring.js';
import { DEFAULTS } from '../core/defaults.js';
import { makeText, flatMaterial, setGroupOpacity, setContactShadow, setBulge } from '../core/look.js';
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
    // Spring response (Apple's term: one undamped oscillation) is the
    // dropdown duration token; the curve token no longer applies.
    this.omega = (2 * Math.PI) / T.get('motion.expand.dropdown.duration');
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
    const D = DEFAULTS;
    const W = dmm(D.panelWidth);
    const rowH = dmm(D.rowHeight);
    const titleH = dmm(D.type.title.size * 1.2);
    const subH = item.subtitle ? dmm(D.subtitleGap + D.type.subheadline.size * 1.3) : 0;
    const headerH = titleH + subH + dmm(D.headerGap);
    const items = item.items ?? [];
    const H = dmm(D.panelPadTop + D.panelPadBottom) + headerH + items.length * rowH;

    const group = new THREE.Group();
    // The window is glass and rigid: structural, it barely gives. Once it
    // has receded it becomes the way back (the breadcrumb).
    const panel = new Button(T, {
      width: D.panelWidth, height: H / dist * 1000, radius: D.radius.window,
      thickness: 'regular', density: 'rigid', variant: 'glass', distance: dist,
    });
    group.add(panel);
    const front = panel.t + 0.0004;
    const left = -W / 2 + dmm(D.panelPadding);

    // Header: title, optional subtitle.
    let y = H / 2 - dmm(D.panelPadTop);
    const title = makeText(item.label, { style: 'title', distance: dist, anchorX: 'left' });
    title.anchorY = 'top';
    title.position.set(left, y, front);
    group.add(title);
    y -= titleH;
    if (item.subtitle) {
      const sub = makeText(item.subtitle, { style: 'subheadline', distance: dist, anchorX: 'left', opacity: D.emphasis.secondary });
      sub.anchorY = 'top';
      sub.userData.hideWhenDim = true;
      sub.position.set(left, y - dmm(D.subtitleGap), front);
      group.add(sub);
    }
    const listTop = H / 2 - dmm(D.panelPadTop) - headerH;

    const separators = [];
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
        width: D.panelWidth - D.rowInset * 2,
        height: D.rowHeight,
        radius: D.radius.row,
        thickness: 'thin',
        density: 'firm',
        distance: dist,
        disabled: tooDeep,
      });
      row.position.set(0, listTop - rowH / 2 - i * rowH, panel.t);
      row.addEventListener('select', () => {
        if (canOpen && !tooDeep) this.open(child, row);
        else this.dispatchEvent({ type: 'select', item: child });
      });
      group.add(row);
      // A pushed-back level shows only its title: its list would compete
      // with the level in front.
      row.traverse(o => { if (o !== row.body) o.userData.hideWhenDim = true; });
      // Hairline between rows, starting where the label starts.
      if (i > 0) {
        const x0 = row.labelX ?? (-row.w / 2), x1 = W / 2 - dmm(D.panelPadding);
        const line = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, dmm(0.75)), flatMaterial(0xffffff, D.look.separator));
        line.position.set((x0 + x1) / 2, row.position.y + rowH / 2, front - 0.0002);
        line.renderOrder = 2;
        line.userData.between = i; // hidden while the row above or below is lifted
        group.add(line);
        separators.push(line);
      }
      return row;
    });

    panel.addEventListener('select', () => {
      const idx = this.levels.findIndex(l => l.panel === panel);
      if (idx < this.active) this.back(idx);
    });

    return { item, group, panel, rows, separators, size: { W, H } };
  }

  // Open a child level out of `sourceRow` (null for the root).
  open(item, sourceRow) {
    const index = this.active + 1;
    const level = this.buildLevel(item, index);
    // Start the child inside the row it comes out of, and close back into it.
    if (sourceRow) {
      const parent = this.levels[index - 1];
      const p = sourceRow.position, c = parent.cur;
      const k = (sourceRow.w / level.size.W) * c.sx;
      level.from = {
        x: p.x * c.sx, y: c.y + p.y * c.sy, z: c.z + p.z,
        // Uniform scale, so text is never squashed while it grows out of the row.
        sx: k, sy: k, opacity: 0, dim: 0,
      };
    }
    level.cur = { ...(level.from ?? { x: 0, y: 0, z: 0, sx: 1, sy: 1, opacity: 1, dim: 0 }) };
    level.vel = Object.fromEntries(KEYS.map(k => [k, 0]));
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
      if (l.closing) {
        l.to = { ...(l.from ?? l.cur), opacity: 0, dim: 0 };
      } else {
        // Pushed-back levels darken (dim) rather than turn see-through.
        const p = packagingPose(this.pose, this.mode, i, active);
        const vanish = this.mode === 'replace' && i < active;
        l.to = { x: 0, y: p.y, z: p.z, sx: p.scale, sy: p.scale, opacity: vanish ? 0 : 1, dim: i < active ? 1 - p.opacity : 0 };
      }
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
      // Every channel is a critically damped spring: it starts from where
      // the level is now, keeps its speed if retargeted mid-way, and never
      // overshoots (nothing was thrown).
      let moving = false;
      for (const k of KEYS) {
        const st = { x: l.cur[k], v: l.vel[k] };
        springStep(st, l.to[k], this.omega, dt);
        l.cur[k] = st.x; l.vel[k] = st.v;
        if (Math.abs(st.x - l.to[k]) > 1e-4 || Math.abs(st.v) > 1e-3) moving = true;
      }
      l.settled = !moving;
      const c = l.cur;
      l.group.position.set(c.x, c.y, c.z);
      l.group.scale.set(c.sx, c.sy, Math.min(c.sx, c.sy));
      setGroupOpacity(l.group, clamp(c.opacity, 0, 1), clamp(c.dim, 0, 1));
    }
    this.updateLight();
    // Remove levels that finished closing.
    const done = this.levels.filter(l => l.closing && (l.settled || l.cur.opacity < 0.01));
    for (const l of done) this.remove(l.group);
    if (done.length) this.levels = this.levels.filter(l => !done.includes(l));
  }

  // Contact shadows: each window gets one from the level in front of it and
  // one from its lifted row lens, so the layers read as objects in space.
  updateLight() {
    const S = DEFAULTS.look.contactShadow;
    this.levels.forEach((l, i) => {
      const m = l.panel.body.material, p = l.cur;
      const next = this.levels[i + 1];
      if (next) {
        const c = next.cur;
        const k = c.sx / p.sx;
        setContactShadow(m, 0, {
          x: (c.x - p.x) / p.sx, y: (c.y - p.y) / p.sy,
          hw: next.size.W / 2 * k, hh: next.size.H / 2 * k,
          r: next.panel.r * k, gap: Math.max(0, c.z - p.z), amount: S.child * clamp(c.opacity, 0, 1),
        });
      } else setContactShadow(m, 0);
      // The most raised rows (a bubble keeps moving after hover ends, so
      // the row being left deflates while the next one inflates).
      const raised = r => r.emboss ? Math.abs(r.bulge) / r.lift : r.hover;
      const ranked = l.rows.filter(r => raised(r) > 0.001).sort((a, b) => raised(b) - raised(a));
      const lifted = ranked[0];
      if (lifted?.emboss) {
        // Emboss: the window itself swells under the row (no lens, no shadow).
        for (let i = 0; i < 2; i++) {
          const r = ranked[i];
          if (!r?.emboss) { setBulge(m, i); continue; }
          setBulge(m, i, {
            x: r.position.x, y: r.position.y, hw: r.w / 2, hh: r.h / 2,
            // Corners concentric with the window's (window radius minus the
            // row inset), so the bubble follows the window's shape.
            r: Math.min(r.h / 2, r.r * (DEFAULTS.radius.window - DEFAULTS.rowInset) / DEFAULTS.radius.row),
            height: r.bulge,
            dent: r.dent && { ...r.dent, x: r.position.x + r.dent.x, y: r.position.y + r.dent.y },
            glow: r.glow,
          });
        }
        setContactShadow(m, 1);
      } else if (lifted) {
        setContactShadow(m, 1, {
          x: lifted.position.x, y: lifted.position.y, hw: lifted.w / 2, hh: lifted.h / 2, r: lifted.r,
          gap: lifted.lift * lifted.hover + lifted.t, amount: S.lens * lifted.hover,
        });
        setBulge(m, 0); setBulge(m, 1);
      } else { setContactShadow(m, 1); setBulge(m, 0); setBulge(m, 1); }
      // Hairlines next to a lifted row step aside, as in visionOS lists.
      for (const line of l.separators) {
        const j = line.userData.between;
        const lift = r => r ? (r.emboss ? clamp(Math.abs(r.bulge) / r.lift, 0, 1) : r.hover) : 0;
        const near = Math.max(lift(l.rows[j - 1]), lift(l.rows[j]));
        line.material.opacity = DEFAULTS.look.separator * (1 - near) * clamp(p.opacity, 0, 1) * (1 - p.dim);
      }
    });
  }
}

const KEYS = ['x', 'y', 'z', 'sx', 'sy', 'opacity', 'dim'];
