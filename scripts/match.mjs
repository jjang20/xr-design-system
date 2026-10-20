// Live vs path-traced: shoots the live Dock and Z-Slider at the framings of
// the Blender lookdev renders (lookdev/dock_slider.py) and lays each pair
// side by side in shots/match/. Run: node scripts/match.mjs [dock|slider]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const executablePath = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, logLevel: 'error' });
await server.listen(0);
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
mkdirSync('shots/match', { recursive: true });
const shots = [];
try {
  const only = process.argv[2];  // optional: dock | slider
  for (const [part, state] of [['dock', 'rest'], ['dock', 'hover'], ['slider', 'rest']].filter(([p]) => !only || p === only)) {
    // A fresh page per shot: SwiftShader can drop a long-lived context.
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(server.resolvedUrls.local[0] + `bench.html?manual&part=${part}`);
    await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
    await page.evaluate(() => window.contour.tick(30));
    // Text is laid out asynchronously (font load): wait for every label.
    await page.waitForFunction(() => { let ok = true; window.contour.scene?.traverse(o => { if (o.isTroikaText && o.text && !o.textRenderInfo) ok = false; }); window.contour.tick(1); return ok; }, null, { timeout: 60000, polling: 500 });
    if (state === 'hover') await page.evaluate(() => {
      const c = window.contour, p = c.dock.icons[2].getWorldPosition(c.camera.position.clone());
      c.hands.push(p.add(c.camera.position.clone().sub(p).normalize().multiplyScalar(0.03)));
    });
    await page.evaluate(() => window.contour.tick(90));
    const file = `shots/match/live-${part}-${state}.png`;
    await page.screenshot({ path: file });
    shots.push([part, state, file]);
    await page.close();
    console.log(file);
  }
} finally { await browser.close(); await server.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
// Pair each with its Blender frame (render them first with lookdev/dock_slider.py).
for (const [part, state, live] of shots) {
  const ref = part === 'dock' ? `shots/lookdev2/dock-shelf-${state}.png` : 'shots/lookdev2/slider-stem.png';
  if (!existsSync(ref)) continue;
  execFileSync('python3', ['-c', `
from PIL import Image
a=Image.open('${ref}').convert('RGB'); b=Image.open('${live}').convert('RGB').resize(a.size)
im=Image.new('RGB',(a.width*2+12,a.height),(16,16,16)); im.paste(a,(0,0)); im.paste(b,(a.width+12,0))
im.save('shots/match/${part}-${state}.png')`]);
  console.log(`shots/match/${part}-${state}.png  (left Blender, right live)`);
}
