// Actual InputSystem joint replay in the rendered bench. This verifies browser
// motion and routing; it is not a substitute for physical Quest calibration.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.env.PALM_CHECK_OUT;
const layout = process.env.PALM_CHECK_LAYOUT ?? 'previous';
const result = { layout, checks: [], errors: [], traces: {} };
const check = (name, pass) => result.checks.push({ name, pass });
const server = await createServer({ configFile: path.join(root, 'vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1' } });
let browser;
try {
  await server.listen(0);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => result.errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0] + `bench.html?manual&component=packaging&view=angle&layout=${layout}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
  await page.evaluate(async root => {
    const THREE = await import(`/@fs/${root}node_modules/three/build/three.module.js`);
    const { InputSystem } = await import(`/@fs/${root}src/core/InputSystem.js`);
    const c = window.contour, p = c.panel, group = () => new THREE.Group();
    c.renderer.setAnimationLoop(null);
    const input = new InputSystem({ T: p.T, scene: c.scene, camera: c.camera,
      renderer: { domElement: { addEventListener() {} }, xr: { isPresenting: true, getController: group, getControllerGrip: group, getHand: group } } });
    const src = input.xr[0]; src.connected = true; src.grip.visible = false; src.hand.joints = {};
    const joint = (name, x, y, radius) => {
      const j = new THREE.Group(); j.position.set(x, y, 0); j.jointRadius = radius;
      src.hand.add(j); src.hand.joints[name] = j; return j;
    };
    joint('wrist', 0, -0.04, 0.012).rotation.x = Math.PI / 2;
    for (const [finger, x] of [['index', -0.025], ['middle', -0.008], ['ring', 0.009], ['pinky', 0.025]]) {
      joint(`${finger}-finger-phalanx-proximal`, x, 0.03, 0.01);
      joint(`${finger}-finger-tip`, x, 0.1, 0.008);
    }
    let front;
    const move = (gap, x = 0, y = 0) => {
      src.hand.position.copy(p.localToWorld(new THREE.Vector3(x, y, front + (0.022 + gap) / p.scale.z)));
      c.scene.updateMatrixWorld(true); input.update(); c.tick(1);
    };
    const open = () => {
      p.levels[0].rows[0].dispatchEvent({ type: 'select' }); c.tick(150);
      front = p.levels.at(-1).panel.t;
      window.palm.child = p.levels.at(-1);
    };
    window.palm = { input, src, move, open, setFront: () => { front = p.levels[0].panel.t; } };
    open();
  }, root);
  await page.waitForFunction(() => {
    let ready = true;
    window.contour.scene.traverse(o => { if (typeof o.sync === 'function' && o.text && !o.textRenderInfo) ready = false; });
    return ready;
  }, null, { timeout: 60000 });
  const capture = async name => {
    if (!out) return;
    const png = await page.evaluate(() => window.contour.pass('beauty'));
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, name + '.png'), Buffer.from(png.split(',')[1], 'base64'));
  };
  await capture('01-child-rest');
  result.traces.direct = await page.evaluate(() => {
    const { move, child } = window.palm, p = window.contour.panel;
    const rest = child.cur.z; move(0.06); move(-0.02);
    return { rest: rest * p.scale.z, pushed: child.cur.z * p.scale.z, active: p.active, owner: p.palmOwner };
  });
  check('whole child follows a 20 mm palm push before dismissal', Math.abs(result.traces.direct.pushed - result.traces.direct.rest + 0.02) < 1e-6 && result.traces.direct.active === 1);
  await capture('02-child-pushed');
  result.traces.exit = await page.evaluate(() => {
    const { move, child } = window.palm, c = window.contour;
    move(-0.051); const frames = [{ z: child.cur.z, opacity: child.cur.opacity }];
    for (let i = 0; i < 5; i++) { c.tick(1); frames.push({ z: child.cur.z, opacity: child.cur.opacity }); }
    return { active: c.panel.active, frames };
  });
  const frames = result.traces.exit.frames;
  check('dismissed child moves away and fades', result.traces.exit.active === 0 && frames[5].z < frames[0].z && frames[5].opacity < frames[0].opacity);
  await capture('03-child-dismissing');
  const removed = await page.evaluate(() => { window.contour.tick(150); return window.contour.panel.closing.length === 0 && window.contour.panel.active === 0; });
  check('exit removes the child and preserves Catalog', removed);
  await capture('04-catalog');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  result.traces.reduced = await page.evaluate(() => {
    const c = window.contour, f = window.palm; f.open();
    f.move(0.06); f.move(-0.02); const pushed = f.child.cur.z * c.panel.scale.z;
    f.move(-0.051); const start = { ...f.child.cur }; c.tick(10);
    return { reduced: c.panel.reduced, pushed, start, end: { ...f.child.cur } };
  });
  const reduced = result.traces.reduced;
  check('browser reduced-motion preference preserves direct movement and fades in place', reduced.reduced && reduced.pushed < -0.019 && reduced.start.z === reduced.end.z && reduced.end.opacity < reduced.start.opacity);
  result.traces.root = await page.evaluate(() => {
    const c = window.contour, f = window.palm; c.tick(150); f.setFront();
    const row = c.panel.levels[0].rows[0], events = [];
    for (const type of ['press', 'select']) row.addEventListener(type, () => events.push(type));
    f.src.hand.rotation.z = Math.PI / 2;
    for (const gap of [0.06, 0, -0.02, -0.06, 0.06]) f.move(gap, 0.045, row.position.y + 0.025);
    return { active: c.panel.active, events, z: c.panel.levels[0].cur.z };
  });
  check('root palm overlap never selects a row', result.traces.root.active === 0 && result.traces.root.events.length === 0 && Math.abs(result.traces.root.z) < 1e-9);
  check('no browser errors', result.errors.length === 0);
  if (out) await writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (result.checks.some(c => !c.pass)) process.exitCode = 1;
} finally { if (browser) await browser.close(); await server.close(); }
