# R8 bounded Dock / Push diagnostics

Frozen product: `61c7ba019eb6c1a535a7dbd8ce05265fc0be818e`. This lane uses actual product `InputSystem`, Dock and PackagingPanel with synthetic WebXR joints. It is local diagnostic evidence, not hardware tracking, Quest acceptance, a candidate board or Blender geometry export.

## Executed result

`dock-run-04` passed **39 distinct checks / 73 lane judgments**, with **17 PNGs** (Dock HDR8 + no-environment2, Push HDR3 + no-environment3 + reduced-motion1). Across preserved attempts01–04 there are **19 actual PNG files**: attempt03 contributes2 and04 contributes17. Candidate images remain0. Source100 records and all adapter/runtime hashes matched before and after. All images are1600×1000. Own Chrome exited0 and port5196 was no longer listening; no cleanup fallback was needed.

The parent run directory is `.scratch/xr08-r8-states-20261025-1312`. `dock-audit.json` validates execution/schema, font readiness, image hashes/dimensions and unchanged implementation; `dock-handoff.json` pins the evidence. These are local checks pending independent review.

## Finite support

- Dock .4m:11.2mm nominal symmetric profile,42mm pads,10mm plate dent radius,5mm physical/3.5mm held dent,8mm sphere width with4mm pressure/3mm held floor; accepted alpha/22.4mm Glow unchanged.
- Rest and numeric approach/hover, right end held/lock/release, sphere physical/held, both-end plate contacts, two independent Dock app selections and additional fingertip feedback. All five labels are shaped before capture; font readiness is not UI readability acceptance.
-48 fixed analytic/actual-mesh samples. Narrow plate dent reaches4.9908mm with8.3325mm half-depth radius and exact mesh restoration. Actual input at both caps gives9708 top/bottom pairs each, zero inversions.
- Sphere uses three actual mesh vertices evaluated with live product shader equations: pressed concavity+0.3754mm versus negative control−0.4627mm. Separate rendered uDent counterfactual changes1348 pixels/max191 and restores exactly. That GPU diagnostic includes dent shading; it is not a GPU vertex readback or physical optical equivalence.
- Push same-frame close only:25mm setting preserved,100ms hold +100ms exponential decay, Catalog preservation, no row-click leakage, HDR/no-environment/reduced-motion modes. Other broad-hand/input regressions are product evidence, not rerun here.

Counterfactual rendering uses a fixed RGBA8 target and fixed camera. Two fixed warmup frames precede unchanged on/on control and on/off/restoration. Unchanged and restored controls must be exact; thresholds were not relaxed. Pixel contribution is not perceptual salience or passthrough visibility.

## Preserved failures

1. `dock-run-01`: sandbox localhost listen EPERM, no acquired Chrome. It is an environment failure.
2. `dock-run-02`: first-render restoration failure, not accepted as material contribution. `dock-warmup-change.diff` records the fixed preparation/control change.
3. `dock-run-03`: adapter used Y instead of Z in the XZ half-depth radius. Raw failure/2 PNGs preserved; `dock-coordinate-change.diff` records the one-axis fix. Cap ordering itself passed.
4. `dock-run-04`: successful final run; source100/hash/pixel restoration/cleanup checks above.

Real adapter failures02/03 exercised primary-error retention and independent browser/server cleanup. Full font/evaluation phases are bounded by the shared helper and passed in04; this lane did not inject a separate actual-font timeout. The earlier source-independent runtime fault suite remains separate evidence.

Legacy oldest-sheet RGB9/max2 FAIL, separate alpha evidence, R4 strict P2, prior R5 erratum and Blender evaluated dent/squash/multipoint unsupported remain unchanged. No claim is made about navigation transaction arbitration from independent Dock app actions.

## Reuse boundary

Only a new exclusively owned output directory and confirmed free/owned port5196 may be used. Preserve historical runs. From the isolated checkout, with the pinned source and Node22:

```
node lookdev/normalized/r8/dock_push_capture.mjs <frozen-source> <fresh-owned-output> all
```

Shared `runtime.mjs`, guards, baseline and product files remain root-owned and are hash-gated. The helper owns browser/server acquisition, whole setup/font/evaluation deadlines, output guards and cleanup. This document is not permission to start candidates, remote render, product changes or another run.
