# Contour · XR design system

Contour is a design system built only for XR, mixed reality first. Its one principle: **UI is an object, not a screen.** Objects have thickness, firmness and volume, hold other objects, and never slide in from outside a frame, because XR has no frame.

Current version: tokens v0.2. Everything is measured at real-world scale (1 unit = 1 m).

## What's here

| File | What it is |
|---|---|
| [`tokens.json`](tokens.json) | The single source of truth for every value. The website, the 3D lab and future demos read from here. |
| [`docs/concepts.md`](docs/concepts.md) | The ideas behind the tokens: thickness, firmness, press ratio, hysteresis, vpt, packaging, wayfinding, dock follow, Z-Slider, MR contrast. |
| [`docs/tokens.md`](docs/tokens.md) | How to read `tokens.json`: units, evidence tags, provisional values, renamed tokens. |
| [`docs/decisions.md`](docs/decisions.md) | Why each choice was made: decision, why, alternatives, trade-offs. |
| [`scripts/check-tokens.mjs`](scripts/check-tokens.mjs) | Validates `tokens.json`. Run `node scripts/check-tokens.mjs`. |
| [`src/`](src) | Core components for three.js + WebXR: Button, Z-Slider, Packaging panel, Dock. They read every value from `tokens.json`. |
| [`docs/components.md`](docs/components.md) | What each component does, which tokens drive it, how to run the demo, and the values the tokens don't cover yet. |
| [`demo/`](demo) | A scene with all four components, usable with a mouse or in a headset. |

## Run the demo

```sh
npm install
npm run dev            # desktop browser
npm run dev:headset    # https on your network, for a headset browser
npm test               # token check + interaction logic tests
```

## Token pipeline

`tokens.json` is also built into `dist/tokens.js`, `dist/tokens.css` and `dist/figma-variables.json`. Run `npm run build:tokens` after token edits; `npm run check` rejects stale output. `npm run build` validates tokens and builds the demo.

## Token categories

Primitives (thickness, size, spacing, duration, easing, distance) feed semantic Material, Size, Spacing, Motion, Input, Zone, Color, Shadow and Sound tokens. Component-specific Anchor/Dock, Packaging, menu and Z-Slider tokens retain their names.

Every token carries an evidence tag that says where its number came from: **M** platform guideline, **T** to be confirmed by user testing, **G** estimate to tune on a headset, **D** design decision, **N** rule.
