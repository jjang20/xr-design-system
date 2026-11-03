// Local pane-only deformation, independent of the twelve row-bubble slots.
// The depth is bounded by the caller's real pane thickness. Its edge fades
// to rest, so a front depression never opens the slab's silhouette seam.
export function paneDentHeight(x, y, { halfWidth, halfHeight, cornerRadius, edgeFade }, dent) {
  if (!dent || dent.depth <= 0) return 0;
  const qx=Math.abs(x)-halfWidth+cornerRadius,qy=Math.abs(y)-halfHeight+cornerRadius;
  const sd=Math.min(Math.max(qx,qy),0)+Math.hypot(Math.max(qx,0),Math.max(qy,0))-cornerRadius;
  const t=Math.max(0,Math.min(1,-sd/edgeFade)),fade=t*t*(3-2*t);
  if(fade<=0) return 0;
  return -dent.depth*Math.exp(-((x-dent.x)**2+(y-dent.y)**2)/(dent.radius**2))*fade;
}
export const PANE_DENT_GLSL=/* glsl */`
  #ifdef PANE_MANIPULATION
  uniform vec4 uPaneDent; // local centre xy, radius, positive depth
  uniform vec3 uPaneExtent; // half width/height and round corner radius
  uniform float uPaneEdgeFade, uPaneThickness;
  float paneDentH(vec2 p) {
    if(uPaneDent.w<=0.0) return 0.0;
    vec2 q=p-uPaneDent.xy;
    float edge=smoothstep(0.0,uPaneEdgeFade,-sdRoundRect(p,uPaneExtent.xy,uPaneExtent.z));
    return -uPaneDent.w*exp(-dot(q,q)/(uPaneDent.z*uPaneDent.z))*edge;
  }
  #else
  float paneDentH(vec2 p) { return 0.0; }
  #endif
`;
