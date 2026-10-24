// R5 material checks: actual RGBA output and HDR/no-env glow.
// Desktop shader evidence is separate from physical Quest acceptance.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.env.MATERIAL_CHECK_OUT;
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

  const page=await open('part=dock&visible=7');
  await capture(page,'plate-hdr');
  result.traces.plate=await page.evaluate(async()=>{
    const c=window.contour,r=window.replay,d=c.dock;
    const look=await import(performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js')));
    const target=new r.THREE.WebGLRenderTarget(1280,800);c.renderer.setRenderTarget(target);
    const [sx,sz]=d.arc(d.length/2-d.pad/2,0);
    const at=d.shelf.localToWorld(new r.THREE.Vector3(sx,0,sz)).project(c.camera);
    const x=Math.round((at.x+1)*640),y=Math.round((at.y+1)*400),pixel=new Uint8Array(4);
    const read=()=>{c.renderer.render(c.scene,c.camera);c.renderer.readRenderTargetPixels(target,x,y,1,1,pixel);return [...pixel];};
    const hdrPixel=read();look.setBackdrop(null);c.scene.background=null;c.renderer.setClearAlpha(0);
    const visible=read();d.base.visible=false;const hidden=read();d.base.visible=true;
    const hasRoom=d.base.material.uniforms.uHasRoom.value;
    c.scene.background=null;
    c.renderer.setRenderTarget(null);target.dispose();
    return {visible,hidden,hdrPixel,hasRoom,position:[x,y]};
  });
  check('passthrough plate keeps alpha translucent on its exposed end',result.traces.plate.visible[3]>0&&result.traces.plate.visible[3]<128&&result.traces.plate.hidden[3]===0);

  check('opaque room background remains covered',result.traces.plate.hdrPixel[3]===255);
  await capture(page,'plate-mr');await page.close();
  const panelPage=await open('component=packaging&layout=quest');
  for(const mode of ['hdr','mr']){
    result.traces[mode+'InnerGlow']=await panelPage.evaluate(async mode=>{
      const c=window.contour,r=window.replay,p=c.panel,l=p.levels[0],u=l.panel.skin.uniforms;
      if(mode==='mr'){
        const look=await import(performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/src/core/look.js')));
        look.setBackdrop(null);c.scene.background=null;
      }
      const gl=c.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
      const read=()=>{c.renderer.render(c.scene,c.camera);const data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
      u.uContactGlow.value=1;const on=read();u.uContactGlow.value=0;const off=read();u.uContactGlow.value=1;
      let changed=0,maxDelta=0;for(let i=0;i<on.length;i+=4){const d=Math.max(...[0,1,2].map(k=>Math.abs(on[i+k]-off[i+k])));if(d>2)changed++;maxDelta=Math.max(maxDelta,d);}
      const samples=[.001,.007,.025].map(inset=>{
        const at=l.panel.localToWorld(new r.THREE.Vector3(-l.panel.w/2+inset,0,l.panel.t)).project(c.camera);
        const pixel=(Math.round((at.y+1)*h/2)*w+Math.round((at.x+1)*w/2))*4;
        return {inset,delta:Math.max(...[0,1,2].map(k=>Math.abs(on[pixel+k]-off[pixel+k])))};
      });
      return {changed,maxDelta,samples,hasEnv:Object.hasOwn(l.panel.skin.defines,'ENVMAP_TYPE_CUBE_UV')};
    },mode);
    const glow=result.traces[mode+'InnerGlow'];
    check(mode+' shader environment matches the fixture',glow.hasEnv===(mode==='hdr'));
    check(mode+' palm inner glow changes rendered pixels',glow.changed>100&&glow.maxDelta>5);
    check(mode+' glow fades from the inner edge toward the centre',glow.samples[1].delta>glow.samples[2].delta);
    await capture(panelPage,'palm-inner-'+mode);
  }
  await panelPage.close();

  console.log(JSON.stringify(result,null,2));
  if(out) await writeFile(path.join(out,'materials.json'),JSON.stringify(result,null,2));
  if(result.checks.some(c=>!c.pass)||result.errors.length)process.exitCode=1;
}finally{if(browser)await browser.close();await server.close();}
