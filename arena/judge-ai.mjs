// Step 3a. Blind pairwise judging by an AI model. The judge sees only the
// two renders and the experiment's question and criteria: never the variant
// names or token values. Every pair is judged twice with the sides swapped;
// if the two answers disagree, the judge was picking a side, not a design,
// and the pair counts as a tie.
// Run: ANTHROPIC_API_KEY=... npm run judge:ai -- button-thickness
//      npm run judge:ai -- button-thickness --dry-run   (prints the prompt, no API call)
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { loadExperiment, readJson, appendJsonl, pairs } from './lib/experiment.mjs';

const MODEL = process.env.ARENA_JUDGE_MODEL || 'claude-opus-5-5';
const DRY = process.argv.includes('--dry-run');

const Verdict = z.object({
  per_criterion: z.array(z.object({
    criterion: z.string(),
    better: z.enum(['first', 'second', 'same']),
    note: z.string(),
  })),
  winner: z.enum(['first', 'second', 'tie']),
  confidence: z.number().int().min(1).max(5),
  summary: z.string(),
});

const { exp, variants, file } = loadExperiment(process.argv[2]);
const checks = readJson(file('checks.json'), null);
if (!checks) throw new Error('Run the checks first: npm run check -- ' + exp.id);
const eligible = variants.filter(v => checks[v.name]?.level !== 'fail');
const byName = Object.fromEntries(eligible.map(v => [v.name, v]));

const system = `You are judging a design system for XR headsets. Each image is a render of the same UI at real-world scale, seen from the wearer's eye, at the headset's pixel density (${exp.fixtures.ppd} pixels per degree), so small differences may be hard to see. Each image shows three states left to right: rest, hover, press. The middle button of each panel is the one that changes state.

Compare the two images on each criterion, then pick an overall winner. Say "same" or "tie" when you cannot see a real difference; do not invent one. Judge only what is visible.`;

function prompt(first, second) {
  const img = v => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: readFileSync(v.image).toString('base64') } });
  return [
    { type: 'text', text: `Question: ${exp.question}\n\nCriteria:\n${exp.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}` },
    { type: 'text', text: 'First image:' }, img(first),
    { type: 'text', text: 'Second image:' }, img(second),
  ];
}

async function judgeOnce(client, first, second) {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort: 'high', format: betaZodOutputFormat(Verdict) },
    messages: [{ role: 'user', content: prompt(first, second) }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`judge declined: ${response.stop_details?.explanation ?? 'no reason'}`);
  if (!response.parsed_output) throw new Error(`judge returned no verdict (stop_reason ${response.stop_reason})`);
  const v = response.parsed_output;
  const winner = v.winner === 'tie' ? 'tie' : v.winner === 'first' ? first.name : second.name;
  return { ...v, winner, first: first.name, second: second.name };
}

const todo = pairs(eligible.map(v => v.name));
if (DRY) {
  console.log(system + '\n');
  console.log(prompt(...todo[0].map(n => byName[n])).map(b => b.type === 'text' ? b.text : '[image]').join('\n'));
  console.log(`\n${todo.length} pairs x 2 orders = ${todo.length * 2} calls to ${MODEL}`);
  process.exit(0);
}

const client = new Anthropic();
for (const [a, b] of todo) {
  const ab = await judgeOnce(client, byName[a], byName[b]);
  const ba = await judgeOnce(client, byName[b], byName[a]);
  const consistent = ab.winner === ba.winner;
  const vote = {
    judge: `ai:${MODEL}`, pair: [a, b],
    winner: consistent ? ab.winner : 'tie',
    position_bias: !consistent,
    confidence: Math.min(ab.confidence, ba.confidence),
    runs: [ab, ba],
    at: new Date().toISOString(),
  };
  appendJsonl(file('votes.jsonl'), vote);
  console.log(`${a} vs ${b}: ${vote.winner}${vote.position_bias ? ' (answers flipped with the sides, counted as tie)' : ''}`);
}
