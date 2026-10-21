// The real Catalog (src/components/PackagingPanel.js) three levels deep, as
// the components bench draws it (demo/bench.html): the front window and the
// two parents stacked behind it. Each variant is shot from the front and from
// 35° to the side, at the experiment's pixel density, over the real room.
//
// The variant's tokens reach the components the same way the shipped app
// gets them: the bench imports ../tokens.json, and the arena answers that one
// request with the patched file. Nothing in src/ or demo/ knows about the arena.
//
// Metrics: for each level, the contrast of its title against its own glass
// (bright text pixels over the band's median), so the checks can ask whether
// the way back stays readable and whether the parents stay quieter than the
// window in front; and the contrast of whatever shows below a parent's title,
// which should be bare glass (a receded level hides its list).

const VIEWPORT = { width: 1280, height: 800 }; // the bench's framing (40° vertical field of view)

export async function renderCatalogStack({ browser, baseUrl, variant, exp, root }) {
  // 40° over 800 CSS px is 20 px/deg; scale so one image pixel is one headset pixel.
  const deviceScaleFactor = exp.fixtures.ppd / (VIEWPORT.height / 40);
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/\/tokens\.json(\?|$)/, route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: `export default ${JSON.stringify(variant.tokens)};`,
  }));

  const shots = {};
  const metrics = {};
  for (const view of ['front', 'angle']) {
    await page.goto(`${baseUrl}bench.html?view=${view === 'angle' ? 'angle' : ''}&dist=${exp.fixtures.distanceM}`);
    await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    await openLevel(page, 0, 1);
    await openLevel(page, 1, 2);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(800);
    const png = await page.screenshot();
    shots[view] = png;
    metrics[view] = await titleContrast(page, png, `/@fs${root}/src/core/defaults.js`);
  }
  await page.close();
  if (errors.length) throw new Error(`bench errors: ${errors.join('; ')}`);
  // Title checks read the front view; the side view is where a ghosted list
  // behind the front window shows most.
  return { shots, metrics: { levels: metrics.front, angle: metrics.angle } };
}

// Hover row i of the front window, press it, and wait until level `active`
// has opened and every level has settled.
async function openLevel(page, i, active) {
  const p = await page.evaluate(i => window.contour.screenOf(window.contour.panel.levels.at(-1).rows[i]), i);
  await page.mouse.move(p.x + 40, p.y);
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForFunction(a => {
    const P = window.contour.panel;
    return P.active === a && P.levels.every(l => l.settled);
  }, active, { timeout: 180000, polling: 200 });
}

async function titleContrast(page, png, defaultsUrl) {
  return page.evaluate(async ([b64, defaultsUrl]) => {
    const { DEFAULTS } = await import(defaultsUrl);
    const C = window.contour, D = DEFAULTS;
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    const k = img.width / innerWidth;
    const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const dist = C.panel.distance, dmm = v => (v / 1000) * dist;
    // Contrast of the brightest pixels over the median in a box given in a
    // level's own coordinates, clipped to stop above `clipY` (screen px).
    const contrast = (l, [left, top, right, bottom], clipY = Infinity) => {
      const pts = C.screenPoints(l.group, [[left, top, 0], [right, top, 0], [left, bottom, 0], [right, bottom, 0]]);
      const xs = pts.map(p => p[0] * k), ys = pts.map(p => p[1] * k);
      const x0 = Math.round(Math.min(...xs)), x1 = Math.round(Math.max(...xs));
      const y0 = Math.round(Math.min(...ys)), y1 = Math.round(Math.min(Math.max(...ys), clipY - 2 * k));
      if (y1 - y0 < 4 || x1 - x0 < 4) return null;
      const data = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      const L = [];
      for (let p = 0; p < data.length; p += 4) L.push(0.2126 * lin(data[p]) + 0.7152 * lin(data[p + 1]) + 0.0722 * lin(data[p + 2]));
      L.sort((a, b) => a - b);
      const q = f => L[Math.min(L.length - 1, Math.floor(f * L.length))];
      return { box: [x0, y0, x1, y1], pixels: L.length, contrast: (q(0.99) + 0.05) / (q(0.5) + 0.05) };
    };
    const levels = C.panel.levels;
    // Screen y of each level's top edge: whatever is below it on the level
    // behind is covered.
    const topY = levels.map(l => Math.min(...C.screenPoints(l.group, [[-l.size.W / 2, l.size.H / 2, 0], [l.size.W / 2, l.size.H / 2, 0]]).map(p => p[1] * k)));
    return levels.map((l, i) => {
      const { W, H } = l.size;
      // The title band: from just inside the top padding down one title line.
      const titleTop = H / 2 - dmm(D.panelPadTop * 0.6), titleBottom = H / 2 - dmm(D.panelPadTop + D.type.title.size * 1.2);
      const left = -W / 2 + dmm(D.panelPadding * 0.6);
      const title = contrast(l, [left, titleTop, -W / 2 + W * 0.6, titleBottom]);
      // Below the title, down to where the window in front covers it: on a
      // receded level this should be bare glass (its list is hidden).
      const below = i < levels.length - 1 ? contrast(l, [left, titleBottom - dmm(2), W / 2 - dmm(D.panelPadding), -H / 2], topY[i + 1]) : null;
      return { level: i, label: l.item.label, depth: C.panel.active - i, ...title, below };
    });
  }, [png.toString('base64'), defaultsUrl]);
}
