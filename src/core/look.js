// The Contour look: how surfaces, text, icons and light are drawn.
// Behaviour comes from tokens; this file only decides appearance. Values that
// are candidates for future tokens live in DEFAULTS.look.
import * as THREE from 'three';
import { Text } from 'troika-three-text';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import interMedium from '@fontsource/inter/files/inter-latin-500-normal.woff?url';
import interSemibold from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import { ICONS } from './icons.js';
import { DEFAULTS } from './defaults.js';
import { clamp } from './easing.js';

const FONTS = { 400: interRegular, 500: interMedium, 600: interSemibold, 700: interBold };
const L = DEFAULTS.look;

// ---------------------------------------------------------------------------
// Geometry

// Rounded rectangle with true circular corners (radius clamped to a capsule).
export function roundedRectShape(w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const s = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r);
  s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1);
  s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r);
  s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// A solid with a rounded outline and softly bevelled edges. Its back face is
// at z = 0 and its front at z = t, so scaling z compresses it toward the back
// like pressing a real object. Vertex colours shade it lighter at the top,
// the way overhead light falls on a real object.
export function bodyGeometry(w, h, t, r) {
  const bevel = Math.min(t * L.bevelRatio, r * 0.6, Math.min(w, h) * 0.2);
  const inset = bevel * 0.9;
  const shape = roundedRectShape(w - inset * 2, h - inset * 2, Math.max(0, r - inset));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-5, t - bevel * 2),
    bevelEnabled: true, bevelThickness: bevel, bevelSize: inset, bevelSegments: 5,
    curveSegments: 24,
  });
  g.translate(0, 0, bevel);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.lerp(L.shadeBottom, 1, (pos.getY(i) + h / 2) / h);
    colors.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Materials

export function bodyMaterial(T, { color, opacity, metal = false } = {}) {
  const o = opacity ?? T.get('surface.opacity.base');
  return new THREE.MeshPhysicalMaterial({
    color, vertexColors: true,
    roughness: metal ? 0.3 : 0.62,
    metalness: metal ? 0.7 : 0,
    clearcoat: metal ? 0.2 : 0.35, clearcoatRoughness: 0.45,
    envMapIntensity: metal ? 0.9 : 0.22,
    transparent: o < 1, opacity: o,
    userData: { baseOpacity: o },
  });
}

