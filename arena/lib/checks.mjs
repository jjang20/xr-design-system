// The code-measured checks behind check.mjs, importable so tests can run
// them on a made-up experiment without touching runs/.
import { num, toM, affectedPaths } from './tokens.mjs';
import { motionFindings } from './motion.mjs';

// Thresholds for the pixel checks. These are estimates (evidence G), the
// same honesty rule as tokens.json: tune them once headset tests exist.
const PRESS_VISIBLE_MIN = 0.01; // mean luminance change in the button area, 0-1
const RELEASE_MARGIN_WARN = 0.0005; // m (0.5 mm)

const LARGE_TEXT_CONTRAST = 3; // WCAG 1.4.3 for large text: the breadcrumb titles
const PARENT_SHARE_WARN = 0.75, PARENT_SHARE_FAIL = 0.9; // parent title contrast / front title contrast
const BARE_GLASS_MAX = 1.3; // contrast below a receded title; bare glass with grain and edge light measures about 1.1

export const CHECKS = [
  {
    id: 'press-deeper-than-release',
    why: 'If the press is shallower than the release distance, the finger has to pull back past the surface before the button lets go, which feels sticky.',
    run: (t) => {
      const depth = num(t, 'material.firmness.firm.pressDepth') * toM(t, 'material.thickness.regular');
      const release = toM(t, 'input.poke.distance.release');
      const margin = depth - release;
      const level = margin < 0 ? 'fail' : margin < RELEASE_MARGIN_WARN ? 'warn' : 'pass';
      const mm = v => (v * 1000).toFixed(1);
      return { level, detail: `press depth ${mm(depth)} mm vs release ${mm(release)} mm (margin ${mm(margin)} mm)` };
    },
  },
  {
    id: 'thickness-order',
    why: 'Thickness carries hierarchy: cards (thin) < controls (regular) < panels (thick). A button as thick as its panel loses that.',
    run: (t) => {
      const [a, b, c] = ['thin', 'regular', 'thick'].map(k => toM(t, `material.thickness.${k}`) * 1000);
      return { level: a < b && b < c ? 'pass' : 'fail', detail: `thin ${a} < regular ${b} < thick ${c} mm` };
    },
  },
  {
    id: 'target-size',
    why: 'The button face must be at least the smallest interactive target.',
    run: (t) => {
      const face = num(t, 'size.interactive.default'), min = num(t, 'size.interactive.minimum');
      return { level: face >= min ? 'pass' : 'fail', detail: `face ${face} vpt vs min ${min} vpt` };
    },
  },
  {
    id: 'press-visible',
    scenes: ['button'],
    why: 'At headset resolution the pressed frame must look different from hover, or the press only exists in the numbers.',
    run: (_t, m) => {
      if (!m) return { level: 'warn', detail: 'no render metrics yet, run render first' };
      return {
        level: m.pressDelta >= PRESS_VISIBLE_MIN ? 'pass' : 'fail',
        detail: `luminance change ${(m.pressDelta * 100).toFixed(2)}% (min ${PRESS_VISIBLE_MIN * 100}%) on a ${m.buttonPx.w.toFixed(0)} px button at ${m.frame.ppd} px/deg`,
      };
    },
  },
  {
    id: 'recede-order',
    why: 'Each level further back must be at least as dim as the one in front of it, and the floor must sit below the first step.',
    run: (t) => {
      const start = num(t, 'packaging.parent.recede.opacity.start'), step = num(t, 'packaging.parent.recede.opacity.step'), min = num(t, 'packaging.parent.recede.opacity.min');
      return { level: step >= 0 && min <= start ? 'pass' : 'fail', detail: `start ${start}, step ${step}, min ${min}` };
    },
  },
  {
    id: 'breadcrumb-legible',
    scenes: ['catalog-stack'],
    why: 'A receded window is the way back: its title must stay readable (3:1, the WCAG minimum for large text).',
    run: (_t, m) => {
      const parent = m?.levels?.find(l => l.depth === 1);
      if (!parent) return { level: 'warn', detail: 'no render metrics yet, run render first' };
      return { level: parent.contrast >= LARGE_TEXT_CONTRAST ? 'pass' : 'fail', detail: `"${parent.label}" title ${parent.contrast.toFixed(1)}:1 (min ${LARGE_TEXT_CONTRAST}:1)` };
    },
  },
  {
    id: 'parents-quieter',
    scenes: ['catalog-stack'],
    why: "Back layers must not compete with the front layer (Jihoon's rule; Apple: dim or push back what is behind to focus). Measured as each parent title's contrast relative to the front title's.",
    run: (_t, m) => {
      const levels = m?.levels;
      if (!levels) return { level: 'warn', detail: 'no render metrics yet, run render first' };
      const front = levels.find(l => l.depth === 0);
      const parents = levels.filter(l => l.depth > 0).sort((a, b) => a.depth - b.depth);
      const share = parents.map(p => p.contrast / front.contrast);
      const ordered = share.every((s, i) => i === 0 || s <= share[i - 1] + 0.02);
      const worst = Math.max(...share);
      const level = worst >= PARENT_SHARE_FAIL || !ordered ? 'fail' : worst > PARENT_SHARE_WARN ? 'warn' : 'pass';
      return { level, detail: `front ${front.contrast.toFixed(1)}:1; ${parents.map((p, i) => `"${p.label}" ${p.contrast.toFixed(1)}:1 (${Math.round(share[i] * 100)}%)`).join(', ')}; pass at or under ${PARENT_SHARE_WARN * 100}%` };
    },
  },
  {
    id: 'parent-list-hidden',
    scenes: ['catalog-stack'],
    why: "A receded window shows only its title (PackagingPanel: its list would compete with the level in front). Anything readable below the title is a ghost of the list.",
    run: (_t, m) => {
      const views = { front: m?.levels, side: m?.angle };
      const parents = Object.entries(views).flatMap(([view, ls]) => (ls ?? []).filter(l => l.depth > 0 && l.below).map(l => ({ ...l, view })));
      if (!parents.length) return { level: 'warn', detail: 'no render metrics yet, run render first' };
      const worst = Math.max(...parents.map(p => p.below.contrast));
      return { level: worst <= BARE_GLASS_MAX ? 'pass' : 'fail', detail: `${parents.map(p => `"${p.label}" ${p.view} ${p.below.contrast.toFixed(2)}:1`).join(', ')} below the title (max ${BARE_GLASS_MAX}:1)` };
    },
  },
];

