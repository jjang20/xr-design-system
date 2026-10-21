// Contour app objects: the Dock's icons as real things standing on its
// glass shelf (Jihoon, 2026-10-21: "3d icons should look like real 3d
// objects"; his reference is the Mac OS X dock, where Safari is a metal
// compass and Address Book a leather book). Each app is a small physical
// object, made of the materials such a thing is made of and lit by the room:
//
//   house     Planner   a model house on a birch base, its roof the app's blue
//   ruler     Measure   a tape measure, an orange shell, its blade drawn out
//   scan      Scan      a camera lens lying on its barrel, a green ring
//   image     Photos    a photo in a lacquered frame, leaning on its stand
//   settings  Settings  two meshing gears of brushed metal
//
// Contour's own objects, not Apple's icons. Built in code (no model files),
// so an app's colour carries into its object. Realism comes from what real
// objects have and flat icons don't: every edge rounded so it catches a
// line of light, several materials per object (painted, rubber, metal,
// glass, paper), small printed and machined details, and a slight turn so
// each shows its side as well as its face.
//
// Unit space: an object stands on y = 0, centred on x and z, faces +z, and
// its larger side is 1 (times its optical size, see SIZE). The Dock scales it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedRectShape } from './look.js';
import interSemibold from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url';

const BUILDERS = { house, ruler: tapeMeasure, scan: lens, image: pictureFrame, settings: gears };
// Optical size: a round object looks smaller than a square one of the same
// width (as icon grids size circles up), and a wide one larger.
const SIZE = { house: 1.06, ruler: 1, scan: 0.98, image: 0.98, settings: 1.06 };
// Each turns a little, so it shows its side as well as its face (the
// reference's calendar and book stand at an angle). Radians, + turns left.
const TURN = { house: -0.42, ruler: -0.38, scan: -0.5, image: -0.4, settings: -0.22 };

export const hasAppObject = kind => kind in BUILDERS;

/**
 * @param {string} kind  the app's icon name (see BUILDERS)
 * @param {{color?: number}} [o]  the app's colour
 * @returns {THREE.Group}  standing on y = 0, larger side about 1
 */
export function makeAppObject(kind, { color = 0x8a8f98 } = {}) {
  const build = BUILDERS[kind];
  if (!build) throw new Error(`Contour: no app object "${kind}" (add one to src/core/objects.js)`);
  const inner = build(new THREE.Color(color));
  inner.rotation.y = TURN[kind];
  // Stand it on y = 0, centred, its larger side 1.
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const k = SIZE[kind] / Math.max(size.x, size.y);
  inner.position.set(-mid.x * k, -box.min.y * k, -mid.z * k);
  inner.scale.setScalar(k);
  const g = new THREE.Group();
  g.add(inner);
  g.userData.kind = kind;
  g.userData.size = size.multiplyScalar(k);   // its footprint and height, for contact shadows
  return g;
}

// ---------------------------------------------------------------------------
// Light. The objects are lit by the room's own light, so they sit in it,
// plus soft boxes, as a product is photographed: a glossy shell or a chrome
// ring then shows a clean, shaped highlight instead of a dim smear of the
// room (judged side by side, 2026-10-21). The boxes are set round the
// objects' front (+z), so the rig turns with whatever holds them.

const envCache = new Map();
/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Texture|null} room  the room (an equirect texture), or null
 * @param {THREE.Euler} [rotation]  the room's rotation (scene.environmentRotation)
 * @param {object[]} boxes  soft boxes: { at: [x, y, z] direction, size: [w, h], power }
 * @returns {THREE.Texture} a prefiltered environment for the objects' materials
 */
export function objectEnvironment(renderer, room, rotation, boxes) {
  const key = room?.uuid ?? 'none';
  if (envCache.has(key)) return envCache.get(key);
  const s = new THREE.Scene();
  s.background = room ?? new THREE.Color(0.18, 0.18, 0.2);
  if (rotation) s.backgroundRotation.copy(rotation);
  for (const b of boxes) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...b.size), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(b.power), side: THREE.DoubleSide }));
    m.position.set(...b.at).normalize().multiplyScalar(6);
    m.lookAt(0, 0, 0);
    s.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.01, 0.1, 50).texture;
  pm.dispose();
  envCache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Materials. Physically based, lit by the room (scene.environment) and the