// Light effects drawn on the front face in one pass, from a rounded-rect
// distance field so edges stay crisp at any distance:
//   rim   a thin luminous edge, brighter at the top (surface.outline.mr width)
//   spot  a soft highlight that follows the hand or pointer while hovering
//   glow  the hover edge glow (feedback.glow.edge width)
//   press a slight darkening as the surface is pushed in
const FACE_VERT = /* glsl */`
  varying vec2 vP;
  uniform vec2 uSize;
  void main() {
    vP = (uv - 0.5) * uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const FACE_FRAG = /* glsl */`
  varying vec2 vP;
  uniform vec2 uSize;
  uniform float uRadius, uRim, uRimStrength, uGlowWidth, uHover, uPress, uSpotRadius, uOpacity;
  uniform vec2 uSpot;
  uniform vec3 uGlowColor;
  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }
  void main() {
    float d = sdRoundRect(vP, uSize * 0.5, uRadius);
    float aa = fwidth(d) * 1.2;
    float inside = 1.0 - smoothstep(-aa, aa, d);
    float top = smoothstep(-0.5, 0.5, vP.y / uSize.y);
    float rim = (1.0 - smoothstep(0.0, uRim + aa, -d)) * inside;
    vec3 col = vec3(1.0) * rim * uRimStrength * mix(0.25, 1.0, top);
    float s = 1.0 - smoothstep(0.0, uSpotRadius, length(vP - uSpot));
    col += vec3(1.0) * s * s * uHover * 0.16 * inside;
    float glow = (1.0 - smoothstep(0.0, uGlowWidth + aa, -d)) * inside * uHover;
    col += uGlowColor * glow * 0.4;
    gl_FragColor = vec4(col * uOpacity, 1.0);
  }`;

export function faceMaterial(T, { w, h, r, distance, rimStrength = L.rimStrength }) {
  return new THREE.ShaderMaterial({
    vertexShader: FACE_VERT, fragmentShader: FACE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uSize: { value: new THREE.Vector2(w, h) },
      uRadius: { value: Math.min(r, w / 2, h / 2) },
      uRim: { value: T.dmm('surface.outline.mr', distance) },
      uRimStrength: { value: rimStrength },
      uGlowWidth: { value: T.dmm('feedback.glow.edge', distance) },
      uGlowColor: { value: new THREE.Color(DEFAULTS.color.glow) },
      uHover: { value: 0 },
      uPress: { value: 0 },
      uSpot: { value: new THREE.Vector2() },
      uSpotRadius: { value: Math.max(w, h) * 0.75 },
      uOpacity: { value: 1 },
    },
  });
}

// ---------------------------------------------------------------------------
// Glass (windows)
//
// A flat sheet that shows the backdrop directly behind it, blurred, darkened
// and slightly desaturated, with a thin specular edge brightest at the top.
// It samples the scene's backdrop (a prefiltered environment map) along the
// view ray, so it works per eye in a headset and needs no extra render pass.
// It blurs the backdrop only, not other objects in front of it; that is also
// why glass never shows another glass sheet through it (no light glass on
// light glass). In mixed reality a web page can't read the passthrough
// camera, so with no backdrop the sheet becomes a tinted surface at
// surface.opacity.base.

const backdrop = {
  envMap: { value: null },
  uEnvRot: { value: new THREE.Matrix3() },
  uEnvIntensity: { value: 1 },
  uHasEnv: { value: 0 },
};
const glassMaterials = new Set();

function cubeUVDefines(tex) {
  const h = tex?.image?.height;
  if (!h) return {};
  const maxMip = Math.log2(h) - 2;
  return {
    ENVMAP_TYPE_CUBE_UV: '',
    CUBEUV_TEXEL_WIDTH: 1 / (3 * Math.max(2 ** maxMip, 7 * 16)),
    CUBEUV_TEXEL_HEIGHT: 1 / h,
    CUBEUV_MAX_MIP: maxMip.toFixed(1),
  };
}

// Point every glass sheet at the backdrop (a PMREM texture), or at nothing
// (mixed reality). `rotation` is the backdrop's Euler rotation.
export function setBackdrop(pmremTexture, { rotation, intensity = 1 } = {}) {
  backdrop.envMap.value = pmremTexture;
  backdrop.uHasEnv.value = pmremTexture ? 1 : 0;
  backdrop.uEnvIntensity.value = intensity;
  // three.js samples environments with the inverse of the scene rotation.
  if (rotation) {
    const e = new THREE.Euler(-rotation.x, -rotation.y, -rotation.z, rotation.order);
    backdrop.uEnvRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
  }
  for (const m of glassMaterials) {
    m.defines = cubeUVDefines(pmremTexture);
    m.needsUpdate = true;
  }
}
export function setBackdropIntensity(v) { backdrop.uEnvIntensity.value = v; }

const GLASS_VERT = /* glsl */`
  varying vec2 vP;
  varying vec3 vWorld;
  uniform vec2 uSize;
  void main() {
    vP = (uv - 0.5) * uSize;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const GLASS_FRAG = /* glsl */`
  varying vec2 vP;
  varying vec3 vWorld;
  uniform vec2 uSize;
  uniform float uRadius, uRim, uOpacity, uDim, uHover, uSpotRadius, uBlur, uSolidOpacity;
  uniform float uHasEnv, uEnvIntensity, uMaxLum, uScrimMax;
  uniform vec2 uSpot;
  uniform vec3 uTint;
  uniform float uSee;
  uniform mat3 uEnvRot;
  #ifdef ENVMAP_TYPE_CUBE_UV
    uniform sampler2D envMap;
    #include <cube_uv_reflection_fragment>
  #endif
  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }
  void main() {
    float d = sdRoundRect(vP, uSize * 0.5, uRadius);
    float aa = fwidth(d);
    float inside = 1.0 - smoothstep(-aa, aa, d);
    if (inside <= 0.0) discard;
    vec2 n = vP / (uSize * 0.5);              // -1..1 across the sheet
    float top = n.y * 0.5 + 0.5;

    vec3 col = uTint;
    float alpha = uSolidOpacity;
    #ifdef ENVMAP_TYPE_CUBE_UV
      vec3 dir = uEnvRot * normalize(vWorld - cameraPosition);
      vec3 bg = textureCubeUV(envMap, dir, uBlur).rgb * uEnvIntensity;
      float lum = dot(bg, vec3(0.2126, 0.7152, 0.0722));
      bg = mix(vec3(lum), bg, 0.8);            // a little less colour than the room
      bg = bg / (1.0 + lum * 1.2);             // compress bright walls more than dark corners
      col = mix(uTint, bg, uSee);
      // Adaptive scrim: over a bright room (a sunny window) darken just
      // enough to keep white text legible, up to surface.scrim.max.
      float lc = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= 1.0 - clamp(1.0 - uMaxLum / max(lc, 1e-4), 0.0, uScrimMax);
      alpha = 1.0;
    #endif
    col *= mix(1.0, 0.55, uDim);               // pushed-back levels read darker, not see-through
    col += vec3(0.018) * top;                   // light falling from above

    // Specular edge: a thin bright line, strongest at the top left.
    float edge = 1.0 - smoothstep(0.0, uRim + aa, -d);
    float lit = clamp(0.55 * n.y - 0.35 * n.x + 0.45, 0.0, 1.0);
    col += vec3(1.0) * edge * mix(0.06, 0.55, lit * lit);
    float inner = 1.0 - smoothstep(uRim, uRim * 6.0 + aa, -d);
    col += vec3(1.0) * inner * 0.02 * lit;

    // Hover (receded levels are pressable): a soft spot under the pointer.
    float s = 1.0 - smoothstep(0.0, uSpotRadius, length(vP - uSpot));
    col += vec3(1.0) * s * s * uHover * 0.06;

    gl_FragColor = vec4(col, inside * alpha * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function glassMaterial(T, { w, h, r, distance }) {
  const m = new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
    transparent: true, depthWrite: true,
    defines: cubeUVDefines(backdrop.envMap.value),
    uniforms: {
      ...backdrop,
      uSize: { value: new THREE.Vector2(w, h) },
      uRadius: { value: Math.min(r, w / 2, h / 2) },
      uRim: { value: T.dmm('surface.outline.mr', distance) },
      uBlur: { value: L.glass.blur },
      uSee: { value: L.glass.see },
      uMaxLum: { value: L.glass.maxLum },
      uScrimMax: { value: T.get('surface.scrim.max') },
      uTint: { value: new THREE.Color(DEFAULTS.color.glassTint) },
      uSolidOpacity: { value: T.get('surface.opacity.base') },
      uDim: { value: 0 },
      uHover: { value: 0 },
      uSpot: { value: new THREE.Vector2() },
      uSpotRadius: { value: Math.max(w, h) * 0.5 },
      uOpacity: { value: 1 },
    },
  });
  glassMaterials.add(m);
  return m;
}

// List-row platter: invisible at rest, a soft white lift on hover, a little
// brighter while pressed. No outline.
const PLATTER_FRAG = /* glsl */`
  varying vec2 vP;
  uniform vec2 uSize;
  uniform float uRadius, uHover, uPress, uSpotRadius, uOpacity, uRest;
  uniform vec2 uSpot;
  uniform vec3 uK; // hover fill, spot, press fill
  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }
  void main() {
    float d = sdRoundRect(vP, uSize * 0.5, uRadius);
    float aa = fwidth(d);
    float inside = 1.0 - smoothstep(-aa, aa, d);
    float s = 1.0 - smoothstep(0.0, uSpotRadius, length(vP - uSpot));
    float a = uRest + uHover * (uK.x + s * s * uK.y) + uPress * uK.z;
    gl_FragColor = vec4(vec3(1.0), a * inside * uOpacity);
  }`;

export function platterMaterial({ w, h, r, rest = 0 }) {
  const P = L.platter;
  return new THREE.ShaderMaterial({
    vertexShader: FACE_VERT, fragmentShader: PLATTER_FRAG,
    transparent: true, depthWrite: false,
    uniforms: {
      uSize: { value: new THREE.Vector2(w, h) },
      uRadius: { value: Math.min(r, w / 2, h / 2) },
      uHover: { value: 0 }, uPress: { value: 0 }, uRest: { value: rest },
      uSpot: { value: new THREE.Vector2() },
      uSpotRadius: { value: Math.max(w, h) * 0.6 },
      uK: { value: new THREE.Vector3(P.hover, P.spot, P.press) },
      uOpacity: { value: 1 },
    },
  });
}

export function flatMaterial(color, opacity = 1, extra = {}) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    userData: { baseOpacity: opacity }, ...extra,
  });
}

// ---------------------------------------------------------------------------
// Text (signed-distance-field text: sharp at any distance and angle)

// Text styles come from the type ramp (DEFAULTS.type): pass `style` and
// `distance`, or a raw `size` in metres.
export function makeText(str, { style, distance = DEFAULTS.distance, size, weight, tracking, color = DEFAULTS.color.text, opacity = 1, anchorX = 'center', maxWidth } = {}) {
  const ramp = style ? DEFAULTS.type[style] : null;
  if (style && !ramp) throw new Error(`Contour: no text style "${style}"`);
  size ??= ramp ? (ramp.size / 1000) * distance : undefined;
  weight ??= ramp?.weight ?? 500;
  tracking ??= ramp?.tracking ?? 0;
  const t = new Text();
  t.text = str;
  t.font = FONTS[weight] ?? FONTS[500];
  t.fontSize = size;
  t.color = color;
  t.anchorX = anchorX;
  t.anchorY = 'middle';
  t.letterSpacing = tracking;
  if (maxWidth) { t.maxWidth = maxWidth; t.overflowWrap = 'break-word'; t.whiteSpace = 'nowrap'; }
  t.fillOpacity = opacity;
  t.userData.baseOpacity = opacity;
  t.renderOrder = 3;
  t.sync();
  return t;
}

// ---------------------------------------------------------------------------
// Icons (Lucide outlines rendered to a texture, tinted by material colour)

const iconCache = new Map();
function iconTexture(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const svg = ICONS[name];
  if (!svg) throw new Error(`Contour: no icon "${name}" (add it to src/core/icons.js)`);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    canvas.getContext('2d').drawImage(img, 0, 0, 256, 256);
    tex.needsUpdate = true;
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    svg.replace(/stroke="currentColor"/, 'stroke="#ffffff"')
      .replace(/width="24"/, 'width="256"').replace(/height="24"/, 'height="256"'));
  iconCache.set(name, tex);
  return tex;
}

export function makeIcon(name, size, { color = DEFAULTS.color.text, opacity = 1 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), flatMaterial(color, opacity, { map: iconTexture(name) }));
  m.renderOrder = 3;
  return m;
}

// Soft round shadow / glow texture.
let softTex = null;
export function softTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}

// ---------------------------------------------------------------------------
// Fading a whole group (packaging levels)

// `dim` (0..1) is for levels pushed behind another: glass darkens instead of
// turning see-through, and content fades part way.
export function setGroupOpacity(root, k, dim = 0) {
  // Content fades in later than the glass and out sooner, so two levels'
  // text never shows through each other mid-transition.
  const content = k * k * (1 - 0.45 * dim);
  const sheet = Math.min(1, k * 2.5);
  root.traverse(o => {
    o.visible = k > 0.001;
    // Secondary header text (a subtitle) goes once its level is pushed back.
    const hide = o.userData.hideWhenDim ? clamp(1 - dim * 3, 0, 1) : 1;
    if (o.isMesh && o.text !== undefined && 'fillOpacity' in o) {
      o.fillOpacity = (o.userData.baseOpacity ?? 1) * content * hide;
      return;
    }
    const m = o.material;
    if (!m || Array.isArray(m)) return;
    if (m.uniforms?.uDim) { m.uniforms.uOpacity.value = sheet; m.uniforms.uDim.value = dim; }
    else if (m.uniforms?.uOpacity) m.uniforms.uOpacity.value = content;
    else {
      m.opacity = (m.userData.baseOpacity ?? 1) * content;
      m.transparent = true;
    }
  });
}

// A non-interactive platter (window background, toolbar ornament).
export function makePlatter(T, { w, h, r, distance, thickness = 'thick', color = DEFAULTS.color.window }) {
  const t = T.get(`material.t.${thickness}`);
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry(w, h, t, r), bodyMaterial(T, { color }));
  body.castShadow = true;
  g.add(body);
  const fx = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMaterial(T, { w, h, r, distance }));
  fx.position.z = t + 0.0002;
  fx.renderOrder = 2;
  g.add(fx);
  g.userData.front = t;
  return g;
}
