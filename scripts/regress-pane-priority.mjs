// Real InputSystem -> Q71 edge capture -> rendered pane. Desktop evidence only.
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=process.env.PANE_SOURCE??fileURLToPath(new URL('../',import.meta.url));
const out=process.env.PANE_OUT;if(!out)throw new Error('PANE_OUT required');await mkdir(out,{recursive:true});
const server=await createServer({root:root+'/demo',configFile:root+'/vite.config.js',logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0},plugins:[{name:'pane-case',configureServer(s){s.middlewares.use('/pane-case.html',(_q,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><style>body{margin:0;background:#30343b}canvas{display:block}</style>');});}}]});
const result={root,checks:[],cases:[],errors:[]};let browser;
const deadline=setTimeout(()=>{result.failure='180s deadline';browser?.close();},180000);
try{
 await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const reduced of [process.env.R14_REDUCED==='1'])for(const mode of [process.env.R14_ENV??'noenv']){
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:reduced?'reduce':'no-preference'});
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});await page.goto(server.resolvedUrls.local[0]+'pane-case.html');
  const data=await page.evaluate(async({root,mode})=>{
   const THREE=await import('/@fs/'+root+'/node_modules/three/build/three.module.js');
   const {createTokens,PackagingPanel,InputSystem}=await import('/@fs/'+root+'/src/index.js');
   const {setBackdrop}=await import('/@fs/'+root+'/src/core/look.js');
   const T=createTokens(await(await fetch('/@fs/'+root+'/tokens.json')).json());
   const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,800);renderer.setPixelRatio(1);renderer.toneMapping=THREE.NeutralToneMapping;document.body.append(renderer.domElement);
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1.6,.02,50);camera.position.set(0,0,.6);scene.add(camera);
   if(mode==='noenv')setBackdrop(null);else await(await import('/@fs/'+root+'/demo/backdrop.js')).loadBackdrop(renderer,scene,0);
   const p=new PackagingPanel(T,{title:'Catalog',items:[{label:'Sofas',items:[{label:'Chair'},{label:'Table'}]},{label:'Lighting'},{label:'Tables'}]});p.scale.setScalar(1.5);scene.add(p);const dt=1/60;
   for(let i=0;i<120;i++){scene.updateMatrixWorld(true);p.update(dt);}scene.updateMatrixWorld(true);
   const labels=[];p.traverse(o=>{if('textRenderInfo' in o)labels.push(o);});const until=performance.now()+15000;
   while(labels.some(t=>!t.textRenderInfo)){if(performance.now()>until)throw new Error('font deadline');await new Promise(r=>setTimeout(r,20));}
   const group=()=>new THREE.Group(),input=new InputSystem({T,scene,camera,renderer:{domElement:{addEventListener(){}},xr:{isPresenting:true,getController:group,getControllerGrip:group,getHand:group}}});input.xr.forEach(s=>{s.connected=false;s.grip.visible=false;});
   const s=input.xr[0],tip=new THREE.Group();tip.jointRadius=.008;s.hand.add(tip);s.hand.joints={'index-finger-tip':tip};
   const step=()=>{scene.updateMatrixWorld(true);input.update();p.update(dt);scene.updateMatrixWorld(true);};
   const h=p.levels[0].surface,l=p.levels[0],images={},traces=[];let at;
   const put=(pinch)=>{s.connected=true;s.hand.visible=true;s.selecting=pinch;tip.position.copy(at);};
   const capture=state=>{
    const u=h.skin.uniforms,trace={state,held:p.controls.held?.handle===h,sideBubbles:l.moves.length,dent:u.uPaneDent.value.toArray(),sheet:p.manipulationOpacity,position:p.position.toArray(),cornerCount:l.corners.length};
    for(const angle of [0,35]){camera.position.set(.6*Math.sin(angle*Math.PI/180),0,.6*Math.cos(angle*Math.PI/180));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);renderer.render(scene,camera);images[state+'-'+angle]=renderer.domElement.toDataURL();
     if(state==='hover'&&angle===0){
      const background=scene.background; scene.background=null; renderer.render(scene,camera);
      const gl=renderer.getContext(),row=l.rows[0],alphas=[];
      for(const x of [.25,.35,.4])for(const y of [-.2,0,.2]){
       const q=row.localToWorld(new THREE.Vector3(row.w*x,row.h*y,row.surfaceZ(new THREE.Vector3(row.w*x,row.h*y,0)))).project(camera),b=new Uint8Array(4);
       gl.readPixels(Math.round((q.x+1)*640),Math.round((q.y+1)*400),1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);alphas.push(b[3]);
      }scene.background=background; renderer.render(scene,camera);trace.hoverAlpha=alphas;trace.rowHover=l.rows.map(r=>({hover:r.hovered,pressed:r.press.pressed,bulge:r.bulge,contacts:r.contactDents?.length??0,dent:r.dz??0}));
     }

     if(state==='held'){
      const gl=renderer.getContext(),w=gl.drawingBufferWidth,height=gl.drawingBufferHeight,read=()=>{renderer.render(scene,camera);const data=new Uint8Array(w*height*4);gl.readPixels(0,0,w,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
      const on=read(),depth=u.uPaneDent.value.w;u.uPaneDent.value.w=0;const off=read();images['held-profile-off-'+angle]=renderer.domElement.toDataURL();u.uPaneDent.value.w=depth;
      let changed=0,max=0;for(let i=0;i<on.length;i+=4){const d=Math.max(...[0,1,2,3].map(k=>Math.abs(on[i+k]-off[i+k])));if(d>2)changed++;max=Math.max(max,d);}trace['profilePixels'+angle]={changed,max};
     }
    }traces.push(trace);
   };
   at=h.localToWorld(new THREE.Vector3(h.panel.w/2-.003/h.inputScale,0,h.frontZ+.012/h.inputScale));
   capture('rest');
   const original=at.clone(),row=l.rows[0];at=row.localToWorld(new THREE.Vector3(0,0,row.surfaceZ(new THREE.Vector3())+.04/h.inputScale));put(false);for(let i=0;i<60;i++)step();capture('hover');
   s.connected=false;for(let i=0;i<180;i++)step();at=original;put(false);for(let i=0;i<30;i++)step();capture('approach');put(true);for(let i=0;i<60;i++)step();capture('held');
   at.add(new THREE.Vector3(.035,.015,-.01));put(true);for(let i=0;i<10;i++)step();capture('moved');put(false);step();capture('release');s.connected=false;for(let i=0;i<180;i++)step();capture('restored');
   renderer.dispose();return{traces,images};
  },{root,mode});
  const name=mode+'-'+(reduced?'reduced':'normal');for(const[label,png]of Object.entries(data.images))await writeFile(`${out}/${name}-${label}.png`,Buffer.from(png.split(',')[1],'base64'));delete data.images;
  const hover=data.traces.find(x=>x.state==='hover');result.checks.push({name:name+' hover skin alpha below .75',pass:hover.rowHover[0].hover&&!hover.rowHover[0].pressed&&hover.rowHover[0].contacts===0&&Math.abs(hover.rowHover[0].dent)<1e-8&&hover.hoverAlpha.every(a=>a<190),observed:hover.hoverAlpha});const t=data.traces.filter(x=>x.state!=='hover');result.cases.push({name,...data});
  result.checks.push({name:name+' explicit edge pinch and release',pass:!t[0].held&&!t[1].held&&t[1].dent[3]===0&&t[2].held&&t[2].dent[3]>0&&!t[4].held&&t[5].dent[3]<1e-8});
  result.checks.push({name:name+' whole stack movement and retained corners',pass:t.every(x=>x.sideBubbles===0&&x.cornerCount===2)&&Math.abs(t[3].position[0]-.035)<1e-6&&Math.abs(t[3].position[2]+.01)<1e-6&&t[2].sheet<.95&&t[5].sheet>.999});
  result.checks.push({name:name+' actual opt-in profile contributes pixels',pass:[0,35].every(a=>t[2]['profilePixels'+a].changed>0)});
  await page.close();
 }
 result.checks.push({name:'browser errors',pass:result.errors.length===0});if(result.checks.some(x=>!x.pass))process.exitCode=1;
}catch(e){result.failure=String(e.stack??e);process.exitCode=1;}finally{clearTimeout(deadline);await browser?.close();await server.close();result.cleanedUp=true;await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
