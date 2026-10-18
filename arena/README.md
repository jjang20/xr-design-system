# Contour design arena

A repeatable loop for choosing token values by looking, not guessing: render the options side by side, drop the ones that break a measurable rule, judge the rest blind (you and an AI model), and write the winner back into [`tokens.json`](../tokens.json).

```
 experiment.json ──► render ──► check ──► judge (you + AI, blind) ──► score ──► promote ──► tokens.json
   (variants)        (PNGs)    (rules)        (votes.jsonl)          (report)   (new value)      │
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
| Experiment | `experiments/<id>.json` | One question, the criteria, and 2 to 5 variants. A variant is a list of token patches like `"material.t.regular": 12`. | Write the question and pick the values to compare. |
| Render | `render.mjs`, `scene/button.html` | Draws each variant at 1:1 scale from the wearer's eye, in rest, hover and press, at the headset's pixel density (25 px per degree, about Quest 3). | Nothing. |
| Check | `check.mjs` | Code-measured rules. A variant that fails is not judged. | Read the warnings. |
| Judge | `judge-human.mjs`, `judge-ai.mjs` | Blind pairs: names hidden, sides shuffled. The AI judges every pair twice with the sides swapped; if it flips, that pair counts as a tie. | Vote. Your votes decide. |
| Score | `score.mjs` | Win/tie/loss and a Bradley-Terry strength per variant, plus how often the AI agreed with you. | Read `report.md`. |
| Promote | `promote.mjs` | Writes the winner into `tokens.json` and stamps the token with the experiment, the votes and the date. Evidence tags are left alone. | Review `git diff tokens.json` and commit. |

`runs/` holds renders, votes and reports. It is git-ignored, so judging never creates noise in the repo; only the promoted token change is committed.

## Adding an experiment

Copy `experiments/button-thickness.json`, change the question, criteria and variants. Any token the button scene reads can be varied today: `material.t.*`, `material.density.firm.press`, `size.button.default`, `size.gap.min`, `feedback.glow.edge`, `feedback.shadow.press.*`, `surface.opacity.base`, `anchor.eccentricity.vertical`. Other components (Z-Slider, packaging, dock) need their own scene file under `scene/`.

## What this can and can't tell you

It judges what tokens *look* like at headset resolution. It cannot judge how they *feel*: press timing, recover springs, hysteresis, haptics and audio need a headset. Those tokens keep evidence tag T until someone tests them on a device, even if they win here. See [decisions.md](decisions.md).
