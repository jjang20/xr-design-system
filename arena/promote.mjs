// Step 5. Feed the result back into tokens.json. Writes the winning variant's
// values and stamps every token the experiment varied with the arena result,
// so the file remembers why a number is what it is. It does not change the
// evidence tag: a flat-screen arena is not a headset test, so a "T" token
// stays "T" until someone tests it in a headset.
// Run: npm run promote -- button-thickness            (uses the scored winner)
//      npm run promote -- button-thickness t-12mm     (your explicit call)
import { execFileSync } from 'node:child_process';
import { loadExperiment, readJson } from './lib/experiment.mjs';
import { loadTokens, saveTokens, setValue, getNode } from './lib/tokens.mjs';
import { fileURLToPath } from 'node:url';

const { exp, file } = loadExperiment(process.argv[2]);
const result = readJson(file('result.json'), null);
const chosen = process.argv[3] ?? result?.winner;
if (!chosen) throw new Error('No winner yet. Judge more pairs, or name the variant yourself: npm run promote -- ' + exp.id + ' <variant>');
if (!(chosen in exp.variants)) throw new Error(`Unknown variant ${chosen}. Options: ${Object.keys(exp.variants).join(', ')}`);
// Nothing below the bar ever reaches tokens.json, even when chosen by hand.
if (result?.bar?.[chosen]?.human !== 'pass') throw new Error(`${chosen} has not passed the bar (visionOS level). Judge it with npm run judge -- ${exp.id} first.`);

const tokens = loadTokens();
const varied = [...new Set(Object.values(exp.variants).flatMap(o => Object.keys(o)))];
const human = result?.tables?.human?.find(r => r.name === chosen);
for (const path of varied) {
  if (path in exp.variants[chosen]) setValue(tokens, path, exp.variants[chosen][path]);
  const meta = (getNode(tokens, path).$extensions ??= {})['com.contour'] ??= {};
  meta.arena = {
    experiment: exp.id,
    chosen,
    against: Object.keys(exp.variants).filter(n => n !== chosen),
    humanVotes: human ? `${human.win}W ${human.tie}T ${human.loss}L` : 'none (chosen by hand)',
    date: new Date().toISOString().slice(0, 10),
  };
  console.log(`${path} = ${JSON.stringify(getNode(tokens, path).$value)}  (arena: ${exp.id} -> ${chosen})`);
}
saveTokens(tokens);
execFileSync('node', [fileURLToPath(new URL('../scripts/check-tokens.mjs', import.meta.url))], { stdio: ['ignore', 'ignore', 'inherit'] });
// Rebuild dist/ so code, CSS and Figma pick up the promoted value too.
execFileSync('node', [fileURLToPath(new URL('../scripts/build-tokens.mjs', import.meta.url))], { stdio: ['ignore', 'ignore', 'inherit'] });
console.log('\ntokens.json updated and valid, dist/ rebuilt. Review with `git diff tokens.json dist/`, then commit when you are happy.');
