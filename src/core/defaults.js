// Values the components need that tokens.json does not define yet.
// Everything else comes from tokens.json. Each entry here is a candidate
// token: once it is agreed, move it into tokens.json and delete it here.
export const DEFAULTS = {
  // Distance the UI is placed from the eyes, used to turn dmm into metres.
  // Proposed token: placement.distance.near (arm's reach for poke).
  distance: 0.6, // m

  // Corner radius as a fraction of the shorter face side. Proposed: shape.radius.
  cornerRatio: 0.18,

  // Hover fade out. Only motion.hover.in exists; out mirrors it for now.
  hoverOutSameAsIn: true,

  // Packaging panel layout. Proposed: size.panel.width, size.row.height.
  panelWidth: 260, // dmm
  rowHeight: 48, // dmm (above size.target.min = 32)
  panelPadding: 16, // dmm (reuses size.gap.min's value)

  // Dock: how far the body has to turn before the dock starts its lazy follow.
  // Without a dead zone every small head movement restarts the delay timer.
  // Proposed: anchor.follow.threshold.
  followThreshold: 20, // deg
  // Body-lock distance of the dock. Proposed: anchor.distance.
  dockDistance: 0.55, // m

  // Colours. Contour has no colour tokens yet (MR-first: colour is the open problem).
  color: {
    surface: 0x23262d,
    surfaceRaised: 0x2d313a,
    plate: 0x565c66, // lighter, so the Z-Slider's contact shadow reads on it
    text: '#f4f6fa',
    textMuted: '#a7adb8',
    accent: 0x7cc4ff,
    outline: 0xf4f6fa,
    shadow: 0x000000,
    disabled: 0x3a3d44,
  },
};
