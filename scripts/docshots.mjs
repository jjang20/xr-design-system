// Shoots the images in docs/images/ from the current demo at 2560 x 1600.
// Run: node scripts/docshots.mjs   (writes shots/docs/*.png)
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const executablePath = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, logLevel: 'error' });
await server.listen(0);
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// 1280 x 800 CSS px at 2x = 2560 x 1600 device px.
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
mkdirSync('shots/docs', { recursive: true });
const wait = ms => page.waitForTimeout(ms);
const screenOf = expr => page.evaluate(e => window.contour.screenOf(eval(e)), expr);
const shot = async name => { await page.screenshot({ path: `shots/docs/${name}.png`, timeout: 180000 }); console.log(`shots/docs/${name}.png`); };
// Software rendering at 2x is slow, so give each step a few frames.
// Aims twice, in case the target was still settling.
const click = async expr => {
  for (let i = 0; i < 2; i++) { const p = await screenOf(expr); await page.mouse.move(p.x, p.y, { steps: 4 }); await wait(900); }
  await page.mouse.down(); await wait(400); await page.mouse.up();
};

try {
  // The whole scene.
  await page.goto(url);
  await page.waitForFunction(() => window.contour, null, { timeout: 60000 });
  await wait(4000);
  await shot('components-overview');

  // Packaging, compress: Catalog > Sofas > Modular.
  await click('window.contour.panel.levels.at(-1).rows[0]');
  await wait(6000);
  await click('window.contour.panel.levels.at(-1).rows[1]');  // Modular
  await wait(4500);
  await page.mouse.move(5, 5);
  await wait(800);
  await shot('packaging-compress');

  // Toolbar close-up, in a fresh scene: a narrow lens aimed at the bar.
  await page.goto(url);
  await page.waitForFunction(() => window.contour, null, { timeout: 60000 });
  await wait(4000);
  await page.evaluate(() => {
    const c = window.contour, b = c.buttons[0].parent.getWorldPosition(new c.camera.position.constructor());
    const d = b.clone().sub(c.camera.position);
    c.look.yaw = Math.atan2(-d.x, -d.z); c.look.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    c.camera.fov = 20; c.camera.updateProjectionMatrix();
  });
  await wait(1500);
  // The view turns on the next frames; aim once it has.
  await page.mouse.move(640, 400, { steps: 3 }); await wait(800);
  const tb = await screenOf('window.contour.buttons[1]');
  await page.mouse.move(tb.x - 20, tb.y); await wait(100); await page.mouse.move(tb.x, tb.y, { steps: 5 });
  await wait(1000);
  console.log('toolbar hovered:', await page.evaluate(() => window.contour.buttons.map(b => b.hovered)));
  await shot('toolbar');

  // Catalog row hover and press, front-on in the bench.
  await page.goto(url + 'bench.html?manual&view=front');
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.contour.tick(30));
  const r = await screenOf('window.contour.panel.levels[0].rows[0]');
  await page.mouse.move(r.x + 60, r.y);
  await page.evaluate(() => window.contour.tick(60));
  await shot('catalog-hover');
  await page.mouse.down();
  await page.evaluate(() => window.contour.tick(20));
  await shot('catalog-press');
  await page.mouse.up();
} finally { await browser.close(); await server.close(); }
if (errors.length) { console.error('Page errors:\n' + errors.join('\n')); process.exit(1); }
