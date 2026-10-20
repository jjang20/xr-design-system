// Refractive glass: glass that bends what is behind it, like the path-traced
// lookdev (lookdev/dock_slider.py). Matches Blender's Principled glass:
// transmission tinted by a base colour, Beer-Lambert absorption, Fresnel
// reflection of the room, an optional clear coat, and the lookdev's two area
// lights (a warm key above left, a rim from behind).
//
// How: just before a refractive mesh draws, the frame so far is copied into
// a texture (a "grab pass"). The glass samples that copy along the refracted
// ray, so it bends real objects behind it: the stem inside the knob, the
// mirrored tiles in the shelf. Order glass back to front with renderOrder.
//
// Unlike three.js's built-in transmission, which only sees opaque objects,
// this sees everything drawn earlier, glass included. It cannot see the real
// room in passthrough mixed reality: WebXR gives pages no camera image.
import * as THREE from 'three';
import { DEFAULTS } from './defaults.js';
import { backdropUniforms, trackGlass } from './look.js';

const R = DEFAULTS.look.refract;

// ---------------------------------------------------------------------------
// The grab pass. Only the patch of screen around the glass is copied (plus
// a margin for the refracted offset and frost blur): a full-frame copy mid
// frame is costly on a headset's tiled GPU. Each mesh copies its own patch.

let grab = null;
const vp = new THREE.Vector4();
const grabUniforms = {
  uGrab: { value: null },
  uGrabSize: { value: new THREE.Vector2(1, 1) },
};
const box = new THREE.Box3(), corner = new THREE.Vector3();

// The mesh's on-screen rectangle in drawing-buffer pixels, or null if it
// reaches behind the eye (then the whole viewport is copied).
function screenRect(mesh, camera) {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  box.copy(g.boundingBox).applyMatrix4(mesh.matrixWorld);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    corner.applyMatrix4(camera.matrixWorldInverse);
    if (corner.z > -1e-3) return null;
    corner.applyMatrix4(camera.projectionMatrix);
    x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x);
    y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
  }
  const m = R.grabMargin;   // fraction of the rect's size, each side
  const w = (x1 - x0) * m, h = (y1 - y0) * m;
  const px = v => (v * 0.5 + 0.5);
  const X0 = Math.floor(px(Math.max(-1, x0 - w)) * vp.z), X1 = Math.ceil(px(Math.min(1, x1 + w)) * vp.z);
  const Y0 = Math.floor(px(Math.max(-1, y0 - h)) * vp.w), Y1 = Math.ceil(px(Math.min(1, y1 + h)) * vp.w);
  if (X1 <= X0 || Y1 <= Y0) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
}

function grabFrame(renderer, camera, mesh) {
  renderer.getCurrentViewport(vp);
  const w = Math.max(1, vp.z), h = Math.max(1, vp.w);
  if (!grab || grab.image.width !== w || grab.image.height !== h) {
    grab?.dispose();
    grab = new THREE.FramebufferTexture(w, h);
    grab.minFilter = grab.magFilter = THREE.LinearFilter;
    grabUniforms.uGrab.value = grab;
    grabUniforms.uGrabSize.value.set(w, h);
    renderer.copyFramebufferToTexture(grab, new THREE.Vector2(vp.x, vp.y));   // allocates it
    return;
  }
  const r = screenRect(mesh, camera);
  if (!r) { renderer.copyFramebufferToTexture(grab, new THREE.Vector2(vp.x, vp.y)); return; }
  if (!r.w || !r.h) return;
  const gl = renderer.getContext();
  renderer.state.bindTexture(gl.TEXTURE_2D, renderer.properties.get(grab).__webglTexture);
  gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, vp.x + r.x, vp.y + r.y, r.w, r.h);
  renderer.state.unbindTexture();
}

// ---------------------------------------------------------------------------

