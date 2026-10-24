// Contour Button: a thick object that compresses when poked.
//
// Tokens used:
//   material.thickness.{thin|regular|thick}        thickness
//   material.firmness.* / motion.recovery.*   press ratio and recover time
//   input.hover.distance.enter / exit           hover hysteresis (m)
//   input.poke.distance.release                 release hysteresis
//   size.interactive.default                    default face size (vpt)
//   motion.enter.*                      hover fade
//   material.glow.width                     hover edge glow width (vpt)
//   material.opacity.default / outline.mr      opaque surface, luminous MR edge
//
// Appearance options (not behaviour): shape, variant, icon, label, sublabel,
// accessory, layout. See docs/components.md.
import * as THREE from 'three';
import { Interactable, markComponent, pickProbe } from '../core/Interactable.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { PressModel } from '../core/PressModel.js';
import { cubicBezier, clamp, lerp } from '../core/easing.js';
import { DEFAULTS } from '../core/defaults.js';
import { springTo, prefersReducedMotion } from '../core/spring.js';
import { refractiveGlass, refractiveMesh } from '../core/refract.js';
import { bodyGeometry, bodyMaterial, faceMaterial, glassMaterial, glassSlabGeometry, glassBeadGeometry, setTint, makeText, makeIcon } from '../core/look.js';

