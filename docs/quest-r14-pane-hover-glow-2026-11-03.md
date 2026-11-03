# R14 — pane pinch priority, list transparency and lower-handle Glow

Q72 reports difficult edge movement with row-hover interference and invisible pane depression. Q73 requests stronger light; Q74 explicitly chooses a narrower **Glow footprint**, preserving the accepted sphere flattening/spread/recovery. The additional list request lowers only its noncontact hover skin opacity. These override the corresponding R13 trials, not Current, pane rest geometry, text or other controls.

## Reproduction and implementation

At fixed `9a840567`, actual InputSystem replay with the demo Catalog acquired a valid 3 mm edge immediately but retained one outgoing row shader slot for 13 frames (~217 ms). A 7.3 mm inset missed the old region because rowInset capped it at 6.3 physical mm at scale 1.5. Neither trace proves the exact Quest hand trajectory. Original failing traces and fixture corrections remain in the companion workspace's R14 revision-01.

- A deliberate pinch starts within 12 physical mm of the actual left/right pane edges, bounded by the rounded silhouette. The decorative row inset no longer limits that lane. Non-pinching content still receives input. Acquired corner/Dock/Push ownership, central title/body exclusion and release/loss rules remain.
- An acquired window manipulation cancels pending row actions and clears that window's outgoing row skin in the same frame. Ordinary hover transitions and other groups retain their springs.
- The pane bends locally through its front, rounded edge and back with `z'=z+h(x,y)`. Trial depth is 3.5 physical mm, Gaussian radius 16 mm; spring 90 ms, damping .85 (reduced 1). This preserves volume and local-Z front/back separation, not exact normal-direction thickness. The resting geometry is unchanged. CPU hit surface and shader use the same profile and inverse-transpose normal. Row input includes the recovering pane base. An early child capture is allowed immediately; its bend is capped by ancestor front/raised-row clearance minus .25 mm, avoiding a new overlap during entry.
- Only PackagingPanel rows opt into a .58 hover-skin alpha multiplier, applied after HDR/front-pane alpha. Actual press/contact and contact recovery keep their existing opacity; text/icons are separate. Toolbar, Dock, corners and Current values do not change. Less opacity can affect background contrast: desktop screenshots are a bounded readability check, not an all-room contrast or Quest acceptance claim.
- Only the lower sphere opts into Glow gain 2.8, core 6 mm and Gaussian envelope 8 mm. The envelope narrows both core and rim (including the previous rim floor). Default bubbles remain unchanged. Local-well geometry and lip/glint/shadow stamps remain disabled; deformation, rest size/location and capture are unchanged.

All numbers above are adjustable engineering trials under Q14, not newly approved final values. Q48 navigation, actual multi-contact/actions, grouped hover, accepted current Dock appearance, corner resize and broad-hand Push remain required regression boundaries.

## Validation boundaries

`test/quest-pane-priority.test.js` exercises natural approach, same-frame visual cleanup, scale boundaries, recovery skin and hover/contact opacity. Existing direct-pane, geometry, sphere, Q48, group and broad-hand tests remain. `scripts/regress-pane-priority.mjs` checks actual list hover alpha and pane capture/deformation at normal distance in one selectable no-env/HDR and normal/reduced condition per run. The lower sphere runner likewise supports bounded single conditions.

The first optical fixture used undefined `pokeFront` before acquisition and observed no hover; those runs are invalid evidence and preserved. The corrected fixture uses `surfaceZ` and requires actual hover with no press before checking alpha. A subsequent optical probe at17mm overlapped the inflated skin and correctly retained contact opacity; the25mm probe entered the existing10mm early-press offset after inflation; the final40mm probe additionally requires no press and zero secondary contacts/dent. The first stationary-thumb assertion counted the cancelled approach press before manipulation; its correction limits the event window to release/recovery.

Preview remains `9a840567` until a coherent fixed-SHA review and service readback. Technical PASS is not headset acceptance or same-device performance evidence. #12 and #13 remain open.
