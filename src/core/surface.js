// Shared building blocks: thick slabs, outlines, glows and text labels.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEFAULTS } from './defaults.js';

// A slab whose back face sits at z = 0 and front face at z = t, so scaling z
// compresses it toward its back, like pressing a real object.
export function slabGeometry(w, h, t) {
  const r = Math.min(t / 2, Math.min(w, h) * DEFAULTS.cornerRatio) * 0.95;
  const g = new RoundedBoxGeometry(w, h, t, 3, r);
  g.translate(0, 0, t / 2);
  return g;
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// A flat ring around a w x h face, `width` wide. Used for the MR outline and hover glow.
export function frameGeometry(w, h, width) {
  const r = Math.min(w, h) * DEFAULTS.cornerRatio;
  const outer = roundedRectShape(w + 2 * width, h + 2 * width, r + width);
  outer.holes.push(roundedRectShape(w, h, r));
  return new THREE.ShapeGeometry(outer, 6);
}

export function surfaceMaterial(T, color = DEFAULTS.color.surface) {
  const opacity = T.get('surface.opacity.base');
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.65, metalness: 0.0,
    transparent: opacity < 1, opacity,
    userData: { baseOpacity: opacity },
  });
}

export function flatMaterial(color, opacity = 1, extra = {}) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    userData: { baseOpacity: opacity }, ...extra,
  });
}

// Text drawn to a canvas and shown on a plane `height` metres tall.
export class Label extends THREE.Mesh {
  constructor(text, { height, color = DEFAULTS.color.text, weight = 600, align = 'center', maxWidth } = {}) {
    const canvas = document.createElement('canvas');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    super(new THREE.PlaneGeometry(1, 1), flatMaterial(0xffffff, 1, { map: texture }));
    this.canvas = canvas;
    this.texture = texture;
    this.opts = { height, color, weight, align, maxWidth };
    this.renderOrder = 2;
    this.setText(text);
  }

  setText(text) {
    if (text === this.text) return;
    this.text = text;
    const { height, color, weight, align, maxWidth } = this.opts;
    const px = 96;
    const ctx = this.canvas.getContext('2d');
    const font = `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.font = font;
    const textW = Math.ceil(ctx.measureText(text).width) + px * 0.4;
    const ratio = height / (px * 1.3);
    let w = textW * ratio;
    if (maxWidth && w > maxWidth) w = maxWidth;
    this.canvas.width = Math.ceil(w / ratio);
    this.canvas.height = Math.ceil(px * 1.3);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align;
    const x = align === 'left' ? px * 0.2 : align === 'right' ? this.canvas.width - px * 0.2 : this.canvas.width / 2;
    ctx.fillText(text, x, this.canvas.height / 2);
    this.texture.needsUpdate = true;
    this.scale.set(this.canvas.width * ratio, height, 1);
    this.width = this.canvas.width * ratio;
  }
}

// Multiply every material's base opacity by `k` (used for packaging fades).
export function setGroupOpacity(root, k) {
  root.traverse(o => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      const base = m.userData.baseOpacity ?? 1;
      m.opacity = base * k * (o.userData.opacityScale ?? 1);
      m.transparent = true;
    }
    o.visible = o.userData.hidden ? false : k > 0.001;
  });
}
