// The Contour look: how surfaces, text, icons and light are drawn.
// Behaviour comes from tokens; this file only decides appearance. Values that
// are candidates for future tokens live in DEFAULTS.look.
import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
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

// A solid glass slab: a rounded outline whose edge is a full round (like a
// lens), so the rim bends and reflects the room the way thick glass does.
// Front face at z = t, back at z = 0. Normals are smoothed across the face
// and the rounded edge, so reflections slide along it without facets.
// `tessellate` (m) splits the faces finely enough for the front to swell
// into an embossed bubble (see setBulge).
export function glassSlabGeometry(w, h, t, r, { tessellate = 0 } = {}) {
  const b = Math.min(t / 2, r * 0.8, Math.min(w, h) * 0.25);
  const shape = roundedRectShape(w - b * 2, h - b * 2, Math.max(0.0001, r - b));
  let g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-5, t - b * 2),
    bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 10,
    curveSegments: 40,
  });
  g.translate(0, 0, b);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  if (tessellate) g = new TessellateModifier(tessellate, 12).modify(g);
  g = mergeVertices(g, 1e-7);
  g.computeVertexNormals();
  return g;
}

// A glass bead (icon badge): a low dome that catches light like a droplet.
export function glassBeadGeometry(diameter, height) {
  const g = new THREE.SphereGeometry(diameter / 2, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, height / (diameter / 2));
  return g;
}

// Embossed bubble: the front skin inflates over a rounded rect (a hovered
// row), like a fluid-filled tactile display. The skin rises out of the
// window with no seam: a wide, tangent ramp (a meniscus) up to a low,
// domed pillow, so it reads as one membrane, not a slab on a slab.
// A negative height is a shallow dish (pressed).
// Two slots, so the row being left deflates while the next one inflates
// (one slot would snap the old bubble flat the moment the new one wins).
const BULGE_GLSL = /* glsl */`
  uniform vec4 uBulgeRect[2];   // centre xy, half size zw (local)
  uniform vec4 uBulgeParam[2];  // corner radius, height (signed), ramp width, front z (slot 0)
  uniform vec4 uBulgeDent[2];   // press dent: centre xy (local), radius, depth
  uniform vec4 uBulgeGlow[2];   // press glow: ring falloff distance, amount (0 to 1), bloom radius
  uniform vec3 uGlowColor; uniform vec2 uGlowMix;   // ring, bloom strength
  uniform float uDentShade;
  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }
  float bulgeD(vec2 p, vec4 R, vec4 P) { return sdRoundRect(p - R.xy, R.zw, P.x); }
  // 0 on the flat window, 1 on the crown.
  float bulgeT(vec2 p, vec4 R, vec4 P) {
    float t = clamp((0.15 * P.z - bulgeD(p, R, P)) / P.z, 0.0, 1.0);
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);   // smootherstep: tangent at both ends
  }
  // A pillow, curved everywhere like an icon bead: an elliptical dome
  // across the row's short side, so light slides over the whole surface
  // (a flat top with raised edges reads as a slab, not a bubble).
  float bulgeH1(vec2 p, vec4 R, vec4 P) {
    if (P.y == 0.0) return 0.0;
    float u = clamp(-bulgeD(p, R, P) / min(R.z, R.w), 0.0, 1.0);
    return P.y * bulgeT(p, R, P) * sqrt(1.0 - (1.0 - u) * (1.0 - u));
  }
  // A pressed bubble gives way under the finger: a soft round dent, held
  // inside the bubble so the window around it never moves.
  float dentH(vec2 p, vec4 R, vec4 P, vec4 D) {
    if (D.w == 0.0 || P.y == 0.0) return 0.0;
    vec2 q = p - D.xy;
    return -D.w * exp(-dot(q, q) / (D.z * D.z)) * bulgeT(p, R, P);
  }
  float bulgeH(vec2 p) {
    return bulgeH1(p, uBulgeRect[0], uBulgeParam[0]) + dentH(p, uBulgeRect[0], uBulgeParam[0], uBulgeDent[0])
         + bulgeH1(p, uBulgeRect[1], uBulgeParam[1]) + dentH(p, uBulgeRect[1], uBulgeParam[1], uBulgeDent[1]);
  }
  bool anyBulge() { return uBulgeParam[0].y != 0.0 || uBulgeParam[1].y != 0.0; }
  // How much of the bubble's glossy skin covers p (0 to 1).
  float bulgeSkin(vec2 p) {
    float s = 0.0;
    for (int i = 0; i < 2; i++) {
      vec4 R = uBulgeRect[i], P = uBulgeParam[i];
      if (P.y == 0.0) continue;
      s = max(s, smoothstep(0.0, 0.25, bulgeT(p, R, P)) * clamp(abs(P.y) / 0.0015, 0.0, 1.0));
    }
    return s;
  }
  float dentHAll(vec2 p) {
    return dentH(p, uBulgeRect[0], uBulgeParam[0], uBulgeDent[0]) + dentH(p, uBulgeRect[1], uBulgeParam[1], uBulgeDent[1]);
  }
  // How much of a press dent covers p (0 to 1).
  float dentMask(vec2 p) {
    float m = 0.0;
    for (int i = 0; i < 2; i++) {
      vec4 D = uBulgeDent[i];
      if (D.w <= 0.0) continue;
      vec2 q = p - D.xy;
      m = max(m, exp(-dot(q, q) / (4.0 * D.z * D.z)));
    }
    return m;
  }
  // Press glow at p: a bloom spreading from the press point (x) and a lit
  // ring just inside the bubble's edge (y).
  vec2 bulgeGlow(vec2 p) {
    vec2 g = vec2(0.0);
    for (int i = 0; i < 2; i++) {
      vec4 R = uBulgeRect[i], P = uBulgeParam[i], D = uBulgeDent[i], G = uBulgeGlow[i];
      if (G.y <= 0.0 || P.y == 0.0) continue;
      vec2 q = p - D.xy;
      float d = bulgeD(p, R, P);
      g.x = max(g.x, G.y * exp(-dot(q, q) / (G.z * G.z)) * smoothstep(0.0, 0.25, bulgeT(p, R, P)));
      // Light carried through the glass catches at the edge, brightest
      // nearest the press (edge-lit, like acrylic), so it reads as one light.
      g.y = max(g.y, G.y * exp(-pow((d + 0.0014) / 0.0012, 2.0)) * (0.12 + 0.88 * exp(-length(q) / G.x)));
    }
    return g;
  }`;

