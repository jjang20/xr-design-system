// Values the components need that tokens.json does not define yet.
// Everything else comes from tokens.json. Each entry here is a candidate
// token: once it is agreed, move it into tokens.json and delete it here.
export const DEFAULTS = {
  // Distance the UI is placed from the eyes, used to turn dmm into metres.
  // Proposed token: placement.distance.near (arm's reach for poke).
  distance: 0.6, // m

  // Hover fade out. Only motion.hover.in exists; out mirrors it for now.
  hoverOutSameAsIn: true,

  // Corner radii in dmm. Proposed: shape.radius.{window,control}.
  radius: { window: 30, control: 16 },

  // Packaging panel layout. Proposed: size.panel.width, size.row.height.
  panelWidth: 300, // dmm
  rowHeight: 56, // dmm (above size.target.min = 32)
  panelPadding: 18, // dmm

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
    plainHoverFill: 0.55, // list rows: fill opacity on hover (invisible at rest)
  },

  // Colours. Contour has no colour tokens yet (MR-first: colour is the open problem).
  color: {
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
