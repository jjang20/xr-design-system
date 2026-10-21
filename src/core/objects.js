// Contour app objects: the Dock's icons as things standing on its glass
// plate (Jihoon, 2026-10-21: "3d icons should look like real 3d objects",
// then "more icon style ... rather than 3d assets in marketplace"; his
// reference is the Mac OS X dock, where Safari is a metal compass and
// Address Book a leather book). Each app is one object drawn the way a
// Mac OS X icon is (Apple HIG 2008, "Icon Design"): seen straight on, lit
// from directly above and slightly in front, one simple idealised form
// with no ground or props, clean glossy materials, and one visual weight
// across the family (optical sizes, see SIZE):
//
//   house     Planner   a house seen straight on, its roof the app's blue
//   ruler     Measure   a tape measure, an orange shell, its blade drawn out
//   scan      Scan      a camera lens lying on its barrel, a green ring
//   image     Photos    a photo in a lacquered frame, leaning on its stand
//   settings  Settings  a brushed gear with a dark ring and a polished hub
//   notes     Notes     a cube of sticky notes, its top sheet written on
//   clock     Clock     a twin-bell alarm clock reading ten past ten
//
// Contour's own objects, not Apple's icons. Built in code (no model files),
// so an app's colour carries into its object. What keeps them from reading
// as flat icons: every edge rounded so it catches a line of light, a few
// materials per object (lacquer, rubber, metal, glass, paper), and printed
// details. What keeps them from reading as stock 3D assets: they face you,
// simplified, without wear, bolts or extra parts.
//
// Unit space: an object stands on y = 0, centred on x and z, faces +z, and
// its larger side is 1 (times its optical size, see SIZE). The Dock scales it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedRectShape } from './look.js';
import interSemibold from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url';

