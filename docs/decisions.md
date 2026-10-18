# Decision log

Each entry follows the same shape: **Decision**, **Why**, **Alternatives** (and what would have happened), **Trade-offs**. ⚠️ marks choices that are expensive to undo later.

---

## Part 1. How the tokens live in this repo

### 1. One `tokens.json` at the repo root, in W3C DTCG format ⚠️
- **Decision:** All values live in a single `tokens.json` using the W3C Design Tokens (DTCG) shape (`$value`, `$type`, `$description`, `$extensions`).
- **Why:** A token system is only real if there is one place the numbers come from. Today the website has the values typed into its own code twice (once in the token table, once in the 3D lab). Moving them here means changing a number once changes it everywhere. DTCG is the format Figma Variables, Tokens Studio and Style Dictionary all understand, so the same file can later feed Figma, the website and Unity. In Figma terms: this is the published library, and every file links to it instead of keeping detached copies.
- **Alternatives:** A JavaScript/TypeScript module (`tokens.ts`) would be easier for the website to import, but Figma and Unity can't read it. A spreadsheet or a Markdown table is easy to read, but nothing can consume it automatically.
- **Trade-offs:** DTCG only defines `px` and `rem` for sizes. Contour adds `dmm`, `mm` and `deg`, so off-the-shelf tools will need a small custom transform. ⚠️ The token *names* become a public API once the website, Figma and Unity read them; renaming later means updating every consumer, so names are worth getting right now.