// Dock's key light, so the objects and the glass around them share a light.

const plastic = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.08, ...o });
const rubber = (color = 0x232428, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.78, sheen: 0.4, sheenRoughness: 0.8, sheenColor: 0x555555, ...o });
const metal = (color, roughness = 0.25, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, ...o });
const paint = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, ...o });
const glass = (o = {}) => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0.02, ior: 1.5, thickness: 0.02, ...o });

// Printing on the objects (the lens's markings, the tape's label) is set in
// Inter, Contour's typeface. A canvas can only use a font the page has
// loaded, so printed textures are painted again once it has.
const FONT = 'ContourInter';
export const objectFontsReady = typeof FontFace === 'undefined' ? Promise.resolve()
  : Promise.all([[interSemibold, '600'], [interBold, '700']].map(([url, weight]) =>
    new FontFace(FONT, `url(${url})`, { weight }).load().then(f => document.fonts.add(f)))).catch(() => {});
const font = (weight, px) => `${weight} ${px}px ${FONT}, sans-serif`;

// A texture painted on a canvas. Colour maps are sRGB; data (bump, direction)
// stays linear.
function paintTexture(w, h, draw, { data = false, repeat, text = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (text) objectFontsReady.then(() => { draw(c.getContext('2d'), w, h); t.needsUpdate = true; });
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// ---------------------------------------------------------------------------
// Geometry helpers

// Smooth shading across gentle bends (a bevel, a fillet), hard across real
// corners: an extruded or lathed solid otherwise shades as flat facets.
const smooth = (g, angle = 0.62) => toCreasedNormals(g, angle);

// A flat outline pushed out to `depth` (centred on z), its edges rounded by
// a bevel `bevel` deep and `size` wide.
function extrude(shape, depth, bevel, size = bevel, segments = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: size, bevelSegments: segments, curveSegments: 48 });
  g.translate(0, 0, -depth / 2);
  return smooth(g);
}

// A profile [[r, z], ...] spun round the z axis (a turned part).
function lathe(points, segments = 96) {
  // Spun back to front, so its faces point outward (front to back turns them in).
  if (points[0][1] > points[points.length - 1][1]) points = [...points].reverse();
  const g = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  g.rotateX(Math.PI / 2);   // spun round y, then laid along z
  return smooth(g, 0.5);
}

// Round every corner of a polyline profile with a small arc, as a machined
// edge is never sharp: the arc catches a thin line of light.
function fillet(points, r, steps = 4) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [p, q, n] = [points[i - 1], points[i], points[i + 1]];
    const a = [p[0] - q[0], p[1] - q[1]], b = [n[0] - q[0], n[1] - q[1]];
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    const t = Math.min(r, la / 2, lb / 2);
    const s = [q[0] + a[0] / la * t, q[1] + a[1] / la * t], e = [q[0] + b[0] / lb * t, q[1] + b[1] / lb * t];
    // A quadratic curve through the corner, tangent to both edges.
    for (let k = 0; k <= steps; k++) {
      const u = k / steps, w0 = (1 - u) ** 2, w1 = 2 * u * (1 - u), w2 = u * u;
      out.push([w0 * s[0] + w1 * q[0] + w2 * e[0], w0 * s[1] + w1 * q[1] + w2 * e[1]]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const box = (w, h, d, r, mat, segments = 4) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segments, r), mat);
const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };

// ---------------------------------------------------------------------------
// Measure: a tape measure. A glossy shell in the app's colour belted with
// black rubber, a printed label on its face, the blade drawn out a little
// with its hook down on the shelf.

