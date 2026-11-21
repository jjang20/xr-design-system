# R8 controls technical evidence

This lane owns `controls*` only. Product source is fixed to `61c7ba019eb6c1a535a7dbd8ce05265fc0be818e`; source/assets, camera, Current material, typography and geometry follow the parent R8 contract. All tested contacts and pinches use the actual producer `InputSystem`, `PackagingPanel`, `WindowControls` and shaders. A synthetic XR joint/event provider supplies input; this does not validate Quest tracking or comfort.

The declared normal coverage is 27 jobs: nine rest/hover/held/release states, five negative manipulation paths, four multipoint/full-hand traces and nine Q48 navigation traces. Rest and side-held keep the shared `applyControlsFixture` API and are the two independent Current references. The three extra Q48 traces (singleton, all cancel, leaf callback cancellation) were accepted before execution. Three no-PNG actual-adapter fault integrations are counted separately.

The maximum 31 technical PNGs consist of nine beauty images, four sets of four control alpha observations, and two sets of three multipoint secondary on/off/restored RGB observations. Failed and completed runs are immutable. A later batch may finish the remaining jobs without repeating successful PNG outputs; aggregate coverage must list those batches and their original failures rather than claim one all-green suite.

## Q48 and full-hand evidence

- Same-parent overlapping navigation waits until all relevant contacts finish. Only the last valid release opens a child. No intermediate child or original-parent recession occurs while another navigation contact remains held.
- Same-frame ties use independently recorded press-start epochs followed by the real Catalog fallback stable keys. The canonical Catalog lacks explicit item IDs, so explicit-ID reverse sorting remains outside this harness.
- Loss and lateral cancellation cannot replace a valid pending selection. All-cancel opens none. A singleton opens in its physical-release frame. Distinct leaf contacts execute independently. A real leaf callback calling `back(0)` cancels queued navigation without resurrection; other cancellation entry points belong to the product regression coverage.
- Full-hand pose includes wrist, four finger tips and proximal joints. One extended index plus three curled non-contact fingers yields one row hover/bulge after 60 frames. Actual curled-tip contact remains actionable; changing only proximal pose preserves the captured press offset. The sub-hysteresis probe uses 1 mm contact followed by 0.1 mm separation, below the 3 mm retreat threshold.

## Capture and limits

Actual producer ESM identity, complete DEFAULTS, numeric pane/handle uniforms, geometry buffer hashes, real Troika text/font readiness, icons, arrows and camera/framing are recorded. Handle contact feedback xyz is radius-normalized shader space and projects through `body.matrixWorld`; row contact xyz is row-local metres. Thresholds and fixed cameras are not adjusted to obtain passing pixels.

The shared immutable runtime bounds load, complete fixture evaluation, font readiness, capture, reporting and cleanup. Every work-phase host output uses the runtime writer. Summary errors are separately bounded and cannot skip browser/server cleanup. Actual-adapter fault runs deliberately delay capture/evaluation or font-readiness completion, or throw during reporting. They verify expected failure and cleanup, not normal product failure.

The legacy R6 RGB nine-pixel/max2 failure, original six-view failure/N/A, and historical R4 P2 are preserved. Alpha contribution is separate evidence. Base geometry is not the evaluated dent/squash/multipoint surface: Blender deformation export is unsupported. These are technical Current observations, not candidate profiles, a selection board, optical renderer equivalence, design adoption, or Quest acceptance.
