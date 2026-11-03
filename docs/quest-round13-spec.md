# Quest R13: direct window pinch and lower sphere Glow

Baseline 7d40d51d9358501afd0a3e9ef6d64eef4342166b. User Q68 accepts the current single Dock hover appearance; enlargement is not a restoration target. Existing magnify code and the user's report that enlargement was not visible are separate facts. No broad Dock change is required. Actual multi-contact and actions remain.

Q69 requests press/held Glow while retaining accepted lower-sphere shape/pinch/recovery and removed stamp. Split contact light from contact mark: retain DEFORMATION_ONLY, zero lip/glint/shadow and no local well. Only the lower sphere opts into existing core and Fresnel rim light; no hover light. No Current/material, plate, icon or other control-light changes. Normal/reduced and HDR/no-env evidence remains separate from Quest perception.

Q70 replaces separate side move bubbles with direct pane pinch and local pane depression while moving the whole stack. Corner sphere/arrow resize, input ownership, Q48/list/Push and rest pane appearance are retained. Q71 selected the left/right pane edges. The title and body interior do not start movement. Separate side bubble visuals and their hit geometry are removed; the existing corner sphere/arrow stays unchanged.

Fixed regression and screen evidence, independent existing Spec/Standards/motion review precede the same Draft PR5/exact5187 update. Until then 7d preview remains. No merge, public deploy or automatic device collection. #12 same-device performance and #13 device acceptance stay open.

## Historical preparation before Q71 (superseded by integration below)

At 4a8c7df, the unconnected WindowSurface target required an explicit caller-supplied region predicate; no production start area was selected or wired. Its opt-in pane-local depression uses a separate shader uniform/profile, so row hover slots cannot erase it. CPU ray mesh and shader use the same front-only Gaussian with an edge fade. Prototype hold depth is 1.5 world mm capped to 40% of real local pane thickness, radius 18 world mm. These are bounded trial values, not user-selected constants. This historical preparation did not change pane/side controls; the confirmed Q71 integration below replaces it.

## Q71 integrated trial

The active front pane has a separate manipulation target over its real skin; rear title Back stays on its original title target. An explicit pinch may cancel pending row navigation before moving the stack; non-pinching tips never acquire this target. Existing grabbed controls retain ownership. Ray hits are filtered to the same edge region and drag on the front plane. Direct hand movement retains XYZ travel. The edge band is at most 12 physical mm and capped to the existing row inset, within the rounded pane silhouette. Dent depth remains capped at 40% of pane thickness; spot stays at the original grabbed pane point. These are engineering trial values, not additional user decisions.

Historical side-bubble shape/reveal tests now cover the retained corner control; direct pane tests replace side movement, cancellation, physical alignment, and restore expectations. Pane visibility remains continuous; only corner controls retain hover OR held reveal.

## Edge seam correction

The initial b943 front-only mask was replaced after geometry review: pane dent now weights every front/round-edge vertex continuously by rest z/thickness. Back and outer silhouette remain fixed; the mapping Jacobian stays positive (at least .6). Optical normals use its inverse transpose. Direct pinch distance samples the actual tessellated/deformed front mesh, including bevel height; it no longer assumes a flat t plane. Existing row bulges remain on their original front-only path. Ray dragging keeps the established capture plane.
