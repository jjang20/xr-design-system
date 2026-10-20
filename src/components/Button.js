// Contour Button: a thick object that compresses when poked.
//
// Tokens used:
//   material.t.{thin|regular|thick}        thickness
//   material.density.{soft|firm|rigid}.*   press ratio and recover time
//   proximity.hover.enter / exit           hover hysteresis (dmm)
//   proximity.poke.release                 release hysteresis
//   size.button.default                    default face size (dmm)
//   motion.hover.in.*                      hover fade
//   feedback.glow.edge                     hover edge glow width (dmm)
//   surface.opacity.base / outline.mr      opaque surface, luminous MR edge
//
// Appearance options (not behaviour): shape, variant, icon, label, sublabel,
// accessory, layout. See docs/components.md.
import * as THREE from 'three';
import { Interactable, markComponent } from '../core/Interactable.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { PressModel } from '../core/PressModel.js';
import { cubicBezier, clamp, lerp } from '../core/easing.js';
import { DEFAULTS } from '../core/defaults.js';
import { bodyGeometry, bodyMaterial, faceMaterial, glassMaterial, glassSlabGeometry, glassBeadGeometry, makeText, makeIcon } from '../core/look.js';

const C = DEFAULTS.color;

export class Button extends Interactable {
  /**
   * @param {object} T  tokens from createTokens()
   * @param {object} o
   * @param {string} [o.label]
   * @param {string} [o.sublabel]   secondary text (row layout)
   * @param {string} [o.icon]       Lucide icon name (see src/core/icons.js)
   * @param {'chevron'|null} [o.accessory]
   * @param {'center'|'row'} [o.layout='center']
   * @param {'rounded'|'capsule'|'circle'} [o.shape='rounded']
   * @param {'secondary'|'primary'|'plain'|'glass'|'window'|'tinted'} [o.variant='secondary']
   * @param {number} [o.color]      fill colour override (tinted variant)
   * @param {'soft'|'firm'|'rigid'} [o.density='firm']
   * @param {'thin'|'regular'|'thick'} [o.thickness='regular']
   * @param {number} [o.width]      face width in dmm (default size.button.default)
   * @param {number} [o.height]     face height in dmm (default size.button.default)
   * @param {number} [o.radius]     corner radius in dmm
   * @param {number} [o.distance]   placement distance in m, for dmm
   * @param {boolean} [o.disabled]
   */
  constructor(T, o = {}) {
    super();
    markComponent(this);
    this.T = T;
    const distance = this.distance = o.distance ?? DEFAULTS.distance;
    const dmm = v => (v / 1000) * distance;
    this.disabled = !!o.disabled;
    this.variant = o.variant ?? 'secondary';
    // Disabled elements are rigid: they barely give, which reads as "not now".
    this.density = this.disabled ? 'rigid' : (o.density ?? 'firm');
    this.t = T.get(`material.t.${o.thickness ?? 'regular'}`);
    const side = T.dmm('size.button.default', distance);
    this.w = o.width != null ? dmm(o.width) : side;
    this.h = o.height != null ? dmm(o.height) : side;
    if (o.shape === 'circle') this.w = this.h = Math.min(this.w, this.h);
    this.r = o.shape === 'circle' || o.shape === 'capsule' ? Math.min(this.w, this.h) / 2
      : dmm(o.radius ?? DEFAULTS.radius.control);
    this.frontZ = this.t;

    this.press = new PressModel({
      thickness: this.t,
      pressRatio: T.get(`material.density.${this.density}.press`),
      recover: T.get(`material.density.${this.density}.recover`),
      release: T.get('proximity.poke.release'),
    });
    this.hoverBand = new Hysteresis(
      T.dmm('proximity.hover.enter', distance),
      T.dmm('proximity.hover.exit', distance),
    );
    this.hoverIn = T.get('motion.hover.in.duration');
    this.hoverEase = cubicBezier(T.get('motion.hover.in.easing'));
    this.hoverT = 0;
    this.hovered = false;
    this.spot = new THREE.Vector2();

    // Body: the compressible solid. Two variants draw differently:
    //   glass  a window: a flat glass sheet at the front (see glassMaterial)
    //   plain  a list row: a light glass lens that only shows on hover
    const fill = this.disabled ? C.disabled
      : o.color ?? { primary: C.accent, window: C.window, tinted: C.control }[this.variant] ?? C.control;
    if (this.variant === 'glass') {
      // Finely split, so a hovered row can swell the glass (emboss style).
      this.body = new THREE.Mesh(glassSlabGeometry(this.w, this.h, this.t, this.r, { tessellate: 0.002 }), glassMaterial(T, { w: this.w, h: this.h, t: this.t }));
      this.body.renderOrder = 1;
      this.skin = this.body.material;
    } else if (this.variant === 'plain') {
      // A light glass lens: invisible at rest, it lifts out of the window
      // on hover, carrying the row's content with it.
      // With hoverStyle 'emboss' there is no lens: the window glass swells
      // into a bubble under the row instead (the panel draws it), and the
      // body only stays as the row's hit area.
      this.emboss = (o.hoverStyle ?? DEFAULTS.look.hoverStyle) === 'emboss';
      this.lift = (this.emboss ? DEFAULTS.look.emboss.height : DEFAULTS.look.lensLift) / 1000;
      this.body = new THREE.Mesh(glassSlabGeometry(this.w, this.h, this.t, this.r), glassMaterial(T, { w: this.w, h: this.h, t: this.t, kind: 'lens' }));
      this.body.renderOrder = 2;
      this.body.material.visible = !this.emboss;
      this.skin = this.body.material;
    } else {
      this.body = new THREE.Mesh(bodyGeometry(this.w, this.h, this.t, this.r), bodyMaterial(T, { color: fill }));
      this.body.castShadow = this.variant === 'window';
    }
    this.add(this.body);
    this.hitMeshes.push(this.body);

    // Face: everything that sits on the front and moves with it when pressed.
    this.face = new THREE.Group();
    this.add(this.face);
    if (!this.skin) {
      this.fx = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), faceMaterial(T, { w: this.w, h: this.h, r: this.r, distance }));
      this.fx.position.z = 0.0002;
      this.fx.renderOrder = 2;
      this.face.add(this.fx);
      this.skin = this.fx.material;
    }
    this.buildContent(o, dmm);
    this.layoutFront();
  }

  buildContent(o, dmm) {
    const dim = this.disabled ? 0.4 : 1;
    const z = 0.0004;
    if (o.layout === 'row') {
      // Icon badge, label (+ detail) left-aligned, chevron on the right.
      const E = DEFAULTS.emphasis;
      const pad = dmm(DEFAULTS.panelPadding - DEFAULTS.rowInset);
      let x = -this.w / 2 + pad;
      if (o.icon) {
        const b = dmm(DEFAULTS.badge);
        const bh = b * DEFAULTS.look.beadHeight;
        const bead = new THREE.Mesh(glassBeadGeometry(b, bh), glassMaterial(this.T, { w: b, h: b, t: bh, kind: 'bead' }));
        bead.position.set(x + b / 2, 0, 0);
        bead.renderOrder = 2.5; // after the row lens, before text and icons
        this.face.add(bead);
        const icon = makeIcon(o.icon, dmm(DEFAULTS.badgeGlyph), { opacity: dim });
        icon.position.set(x + b / 2, 0, bh + z);
        this.face.add(icon);
        x += b + dmm(DEFAULTS.badgeGap);
      }
      const hasSub = !!o.sublabel;
      const label = makeText(o.label ?? '', { style: 'headline', distance: this.distance, anchorX: 'left', opacity: dim });
      // Label and detail centred as a pair: half of each line's height apart.
      const lineGap = (DEFAULTS.type.headline.size + DEFAULTS.type.footnote.size) * 0.6 / 2;
      label.position.set(x, hasSub ? dmm(lineGap) : 0, z);
      this.face.add(label);
      if (hasSub) {
        const sub = makeText(o.sublabel, { style: 'footnote', distance: this.distance, anchorX: 'left', opacity: E.secondary * dim });
        sub.position.set(x, -dmm(lineGap), z);
        this.face.add(sub);
      }
      if (o.accessory === 'chevron') {
        const s = dmm(DEFAULTS.chevron);
        const chev = makeIcon('chevron-right', s, { opacity: E.tertiary * dim });
        chev.position.set(this.w / 2 - pad - s / 2, 0, z);
        this.face.add(chev);
      }
      this.label = label;
      this.labelX = x;
      return;
    }
    // Centered: icon, label, or icon above label.
    const both = o.icon && o.label;
    const narrow = this.w < this.h * 1.6;
    if (o.icon) {
      const s = Math.min(this.h, this.w) * (both && narrow ? 0.36 : 0.42);
      const icon = makeIcon(o.icon, s, { opacity: dim });
      if (both && !narrow) icon.position.set(-this.w / 2 + this.h * 0.42 + s / 2, 0, z);
      else icon.position.set(0, both ? this.h * 0.1 : 0, z);
      icon.position.z = z;
      this.face.add(icon);
      this.icon = icon;
    }
    if (o.label) {
      const size = both && narrow ? this.h * 0.16 : Math.min(this.h * 0.3, dmm(17));
      const label = makeText(o.label, { size, weight: this.variant === 'primary' ? 600 : 500, opacity: dim });
      if (both && !narrow) { label.anchorX = 'left'; label.position.set(-this.w / 2 + this.h * 0.42 + this.h * 0.42 + dmm(8), 0, z); }
      else label.position.set(0, both ? -this.h * 0.26 : 0, z);
      label.sync();
      this.face.add(label);
      this.label = label;
    }
  }

  layoutFront() {
    const front = this.t - this.press.depth;
    this.body.scale.z = Math.max(0.001, front / this.t);
    // A row lens rises out of the window on hover; pressing pushes it back.
    const lift = this.lift ? this.lift * (this.hover ?? 0) : 0;
    this.body.position.z = lift;
    this.face.position.z = this.emboss ? Math.max(0, this.bulge) + 0.0004 : front + lift;
  }

  // Emboss style: how far the window swells under this row. Driven by a
  // slightly underdamped spring in update(), like a fluid-filled skin (see
  // docs/catalog-spec.md, "Bubble").
  get bulge() { return this.bz ?? 0; }
  // The press dent (metres deep, at dentAt in local coordinates), or null.
  get dent() {
    const D = DEFAULTS.look.emboss.dent;
    return this.dz ? { x: this.dentAt.x, y: this.dentAt.y, radius: D.radius / 1000, depth: this.dz } : null;
  }
  // Press glow, 0 to 1: follows the dent in, fades as it springs back.
  get glow() {
    const E = DEFAULTS.look.emboss;
    return this.dz > 0 ? clamp(this.dz / (E.dent.depth * this.lift), 0, 1) : 0;
  }

  stepBulge(dt) {
    const E = DEFAULTS.look.emboss, on = this.hovered && !this.disabled;
    // Hover inflates; pressing lets the pillow sag a little (E.squash)
    // while a dent gives way where the press lands.
    const target = on ? this.lift * (1 - E.squash * this.press.amount) : 0;
    // Deflating settles without a wobble (critically damped), so leaving a
    // row stays quiet; only inflating carries the fluid settle.
    const s = spring(this.bz ?? 0, this.bv ?? 0, target, E.response, target === 0 ? 1 : E.damping, dt);
    this.bz = s.x; this.bv = s.v;
    // The dent is quicker and springs back past flat once on release: the
    // skin rebounds. It is placed at the press point and stays there while
    // it recovers, so it never slides.
    this.dentAt ??= new THREE.Vector2();
    if (this.press.amount > 0.01 && !this.dz) this.dentAt.copy(this.spot);
    if (this.press.amount > 0.01) this.dentAt.lerp(this.spot, 1 - Math.exp(-dt * 18));
    const d = spring(this.dz ?? 0, this.dv ?? 0, on ? E.dent.depth * this.lift * this.press.amount : 0, E.dent.response, E.dent.damping, dt);
    this.dz = Math.abs(d.x) < 1e-6 && Math.abs(d.v) < 1e-5 ? 0 : d.x; this.dv = d.v;
  }

  // Distance from a local point to the face rectangle at the front plane.
  faceDistance(p) {
    const dx = Math.max(0, Math.abs(p.x) - this.w / 2);
    const dy = Math.max(0, Math.abs(p.y) - this.h / 2);
    const dz = Math.max(0, p.z - this.t);
    return Math.hypot(dx, dy, dz);
  }

  inside(p) {
    return Math.abs(p.x) <= this.w / 2 && Math.abs(p.y) <= this.h / 2;
  }

  update(dt) {
    const probes = this.consumeProbes();
    // Pick the probe closest to the face; rays that hit count as distance 0.
    let best = null, bestD = Infinity;
    for (const p of probes) {
      const d = p.kind === 'ray' ? (this.inside(p.point) ? 0 : Infinity) : this.faceDistance(p.point);
      if (d < bestD) { best = p; bestD = d; }
    }

    // Hover with hysteresis (pokes) or direct hit (rays).
    this.hovered = best?.kind === 'ray' ? bestD === 0 : this.hoverBand.update(bestD);
    if (!best) this.hoverBand.update(Infinity);

    // Press: pokes press by depth; a ray press pushes all the way in.
    let penetration = null, inside = false;
    if (best && this.enabled) {
      inside = this.inside(best.point);
      if (best.kind === 'poke') penetration = this.t - best.point.z;
      // A ray has no depth: press goes all the way in, and letting go is a
      // clean release (no retreat distance to cover).
      else penetration = best.pressed ? this.press.maxDepth : -Infinity;
    }
    const ev = this.press.update(dt, penetration, inside);
    if (ev === 'press') this.dispatchEvent({ type: 'press' });
    if (ev === 'release') {
      this.dispatchEvent({ type: 'release' });
      if (!this.disabled) this.dispatchEvent({ type: 'select' });
    }
    if (ev === 'cancel') this.dispatchEvent({ type: 'cancel' });

    // Hover fade, eased by motion.hover.in (out mirrors in, see DEFAULTS).
    const target = this.hovered && !this.disabled ? 1 : 0;
    this.hoverT = clamp(this.hoverT + (target ? 1 : -1) * dt / this.hoverIn, 0, 1);
    const hover = this.hoverEase(this.hoverT);
    this.hover = hover;

    // The highlight spot drifts after the pointer instead of jumping.
    if (best) this.spot.lerp(new THREE.Vector2(best.point.x, best.point.y), 1 - Math.exp(-dt * 18));
    const u = this.skin.uniforms;
    u.uHover.value = hover;
    if (u.uPress) u.uPress.value = this.press.amount;
    if (this.variant === 'plain') u.uFade.value = hover;
    u.uSpot.value.copy(this.spot);
    if (this.emboss) {
      this.stepBulge(dt);
      // Content under a clear bubble is magnified a touch, like through a lens.
      this.face.scale.setScalar(1 + DEFAULTS.look.emboss.magnify * Math.max(0, this.bz) / this.lift);
    } else if (this.variant === 'plain') {
      // A pressed lens also shrinks slightly (Emil Kowalski: 0.95 to 0.98).
      const k = 1 - 0.025 * this.press.amount;
      this.face.scale.setScalar(k);
      this.body.scale.x = this.body.scale.y = k;
    }
    this.layoutFront();
  }
}

// One spring step (response in s, damping ratio), substepped for stability.
function spring(x, v, target, response, damping, dt) {
  const w = 2 * Math.PI / response;
  for (let i = 0, n = 4, h = dt / n; i < n; i++) {
    v += (-w * w * (x - target) - 2 * damping * w * v) * h;
    x += v * h;
  }
  return { x, v };
}
