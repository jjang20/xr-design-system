# Support and evidence

Scope: implementation `2988b93`, documentation refresh 2026-11-08. “Implemented” means a source path exists. “Synthetic” means real routing/component code exercised with simulated poses/events or session doubles. “Desktop” means browser pointer, GL and text output in the recorded conditions. None of these terms means physical headset acceptance or release.

## Input paths

[InputSystem](../src/core/InputSystem.js) converts nearby hand fingertips or controller grip poses into contact probes, and distant sources into rays. Its near/far hysteresis reads `input.direct.distance.enter/exit`. Components and fixture adapters still determine acquisition, capture and result meaning. A controller grip **pose** is not a grip **button**. Hand-joint pinch from installed Three is distinct from WebXR semantic `selectstart/selectend`.

| Target / example | Near contact and semantic input | Native joint pinch | Ray / desktop | Evidence limit |
| --- | --- | --- | --- | --- |
| Button / Toolbar; R03 actions | Existing approach/contact/retreat and per-source owner | No pinch-only activation opt-in | Semantic select/trigger or pointer, visible face acquisition; fixture handles fresh edges/loss | Synthetic + built desktop; no input-equivalence or current Quest success claim |
| R01 Z | Original web Z push; semantic pinch uses its hover-based acquisition | Not enabled for Z; a closed hand alone is not a supported grab | Original horizontal ray-plane drag / wheel with fixture capture protection | Bounded direct-source versus adapter replay; actual device resolution unknown |
| R01 Flat X | Contact crossing or explicit pinch at current contact; held pinch retains mapping | Fixture opt-in; same-hand continuity and actual release/loss are separate | Visible track/thumb acquisition, horizontal captured drag | Synthetic installed-Three joints + desktop; does not prove tracking quality |
| R02 corners | Existing corner semantic pinch/trigger reach; retained capture | No joint-only corner fallback added | Captured initial coordinate frame; independent sizes | Synthetic + desktop; real corner acquisition/readability unknown |
| R04 movement | Explicit near pinch/semantic select at Contour edge or Flat bottom capsule; 3D displacement | Fixture targets opt in | Captured initial front-plane displacement | Synthetic installed-Three joint frames and desktop, not native device proof |
| R05 rows / Back | Button contact; Contour Push uses a separate hand-joint recognizer | No slider-native policy inherited by rows | Semantic ray / pointer | Synthetic navigation and hand Push + desktop; Flat Back is not gesture equivalence |
| R06 app targets / Back | Contact/crossing and owner protection | Native-joint contact tests are not pinch acquisition; no opt-in | Flat drawn rounded face; Dock hover bubble/skin, not exact object triangles | Synthetic + desktop; manipulation targets are disabled here |

A joint-derived near pinch is never automatically a far click. Source replacement, missing tracking and a real release are different events. The same user task across hands/controllers does not establish equal input experience. Current fixture guidance identifies supported paths; it is not an unaided-discovery test.

## Cancellation, reset and lifecycle

| Example | Loss / real release | Explicit restoration |
| --- | --- | --- |
| Slider | Retains last shared brightness while ending ownership; held competing/cancelled sources need rearm. | Restore brightness returns 1 and clears owners/dim; session end/disposal also restore. |
| Resize | Retains last valid size, clears ownership; an actual release rearms, loss is not release. | Reset returns both `q=1`; initial XR placement/session exit also restore size. |
| Actions | Loss/cancel cannot emit `select`; completed notice remains. | Reset clears both notices and cancels pending/held actions. |
| Movement | Retains last valid pose on release/loss, including session/page loss. | Reset returns initial poses. Re-entry does not guarantee a moved pane is in view. |
| Hierarchy | Retains committed navigation/content; cancelled requests do not select. | Reset restores both roots and clears pending routing. |
| Dock content | Retains committed panes; cancellation/replacement/reset do not synthesize actions. | Back closes only its pane; Reset closes both and cancels pending actions. |

