// Values the components need that tokens.json does not define yet.
// Everything else comes from tokens.json. Each entry here is a candidate
// token: once it is agreed, move it into tokens.json and delete it here.
export const DEFAULTS = {
  // Distance the UI is placed from the eyes, used to turn dmm into metres.
  // Proposed token: placement.distance.near (arm's reach for poke).
  distance: 0.6, // m

  // Hover fade out. Only motion.hover.in exists; out mirrors it for now.
  hoverOutSameAsIn: true,

  // Layout follows Apple's visionOS 26 kit, converted with 1 pt ≈ 0.73 dmm
  // (Apple's stated 60 pt ≈ 4.4 cm at 1 m; see the research notes, 5b).

  // Corner radii in dmm. Proposed: shape.radius.{window,row,control}.
  radius: { window: 34, row: 15, control: 12 }, // 46 / 20 / 16 pt

  // Packaging panel layout in dmm (docs/catalog-spec.md).
  // Proposed: size.panel.*, size.row.*.
  panelWidth: 240, // ≈ 330 pt
  rowHeight: 48, // hit size: the proposed size.target.hit.min (44–48)
  panelPadding: 18, // sides, ≈ 24 pt
  panelPadTop: 19,
  panelPadBottom: 8,
  rowInset: 7, // row lens inset from the window edge
  badge: 26, // icon bead, ≈ 36 pt
  badgeGlyph: 14,
  badgeGap: 9, // bead to label
  chevron: 11,
  subtitleGap: 3, // title to subtitle
  headerGap: 12, // header to list

  // Type ramp: size in dmm, weight, tracking in em. Apple's visionOS kit:
  // LargeTitle 29 pt Bold, Headline 17 pt Bold, Body 17 pt Medium,
  // Callout 15 pt Semibold, Footnote 13 pt Medium; nothing lighter than
  // Medium. Inter runs a little heavy, so Bold becomes Semibold for rows.
  // Proposed: type.{title,headline,body,subheadline,footnote}.
  type: {
    title: { size: 21, weight: 700, tracking: -0.01 },
    headline: { size: 12.4, weight: 600, tracking: 0 },
    body: { size: 12.4, weight: 500, tracking: 0 },
    subheadline: { size: 11, weight: 500, tracking: 0 },
    footnote: { size: 9.5, weight: 500, tracking: 0.01 },
  },
  // Text emphasis as white at an opacity, not grey (vibrancy).
  // Chosen for contrast on glass (docs/catalog-spec.md): secondary text 4.5:1,
  // tertiary graphics (chevrons) 3:1.
  emphasis: { primary: 1, secondary: 0.9, tertiary: 0.5 },

  // Dock: how far the body has to turn before the dock starts its lazy follow.
  // Without a dead zone every small head movement restarts the delay timer.
  // Proposed: anchor.follow.threshold.
  followThreshold: 20, // deg
  // Body-lock distance of the dock. Proposed: anchor.distance.
  dockDistance: 0.55, // m

  // Appearance. Proposed: a look.* token group once tested in MR.
  look: {
    bevelRatio: 0.28, // edge bevel as a fraction of thickness
    shadeBottom: 0.86, // vertex shade at the bottom edge (top = 1)
    rimStrength: 0.16, // luminous edge brightness
    // Glass (docs/catalog-spec.md), matched to the path-traced reference in
    // lookdev/. blur and reflBlur are prefiltered roughness (0..1); absorb is
    // the absorption density (1/m, Beer-Lambert) and albedo the glass colour;
    // maxLum is the brightest the glass may get (linear luminance) before the
    // adaptive scrim darkens it.
    glass: {
      blur: 0.36, reflBlur: 0.16, absorb: 40, ior: 1.45, f0: 0.04,
      frostScale: 0.0007, // m: size of the etched bumps on the face
      // Per kind: colour, brightest luminance (keeps secondary text at
      // 4.5:1), rim darkening, frost bump depth, grain, milky veil, key light.
      window: { albedo: [0.72, 0.695, 0.66], maxLum: 0.19, edge: 0.15, frost: 0.03, grain: 0.04, veil: 0, key: 0.55 },
      lens: { albedo: [0.56, 0.55, 0.54], maxLum: 0.1, edge: 0.3, frost: 0.02, grain: 0.03, veil: 0, key: 0.8 },
      tileNeutral: [0.46, 0.46, 0.49], // grey app tiles (Settings): a grey glass, not clear
      bead: { albedo: [0.9, 0.9, 0.91], maxLum: 0.2, edge: 0.6, frost: 0, grain: 0.02, veil: 0.02, key: 0.9 },
    },
    // Refractive glass (core/refract.js), matched to the Principled glass in
    // lookdev/dock_slider.py. color: transmission tint (linear); attColor /
    // attDist: Beer-Lambert absorption (attColor left after attDist metres);
    // rough: surface roughness (0.4 = frosted); coat: clear coat; scatter:
    // light scattered inside in the glass's own colour (milky glass);
    // caustic: focused key light on the far side; behind: how far past a
    // flat back face the bent ray looks (m); edgeDark: dark silhouette of a
    // rounded piece (the stem).
    refract: {
      // Past physical, by design (Jihoon, 2026-10-20: "reflection and
      // distortion should be larger"): reflection strength and how far the
      // bent ray strays from the straight one, x the physical value.
      reflect: 2.2, distort: 2.0,
      grabMargin: 0.6, // the frame copy around a glass reaches this far past it (fraction of its size): room for the refracted offset
      // The lookdev light rig: direction toward the light (three.js axes,
      // from the component), colour, strength, angular size.
      lights: {
        key: { dir: [-0.55, 1.4, 0.45], color: [1, 0.92, 0.82], intensity: 5, size: 0.1 }, // a little higher than the lookdev's (-0.7, 0.9, 0.5), so a globe's hotspot sits above its glyph instead of on it (judge round 4)
        rim: { dir: [-0.35, 0.35, -0.4], color: [1, 0.85, 0.65], intensity: 3, size: 0.1 },
      },
      amber: { behind: 0.002, distort: 1.8, emissiveRim: 1, edgeDark: 0, color: [1, 0.72, 0.4], attColor: [1, 0.5, 0.16], attDist: 0.025, rough: 0.05, coat: 1, coatRough: 0.1, caustic: 0.8, scatter: 0.02 },
      rod: { reflect: 2, coatRough: 0.3, edgeDark: 0.3, color: [1, 0.6, 0.28], attColor: [1, 0.42, 0.1], attDist: 0.006, rough: 0.05, coat: 1, scatter: 0.03 }, // the Z-Slider's stem: the same amber, seen edge to edge
      plate: { reflect: 1.6, edgeDark: 0.15, color: [1, 1, 1], attColor: [0.92, 0.91, 0.9], attDist: 0.012, rough: 0.03, coat: 1, coatRough: 0.02 }, // clear glass, as in the lookdev: the room shows through in its own colour and the rim catches the light (judge round 4: the greyed, frosted plate read as stone)
      label: { reflect: 2, edgeDark: 0, saturation: 0.7, color: [0.4, 0.39, 0.38], attDist: 1, rough: 0.12, coat: 1, coatRough: 0.02 }, // the Z-Slider's value label: the plate's glass, smoked so white text reads on it (visionOS vibrancy); it keeps most of the room's colour and has no dark rim, so it reads as smoked glass, not a grey plastic pill (judge round 4)
      tile: { rough: 0.12, roomDistort: 1, roomBlur: 0.1, rimSpec: 0, coatRough: 0.25, rimBlur: 0.015, coat: 1, diffuse: 0.05, transTint: 0.85, absorb: 1, luminance: 0.55, behind: 0.05, edgeDark: 0.5, distort: 1.6, glyphGlow: 1.0, glyphBloom: 0.35, neutralDepth: 0.85, color: [1, 1, 1] }, // a clear tinted glass globe: the room shows through it upside down (a ball lens; judge round 2 found the milky one opaque); the glyph hangs inside and glows; the room is seen bent as a real ball bends it (roomDistort 1) and only a little blurred (roomBlur), while the glyph keeps the stronger magnification (distort); rimSpec 0: the rim light lights the globe's edge but adds no second hotspot (judge round 4: two or three highlight blobs per globe); neutralDepth: a grey globe absorbs as if its tint were this bright, so it reads as smoked glass
      shelf: { color: [0.74, 0.76, 0.8], attColor: [0.74, 0.76, 0.8], attDist: 0.19, rough: 0.02, coat: 1 },
    },
    // Hovered row: 'lens' lifts a light glass lens out of the window by
    // lensLift; 'emboss' inflates the window's skin into a bubble under the
    // row, like a fluid-filled tactile display (Jihoon's reference).
    hoverStyle: 'emboss', // decided 2026-10-20 (Jihoon): the bubble is Contour's hover language
    lensLift: 5, // mm
    // Sizes in mm are as seen at `distance` (0.6 m) and grow with the
    // window's distance like dmm, so a far window's bubble and dent fill the
    // same angle in the eye.
    emboss: {
      height: 6, // mm at the crown; 4–6 reads as a bubble (Jihoon, lookdev/ pillow)
      ramp: 4, // mm: the meniscus where the window glass rises into the bubble
      // Press (Jihoon picked 'dent' in lookdev/ press-options): a finger-sized
      // dimple where the press lands, while the pillow around it stays full.
      squash: 0.15, // the pillow loses this fraction of its height when fully pressed
      // Dent profile: a bell curve (Gaussian). width is its diameter at half
      // depth; the visible dip (to 10% depth) is 1.82x that. depth is below the
      // pressed crown. Jihoon: 20 mm wide, deeper (2026-10-20).
      dent: { width: 20, depth: 4.5, shade: 2.2, shadow: 2.4, // shadow: inner shadow on the walls (Jihoon: must read deeper than the surface)
        response: 0.16, damping: 0.55 }, // mm, mm; s, ratio (springs back past flat once: the rebound)
      // Press glow (Jihoon: shape alone is not enough to see a press): light
      // blooms out from the press point, and the bubble's edge lights up as a
      // ring. The ring carries the state change (no text sits on it); the
      // bloom under the text stays under the legibility cap (maxLum).
      glow: { falloff: 40, bloomRadius: 25, ring: 0.45, // ring: brightest stretch, nearest the finger
        core: 0.5, coreRadius: 8, // the glow gathers at the press point (Jihoon: the press, not the whole bubble, glows)
        bloom: 0.06, color: [1, 0.97, 0.92] }, // mm: ring fades by 1/e every falloff from the press point, bloom radius; ring and bloom strength
      response: 0.32, damping: 0.62, // s, ratio: inflates with a small settle
      magnify: 0, // content under the bubble grows this much at full height (0: content holds still while the skin swells)
      gloss: 0.8, // how much smoother and shinier the inflated skin is
      clear: 0.25, // how far its glass thins toward an icon bead's clear glass
    },
    // Contact shadows between floating layers: softness grows with the gap,
    // and the shadow drops below the caster (light from above).
    contactShadow: { minSoft: 0.002, softPerGap: 0.7, dropPerGap: 0.35, child: 0.55, lens: 0.4 },
    // Icon badge: a glass bead this high (fraction of its diameter).
    beadHeight: 0.22,
    dockBeadHeight: 0.2, // Dock icons: a low dome (fuller domes read as candy marbles)
    // Z-Slider lamp (Jihoon, 2026-10-20: "lighting should be glow"; the joints
    // curved). fillet: joint length x the knob side, its flare x the stem
    // radius (a quarter ellipse, tangent to stem and plate). Glow scales
    // from min (at 0%) to 1 (at 100%): emissive light inside the amber glass,
    // the halo round the knob (size x the side), the warm pool it spills on
    // the plate round the stem's foot (spill, size x the side), the glow
    // round lit rings.
    // fillet: where the stem meets the plate and the knob (length x the
    // knob's size, flare x the stem's radius, shape: 2 a quarter ellipse,
    // lower swells sooner). The knob's is a long bell, so its curve shows
    // beside the knob instead of hiding behind it (judge round 3).
    lampGlow: { fillet: { plate: { length: 0.25, flare: 1, shape: 2 }, knob: { length: 0.85, flare: 1.2, shape: 1.3 } }, min: 0.45, emissive: { stem: 0.6, knob: 0.25 }, halo: { size: 2.2, opacity: 0.35 }, spill: { size: 1.8, opacity: 0.55 }, ring: 0.8, ringWidth: 1.2 },
    // The Z-Slider's value label: a capsule of the plate's glass, smoked
    // (refract.label), beside the plate (dmm), gap from its rim, thickness x
    // the plate's; the value larger and bolder than the name.
    valueLabel: { width: 100, height: 30, pad: 11, gap: 12, thickness: 0.5, name: { size: 13, weight: 600 }, value: { size: 17, weight: 700 } },
    // Shelf Dock (Jihoon, 2026-10-20: Snow Leopard style, curved for reach).
    // Proposed: dock.shelf.*. Lengths in dmm at the dock's distance.
    // lift: float height (dmm); depth: x icon side; thickness: glass mm;
    // reflection: mirrored icon strength, fading over fade x the icon side
    // below the glass (faint, as clear glass reflects; judge rounds 3 and 4
    // read a strong one as a second row of globes); mirrorBlur: how soft the mirror
    // image is (roughness, and the glyph's blur in mip levels); mirrorGlyph:
    // the mirrored glyph's strength x the real one's; mirrorShine:
    // the room's reflection on the mirrored globes, x their own (low, so the
    // image keeps the globe's colour instead of turning milky); contact: the soft shadow under
    // each globe (opacity, size x the icon side); arc: radius of the dock's
    // curve x its distance (0.75 at 0.56 m = 0.42 m, a little tighter than
    // the lookdev's 0.5 m so the curve reads at a glance; every icon is the
    // same reach away); hoverLift: how far the hovered globe rises (dmm, as
    // the lookdev); hoverSheen: light on the hovered globe's glass; caustic: the coloured light each globe focuses on the
    // glass under it; runGlow: the running light's halo (size in dmm).
    dockShelf: { lift: 10, depth: 1.7, thickness: 3, reflection: 0.8, mirrorBlur: { rough: 0.45, glyph: 4 }, mirrorGlyph: 0.35, mirrorShine: 0.3, contact: { opacity: 0.22, size: 0.8 }, fade: 0.4, arc: 0.75, hoverLift: 8, hoverSheen: 1.4, caustic: 0.35, runGlow: { color: [0.75, 0.88, 1], opacity: 0.5, size: 12 } },
    // Dock globe: glyph size before the glass magnifies it, x a flat icon's.
    globeGlyph: 0.56,
    // Text sits on glass with a faint shadow, so it reads as on the surface.
    textShadow: null, // no halos: text earns contrast from weight and the glass tone (visionOS vibrancy), not a CSS-style shadow
    separator: 0.08, // hairline between rows: white opacity
  },

  // Colours. Contour has no colour tokens yet (MR-first: colour is the open problem).
  color: {
    glassTint: 0x1b1c20, // glass where it doesn't show the room (and the MR fallback)
    window: 0x1e2025, // platters: neutral dark graphite, opaque (surface.opacity.base)
    control: 0x3e4047, // secondary buttons
    controlHover: 0x5a5c63,
    row: 0x5a5c63, // list row hover fill
    accent: 0x2f7cf6, // primary actions
    lampLit: 0xffa040, // lit detent rings, up to the value
    accentGlass: [0.22, 0.5, 1.7], // linear transmission of accent-tinted glass (primary buttons): the room shows through it blue; the scrim caps its brightness for white text
    metal: 0xc9ccd2, // Z-Slider knob
    plate: 0x34363c,
    glow: 0xffffff,
    text: '#ffffff',
    textSecondary: '#aeb2ba',
    textTertiary: '#80848c',
    disabled: 0x3a3c42,
    shadow: 0x000000,
  },
};
