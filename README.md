# Contour · XR design system

Contour explores UI as objects with thickness, material and spatial relationships. This repository contains a JavaScript / Three.js implementation, tokens and six separate comparison examples. It is a research implementation, not a released component package or a claim of complete headset support.

Documentation describes implementation `2988b93` (package `0.2.0`, tokens v0.2). Scene coordinates use metres; view-sized values and physical distances have different conversion rules. Tokens, code defaults and fixture constants remain distinct, and many values are provisional.

## Start here

| Guide | Use it for |
| --- | --- |
| [Components](docs/components.md) | Five public components, their sub-controls, events and unfinished features |
| [Examples and setup](docs/examples.md) | Install, desktop and secure WebXR setup; six example entries and checks |
| [Support and evidence](docs/support.md) | Near/ray/native input differences, lifecycle and verification limits |
| [Tokens](docs/tokens.md) | Token source, runtime reader, generated consumers and provisional values |
| [Concepts](docs/concepts.md) and [decisions](docs/decisions.md) | Design history; these are not a current support matrix |

## Run locally

Use Node.js 22.12 or later and npm. The lockfile's Vite engine range is `^20.19.0 || >=22.12.0`; Node 22.12+ is the recommended branch for these instructions.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. `/` is the original demo. For example, `/slider-comparison.html` is the separate slider comparison. See [all entries](docs/examples.md#entries) before treating an original-demo behavior as a comparison feature.

`npm run dev:headset` enables network serving with a development HTTPS certificate. Network reachability, a certificate trusted by the headset browser, WebXR support and user-initiated session entry are separate prerequisites; starting this command proves none of them. See [secure WebXR setup](docs/examples.md#secure-webxr-setup).

## Source and assets

| Path | Responsibility |
| --- | --- |
| [src/index.js](src/index.js) | Public components: Button, ZSlider, PackagingPanel, Toolbar and Dock; also helpers and input/token APIs |
| [src/core/InputSystem.js](src/core/InputSystem.js) | Desktop/XR input routing; component and fixture opt-ins still matter |
| [tokens.json](tokens.json) → [src/tokens.js](src/tokens.js) | Live JSON token source and runtime `createTokens()` API |
| [scripts/tokens-lib.mjs](scripts/tokens-lib.mjs) / [build-tokens.mjs](scripts/build-tokens.mjs) | Shared conversion rules and generated JS/CSS/Figma-variable output |
| [src/core/defaults.js](src/core/defaults.js) | Layout, appearance and input values not yet covered by tokens |
| [demo/](demo) / [demo/comparison/](demo/comparison) | Original scene and fixture-specific adapters; flat controls are not public DS exports |
| [src/core/objects.js](src/core/objects.js) / [design assets](docs/components.md#design-assets-and-icons) | Procedural placeholder app objects and historical lookdev references |

## Current limits

The user will supply final 3D icons; all seven current app objects remain placeholders. Standalone Clock/Measure C01 candidate review and selection are historical and were not integrated. Icon delivery is not a prerequisite for using the existing examples.

Dropdown, closing rail and the proposed shared exploration assembly are not implemented. Comparison content is local demo content, not sensing, furniture placement or external app execution. Transient press/Glow is not a persistent selection state.

Existing synthetic input and desktop GL checks do not establish physical-device behavior, MR readability, comfort or performance. Earlier slider trials received negative user feedback; the later web-source reuse has no confirmed physical resolution. Narrow R17 pane/list acceptance remains separate. See [the evidence boundaries](docs/support.md#evidence-and-acceptance).

Same-device performance remains **NOT_MET** (#12); broader device criteria remain **OPEN** (#13). GPU measurement is deferred and does not resume automatically. Nothing in this documentation refresh changes runtime behavior, release status or those criteria.
