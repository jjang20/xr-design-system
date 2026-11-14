# Current token contract

This guide describes the recorded rules and implemented boundaries at `3eb6244` (2026-11-08), with token source version **0.2.0**. It does not adopt new values, finalize provisional parameters, migrate consumers or establish headset acceptance. The [reading guide](tokens.md) provides examples; the [complete inventory](token-inventory.json) preserves every current declaration and the full rename/removal map.

The pinned inventory contains **76 tokens, 19 reference aliases and 17 provisional declarations**, plus **38 rename targets and 5 removal records**. These are source-derived snapshot counts, not limits on future versions. A missing provisional marker does not by itself prove a value is final or measured.

## Sources and authority

| Source | Role and boundary |
| --- | --- |
| [tokens.json](../tokens.json) | Current declared token values, types, references and metadata. |
| [Decision log](decisions.md), §§21–24, 2026-10-21 | Recorded vpt/metre policy, full-word naming and primitive/alias approach. Its platform comparisons are historical rationale, not freshly verified platform facts. |
| Decision log §25, 2026-10-23 | Integration and compatibility rules, including the later Dock values that supersede §24. |
| [Shared resolver](../scripts/tokens-lib.mjs), [live reader](../src/tokens.js), [checker](../scripts/check-tokens.mjs), [generator](../scripts/build-tokens.mjs) | What the current code accepts, converts, rejects or emits. Code behavior does not automatically settle design intent. |
| [Rename source](../scripts/renames.json) | Explicit migration guidance, including original removal reasons. It is separate from aliases declared in `tokens.json`. |
| [DEFAULTS](../src/core/defaults.js), component options and comparison fixtures | Other implementation values. Their existence is not adoption into the token schema or evidence that every declared token is actively consumed. |

## Naming and layers

The recorded naming rule is **full words with camelCase inside a segment**. Primitive paths use `family.step`; semantic paths use the relevant segments of `family.role.variant.state.property.bound`, omitting segments they do not need. Bounds include `minimum`, `maximum`, `default`, `enter`, `exit`, `release` and `start`.

Examples from the current file:

- `thickness.200`, `size.1600`, `spacing.600`, `duration.120`, `easing.easeOut`, `distance.100` are primitives. Thickness/size/spacing steps use the base multiple × 100; duration/distance names preserve their literal ms/mm labels. The authored distance value itself is in metres.
- `material.thickness.regular` references `{thickness.200}`. `motion.enter.duration` references `{duration.120}`. `input.hover.distance.enter` references `{distance.100}`.
- A semantic role name is not necessarily a reference expression: `material.firmness.firm.pressDepth` currently contains the literal `0.4`. The inventory's `directAliasTarget` identifies actual references, rather than inferring alias counts from path shape.
- `anchor`, `dock`, `menu`, `zslider`, `packaging` and `feedback.detent.interval` retain component/backlog names. Existing `.max`/`.min` segments in this backlog are not silently renamed to match the general full-word convention. The current source marks these leaves with category `Backlog`; that is not a third finalized token layer.

The checker does not enforce the naming order as a grammar. Keeping a path valid and making a new path part of the agreed API are different decisions.

## History and supersession

| Historical record | Current interpretation |
| --- | --- |
| §9 dmm as the main sizing unit; §20 per-anchor scaling | §§21–23 replace the general authored sizing policy with vpt for visual quantities and metres for physical quantities. Legacy dmm APIs remain explicitly compatible. |
| §24's Dock migration figures: 332 vpt / 1.6 | §25 preserves the recovered tuning: `dock.magnify.radius = 133.33333333333334 vpt` (100 dmm), `dock.magnify.scale.max = 1.2`. Do not round this to a new grid value or restore the earlier figures. |
| §26 broad hover feed, followed by §27 and §28 contact changes | Later input behavior has separate source and evidence. Token presence or a historical decision paragraph is not proof that every older input policy remains active. Use the [support matrix](support.md). |
| Old lazy-follow/anchor descriptions and component backlog values | Declaration is not an active-feature inventory. Current component behavior and unfinished work are described in [components](components.md), including the distinction between helpers, placeholders and implemented controls. |

No historical decision text is rewritten by this guide. Old published token names remain documented in the inventory's `renamesAndRemovals`, even when their implementation meaning was superseded.

## Types, units and APIs

