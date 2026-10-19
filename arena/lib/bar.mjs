// The quality bar. Pairwise voting only ranks variants against each other,
// so on its own it happily picks "the best of three bad options". The bar is
// an absolute gate that runs first: a variant has to look like it belongs in
// a shipping visionOS app before it is allowed into the pairwise round.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ARENA } from './experiment.mjs';

// Scored 1-5. 4 = would not look out of place in a shipping visionOS app.
// 5 = better than that. A variant passes only with 4+ on every row.
// Rows marked by: 'code' can't be seen in a still render, so check.mjs
// measures them from the tokens instead (motion rules in lib/motion.mjs,
// from Emil Kowalski's design-engineering practice and Apple's fluid
// interface rules). The material, type, states and depth rows carry Apple's
// own standards (WWDC "Designing Fluid Interfaces" and "The Details of UI
// Typography"), so "visionOS level" is spelled out rather than implied.
export const PASS_SCORE = 4;
export const RUBRIC = [
  { id: 'material', text: 'Surfaces read as a designed material (frosted glass with vibrancy, or a deliberate solid), not default 3D shading. Material weight encodes hierarchy: heavier for structure, lighter for controls, and never a light translucent surface on another. Bigger surfaces read as thicker (stronger blur, deeper shadow) than small ones. A bright edge where light catches the material.' },
  { id: 'light', text: 'Lighting is soft and consistent with the surroundings; highlights and contact shadows ground the object in the room.' },
  { id: 'shape', text: 'Corners, edges and proportions are refined and consistent (continuous curvature, even radii); nothing looks like a raw primitive.' },
  { id: 'type', text: 'Labels and icons are crisp and legible with clear hierarchy built from weight, size and leading together. Large text is tracked tighter and small text slightly looser; text on glass is heavier and higher-contrast (vibrancy), never flat gray. A control with no label or icon counts as unfinished.' },
  { id: 'states', text: 'Hover and press look intentional and refined, not like debug highlights or outlines. Press feedback is subtle and physical (a slight compression, like scale 0.97 on a 2D button), never a jump. Hover points toward the input, so the in-between state hints where the interaction is going.' },
  { id: 'depth', text: 'Layering, spacing and depth placement feel deliberate, like one designed scene rather than parts placed in a viewport. Focus comes from dimming or pushing back what is behind; parallel panels separate by offset and translucency, not hard borders. Related things sit together and controls sit next to what they change.' },
  { id: 'cohesion', text: 'Every detail agrees with the others: radii, shadows, glow, spacing and states feel made by one hand. The small unseen details are right, so nothing draws attention to itself.' },
  { id: 'motion', by: 'code', text: 'Entering motion starts fast (strong custom ease-out, never ease-in or a built-in CSS curve); UI motion stays under 300 ms; press tracks the finger; release is snappy (200 ms or less). Anything the user touches settles with an interruptible spring, without overshoot unless a flick carried momentum, and has a reduced-motion fallback.' },
];
export const EYE_ROWS = RUBRIC.filter(r => r.by !== 'code');

// Reference images: your own captures of the level you want to reach
// (visionOS screenshots you take, or the best Contour render so far). They
// live in arena/references/, which is git-ignored: screenshots of other
// products are for judging, not for committing.
export function referenceImages() {
  const dir = join(ARENA, 'references');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).map(f => join(dir, f));
}

export function mediaType(path) {
  return path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
}

// Combine bar votes into one verdict per variant. Human votes decide;
// AI rubric scores are a pre-screen shown next to them.
export function barVerdicts(votes, names) {
  const out = {};
  for (const n of names) {
    const human = votes.filter(v => v.type === 'bar' && v.judge === 'human' && v.variant === n);
    const ai = votes.filter(v => v.type === 'bar' && v.judge !== 'human' && v.variant === n);
    const last = human.at(-1);
    out[n] = {
      human: last ? (last.pass ? 'pass' : 'fail') : 'not judged',
      failedRows: last?.failed ?? [],
      ai: ai.at(-1) ? { pass: ai.at(-1).pass, scores: ai.at(-1).scores } : null,
    };
  }
  return out;
}
