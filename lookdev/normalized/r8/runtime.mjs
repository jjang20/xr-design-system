// Owns only this harness's Vite server and launched Chrome process.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {runWithCleanup,runWithDeadline} from './guards/lifecycle.mjs';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const childAlive=child=>!!child&&child.exitCode===null&&child.signalCode===null;
const errorJson=e=>e?{name:e.name,message:e.message,code:e.code,cause:e.cause}:null;
export const portOpen=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});let done=false;const finish=v=>{if(done)return;done=true;s.destroy();resolve(v);};s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.setTimeout(600,()=>finish(true));});
const bounded=(label,timeoutMs,fn)=>runWithDeadline({label,timeoutMs,operation:fn});

// This is an isolated harness guard, not a product shader/input mutation.
function installCaptureGuard({expires,handshake=false}){
  if(globalThis.__xrCaptureGuard){globalThis.__xrCaptureGuard.expires=expires;globalThis.__xrCaptureGuard.closed=false;return;}
  const g=globalThis.__xrCaptureGuard={expires,closed:false,attempts:0,refused:0};
  const check=()=>{g.attempts++;if(g.closed||Date.now()>=g.expires){g.refused++;throw new Error('XR_CAPTURE_DEADLINE_CLOSED');}};
  for(const key of ['toDataURL','toBlob']){const original=HTMLCanvasElement.prototype[key];HTMLCanvasElement.prototype[key]=function(...args){check();return original.apply(this,args);};}
  if(globalThis.OffscreenCanvas){const original=OffscreenCanvas.prototype.convertToBlob;OffscreenCanvas.prototype.convertToBlob=function(...args){check();return original.apply(this,args);};}
  for(const ctor of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext])if(ctor){const original=ctor.prototype.readPixels;ctor.prototype.readPixels=function(...args){check();return original.apply(this,args);};}
  if(handshake){g.expires=0;g.closed=true;g.leaseReady=false;globalThis.__xrCaptureLease().then(expiry=>{g.expires=expiry;g.closed=false;g.leaseReady=true;}).catch(()=>{g.closed=true;});}
}

