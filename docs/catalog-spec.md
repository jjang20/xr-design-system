# Catalog window: critique and spec

The first round of components worked but did not look like a shipping XR product. This page records why, and the spec the rebuild follows. The Catalog window is rebuilt first; the other components follow the same spec once it passes the bar.

Units: dmm (millimetres at 1 m, see [concepts](concepts.md)). Sizes are taken from Apple's visionOS 26 UI kit and converted with **1 pt ≈ 0.73 dmm**, the ratio Apple states (60 pt ≈ 4.4 cm at 1 m). Round 2 assumed 1 pt ≈ 1 dmm, which made everything about 37 % too big.

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

## Critique of round 2 (Jihoon)

| What Jihoon saw | What was behind it | Round 3 fix |
|---|---|---|
| No texture of material | The glass was a flat sheet with one colour and a painted edge line. | A thick slab whose rounded rim refracts and reflects the room, with Fresnel, a key-light highlight, rim light and a fine frost grain. |
| Depth not compelling | Nothing cast a shadow and nothing had thickness. | Each level casts a soft contact shadow on the one behind; the slab has visible thickness from the side. |
| Back layers interfere with the front | Pushed-back levels still showed their lists. | A pushed-back level shows only its darkened title. |
| Too 2D; hover only changed a colour | Hover was a flat white fill. | Hover lifts a light glass lens out of the window, carrying the row with it and casting a shadow. Icons sit in glass beads. |

## Spec

### Backdrop
A photographed interior (Poly Haven `lebombo`, CC0) used as both the environment light and the background. On a headset in mixed reality the background is your real room, and the backdrop is hidden.

### Glass material
One shader, three kinds: **window** (dark structural glass), **lens** (light glass for a hovered row) and **bead** (icon badge). Each is drawn from what a real slab does with light:
- **Transmission:** the room behind, seen through the slab, frosted (blurred) and refracted, so the rounded rim bends it like a lens. It is darkened and partly desaturated so white text stays legible.
- **Reflection:** the room in front, mirrored by the surface. Face-on it's faint (4 %, Fresnel); at the curved rim it's strong, so the edge glows.
- **Key light and rim light:** a soft highlight from above-left on the rim, brightest along the top.
- **Frost grain:** a fine static grain and a slow cloudiness fixed to the surface, so it reads as a material, not a colour.
- **Veil:** lens and bead add a thin milky layer: light glass on dark glass.
- **Contact shadows:** soft shadows from what floats in front (a child level, a lifted lens). Softness grows with the gap.
- **Adaptive scrim:** over a bright room the glass darkens just enough for white text, up to `surface.scrim.max`.
- **Mixed reality fallback:** a web page can't read the passthrough camera, so in mixed reality the glass becomes a tinted surface at `surface.opacity.base`.
- **Thickness:** windows `material.t.regular` (8 mm) with a fully rounded rim; row lenses `material.t.thin` (4 mm), lifted 5 mm on hover.

Apple's kit draws glass as 50 % grey at 30 % in Luminosity blend with a 100 px background blur and a white gradient edge stroke. Contour keeps that recipe for the transmission and goes beyond it with thickness, refraction, reflection and shadows, which the kit doesn't have.

### Type ramp (dmm, Inter)
From Apple's kit; nothing lighter than Medium. Inter runs a little heavy, so Apple's Bold rows become Semibold.

| Style | Apple (pt) | Contour (dmm) | Weight | Tracking | Use |
|---|---|---|---|---|---|
| title | LargeTitle 29 | 21 | 700 | −0.01 em | Window title |
| headline | Headline 17 | 12.4 | 600 | 0 | Row label |
| body | Body 17 | 12.4 | 500 | 0 | Body text |
| subheadline | Callout 15 | 11 | 500 | 0 | Window subtitle |
| footnote | Footnote 13 | 9.5 | 500 | +0.01 em | Row detail |

Colours: primary text is white, secondary is white at 72 %, tertiary (chevrons) is white at 50 %. Text has a faint shadow, so it reads as sitting on the glass.

### Layout (dmm)
| Element | Value | Apple (pt) |
|---|---|---|
| Window width | 240 | ≈ 330 |
| Window corner radius | 34 | 46 |
| Window padding | 18 sides, 19 top, 8 bottom | 24 |
| Header to list | 12 | |
| Row height | 48 (the proposed `size.target.hit.min`) | 60 hit region |
| Row lens | inset 7 from the window edge, radius 15 | 20 |
| Icon bead | 26 circle, 14 glyph | 36 |
| Bead to label | 9 | 12 |
| Separator | 0.75 hairline, white at 8 %, hidden next to a lifted row | |
| Chevron | 11, white at 50 % | 15 |

### States
- **Hover:** the row's glass lens fades in and lifts 5 mm toward you, carrying the row content; it casts a soft shadow on the window, and the hairlines beside it step aside. Timing is `motion.hover.in`.
- **Press:** the lens and content move back by the density's press depth and shrink by up to 2.5 %.
- **Disabled:** content at 40 %, no hover.

### Packaging depth
- The parent pushes back and up (`packaging.parent.recede.*`), darkens, and keeps only its title. Its list and subtitle fade out, so nothing behind competes with the front level.
- The level in front casts a soft contact shadow on the parent.
- The child grows out of the row that opened it and returns into it (spatial consistency), on a critically damped spring so a fast back-and-forth never jumps.

## Contrast check (accessibility)

Measured on the round 3 bench renders (WCAG contrast of white text against the glass behind it).

| Where the window sits | Glass luminance | Primary text | Secondary text (72 %) |
|---|---|---|---|
| In front of a lit wall | 0.086 to 0.10 | 7.0 to 7.7 : 1 | 4.6 to 5.0 : 1 |
| In front of a sunlit window (round 2) | 0.12 to 0.15 | 5.2 to 6.1 : 1 | 3.6 to 4.1 : 1 |

Secondary text still dips below 4.5 : 1 in front of a sunlit window, because the adaptive scrim stops at `surface.scrim.max` (0.35). About 0.6 would hold 4.5 : 1 there; that is a token decision, so it is left open. Rows are 48 dmm high, above `size.target.min`.
