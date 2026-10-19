# Contour

An XR-only design system. 1 unit = 1 m. Tokens live only in `tokens.json`; see `docs/` for concepts and decisions and `arena/` for the eval loop.

## Quality bar

Every component and render must reach shipping visionOS level or better. A tidy 3D demo is not enough. Placeholders are labelled as placeholders. The arena bar (`arena/lib/bar.mjs`) is the written definition.

## Skills to use

Load the matching skill before the work, and say which one shaped a decision.

| Skill | Use it for |
|---|---|
| `apple-design` | Component visuals, materials, depth, type, springs and gestures. Source of the bar's material, type, states and depth rows. |
| `emil-design-eng` | Motion, easing, timing, hover and press states, polish. Source of the arena motion rules (`arena/lib/motion.mjs`). |
| `review-animations` | Review any animation code before calling it done. If it isn't available, review against `emil-design-eng` and say so. |
| `design:design-critique` | Critique every render or screen before presenting it as a result. |
| `design:design-system` | Any change to `tokens.json` or to how components use tokens: naming, hard-coded values, variant and state docs. |
| `design:accessibility-review` | Every component: text contrast on glass, target size (`size.*` tokens), reduced motion. |
| `animation-vocabulary` | Naming a motion someone describes without a term. |

## Working rules

- Explanations: conclusion first, then Decision, Why, Alternatives, Trade-offs. Mark hard-to-undo choices with ⚠️.
- Only push or merge after Jihoon confirms.
