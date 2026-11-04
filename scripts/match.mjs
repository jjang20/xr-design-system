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
const SET = arg('--set'), OUT = arg('--out'), STATE = arg('--state');   // --state: capture one state only
// Supersampling: frames are drawn at --ss x the size (default 2) and
// averaged down, as the path tracer averages many samples per pixel.
const SS = Number(arg('--ss') ?? 2);
const ICONS = 'mask:icon0,icon1,icon2,icon3,icon4';
const ICONS7 = 'mask:icon0,icon1,icon2,icon3,icon4,icon5,icon6';
// [file key, pass] per shot. See window.contour.pass in demo/bench.js.
const PASSES = {
  'dock-rest': [['shelf', 'mask:shelf'], ['icons', ICONS], ['mirror', 'mask:mirror'], ['contact', 'mask:contact'], ['dot', 'mask:dot'],
    ['nomirror', 'nomirror'], ['nocontact', 'hide:contact'], ['noicons', 'hide:icon0,icon1,icon2,icon3,icon4,mirror,contact'], ['noglow', 'noglow'], ['clay', 'clay'], ['normals', 'normals']],
  // The plate pinched at its right end and pulled out by half an app each
  // side, held: every app bigger.
  'dock-stretch': [['shelf', 'mask:shelf'], ['icons', ICONS], ['noglow', 'noglow']],
  // Pulled out by an app each side and let go: the apps stay that size.
  'dock-grow': [['shelf', 'mask:shelf'], ['icons', ICONS]],
  // Notes and Clock added, no hand: the plate lengthens by itself to fit them.
  'dock-add': [['shelf', 'mask:shelf'], ['icons', ICONS7]],
  'dock-hover': [['shelf', 'mask:shelf'], ['icons', ICONS], ['bubble', 'mask:bubble'], ['nobubble', 'hide:bubble'], ['nolabel', 'nolabel']],
  'dock-press': [['bubble', 'mask:bubble'], ['icons', ICONS], ['nobubble', 'hide:bubble']],
  'slider-rest': [['knob', 'mask:knob'], ['stem', 'mask:stem,joint'], ['plate', 'mask:plate'], ['noglow', 'noglow'], ['noglyph', 'noglyph'], ['nolabel', 'nolabel'],
    ['labelglass', 'mask:labelglass'], ['noplate', 'hide:plate'], ['nostem', 'hide:stem'], ['nobubble', 'hide:bubble'], ['flatroom', 'flatroom'],
    ['norefract', 'norefract'], ['physical-refract', 'physical-refract'], ['noreflect', 'noreflect'], ['physical-reflect', 'physical-reflect']],
};
const shots = [];
try {
  const only = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !['--set', '--out', '--ss', '--state'].includes(all[i - 1]));  // optional: dock | slider
  for (const [part, state] of [['dock', 'rest'], ['dock', 'hover'], ['dock', 'press'], ['dock', 'stretch'], ['dock', 'grow'], ['dock', 'add'], ['slider', 'rest']].filter(([p, st]) => (!only || p === only) && (!STATE || st === STATE))) {
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
        const c = window.contour, s = c.slider, d = c.dock;
        if (s) return { axis: c.screenPoints(s, [[0, 0, 0], [0, 0, s.knobZ]]) };
        if (!d) return {};
        const out = { pitch: d.pitch, length: d.length, count: d.count.x, size: d.size, rest: d.plateLength(d.count.target), trace: window.addTrace };
        if (d.grip.held) {
          // Stretch: the held end follows the hand one to one and the apps
          // grow; past the largest size it resists and thins; let go, it
          // stays at that size, or any size between; pushed in past the
          // smallest it resists and no app goes; a quick pull is carried to
          // where it was heading.
          const h = d.grip.held, p = d.pitch, [lo, hi] = d.sizeRange;
          const length = z => d.plateLength(d.count.x, z);
          out.track = Math.abs((d.length / 2 - h.half) - p * 0.5);
          c.pull(1, p * 6); c.tick(60);
          out.over = { want: (2 * (h.half + p * 6) - 2 * d.pad) / d.rowWidth(d.count.x), held: d.sizing.x, max: hi, neck: d.neck, size: d.size };
          c.pull(null); c.tick(120);
          out.settled = { size: d.sizing.x, count: d.count.x, presence: d.presence };
          c.pull(1, 0); c.tick(10); c.pull(1, -(length(d.sizing.x) - length(1.25)) / 2); c.tick(60);
          out.mid = { held: d.sizing.x };
          c.pull(null); c.tick(120); out.mid.left = d.sizing.x;
          c.pull(1, 0); c.tick(10); c.pull(1, -(length(d.sizing.x) - length(lo)) / 2 - p * 2); c.tick(60);
          out.under = { held: d.sizing.x, min: lo, neck: d.neck, size: d.size };
          c.pull(null); c.tick(120);
          out.shrunk = { size: d.sizing.x, count: d.count.x, presence: d.presence };
          c.pull(1, 0); c.tick(10); c.pull(1, p * 0.1); c.tick(1); c.pull(1, p * 0.2); c.tick(1);
          out.fling = { at: d.sizing.x };
          c.pull(null); c.tick(150);
          out.fling.landed = d.sizing.x;
          out.fling.max = hi;
        }
        return out;
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
  // Hover: a fingertip 1 cm in front of the middle app's bubble. Press: 7 mm
  // into it (the full dent), held still.
  if (state === 'hover') await page.evaluate(() => window.contour.touch(2, -0.01));
  if (state === 'press') await page.evaluate(async () => { const c = window.contour; c.touch(2, -0.01); c.tick(60); c.touch(2, 0.007); });
  if (state === 'stretch') await page.evaluate(() => { const c = window.contour; c.pull(1, 0); c.tick(10); c.pull(1, c.dock.pitch * 0.5); });
  if (state === 'grow') await page.evaluate(() => { const c = window.contour; c.pull(1, 0); c.tick(10); c.pull(1, c.dock.pitch); c.tick(60); c.pull(null); });
  // Two apps added: the plate's length, frame by frame, as it fits them.
  if (state === 'add') await page.evaluate(() => { const c = window.contour; c.showApps(7); window.addTrace = []; for (let i = 0; i < 90; i++) { c.tick(1); window.addTrace.push(c.dock.length); } });
  await page.evaluate(() => window.contour.tick(90));
  return page;
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
// Pair each with its Blender frame (render them first with lookdev/dock_slider.py).
// The Dock's lookdev frames show the glass globes it had until 2026-10-21;
// its reference now is Jihoon's image of real objects and a hover bubble,
// which has no same-camera render, so the Dock is not paired.
for (const [part, state, live] of shots) {
  if (part === 'dock') continue;
  const ref = 'shots/lookdev2/slider-stem.png';
  if (!existsSync(ref)) continue;
  execFileSync('python3', ['-c', `
from PIL import Image
a=Image.open('${ref}').convert('RGB'); b=Image.open('${live}').convert('RGB').resize(a.size)
im=Image.new('RGB',(a.width*2+12,a.height),(16,16,16)); im.paste(a,(0,0)); im.paste(b,(a.width+12,0))
im.save('shots/match/${part}-${state}.png')`]);
  console.log(`shots/match/${part}-${state}.png  (left Blender, right live)`);
}
