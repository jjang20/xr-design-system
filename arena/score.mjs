// Step 4. Tally the votes and write a report. Your (human) votes decide the
// winner; AI votes are reported next to them, with how often they agreed
// with you, so you can see whether the AI judge is worth trusting next time.
// Run: npm run score -- button-thickness
import { writeFileSync } from 'node:fs';
import { loadExperiment, readJson, readJsonl } from './lib/experiment.mjs';

const { exp, variants, file } = loadExperiment(process.argv[2]);
const checks = readJson(file('checks.json'), {});
const votes = readJsonl(file('votes.jsonl'));
const names = variants.map(v => v.name).filter(n => checks[n]?.level !== 'fail');

// Bradley-Terry strength: one number per variant such that
// P(a beats b) = s_a / (s_a + s_b). A tie counts as half a win each way.
// Like Elo, but it uses every vote at once instead of in order.
function bradleyTerry(rows) {
  const s = Object.fromEntries(names.map(n => [n, 1]));
  for (let it = 0; it < 200; it++) {
    for (const i of names) {
      let wins = 0, denom = 0;
      for (const v of rows) {
        if (!v.pair.includes(i)) continue;
        const j = v.pair[0] === i ? v.pair[1] : v.pair[0];
        wins += v.winner === i ? 1 : v.winner === 'tie' ? 0.5 : 0;
        denom += 1 / (s[i] + s[j]);
      }
      if (denom) s[i] = Math.max((wins + 0.1) / denom, 1e-6); // +0.1 keeps a 0-win variant finite
    }
    const total = names.reduce((a, n) => a + s[n], 0);
    for (const n of names) s[n] = (s[n] / total) * names.length;
  }
  return s;
}

function tally(rows) {
  const t = Object.fromEntries(names.map(n => [n, { win: 0, tie: 0, loss: 0 }]));
  for (const v of rows) for (const n of v.pair) {
    if (!t[n]) continue;
    if (v.winner === 'tie') t[n].tie++; else if (v.winner === n) t[n].win++; else t[n].loss++;
  }
  const bt = bradleyTerry(rows);
  return names.map(n => ({ name: n, ...t[n], strength: bt[n] })).sort((a, b) => b.strength - a.strength);
}

const groups = {};
for (const v of votes) (groups[v.judge] ??= []).push(v);
const tables = Object.fromEntries(Object.entries(groups).map(([j, rows]) => [j, tally(rows)]));

// AI vs human agreement on the same pairs (last vote per pair counts).
const key = p => [...p].sort().join(' vs ');
const lastBy = rows => Object.fromEntries(rows.map(v => [key(v.pair), v.winner]));
const human = lastBy(groups.human ?? []);
const agreement = {};
for (const [j, rows] of Object.entries(groups)) {
  if (j === 'human') continue;
  const ai = lastBy(rows);
  const shared = Object.keys(ai).filter(k => k in human);
  agreement[j] = { pairs: shared.length, agreed: shared.filter(k => ai[k] === human[k]).length,
    positionBias: rows.filter(r => r.position_bias).length };
}

const top = tables.human?.[0];
// Decided = at least two human wins and clearly ahead of the runner-up.
const decided = top && top.win >= 2 && top.strength > (tables.human[1]?.strength ?? 0) * 1.5;
const result = {
  experiment: exp.id,
  winner: decided ? top.name : null,
  status: !tables.human ? 'waiting for your votes' : decided ? 'decided by human votes' : 'too close to call, add votes or variants',
  tables, agreement, excluded: variants.map(v => v.name).filter(n => !names.includes(n)),
  at: new Date().toISOString(),
};
writeFileSync(file('result.json'), JSON.stringify(result, null, 2));

const md = [`# ${exp.id}`, '', `**Question:** ${exp.question}`, '', `**Result:** ${result.winner ?? '-'} (${result.status})`, ''];
for (const [j, rows] of Object.entries(tables)) {
  md.push(`## ${j === 'human' ? 'Your votes (decide)' : `${j} (advisory)`}`, '', '| variant | win | tie | loss | strength |', '|---|---|---|---|---|');
  for (const r of rows) md.push(`| ${r.name} | ${r.win} | ${r.tie} | ${r.loss} | ${r.strength.toFixed(2)} |`);
  if (agreement[j]) md.push('', `Agreed with you on ${agreement[j].agreed} of ${agreement[j].pairs} pairs. Flipped its answer when the sides were swapped ${agreement[j].positionBias} time(s).`);
  md.push('');
}
md.push('## Checks', '');
for (const [n, c] of Object.entries(checks)) {
  md.push(`**${n}: ${c.level}**`);
  for (const r of c.rows.filter(r => r.level !== 'pass')) md.push(`- ${r.level}: ${r.id}, ${r.detail}`);
  md.push('');
}
md.push('## Renders', '', ...variants.map(v => `**${v.name}** \`${JSON.stringify(v.overrides)}\`\n\n![${v.name}](${v.name}.png)\n`));
const notes = votes.filter(v => v.judge === 'human' && v.note);
if (notes.length) md.push('## Your notes', '', ...notes.map(v => `- ${key(v.pair)} -> ${v.winner}: ${v.note}`));
writeFileSync(file('report.md'), md.join('\n') + '\n');
console.log(md.slice(0, 6).join('\n'));
console.log(`Full report: ${file('report.md')}`);
