# Contour · XR design system

Contour is a design system built only for XR, mixed reality first. Its one principle: **UI is an object, not a screen.** Objects have thickness, density and volume, hold other objects, and never slide in from outside a frame, because XR has no frame.

Current version: tokens v0.1. Everything is measured at real-world scale (1 unit = 1 m).

## What's here

| File | What it is |
|---|---|
| [`tokens.json`](tokens.json) | The single source of truth for every value. The website, the 3D lab and future demos read from here. |
| [`docs/concepts.md`](docs/concepts.md) | The ideas behind the tokens: thickness, firmness, press ratio, hysteresis, vpt, packaging, wayfinding, dock follow, Z-Slider, MR contrast. |
| [`docs/tokens.md`](docs/tokens.md) | How to read `tokens.json`: units, evidence tags, provisional values, renamed tokens. |
| [`docs/decisions.md`](docs/decisions.md) | Why each choice was made: decision, why, alternatives, trade-offs. |
| [`scripts/check-tokens.mjs`](scripts/check-tokens.mjs) | Validates `tokens.json`. |
| [`scripts/build-tokens.mjs`](scripts/build-tokens.mjs) | Builds `tokens.json` into `dist/`: JS for WebXR code, CSS for the website, a Figma Variables import file. |
| [`dist/`](dist) | The built files. Don't edit them; run `npm run build`. |

After editing `tokens.json`, run `npm run build`. `npm run check` fails if anything is invalid or `dist/` is stale.

## Token categories

Two layers. **Primitives** are raw scales (`thickness`, `size`, `spacing`, `duration`, `easing`, `distance`). **Aliases** give them a job: `material`, `motion`, `size`, `spacing`, `color`, `shadow`, `sound`, `input` (hand distances) and `zone` (distance from the eyes). Component tokens (anchor/dock, menu, Z-Slider, packaging, detent) are a backlog and keep their v0.1 names. Things the eye judges are in **vpt**; things the hand or body reaches are in **metres**. See [docs/tokens.md](docs/tokens.md).

Every token carries an evidence tag that says where its number came from: **M** platform guideline, **T** to be confirmed by user testing, **G** estimate to tune on a headset, **D** design decision, **N** rule.
