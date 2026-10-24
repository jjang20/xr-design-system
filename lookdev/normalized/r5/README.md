# R5 actual state fixtures

This isolated harness pins product source `663c80c9d556eaa0e15c3ebdc1d1014a86dd526c` and 91 source/asset records. Its contract is a new version; the b0 reference, PR14 and R4 evidence remain unchanged. All R5 sizes, opacity and input thresholds are trial values.

The browser runs the product's actual InputSystem, components and shaders. Synthetic WebXR joint/select events test the software path. They do not measure the headset's hand recognition or pinch classifier. Layer navigation uses the actual product navigation handlers with synthetic row selection.

Read `contract-errata.json` with the frozen execution contract. Its `heldLocalDentM` field was misnamed: 1.5mm is the **physical world** dent, while local dent is divided by the actual handle scale. Receipts export both units and the audit checks their conversion. The completed execution contract stays immutable; future versions must use `heldPhysicalDentM`.

| Lane | Intended finite coverage | What the receipts establish |
| --- | --- | --- |
| Controls | 9 rest/side/corner hover, pinch-held and released states; 5 negative scenarios | Actual owner, pose, scale, visibility, dent/Glow, sheet/title opacity, no title drag or index-only drag |
| Layers | Lighting front/angle/side/back; Modular front/angle | Full slab geometry and original shader, depth opacity, title1, separate visible-surface contribution and exact beauty restoration |
| Dock | 7 states each in HDR and no-environment mode | Fixed stem/sphere, pinch owner, icon lock under a competing hand, release, plate dent and transparency |
| Push | 8 positive/negative joint scenarios | Palm/fingertip contact, one-child close, single-index exclusion, pinch exclusion, approach and articulation safeguards |

Only passing execution receipts count as supported. The table is coverage, not a claim that a run completed. The original failed attempts remain outside this code directory with their traces.

Layer contract revision 4 samples up to 512 uniformly distributed surface points while retaining the 24-pixel ROI and 20-changed-pixel thresholds. A naturally occluded rear body is N/A for that view; each rear level must still show actual scene contribution in another canonical view of the same fixture. The three-layer front view cannot substitute isolated geometry proof for visible scene evidence. Earlier aggregate failures remain recorded.

## Reproduce

Use a frozen archive of the source SHA with the pinned existing dependencies and Node22+. Do not run against a moving product checkout. Each command requires a fresh output directory and uses its own port (5194, 5195 or 5196). These scripts close their own browser/server in `finally`; they do not touch the product preview.

```sh
node lookdev/normalized/r5/controls_capture.mjs SOURCE FRESH_CONTROLS all
node lookdev/normalized/r5/layers_capture.mjs SOURCE FRESH_LAYERS lighting front
node lookdev/normalized/r5/dock_push_capture.mjs SOURCE FRESH_DOCK_PUSH all
python3 lookdev/normalized/r5/audit_evidence.py SOURCE RUNS_JSON FRESH_REPORT_JSON
```

For the six layer combinations, use the matrix in `layers-contract.json`. `RUNS_JSON` contains a controls directory, six layer directories and dock/push directories; dock and push may reference the same completed `all` run. Keep local paths and operational connection details out of public reports.

Inputs and the comparison contract are checked before/after capture. Receipts pin source, scripts, contract, actual producer ESM and shader identity, camera and output images. `audit_evidence.py` independently checks coverage, source and image hashes, PNG dimensions and proof-level flags. It emits a portable inventory without absolute run paths.

## Renderer boundary

Control dumps include raw geometry hashes, world transforms, shader hashes/uniforms, text bounds and arrow geometry. The bubble dent/squash is evaluated by GLSL: the raw BufferGeometry is **not** its evaluated surface. Normalized Blender export therefore remains unsupported and fails closed. These browser results do not prove cross-renderer pixel, colour, material or optical equivalence.

The historical R4 strict calibration stays **2/6 PASS, 4/6 FAIL, unresolved P2**. Its edge-raster difference has not been waived or fixed by R5 browser checks. Native renderer support requires a separately evaluated geometry adapter and calibration; no fallback silently substitutes row press for held.

Same-condition browser comparisons can use only independently accepted current states. Design selection belongs to the user via the coordinator; #11 remains open, #12 starts after selection, and Quest acceptance is separate.
