# Normalized Catalog reference

This adapter exports the actual Catalog geometry and typography from a frozen product snapshot, checks them in Blender, and produces a labelled physical material reference. The implemented capture is **rest/front only**, at **1600 × 1000** and a **26° vertical field of view**. Other states and views fail closed.

The adapter code is developed on the product codebase at `a7d5d5142d24e212029edba7e3b11519843d2762`. Its **render input remains `b0efff2de1860e5d2f39dc65b17db250f3c6b627`**. A checkout containing the adapter is therefore not automatically a valid input snapshot. R3 layout changes and subsequent interaction or design requests remain separate; adopting them requires an explicit new comparison contract and input bundle.

The frozen contract retains the historical planning-time `renderGate` fields. Those fields are not a current execution authorization; callers must satisfy their own execution gates. This recorded run satisfied its command, transfer, and GPU prerequisites separately.

The input pins are:

| Pin | Value |
| --- | --- |
| Contract | [`baseline/comparison-contract.json`](baseline/comparison-contract.json) |
| Contract SHA256 | `2372f3a6d156416f37f5971130eb2e12d319aec0db7a9bb8698efe06398d6cad` |
| Source/asset input digest | `7128e3948de73654a078f93cf5de3d4759d29caa049c860e1c11931a87c40cce` |
| Input inventory | [`baseline/manifest.json`](baseline/manifest.json): 45 source files and 42 installed dependency assets |

## Prerequisites

Use an isolated, immutable snapshot of the pinned input files, with its existing `node_modules` dependencies matching the manifest. The export process needs Python 3, Node 22+, the existing Vite and Playwright dependencies, and the Google Chrome installation configured in `export_browser.mjs`. The current exporter runs on macOS and starts a temporary local server; its configured port must be free. These instructions do not install or update dependencies.

Native rendering requires the already verified Blender 5.2 runtime and an available OptiX device. GPU renders enable OptiX devices only and disable CPU rendering. Geometry-only preflight does not require a GPU. A process failure, missing device, hash mismatch, unsupported capture, or geometry mismatch stops the run; no fallback font, SVG import add-on, or CPU render is substituted.

Give every run a new bundle, browser evidence directory, and renderer output directory. Keep the source snapshot unchanged between preparation and export, and use the same snapshot for both commands. The exporter rechecks all 87 input files before and after capture and verifies the exact contract bytes and bundle identity. It rejects an existing `normalized.json` and creates that file exclusively. A completed bundle is immutable; create a new bundle for another export.

## Prepare and export

Run from the adapter checkout. The relative paths below are examples for new, owned run directories.

```sh
XR_SOURCE=./source-snapshot
XR_BUNDLE=./runs/catalog-001/bundle
XR_BROWSER=./runs/catalog-001/browser

python3 lookdev/normalized/prepare_bundle.py \
  --source "$XR_SOURCE" \
  --baseline lookdev/normalized/baseline \
  --out "$XR_BUNDLE"

node lookdev/normalized/export_browser.mjs \
  "$XR_SOURCE" "$XR_BUNDLE" "$XR_BROWSER"
```

Preparation verifies all 87 pinned inputs and copies the required assets and licenses. The four derived Inter SFNT files preserve every decompressed canonical WOFF table byte, including `head.checkSumAdjustment`. A deterministic table layout gives each complete SFNT the expected `0xB1B0AFBA` checksum; individual table bytes, table checksums, and output hashes are checked separately.

The exporter waits for actual text layout, checks eight populated icon canvases, verifies an unpressed and unhovered Catalog with no bulge, and records three stable frames. It extracts the actual window, beads, and separators. Troika's canonical WOFF shaping supplies glyph identities, positions, kerning, anchors, and em tracking; glyph outlines become flat triangle meshes. Lucide strokes likewise become flat silhouettes. Blender performs no additional font layout and uses no tubular SVG approximation.

Outputs include `bundle/normalized.json`, `browser-preflight.json`, `browser-calibration.png`, and `browser-beauty.png`. Preserve their hashes with the contract, adapter source, font hashes, and the run's actual process results. Before publishing generated evidence, review it for environment-specific paths; the exporter can record resolved font source locations.

## Native preflight and calibration

Use the established transfer method to place the complete bundle and the exact `render.py` into an owned native run directory. Verify file sizes and SHA256 values after transfer. The following PowerShell examples assume that directory is the working directory and the existing Blender executable is available as `blender.exe`.

