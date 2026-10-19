// Values the components need that tokens.json does not define yet.
// Everything else comes from tokens.json. Each entry here is a candidate
// token: once it is agreed, move it into tokens.json and delete it here.
export const DEFAULTS = {
  // Distance the UI is placed from the eyes, used to turn dmm into metres.
  // Proposed token: placement.distance.near (arm's reach for poke).
  distance: 0.6, // m

  // Hover fade out. Only motion.hover.in exists; out mirrors it for now.
  hoverOutSameAsIn: true,

  // Corner radii in dmm. Proposed: shape.radius.{window,row,control}.
  radius: { window: 40, row: 20, control: 16 },

  // Packaging panel layout in dmm (docs/catalog-spec.md).
  // Proposed: size.panel.*, size.row.*.
  panelWidth: 320,
  rowHeight: 60, // above size.target.min = 32
  panelPadding: 24, // sides
  panelPadTop: 26,
  panelPadBottom: 14,
  rowInset: 10, // hover platter inset from the window edge
  badge: 34, // icon badge circle
  badgeGlyph: 18,
  badgeGap: 12, // badge to label
  chevron: 15,
  subtitleGap: 6, // title to subtitle
  headerGap: 18, // header to list

  // Type ramp: size in dmm, weight, tracking in em. One step heavier than a
  // flat screen, because text over glass needs more presence (vibrancy).
  // Proposed: type.{title,headline,body,subheadline,footnote}.
  type: {
    title: { size: 29, weight: 700, tracking: -0.02 },
    headline: { size: 17, weight: 600, tracking: 0 },
    body: { size: 17, weight: 500, tracking: 0 },
    subheadline: { size: 15, weight: 500, tracking: 0 },
    footnote: { size: 13, weight: 500, tracking: 0.01 },
  },
  // Text emphasis as white at an opacity, not grey (vibrancy).
  // Chosen for contrast on glass (docs/catalog-spec.md): secondary text 4.5:1,
  // tertiary graphics (chevrons) 3:1.
  emphasis: { primary: 1, secondary: 0.72, tertiary: 0.5 },

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
    // Window glass: how blurred (0..1, prefiltered roughness), how much of
    // the room shows through (the rest is glassTint), and the brightest the
    // glass may get (linear luminance) before the adaptive scrim darkens it.
    glass: { blur: 0.62, see: 0.45, maxLum: 0.085 },
    // Row platter: white opacity on hover, extra under the pointer, extra on press.
    platter: { hover: 0.1, spot: 0.06, press: 0.07 },
    badgeFill: 0.14, // icon badge: white opacity
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