export async function withBrowserSession({source,adapter,out,port,work,writeSummary,
  workTimeoutMs=240000,reportTimeoutMs=5000,cleanupTimeoutMs=8000,faults={}}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid owned port');
  source=await fs.realpath(source);adapter=await fs.realpath(adapter);out=await fs.realpath(out);
  if(await portOpen(port))throw Error('Requested port already has a listener; ownership not acquired');
  const lifecyclePath=path.join(out,'lifecycle.json');
  try{await fs.access(lifecyclePath);throw Error('Refusing reused lifecycle output');}catch(e){if(e.code!=='ENOENT')throw e;}
  const dependencies=await fs.realpath(path.join(source,'node_modules'));
  const {createServer}=await import(pathToFileURL(path.join(dependencies,'vite/dist/node/index.js')));
  const {chromium}=await import(pathToFileURL(path.join(dependencies,'playwright-core/index.mjs')));
  let server,browserServer,browser,ownedChild=null,processId=null,workScope,phaseScope,open=true,setupComplete=false;
  let acquisition=null,acquisitionPending=false,acquisitionError=null;
  let serverAcquisition=null,serverAcquisitionPending=false,serverListen=null,serverListenPending=false,serverAcquisitionError=null;
  const pages=new Set(),startedAt=new Date().toISOString(),events=[],fallbacks=[];
  let expires=Date.now()+workTimeoutMs;
  const assertActive=()=>{if(!open)throw Error('XR_SESSION_CLOSED');workScope?.assertActive();phaseScope?.assertActive();};
  const guardPages=async expiry=>{expires=expiry;for(const page of pages)if(!page.isClosed()){
    await page.evaluate(installCaptureGuard,{expires});
  }};
  const closeGuard=()=>{open=false;for(const page of pages){if(!page.isClosed())page.evaluate(()=>{if(window.__xrCaptureGuard)window.__xrCaptureGuard.closed=true;}).catch(()=>{});}};
  const guarded=async fn=>{assertActive();const value=await fn();assertActive();return value;};
  const killOwned=async()=>{if(!childAlive(ownedChild))return;ownedChild.kill('SIGTERM');for(let i=0;i<20&&childAlive(ownedChild);i++)await delay(20);if(childAlive(ownedChild)){ownedChild.kill('SIGKILL');for(let i=0;i<20&&childAlive(ownedChild);i++)await delay(20);}if(childAlive(ownedChild))throw Error('Owned Chrome ChildProcess remains alive');};
  const gracefulBudget=Math.max(50,Math.min(4000,cleanupTimeoutMs/2));
  const closeLateAcquisition=async acquired=>{
    events.push({event:'late-acquisition-cleanup-start',pid:processId});
    try{await bounded('late browser close',Math.min(1000,gracefulBudget),async()=>{if(faults.lateBrowserClose)await faults.lateBrowserClose();await acquired.close();});}
    catch(e){fallbacks.push({resource:'late-browser',reason:errorJson(e)});}
    finally{await killOwned();events.push({event:'late-acquisition-cleanup-end',pid:processId,childExited:!childAlive(ownedChild)});}
  };
  const closeActualServer=async()=>{if(!server)return;server.httpServer?.closeAllConnections();await bounded('actual server close',gracefulBudget,()=>server.close());};
  const closeLateServer=async stage=>{
    events.push({event:'late-server-cleanup-start',stage});
    try{await bounded('late server close',Math.min(1000,gracefulBudget),async()=>{if(faults.lateServerClose)await faults.lateServerClose();await server.close();});}
    catch(e){fallbacks.push({resource:'late-server',reason:errorJson(e)});await closeActualServer();}
    events.push({event:'late-server-cleanup-end',stage,listening:!!server.httpServer?.listening});
  };
  const closeBrowser=async()=>{
    closeGuard();let first=null;
    if(acquisitionPending){try{await bounded('pending browser acquisition drain',cleanupTimeoutMs*.65,()=>acquisition);}
      catch(e){first=e;fallbacks.push({resource:'pending-acquisition',reason:errorJson(e)});}}
    try{await bounded('browser graceful close',gracefulBudget,async()=>{if(faults.browserClose)await faults.browserClose();if(browserServer)await browserServer.close();if(browser)await browser.close();});}
    catch(e){first=e;fallbacks.push({resource:'browser',reason:errorJson(e)});}
    finally{await killOwned();}
    if(first)throw first;
  };
  const closeServer=async()=>{
    let first=null;
    for(const [label,pending,promise] of [['creation',serverAcquisitionPending,serverAcquisition],['listen',serverListenPending,serverListen]]){
      if(pending)try{await bounded('pending server '+label+' drain',cleanupTimeoutMs*.45,()=>promise);}
      catch(e){first=e;fallbacks.push({resource:'pending-server-'+label,reason:errorJson(e)});}
    }
    try{await bounded('server graceful close',gracefulBudget,async()=>{if(faults.serverClose)await faults.serverClose();if(server)await server.close();});}
    catch(e){first=e;fallbacks.push({resource:'server',reason:errorJson(e)});}
    finally{await closeActualServer();}
    if(first)throw first;
  };
  const outcome=await runWithCleanup({workTimeoutMs,reportTimeoutMs,cleanupTimeoutMs,
    work:async scope=>{
      workScope=scope;expires=Date.now()+workTimeoutMs;
      serverAcquisitionPending=true;
      serverAcquisition=createServer({configFile:false,root:path.join(source,'demo'),cacheDir:path.join(out,'vite-cache'),logLevel:'error',
        server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[source,dependencies,adapter]}}}).then(async created=>{
          if(faults.serverDeliveryDelayMs)await delay(faults.serverDeliveryDelayMs);
          server=created;events.push({event:'server-acquired'});
          if(!open||scope.signal.aborted)await closeLateServer('creation');return created;
        }).catch(e=>{serverAcquisitionError=errorJson(e);throw e;}).finally(()=>{serverAcquisitionPending=false;});
      await serverAcquisition;assertActive();
      serverListenPending=true;
      serverListen=(async()=>{
        // The delay fault models a listen call whose internal initialization
        // finishes after the work deadline, not a newly authorized restart.
        if(faults.serverListenDelayMs)await delay(faults.serverListenDelayMs);
        await server.listen();events.push({event:'server-listened'});
        if(!open||scope.signal.aborted)await closeLateServer('listen');
      })().finally(()=>{serverListenPending=false;});
      await serverListen;assertActive();
      // A late launch resolves to a handle that is immediately closed, not orphaned.
      acquisitionPending=true;
      acquisition=chromium.launchServer({executablePath:process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,timeout:Math.max(1,Math.min(expires-Date.now(),10000)),
        args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}).then(async acquired=>{
          if(faults.acquireDeliveryDelayMs)await delay(faults.acquireDeliveryDelayMs);
          browserServer=acquired;ownedChild=acquired.process();processId=ownedChild.pid;events.push({event:'chrome-acquired',pid:processId});
          if(!open||scope.signal.aborted)await closeLateAcquisition(acquired);
          return acquired;
        }).catch(e=>{acquisitionError=errorJson(e);throw e;}).finally(()=>{acquisitionPending=false;});
      const acquired=await acquisition;assertActive();
      browser=await chromium.connect(acquired.wsEndpoint());assertActive();setupComplete=true;
      const facade={newPage:async options=>{
        const page=await guarded(()=>browser.newPage(options));pages.add(page);
        // Every document obtains the current phase lease from the host. Multiple
        // init scripts would have undefined ordering and could restore an old lease.
        await page.exposeBinding('__xrCaptureLease',()=>{assertActive();return expires;});
        await page.addInitScript(installCaptureGuard,{expires:0,handshake:true});await page.evaluate(installCaptureGuard,{expires});
        const goto=page.goto.bind(page);page.goto=(...args)=>guarded(async()=>{const result=await goto(...args);await page.waitForFunction(()=>window.__xrCaptureGuard?.leaseReady===true,null,{timeout:Math.max(1,expires-Date.now())});return result;});
        const screenshot=page.screenshot.bind(page);page.screenshot=(...args)=>guarded(()=>screenshot(...args));return page;
      }};
      const ctx={browser:facade,server,assertActive,step:guarded,capture:guarded,
        writeFile:async(file,data,opts)=>{const resolved=path.resolve(file);if(!resolved.startsWith(out+path.sep))throw Error('Output outside owned run directory');return guarded(()=>fs.writeFile(resolved,data,opts));},
        phase:async({label,timeoutMs},fn)=>{
          assertActive();if(phaseScope)throw Error('Nested phases are not supported');const parentExpiry=expires;
          try{return await runWithDeadline({label,timeoutMs,operation:async phase=>{
            phaseScope=phase;await guardPages(Math.min(parentExpiry,Date.now()+timeoutMs));assertActive();
            const value=await guarded(fn);await guardPages(parentExpiry);assertActive();return value;
          }});}
          catch(e){closeGuard();throw e;}
          finally{phaseScope=null;}
        }
      };
      return await work(ctx);
    },
    writeSummary:async report=>{closeGuard();return writeSummary(report);},
    cleanups:[{name:'browser',run:closeBrowser},{name:'server',run:closeServer}]
  });
  // This readback is separate from a callback claiming it closed resources.
  const resourceReadback={ownedChromePid:processId,chromeAlive:acquisitionPending?null:childAlive(ownedChild),
    acquisitionPending,acquisitionError,ownedChildExitCode:ownedChild?.exitCode??null,ownedChildSignal:ownedChild?.signalCode??null,
    serverAcquisitionPending,serverListenPending,serverAcquisitionError,
    ownedPort:port,portListening:(serverAcquisitionPending||serverListenPending)?null:await portOpen(port),setupComplete};
  const receipt={schemaVersion:1,startedAt,finishedAt:new Date().toISOString(),source,adapter,out,
    harnessCaptureGuard:true,workTimeoutMs,reportTimeoutMs,cleanupTimeoutMs,events,fallbacks,resourceReadback,
    ok:outcome.ok&&resourceReadback.chromeAlive===false&&!resourceReadback.acquisitionPending&&resourceReadback.portListening===false&&!serverAcquisitionPending&&!serverListenPending,
    primaryError:errorJson(outcome.primaryError),reportError:errorJson(outcome.reportError),
    cleanupResults:outcome.cleanupResults.map(r=>({...r,error:errorJson(r.error)}))};
  try{await bounded('lifecycle evidence write',reportTimeoutMs,()=>fs.writeFile(lifecyclePath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'}));}
  catch(e){receipt.evidenceWriteError=errorJson(e);receipt.ok=false;}
  return {...outcome,ok:receipt.ok,lifecycle:receipt};
}
