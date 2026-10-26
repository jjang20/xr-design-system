// Renders the demo in headless Chromium and saves screenshots of each
// component in a few states to shots/. Fails if the page logs an error.
// Run: npm run shot   (set CHROMIUM_PATH if Chromium is somewhere else)
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const executablePath = process.env.CHROMIUM_PATH
  ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);

const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, logLevel: 'error' });
await server.listen(0);
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

mkdirSync('shots', { recursive: true });
const wait = ms => page.waitForTimeout(ms);
const screenOf = expr => page.evaluate(e => window.contour.screenOf(eval(e)), expr);
const shot = async name => { await page.screenshot({ path: `shots/${name}.png` }); console.log(`shots/${name}.png`); };

try {
  await page.goto(url);
  await page.waitForFunction(() => window.contour, null, { timeout: 60000 });
  await wait(3000); // fonts and icons load
  await shot('01-overview');

  // Hover the Place button, then press and hold it.
  const firm = await screenOf('window.contour.buttons[0]');
  await page.mouse.move(firm.x, firm.y);
  await wait(300);
  await shot('02-button-hover');
  await page.mouse.down();
  await wait(100);
  await shot('03-button-pressed');
  await page.mouse.up();

  // Push the Z-Slider with the wheel.
  const knob = await screenOf('window.contour.slider.knob');
  await page.mouse.move(knob.x, knob.y);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -100); await wait(40); }
  await wait(200);
  await shot('04-zslider-pushed');

  // Open Sound, then Output: two levels of packaging.
  const openRow = async i => {
    const p = await screenOf(`window.contour.panel.levels.at(-1).rows[${i}]`);
    await page.mouse.move(p.x, p.y);
    await wait(150);
    await page.mouse.down();
    await wait(60);
    await page.mouse.up();
    await wait(3500);
  };
  await openRow(0);
  await shot('05-packaging-level-1');
  await openRow(1);
  await shot('06-packaging-level-2');

  // Hover near the dock to magnify.
  const icon = await screenOf('window.contour.dock.icons[2]');
  await page.mouse.move(icon.x, icon.y);
  await wait(300);
  await shot('07-dock-magnify');

  // Turn 40 degrees right: the dock waits (anchor.follow.delay), then follows.
  await page.mouse.move(640, 790);
  await page.evaluate(() => { window.contour.look.yaw -= 0.7; });
  await wait(100);
  await shot('08-dock-turned-waiting');
  await wait(2500);
  await shot('09-dock-followed');
} finally {
  await browser.close();
  await server.close();
}

if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
