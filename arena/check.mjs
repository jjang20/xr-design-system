// Step 2. Code-measured checks, run before anyone judges. A variant that
// fails a check is dropped from judging: no point asking taste questions
// about something that breaks a rule we can measure. The checks live in
// lib/checks.mjs.
// Run: npm run check -- button-thickness
import { writeFileSync } from 'node:fs';
import { loadExperiment, readJson } from './lib/experiment.mjs';
import { runChecks } from './lib/checks.mjs';

const { exp, tokens, variants, file } = loadExperiment(process.argv[2]);
const metrics = readJson(file('metrics.json'), {});
const { results, system } = runChecks({ exp, variants, baseTokens: tokens, metrics });
for (const [name, { level, rows }] of Object.entries(results)) {
  console.log(`\n${name}: ${level.toUpperCase()}`);
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