const GLASS_VERT = /* glsl */`
  varying vec3 vWorld, vNormal, vLocal, vAxisX, vAxisY, vAxisZ;
  varying float vFront;
  ${BULGE_GLSL}
  void main() {
    // Only the flat front face swells.
    vFront = (normal.z > 0.95 && position.z > uBulgeParam[0].w - 1e-4) ? 1.0 : 0.0;
    vec3 pos = position;
    pos.z += bulgeH(position.xy) * vFront;
    vLocal = pos;
    // The slab's own axes in world space, for the surface frost and to tell
    // the flat face from the rounded rim.
    vAxisX = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
    vAxisY = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    vAxisZ = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    vec4 w = modelMatrix * vec4(pos, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

// Glass is drawn from what a real slab does with light:
//   transmission  the room behind, seen through the slab (refracted, so the
//                 rounded rim bends it like a lens) and frosted (blurred)
//   reflection    the room in front, mirrored by the surface; faint face-on,
//                 strong at grazing angles (Fresnel), so the rim glows
//   key light     a soft highlight from above-left on the curved rim
//   frost grain   a fine static grain in the surface, so it reads as a
//                 material rather than a flat colour
//   veil          light glass (a hovered row lens, a bead) is the same glass
//                 plus a thin milky layer
//   contact       soft shadows from what floats in front of it (a child
//                 level, a lifted row lens), so layers sit in space
const GLASS_FRAG = /* glsl */`
  varying vec3 vWorld, vNormal, vLocal, vAxisX, vAxisY, vAxisZ;
  varying float vFront;
  ${BULGE_GLSL}
  uniform float uOpacity, uFade, uDim, uHover, uSpotRadius, uBlur, uReflBlur, uSolidOpacity;
  uniform float uHasEnv, uEnvIntensity, uMaxLum, uScrimMax, uAbsorb, uThick, uIor, uF0, uGrain, uVeil, uKey, uEdge, uFrost, uFrostScale, uGloss, uClear;
  uniform vec2 uSpot;
  uniform vec3 uTint, uAlbedo, uClearAlbedo;
  uniform mat3 uEnvRot;
  uniform vec4 uShadowRect[2];   // centre xy, half size zw (local)
  uniform vec4 uShadowParam[2];  // radius, softness, amount, drop
  #ifdef ENVMAP_TYPE_CUBE_UV
    uniform sampler2D envMap;
    #include <cube_uv_reflection_fragment>
  #endif
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  void main() {
    vec3 V = normalize(vWorld - cameraPosition);
    vec3 N = normalize(vNormal);
    // Face vs rim: the flat face is frosted; the rounded rim is polished, so
    // it refracts the room in clear bands (as in the path-traced reference).
    float rim01 = 1.0 - smoothstep(0.35, 0.92, abs(dot(N, vAxisZ)));
    // The bubble: slope exact per pixel (the mesh is only a few mm fine).
    // Its skin is stretched smooth and glossy; the room and the key light
    // shade it (no painted shading), so it reads as real material.
    float bub = 0.0;
    if (vFront > 0.5 && anyBulge()) {
      float e = 0.0003;
      vec2 g = vec2(bulgeH(vLocal.xy + vec2(e, 0.0)) - bulgeH(vLocal.xy - vec2(e, 0.0)),
                    bulgeH(vLocal.xy + vec2(0.0, e)) - bulgeH(vLocal.xy - vec2(0.0, e))) / (2.0 * e);
      N = normalize(vAxisZ - vAxisX * g.x - vAxisY * g.y);
      bub = bulgeSkin(vLocal.xy);
    }
    // Frost: the face is a field of tiny bumps (about 1 mm), so highlights
    // and the refracted room break up the way acid-etched glass does.
    vec2 fp = vLocal.xy / uFrostScale;
    float e = 0.35;
    vec2 slope = vec2(vnoise(fp + vec2(e, 0.0)) - vnoise(fp - vec2(e, 0.0)),
                      vnoise(fp + vec2(0.0, e)) - vnoise(fp - vec2(0.0, e))) / (2.0 * e);
    slope += 0.5 * vec2(vnoise(fp * 3.1 + vec2(e, 7.0)) - vnoise(fp * 3.1 - vec2(e, -7.0)),
                        vnoise(fp * 3.1 + vec2(7.0, e)) - vnoise(fp * 3.1 - vec2(-7.0, e))) / (2.0 * e);
    // An inflated bubble's skin is stretched smooth.
    N = normalize(N - (vAxisX * slope.x + vAxisY * slope.y) * uFrost * (1.0 - rim01) * (1.0 - uGloss * bub));
    float cosT = clamp(dot(-V, N), 0.0, 1.0);
    float F = uF0 + (1.0 - uF0) * pow(1.0 - cosT, 5.0);

    vec3 col = uTint;
    float alpha = uSolidOpacity;
    vec3 refl = vec3(0.0);
    #ifdef ENVMAP_TYPE_CUBE_UV
      vec3 Tdir = refract(V, N, 1.0 / uIor);
      vec3 bg = textureCubeUV(envMap, uEnvRot * Tdir, mix(uBlur, uBlur * 0.3, rim01)).rgb * uEnvIntensity;
      // Beer-Lambert absorption: light loses energy along its path through
      // the glass. The path is longest where the ray crosses at a slant, so
      // the rounded rim and a bead's edge read darker, as in the path-traced
      // reference (lookdev/). The room keeps its own colour.
      float cosR = clamp(-dot(Tdir, N), 0.15, 1.0);
      // A bubble's skin thins out toward an icon bead's clear glass.
      col = bg * mix(uAlbedo, uClearAlbedo, uClear * bub) * exp(-uAbsorb * uThick * (1.0 - 0.6 * rim01) / cosR);
      // Adaptive scrim: over a bright room darken just enough to keep white
      // text legible, up to surface.scrim.max. The rim carries no text, so
      // it keeps the room's light.
      // A press glow blooms inside the glass, so the scrim below keeps the
      // text over it legible.
      vec2 glow = vFront > 0.5 && anyBulge() ? bulgeGlow(vLocal.xy) : vec2(0.0);
      // The dent is shaded as a hollow by the key light (top left): the wall
      // facing the light brightens into a crescent on the far lip, the wall
      // turned away darkens. Refraction alone read as a smudge.
      if (vFront > 0.5 && anyBulge()) {
        float ed = 0.0004;
        vec2 gd = vec2(dentHAll(vLocal.xy + vec2(ed, 0.0)) - dentHAll(vLocal.xy - vec2(ed, 0.0)),
                       dentHAll(vLocal.xy + vec2(0.0, ed)) - dentHAll(vLocal.xy - vec2(0.0, ed))) / (2.0 * ed);
        float shade = -dot(gd, normalize(vec2(-0.45, 0.8)));
        col *= 1.0 + clamp(shade * uDentShade, -0.4, 0.6);
      }
      col += uGlowColor * glow.x * uGlowMix.y;
      float lc = dot(col, LUMA);
      col *= 1.0 - clamp(1.0 - uMaxLum / max(lc, 1e-4), 0.0, uScrimMax) * (1.0 - rim01);
      // The lit ring sits on the edge, where there is no text.
      col += uGlowColor * glow.y * uGlowMix.x;
      // A dent is a concave mirror: kept soft, so it doesn't focus the
      // room's lights into a sharp shape (it read as a smudge).
      float dm = vFront > 0.5 && anyBulge() ? dentMask(vLocal.xy) : 0.0;
      refl = textureCubeUV(envMap, uEnvRot * reflect(V, N), uReflBlur * (1.0 - 0.7 * uGloss * bub * (1.0 - dm))).rgb * uEnvIntensity;
      refl = refl / (1.0 + dot(refl, LUMA) * 0.5);
      alpha = 1.0;
    #endif

    // Frost: a fine grain plus a slow cloudiness, fixed to the surface.
    float grain = hash(floor(vLocal.xy / 0.0004)) - 0.5;
    float cloud = vnoise(vLocal.xy / 0.03) - 0.5;
    // The inflated skin is stretched clear: hover turns etched glass glossy.
    col *= 1.0 + (grain * uGrain + cloud * uGrain * 2.5) * (1.0 - uGloss * bub);

    // Curved edges look through more of the darker glass beneath and bend
    // the view far off-axis, so a bead or lens reads as a droplet with a
    // dark rim (seen in the path-traced reference).
    col *= 1.0 - uEdge * pow(1.0 - cosT, 2.0);

    // Light glass: a milky veil, a touch brighter toward the top.
    col += vec3(uVeil) * (0.75 + 0.5 * clamp(N.y + 0.5, 0.0, 1.0));

    // Contact shadows from layers floating in front.
    for (int i = 0; i < 2; i++) {
      vec4 R = uShadowRect[i], P = uShadowParam[i];
      if (P.z <= 0.0) continue;
      float d = sdRoundRect(vLocal.xy - R.xy + vec2(0.0, P.w), R.zw, P.x);
      float s = 1.0 - smoothstep(-P.y * 0.6, P.y, d);
      col *= 1.0 - s * P.z;
    }

    col *= mix(1.0, 0.42, uDim);               // pushed-back levels go dark, not see-through

    // Reflection (Fresnel) and the key light on the curved rim.
    col = mix(col, refl, F * (1.0 - 0.5 * uDim));
    vec3 Lk = normalize(vec3(-0.45, 0.8, 0.6));
    vec3 H = normalize(Lk - V);
    float spec = pow(max(dot(N, H), 0.0), 90.0);
    float rim = 1.0 - cosT;
    col += vec3(1.0) * spec * uKey * (0.3 + rim);
    // The inflated skin mirrors a soft box above (a broad, tapered highlight
    // along the upper shoulder that follows the curve and the view), plus
    // a crisp core where it is sharpest, as on a wet, stretched membrane.
    if (bub > 0.0) {
      // The inflated skin is wet and stretched: a crisp core of the key
      // light slides along the dome. The room's reflection and the
      // refraction through the curved skin do the rest, as in lookdev/.
      col += vec3(1.0) * pow(max(dot(N, H), 0.0), 300.0) * uKey * 1.6 * uGloss * bub;
    }
    // Rim light: curved glass edges gather light, brightest along the top.
    col += vec3(1.0) * pow(rim, 3.0) * uKey * 0.5 * (0.35 + 0.65 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0));

    // Hover (receded levels are pressable): a soft light under the pointer.
    float sp = 1.0 - smoothstep(0.0, uSpotRadius, length(vLocal.xy - uSpot));
    col += vec3(1.0) * sp * sp * uHover * 0.025;

    gl_FragColor = vec4(col, alpha * uOpacity * uFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// kind: 'window' (dark structural glass), 'lens' (light glass that lifts
// out of a window on hover), 'bead' (icon badge).
export function glassMaterial(T, { w, h, t, kind = 'window' }) {
  const G = L.glass, K = G[kind];
  const m = new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
    transparent: true, depthWrite: kind === 'window',
    defines: cubeUVDefines(backdrop.envMap.value),
    uniforms: {
      ...backdrop,
      uBlur: { value: G.blur },
      uReflBlur: { value: G.reflBlur },
      uAbsorb: { value: G.absorb },
      uThick: { value: t ?? T.get('material.t.regular') },
      uAlbedo: { value: new THREE.Color(...K.albedo) },
      uIor: { value: G.ior },
      uF0: { value: G.f0 },
      uGrain: { value: K.grain },
      uVeil: { value: K.veil },
      uKey: { value: K.key },
      uMaxLum: { value: K.maxLum },
      uEdge: { value: K.edge },
      uFrost: { value: K.frost },
      uFrostScale: { value: G.frostScale },
      uScrimMax: { value: T.get('surface.scrim.max') },
      uTint: { value: new THREE.Color(DEFAULTS.color.glassTint) },
      uSolidOpacity: { value: T.get('surface.opacity.base') },
      uDim: { value: 0 },
      uHover: { value: 0 },
      uFade: { value: kind === 'lens' ? 0 : 1 },
      uSpot: { value: new THREE.Vector2() },
      uSpotRadius: { value: Math.max(w, h) * 0.5 },
      uBulgeRect: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uBulgeParam: { value: [new THREE.Vector4(0, 0, 0, t ?? T.get('material.t.regular')), new THREE.Vector4()] },
      uBulgeDent: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uBulgeGlow: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uGlowColor: { value: new THREE.Color(...L.emboss.glow.color) },
      uGlowMix: { value: new THREE.Vector2(L.emboss.glow.ring, L.emboss.glow.bloom) },
      uDentShade: { value: L.emboss.dent.shade },
      uClear: { value: L.emboss.clear },
      uClearAlbedo: { value: new THREE.Color(...G.bead.albedo) },
      uGloss: { value: L.emboss.gloss },
      uShadowRect: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uShadowParam: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uOpacity: { value: 1 },
    },
  });
  glassMaterials.add(m);
  return m;
}

