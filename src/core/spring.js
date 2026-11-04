// Critically damped spring (anchor.follow.damping = critical): reaches the
// target as fast as possible without overshoot or wobble. omega is the
// natural frequency in rad/s (anchor.follow.frequency).
export function springStep(state, target, omega, dt) {
  // Exact solution for a critically damped spring over dt, stable at any frame rate.
  const x0 = state.x - target;
  const v0 = state.v;
  const e = Math.exp(-omega * dt);
  const x = (x0 + (v0 + omega * x0) * dt) * e;
  const v = (v0 - omega * (v0 + omega * x0) * dt) * e;
  state.x = target + x;
  state.v = v;
  return state.x;
}

// Wrap an angle difference into -PI..PI.
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// A spring by Apple's two numbers (WWDC 2018, Designing Fluid Interfaces):
// response, about how long it takes in seconds, and damping ratio (1 = no
// overshoot, lower = bouncier). Keeps the state's velocity, so a gesture's
// speed carries into it. Substepped for stability.
export function springTo(state, target, response, damping, dt) {
  const w = 2 * Math.PI / response;
  for (let i = 0, n = 4, h = dt / n; i < n; i++) {
    state.v += (-w * w * (state.x - target) - 2 * damping * w * state.v) * h;
    state.x += state.v * h;
  }
  return state.x;
}

// The viewer asked for less motion (prefers-reduced-motion). The media query
// is live, so reading it each frame applies a changed setting at once. False
// outside a browser.
let reducedQuery;
export function prefersReducedMotion() {
  reducedQuery ??= globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  return reducedQuery?.matches ?? false;
}
