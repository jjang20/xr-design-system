# Quest round 7 — independent contacts and material/profile feedback

Status: implementation and review in progress. Source: R6 a68f647 and user Q32–Q39. All numbers below are adjustable trial values, not final design acceptance. Existing Quest preview stays on a68 until the complete candidate passes review and provision checks.

## Accepted behavior to preserve

- R6 icon approach and rubbing were comfortable. Keep physical crossing evidence, front-skin capture, complete separation to execute, lateral/tracking-loss cancellation and rearming. This is not user acceptance of every negative case.
- R6 layer opacity/gaps/full sheets/title were good. Rear sheet/body opacity .30/.12, title 1 and progressively smaller older gaps remain.
- R6 Push recognition, short 25mm close and inner Glow were good. Broad-hand versus single finger classification, centre-motion safety, one-child/root rules and 100ms committed Glow timing remain.
- Window side/corner bubbles and Dock sphere use pinch. Window controls are hidden unless hover OR held; release with remaining hover stays visible. Title navigation remains, title drag stays removed.

## R7 appearance trials

- Bubble body alpha .24 → .38; embossed bubble alpha .98 → .995; Dock shelf passthrough alpha .28 → .42. Ordinary window opacity is separately controlled.
- Dock flat centre with symmetric rolled upper/lower sides. Profile edge/underside 8/8dmm with existing thickness multiplier1.2. At distance .4m, thickness12.8mm. End pad80dmm=32mm, versus previous44dmm=17.6mm; icon sizes/pitch unchanged.
- Dock plate pressure5mm, held floor3.5mm, dent radius25mm, Glow radius pad×.7. Sphere pressure4mm, held3mm, width18mm/core12mm. Primary physical contact remains distinct from proximity feedback; releasing restores the current deformation.
- Plate sample uses the same stadium end and swelling formula as its mesh. Captured pressure uses its original front, avoiding deformation-driven triggers. Independent cap grid144 points found no false inside, maximum analytic/mesh difference0.0463mm.
- Window pane nominal thickness ×.5: 8→4mm local, 12→6mm at root scale1.5. Rows stay4mm local. The existing extrusion's 10µm straight bevel segment is included in the explicit15µm geometry tolerance.
- Q38 lowers the *whole frontmost pane front face* through a separate multiplier .85. Side/rear faces, text/icons and interaction bubbles do not inherit it. Closing retains the departing value; becoming rear returns this multiplier to1 before composing the existing depth opacity.

## Q37 multipoint input and feedback

- Two tracked hands can supply index, thumb, middle, ring and pinky tips. Each tip has its own continuity/crossing history and routes to one target. Index retains the original hand id for pinch and compatibility. A missing index does not discard other tracked tips.
- Different items execute independently. Each item retains one action owner through actual separation/cancel; multiple fingers on that same item add spatial dents/Glow rather than duplicating that item's select in one contact cycle. No global first-item execution lock.
- Existing hand-scoped palm and pinch capture take priority. During a hand's pinch/manipulation, other fingertips of that hand cannot acquire conflicting actions. Tracking loss/recenter clears all fingertip histories.
- Visual wells are bounded at10 tips (one primary plus9 additional). Overlapping contacts do not add unbounded deformation. Row skins use12 slots to preserve recovery while showing simultaneous contacts. These are render capacity bounds, not a headset performance claim.
- Plate contacts also have separate local feedback. A plain plate press does not globally cancel icon inputs; a captured Dock manipulation retains the existing icon suppression.

## Q39 navigation

- Collect all valid selections before changing the stack. Process release frames in order; within one frame use press-start frame, then stable item id (fallback parent depth/row index/label).
- Each request keeps its original parent. Execute every navigation by replacing that parent's child, leaving the last selected child in the single existing stack. No sibling appended as a child and no last-navigation-only shortcut.
- A row already pressed while frontmost may finish after its parent recedes. Only that original owner retains the input, using the captured world surface. Rear rows cannot acquire new presses.
- Parent removal, external back, palm/manipulation or loss cancel retained claims. Internal sibling replacement preserves valid pending claims. Programmatic select outside the update loop preserves the existing immediate API.

## Validation and next two steps

1. Lock actual InputSystem positive/negative multipoint and navigation cases, geometry/contact and MR/HDR rendering. Preserve first failures and distinguish test-fixture corrections from fixes. Test build/token checks and existing accepted paths.
2. Commit coherent candidate, independent Spec/Standards/motion re-review and actual browser screens. Close P1/P2, update existing Draft PR5, serve that exact SHA over the existing HTTPS preview and verify receipt/module hashes before handoff. Physical Quest acceptance remains separate. No main merge, deployment or lookdev gate bypass.
