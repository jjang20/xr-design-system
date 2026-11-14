// Quest-reported compositing regression: glow must leave empty pixels transparent.
// Uses the real ZSlider material and WebGL; no headset acceptance is implied.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.env.QUEST_CHECK_OUT;
const errors = [];
const server = await createServer({ configFile: path.join(root, 'vite.config.js'), logLevel: 'error',
  plugins: [{ name: 'quest-regression-fixture', configureServer(s) {
    s.middlewares.use('/quest-check.html', (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<body style="margin:0;background:#ddd"><script type="module">
        import * as THREE from '/@fs/${root}node_modules/three/build/three.module.js';
        import { ZSlider } from '/@fs/${root}src/components/ZSlider.js';
        import { createTokens } from '/@fs/${root}src/tokens.js';
        import tokenJson from '/@fs/${root}tokens.json';
        window.fixture = { THREE, ZSlider, T: createTokens(tokenJson) };
      </script></body>`);
    });
  } }], server: { host: '127.0.0.1' } });
let browser;
try {
  await server.listen(0);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0] + 'quest-check.html');
  await page.waitForFunction(() => window.fixture, null, { timeout: 60000 });
  const result = await page.evaluate(() => {
    const { THREE, ZSlider, T } = window.fixture;
    const slider = new ZSlider(T, { value: 0.5 }); slider.update(1 / 60);
    const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(256, 256);
    renderer.setClearColor(0, 0); document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    const glow = slider.ringGlow; slider.remove(glow); scene.add(glow);
    const side = glow.geometry.parameters.width;
    const camera = new THREE.OrthographicCamera(-side / 2, side / 2, side / 2, -side / 2, 0.01, 2);
    camera.position.z = 1;
    const target = new THREE.WebGLRenderTarget(128, 128);
    const pixels = new Uint8Array(128 * 128 * 4);
    const samples = [];
    for (const lit of [0, 3, 5]) {
      glow.material.uniforms.uOn.value = Array.from({ length: 5 }, (_, i) => i < lit ? 1 : 0);
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
      const alphaAt = (x, y) => pixels[(y * 128 + x) * 4 + 3];
      let maxAlpha = 0, maxLight = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        maxAlpha = Math.max(maxAlpha, pixels[i + 3]); maxLight = Math.max(maxLight, pixels[i], pixels[i + 1], pixels[i + 2]);
      }
      samples.push({ lit, centreAlpha: alphaAt(64, 64), cornerAlpha: alphaAt(0, 0), maxAlpha, maxLight });
    }
    renderer.setRenderTarget(null); renderer.render(scene, camera);
    target.dispose();
    return samples;
  });
  const checks = [
    { name: 'unlit glow leaves the MR background transparent', pass: result[0].maxAlpha === 0 },
    { name: 'lit glow leaves its centre and rectangular corners transparent', pass: result.every(s => s.centreAlpha === 0 && s.cornerAlpha === 0) },
    { name: 'lit detent rings still emit visible light', pass: result.slice(1).every(s => s.maxAlpha > 0 && s.maxLight > 0) },
    { name: 'no browser errors', pass: errors.length === 0 },
  ];
  if (out) {
    await mkdir(out, { recursive: true });
    await page.screenshot({ path: path.join(out, 'glow-composite.png') });
    await writeFile(path.join(out, 'result.json'), JSON.stringify({ checks, samples: result, errors }, null, 2) + '\n');
  }
  console.log(JSON.stringify({ checks, samples: result, errors }, null, 2));
  if (checks.some(c => !c.pass)) process.exitCode = 1;
} finally { if (browser) await browser.close(); await server.close(); }
