import {InputSystem} from '../../src/core/InputSystem.js';
import {HierarchyInput} from './HierarchyInput.js';

// Fixture-local extension: DockIcon's sense/update pair is not Button's
// updatePress API. Preserve each public component's own acquisition model.
export class DockContentInput extends HierarchyInput {
  rememberCaptures(samples){
    this.captures??=new Map();
    for(const target of this.buttons){
      if(!target.press.pressed){this.captures.delete(target);continue;}
      if(this.captures.get(target)?.owner===target.pressOwner)continue;
      const probe=samples.get(target)?.find(p=>p.id===target.pressOwner);
      this.captures.set(target,{owner:target.pressOwner,kind:probe?.kind??'unknown'});
    }
  }
  update(){
    // Material pressKind can retain an old ray throughout recovery. The
    // acquired probe kind, not that visual state, controls loss semantics.
    const poseLive=(id,source)=>id===source.id?!!this.input.tipOf(source)
      :source.hand.visible&&!!source.hand.joints?.[id.slice(source.id.length+1)]?.visible;
    for(const source of this.input?.xr??[])if(this.replacementBlocked.has(source.id)){
      source.state={};source.resetBlocked=true;
      for(const target of this.buttons)target.probes=target.probes.filter(p=>p.id!==source.id&&!p.id.startsWith(source.id+':'));
    }
    for(const target of this.buttons){
      const capture=this.captures?.get(target);
      if(!target.press.pressed||capture?.kind!=='poke')continue;
      const source=this.input?.xr.find(s=>capture.owner===s.id||capture.owner.startsWith(s.id+':'));
      if(source&&(!source.connected||!poseLive(capture.owner,source))){this.lostNear.set(capture.owner,source);source.state={};source.resetBlocked||=source.selecting;}
    }
    for(const [id,source]of this.lostNear){
      if(source.connected&&poseLive(id,source)){this.lostNear.delete(id);continue;}
      for(const target of this.buttons)target.probes=target.probes.filter(p=>p.id!==id);
    }
    for(const source of this.input?.xr??[]){
      if(source.connected&&source.ray.visible&&source.ray.matrixWorld.elements.every(Number.isFinite))continue;
      let removed=false;
      for(const target of this.buttons)target.probes=target.probes.filter(p=>{const stale=p.kind==='ray'&&p.id===source.id;removed||=stale;return !stale;});
      if(removed){source.state={};source.resetBlocked||=source.selecting;}
    }
  }
  primeRay(source,ray){
    if(source.state.wasPressed)return;
    this.input.rayStep(source,ray,false,0,this.input.collect().items);
    for(const target of this.buttons){
      if(!target.press.pressed&&target.probes.some(p=>p.id===source.id)){
        target.sense?.();target.update(0);
      }else target.probes=target.probes.filter(p=>p.id!==source.id);
    }
  }
  cancelTarget(target){
    this.captures?.delete(target);
    const pending=target.consumeProbes();
    target.press.update(0,null,false);target.clearHoverFeedback?.();
    if(target.sense){target.sense();target.update(0);}
    for(const probe of pending)target.feed(probe);
  }
  cancelMouse(){
    const mouse=this.input.mouse;
    Object.assign(mouse,{pressed:false,state:{},upPending:false,looking:false});
    for(const target of this.buttons){
      target.probes=target.probes.filter(p=>p.id!==mouse.id);
      if(target.press.pressed&&target.pressOwner===mouse.id)this.cancelTarget(target);
    }
  }
  cancelSource(source){
    if(this.semanticHeld.has(source.id))this.replacementBlocked.add(source.id);
    for(const target of this.buttons){
      target.probes=target.probes.filter(p=>p.id!==source.id&&!p.id.startsWith(source.id+':'));
      if(target.press.pressed&&(target.pressOwner===source.id||target.pressOwner?.startsWith(source.id+':')))this.cancelTarget(target);
    }
    source.state={};source.resetBlocked||=source.selecting||this.replacementBlocked.has(source.id);
  }
  dispose(){super.dispose();this.captures?.clear();}
}

// InputSystem has no dispose API. Track only listeners added synchronously
// during construction on this entry's canvas/controllers; never clear a shared
// emitter or another entry's listeners.
export function createOwnedDockInput(options){
  const bindings=[],restores=[];
  const targets=[options.renderer.domElement,...[0,1].flatMap(i=>[options.renderer.xr.getController(i),options.renderer.xr.getControllerGrip(i),options.renderer.xr.getHand(i)])];
  for(const target of new Set(targets)){
    const own=Object.hasOwn(target,'addEventListener'),add=target.addEventListener;
    target.addEventListener=function(type,callback,config){bindings.push(()=>target.removeEventListener(type,callback,config));return add.call(target,type,callback,config);};
    restores.push(()=>{if(own)target.addEventListener=add;else delete target.addEventListener;});
  }
  let input;
  try{input=new InputSystem(options);}catch(error){for(const remove of bindings)remove();throw error;}finally{for(const restore of restores)restore();}
  let disposed=false;
  input.dispose=()=>{if(disposed)return;disposed=true;for(const remove of bindings.splice(0))remove();for(const s of input.xr){s.line.geometry.dispose();s.line.material.dispose();for(const object of [s.ray,s.grip,s.hand])object.removeFromParent();}};
  return input;
}
