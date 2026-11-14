# Examples and setup

This guide describes the scripts and entries checked into implementation `2988b93`. It is a run guide, not a report that a new server, browser or device trial has been started. [Support and evidence](support.md) separates prior checks from physical-device acceptance.

## Install and desktop run

Prerequisites: Node.js 22.12+ and npm. The pinned Vite engine also permits Node `^20.19.0`; this guide uses the Node 22 branch. Dependencies and versions are recorded in [package-lock.json](../package-lock.json), including Three.js, Troika text, Inter, Vite and playwright-core.

```sh
npm ci
npm run dev
```

Use the URL actually printed by Vite; its default port may be occupied. [vite.config.js](../vite.config.js) serves `demo/` as the root, so entry URLs do not include `/demo/`. On desktop, a pointer supplies a camera ray. Hover alone is not an action. Read each entry's visible instructions for the action/drag and its Reset control. The original demo also supports empty-space camera dragging and arrow-key view turning; this is not keyboard focus/activation for 3D controls.

## Entries

| URL path | Source | Result and exclusions | Detailed contract |
| --- | --- | --- | --- |
| `/` | [main.js](../demo/main.js) | Catalog, Toolbar, Z-Slider and Dock. Z starts at .4 and affects the authored backdrop; action/leaf/app callbacks show messages. This is not the later comparison assembly. | [Component inventory](components.md) |
| `/slider-comparison.html` | [slider-comparison.js](../demo/slider-comparison.js) | Z and Flat X share brightness `[0,1]`, initially 1; both numbers and samples mirror it. Final dim covers virtual scene/UI; passthrough scope is blend-mode dependent. Restore returns 1. No system brightness change. | [Slider](slider-comparison.md) |
| `/window-resize-comparison.html` | [window-resize-comparison.js](../demo/window-resize-comparison.js) | Independent corner resize with matched outer/content-growth policy and eight read-only rows. Whole-row fit is measured after text sync. No movement, navigation or live-distance scaling. | [Resize](window-resize-comparison.md) |
| `/action-comparison.html` | [action-comparison.js](../demo/action-comparison.js) | Button and Toolbar actions update independent last-action notices. Repeat may show the same string. No toggle, persistent selection or app execution. | [Actions](action-comparison.md) |
| `/window-movement-comparison.html` | [window-movement-comparison.js](../demo/window-movement-comparison.js) | Flat bottom capsule versus Contour left/right skin. Near motion is 3D; far motion uses the captured initial front plane. No resize, titlebar/flat-side movement or navigation. | [Movement](window-movement-comparison.md) |
| `/hierarchy-comparison.html` | [hierarchy-comparison.js](../demo/hierarchy-comparison.js) | Flat same-pane list/Back versus Contour stack/Back and supported hand Push; four authored catalog details with dimensions/footprints. No furniture placement or sensing. | [Hierarchy](hierarchy-comparison.md) |
| `/dock-content-comparison.html` | [dock-content-comparison.js](../demo/dock-content-comparison.js) | Seven Flat rows versus seven procedural Dock objects; independent read-only content panes and Back. Plate/sphere manipulation is disabled. | [Dock content](dock-content-comparison.md) |
| `/bench.html` | [bench.js](../demo/bench.js) | Existing development framing/state harness. Synthetic scene states and historical images are not user trials. | [Historical frames](components-history-2026-11-08.md) |

The six comparisons are separate entry pages. They do not constitute a unified free-exploration screen or a completed user-research protocol. Visible guidance changes first-exposure conditions. Revisable scenario decisions do not implement additional navigation, Dropdown, closing rail or Dock manipulation comparisons.

## Secure WebXR setup

```sh
npm run dev:headset
```

The existing configuration enables `@vitejs/plugin-basic-ssl` and network binding in `headset` mode. This creates a development HTTPS endpoint, not a production deployment or universally trusted certificate. A browser needs a reachable origin and an accepted/trusted secure context before WebXR availability can be assessed. Do not infer session support from a successful desktop load or an HTTPS response.

