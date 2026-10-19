# Catalog window: critique and spec

The first round of components worked but did not look like a shipping XR product. This page records why, and the spec the rebuild follows. The Catalog window is rebuilt first; the other components follow the same spec once it passes the bar.

Units: dmm (millimetres at 1 m, see [concepts](concepts.md)). Contour treats 1 dmm as roughly 1 visionOS point, because `size.button.default` (60 dmm) matches Apple's 60 pt minimum target. That mapping is inferred, not measured.

## Critique of round 1

Judged against the arena bar (material, light, shape, type, states, depth, cohesion).

| Row | What the render showed | Why it falls short |
|---|---|---|
| Material | An opaque graphite slab with a bevelled edge. | visionOS windows are glass: you see a blurred, slightly darkened version of the room through them. An opaque slab reads as a plastic sign in front of the room. |
| Light | A dark rim around the whole window, a dark halo from the shadow. | Real glass catches light on its edge (a thin bright line, strongest at the top) and has no outline. The halo read as a cartoon stroke. |
| Shape | Thick body (16 mm) with a visible bevel; radius 30 dmm on a 300 dmm window. | A window is not something you press, so it has no reason to look thick. Thickness belongs to controls, where it signals "pressable". |
| Type | Title 24 bold, rows 17 regular, sublabels 13 grey; low contrast secondary text; thin icons floating with no container. | No ramp: sizes were picked per element. Grey text on glass loses legibility; Apple uses white at reduced opacity (vibrancy) and heavier weights instead. |
| States | Hovered row drew a hard outlined box. | visionOS hover is a soft lift of the row platter plus a highlight that follows the eyes. No strokes. |
| Depth | Opened levels stacked as overlapping translucent cards; titles bled through each other. | "Never stack light translucent surfaces" (Apple). Parents must push back and dim as one layer, and only their header should stay readable. |
| Cohesion | A cartoon room with box furniture. | The backdrop sets the bar for everything in front of it. A fake room makes real-looking UI look fake too. |

## Spec

### Backdrop
A photographed interior (Poly Haven `lebombo`, CC0) used as both the environment light and the background. On a headset in mixed reality the background is your real room, and the backdrop is hidden.

### Glass material (windows)
- **Body:** a flat glass sheet. It shows the backdrop directly behind it, blurred heavily, darkened and slightly desaturated, so white text stays legible over bright walls.
- **Edge:** a 1 dmm specular line (`surface.outline.mr`), bright at the top-left, fading toward the bottom-right. No dark outline.
- **Sheen:** a faint top-to-bottom gradient, lighter at the top, like light falling from above.
- **Mixed reality fallback:** a web page cannot read or blur the passthrough camera, so in mixed reality the glass becomes a tinted surface at `surface.opacity.base`.
- **Thickness:** windows use `material.t.thin`. Thickness stays a property of controls.

### Type ramp (dmm, Inter)
Weights are one step heavier than on a flat screen, because text over glass needs more presence (vibrancy).

| Style | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| title | 29 | 700 | −0.02 em | Window title |
| headline | 17 | 600 | 0 | Row label |
| body | 17 | 500 | 0 | Body text |
| subheadline | 15 | 500 | 0 | Window subtitle |
| footnote | 13 | 500 | +0.01 em | Row detail |

Colours: primary text is white, secondary is white at 72 %, tertiary (chevrons) is white at 50 %. These were raised from 60 % and 40 % after the contrast check below.

### Layout (dmm)
| Element | Value |
|---|---|
| Window width | 320 |
| Window corner radius | 40 |
| Window padding | 24 sides, 26 top, 14 bottom |
| Title to subtitle | 6 |
| Header to list | 18 |
| Row height | 60 (above `size.target.min`) |
| Row hover platter | inset 10 from the window edge, radius 20 |
| Icon badge | 34 circle, white at 14 %, 18 glyph |
| Badge to label | 12 |
| Separator | 1 hairline, white at 8 %, starting at the label |
| Chevron | 15, white at 50 % |

### States
- **Hover:** the row platter fades to white at 10 %, with a soft spot under the pointer (white at 6 %). There is no outline. Timing is `motion.hover.in`.
- **Press:** the platter brightens, the row content moves back by the density's press depth and shrinks by up to 3 %, because a flat row has no visible thickness to show the press.
- **Disabled:** content at 40 %, no hover.

### Packaging depth
- The parent pushes back and up (`packaging.parent.recede.*`) and dims by darkening its glass. It does not fade to see-through.
- Only the parent's header stays visible above the child; the child covers the rest.
- The child grows out of the row that opened it and returns into the same row (spatial consistency), using a critically damped spring so a fast back-and-forth never jumps.

## Contrast check (accessibility)

Measured on the bench renders (WCAG contrast of white text against the glass pixels behind it).

| Where the window sits | Glass luminance | Primary text | Secondary text (72 %) |
|---|---|---|---|
| In front of a lit wall | 0.086 to 0.099 | 7.1 to 7.7 : 1 | 4.6 to 5.0 : 1 |
| In front of a sunlit window | 0.12 to 0.15 | 5.2 to 6.1 : 1 | 3.6 to 4.1 : 1 |

Primary text passes 4.5 : 1 everywhere. Secondary text passes in front of walls but drops to about 3.6 : 1 in front of a sunlit window, because the adaptive scrim stops at `surface.scrim.max` (0.35). Raising that token to about 0.6 would hold 4.5 : 1 there too; that is a token decision, so it is left open. Row targets are 60 dmm high, above `size.target.min` (32).
