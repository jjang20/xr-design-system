// Live vs path-traced: shoots the live Dock and Z-Slider at the framings of
// the Blender lookdev renders (lookdev/dock_slider.py) and lays each pair
// side by side in shots/match/. Run: node scripts/match.mjs [dock|slider]
// With --eval it also renders the eval passes (masks, features switched off)
// into shots/match/eval/ and scores them: python3 scripts/match_eval.py.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const executablePath = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, logLevel: 'error' });
await server.listen(0);
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
mkdirSync('shots/match/eval', { recursive: true });
const EVAL = process.argv.includes('--eval');
// --set <json> overrides DEFAULTS (see demo/bench.js); --out <name> writes
// the beauty frame to shots/match/var-<part>-<state>-<name>.png instead.
const arg = k => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const SET = arg('--set'), OUT = arg('--out');
// Supersampling: frames are drawn at --ss x the size (default 2) and
// averaged down, as the path tracer averages many samples per pixel.
const SS = Number(arg('--ss') ?? 2);
const ICONS = 'mask:icon0,icon1,icon2,icon3,icon4';
// [file key, pass] per shot. See window.contour.pass in demo/bench.js.
const PASSES = {
  'dock-rest': [['shelf', 'mask:shelf'], ['icons', ICONS], ['mirror', 'mask:mirror'], ['dot', 'mask:dot'],
    ['noglyph', 'noglyph'], ['nomirror', 'nomirror'], ['noglow', 'noglow'], ['flatroom', 'flatroom'],
    ['norefract', 'norefract'], ['physical-refract', 'physical-refract'], ['noreflect', 'noreflect'], ['physical-reflect', 'physical-reflect'],
    ['noicons', 'hide:icon0,icon1,icon2,icon3,icon4,mirror']],
  'dock-hover': [['shelf', 'mask:shelf'], ['icons', ICONS], ['noglyph', 'noglyph']],
  'slider-rest': [['knob', 'mask:knob'], ['stem', 'mask:stem,joint'], ['plate', 'mask:plate'], ['noglow', 'noglow'], ['noglyph', 'noglyph'], ['nolabel', 'nolabel'],
    ['labelglass', 'mask:labelglass'], ['noplate', 'hide:plate'], ['nostem', 'hide:stem'], ['nobubble', 'hide:bubble'], ['flatroom', 'flatroom'],
    ['norefract', 'norefract'], ['physical-refract', 'physical-refract'], ['noreflect', 'noreflect'], ['physical-reflect', 'physical-reflect']],
};
const shots = [];
try {
  const only = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !['--set', '--out', '--ss'].includes(all[i - 1]));  // optional: dock | slider
  for (const [part, state] of [['dock', 'rest'], ['dock', 'hover'], ['slider', 'rest']].filter(([p]) => !only || p === only)) {
    // A fresh page per shot: SwiftShader can drop a long-lived context.
    let page = await open(part, state);
    // Each frame is read back from the canvas right after it draws. A blank
    // frame means SwiftShader dropped the context: redo it on a fresh page.
    const shoot = async (pass, path) => {
      for (let tries = 0; ; tries++) {
        const url = await page.evaluate(p => window.contour.pass(p), pass);
        const png = Buffer.from(url.split(',')[1], 'base64');
        if (pass.startsWith('mask:') || !blank(png)) { writeFileSync(path, png); if (SS > 1) shrink(path); return; }
        if (tries > 2) throw new Error(`blank frame on ${part}-${state} ${pass}`);
        await page.close();
        page = await open(part, state);
      }
    };
    const file = OUT ? `shots/match/var-${part}-${state}-${OUT}.png` : `shots/match/live-${part}-${state}.png`;
    await shoot('beauty', file);
    if (!OUT) shots.push([part, state, file]);
    if (EVAL) {
      for (const [key, pass] of [...PASSES[`${part}-${state}`], ['beauty', 'beauty']]) await shoot(pass, `shots/match/eval/${part}-${state}-${key}.png`);
      // Where things are on screen, for profiles along the stem.
      const geo = await page.evaluate(() => {
        const s = window.contour.slider;
        return s ? { axis: window.contour.screenPoints(s, [[0, 0, 0], [0, 0, s.knobZ]]) } : {};
      });
      writeFileSync(`shots/match/eval/${part}-${state}.json`, JSON.stringify(geo));
    }
    await page.close();
    console.log(file);
  }
} finally { await browser.close(); await server.close(); }

// Average an SS x frame down to the viewport size (a box filter).
function shrink(path) {
  execFileSync('python3', ['-c', `from PIL import Image\nim=Image.open('${path}')\nim.resize((im.width//${SS},im.height//${SS}),Image.BOX).save('${path}')`]);
}
// A frame with no picture: its PNG compresses to almost nothing.
function blank(png) { return png.length < 20000; }

async function open(part, state) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: SS });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0] + `bench.html?manual&part=${part}${SET ? '&set=' + encodeURIComponent(SET) : ''}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.contour.tick(30));
  // Text is laid out asynchronously (font load): wait for every label.
  await page.waitForFunction(() => { let ok = true; window.contour.scene?.traverse(o => { if (typeof o.sync === 'function' && o.text && !o.textRenderInfo) ok = false; }); window.contour.tick(1); return ok; }, null, { timeout: 60000, polling: 500 });
  if (state === 'hover') await page.evaluate(() => {
    const c = window.contour, p = c.dock.icons[2].getWorldPosition(c.camera.position.clone());
    c.hands.push(p.add(c.camera.position.clone().sub(p).normalize().multiplyScalar(0.03)));
  });
  await page.evaluate(() => window.contour.tick(90));
  return page;
}
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
