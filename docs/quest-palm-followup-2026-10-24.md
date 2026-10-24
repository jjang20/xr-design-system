# Quest follow-up: early press, nearer Dock, palm push to close

Baseline: `38887d5366dcfa984fbbf701d1a175fce870dc56`. The user confirmed single-fingertip multi-hover is resolved on Quest. They clarified that pressed still starts only after passing through the surface, rather than merely seeing a hand through glass. They requested a closer Dock and a whole-layer palm push that moves the layer away and dismisses it. They explicitly chose **keep the root Catalog; dismiss only child layers**.

## Required behavior and provisional tuning

1. Retain one hover target per fingertip and existing controller behavior. Advance tracked-hand press activation by 10 mm beyond the tracked fingertip radius; show pressed depth before the finger crosses the visible face. Preserve physical 3 mm release retreat even after visual compression reaches its cap. Missing/zero joint radius uses an 8 mm hand fallback; controller grips retain point contact.
2. Change the default body-lock Dock distance from 0.55 m to 0.40 m. Preserve the existing eccentricity, delayed follow and per-placement visual sizing. Explicit distance overrides remain supported.
3. A tracked open palm facing the front layer can push anywhere within the layer's surface. At least three extended fingers distinguish it from index pokes and pinches. The whole layer follows inward palm travel immediately, without also pressing/selecting a row. Retain source ownership; another hand cannot take over the gesture.
4. At 50 mm inward travel, dismiss exactly the front child layer, continue away and fade. Keep the Catalog root. Require withdrawal before another layer can be dismissed; do not cascade while the same hand stays pushed in.
5. Before the threshold, withdrawal, leaving the bounds or tracking loss cancels the push and restores the layer without navigation or selection. A palm first appearing behind the surface does not dismiss. Preserve reduced motion: direct hand movement remains, automated dismissal fades at the final pushed pose.

The 10 mm offset, 40 cm Dock placement and 50 mm palm threshold were communicated as test values, not accepted headset calibration. These provisional values live in `DEFAULTS.handInput` and `DEFAULTS.dockDistance`, following the repository's candidate-token convention. Existing token values and generated outputs remain unchanged. The physical visible profile is still used; the extra offset intentionally supersedes the previous zero-gap activation contract for tracked hands.

## Before / After / Why

| Before | After | Why |
|---|---|---|
| Hand contact has no calibration allowance | Tracked-hand press starts 10 mm ahead; controllers retain their existing threshold | The user still had to cross the visible surface |
| Deepest press is capped to material travel | Release measures physical retreat while visible depth remains capped | An earlier trigger must not require a large withdrawal to release |
| Dock is 55 cm from the estimated body anchor | Default is 40 cm, with unchanged angle and follow | Put the Dock within easier reach |
| Only fingertip/ray input reaches panels | A separate palm gesture pushes the complete front layer | Keep row selection separate from whole-layer dismissal |
| Back navigation collapses a child into its origin row | Palm dismissal preserves the pushed pose and continues away while fading | Match the direction of the gesture |

## Verification and boundaries

The first three tests in `test/quest-palm.test.js` failed on the baseline: no early press with 6 mm left before visible contact, wrong Dock distance, and no full-layer palm movement. Tests use real InputSystem/PackagingPanel with synthetic tracked joints. Added coverage checks cancellation, root preservation, one-layer rearming, source ownership, no row selection, hand-plane alignment, fist/pinch/missing joints, rotation/scale, reduced motion and controller parity. This is deterministic input replay, not a physical Quest run.

Palm orientation follows the wrist joint's outward -Y direction in the [W3C WebXR Hand Input draft, JointSpace](https://www.w3.org/TR/webxr-hand-input-1/#xrjointspace-interface). Palm position is an implementation estimate between wrist and middle proximal joint; finger-extension recognition is provisional and requires headset testing.

Root is the only writer. Existing Standards and Spec reviewers review read-only from this baseline. No token migration, Figma edit or room-planner feature work is included. Verification results and review closure are recorded below after execution.

## Next two steps

1. Pass regression, build, browser motion checks and independent review; publish the verified local preview at the existing Quest address with the existing certificate.
2. User refreshes and checks early press, Dock reach and palm push/cancel while keeping Catalog. Root records the result and resolves remaining tracking/feel defects before PR publication or merge judgment.
