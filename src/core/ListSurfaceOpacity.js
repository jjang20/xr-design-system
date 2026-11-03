import * as THREE from 'three';

// Equal-layout list rows share the pane mesh. Keep their opacity state
// independent of the twelve geometric contact slots and recovering dents.
export class ListSurfaceOpacity {
  constructor(material, rows, targets) {
    if (!rows.length) throw new Error('ListSurfaceOpacity needs rows');
    if (!['idle','hover','pressed'].every(k => Number.isFinite(targets[k]) && targets[k]>=0 && targets[k]<=1))
      throw new Error('ListSurfaceOpacity needs explicit state opacity targets');
    this.material=material; this.rows=rows; this.targets={...targets};
    this.values=rows.map(()=>targets.idle);
    const first=rows[0], pitch=rows.length>1 ? first.position.y-rows[1].position.y : first.h;
    if (!(pitch>0) || rows.some((r,i)=>Math.abs(r.position.y-(first.position.y-i*pitch))>1e-7 ||
      ['w','h','embossRadius'].some(k=>Math.abs(r[k]-first[k])>1e-7) || Math.abs(r.position.x-first.position.x)>1e-7))
      throw new Error('ListSurfaceOpacity requires the existing equal-row layout');
    this.data=new Float32Array(rows.length);
    this.texture=new THREE.DataTexture(this.data,rows.length,1,THREE.RedFormat,THREE.FloatType);
    this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;
    this.texture.colorSpace=THREE.NoColorSpace;
    this.texture.generateMipmaps=false;
    material.uniforms.uListStateAlpha={value:this.texture};
    material.uniforms.uListStateMix={value:1};
    material.uniforms.uListRowLayout={value:new THREE.Vector3(first.position.y,pitch,rows.length)};
    material.uniforms.uListRowShape={value:new THREE.Vector4(first.position.x,first.w/2,first.h/2,first.embossRadius)};
    material.defines.LIST_STATE_ALPHA=''; material.needsUpdate=true;
    this.onDispose=()=>this.dispose(); material.addEventListener('dispose',this.onDispose);
    this.upload();
  }
  upload(){
    let dirty=false;
    for(let i=0;i<this.values.length;i++){
      const value=Math.fround(this.values[i]);
      if(this.data[i]!==value){this.data[i]=value;dirty=true;}
    }
    if(dirty || this.texture.version===0)this.texture.needsUpdate=true;
  }
  update(dt,{reduced=false,forceIdle=false}={}){
    let changed=false;
    this.rows.forEach((row,i)=>{
      const pressed=row.enabled && !row.disabled && (row.surfaceContact || row.press.pressed && (row.groupHoverAllowed !== false || row.groupContacted));
      const hovered=row.enabled && !row.disabled && row.hovered;
      const state=forceIdle?'idle':pressed?'pressed':hovered?'hover':'idle';
      const target=this.targets[state], current=this.values[i];
      // Existing enter/recovery durations, without the geometric spring's
      // overshoot or its stale dent object changing an input state.
      const duration=state==='idle'?row.press.recover:row.hoverIn;
      const mix=forceIdle?1:1-Math.exp(-Math.max(0,dt)*3/Math.max(.001,duration*(reduced ? .5 : 1)));
      const next=Math.abs(target-current)<1e-5?target:current+(target-current)*mix;
      if(next!==current){this.values[i]=next;changed=true;}
    });
    if(changed)this.upload();
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.texture.dispose();
    this.material.removeEventListener('dispose',this.onDispose);
  }
}