const BUILDERS = { house, ruler: tapeMeasure, scan: lens, image: pictureFrame, settings: gears, notes: notePad, clock: alarmClock };
// Optical size: a round object looks smaller than a square one of the same
// width (as icon grids size circles up), and a wide one larger.
const SIZE = { house: 1.02, ruler: 1.04, scan: 0.9, image: 0.9, settings: 0.96, notes: 0.8, clock: 0.98 };
// Each turns a little, so it shows its side as well as its face (the
// reference's calendar and book stand at an angle). Radians, + turns left.
const TURN = { house: -0.2, ruler: -0.12, scan: 0, image: 0, settings: 0, notes: -0.12, clock: 0 };

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
export function objectEnvironment(renderer, room, rotation, boxes, roomLight = 1) {
  const key = room?.uuid ?? 'none';
  if (envCache.has(key)) return envCache.get(key);
  const s = new THREE.Scene();
  s.background = room ?? new THREE.Color(0.18, 0.18, 0.2);
  s.backgroundIntensity = roomLight;
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
// Planner: a house, as an icon draws one: the gable seen straight on, a
// thick glossy roof in the app's colour overhanging it, a door and two lit
// windows. One simple shape, no ground or props (HIG: "start with a basic
// shape"), deep enough to stand.

function house(color) {
  const g = new THREE.Group();
  const W = 0.74, wall = 0.46, apex = 0.8, D = 0.34, bev = 0.035;
  const enamel = plastic(0xf7f3ec, { roughness: 0.28, clearcoatRoughness: 0.06 });
  // Body: the gable's outline, its corners rounded, pushed back to depth.
  const outline = fillet([[0, 0], [W / 2, 0], [W / 2, wall], [0, apex], [-W / 2, wall], [-W / 2, 0], [0, 0]], 0.04, 5);
  const body = new THREE.Shape();
  outline.forEach(([x, y], i) => body[i ? 'lineTo' : 'moveTo'](x, y));
  g.add(at(new THREE.Mesh(extrude(body, D - 2 * bev, bev, bev, 6), enamel), 0, bev, 0));
  // Roof: a chevron the thickness T over the gable, running a little past
  // the walls at the eaves, front and back.
  const T = 0.1, over = 0.09, ridgeY = apex + bev;
  const eave = new THREE.Vector2(W / 2 + bev, wall + bev), ridge = new THREE.Vector2(0, ridgeY);
  const d = eave.clone().sub(ridge).normalize(), n = new THREE.Vector2(d.y, -d.x).multiplyScalar(-1);   // outward
  const foot = eave.clone().addScaledVector(d, over);
  const peak = T / Math.abs(n.y);
  const chevron = [[0, ridgeY], [foot.x, foot.y], [foot.x + n.x * T, foot.y + n.y * T], [0, ridgeY + peak], [-foot.x - n.x * T, foot.y + n.y * T], [-foot.x, foot.y], [0, ridgeY]];
  const roofLine = fillet(chevron, 0.03, 5);
  const roofShape = new THREE.Shape();
  roofLine.forEach(([x, y], i) => roofShape[i ? 'lineTo' : 'moveTo'](x, y));
  const roof = new THREE.Mesh(extrude(roofShape, D + 0.06, 0.03, 0.03, 6), plastic(color, { roughness: 0.22, clearcoatRoughness: 0.05 }));
  g.add(at(roof, 0, 0.004, 0));
  // Chimney on the right slope, behind the ridge line.
  g.add(at(box(0.1, 0.2, 0.1, 0.02, enamel), 0.2, apex - 0.02, -0.05));
  // Door: inset, deep blue lacquer, a round brass knob.
  const front = D / 2 + 0.002;
  const doorShape = roundedRectShape(0.16, 0.27, 0.035);
  g.add(at(new THREE.Mesh(extrude(doorShape, 0.03, 0.012, 0.01, 4), plastic(0x23345a, { roughness: 0.25 })), 0, bev + 0.135, front - 0.01));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.016, 20, 10), metal(0xe0bd72, 0.2)), 0.045, bev + 0.13, front + 0.02));
  // Windows: warm light inside, white frames with a cross bar.
  const lit = new THREE.MeshPhysicalMaterial({ color: 0x2a2416, roughness: 0.08, clearcoat: 1, emissive: 0xffbe6a, emissiveIntensity: 0.9 });
  const win = (w, h) => {
    const wg = new THREE.Group();
    const frame = roundedRectShape(w + 0.04, h + 0.04, 0.018);
    frame.holes.push(roundedRectShape(w, h, 0.008));
    wg.add(new THREE.Mesh(extrude(frame, 0.02, 0.008, 0.006, 3), enamel));
    wg.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), lit));
    wg.add(at(box(0.016, h, 0.014, 0.005, enamel), 0, 0, 0.004));
    wg.add(at(box(w, 0.016, 0.014, 0.005, enamel), 0, 0, 0.004));
    return wg;
  };
  for (const x of [-0.215, 0.215]) g.add(at(win(0.12, 0.12), x, bev + 0.27, front));
  const round = new THREE.Group();
  round.add(new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 12, 48), enamel));
  round.add(new THREE.Mesh(new THREE.CircleGeometry(0.052, 48), lit));
  g.add(at(round, 0, bev + 0.56, front));
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
  // The glass, as an icon paints it: a deep, glossy dome over coated
  // elements. The depth inside is painted (the elements' rings, the iris,
  // the coatings' violet and green), and the dome's polish reflects the
  // studio light above as a crisp white sweep. Real glass would show a dark
  // hole here; the icon idealises it (HIG: "convey the item's weight and
  // feel, as well as its appearance").
  const inside = paintTexture(1024, 1024, (c, w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2;
    const gr = c.createRadialGradient(cx, cy * 1.08, 0, cx, cy, R);
    gr.addColorStop(0, '#1b2a52'); gr.addColorStop(0.45, '#0d1530'); gr.addColorStop(0.85, '#05070f'); gr.addColorStop(1, '#020306');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    // The iris: a dim hexagon deep inside.
    c.save(); c.translate(cx, cy); c.rotate(0.3);
    c.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3); }
    c.fillStyle = 'rgba(2,3,8,0.85)'; c.fill(); c.strokeStyle = 'rgba(120,140,190,0.25)'; c.lineWidth = 3; c.stroke(); c.restore();
    // Inner elements: thin rings of reflected light, smaller toward the back.
    for (const [r, a] of [[0.9, 0.18], [0.68, 0.14], [0.47, 0.12]]) { c.beginPath(); c.arc(cx, cy, R * r, 0, Math.PI * 2); c.strokeStyle = `rgba(170,190,255,${a})`; c.lineWidth = 4; c.stroke(); }
    // Coatings: a violet crescent low on the left, a green one on the right.
    const arcGlow = (a0, a1, r, col) => { c.beginPath(); c.arc(cx, cy, R * r, a0, a1); c.strokeStyle = col; c.lineWidth = R * 0.09; c.lineCap = 'round'; c.stroke(); };
    c.filter = 'blur(10px)';
    arcGlow(2.2, 3.1, 0.72, 'rgba(160,90,255,0.55)');
    arcGlow(0.15, 0.9, 0.62, 'rgba(70,230,170,0.45)');
    arcGlow(3.6, 4.3, 0.5, 'rgba(255,170,90,0.25)');
    c.filter = 'none';
  });
  const Rc = 0.62, th = Math.asin(0.312 / Rc);
  const dome = new THREE.SphereGeometry(Rc, 96, 24, 0, Math.PI * 2, 0, th).rotateX(Math.PI / 2);
  dome.translate(0, 0, 0.255 - Rc * Math.cos(th));
  const dp = dome.attributes.position, duv = dome.attributes.uv;
  for (let i = 0; i < dp.count; i++) duv.setXY(i, dp.getX(i) / 0.624 + 0.5, dp.getY(i) / 0.624 + 0.5);   // the painting, seen straight on
  body.add(new THREE.Mesh(dome, new THREE.MeshPhysicalMaterial({ map: inside, roughness: 0.04, ior: 2.2, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.01, iridescence: 0.25, iridescenceIOR: 1.5, iridescenceThicknessRange: [300, 620] })));
  // A polished filter-thread ring at the very front: a bright line round
  // the face, so the lens reads by its silhouette as icons do.
  body.add(new THREE.Mesh(lathe(fillet([[0.392, 0.28], [0.404, 0.29], [0.404, 0.312], [0.392, 0.318]], 0.006)), metal(0xf2f3f6, 0.08)));
  // Lying on its barrel: the bezel and focus ring touch the shelf. A short,
  // pancake barrel: seen from above, a long one stood taller than the
  // other apps (one visual weight across the family, HIG).
  body.position.y = 0.4;
  body.scale.z = 0.6;
  g.add(body);
  return g;
}

