# R04 movement-only comparison

`demo/window-movement-comparison.html` is a separate fixture. It implements the recorded Q119 choice: a visible bottom capsule for Flat and the original left/right pane skin for Contour. It is not a new public design-system component or a claim about visionOS/Horizon implementation details.

Both independent panes begin at 0.216 × 0.28935 m, with identical fixed title/subtitle/five read-only rows. Labels are children of their windows and move with them. Flat has no titlebar or side-edge movement. There are no active Back, corners, resize, row-selection, navigation or palm Push targets in this entry. Original demo/components are unchanged.

The first engineering capsule is 0.080 × 0.022 × 0.003 m at rest, with a 0.014 m pane-bottom gap. Its rendered extruded capsule is its ray target; the empty bounding-box corners do not acquire. Near pinch uses the same rounded footprint and existing reach limit. These dimensions are fixture values, not global tokens, verified platform dimensions or final DS rules.

## Input and result

| Path | Acquisition and displacement | Evidence boundary |
| --- | --- | --- |
| Desktop | Actual pointer down on visible target; drag on captured initial front plane | Built browser pointer checks |
| Controller far | Fresh semantic select ray, original front plane | Actual InputSystem with synthetic controller pose/events |
| Controller near | Grip pose + semantic select at target; 3D displacement including depth | Synthetic pose; grip pose is not the grip button |
| Hand near semantic | Tracked index + semantic select; 3D displacement | Synthetic hand/pose seam |
| Hand near native | Installed Three joint-derived pinch, fixture targets opt in; 3D displacement | Installed WebXRController with synthetic joint frames |
| Hand far | Requires semantic select; native joint pinch alone is not a far click | Existing routing contract; no Quest run |

The fixture captures a target-local-to-world matrix and the initial window world position. Every subsequent sample uses that same coordinate frame. The root's movement cannot add another delta to a stationary held sample. Far uses the initial front plane; near retains its 3D mapping across the near/far threshold. There is no rotation, resize, snapping, collision, live head-follow or distance reevaluation.

Only the first source owns a window, and one source cannot own both. Equal-frame candidates are ordered by source ID then fixture kind, not update/feed order. Other sources cannot move or release that owner. Pose loss/invalid samples cancel ownership and preserve the last valid pose. A held source is blocked after cancellation/reset until a real release. Semantic release and a live native open-hand event rearm without needing an intervening hover render frame. Source disconnect/reconnect cancels the old slot owner immediately; a replacement source must acquire the visible target again. A native `pinchend` emitted from missing cached joints is not treated as proof of opening.

Near acquisition retains the original explicit pinch-at-current-contact behavior. Hover/contact alone cannot move. Far acquisition requires a fresh semantic press via the public InputSystem capture route. Contour's existing actual skin, finite-tip contact, bend/thinning/Glow and recovery are used unchanged; only this entry opts into retained capture and the frozen coordinate hook. This adapter differs from the original direct window-controls chain and is not whole-chain equivalence.

Reset (scene or DOM) clears owners and pending samples and restores both initial poses. The first XR viewer pose initializes the fixture reference once without resetting window offsets. Later session visibility loss/end, page blur and request failure cancel input while preserving poses; no automatic recenter or rollback is applied. Re-entry can therefore leave a moved pane outside the new view; it does not imply spatial-anchor persistence. Explicit Reset remains the recovery action. Native session end is owner-requested only. Pointer-capture loss retains the last position. Disposal removes fixture listeners, meshes, text resources and its canvas/session. No device measurements, telemetry, POST, external content, audio capture, account access or GPU timers are added.

## Verification

- `node --import ./test/support/register.mjs --disable-warning=THREE_CJS_DEPRECATED --test test/window-movement-comparison.test.js`
- `npm test` and `npm run build`
- `R04_OUTPUT=/absolute/evidence/path node scripts/verify-window-movement.mjs` uses a temporary localhost build preview and its own browser, then closes both. It never requests XR.

Tests start with public input at the drawn target; they do not inject grab state. Node font stubs do not prove actual glyph fit. The built-desktop check records actual synchronized Troika glyph bounds, initial target viewport bounds, pointer acquisition/movement/release/reset/loss and owned cleanup. These checks do not prove Quest input support, comfort, discovery, depth perception or task success. Per-eye XR rendering and physical hand/controller behavior remain untested.

Visible DOM and XR guidance identifies the Flat bottom handle and Contour edges and explains pinch/trigger/release. A user exposed to that guidance is not an unaided-first-prediction participant. The fixture is an engineering comparison, not a completed research protocol or a user-accepted movement experience.
