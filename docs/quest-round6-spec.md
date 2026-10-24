# Quest round 6 contract

Task `XR-R6-QUEST-FEEDBACK-20261025`. Fixed input `663c80c` was tested by the user and needs refinement. Keep the existing branch, Draft PR5 and product/preview single writer. Preview663 remains until the next exact candidate passes affected tests, independent Spec/Standards/motion and actual HDR/no-env screen review. No main merge/deployment.

Source of truth: coordination `docs/quest-r6-feedback-coordinator-2026-10-25.md`. All numeric changes are trial values under Q14, not final design adoption.

Confirmed changes:
- Increase opacity of every interaction bubble: Dock icon skin, side/corner controls, sphere handle, raised list/lens/bead feedback and Dock shelf. Ordinary window-sheet opacity is not a global target of this request.
- Make Dock handle/plate dent visibly read while pressed/held. Preserve the owner, local feedback point and recovery; a small uniform/pixel delta alone does not establish Quest visibility.
- Relax icon acquisition/rubbing precision while preserving actual-surface separation click, lateral-exit/loss cancellation and one target. Keep hidden-rest/hover OR held/released-hover and pinch-only manipulation.
- Preserve accepted broad-hand recognition and25mm close threshold. Improve Push inner Glow without changing input timing/safety, root, one-child closure, cancellation/rearming or patch/centre-travel guards.
- Q30/Q31 confirmed: full rear geometry/title1 remain; older rear sheets/body become progressively fainter and depth intervals tighter. Dock width/depth footprint remains unchanged; perpendicular thickness increases modestly. No questions remain pending.

## Reproduction and current trial

An actual InputSystem replay shows a valid acquire and close in one frame removes `palmPush` before the visual driver runs: the outgoing child has zero Glow for its entire lifetime. Regression covers normal/reduced motion, unchanged25mm close, no propagation to the previous layer and no delayed removal. A committed close now retains its own100ms visual acknowledgement; subsequent light recovers with100ms exponential decay during the existing exit. Cancellation has no success flash. Inner-band width16mm in local geometry and strength.12 are trial values (previous8mm/.065); headset visibility remains unverified.

## Next two stages

1. Preserve fixed663 and2b red/review evidence, integrate confirmed opacity/dent/contact/Glow and Q30/Q31 layout/thickness corrections.
2. Fixed-SHA impact regression, HDR/MR screen review and independent review closure; normal branch push/same Draft PR, then exact-SHA HTTPS receipt and coordinator/Operator handoff. Lookdev selection and #12/#13 remain separately gated.

## Opacity and contact corrections

- Bubble skin body opacity .24 (new neutral translucent body, previous surface centre alpha about21/255; four actual no-env shapes now98/255). Shelf passthrough base alpha .28 vs.08. Raised row/lens/bead alpha .98 vs ordinary sheet token.92, masked to interactive skin. Ordinary front-window opacity is unchanged; the separate Q30 rear-depth factors are described below. Pixel values are an isolated shader test, not physical headset perception.
- Dock shelf input keeps its existing early10mm offset, while visual dent uses .3mm early floor plus real penetration up to3mm. Held2mm is a separate floor; pressure remains immediate, release springs back. The legacy first-frame test now uses actual3mm penetration instead of assuming early contact means full compression. Sphere held1.5mm is a minimum and cannot shrink an existing2mm physical dent.
- Dock icon early uncontacted feedback no longer monopolizes its neighbor. One target remains; actual contact or explicit grab retains capture. A newly chosen icon may arm from the same source's consecutive observed physical crossing, bounded to50mm/frame and checked against both previous and current skin geometry. Loss/reset/palm/ray discontinuity, missing/disabled target, stationary radius/geometry growth and first appearance inside cannot invent contact. Real front-side rubbing uses localZ, independent of entry angle; separated lateral exits and rear hemisphere cancel. No global finger radius/offset enlargement.
- Initial optical harness imports used duplicate Vite module URLs; environment-check failures were retained. The corrected harness explicitly clears all loaded look-module backdrop instances and checks both define and uHasEnv=0. Four baseline alpha checks fail at21/255; they pass at98/255 after the material change.

## Q30/Q31 decision delta and independent review closure

Task delta `XR-R6-DECISIONS-INTEGRATION-20261025-0036`. Numeric choices remain trial values:

- Front/middle/oldest sheet/body factors are 1/.28/.08 (previous 1/.32/.16). Title stays1. Opacity moves smoothly using the existing120ms response; group held opacity still composes and restores independently.
- Compress-mode depth intervals form a .7 ratio toward older sheets. Default Quest root1.5 and spacing.7 give front–middle35mm, middle–oldest24.5mm. The variable-height/header Y arrangement is unchanged, retaining exposed rear titles. Generic packaging without an explicit ratio remains linear; replace/protrude behavior is unchanged.
- Dock perpendicular thickness is1.2× the old profile. Width/depth footprint, icon layout and stem/sphere position remain unchanged. Both the drawn profile and analytic finger contact derive from the same scaled PlateGeometry; refraction thickness receives the same factor. At distance.4m nominal optical thickness is8.8mm (was7.333mm); the complete curved mesh extent is separately measured, not equated with this optical parameter.
- Independent2b review found rear-to-front traversal could click, and provisional press could treat stationary radius/geometry growth as contact. First acquisition now requires the front hemisphere. InputSystem's actual consecutive crossing evidence also governs provisional-to-contact promotion and capture, preventing an invented click while preserving a fresh real approach/rearming. Direct component-only probes without InputSystem metadata retain their existing API.

Two reproduced review failures and the ten new decision/review red cases are retained. Final independent re-review and candidate screen checks are required before safe preview publication.
