// Step 3a. AI judging, in two stages.
//  1. Bar: each variant alone (next to your reference images, if any) is
//     scored against the visionOS-level rubric in lib/bar.mjs. 4+ on every
//     row passes. This is absolute: "is it good enough at all?"
//  2. Pairwise: only variants that passed the bar are compared, blind, each
//     pair twice with the sides swapped. If the answer flips with the sides,
//     the pair counts as a tie. This is relative: "which is better?"
// The judge never sees variant names or token values.
// Run: ANTHROPIC_API_KEY=... npm run judge:ai -- button-thickness
//      npm run judge:ai -- button-thickness --dry-run   (prints the prompts, no API call)
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { loadExperiment, readJson, appendJsonl, pairs } from './lib/experiment.mjs';
import { EYE_ROWS as RUBRIC, PASS_SCORE, referenceImages, mediaType } from './lib/bar.mjs';

const MODEL = process.env.ARENA_JUDGE_MODEL || 'claude-opus-5-5';
const DRY = process.argv.includes('--dry-run');

const BarVerdict = z.object({
  rows: z.array(z.object({ id: z.string(), score: z.number().int().min(1).max(5), note: z.string() })),
  summary: z.string(),
});

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
const refs = referenceImages();

const context = `You are a design director reviewing UI for a spatial computing headset. Each candidate image is a render of the UI at real-world scale, seen from the wearer's eye, at the headset's pixel density (${exp.fixtures.ppd} pixels per degree). Each image shows three states left to right: rest, hover, press. The middle button of each panel is the one that changes state.`;

const barSystem = `${context}

Your job is quality control against the bar of a shipping Apple visionOS app. Be strict: a render that looks like a 3D tool's default output, a tech demo, or a prototype scores 1 or 2, however tidy it is. Score 4 only if the UI would not look out of place next to visionOS system apps, and 5 only if it is better. ${refs.length ? 'Reference images of the target quality are included first; compare against them.' : ''} Judge only what is visible.`;

const pairSystem = `${context}

Compare the two images on each criterion, then pick an overall winner. Say "same" or "tie" when you cannot see a real difference; do not invent one. Judge only what is visible.`;

const img = path => ({ type: 'image', source: { type: 'base64', media_type: mediaType(path), data: readFileSync(path).toString('base64') } });

function barPrompt(v) {
  return [
    ...refs.flatMap((r, i) => [{ type: 'text', text: `Reference ${i + 1} (target quality):` }, img(r)]),
    { type: 'text', text: `Rubric, score each row 1-5 (use these ids):\n${RUBRIC.map(r => `- ${r.id}: ${r.text}`).join('\n')}` },
    { type: 'text', text: 'Candidate:' }, img(v.image),
  ];
}

function pairPrompt(first, second) {
  return [
    { type: 'text', text: `Question: ${exp.question}\n\nCriteria:\n${exp.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}` },
    { type: 'text', text: 'First image:' }, img(first.image),
    { type: 'text', text: 'Second image:' }, img(second.image),
  ];
}

async function call(client, system, content, schema) {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort: 'high', format: betaZodOutputFormat(schema) },
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`judge declined: ${response.stop_details?.explanation ?? 'no reason'}`);
  if (!response.parsed_output) throw new Error(`judge returned no verdict (stop_reason ${response.stop_reason})`);
  return response.parsed_output;
}

const show = blocks => blocks.map(b => b.type === 'text' ? b.text : '[image]').join('\n');
if (DRY) {
  console.log('--- Stage 1: bar ---\n' + barSystem + '\n\n' + show(barPrompt(eligible[0])));
  console.log('\n--- Stage 2: pairwise (bar passers only) ---\n' + pairSystem + '\n\n' + show(pairPrompt(eligible[0], eligible[1] ?? eligible[0])));
  console.log(`\n${eligible.length} bar calls + up to ${pairs(eligible.map(v => v.name)).length * 2} pairwise calls to ${MODEL}. ${refs.length} reference image(s).`);
  process.exit(0);
}

const client = new Anthropic();

// Stage 1: bar.
const passed = [];
for (const v of eligible) {
  const r = await call(client, barSystem, barPrompt(v), BarVerdict);
  const scores = Object.fromEntries(r.rows.map(row => [row.id, row.score]));
  const pass = RUBRIC.every(row => (scores[row.id] ?? 0) >= PASS_SCORE);
  appendJsonl(file('votes.jsonl'), { type: 'bar', judge: `ai:${MODEL}`, variant: v.name, pass, scores, rows: r.rows, summary: r.summary, references: refs.length, at: new Date().toISOString() });
  console.log(`bar  ${v.name}: ${pass ? 'PASS' : 'FAIL'}  ${RUBRIC.map(row => `${row.id} ${scores[row.id] ?? '-'}`).join(', ')}`);
  if (pass) passed.push(v.name);
}
if (passed.length < 2) {
  console.log(`\n${passed.length} variant(s) reached the bar, so there is nothing to compare. Improve the design and re-render.`);
  process.exit(0);
}

// Stage 2: pairwise among bar passers.
for (const [a, b] of pairs(passed)) {
  const one = async (first, second) => {
    const v = await call(client, pairSystem, pairPrompt(byName[first], byName[second]), Verdict);
    return { ...v, winner: v.winner === 'tie' ? 'tie' : v.winner === 'first' ? first : second, first, second };
  };
  const ab = await one(a, b);
  const ba = await one(b, a);
  const consistent = ab.winner === ba.winner;
  const vote = {
    type: 'pair', judge: `ai:${MODEL}`, pair: [a, b],
    winner: consistent ? ab.winner : 'tie',
    position_bias: !consistent,
    confidence: Math.min(ab.confidence, ba.confidence),
    runs: [ab, ba],
    at: new Date().toISOString(),
  };
  appendJsonl(file('votes.jsonl'), vote);
  console.log(`pair ${a} vs ${b}: ${vote.winner}${vote.position_bias ? ' (answers flipped with the sides, counted as tie)' : ''}`);
}
