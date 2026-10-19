// Renders the bench (demo/bench.html) in each state the arena bar judges,
// at a fixed framing, to shots/bench/. Run: npm run bench
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const executablePath = process.env.CHROMIUM_PATH
  ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, logLevel: 'error' });
await server.listen(0);
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const out = 'shots/bench';
mkdirSync(out, { recursive: true });
const wait = ms => page.waitForTimeout(ms);
const shot = async name => { await page.screenshot({ path: `${out}/${name}.png` }); console.log(`${out}/${name}.png`, await page.evaluate(() => { const P = window.contour.panel; return `level ${P.active}`; })); };
// Software rendering is slow and frames are clamped to 50 ms of animation,
// so wait for the panel to settle instead of a fixed time.
const settled = active => page.waitForFunction(a => {
  const P = window.contour.panel;
  return P.active === a && P.levels.every(l => l.settled);
}, active, { timeout: 120000, polling: 200 });
const rowAt = i => page.evaluate(i => window.contour.screenOf(window.contour.panel.levels.at(-1).rows[i]), i);

async function run(query, prefix, { states = true } = {}) {
  await page.goto(server.resolvedUrls.local[0] + 'bench.html' + query);
  await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  await wait(2500);
  await shot(`${prefix}1-rest`);
  let p = await rowAt(0);
  await page.mouse.move(p.x + 40, p.y);
  await wait(500);
  await shot(`${prefix}2-hover`);
  await page.mouse.down();
  await wait(60);
  if (states) await shot(`${prefix}3-press`);
  await page.mouse.up();
  await wait(90);
  if (states) await shot(`${prefix}4-opening`);
  await settled(1);
  await page.mouse.move(20, 20);
  await wait(600);
  await shot(`${prefix}5-level-2`);
  p = await rowAt(1);
  await page.mouse.move(p.x + 40, p.y);
  await wait(400);
  await page.mouse.down();
  await wait(60);
  await page.mouse.up();
  await settled(2);
  await page.mouse.move(20, 20);
  await wait(600);
  await shot(`${prefix}6-level-3`);
}

// `npm run bench -- lookdev`: the framings of the Blender reference frames
// (lookdev/catalog.py), so the live glass can be compared side by side.
async function lookdev(extra) {
  await page.setViewportSize({ width: 1400, height: 1000 });
  for (const [view, fov, name] of [['', 17, 'hover-front'], ['angle', 22, 'hover-angle'], ['angle', 26, 'levels-angle']]) {
    await page.goto(server.resolvedUrls.local[0] + `bench.html?fov=${fov}&view=${view}&${extra}`);
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    await wait(2500);
    if (name.startsWith('hover')) {
      const p = await rowAt(0);
      await page.mouse.move(p.x + 40, p.y);
      await wait(800);
    } else {
      for (const i of [0, 1]) {
        const p = await rowAt(i);
        await page.mouse.move(p.x + 40, p.y); await wait(300);
        await page.mouse.down(); await wait(60); await page.mouse.up();
        await settled(i + 1);
      }
      await page.mouse.move(5, 5); await wait(800);
    }
    const tag = new URLSearchParams(extra).get('hover') ?? '';
    const file = `${out}/live-${name}${tag ? '-' + tag : ''}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
}

try {
  if (process.argv[2] === 'lookdev') await lookdev(process.argv[3] ?? '');
  else {
    const extra = process.argv[2] ?? '';
    await run('?' + extra, '');
    // From 35° to the side: thickness, lift and layering.
    await run('?view=angle&' + extra, 'angle-', { states: false });
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
