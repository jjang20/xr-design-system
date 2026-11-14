# Dock content comparison — R06

The separate `dock-content-comparison.html` entry compares seven flat app targets with the existing seven procedural Dock icons. A real public selection opens an independent, equal content pane on that side. Another item replaces the pane; Back closes only the pane. Repeating an item remains a real callback, without a counter, persistent selected state or launched process. The original Planner dot is initial demo data.

## Decision and scope

Q121 chose the same seven flat-row items versus the 3D Dock. Q122 chose seven substantive read-only destinations. This entry builds on product `03ef2c5851533eb2a1105a6bccd16110783d479f`. See [Examples](examples.md) and [Support](support.md) for current entry and evidence boundaries.

Only fixture files and the additional Vite entry change. Shared components, tokens, original demo and previous comparison entries remain unchanged. Plate sizing and lower-sphere placement remain visible but are disabled input targets here; this slice does not validate those operations or final icon quality. Existing Dock magnify/spring calculations are preserved, not reintroduced as a new policy or claimed removed.

## Content

- Planner groups the same four Chairs/Tables catalog items used by R05.
- Measure presents their dimensions and proportional footprints. Each footprint is fitted individually; areas are not a common absolute scale.
- Scan is an authored 4 × 3 m sample diagram, explicitly labeled as a sample, with no sensing.
- Photos displays the already bundled equirectangular room image at its original 1024 × 512 aspect, not a cropped rectilinear photograph. Source: `demo/public/env/lebombo_1k.hdr`, Poly Haven Lebombo CC0, SHA256 `a02c9615adeba91a753c3e4737c3ce7a719273df822eeaa85d24982bd43c9ecb`. The page requests only the same-origin bundled asset. No library or camera access.
- Settings reports actual locale and the input owner/kind of the action that opened it, local-content policy and unknown Quest validation. It refreshes on opening and does not infer hardware, change settings or claim current continuously monitored input.
- Notes is a substantive authored sample note, without editing/persistence.
- Clock reads actual local date/time/time zone when opened. There are no clock timers, background sampling, notifications or telemetry. Tests alone inject a clock.

## Layout and input boundary

Engineering fixture values are not DS tokens or final sizing rules: side centers ±0.32 m, equal 0.54 × 0.36 m panes at y=0.065 m; flat pitch0.074 m and constructor width90/height56 dmm at distance0.6; fixed Dock reference distance0.4 m with whole-fixture scale1.5 and y=-0.29 m; permanent labels0.012 m. The fixed reference feeds the existing Dock update path without live head-follow/manipulation. Initial viewer-relative placement is applied once in a real session; its physical result remains unverified. Desktop framing is 1600 × 1000, distance1.05 m. This is not equal target geometry or an input-equivalence claim.

Flat ray and near eligibility use the triangles of the same drawn rounded face. No hidden rectangular corner target or arbitrary input-threshold enlargement. Dock picking retains the original hover-rest bubble sphere; it is not exact object-mesh picking. Existing front-skin physical contact/crossing remains in use. The fixture-local adapter primes only the actual first ray hit at a fresh semantic/pointer edge, then lets the component's public press/release model run. DockIcon's `sense/update` and Button's input lifecycle are kept distinct.

Desktop pointer, semantic far select/trigger and near contact are tested separately. Synthetic native-joint contact/loss is not proof of Quest support or native-pinch acquisition. There is no tracked-pinch opt-in for these selection targets. True loss, replacement, empty-space release and Reset retain their real rearm/non-steal boundaries. Committed content survives input loss; Reset cancels pending actions and closes both panes. No all-function release policy is introduced.

## Verification and limits

`test/dock-content-comparison.test.js` exercises first visible-target acquisition, all seven destinations, repeat/replace/Back, independent sources, near crossing/joint loss, semantic first-edge/reset/replacement/rearm, finite rounded misses, cancel/dispose and borrowed-resource ownership. It uses real InputSystem/component routing with simulated poses; Node does not render glyphs.

`node scripts/verify-dock-content-comparison.mjs` verifies the actual built entry using desktop pointer/GL: seven content states, synced glyph/target viewport bounds, nonoverlapping permanent Dock labels, original image aspect/pixels, footprint ratios/pixels, return/reset/capture loss and disposal. Actual GL is not a GPU timing measurement. The script closes only its own browser and ephemeral preview server.

Disposal stops routing and removes input listeners immediately. It never requests native session termination: only the explicit XR exit button does. If a request or session is still live, renderer/content cleanup waits for the actual session end; late requests are observed without attaching rendering. A stalled native request/end leaves cleanup pending rather than falsely claiming completion. Attachment errors retain the explicit exit path. This lifecycle is checked with built desktop GL plus JS session doubles, not a real native session.

Entry disposal removes fixture listeners plus specifically tracked InputSystem constructor listeners, owned object-print textures, texts/geometry/materials, local photo texture, environment and renderer. Shared cached Dock environment/soft textures are not disposed by the fixture. No ongoing timers or server remain from desktop verification. An immutable HTTPS preview is a separate subsequent handoff.

Physical Quest acquisition, dynamic readability, comfort, passthrough and performance remain UNKNOWN/unmeasured. Existing negative slider feedback and #12 NOT_MET / #13 OPEN are not changed. GPU work stays deferred. No automatic MR, device card, participant collection, POST, remote publish, push or merge.