// ---------------------------------------------------------------------------
// Photos: a photograph in a lacquered frame (the app's colour), behind a
// pane of glass, with a cut mat round it, leaning back on its stand.

function pictureFrame(color) {
  const g = new THREE.Group();
  const lean = new THREE.Group();
  const W = 0.86, H = 0.74, B = 0.1, depth = 0.06, bev = 0.024;
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
// Settings: one gear standing on two teeth, brushed aluminium with the
// brushing running round it (so the light sweeps round as you move).

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
  // One gear, as the icon draws Settings: a few round, chunky teeth, a
  // clean brushed face, a dark turned ring and a polished hub. No bolt
  // holes or second gear (HIG: "strive for simplicity"; a second gear
  // meshing up in the air read as floating on a shelf with real shadows).
  const spec = { teeth: 10, rTip: 0.4, rRoot: 0.315 };
  const thick = 0.12, bev = 0.024;
  const brush = circularBrush();
  // The disc's UVs are its outline coordinates: centre the brushing on it.
  brush.repeat.set(1 / (2 * spec.rTip), 1 / (2 * spec.rTip)); brush.offset.set(0.5, 0.5);
  const alu = metal(0xd9dde3, 0.26, { anisotropy: 0.85, anisotropyMap: brush, clearcoat: 0.6, clearcoatRoughness: 0.08 });
  const ring = plastic(0x2a2d34, { roughness: 0.3 });   // dark anodised, so the face reads as two tones
  const chrome = metal(0xf2f4f7, 0.06);
  const part = new THREE.Group();
  part.add(new THREE.Mesh(extrude(gearShape(spec.teeth, spec.rTip, spec.rRoot), thick, bev, bev * 0.9, 5), alu));
  // On each face: a dark ring turned into it, then a polished domed boss.
  // (Profiles run out, up, then in, so the lathe's faces point outward.)
  const z = thick / 2 + bev, rIn = spec.rTip * 0.4, rOut = spec.rRoot * 0.8;
  for (const k of [1, -1]) {
    const band = new THREE.Mesh(lathe(fillet([[rOut, z - 0.004], [rOut, z + 0.012], [rIn, z + 0.012], [rIn, z - 0.004]], 0.008)), ring);
    band.scale.z = k;
    part.add(band);
  }
  const r = rIn * 0.95;
  part.add(new THREE.Mesh(lathe(fillet([[0, z + 0.06], [r * 0.55, z + 0.055], [r * 0.92, z + 0.036], [r, z + 0.016], [r, -z - 0.016], [0, -z - 0.016]], 0.012)), chrome));
  // Teeth sit at every 36° from +x, so two straddle the bottom: it stands.
  part.updateMatrixWorld(true);
  part.position.y = -new THREE.Box3().setFromObject(part).min.y;
  g.add(part);
  return g;
}

