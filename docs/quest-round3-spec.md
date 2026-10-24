# Quest feedback round 3 — 2026-10-24

Baseline: `b0efff2de1860e5d2f39dc65b17db250f3c6b627`. This is the user's input/layout follow-up, separate from lookdev tickets #11/#12. The integration session is the sole product and preview writer.

## User contract

1. Lower the obstructing Dock and add a dedicated handle. The confirmed rail is a sphere around the user: fixed reach, horizontal and vertical placement. Keep the plate ends for resizing; the lower handle is for placement. Pinch or controller drag acquires it; release retains placement. WebXR head translation and delayed yaw estimate the body anchor, not tracked torso pose.
2. Restore reliable single-target icon hover and direct press. Diagnose the regression rather than changing tracking thresholds blindly.
3. The Dock plate must show solid-bubble press feedback/denting under a fingertip, including while sizing.
4. Window row press glow must appear immediately for fingers as well as rays.
5. Deliberate flat-palm contact moves the whole front layer and closes only that child; Catalog remains. Avoid point-finger false positives, tracking jumps, cascade closes and abrupt disappearance. Click/open and Push feedback must remain observable and interruptible; reduced motion keeps hand-driven movement but removes automatic travel.
6. User selected **50% window enlargement and 30% smaller physical layer spacing** in this round. These affect contact geometry and belong with input validation. Materials, icon styling and visual adoption remain in the separate lookdev flow.

## Candidate parameters and invariants

- Dock radius remains 0.4 m; initial elevation -45 degrees. Handle moves azimuth and elevation (clamped -79.2 to +30 degrees), retaining the pickup offset. Placement is session-local.
- Main demo window root scale is 1.5; local layer spacing is `0.7 / 1.5`, yielding physical spacing 0.7 of the old layout. `?layout=previous` compares old dimensions with current input. Bench preserves historical framing unless `?layout=quest`.
- Preserve fingertip radius plus 10 mm early contact, front-approach guard, single-target ownership, Catalog root, token file and generated schema.
- Palm contact starts only after same-hand approach. A brief tracking/orientation gap freezes for at most 80 ms; unseen movement cannot close. A step over 80 mm cancels. Re-arm requires 40 mm of actual hand withdrawal.
- Recognition/calibration and comfort still require Quest acceptance. Browser joint replay is not physical-device proof.

## Confirmed causes

- The old plate hover band disabled all icons before a grab. Moving the Dock from 55 to 40 cm enlarged this interference relative to icon spacing. Plate proximity now competes in the same input arbitration; only an actual plate press/grab blocks icons.
- The plate had grab glow, but no direct-contact PressModel/dent path.
- Row glow followed spring dent depth, so first-frame shallow contact was weak. Contact light is now independent of spring travel, with the same existing material glow path.
- Palm candidates behind a window could swallow unrelated input. Single missing/alignment frames reset the gesture; pointing fingers could resemble palms. These are bounded/filtered, with explicit ownership and grace.
- A pushed child could cross its parent before closing. Ancestors follow during the direct gesture to preserve separation.

## Motion review changes

| Before | After | Why |
| --- | --- | --- |
| Glow waited for substantial dent travel | Contact lights immediately; deformation follows existing physical response | Shallow and quick presses remain visible |
| One bad tracking frame snapped the pushed layer back | Freeze briefly; reacquire without unseen travel | Preserve gesture continuity without false dismissal |
| Child could pass behind its parent during Push | Preserve separation while directly pushed | Keep the whole layer visible until close |
| No user placement control | Direct angular handle drag with retained placement | Keep the Dock out of the user's view without changing reach |

## Verification and next two steps

1. Root: run Node/token/build, real Chrome joint/ray replay, screen inspection and separate standards/spec review; fix findings before publishing a preview candidate. Prerequisite: these user-confirmed requirements. Record exact SHA and artifacts in the research workspace.
2. Root: serve an isolated verified SHA at the existing Quest URL/certificate and hand off size/input differences to lookdev. User: verify comfort, finger targeting, resize dent and flat-palm close on Quest. Prerequisite: review closure and HTTPS smoke. Keep lookdev #8 on b0efff2 until its owner reconciles the new evidence; do not claim #11/#12 or Quest acceptance.
