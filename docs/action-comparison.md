# R03 action comparison

Separate `demo/action-comparison.html` / `npm run dev` entry. The flat controls are comparison fixtures, not exported DS components. Product base: `088c83689af6ffc92b4f42dd0ee66b046c5dbf4e`. Contract: Coordinator `xr-r03-action-comparison-spec-2026-11-08.md` SHA256 `04d5a6e6cde4a2c0bc5d7a3c95177857cc4ee703c961c92336686958bf13c96f`.

Both columns have Action and the same Action A/B/C/Unavailable toolbar. Standalone public `select` and toolbar parent `select(tool,index)` update only their own last-action notice. Repeating an action emits another public action but may keep the same string; no counter, blink or participant log. Disabled/bar/hover/press-progress/cancel do not act. Scene and DOM Reset clear both notices and cancel pending/held input. Loss preserves completed notices.

The Contour side uses unchanged Button and Toolbar. The flat fixture reuses Button's PressModel/owner/touch floor with a fixed flat face and color feedback; its toolbar shares proximity arbitration but does not deform the background. This is a bounded comparison, not a finding that input experiences are equivalent. Fresh semantic select/down samples its current actual ray hit as an approach, without injecting pressed/captured state. The fixture observes actual release edges between render frames and cancels stale far poses and desktop capture loss locally. No changes to InputSystem, Button, Toolbar, tokens, sliders, R02, or the original demo.

## Input and boundaries

| Path | Local support/evidence | Not established |
|---|---|---|
| Desktop | Visible ray face, pointer down/up, repeated action, capture loss, reset. Built browser/GL verification separately recorded. | Quest input or comfort |
| Near hand/controller pose | Existing depth/contact and physical retreat semantics, per-button owner and independent contacts. Synthetic public poke tests. | Native pinch-only activation; real hand tracking quality |
| Far hand/controller | WebXR semantic select, real ray hit, release edge, stale-pose cancellation. Synthetic public InputSystem tests. | Actual Quest success or source equivalence |
| Lifecycle | Reset drops pending probes, cancels without select and blocks held sources; pagehide/session end/hidden cancel transient input. | Browser-native session termination from desktop tests |

D=.6, gap4/pad10, primary width150 are existing engineering fixture values. Both sides use equal face sizes, heights, direction and scale per pair. Existing physical touch floors may exceed the drawn ray face; neither side receives a new invisible ray target. Actual synchronized text/bounds are in the desktop evidence; no font layout is proved by Node stand-ins. One-time XR placement does not resize in response to head movement. The scene notice is visible in XR; this is not a system-brightness or passthrough experiment.

## Verification

- Public input→acquisition→select→notice tests: `test/action-comparison.test.js`.
- Built desktop pointer/GL and synchronized geometry/text record: `node scripts/verify-action-comparison.mjs` (requires `npm run build`). Temporary browser/server are closed in `finally`.
- `npm test`, `npm run build`, and `node --check` for changed JS. There is no separate TypeScript/typecheck script in this JS package.
- Node, actual desktop, synthetic XR and actual device results remain separate. No GPU performance measurement, telemetry, POST, or new device trial is performed by this fixture or checker.
