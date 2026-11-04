# Quest input fixes — 2026-10-24

Baseline: `57a279a640dc1ea45f2ec6884b7e1423cb4d3145`, PR #5. Source: the user's Quest test in this session. The user confirmed **Enter mixed reality works**, and reported no major controller issue. Headset model and browser version were not supplied.

## Requested contract

1. A single fingertip must not hover multiple adjacent controls. Two independent hands can target separate buttons; held input keeps ownership. The Dock retains its existing global one-app bubble policy; this fix does not redesign it for simultaneous app interaction.
2. Press begins at the visible surface, without requiring the tracked finger to pass through the component. Count tracked fingertip thickness and embossed row height. Preserve the 22 mm touch floor and 3 mm release retreat.
3. Z-Slider percentage increases as its knob moves outward from the base: base 0%, full extension 100%. Preserve direct movement and grab offset.
4. Remove the black rectangle around the slider's central axis while retaining the existing ring glow.

## Before / After / Why

| Before | After | Why |
|---|---|---|
| Every nearby button receives the same finger's hover | One nearest visible target per fingertip; a held target retains ownership | Avoid ambiguous feedback while preserving independent hands on buttons and Dock's existing one-app policy |
| Joint centre crosses the flat hit plane | Finger surface touches the rendered row crown or button face | Align visible contact and input; do not change physical release hysteresis |
| Pulling 10 mm outward reduced 50% to about 36% | Outward motion increases value; base 0%, extension 100% | Match the user's direction contract |
| Glow plane writes alpha 1 even in empty areas | Empty pixels write alpha 0; rings retain additive light | Keep MR passthrough visible around the axis |

## Reproduction and validation

The first four tests in `test/quest-input.test.js` failed on the baseline: adjacent hover stayed on, fingertip surface contact did not press, the embossed crown did not press, and outward slider movement produced `0.3571428571428571` from `0.5`. Additional regressions cover two hands, uniform scales, physical release retreat, source replacement, slider grab ownership and cross-component targeting.

`scripts/regress-quest.mjs` renders the real Z-Slider glow into a transparent WebGL target. Before the fix, centre and corner alpha were 255 even with no rings lit. After the fix they are 0 at 0/3/5 lit rings; the lit ring maximum alpha and brightness remain 148. See [before](validation/quest-input-2026-10-24/red/result.json) and [after](validation/quest-input-2026-10-24/green/result.json). The paired composite images were inspected: the opaque black square is gone and concentric amber rings remain. This isolates the material defect; it is not a Quest passthrough capture.

Validation uses Node 22.23.4 and Chrome with SwiftShader. At code commit `cbf4efc`: **67/67 tests** (61 component/runtime + 6 Arena), **12/12 browser regressions**, **4/4 glow compositing checks**, token drift check and production build pass. [Test log](validation/quest-input-2026-10-24/test.log), [browser log](validation/quest-input-2026-10-24/browser.log), [build log](validation/quest-input-2026-10-24/build.log).

The first full run caught three controller/ray ownership regressions introduced while resetting new fingertip approach history. Restricting that reset to poke probes restored the existing tests; [initial test log](validation/quest-input-2026-10-24/initial-full-test.log) and [initial browser log](validation/quest-input-2026-10-24/initial-browser.log) are retained. Independent review then found the Catalog corner-radius mismatch and inherited scale-dependent slider reach. Three additional tests failed before their corrections and pass afterward; [review red log](validation/quest-input-2026-10-24/review-red.log). Both independent review axes closed at `cbf4efc`, with no remaining findings in scope; see [review record](quest-input-review-2026-10-24.md).

## Motion and accessibility review

The slider remains directly coupled to hand displacement with its grab offset preserved. No duration, easing or spring values change. Existing reduced-motion behavior, physical target floor, disabled feedback and cancellation semantics are retained; slider scaling now preserves physical reach too. The frozen press-contact reference avoids release driven by the component's own dent animation. Verdict: automated regressions and independent review pass; physical comfort and tracking stability require the user's Quest recheck.

## Boundaries and next two steps

No token changes, Figma changes, room-planner features or remote merge are included. Root is the only implementation writer; independent reviewers remain read-only.

1. Serve the verified code at the existing Quest HTTPS address; the user refreshes and rechecks the four reports. Root owns the preview and records the result. Review findings and automated checks are closed.
2. If the Quest recheck passes, prepare PR #5's update and merge recommendation. Follow repository authorization for remote operations; local tests do not imply remote merge or full headset acceptance.
