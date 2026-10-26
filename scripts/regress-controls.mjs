// R5 material checks: actual RGBA output and HDR/no-env glow.
// Desktop shader evidence is separate from physical Quest acceptance.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.env.CONTROLS_CHECK_OUT;
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
      const c = window.contour;c.renderer.setAnimationLoop(null);c.tick(1);window.replay={THREE};
    }, root);
    return page;
  };
  const capture = async (page, name) => {
    if (!out) return;
    await mkdir(out, { recursive: true });
    const png = await page.evaluate(() => window.contour.pass('beauty'));
    await writeFile(path.join(out, `${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
  };

  for (const mode of ['hdr', 'mr']) {
    const page = await open('component=packaging&layout=quest');
    await page.evaluate(async ({root, mode}) => {
      const c=window.contour,r=window.replay,group=()=>new r.THREE.Group();
      const {InputSystem}=await import(`/@fs/${root}src/core/InputSystem.js`);
      r.input=new InputSystem({T:c.panel.T,scene:c.scene,camera:c.camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});
      r.src=r.input.xr[0];r.src.connected=true;r.src.grip.visible=false;
      r.tip=new r.THREE.Group();r.tip.jointRadius=.008;r.src.hand.add(r.tip);r.src.hand.joints={'index-finger-tip':r.tip};
      r.step=(point,hold)=>{r.src.selecting=hold;r.tip.position.copy(point);c.scene.updateMatrixWorld(true);r.input.update();c.tick(1);};
      if(mode==='mr'){
        const look=await import(performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js')));
        look.setBackdrop(null);c.scene.background=null;
      }
      c.tick(120);
    }, {root,mode});
    await capture(page, 'controls-'+mode+'-rest');
    for (const type of ['move','resize']) {
      const trace = result.traces[mode+type] = {};
      for (const state of ['hover','held','release','rest']) {
        trace[state] = await page.evaluate(({type,state})=>{
          const c=window.contour,r=window.replay,p=c.panel,l=p.levels[0],h=type==='move'?l.moves[1]:l.corners[1];
          const point=()=>h.localToWorld(new r.THREE.Vector3(0,0,h.t+.012));
          if(state==='rest'){r.src.connected=false;r.input.update();c.tick(90);r.src.connected=true;}
          else for(let i=0;i<30;i++)r.step(point(),state==='held');
          c.scene.updateMatrixWorld(true);
          const gl=c.renderer.getContext(),w=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
          const pixels=()=>{c.renderer.render(c.scene,c.camera);const data=new Uint8Array(w*height*4);gl.readPixels(0,0,w,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
          const on=pixels(),shown=h.affordance.visible;h.affordance.visible=false;const off=pixels();h.affordance.visible=shown;
          let changed=0,maxDelta=0;for(let i=0;i<on.length;i+=4){const delta=Math.max(...[0,1,2].map(k=>Math.abs(on[i+k]-off[i+k])));if(delta>2)changed++;maxDelta=Math.max(maxDelta,delta);}
          return {visible:shown,captured:p.controls.held?.handle===h,changed,maxDelta,dent:h.skin.uDent.value.w,glow:h.skin.uGlow.value,
            sheet:l.panel.skin.uniforms.uOpacity.value,title:l.title.fillOpacity,arrow:!!h.arrow,hasEnv:Object.hasOwn(h.body.children[0].material.defines,'ENVMAP_TYPE_CUBE_UV')};
        }, {type,state});
        await capture(page, `${mode}-${type}-${state}`);
      }
      check(`${mode} ${type} reveals actual pixels only on hover or held`,trace.hover.visible&&trace.hover.changed>20&&trace.held.changed>20&&!trace.rest.visible&&trace.rest.changed===0);
      check(`${mode} ${type} pinch gives local dent and glow`,trace.held.captured&&trace.held.dent>.01&&trace.held.glow>trace.hover.glow);
      check(`${mode} ${type} releases while keeping hover and restores opacity`,!trace.release.captured&&trace.release.visible&&trace.held.sheet<.95&&trace.rest.sheet>.999&&Math.abs(trace.held.title-1)<1e-8);
      check(`${mode} ${type} material and resize arrow match contract`,trace.held.hasEnv===(mode==='hdr')&&trace.held.arrow===(type==='resize'));
    }
    await page.close();
  }

  console.log(JSON.stringify(result,null,2));
  if(out) await writeFile(path.join(out,'controls.json'),JSON.stringify(result,null,2));
  if(result.checks.some(c=>!c.pass)||result.errors.length)process.exitCode=1;
}finally{if(browser)await browser.close();await server.close();}
