# Quest round 4 contract

Task XR-R4-INTEGRATION-20261024. Baseline a7d5d5142d24e212029edba7e3b11519843d2762; product/preview single writer. User authorizes implementation, regressions, independent Standards/Spec/motion review, branch push and Draft PR update. No main merge or deployment. Quest acceptance remains changes requested.

## Accepted behavior

1. Restore existing row dent/glow in HDR and MR without backdrop; immediate local contact feedback, weaker hover, surrounding/edge glow outside fingertip, release recovery. This is not adoption of a new lookdev style.
2. Separate central Dock handle below plate. A natural approach must acquire it without icon hover/press capture. During manipulation suppress all icon hover, magnification and click. Plate ends still resize icons.
3. Icons and rows commit only after actual fingertip separation, with lateral exit/tracking loss cancel, owner capture, rearming and ray parity. A stable undeformed contact crown is a conservative release boundary: deformation alone cannot release a held press. Early proximity feedback without physical contact must not commit.
4. Dock ignores head yaw after placement and preserves local-floor Y. Approximate follow uses only large head XZ translation with a deadzone, not a walking classifier. Horizontal wide oval, independent height, common distance scale retaining aspect ratio, icon physical sizes independent from rail distance. Central handle controls all three.
5. Flat palm moves front child continuously; enough travel closes one. Withdrawal/cancel recovers, Catalog stays. Preserve approach/angle/rearm/jump protections. Expose diagnostic state only to developer inspection, not product UI.
6. Layer overlap derives from actual header and variable heights so only rear titles remain exposed. Rear body/sheet becomes faint; exposed title remains readable. Back navigation is confined to exposed title and compatible with manipulation capture.
7. Title drag moves the whole window stack; distinct outer corner handles resize everything proportionally. Physical input distances remain consistent under transforms. No row/back/palm/manipulation capture conflicts.
8. Keep placement/size within the current MR session; reset safely on MR re-entry/reference-space reset. No persistent spatial anchors.

All oval dimensions, ranges, brightness, opacity and deadzone are provisional Quest tuning values. Initial Dock is lower and farther than round 3, within tested reachable bounds. No eye/torso tracking or OS-native APIs assumed.

## Evidence and completion

Frozen investigation: coordination docs/quest-round4-facts-2026-10-24.md and validation/quest-round4-facts-2026-10-24. Add regressions before fixes, preserve first failures. Node/test/build/browser HDR and no-env MR are separate from real Quest acceptance. Independent Standards/Spec/motion and screen review must close P1/P2 before safe preview publication. Deliver exact SHA, provisional numeric table, interaction instructions, proof limits and next two steps to coordinator. Lookdev b0efff2/2372 and #11/#12/#13 gates remain separate.

## First trial values (not Quest-accepted defaults)

| Parameter | Trial | Range / meaning |
| --- | --- | --- |
| Oval horizontal aspect | 1.5:1 | Fixed while distance changes |
| Forward radius / height below initial head | 0.40 m / 0.36 m | Radius 0.25–0.50 m; height −0.50…−0.18 m |
| Reach / azimuth | ≤0.72 m / ±75.6° | Radius limited jointly with angle and height |
| Follow | 0.15 m XZ deadzone, 6/s response | No yaw/Y follow; no walking classification |
| Handle acquisition | 25 mm to face | Lower handle; separate end pads resize icons |
| Window root scale | 1.5 | Uniform 0.9–2.2; text/icons included |
| Rear sheet/title | 0.24 / 0.92 | Opacity multiplier / exposed title opacity; HDR/MR must be checked |
| Layer physical depth at initial scale | 35 mm | Existing 30% reduction, scales with whole window |
| Click release | Stable crown/bubble fully outside finger radius + existing 3 mm retreat | Conservative so visual deformation cannot click by itself |
| Palm | Existing 50 mm close / 40 mm rearm | Angle/late-valid gates unchanged; diagnostic fields expose rejection |

Move Dock: pinch lower central bar; slide sideways, up/down, toward/away. Plate ends resize icons only. Move stack: pinch title; corner controls scale the stack. Rear title tap goes back; title drag never navigates. Session entry/reference-space reset initializes placement relative to the current viewer and resets capture, without persistence.

Motion review uses apple-design and emil-design-eng (review-animations unavailable). Frequent interaction feedback is immediate and direct; springs remain for recovery and navigation. Reduced motion retains direct manipulation and substitutes stationary fade for automatic level travel. Accessibility checks cover physical touch targets, input alternatives and title visibility; variable real passthrough contrast and Quest reach comfort remain device checks.
