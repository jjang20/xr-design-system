# Components

This is the current implementation inventory at `2988b93`. Descriptions are source behavior, not new design decisions or blanket device acceptance. The [support matrix](support.md) and [example guide](examples.md) supply the input and verification boundaries. Earlier illustrations and design discussions are preserved in the [historical component snapshot](components-history-2026-11-08.md).

## Public components

Exactly five component classes are exported by [src/index.js](../src/index.js). A Window is part of PackagingPanel, not a sixth public `Window` class. Fixture-only flat controls and layout adapters are not exported as design-system components.

| Component | Role and meaningful result | Input and example | Limits |
| --- | --- | --- | --- |
| [Button](../src/components/Button.js) | A pressable face; `press`, `release`, `select`, `cancel`. Hover/press are transient; disabled feedback does not select. | Near contact or captured semantic ray; [action comparison](action-comparison.md) | No persistent selected/toggle contract, keyboard-focus model or app action supplied by the component |
| [Toolbar](../src/components/Toolbar.js) | Buttons sharing a glass bar and hover arbitration; parent `select` carries `tool` and `index`. | Button input; [action comparison](action-comparison.md) | Bar is visual structure, not an action. Repeating an action can leave the same notice text. |
| [ZSlider](../src/components/ZSlider.js) | A continuous `[0,1]` value; outward extension increases it. `change` and `detent`, not `select`. | Contact push, semantic pinch after hover, captured ray / desktop wheel; [slider comparison](slider-comparison.md) | Native joint pinch alone is not a Z acquisition path. Ray-plane angles and real device performance remain limited/unverified. |
| [PackagingPanel](../src/components/PackagingPanel.js) | Rows open a child stack or emit a leaf `select`; `open`, `back`, `select`, `setMode()`. | Rows, exposed rear-title Back, edge movement, corners and supported hand Push; [hierarchy](hierarchy-comparison.md), [resize](window-resize-comparison.md), [movement](window-movement-comparison.md) | Each fixture enables a different subset. Original leaf callback does not itself provide the R05 detail page. |
| [Dock](../src/components/Dock.js) | App-object selection emits `select(app)`; original demo displays a message. Plate ends size the Dock; a lower sphere controls placement. | App contact/ray and manipulation targets; [Dock content comparison](dock-content-comparison.md) | Comparison disables plate/sphere input. App objects remain placeholders; selection never launches an external process. |

## Important sub-controls and structure

| Part | Current behavior | Scope / exclusion |
| --- | --- | --- |
| Packaging rows | Button-based transient hover/press; category opening is deferred until the update boundary; leaves emit callbacks. | Mode/leaf callback are distinct from a Dropdown or persistent selection. |
| Exposed parent title | Back target belongs to the exposed title band. | The entire rear glass is not an invisible Back button. |
| [WindowSurface](../src/components/WindowSurface.js) | Left/right pane skin acquires an explicit edge pinch; local dent, thinning and Glow recover on release/loss. | No restored side movement bubbles or closing rail. Contact alone does not move the pane. |
| [BubbleHandle](../src/components/BubbleHandle.js) and [WindowControls](../src/core/WindowControls.js) | Bottom corner controls resize; WindowControls applies movement/scale transforms. | Original uniform scale differs from the matched-content R02 adapter. Native-pinch opt-in is not inherited by every corner. |
| Packaging hand Push | Supported hand-joint recognition dismisses one child, preserves owner and requires withdrawal/rearm; loss before dismissal restores it. | Hand-only; no controller-palm gesture or root app exit. R05 preserves supported Push, Flat uses Back. |
| [DockIcon](../src/components/DockIcon.js) | Procedural object, hover bubble and press feedback; hit routing uses the bubble/skin rather than exact object triangles. | Internal control; no final asset approval implied by selection tests. |
| Dock shelf and ends | Existing physical plate contact/dent and captured end stretch; bounded size and settle behavior. | Disabled input in R06; visible geometry there is not manipulation validation. |
| Lower Dock sphere and [DockRail](../src/core/DockRail.js) | Session-local placement on a bounded oval with height/radius control. | Initial head yaw sets the reference; subsequent head rotation/height do not drive it. XZ displacement beyond a deadzone can move the anchor. No torso tracking or spatial-anchor persistence. |
| Toolbar bar / [makePlatter](../src/core/look.js) | Shared material or noninteractive visual background. | Not additional public action components. |
| Text, icons, state labels and result panes | Text uses Troika/Inter; examples also use explicit DOM/XR guidance and read-only result content. | Content/result UI is application wiring, not automatic meaning attached to a press. |