```powershell
& blender.exe --background --factory-startup --python-exit-code 1 --python ./render.py -- `
  --bundle ./bundle --out ./preflight-001 --state rest --view front `
  --preflight-only --calibration
if ($LASTEXITCODE -ne 0) { throw 'Catalog preflight failed' }

& blender.exe --background --factory-startup --python-exit-code 1 --python ./render.py -- `
  --bundle ./bundle --out ./calibration-001 --state rest --view front --calibration
if ($LASTEXITCODE -ne 0) { throw 'Catalog calibration failed' }
```

Preflight compares evaluated mesh bounds and triangle counts, camera framing, clipping, nominal dimensions, text placement, and asset hashes. The source window mesh has an approximately 10 µm minimum extrusion core above its nominal 8 mm thickness; the adapter preserves that measured mesh and reports the nominal value separately.

Calibration uses the same unlit linear palette in both renderers, opacity 1 for every mesh, and no text outline or shadow. Browser output uses no tone mapping with sRGB output; Blender uses Standard/None, exposure 0, gamma 1, and no denoising. Retrieve the resulting image and evidence into fresh paths, then verify their sizes and hashes.

Compare the **unaligned** browser and Blender calibration images before judging materials. Record framing, window-mask overlap, foreground silhouette distances, and visible glyph/icon differences. The browser retains SDF text and rasterized icon edges, while Blender renders geometry; antialiasing differences must be measured rather than hidden by registration or claimed as pixel equality. External image comparison and visual review are separate from the adapter's `preflight.json` result.

The checked comparison can be reproduced with existing Pillow, NumPy and SciPy:

```sh
python3 lookdev/normalized/compare_calibration.py \
  "$XR_BROWSER/browser-calibration.png" ./retrieved/rest-front-calibration.png \
  --out ./runs/catalog-001/calibration-comparison.json
```

The comparison applies fixed silhouette thresholds without registration: equal window bounds, window IoU ≥ 0.995, foreground maximum distance ≤ 2 px, and white-content IoU ≥ 0.85. It rejects a blank or non-opaque capture. These thresholds are registration checks, not perceptual design acceptance. See [recorded images and summary](evidence/summary.json).

## Physical reference

After the geometry/type comparison has been accepted, render with a new output directory:

```powershell
& blender.exe --background --factory-startup --python-exit-code 1 --python ./render.py -- `
  --bundle ./bundle --out ./reference-001 --state rest --view front
if ($LASTEXITCODE -ne 0) { throw 'Catalog physical reference failed' }
```

This mode uses the contract's Cycles physical recipe, HDR environment, and AgX transform. Record the actual OptiX execution, retrieve the image, verify its hash, inspect its content, and compare background landmarks before treating environment orientation as verified. The script does not automatically certify the external calibration or landmark comparison.

The physical reference and the product use different material and colour pipelines. A successful render establishes neither product-shader equivalence nor Quest contrast, performance, comfort, or acceptance. Product adoption follows a separate design decision and integration process.

## Recorded validation

The current rest/front run completed native preflight for **104 meshes** with **zero evaluated-bound drift**. The OptiX calibration render returned exit code 0 and produced a retrieved, hash-verified 1600 × 1000 image; its recorded render interval was 0.979 seconds for that run.

External comparison measured an unaligned window-mask IoU of **0.999759** and a maximum foreground silhouette distance of **1 pixel**, consistent with the retained raster/SDF edge differences.

The subsequent OptiX physical reference returned exit code 0 with a recorded render interval of **5.163 seconds**. Its 1600 × 1000 PNG and associated evidence were retrieved and hash-verified; the image is **1,657,101 bytes**, SHA256 `21fb306dfd58d36f35048c98d1a455fd5640eb6878f2ad23118e154d3fe4d3f1`. These timings describe the recorded runs, not a general performance benchmark.

Background landmarks support the same environment orientation for this fixed front view. The left door/wall boundary retains a **5-pixel residual**; horizontal-edge analysis reports correlation **0.855** with a best diagnostic shift of **3 pixels**. This checks orientation while preserving the measured discrepancy. Exact optical alignment, physical lighting, colour equivalence, other views, and Quest acceptance remain unverified.

## Asset licenses

Generated bundles retain `licenses/Inter-LICENSE` (SIL Open Font License 1.1) and `licenses/Lucide-LICENSE` (ISC, including the listed Feather-derived MIT notices). Keep those notices with redistributed assets. The HDR is Greg Zaal's [Lebombo](https://polyhaven.com/a/lebombo), provided by Poly Haven under [CC0](https://polyhaven.com/license).
