// Step 1. Render every variant of an experiment to a PNG and record pixel
// measurements for the checks. `fixtures.scene` picks what is drawn:
//   button (default)  the arena's own placeholder scene (scene/button.html)
//   catalog-stack     the real Catalog from src/, three levels deep (scenes/)
// Run: npm run render -- button-thickness
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { loadExperiment } from './lib/experiment.mjs';
import { sceneParams } from './lib/tokens.mjs';
import { serveStatic } from './lib/server.mjs';
import { renderCatalogStack } from './scenes/catalog-stack.mjs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARENA } from './lib/experiment.mjs';

const ROOT = join(ARENA, '..');

const { exp, variants, file } = loadExperiment(process.argv[2]);
const scene = exp.fixtures.scene ?? 'button';
// SwiftShader is a software GPU: slower, but every machine renders the same
// pixels, so a re-run never changes a vote by accident.
const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
const browser = process.env.CHROMIUM_PATH
  ? await chromium.launch({ ...launch, executablePath: process.env.CHROMIUM_PATH })
  : await chromium.launch(launch).catch(() => chromium.launch({ ...launch, channel: 'chrome' }));
const metrics = {};
if (scene === 'button') await renderButton();
else if (scene === 'catalog-stack') await renderComponents(renderCatalogStack);
else throw new Error(`Unknown scene ${scene}`);
writeFileSync(file('metrics.json'), JSON.stringify(metrics, null, 2));
await browser.close();

async function renderButton() {
  const { server, port } = await serveStatic();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('scene error:', e.message));
  for (const v of variants) {
    await page.goto(`http://127.0.0.1:${port}/scene/button.html`);
    await page.waitForFunction(() => window.sceneReady);
    const params = sceneParams(v.tokens, exp.fixtures);
    metrics[v.name] = { params, ...(await page.evaluate(([p, f]) => window.renderVariant(p, f), [params, exp.fixtures])) };
    await page.locator('#shot').screenshot({ path: v.image });
    console.log(`rendered ${v.name} -> ${v.image}`);
  }
  server.close();
}

// The real components: the repo's own Vite dev server serves demo/bench.html
// exactly as `npm run bench` does, so what passes here is what ships.
async function renderComponents(render) {
  const { createServer } = await import(pathToFileURL(join(ROOT, 'node_modules/vite/dist/node/index.js')).href)
    .catch(() => { throw new Error('Install the repo first: npm install (in the repo root, not arena/)'); });
  // vite.config.js names its root relative to the repo, as `npm run bench` runs it.
  const cwd = process.cwd();
  process.chdir(ROOT);
  const vite = await createServer({ configFile: join(ROOT, 'vite.config.js'), logLevel: 'error', server: { hmr: false } });
  await vite.listen(0);
  const baseUrl = vite.resolvedUrls.local[0];
  try {
    for (const v of variants) {
      const t0 = Date.now();
      const { shots, metrics: m } = await render({ browser, baseUrl, variant: v, exp, root: ROOT });
      metrics[v.name] = { scene, ...(Array.isArray(m) ? { levels: m } : m) };
      await sideBySide(Object.values(shots), v.image, exp.fixtures.crop);
      console.log(`rendered ${v.name} -> ${v.image} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  } finally {
    await vite.close();
    process.chdir(cwd);
  }
}

// The framings of one variant, cropped to the component, in one image: the
// judges see every view at once, at the same pixel density.
async function sideBySide(pngs, out, crop = [0, 0, 1, 1]) {
  const page = await browser.newPage();
  const html = pngs.map(p => `<img src="data:image/png;base64,${p.toString('base64')}">`).join('');
  await page.setContent(`<body style="margin:0;background:#000"><div id="row" style="display:flex;gap:6px;background:#000;width:max-content">${html}</div></body>`);
  await page.evaluate(async c => {
    for (const img of document.images) {
      await img.decode();
      const [x0, y0, x1, y1] = c, w = img.naturalWidth, h = img.naturalHeight;
      const box = document.createElement('div');
      Object.assign(box.style, { width: `${(x1 - x0) * w}px`, height: `${(y1 - y0) * h}px`, overflow: 'hidden', position: 'relative' });
      img.replaceWith(box);
      Object.assign(img.style, { position: 'absolute', left: `${-x0 * w}px`, top: `${-y0 * h}px` });
      box.append(img);
    }
  }, crop);
  await page.locator('#row').screenshot({ path: out });
  await page.close();
}
