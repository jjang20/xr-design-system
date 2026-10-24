// Contour Dock: the app launcher, body-locked below your view.
//
// Session placement: no head-yaw follow. The head supplies only an XZ
// displacement estimate outside a deadzone; Y stays fixed in local-floor.
// The lower handle moves along a horizontal oval and sets height/distance.
// WebXR has no torso pose, so a large lean can also move this anchor.
//
// Magnify: icons grow as the hand approaches (dock.magnify.*), so targets get
// bigger before you reach them (a Fitts's-law aid, not decoration). The size
// eases toward the hand's value in motion.enter.duration. Each grows in
// place: looking at one target never moves the others (as in the lookdev;
// judge round 3 caught a row that spread apart).
//
// Look (Jihoon, 2026-10-21, his "Classic Mac Dock with Subtle Bubble"):
// each app is an icon-like object (core/objects.js) standing on a plate of
// clear glass that curves toward the user, mirrored faintly in it. A finger
// near an app grows a clear bubble round it (DockIcon), which can be pressed
// like the bubble list. The plate is refractive glass (core/refract.js);
// the objects are lit by the room plus soft boxes and a key light that turn
// with the Dock (DEFAULTS.look.dockObjects). The plate's arc is about the
// forearm's sweep round the elbow, so every app is the same reach away.
//
// Plate (Jihoon, 2026-10-21: "Dock plate is also solid bubble, so you can
// grab and stretch its length"): a solid bubble, Contour's glass swollen
// into a cushion, round at every edge and domed under the apps. Its ends
// are handles. Pinch one (or point and press) and pull: the plate grows
// from its middle, the end in your hand following it exactly, and every app
// grows with it (Jihoon: "App size first. Because dock length gets
// automatically longer when you add apps to the dock"), as dragging the
// macOS Dock's divider sets its icon size. Push in and they shrink back.
// Past the smallest or the largest size it resists (rubber-banding) and
// fattens or thins like a held bubble. Let go and it settles where your
// pull was heading (momentum projection), with the speed of your hand, at
// that size. The length otherwise follows the apps: add one (showApps) and
// the plate lengthens by itself while the app forms at its end
// (DEFAULTS.look.dockPlate).
import * as THREE from 'three';
import { Interactable, markComponent, pickProbe } from '../core/Interactable.js';
import { PressModel } from '../core/PressModel.js';
import { DEFAULTS } from '../core/defaults.js';
import { softTexture } from '../core/look.js';
import { refractiveGlass, refractiveMesh } from '../core/refract.js';
import { springStep, springTo, prefersReducedMotion } from '../core/spring.js';
import { magnifyScale, LazyFollow } from '../core/follow.js';
import { objectEnvironment } from '../core/objects.js';
import { DockIcon } from './DockIcon.js';
import { BubbleHandle } from './BubbleHandle.js';
import { DockRail } from '../core/DockRail.js';
import { Hysteresis } from '../core/Hysteresis.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export { magnifyScale, LazyFollow };

