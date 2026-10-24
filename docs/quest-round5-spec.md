# Quest round 5 contract

Task XR-R5-QUEST-FEEDBACK-20261024. Baseline ad9e9c2e211674e02fc593315f98f8b4c38bc0f6 was tested by the user and requires changes. Product/preview single writer; existing branch and Draft PR5. Keep the isolated ad9 preview until this candidate passes relevant regression and independent Standards/Spec/motion/screen review. No main merge/deployment.

## Confirmed changes

- Preserve every complete rear plate from front, side and back. Remove R4 foremost eye-ray/alpha hard masking. Natural overlap and gradual opacity are separate from geometry/fragment clipping.
- Restore exposed titles from .92 to1; titles already at1 stay at1. Sheet/body opacity decreases from front to immediate rear to oldest rear; exact amounts remain Quest tuning values.
- List contact Glow is accepted except its outline/ring, which should be weaker. Preserve the local glow/core and immediate response. Do not globally weaken icon Glow.
- Window resize has an icon-hover-like bubble and a bidirectional diagonal resize arrow; this supersedes R4 arrow removal. Side rectangular bubbles move the whole stack. Press/hold produces local dent and Glow and slightly lowers window opacity. Controls remain hidden at rest and visible on hover OR held, including released-hover. Whole-stack proportional resize remains.
- Dock position handle becomes a sphere at the end of a thin stem under the plate, visibly separate from central icon input. No pendulum physics. Oval placement and distance-independent icon size remain. Plate material should read as a transparent bubble; end resizing must visibly dent locally while held.
- Icon feedback should remain responsive while rubbing a pressed bubble. Compare acquisition, capture, contact, deformation and visible geometry against isolated93fb388/57a279a without claiming either was the user's exact initial version. Keep actual-separation select, lateral-exit/lost-tracking cancel and one-target ownership.
- Push should begin sooner, accept the extended finger face of an open hand as well as the palm, and close with shorter travel. Use subtle inner Glow rather than an outline. Preserve one-front-child closure, Catalog root, cancellation/rearming and accidental-input protections.

## Confirmed Q20–Q24 (22:39 KST)

Task XR-R5-DECISIONS-INTEGRATION-20261024-2239. Pinch-drag both side move bubbles and corner resize bubbles; a plain index press only supplies feedback. Side bubbles are the only window movement controls; title drag is removed, rear-title navigation stays. Pinch the fixed Dock sphere (no pendulum physics), with icon response locked during capture. Front sheet/body > immediate rear > oldest rear opacity, titles1. An open hand's palm or multiple extended fingertip pads can start Push; a single leading index remains click. Keep one child, root, cancellation and rearming protections. All numeric geometry, strength and thresholds are trial values under Q14, not final design adoption.

Source of truth: coordination/docs/quest-r5-feedback-coordinator-2026-10-24.md. R4 implementation/validation remains historical, with the conflicting requests above explicitly replaced.

## First independent slice

This slice restores complete rear plates/title opacity, weakens only the row ring, changes palm light to a soft inner band, separates icon acquisition from deformation, preserves finite-fingertip contact while rubbing, adds held plate dent, and restores Dock plate passthrough alpha. It does not complete the new controls/handle or Push input; At that historical slice Q20–Q24 were still pending and the central bar interference remained open; the integrated candidate below supersedes that pending state.

Trial values: row ring .18 (icon ring stays .45); title opacity1; palm inner band8mm and strength .065; icon early dent8% of maximum followed by actual skin penetration; held plate dent2mm; shelf passthrough alpha base .08 plus Fresnel. Sheet opacity .24 was the first-slice historical value. Actual contact, side exit, tracking loss and click release remain distinct. The widened icon capture silhouette applies only while the fingertip sphere still contacts the skin; detached side exits use the original item boundary.

| Before | After | Why |
| --- | --- | --- |
| Icon dent already4.8mm before skin contact | Small early response, then continuous physical depth | Keep room for pressure and rubbing without removing early feedback |
| Finger sphere touching at48° loses capture | Contact-aware front hemisphere; detached sideways exit still cancels | Preserve physical contact without turning side exits into clicks |
| Above-skin plate pinch has light but no dent | Local2mm held dent with existing spring/reduced-motion damping; direct pressure stays immediate | Capture gets material feedback even before physical penetration |
| Rear sheet fragments clipped by foremost panel | Full sheet remains, natural overlap and opacity separate | Side/back views must preserve the whole plate |
| Refractive shelf always writes opaque alpha | Shelf-only translucent no-room skin; other presets unchanged | Passthrough has no room image in the grab texture |

Desktop shader, synthetic input and test evidence do not establish physical Quest acceptance. The existing ad9 preview stays in place while R5 is incomplete.

Review corrections: held dent recovery keeps its last owner position across other-hand hover; the capture spring does not delay physical press depth. Initial inner Glow (.28/12mm) looked too strong in actual HDR/no-env renders, so the trial was reduced to .065/8mm before publication. Shader tests check define presence, since an enabled cube-UV define has an empty-string value.

## Integrated candidate trial values and motion

- Side bubbles28×64dmm, corners32dmm; edge gap8dmm. Actual geometry scales with the whole window. Rest hidden, hover OR held visible; a released source still hovering keeps the control visible. Corner diagonal double arrows are restored by the latest instruction.
- Held local dent1.5mm, press dent up to2mm, existing soft recovery spring; hover Glow.12, contact/held.8. Rectangular bubbles use a planar dent on the same translucent skin as spherical controls.
- Manipulation opacity.9 (80ms exponential recovery); rear sheets.32 then.16 (120ms transition between depths). Rear body remains faint rather than disappearing. Titles remain1 independently. No hard mask.
- Dock sphere70dmm (28mm diameter at .4m), fixed55mm stem with1.2mm radius below the plate. No icon exclusion corridor. The input system ranks actual surface distances; the sphere/plate ownership still suppresses icons while held.
- Push close travel25mm, compared to previous50mm. Palm and >=3 extended fingertip-pad contact patches have stable keys. Acquire on observed approach with facing>=.7; >=.35 retains history for up to80ms so a bounded confidence fluctuation cannot erase approach. Initial appearance behind the sheet still cannot acquire. The captured patch cannot switch; movement is measured from palm-centre translation, preventing finger articulation from inventing travel. Lost patches freeze within the existing80ms grace, then cancel. These are trial values, not final Quest acceptance.

Before→after→why: title grab→separate side bubbles for explicit affordance; lower bar→separated sphere for independent natural approach; palm midpoint only→broad fingertip/palm contact for the first contacting face;50mm→25mm deliberate travel for lighter dismissal. Full stack move/resize retains text/icon proportions and world-space input distances. Current-session placement only; reference reset initializes safely.

Review correction: on acquisition, both centre and contact-patch world movement are checked for a tracking jump. Initial penetration is capped by observed centre translation; articulation or tracking relocation alone cannot move or dismiss a layer. The same stable motion rule therefore covers acquisition and held frames.
