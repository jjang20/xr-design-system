# R8 state diagnostics and bounded material comparison

This adapter reads the frozen product source `61c7ba019eb6c1a535a7dbd8ce05265fc0be818e`. It does not change product components, tokens, input behavior or the live preview. The baseline contains 58 Git inputs and 42 installed assets, with a separate contract hash and ordered input digest.

## Verified state support

- Controls: 27 unique synthetic input traces and 31 PNGs across bounded runs, including Q48 grouped navigation, actual pinch manipulation and full-hand hover. Three additional no-PNG fault cases exercise total evaluation/font deadlines and summary-write failure with independent cleanup.
- Dock/Push: 39 unique checks / 73 judgments. The final run produced 17 PNGs and exited normally. Including the preserved failed attempt, 19 images exist. CPU mesh deformation and rendered shader contribution are distinguished.
- Layers: 158 data checks across two fixed views and 25 PNGs. Both normal browser-close attempts timed out and used verified owned-process cleanup. These runs are **not** normal-lifecycle passes. Their intact captured data are accepted only as fixed-source reference records.

The complete rear-visibility matrix did not pass. In Modular/angle, the oldest rear sheet has only 8 projected scene samples, below the unchanged minimum of 24, so its visibility is N/A. This restriction must remain visible in comparison material. No new camera or threshold is substituted.

`controls-plan.json` records the final 27-trace scope. The immutable parent contract predates the three extra Q48 cases and contains the earlier 24-trace plan; it is a creation snapshot, not a completed-run status. Likewise, pending fields in frozen contracts and `comparison-plan.json` describe their creation time. Execution receipts carry actual status.

## Comparison order

```text
exact source and 100 input hashes
  -> state/error-path evidence + independent review
  -> first Current: data, image and own normal lifecycle acceptance
  -> reject misbound image/review evidence
  -> remaining 11 images, each condition Current before A/B
  -> image audit and user selection
```

The four conditions are Catalog rest/front, actual side-pinch held/front, Lighting/front and Modular/angle. Only nine `look.glass.window` leaves may vary: albedo, knee, saturation, rim line, shoulder, edge, frost, grain and key light. Alpha hierarchy, pane geometry, type, icons, input, Dock, Glow, camera, HDR and shared blur remain fixed. A/B values are proposed visual hypotheses and are not adopted product defaults.

The candidate adapter compares the complete numeric window-uniform inventory against separately captured current-source references. It binds first-image acceptance to the exact receipt, PNG, review and normal lifecycle of that run. A successful injected-error test cannot replace a failed normal teardown.

## Running with reviewed evidence

Use the project's existing dependencies and Node 22 or later. Each command requires a fresh output directory and its exclusively owned local port. Do not reuse completed runs or unknown active resources.

```sh
node lookdev/normalized/r8/candidate_capture.mjs SOURCE FRESH_OUTPUT ACCEPTANCE_JSON first
node lookdev/normalized/r8/candidate_capture.mjs SOURCE FRESH_OUTPUT ACCEPTANCE_JSON remaining
```

The acceptance JSON pins the same-source references, code, plan and independent audit. `remaining` additionally requires independent first-image acceptance. The code rejects unaccepted or drifted inputs before starting a browser. The source-state runners have analogous source/fresh-output arguments; see the lane READMEs and script usage.

All work, font/evaluation phases, reporting and cleanup have explicit deadlines. Failure receipts remain separate from successful retries. `audit_r8.py` audits saved evidence without rendering; its readback result alone never grants candidate execution.

## Limits

These are desktop WebGL and synthetic-input observations, not Quest tracking, passthrough contrast, comfort or headset frame-time measurements. Font readiness is distinct from visual readability. Base geometry and uniforms do not establish Blender evaluated dent/squash/multipoint export or optical equivalence. Historical failures remain preserved in local evidence. User design selection and subsequent product integration remain separate steps.