The six comparison entries request XR only after their visible entry action, using the implemented session-support checks. The original demo prefers supported immersive AR and otherwise VR, with local-floor and optional hand tracking. Browser/device support, native semantic select delivery and actual session lifecycle still need separate verification. A development certificate does not grant camera, spatial-sensing or system-brightness capabilities. Certificate installation, device permissions and physical trials are not performed by this documentation task.

## Build and checks

| Command | What it actually does |
| --- | --- |
| `npm run check` | Validates tokens and checks generated token artifacts for staleness; it does not render or test a headset. |
| `npm run build:tokens` | Regenerates token artifacts in `dist/`; use only when token changes are intended. |
| `npm test` | Token/generated checks, Node tests through the font/DOM test support, then Arena Node tests. Synthetic inputs are not physical input. |
| `npm run build` | Runs `check`, then Vite builds the configured entries to `site/`. This does not launch a server or prove runtime/device support. |
| `npm run shot`, `npm run bench`, `npm run regress` | Existing browser/render checks for their own historical scope, not replacements for the comparison checks below. |

The JavaScript package has no separate TypeScript/typecheck script. Do not label syntax, token or build checks as TypeScript validation. `npm run build` writes `site/`; `build:tokens` writes generated files. Neither is needed just to edit prose.

The slider and resize checkers use a temporary Vite development server; the action, movement, hierarchy and Dock-content checkers use Vite preview of an existing `site/` build. All use playwright-core with an installed browser. They do not install a browser. The scripts support `CHROMIUM_PATH`; inspect the chosen checker for its output setting and browser default before running it. They create temporary local preview/browser resources and contain cleanup for those resources. They do not validate an independently retained preview.

| Comparison | Public-input tests | Desktop checker |
| --- | --- | --- |
| Slider | [slider-comparison.test.js](../test/slider-comparison.test.js), [slider-pinch-continuity.test.js](../test/slider-pinch-continuity.test.js) | [verify-slider-brightness.mjs](../scripts/verify-slider-brightness.mjs) |
| Resize | [window-resize-comparison.test.js](../test/window-resize-comparison.test.js) | [verify-window-resize.mjs](../scripts/verify-window-resize.mjs) |
| Actions | [action-comparison.test.js](../test/action-comparison.test.js) | [verify-action-comparison.mjs](../scripts/verify-action-comparison.mjs) |
| Movement | [window-movement-comparison.test.js](../test/window-movement-comparison.test.js) | [verify-window-movement.mjs](../scripts/verify-window-movement.mjs) |
| Hierarchy | [hierarchy-comparison.test.js](../test/hierarchy-comparison.test.js) | [verify-hierarchy-comparison.mjs](../scripts/verify-hierarchy-comparison.mjs) |
| Dock content | [dock-content-comparison.test.js](../test/dock-content-comparison.test.js) | [verify-dock-content-comparison.mjs](../scripts/verify-dock-content-comparison.mjs) |

For example, after an intentional build, `node scripts/verify-action-comparison.mjs` checks that built entry. These commands are references, not a request to rerun every check. No suite, build, browser or device run was needed for this prose-only refresh.

## Content and resource boundaries

R05 details come from [catalog-data.js](../demo/catalog-data.js). R06 Planner/Measure reuse those authored items; Scan is a sample plan, Photos uses the bundled room HDR, Notes is authored text, Settings reports the opening action's input/locale context, and Clock samples local time on opening. None launches an external app or measures the room. [Dock content details](dock-content-comparison.md#content).

Scene owners must handle input cancellation, asynchronous text/material ownership and session cleanup explicitly. R06's disposal protocol is specific to that entry; it is not evidence that every earlier demo has the same cleanup guarantees. Keep shared cached resources separate from entry-owned resources. [Lifecycle differences](support.md#cancellation-reset-and-lifecycle) remain part of the example contract.
