// Motion rules from Emil Kowalski's design-engineering practice, applied to
// the motion tokens. A still render can't show motion, so this part of the
// bar is checked by code instead of by eye.
import { getNode } from './tokens.mjs';

// CSS's built-in curves. They're too weak to feel intentional; strong
// custom curves give the punch (e.g. ease-out 0.23, 1, 0.32, 1).
const BUILT_IN = {
  'ease': [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};
export const STRONG = {
  'ease-out': [0.23, 1, 0.32, 1],
  'ease-in-out': [0.77, 0, 0.175, 1],
  'drawer': [0.32, 0.72, 0, 1],
};

const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
const builtInName = c => Object.entries(BUILT_IN).find(([, v]) => same(c, v))?.[0];
// Starts slow: the first control point hugs the time axis.
const startsSlow = ([x1, y1]) => x1 >= 0.3 && y1 <= 0.1;

// What each animated token does. "enter" = something appears; "move" =
// something already visible moves or morphs; "release" = the system
// responding after the user lets go; "feedback" = a frequent micro-state.
const ROLES = {
  'motion.hover.in': 'feedback',
  'motion.expand.dropdown': 'enter',
  'material.density.soft.recover': 'release',
  'material.density.firm.recover': 'release',
  'material.density.rigid.recover': 'release',
};

const ms = (t, path) => {
  try { return getNode(t, path).$value.value; } catch { return null; }
};
const curve = (t, path) => {
  try { return getNode(t, path).$value; } catch { return null; }
};

export function motionFindings(t) {
  const out = [];
  const add = (path, level, rule, detail) => out.push({ path, level, rule, detail });

  for (const [base, role] of Object.entries(ROLES)) {
    const isRecover = base.endsWith('.recover');
    const durPath = isRecover ? base : `${base}.duration`;
    const d = ms(t, durPath);
    if (d != null) {
      if (d > 300) add(durPath, 'fail', 'ui-under-300ms', `${d} ms. UI motion should stay under 300 ms; slower feels unresponsive.`);
      if (role === 'release' && d > 200) add(durPath, 'warn', 'release-is-snappy', `${d} ms. When the system responds to a release, aim for 200 ms or less.`);
      if (role === 'feedback' && d > 160) add(durPath, 'warn', 'feedback-is-quick', `${d} ms. Hover and press feedback happen tens of times a day; keep them at 100-160 ms.`);
    }
    if (isRecover) continue;
    const c = curve(t, `${base}.easing`);
    if (!Array.isArray(c)) continue;
    const name = builtInName(c);
    if (startsSlow(c) && role !== 'move') add(`${base}.easing`, 'fail', 'no-ease-in', `[${c}] starts slow. ${role === 'enter' ? 'Something entering' : 'UI feedback'} should start fast: use a strong ease-out like [${STRONG['ease-out']}].`);
    else if (name) add(`${base}.easing`, 'fail', 'strong-curve', `[${c}] is CSS's built-in ${name}, which is too weak to feel intentional. Use a strong custom curve like [${STRONG[name] ?? STRONG['ease-out']}].`);
  }

  const press = curve(t, 'motion.press.down');
  if (press !== 'follow-input') add('motion.press.down', 'fail', 'press-follows-input', `Press is "${press}". Press feedback must be immediate and track the finger.`);
  return out;
}
