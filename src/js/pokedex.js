'use strict';

/**
 * Thin, read-only helper layer over the generated Pokedex data
 * (src/js/pokedex-data.js -> window.__POKEDEX__).
 */
(function () {
  const raw = Array.isArray(window.__POKEDEX__) ? window.__POKEDEX__ : [];
  const list = raw.slice().sort((a, b) => a.id - b.id);

  const SPECIAL_NAMES = {
    'mr-mime': 'Mr. Mime',
    'farfetchd': "Farfetch'd",
    'nidoran-f': 'Nidoran\u2640',
    'nidoran-m': 'Nidoran\u2642',
  };

  const byId = new Map(list.map((p) => [p.id, p]));
  const byName = new Map(list.map((p) => [p.name, p]));

  const STARTERS = [1, 4, 7];
  const EGG_POOL = list.filter((p) => p.egg_pool);

  const TYPE_COLORS = {
    normal: '#a8a878',
    fighting: '#c03028',
    flying: '#a890f0',
    poison: '#a040a0',
    ground: '#e0c068',
    rock: '#b8a038',
    bug: '#a8b820',
    ghost: '#705898',
    steel: '#b8b8d0',
    fire: '#f08030',
    water: '#6890f0',
    grass: '#78c850',
    electric: '#f8d030',
    psychic: '#f85888',
    ice: '#98d8d8',
    dragon: '#7038f8',
    dark: '#705848',
    fairy: '#ee99ac',
  };

  function displayName(p) {
    if (!p) return '???';
    if (SPECIAL_NAMES[p.name]) return SPECIAL_NAMES[p.name];
    return p.name
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function sprite(id) {
    return `../assets/sprites/${id}.png`;
  }

  function eggSprite() {
    return '../assets/sprites/egg.png';
  }

  function typeColor(type) {
    return TYPE_COLORS[type] || '#888';
  }

  function statValue(base, level) {
    return Math.floor((base * 2 * level) / 100) + 5;
  }

  function hpValue(base, level) {
    return Math.floor((base * 2 * level) / 100) + level + 10;
  }

  function computeStats(species, level) {
    const s = species.stats;
    return {
      hp: hpValue(s.hp, level),
      attack: statValue(s.attack, level),
      defense: statValue(s.defense, level),
      sp_attack: statValue(s.sp_attack, level),
      sp_defense: statValue(s.sp_defense, level),
      speed: statValue(s.speed, level),
    };
  }

  window.Pokedex = {
    all: list,
    byId,
    byName,
    byIdGet: (id) => byId.get(id) || null,
    STARTERS,
    EGG_POOL,
    displayName,
    sprite,
    eggSprite,
    typeColor,
    computeStats,
  };
})();
