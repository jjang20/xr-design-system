// Browser regressions for the PR #3 review, in the real page (WebGL, the
// browser's own reduced-motion setting, real text): interrupted Packaging
// navigation, reduced motion, press ownership with two rays, and the Dock's
// ray-pinned dent. test/interaction.test.js covers the same logic in Node;
// this checks it where it runs. Run: npm run regress
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const executablePath = process.env.CHROMIUM_PATH
  ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const server = await createServer({ configFile: new URL('../vite.config.js', import.meta.url).pathname, logLevel: 'error' });
await server.listen(0);
const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };

async function open(query, { reducedMotion = 'no-preference' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.emulateMedia({ reducedMotion });
  await page.goto(server.resolvedUrls.local[0] + 'bench.html?manual&' + query);
  await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
  return page;
}

try {
  // 1. Open A, back, open B before A has closed (crashed before the fix).
  {
    const page = await open('component=packaging');
    const r = await page.evaluate(() => {
      const c = window.contour, P = c.panel;
      P.levels[0].rows[0].dispatchEvent({ type: 'select' }); c.tick(3);
      P.back(); c.tick(1);
      const closingBefore = P.closing.length;
      P.levels[0].rows[1].dispatchEvent({ type: 'select' }); c.tick(2);
      const mid = { active: P.active, levels: P.levels.map(l => l.item.label), closing: P.closing.map(l => l.item.label) };
      // Gates: only the front level's rows and the panels behind it take input.
      const gates = P.levels.every((l, i) => l.rows.every(r => r.enabled === (i === P.active)) && l.panel.enabled === (i < P.active))
        && P.closing.every(l => l.rows.every(r => !r.enabled) && !l.panel.enabled);
      let frames = 0;
      while (!P.settled && frames < 600) { c.tick(1); frames++; }
      return { closingBefore, mid, gates, settled: P.settled, closingAfter: P.closing.length, frames };
    });
    check('packaging: open, back, open again mid-exit', !page.errors.length && r.closingBefore === 1 && r.mid.active === 1 && r.mid.closing.length === 1,
      page.errors[0] ?? `levels ${r.mid.levels.join(' > ')}, closing ${r.mid.closing.join(', ')}`);
    check('packaging: input gates follow the logical stack', r.gates);
    check('packaging: the closed level is removed once settled', r.settled && r.closingAfter === 0, `${r.frames} frames`);
    await page.close();
  }

  // 2. Reduced motion: the browser's setting changes the panel's path (the
  // review found 30 sampled frames identical under both settings).
  const trace = async reducedMotion => {
    const page = await open('component=packaging', { reducedMotion });
    const t = await page.evaluate(() => {
      const c = window.contour, P = c.panel, out = [];
      P.levels[0].rows[0].dispatchEvent({ type: 'select' });
      for (let i = 0; i < 30; i++) {
        c.tick(1);
        const [parent, child] = P.levels;
        out.push({ pz: parent.cur.z, ps: parent.cur.sx, cz: child.cur.z, cs: child.cur.sx, co: child.cur.opacity, pd: parent.cur.dim,
          to: { pz: parent.to.z, cs: child.to.sx, cz: child.to.z } });
      }
      // Interrupting still works under this setting.
      P.back(); c.tick(1); P.levels[0].rows[1].dispatchEvent({ type: 'select' }); c.tick(2);
      return { out, active: P.active };
    });
    const errors = page.errors;
    await page.close();
    return { ...t, errors };
  };
  const full = await trace('no-preference'), calm = await trace('reduce');
  const at = (t, i) => t.out[i];
  const differ = full.out.some((f, i) => Math.abs(f.pz - calm.out[i].pz) > 1e-6 || Math.abs(f.cs - calm.out[i].cs) > 1e-6);
  check('reduced motion: the path differs from full motion', differ,
    `at 100 ms parent z ${at(full, 5).pz.toFixed(4)} vs ${at(calm, 5).pz.toFixed(4)} m, child scale ${at(full, 5).cs.toFixed(3)} vs ${at(calm, 5).cs.toFixed(3)}`);
  check('reduced motion: no travel or growth after the first frame',
    calm.out.every(f => Math.abs(f.pz - f.to.pz) < 1e-9 && Math.abs(f.cs - f.to.cs) < 1e-9 && Math.abs(f.cz - f.to.cz) < 1e-9));
  check('reduced motion: hierarchy still shows by fading', at(calm, 0).co < at(calm, 29).co && at(calm, 0).pd < at(calm, 29).pd,
    `child opacity ${at(calm, 0).co.toFixed(2)} to ${at(calm, 29).co.toFixed(2)}, parent dim ${at(calm, 0).pd.toFixed(2)} to ${at(calm, 29).pd.toFixed(2)}`);
  check('reduced motion: interrupted navigation still works', calm.active === 1 && !calm.errors.length && full.active === 1 && !full.errors.length);

  // 3. Two rays on one row: xr0 only hovers, xr1 pinches.
  {
    const page = await open('component=packaging');
    const ev = await page.evaluate(() => {
      const row = window.contour.panel.levels[0].rows[0], V = window.contour.camera.position.constructor;
      const ev = [];
      for (const t of ['press', 'release', 'select', 'cancel']) row.addEventListener(t, () => ev.push(t));
      const ray = (id, pressed = false) => ({ kind: 'ray', id, point: new V(0, 0, row.t), pressed, captured: pressed });
      const frame = probes => { for (const p of probes) row.feed(p); row.update(1 / 60); };
      // xr1 presses, then its tracking is lost.
      frame([ray('xr0'), ray('xr1')]); frame([ray('xr0'), ray('xr1', true)]); frame([ray('xr0')]);
      for (let i = 0; i < 30; i++) frame([ray('xr0')]);
      const lost = ev.join(',');
      ev.length = 0;
      // xr1 presses and holds while xr0 hovers, then lets go (the select
      // opens the row's level).
      frame([ray('xr0'), ray('xr1')]);
      frame([ray('xr0'), ray('xr1', true)]);
      for (let i = 0; i < 10; i++) frame([ray('xr0'), ray('xr1', true)]);
      const held = ev.join(',');
      frame([ray('xr0'), ray('xr1')]);
      return { held, done: ev.join(','), lost };
    });
    check('button: a hovering ray does not end another ray\'s press', ev.held === 'press' && ev.done === 'press,release,select', `${ev.held} | ${ev.done}`);
    check('button: losing the pressing ray cancels, no select', ev.lost === 'press,cancel', ev.lost);
    await page.close();
  }

  // 4. Dock: a ray press pins the dent; another ray can't take the press.
  {
    const page = await open('part=dock&visible=5');
    const r = await page.evaluate(() => {
      const c = window.contour, icon = c.dock.icons[1], V = c.camera.position.constructor;
      const on = (x, y, pressed, id = 'xr1') => ({ kind: 'ray', id, point: icon.centre.clone().add(new V(x, y, 1).normalize().multiplyScalar(icon.rb)), pressed, captured: pressed });
      const ev = [];
      for (const t of ['press', 'release', 'select', 'cancel']) icon.addEventListener(t, () => ev.push(t));
      const frame = probes => { for (const p of probes) icon.feed(p); icon.sense(); icon.exclusive = true; icon.update(1 / 60); };
      for (let i = 0; i < 20; i++) frame([on(0, 0, false, 'xr0'), on(0, 0, false)]);
      for (let i = 0; i < 3; i++) frame([on(0, 0, false, 'xr0'), on(0, 0, true)]);
      const start = icon.dentAt.clone();
      for (let i = 0; i < 20; i++) frame([on(0, 0, false, 'xr0'), on(-0.5, 0.5, true)]);
      const drift = icon.dentAt.angleTo(start);
      frame([on(0, 0, false, 'xr0'), on(-0.5, 0.5, false)]);
      return { drift, ev: ev.join(',') };
    });
    check('dock: a ray press keeps its dent where the pinch began', r.drift < 1e-6, `moved ${r.drift.toExponential(1)} rad`);
    check('dock: a hovering ray does not end another ray\'s press', r.ev === 'press,release,select', r.ev);
    check('dock: no page errors', !page.errors.length, page.errors[0] ?? '');
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
