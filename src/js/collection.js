'use strict';

/**
 * Collection: owned Pokemon, the active trainer, egg inventory and hatching.
 * A "mon" is a stored instance, distinct from the species in the Pokedex.
 */
(function () {
  const NAME_POOL = [
    'Ash', 'Misty', 'Brock', 'Gary', 'Erika', 'Sabrina', 'Lt. Surge',
    'Blaine', 'Koga', 'Giovanni', 'Lorelei', 'Bruno', 'Agatha', 'Lance',
  ];

  function uid() {
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `m_${stamp}${rand}`;
  }

  function nickname(speciesId) {
    const species = window.Pokedex.byIdGet(speciesId);
    const base = species ? window.Pokedex.displayName(species) : 'Pokemon';
    if (Math.random() < 0.5) {
      const n = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
      return `${n}'s ${base}`;
    }
    return base;
  }

  function createMon(speciesId) {
    const species = window.Pokedex.byIdGet(speciesId);
    return {
      uid: uid(),
      speciesId,
      nickname: nickname(speciesId),
      xp: 0,
      caughtAt: new Date().toISOString(),
      totalFocusMinutes: 0,
      sessions: 0,
      evolvedCount: 0,
      isEgg: false,
      lucky: false,
      speciesName: species ? species.name : 'unknown',
    };
  }

  function createEgg() {
    const pool = window.Pokedex.EGG_POOL;
    const species = pool[Math.floor(Math.random() * pool.length)];
    return {
      uid: uid(),
      speciesId: species.id,
      nickname: 'Egg',
      xp: 0,
      caughtAt: new Date().toISOString(),
      totalFocusMinutes: 0,
      sessions: 0,
      evolvedCount: 0,
      isEgg: true,
      hiddenSpeciesId: species.id,
      steps: 0,
      stepsNeeded: 6 + Math.floor(Math.random() * 7),
      lucky: Math.random() < 0.06,
      speciesName: 'egg',
    };
  }

  function rollEgg(settings) {
    const chance = settings?.eggChance ?? 0.14;
    if (Math.random() >= chance) return null;
    return createEgg();
  }

  function hatch(egg) {
    egg.isEgg = false;
    egg.speciesId = egg.hiddenSpeciesId || egg.speciesId;
    delete egg.hiddenSpeciesId;
    egg.nickname = nickname(egg.speciesId);
    egg.speciesName = window.Pokedex.byIdGet(egg.speciesId)?.name || 'unknown';
    return egg;
  }

  function party(state) {
    return state.collection.filter((m) => !m.isEgg);
  }

  function eggs(state) {
    return state.collection.filter((m) => m.isEgg);
  }

  function find(state, uidValue) {
    return state.collection.find((m) => m.uid === uidValue) || null;
  }

  function equipped(state) {
    return find(state, state.trainer?.equippedUid);
  }

  function equip(state, uidValue) {
    const mon = find(state, uidValue);
    if (!mon || mon.isEgg) return false;
    state.trainer.equippedUid = uidValue;
    return true;
  }

  function markDex(state, speciesId, caught) {
    if (!state.dex.seen.includes(speciesId)) state.dex.seen.push(speciesId);
    if (caught && !state.dex.caught.includes(speciesId)) state.dex.caught.push(speciesId);
  }

  function addMon(state, mon) {
    state.collection.push(mon);
    markDex(state, mon.speciesId, !mon.isEgg);
    if (!state.trainer.equippedUid && !mon.isEgg) {
      state.trainer.equippedUid = mon.uid;
    }
    return mon;
  }

  function allSpeciesOwned(state) {
    const set = new Set();
    for (const m of state.collection) {
      set.add(m.isEgg ? (m.hiddenSpeciesId || m.speciesId) : m.speciesId);
    }
    return set;
  }

  window.Collection = {
    NAME_POOL,
    uid,
    nickname,
    createMon,
    createEgg,
    rollEgg,
    hatch,
    party,
    eggs,
    find,
    equipped,
    equip,
    markDex,
    addMon,
    allSpeciesOwned,
  };
})();