Current declared types are `dimension`, `duration`, `number`, `cubicBezier` and `string`. These describe present data; the checker is not a complete type/schema validator. In particular, its unit allowlist applies to both dimension and duration values and does not enforce a separate physical-domain grammar for each type.

| Authored unit / input | Current authored checker | Live reader and generated JS | CSS output | Figma-variable interchange |
| --- | --- | --- | --- | --- |
| `vpt` | Accepted; current visual lengths | × `0.00075` → metres at 1 m; `units` says `m@1m` | Plain number, with vpt comment; no native CSS viewing-distance unit | Same numeric value, description `Unit: vpt.`; intended 1:1 design-pixel mapping, not a verified importer behavior |
| `m` | Accepted; current physical lengths | Metres unchanged | × 1000 with `mm` suffix | cm, or mm below 0.01 m, named in description |
| `deg` | Accepted | Radians, × π/180 | `deg` | Degree number and unit description |
| `ms` | Accepted | Seconds, ÷ 1000 | `ms` | Millisecond number and unit description |
| Legacy `dmm` | Accepted; no current declaration uses it | ÷ 1000 → metres at 1 m | Plain number, with dmm comment | Same number and `Unit: dmm.` description |
| Legacy `mm` | Not accepted as current authored input | Live conversion only: ÷ 1000 → metres | Outside the validated authored pipeline | Outside the validated authored pipeline |

Numbers remain unitless, strings remain strings, and cubic Bézier arrays remain arrays in scene output. CSS writes Bézier arrays as `cubic-bezier(...)`; the interchange represents that expression as a string. All three outputs flatten alias values; interchange descriptions retain the direct reference text. Exported Figma scopes/descriptions are local metadata, **not proof of actual import compatibility or library sync**. Old generator comments suggesting an import UI do not establish a tested workflow.

For the current sizing rule:

```text
f(d) = d                              when d <= start
       start + rate * (d - start)      otherwise
visual metres = vpt * 0.00075 * f(d)
touch metres  = max(visual metres, fingertip floor)
```

`start = 1.75 m`, `rate = 0.5` and floor `0.022 m` are current provisional declarations. The recorded rule evaluates placement distance, not continuous head motion. Actual constructors commonly receive a caller/default distance; this guide does not claim automatic relocation-time recomputation. The vpt rule is recorded, while final parameter acceptance, legibility and input comfort remain separate evidence requirements.

| API | Existing contract |
| --- | --- |
| `createTokens(json).get(name)` | Resolve a **current** name and return its scene value; no obsolete-name fallback. |
| `T.viewSize(name, distanceM)` | Only vpt/dmm tokens; multiply their scene value by `f(d)`. A physical m token is rejected as a view size. |
| `T.touchSize(name, distanceM)` | Same view-size requirement, with the existing fingertip floor. It does not enlarge every visible face or ray target. |
| `T.dmm(name, distanceM)` | Legacy dmm token only; linear size × distance, without the v0.2 distance knee. A vpt token is rejected. |
| `atDistance(size, distanceM)` | Legacy numeric linear multiplication. |
| `T.meta(name)` / `T.names()` | Current per-leaf type, resolved unit/raw/scene value, direct alias, evidence and provisional boolean; names return declared paths. Category and raw status are not exposed by `T.meta`. |
| Generated `tokens`, `viewSize(value, distanceM)`, `touchSize(value, distanceM)` | Nested numeric data and numeric helpers, not the live `T.get(name)` object. `units`, `provisional` and `renamed` are separate exports. |

Public component option compatibility is separate: for example, Button `width`/`height` remain dmm numbers and `density` remains an option name. Passing a number with the same spelling or magnitude as a token does not convert that option to vpt.

## References, metadata and errors

A reference is a whole string such as `{thickness.200}`. The shared resolver follows exact dotted paths recursively; it is not string interpolation. Missing targets and cycles fail with a token-path diagnostic. The checker also requires alias and direct target `$type` equality. That type validation is not duplicated by the live reader; validate authored input before using it.

Metadata under `$extensions.com.contour` belongs to each leaf. An alias follows its target's value/unit, but retains its own evidence/provisional metadata; these flags are not automatically inherited from the target. The collector supports inherited group `$type`, but reads evidence/category/status from the leaf.

