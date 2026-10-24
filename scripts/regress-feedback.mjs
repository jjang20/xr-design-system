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
    return {changed,maxDelta,hasEnv:Object.hasOwn(mat.defines,'ENVMAP_TYPE_CUBE_UV')};
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
  await capture(page, '03-child-open');
  result.traces.windowControls = await page.evaluate(() => {
    const c=window.contour,r=window.replay,p=c.panel;
    c.tick(150);
    const child=p.levels.at(-1),h=child.moves[1];
    const start=h.localToWorld(new r.THREE.Vector3(0,0,h.t+.012));
    r.src.connected=true;r.src.selecting=false;r.step(start);r.src.selecting=true;r.step(start);
    const before=p.position.clone();r.step(start.clone().add(new r.THREE.Vector3(.04,-.02,.01)));
    const moved=p.position.clone().sub(before).toArray(), captured=!!p.controls.held;
    r.src.selecting=false;r.step(start.clone().add(new r.THREE.Vector3(.04,-.02,.01)));
    const corner=child.corners[1],at=corner.localToWorld(new r.THREE.Vector3(0,0,corner.t+.012));
    r.step(at);r.src.selecting=true;r.step(at);
    const hoverVisible=corner.affordance.visible;
    const oldScale=p.scale.x,dir=corner.getWorldPosition(new r.THREE.Vector3()).sub(p.getWorldPosition(new r.THREE.Vector3())).normalize();
    r.step(at.clone().addScaledVector(dir,.04));const scale=p.scale.x,heldVisible=corner.affordance.visible;
    r.src.selecting=false;r.step(at.clone().addScaledVector(dir,.04));const releasedHoverVisible=corner.affordance.visible;
    r.src.connected=false;r.input.update();c.tick(1);
    return {moved,captured,oldScale,scale,hoverVisible,heldVisible,releasedHoverVisible,restHidden:!corner.affordance.visible,active:p.active,lostReleased:!p.controls.held,
      layers:p.levels.map(l=>({title:l.item.label,top:l.cur.y+l.size.H*l.cur.sy/2,titleBand:l.size.titleBand*l.cur.sy,sheet:l.panel.skin.uniforms.uOpacity.value,titleOpacity:l.title.fillOpacity}))};
  });
  const wc=result.traces.windowControls;
  check('real finger input moves and resizes the complete stack without navigating',wc.captured && Math.abs(wc.moved[0]-.04)<.001 && wc.scale>wc.oldScale && wc.active===1 && wc.lostReleased);
  check('controls reveal on real hover, stay visible during hold/released hover, then hide on loss',wc.hoverVisible&&wc.heldVisible&&wc.releasedHoverVisible&&wc.restHidden);
  check('rear title remains readable above faint rear sheet',wc.layers[0].sheet<.5 && wc.layers[0].titleOpacity>.8 && Math.abs(wc.layers[0].top-wc.layers[1].top-wc.layers[0].titleBand)<.001);
  await capture(page,'06-window-moved-resized-mr');await page.close();

  const shortPage=await open('component=packaging&layout=quest');
  result.traces.shortChild=await shortPage.evaluate(async()=>{
    const c=window.contour,r=window.replay,p=c.panel;
    p.levels[0].rows[3].dispatchEvent({type:'select'});c.tick(120);
    const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js'));
    (await import(url)).setBackdrop(null);c.scene.background=null;
    const [rear,front]=p.levels,gl=c.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const bottom=rear.cur.y-rear.size.H*rear.cur.sy/2,frontBottom=front.cur.y-front.size.H*front.cur.sy/2;
    const project=(x,y)=>p.localToWorld(new r.THREE.Vector3(x,y,rear.cur.z)).project(c.camera);
    const lo=project(-rear.size.W*rear.cur.sx/2,bottom+.003),hi=project(rear.size.W*rear.cur.sx/2,frontBottom-.006);
    const regionMax=()=>{c.renderer.render(c.scene,c.camera);const data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);let max=0;for(let y=Math.ceil((lo.y+1)*h/2);y<Math.floor((hi.y+1)*h/2);y++)for(let x=Math.ceil((lo.x+1)*w/2);x<Math.floor((hi.x+1)*w/2);x++){const i=(y*w+x)*4;max=Math.max(max,data[i],data[i+1],data[i+2]);}return max;};
    const visibleMax=regionMax(),save=rear.panel.skin.uniforms.uOpacity.value;
    rear.panel.skin.uniforms.uOpacity.value=0;const hiddenMax=regionMax();rear.panel.skin.uniforms.uOpacity.value=save;
    return {visibleMax,hiddenMax,bodyExtension:(frontBottom-bottom)*p.scale.y,
      controlsHidden:front.corners.every(h=>!h.affordance.visible),titles:p.levels.map(l=>l.title.fillOpacity)};
  });
  const short=result.traces.shortChild;
  check('short child preserves the exposed rear body in actual MR pixels',short.bodyExtension>.05 && short.visibleMax>=short.hiddenMax+3);
  check('window controls are hidden until hover and title stays readable',short.controlsHidden&&short.titles[0]>.8);
  await capture(shortPage,'08-short-child-mr');
  result.traces.shortAngle=await shortPage.evaluate(()=>{
    const c=window.contour,r=window.replay,p=c.panel;c.camera.position.set(.5,1.6,0);c.camera.lookAt(p.getWorldPosition(new r.THREE.Vector3()));c.camera.updateMatrixWorld(true);
    const rear=p.levels[0],u=rear.panel.skin.uniforms,gl=c.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const read=()=>{c.renderer.render(c.scene,c.camera);const a=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
    const before=read(),save=u.uOpacity.value;u.uOpacity.value=0;const flat=read();u.uOpacity.value=save;
    let changed=0;for(let i=0;i<before.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(before[i+k]-flat[i+k])))>=2)changed++;
    return {changed};
  });
  check('oblique view preserves visible rear sheet contribution',result.traces.shortAngle.changed>20);
  await capture(shortPage,'09-short-child-angle-mr');
  for (const [view, offset] of [['side',[.55,.02,.15]],['back',[.12,.02,-.55]]]) {
    result.traces[view+'Sheet']=await shortPage.evaluate(offset=>{
      const c=window.contour,r=window.replay,p=c.panel;
      const centre=p.getWorldPosition(new r.THREE.Vector3());
      c.camera.position.copy(centre).add(new r.THREE.Vector3(...offset));c.camera.lookAt(centre);c.camera.updateMatrixWorld(true);
      const rear=p.levels[0],u=rear.panel.skin.uniforms,gl=c.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
      const read=()=>{c.renderer.render(c.scene,c.camera);const a=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
      const before=read(),save=u.uOpacity.value;u.uOpacity.value=0;const hidden=read();u.uOpacity.value=save;
      let changed=0,maxDelta=0;for(let i=0;i<before.length;i+=4){const d=Math.max(...[0,1,2].map(k=>Math.abs(before[i+k]-hidden[i+k])));if(d>=2)changed++;maxDelta=Math.max(maxDelta,d);}
      return {changed,maxDelta};
    },offset);
    check(view+' view retains full rear plate opacity contribution',result.traces[view+'Sheet'].changed>20);
    await capture(shortPage,'09-short-child-'+view+'-mr');
  }
  await shortPage.close();

  const deepPage=await open('component=packaging&layout=quest');
  result.traces.deepChild=await deepPage.evaluate(async()=>{
    const c=window.contour,r=window.replay,p=c.panel;
    p.levels[0].item.items[0].items[1].items=[{label:'Only child'}];p.levels[0].rows[0].dispatchEvent({type:'select'});c.tick(150);p.levels[1].rows[1].dispatchEvent({type:'select'});c.tick(150);
    const url=performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js'));
    (await import(url)).setBackdrop(null);c.scene.background=null;
    const rear=p.levels[0],front=p.levels[2],gl=c.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const bottom=rear.cur.y-rear.size.H*rear.cur.sy/2,frontBottom=front.cur.y-front.size.H*front.cur.sy/2;
    const project=(x,y)=>p.localToWorld(new r.THREE.Vector3(x,y,rear.cur.z)).project(c.camera);
    const lo=project(-rear.size.W*rear.cur.sx/2,bottom+.003),hi=project(rear.size.W*rear.cur.sx/2,frontBottom-.006);
    const regionMax=()=>{c.renderer.render(c.scene,c.camera);const data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);let max=0;for(let y=Math.ceil((lo.y+1)*h/2);y<Math.floor((hi.y+1)*h/2);y++)for(let x=Math.ceil((lo.x+1)*w/2);x<Math.floor((hi.x+1)*w/2);x++){const i=(y*w+x)*4;max=Math.max(max,data[i],data[i+1],data[i+2]);}return max;};
    const visibleMax=regionMax(),save=rear.panel.skin.uniforms.uOpacity.value;rear.panel.skin.uniforms.uOpacity.value=0;const rootHiddenMax=regionMax();rear.panel.skin.uniforms.uOpacity.value=save;
    return {visibleMax,rootHiddenMax,bodyExtension:(frontBottom-bottom)*p.scale.y,
      controlsHidden:front.corners.every(h=>!h.affordance.visible),titles:p.levels.map(l=>l.title.fillOpacity)};
  });
  const deep=result.traces.deepChild;
  check('three-layer variable heights preserve the complete ancestor sheet',deep.visibleMax>=3 && deep.visibleMax>=deep.rootHiddenMax+2);

  await capture(deepPage,'10-deep-child-mr');await deepPage.close();

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
  await capture(dockPage, '05-plate-contact');
  result.traces.rail=await dockPage.evaluate(()=>{
    const c=window.contour,d=c.dock,r=window.replay,h=d.handle;
    r.src.connected=false;r.input.update();c.tick(1);r.src.connected=true;
    for(const gap of [.12,.08,.06,.04,.025,.017,.012])r.step(h.localToWorld(new r.THREE.Vector3(0,0,h.t+gap)));
    const at=h.localToWorld(new r.THREE.Vector3(0,0,h.t+.012));r.src.selecting=true;r.step(at);
    const start=d.position.clone(),side=d.side,captured=!!d.rail.held;
    r.step(at.clone().add(new r.THREE.Vector3(.08,-.04,-.04)));
    const moved=d.position.distanceTo(start),suppressed=d.icons.every(i=>!i.hovered&&!i.press.pressed);
    r.src.selecting=false;r.step(at.clone().add(new r.THREE.Vector3(.08,-.04,-.04)));
    return {captured,moved,suppressed,sideUnchanged:d.side===side,released:!d.rail.held};
  });
  const rail=result.traces.rail;
  check('continuous handle approach captures, repositions and suppresses icons',rail.captured&&rail.moved>.03&&rail.suppressed&&rail.sideUnchanged&&rail.released);
  await capture(dockPage,'07-dock-repositioned');await dockPage.close();
  check('no browser or shader errors', result.errors.length === 0);
  if (out) await writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (result.checks.some(c => !c.pass)) process.exitCode = 1;
} finally { if (browser) await browser.close(); await server.close(); }