// Contact shadow slot `i` on a glass material: a rounded rect (local
// coordinates of the receiving glass) floating `gap` metres in front.
export function setContactShadow(m, i, { x = 0, y = 0, hw = 0, hh = 0, r = 0, gap = 0, amount = 0 } = {}) {
  const S = L.contactShadow;
  m.uniforms.uShadowRect.value[i].set(x, y, hw, hh);
  m.uniforms.uShadowParam.value[i].set(r, S.minSoft + gap * S.softPerGap, amount, gap * S.dropPerGap);
}

// Embossed bubble slot `i` (0 or 1) on a glass material: the front skin
// rises `height` metres over a rounded rect in local coordinates. `dent`
// ({x, y, radius, depth}, metres) presses a dimple into it; `glow` (0 to 1)
// lights it from the dent.
export function setBulge(m, i, { x = 0, y = 0, hw = 0, hh = 0, r = 0, height = 0, ramp = L.emboss.ramp / 1000, dent, glow = 0 } = {}) {
  m.uniforms.uBulgeRect.value[i].set(x, y, hw, hh);
  const p = m.uniforms.uBulgeParam.value[i];
  p.set(r, height, ramp, p.w);
  const d = dent ?? { x: 0, y: 0, radius: 1, depth: 0 };
  m.uniforms.uBulgeDent.value[i].set(d.x, d.y, d.radius, d.depth);
  m.uniforms.uBulgeGlow.value[i].set(L.emboss.glow.falloff / 1000, glow, L.emboss.glow.bloomRadius / 1000, 0);
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
  const S = DEFAULTS.look.textShadow;
  if (S) {
    t.outlineColor = 0x000000;
    t.outlineBlur = size * S.blur;
    t.outlineOffsetY = -size * S.offset;
    t.outlineOpacity = S.opacity * opacity;
    t.userData.baseOutline = S.opacity;
  }
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
  const content = k * k * clamp(1 - 1.25 * dim, 0.2, 1);
  const sheet = Math.min(1, k * 2.5);
  root.traverse(o => {
    o.visible = k > 0.001;
    // Marked content (a subtitle, a list) goes once its level is pushed back.
    const hide = o.userData.hideWhenDim ? clamp(1 - dim * 3, 0, 1) : 1;
    if (o.isMesh && o.text !== undefined && 'fillOpacity' in o) {
      o.fillOpacity = (o.userData.baseOpacity ?? 1) * content * hide;
      if (o.userData.baseOutline) o.outlineOpacity = o.userData.baseOutline * o.fillOpacity;
      return;
    }
    const m = o.material;
    if (!m || Array.isArray(m)) return;
    if (m.uniforms?.uDim) {
      // Window glass carries the level; lenses and beads are content.
      m.uniforms.uOpacity.value = m.depthWrite ? sheet : content * hide;
      m.uniforms.uDim.value = dim;
    }
    else if (m.uniforms?.uOpacity) m.uniforms.uOpacity.value = content * hide;
    else {
      m.opacity = (m.userData.baseOpacity ?? 1) * content * hide;
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
