# Quest R10: observed coverage and independent sphere correction

## Preserved contracts

Keep Current window material, Q49 navigation, Q51 Dock plate shape/thickness/end grips, window thickness/alpha/gaps, icon input, real multipoint, release/cancel/loss and Push unchanged. No global or per-hand hover cap is introduced. The November Q59 correction below narrows only list-row thumb proximity.

## Actual Q57 observation

The 25-second Quest 3 recording used product `3af398646f03277d52aaf9bccd3338b66ce93981` and diagnostic adapter `59d8121f6ca172a8beec402a244ad5a6f115f8d8527a2702255abc41dc6114ef`. Raw SHA256: `31c332a645837363be0c665a2721df7409c8f179fc7ad916c0c48426fb8654c7`.

The 818 compact row ticks contain no row probe/hover/press/lift. All 372 detailed samples also have no active row shader state. Active hands have complete joint chains; actual product methods put the nearest recorded fingertip 330.10 mm from a row, outside the 100/140 mm hover bands. The record does not demonstrate the reported persistent multi-row response, and does not establish its resolution or user intent.

The sphere has eight recorded poke hover probes, including four with pinch. None has physical contact or held capture. Minimum sampled fingertip-to-skin gap is 28.37 mm; pinch samples remain beyond the existing 25 mm grab range. Primary/secondary dents and held state are absent. Unobserved inter-sample events and other routed component targets cannot be reconstructed from this record. Q58 asks only about timing and target; this slice does not request or start another recording.

## Independent centre-direction P2

The prior actual-InputSystem synthetic reproduction remains valid independently of Q57: after a front press or pinch capture, a fingertip crossing the sphere centre made `normalize(point)` collapse to zero and then reverse the dent onto the rear hemisphere.

For the Dock's existing `followInput` sphere only, latch the last acquired surface direction once the joint enters the sphere minus its existing maximum dent depth. Keep that direction for the remainder of that contact, including opposite and lateral exits. Normal surface rubbing before core entry follows the finger. Release/loss restores the dent and clears direction ownership; a new contact first seen inside the core can acquire its own first surface direction. This adds no token, input threshold, depth, alpha, glow, geometry or capture policy change. Other handle styles retain their existing response.

Regression exercises actual InputSystem press and pinch through +1 mm/0/-1 mm and both opposite/lateral core exits, valid unit direction, surface rubbing, loss recovery and new-owner acquisition including a first pinch inside the core. Original tests fail on `3af3986`; independent review exposed the opposite exit in `dfa6670`, then lateral exit and fresh-owner acquisition in `1a375b8`. All failures are retained before correction. Related manipulation/contact tests and an independent rendered review are required before publication. This synthetic defect correction is not proof of Q56's Quest cause or subjective acceptance.

## Remaining work

Q55 and Q56 remain unresolved pending the concrete observation branch. Existing diagnostic and ordinary previews stay pinned until a reviewed product candidate is explicitly handed over. #12's same-device baseline/refresh/budget measurement and #13's device acceptance remain open; reported frameRate 90 from an instrumented recording is not performance acceptance.

## Q59 November observation and list-thumb correction

The recovered diagnostic, still on `3af3986`, recorded a sustained pair of hovered rows: index on one row and a separately tracked straight thumb on another. The first root-row pair lasts 2.605 seconds. The same probe is never delivered to two list rows. Full tracked thumb chains pass the old straightness rule; curled middle/ring/pinky probes do not receive proximity hover. Exact-frame input/draw checks and a frozen recorded pose replay distinguish this from a spring recovery tail or a coordinate mismatch. Numeric device records remain local evidence and are not committed as test fixtures.

Only PackagingPanel rows opt into thumb contact-only routing. They reuse the existing finite-depth physical-contact path: no distant hover or early press offset for the thumb, but actual skin overlap, pressure, rubbing, release, cancellation, loss, rearm and independent actions remain available. This adds no numerical margin. A thumb can touch an already inflated visible row; inflation does not grant the old 100/140 mm proximity band to a separated thumb. Each row remembers the last separated skin profile per thumb probe; another finger growing the pillow cannot acquire that stationary thumb as hover, primary press or secondary dent. A genuine approach to an already inflated face uses that visible profile. Loss or missing probes clears this history, and an acquired press retains its existing frozen contact plane. The existing physical radius, visible-skin profile and finite rear surface bound this overlap. Index and other fingers, standalone buttons, Dock/icons/controls and pinch/palm ownership retain their prior rules.

This supersedes the R9 implementation description that every straight fingertip receives independent distant row proximity. It does not supersede the user's independent actual-contact/multipoint contract. Tests include a synthetic straight-thumb/index red, thumb-only contact at three scales, loss/side cancellation, independent contacts, Q48 last-valid navigation, separated-tip inflation/jitter, finite-back rejection and unchanged non-list proximity. The original recorded pose is replayed separately against the candidate.

Q59 contains no sphere contact or held state. During its tracked-hand interval the sphere's recorded eye-space bounds are outside the viewing frustum; this is a coverage limit, not a conclusion about the user's intended target or the sphere's subjective shape. The independent `6d60355` centre-direction correction remains separate from Q56 device acceptance. Updated product/preview delivery requires fixed-source review and affected validation; neither this observation nor reported 90 Hz closes the device/performance gates.