Each fixture has owner/non-steal and release/rearm boundaries in its detailed page. These do not introduce an all-function release-to-commit policy. Hover, a material dent or Glow is not a persistent selected result.

R06 disposal immediately stops routing, then waits for actual native session end before final renderer/content cleanup when necessary. Only explicit XR exit requests session termination; a stalled native request can leave cleanup pending. The checks include JS session doubles, not native termination. Do not transfer that policy or its proof to older entries. Removing a mesh alone does not dispose all geometry, materials, text, listeners and borrowed resources.

## Evidence and acceptance

The fixed implementation records for the following commits reported public-input tests, builds and bounded desktop checks. They were reused as documentation inputs; the documentation task did not rerun them. Test counts from different commits are not additive, and later whole-suite checks do not rerender every older fixture.

| Slice | Implementation commit | Recorded evidence / scope |
| --- | --- | --- |
| Slider web-source reuse | `088c836` | Public acquisition tests; ten paired synthetic replays, 38 frames. Two far-release frames deliberately differ from the original chain. Actual desktop pointer/brightness output; no whole-scene or headset equivalence. |
| Matched resize | `06343b3` | Public corner acquisition, capture/rearm/reset and desktop glyph/whole-row fit. Five to six complete rows at the recorded baseline/maximum, not a comprehension or minimum-legibility result. |
| Actions | `2873cf5` | First acquisition → public action → notice, repeat/disabled/loss/reset and synchronized desktop bounds. |
| Movement | `6a1bec8` | Drawn-target acquisition, fixed coordinate mapping, pose retention, reset and native-event simulation; desktop GL/session doubles separately scoped. |
| Hierarchy | `03ef2c5` | All four details on both sides, callbacks/Back/Push/loss and desktop glyph/diagram output. |
| Dock content | `2988b93` | Seven pages on both sides, finite targets, photo/footprint output, loss/reset/disposal and separate JS session checks. |

Links to the corresponding checked-in tests, scripts and detailed limitations are in [Examples](examples.md#build-and-checks). A passed Node font stand-in is not proof of glyph fit. Desktop GL is rendering evidence, not a GPU-time measurement. A successful HTTPS response is delivery evidence, not interaction acceptance.

Historical physical feedback is narrower:

- At `51c9fb2`, R17 Q84/Q85 passed within their questions: local pane thinning/recovery and same-pane relative list appearance/transitions (`0/.06/.10`). Earlier accepted grab/dent/Glow and sphere observations remain narrow historical inputs. This does not accept every input/layer/reduced-motion condition, later fixtures, or performance.
- Earlier slider previews received explicit negative feedback, including no improvement after development checks. `088c836` reused the original web Z source and corrected Flat acquisition; its actual loaded device identity/mode and physical outcome have not been confirmed. Development PASS does not erase the earlier report.
- No complete Quest input/occlusion/readability/comfort matrix has been established for the six comparison entries. Unsupported or unverified input is not participant adaptation failure.

Same-device performance #12 remains **NOT_MET**, broader #13 criteria remain **OPEN**, and GPU work remains deferred with no automatic resumption. A nominal refresh-rate observation, frame callback cadence or CPU-only data cannot stand in for the deferred GPU contract. Documentation completion does not close those issues or release the product.

## Rendering and accessibility limits

The existing backdrop/environment supplies authored imagery, not camera access or room sensing. MR passthrough composition depends on the actual session blend mode; virtual glass or a dim overlay is not proof that the compositor can blur/darken the real room. Slider `alpha-blend`, `opaque`, `additive` and unknown modes have explicitly different scopes in its [technical notes](slider-comparison.md).

Reduced-motion paths exist for particular components/entries and have bounded development checks. Their presence does not establish a comfort result across headsets. There is no complete 3D keyboard focus/activation or screen-reader interaction layer; DOM buttons and original-demo camera keys are not equivalent coverage. Gaze dwell, physical scene registration, final icon quality, Dropdown, closing rail and shared exploration remain outside implemented/accepted scope. See [unfinished work](components.md#unfinished-and-reserved-work).