// baseTokens is tokens.json before any patches. A token counts as varied
// when a variant patches it or when it is an alias that resolves through a
// patched primitive, so { "duration.120": 1000 } is judged as a change to
// motion.enter.duration too.
export function runChecks({ exp, variants, baseTokens, metrics = {} }) {
  const patched = Object.values(exp.variants).flatMap(o => Object.keys(o));
  const affected = affectedPaths(baseTokens, patched);
  // A finding can name a group (motion.recovery); it is varied if any token under it is.
  const isVaried = p => affected.has(p) || [...affected].some(a => a.startsWith(`${p}.`));
  const results = {};
  let system = [];
  for (const v of variants) {
    const rows = CHECKS.filter(c => !c.scenes || c.scenes.includes(exp.fixtures?.scene ?? 'button')).map(c => ({ id: c.id, why: c.why, ...c.run(v.tokens, metrics[v.name]) }));
    // Motion rules (lib/motion.mjs). A finding on a token this experiment
    // varies counts against the variant; the rest are about the system as a
    // whole and are reported once, without blocking this experiment.
    const motion = motionFindings(v.tokens);
    for (const f of motion.filter(f => isVaried(f.path)))
      rows.push({ id: `motion:${f.rule}`, why: 'Motion craft rule (Emil Kowalski).', level: f.level, detail: `${f.path}: ${f.detail}` });
    if (v.name === (exp.baseline ?? variants[0].name)) system = motion.filter(f => !isVaried(f.path));
    const level = rows.some(r => r.level === 'fail') ? 'fail' : rows.some(r => r.level === 'warn') ? 'warn' : 'pass';
    results[v.name] = { level, rows };
  }
  return { results, system };
}
