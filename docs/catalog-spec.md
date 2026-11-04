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

## Round 4: lookdev against a path-traced reference

Jihoon asked for professional light, texture and modelling tools. GPT Image 2.5 (through Figma AI) made concept targets, and Blender (Cycles path tracing, `lookdev/`) rendered the real Catalog geometry with physically correct glass in the same room. The live shader was then matched to the Blender frames side by side (`npm run bench -- lookdev`).

| What the reference showed | Live change |
|---|---|
| The glass keeps the room's warm colour; it's darker because it absorbs light, not because it's grey. | Transmission is Beer-Lambert absorption (`look.glass.absorb`, per-kind `albedo`) instead of a desaturated mix. |
| Curved edges (window rim, beads, lens) look darker at the edge, like droplets. | A rim darkening term per kind (`edge`). |
| The hovered lens is clear, defined by its edge and shadow, not a milky fill. | No veil on the lens, a softer hover glow. |
| In front of a sunlit window, pure physical glass makes text unreadable. | The adaptive scrim stays: per-kind `maxLum` holds secondary text at 4.5 : 1. |

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

Colours: primary text is white, secondary is white at 90 %, tertiary (chevrons) is white at 50 % (`DEFAULTS.emphasis`). Text has no shadow (`DEFAULTS.look.textShadow` is `null`): it earns its contrast from weight and the glass's tone, as visionOS vibrancy does, not from a halo. Rounds 1 to 4 used 72 % and a faint shadow; see the historical contrast table below.

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
Rows use the bubble (`hoverStyle: 'emboss'`, the default); the lens below is the older `lens` style, kept as an option.
- **Hover:** the window glass swells into a pillow under the row and the hairlines beside it step aside. (Lens style: the row's glass lens fades in and lifts 5 mm toward you with a soft shadow.) Timing is `motion.hover.in`.
- **Press:** a dent gives way where the press lands and lights from inside; on release it springs back past flat once. A fingertip drags the dent along; a ray or gaze-and-pinch pins it where the pinch began. (Lens style: the lens moves back by the press depth and shrinks by up to 2.5 %.)
- **Disabled** (rows deeper than `packaging.depth.max`): content at 40 %, no hover, never selects.
- **Behind the front level:** rows take no input; the receded window as a whole is the way back.
- Shared rules for every component (press ownership, reduced motion, inputs): [components.md, States and input](components.md#states-and-input).

### Packaging depth
- The parent pushes back and up (`packaging.parent.recede.*`), darkens, and keeps only its title. Its list and subtitle fade out, so nothing behind competes with the front level.
- The level in front casts a soft contact shadow on the parent.
- The child grows out of the row that opened it and returns into it (spatial consistency), on a critically damped spring so a fast back-and-forth never jumps.
- Navigation is never locked while levels move: going back and opening another row at once works, and the level on its way out takes no input.
- **Reduced motion** (the viewer's `prefers-reduced-motion`, or the `reducedMotion` option): levels don't travel or grow. Each is where it belongs at once and only fades: the child fades in, the parent darkens and drops its list, a closing level fades where it is. Hierarchy and the breadcrumb stay; only the movement goes.

## Contrast check (accessibility)

### Current (2026-10-21, after the PR #3 review fixes)

WCAG contrast of white text against the glass around it, measured per text element on the bench render (`bench.html?component=packaging&fov=26`, the `lebombo` room, desktop renderer, 2× pixel density): the 99.5th percentile luminance inside the text's own screen box against that box's median. Secondary text is white at 90 %, no text shadow, tokens as committed.

| State | Text | Contrast |
|---|---|---|
| Root at rest | Title (Catalog) | 5.7 : 1 |
| | Row labels (primary) | 5.5 to 5.9 : 1 |
| | Subtitle and row details (secondary, 90 %) | 4.9 to 5.1 : 1 |
| Three levels, front (Modular) | Title | 8.8 : 1 |
| | Row labels (primary) | 6.0 to 8.2 : 1 |
| | Row details (secondary, 90 %) | 5.1 to 6.6 : 1 |
| Three levels, receded titles | Sofas, one level back | 3.4 : 1 |
| | Catalog, two levels back | 2.1 : 1 |

Front-level text passes 4.5 : 1 here. The receded titles do not: they are darkened on purpose (`packaging.parent.recede.opacity.*`), and at title size WCAG's large-text minimum is 3 : 1, which the level one back meets and the level two back misses. Whether a receded title must stay readable as a back control is an open design decision (PR #3 review, design proposals).

Not covered by these numbers: hover and press (the dent's glow core lowers contrast under the finger, see Decisions in components.md), a window in front of a sunlit window, other rooms, a headset's optics and display, and mixed reality, where the glass can't see the room and uses `surface.opacity.base` instead.

### Historical (rounds 2 to 4: secondary text at 72 %, text shadow, earlier glass)

These were measured on earlier materials and backgrounds and do not validate the current Catalog; they are kept for the record.

Measured on the round 3 bench renders (WCAG contrast of white text against the glass behind it).

| Where the window sits | Glass luminance | Primary text | Secondary text (72 %) |
|---|---|---|---|
| Round 4, lit wall: window | 0.12 to 0.13 | 5.9 to 6.1 : 1 | 4.5 to 4.7 : 1 |
| Round 4, lit wall: hovered lens | 0.11 to 0.12 | 6.1 to 6.4 : 1 | 4.7 to 5.0 : 1 |
| In front of a lit wall | 0.086 to 0.10 | 7.0 to 7.7 : 1 | 4.6 to 5.0 : 1 |
| In front of a sunlit window (round 2) | 0.12 to 0.15 | 5.2 to 6.1 : 1 | 3.6 to 4.1 : 1 |

At the time, secondary text dipped below 4.5 : 1 in front of a sunlit window, because the adaptive scrim stops at `surface.scrim.max` (0.35); about 0.6 would have held 4.5 : 1 there. That position hasn't been measured since secondary text moved to 90 %. Rows are 48 dmm high, above `size.target.min`.
