// The press of a Contour object, independent of rendering.
//
// - Press starts when the fingertip touches the front face (input.poke.pressTrigger).
// - Going down, depth follows the finger exactly, capped at firmness.pressDepth x t
//   (motion.press.behavior = followInput: no animation).
// - Coming back up, the material springs back at its own pace: a full-depth
//   recovery takes exactly motion.recovery duration, with an ease-out. A soft object
//   lags behind a retreating finger; a rigid one keeps up.
// - Release requires retreat hysteresis. When a physical separation is
//   supplied, a contact must also have occurred and the finger must leave
//   the stable contact surface; early proximity alone cancels.
import { clamp } from './easing.js';

export class PressModel {
  constructor({ thickness, pressRatio, recover, release }) {
    this.maxDepth = pressRatio * thickness;
    this.recover = recover;
    this.release = release;
    this.depth = 0;
    this.pressed = false;
    this.deepest = 0;
    this.lastPenetration = null; // null = no finger seen last frame
  }

  // Move depth back toward `floor` along an ease-out curve that takes
  // `recover` seconds from full depth to zero: depth = max * (1 - s)^3.
  springBack(dt, floor) {
    if (this.depth <= floor || this.maxDepth <= 0) return;
    const k = Math.cbrt(this.depth / this.maxDepth) - dt / this.recover;
    this.depth = Math.max(floor, k > 0 ? this.maxDepth * k ** 3 : 0);
  }

  // penetration: metres the finger is past the resting front face
  //   (negative = in front; -Infinity = a ray that isn't pressing; null = no finger).
  // inside: whether the finger is within the face outline.
  // Returns 'press', 'release', 'cancel' or null.
  update(dt, penetration, inside, separation = null) {
    let event = null;
    // Only a finger arriving from the front can start a press, not one that
    // first appears already behind the face (reaching in from the back or side).
    const fromFront = this.lastPenetration !== null && this.lastPenetration < 0;
    this.lastPenetration = penetration;
    if (penetration === null) penetration = -Infinity;

    if (!this.pressed && inside && penetration >= 0 && fromFront) {
      this.pressed = true;
      this.deepest = 0;
      this.contacted = separation === null || separation <= 0;
      event = 'press';
    }
    const target = this.pressed ? clamp(penetration, 0, this.maxDepth) : 0;
    if (target >= this.depth) this.depth = target;
    else this.springBack(dt, target);

    if (this.pressed) {
      this.contacted ||= separation !== null && separation <= 0;
      // Release follows physical retreat even after visual travel is capped.
      this.deepest = Math.max(this.deepest, penetration);
      if (!inside) {
        this.pressed = false;
        event = 'cancel';
      } else if (penetration < this.deepest - this.release && (separation === null || separation > 0)) {
        this.pressed = false;
        event = this.contacted ? 'release' : 'cancel';
      }
    }
    return event;
  }

  // 0..1 of the available press travel.
  get amount() {
    return this.maxDepth > 0 ? this.depth / this.maxDepth : 0;
  }
}
