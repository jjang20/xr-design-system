# Contour design arena

A repeatable loop for choosing token values by looking, not guessing: render the options, drop the ones that break a measurable rule, hold the rest to a visionOS-level bar, rank the survivors blind (you and an AI model), and write the winner back into [`tokens.json`](../tokens.json).

```
 experiment.json ──► render ──► check ──► bar ──► pairwise ──► score ──► promote ──► tokens.json
   (variants)        (PNGs)    (rules)  (visionOS   (which is    (report)  (new value)      │
                                         level?)     better?)                               │
        ▲                                                                                       │
        └────────────────────────── next question ◄──────────────────────────────────────────────┘
```

## Run it

```sh
cd arena
npm install                       # once
npm run render -- button-thickness
npm run check  -- button-thickness
npm run judge  -- button-thickness   # opens a local page; keys 1 / 2 / 3 to vote
npm run judge:ai -- button-thickness # optional second opinion, needs ANTHROPIC_API_KEY
npm run score  -- button-thickness   # writes runs/button-thickness/report.md
npm run promote -- button-thickness  # writes the winner into tokens.json
```

Rendering uses Playwright with Chromium. If you have no Playwright browser installed, it falls back to your installed Google Chrome, or set `CHROMIUM_PATH`. `judge:ai -- <id> --dry-run` prints exactly what the AI judge sees without calling the API.

## What each step does

| Step | File | What it does | What you do |
|---|---|---|---|
| Experiment | `experiments/<id>.json` | One question, the criteria, and 2 to 5 variants. A variant is a list of token patches like `"material.thickness.regular": 0.012`. | Write the question and pick the values to compare. |
| Render | `render.mjs`, `scenes/`, `scene/button.html` | Draws each variant at 1:1 scale from the wearer's eye at the headset's pixel density (25 px per degree, about Quest 3), using the real components where a scene exists (see below). | Nothing. |
| Check | `check.mjs`, `lib/checks.mjs` | Code-measured rules. A variant that fails is not judged. | Read the warnings. |
| Bar | `judge-human.mjs`, `judge-ai.mjs`, `lib/bar.mjs` | Each variant alone, next to your reference images: does it reach visionOS level? Scored by eye on seven rows (material, light, shape, type, states, depth, cohesion; the material, type, states and depth rows spell out Apple's own standards); the AI needs 4 of 5 on every row. An eighth row, motion, is checked by code (see below). Variants that fail stop here. | Ship it / Not yet, and tick what falls short. |
| Pairwise | `judge-human.mjs`, `judge-ai.mjs` | Only bar passers, two at a time, names hidden, sides shuffled. The AI judges every pair twice with the sides swapped; if it flips, that pair counts as a tie. | Vote. Your votes decide. |
| Score | `score.mjs` | Win/tie/loss and a Bradley-Terry strength per variant, plus how often the AI agreed with you. | Read `report.md`. |
| Promote | `promote.mjs` | Writes the winner into `tokens.json` and stamps the token with the experiment, the votes and the date. Refuses any variant you did not pass at the bar. Evidence tags are left alone. | Review `git diff tokens.json` and commit. |

If nothing reaches the bar, the experiment ends with no winner and nothing changes. That is the point: a ranking of bad options is not a result.

`runs/` holds renders, votes and reports. It is git-ignored, so judging never creates noise in the repo; only the promoted token change is committed.

## Motion rules

A still render can't show motion, so `check.mjs` checks the motion tokens against Emil Kowalski's design-engineering rules (`lib/motion.mjs`): entering motion uses a strong custom ease-out (never ease-in or a built-in CSS curve), UI motion stays under 300 ms, press tracks the finger, release takes 200 ms or less, and hover feedback stays at 100 to 160 ms. Apple's fluid-interface rules add three more: anything the user touches settles with an interruptible spring rather than a fixed duration, motion that wasn't thrown by the user never overshoots (so `anchor.follow` must be critically damped), and every motion has a reduced-motion fallback. A finding on a token the experiment varies counts against that variant. Findings on other tokens are reported as "the system vs the motion bar" without blocking the experiment.

## Reference images

Put captures of the level you want to reach in `arena/references/` (your own visionOS screenshots, or the best Contour render so far). Both judges see them next to every candidate at the bar. The folder is git-ignored, because screenshots of other products are for judging, not for committing.

## Adding an experiment

Copy `experiments/button-thickness.json`, change the question, criteria and variants. Any token the button scene reads can be varied today: `material.thickness.*`, `material.firmness.firm.pressDepth`, `size.interactive.default`, `spacing.gap.minimum`, `material.glow.width`, `shadow.contact.*`, `material.opacity.default`, `anchor.eccentricity.vertical`. Other components (Z-Slider, packaging, dock) need their own scene file under `scene/`.

## What gets rendered

An experiment's `fixtures.scene` picks the scene:

| Scene | What it draws | Used by |
|---|---|---|
| `catalog-stack` | The real Catalog from `src/`, through the repo's own bench page (`demo/bench.html`), three levels deep, from the front and from 35° to the side. | `catalog-parent-dim` |
| `button` (default) | `scene/button.html`, a placeholder used to build the loop. It does not meet the bar and isn't Contour's look. | `button-thickness` |

Real-component scenes start the repo's Vite server (run `npm install` in the repo root once) and answer the bench's one request for `tokens.json` with the variant's patched copy, so the components read the variant exactly as they read the shipped file. Nothing in `src/` or `demo/` knows about the arena. A new scene is a file in `scenes/` that drives the bench into the state to judge and returns its screenshots and pixel measurements.

## What this can and can't tell you

It judges what tokens *look* like at headset resolution. It cannot judge how they *feel*: press timing, recover springs, hysteresis, haptics and audio need a headset. Those tokens keep evidence tag T until someone tests them on a device, even if they win here. See [decisions.md](decisions.md).