function tapeMeasure(color) {
  const g = new THREE.Group();
  const w = 0.74, h = 0.72, depth = 0.3, bev = 0.07, grow = 0.06;
  const cy = h / 2 + grow;
  const shell = new THREE.Mesh(extrude(roundedRectShape(w, h, 0.2), depth, bev, grow, 8), plastic(color));
  g.add(at(shell, 0, cy, 0));
  // A rubber belt round its edge, as on a site tape: it reads as a tool,
  // not a gadget.
  const belt = new THREE.Mesh(extrude(roundedRectShape(w + 0.02, h + 0.02, 0.21), depth * 0.5, 0.025, grow + 0.012, 5), rubber(0x1f2024));
  g.add(at(belt, 0, cy, 0));
  // Label on its face: printed, under a clear coat.
  const label = paintTexture(560, 520, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#34363c'); gr.addColorStop(1, '#202125');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = font(600, 44); c.letterSpacing = '8px'; c.fillText('CONTOUR', W / 2, H * 0.22);
    c.letterSpacing = '0px';
    c.font = font(700, 190); c.fillText('5m', W / 2, H * 0.55);
    c.fillStyle = '#' + color.getHexString(); c.fillRect(W * 0.2, H * 0.78, W * 0.6, 10);
    c.fillStyle = '#c9cbd1'; c.font = font(600, 40); c.fillText('16 ft', W / 2, H * 0.88);
  }, { text: true });
  const lw = 0.5, lh = 0.46;
  label.repeat.set(1 / lw, 1 / lh); label.offset.set(0.5, 0.5);
  const plate = new THREE.Mesh(extrude(roundedRectShape(lw - 0.02, lh - 0.02, 0.1), 0.006, 0.008, 0.008, 3), new THREE.MeshPhysicalMaterial({ map: label, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06 }));
  g.add(at(plate, 0, cy, depth / 2 + bev - 0.004));
  // Lock button on top, black rubber.
  g.add(at(box(0.2, 0.06, 0.13, 0.025, rubber(0x18191c)), 0.1, h + grow * 2 - 0.005, 0.03));
  // Mouth: a black block where the blade comes out, low on the right side.
  const mouthX = w / 2 + grow - 0.01;
  g.add(at(box(0.08, 0.15, depth + 0.07, 0.028, rubber(0x18191c)), mouthX, 0.11, 0));
  // Blade: painted steel, cupped across its width, with printed ticks.
  const len = 0.34, bw = 0.22;
  const blade = new THREE.PlaneGeometry(len, bw, 24, 12);
  const p = blade.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = p.getY(i) / (bw / 2); p.setZ(i, 0.016 * v * v); }   // printed side concave, edges up
  blade.computeVertexNormals();
  blade.rotateX(-Math.PI / 2);   // lie flat, its width along z
  const ticks = paintTexture(1024, 512, (c, W, H) => {
    c.fillStyle = '#f2c81e'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#16120a';
    for (let i = 0; i <= 80; i++) {
      const x = W - i * W / 80, long = i % 10 === 0 ? 0.36 : i % 5 === 0 ? 0.26 : 0.15;
      c.fillRect(x - 3, 0, 6, H * long);
      c.fillRect(x - 3, H * (1 - long), 6, H * long);
    }
    c.font = font(700, 120); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 1; i <= 7; i++) { c.fillStyle = i === 3 ? '#c8211b' : '#16120a'; c.fillText(String(i), W - i * W / 8, H / 2); }
  }, { text: true });
  const bladeMesh = new THREE.Mesh(blade, new THREE.MeshPhysicalMaterial({ map: ticks, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.12, side: THREE.DoubleSide }));
  g.add(at(bladeMesh, mouthX + len / 2, 0.035, 0));
  // Hook: a brass tab bent down to the shelf, riveted to the blade.
  const brass = metal(0xd2ad6e, 0.28);
  const hookX = mouthX + len + 0.006;
  g.add(at(box(0.026, 0.1, bw + 0.03, 0.009, brass), hookX, 0.05, 0));
  g.add(at(box(0.08, 0.012, bw * 0.75, 0.005, brass), hookX - 0.04, 0.057, 0));
  for (const z of [-0.055, 0.055]) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 8), brass), hookX - 0.05, 0.065, z));
  return g;
}

// ---------------------------------------------------------------------------
// Planner: a model house on a birch base. White walls, a standing-seam roof
// in the app's colour, warm light in the windows (someone is home).

