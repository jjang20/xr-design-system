# Token integration review — 2026-10-23

The review and follow-up fixes are owned by Codex, not a user initiation step. The user only needs to decide genuinely unresolved product/design choices and authorize the repository's gated remote actions.

## Scope and reviewers

- Original review: `git diff 292f2d2...ac3dff0`, one integration commit `ac3dff0cefe5f30bfe38bd979d6c92213137975e`.
- Follow-up: the correction commit containing this report, on `codex/token-v02-integration-2026-10-23`.
- Writer: root Codex session `382d4835-ac4d-4ff8-86f8-abc3f200c9c0` in `/Users/jony/Documents/ai-workspace/xr-design-system-integration`.
- Independent read-only reviewers required by the `code-review` skill: `/root/review_standards` and `/root/review_spec`. Both accepted the review, reproduced findings and confirmed closure on the final code. They did not edit files or create a new main orchestrator.
- Standards: `CLAUDE.md`, `docs/decisions.md`, `docs/tokens.md`, `docs/components.md`, `docs/catalog-spec.md`, `arena/decisions.md`, `arena/lib/bar.mjs`. No repository CODING_STANDARDS.md or CONTRIBUTING.md exists.
- Spec: v0.2 decisions §21–25 and original PR #4 `b99dbbd`. `git fetch origin` plus fresh PR queries confirmed #3 remains OPEN/DRAFT at `93fb3886037b75d8ab547d1f409e7b8128d62edb` and #4 OPEN/DRAFT at `b99dbbd1116c42060743265627b6f20448f03354`.

## Standards

1. **P2 — Typography contract, fixed.** Geometry used f(d), but row/header text still used raw placement distance. At 3 m the headline was 37.2 mm instead of 29.45 mm, contrary to §21–22's shared visual rule. Button and Packaging now pass the computed metre sizes into `makeText` while retaining their style weights/tracking. The row/header regression covers this.
2. **P2 — Physical threshold contract, fixed.** Dock icons compare local probes, but resizing/magnification scales that coordinate system. A 110–120 mm world gap incorrectly entered the 100 mm hover band. Button and uniformly scaled DockIcon now measure hover in world metres, convert the release retreat to local depth, and preserve the physical touch floor under transforms. Scale regressions cover hover enter/exit and 3 mm release.
3. **Nonblocking heuristic — inherited duplication.** Arena's conversion helpers separately implement f(d)/vpt conversion already present in shared token helpers. This is inherited from PR #4, not a documented-standard violation. No unsupported claim that the duplication is a functional blocker. Consolidation can be considered when that module next changes.

Final reviewer closure: **no remaining blocking findings in the reviewed changes**. Two original documented-contract findings resolved. The later lateral/two-hand hover corrections were also inspected and accepted; full tests were not redundantly rerun by the final reviewer.

## Spec

1. **P1 — One touch dispatched two actions, fixed.** At 0.1 m, two Toolbar buttons have 6 mm faces but overlapping 22 mm hit regions. One finger at z=.013 → .010 → .016 selected both indices [0,1]. The real InputSystem regression reproduced this. Routing now gives each fingertip one press target, ranked by distance to the visible face. A held press retains its target; two fingers may still own separate controls. The required 22 mm floor stays intact.
2. **P2 — Text bypassed f(d), fixed.** The same row/header mismatch violated §22's requirement that type use the visual-size rule. Explicit metre sizes now match the container beyond the distance knee.
3. **P2 — Physical Dock input scaled with the icon, fixed.** Physical hover and poke-release thresholds now remain world-metre distances through the existing uniform Dock transforms, completing the v0.2 input contract.

Follow-up review caught overly broad probe filtering in the first correction. It removed lateral hover/disabled press feedback and then allowed a far press-eligible finger to mask a closer lateral finger. These were each reproduced before being fixed: all proximity probes now remain available for hover, while only press selection uses eligibility. Disabled controls retain press/release feedback and suppress select. Regression tests cover both one- and two-finger cases. Final Spec reviewer closure: **all three original findings and follow-up issues resolved; no remaining blocker in the focused review**. No unrelated feature scope was added.

## Validation and limits

Eight new meaningful consumer regressions were added beyond the first integration's five. Red repros included the 37.2/29.45 mm mismatch, actual two-action dispatch, 120 mm hover under scale1.5, missing lateral hover, missing disabled events and the two-hand masking case. The final consumer suite contains 13 tests.

- `npm test`: **49 runtime/component tests + 6 Arena tests pass**; token output drift check also passes.
- `npm run build`: **pass**, 76 tokens validated and production demo built.
- `CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run regress`: **12/12 pass**; full transcript in [browser log](validation/token-v02-review-2026-10-23/regress.log).
- Full [test log](validation/token-v02-review-2026-10-23/tests.log) and [build log](validation/token-v02-review-2026-10-23/build.log).
- `git diff --check`: pass. No source token values, visual timing, Figma files or held v0.1 press-travel rule changed in this follow-up.

The software review is complete. Headset usability/performance, dense-target intent, visual approval, Figma import/readback and the existing press-travel design question remain distinct. The earlier Catalog Arena “Not yet” verdict is unchanged. This review did not claim hardware testing or remote publication.

## Next two steps and ownership

1. **Publish the reviewed integration branch and open an integration PR.** Owner: current Codex. Prepared title: “Fix v0.2 token compatibility across Core components and Arena”. Prepared body: “Core components crashed on v0.2 m/vpt tokens and read obsolete names. Integrate shared conversion/alias resolution, migrate consumers, preserve recovered Dock tuning and Catalog checks, and correct distance-scaled type, physical input thresholds and overlapping direct-touch ownership. Validation: 55 tests, production build, and the recorded Chromium regression suite. Headset and design approval remain pending.” Start condition: Jihoon's confirmation for remote push/PR. Before publishing, revalidate upstream heads and the clean local commit. Do not merge without its separate confirmation.
2. **Define Room planner v1 and headset review.** Owners: Jihoon for product/design decisions; Codex prepares the concrete flow and implementation once settled. Dependencies: reviewed integration baseline, v1 placement/rotation/locking scope, and an editable Figma source. Physical device operation is the only part Codex cannot perform in this workspace. This is not a request for the user to initiate ordinary engineering review.

Approval source: repository `CLAUDE.md` says “Only push or merge after Jihoon confirms.” The global `/Users/jony/AGENTS.md` likewise reserves confirmation for project-gated remote actions. Review, local fixes and tests do not require an extra user go-ahead.
