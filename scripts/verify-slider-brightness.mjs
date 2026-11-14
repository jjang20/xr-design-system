// Real desktop GL/pointer plus explicitly synthetic two-view composition.
// No XR session, device input, telemetry or performance measurement.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const out = resolve(process.env.R01_OUTPUT ?? 'shots/r01-brightness');
mkdirSync(out, { recursive: true });
const report = { kind: 'desktop-GL-pointer-and-synthetic-array-camera', checks: [], errors: [], requests: [], cleanup: {} };
let server, browser;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await server.listen();
  report.url = `${server.resolvedUrls.local[0]}slider-comparison.html`;
  report.ownerPid = process.pid;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('request', r => report.requests.push({ method: r.method(), url: r.url() }));
  page.on('response', r => { if (r.status() >= 400) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(report.url);
  await page.waitForFunction(() => window.sliderComparison, null, { timeout: 30000 });
  const state = () => page.evaluate(() => {
    const a = window.sliderComparison, c = a.comparison;
    return { values: Object.values(c.controls).map(v => v.value), labels: Object.values(c.results).map(v => v.number.text),
      laidOut: Object.values(c.results).map(v => v.number.textRenderInfo?.parameters.text), alpha: a.dimmer.material.uniforms.opacity.value };
  });
  const synced = () => page.waitForFunction(() => Object.values(window.sliderComparison.comparison.results)
    .every(r => r.number.textRenderInfo?.parameters.text === r.number.text));
  assert.deepEqual((await state()).values, [1, 1]);
  assert.equal(await page.evaluate(() => window.sliderComparison.comparison.scopeLabel.text), '가상 화면 밝기');
  report.checks.push('full-brightness-start');
  await page.screenshot({ path: `${out}/initial.png` });
  const point = (key, x = 0) => page.evaluate(({ key, x }) => {
    const a = window.sliderComparison, c = a.comparison.controls[key];
    return a.screenOf(c, c.position.clone().set(x, 0, key === 'z' ? c.knobZ + c.t : c.frontZ));
  }, { key, x });
  const from = await point('x', 0.04), to = await point('x', -0.04);
  await page.mouse.move(from.x, from.y); await page.waitForTimeout(80);
  assert.deepEqual((await state()).values, [1, 1]);
  await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 }); await page.waitForTimeout(80); await page.mouse.up(); await synced();
  const dragged = await state();
  assert.ok(Math.abs(dragged.values[0] - 0.25) < 0.02);
  assert.equal(dragged.values[0], dragged.values[1]);
  assert.equal(dragged.labels[0], dragged.labels[1]);
  assert.ok(dragged.alpha > 0.5 && dragged.alpha < 0.6);
  report.checks.push('actual-pointer-hover-drag-common-output');
  await page.screenshot({ path: `${out}/dimmed.png` });
  const z = await point('z');
  await page.mouse.move(z.x, z.y); await page.waitForTimeout(120);
  await page.mouse.wheel(0, -100); await page.waitForTimeout(120); await synced();
  const wheeled = await state();
  assert.ok(wheeled.values[1] < dragged.values[1]);
  assert.equal(wheeled.values[0], wheeled.values[1]);
  report.checks.push('existing-Z-wheel-updates-common-output');
  const knob = await point('z');
  await page.mouse.move(knob.x, knob.y); await page.waitForTimeout(100);
  await page.mouse.down(); await page.waitForTimeout(80);
  await page.mouse.move(knob.x, knob.y + 20, { steps: 8 }); await page.waitForTimeout(100);
  await page.mouse.up(); await page.waitForTimeout(80); await synced();
  const zDragged = await state();
  assert.notEqual(zDragged.values[1], wheeled.values[1]);
  assert.equal(zDragged.values[0], zDragged.values[1]);
  report.checks.push('existing-Z-captured-ray-drag-common-output');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
  assert.deepEqual(await state(), zDragged);
  report.checks.push('reduced-preference-keeps-common-value-not-comfort-proof');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const key of ['x', 'z']) {
    const p = await point(key);
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(80);
    await page.mouse.down(); await page.waitForTimeout(80);
    await page.mouse.move(p.x + 1, p.y); await page.waitForTimeout(80);
    const beforeLoss = (await state()).values;
    await page.evaluate(() => {
      const canvas = document.querySelector('body > canvas');
      if (!canvas.hasPointerCapture(1)) throw new Error('desktop pointer capture missing');
      canvas.releasePointerCapture(1);
    });
    await page.waitForTimeout(80);
    await page.mouse.move(p.x + 30, p.y + 20); await page.waitForTimeout(100); await synced();
    assert.deepEqual((await state()).values, beforeLoss);
    await page.mouse.up(); await page.waitForTimeout(80);
  }
  report.checks.push('actual-DOM-capture-loss-keeps-both-values');
  const cancelPoint = await point('x', -0.04);
  await page.mouse.move(cancelPoint.x, cancelPoint.y); await page.waitForTimeout(80);
  await page.mouse.down(); await page.waitForTimeout(80);
  const beforeCancel = (await state()).values;
  await page.evaluate(() => document.querySelector('body > canvas')
    .dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await page.mouse.move(cancelPoint.x + 40, cancelPoint.y); await page.waitForTimeout(80); await synced();
  assert.deepEqual((await state()).values, beforeCancel);
  await page.mouse.up(); await page.waitForTimeout(80);
  report.checks.push('synthetic-pointercancel-keeps-both-values');
  await page.locator('#restore').click(); await synced();
  assert.deepEqual((await state()).values, [1, 1]);
  assert.equal((await state()).alpha, 0);
  report.checks.push('desktop-restore');
  // Compare real framebuffer samples, not just brightness uniforms.
  const pixels = await page.evaluate(() => {
    const a = window.sliderComparison, gl = a.renderer.getContext();
    a.renderer.setAnimationLoop(null);
    const sample = b => {
      a.comparison.controls.x.setValue(b); a.comparison.update(0);
      a.renderer.render(a.scene, a.camera);
      const pixels = [];
      for (const [x, y] of [[10, 10], [gl.drawingBufferWidth - 10, gl.drawingBufferHeight - 10]]) {
        const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); pixels.push([...p]);
      }
      return pixels;
    };
    return { bright: sample(1), dark: sample(0), restored: sample(1) };
  });
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(pixels.bright[i], pixels.restored[i]);
    assert.equal(pixels.dark[i][3], 255);
    for (let c = 0; c < 3; c++) assert.ok(pixels.dark[i][c] > 0 && pixels.dark[i][c] < pixels.bright[i][c] * 0.4);
  }
  report.pixels = pixels; report.checks.push('actual-framebuffer-fullscreen-dim-and-restoration');
  const stereo = await page.evaluate(async moduleUrl => {
    const THREE = await import(moduleUrl);
    const a = window.sliderComparison, renderer = a.renderer, dimmer = a.dimmer;
    const previousTarget = renderer.getRenderTarget(), parent = dimmer.parent;
    const scene = new THREE.Scene(), target = new THREE.WebGLRenderTarget(256, 64);
    const views = [0, 1].map(i => {
      const c = new THREE.PerspectiveCamera(50, 2, 0.02, 20);
      c.viewport = new THREE.Vector4(i * 128, 0, 128, 64); c.position.z = 2; c.updateMatrixWorld(); return c;
    });
    const camera = new THREE.ArrayCamera(views);
    const oldClear = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha();
    const records = [];
    try {
      scene.add(dimmer); renderer.setRenderTarget(target); renderer.setClearColor(0, 0);
      for (const mode of ['alpha-blend', 'opaque', 'additive', undefined]) {
        dimmer.setBlendMode(mode);
        for (const value of [1, 0, 1]) {
          dimmer.setBrightness(value); renderer.render(scene, camera);
          const pixels = [16, 112, 144, 240].map(x => {
            const p = new Uint8Array(4); renderer.readRenderTargetPixels(target, x, 32, 1, 1, p); return [...p];
          });
          records.push({ mode: mode ?? 'unknown', value, label: dimmer.scopeLabel, pixels });
        }
      }
    } finally {
      parent.add(dimmer); dimmer.setBlendMode(undefined); a.comparison.restoreBrightness();
      renderer.setRenderTarget(previousTarget); renderer.setClearColor(oldClear, oldAlpha); target.dispose();
    }
    return records;
  }, `/@fs${resolve('node_modules/three/build/three.module.js')}`);
  for (const r of stereo) {
    for (const p of r.pixels) { assert.deepEqual(p.slice(0, 3), [0, 0, 0]); assert.ok(Math.abs(p[3] - (r.value === 0 ? 191 : 0)) <= 1); }
    if (['unknown', 'additive'].includes(r.mode)) assert.equal(r.label, '가상 화면 밝기');
  }
  report.syntheticViews = stereo; report.checks.push('actual-GL-synthetic-two-view-transparent-alpha-and-mode-labels');
  // Actual desktop routing to the in-scene restore control (not a Quest claim).
  await page.evaluate(() => { const a = window.sliderComparison; a.comparison.controls.x.setValue(0); a.comparison.update(0); a.renderer.render(a.scene, a.camera); });
  const restore = await page.evaluate(() => {
    const a = window.sliderComparison, c = a.comparison.restoreControl;
    return a.screenOf(c, c.position.clone().set(0, 0, c.t));
  });
  await page.mouse.move(restore.x, restore.y);
  // The animation loop is paused for deterministic GL checks. Advance the
  // hover frame before pressing, as the live loop does.
  await page.evaluate(() => { const a = window.sliderComparison; a.input.update(); a.comparison.update(1 / 60); });
  await page.mouse.down();
  await page.evaluate(() => { const a = window.sliderComparison; a.input.update(); a.comparison.update(1 / 60); });
  await page.mouse.up();
  await page.evaluate(() => {
    const a = window.sliderComparison;
    for (let i = 0; i < 3; i++) { a.input.update(); a.comparison.update(1 / 60); }
    a.renderer.render(a.scene, a.camera);
  });
  await synced();

  assert.deepEqual((await state()).values, [1, 1]);
  report.checks.push('actual-pointer-to-XR-scene-restore');
  // Troika sync completes asynchronously after the paused-loop render.
  // Submit a fresh frame after it settles before capturing visible geometry.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const a = window.sliderComparison; a.renderer.render(a.scene, a.camera); resolve();
  })));
  report.restored = await state();
  await page.screenshot({ path: `${out}/restored.png` });
  assert.deepEqual(report.errors, []);
  assert.ok(report.requests.every(r => r.method === 'GET' && new URL(r.url).origin === new URL(report.url).origin));
  const pageExit = await page.evaluate(() => {
    const a = window.sliderComparison;
    a.comparison.controls.x.setValue(0); a.comparison.update(0);
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    return { values: Object.values(a.comparison.controls).map(c => c.value),
      alpha: a.dimmer.material.uniforms.opacity.value,
      content: getComputedStyle(document.documentElement).getPropertyValue('--content-brightness'),
      canvasPresent: a.renderer.domElement.isConnected };
  });
  assert.deepEqual(pageExit, { values: [1, 1], alpha: 0, content: '1', canvasPresent: true });
  report.pageExit = pageExit; report.checks.push('synthetic-BFCache-pagehide-restores-without-disposing');
  await page.evaluate(() => window.sliderComparison.dispose());
  assert.equal(await page.locator('body > canvas').count(), 0);
  report.checks.push('dispose-removes-owned-canvas'); report.pass = true;
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  await browser?.close(); report.cleanup.browserClosed = !!browser;
  await server?.close(); report.cleanup.serverClosed = !!server; report.cleanup.listenerClosed = !server?.httpServer?.listening;
  writeFileSync(`${out}/desktop.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass ?? false, checks: report.checks.length, errors: report.errors, failure: report.failure, cleanup: report.cleanup, out }));
}
