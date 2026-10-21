'use strict';

/**
 * Pomodoro state machine.
 *
 * Modes: idle -> focus -> shortBreak -> focus -> ... -> longBreak -> idle
 * Emits:
 *   'tick'      { mode, remainingMs, totalMs, progress }
 *   'complete'  { mode, minutes, sectionIndex, isLongBreak }
 *   'change'    { mode, sectionIndex }
 */
(function () {
  const MODES = { IDLE: 'idle', FOCUS: 'focus', SHORT: 'shortBreak', LONG: 'longBreak' };

  function createTimer() {
    let listeners = {};
    let state = {
      mode: MODES.IDLE,
      running: false,
      remainingMs: 0,
      totalMs: 0,
      realMs: 0,
      sectionIndex: 0,
      endedAt: null,
    };
    let handle = null;
    let lastTick = 0;

    function on(evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
      return () => off(evt, fn);
    }

    function off(evt, fn) {
      listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn);
    }

    function emit(evt, payload) {
      (listeners[evt] || []).forEach((f) => {
        try { f(payload); } catch (err) { console.error('[timer]', err); }
      });
    }

    function durations(settings) {
      return {
        focus: settings.focusMin * 60 * 1000,
        short: settings.shortBreakMin * 60 * 1000,
        long: settings.longBreakMin * 60 * 1000,
        perCycle: settings.sectionsPerCycle,
      };
    }

    function durationFor(mode, settings) {
      const d = durations(settings);
      if (mode === MODES.FOCUS) return d.focus;
      if (mode === MODES.SHORT) return d.short;
      if (mode === MODES.LONG) return d.long;
      return 0;
    }

    function snapshot() {
      return {
        mode: state.mode,
        running: state.running,
        remainingMs: state.remainingMs,
        totalMs: state.totalMs,
        sectionIndex: state.sectionIndex,
        progress: state.totalMs ? 1 - state.remainingMs / state.totalMs : 0,
        endsAt: state.endedAt,
      };
    }

    function clearHandle() {
      if (handle) { clearInterval(handle); handle = null; }
    }

    function stayAlive() {
      clearHandle();
      handle = setInterval(loop, 250);
    }

    function loop() {
      if (!state.running) return;
      const now = Date.now();
      state.remainingMs = Math.max(0, state.endedAt - now);
      emit('tick', snapshot());
      if (state.remainingMs <= 0) complete();
    }

    function complete() {
      clearHandle();
      state.running = false;
      state.remainingMs = 0;
      const finished = state.mode;
      const minutes = Math.round(state.realMs / 60000);
      const isLongBreak = finished === MODES.LONG;
      const payload = {
        mode: finished,
        minutes,
        sectionIndex: state.sectionIndex,
        isLongBreak,
      };
      state.mode = MODES.IDLE;
      state.totalMs = 0;
      state.realMs = 0;
      state.endedAt = null;
      emit('complete', payload);
      emit('change', { mode: state.mode, sectionIndex: state.sectionIndex });
      emit('tick', snapshot());
    }

    function startFocus(settings) {
      state.mode = MODES.FOCUS;
      state.realMs = durationFor(MODES.FOCUS, settings);
      state.totalMs = state.realMs / speed();
      state.remainingMs = state.totalMs;
      state.endedAt = Date.now() + state.remainingMs;
      state.running = true;
      emit('change', { mode: state.mode, sectionIndex: state.sectionIndex });
      emit('tick', snapshot());
      stayAlive();
    }

    function startBreak(settings) {
      const d = durations(settings);
      const isLong = (state.sectionIndex % d.perCycle) === 0 && state.sectionIndex > 0;
      state.mode = isLong ? MODES.LONG : MODES.SHORT;
      state.realMs = durationFor(state.mode, settings);
      state.totalMs = state.realMs / speed();
      state.remainingMs = state.totalMs;
      state.endedAt = Date.now() + state.remainingMs;
      state.running = true;
      emit('change', { mode: state.mode, sectionIndex: state.sectionIndex });
      emit('tick', snapshot());
      stayAlive();
    }

    function speed() {
      return Number(window.__POKEPOMO_SPEED__) > 0 ? Number(window.__POKEPOMO_SPEED__) : 1;
    }

    function pause() {
      if (!state.running) return;
      state.remainingMs = Math.max(0, state.endedAt - Date.now());
      state.running = false;
      state.endedAt = null;
      clearHandle();
      emit('tick', snapshot());
    }

    function resume() {
      if (state.running || state.mode === MODES.IDLE) return;
      state.endedAt = Date.now() + state.remainingMs;
      state.running = true;
      stayAlive();
      emit('tick', snapshot());
    }

    function skip() {
      clearHandle();
      state.running = false;
      state.remainingMs = 0;
      state.endedAt = null;
      state.mode = MODES.IDLE;
      state.totalMs = 0;
      state.realMs = 0;
      emit('change', { mode: state.mode, sectionIndex: state.sectionIndex });
      emit('tick', snapshot());
    }

    function bumpSection() { state.sectionIndex += 1; }

    function resetSection() { state.sectionIndex = 0; }

    function restore(saved) {
      if (!saved) return;
      state.sectionIndex = saved.sectionIndex || 0;
      if (saved.running && saved.endsAt) {
        state.mode = saved.mode;
        state.realMs = saved.realMs || saved.totalMs || 0;
        state.totalMs = saved.totalMs || state.realMs / speed();
        state.endedAt = saved.endsAt;
        state.remainingMs = Math.max(0, saved.endsAt - Date.now());
        if (state.remainingMs > 0) {
          state.running = true;
          stayAlive();
        } else {
          state.running = false;
          state.mode = MODES.IDLE;
          state.remainingMs = 0;
          state.totalMs = 0;
          state.realMs = 0;
          state.endedAt = null;
        }
      }
      emit('tick', snapshot());
    }

    function persist() {
      if (!state.running) return { running: false, sectionIndex: state.sectionIndex };
      return {
        mode: state.mode,
        running: true,
        totalMs: state.totalMs,
        realMs: state.realMs,
        endsAt: state.endedAt,
        sectionIndex: state.sectionIndex,
      };
    }

    return {
      MODES,
      on,
      off,
      snapshot,
      startFocus,
      startBreak,
      pause,
      resume,
      skip,
      bumpSection,
      resetSection,
      restore,
      persist,
      get mode() { return state.mode; },
      get running() { return state.running; },
      get sectionIndex() { return state.sectionIndex; },
      set sectionIndex(v) { state.sectionIndex = v; },
    };
  }

  window.createTimer = createTimer;
  window.TimerModes = MODES;
})();