export class Dock extends THREE.Group {
  /**
   * @param {object} T tokens
   * @param {object} o
   * @param {{label: string, icon?: string, color?: number, running?: boolean}[]} o.apps
   * @param {number} [o.visible] how many of the apps are in the Dock (default all; see showApps)
   * @param {number} [o.distance] body-lock distance in m
   * @param {number} [o.eccentricity] angle below the eye, radians (default dockRail.elevation)
   */
  constructor(T, o) {
    super();
    markComponent(this);
    this.T = T;
    if (T.get('anchor.mode') !== 'bodyLock') console.warn('Contour Dock only implements anchor.mode = bodyLock');
    const dist = this.distance = o.distance ?? DEFAULTS.dockDistance;
    this.eccentricity = o.eccentricity ?? DEFAULTS.dockRail.elevation;
    this.radius = T.viewSize('dock.magnify.radius', dist);
    this.maxScale = T.get('dock.magnify.scale.max');
    // Icon size follows the hand through a critically damped spring that
    // settles (95%) in motion.enter.duration: hand-tracking jitter does not
    // shake the icons, and a hand that drops out of tracking shrinks them
    // instead of popping them back in one frame.
    this.magnifyOmega = 4.74 / T.get('motion.enter.duration');
    this.gap = T.viewSize('spacing.gap.minimum', dist);
    this.rotation.order = 'YXZ';

    // Everything sits in a level frame: the group is pitched to face the
    // eye, but the shelf lies flat in the room and the objects stand upright
    // on it, so you look down on them, as on a desk.
    this.level = new THREE.Group();
    this.level.rotation.x = -this.eccentricity;
    this.add(this.level);
    const dmm = v => (v / 1000) * T.effectiveDistance(dist);
    const S = DEFAULTS.look.dockShelf, O = DEFAULTS.look.dockObjects;
    // Apps: real objects standing on the shelf. Names appear on hover.
    this.icons = o.apps.map(app => {
      const icon = new DockIcon(T, app, dist);
      icon.addEventListener('select', () => this.dispatchEvent({ type: 'select', app }));
      this.level.add(icon);
      return icon;
    });
    this.side = this.icons[0].side;
    const P = DEFAULTS.look.dockPlate;
    // Past the last app the plate is the handle: its end runs on this far,
    // at least a target's size (size.interactive.minimum) clear of the app.
    this.pad = Math.max(dmm(P.pad), T.viewSize('size.interactive.minimum', dist));
    this.arcR = S.arc * dist;
    // How many apps the Dock holds: a whole number, in between only while
    // one is being added or taken out (showApps), when the plate lengthens
    // or shortens by itself to fit them.
    const k = clamp(Math.round(o.visible ?? this.icons.length), 1, this.icons.length);
    this.count = { x: k, v: 0, target: k };
    // The apps' size, set by stretching the plate: 1 at rest, between
    // minSize and maxSize. The hand holds it raw (rubber-banded past the
    // limits, where the plate stretches but the apps don't); the apps
    // take it clamped (this.size).
    this.sizeRange = [P.minSize, P.maxSize];
    this.sizing = { x: 1, v: 0, target: 1 };
    this.size = 1;
    this.grip = { hover: { x: 0, v: 0 }, side: 1, at: new THREE.Vector3(), held: null, history: [] };
    this.plateDent = { x: 0, v: 0 };
    this.plateContactDent = { x: 0, v: 0 };
    this.plateDentAt = new THREE.Vector3();
    this.gripBand = new Hysteresis(T.get('input.hover.distance.enter'), T.get('input.hover.distance.exit'));
    this.thick = (P.edge + P.crown + P.under) * P.thicknessScale / 1000 * T.effectiveDistance(dist) / T.effectiveDistance(DEFAULTS.distance);
    this.neck = 1;
    // Spacing: at least the gap token, and enough that a fully magnified
    // app's bubble clears its magnified neighbours' objects (the bubble is
    // wider than the object it holds). It is the objects' own width that
    // must clear, not their size box: a turned object is narrower than it,
    // and the reference's apps stand close, its bubble all but touching them.
    const nb = magnifyScale(this.side + this.gap, this.radius, this.maxScale);
    const halfWidth = Math.max(...this.icons.map(i => i.footprint.x)) / 2;
    this.pitch = Math.max(this.side + this.gap, this.icons[0].rb * this.maxScale + halfWidth * nb + dmm(S.bubbleClear));
    // The plate: its crown is the floor the objects stand on. It takes
    // hands itself (its ends are handles), so it is an Interactable.
    this.top = -this.side / 2;
    this.shelf = new Interactable();
    this.shelf.pokeDistance = point => this.plateDistance(point);
    this.shelf.press = new PressModel({ thickness: DEFAULTS.handInput.platePressDepth, pressRatio: 1,
      recover: T.get('motion.recovery.soft.duration'), release: T.get('input.poke.distance.release') });
    this.shelf.rayPoint = (ray, out) => ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out);
    this.shelf.position.y = this.top;
    this.level.add(this.shelf);
    // Reserve the visible end pads for sizing. An outer app's proximity
    // sphere otherwise captures a downward approach before the plate can
    // see it, so it selects that app instead of pressing the plate.
    for (const icon of this.icons) {
      const appDistance = icon.pokeDistance.bind(icon);
      icon.pokeDistance = point => {
        const onPlate = this.shelf.worldToLocal(icon.localToWorld(point.clone()));
        return this.plateSample(onPlate).inside ? Infinity : appDistance(point);
      };
    }
    // A fixed stem separates the sphere from the central app in world Y.
    // It stays in the level frame as the plate pitches; no pendulum motion.
    const H = DEFAULTS.dockRail;
    this.handle = new BubbleHandle(T, { width: H.sphereSize, distance: dist });
    this.handle.position.set(0, this.top - H.stemLength - this.handle.r, 0);
    this.level.add(this.handle);
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(H.stemRadius, H.stemRadius, H.stemLength, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .28 }));
    this.stem.position.set(0, this.top - H.stemLength / 2, 0);
    this.level.add(this.stem);
    this.rail = new DockRail(this.handle, { handleDrop: -this.handle.position.y,
      ...(o.eccentricity === undefined ? {} : { radius: Math.cos(o.eccentricity) * dist, height: Math.sin(o.eccentricity) * dist }) });
    this.restX = this.icons.map(() => 0);
    const mm = v => v * P.thicknessScale / 1000 * T.effectiveDistance(dist) / T.effectiveDistance(DEFAULTS.distance);
    this.shelfShape = new PlateGeometry(this.plateLength(this.icons.length, P.maxSize), this.side * S.depth, { edge: mm(P.edge), crown: mm(P.crown), under: mm(P.under) });
    // Refractive glass, so the mirrored objects below show through it.
    this.base = refractiveMesh(this.shelfShape.geometry, refractiveGlass('shelf', { thick: this.thick }));
    this.base.renderOrder = 1;
    this.shelf.add(this.base);
    this.shelf.hitMeshes.push(this.base);
    // Its depth, drawn first: the mirror images only show where the shelf
    // is in front of them (they lie below its top, as a reflection does).
    // Nudged back a hair so the shelf's own glass never fights it.
    this.mask = new THREE.Mesh(this.base.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }));
    this.mask.renderOrder = -2;
    this.shelf.add(this.mask);

    // Light. The objects are lit by the room plus soft boxes (an environment
    // made once, on first draw, see objectEnvironment) and a key light up
    // and to the left; all of it turns with the Dock. The key casts shadows
    // when the renderer has shadow maps on: the roof's shade on the walls,
    // the hub's on the gear.
    this.objectMaterials = new Set();
    for (const icon of this.icons) icon.object.traverse(m => {
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      this.objectMaterials.add(m.material);
    });
    this.key = new THREE.DirectionalLight(new THREE.Color(...O.key.color), O.key.intensity);
    this.key.position.set(...O.key.dir).normalize().multiplyScalar(0.5);
    this.key.castShadow = true;
    const reach = this.plateLength(this.icons.length, P.maxSize) / 2 + this.side * P.maxSize;
    Object.assign(this.key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.05, far: 1.2 });
    this.key.shadow.mapSize.set(O.shadow.size, O.shadow.size);
    this.key.shadow.bias = O.shadow.bias;
    this.key.shadow.normalBias = O.shadow.normalBias * this.side;
    this.key.shadow.radius = O.shadow.radius;
    this.level.add(this.key, this.key.target);
    // The press glow lights what is inside the bubble: a small warm light at
    // the bottom of the dent, so the pressed object brightens where the
    // finger is (the list bubble's bloom, falling on a real object). One
    // light, always there (adding one later would rebuild every shader),
    // dark until something is pressed; it casts no shadow.
    this.pressLight = new THREE.PointLight(new THREE.Color(...DEFAULTS.look.emboss.glow.color), 0, 0, 2);
    this.level.add(this.pressLight);
    this.icons[0].object.traverse(m => {
      if (m.isMesh && !this.envHook) {
        this.envHook = m;
        m.onBeforeRender = (renderer, scene) => this.lightObjects(renderer, scene);
      }
    });

    // Reflections: each object mirrored in the shelf's top face (a planar
    // mirror), faint, as clear glass reflects only a few percent face-on,
    // and fading with depth below the glass.
    this.fade = { uFadePlane: { value: new THREE.Vector4() }, uFadeLen: { value: this.side * S.fade } };
    this.mirrors = this.icons.map(icon => {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      const c = icon.object.clone();
      c.traverse(m => {
        if (!m.isMesh) return;
        m.material = mirrorMaterial(m.material, S.reflection, this.fade);
        this.objectMaterials.add(m.material);
        m.castShadow = m.receiveShadow = false;
        m.renderOrder = -1;   // after the shelf's depth mask, before the objects (see mirrorMaterial)
        m.raycast = () => {};
      });
      g.add(c);
      this.level.add(g);
      return g;
    });
    // Each mirror's materials, to fade with its app (see present()).
    this.mirrors.forEach(g => g.traverse(m => { if (m.isMesh) m.material.userData.opacity = m.material.opacity; }));
    // An app fading in or out is see-through, but only its front should
    // show, not its insides (the parts behind its face): a depth-only copy,
    // drawn first while it fades, hides them.
    const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.icons.forEach(icon => {
      const c = icon.object.clone();
      c.traverse(m => { if (m.isMesh) { m.material = depthOnly; m.castShadow = m.receiveShadow = false; m.raycast = () => {}; } });
      c.visible = false;
      icon.object.parent.add(c);
      icon.userData.depth = c;
    });
    // Contact shadow: the shade each object casts on the glass right under
    // it, the shape of its footprint, so it reads as standing on the shelf.
    this.contacts = this.icons.map(icon => {
      const f = icon.footprint;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(f.x * S.contact.size, f.z * S.contact.size), new THREE.MeshBasicMaterial({
        map: softTexture(), color: 0x000000, opacity: S.contact.opacity, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 1.4;   // on the shelf glass
      this.level.add(m);
      return m;
    });
    // Running indicator: a small light on the shelf in front of a running
    // app, glowing like the lookdev's emissive run light (a soft halo that
    // adds light, so it reads as lit rather than painted).
    this.dots = o.apps.map(app => {
      if (!app.running) return null;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(dmm(2.5), 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true }));
      dot.scale.y = 0.5;
      dot.renderOrder = 3.5;   // drawn with the glass (transparent), after the mirror images, which would otherwise draw over it from below the shelf
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: new THREE.Color(...S.runGlow.color), opacity: S.runGlow.opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      glow.scale.setScalar(dmm(S.runGlow.size));
      glow.renderOrder = 4;   // over the shelf glass
      glow.userData.glow = true;
      dot.glow = glow;
      this.level.add(dot, glow);
      return dot;
    });
    this.scales = this.icons.map(() => 1);
    this.layout();
  }

  // On first draw: the objects' environment (needs the renderer), then
  // kept turned with the Dock.
  lightObjects(renderer, scene) {
    const O = DEFAULTS.look.dockObjects;
    if (this.envRoom !== scene.environment) {
      this.envRoom = scene.environment;
      const env = objectEnvironment(renderer, scene.environment, scene.environmentRotation, O.boxes, O.roomLight);
      for (const m of this.objectMaterials) { m.envMap = env; m.envMapIntensity = O.envIntensity; m.needsUpdate = true; }
    }
    const yaw = this.envYaw ?? 0;
    for (const m of this.objectMaterials) m.envMapRotation.set(0, yaw, 0);
  }

  // A point on the dock's arc: s along the arc, t toward the user. The arc
  // curves toward the user around a point arcR in front of the icons.
  arc(s, t = 0) {
    const A = this.arcR, R = A - t, a = s / A;
    return [R * Math.sin(a), A - R * Math.cos(a), -a];
  }

  // A point's place on the arc: s along it, t toward the user (arc's inverse).
  arcCoords(p) {
    const A = this.arcR;
    return [A * Math.atan2(p.x, A - p.z), A - Math.hypot(p.x, A - p.z)];
  }

  // Row and plate length for c apps (c is fractional while one is added or
  // taken out) at size z. The handles (pad) keep their length at any size.
  rowWidth(c = this.icons.length) {
    return this.pitch * (c - 1) + this.side;
  }

  plateLength(c, z = 1) {
    return this.rowWidth(c) * z + this.pad * 2;
  }

  // Apps in the Dock: the first k of o.apps (until apps can be pinned at
  // run time). The plate lengthens or shortens by itself to fit them, and
  // the app forms in the room that opens at the right end.
  showApps(k) {
    this.count.target = clamp(Math.round(k), 1, this.icons.length);
  }

  layout() {
    const S = DEFAULTS.look.dockShelf, P = DEFAULTS.look.dockPlate, B = DEFAULTS.look.dockBubble;
    const top = this.top, n = this.icons.length;
    // c apps' worth of plate: the first k whole, the next forming in the
    // room (f of a slot) that opens at the right end. The row stays centred
    // on the plate, so the opening is shared: the apps already there move
    // left by half of it as the right end moves out.
    // At size z every app (and the gaps, and the plate's depth) is z times
    // its size; held past the limits, only the plate goes on (raw).
    const c = clamp(this.count.x, 1, n), raw = this.sizing.x;
    const k = Math.floor(c + 1e-6), f = c - k;
    const z = this.size = clamp(raw, ...this.sizeRange);
    this.length = this.plateLength(c, raw);
    const tip = this.length / 2;
    this.presence = this.icons.map((_, i) => i < k ? 1 : i === k ? smoothstep(P.appear[0], P.appear[1], f) : 0);
    this.restX = this.icons.map((_, i) => (i - (c - 1) / 2) * this.pitch * z);
    // The forming app rides the right end, as far in from it as a whole
    // app stands, until its own place catches up with it.
    if (k < n) this.restX[k] = Math.min(this.restX[k], tip - this.pad - this.side * z / 2);
    this.icons.forEach((icon, i) => {
      const e = this.presence[i];
      this.present(i, e);
      if (!e) return;
      const s = this.scales[i] * z * (B.from + (1 - B.from) * e);
      const sx = this.restX[i];   // in place: a magnified app grows into the gaps
      // Standing on the plate's middle line, turned to face the user.
      const [px, pz, yaw] = this.arc(sx, 0);
      icon.scale.setScalar(s);
      icon.position.set(px, top, pz);
      icon.rotation.y = yaw;
      icon.updateMatrix();
      icon.holder.updateMatrix();
      this.mirrors[i].matrix.copy(mirrorY(top)).multiply(icon.matrix).multiply(icon.holder.matrix);
      this.contacts[i].position.set(px, top + 0.0002, pz);
      this.contacts[i].rotation.z = yaw;
      this.contacts[i].scale.setScalar(s);
      // Lighter as the object rises into its bubble.
      this.contacts[i].material.opacity = S.contact.opacity * e * (1 - 0.8 * Math.min(1, icon.hover));
      if (this.dots[i]) {
        const t = this.side * S.depth * 0.4 * z;
        const [dx, dz] = this.arc(sx, t);
        this.dots[i].position.set(dx, top + this.shelfShape.heightAt(t / z) * this.neck * z + 0.0006, dz);
        this.dots[i].glow.position.copy(this.dots[i].position);
        this.dots[i].material.opacity = e;
        this.dots[i].glow.material.opacity = S.runGlow.opacity * e;
      }
    });
    // Held past the smallest or largest size, the plate thins as it
    // lengthens and fattens as it shortens, as a bubble keeps its volume.
    this.neck = (this.plateLength(c, z) / this.length) ** P.neck;
    const swell = P.swell * Math.max(0, this.grip.hover.x);
    const scale = Math.abs(this.shelf.getWorldScale(new THREE.Vector3()).y);
    const depth = Math.max(this.plateContactDent.x, this.plateDent.x);
    const dent = depth > 0 ? { point: this.plateDentAt, depth: depth / scale, radius: DEFAULTS.handInput.plateDentRadius / scale } : null;
    this.shelfShape.fit(this.length, this.arcR, { neck: this.neck, size: z, swell: [this.grip.side < 0 ? swell : 0, this.grip.side > 0 ? swell : 0], dent });
  }

  plateSample(point) {
    const [s, t] = this.arcCoords(point), half = this.length / 2;
    const scale = this.neck * this.size, depth = this.shelfShape.depth / 2 * scale;
    const inside = Math.abs(s) >= half - this.pad && Math.abs(s) <= half && Math.abs(t) <= depth;
    const inset = Math.max(0, Math.min(depth - Math.abs(t), half - Math.abs(s)));
    return { s, inside, front: this.shelfShape.top(inset / scale) * scale };
  }

  plateDistance(point) {
    const sample = this.plateSample(point);
    return sample.inside ? Math.max(0, point.y - sample.front) * Math.abs(this.shelf.getWorldScale(new THREE.Vector3()).y) : Infinity;
  }

  // App i at presence e (0 hidden, 1 whole): it forms as the plate opens
  // room for it, fading in from a little smaller (never from nothing), and
  // takes no hands until it is whole.
  present(i, e) {
    const icon = this.icons[i], was = icon.userData.presence ?? 1;
    icon.visible = this.mirrors[i].visible = this.contacts[i].visible = e > 0;
    if (this.dots[i]) this.dots[i].visible = this.dots[i].glow.visible = e > 0;
    icon.enabled = e >= 1;
    icon.userData.depth.visible = e > 0 && e < 1;
    if (e === was) return;
    icon.userData.presence = e;
    const fade = (m, base) => {
      const clear = e < 1;
      if (m.transparent !== clear) { m.transparent = clear; m.needsUpdate = true; }
      m.opacity = base * e;
    };
    icon.object.traverse(m => {
      if (!m.isMesh) return;
      m.material.userData.opacity ??= m.material.opacity;
      fade(m.material, m.material.userData.opacity);
      m.castShadow = e > 0.5;
    });
    this.mirrors[i].traverse(m => { if (m.isMesh) m.material.opacity = m.material.userData.opacity * e; });
  }

  // The plate's ends are handles (see the header). Hands near an end take
  // it from the apps; a pinch or a press there grabs it.
  grabPlate(dt) {
    const P = DEFAULTS.look.dockPlate;
    const probes = this.shelf.consumeProbes();
    const tip = this.length / 2;
    const grip = this.grip;
    let near = null, nearD = Infinity;
    for (const p of probes) {
      const [s] = this.arcCoords(p.point);
      // Distance to the end: the stretch of plate past the last app.
      const sample = this.plateSample(p.point);
      const dist = p.kind === 'ray' ? (sample.inside ? 0 : Infinity) : Math.max(0, this.plateDistance(p.point) - (p.radius ?? 0));
      if (dist < nearD) { nearD = dist; near = { p, s }; }
      if (grip.held?.id === p.id) grip.held.probe = { p, s };
    }
    const press = this.shelf.press;
    const { probe } = pickProbe(probes, p => p.kind === 'ray' ? (this.plateSample(p.point).inside ? 0 : Infinity) : this.plateDistance(p.point), press.pressed ? this.shelf.pressOwner : null);
    const sample = probe && this.plateSample(probe.point);
    const scale = Math.abs(this.shelf.getWorldScale(new THREE.Vector3()).y);
    const front = press.pressed ? this.plateFront : sample?.front;
    const penetration = !probe ? null : probe.kind === 'poke'
      ? (front - probe.point.y) * scale + (probe.radius ?? 0) + (probe.pressOffset ?? 0)
      : probe.pressed && probe.captured ? press.maxDepth : -Infinity;
    if (!press.pressed && this.plateProbeId !== probe?.id) press.lastPenetration = null;
    this.plateProbeId = probe?.id;
    const resizeOwner = grip.held?.id === probe?.id && (probe?.pinch || probe?.captured);
    const event = press.update(dt, penetration, !!sample?.inside || !!resizeOwner);
    if (event === 'press') {
      this.plateFront = sample.front; this.shelf.pressOwner = probe.id; this.shelf.pressKind = probe.kind;
    }
    // The early input offset supplies feedback before contact, not full
    // visual compression. Actual pressure must still have travel left.
    const physicalDepth = press.pressed && probe ? probe.kind === 'poke'
      ? Math.min(press.maxDepth, .0003 + Math.max(0, penetration - (probe.pressOffset ?? 0)))
      : press.maxDepth : 0;
    if (physicalDepth >= this.plateContactDent.x) { this.plateContactDent.x = physicalDepth; this.plateContactDent.v = 0; }
    else springTo(this.plateContactDent, physicalDepth, DEFAULTS.look.emboss.dent.response,
      prefersReducedMotion() ? 1 : DEFAULTS.look.emboss.dent.damping, dt);
    if (probe && (press.pressed || grip.held)) grip.at.copy(probe.point);
    // Holding: the end follows the hand along the arc.
    if (grip.held) {
      const h = grip.held, still = h.probe && (h.probe.p.pinch || h.probe.p.captured);
      if (still) {
        // The length the hand asks for, rubber-banded past the smallest and
        // largest size (Apple's constant 0.55 over one app's length), and
        // the size that gives the apps there are.
        const c = this.count.x, [lo, hi] = this.sizeRange.map(z => this.plateLength(c, z));
        let L = (h.half + grip.side * (h.probe.s - h.s0)) * 2;
        if (L > hi) L = hi + rubberband(L - hi, this.pitch, P.rubber);
        if (L < lo) L = lo - rubberband(lo - L, this.pitch, P.rubber);
        const z = (L - this.pad * 2) / this.rowWidth(c);
        grip.history.push([this.time, z]);
        while (grip.history.length > 2 && grip.history[grip.history.length - 1][0] - grip.history[0][0] > 0.1) grip.history.shift();
        this.sizing.x = z;
        const [t0, z0] = grip.history[0], [t1, z1] = grip.history[grip.history.length - 1];
        this.sizing.v = t1 > t0 ? (z1 - z0) / (t1 - t0) : 0;
        grip.at.copy(h.probe.p.point);
        h.probe = null;
      } else {
        grip.held = null;
        grip.history.length = 0;
        // Settle where the pull was heading: where its speed would have
        // carried it (Apple's projection, deceleration 0.99 per ms), kept
        // within the sizes. No snapping: any size in between is a size.
        const ahead = this.sizing.x + this.sizing.v * 0.001 * P.decelerate / (1 - P.decelerate);
        this.sizing.target = clamp(ahead, ...this.sizeRange);
      }
    }
    // Not holding: settle with the hand's speed (velocity handoff).
    if (!grip.held) {
      const calm = prefersReducedMotion();
      springTo(this.sizing, this.sizing.target, P.settle.response, calm ? 1 : P.settle.damping, dt);
      if (Math.abs(this.sizing.x - this.sizing.target) < 1e-4 && Math.abs(this.sizing.v) < 1e-3) { this.sizing.x = this.sizing.target; this.sizing.v = 0; }
    }
    // Hover: a hand near an end, or a ray on it.
    const hovered = grip.held ? true : this.gripBand.update(nearD);
    if (!grip.held && near && hovered) {
      grip.side = Math.sign(near.s) || 1;
      grip.at.copy(near.p.point);
      const grab = near.p.kind === 'poke' ? near.p.pinch && nearD <= this.gripBand.enter * P.reach : near.p.captured && nearD === 0;
      if (grab) grip.held = { id: near.p.id, s0: near.s, half: tip, probe: null };
    }
    springTo(grip.hover, grip.held ? 1 : hovered ? P.glow.hover / P.glow.grab : 0, 0.15, 1, dt);
    this.shelf.grab = grip.held;
    // Pinch/ray capture can start above the skin. Its held feedback must
    // still dent the actual geometry; physical pressing can deepen it.
    // Physical pressure follows the input immediately in layout. Only the
    // above-skin hold floor springs in/out, at the last owner contact point.
    if (press.pressed || grip.held) this.plateDentAt.copy(grip.at);
    springTo(this.plateDent, grip.held ? DEFAULTS.handInput.plateHoldDent : 0,
      DEFAULTS.look.emboss.dent.response, prefersReducedMotion() ? 1 : DEFAULTS.look.emboss.dent.damping, dt);
    // An end merely being nearby cannot take another icon's input. The
    // input system now ranks this handle alongside the actual app skins.
    this.gripping = !!grip.held || press.pressed;
    // The glass lights where it is held, in the press glow's colour.
    const u = this.base.material.uniforms;
    this.shelf.updateMatrixWorld();
    const w = this.shelf.localToWorld(grip.at.clone());
    u.uTouch.value.set(w.x, w.y, w.z, this.pad * P.glow.radius);
    u.uTouchGlow.value.setRGB(...DEFAULTS.look.emboss.glow.color).multiplyScalar(P.glow.grab * Math.max(0, grip.hover.x, press.pressed ? 1 : press.amount));
  }

  /**
   * @param {number} dt
   * @param {THREE.Object3D} head  the camera
   * @param {THREE.Vector3[]} hands  world points of fingertips / ray hits
   */
  resetPlacement() {
    this.rail.reset(); this.grip.held = this.shelf.grab = null;
    for (const h of [this.handle, this.shelf, ...this.icons]) { h.probes = []; h.press.update(0, null, false); }
  }

  update(dt, head, hands = []) {
    const placing = this.rail.update(head, dt);
    const offset = this.rail.position.clone().sub(this.rail.anchor);
    const yaw = Math.atan2(-offset.x, -offset.z);
    const ecc = this.eccentricity = Math.atan2(offset.y, Math.hypot(offset.x, offset.z));
    this.position.copy(this.rail.position);
    this.rotation.set(ecc, yaw, 0);
    this.level.rotation.x = -ecc;
    this.updateMatrixWorld();
    this.handle.update(dt);

    // The plate's handles first: a hand on one is not reaching for an app.
    this.time = (this.time ?? 0) + dt;
    this.grabPlate(dt);
    // An app added or taken out: the plate fits it by itself, critically
    // damped (no gesture threw it, so nothing to overshoot with).
    const fit = DEFAULTS.look.dockPlate.fit;
    springTo(this.count, this.count.target, fit.response, fit.damping, dt);
    if (Math.abs(this.count.x - this.count.target) < 1e-4 && Math.abs(this.count.v) < 1e-3) { this.count.x = this.count.target; this.count.v = 0; }
    this.layout();
    // Magnify from the nearest hand, measured to each icon's rest position.
    const inv = new THREE.Matrix4().copy(this.level.matrixWorld).invert();
    const local = this.gripping || placing ? [] : hands.map(h => h.clone().applyMatrix4(inv));
    // Once a finger is close enough to form an app's bubble, the app holds
    // its size: a finger nearer than that, or pressing in, counts as at that
    // distance (the press makes the app give way, never swell).
    for (const p of local) this.icons.forEach((icon, i) => {
      if (this.presence[i] < 1) return;
      const s = this.scales?.[i] ?? 1;
      const c = icon.position.clone().add(new THREE.Vector3(0, icon.rb * s, 0));
      const r = (icon.rb + icon.hoverBand.enter) * s;
      if (p.distanceTo(c) < r) p.sub(c).setLength(r).add(c);
    });
    const want = this.restX.map(x => {
      let s = 1;
      for (const p of local) {
        const d = Math.hypot(p.x - x, p.y, Math.max(0, p.z));
        s = Math.max(s, magnifyScale(d, this.radius, this.maxScale));
      }
      return s;
    });
    this.scaleState ??= want.map(x => ({ x, v: 0 }));
    this.scales = want.map((s, i) => Math.max(1, springStep(this.scaleState[i], s, this.magnifyOmega, dt)));
    // One bubble at a time: only the app nearest the finger may show one,
    // so a finger between two never lights both.
    // (Apps not yet whole on the plate take no hands.)
    const near = this.icons.map((icon, i) => this.presence[i] >= 1 ? icon.sense() : (icon.consumeProbes(), icon.best = null, Infinity));
    const nearest = this.gripping || placing ? -1 : nearestApp(this.icons, near);
    this.icons.forEach((icon, i) => { icon.exclusive = i === nearest; icon.update(dt); });
    this.layout();
    this.lightPress();
    // The mirror images fade with depth below the shelf's top (world plane).
    this.shelf.updateMatrixWorld();
    const n = new THREE.Vector3(0, 1, 0).transformDirection(this.shelf.matrixWorld);
    this.fade.uFadePlane.value.set(n.x, n.y, n.z, -n.dot(new THREE.Vector3().setFromMatrixPosition(this.shelf.matrixWorld)));
    this.envYaw = yaw;
  }

  // The skins' highlight comes from the objects' key light, wherever the
  // Dock has turned; the press light sits in the pressed bubble's dent.
  lightPress() {
    const B = DEFAULTS.look.dockBubble;
    this.level.updateMatrixWorld(true);
    const dir = new THREE.Vector3().setFromMatrixPosition(this.key.matrixWorld)
      .sub(new THREE.Vector3().setFromMatrixPosition(this.key.target.matrixWorld)).normalize();
    let pressed = null;
    for (const icon of this.icons) {
      icon.skin.uKeyDir.value.copy(dir);
      if (icon.skin.uGlow.value > (pressed?.skin.uGlow.value ?? 0)) pressed = icon;
    }
    const L = this.pressLight;
    if (!pressed) { L.intensity = 0; return; }
    const at = pressed.dentAt.clone().multiplyScalar(pressed.bubble.scale.x - Math.max(0, pressed.dent.x)).add(pressed.centre);
    L.position.copy(this.level.worldToLocal(pressed.localToWorld(at)));
    // B.pressLight is the light's strength at the bubble's radius from it.
    const scale = pressed.getWorldScale(new THREE.Vector3()).x;
    L.intensity = B.pressLight * pressed.skin.uGlow.value * (pressed.rb * scale) ** 2;
  }
}

