# Token v0.2 compatibility integration — 2026-10-23

Status: runtime compatibility fixed and locally validated. No remote push/merge, Figma write, visual approval or headset validation.

## Ownership and sources

- Single writer: current Codex session `382d4835-ac4d-4ff8-86f8-abc3f200c9c0`.
- Branch: `codex/token-v02-integration-2026-10-23`.
- Worktree: `/Users/jony/Documents/ai-workspace/xr-design-system-integration`.
- Base: recovered Arena `292f2d2beff2edcf380dd10aa1a05cd7e47bdfdc`, on Core PR #3 `93fb3886037b75d8ab547d1f409e7b8128d62edb`.
- Pipeline source: PR #4 `b99dbbd1116c42060743265627b6f20448f03354`, applied as a patch against `d8faa32200047ac9e6c1fd53be29a2244f449916`.
- Original Core, Tokens, Arena, Icons and v0.1 recovery worktrees remain clean at their preserved heads. Icons `12cb730` and the held v0.1 press-travel rule `8ae24e3` are not incorporated.
- Authorization: user's “토큰 호환 오류 해결 시작해”; local reversible implementation/testing/commit. Repository `CLAUDE.md`: “Only push or merge after Jihoon confirms.”

## Reproduction and fix

The original PR #3 `createTokens(PR4_JSON)` failed at `src/tokens.js:26` with `TypeError: TO_SCENE[v.unit] is not a function`. A minimal vpt/m fixture and the full real token file both reproduced it. `node --test test/tokens.test.js` first failed all five tests, including the original unit-converter exception.

The loader now uses the pipeline's shared alias resolution and scene conversion. All 76 runtime values agree with generated output. It still reads the JSON supplied by its caller, so Arena primitive/alias patches reach the actual components. Consumers use the new names and enum values; visual sizes use placement-time f(d), physical hover/input values remain metres, and direct input uses absolute 0.35 m / 0.40 m enter/exit edges. Invalid aliases and units report a token path.

Button, ZSlider and DockIcon direct-touch hit regions respect the existing 22 mm token floor without enlarging visible faces or ray hit regions. Three small-target tests were red before this consumer fix and green after it. Legacy layout options remain dmm numbers, using f(d); `o.density` stays a supported option. Legacy loader `dmm()` and exported `atDistance()` keep linear behavior for old dmm input.

The integration preserves the later Core Dock tuning: 100 dmm → 133 1/3 vpt and maximum scale 1.2. PR #4's older 332 vpt / 1.6 values would undo that tuning. Source descriptions, decision §25 and generated files record the reconciliation.

Arena now keeps both the recovered Catalog-specific checks and PR #4's alias-aware motion checks. A catalog regression confirms the breadcrumb check still fails an unreadable title and does not try to read button-only pixel metrics. No old visual score is promoted or rerun as a new pass.

Root commands combine the two branches: `npm run build:tokens` regenerates token outputs; `npm run check` rejects stale outputs; `npm run build` validates and builds the demo; `npm test` runs runtime and Arena tests.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Original runtime boundary + aliases + distance sizing | 5/5 pass after red reproduction | `test/tokens.test.js` |
| Real consumer construction, physical input edges, fingertip floors | 5/5 pass | `test/token-consumers.test.js` |
| Runtime/interaction suite including existing regressions | 41/41 pass | [tests.log](validation/token-v02-2026-10-23/tests.log) |
| Arena suite including scene selection and alias propagation | 6/6 pass | [tests.log](validation/token-v02-2026-10-23/tests.log) |
| Real Chromium/WebGL regression script | 12/12 pass, no reported page errors | [regress.log](validation/token-v02-2026-10-23/regress.log) |
| Token consistency + Vite production build | pass, 76 tokens / 19 aliases / 17 provisional | [build.log](validation/token-v02-2026-10-23/build.log) |
| Final regenerated outputs | JS/CSS/Figma outputs current | `node scripts/build-tokens.mjs --check` |
| Conflict markers and whitespace | no unresolved conflicts; `git diff --check` passes | Git working tree check |

Browser command: `CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run regress`. This is the repository's existing regression script, run against the integrated real page using software WebGL. It verifies interrupted Packaging navigation, input gates, reduced-motion paths/fades, press ownership, cancellation and the Dock's pinned ray dent. It does not establish headset performance or visual quality.

## Motion review

Applied `emil-design-eng` and `review-animations` to the token-consumption delta. No animation duration, easing curve or spring response was newly tuned.

| Before | After | Why |
| --- | --- | --- |
| Old hover/recovery names cannot resolve | `Button.js:74–82`, `DockIcon.js:97` resolve the same timing through new names/aliases | Preserve feedback timing while fixing the loader contract |
| Old Packaging duration name | `PackagingPanel.js:52` reads `motion.expand.duration` | Keeps the same interruptible spring response; browser interruption tests pass |
| Existing reduced-motion paths | `Button.js:273`, `DockIcon.js:148`, `PackagingPanel.js:71` retained | Browser tests confirm distinct, fade-based reduced navigation |

Verdict: **Approve the compatibility delta.** Overall motion/design shipping approval remains outside this result. Existing documented gaps remain, including Dock head follow under reduced motion and Arena's unresolved motion/visual findings.

## Limits and next two steps

The validator still warns that some thin/rigid press-travel combinations are shorter than release distance. This is the known held design question; the recovered v0.1 rule was not silently adopted. Dense targets at hand distance need overlap/usability evaluation when invisible hit areas expand. Headset input, comfort, readability, tracking and performance remain unverified. Figma output generation is not a Figma import/readback result. The prior Catalog Arena decision remains Not yet; Room planner placement/rotation/locking is still outside this compatibility fix.

1. **Integration review / remote PR.** Owner: current Codex. Local implementation and validation are ready. Review the preservation of Core Dock tuning and the documented v0.2 input semantics, then publish an integration PR only after Jihoon's confirmation. Base before remote review: re-fetch PR #3/#4 and reconcile any changed heads. Proposed title: “Fix v0.2 token compatibility across Core components and Arena”. Proposed description: “Core components crash when loaded with v0.2 tokens and continue to read obsolete token paths. Integrate the token pipeline with shared alias/unit conversion, migrate consumers and physical input edges, and preserve recovered Dock tuning and Catalog checks. Validated by 41 runtime tests, 6 Arena tests, 12 Chromium regressions and a production build. Headset and visual approval remain pending.”
2. **Room planner and headset review contract.** Owners: Jihoon for product/design choices, Codex for implementation after the contract is set. Dependencies: reviewed integrated baseline; choose the v1 placement/rotation/locking flow and identify the editable Figma source. Validate physical input and close-target overlap on a headset before calling the design shippable. No new feature or Figma execution has started.


## Independent review follow-up

The current Codex proceeded with the integration review without requiring a new user initiation. Two independent review axes found three distinct implementation issues (overlapping direct-touch actions, far-distance typography, scaled physical input). Follow-up fixes and eight additional regressions are complete; both reviewers confirmed no remaining blocking issue in their reviewed scope. The latest validation is 49 runtime/component tests + 6 Arena tests, 12/12 Chromium checks and a production build. See [review and closure](token-v02-review-2026-10-23.md) for sources, findings, evidence and the prepared remote PR action. This supersedes the earlier implication that technical review itself was waiting for user action; only the documented remote publication gate remains.
