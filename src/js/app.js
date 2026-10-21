'use strict';

(function () {
  const P = window.Pokedex;
  const E = window.Engine;
  const C = window.Collection;
  const S = window.Store;

  const els = {};
  let state = null;
  let timer = null;
  let currentView = 'timer';
  let saveTimerHandle = null;
  let sessionFocusXp = 0;

  const $ = (id) => document.getElementById(id);

  function cacheEls() {
    [
      'screen-starter', 'screen-app', 'starter-cards',
      'equipped-sprite', 'equipped-name', 'equipped-types', 'equipped-level',
      'equipped-xp-fill', 'equipped-xp-text', 'equipped-stats', 'sprite-stage',
      'mode-label', 'clock', 'progress-fill', 'section-dots', 'section-caption',
      'btn-start', 'btn-pause', 'btn-skip', 'xp-float',
      'egg-list', 'mini-team', 'team-grid', 'dex-grid', 'dex-count',
      'pill-sessions', 'pill-focus',
      'save-path', 'btn-reset',
      'modal-backdrop', 'modal', 'toast-wrap',
    ].forEach((id) => { els[id] = $(id); });

    els.tabs = Array.from(document.querySelectorAll('.tab'));
    els.views = {
      timer: $('view-timer'),
      team: $('view-team'),
      dex: $('view-dex'),
      settings: $('view-settings'),
    };
  }

  /* ---------------------------------------------------------- toasts */

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    els['toast-wrap'].appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    }, 2600);
  }

  function shellNotify(title, body) {
    if (!state.settings.notifications) return;
    if (window.pokepomo?.notify) window.pokepomo.notify(title, body);
  }

  /* ---------------------------------------------------------- time format */

  function fmtClock(ms) {
    const total = Math.ceil(ms / 1000);
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  /* ---------------------------------------------------------- save */

  function queueSave() {
    clearTimeout(saveTimerHandle);
    saveTimerHandle = setTimeout(() => { S.save(state); }, 300);
  }

  async function saveNow() {
    clearTimeout(saveTimerHandle);
    return S.save(state);
  }

  /* ---------------------------------------------------------- starter screen */

  function renderStarters() {
    els['starter-cards'].innerHTML = '';
    P.STARTERS.forEach((id) => {
      const sp = P.byIdGet(id);
      const card = document.createElement('div');
      card.className = 'starter-card';
      card.innerHTML = `
        <img class="sprite" src="${P.sprite(id)}" alt="${P.displayName(sp)}" draggable="false" />
        <div class="sc-name">${P.displayName(sp)}</div>
        <div class="sc-types">${typeTags(sp.types)}</div>
        <div class="sc-desc">${sp.genus}</div>
      `;
      card.addEventListener('click', () => pickStarter(id));
      els['starter-cards'].appendChild(card);
    });
  }

  function typeTags(types) {
    return types
      .map((t) => `<span class="type" style="background:${P.typeColor(t)}">${t}</span>`)
      .join('');
  }

  async function pickStarter(id) {
    window.Sfx?.click();
    const mon = C.createMon(id);
    C.addMon(state, mon);
    C.equip(state, mon.uid);
    markSeenAround(mon.speciesId);
    await saveNow();
    showModal({
      title: 'A new journey begins!',
      sprite: P.sprite(id),
      types: P.byIdGet(id).types,
      body: `<b>${P.displayName(P.byIdGet(id))}</b> joined your team.<br>Focus to earn XP and grow together.`,
      actions: [{ label: 'LET\u2019S GO', primary: true, onClick: () => { closeModal(); enterApp(true); } }],
    });
  }

  function markSeenAround(speciesId) {
    C.markDex(state, speciesId, true);
  }

  /* ---------------------------------------------------------- render: equipped */

  function renderEquipped() {
    const mon = C.equipped(state);
    const sprite = els['equipped-sprite'];

    if (!mon) {
      sprite.style.visibility = 'hidden';
      els['equipped-name'].textContent = 'No Pokemon equipped';
      els['equipped-types'].innerHTML = '';
      els['equipped-level'].textContent = 'Lv.\u2014';
      els['equipped-xp-fill'].style.width = '0%';
      els['equipped-xp-text'].textContent = '\u2014';
      els['equipped-stats'].innerHTML = '';
      return;
    }

    const sp = P.byIdGet(mon.speciesId);
    const info = E.levelFromXp(mon.xp);

    sprite.style.visibility = 'visible';
    sprite.src = P.sprite(mon.speciesId);
    sprite.alt = P.displayName(sp);
    els['equipped-name'].textContent = mon.nickname;
    els['equipped-types'].innerHTML = typeTags(sp.types);
    els['equipped-level'].textContent = `Lv.${info.level}`;

    if (info.needNext > 0) {
      els['equipped-xp-fill'].style.width = `${(info.progress * 100).toFixed(1)}%`;
      els['equipped-xp-text'].textContent = `${info.intoLevel} / ${info.needNext} XP`;
    } else {
      els['equipped-xp-fill'].style.width = '100%';
      els['equipped-xp-text'].textContent = 'MAX LEVEL';
    }

    const stats = P.computeStats(sp, info.level);
    const labels = {
      hp: 'HP', attack: 'ATK', defense: 'DEF',
      sp_attack: 'SPA', sp_defense: 'SPD', speed: 'SPE',
    };
    els['equipped-stats'].innerHTML = Object.keys(labels)
      .map((k) => `<div class="st"><span>${labels[k]}</span><b>${stats[k]}</b></div>`)
      .join('');
  }

  /* ---------------------------------------------------------- render: eggs + party */

  function renderSide() {
    const eggList = C.eggs(state);
    els['egg-list'].innerHTML = '';
    if (!eggList.length) {
      const n = document.createElement('div');
      n.className = 'empty-note';
      n.textContent = 'No eggs yet. Focus sections sometimes turn one up.';
      els['egg-list'].appendChild(n);
    } else {
      eggList.forEach((egg) => {
        const remaining = Math.max(0, egg.stepsNeeded - egg.steps);
        const row = document.createElement('div');
        row.className = 'egg-item';
        if (remaining <= 1) row.classList.add('hint-glow');
        row.innerHTML = `
          <img class="sprite" src="${P.eggSprite()}" alt="egg" draggable="false" />
          <div>
            <div>${remaining <= 0 ? 'HATCHING...' : `${remaining} section${remaining === 1 ? '' : 's'} left`}</div>
            <div style="color:var(--ink-dim)">${egg.lucky ? 'nursery care' : 'incubating'}</div>
          </div>
        `;
        els['egg-list'].appendChild(row);
      });
    }

    const party = C.party(state);
    els['mini-team'].innerHTML = '';
    if (!party.length) {
      const n = document.createElement('div');
      n.className = 'empty-note';
      n.textContent = 'No Pokemon in your party.';
      els['mini-team'].appendChild(n);
      return;
    }
    party.forEach((mon) => {
      const sp = P.byIdGet(mon.speciesId);
      const info = E.levelFromXp(mon.xp);
      const equippedUid = state.trainer.equippedUid;
      const row = document.createElement('div');
      row.className = 'mini-mon' + (mon.uid === equippedUid ? ' active' : '');
      row.innerHTML = `
        <img class="sprite" src="${P.sprite(mon.speciesId)}" alt="" draggable="false" />
        <div class="mm-info">
          <div class="mm-name">${mon.nickname}</div>
          <div class="mm-sub">Lv.${info.level} \u00b7 ${sp.types.join('/')}</div>
        </div>
      `;
      row.addEventListener('click', () => {
        C.equip(state, mon.uid);
        window.Sfx?.click();
        queueSave();
        renderAll();
      });
      els['mini-team'].appendChild(row);
    });
  }

  /* ---------------------------------------------------------- render: team view */

  function renderTeam() {
    const grid = els['team-grid'];
    grid.innerHTML = '';
    const party = C.party(state);
    const eggList = C.eggs(state);

    if (!party.length && !eggList.length) {
      grid.innerHTML = '<div class="empty-note">Your team is empty.</div>';
      return;
    }

    party.forEach((mon) => {
      const sp = P.byIdGet(mon.speciesId);
      const info = E.levelFromXp(mon.xp);
      const isEquipped = mon.uid === state.trainer.equippedUid;
      const card = document.createElement('div');
      card.className = 'mon-card' + (isEquipped ? ' equipped' : '');
      card.innerHTML = `
        <img class="sprite" src="${P.sprite(mon.speciesId)}" alt="" draggable="false" />
        <div class="mc-name">${mon.nickname}</div>
        <div class="mc-sub">${P.displayName(sp)} \u00b7 Lv.${info.level}</div>
        <div class="mc-sub">${info.intoLevel}/${info.needNext || '\u2014'} XP \u00b7 ${mon.totalFocusMinutes} min focused</div>
        <div class="mc-sub">${mon.evolvedCount} evolution${mon.evolvedCount === 1 ? '' : 's'}</div>
        <div class="mc-actions">
          <button class="btn ${isEquipped ? '' : 'primary'}" data-equip ${isEquipped ? 'disabled' : ''}>${isEquipped ? 'EQUIPPED' : 'EQUIP'}</button>
          <button class="btn ghost" data-detail>DETAILS</button>
        </div>
      `;
      card.querySelector('[data-equip]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        C.equip(state, mon.uid);
        window.Sfx?.click();
        queueSave();
        renderAll();
      });
      card.querySelector('[data-detail]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        showMonDetail(mon);
      });
      grid.appendChild(card);
    });

    eggList.forEach((egg) => {
      const remaining = Math.max(0, egg.stepsNeeded - egg.steps);
      const card = document.createElement('div');
      card.className = 'mon-card';
      card.innerHTML = `
        <img class="sprite" src="${P.eggSprite()}" alt="" draggable="false" />
        <div class="mc-name">Mystery Egg</div>
        <div class="mc-sub">Hatches in ${remaining} focus section${remaining === 1 ? '' : 's'}</div>
        <div class="mc-sub">${egg.lucky ? 'Rare aura detected!' : 'Pleasantly warm'}</div>
      `;
      grid.appendChild(card);
    });
  }

  /* ---------------------------------------------------------- render: dex */

  function renderDex() {
    els['dex-count'].textContent = `${state.dex.caught.length} / ${P.all.length} caught`;
    const grid = els['dex-grid'];
    grid.innerHTML = '';
    P.all.forEach((sp) => {
      const caught = state.dex.caught.includes(sp.id);
      const seen = state.dex.seen.includes(sp.id);
      const cell = document.createElement('div');
      cell.className = 'dex-cell' + (caught ? ' caught' : seen ? ' seen' : ' unknown');
      cell.innerHTML = `
        <img class="sprite" src="${P.sprite(sp.id)}" alt="" draggable="false" />
        <div class="dex-id">#${String(sp.id).padStart(3, '0')}</div>
        <div class="dex-name">${caught || seen ? P.displayName(sp) : '???'}</div>
      `;
      grid.appendChild(cell);
    });
  }

  /* ---------------------------------------------------------- render: pills */

  function renderPills() {
    els['pill-sessions'].textContent = `${state.stats.totalSessions} sessions`;
    els['pill-focus'].textContent = `${Math.round(state.stats.totalFocusMinutes)} min`;
  }

  /* ---------------------------------------------------------- render: timer */

  function renderTimer(state_) {
    if (!state_) return;
    const { mode, remainingMs, totalMs, progress, sectionIndex } = state_;
    const isBreak = mode === 'shortBreak' || mode === 'longBreak';

    els['mode-label'].textContent = mode === 'idle'
      ? 'READY'
      : mode === 'focus' ? 'FOCUS' : mode === 'longBreak' ? 'LONG BREAK' : 'BREAK';
    els['mode-label'].classList.toggle('break', isBreak);

    els['clock'].textContent = mode === 'idle'
      ? fmtClock(state.settings.focusMin * 60000)
      : fmtClock(remainingMs);

    els['progress-fill'].style.width = `${(progress * 100).toFixed(1)}%`;

    const perCycle = state.settings.sectionsPerCycle;
    const doneInCycle = sectionIndex % perCycle;
    els['section-dots'].innerHTML = '';
    for (let i = 0; i < perCycle; i += 1) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      if (state_.running || mode !== 'idle') {
        if (i < doneInCycle) dot.classList.add('done');
        if (i === doneInCycle) dot.classList.add('current');
      } else if (i < doneInCycle) {
        dot.classList.add('done');
      }
      els['section-dots'].appendChild(dot);
    }
    els['section-caption'].textContent = `Section ${(doneInCycle % perCycle) + 1} of ${perCycle} (total ${state.stats.totalSessions})`;

    els['btn-start'].disabled = state_.running;
    els['btn-pause'].disabled = !state_.running;
    els['btn-pause'].textContent = 'PAUSE';
    els['btn-start'].textContent = mode === 'idle' ? 'START FOCUS' : 'RUNNING';

    els['sprite-stage'].classList.toggle('focusing', mode === 'focus' && state_.running);
    els['sprite-stage'].classList.toggle('idle', !state_.running);

    updateShellTitle(mode, remainingMs);
  }

  function updateShellTitle(mode, remainingMs) {
    if (window.pokepomo?.setTitle) {
      if (mode === 'idle') window.pokepomo.setTitle('PokePomo');
      else window.pokepomo.setTitle(`${fmtClock(remainingMs)} - ${mode === 'focus' ? 'Focus' : 'Break'} | PokePomo`);
    }
    const badge = mode === 'idle' ? '' : fmtClock(remainingMs);
    if (window.pokepomo?.setBadge) window.pokepomo.setBadge(badge);
  }

  /* ---------------------------------------------------------- render all */

  function renderAll() {
    renderEquipped();
    renderSide();
    if (currentView === 'team') renderTeam();
    if (currentView === 'dex') renderDex();
    renderPills();
    renderTimer(timer.snapshot());
  }

  /* ---------------------------------------------------------- modals */

  function showModal({ title, sprite, spriteClass, types, rarity, body, actions }) {
    const m = els.modal;
    m.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = title;
    m.appendChild(h);

    if (rarity) {
      const r = document.createElement('div');
      r.className = 'rarity-tag' + (rarity.cls ? ` ${rarity.cls}` : '');
      r.textContent = rarity.text;
      m.appendChild(r);
    }
    if (sprite) {
      const img = document.createElement('img');
      img.className = `sprite modal-sprite${spriteClass ? ` ${spriteClass}` : ''}`;
      img.src = sprite;
      img.draggable = false;
      m.appendChild(img);
    }
    if (types) {
      const t = document.createElement('div');
      t.className = 'modal-types';
      t.innerHTML = typeTags(types);
      m.appendChild(t);
    }
    const p = document.createElement('p');
    p.innerHTML = body || '';
    m.appendChild(p);

    if (actions?.length) {
      const wrap = document.createElement('div');
      wrap.className = 'modal-actions';
      actions.forEach((a) => {
        const b = document.createElement('button');
        b.className = `btn${a.primary ? ' primary' : ' ghost'}`;
        b.textContent = a.label;
        b.addEventListener('click', () => { window.Sfx?.click(); a.onClick(); });
        wrap.appendChild(b);
      });
      m.appendChild(wrap);
    }

    els['modal-backdrop'].classList.remove('hidden');
  }

  function closeModal() {
    els['modal-backdrop'].classList.add('hidden');
    els.modal.innerHTML = '';
  }

  function showMonDetail(mon) {
    const sp = P.byIdGet(mon.speciesId);
    const info = E.levelFromXp(mon.xp);
    const stats = P.computeStats(sp, info.level);
    const labels = { hp: 'HP', attack: 'ATK', defense: 'DEF', sp_attack: 'SPA', sp_defense: 'SPD', speed: 'SPE' };
    showModal({
      title: mon.nickname,
      sprite: P.sprite(mon.speciesId),
      types: sp.types,
      rarity: mon.lucky ? { text: 'RARE', cls: 'lucky' } : null,
      body: `
        <div><b>${P.displayName(sp)}</b> \u00b7 ${sp.genus}</div>
        <div>Level ${info.level} \u00b7 ${info.intoLevel}/${info.needNext || '\u2014'} XP</div>
        <div>${mon.totalFocusMinutes} focus minutes \u00b7 ${mon.sessions} sessions</div>
        <div>${mon.evolvedCount} evolution${mon.evolvedCount === 1 ? '' : 's'}</div>
        <div class="modal-stats">
          ${Object.keys(labels).map((k) => `<div class="st"><span>${labels[k]}</span><b>${stats[k]}</b></div>`).join('')}
        </div>
      `,
      actions: [{ label: 'CLOSE', onClick: closeModal }],
    });
  }

  /* ---------------------------------------------------------- xp + level + evolution */

  function addXpTo(mon, amount, source) {
    if (!mon || amount <= 0) return null;
    const before = E.levelFromXp(mon.xp);
    mon.xp += amount;
    const after = E.levelFromXp(mon.xp);
    state.stats.totalXp += amount;
    mon.history = mon.history || [];
    mon.history.push({ type: 'xp', amount, source, at: new Date().toISOString() });
    return { before, after, gained: amount };
  }

  async function levelUpFlow(mon, previousLevel) {
    const info = E.levelFromXp(mon.xp);
    let changed = false;
    if (previousLevel && info.level > previousLevel) {
      window.Sfx?.levelUp();
      showXpFloat(`LEVEL ${info.level}!`);
      changed = true;
    }
    if (E.pendingEvolution(mon)) {
      await resolveEvolutionChain(mon);
      changed = true;
    }
    return changed;
  }

  async function resolveEvolutionChain(mon) {
    let evo = E.pendingEvolution(mon);
    while (evo) {
      const before = E.levelFromXp(mon.xp);
      const oldSpecies = P.byIdGet(mon.speciesId);
      const newSpecies = P.byIdGet(evo.toId);
      E.applyEvolution(mon, evo);
      C.markDex(state, evo.toId, true);
      state.stats.evolutions += 1;

      window.Sfx?.evolve();
      await saveNow();
      renderAll();

      await new Promise((resolve) => {
        showModal({
          title: 'EVOLUTION!',
          sprite: P.sprite(evo.toId),
          spriteClass: 'evolving',
          types: newSpecies.types,
          body: `
            ${oldSpecies ? `<b>${P.displayName(oldSpecies)}</b>` : 'Your Pokemon'}
            became <b>${P.displayName(newSpecies)}</b>!<br>
            <span style="color:var(--ink-dim)">Lv.${before.level} \u00b7 ${newSpecies.genus}</span>
          `,
          actions: [{ label: 'AWESOME!', primary: true, onClick: () => { closeModal(); resolve(true); } }],
        });
      });

      evo = E.pendingEvolution(mon);
    }
  }

  /* ---------------------------------------------------------- egg flow */
  function hatchEggs() {
    const ready = C.eggs(state).filter((e) => e.steps >= e.stepsNeeded);
    if (!ready.length) return null;
    const egg = ready[0];
    C.hatch(egg);
    C.markDex(state, egg.speciesId, true);
    state.stats.eggsHatched += 1;
    return egg;
  }

  async function showHatchModal(egg) {
    const sp = P.byIdGet(egg.speciesId);
    window.Sfx?.hatch();
    await saveNow();
    renderAll();
    return new Promise((resolve) => {
      showModal({
        title: 'EGG HATCHED!',
        sprite: P.eggSprite(),
        spriteClass: 'hatching',
        body: 'The egg is shaking...',
        actions: [],
      });
      setTimeout(() => {
        showModal({
          title: 'WELCOME!',
          sprite: P.sprite(egg.speciesId),
          types: sp.types,
          rarity: egg.lucky ? { text: 'LUCKY HATCH', cls: 'lucky' } : null,
          body: `<b>${P.displayName(sp)}</b> hatched!<br>
                 <span style="color:var(--ink-dim)">${sp.genus} \u00b7 Lv.1</span>
                 <br><br>You can equip it from the Team tab.`,
          actions: [{ label: 'NICE!', primary: true, onClick: () => { closeModal(); resolve(true); } }],
        });
      }, 1300);
    });
  }

  function tryFindEgg() {
    const egg = C.rollEgg(state.settings);
    if (!egg) return null;
    C.addMon(state, egg);
    state.stats.eggsFound += 1;
    return egg;
  }

  function advanceEggs() {
    C.eggs(state).forEach((egg) => { egg.steps += 1; });
  }

  /* ---------------------------------------------------------- flows on timer events */

  async function onFocusComplete(minutes) {
    timer.bumpSection();
    const mon = C.equipped(state);
    const sp = mon ? P.byIdGet(mon.speciesId) : null;

    const xp = mon ? E.focusXp(sp, minutes, timer.sectionIndex - 1) : 0;
    sessionFocusXp += xp;
    const beforeLevel = mon ? E.levelFromXp(mon.xp).level : null;

    if (mon) {
      mon.sessions += 1;
      mon.totalFocusMinutes += minutes;
      addXpTo(mon, xp, 'focus');
    }
    state.stats.totalSessions += 1;
    state.stats.totalFocusMinutes += minutes;

    advanceEggs();

    window.Sfx?.complete();
    showXpFloat(`+${xp} XP`);
    shellNotify('Focus complete!', mon ? `${mon.nickname} earned ${xp} XP.` : 'Take a break.');
    await saveNow();
    renderAll();

    if (mon) {
      const levelled = await levelUpFlow(mon, beforeLevel);
      if (levelled) toast(`${mon.nickname} reached Lv.${E.levelFromXp(mon.xp).level}!`);
    }

    const hatched = hatchEggs();
    if (hatched) {
      await showHatchModal(hatched);
      await saveNow();
      renderAll();
    }

    const found = tryFindEgg();
    if (found) {
      window.Sfx?.eggFound();
      toast('You found a Mystery Egg!');
      shellNotify('Mystery Egg', 'A wild egg appeared in your bag.');
      await saveNow();
      renderAll();
    }

    const cycleDone = state.settings.sectionsPerCycle;
    const finishedCycle = timer.sectionIndex > 0 && timer.sectionIndex % cycleDone === 0;
    if (finishedCycle) {
      const bonus = E.cycleXp(sessionFocusXp);
      sessionFocusXp = 0;
      const m2 = C.equipped(state);
      if (m2 && bonus > 0) {
        const before2 = E.levelFromXp(m2.xp).level;
        addXpTo(m2, bonus, 'cycle-bonus');
        showXpFloat(`CYCLE +${bonus} XP`);
        toast(`Cycle complete! +${bonus} bonus XP`);
        await saveNow();
        renderAll();
        await levelUpFlow(m2, before2);
      }
    }

    if (state.settings.autoStartBreaks) {
      setTimeout(() => startBreak(), 400);
    } else {
      timer.skip();
      renderTimer(timer.snapshot());
    }
  }

  async function onBreakComplete(minutes) {
    const mon = C.equipped(state);
    const xp = E.breakXp(minutes);
    const beforeLevel = mon ? E.levelFromXp(mon.xp).level : null;
    if (mon && xp > 0) {
      addXpTo(mon, xp, 'break');
      showXpFloat(`+${xp} XP`);
    }
    window.Sfx?.complete();
    await saveNow();
    renderAll();
    if (mon) await levelUpFlow(mon, beforeLevel);

    if (state.settings.autoStartFocus) {
      setTimeout(() => startFocus(), 400);
    } else {
      timer.skip();
      renderTimer(timer.snapshot());
    }
  }

  function showXpFloat(text) {
    const el = els['xp-float'];
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /* ---------------------------------------------------------- controls */

  function startFocus() {
    window.Sfx?.unlock();
    window.Sfx?.startFocus();
    timer.startFocus(state.settings);
    queueSave();
  }

  function startBreak() {
    window.Sfx?.startBreak();
    timer.startBreak(state.settings);
    queueSave();
  }

  function togglePause() {
    window.Sfx?.click();
    if (timer.running) timer.pause(); else timer.resume();
    queueSave();
  }

  function skip() {
    window.Sfx?.click();
    timer.skip();
    renderTimer(timer.snapshot());
    queueSave();
  }

  /* ---------------------------------------------------------- settings binding */

  function bindSettings() {
    const map = [
      ['set-focus', 'focusMin'],
      ['set-short', 'shortBreakMin'],
      ['set-long', 'longBreakMin'],
      ['set-sections', 'sectionsPerCycle'],
    ];
    map.forEach(([id, key]) => {
      const input = $(id);
      input.addEventListener('change', () => {
        let v = parseInt(input.value, 10);
        if (!Number.isFinite(v)) v = state.settings[key];
        v = Math.max(parseInt(input.min, 10), Math.min(parseInt(input.max, 10), v));
        input.value = v;
        state.settings[key] = v;
        queueSave();
        renderTimer(timer.snapshot());
      });
    });

    $('set-eggchance').addEventListener('change', () => {
      const input = $('set-eggchance');
      let v = parseInt(input.value, 10);
      if (!Number.isFinite(v)) v = Math.round(state.settings.eggChance * 100);
      v = Math.max(0, Math.min(100, v));
      input.value = v;
      state.settings.eggChance = v / 100;
      queueSave();
    });

    const checks = [
      ['set-autobreak', 'autoStartBreaks'],
      ['set-autofocus', 'autoStartFocus'],
      ['set-sound', 'soundOn'],
      ['set-notif', 'notifications'],
    ];
    checks.forEach(([id, key]) => {
      $(id).addEventListener('change', () => {
        state.settings[key] = $(id).checked;
        if (key === 'soundOn') window.Sfx?.setEnabled($(id).checked);
        queueSave();
      });
    });

    document.querySelectorAll('.stp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = $(btn.dataset.target);
        const delta = parseInt(btn.dataset.delta, 10);
        let v = parseInt(input.value, 10) + delta;
        v = Math.max(parseInt(input.min, 10), Math.min(parseInt(input.max, 10), v));
        input.value = v;
        input.dispatchEvent(new Event('change'));
        window.Sfx?.click();
      });
    });

    els['btn-reset'].addEventListener('click', () => {
      showModal({
        title: 'Reset everything?',
        body: 'All Pokemon, XP and eggs will be lost. This cannot be undone.',
        actions: [
          { label: 'CANCEL', onClick: closeModal },
          {
            label: 'RESET',
            onClick: async () => {
              state = await S.reset();
              closeModal();
              await boot(true);
            },
          },
        ],
      });
    });
  }

  function pushSettingsToUi() {
    $('set-focus').value = state.settings.focusMin;
    $('set-short').value = state.settings.shortBreakMin;
    $('set-long').value = state.settings.longBreakMin;
    $('set-sections').value = state.settings.sectionsPerCycle;
    $('set-eggchance').value = Math.round(state.settings.eggChance * 100);
    $('set-autobreak').checked = state.settings.autoStartBreaks;
    $('set-autofocus').checked = state.settings.autoStartFocus;
    $('set-sound').checked = state.settings.soundOn;
    $('set-notif').checked = state.settings.notifications;
    window.Sfx?.setEnabled(state.settings.soundOn);
  }

  /* ---------------------------------------------------------- navigation */

  function switchView(view) {
    currentView = view;
    els.tabs.forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    Object.entries(els.views).forEach(([k, el]) => el.classList.toggle('active', k === view));
    if (view === 'team') renderTeam();
    if (view === 'dex') renderDex();
    if (view === 'settings') pushSettingsToUi();
    window.Sfx?.click();
  }

  function bindNav() {
    els.tabs.forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
    els['btn-start'].addEventListener('click', startFocus);
    els['btn-pause'].addEventListener('click', togglePause);
    els['btn-skip'].addEventListener('click', skip);
    els['modal-backdrop'].addEventListener('click', (e) => {
      if (e.target === els['modal-backdrop']) {
        const hasCard = els.modal.querySelector('.modal-actions .btn');
        if (!hasCard) closeModal();
      }
    });
    document.addEventListener('keydown', (e) => {
      const modalOpen = !els['modal-backdrop'].classList.contains('hidden');
      if (e.code === 'Space' && !e.repeat && !modalOpen) {
        e.preventDefault();
        if (timer.mode === 'idle') startFocus(); else togglePause();
      }
    });
  }

  /* ---------------------------------------------------------- timer wiring */

  function wireTimer() {
    timer.on('tick', renderTimer);
    timer.on('complete', async (payload) => {
      if (payload.mode === 'focus') await onFocusComplete(payload.minutes);
      else await onBreakComplete(payload.minutes);
    });
  }

  /* ---------------------------------------------------------- boot */

  async function boot(isReset) {
    if (!state) state = await S.load();

    const hasParty = C.party(state).length > 0;
    if (!hasParty) {
      els['screen-starter'].classList.remove('hidden');
      els['screen-app'].classList.add('hidden');
      renderStarters();
      return;
    }
    enterApp(isReset);
  }

  function enterApp() {
    els['screen-starter'].classList.add('hidden');
    els['screen-app'].classList.remove('hidden');
    pushSettingsToUi();
    renderAll();
    timer.restore(state.timer);
    renderTimer(timer.snapshot());
    if (state.settings.soundOn === false) window.Sfx?.setEnabled(false);
  }

  function persistTimerPeriodically() {
    setInterval(() => {
      state.timer = timer.persist();
      S.save(state);
    }, 5000);
  }

  async function main() {
    cacheEls();
    state = await S.load();

    timer = window.createTimer();
    wireTimer();
    bindSettings();
    bindNav();

    const p = await S.path();
    els['save-path'].textContent = p;

    persistTimerPeriodically();
    window.addEventListener('beforeunload', () => { state.timer = timer.persist(); S.save(state); });

    await boot();
  }

  document.addEventListener('DOMContentLoaded', main);
})();
