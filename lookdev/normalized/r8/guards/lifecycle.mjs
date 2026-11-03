// Browser-independent async guards. They cannot forcibly stop a browser process.
export class DeadlineError extends Error {
  constructor(label,timeoutMs){super(label+' exceeded '+timeoutMs+' ms');this.name='DeadlineError';this.code='DEADLINE_EXCEEDED';this.operation=label;this.timeoutMs=timeoutMs;}
}
export class LifecycleClosedError extends Error {
  constructor(label){super(label+' lifecycle is closed');this.name='LifecycleClosedError';this.code='LIFECYCLE_CLOSED';}
}
const need=(ok,message)=>{if(!ok)throw new TypeError(message);};
const duration=n=>need(Number.isFinite(n)&&n>0&&n<=2147483647,'timeoutMs must be a positive bounded duration');
const asError=(thrown,operation)=>thrown instanceof Error?thrown:new Error(operation+' threw a non-Error value',{cause:thrown});

/** One deadline covers the entire callback, including every font await.
 * All capture/side-effect continuations must enter scope.capture/step. A naked
 * callback that ignores the scope is not cancellable by Promise.race.
 */
export async function runWithDeadline({label='evaluation',timeoutMs,operation}){
  duration(timeoutMs);need(typeof operation==='function','operation must be a function');
  const controller=new AbortController(),expires=performance.now()+timeoutMs;
  const timeout=new DeadlineError(label,timeoutMs);let open=true,timer;
  const expire=()=>{open=false;if(!controller.signal.aborted)controller.abort(timeout);return timeout;};
  const assertActive=()=>{
    if(performance.now()>=expires)throw expire();
    if(!open||controller.signal.aborted)throw controller.signal.reason??new LifecycleClosedError(label);
  };
  const invoke=async fn=>{need(typeof fn==='function','guarded step must be a function');assertActive();const value=await fn({signal:controller.signal});assertActive();return value;};
  const scope=Object.freeze({signal:controller.signal,assertActive,step:invoke,capture:invoke});
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(expire()),timeoutMs);});
  // A handler remains attached to the losing promise, including late rejection.
  const task=Promise.resolve().then(()=>{assertActive();return operation(scope);}).then(value=>{assertActive();return value;});
  try{return await Promise.race([task,deadline]);}
  finally{
    open=false;clearTimeout(timer);
    if(!controller.signal.aborted)controller.abort(new LifecycleClosedError(label));
  }
}

/** Report writing and every cleanup have independent bounded lifecycles.
 * Returns all Error objects; callers must inspect ok. Timed-out close means
 * closure is UNCONFIRMED, not that the browser/server was actually terminated.
 */
export async function runWithCleanup({work,writeSummary,cleanups,workTimeoutMs,reportTimeoutMs,cleanupTimeoutMs}){
  for(const n of [workTimeoutMs,reportTimeoutMs,cleanupTimeoutMs])duration(n);
  need(typeof work==='function'&&typeof writeSummary==='function','work and writeSummary must be functions');
  need(Array.isArray(cleanups)&&cleanups.every(c=>c&&typeof c.name==='string'&&c.name&&typeof c.run==='function'),'cleanups must be named functions');
  need(new Set(cleanups.map(c=>c.name)).size===cleanups.length,'cleanup names must be unique');
  let value,primaryError=null,reportError=null;const cleanupResults=[];
  try{
    try{value=await runWithDeadline({label:'work',timeoutMs:workTimeoutMs,operation:work});}
    catch(error){primaryError=asError(error,'work');}
    try{await runWithDeadline({label:'summary',timeoutMs:reportTimeoutMs,operation:scope=>writeSummary({value,primaryError},scope)});}
    catch(error){reportError=asError(error,'summary');}
  }finally{
    for(const cleanup of cleanups){
      try{await runWithDeadline({label:'cleanup:'+cleanup.name,timeoutMs:cleanupTimeoutMs,operation:cleanup.run});cleanupResults.push({name:cleanup.name,status:'completed',error:null});}
      catch(error){cleanupResults.push({name:cleanup.name,status:error instanceof DeadlineError?'timed-out':'failed',error:asError(error,'cleanup:'+cleanup.name)});}
    }
  }
  return {ok:primaryError===null&&reportError===null&&cleanupResults.every(c=>c.status==='completed'),value,primaryError,reportError,cleanupResults};
}
