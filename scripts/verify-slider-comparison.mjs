// Finite desktop check of the real comparison entry. No XR session or telemetry.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const out = resolve(process.env.R01_OUTPUT ?? 'shots/r01');
mkdirSync(out, { recursive: true });
const report = { kind: 'desktop-render-and-pointer-only', errors: [], requests: [], failedResponses: [], checks: [], cleanup: {} };
let server, browser;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await server.listen();
  report.url = `${server.resolvedUrls.local[0]}slider-comparison.html`;
  report.ownerPid = process.pid;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('request', r => report.requests.push({ method: r.method(), url: r.url() }));
  page.on('response', r => { if (r.status() >= 400) report.failedResponses.push({ url: r.url(), status: r.status() }); });
  await page.goto(report.url);
  await page.waitForFunction(() => window.sliderComparison, null, { timeout: 30000 });
  const state = () => page.evaluate(() => {
    const { comparison } = window.sliderComparison;
    return Object.fromEntries(['x', 'z'].map(key => [key, {
      value: comparison.controls[key].value,
      text: comparison.results[key].number.text,
      laidOut: comparison.results[key].number.textRenderInfo?.parameters.text,
      rgb: comparison.results[key].sample.material.color.toArray(),
    }]));
  });
  const synced = () => page.waitForFunction(() => Object.values(window.sliderComparison.comparison.results)
    .every(r => r.number.textRenderInfo?.parameters.text === r.number.text));
  const point = (key, x = 0, knob = false) => page.evaluate(({ key, x, knob }) => {
    const app = window.sliderComparison, control = app.comparison.controls[key];
    const local = control.position.clone().set(x, 0, knob ? control.knobZ + control.t : control.frontZ);
    return app.screenOf(control, local);
  }, { key, x, knob });
  const initial = await state();
  assert.equal(initial.x.text, '40%'); assert.equal(initial.z.laidOut, '40%');
  assert.equal(await page.evaluate(() => {
    const { comparison, scene } = window.sliderComparison;
    const material = comparison.controls.z.knobSkin;
    return material.uniforms.envMap.value === scene.environment && material.uniforms.uHasRoom.value === 1;
  }), true, 'existing custom glass consumes the fixture environment');
  await page.screenshot({ path: `${out}/initial.png` });
  report.checks.push({ name: 'initial-font-ready-40', state: initial });
  const start = await point('x', 0.04);
  await page.mouse.move(start.x, start.y); await page.waitForTimeout(120);
  assert.equal((await state()).x.value, 0.4);
  await page.mouse.down(); await page.waitForTimeout(80);
  const end = await point('x', 0.06);
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.waitForTimeout(80);
  await page.mouse.up(); await synced();
  const dragged = await state();
  assert.ok(dragged.x.value > 0.85 && dragged.x.value < 0.9);
  assert.equal(dragged.z.value, 0.4);
  report.checks.push({ name: 'hover-no-change-and-independent-X-drag', state: dragged });
  await page.screenshot({ path: `${out}/x-dragged.png` });
  const z = await point('z', 0, true);
  await page.mouse.move(z.x, z.y); await page.waitForTimeout(120);
  await page.mouse.wheel(0, -100); await page.waitForTimeout(120); await synced();
  const wheeled = await state();
  assert.ok(wheeled.z.value < 0.4); assert.equal(wheeled.x.value, dragged.x.value);
  report.checks.push({ name: 'existing-Z-wheel-and-independent-result', state: wheeled });
  // Also exercise the original captured horizontal-plane ray drag.
  const knob = await point('z', 0, true);
  await page.mouse.move(knob.x, knob.y); await page.waitForTimeout(100);
  await page.mouse.down(); await page.waitForTimeout(80);
  await page.mouse.move(knob.x, knob.y + 20, { steps: 8 }); await page.waitForTimeout(100);
  await page.mouse.up(); await page.waitForTimeout(80); await synced();
  const zDragged = await state();
  assert.notEqual(zDragged.z.value, wheeled.z.value);
  assert.equal(zDragged.x.value, dragged.x.value);
  report.checks.push({ name: 'existing-Z-captured-ray-drag', state: zDragged });
  await page.screenshot({ path: `${out}/both-adjusted.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  assert.deepEqual(await state(), zDragged);
  report.checks.push({ name: 'reduced-preference-preserves-values-not-a-comfort-verdict' });
  await page.evaluate(() => {
    window.r01CaptureEvents = [];
    const canvas = document.querySelector('body > canvas');
    for (const type of ['gotpointercapture', 'lostpointercapture', 'pointercancel']) {
      canvas.addEventListener(type, e => window.r01CaptureEvents.push({ type, id: e.pointerId }));
    }
  });
  for (const key of ['x', 'z']) {
    const p = await point(key, 0, key === 'z');
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(80);
    await page.mouse.down(); await page.waitForTimeout(80);
    // Capture requested in pointerdown is pending until the next pointer
    // event. Move first so this tests loss of actual, not pending, capture.
    await page.mouse.move(p.x + 1, p.y); await page.waitForTimeout(80);
    const beforeLoss = await state();
    await page.evaluate(() => {
      const canvas = document.querySelector('body > canvas');
      if (!canvas.hasPointerCapture(1)) throw new Error('desktop pointer capture missing');
      canvas.releasePointerCapture(1);
    });
    await page.waitForTimeout(80);
    await page.mouse.move(p.x + 30, p.y + 20); await page.waitForTimeout(100); await synced();
    assert.equal((await state())[key].value, beforeLoss[key].value);
    await page.mouse.up();
  }
  report.captureEvents = await page.evaluate(() => window.r01CaptureEvents);
  assert.equal(report.captureEvents.filter(e => e.type === 'lostpointercapture').length, 2);
  report.checks.push({ name: 'actual-DOM-pointer-capture-loss-preserves-X-and-Z' });
  const cancelPoint = await point('x', -0.04);
  await page.mouse.move(cancelPoint.x, cancelPoint.y); await page.waitForTimeout(80);
  await page.mouse.down(); await page.waitForTimeout(80);
  const beforeCancel = await state();
  await page.evaluate(() => document.querySelector('body > canvas')
    .dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await page.mouse.move(cancelPoint.x + 40, cancelPoint.y); await page.waitForTimeout(80); await synced();
  assert.equal((await state()).x.value, beforeCancel.x.value);
  await page.mouse.up();
  report.checks.push({ name: 'synthetic-public-pointercancel-preserves-value' });
  // The public persisted-pagehide event models the BFCache lifecycle branch;
  // it is not evidence that this browser actually cached a WebGL page.
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  assert.equal(await page.locator('body > canvas').count(), 1);
  report.checks.push({ name: 'persisted-pagehide-keeps-fixture-for-back-restore' });
  const quick = await point('x', 0.02);
  await page.mouse.move(quick.x, quick.y); await page.waitForTimeout(80);
  // Deterministically put down/up between two input frames, through real
  // desktop events. The public InputSystem update then consumes that click.
  await page.evaluate(() => window.sliderComparison.renderer.setAnimationLoop(null));
  await page.mouse.click(quick.x, quick.y);
  await page.evaluate(() => {
    const app = window.sliderComparison;
    app.input.update(); app.comparison.update(1 / 60);
    app.input.update(); app.comparison.update(1 / 60);
    app.renderer.render(app.scene, app.camera);
  });
  await synced();
  assert.ok(Math.abs((await state()).x.value - 0.625) < 0.001, 'sub-frame click must still set the track value');
  report.checks.push({ name: 'actual-desktop-click-between-two-input-frames' });
  assert.deepEqual(report.errors, []);
  assert.ok(report.requests.every(r => r.method === 'GET' && new URL(r.url).origin === new URL(report.url).origin));
  await page.evaluate(() => window.sliderComparison.dispose());
  assert.equal(await page.locator('body > canvas').count(), 0);
  report.checks.push({ name: 'fixture-dispose-removes-canvas' });
  report.pass = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser?.close(); report.cleanup.browserClosed = !!browser;
  await server?.close(); report.cleanup.serverClosed = !!server;
  report.cleanup.listenerClosed = !server?.httpServer?.listening;
  writeFileSync(`${out}/desktop.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass ?? false, checks: report.checks.length, errors: report.errors, failure: report.failure, cleanup: report.cleanup, out }));
}