### 2. One value per token
- **Decision:** Rows on the website that held two values were split, for example `material.density.soft` became `.press` (0.6) and `.recover` (220 ms). The full list is in [tokens.md](tokens.md#names-that-changed-from-the-website-table).
- **Why:** Code and Figma Variables bind to single values. "press 0.6t, recover 220ms" is readable for people but can't be bound to anything.
- **Alternatives:** Composite tokens (one token whose value is an object). DTCG allows this for a few types like `transition`, but tool support is patchy, and our groups don't match those types.
- **Trade-offs:** Slightly more names (35 rows became 41 tokens), and names differ from the website table until the site is updated to read this file.

### 3. Rules are stored as tokens too
- **Decision:** Non-numeric rules like `motion.press.down = follow-input` and `motion.recover = inherit:material.density` are kept as `string` tokens with evidence tag N.
- **Why:** These rules are as much a part of the system as the numbers; "press is finger tracking, not an animation" is a design decision someone could otherwise break by adding a press animation. Keeping them next to the values means nobody forgets them.
- **Alternatives:** Keep rules only in the docs. Cleaner file, but the rule is invisible to anyone reading the tokens.
- **Trade-offs:** Tools will treat them as plain text and do nothing with them. They are documentation that happens to live in the data file.

### 4. Values the 3D lab hard-codes are included, marked provisional
- **Decision:** 14 numbers the lab uses but the website calls "not defined yet" (packaging recede distance, scale and opacity; follow spring frequency; detent length; shadow growth; Z-Slider travel) are in `tokens.json` with `"status": "provisional"`.
- **Why:** The goal is that the website reads every value from here. Leaving these out would keep magic numbers in the lab code. Flagging them keeps the honesty of the v0.1 list.
- **Alternatives:** Leave them in the lab code until decided (two sources of truth again), or promote them straight to v0.1 (claims decisions that weren't made).
- **Trade-offs:** A reader has to notice the flag. `scripts/check-tokens.mjs` marks them with `~` in its output to help.

### 5. A check script first, a build step once a second reader appears
- **Decision:** Start with `scripts/check-tokens.mjs` (no dependencies) to validate the file. Add a build step only when a second consumer reads the tokens. That moment came with the WebXR components and Figma Variables; see [16](#16-a-small-build-script-instead-of-style-dictionary).
- **Why:** The first risk was a typo or missing unit, not a missing export format.
- **Alternatives:** A full build pipeline from day one: generates outputs before anyone needs them.
- **Trade-offs:** Until the build step existed, the website had to read `tokens.json` directly and convert dmm itself.

---

## Part 2. Design decisions behind the values

### 6. Press depth is a fraction of thickness
- **Decision:** `press depth = density ratio × material.t`.
- **Why:** If UI is an object with thickness, pressing it means compressing it. Thicker objects then press further without anyone retuning the press. Like a type scale built from one base size, the relationship is the token, not the individual number.
- **Alternatives:** A fixed press depth (for example 12 dmm, as Meta does in-component). Simpler, but a 4 mm card could "press" deeper than it is thick.
- **Trade-offs:** Press feel can't be tuned per component without changing its thickness or density.

### 7. Density owns recovery timing
- **Decision:** soft / firm / rigid each carry a press ratio *and* a recover time; there is no separate `motion.recover`.
- **Why:** The material becomes the interaction profile. A designer picks "firm" once instead of matching a press value with a motion value.
- **Alternatives:** Independent motion tokens for recovery. More freedom, but nothing stops a soft press with a snappy rigid recovery, which breaks the illusion of one material.
- **Trade-offs:** Only three feels exist until a new density is added.

### 8. Hysteresis on every threshold
- **Decision:** Separate enter and exit distances (hover 100 / 140 dmm, poke release 3 mm back, near/far ±50 mm).
- **Why:** XR has no click, only distance. One threshold makes the state flicker when a hand rests near it, which is the thing users find most irritating.
- **Alternatives:** One threshold plus a time delay (debounce). Also stops flicker, but makes every response feel late.
- **Trade-offs:** Two numbers to tune instead of one, and the gap must stay smaller than the space between nearby targets.

### 9. dmm as the main size unit ⚠️
- **Decision:** Sizes users look at are in dmm (scales with distance); sizes the hand touches are in mm; extents of view are in deg.
- **Why:** Fixed mm makes far UI unreadable and near UI huge. dmm keeps the apparent size constant, the way rem keeps type proportional. Minimum target rules (32 dmm) only make sense in a unit relative to distance.
- **Alternatives:** Degrees for everything (common in research). Precise, but unfamiliar to designers and hard to lay out with.
- **Trade-offs:** Every consumer must know the placement distance to convert to metres. ⚠️ Changing the base unit later would rewrite every size token.

### 10. Dock anchor: body-lock with lazy follow (350 ms, critical damping)
- **Decision:** `anchor.mode = body-lock`; head-lock and world-lock are banned for the dock.
- **Why:** Head-lock is always in your face and causes sickness; world-lock is lost when you turn. Body-lock stays put when you glance away and follows when you turn your body.
- **Alternatives:** Head-lock with a big dead zone (Meta's approach in places). Never loses the dock, but still feels stuck to your face.
- **Trade-offs:** 350 ms and the damping are guesses; wrong values are the top cause of motion sickness and must be tuned on a headset (tested at 200 / 350 / 600 ms).

### 11. Packaging instead of slide-in transitions
- **Decision:** Next views come out of the current object; the parent compresses, is replaced, or the child protrudes. The lab uses compress. The official default is still open.
- **Why:** There is no frame in XR, so "sliding in from the edge" has no edge to come from. Nesting objects matches the core principle and absorbs the dialog component.
- **Alternatives:** Classic navigation stacks with slide-in. Familiar, but contradicts the principle and wastes the depth axis.
- **Trade-offs:** It spends depth (the depth budget). Multi-level motion is about half of the build effort, so only one level ships in v0.1.

### 12. Wayfinding through the receded parent
- **Decision:** Receded parents stay visible as silhouettes (provisional: opacity 0.6, minus 0.14 per level, never below 0.3).
- **Why:** The silhouettes *are* the breadcrumb, so no extra navigation UI is needed. This turns parent opacity from decoration into a navigation feature.
- **Alternatives:** A separate breadcrumb bar. Clearer text, but adds another floating object and needs its own anchor.
- **Trade-offs:** In "replace" mode the breadcrumb disappears, which is one reason replace probably shouldn't be the default.

### 13. Z-Slider over a knob, with audio detents
- **Decision:** Build a push/pull slider; detent every 1/10 of the range with a -18 dB tick.
- **Why:** Arms shake less moving forward and back; a knob brings back the clutch problem (wrist rotation runs out). Audio stands in for the missing haptics.
- **Alternatives:** A knob (familiar, but wrist limits), or a normal X slider (kept only as the test comparison).
- **Trade-offs:** People judge depth poorly and the hand covers the control, so the design relies on depth cues and moving the value label beside the hand.

### 14. Opaque surfaces with adaptive scrim (MR-first)
- **Decision:** `surface.opacity.base = 0.92`; scrim up to 0.35 when contrast falls below 3:1; 1 dmm high-contrast outline.
- **Why:** In passthrough the background can't be controlled, so fixed colour values mean nothing. Glass looks good in marketing but fails on a white wall or a busy shelf.
- **Alternatives:** Glass with blur (visionOS style). Feels lighter, but readability depends on the room.
- **Trade-offs:** Panels hide more of the real world behind them.

### 15. Every value carries an evidence tag
- **Decision:** M / T / G / D / N on every token.
- **Why:** "Why is this number this number?" is the first question a reviewer asks. Separating borrowed, estimated and to-be-tested values is what makes this research instead of a copy.
- **Alternatives:** Comments in the docs only. Easy to drift from the values.
- **Trade-offs:** Tags must be updated when a value is tested, or they become stale.

---

## Part 3. The token pipeline

A pipeline is the step that turns one source file into the files each tool reads. In Figma terms: `tokens.json` is the main component, and the files in `dist/` are instances that update when the main one changes.

### 16. A small build script instead of Style Dictionary
- **Decision:** `scripts/build-tokens.mjs`, plain Node with no dependencies, writes three files into `dist/`: `tokens.js` (WebXR code), `tokens.css` (website), `figma-variables.json` (Figma).
- **Why:** Style Dictionary is the standard tool because it handles many platforms (iOS, Android, CSS) with ready-made transforms. Contour needs none of those transforms: every size is in dmm, mm or deg, which Style Dictionary doesn't know, so each output would need a custom transform anyway. With 55 tokens, the whole converter is about 150 readable lines, and `npm install` is never needed.
- **Alternatives:** Style Dictionary with custom unit transforms. Better if Contour later targets Unity, iOS or Android, since its plugin ecosystem covers those. Today it would add a dependency and a config layer around the same custom code.
- **Trade-offs:** No plugin ecosystem; every new output is written by hand. Switching to Style Dictionary later is cheap, because the source (`tokens.json`) and output names don't change, only the script does.

### 17. Code gets scene units; Figma and CSS keep the token's own unit ⚠️
- **Decision:** In `dist/tokens.js` every number is converted to metres, radians or seconds (`material.t.regular` = 0.008). dmm tokens become "metres at 1 m away" and are scaled with `atDistance(value, distanceM)`. CSS keeps `mm`, `deg` and `ms` (all real CSS units) and writes dmm as a plain number. Figma gets the plain number with `Unit: dmm.` at the start of its description.
- **Why:** three.js works in metres, radians and seconds. Converting once in the pipeline means component code never does unit maths, which is where XR sizing bugs come from (a 60 mm button where 60 dmm at 0.75 m = 45 mm was meant). Figma and the website are read by people, who think in the token's own unit.
- **Alternatives:** Keep original units in JS and convert in each component: one source of numbers, but every component repeats the conversion and can get it wrong. Bake dmm into metres at a fixed distance: simpler, but wrong for anything not placed at that distance.
- **Trade-offs:** The same token reads `60` in Figma and `0.06` in code, so cross-checking needs the `units` table. ⚠️ Component code will rely on "every number is SI"; changing that later means touching every component.

### 18. Built files are committed, and `npm run check` catches drift
- **Decision:** `dist/` is in git. `npm run check` fails when `dist/` doesn't match `tokens.json`.
- **Why:** The website, demos and Figma can grab the files straight from GitHub without running a build. The check stops the classic problem of generated files going stale.
- **Alternatives:** Build on install or in CI and keep `dist/` out of git. Cleaner history, but every consumer needs a build step.
- **Trade-offs:** Each token change produces a bigger diff (source plus three outputs). The drift check runs only when someone runs it; a CI job would make it automatic.

### 19. Figma Variables as an import file, not a live sync
- **Decision:** Produce `dist/figma-variables.json` in the DTCG shape Figma's "Import variables" reads, one collection, groups from the token path. dmm sizes are scoped to width/height, gap, corner radius and stroke; everything else is unscoped.
- **Why:** The Figma connector can't connect from this project right now, so writing to Figma directly isn't possible. An import file also keeps `tokens.json` the source: Figma receives values, it doesn't own them.
- **Alternatives:** A sync through the Figma API or a plugin like Tokens Studio. Two-way and automatic, but needs access we don't have and invites edits in Figma that never reach `tokens.json`.
- **Trade-offs:** Re-importing is a manual step after each change. Figma Variables only hold numbers, strings, booleans and colours, so easings become text (`cubic-bezier(...)`) and units live in descriptions. The import has not been tried in Figma yet.
