// Records a row interaction frame by frame (bench ?manual) and writes an MP4
// to shots/bench/<name>.mp4. Run: node scripts/record.mjs "hover=emboss" emboss
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [query = '', name = 'interaction'] = process.argv.slice(2);
const executablePath = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, logLevel: 'error' });
await server.listen(0);
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1 });
const dir = `shots/bench/${name}-frames`;
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
try {
  await page.goto(server.resolvedUrls.local[0] + `bench.html?manual&view=angle&fov=22&${query}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  await page.evaluate(() => window.contour.tick(30));
  const p = await page.evaluate(() => window.contour.screenOf(window.contour.panel.levels[0].rows[0]));
  let f = 0;
  // Each frame advances 1/30 s of UI time (2 ticks at 60 Hz).
  const frames = async n => { for (let i = 0; i < n; i++) { await page.evaluate(() => window.contour.tick(2)); await page.screenshot({ path: `${dir}/${String(f++).padStart(4, '0')}.png`, clip: { x: 260, y: 120, width: 480, height: 400 } }); } };
  await frames(6);                       // rest
  await page.mouse.move(p.x + 60, p.y);  // hover: inflate
  await frames(24);
  await page.mouse.down();               // press: sinks to a dimple
  await frames(15);
  await page.mouse.move(p.x + 60, p.y + 200); // slide off before release, so the press cancels (no navigation)
  await page.mouse.up();
  await frames(24);                      // deflate
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', `${dir}/%04d.png`, '-vf', 'scale=960:-2', '-pix_fmt', 'yuv420p', `shots/bench/${name}.mp4`]);
  console.log(`shots/bench/${name}.mp4`, f, 'frames');
} finally { await browser.close(); await server.close(); }
