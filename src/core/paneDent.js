// Local pane-only deformation, independent of the twelve row-bubble slots.
// A local bend translates front, bevel and back together. It preserves local-Z front/back separation and has Jacobian determinant one, including at the silhouette.
// Keeping the edge fixed hid the feedback exactly where the pane is held.
export function paneDentHeight(x, y, _profile, dent) {
  if (!dent || dent.depth <= 0) return 0;
  return -dent.depth*Math.exp(-((x-dent.x)**2+(y-dent.y)**2)/(dent.radius**2));
}
export const PANE_DENT_GLSL=/* glsl */`
  #ifdef PANE_MANIPULATION
  uniform vec4 uPaneDent; // local centre xy, radius, positive depth
  uniform vec3 uPaneExtent; // half width/height and round corner radius
  uniform float uPaneEdgeFade, uPaneThickness;
  float paneDentH(vec2 p) {
    if(uPaneDent.w<=0.0) return 0.0;
    vec2 q=p-uPaneDent.xy;
    return -uPaneDent.w*exp(-dot(q,q)/(uPaneDent.z*uPaneDent.z));
  }
  #else
  float paneDentH(vec2 p) { return 0.0; }
  #endif
`;
