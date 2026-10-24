// Contour hover bubble (Dock): a clear, thin skin of glass that forms round
// an app object when a finger comes near, and gives way where it is pressed
// (Jihoon, 2026-10-21: "the icon is covered with a light bubble layer ...
// it can be pressed like the bubble-pressed list"). His reference shows a
// faint sphere about one and a half times the icon, its rim bright.
//
// What a thin clear skin does with light, and nothing else:
//   transmission  it hides almost nothing: what is behind shows through at
//                 its own colour, dimmed only by what the skin reflects
//   reflection    the room, faint face-on and strong at grazing angles
//                 (Fresnel), so the rim reads bright and the middle clear
//   key light     a small, sharp highlight up and to the left
//   far wall      the inside of the far side reflects too, more faintly, so
//                 it reads as a ball, not a ring
// The press dent is the list bubble's (DEFAULTS.look.emboss.dent): a bell
// curve pushed into the skin where the finger lands, its walls shaded by
// the light (an inner shadow on the wall toward the light), light gathering
// at its bottom, springing back past flat once on release.
//
// Geometry: a unit sphere, finely split so the dent is smooth; the mesh's
// scale is the bubble's radius. Dent sizes are in that unit.
import * as THREE from 'three';
import { DEFAULTS } from './defaults.js';
import { backdropUniforms, trackGlass } from './look.js';

const VERT = /* glsl */`
  uniform vec4 uDent;        // press point (unit direction, local) and depth (x radius)
  uniform float uDentWidth;  // dent radius (x radius): exp(-d²/w²)
  uniform float uSquash;     // the whole skin gives a little along the press
  varying vec3 vWorld, vNormal, vLocal, vRadial;
  varying float vDent;
  void main() {
    #ifdef PLANAR_BUBBLE
    vec3 p = position;
    vec3 q = p - uDent.xyz;
    float e = exp(-dot(q, q) / (uDentWidth * uDentWidth));
    float front = max(0.0, normal.z);
    vec3 pos = p - vec3(0.0, 0.0, uDent.w * e * front);
    vec3 n = normalize(normal - vec3(2.0 * uDent.w * e * q.xy / (uDentWidth * uDentWidth), 0.0) * front);
    vDent = e;
    vLocal = p;
    vec4 w = modelMatrix * vec4(pos, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    vRadial = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
    #else
    vec3 p = normalize(position);
    // The dent: the skin moves in along its normal by a bell curve of the
    // distance to the press point. Its normal is exact: the slope of the
    // bell curve tilts it toward the dent's centre.
    vec3 q = p - uDent.xyz;
    float e = exp(-dot(q, q) / (uDentWidth * uDentWidth));
    float h = -uDent.w * e;
    vec3 g = 2.0 * uDent.w * e / (uDentWidth * uDentWidth) * (dot(uDent.xyz, p) * p - uDent.xyz);
    vec3 n = normalize(p - g / (1.0 + h));
    vec3 pos = p * (1.0 + h);
    // Pressed, the skin gives a little along the press and bulges round it
    // (volume kept), as a soft ball does: the list pillow's sag.
    vec3 d = uDent.xyz;
    pos += -d * dot(pos, d) * uSquash + (pos - d * dot(pos, d)) * uSquash * 0.5;
    n = normalize(n + d * dot(n, d) * uSquash - (n - d * dot(n, d)) * uSquash * 0.5);
    // It rests on the shelf: where the bulge would sink into the glass, it
    // flattens against it instead.
    if (pos.y < -1.0) { pos.y = -1.0; n = normalize(mix(n, vec3(0.0, -1.0, 0.0), 0.5)); }
    vDent = e;
    vLocal = p;
    vec4 w = modelMatrix * vec4(pos, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    vRadial = normalize(mat3(modelMatrix) * p);   // the undented skin's normal
    gl_Position = projectionMatrix * viewMatrix * w;
    #endif
  }`;

