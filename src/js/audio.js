'use strict';

/**
 * Minimal chiptune-style sound effects generated with the Web Audio API.
 * No external audio assets needed.
 */
(function () {
  let ctx = null;
  let enabled = true;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setEnabled(v) { enabled = !!v; }

  function tone(freq, start, dur, type, gainPeak) {
    const c = ensureCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, c.currentTime + start);
    gain.gain.setValueAtTime(0.0001, c.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(gainPeak || 0.08, c.currentTime + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + dur + 0.02);
  }

  function sequence(notes, vol) {
    if (!enabled) return;
    notes.forEach((n) => tone(n[0], n[1], n[2], n[3], n[4] || vol));
  }

  const Sfx = {
    setEnabled,
    unlock: () => ensureCtx(),
    click: () => sequence([[660, 0, 0.05]]),
    startFocus: () => sequence([[523, 0, 0.08], [659, 0.08, 0.08], [784, 0.16, 0.14]]),    startBreak: () => sequence([[784, 0, 0.08], [659, 0.08, 0.08], [523, 0.16, 0.16]]),
    complete: () => sequence([[659, 0, 0.09], [784, 0.09, 0.09], [988, 0.18, 0.09], [1319, 0.27, 0.22]]),
    xpGain: () => sequence([[880, 0, 0.05], [1175, 0.05, 0.07]]),
    levelUp: () => sequence([
      [523, 0, 0.09], [659, 0.09, 0.09], [784, 0.18, 0.09],
      [1047, 0.27, 0.12], [1319, 0.39, 0.24],
    ], 0.09),
    evolve: () => sequence([
      [392, 0, 0.1], [523, 0.1, 0.1], [659, 0.2, 0.1],
      [784, 0.3, 0.1], [988, 0.4, 0.1], [1175, 0.5, 0.3],
    ]),
    eggFound: () => sequence([[988, 0, 0.07], [1047, 0.07, 0.07], [1175, 0.14, 0.18]]),
    hatch: () => sequence([
      [659, 0, 0.08], [784, 0.08, 0.08], [988, 0.16, 0.08],
      [1319, 0.24, 0.3],
    ]),
    error: () => sequence([[200, 0, 0.12], [160, 0.12, 0.16]]),
  };

  window.Sfx = Sfx;
})();
