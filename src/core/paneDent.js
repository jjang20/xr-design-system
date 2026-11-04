// Local pane-only deformation, independent of the twelve row-bubble slots.
// Preserve the accepted front bend; pinch may also compress the back/bevel
// towards that front within a compact local footprint. Rest/outside stay fixed.
export function paneDentHeight(x, y, _profile, dent) {
  if (!dent || dent.depth <= 0) return 0;
  return -dent.depth*Math.exp(-((x-dent.x)**2+(y-dent.y)**2)/(dent.radius**2));
}
export function paneThinAmount(x,y,dent) {
  if(!dent?.thin || !(dent.radius>0))return 0;
  const q=Math.max(0,1-((x-dent.x)**2+(y-dent.y)**2)/(dent.radius**2));
  return dent.thin*q*q*q;
}
export function paneDeformedZ(x,y,z,profile,dent) {
  return z+paneDentHeight(x,y,profile,dent)+((dent?.frontZ??z)-z)*paneThinAmount(x,y,dent);
}
export const PANE_DENT_GLSL=/* glsl */`
  #ifdef PANE_MANIPULATION
  uniform vec4 uPaneDent; // local centre xy, radius, positive depth
  uniform vec2 uPaneGlow; // local radius, linear light amount; independent of Push
  uniform vec2 uPaneThin; // bounded compression fraction, actual rest front Z
  uniform vec3 uPaneExtent; // half width/height and round corner radius
  uniform float uPaneEdgeFade, uPaneThickness;
  float paneDentH(vec2 p) {
    if(uPaneDent.w<=0.0) return 0.0;
    vec2 q=p-uPaneDent.xy;
    return -uPaneDent.w*exp(-dot(q,q)/(uPaneDent.z*uPaneDent.z));
  }
  float paneThinAt(vec2 p) {
    vec2 q=p-uPaneDent.xy;
    float k=max(0.0,1.0-dot(q,q)/(uPaneDent.z*uPaneDent.z));
    return uPaneThin.x*k*k*k;
  }
  float paneShift(vec2 p,float restZ) {
    return paneDentH(p)+(uPaneThin.y-restZ)*paneThinAt(p);
  }
  #else
  float paneDentH(vec2 p) { return 0.0; }
  #endif
`;