const C = DEFAULTS.color;
const inputScale = new THREE.Vector3();

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
   * @param {'secondary'|'primary'|'plain'|'glass'|'window'|'tinted'|'bead'|'tile'} [o.variant='secondary']  tile: a glass globe (Dock)
   * @param {number} [o.color]      fill colour override (tinted variant)
   * @param {'soft'|'firm'|'rigid'} [o.density='firm']
   * @param {'thin'|'regular'|'thick'} [o.thickness='regular']
   * @param {number} [o.width]      face width in dmm (default size.interactive.default)
   * @param {number} [o.height]     face height in dmm (default size.interactive.default)
   * @param {number} [o.radius]     corner radius in dmm
   * @param {number} [o.distance]   placement distance in m, for dmm
   * @param {boolean} [o.disabled]
   */
  constructor(T, o = {}) {
    super();
    markComponent(this);
    this.T = T;
    const distance = this.distance = o.distance ?? DEFAULTS.distance;
    const dmm = v => (v / 1000) * T.effectiveDistance(distance);
    this.disabled = !!o.disabled;
    this.variant = o.variant ?? 'secondary';
    // Disabled elements are rigid: they barely give, which reads as "not now".
    this.density = this.disabled ? 'rigid' : (o.density ?? 'firm');
    this.t = T.get(`material.thickness.${o.thickness ?? 'regular'}`);
    const side = T.viewSize('size.interactive.default', distance);
    this.w = o.width != null ? dmm(o.width) : side;
    this.h = o.height != null ? dmm(o.height) : side;
    if (o.shape === 'circle') this.w = this.h = Math.min(this.w, this.h);
    this.r = o.shape === 'circle' || o.shape === 'capsule' ? Math.min(this.w, this.h) / 2
      : dmm(o.radius ?? DEFAULTS.radius.control);
    this.embossRadius = Math.min(this.h / 2, this.r);
    // An app tile is a glass globe: as deep as it is wide.
    this.globe = this.variant === 'tile';
    if (this.globe) this.t = this.w;
    this.frontZ = this.t;

    this.press = new PressModel({
      thickness: this.t,
      pressRatio: T.get(`material.firmness.${this.density}.pressDepth`),
      recover: T.get(`motion.recovery.${this.density}.duration`),
      release: T.get('input.poke.distance.release'),
    });
    this.hoverBand = new Hysteresis(
      T.get('input.hover.distance.enter'),
      T.get('input.hover.distance.exit'),
    );
    this.hoverIn = T.get('motion.enter.duration');
    this.hoverEase = cubicBezier(T.get('motion.enter.easing'));
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
      this.body = new THREE.Mesh(glassSlabGeometry(this.w, this.h, this.t, this.r, { tessellate: 0.002 }), glassMaterial(T, { w: this.w, h: this.h, t: this.t, r: this.r }));
      this.body.renderOrder = 1;
      this.skin = this.body.material;
    } else if (this.variant === 'bead') {
      // A tinted glass bead (Dock icons): a dome of coloured glass, like the
      // Catalog's icon beads, so the room shows through it in the app's
      // colour (accent colour lives in the glass, Jihoon 2026-10-20).
      this.beadH = this.w * DEFAULTS.look.dockBeadHeight;
      this.body = new THREE.Mesh(glassBeadGeometry(this.w, this.beadH), glassMaterial(T, { w: this.w, h: this.w, t: this.beadH, kind: 'bead' }));
      this.body.renderOrder = 2;
      this.skin = this.body.material;
      setTint(this.skin, { hw: this.w / 2, hh: this.w / 2, r: this.w / 2, soft: this.w * 0.02, albedo: glassAlbedo(fill), amount: this.disabled ? 0.3 : 1 });
    } else if (this.globe) {
      // An app icon (the shelf Dock): a globe of tinted glass that floats
      // over the shelf, its glyph hanging at the centre and magnified by the
      // ball like a paperweight (Jihoon 2026-10-20: "literally globe, not
      // rounded square"). Part milky, as lookdev/dock_slider.py's milky().
      const r = this.w / 2;
      this.r = r;
      // Every hue lets the same amount of light through (equal luminance),
      // so a white glyph reads as well in a green globe as in a blue one.
      const tint = equalLuminance(glassAlbedo(fill, DEFAULTS.look.glass.tileNeutral), DEFAULTS.look.refract.tile.luminance).map(v => this.disabled ? 0.7 + 0.3 * v : v);
      this.body = refractiveMesh(new THREE.SphereGeometry(r, 64, 48).translate(0, 0, r), refractiveGlass('tile', { thick: this.t, color: tint, globe: true, glyph: { map: null, size: 1 } }));
      this.body.userData.globeCenter = new THREE.Vector3(0, 0, r);
      this.body.userData.globeRadius = r;
      // The tint is also what the glass absorbs: deeper colour through the
      // middle of the ball, where the path is longest.
      // A grey globe absorbs evenly: smoked glass, so it reads as tinted
      // like the others rather than clear (and its glyph keeps contrast).
      const hi = Math.max(...tint, DEFAULTS.look.refract.tile.neutralDepth);
      this.body.material.uniforms.uAttColor.value.setRGB(...tint.map(v => v / hi));
      this.body.material.uniforms.uAttDist.value = this.t * DEFAULTS.look.refract.tile.absorb;
      this.body.renderOrder = 2;
      this.skin = this.body.material;
    } else if (this.variant === 'plain') {
      // A light glass lens: invisible at rest, it lifts out of the window
      // on hover, carrying the row's content with it.
      // With hoverStyle 'emboss' there is no lens: the window glass swells
      // into a bubble under the row instead (the panel draws it), and the
      // body only stays as the row's hit area.
      this.emboss = (o.hoverStyle ?? DEFAULTS.look.hoverStyle) === 'emboss';
      // Emboss sizes are mm at DEFAULTS.distance, grown with distance like dmm.
      this.k = T.effectiveDistance(distance) / T.effectiveDistance(DEFAULTS.distance);
      this.lift = (this.emboss ? DEFAULTS.look.emboss.height * this.k : DEFAULTS.look.lensLift) / 1000;
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
    if (this.globe) {
      // The glyph is drawn by the globe's glass (see GLYPH in core/refract.js).
      const u = this.skin.uniforms;
      u.uGlyphOn.value = this.icon ? 1 : 0;
      if (this.icon) {
        u.uGlyph.value = this.icon.material.map;
        this.skin.userData.glyphSize = this.icon.geometry.parameters.width;
        this.icon.visible = false;
      }
    }
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
      const label = makeText(o.label ?? '', { style: 'headline', size: dmm(DEFAULTS.type.headline.size), anchorX: 'left', opacity: dim });
      // Label and detail centred as a pair: half of each line's height apart.
      const lineGap = (DEFAULTS.type.headline.size + DEFAULTS.type.footnote.size) * 0.6 / 2;
      label.position.set(x, hasSub ? dmm(lineGap) : 0, z);
      this.face.add(label);
      if (hasSub) {
        const sub = makeText(o.sublabel, { style: 'footnote', size: dmm(DEFAULTS.type.footnote.size), anchorX: 'left', opacity: E.secondary * dim });
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
      // In a globe the glyph is magnified by the glass, so it starts smaller.
      const s = Math.min(this.h, this.w) * (both && narrow ? 0.36 : 0.42) * (this.globe ? DEFAULTS.look.globeGlyph : 1);
      const icon = makeIcon(o.icon, s, { opacity: dim });
      if (both && !narrow) icon.position.set(-this.w / 2 + this.h * 0.42 + s / 2, 0, z);
      else icon.position.set(0, both ? this.h * 0.1 : 0, z);
      icon.position.z = z;
      this.face.add(icon);
      this.icon = icon;
    }
    if (o.label) {
      const size = both && narrow ? this.h * 0.16 : Math.min(this.h * 0.3, dmm(17));
      const label = makeText(o.label, { size, weight: this.variant === 'primary' || o.primary ? 600 : 500, opacity: dim });
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
    this.face.position.z = this.emboss ? Math.max(0, this.bulge) + 0.0004
      : this.beadH ? this.beadH * front / this.t + 0.0004   // a pressed bead squashes; its glyph rides the top
      : this.globe ? front / 2                               // the glyph hangs at the globe's centre
      : front + lift;
  }

  // Emboss style: how far the window swells under this row. Driven by a
  // slightly underdamped spring in update(), like a fluid-filled skin (see
  // docs/catalog-spec.md, "Bubble").
  get bulge() { return this.bz ?? 0; }
  // The press dent (metres deep, at dentAt in local coordinates), or null.
  get dent() {
    const D = DEFAULTS.look.emboss.dent;
    return this.dz ? { x: this.dentAt.x, y: this.dentAt.y, radius: D.width * this.k / 2000 / Math.sqrt(Math.LN2), depth: this.dz } : null;
  }
  // Press glow, 0 to 1: follows the dent in, fades as it springs back.
  get glow() {
    const E = DEFAULTS.look.emboss;
    const dent = this.dz > 0 ? clamp(this.dz / (E.dent.depth * this.k / 1000), 0, 1) : 0;
    return Math.max(dent, this.press.pressed && !this.disabled ? E.glow.contact : 0);
  }

  stepBulge(dt) {
    const E = DEFAULTS.look.emboss, on = this.hovered && !this.disabled;
    // Hover inflates; pressing lets the pillow sag a little (E.squash)
    // while a dent gives way where the press lands.
    const target = on ? this.lift * (1 - E.squash * this.press.amount) : 0;
    // Deflating settles without a wobble (critically damped), so leaving a
    // row stays quiet; only inflating carries the fluid settle.
    // Reduced motion: no settle and no rebound (Apple: drop overshoot).
    const calm = prefersReducedMotion();
    const s = { x: this.bz ?? 0, v: this.bv ?? 0 };
    springTo(s, target, E.response, target === 0 || calm ? 1 : E.damping, dt);
    this.bz = s.x; this.bv = s.v;
    // The dent is quicker and springs back past flat once on release: the
    // skin rebounds. It is placed at the press point and stays there while
    // it recovers, so it never slides.
    this.dentAt ??= new THREE.Vector2();
    if (this.press.amount > 0.01 && !this.dz) this.dentAt.copy(this.spot);
    // A fingertip drags the dent along; a ray (gaze and pinch) pins it where
    // the pinch began, since eye tracking wobbles about 1° (35 mm at 2 m).
    if (this.press.amount > 0.01 && this.pressKind === 'poke') this.dentAt.lerp(this.spot, 1 - Math.exp(-dt * 18));
    const d = { x: this.dz ?? 0, v: this.dv ?? 0 };
    springTo(d, on ? E.dent.depth * this.k / 1000 * this.press.amount : 0, E.dent.response, calm ? 1 : E.dent.damping, dt);
    this.dz = Math.abs(d.x) < 1e-6 && Math.abs(d.v) < 1e-5 ? 0 : d.x; this.dv = d.v;
  }

  // Direct-touch floors and reach thresholds are physical, even while a
  // Packaging parent scales this button. Probes arrive in local space.
  get touchW() { return Math.max(this.w, this.T.get('input.touch.size.minimum') / Math.abs(this.getWorldScale(inputScale).x)); }
  get touchH() { return Math.max(this.h, this.T.get('input.touch.size.minimum') / Math.abs(this.getWorldScale(inputScale).y)); }

  // Match the glass pillow's visible profile (core/look.js bulgeH1), not
  // the undeformed hit mesh hidden underneath it. Freeze the contact plane
  // during a press so its own dent/recovery cannot move the trigger.
  surfaceZ(p) {
    if (this.emboss) {
      const r = this.embossRadius;
      const qx = Math.abs(p.x) - this.w / 2 + r, qy = Math.abs(p.y) - this.h / 2 + r;
      const d = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
      const ramp = DEFAULTS.look.emboss.ramp * this.k / 1000;
      const t = clamp((0.15 * ramp - d) / ramp, 0, 1);
      const mask = t ** 3 * (t * (t * 6 - 15) + 10);
      const u = clamp(-d / Math.min(this.w / 2, this.h / 2), 0, 1);
      return Math.max(0, this.bulge) * mask * Math.sqrt(1 - (1 - u) ** 2);
    }
    const height = this.beadH ?? this.t;
    return height + (this.lift ? this.lift * (this.hover ?? 0) : 0);
  }

  faceDistance(p, radius = 0) {
    const dx = Math.max(0, Math.abs(p.x) - this.touchW / 2);
    const dy = Math.max(0, Math.abs(p.y) - this.touchH / 2);
    this.getWorldScale(inputScale);
    return Math.max(0, Math.hypot(dx * inputScale.x, dy * inputScale.y,
      Math.max(0, p.z - this.surfaceZ(p)) * inputScale.z) - radius);
  }

  inside(p, touch = false) {
    return Math.abs(p.x) <= (touch ? this.touchW : this.w) / 2 && Math.abs(p.y) <= (touch ? this.touchH : this.h) / 2;
  }

  // Rank overlapping touch regions by distance to the visible face, in
  // world metres, including lateral approach outside the touch floor.
  pokeDistance(p) {
    this.getWorldScale(inputScale);
    return Math.hypot(Math.max(0, Math.abs(p.x) - this.w / 2) * inputScale.x,
      Math.max(0, Math.abs(p.y) - this.h / 2) * inputScale.y, Math.max(0, p.z - this.surfaceZ(p)) * inputScale.z);
  }

  update(dt) {
    this.press.release = this.T.get('input.poke.distance.release') / Math.abs(this.getWorldScale(inputScale).z);
    const probes = this.consumeProbes();
    // Respect explicit press gates on externally supplied probes too.
    const eligible = this.press.pressed ? probes : probes.filter(p => p.canPress !== false);
    const candidates = eligible.length ? eligible : probes;
    const distance = p => p.kind === 'ray' ? (this.inside(p.point) ? 0 : Infinity) : this.faceDistance(p.point, p.radius);
    const owner = this.press.pressed ? this.pressOwner : null;
    const { probe: best } = pickProbe(candidates, distance, owner);
    if (!this.press.pressed && best?.kind === 'poke' && this.probeId !== best.id) this.press.lastPenetration = this.press.lastSeparation = null;
    this.probeId = best?.id;
    // Press eligibility cannot hide a closer hand's proximity feedback.
    const { probe: hoverProbe, distance: hoverDistance } = pickProbe(probes, distance, owner);

    // Hover with hysteresis (pokes) or direct hit (rays).
    this.hovered = hoverProbe?.kind === 'ray' ? hoverDistance === 0 : this.hoverBand.update(hoverDistance);
    if (!hoverProbe) this.hoverBand.update(Infinity);

    // Press: pokes press by depth; a ray press pushes all the way in.
    let penetration = null, inside = false, separation = null;
    if (best && this.enabled) {
      inside = best.canPress !== false && this.inside(best.point, best.kind === 'poke');
      if (best.kind === 'poke') {
        const front = this.press.pressed ? this.pokeFront : this.surfaceZ(best.point);
        if (this.emboss) separation = best.point.z - front - (best.radius ?? 0) / Math.abs(this.getWorldScale(inputScale).z);
        penetration = front - best.point.z + ((best.radius ?? 0) + (best.pressOffset ?? 0)) / Math.abs(this.getWorldScale(inputScale).z);
      }
      // A ray has no depth: press goes all the way in, and letting go is a
      // clean release (no retreat distance to cover). Only a pinch that
      // began on this button presses it (captured), not one dragged onto it.
      else penetration = best.pressed && best.captured ? this.press.maxDepth : -Infinity;
    }
    if (best && this.press.amount < 0.01) this.pressKind = best.kind;
    const ev = this.press.update(dt, penetration, inside, separation);
    if (ev === 'press') {
      this.pressOwner = best.id;
      this.pokeFront = this.surfaceZ(best.point);
      this.dispatchEvent({ type: 'press' });
    }
    if (ev === 'release') {
      this.dispatchEvent({ type: 'release' });
      if (!this.disabled) this.dispatchEvent({ type: 'select' });
    }
    if (ev === 'cancel') this.dispatchEvent({ type: 'cancel' });

    // Hover fade, eased by motion.enter (out mirrors in, see DEFAULTS).
    const target = this.hovered && !this.disabled ? 1 : 0;
    this.hoverT = clamp(this.hoverT + (target ? 1 : -1) * dt / this.hoverIn, 0, 1);
    const hover = this.hoverEase(this.hoverT);
    this.hover = hover;

    // The highlight spot drifts after the pointer instead of jumping.
    const feedbackProbe = this.press.pressed ? best : hoverProbe;
    if (feedbackProbe) this.spot.lerp(new THREE.Vector2(feedbackProbe.point.x, feedbackProbe.point.y), 1 - Math.exp(-dt * 18));
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

// Tinted-glass transmission for a colour: its hue at full strength, so the
// room shows through in that colour (the scrim caps brightness for text).
// A grey (unsaturated) colour gets the window's own glass instead.
function glassAlbedo(hex, neutral = DEFAULTS.look.glass.window.albedo) {
  const c = new THREE.Color(hex);
  const hi = Math.max(c.r, c.g, c.b, 1e-3), lo = Math.min(c.r, c.g, c.b);
  if ((hi - lo) / hi < 0.25) return neutral;
  return [c.r / hi * 1.3, c.g / hi * 1.3, c.b / hi * 1.3];
}

// A tint scaled to a given luminance (Rec. 709 weights, linear), no channel
// above 1.6.
function equalLuminance(c, target) {
  const k = target / Math.max(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], 1e-3);
  return c.map(v => Math.min(v * k, 1.6));
}

