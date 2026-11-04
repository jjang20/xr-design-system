import { springStep, wrapAngle } from './spring.js';

// dock.magnify.falloff = cosine: scale = 1 + (max - 1) * cos(d / radius * pi/2).
export function magnifyScale(d, radius, max) {
  if (d >= radius) return 1;
  return 1 + (max - 1) * Math.cos((d / radius) * Math.PI / 2);
}

// Lazy follow on yaw: waits `delay` seconds of a sustained turn beyond
// `threshold`, then springs to the body direction. Pure state machine.
export class LazyFollow {
  constructor({ delay, omega, threshold, settle = (2 * Math.PI) / 180 }) {
    Object.assign(this, { delay, omega, threshold, settle });
    this.yaw = { x: 0, v: 0 };
    this.target = 0;
    this.waited = 0;
    this.following = false;
    this.started = false;
  }
  update(dt, bodyYaw) {
    if (!this.started) {
      this.started = true;
      this.yaw.x = this.target = bodyYaw;
      return this.yaw.x;
    }
    const off = Math.abs(wrapAngle(bodyYaw - this.yaw.x));
    if (!this.following) {
      this.waited = off > this.threshold ? this.waited + dt : 0;
      if (this.waited >= this.delay) this.following = true;
    }
    if (this.following) {
      this.target = this.yaw.x + wrapAngle(bodyYaw - this.yaw.x);
      if (off < this.settle && Math.abs(this.yaw.v) < 0.05) { this.following = false; this.waited = 0; }
    }
    return springStep(this.yaw, this.target, this.omega, dt);
  }
}
