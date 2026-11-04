# Contour concepts

Contour is a design system made only for XR (mixed reality first). This page explains the ideas the tokens come from. The values themselves live in [`tokens.json`](../tokens.json); [tokens.md](tokens.md) explains how to read that file, and [decisions.md](decisions.md) records why each choice was made.

## The one principle: UI is an object, not a screen

Every rule in Contour comes from one sentence: **UI is an object.** Objects have thickness, volume and density. They hold other objects. They do not slide in from outside a frame, because in XR there is no frame.

The project started as "an XR interaction token system". Seven separate ideas then converged on this principle, and tokens moved from being the claim to being the tool: tokens are how the principle is defined and tested.

Why tokens at all: in 2D a button has about four states (default, hover, pressed, disabled) because there is one pointer. In XR, states multiply: 5 input modalities × 2 distances (near/far) × 5 states = 50 combinations for one button, and × 3 feedback channels (visual, audio, haptic) on top. That is too many to manage as Figma variants, so the parameters behind them have to become tokens. None of the four big platforms (Meta Horizon OS, Apple visionOS, Android XR, MRTK3) publishes these interaction parameters as tokens today; they are hard-coded, inherited, or hidden in the OS.

## Three root causes (the three axes)

Seven components that break in XR were analysed. They break for three reasons, and every token category maps to one of them:

| Axis | What changed from 2D | Token answer |
|---|---|---|
| (a) Contact became continuous | Touching is no longer yes/no; it is a distance | **Proximity**: thresholds and hysteresis |
| (b) The coordinate system disappeared | There is no screen edge to pin things to | **Anchor**: head / body / world-lock, delay, angle |
| (c) Input multiplied | One pointer became eyes + two hands + controllers | **Arbitration**, handled inside Proximity |

## The concepts behind the tokens

### Thickness `material.thickness`
Every real object has thickness, so every element has a thickness (thin 4, regular 8 or thick 16 mm). Rendering cost is negligible.

The hidden payoff: once things have thickness, **pressing means compressing the object**. Press depth stops being an arbitrary animation value and becomes a fraction of the thickness. Change the thickness and the press scales with it.

### Firmness and the press ratio `material.firmness`
Firmness turns the material into an interaction profile. (It was called density until v0.2; "density" means compact layout in Material 3 and Meta, so it was renamed.) A dense object presses less and springs back fast; a soft one presses deep and recovers slowly.

| Firmness | Press depth (fraction of thickness) | Recovery (`motion.recovery.*`) | Use |
|---|---|---|---|
| soft | 0.6 t | 220 ms | deep press, slow return |
| firm | 0.4 t | 140 ms | default |
| rigid | 0.15 t | 80 ms | disabled and structural elements |

So a firm button that is 8 mm thick presses 0.4 × 8 = 3.2 mm. Each firmness has its own recovery time in `motion.recovery.<firmness>.duration`.

### Hysteresis (`input`)
XR has no click, so a touch only exists once a distance is defined. With a single threshold, a hand hovering near it makes the state flicker. Hysteresis draws a different line for entering (100 mm) and leaving (140 mm); inside the band the state keeps whatever it was. The same pattern repeats for poke release (3 mm retreat) and the direct-touch switch (enter 350 mm, exit 400 mm). Every pair is named by its edges: `distance.enter` and `distance.exit`.

### Units: vpt, m, deg
Before writing a number, ask "eye or hand?"
- **vpt** (view point) is for everything the eye judges: sizes, spacing, type, outline and glow widths. 1 vpt is 0.75 mm of real size per metre of viewing distance (0.75 dmm, about 0.043°), so an 80 vpt button looks the same size at any distance, and mobile-style numbers (16 body, 40 button, 64 target, an 8 grid) work. Real size (m) = vpt × 0.00075 × f(d). `d` is measured once, when the panel is placed; `f(d)` grows half as fast past 1.75 m. In Figma, 1 px = 1 vpt.
- **m** is for everything the hand or body reaches: hover and poke distances, thickness, the 22 mm fingertip floor, zone distances. Stored in metres; docs and Figma show cm, or mm below 1 cm.
- **deg** is an angle from the viewer's eye, for things like how far down a menu may extend.

### Packaging
Packaging is the project owner's own term and the spine of the system. The question is not the list itself but what happens after you press a row. Sliding a new screen in from the side feels wrong when there is no frame. Instead, the next view comes out of the current object, like a box inside a box, a letter in an envelope, or a matryoshka doll.

When a child opens, the parent has to do one of three things:
- **compress**: move back and get smaller (lab default)
- **replace**: swap in place
- **protrude**: the child comes forward

Which one is the default is still open. Packaging also absorbs the dialog: a modal is just a packaging state where the panel you were looking at comes forward and the rest recedes.