The Dock still executes existing magnification/spring calculations in its update path. `LazyFollow` remains an exported helper, but current Dock placement is driven by DockRail, not the older delayed head-yaw-follow description. R06 supplies a fixed reference rather than live head following. These are implementation distinctions, not a new design policy.

## States and input

`InputSystem` feeds local-space probes; components interpret them. Add objects to the scene, update world matrices, route input, then update the relevant components before rendering. [demo/main.js](../demo/main.js) shows the original loop; each [comparison entry](examples.md#entries) owns its extra first-acquisition, reset and lifecycle wiring. A bare component snippet cannot stand in for that wiring.

Button/Toolbar/Dock actions retain their initiating source. Cancellation/loss must not be described as an action. A slider stores a value rather than a selection; a window stores a transform; a hierarchy stores navigation state. Their release and result policies are different. Fixture details specify which state Reset restores and what loss retains; no universal release-to-commit rule is introduced.

Z `setValue(v, { silent: true })` suppresses `change` and audio but can still emit `detent`. The comparison adapter suppresses mirrored detents explicitly. External state mirroring is not user action. The shared brightness result, ownership arbitration and restoration belong to the slider fixture, not to the public Z class or the original room backdrop consumer.

## Tokens and design values

[tokens.json](../tokens.json) is the token source, not a complete list of every implementation value. [createTokens](../src/tokens.js), [DEFAULTS](../src/core/defaults.js) and fixture constants have different roles. See [Tokens](tokens.md).

Physical lengths remain metres; `viewSize` applies placement-distance scaling to view units, and `touchSize` adds the physical fingertip floor. Constructor distance is an explicit layout input, not measured eye distance. Moving or scaling a group does not automatically reevaluate all typography/token sizes. R02's `q`/content-growth formula is an engineering fixture, not a universal sizing or thickness policy.

Current relative row alpha offsets are `0 / .06 / .10` from the underlying pane at the same position, before group/depth/fade. They are not fixed `.85/.91/.95` values. The R17 local thinning amount is an engineering trial; its narrow user acceptance does not validate all geometry, inputs or performance. [R17 technical scope](quest-r17-local-thickness-2026-11-04.md).

## Design assets and icons

| App ID in R06 | Object key | Label | Product status |
| --- | --- | --- | --- |
| `planner` | `house` | Planner | Procedural placeholder |
| `measure` | `ruler` | Measure | Procedural placeholder |
| `scan` | `scan` | Scan | Procedural placeholder |
| `photos` | `image` | Photos | Procedural placeholder |
| `settings` | `settings` | Settings | Procedural placeholder |
| `notes` | `notes` | Notes | Procedural placeholder |
| `clock` | `clock` | Clock | Procedural placeholder |

[objects.js](../src/core/objects.js) supplies the objects; [DockContentComparison](../demo/comparison/DockContentComparison.js) supplies the fixture IDs and content mapping. Final assets will be user-supplied. Standalone Clock/Measure C01 review/selection is historical, not product integration or a final seven-icon set.

[2D icons](../src/core/icons.js), [lookdev source](../lookdev/README.md), [lookdev stills](images/lookdev/) and the [historical component frames](components-history-2026-11-08.md) are separate assets/evidence. Earlier Blender images and screenshots are not current runtime or physical-device proof. Lookdev tooling is optional, not required to run the examples. The bundled environment has [Poly Haven attribution](../demo/public/env/CREDITS.txt); its image is not a live room scan.

## Unfinished and reserved work

- Dropdown / inline expansion and closing rail: design proposals, no current implementation. Packaging/Back do not complete them. Removed side-move bubbles are not restored by this inventory.
- Shared exploration assembly: six separate entries exist; the proposed unified arrangement is not implemented. Scenario choices remain revisable and scenario expansion is wrapped up.
- Final 3D icons: user production, no candidate integration. Icon delivery does not gate existing documentation/examples.
- Complete Dock manipulation comparison, controller/hand experience equivalence, keyboard/screen-reader interaction, broad device/comfort and same-device performance: not established by the existing example checks.

The remaining exports in [src/index.js](../src/index.js)—token readers, Hysteresis, PressModel, packaging/follow helpers, DEFAULTS, text/icon/platter factories and audio unlock—are utilities, not extra public components. Comparison `PlanarSlider`, `PlanarAction`, Flat panels and result panes are fixture code, not an expanded public API.