const VERT = /* glsl */`
  varying vec3 vWorld, vNormal;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const FRAG = /* glsl */`
  varying vec3 vWorld, vNormal;
  uniform sampler2D uGrab;
  uniform vec2 uGrabSize;
  uniform vec4 uViewport;          // the eye's viewport in the drawing buffer
  uniform mat4 uViewProj;
  uniform vec3 uColor, uAttColor;
  uniform float uAttDist, uThick, uIor, uRough, uCoat, uCoatRough, uDispersion;
  uniform float uScatter, uDiffuse, uCaustic, uEnvIntensity, uOpacity, uHover;
  uniform vec3 uKeyDir, uKeyColor, uRimDir, uRimColor;
  uniform float uKeySize, uRimSize;
  uniform vec3 uBackN, uBackP;   // a flat back face (beads, slabs): its outward-facing front axis and a point on it
  uniform float uBackMode, uBehind, uEdgeDark;
  uniform mat3 uEnvRot;
  #ifdef ENVMAP_TYPE_CUBE_UV
    uniform sampler2D envMap;
    #include <cube_uv_reflection_fragment>
  #endif
  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

  vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
  vec3 toDisplay(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
  // Khronos PBR Neutral, the renderer's tone mapping (this pass draws in
  // display space, so it applies it to the light it adds itself).
  vec3 neutral(vec3 c) {
    float x = min(c.r, min(c.g, c.b));
    float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
    c -= off;
    float peak = max(c.r, max(c.g, c.b));
    if (peak < 0.76) return c;
    float np = 1.0 - (0.24 * 0.24) / (peak + 0.24 - 0.76 * 2.0 + 0.76);
    c *= np / peak;
    float g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0);
    return mix(c, vec3(np), g);
  }
  vec3 env(vec3 dir, float rough) {
    #ifdef ENVMAP_TYPE_CUBE_UV
      return textureCubeUV(envMap, uEnvRot * dir, rough).rgb * uEnvIntensity;
    #else
      return vec3(0.0);
    #endif
  }
  // What is behind the glass, seen along a ray leaving it at p: a soft
  // disc of taps for rough (frosted) glass.
  vec3 behind(vec3 p, float blurPx) {
    vec4 c = uViewProj * vec4(p, 1.0);
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    vec3 acc = vec3(0.0);
    const int N = 12;
    float ga = 2.39996;
    for (int i = 0; i < N; i++) {
      float r = sqrt((float(i) + 0.5) / float(N)) * blurPx;
      vec2 o = vec2(cos(float(i) * ga), sin(float(i) * ga)) * r / uGrabSize;
      acc += toLinear(texture2D(uGrab, clamp(uv + o, 0.001, 0.999)).rgb);
    }
    return acc / float(N);
  }
  // GGX specular from a sphere light: a light's size widens its highlight.
  float ggx(vec3 N, vec3 V, vec3 L, float rough, float size) {
    vec3 H = normalize(L + V);
    float a = clamp(rough * rough + size, 0.002, 1.0);
    float a2 = a * a;
    float nh = max(dot(N, H), 0.0);
    float d = nh * nh * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159 * d * d);
    float nl = max(dot(N, L), 0.0), nv = max(dot(N, V), 1e-3);
    return D * nl * 0.25 / max(nl * nv, 0.05) * nl;
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    if (!gl_FrontFacing) N = -N;
    float nv = clamp(dot(N, V), 0.0, 1.0);
    float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
    float F = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
    float Fc = (0.04 + 0.96 * pow(1.0 - nv, 5.0)) * uCoat;

    // Transmission: the ray bends in, crosses the glass and leaves on the
    // far side; what is there, tinted and absorbed along the way.
    float path = uThick * mix(1.0, 0.35, pow(1.0 - nv, 2.0)) / max(nv, 0.35);
    vec3 T = refract(-V, N, 1.0 / uIor);
    vec3 exitP = vWorld + T * path;
    float tir = 0.0;
    if (uBackMode > 0.5) {
      // A plano-convex piece (a bead: the knob, the foot) or a slab: follow
      // the ray to the flat back face, bend it out into the air there, and
      // look a little way beyond. This is what makes the knob a lens: the
      // stem behind it is magnified and bent the way the path tracer shows.
      float dn = dot(T, uBackN);
      float tb = dn < -1e-4 ? dot(uBackP - vWorld, uBackN) / dn : uThick;
      tb = clamp(tb, 0.0, uThick * 4.0);
      path = tb;
      vec3 pb = vWorld + T * tb;
      vec3 T2 = refract(T, uBackN, uIor);
      if (dot(T2, T2) < 1e-6) { T2 = T; tir = 1.0; }   // trapped by total internal reflection: it leaves elsewhere; keep going
      exitP = pb + T2 * uBehind;
    }
    float blurPx = uRough * uRough * uGrabSize.y * 0.06;
    vec3 seen;
    if (uDispersion > 0.0) {
      vec3 Tr = refract(-V, N, 1.0 / (uIor - uDispersion));
      vec3 Tb = refract(-V, N, 1.0 / (uIor + uDispersion));
      vec3 d = exitP - (vWorld + T * path);
      seen = vec3(behind(vWorld + Tr * path + d, blurPx).r, behind(exitP, blurPx).g, behind(vWorld + Tb * path + d, blurPx).b);
    } else {
      seen = behind(exitP, blurPx);
    }
    // Back to scene light (the copy is tone mapped; near-linear in the mids).
    vec3 absorb = pow(uAttColor, vec3(path / uAttDist)) * (1.0 - 0.25 * tir);
    // A rod or other rounded piece seen at its edge: the ray skims along it
    // and is trapped, so the silhouette reads as a dark line (the path
    // tracer's stem has them).
    if (uBackMode < 0.5) absorb *= 1.0 - uEdgeDark * smoothstep(0.55, 0.95, 1.0 - nv);
    vec3 col = seen * uColor * absorb * (1.0 - F) * (1.0 - Fc) * (1.0 - uDiffuse);

    // Light scattered inside the glass, in its own colour (milky glass).
    vec3 hue = uColor / max(max(uColor.r, uColor.g), max(uColor.b, 1e-3));
    vec3 ambient = env(N, 1.0);
    vec3 add = hue * uScatter * dot(ambient, LUMA) * (0.6 + 0.4 * clamp(N.y + 0.5, 0.0, 1.0));
    // Milky glass (Blender's transmission weight below 1): part of the light
    // is scattered back in the glass's colour, lit by the room and the key.
    add += uColor * uDiffuse * (1.0 - F) * (ambient + uKeyColor * 0.05 * max(dot(N, uKeyDir), 0.0));

    // Reflection: the room, then the polished coat on top.
    vec3 Rd = reflect(-V, N);
    add += env(Rd, uRough) * F * (1.0 - Fc);
    add += env(Rd, uCoatRough) * Fc;

    // The lookdev's lights.
    float spec = ggx(N, V, uKeyDir, uRough, uKeySize) * (F + Fc) / max(f0, 0.02) * 0.04;
    add += uKeyColor * spec;
    add += uRimColor * ggx(N, V, uRimDir, uRough, uRimSize) * (F + Fc) / max(f0, 0.02) * 0.04;
    // Light through the glass from behind lights its edge (back light).
    add += uRimColor * hue * pow(1.0 - nv, 2.0) * max(dot(-V, uRimDir) * 0.5 + 0.5, 0.0) * 0.25;
    // Caustic: the key light focused by the curved glass gathers on the
    // side away from it, in the glass's colour.
    float away = clamp(-dot(N, uKeyDir), 0.0, 1.0);
    add += hue * uKeyColor * uCaustic * pow(away, 1.5) * pow(1.0 - nv, 1.0);
    // Hover: a soft light under the pointer.
    add += vec3(uHover * 0.02);

    vec3 outc = toDisplay(col + neutral(add));
    // Fade (window levels): fade to what is behind.
    vec3 bg = texture2D(uGrab, (gl_FragCoord.xy - uViewport.xy) / uGrabSize).rgb;
    gl_FragColor = vec4(mix(bg, outc, uOpacity), 1.0);
  }`;

/**
 * A refractive glass material. `kind` names a preset in DEFAULTS.look.refract
 * (amber, plate, tile, shelf); `o` overrides it.
 * thick: the glass's greatest thickness along the view (m).
 */
export function refractiveGlass(kind, { thick, color, flatBack = false } = {}) {
  const P = R[kind];
  const B = backdropUniforms();
  const light = R.lights;
  const lin = c => new THREE.Color().setRGB(...c);
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: {
      ...grabUniforms,
      envMap: B.envMap, uEnvRot: B.uEnvRot, uEnvIntensity: B.uEnvIntensity,
      uViewport: { value: new THREE.Vector4() },
      uViewProj: { value: new THREE.Matrix4() },
      uColor: { value: color ? new THREE.Color(...color) : lin(P.color) },
      uAttColor: { value: lin(P.attColor ?? [1, 1, 1]) },
      uAttDist: { value: P.attDist ?? 1 },
      uThick: { value: thick ?? P.thick ?? 0.005 },
      uIor: { value: P.ior ?? 1.45 },
      uRough: { value: P.rough },
      uCoat: { value: P.coat ?? 0 },
      uCoatRough: { value: P.coatRough ?? 0.03 },
      uDispersion: { value: P.dispersion ?? 0 },
      uScatter: { value: P.scatter ?? 0 },
      uDiffuse: { value: P.diffuse ?? 0 },
      uBackN: { value: new THREE.Vector3() }, uBackP: { value: new THREE.Vector3() },
      uBackMode: { value: 0 }, uBehind: { value: P.behind ?? 0.006 }, uEdgeDark: { value: P.edgeDark ?? 0 },
      uSpot: { value: new THREE.Vector2() },   // (Button sets it; unused)
      uCaustic: { value: P.caustic ?? 0 },
      uOpacity: { value: 1 },
      uHover: { value: 0 },
      uKeyDir: { value: new THREE.Vector3(...light.key.dir).normalize() },
      uKeyColor: { value: lin(light.key.color).multiplyScalar(light.key.intensity) },
      uKeySize: { value: light.key.size },
      uRimDir: { value: new THREE.Vector3(...light.rim.dir).normalize() },
      uRimColor: { value: lin(light.rim.color).multiplyScalar(light.rim.intensity) },
      uRimSize: { value: light.rim.size },
    },
  });
  m.uniforms.uBackMode.value = flatBack ? 1 : 0;
  m.userData.refractive = true;
  return trackGlass(m);
}

// A copy (the Dock's mirrored tiles) that still shares the frame copy and
// the room backdrop. Plain material.clone() would copy those textures.
export function cloneRefractive(m) {
  const shared = ['uGrab', 'uGrabSize', 'envMap', 'uEnvRot', 'uEnvIntensity'];
  const keep = Object.fromEntries(shared.map(k => [k, m.uniforms[k]]));
  for (const k of shared) m.uniforms[k] = { value: null };
  const c = m.clone();
  Object.assign(m.uniforms, keep);
  Object.assign(c.uniforms, keep);
  c.userData.refractive = true;
  return trackGlass(c);
}

/** A mesh with refractive glass: grabs the frame before it draws. */
export function refractiveMesh(geometry, material) {
  return attachGrab(new THREE.Mesh(geometry, material));
}

/** Make an existing mesh with refractive glass grab the frame before it draws. */
export function attachGrab(mesh) {
  mesh.onBeforeRender = (renderer, scene, camera) => {
    const u = mesh.material.uniforms;
    grabFrame(renderer, camera, mesh);
    u.uViewport.value.copy(vp);
    u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (u.uBackMode.value) {
      u.uBackN.value.setFromMatrixColumn(mesh.matrixWorld, 2).normalize();   // local +z: the back face's normal, facing in
      u.uBackP.value.setFromMatrixPosition(mesh.matrixWorld);               // local z = 0
    }
    mesh.material.uniformsNeedUpdate = true;   // per eye
  };
  return mesh;
}