function house(color) {
  const g = new THREE.Group();
  const W = 0.66, wall = 0.4, apex = 0.7, D = 0.54, baseH = 0.05;
  const white = paint(0xf3efe7, { roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  // Base: a birch board with a fine grain.
  const grain = paintTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#e8d6b4'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = `rgba(150,110,60,${0.04 + Math.random() * 0.08})`; c.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * h; c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x / 70 + i) * 4);
      c.stroke();
    }
  });
  g.add(at(box(0.98, baseH, 0.84, 0.018, paint(0xffffff, { map: grain, roughness: 0.62 })), 0, baseH / 2, 0.02));
  // Body: the gable wall's outline pushed back the house's depth.
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, wall); s.lineTo(0, apex); s.lineTo(-W / 2, wall); s.lineTo(-W / 2, 0);
  const body = new THREE.Mesh(extrude(s, D, 0.008, 0.006, 2), white);
  g.add(at(body, 0, baseH, 0));
  // Roof: two slabs meeting at the ridge, overhanging the walls, with seams
  // running down the slope.
  const seams = paintTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { const y = (i + 0.5) * h / 9; const gr = c.createLinearGradient(0, y - 6, 0, y + 6); gr.addColorStop(0, '#808080'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#808080'); c.fillStyle = gr; c.fillRect(0, y - 6, w, 12); }
  }, { data: true });
  const roofMat = plastic(color, { roughness: 0.3, clearcoatRoughness: 0.12, bumpMap: seams, bumpScale: 1.2 });
  const T = 0.05, over = 0.07, ovD = 0.06;
  const ridge = new THREE.Vector2(0, baseH + apex);
  for (const side of [-1, 1]) {
    const eave = new THREE.Vector2(side * W / 2, baseH + wall);
    const d = eave.clone().sub(ridge), len = d.length() + over;
    d.normalize();
    const n = new THREE.Vector2(-side * d.y, side * d.x);   // outward: up and away from the ridge
    const slab = box(len, T, D + 2 * ovD, 0.016, roofMat, 3);
    slab.rotation.z = Math.atan2(d.y, d.x);
    const c = ridge.clone().addScaledVector(d, len / 2).addScaledVector(n, T / 2 + 0.004);
    g.add(at(slab, c.x, c.y, 0));
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, D + 2 * ovD + 0.01, 24), roofMat);
  cap.rotation.x = Math.PI / 2;
  g.add(at(cap, 0, baseH + apex + 0.03, 0));
  // Chimney on the right slope, toward the back.
  g.add(at(box(0.09, 0.24, 0.09, 0.014, white), 0.17, baseH + apex - 0.02, -0.12));
  g.add(at(box(0.11, 0.025, 0.11, 0.008, paint(0x3a3d44, { roughness: 0.6 })), 0.17, baseH + apex + 0.1, -0.12));
  // Door and windows on the gable front, windows down the right side.
  const front = D / 2 + 0.008;
  const door = box(0.15, 0.25, 0.03, 0.012, paint(0x2b3954, { roughness: 0.4, clearcoat: 0.8 }));
  g.add(at(door, 0, baseH + 0.125, front));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 8), metal(0xd8b46a, 0.25)), 0.045, baseH + 0.12, front + 0.02));
  const lit = new THREE.MeshPhysicalMaterial({ color: 0x16202e, roughness: 0.05, clearcoat: 1, emissive: 0xffb25e, emissiveIntensity: 0.55 });
  const win = (w, h) => {
    const wg = new THREE.Group();
    wg.add(box(w + 0.03, h + 0.03, 0.02, 0.006, white));
    wg.add(at(new THREE.Mesh(new THREE.PlaneGeometry(w, h), lit), 0, 0, 0.0105));
    wg.add(at(box(0.012, h, 0.012, 0.004, white), 0, 0, 0.012));
    wg.add(at(box(w, 0.012, 0.012, 0.004, white), 0, 0, 0.012));
    return wg;
  };
  for (const x of [-0.2, 0.2]) g.add(at(win(0.1, 0.12), x, baseH + 0.24, front));
  const round = new THREE.Group();
  round.add(new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.012, 12, 48), white));
  round.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.056, 48), lit), 0, 0, -0.002));
  g.add(at(round, 0, baseH + 0.52, front));
  for (const z of [-0.13, 0.11]) { const sw = win(0.11, 0.12); sw.rotation.y = Math.PI / 2; g.add(at(sw, W / 2 + 0.008, baseH + 0.24, z)); }
  // A step at the door.
  g.add(at(box(0.22, 0.025, 0.07, 0.008, paint(0xd9d4ca, { roughness: 0.8 })), 0, baseH + 0.0125, front + 0.035));
  return g;
}