// ---------------------------------------------------------------------------
// Notes: a cube of sticky notes standing on its edge, its top sheet facing
// you in the app's yellow with a few lines of handwriting, its lower corner
// lifting. The stack shows its layers in bands of colour (Contour's windows
// can lie on a desk like a post-it).

function notePad(color) {
  const g = new THREE.Group();
  const W = 0.84, H = 0.84, D = 0.4, r = 0.035;
  const hex = '#' + color.getHexString();
  const bands = [color, new THREE.Color(0xf4a3bf), new THREE.Color(0x9ed2f2), new THREE.Color(0xb6df98), color];
  // The stack: one rounded block per band, a hair apart and a little out
  // of line, as loose paper is.
  const n = bands.length, t = D / n;
  bands.forEach((c, i) => {
    const sheaf = box(W - (i % 2) * 0.012, H - (i % 2) * 0.008, t - 0.006, r, paint(c, { roughness: 0.82, sheen: 0.5, sheenRoughness: 0.6, sheenColor: 0xffffff }), 3);
    g.add(at(sheaf, (i % 2 ? 0.006 : 0) * (i > 2 ? -1 : 1), H / 2, D / 2 - t / 2 - i * t));
  });
  // The top sheet, drawn on: printed lines and three lines of blue ink.
  const ink = paintTexture(1024, 1024, (c, w, h) => {
    c.fillStyle = hex; c.fillRect(0, 0, w, h);
    const sh = c.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(1, 'rgba(120,80,0,0.08)');
    c.fillStyle = sh; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,90,20,0.22)'; c.lineWidth = 3;
    for (let y = 0.3; y < 0.9; y += 0.14) { c.beginPath(); c.moveTo(w * 0.1, h * y); c.lineTo(w * 0.9, h * y); c.stroke(); }
    // Handwriting: loops along each line, ending short as a note does.
    c.strokeStyle = '#1f3c8f'; c.lineWidth = 9; c.lineCap = c.lineJoin = 'round';
    [[0.26, 0.74], [0.4, 0.62], [0.54, 0.7]].forEach(([y, end], k) => {
      c.beginPath();
      for (let x = 0.13, i = 0; x < end; x += 0.004, i++) {
        const v = Math.sin(i * 0.55 + k) * 0.022 + Math.sin(i * 0.17 + k * 2) * 0.01;
        c[i ? 'lineTo' : 'moveTo'](w * x, h * (y - v - (Math.sin(i * 0.05) > 0.92 ? 0.03 : 0)));
        if (Math.sin(i * 0.045 + k) > 0.985) { c.stroke(); c.beginPath(); x += 0.02; i = 0; }
      }
      c.stroke();
    });
    // A tick in the app's red, done.
    c.strokeStyle = '#d23b3b'; c.lineWidth = 12;
    c.beginPath(); c.moveTo(w * 0.15, h * 0.72); c.lineTo(w * 0.2, h * 0.78); c.lineTo(w * 0.3, h * 0.64); c.stroke();
  });
  // A sheet bent up at its lower right corner, so it reads as paper.
  const sheet = new THREE.PlaneGeometry(W - 0.02, H - 0.02, 48, 48);
  const sp = sheet.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i) / (W / 2), y = sp.getY(i) / (H / 2);
    const k = Math.max(0, (x - y) - 1.25);   // distance in from the corner's fold line
    sp.setZ(i, 0.1 * k * k);
  }
  sheet.computeVertexNormals();
  const top = new THREE.Mesh(sheet, paint(0xffffff, { map: ink, roughness: 0.75, sheen: 0.4, sheenRoughness: 0.5, sheenColor: 0xffffff, side: THREE.DoubleSide }));
  g.add(at(top, 0, H / 2, D / 2 + 0.002));
  return g;
}

