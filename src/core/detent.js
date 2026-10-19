import { lerp } from './easing.js';

// Index of the detent band a value sits in. Crossing into a new band ticks.
export const detentIndex = (value, interval) => Math.floor(value / interval + 1e-9);

// Contact shadow grows with push depth (feedback.shadow.press.curve = proportional-to-push).
export const shadowAt = (push, scale, opMin, opMax) => ({
  scale: 1 + push * scale,
  opacity: lerp(opMin, opMax, push),
});
