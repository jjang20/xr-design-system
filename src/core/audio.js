// Detent tick: a short click, since hands have no haptics (feedback.detent.audio.*).
let ctx = null;

export function unlockAudio() {
  if (typeof window === 'undefined') return;
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

export function playTick(gainDb, lengthS, pitchHz = 2400) {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(pitchHz, t0);
  gain.gain.setValueAtTime(10 ** (gainDb / 20), t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + lengthS);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + lengthS + 0.01);
}
