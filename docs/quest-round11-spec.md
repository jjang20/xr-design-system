# Quest R11: explicit group hover and lower sphere feedback

Base: `02e8b4b89598cf7c959b1b944d0feb5d78ce9dea`.

## Accepted and changed contracts

Q60 accepts the R10 single-index one-row hover and pressing. Multiple extended fingertips now follow a new explicit group policy: one non-contact hovered item per actual group, nearest eligible fingertip to the current surface in world metres. Q62 keeps the current item when distances are similar. This replaces only the previous prohibition against a group hover cap; actual multi-contact, independent item execution, Q48 last-valid navigation, release/cancel/loss, pinch and palm remain unchanged. Separate groups are independent; no scene-wide or per-hand limit.

PackagingPanel's explicit `level.rows` collection is one group. Its sheet, titles, controls, other levels and other windows are not implicitly merged into that group. HoverGroup is a peer-collection policy, not a traversal of THREE.Group containers. Each row still receives all routed probes, preserving contact and press history. Arbitration controls only proximity feedback; physical contacts and acquired contact presses do not occupy its visual slot. A pre-contact PressModel state is not a physical touch: it still competes for the single proximity slot and cannot bypass the rule through its glow. Existing physical press/release thresholds are unchanged.

Distance is the eligible probe's world-space skin-to-face approach metric including fingertip radius and component scale. The 2 mm switching advantage is a bounded trial value, not a user-selected final number. The old winner is retained only while still eligible; loss, disabled state, tracking loss and real nearest changes permit another item. A recovering old bulge is a finite visual tail, not an active second hover. Shared panel shader uniforms must converge to only the selected proximity item, while actual multiple contacts remain visible.

Toolbar's explicit buttons array/shared bar uses its own independent HoverGroup and the same actual-contact exceptions. Dock's separate icon magnification path remains unchanged while its hover-versus-magnification scope is decided through Q63. No new group is inferred from the window stack, general scene, or manipulation handles.

Independent review reproduced a false exception: PressModel's `contacted` latch refers to an early frozen release plane. With both tips still 1/8 mm in front of the actual skin, it can become true and bypass the slot limit. Group feedback now records observed finite visible-skin contact separately, without changing navigation/action or release history. The original failed normal/reduced trace is preserved.

Release/cancel clears the contact feedback exception before the same frame's hover is resolved. Independent review found the previous ordering retained two active hovers for one release frame in list/Toolbar poke and controller-ray paths. The four red cases are preserved; recovery geometry can settle after release but is not a second active hover.

## Lower sphere

Q61 remains unresolved on02e including6d. Only the lower sphere at the Dock stem is in scope. Preserve accepted plate geometry/end grips, alpha/Glow, Current material, icons and input. Diagnose normal-distance no-env front/oblique actual geometry, normal response and hand occlusion separately. A bright ring, magnified image or CPU concavity does not establish readable Quest deformation. Bounded real-component comparisons and independent visual review precede any correction; no diagnostic recapture is automatic.

The actual default sphere at about595 mm exposes a distinct acquisition defect: its pressure is radial, but its planar XY `inside` gate rejects oblique approaches until after they cross the existing early-pressure plane. Front history is lost, leaving secondary dents without primary pressure/squash. The Dock follow-input sphere now uses its radial approach for primary poke eligibility, preserving finite separation, front-history/loss/rearm, ray and pinch ownership. Rectangular and other handles keep their old gates. Depth6 mm, held5 mm, alpha and Glow are unchanged. Actual InputSystem tests at35/48/65/90 degrees fail before this correction and acquire/release afterward. This synthetic defect correction is not by itself Q61 subjective acceptance.

## Validation and delivery

Use actual InputSystem tests for multiple tips/hands, world scale, near ties, group independence, nonwinner contact acquisition, real contacts plus noncontact hover, loss/cancel, leaf and Q48. Preserve R10 thumb tests. Check normal/reduced motion and actual panel shader feedback in browser HDR/no-env. Fixed coherent SHA requires independent Spec/Standards/motion and screen review before same Draft PR5 and exact-SHA5187 delivery. Until then preview remains02e. Current unchanged, #12 performance and #13 device acceptance remain open; no main merge or public deployment.
