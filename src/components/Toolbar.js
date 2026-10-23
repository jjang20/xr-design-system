// Contour Toolbar: an ornament of actions under a window. One glass bar;
// its buttons are not separate objects but places where the bar's own glass
// swells into a bubble on hover and dents on press (the bubble language,
// docs/components.md). The primary action is a patch of accent-tinted glass:
// the bar's material, coloured, so the room shows through it blue.
//
// Tokens used: as Button (size.interactive.default, material.thickness.*, density.*,
// input.*), plus DEFAULTS.look.emboss and DEFAULTS.color.accentGlass.
import * as THREE from 'three';
import { markComponent } from '../core/Interactable.js';
import { DEFAULTS } from '../core/defaults.js';
import { setTint } from '../core/look.js';
import { driveBubbles } from '../core/bubbles.js';
import { Button } from './Button.js';

export class Toolbar extends THREE.Group {
  /**
   * @param {object} T tokens
   * @param {object} o
   * @param {object[]} o.tools  Button options (label, icon, shape, width, density, disabled, primary)
   * @param {number} [o.distance] placement distance in m, for dmm
   * @param {number} [o.gap=4]    dmm between buttons
   * @param {number} [o.pad=10]   dmm from the bar's end to the first button
   */
  constructor(T, o) {
    super();
    markComponent(this);
    const dist = this.distance = o.distance ?? DEFAULTS.distance;
    const dmm = v => (v / 1000) * T.effectiveDistance(dist);
    const gap = dmm(o.gap ?? 4), pad = dmm(o.pad ?? 10);
    const side = T.viewSize('size.interactive.default', dist);

    // Buttons first, to size the bar around them.
    this.buttons = o.tools.map(t => new Button(T, {
      ...t, variant: 'plain', hoverStyle: 'emboss', thickness: 'thin', distance: dist,
    }));
    const W = this.buttons.reduce((w, b) => w + b.w, 0) + gap * (this.buttons.length - 1) + pad * 2;
    const H = side + pad * 2;
    // The bar: rigid glass, like a window (it barely gives).
    this.bar = new Button(T, {
      width: W / T.effectiveDistance(dist) * 1000, height: H / T.effectiveDistance(dist) * 1000, shape: 'capsule',
      thickness: 'regular', density: 'rigid', variant: 'glass', distance: dist,
    });
    this.add(this.bar);
    this.size = { W, H };

    let x = -W / 2 + pad;
    const m = this.bar.body.material;
    for (const [i, b] of this.buttons.entries()) {
      b.position.set(x + b.w / 2, 0, this.bar.t);
      x += b.w + gap;
      this.add(b);
      b.addEventListener('select', () => this.dispatchEvent({ type: 'select', tool: o.tools[i], index: i }));
      if (o.tools[i].primary) {
        setTint(m, { x: b.position.x, y: 0, hw: b.w / 2, hh: b.h / 2, r: b.r, soft: dmm(0.6),
          albedo: DEFAULTS.color.accentGlass, amount: b.disabled ? 0.3 : 1 });
      }
    }
  }

  update(dt) {
    this.bar.update(dt);
    for (const b of this.buttons) b.update(dt);
    driveBubbles(this.bar.body.material, this.buttons);
  }
}
