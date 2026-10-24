// Rendered round-3 input checks. Synthetic joints use the real InputSystem;
// screenshots/CPU timings remain desktop evidence, not Quest acceptance.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.env.FEEDBACK_CHECK_OUT;
const result = { checks: [], errors: [], traces: {} };
const check = (name, pass) => result.checks.push({ name, pass });
const server = await createServer({ configFile: path.join(root, 'vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1' } });
let browser;
try {
  await server.listen(0);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async query => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => result.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); });
    await page.goto(server.resolvedUrls.local[0] + 'bench.html?manual&' + query);
    await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
    await page.evaluate(async root => {
      const THREE = await import(`/@fs/${root}node_modules/three/build/three.module.js`);
      const { InputSystem } = await import(`/@fs/${root}src/core/InputSystem.js`);
      const c = window.contour, group = () => new THREE.Group();
      c.renderer.setAnimationLoop(null); c.tick(1);
      const input = new InputSystem({ T: (c.panel ?? c.dock).T, scene: c.scene, camera: c.camera,
        renderer: { domElement: { addEventListener() {} }, xr: { isPresenting: true, getController: group, getControllerGrip: group, getHand: group } } });
      const src = input.xr[0]; src.connected = true; src.grip.visible = false;
      const tip = new THREE.Group(); tip.jointRadius = .008; src.hand.add(tip); src.hand.joints = { 'index-finger-tip': tip };
      const step = point => {
        tip.position.copy(point); c.scene.updateMatrixWorld(true); input.update();
        c.hands.splice(0, c.hands.length, ...input.handPoints); c.tick(1);
      };
      window.replay = { THREE, input, src, tip, step };
    }, root);
    return page;
  };
  const capture = async (page, name) => {
    if (!out) return;
    await mkdir(out, { recursive: true });
    const png = await page.evaluate(() => window.contour.pass('beauty'));
    await writeFile(path.join(out, `${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
  };
  const page = await open('component=packaging&layout=quest');
  result.traces.layout = await page.evaluate(() => {
    const p = window.contour.panel;
    return { scale: p.scale.x, gap: p.pose.recedeZ * p.scale.z, oldGap: p.T.get('packaging.parent.recede.z') };
  });
  const layout = result.traces.layout;
  check('window enlarged 50 percent, physical layer gap reduced 30 percent', layout.scale === 1.5 && Math.abs(layout.gap / layout.oldGap - .7) < 1e-9);
  await capture(page, '01-window-expanded');
  result.traces.row = await page.evaluate(() => {
    const c = window.contour, r = window.replay, row = c.panel.levels[0].rows[0];
    r.move = gap => r.step(row.localToWorld(new r.THREE.Vector3(0, 0, row.surfaceZ(new r.THREE.Vector3()) + gap / row.getWorldScale(new r.THREE.Vector3()).z)));
    for (let i = 0; i < 25; i++) r.move(.05);
    r.move(.0179);
    const slots = c.panel.levels[0].panel.skin.uniforms.uBulgeGlow.value;
    return { pressed: row.press.pressed, glow: row.glow, shaderGlow: Math.max(...slots.map(v => v.y)) };
  });
  check('first shallow finger contact reaches the rendered row glow', result.traces.row.pressed && result.traces.row.glow >= .6 && result.traces.row.shaderGlow >= .6);
  await capture(page, '02-row-contact');
  result.traces.glowPixels = await page.evaluate(() => {
    const c = window.contour, u = c.panel.levels[0].panel.skin.uniforms.uBulgeGlow.value, values = u.map(v => v.y);
    const gl = c.renderer.getContext(), pixels = () => {
      c.renderer.render(c.scene, c.camera); const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, p); return p;
    };
    const on = pixels(); u.forEach(v => { v.y = 0; }); const off = pixels(); u.forEach((v, i) => { v.y = values[i]; });
    let changed = 0, maxDelta = 0;
    for (let i = 0; i < on.length; i += 4) {
      const delta = Math.max(...[0, 1, 2].map(k => Math.abs(on[i + k] - off[i + k])));
      if (delta > 2) changed++; maxDelta = Math.max(maxDelta, delta);
    }
    return { changed, maxDelta };
  });
  check('contact glow changes actual pixels', result.traces.glowPixels.changed > 100 && result.traces.glowPixels.maxDelta > 10);
  result.traces.mrGlowPixels = await page.evaluate(async () => {
    const c=window.contour, mat=c.panel.levels[0].panel.skin;
    const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js'));
    const look=await import(url);
    if(look.backdropUniforms().envMap!==mat.uniforms.envMap)throw new Error('Backdrop module identity mismatch');
    look.setBackdrop(null);c.scene.background=null;
    const u=mat.uniforms.uBulgeGlow.value,values=u.map(v=>v.y),gl=c.renderer.getContext();
    const pixels=()=>{c.renderer.render(c.scene,c.camera);const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    const on=pixels();u.forEach(v=>v.y=0);const off=pixels();u.forEach((v,i)=>v.y=values[i]);
    let changed=0,maxDelta=0;for(let i=0;i<on.length;i+=4){const d=Math.max(...[0,1,2].map(k=>Math.abs(on[i+k]-off[i+k])));if(d>2)changed++;maxDelta=Math.max(maxDelta,d);}
    return {changed,maxDelta,hasEnv:!!mat.defines.ENVMAP_TYPE_CUBE_UV};
  });
  check('MR no-env contact glow changes actual pixels',!result.traces.mrGlowPixels.hasEnv && result.traces.mrGlowPixels.changed>100 && result.traces.mrGlowPixels.maxDelta>10);
  await capture(page,'02-row-contact-mr');

  result.traces.click = await page.evaluate(() => {
    const c = window.contour, p = c.panel, r = window.replay, build = p.buildLevel.bind(p); let buildMs;
    p.buildLevel = (...args) => { const start = performance.now(), level = build(...args); buildMs = performance.now() - start; return level; };
    r.move(.004); r.move(.04); r.src.connected = false;
    const frames = [];
    for (let i = 0; i < 15; i++) { const l = p.levels.at(-1); frames.push({ y: l.cur.y, scale: l.cur.sx, opacity: l.cur.opacity }); c.tick(1); }
    return { active: p.active, buildMs, frames };
  });
  const click = result.traces.click;
  check('finger release opens with visible transform and fade', click.active === 1 && click.frames[0].opacity < click.frames[14].opacity && Math.abs(click.frames[0].y - click.frames[14].y) > .001);
  check('prepared child creation stays below 50 ms on this desktop run', click.buildMs < 50);
  await capture(page, '03-child-open'); await page.close();

  const dockPage = await open('part=dock&visible=7');
  await capture(dockPage, '04-dock-handle');
  result.traces.plate = await dockPage.evaluate(() => {
    const c = window.contour, d = c.dock, r = window.replay, events = [];
    d.addEventListener('select', e => events.push(e.app.label));
    const arc = d.length / 2 - d.pad / 2, [x, z] = d.arc(arc, 0);
    for (const y of [.08, .06, .05, .04, .03, .025, .02, .017, .012, .004]) r.step(d.shelf.localToWorld(new r.THREE.Vector3(x, y, z)));
    return { pressed: d.shelf.press.pressed, depth: d.shelf.press.depth, glow: d.base.material.uniforms.uTouchGlow.value.r, events };
  });
  check('real fingertip route presses plate without selecting an app', result.traces.plate.pressed && result.traces.plate.depth > .002 && !result.traces.plate.events.length);
  await capture(dockPage, '05-plate-contact'); await dockPage.close();
  check('no browser or shader errors', result.errors.length === 0);
  if (out) await writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (result.checks.some(c => !c.pass)) process.exitCode = 1;
} finally { if (browser) await browser.close(); await server.close(); }
