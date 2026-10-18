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
