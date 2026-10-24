import { springTo, prefersReducedMotion } from './spring.js';
import { DEFAULTS } from './defaults.js';

// Additional contact feedback never dispatches actions or acquires a grab.
// One item keeps its execution owner; other fingertips deform that same skin.
// Different items have independent PressModels and therefore independent actions.
export function contactFeedback(object, probes, primaryId, dt, sample) {
  const states = object.contactFeedbackStates ??= new Map();
  const seen = new Set();
  for (const probe of probes) {
    if (probe.id === primaryId || probe.kind !== 'poke' || probe.canPress === false) continue;
    const hit = sample(probe);
    if (!hit || hit.depth <= 0) continue;
    let state = states.get(probe.id);
    if (!state) { state = { id: probe.id, spring: { x: 0, v: 0 } }; states.set(probe.id, state); }
    Object.assign(state, hit); seen.add(probe.id);
  }
  const D = DEFAULTS.look.emboss.dent;
  for (const [id, state] of states) {
    if (id === primaryId) { states.delete(id); continue; }
    springTo(state.spring, seen.has(id) ? state.depth : 0, D.response, prefersReducedMotion() ? 1 : D.damping, dt);
    if (!seen.has(id) && Math.abs(state.spring.x) < 1e-6 && Math.abs(state.spring.v) < 1e-5) states.delete(id);
  }
  // Two hands expose at most ten tips. Keep the nine additional contacts
  // bounded, preferring current contacts to recovering ones.
  object.contactDents = [...states.values()].sort((a,b) => Number(seen.has(b.id))-Number(seen.has(a.id)))
    .slice(0,9).map(s => ({ ...s, depth: s.spring.x, glow: Math.max(0, Math.min(1, s.spring.x / s.maxDepth)) }));
  return object.contactDents;
}

export function writeBubbleContacts(uniforms, contacts, radius) {
  uniforms.uExtraCount.value = contacts.length;
  for (let i=0; i<9; i++) {
    const c=contacts[i];
    uniforms.uExtraDent.value[i].set(c?.x ?? 0,c?.y ?? 0,c?.z ?? 1,(c?.depth ?? 0)/radius);
    uniforms.uExtraGlow.value[i]=c?.glow ?? 0;
  }
}
