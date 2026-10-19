// Step 1. Render every variant of an experiment to a PNG (rest / hover / press)
// and record pixel measurements for the checks.
// Run: npm run render -- button-thickness
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { loadExperiment } from './lib/experiment.mjs';
import { sceneParams } from './lib/tokens.mjs';
import { serveStatic } from './lib/server.mjs';

const { exp, variants, file } = loadExperiment(process.argv[2]);
const { server, port } = await serveStatic();
// SwiftShader is a software GPU: slower, but every machine renders the same
// pixels, so a re-run never changes a vote by accident.
const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
const browser = process.env.CHROMIUM_PATH
  ? await chromium.launch({ ...launch, executablePath: process.env.CHROMIUM_PATH })
  : await chromium.launch(launch).catch(() => chromium.launch({ ...launch, channel: 'chrome' }));
const page = await browser.newPage();
page.on('pageerror', e => console.error('scene error:', e.message));

const metrics = {};
for (const v of variants) {
  await page.goto(`http://127.0.0.1:${port}/scene/button.html`);
  await page.waitForFunction(() => window.sceneReady);
  const params = sceneParams(v.tokens, exp.fixtures);
  metrics[v.name] = { params, ...(await page.evaluate(([p, f]) => window.renderVariant(p, f), [params, exp.fixtures])) };
  await page.locator('#shot').screenshot({ path: v.image });
  console.log(`rendered ${v.name} -> ${v.image}`);
}
writeFileSync(file('metrics.json'), JSON.stringify(metrics, null, 2));
await browser.close();
server.close();
