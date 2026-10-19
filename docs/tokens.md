# Reading tokens.json

[`tokens.json`](../tokens.json) is the single source of truth for Contour values. The website, the 3D lab and any future demo should read values from it instead of typing numbers into their own code.

Check the file after any edit:

```sh
node scripts/check-tokens.mjs
```

It lists every token and fails if one is missing a type, a unit or an evidence tag.

## Built files

`tokens.json` stays the only place values are edited. Code reads it through the files in `dist/`, which `npm run build` regenerates from it:

| File | For | Units |
|---|---|---|
| `dist/tokens.js` | WebXR / three.js code | metres, radians, seconds. dmm = metres at 1 m |
| `dist/tokens.css` | the website | `mm`, `deg`, `ms` as CSS units; dmm as a plain number |
| `dist/figma-variables.json` | Figma, via Local variables → Import | the token's own number; unit in the description |

`npm run check` validates `tokens.json` and fails if `dist/` is out of date.

```js
import { tokens, atDistance } from './dist/tokens.js';

tokens.material.t.regular;                         // 0.008 (m)
tokens.motion.hover.in.duration;                   // 0.12 (s)
atDistance(tokens.size.button.default, 0.75);      // 0.045 (m) for a button 0.75 m away
```

```css
.button { transition-duration: var(--contour-motion-hover-in-duration); } /* 120ms */
```

In CSS, names are the token path joined with `-` and prefixed `--contour-`.

## Shape of one token

```json
"enter": {
  "$type": "dimension",
  "$value": { "value": 100, "unit": "dmm" },
  "$description": "Hover starts when the hand comes closer than this.",
  "$extensions": { "com.contour": { "evidence": "G", "category": "Proximity" } }
}
```

The dotted path (`proximity.hover.enter`) is the token's name. This follows the W3C Design Tokens (DTCG) format, the same JSON shape Figma Variables export and Style Dictionary read, with three XR units added: `dmm`, `mm` and `deg` (plus `ms` for time).

Types used: `dimension` (a size with a unit), `duration` (ms), `number` (ratios, scales, opacities, dB), `cubicBezier` (easing), and `string` for rules that are not numbers (such as `anchor.mode = body-lock`).

## Evidence tags

Every token says where its number came from. Telling borrowed values apart from measured ones is what makes the system honest research and not a kit clone.

| Tag | Meaning |
|---|---|
| M | Taken from Meta or platform guidelines. Source still to be confirmed. |
| T | To be fixed by user testing. Today's value is a starting point. |
| G | Estimate. Must be re-tuned on a real headset. |
| D | A design decision, not a measurement. |
| N | A rule, not a value (for example, "press follows the finger"). |

## v0.1 and provisional

- **v0.1** (41 entries): the 35 tokens listed on the Contour website, with a few split into parts (see below).
- **provisional** (14 entries, `"status": "provisional"`): numbers the 3D lab hard-codes that the website calls "not defined yet", such as how far a parent recedes in packaging. They are here so the lab can stop hard-coding them, but they are not decisions yet. Promote one by removing its `status` once it is agreed.

## Names that changed from the website table

The website shows some tokens as one row with two values. Tokens should hold one value each, so these were split:

| Website | tokens.json |
|---|---|
| `material.density.soft` = press 0.6t, recover 220ms (same for firm, rigid) | `material.density.soft.press` = 0.6, `material.density.soft.recover` = 220ms |
| `motion.hover.in` = 120ms, ease-out | `motion.hover.in.duration`, `motion.hover.in.easing` |
| `motion.expand.dropdown` = 240ms, ease-in-out | `motion.expand.dropdown.duration`, `motion.expand.dropdown.easing` |
| `surface.scrim.range` = 0.0→0.35 | `surface.scrim.min`, `surface.scrim.max` |
| `feedback.detent.audio` = short tick, -18dB | `feedback.detent.audio.gain` = -18 (+ provisional `.length` = 30ms) |
| `feedback.shadow.press` = grows with push depth | `feedback.shadow.press.curve` (+ provisional `.scale`, `.opacity.min/max`) |
| `size.button.default` = 60×60dmm | `size.button.default` = 60dmm (square) |
| `proximity.nearfar.hysteresis` = ±50mm | 50mm (the ± is implied) |

## Using dmm in a scene

The 3D lab works in metres at 1:1 scale. To turn a dmm token into metres, multiply by the distance the UI is placed at. `dist/tokens.js` already divides by 1000, so use `atDistance`:

```js
// 60 dmm at 0.75 m away -> 0.045 m wide
atDistance(tokens.size.button.default, 0.75);
// from raw tokens.json: dmm / 1000 * distanceM
```

mm tokens are physical and convert directly (`mm / 1000`). deg tokens are angles from the eye.

## Sizing by anchor (provisional)

dmm × distance is only half the rule. The anchor decides *which* distance and *when* it is measured (see [decisions.md](decisions.md), §20):

```js
const { anchor, size } = tokens;
// hand: physical, never rescales; touch targets never under the floor (0.022 m)
Math.max(designedSizeM, size.target.floor);
// body: re-run whenever the window moves
atDistance(size.button.default, currentDistanceM);
// surface / world: run once at placement, keep the result
const placed = atDistance(size.button.default, placeDistanceM);
// world past the knee (1.75 m): extra distance counts at the growth rate
const k = anchor.world.growth.knee;
const effective = d => (d <= k ? d : k + anchor.world.growth.rate * (d - k));
```

## Known conflict: sticky press

`proximity.poke.release` asks the finger to pull back 3 mm from the press point before a press ends. The press itself only travels `density ratio × t`. When the travel is shorter than 3 mm, the finger has to lift *above* the resting surface before the button lets go, so it feels sticky.

| | thin 4 mm | regular 8 mm | thick 16 mm |
|---|---|---|---|
| soft 0.6 | 2.4 mm ✗ | 4.8 mm | 9.6 mm |
| firm 0.4 | 1.6 mm ✗ | 3.2 mm (only 0.2 mm spare) | 6.4 mm |
| rigid 0.15 | 0.6 mm ✗ | 1.2 mm ✗ | 2.4 mm ✗ |

A 6 mm firm button (2.4 mm travel) fails too. `scripts/check-tokens.mjs` prints a warning for every failing pair. Rigid is mostly for disabled and structural elements, so its failures matter less. Not resolved in v0.1; see [decisions.md](decisions.md#8-hysteresis-on-every-threshold).

## Values on the site that are not tokens

The lab's per-background scrim values (white wall 0.05, wooden desk 0.18, bookshelf 0.35) are demo fixtures picked inside `surface.scrim.min`–`max`, not tokens. Real scrim should be computed from measured contrast against `surface.contrast.min`.
