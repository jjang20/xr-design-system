// Renders the Catalog at 6K (6144 x 3456) in three states: rest, hover,
// pressed. Run: node scripts/still6k.mjs "hover=emboss&view=front" name
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const [query = '', name = 'still'] = process.argv.slice(2);
const executablePath = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, logLevel: 'error' });
await server.listen(0);
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// 1536 x 864 CSS px at 4x = 6144 x 3456 device px (6K, 16:9).
const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 4 });
mkdirSync('shots/6k', { recursive: true });
try {
  await page.goto(server.resolvedUrls.local[0] + `bench.html?${query}&manual&dpr=4`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.contour.tick(30));
  const p = await page.evaluate(() => window.contour.screenOf(window.contour.panel.levels[0].rows[0]));
  const shot = async s => { await page.screenshot({ path: `shots/6k/${name}-${s}.png`, timeout: 180000 }); console.log(`shots/6k/${name}-${s}.png`); };
  await shot('rest');
  await page.mouse.move(p.x + 60, p.y);
  await page.evaluate(() => window.contour.tick(60));
  await shot('hover');
  await page.mouse.down();
  await page.evaluate(() => window.contour.tick(20));
  await shot('press');
  await page.mouse.up();
} finally { await browser.close(); await server.close(); }