Two holes it has to fill:
- **Depth budget.** Each level uses up depth. In MR the real wall is the limit: open three levels at a desk 60 cm from a monitor and the panel goes through the monitor.
- **Wayfinding.** After opening three envelopes, how do you know where you are? The visible silhouettes of the receded parents *are* the breadcrumb. That makes the parent's opacity a navigation feature, not decoration. Choose "replace" in the lab and the breadcrumb disappears, which shows why.

Multi-level packaging is a stretch goal because motion is half the work. One level (the dropdown's inline expand) is enough to prove the principle.

### Dock and lazy follow
Every XR OS ships a home screen, and home screens force horizontal scrolling. Contour makes the dock the app touch point instead.

- **Anchor**: body-lock. Head-lock is a sticker on your glasses (always visible, annoying, causes sickness). World-lock is a picture on the wall (natural, but lost when you turn). Body-lock is a bag strapped to your waist: it stays put when you turn your head, and follows when your body turns.
- **Lazy follow**: the dock starts following 350 ms after the body turns, with critical damping (no wobble). The real cost of the dock is tuning this follow, not the magnify maths: wrong values are the top cause of motion sickness, and they can only be tuned on a headset.
- **Hand magnify**: icons grow as the hand approaches (133⅓ vpt radius (the recovered 100 dmm), up to 1.2×, cosine falloff; the lookdev’s single-icon focus). In 2D, macOS dock magnify is decoration. In XR it becomes a Fitts's-law aid: targets grow before you reach them.

The dock is the only component that proves axis (b).

### Z-Slider and detents
A slider that moves along Z (push and pull) instead of X, like the air vents in a Rolls-Royce. Arms shake less moving forward and back than side to side. It is a testable hypothesis: run the same task on X and Z and compare error, time and preference.

Two honest risks: people judge their own hand's depth poorly, and the hand covers the control because it moves along the line of sight. The design answer is depth cues (a contact shadow that grows with push depth), **detents** (a tick every 1/10 of the range, as audio at -18 dB because hands have no haptics), and showing the value beside the hand instead of under it.

### MR-first and adaptive contrast
Mixed reality was chosen over full VR. Because the background cannot be controlled, colour becomes the core of the system. Contour surfaces are not glass: they are opaque by default (0.92), a scrim appears behind them when contrast drops below 3:1, and a 1 vpt high-contrast outline keeps edges visible on bright walls and busy shelves.

## Lineup and scope

Built: **Button** (material tokens and the state matrix), **Dock** (anchor, axis b), **Z-Slider** (the A/B test), **Dropdown** (long, opens downward, no scrolling, one-level packaging), and **Panel** as the base.

Spec only: side close rail, knob, multi-level packaging depth budget and wayfinding, X-axis slider (as the comparison).

Out of scope, with reasons: text input and keyboards (an input-method problem, not a component), toast (not essential), dialog (absorbed into packaging), controllers and voice, cross-platform, light theme and full accessibility, formal package release.

## Open questions
Text input, scrolling, the hierarchy of attention in space (what replaces toast → banner → modal), arbitration between eyes and both hands, per-modality token profiles (Apple's gaze + pinch vs Meta's poke), and personalising tokens per user.

## Glossary

| Term | Plain version | Precise version |
|---|---|---|
| Packaging | A new view comes out of the current object, like a box inside a box | Transition where content enters or exits an object instead of sliding in from outside |
| State matrix explosion | One button's wardrobe multiplies until the closet bursts | States multiply as modality × distance × state × feedback channel |
| vpt | A ruler that draws far things bigger so they look the same size | 0.75 mm at 1 m (0.75 dmm), scaled with placement distance |
| Hysteresis | Different lines for coming in and going out, so the light doesn't flicker at the door | Separate enter and exit thresholds to stop boundary flicker |
| Detent | The click-click you feel turning a dial | Discrete step points; Z-Slider's stand-in for haptics |
| Lazy follow | A dog that follows you, a little late | Body-lock follow with delay and damping |
| Head / body / world-lock | Sticker on glasses / bag on your waist / picture on the wall | What the UI is fixed to: view, torso or space |
| Eccentricity | How far off the centre of your view | Angle from the centre of the visual field |
| Falloff | Big in the middle, less to the sides | Curve that fades an effect with distance |
| Depth budget | Boxes in boxes eat the space in front of you | Total Z space nesting may use |
| Wayfinding | Knowing which envelope you're in | Awareness of current location and the way back |
| Self-occlusion | Your hand hides what you're looking at | The operating hand covers the control or its feedback |
| Evidence tag | A label saying where a number came from | M guideline / T to be user-tested / G estimate |