// ---------------------------------------------------------------------------
// Clock: a twin-bell alarm clock seen straight on: a glossy case in the
// app's colour, a chrome bezel, a white dial under a domed glass reading
// ten past ten, two chrome bells and their hammer on top, two feet.

function alarmClock(color) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const R = 0.36, depth = 0.24;
  const chrome = metal(0xf0f2f5, 0.08);
  body.add(new THREE.Mesh(lathe(fillet([[0, -depth / 2], [R * 0.85, -depth / 2], [R, -depth / 2 + 0.05], [R, depth / 2 - 0.03], [R - 0.04, depth / 2]], 0.04)), plastic(color, { roughness: 0.25, clearcoatRoughness: 0.05 })));
  body.add(new THREE.Mesh(lathe(fillet([[R - 0.075, depth / 2 - 0.01], [R - 0.015, depth / 2 - 0.01], [R - 0.01, depth / 2 + 0.03], [R - 0.075, depth / 2 + 0.035]], 0.012)), chrome));
  const dial = paintTexture(1024, 1024, (c, w, h) => {
    const cx = w / 2, cy = h / 2, Rd = w / 2;
    const gr = c.createRadialGradient(cx, cy * 0.8, 0, cx, cy, Rd); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.8, '#f1f2f4'); gr.addColorStop(1, '#d9dce1');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#26272b';
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2, big = i % 5 === 0, L = big ? 0.13 : 0.05, T = big ? 14 : 5;
      c.save(); c.translate(cx, cy); c.rotate(a); c.fillRect(-T / 2, -Rd * 0.9, T, Rd * L); c.restore();
    }
    c.font = font(600, 46); c.textAlign = 'center'; c.textBaseline = 'middle'; c.letterSpacing = '6px';
    c.fillStyle = '#6a6d74'; c.fillText('CONTOUR', cx, cy + Rd * 0.34);
    const hand = (a, len, width, col) => {
      c.save(); c.translate(cx, cy); c.rotate(a); c.fillStyle = col;
      c.beginPath(); c.roundRect(-width / 2, -Rd * len, width, Rd * len + width * 1.2, width / 2); c.fill(); c.restore();
    };
    hand((10 + 10 / 60) / 12 * Math.PI * 2, 0.5, 30, '#1c1d21');
    hand(10 / 60 * Math.PI * 2, 0.74, 22, '#1c1d21');
    hand(38 / 60 * Math.PI * 2, 0.8, 7, '#d8452f');
    c.beginPath(); c.arc(cx, cy, 22, 0, Math.PI * 2); c.fillStyle = '#d8452f'; c.fill();
  }, { text: true });
  const Rc = 0.6, rFace = R - 0.07, th = Math.asin(rFace / Rc);
  const dome = new THREE.SphereGeometry(Rc, 96, 24, 0, Math.PI * 2, 0, th).rotateX(Math.PI / 2);
  dome.translate(0, 0, depth / 2 + 0.01 - Rc * Math.cos(th));
  const dp = dome.attributes.position, duv = dome.attributes.uv;
  for (let i = 0; i < dp.count; i++) duv.setXY(i, dp.getX(i) / (2 * rFace) + 0.5, dp.getY(i) / (2 * rFace) + 0.5);
  body.add(new THREE.Mesh(dome, new THREE.MeshPhysicalMaterial({ map: dial, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.01 })));
  // Bells, tilted out, on short posts; the hammer between them.
  for (const side of [-1, 1]) {
    const a = side * 0.62, rb = 0.15;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(rb, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), chrome);
    bell.add(at(new THREE.Mesh(new THREE.TorusGeometry(rb, 0.012, 12, 64), chrome), 0, 0, 0)).children[0].rotation.x = Math.PI / 2;
    bell.position.set(Math.sin(a) * (R + 0.07), Math.cos(a) * (R + 0.07), -0.01);
    bell.rotation.z = -a;
    body.add(bell);
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.07, 6, 16), chrome);
    const f = side * 2.45;
    foot.position.set(Math.sin(f) * (R + 0.02), Math.cos(f) * (R + 0.02), -0.02);
    foot.rotation.z = -f;
    body.add(foot);
  }
  body.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 12), chrome), 0, R + 0.06, -0.02));
  body.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 24, 12), chrome), 0, R + 0.14, -0.02));
  body.updateMatrixWorld(true);
  body.position.y = -new THREE.Box3().setFromObject(body).min.y;
  g.add(body);
  return g;
}
