// CSS-style cubic-bezier(x1, y1, x2, y2) as a function of progress 0..1.
// Easing tokens are stored as these four numbers.
export function cubicBezier([x1, y1, x2, y2]) {
  const bez = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 30; i++) {
      t = (lo + hi) / 2;
      if (bez(x1, x2, t) < x) lo = t; else hi = t;
    }
    return bez(y1, y2, t);
  };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
