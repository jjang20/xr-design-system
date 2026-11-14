# Arena decisions

Same shape as [docs/decisions.md](../docs/decisions.md): **Decision**, **Why**, **Alternatives**, **Trade-offs**. ⚠️ marks choices that are expensive to undo.

### 0. An absolute bar before any ranking ⚠️
- **Decision:** Judging has two stages. First every variant is held, on its own, to a visionOS-level bar (six rubric rows, next to reference images). Only variants that pass are ranked against each other. Nothing below the bar can be promoted, even by hand.
- **Why:** Pairwise voting is relative. Given three bad options it still crowns one, and the loop would then write a bad design into the system with a record that says it "won". The bar turns "which is better?" into "is any of these good enough, and then which is better?". It's the difference between picking the best of three rough drafts and a design review that can send all three back.
- **Alternatives:** (a) Only pairwise, with a reference image added as an extra contestant. That still only says "better or worse than the reference", and with few votes it's noisy. (b) Only rubric scores, no pairwise. Good at "is it good enough", bad at telling two good options apart, which is what token tuning needs.
- **Trade-offs:** More judging per experiment, and experiments can end with no winner. ⚠️ The rubric is now the definition of quality for the whole system: change it deliberately, because every past "pass" was judged against the old version.

### 0b. Motion is judged by code, using Emil Kowalski's rules
- **Decision:** The bar's motion row is checked against the tokens, not judged by eye. The rules come from Emil Kowalski's design-engineering practice: strong custom ease-out for anything entering, no ease-in, UI motion under 300 ms, press that tracks the finger, release in 200 ms or less.
- **Why:** The renders are still images, so neither you nor the AI can see motion in them. These rules are concrete enough to measure, and they are also where "feels right" comes from: an ease-in dropdown feels slower than an ease-out one of the same length. The first run found two real problems in today's tokens: the dropdown eases in-out (it starts slow while appearing), and hover uses CSS's built-in ease-out, which is too weak to feel intentional.
- **Alternatives:** Render short clips and judge motion by eye. That's closer to the real feeling, and it's worth adding later, but it's slower to judge and harder for the AI.
- **Trade-offs:** The rules are generic. They don't know that XR may want different timing (for example, slower follow motion to avoid motion sickness), so `anchor.follow.*` is deliberately left out of them.

### 0c. Apple's design rules sharpen the bar
- **Decision:** The material, type, states and depth rows now spell out Apple's own standards (material weight encodes hierarchy, no light glass on light glass, size-specific tracking, vibrancy for text on glass, dim or push back to focus). The motion check adds three of Apple's fluid-interface rules: springs for anything touched, no overshoot without momentum, and a reduced-motion fallback.
- **Why:** "visionOS level" was a feeling; judges (you and the AI) score more consistently against named criteria. Apple's rules are the closest written description of that level. They complement Emil's: Emil covers timing and curves, Apple covers springs, interruption, materials and type.
- **Alternatives:** Keep the rows short and rely on reference images. Easier to read, but two judges can mean different things by "material".
- **Trade-offs:** The rows are longer, so a human judgment takes a little more reading. The new spring and reduced-motion findings are warnings on the system, not on this experiment, because fixing them means new tokens (a spring per firmness, `motion.reduced.*`), which is the tokens work, not the arena's.

### 1. Pairwise, not scoring
- **Decision:** Judges compare two variants at a time ("which is better?") instead of rating each one 1 to 10.
- **Why:** People and models are much more consistent at comparing than at scoring. A "7" drifts with mood and context; "A beats B" doesn't. It's the same reason a designer reviews two directions side by side instead of rating one in isolation. LMArena and most design-arena setups use pairs for this reason.
- **Alternatives:** Absolute rubric scores per variant. Faster with many variants, but scores from different sessions can't be compared.
- **Trade-offs:** The number of pairs grows fast (5 variants = 10 pairs). Keep experiments to 2 to 5 variants.

### 2. Blind and order-swapped
- **Decision:** Names are hidden (images are served under random ids) and sides are shuffled. The AI judges every pair twice, sides swapped; if its answer flips, the pair is a tie.
- **Why:** Models have a known position bias (they favour the first or second image). Swapping cancels it and also measures it, so the report shows how often it happened.
- **Alternatives:** One call per pair. Half the cost, but a biased judge would look confident.
- **Trade-offs:** Twice the API calls.

### 3. Checks before taste
- **Decision:** `check.mjs` runs rules that code can measure before anyone votes, and drops variants that fail.
- **Why:** A vote on something that breaks a rule is wasted. Example from the first run: a 6 mm button pressed at the firm ratio (0.4) only goes 2.4 mm deep, but release needs 3 mm of retreat, so it would feel sticky. No amount of visual preference fixes that.
- **Alternatives:** Let judges see everything and note problems. Relies on judges spotting numeric issues they can't see.
- **Trade-offs:** The pixel threshold (1% luminance change for a visible press) is an estimate, tagged like a G token. Tune it once headset tests exist.

### 4. Your vote decides, AI is advisory ⚠️
- **Decision:** Only you can pass a variant at the bar, and the winner comes from your pairwise votes (at least two wins and clearly ahead). AI votes are reported next to them with an agreement rate.
- **Why:** You are the one who knows what Contour should feel like, and the arena is also training your eye. The agreement rate tells you over time whether the AI judge can be trusted to pre-screen bigger experiments.
- **Alternatives:** Combine AI and human votes into one score. Faster decisions, but the AI's taste would quietly shape the system.
- **Trade-offs:** Nothing is decided until you vote. If the AI agrees with you on most pairs over several experiments, it becomes reasonable to let it cut 10 variants down to 3 before you look.

### 5. Render at headset pixel density
- **Decision:** The camera's field of view is set so one image pixel covers the same angle as one headset pixel (25 px per degree, Quest 3; Vision Pro is about 34).
- **Why:** On a monitor you can zoom into a 2 mm difference that a headset can't show. Judging at headset density means "can't tell" is a real answer: if two variants look the same here, the difference may not matter visually.
- **Alternatives:** High-resolution close-ups. Prettier, and better for spotting rendering bugs, but they reward details nobody will see.
- **Trade-offs:** No lens blur, stereo depth or head motion, which are part of how thickness reads in a headset. That's why winners keep their evidence tag.

### 6. Results go into tokens.json, evidence tag unchanged
- **Decision:** `promote.mjs` writes the value and adds an `arena` record (experiment, chosen variant, votes, date) under `$extensions.com.contour`. It never changes `evidence`.
- **Why:** The token file stays the single source of truth and remembers why a value is what it is. A flat-screen preference is not a headset measurement, so calling it one would break the honesty rule the evidence tags exist for.
- **Alternatives:** Keep results only in reports. Then the reason for a value lives somewhere nobody looks.
- **Trade-offs:** `tokens.json` grows a little. The arena record is ignored by tools that read the file.

### 7. Software rendering (SwiftShader)
- **Decision:** Chromium renders with its software GPU.
- **Why:** Every machine produces the same pixels, so re-rendering never changes what a judge saw.
- **Alternatives:** The real GPU. Faster and closer to a device, but pixels vary between machines.
- **Trade-offs:** A render takes a few seconds instead of milliseconds. Fine at this scale.
