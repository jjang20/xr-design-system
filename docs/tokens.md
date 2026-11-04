# Reading tokens.json

[`tokens.json`](../tokens.json) is the single source of truth for Contour values. The website, the 3D lab and any future demo should read values from it instead of typing numbers into their own code.

Check the file after any edit:

```sh
node scripts/check-tokens.mjs
```

It lists every token and fails if one is missing a type, a unit or an evidence tag.

## Built files

`tokens.json` stays the only place values are edited. Code reads it through the files in `dist/`, which `npm run build:tokens` regenerates from it:

| File | For | Units |
|---|---|---|
| `dist/tokens.js` | WebXR / three.js code | metres, radians, seconds. vpt = metres at 1 m (use `viewSize`) |
| `dist/tokens.css` | the website | physical lengths as `mm`; `deg`, `ms` as CSS units; vpt as a plain number |
| `dist/figma-variables.json` | Figma, via Local variables → Import | vpt as px (1 px = 1 vpt); metres shown in cm, or mm below 1 cm; unit in the description |

`npm run check` validates `tokens.json` and fails if `dist/` is out of date.

```js
import { tokens, viewSize, touchSize, renamed } from './dist/tokens.js';

tokens.material.thickness.regular;                       // 0.008 (m)
tokens.motion.enter.duration;                            // 0.12 (s)
viewSize(tokens.size.interactive.default, 0.75);         // 0.045 (m) for a button placed 0.75 m away
touchSize(tokens.size.interactive.minimum, 0.35);        // 0.022 (m): 64 vpt is only 0.0168 m here, so the fingertip floor wins
renamed['size.target.min'];                              // 'size.interactive.minimum'
```

```css
.button { transition-duration: var(--contour-motion-enter-duration); } /* 120ms */
```

In CSS, names are the token path joined with `-` and prefixed `--contour-`.

## Two layers

- **Primitives** are raw scales with no meaning: `thickness.200` = 0.008 m, `size.1600` = 64 vpt, `spacing.600` = 24 vpt, `duration.120` = 120 ms, `easing.easeOut`, `distance.100` = 0.1 m. For thickness, size and spacing the step is a multiple of the base × 100 (4 mm or 4 vpt); for duration and distance it is the literal value (ms or mm).
- **Aliases** give a primitive a job and are what design and code use: `material.thickness.regular` = `{thickness.200}`. Their names follow one order: `family.role.variant.state.property.bound` (a name only uses the segments it needs). Bounds are `minimum`, `maximum`, `default`, `enter`, `exit`, `release`, `start`.
- **Component tokens** (`anchor`, `dock`, `menu`, `zslider`, `packaging`, `feedback.detent.interval`) are a backlog and keep their v0.1 names until each component is specced.

Alias families: `material`, `motion`, `size`, `spacing`, `color`, `shadow`, `sound`, `input` (hand and body distances, metres) and `zone` (distance from the eyes). Why each name was chosen, with sources: [decisions.md](decisions.md#24-two-layers-and-one-name-order-) and the [v6 anatomy page](https://claude.ai/artifact/PcjDLnrDVqXwhH51DaJrdu).

## Shape of one token

```json
"enter": {
  "$type": "dimension",
  "$value": "{distance.100}",
  "$description": "Hover starts when the fingertip comes closer than this.",
  "$extensions": { "com.contour": { "evidence": "G", "category": "Input" } }
}
```

The dotted path (`input.hover.distance.enter`) is the token's name. An alias's `$value` is `{other.token}`; a primitive holds the value itself, such as `{ "value": 0.1, "unit": "m" }`. This follows the W3C Design Tokens (DTCG) layout, with Contour's units in the value: `vpt`, `m`, `deg` and `ms` (`dmm` is no longer used by any token; the checker still accepts it).

Types used: `dimension` (a size with a unit), `duration` (ms), `number` (ratios, scales, opacities, dB), `cubicBezier` (easing), and `string` for rules that are not numbers (such as `motion.press.behavior = followInput`).

## Evidence tags

Every token says where its number came from. Telling borrowed values apart from measured ones is what makes the system honest research and not a kit clone.

| Tag | Meaning |
|---|---|
| M | Taken from Meta or platform guidelines. Source still to be confirmed. |
| T | To be fixed by user testing. Today's value is a starting point. |
| G | Estimate. Must be re-tuned on a real headset. |
| D | A design decision, not a measurement. |
| N | A rule, not a value (for example, "press follows the finger"). |

## Provisional

Tokens with `"status": "provisional"` are numbers the 3D lab needed that are not decisions yet, such as how far a parent recedes in packaging. Promote one by removing its `status` once it is agreed.

## Renamed in v0.2

Every v0.1 name and what it became is in [`scripts/renames.json`](../scripts/renames.json), and `dist/tokens.js` exports the same map as `renamed`. Removed tokens say why (for example the four `anchor.*.scale` rules, replaced by one sizing rule for every zone, see [decisions.md](decisions.md) §21–§22).

## Using vpt in a scene

The 3D lab works in metres at 1:1 scale. A vpt token in `dist/tokens.js` is already "metres at 1 m", so pass it to `viewSize` with the distance the panel was placed at:

```js
// real size (m) = vpt x 0.00075 x f(d)
viewSize(tokens.size.interactive.default, 0.75);   // 80 vpt at 0.75 m -> 0.045 m
viewSize(tokens.size.interactive.minimum, 2);      // 64 vpt at 2 m -> f(2) = 1.875 -> 0.09 m
```

- Measure `d` once, when the panel is placed, not every frame, so the panel stays still while the head moves.
- Past `zone.room.growth.start` (1.75 m), each extra metre counts as `zone.room.growth.rate` (0.5), so far panels look a little smaller instead of turning into billboards (`effectiveDistance` does this).
- For anything a fingertip touches, use `touchSize`: the view size, but never under `input.touch.size.minimum` (22 mm).
- Physical tokens (`m`) are already real lengths. deg tokens are angles from the eye.

## Known conflict: sticky press

`input.poke.distance.release` asks the finger to pull back 3 mm from the press point before a press ends. The press itself only travels `pressDepth × thickness`. When the travel is shorter than 3 mm, the finger has to lift *above* the resting surface before the button lets go, so it feels sticky.

| | thin 4 mm | regular 8 mm | thick 16 mm |
|---|---|---|---|
| soft 0.6 | 2.4 mm ✗ | 4.8 mm | 9.6 mm |
| firm 0.4 | 1.6 mm ✗ | 3.2 mm (only 0.2 mm spare) | 6.4 mm |
| rigid 0.15 | 0.6 mm ✗ | 1.2 mm ✗ | 2.4 mm ✗ |

A 6 mm firm button (2.4 mm travel) fails too. `scripts/check-tokens.mjs` prints a warning for every failing pair. Rigid is mostly for disabled and structural elements, so its failures matter less. Not resolved in v0.1; see [decisions.md](decisions.md#8-hysteresis-on-every-threshold).

## Values on the site that are not tokens

The lab's per-background scrim values (white wall 0.05, wooden desk 0.18, bookshelf 0.35) are demo fixtures picked inside `color.scrim.opacity.minimum`–`maximum`, not tokens. Real scrim should be computed from measured contrast against `color.contrast.ratio.minimum`.
