'use strict';

/**
 * Persistence layer. Everything goes through window.pokepomo (Electron preload);
 * falls back to localStorage so the game can also be opened in a plain browser.
 */
(function () {
  const SAVE_VERSION = 1;
  const LS_KEY = 'pokepomo.save.v1';
  const bridge = window.pokepomo || null;
  const hasBridge = !!bridge && typeof bridge.readSave === 'function';

  function defaultSettings() {
    return {
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      sectionsPerCycle: 4,
      autoStartBreaks: true,
      autoStartFocus: false,
      soundOn: true,
      notifications: true,
      eggChance: 0.14,
    };
  }

  function emptyStats() {
    return {
      totalFocusMinutes: 0,
      totalSessions: 0,
      totalXp: 0,
      eggsFound: 0,
      eggsHatched: 0,
      evolutions: 0,
      startedAt: new Date().toISOString(),
    };
  }

  function newSave() {
    return {
      version: SAVE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: defaultSettings(),
      stats: emptyStats(),
      collection: [],
      trainer: { equippedUid: null, name: 'Trainer' },
      dex: { seen: [], caught: [] },
      timer: null,
      log: [],
    };
  }

  function migrate(save) {
    if (!save || typeof save !== 'object') return newSave();
    const base = newSave();
    const merged = {
      ...base,
      ...save,
      settings: { ...base.settings, ...(save.settings || {}) },
      stats: { ...base.stats, ...(save.stats || {}) },
      trainer: { ...base.trainer, ...(save.trainer || {}) },
      dex: { seen: [], caught: [], ...(save.dex || {}) },
      collection: Array.isArray(save.collection) ? save.collection : [],
      log: Array.isArray(save.log) ? save.log.slice(-200) : [],
    };
    merged.version = SAVE_VERSION;
    return merged;
  }

  async function load() {
    let data = null;
    if (hasBridge) {
      data = await bridge.readSave();
    } else {
      try {
        const rawString = localStorage.getItem(LS_KEY);
        data = rawString ? JSON.parse(rawString) : null;
      } catch (err) {
        console.warn('[store] localStorage read failed', err);
      }
    }
    return migrate(data);
  }

  async function save(state) {
    state.updatedAt = new Date().toISOString();
    if (hasBridge) return bridge.writeSave(state);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async function reset() {
    if (hasBridge && typeof bridge.resetSave === 'function') {
      await bridge.resetSave();
    } else {
      try { localStorage.removeItem(LS_KEY); } catch (_) { /* ignore */ }
    }
    return newSave();
  }

  async function path() {
    if (hasBridge && typeof bridge.savePath === 'function') return bridge.savePath();
    return 'localStorage';
  }

  window.Store = {
    SAVE_VERSION,
    defaultSettings,
    newSave,
    migrate,
    load,
    save,
    reset,
    path,
  };
})();
