# Core components

Four three.js + WebXR components built on the tokens: **Button**, **Z-Slider**, **Packaging panel** and **Dock**. They don't hold any numbers of their own: every size, timing and ratio is read from [`tokens.json`](../tokens.json), so changing a token changes every component that uses it. The few values the tokens don't cover yet are collected in one file, listed [below](#values-the-tokens-dont-cover-yet).

![All four components in the demo scene](images/components-overview.png)

## Run the demo

```sh
npm install
npm run dev            # desktop browser: http://localhost:5173
npm run dev:headset    # https on your network, for a headset browser
```

On desktop the mouse acts as a far ray: hover, click to press, wheel or drag to push the Z-Slider, drag empty space (or ← →) to turn. In a headset, a hand closer than 35 cm to a component pokes it with the index fingertip, and further away it uses a ray with pinch. Edit `tokens.json` while the dev server runs and the page reloads with the new values.

Other commands: `npm test` (token check + interaction logic tests), `npm run shot` (renders the demo in headless Chromium and saves screenshots of each state to `shots/`), `npm run build` (static site in `site/`).

## Using a component

```js
import tokenJson from './tokens.json';
import { createTokens, Button, InputSystem } from './src/index.js';

const T = createTokens(tokenJson);            // tokens in metres, seconds, radians
const ok = new Button(T, { label: 'OK', density: 'firm' });
ok.addEventListener('select', () => console.log('pressed'));
scene.add(ok);

const input = new InputSystem({ T, renderer, camera, scene });
renderer.setAnimationLoop(t => {
  input.update();      // turns mouse / hands / controllers into probes
  ok.update(dt);       // each component reads its probes
  renderer.render(scene, camera);
});
```

`createTokens()` converts units once (mm → m, dmm → m at 1 m, deg → rad, ms → s), so components never do unit maths. `T.dmm(name, distance)` gives a dmm size at a placement distance. This is the same shape as the token pipeline's generated `dist/tokens.js`, so the components can switch to it by changing one import.

## Button

A thick object that compresses toward its back face when poked.

| Behaviour | Tokens |
|---|---|
| Thickness | `material.t.thin / regular / thick` |
| Press depth = ratio × t; recover time | `material.density.soft / firm / rigid .press, .recover` |
| Press starts on contact; release after the finger retreats 3 mm from the deepest point | `proximity.poke.press`, `proximity.poke.release` |
| Hover on at 100 dmm, off at 140 dmm | `proximity.hover.enter`, `.exit` |
| Hover glow fades in, 1.5 dmm wide | `motion.hover.in.*`, `feedback.glow.edge` |
| Face size 60 dmm | `size.button.default` |
| Opaque surface with a high-contrast outline | `surface.opacity.base`, `surface.outline.mr` |

Disabled buttons are always `rigid`: they barely give, which reads as "not now". Events: `press`, `release`, `select`, `cancel` (finger slid off).

## Z-Slider

A knob you push away from you (value up) and pull back (value down), along Z instead of X.

| Behaviour | Tokens |
|---|---|
| Travel from fully pulled to fully pushed | `zslider.travel` |
| A tick every 1/10 of the range, as sound | `feedback.detent.interval`, `.audio.gain`, `.audio.length` |
| Contact shadow grows and darkens with push | `feedback.shadow.press.*` |
| Hover, glow, surface | as Button |

How each input moves it: a fingertip can only **push** the face (like a real knob). **Pinching** near the knob grabs it so it can be pulled back. A **ray** (mouse, controller) drags it: moving the pointer further away pushes. The value is shown beside the knob, not on it, so the hand doesn't cover it. A depth ruler under the knob shows the 10 steps. Events: `change`, `detent`.

## Packaging panel

A list whose rows open into a child panel that grows out of the row, instead of sliding in from the side.

![Two levels open in compress mode: the parents recede up and back as a breadcrumb](images/packaging-compress.png)

| Behaviour | Tokens |
|---|---|
| What the parent does: compress, replace or protrude | `packaging.parent.mode` (switchable with `setMode()`) |
| Compress: back 50 mm, up 35 mm, 8 % smaller per level | `packaging.parent.recede.z / y / scale` |
| Parent silhouettes fade 0.6 → −0.14 per level, never below 0.3 | `packaging.parent.recede.opacity.*` |
| Up to 3 levels deep; deeper rows show as disabled | `packaging.depth.max` |
| Open and close transition | `motion.expand.dropdown.*` |

Receded parents are pressable: pressing one goes back to it. That is the wayfinding idea from the concepts doc: the silhouettes are the breadcrumb. Try "replace" in the demo and the breadcrumb disappears. The panel itself is a `rigid`, `thick` object; rows are `thin`, `firm` buttons. Events: `open`, `back`, `select`.

## Dock

The app launcher, body-locked 25° below your view.

![Hand near the Photos icon: icons grow with cosine falloff](images/dock-magnify.png)

| Behaviour | Tokens |
|---|---|
| Body-lock (only mode implemented) | `anchor.mode` |
| 25° below the centre of view | `anchor.eccentricity.vertical` |
| Waits 350 ms after a turn, then follows without wobble | `anchor.follow.delay`, `.damping`, `.frequency` |
| Icons grow up to 1.6× within 250 dmm of the hand, cosine falloff | `dock.magnify.*` |
| Icon size and gaps | `size.button.default`, `size.gap.min` |

WebXR doesn't track the torso, so the dock treats a sustained head turn (more than 20°, held for the delay) as a body turn. A quick glance away never moves it. Events: `select`.

## Input

`InputSystem` turns every input into the same kind of "probe" in each component's own space, so components don't care where input came from:

| Input | Becomes |
|---|---|
| Hand or controller within 350 mm (±50 mm hysteresis) of a component | **poke**: the index fingertip (or controller grip) position, plus pinch state |
| Hand or controller further away | **ray** from the hand or controller, pinch/trigger = press |
| Desktop mouse | **ray** from the camera, click = press, wheel = push/pull |

## Values the tokens don't cover yet

These live in [`src/core/defaults.js`](../src/core/defaults.js), one file, so they're easy to find and promote. Each is a candidate token.

| Value | Now | Why it's needed | Proposed token |
|---|---|---|---|
| Placement distance for dmm | 0.6 m | dmm needs a distance to become metres | `placement.distance.near` |
| Corner radius | 18 % of the short side | every slab has corners | `shape.radius` |
| Hover fade out | same as in | only `motion.hover.in` exists | `motion.hover.out.*` |
| Panel width, row height, padding | 260 / 48 / 16 dmm | the packaging panel's layout | `size.panel.width`, `size.row.height` |
| Dock follow threshold | 20° | without it, every small head move restarts the delay | `anchor.follow.threshold` |
| Dock distance | 0.55 m | body-lock needs a distance | `anchor.distance` |
| Colours | dark surfaces, blue accent | there are no colour tokens yet | `color.*` (MR contrast work) |

## Known limits

- **Adaptive scrim is not implemented.** `surface.scrim.*` needs the contrast of the real background behind each panel, which needs camera access WebXR doesn't give by default. Surfaces use the fixed `surface.opacity.base` and the MR outline for now.
- **Not yet tried on a headset.** Desktop rendering and the interaction logic are tested; hand poke and pinch follow the WebXR Hand Input spec but need a real device check, especially the follow and hover values tagged G.
- **Audio** starts after the first click or tap, because browsers block sound until the user interacts.

## Decisions

### Components take tokens as an argument instead of importing them
- **Decision:** `new Button(T, …)` receives a token object; no component imports `tokens.json` itself.
- **Why:** It keeps one source of truth while letting the source change. Today `T` comes from raw `tokens.json`; tomorrow from the pipeline's generated file, a Figma export, or a test fixture with different values. In Figma terms: components are linked to a library, and you can swap which library.
- **Alternatives:** Each component imports `tokens.json` directly. Shorter to use, but every component would need editing when the pipeline lands, and tests couldn't try other values.
- **Trade-offs:** One extra argument on every constructor.

### Interaction logic is separate from rendering
- **Decision:** Press, hysteresis, follow, magnify and packaging poses are small pure functions or classes (`PressModel`, `Hysteresis`, `LazyFollow`, `packagingPose`, `magnifyScale`) that the three.js components call.
- **Why:** These are the parts the tokens describe, and the parts that need to match across the website, Unity and any future renderer. Keeping them pure means they run in Node tests without a browser or headset, and can be ported one function at a time.
- **Alternatives:** Logic inside each component's update loop. Fewer files, but untestable without rendering.
- **Trade-offs:** A few more files to read when following one behaviour end to end.

### Press: down follows the finger, up springs back at the material's pace
- **Decision:** Going down, the surface tracks the finger exactly (`motion.press.down = follow-input`). Coming back up, it eases back so a full recovery takes exactly `density.recover`, even while the finger is still touching.
- **Why:** Recovery only shows if the surface can lag behind the finger. If it followed the finger both ways, soft and rigid would look the same on the way up, and the recover tokens would do nothing.
- **Alternatives:** Follow the finger both ways and only animate after release. Simpler, but the release hysteresis means the finger is already 3 mm back by then, so there is almost nothing left to animate.
- **Trade-offs:** A soft surface briefly separates from a fast-retreating finger. That is the intended feel, but it should be checked on a headset.

### Ray input presses fully and releases cleanly
- **Decision:** A ray (mouse, controller, far pinch) has no depth, so a ray press goes straight to full press depth, and letting go releases immediately.
- **Why:** Release hysteresis is for a finger hovering at the surface. A ray press is already a clean on/off signal.
- **Alternatives:** Simulate a finger moving in. Would make every click feel slow.
- **Trade-offs:** On desktop you see the press depth but not the "follow" feel. That only exists with hands.

### three.js + WebXR, with Vite for the dev server
- **Decision:** Components are plain JavaScript modules on three.js. The demo uses Vite.
- **Why:** three.js is a widely used WebGL/WebXR library that runs in headset browsers and on desktop, so the same page works for quick desktop checks and real headset tests. Vite gives a dev server that reloads when `tokens.json` changes and an https mode for headsets, which WebXR requires.
- **Alternatives:** React Three Fiber (nicer for app code, but adds React to a component library that doesn't need it); Unity (best headset tooling, but no browser preview and a separate codebase from the website).
- **Trade-offs:** ⚠️ Components are tied to three.js objects. The pure logic ports anywhere, but a Unity version would re-implement the rendering parts.