const FRAG = /* glsl */`
  uniform float uOpacity, uF0, uReflBlur, uEnvIntensity, uHasEnv, uKey, uKeySharp, uFar, uRimLight, uRimPower, uReflect, uReflColour;
  uniform float uBodyOpacity;
  uniform float uGlow, uGlowCore, uCoreWidth, uRing, uDentShadow, uDentLight, uDentSlope, uDentWidth, uLipAt, uLipWidth, uDentGlint;
  uniform vec4 uDent;
  uniform vec3 uKeyDir, uGlowColor, uRimColor;
  uniform mat3 uEnvRot;
  varying vec3 vWorld, vNormal, vLocal, vRadial;
  varying float vDent;
  #ifdef ENVMAP_TYPE_CUBE_UV
    uniform sampler2D envMap;
    #include <cube_uv_reflection_fragment>
  #endif
  void main() {
    vec3 V = normalize(vWorld - cameraPosition);
    vec3 N = normalize(vNormal), Nr = normalize(vRadial);
    // The far wall is seen from inside: its normal faces away. Told by the
    // normal, not gl_FrontFacing: three.js draws a BackSide mesh with its
    // winding flipped, so its faces report front-facing, and the far wall
    // would read every pixel at grazing angle, a full mirror.
    bool farWall = dot(Nr, V) > 0.0;
    if (farWall) { N = -N; Nr = -Nr; }
    float cosT = clamp(dot(-V, N), 0.0, 1.0);
    // Two surfaces of a thin skin reflect about twice what one does.
    float F = uF0 + (1.0 - uF0) * pow(1.0 - cosT, 5.0);
    float R = 2.0 * F / (1.0 + F);
    vec3 refl = vec3(0.6);
    #ifdef ENVMAP_TYPE_CUBE_UV
      if (uHasEnv > 0.5) refl = textureCubeUV(envMap, uEnvRot * reflect(V, N), uReflBlur).rgb * uEnvIntensity;
    #endif
    // A bright window in the room would wash the whole skin white: its
    // reflection is compressed (as the window glass's is), so the skin stays
    // clear and the window reads as a soft shape in it.
    refl = refl / (1.0 + dot(refl, vec3(0.2126, 0.7152, 0.0722)));
    // It keeps only a little of the room's colour (uReflColour): the rest
    // is the room's light, in the rim's cool white. A warm room otherwise
    // tints the whole skin amber, and the bubble reads heavy, not light
    // (Jihoon's reference: a cool, airy sphere).
    refl = mix(vec3(dot(refl, vec3(0.2126, 0.7152, 0.0722))) * uRimColor, refl, uReflColour);
    vec3 col = refl * R * uReflect;
    // The rim catches light round its whole edge, brighter on top and a
    // little cool, as a soap film does.
    float rim = pow(1.0 - cosT, uRimPower);
    col += uRimColor * rim * uRimLight * (0.55 + 0.45 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
    // Key light: a small, crisp highlight (the skin is smooth).
    vec3 H = normalize(uKeyDir - V);
    float spec = pow(max(dot(N, H), 0.0), uKeySharp);
    col += vec3(1.0) * spec * uKey;
    float alpha = clamp(R * uReflect + spec * uKey, 0.0, 1.0);
    // A visible translucent skin even without an environment reflection.
    // Blend its neutral body in premultiplied space; never tint the room.
    float body = uBodyOpacity * (1.0 - alpha);
    col += uRimColor * body * 0.18;
    alpha += body;
    // The dent. A clear skin shows a dent the way cling film over a bowl
    // does: by its reflections. Where the skin bends in, round the
    // fingertip, it catches the light as a thin bright lip, brightest on the
    // side that faces the light; the wall turned away falls into shade (the
    // list bubble's inner shadow); and the hollow, a small concave mirror,
    // gathers the key light into a glint. Nothing else: added light spread
    // over a clear skin reads as fog, not as a dent.
    float dd = length(vLocal - uDent.xyz);
    float press = clamp(uGlow, 0.0, 1.0);
    float lt = (dd - uDentWidth * uLipAt) / uLipWidth;
    float lip = exp(-lt * lt) * press;
    vec3 tilt = N - Nr;
    float facing = dot(tilt, uKeyDir) / max(length(tilt), 1e-4);   // +1 wall facing the light, -1 turned away
    float lit = clamp(facing * 0.5 + 0.5, 0.0, 1.0);
    vec3 dentCol = uRimColor * lip * uDentLight * (0.25 + 0.75 * lit);
    float glint = pow(max(dot(N, H), 0.0), uKeySharp * 0.5) * smoothstep(0.4, 0.8, vDent) * press * uDentGlint;
    dentCol += vec3(1.0) * glint;
    col += dentCol;
    alpha = max(alpha, clamp(dot(dentCol, vec3(0.333)), 0.0, 1.0));
    float shadow = uDentShadow * press * clamp(-facing, 0.0, 1.0) * smoothstep(0.1, 0.6, vDent) * clamp(length(tilt) / max(uDentSlope, 1e-4), 0.0, 1.0);
    shadow = clamp(shadow, 0.0, 0.5);
    alpha = max(alpha, shadow);
    col *= 1.0 - shadow;
    // Press glow: light gathers at the bottom of the dent and the rim lights
    // as a ring, brightest nearest the finger (as the list bubble's edge).
    vec3 q = vLocal - uDent.xyz;
    float core = exp(-dot(q, q) / (uCoreWidth * uCoreWidth));
    float near = exp(-length(q) * 1.2);
    vec3 glow = uGlowColor * uGlow * (core * uGlowCore + rim * uRing * (0.15 + 0.85 * near));
    col += glow;
    alpha = max(alpha, clamp(dot(glow, vec3(0.333)), 0.0, 1.0));
    // The far wall reflects less (seen through the near one, at a slant).
    float k = farWall ? uFar : 1.0;
    // Premultiplied: what is behind is dimmed by what the skin reflects.
    gl_FragColor = vec4(col * k * uOpacity, clamp(alpha * k, 0.0, 1.0) * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * The bubble's two faces (far wall first, then the near wall), sharing one
 * set of uniforms. Scale the returned group by the bubble's radius.
 * @returns {THREE.Group & {uniforms: object}}
 */
export function makeBubble({ geometry = new THREE.SphereGeometry(1, 128, 96), planar = false } = {}) {
  const B = DEFAULTS.look.dockBubble, E = DEFAULTS.look.emboss;
  // The objects' key light: one light for the objects and the skin round
  // them. It is in front, so a dent, being hollow, catches its own highlight
  // on the far wall: the clearest sign that the skin is pushed in.
  const light = DEFAULTS.look.dockObjects.key;
  const uniforms = {
    ...backdropUniforms(),
    uOpacity: { value: 0 },
    uBodyOpacity: { value: B.bodyOpacity },
    uF0: { value: B.f0 },
    uReflBlur: { value: B.reflBlur },
    uKey: { value: B.key },
    uKeySharp: { value: B.keySharp },
    uKeyDir: { value: new THREE.Vector3(...light.dir).normalize() },
    uRimLight: { value: B.rim },
    uRimPower: { value: B.rimPower },
    uReflect: { value: B.reflect },
    uReflColour: { value: B.reflectColour ?? 1 },
    uRimColor: { value: new THREE.Color(...B.rimColor) },
    uFar: { value: B.far },
    uDent: { value: new THREE.Vector4(0, 0, 1, 0) },
    uDentWidth: { value: 0.3 },
    uSquash: { value: 0 },
    uDentLight: { value: B.dentLight },
    uDentSlope: { value: 1 },
    uLipAt: { value: B.lipAt },
    uLipWidth: { value: 0.05 },
    uDentGlint: { value: B.dentGlint },
    uDentShadow: { value: E.dent.shadow * B.dentShadow },
    uGlow: { value: 0 },
    uGlowCore: { value: E.glow.core * B.glowCore },
    uCoreWidth: { value: 0.1 },
    uRing: { value: E.glow.ring * B.glow },
    uGlowColor: { value: new THREE.Color(...E.glow.color) },
  };
  const group = new THREE.Group();
  for (const side of [THREE.BackSide, THREE.FrontSide]) {
    const m = trackGlass(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms, side,
      defines: planar ? { PLANAR_BUBBLE: '' } : {},
      transparent: true, depthWrite: false, premultipliedAlpha: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    const mesh = new THREE.Mesh(geometry, m);
    mesh.renderOrder = side === THREE.BackSide ? 2.9 : 3;   // after the shelf glass, far wall first
    mesh.raycast = () => {};
    group.add(mesh);
  }
  group.uniforms = uniforms;
  return group;
}