// ---------------------------------------------------------------------------
// Scan: a camera lens lying on its barrel, front glass toward you. Black
// anodised barrel, a knurled rubber focus ring, a ring in the app's colour,
// engraved markings, and coated glass you can see the iris through.

function lens(color) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const anod = metal(0x1d1e22, 0.36, { clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const chrome = metal(0xe9ebef, 0.12);
  // Mount (chrome bayonet), then the barrel.
  body.add(new THREE.Mesh(lathe(fillet([[0.2, -0.33], [0.31, -0.33], [0.31, -0.29], [0.345, -0.29], [0.345, -0.26]], 0.01)), chrome));
  body.add(new THREE.Mesh(lathe(fillet([[0.345, -0.26], [0.372, -0.25], [0.372, -0.15], [0.36, -0.14], [0.36, 0.07], [0.372, 0.08], [0.372, 0.2], [0.4, 0.23], [0.4, 0.3], [0.315, 0.3], [0.315, 0.27]], 0.012)), anod));
  // Focus ring: rubber with fine ribs round it.
  const ribs = paintTexture(1024, 8, (c, w, h) => {
    for (let x = 0; x < w; x++) { const v = 0.5 + 0.5 * Math.cos(x / w * Math.PI * 2 * 90); c.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`; c.fillRect(x, 0, 1, h); }
  }, { data: true });
  body.add(new THREE.Mesh(lathe(fillet([[0.36, -0.135], [0.392, -0.13], [0.392, 0.055], [0.36, 0.06]], 0.012)), rubber(0x141416, { bumpMap: ribs, bumpScale: 3 })));
  // The ring in the app's colour, anodised.
  body.add(new THREE.Mesh(lathe(fillet([[0.372, 0.1], [0.38, 0.1], [0.38, 0.13], [0.372, 0.13]], 0.004)), metal(color, 0.3)));
  // Markings engraved round the front, filled white.
  const marks = paintTexture(1024, 1024, (c, w, h) => {
    c.fillStyle = '#1d1e22'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8e8e8'; c.font = font(600, 40); c.textAlign = 'center'; c.textBaseline = 'middle';
    const text = 'CONTOUR   SCAN   1:1.4   24 mm   ⌀ 62   ';
    const r = 0.357 / 0.4 * w / 2;
    for (let i = 0; i < text.length; i++) {
      const a = -Math.PI / 2 + (i - text.length / 2) * 0.052;
      c.save(); c.translate(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); c.rotate(a + Math.PI / 2); c.fillText(text[i], 0, 0); c.restore();
    }
  }, { text: true });
  const face = new THREE.Mesh(new THREE.RingGeometry(0.318, 0.398, 96, 1), new THREE.MeshPhysicalMaterial({ map: marks, roughness: 0.4, metalness: 0.3 }));
  body.add(at(face, 0, 0, 0.3005));
  // Inside: a matte black tube, baffles and the iris, seen through the glass.
  const black = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.9, side: THREE.DoubleSide });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.5, 64, 1, true), black);
  tube.rotation.x = Math.PI / 2;
  body.add(at(tube, 0, 0, 0.02));
  for (const [z, r] of [[0.2, 0.25], [0.12, 0.22]]) body.add(at(new THREE.Mesh(new THREE.RingGeometry(r, 0.31, 64), black), 0, 0, z));
  const iris = new THREE.Shape(); iris.absarc(0, 0, 0.31, 0, Math.PI * 2);
  const hole = new THREE.Path();
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; hole[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 0.12, Math.sin(a) * 0.12); }
  iris.holes.push(hole);
  body.add(at(new THREE.Mesh(new THREE.ShapeGeometry(iris, 48), metal(0x2a2b30, 0.45)), 0, 0, 0.04));
  const rear = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 16, 0, Math.PI * 2, 0, 0.6).rotateX(Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x0a1418, roughness: 0.03, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 500] }));
  body.add(at(rear, 0, 0, -0.22));
  // Front glass: a convex element set just inside the bezel, with a
  // multi-coating that throws green and violet reflections, as real coated
  // optics do.
  const Rc = 1.2, th = Math.asin(0.312 / Rc);
  const dome = new THREE.SphereGeometry(Rc, 96, 24, 0, Math.PI * 2, 0, th).rotateX(Math.PI / 2);
  dome.translate(0, 0, 0.255 - Rc * Math.cos(th));
  body.add(new THREE.Mesh(dome, glass({ ior: 1.7, thickness: 0.12, attenuationColor: 0xcfeee0, attenuationDistance: 0.6, iridescence: 1, iridescenceIOR: 1.45, iridescenceThicknessRange: [220, 420] })));
  // Lying on its barrel: the bezel and focus ring touch the shelf.
  body.position.y = 0.4;
  g.add(body);
  return g;
}

// ---------------------------------------------------------------------------
// Photos: a photograph in a lacquered frame (the app's colour), behind a
// pane of glass, with a cut mat round it, leaning back on its stand.

function pictureFrame(color) {
  const g = new THREE.Group();
  const lean = new THREE.Group();
  const W = 0.9, H = 0.68, B = 0.1, depth = 0.05, bev = 0.022;
  const outline = roundedRectShape(W, H, 0.035);
  outline.holes.push(roundedRectShape(W - 2 * B, H - 2 * B, 0.006));
  // Lacquered wood: the grain shows faintly through the colour.
  const grain = paintTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      c.strokeStyle = `rgba(90,40,30,${0.03 + Math.random() * 0.07})`; c.lineWidth = 1 + Math.random() * 3;
      const y = Math.random() * h; c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += 24) c.lineTo(x, y + Math.sin(x / 90 + i * 1.7) * 5);
      c.stroke();
    }
  });
  grain.repeat.set(1 / W, 1 / W); grain.offset.set(0.5, 0.5);
  lean.add(new THREE.Mesh(extrude(outline, depth, bev, bev, 5), plastic(color, { map: grain, roughness: 0.42, clearcoatRoughness: 0.05 })));
  // A thin gilt fillet round the opening, between the frame and the mat.
  const fil = roundedRectShape(W - 2 * B - 0.004, H - 2 * B - 0.004, 0.005);
  fil.holes.push(roundedRectShape(W - 2 * B - 0.05, H - 2 * B - 0.05, 0.003));
  lean.add(at(new THREE.Mesh(extrude(fil, 0.01, 0.006, 0.004, 3), metal(0xd8b46c, 0.22)), 0, 0, 0.004));
  // Mat: white board with a bevelled window, a little behind the glass.
  const iw = W - 2 * B + 0.01, ih = H - 2 * B + 0.01;
  const mat = roundedRectShape(iw, ih, 0.004);
  mat.holes.push(roundedRectShape(iw - 0.13, ih - 0.13, 0.002));
  lean.add(at(new THREE.Mesh(extrude(mat, 0.006, 0.006, 0.008, 2), paint(0xf6f3ec, { roughness: 0.9 })), 0, 0, -0.008));
  // The photograph: a lake under mountains at sunrise.
  const photo = paintTexture(1024, 768, (c, w, h) => {
    const hz = h * 0.56;
    let gr = c.createLinearGradient(0, 0, 0, hz);
    gr.addColorStop(0, '#3d6fd6'); gr.addColorStop(0.55, '#8fb5ec'); gr.addColorStop(1, '#ffd9ae');
    c.fillStyle = gr; c.fillRect(0, 0, w, hz);
    const sun = c.createRadialGradient(w * 0.66, hz * 0.78, 0, w * 0.66, hz * 0.78, w * 0.22);
    sun.addColorStop(0, 'rgba(255,250,235,1)'); sun.addColorStop(0.12, 'rgba(255,236,190,0.95)'); sun.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = sun; c.fillRect(0, 0, w, hz);
    const ridge = (base, amp, seed, fill) => {
      c.fillStyle = fill; c.beginPath(); c.moveTo(0, hz);
      for (let x = 0; x <= w; x += 8) c.lineTo(x, base - amp * (0.55 * Math.sin(x / w * 7 + seed) + 0.3 * Math.sin(x / w * 17 + seed * 2) + 0.15 * Math.sin(x / w * 41 + seed * 3)));
      c.lineTo(w, hz); c.closePath(); c.fill();
    };
    ridge(hz * 0.72, hz * 0.22, 1.3, '#7c8fb4');
    ridge(hz * 0.86, hz * 0.16, 4.1, '#4d6a8c');
    ridge(hz * 0.98, hz * 0.08, 2.2, '#2f5a4a');
    // The lake: the sky mirrored, darker, with ripples.
    c.save(); c.translate(0, hz * 2); c.scale(1, -1); c.globalAlpha = 0.75; c.drawImage(c.canvas, 0, 0, w, hz, 0, 0, w, hz); c.restore();
    gr = c.createLinearGradient(0, hz, 0, h); gr.addColorStop(0, 'rgba(20,40,70,0.15)'); gr.addColorStop(1, 'rgba(10,25,45,0.6)');
    c.fillStyle = gr; c.fillRect(0, hz, w, h - hz);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 40; i++) c.fillRect(Math.random() * w, hz + Math.random() * (h - hz), 20 + Math.random() * 60, 2);
  });
  lean.add(at(new THREE.Mesh(new THREE.PlaneGeometry(iw - 0.1, ih - 0.1), new THREE.MeshPhysicalMaterial({ map: photo, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 })), 0, 0, -0.012));
  // Glass over it.
  lean.add(at(new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), glass({ thickness: 0.004, clearcoat: 1, clearcoatRoughness: 0 })), 0, 0, depth / 2 - 0.004));
  // Back board.
  lean.add(at(box(W - 0.06, H - 0.06, 0.012, 0.004, paint(0x6b5440, { roughness: 0.85 })), 0, 0, -depth / 2 - bev + 0.004));
  // Lean back on a strut hinged high on the back.
  const tilt = 0.2;
  lean.rotation.x = -tilt;
  lean.position.y = (H / 2 + bev) * Math.cos(tilt) + (depth / 2 + bev) * Math.sin(tilt);   // resting on its back bottom edge
  g.add(lean);
  lean.updateMatrix();
  const hinge = new THREE.Vector3(0, H * 0.18, -depth / 2 - bev).applyMatrix4(lean.matrix);
  const foot = new THREE.Vector3(0, 0.009, hinge.z - 0.32);
  const strut = box(0.11, hinge.distanceTo(foot), 0.018, 0.006, paint(0x6b5440, { roughness: 0.85 }));
  strut.position.copy(hinge).add(foot).multiplyScalar(0.5);
  strut.rotation.x = Math.atan2(hinge.z - foot.z, hinge.y - foot.y);
  g.add(strut);
  return g;
}

// ---------------------------------------------------------------------------
// Settings: two meshing gears standing on their teeth. The large one is
// brushed aluminium, the brushing running round it (so the light sweeps
// round as you move); the small one dark gunmetal.

function gearShape(teeth, rTip, rRoot, holes = 0, holeR = 0, holeAt = 0) {
  const s = new THREE.Shape(), step = Math.PI * 2 / teeth;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const arc = (r, a0, a1, n) => { for (let k = 0; k <= n; k++) { const t = a0 + (a1 - a0) * k / n; pts.push([Math.cos(t) * r, Math.sin(t) * r]); } };
    arc(rRoot, a - 0.5 * step, a - 0.26 * step, 3);
    arc(rTip, a - 0.15 * step, a + 0.15 * step, 4);
    arc(rRoot, a + 0.26 * step, a + 0.5 * step, 3);
  }
  // Round the corners of the tooth profile so every edge catches light.
  const loop = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
  const round = fillet([...loop, loop[0], loop[1]], (rTip - rRoot) * 0.22, 3).slice(1, -1);
  round.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](x, y));
  s.closePath();
  for (let i = 0; i < holes; i++) {
    const a = (i + 0.5) / holes * Math.PI * 2, h = new THREE.Path();
    h.absarc(Math.cos(a) * holeAt, Math.sin(a) * holeAt, holeR, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return s;
}

// Brushing direction for a disc: round it, as a part turned on a lathe is
// brushed. Red and green carry the direction, blue its strength.
function circularBrush() {
  return paintTexture(512, 512, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x / w - 0.5, dy = 0.5 - y / h, r = Math.hypot(dx, dy) || 1;
      const i = (y * w + x) * 4;
      img.data[i] = (-dy / r * 0.5 + 0.5) * 255; img.data[i + 1] = (dx / r * 0.5 + 0.5) * 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, { data: true });
}

function gears() {
  const g = new THREE.Group();
  const big = { teeth: 14, rTip: 0.36, rRoot: 0.305 }, small = { teeth: 9, rTip: 0.23, rRoot: 0.18 };
  const thick = 0.085, bev = 0.016;
  const brush = circularBrush();
  // The disc's UVs are its outline coordinates: centre the brushing on it.
  brush.repeat.set(1 / (2 * big.rTip), 1 / (2 * big.rTip)); brush.offset.set(0.5, 0.5);
  const alu = metal(0xd3d7dd, 0.3, { anisotropy: 0.85, anisotropyMap: brush });
  const gun = metal(0x7a7f88, 0.32, { clearcoat: 0.3, clearcoatRoughness: 0.25 });
  const make = (spec, mat, holes, holeR, holeAt) => {
    const part = new THREE.Group();
    part.add(new THREE.Mesh(extrude(gearShape(spec.teeth, spec.rTip, spec.rRoot, holes, holeR, holeAt), thick, bev, bev * 0.8, 4), mat));
    // Hub: a turned chrome boss with a hex socket.
    const hubR = spec.rTip * 0.28;
    part.add(new THREE.Mesh(lathe(fillet([[0, thick / 2 + bev + 0.03], [hubR * 0.9, thick / 2 + bev + 0.03], [hubR, thick / 2 + bev + 0.015], [hubR, -thick / 2 - bev - 0.015], [0, -thick / 2 - bev - 0.015]], 0.01)), metal(0xeceef2, 0.12)));
    const hex = new THREE.Shape();
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; hex[i ? 'lineTo' : 'moveTo'](Math.cos(a) * hubR * 0.42, Math.sin(a) * hubR * 0.42); }
    part.add(at(new THREE.Mesh(new THREE.ShapeGeometry(hex), new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.7 })), 0, 0, thick / 2 + bev + 0.031));
    return part;
  };
  const A = make(big, alu, 6, 0.06, 0.18), B = make(small, gun, 5, 0.035, 0.105);
  // Side by side on the shelf, teeth interlocked: a gap of the big gear
  // faces a tooth of the small one along the line between their centres.
  const d = big.rTip + small.rRoot + 0.008;
  const dy = big.rTip - small.rTip, dx = Math.sqrt(d * d - dy * dy);
  A.position.set(-dx * 0.42, big.rTip, 0);
  B.position.set(dx * 0.58, small.rTip, 0);
  g.add(A, B);
  // Each rests on the shelf on its own teeth: turn them to mesh, drop each
  // until it touches, and turn again (the drop moves the line a hair).
  for (let pass = 0; pass < 2; pass++) {
    const line = Math.atan2(B.position.y - A.position.y, B.position.x - A.position.x);
    A.rotation.z = line + Math.PI / big.teeth;      // a gap toward the small gear
    B.rotation.z = line + Math.PI;                  // a tooth toward the big one
    for (const part of [A, B]) { part.updateMatrixWorld(true); part.position.y -= new THREE.Box3().setFromObject(part).min.y; }
  }
  return g;
}