| Field | Current meaning and validation boundary |
| --- | --- |
| `evidence` | Checker accepts `M`, `T`, `G`, `D`, `N`. M is a recorded platform attribution needing source confirmation; T is a test starting point; G is an estimate; D records a design decision; N records a rule. A tag alone is not fresh research or device proof. |
| `status` | `provisional` is the only named supported status. The checker rejects truthy unknown statuses, including `reserved`. Missing/null/falsy status is not proof of final approval; this is not a complete metadata schema. |
| `category` | Descriptive grouping, including `Backlog`; the checker does not enforce a category enum. It must not be confused with status. |
| `$description` | Source prose and rationale; preserved in the inventory, not an executed policy. |
| Root `version` | Identifies current token data and generated headers; it is not a release/validation certificate. |

Promotion of a provisional value requires an actual recorded decision and appropriate scoped evidence before removing the marker. A candidate, reserved design idea, implementation constant, successful generation or absence of the flag cannot perform that promotion.

| Failure | Checked boundary |
| --- | --- |
| Missing/cyclic reference | Shared resolution, used by live reader/checker/generator. |
| Alias type mismatch; missing type/evidence; unsupported authored unit/status; token also containing child groups; rename target absent | Authored checker. Not a promise that every malformed JSON shape gets a structured diagnostic. |
| Unknown live name; unsupported scene conversion; wrong `viewSize`/`dmm` unit | Live reader API. It is not a complete substitute for the authored checker. |
| Missing or byte-stale JS/CSS/interchange output | Generator `--check` exits 1 without rewriting output. |
| Null dimension or invalid alias used by press-travel advisory | GH46 correction reports collected validation errors before advisory arithmetic; no TypeError replacing the tested null diagnostic. |

