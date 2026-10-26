# Quest R10: observed coverage and independent sphere correction

## Preserved contracts

Keep Current window material, Q49 navigation, Q51 Dock plate shape/thickness/end grips, window thickness/alpha/gaps, icon input, real multipoint, release/cancel/loss and Push unchanged. No new hover cap or input threshold is approved by this slice.

## Actual Q57 observation

The 25-second Quest 3 recording used product `3af398646f03277d52aaf9bccd3338b66ce93981` and diagnostic adapter `59d8121f6ca172a8beec402a244ad5a6f115f8d8527a2702255abc41dc6114ef`. Raw SHA256: `31c332a645837363be0c665a2721df7409c8f179fc7ad916c0c48426fb8654c7`.

The 818 compact row ticks contain no row probe/hover/press/lift. All 372 detailed samples also have no active row shader state. Active hands have complete joint chains; actual product methods put the nearest recorded fingertip 330.10 mm from a row, outside the 100/140 mm hover bands. The record does not demonstrate the reported persistent multi-row response, and does not establish its resolution or user intent.

The sphere has eight recorded poke hover probes, including four with pinch. None has physical contact or held capture. Minimum sampled fingertip-to-skin gap is 28.37 mm; pinch samples remain beyond the existing 25 mm grab range. Primary/secondary dents and held state are absent. Unobserved inter-sample events and other routed component targets cannot be reconstructed from this record. Q58 asks only about timing and target; this slice does not request or start another recording.

## Independent centre-direction P2

The prior actual-InputSystem synthetic reproduction remains valid independently of Q57: after a front press or pinch capture, a fingertip crossing the sphere centre made `normalize(point)` collapse to zero and then reverse the dent onto the rear hemisphere.

For the Dock's existing `followInput` sphere only, preserve the last surface direction while the joint lies inside the sphere minus its existing maximum dent depth. Surface rubbing outside that interior still moves the well. Release/loss still restores the dent, and a new approach can establish a new direction. This adds no token, input threshold, depth, alpha, glow, geometry or capture policy change. Other handle styles retain their existing response.

Regression exercises actual InputSystem press and pinch through +1 mm/0/-1 mm, valid unit direction, surface rubbing, loss recovery and a different hand's subsequent acquisition. These tests must fail on original `3af3986` and pass on the correction. Related manipulation/contact tests and an independent rendered review are required before publication. This synthetic defect correction is not proof of Q56's Quest cause or subjective acceptance.

## Remaining work

Q55 and Q56 remain unresolved pending the concrete observation branch. Existing diagnostic and ordinary previews stay pinned until a reviewed product candidate is explicitly handed over. #12's same-device baseline/refresh/budget measurement and #13's device acceptance remain open; reported frameRate 90 from an instrumented recording is not performance acceptance.
