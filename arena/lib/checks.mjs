// The code-measured checks behind check.mjs, importable so tests can run
// them on a made-up experiment without touching runs/.
import { num, toM, affectedPaths } from './tokens.mjs';
import { motionFindings } from './motion.mjs';

// Thresholds for the pixel checks. These are estimates (evidence G), the
// same honesty rule as tokens.json: tune them once headset tests exist.
const PRESS_VISIBLE_MIN = 0.01; // mean luminance change in the button area, 0-1
const RELEASE_MARGIN_WARN = 0.0005; // m (0.5 mm)

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
    why: 'At headset resolution the pressed frame must look different from hover, or the press only exists in the numbers.',
    run: (_t, m) => {
      if (!m) return { level: 'warn', detail: 'no render metrics yet, run render first' };
      return {
        level: m.pressDelta >= PRESS_VISIBLE_MIN ? 'pass' : 'fail',
        detail: `luminance change ${(m.pressDelta * 100).toFixed(2)}% (min ${PRESS_VISIBLE_MIN * 100}%) on a ${m.buttonPx.w.toFixed(0)} px button at ${m.frame.ppd} px/deg`,
      };
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
    const rows = CHECKS.map(c => ({ id: c.id, why: c.why, ...c.run(v.tokens, metrics[v.name]) }));
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