The current checker retains the historical press-travel warning. It is not a diagnosis for every component or a new physical-device failure. See [its scope](tokens.md#historical-press-travel-warning).

## Migration and generation workflow

Use the **full map in [the inventory](token-inventory.json)** or its [authoritative source](../scripts/renames.json). String entries map 38 old names to current names. Five object entries retain the removal reasons for `motion.recover` and the four `anchor.*.scale` paths. Generated `renamed` exports those removals as `null`, not as a replacement value. Map entries are guidance, not token aliases: `T.get('material.t.regular')` still fails.

For a future, already approved change:

1. Record the approved meaning, units and affected current paths. Locate each reader before editing, for example `rg -n 'material\.thickness|input\.direct\.distance|viewSize' src arena demo`. Dynamic names such as thickness variants need the matching family, not only an exact leaf search.
2. Trace declaration → reference chain → conversion → consumer operation. Button uses `material.thickness.*` as physical thickness and `size.interactive.default` through `viewSize`; InputSystem reads absolute direct-input enter/exit distances. A rename cannot substitute for that unit/API choice.
3. Apply only the approved source/consumer change. Preserve compatibility when semantics are unchanged. Any destructive removal, reused name with changed meaning, or migration of retained option units needs its own concrete approval and consumer plan. Do not silently reactivate removed names through the map.
4. Run `npm run build:tokens`: the established command validates input, then writes all three `dist` files. Do not bypass validation by treating the direct generator command as a schema checker. Review source and output deltas together.
5. Run `npm run check` to validate the input and reject byte drift. Choose consumer tests appropriate to the affected paths. A token generation pass is not a Vite build, renderer result, Figma import or device result.
6. Refresh this inventory from the same source bytes, check the full map and update evidence/status only when the underlying decision supports it. Retain old failure/decision records as history.

No migration is performed by this documentation slice.

## Reused compatibility evidence

GH46, local commit `3eb6244`, supplied **20 focused tests** (the existing 18 plus two diagnostic regressions) and **23 isolated audit checks**. This documentation task reuses that fixed result; it does not rerun it or add the counts together.

The audit reproduced all three generated files byte-for-byte, checked deterministic regeneration and independent stale detection, compared all 76 declared reader/generated values and evidence/provisional metadata, exercised selected invalid inputs/legacy boundaries, and traced patched primitives to a real Button constructor. The existing consumer tests instantiate all five public component classes and check selected geometry/input contracts. The audit's patched-constructor observation does not prove every token through every consumer. See [reader tests](../test/tokens.test.js), [consumer tests](../test/token-consumers.test.js) and [diagnostic regressions](../test/token-validation.test.js).

This is existing-rule local compatibility evidence. It does not finalize component token taxonomy, prove all arbitrary input rejection, establish Figma import/library sync, erase earlier device feedback or accept every input/render/performance condition. Current [support limits](support.md) still apply.

## Remaining decisions register

These are grouped incomplete design obligations, not new questions sent to the user or blockers on maintaining the documented current contract.

| Register item | Existing evidence | Reviewable recommendation and alternative | Impact and independent work |
| --- | --- | --- | --- |
| D1 — Component/backlog ownership and eventual names | §24 deliberately retains component names; DEFAULTS and fixtures hold additional values; several backlog declarations do not establish active behavior. | Keep current names and meanings until each component contract identifies the values it owns. Alternative: adopt a reviewed component-token mapping for a named subset, with explicit consumer migration. The already chosen primitive/alias approach is not reopened. | Future renames may break consumers; no bulk promotion or third layer is adopted here. Existing inventory, generation and compatibility remain usable. |
| D2 — Which provisional parameters can become accepted values, and under what evidence | 17 leaves are explicitly provisional; T/G evidence and missing status are not blanket finalization. Sizing/input/color/type work has separate acceptance boundaries. | Preserve markers and evaluate a concrete eligible subset against its actual component/environment criteria. Alternative: explicitly accept a justified subset while leaving the rest provisional. | No values, thresholds or markers change now. Rule documentation and ordinary compatible fixes proceed; full GH29 design completion cannot be inferred from the inventory. |

New enum values, reserved names, modes or stronger arbitrary-input schema guarantees are not invented to fill these gaps. A concrete future requirement should identify its affected consumers and compatibility implications first. Coordinator reviews the register and routes only an unresolved decision through the existing decision process.

## Reproduce the inventory

Run the following from the repository root with Python 3. It only reads the two authored files and prints JSON; compare stdout with `docs/token-inventory.json`. Source hashes make a stale inventory visible. `authoredUnit: null` on an alias means its unit is obtained through the referenced value, not that it is necessarily unitless. Missing metadata is kept as null, not inferred from approval history. This recipe inventories the pinned valid source; it is not an alternative schema validator.

```sh
python3 - <<'PY'
import hashlib
import json
from pathlib import Path

sources = ["tokens.json", "scripts/renames.json"]
data = {name: Path(name).read_bytes() for name in sources}
source = json.loads(data["tokens.json"])
rename_source = json.loads(data["scripts/renames.json"])
tokens = []

def walk(node, path=(), inherited_type=None):
    token_type = node.get("$type", inherited_type)
    if "$value" in node:
        value = node["$value"]
        meta = node.get("$extensions", {}).get("com.contour", {})
        alias = value[1:-1] if isinstance(value, str) and value.startswith("{") and value.endswith("}") and "{" not in value[1:-1] and "}" not in value[1:-1] and len(value) > 2 else None
        tokens.append({
            "path": ".".join(path), "type": token_type,
            "authoredValue": value,
            "authoredUnit": value.get("unit") if isinstance(value, dict) else None,
            "directAliasTarget": alias,
            "evidence": meta.get("evidence"), "category": meta.get("category"),
            "status": meta.get("status"), "provisional": meta.get("status") == "provisional",
            "description": node.get("$description", ""),
        })
    else:
        for key, child in node.items():
            if not key.startswith("$"):
                walk(child, path + (key,), token_type)

walk(source)
tokens.sort(key=lambda token: token["path"])
renames = dict(sorted(rename_source["renames"].items()))
inventory = {
    "sourceVersion": source.get("$extensions", {}).get("com.contour", {}).get("version"),
    "sourceSha256": {name: hashlib.sha256(data[name]).hexdigest() for name in sources},
    "counts": {"tokens": len(tokens), "aliases": sum(t["directAliasTarget"] is not None for t in tokens),
               "provisional": sum(t["provisional"] for t in tokens), "migrationEntries": len(renames),
               "renames": sum(isinstance(v, str) for v in renames.values()),
               "removals": sum(isinstance(v, dict) and "removed" in v for v in renames.values())},
    "tokens": tokens,
    "migrationDescription": rename_source["$description"],
    "renamesAndRemovals": renames,
}
print(json.dumps(inventory, ensure_ascii=False, indent=2))
PY
```
