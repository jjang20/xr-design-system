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
// Navigation is never locked: a level can be opened or left while another
// is still moving. Reduced motion: levels don't travel or grow, they fade
// in and out where they belong (see stepPackagingLevel).
//
// Tokens used: packaging.*, motion.expand.dropdown.*, material.*, size.*,
// plus everything Button uses.
import * as THREE from 'three';
import { markComponent } from '../core/Interactable.js';
import { clamp } from '../core/easing.js';
import { prefersReducedMotion } from '../core/spring.js';
import { DEFAULTS } from '../core/defaults.js';
import { makeText, flatMaterial, setGroupOpacity, setContactShadow, setBehind, setBulge, glassSlabGeometry } from '../core/look.js';
import { driveBubbles, raised } from '../core/bubbles.js';
import { PACKAGING_MODES, PACKAGING_KEYS, PackagingStack, packagingPose, stepPackagingLevel } from '../core/packaging.js';
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
   * @param {number} [o.layerSpacing] local spacing multiplier; account for any root scale
   * @param {boolean} [o.reducedMotion] default: the viewer's prefers-reduced-motion
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
    this.omega = (2 * Math.PI) / T.get('motion.expand.duration');
    this.pose = {
      recedeZ: T.get('packaging.parent.recede.z') * (o.layerSpacing ?? 1),
      recedeY: T.get('packaging.parent.recede.y') * (o.layerSpacing ?? 1),
      recedeScale: T.get('packaging.parent.recede.scale'),
      opacityStart: T.get('packaging.parent.recede.opacity.start'),
      opacityStep: T.get('packaging.parent.recede.opacity.step'),
      opacityMin: T.get('packaging.parent.recede.opacity.min'),
    };
    this.reducedMotion = o.reducedMotion ?? null;
    this.stack = new PackagingStack();
    this.palmProbes = [];
    this.palmPrevious = new Map();
    this.palmPush = null;
    this.palmBlocked = new Map();
    this.open({ label: o.title, subtitle: o.subtitle, items: o.items }, null);
  }

  // The open levels, root first and the front last (levels on their way out
  // are in `closing`).
  get levels() { return this.stack.levels; }
  get closing() { return this.stack.closing; }
  get active() { return this.stack.active; }
  get reduced() { return this.reducedMotion ?? prefersReducedMotion(); }
  // Nothing is moving, closing levels included.
  get settled() { return this.stack.all.every(l => l.settled); }
  get palmOwner() { return this.palmPush?.id; }

  // The hand stays in this component's stable space while the child layer
  // moves. Measuring against the moving child would feed its own motion
  // back into the gesture and make the surface slip through the palm.
  palmSample(probe, level = this.levels.at(-1), pose = level?.cur) {
    if (!level || !pose) return null;
    const p = this.worldToLocal(probe.point.clone());
    const scale = this.getWorldScale(new THREE.Vector3());
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(this.matrixWorld);
    const front = pose.z + level.panel.t * Math.min(pose.sx, pose.sy);
    return { point: p, scaleZ: Math.abs(scale.z),
      gap: (p.z - front) * Math.abs(scale.z) - probe.radius - DEFAULTS.handInput.pressOffset,
      inside: Math.abs(p.x - pose.x) <= level.size.W * pose.sx / 2 && Math.abs(p.y - pose.y) <= level.size.H * pose.sy / 2,
      alignment: -probe.normal.dot(normal),
      facing: probe.normal.dot(normal) < -DEFAULTS.handInput.palmAlignment };
  }

  palmDistance(probe) {
    // The root consumes an overlapping palm too, so its fingertip cannot
    // accidentally select a row. updatePalm keeps the root nondismissable.
    const s = this.palmSample(probe);
    return s?.inside && s.facing && s.gap >= -DEFAULTS.handInput.palmBehindLimit ? Math.max(0, s.gap) : Infinity;
  }

  palmBlocks(probe) {
    return this.palmDistance(probe) <= DEFAULTS.handInput.palmContactBand;
  }

  feedPalm(probe) { this.palmProbes.push(probe); }

  blockPalm(probe) {
    this.palmBlocked.set(probe.id, { point: probe.point.clone(),
      normal: new THREE.Vector3(0, 0, 1).transformDirection(this.matrixWorld) });
  }

  updatePalm(dt) {
    let probes = this.palmProbes;
    this.palmProbes = [];
    const current = new Map();
    const level = this.levels.at(-1);
    const P = DEFAULTS.handInput;
    for (const p of probes) {
      const blocked = this.palmBlocked.get(p.id);
      // Rearm each hand from real retreat, never from an animated parent.
      // Losing the previous hand cannot lock out another hand's approach.
      if (blocked && p.point.clone().sub(blocked.point).dot(blocked.normal) > P.palmRearmDistance) this.palmBlocked.delete(p.id);
    }
    probes = probes.filter(p => !this.palmBlocked.has(p.id));
    if (this.active <= 0) { this.palmPrevious.clear(); return; }
    if (!this.palmPush) {
      for (const p of probes) {
        const s = this.palmSample(p);
        if (!s?.inside || !s.facing) continue;
        const previous = this.palmPrevious.get(p.id);
        current.set(p.id, { gap: s.gap, point: p.point.clone() });
        if (previous && p.point.distanceTo(previous.point) > P.palmMaxStep + 1e-6) {
          this.blockPalm(p); current.delete(p.id); continue;
        }
        // A hand first appearing behind the layer must withdraw before it
        // can push. Another hand cannot supply that approach history.
        if (s.gap <= 0 && previous?.gap > 0) {
          this.palmPush = { id: p.id, level, pose: { ...level.cur }, scaleZ: s.scaleZ,
            parents: this.levels.slice(0, -1).map(l => ({ level: l, z: l.cur.z })),
            contactZ: s.point.z - s.gap / s.scaleZ, depth: 0, missing: 0 };
          this.applyInputGates();
          break;
        }
      }
    }
    this.palmPrevious = current;
    const push = this.palmPush;
    if (!push) return;
    const probe = probes.find(p => p.id === push.id);
    const sample = probe && this.palmSample(probe, push.level, push.pose);
    const uncertain = !sample || sample.alignment < P.palmHoldAlignment;
    if (uncertain) {
      push.missing += dt;
      if (push.missing <= P.palmTrackingGrace) return; // freeze, no extrapolation
    }
    if (uncertain || !sample.inside || sample.point.z > push.contactZ + this.T.get('input.poke.distance.release') / push.scaleZ) {
      this.palmPush = null;
      this.palmPrevious.clear();
      this.retarget(); // tracking loss/withdrawal returns, never selects
      return;
    }
    // Reacquisition keeps the visible pose: movement while untracked is
    // not evidence of a deliberate push and must never dismiss a layer.
    if (push.missing) { push.contactZ = sample.point.z + push.depth / push.scaleZ; push.missing = 0; }
    const depth = Math.max(0, (push.contactZ - sample.point.z) * push.scaleZ);
    if (Math.abs(depth - push.depth) > P.palmMaxStep) {
      this.palmPush = null; this.palmPrevious.clear(); this.blockPalm(probe);
      this.retarget(); return;
    }
    const l = push.level;
    const { x, y, sx, sy } = push.pose;
    Object.assign(l.cur, { x, y, sx, sy, z: push.pose.z - depth / push.scaleZ });
    // Keep ancestors behind the pushed child, including tighter layouts.
    // Otherwise the child vanishes behind its parent before the threshold.
    for (const p of push.parents) p.level.cur.z = p.z - depth / push.scaleZ;
    l.vel.z = dt > 0 ? -(depth - push.depth) / push.scaleZ / dt : 0;
    push.depth = depth;
    l.settled = false;
    if (depth >= P.palmCloseTravel) {
      // Keep the pushed pose/velocity, then continue away while fading.
      // Reduced motion keeps the final hand-driven pose and only fades.
      l.pushExit = { ...l.cur, z: l.cur.z - P.palmExitTravel / push.scaleZ };
      // A very fast hand must not throw the layer past its exit and make
      // it reverse. Bound the inherited velocity for a monotonic spring.
      l.vel.z = Math.max(l.vel.z, -this.omega * P.palmExitTravel / push.scaleZ);
      l.pushParents = push.parents.map(p => ({ level: p.level, gap: push.pose.z - p.z }));
      this.palmPush = null;
      this.blockPalm(probe);
      this.palmPrevious.clear();
      this.back(this.active - 1);
    }
  }

  setMode(mode) {
    if (!PACKAGING_MODES.includes(mode)) throw new Error(`Unknown packaging mode ${mode}`);
    this.mode = mode;
    this.palmPush = null;
    this.palmPrevious.clear();
    this.retarget();
  }

  levelLayout(item) {
    const T = this.T, dist = this.distance, D = DEFAULTS;
    const dmm = v => (v / 1000) * T.effectiveDistance(dist);
    const W = dmm(D.panelWidth);
    const rowH = dmm(D.rowHeight);
    const titleH = dmm(D.type.title.size * 1.2);
    const subH = item.subtitle ? dmm(D.subtitleGap + D.type.subheadline.size * 1.3) : 0;
    const headerH = titleH + subH + dmm(D.headerGap);
    const items = item.items ?? [];
    const H = dmm(D.panelPadTop + D.panelPadBottom) + headerH + items.length * rowH;
    return { W, H, rowH, titleH, headerH, dmm, items };
  }

  // Opt in during scene preparation, before input/rendering starts. Warm
  // static catalog window shapes so a click never runs tessellation.
  prepareGeometry() {
    const visit = (item, depth) => {
      const { W, H, dmm } = this.levelLayout(item);
      glassSlabGeometry(W, H, this.T.get('material.thickness.regular'), dmm(DEFAULTS.radius.window), { tessellate: .002 }).dispose();
      if (depth < this.maxDepth) for (const child of item.items ?? []) if (child.items?.length) visit(child, depth + 1);
    };
    visit(this.levels[0].item, 0);
  }

  buildLevel(item, levelIndex) {
    const T = this.T, dist = this.distance, D = DEFAULTS;
    const { W, H, rowH, titleH, headerH, dmm, items } = this.levelLayout(item);

    const group = new THREE.Group();
    // The window is glass and rigid: structural, it barely gives. Once it
    // has receded it becomes the way back (the breadcrumb).
    const panel = new Button(T, {
      width: D.panelWidth, height: H / T.effectiveDistance(dist) * 1000, radius: D.radius.window,
      thickness: 'regular', density: 'rigid', variant: 'glass', distance: dist,
    });
    group.add(panel);
    const front = panel.t + 0.0004;
    const left = -W / 2 + dmm(D.panelPadding);

    // Header: title, optional subtitle.
    let y = H / 2 - dmm(D.panelPadTop);
    const title = makeText(item.label, { style: 'title', size: dmm(D.type.title.size), anchorX: 'left' });
    title.anchorY = 'top';
    title.position.set(left, y, front);
    group.add(title);
    y -= titleH;
    if (item.subtitle) {
      const sub = makeText(item.subtitle, { style: 'subheadline', size: dmm(D.type.subheadline.size), anchorX: 'left', opacity: D.emphasis.secondary });
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
      // The rendered pillow and direct contact use the same concentric corner.
      row.embossRadius = Math.min(row.h / 2, row.r * (D.radius.window - D.rowInset) / D.radius.row);
      row.position.set(0, listTop - rowH / 2 - i * rowH, panel.t);
      row.addEventListener('select', () => {
        // Only the front level's list acts (a row of a level that has since
        // gone back can't open anything).
        if (this.levels.at(-1) !== level) return;
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
      const idx = this.levels.indexOf(level);
      if (idx >= 0 && idx < this.active) this.back(idx);
    });

    const level = { item, group, panel, rows, separators, size: { W, H } };
    return level;
  }

  // Open a child level out of `sourceRow` (null for the root).
  open(item, sourceRow) {
    if (this.palmPush) return;
    const level = this.buildLevel(item, this.active + 1);
    // Start the child inside the row it comes out of, and close back into it.
    if (sourceRow) {
      const parent = this.levels.at(-1);
      const p = sourceRow.position, c = parent.cur;
      const k = (sourceRow.w / level.size.W) * c.sx;
      level.from = {
        x: p.x * c.sx, y: c.y + p.y * c.sy, z: c.z + p.z,
        // Uniform scale, so text is never squashed while it grows out of the row.
        sx: k, sy: k, opacity: 0, dim: 0, back: 0,
      };
    }
    level.cur = { ...(level.from ?? { x: 0, y: 0, z: 0, sx: 1, sy: 1, opacity: 1, dim: 0, back: 0 }) };
    level.vel = Object.fromEntries(PACKAGING_KEYS.map(k => [k, 0]));
    const index = this.stack.push(level);
    this.add(level.group);
    this.retarget();
    // Reduced motion: the child doesn't grow out of its row; it fades in
    // where it belongs.
    if (sourceRow && this.reduced) level.cur = { ...level.to, opacity: 0 };
    if (sourceRow) this.dispatchEvent({ type: 'open', level: index, item });
  }

  // Go back so that `toLevel` is in front again.
  back(toLevel = this.active - 1) {
    if (this.palmPush) return;
    if (!this.stack.popTo(toLevel).length) return;
    this.retarget();
    this.dispatchEvent({ type: 'back', level: toLevel });
  }

  retarget() {
    this.stack.retarget(this.pose, this.mode, { reduced: this.reduced });
    this.applyInputGates();
  }

  applyInputGates() {
    // Only the front level's rows take input; receded panels act as "back".
    for (const l of this.stack.all) {
      l.rows.forEach(r => { r.enabled = l.rowsEnabled && !this.palmPush; });
      l.panel.enabled = l.panelEnabled && !this.palmPush;
    }
  }

  update(dt) {
    const reduced = this.reduced;
    this.updatePalm(dt);
    for (const l of this.stack.all) {
      l.panel.update(dt);
      const contact = this.palmPush?.level === l ? 0.4 + 0.6 * Math.min(1, this.palmPush.depth / DEFAULTS.handInput.palmCloseTravel) : 0;
      l.palmGlow = contact || (l.palmGlow ?? 0) * Math.exp(-dt / 0.08);
      l.panel.skin.uniforms.uContactGlow.value = l.palmGlow;
      l.rows.forEach(r => r.update(dt));
      const push = this.palmPush;
      const held = push?.level === l ? ['x', 'y', 'z', 'sx', 'sy']
        : push?.parents.some(p => p.level === l) ? ['z'] : [];
      l.settled = stepPackagingLevel(l, this.omega, dt, reduced, held);
    }
    if (!reduced) for (const child of this.closing) {
      // Hold depth order through the visible exit. Recover ancestors once
      // the child has faded, rather than occluding it mid-dismissal.
      if (child.cur.opacity <= 0.1) continue;
      for (const { level, gap } of child.pushParents ?? []) {
        if (level.cur.z <= child.cur.z - gap) continue;
        level.cur.z = child.cur.z - gap; level.vel.z = 0; level.settled = false;
      }
    }
    for (const l of this.stack.all) {
      const c = l.cur;
      l.group.position.set(c.x, c.y, c.z);
      l.group.scale.set(c.sx, c.sy, Math.min(c.sx, c.sy));
      setGroupOpacity(l.group, clamp(c.opacity, 0, 1), clamp(c.dim, 0, 1), clamp(c.back, 0, 1));
    }
    this.updateLight();
    // Remove levels that finished closing.
    for (const l of this.stack.sweep(l => l.settled || l.cur.opacity < 0.01)) this.remove(l.group);
  }

  // Contact shadows: each window gets one from the level in front of it and
  // one from its lifted row lens, so the layers read as objects in space.
  updateLight() {
    const S = DEFAULTS.look.contactShadow;
    const all = this.stack.all;
    // The level in front of depth d: the open one, or one closing back into
    // it (the most visible).
    const inFront = d => all.filter(u => u.depth === d + 1).sort((a, b) => b.cur.opacity - a.cur.opacity)[0];
    all.forEach(l => {
      const m = l.panel.body.material, p = l.cur, i = l.depth;
      const next = inFront(i);
      if (next) {
        const c = next.cur;
        const k = c.sx / p.sx;
        setContactShadow(m, 0, {
          x: (c.x - p.x) / p.sx, y: (c.y - p.y) / p.sy,
          hw: next.size.W / 2 * k, hh: next.size.H / 2 * k,
          r: next.panel.r * k, gap: Math.max(0, c.z - p.z), amount: S.child * clamp(c.opacity, 0, 1),
        });
      } else setContactShadow(m, 0);
      // The levels behind it show through it: up to two, nearest first.
      for (let s = 0; s < 2; s++) {
        // Open levels keep their depth as index; a closing parent stands in
        // while its child closes too.
        const d = i - 1 - s;
        const back = this.levels[d] ?? this.closing.find(u => u.depth === d);
        if (!back) { setBehind(m, s); continue; }
        const c = back.cur, k = c.sx / p.sx;
        setBehind(m, s, {
          x: (c.x - p.x) / p.sx, y: (c.y - p.y) / p.sy,
          hw: back.size.W / 2 * k, hh: back.size.H / 2 * k, r: back.panel.r * k,
          gap: Math.max(0, p.z - c.z), scale: p.sx, amount: DEFAULTS.look.behind.amount * clamp(c.opacity, 0, 1),
        });
      }
      // The most raised rows (a bubble keeps moving after hover ends, so
      // the row being left deflates while the next one inflates).
      const ranked = l.rows.filter(r => raised(r) > 0.001).sort((a, b) => raised(b) - raised(a));
      const lifted = ranked[0];
      if (lifted?.emboss) {
        // Emboss: the window itself swells under the row (no lens, no shadow).
        // Corners concentric with the window's (window radius minus the row
        // inset), so the bubble follows the window's shape.
        driveBubbles(m, l.rows);
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

