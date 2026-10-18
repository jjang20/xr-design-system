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

### 5. A check script, no build pipeline yet
- **Decision:** Add `scripts/check-tokens.mjs` (no dependencies) that validates the file. Don't add Style Dictionary or a package build yet.
- **Why:** The first risk is a typo or missing unit, not a missing export format. A build pipeline is worth adding once a second consumer (Figma Variables or Unity) actually reads the file.
- **Alternatives:** Style Dictionary now: generates CSS/JS/JSON outputs, but adds dependencies and custom-unit transforms before anyone needs them.
- **Trade-offs:** The website must read `tokens.json` directly for now and convert dmm itself (one line, shown in [tokens.md](tokens.md#using-dmm-in-a-scene)).

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