// The plate: a solid bubble w long (along the arc) and d deep. Its outline
// is a stadium (round ends); across its depth it is a cushion: the edge
// rolls round in a full curve, the top domes gently to a crown under the
// apps (y = 0), and the underside swells a little less. Built flat once,
// at its longest, as rings stepping in from the edge (finer at the edge,
// where it turns fastest) with fine steps along it, so it bends smoothly
// round the arc. fit() then sets its length (stretching the straight
// middle, carrying the round ends), its neck and its ends' swell, and bends
// it: one pass over the vertices.
class PlateGeometry {
  constructor(w, d, { edge, crown, under }) {
    const half = d / 2, a = w / 2 - half;
    const rings = 28, arcSteps = 28, straight = Math.max(8, Math.ceil(2 * a / (d / 16)));
    this.depth = d;
    this.edge = edge; this.crown = crown; this.under = under;
    const roll = Math.min(edge + under, half * 0.6);   // the edge's curve, in from the rim
    // Height of the top and the underside at δ in from the rim.
    const curve = δ => δ >= roll ? 1 : Math.sqrt(1 - (1 - δ / roll) ** 2);
    const dome = δ => 1 - (1 - Math.min(δ, half) / half) ** 2;
    this.top = δ => edge * curve(δ) + crown * dome(δ) - (edge + crown);
    const bottom = δ => -(under * curve(δ) + under * 0.6 * dome(δ)) - (edge + crown);
    // One ring: the stadium ρ in from the rim, as a loop of points.
    const loop = ρ => {
      const r = half - ρ, pts = [];
      for (let i = 0; i < straight; i++) pts.push([a - 2 * a * i / straight, r]);          // the far side, right to left
      for (let i = 0; i < arcSteps; i++) { const q = Math.PI / 2 + Math.PI * i / arcSteps; pts.push([-a + Math.cos(q) * r, Math.sin(q) * r]); }
      for (let i = 0; i < straight; i++) pts.push([-a + 2 * a * i / straight, -r]);        // the near side
      for (let i = 0; i < arcSteps; i++) { const q = -Math.PI / 2 + Math.PI * i / arcSteps; pts.push([a + Math.cos(q) * r, Math.sin(q) * r]); }
      return pts;
    };
    const K = 2 * straight + 2 * arcSteps;
    const pos = [], index = [];
    // Rows: the top from rim to spine, then the underside from spine back
    // to the rim (the rim row is shared, so the edge closes).
    const steps = [];
    for (let j = 0; j <= rings; j++) steps.push(half * (j / rings) ** 1.6);
    const rows = [...steps.map(δ => [δ, this.top(δ)]), ...[...steps].reverse().slice(0, -1).map(δ => [δ, bottom(δ)])];
    rows.push([0, this.top(0)]);   // back to the rim, closing the loop of rows
    for (const [δ, y] of rows) for (const [x, z] of loop(δ)) pos.push(x, y, -z);
    const R = rows.length;
    for (let j = 0; j < R - 1; j++) for (let i = 0; i < K; i++) {
      const p = j * K + i, q = j * K + (i + 1) % K, r = (j + 1) * K + i, t = (j + 1) * K + (i + 1) % K;
      index.push(p, q, r, q, t, r);   // wound so the outside faces out
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(index);
    g = mergeVertices(g, 1e-7);
    g.computeVertexNormals();
    this.flatP = g.attributes.position.array.slice();
    this.flatN = g.attributes.normal.array.slice();
    this.w = w; this.end = half;
    this.geometry = g;
  }

  // The top's height t toward the user from the middle line (for things
  // set on it, like the run lights).
  heightAt(t) {
    return this.top(Math.max(0, this.depth / 2 - Math.abs(t)));
  }

  fit(w, R, { neck = 1, size = 1, swell = [0, 0], dent = null } = {}) {
    const key = [w, R, neck, size, swell[0], swell[1], dent?.depth, dent?.point.x, dent?.point.z].join();
    if (this.fitKey === key) return;
    this.fitKey = key;
    const g = this.geometry, p = g.attributes.position.array, n = g.attributes.normal.array;
    const F = this.flatP, FN = this.flatN;
    const end = this.end * size;   // the round ends grow with the plate's depth
    const hw0 = this.w / 2 - this.end, hw = w / 2 - end;
    const mid = -(this.edge + this.crown);   // the rim's plane: an end swells about it
    for (let i = 0; i < p.length; i += 3) {
      // Stretch the middle, carry the round ends out with it.
      let x = F[i];
      x = Math.abs(x) <= hw0 ? x * hw / hw0 : Math.sign(x) * (hw + (Math.abs(x) - hw0) * size);
      // Swell at an end held or hovered: most at its tip.
      const u = Math.abs(x) - (hw - end);
      const s = u > 0 ? (x < 0 ? swell[0] : swell[1]) * smoothstep(0, 2 * end, u) : 0;
      const ky = neck * size * (1 + s), kz = neck * size;
      const y = ((F[i + 1] - mid) * (1 + s) + mid) * neck * size, z = F[i + 2] * kz;
      // Normals under the scale: divide by it, then renormalise.
      let nx = FN[i], ny = FN[i + 1] / ky, nz = FN[i + 2] / kz;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      // Bend: x runs along the arc, z (toward the user) toward its centre.
      const a = x / R, c = Math.cos(a), sn = Math.sin(a), r = R - z;
      p[i] = r * sn; p[i + 1] = y; p[i + 2] = R - r * c;
      n[i] = nx * c - nz * sn; n[i + 1] = ny; n[i + 2] = nx * sn + nz * c;
      if (dent && ny > 0) {
        const dx = p[i] - dent.point.x, dz = p[i + 2] - dent.point.z, rr = dent.radius ** 2;
        const dip = dent.depth * Math.exp(-(dx * dx + dz * dz) / rr);
        p[i + 1] -= dip;
        n[i] -= 2 * dx * dip / rr; n[i + 2] -= 2 * dz * dip / rr;
        const length = Math.hypot(n[i], n[i + 1], n[i + 2]);
        n[i] /= length; n[i + 1] /= length; n[i + 2] /= length;
      }
    }
    g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true;
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Apple's rubber band: past a limit, each step further moves it less.
const rubberband = (over, dimension, k) => (over * dimension * k) / (dimension + k * Math.abs(over));
// Which app may react: one being pressed keeps it until its press ends (a
// ray or hand passing over a neighbour can't take it); otherwise the nearest,
// and of apps that are all hit by a ray (distance 0) the one whose pinch
// began on it.
export function nearestApp(icons, near) {
  const held = icons.findIndex(icon => icon.press.pressed && (icon.pressKind !== 'poke'
    || icon.best && icon.retainsPokeCapture(icon.best.point, icon.best.radius, icon.best.surfaceCrossing)));
  if (held >= 0) return held;
  let best = 0;
  for (let i = 1; i < near.length; i++) {
    if (near[i] < near[best] || (near[i] === near[best] && icons[i].best?.captured && !icons[best].best?.captured)) best = i;
  }
  return best;
}

// Reflection in the horizontal plane y = h.
function mirrorY(h) {
  return new THREE.Matrix4().makeTranslation(0, h, 0)
    .multiply(new THREE.Matrix4().makeScale(1, -1, 1))
    .multiply(new THREE.Matrix4().makeTranslation(0, -h, 0));
}

// A faint copy of an object's material for its reflection in the shelf:
// drawn only below the shelf's top (GreaterDepth against the shelf's
// depth), fading with depth below it. Glass parts stay clear (no
// transmission pass for a reflection).
function mirrorMaterial(src, opacity, fade) {
  const m = src.clone();
  // Drawn in the opaque pass, before the objects (renderOrder -1, after the
  // shelf's depth mask at -2), blending by hand: drawn after them, its test
  // against the shelf's depth also passed wherever an object stood in front
  // (the lens's mirrored rim showed across the lens).
  Object.assign(m, { transparent: false, opacity: (src.opacity ?? 1) * opacity, depthWrite: false, depthFunc: THREE.GreaterDepth,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  if (m.transmission) { m.transmission = 0; m.opacity *= 0.3; }
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, fade);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMirrorWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMirrorWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMirrorWorld;\nuniform vec4 uFadePlane;\nuniform float uFadeLen;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= exp(-max(0.0, -(dot(uFadePlane.xyz, vMirrorWorld) + uFadePlane.w)) / uFadeLen);');
  };
  m.customProgramCacheKey = () => 'contour-mirror';
  return m;
}
