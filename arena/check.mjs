// Step 2. Code-measured checks, run before anyone judges. A variant that
// fails a check is dropped from judging: no point asking taste questions
// about something that breaks a rule we can measure.
// Run: npm run check -- button-thickness
import { writeFileSync } from 'node:fs';
import { loadExperiment, readJson } from './lib/experiment.mjs';
import { num } from './lib/tokens.mjs';
import { motionFindings } from './lib/motion.mjs';

// Thresholds for the pixel checks. These are estimates (evidence G), the
// same honesty rule as tokens.json: tune them once headset tests exist.
const PRESS_VISIBLE_MIN = 0.01; // mean luminance change in the button area, 0-1
const RELEASE_MARGIN_WARN = 0.5; // mm

const CHECKS = [
  {
    id: 'press-deeper-than-release',
    why: 'If the press is shallower than the release distance, the finger has to pull back past the surface before the button lets go, which feels sticky.',
    run: (t) => {
      const depth = num(t, 'material.density.firm.press') * num(t, 'material.t.regular');
      const release = num(t, 'proximity.poke.release');
      const margin = depth - release;
      const level = margin < 0 ? 'fail' : margin < RELEASE_MARGIN_WARN ? 'warn' : 'pass';
      return { level, detail: `press depth ${depth.toFixed(1)} mm vs release ${release} mm (margin ${margin.toFixed(1)} mm)` };
    },
  },
  {
    id: 'thickness-order',
    why: 'Thickness carries hierarchy: cards (thin) < controls (regular) < panels (thick). A button as thick as its panel loses that.',
    run: (t) => {
      const [a, b, c] = ['thin', 'regular', 'thick'].map(k => num(t, `material.t.${k}`));
      return { level: a < b && b < c ? 'pass' : 'fail', detail: `thin ${a} < regular ${b} < thick ${c} mm` };
    },
  },
  {
    id: 'target-size',
    why: 'The button face must be at least the smallest interactive target.',
    run: (t) => {
      const face = num(t, 'size.button.default'), min = num(t, 'size.target.min');
      return { level: face >= min ? 'pass' : 'fail', detail: `face ${face} dmm vs min ${min} dmm` };
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

const { exp, variants, file } = loadExperiment(process.argv[2]);
const metrics = readJson(file('metrics.json'), {});
const varied = new Set(Object.values(exp.variants).flatMap(o => Object.keys(o)));
const results = {};
let system = [];
for (const v of variants) {
  const rows = CHECKS.map(c => ({ id: c.id, why: c.why, ...c.run(v.tokens, metrics[v.name]) }));
  // Motion rules (lib/motion.mjs). A finding on a token this experiment
  // varies counts against the variant; the rest are about the system as a
  // whole and are reported once, without blocking this experiment.
  const motion = motionFindings(v.tokens);
  for (const f of motion.filter(f => varied.has(f.path)))
    rows.push({ id: `motion:${f.rule}`, why: 'Motion craft rule (Emil Kowalski).', level: f.level, detail: `${f.path}: ${f.detail}` });
  if (v.name === (exp.baseline ?? variants[0].name)) system = motion.filter(f => !varied.has(f.path));
  const level = rows.some(r => r.level === 'fail') ? 'fail' : rows.some(r => r.level === 'warn') ? 'warn' : 'pass';
  results[v.name] = { level, rows };
  console.log(`\n${v.name}: ${level.toUpperCase()}`);
  for (const r of rows) console.log(`  ${r.level.padEnd(4)}  ${r.id.padEnd(26)} ${r.detail}`);
}
writeFileSync(file('checks.json'), JSON.stringify(results, null, 2));
writeFileSync(file('system.json'), JSON.stringify({ motion: system }, null, 2));
const eligible = Object.entries(results).filter(([, r]) => r.level !== 'fail').map(([n]) => n);
console.log(`\n${eligible.length} of ${variants.length} variants go to judging: ${eligible.join(', ')}`);
if (exp.baseline && !eligible.includes(exp.baseline)) console.log(`note: the baseline ${exp.baseline} failed a check`);
if (system.length) {
  console.log(`\nThe system itself is below the motion bar (${system.length} finding(s), not blocking this experiment):`);
  for (const f of system) console.log(`  ${f.level.padEnd(4)}  ${f.path}  ${f.detail}`);
}
