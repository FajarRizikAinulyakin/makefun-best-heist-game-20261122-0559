// Procedural sound only: short WebAudio oscillator blips, no audio files, no network.
// Everything is guarded so a browser without audio (or a headless screenshot run) simply
// stays silent instead of throwing.

export function createAudio() {
  let context = null;
  let muted = false;

  function ensure() {
    if (context !== null) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    } catch {
      context = null;
    }
    return context;
  }

  function tone(freq, seconds, type, gain, when) {
    if (muted) return;
    const ctx = ensure();
    if (ctx === null) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const start = ctx.currentTime + (when || 0);
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + seconds + 0.02);
    } catch {
      // Sound is garnish; a failure here must never break the game.
    }
  }

  return {
    toggleMute() {
      muted = !muted;
      return muted;
    },
    pickup() { tone(880, 0.12, 'sine', 0.12); tone(1318, 0.14, 'sine', 0.1, 0.07); },
    coin() { tone(1568, 0.08, 'triangle', 0.1); },
    crackTick() { tone(220, 0.05, 'square', 0.04); },
    cracked() { tone(523, 0.12, 'sine', 0.12); tone(784, 0.16, 'sine', 0.12, 0.1); tone(1046, 0.22, 'sine', 0.12, 0.2); },
    spotted() { tone(196, 0.18, 'sawtooth', 0.09); tone(147, 0.22, 'sawtooth', 0.09, 0.12); },
    caught() { tone(110, 0.5, 'sawtooth', 0.14); tone(82, 0.6, 'sawtooth', 0.14, 0.15); },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'sine', 0.12, i * 0.11));
    },
    click() { tone(660, 0.06, 'sine', 0.08); },
  };
}
