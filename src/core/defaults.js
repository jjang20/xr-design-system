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
      bead: { albedo: [0.9, 0.9, 0.91], maxLum: 0.2, edge: 0.6, frost: 0, grain: 0.02, veil: 0.02, key: 0.9 },
    },
    // Hovered row: 'lens' lifts a light glass lens out of the window by
    // lensLift; 'emboss' inflates the window's skin into a bubble under the
    // row, like a fluid-filled tactile display (Jihoon's reference).
    hoverStyle: 'lens',
    lensLift: 5, // mm
    emboss: {
      height: 6, // mm at the crown; 4–6 reads as a bubble (Jihoon, lookdev/ pillow)
      ramp: 4, // mm: the meniscus where the window glass rises into the bubble
      // Press (Jihoon picked 'dent' in lookdev/ press-options): a finger-sized
      // dimple where the press lands, while the pillow around it stays full.
      squash: 0.15, // the pillow loses this fraction of its height when fully pressed
      dent: { radius: 28, depth: 0.55, response: 0.16, damping: 0.55 }, // mm (wide and shallow, Jihoon: not steep); depth as a fraction of height; s, ratio (springs back past flat once: the rebound)
      // Press glow (Jihoon: shape alone is not enough to see a press): light
      // blooms out from the press point, and the bubble's edge lights up as a
      // ring. The ring carries the state change (no text sits on it); the
      // bloom under the text stays under the legibility cap (maxLum).
      glow: { radius: 45, ring: 0.32, bloom: 0.07, color: [1, 0.97, 0.92] }, // mm; ring and bloom strength
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
