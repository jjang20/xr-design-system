# Quest round 5 contract

Task XR-R5-QUEST-FEEDBACK-20261024. Baseline ad9e9c2e211674e02fc593315f98f8b4c38bc0f6 was tested by the user and requires changes. Product/preview single writer; existing branch and Draft PR5. Keep the isolated ad9 preview until this candidate passes relevant regression and independent Standards/Spec/motion/screen review. No main merge/deployment.

## Confirmed changes

- Preserve every complete rear plate from front, side and back. Remove R4 foremost eye-ray/alpha hard masking. Natural overlap and gradual opacity are separate from geometry/fragment clipping.
- Restore exposed titles from .92 to1; titles already at1 stay at1. Behind sheet/body opacity will be progressive once the depth order is confirmed; exact amounts remain Quest tuning values.
- List contact Glow is accepted except its outline/ring, which should be weaker. Preserve the local glow/core and immediate response. Do not globally weaken icon Glow.
- Window resize has an icon-hover-like bubble and a bidirectional diagonal resize arrow; this supersedes R4 arrow removal. Side rectangular bubbles move the whole stack. Press/hold produces local dent and Glow and slightly lowers window opacity. Controls remain hidden at rest and visible on hover OR held, including released-hover. Whole-stack proportional resize remains.
- Dock position handle becomes a sphere at the end of a thin stem under the plate, visibly separate from central icon input. No pendulum physics. Oval placement and distance-independent icon size remain. Plate material should read as a transparent bubble; end resizing must visibly dent locally while held.
- Icon feedback should remain responsive while rubbing a pressed bubble. Compare acquisition, capture, contact, deformation and visible geometry against isolated93fb388/57a279a without claiming either was the user's exact initial version. Keep actual-separation select, lateral-exit/lost-tracking cancel and one-target ownership.
- Push should begin sooner, accept the extended finger face of an open hand as well as the palm, and close with shorter travel. Use subtle inner Glow rather than an outline. Preserve one-front-child closure, Catalog root, cancellation/rearming and accidental-input protections.

## Pending user branches

Coordinator owns Q20–Q24: press-hold vs pinch for window controls; retain/remove title movement; Dock sphere grab method; front-to-rear opacity order; open-hand Push vs single-index click. Do not choose these branches before the answers. Implement independent confirmed visuals/facts first. All numeric geometry, strength and thresholds are trial values under Q14, not final design adoption.

Source of truth: coordination/docs/quest-r5-feedback-coordinator-2026-10-24.md. R4 implementation/validation remains historical, with the conflicting requests above explicitly replaced.

## First independent slice

This slice restores complete rear plates/title opacity, weakens only the row ring, changes palm light to a soft inner band, separates icon acquisition from deformation, preserves finite-fingertip contact while rubbing, adds held plate dent, and restores Dock plate passthrough alpha. It does not complete the new controls/handle or Push input; Q20–Q24 remain pending and the central bar interference is still open.

Trial values: row ring .18 (icon ring stays .45); title opacity1; palm inner band8mm and strength .065; icon early dent8% of maximum followed by actual skin penetration; held plate dent2mm; shelf passthrough alpha base .08 plus Fresnel. Sheet opacity .24 remains the earlier value until Q23. Actual contact, side exit, tracking loss and click release remain distinct. The widened icon capture silhouette applies only while the fingertip sphere still contacts the skin; detached side exits use the original item boundary.

| Before | After | Why |
| --- | --- | --- |
| Icon dent already4.8mm before skin contact | Small early response, then continuous physical depth | Keep room for pressure and rubbing without removing early feedback |
| Finger sphere touching at48° loses capture | Contact-aware front hemisphere; detached sideways exit still cancels | Preserve physical contact without turning side exits into clicks |
| Above-skin plate pinch has light but no dent | Local2mm held dent with existing spring/reduced-motion damping; direct pressure stays immediate | Capture gets material feedback even before physical penetration |
| Rear sheet fragments clipped by foremost panel | Full sheet remains, natural overlap and opacity separate | Side/back views must preserve the whole plate |
| Refractive shelf always writes opaque alpha | Shelf-only translucent no-room skin; other presets unchanged | Passthrough has no room image in the grab texture |

Desktop shader, synthetic input and test evidence do not establish physical Quest acceptance. The existing ad9 preview stays in place while R5 is incomplete.

Review corrections: held dent recovery keeps its last owner position across other-hand hover; the capture spring does not delay physical press depth. Initial inner Glow (.28/12mm) looked too strong in actual HDR/no-env renders, so the trial was reduced to .065/8mm before publication. Shader tests check define presence, since an enabled cube-UV define has an empty-string value.
