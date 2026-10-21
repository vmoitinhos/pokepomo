'use strict';

/**
 * XP / level / evolution engine.
 *
 * Level curve uses the canonical Pokemon "medium fast" (cubic) growth rate:
 * the total accumulated XP required to *reach* level L is L^3. So a Pokemon
 * reaches level 16 at 4096 XP, level 100 at 1,000,000 XP.
 * Time is converted to XP through `baseXpPerFocus`, scaled by the species'
 * base_experience, so rarer species grow a little slower.
 */
(function () {
  const MAX_LEVEL = 100;

  const XP_TUNING = {
    baseXpPerFocus: 18,
    breakXpPerMinute: 1,
    ivyBonusPerSection: 12,
    cycleBonusMultiplier: 1.5,
  };

  function xpForLevel(level) {
    if (level <= 1) return 0;
    return Math.floor(Math.pow(level, 3));
  }

  function totalXpToReach(level) {
    return xpForLevel(level);
  }

  function speciesFactor(species) {
    const be = species?.base_experience || 64;
    return 1 + (be - 64) / 220;
  }

  function focusXp(species, minutes, sectionIndex) {
    const f = speciesFactor(species);
    const base = minutes * XP_TUNING.baseXpPerFocus * f;
    const streak = (sectionIndex || 0) * XP_TUNING.ivyBonusPerSection;
    return Math.max(1, Math.round(base + streak));
  }

  function breakXp(minutes) {
    return Math.max(0, Math.round(minutes * XP_TUNING.breakXpPerMinute));
  }

  function cycleXp(totalCycleFocusXp) {
    return Math.round(totalCycleFocusXp * (XP_TUNING.cycleBonusMultiplier - 1));
  }

  function levelFromXp(totalXp) {
    const xp = Math.max(0, Math.floor(totalXp));
    let level = Math.floor(Math.cbrt(xp));
    while (level + 1 <= MAX_LEVEL && xpForLevel(level + 1) <= xp) level += 1;
    while (level > 1 && xpForLevel(level) > xp) level -= 1;
    if (level < 1) level = 1;

    if (level >= MAX_LEVEL) {
      return {
        level: MAX_LEVEL,
        intoLevel: 0,
        needNext: 0,
        progress: 1,
        xpAtLevelStart: xpForLevel(MAX_LEVEL),
      };
    }

    const start = xpForLevel(level);
    const next = xpForLevel(level + 1);
    const needNext = next - start;
    const intoLevel = xp - start;
    return {
      level,
      intoLevel,
      needNext,
      progress: needNext > 0 ? Math.min(1, intoLevel / needNext) : 1,
      xpAtLevelStart: start,
    };
  }

  function xpToNextLevel(mon) {
    const info = levelFromXp(mon.xp);
    return info.needNext - info.intoLevel;
  }

  /**
   * Decide whether a Pokemon can evolve, and into what.
   * Level-up evolutions are automatic; item/trade evolutions are unlocked by
   * reaching `itemEvolutionLevel` (see below) so the player is never hard-stuck.
   */
  function itemEvolutionLevel(species) {
    if (species?.evolves_at) return species.evolves_at;
    const id = species?.id || 1;
    return 22 + (id % 12);
  }

  function pendingEvolution(mon) {
    const species = window.Pokedex.byIdGet(mon.speciesId);
    if (!species) return null;
    const info = levelFromXp(mon.xp);
    const targets = species.evolves_to || [];
    if (!targets.length) return null;

    if (species.evolves_at && info.level >= species.evolves_at) {
      return { toId: targets[0], level: species.evolves_at, kind: 'level' };
    }
    if (!species.evolves_at) {
      const gate = itemEvolutionLevel(species);
      if (info.level >= gate) {
        return { toId: targets[0], level: gate, kind: 'item' };
      }
    }
    return null;
  }

  function applyEvolution(mon, evolution) {
    mon.speciesId = evolution.toId;
    mon.evolvedCount = (mon.evolvedCount || 0) + 1;
    mon.history = mon.history || [];
    mon.history.push({
      type: 'evolution',
      toId: evolution.toId,
      at: new Date().toISOString(),
    });
    return mon;
  }

  window.Engine = {
    MAX_LEVEL,
    XP_TUNING,
    xpForLevel,
    totalXpToReach,
    speciesFactor,
    focusXp,
    breakXp,
    cycleXp,
    levelFromXp,
    xpToNextLevel,
    itemEvolutionLevel,
    pendingEvolution,
    applyEvolution,
  };
})();
