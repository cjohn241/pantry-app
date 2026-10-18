// quests.js — the Quests screen: your hero, this week, the 5K boss
// track, and every region's quests with a one-tap Done button.

import * as db from './db.js';
import { esc, dateKey, keyToDate, shortLabel, openDialog, closeDialog, confirmBox, toast, ICONS } from './ui.js';
import * as C from './campaign.js';
import { heroSVG, hop } from './sprite.js';

/* ---------- Small icons for each region ---------- */

export const REGION_ICONS = {
  castle: '<path d="M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12z"/><path d="M10 21v-5h4v5"/>',
  trail: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
  feather: '<path d="M20 4C12 4 6 10 6 18v2"/><path d="M6 18c6 0 12-4 14-14"/><path d="M9 15h5"/>',
  wheels: '<circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="M7 17l5-9 5 9"/>',
  leaf: '<path d="M5 19C5 10 11 5 20 5c0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
  tent: '<path d="M3 20L12 4l9 16z"/><path d="M12 20l-3-6M12 20l3-6"/>',
  skull: '<path d="M12 3a7 7 0 0 0-7 7v4l2 2v3h10v-3l2-2v-4a7 7 0 0 0-7-7z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/>',
  plane: '<path d="M10 14L3 11l1-2 7 1 4-6h2l-2 7 5 1 1-2h2l-1 4 1 4h-2l-1-2-5 1 2 7h-2l-4-6-7 1-1-2 7-3"/>',
};

export function icon(name) {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${REGION_ICONS[name] || ''}</svg>`;
}

/* ---------- Doing a quest (shared with the Today card) ---------- */

/** After logging: show the XP with an Undo button, hop, and redraw. */
async function celebrate(entry, before, redraw) {
  const after = await C.loadState();
  const xp = C.entryXp(entry);
  let msg = `+${xp} XP · ${entry.name}`;
  if (entry.note) msg = `+${xp} XP · ${entry.note}`;
  if (after.level.level > before.level.level) msg = `Level ${after.level.level}! +${xp} XP`;
  await redraw();
  hop();
  toast(msg, {
    label: 'Undo',
    run: async () => {
      await C.undoEntry(entry.id);
      toast('Undone');
      redraw();
    },
  });
}

/** The Done button. Hotel gym quests ask which gym first. */
export async function doQuest(questId, redraw) {
  const before = await C.loadState();
  const quest = before.quests.find((q) => q.id === questId);
  if (!quest) return;
  if (quest.gym) {
    askGym(quest, before, redraw);
    return;
  }
  const entry = await C.logQuest(quest);
  celebrate(entry, before, redraw);
}

export async function doRun(redraw) {
  const before = await C.loadState();
  const entry = await C.logRun();
  if (entry) celebrate(entry, before, redraw);
}

/** "Which hotel gym?" Known gyms are one tap; a new one earns the bonus. */
function askGym(quest, before, redraw) {
  const gyms = [...before.campaign.gyms].reverse(); // most recent first
  const dlg = openDialog(`
    <form class="dlg" id="gym-form">
      <h2>Which hotel gym?</h2>
      ${gyms.length ? `<div class="btn-row">${gyms.slice(0, 8).map((g) => `<button type="button" class="btn" data-gym="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}
      <label class="field">New gym
        <span class="hint">First visit to a new gym earns +${C.NEW_GYM_BONUS} bonus XP. That's the brave part.</span>
        <input type="text" name="gymName" placeholder="Hotel and city" autocomplete="off">
      </label>
      <div class="dlg-actions">
        <button type="button" class="btn" data-act="skip">Skip</button>
        <span class="spacer"></span>
        <button type="submit" class="btn primary">New gym, +${C.NEW_GYM_BONUS} XP</button>
      </div>
    </form>`);
  const form = dlg.querySelector('#gym-form');

  const finish = async (options) => {
    closeDialog();
    const entry = await C.logQuest(quest, options);
    celebrate(entry, before, redraw);
  };

  form.querySelectorAll('[data-gym]').forEach((b) => b.addEventListener('click', () => finish({ gym: b.dataset.gym })));
  form.querySelector('[data-act="skip"]').addEventListener('click', () => finish({}));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.gymName.value.trim();
    if (!name) {
      form.gymName.focus();
      return;
    }
    finish({ gym: name, newGym: true });
  });
}

/* ---------- Pieces of the screen ---------- */

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The hero: sprite, level, XP bar, gold and the reward. */
export function heroCard(state, compact = false) {
  const { campaign, level, gold } = state;
  const hero = campaign.hero;
  const reward = campaign.reward;
  const rewardPct = reward.name ? Math.min(100, Math.round((gold / reward.price) * 100)) : 0;

  return `
    <section class="card hero-card ${compact ? 'compact' : ''}">
      <div class="hero-sprite">${heroSVG(hero, compact ? 3 : 5)}</div>
      <div class="hero-stats">
        <h2 class="hero-name">${esc(hero.name)} the ${esc(hero.cls)}</h2>
        <div class="stat-line"><span>Level <b>${level.level}</b></span><span class="muted">${level.toNext} XP to level ${level.level + 1}</span></div>
        <div class="xp-bar" role="progressbar" aria-label="XP toward next level" aria-valuemin="0" aria-valuemax="${level.levelSize}" aria-valuenow="${level.intoLevel}">
          <div style="width:${Math.round((level.intoLevel / level.levelSize) * 100)}%"></div>
        </div>
        <div class="stat-line gold-line">
          <span><b class="gold">${gold.toLocaleString()}</b> gold</span>
          ${compact ? '' : reward.name
            ? `<span class="muted">${esc(reward.name)}: ${Math.min(gold, reward.price).toLocaleString()} / ${reward.price.toLocaleString()}</span>`
            : '<button class="link-btn" data-act="reward">Set a reward</button>'}
        </div>
        ${!compact && reward.name ? `
          <div class="gold-bar"><div style="width:${rewardPct}%"></div></div>
          ${gold >= reward.price ? `<button class="btn primary" data-act="claim" style="margin-top:10px">Claim: ${esc(reward.name)}</button>` : ''}` : ''}
      </div>
    </section>`;
}

function weekCard(state) {
  const days = state.campaign.daysPerWeek;
  const plan = C.weekPlan(state);
  const doneCount = plan.filter((slot) => slot.done).length;
  const pips = Array.from({ length: days }, (_, i) =>
    `<span class="pip ${i < doneCount ? 'on' : ''}"></span>`).join('');

  return `
    <section class="card">
      <div class="card-head">
        <h2>This week</h2>
        <span class="pips" aria-label="${doneCount} of ${days} quests">${pips}</span>
        <span class="muted">${doneCount} of ${days} quests</span>
        <span class="spacer"></span>
        <button class="btn small ${state.travel ? 'primary' : ''}" data-act="travel" aria-pressed="${state.travel}">
          ${icon('plane')} Travel week${state.travel ? ': on' : ''}
        </button>
      </div>
      <ul class="plan">
        ${plan.map((slot, i) => `
          <li class="${slot.done ? 'done' : ''}">
            <span class="plan-day">Day ${i + 1}</span>
            <span class="grow">${esc(slot.label)}${slot.withRun ? ` <span class="run-tag ${slot.runDone ? 'done' : ''}">+ 5K run</span>` : ''}</span>
            ${slot.done ? `<span class="check" aria-label="Done">${ICONS.check}</span>` : ''}
          </li>`).join('')}
      </ul>
    </section>`;
}

function daysUntil(date) {
  return Math.round((keyToDate(date) - keyToDate(dateKey())) / 86400000);
}

function bossCard(state) {
  const { campaign, track, travel, bossDefeated } = state;
  const progress = campaign.trackProgress;
  const hpLeft = (C.TOTAL_RUNS - progress) + (bossDefeated ? 0 : 1);
  const hpMax = C.TOTAL_RUNS + 1;
  const ranToday = state.log.some((e) => e.questId === 'c25k' && e.date === dateKey());

  let countdown = '<button class="link-btn on-dark" data-act="race-date">Set race date</button>';
  if (campaign.raceDate) {
    const d = daysUntil(campaign.raceDate);
    const when = d > 1 ? `in ${d} days` : d === 1 ? 'tomorrow' : d === 0 ? 'today' : `was ${shortLabel(campaign.raceDate)}`;
    countdown = `<button class="link-btn on-dark" data-act="race-date">Race day ${when}</button>`;
  }

  const stages = C.C25K.map((s, i) => {
    const stageDone = progress >= (i + 1) * C.RUNS_PER_STAGE;
    const current = !stageDone && track.stage === i + 1;
    return `<span class="stage ${stageDone ? 'done' : ''} ${current ? 'current' : ''}" title="Stage ${s.stage}"></span>`;
  }).join('') + `<span class="stage boss ${bossDefeated ? 'done' : ''}" title="Race day">${icon('skull')}</span>`;

  let body;
  if (bossDefeated) {
    body = '<p class="boss-text">Boss defeated. You ran a 5K.</p>';
  } else if (track.done) {
    body = `
      <p class="boss-text">Race week. Rest, do one easy 20-minute jog, then face the boss.</p>
      <button class="btn boss-btn" data-act="boss">I ran the race (+${C.BOSS_XP} XP)</button>`;
  } else {
    body = `
      <p class="boss-step">Stage ${track.stage} · run ${track.run} of ${C.RUNS_PER_STAGE}</p>
      <p class="boss-text">${esc(track.text)}</p>
      <p class="boss-hint">Warm up with a 5-minute brisk walk, cool down the same.${travel ? ' Travel week: the hotel treadmill counts.' : ''}</p>
      <div class="boss-actions">
        <button class="btn boss-btn" data-act="run">${ranToday ? 'Log another run' : 'Done'} (+${C.RUN_XP} XP)</button>
        ${ranToday ? '<span class="boss-hint">You ran today. Rest a day between runs if you can.</span>' : ''}
        <span class="spacer"></span>
        <button class="link-btn on-dark" data-act="repeat-stage">Repeat stage</button>
        ${progress >= C.RUNS_PER_STAGE ? '<button class="link-btn on-dark" data-act="back-stage">Back a stage</button>' : ''}
      </div>`;
  }

  return `
    <section class="card boss-card">
      <div class="card-head">
        <h2>${icon('skull')} Boss: the 5K</h2>
        <span class="spacer"></span>
        ${countdown}
      </div>
      <div class="boss-hp">
        <span>Boss HP</span>
        <div class="hp-bar"><div style="width:${Math.round((hpLeft / hpMax) * 100)}%"></div></div>
        <span>${hpLeft} / ${hpMax}</span>
      </div>
      <div class="stages" aria-label="5K stages">${stages}</div>
      ${body}
    </section>`;
}

function regionCard(region, state) {
  const quests = state.quests.filter((q) => q.region === region.id);
  if (!quests.length) return '';
  const today = dateKey();
  return `
    <section class="card region region-${region.id}">
      <div class="region-head">
        ${icon(region.icon)}
        <div><h2>${esc(region.name)}</h2><p class="muted small">${esc(region.blurb)}</p></div>
      </div>
      ${quests.map((q) => {
        const doneToday = state.log.some((e) => e.questId === q.id && e.date === today);
        return `
          <div class="quest-row ${doneToday ? 'done-today' : ''}">
            <span class="grow">${esc(q.name)}${doneToday ? ' <span class="today-tag">done today</span>' : ''}</span>
            <span class="xp-chip">${q.xp} XP</span>
            <button class="btn small quest-done" data-act="quest" data-id="${esc(q.id)}">Done</button>
          </div>`;
      }).join('')}
    </section>`;
}

function regionsHTML(state) {
  if (!state.travel) {
    return `<div class="regions">${C.REGIONS.map((r) => regionCard(r, state)).join('')}</div>`;
  }
  // Travel week: travel regions up top, home regions folded away.
  const travel = C.REGIONS.filter((r) => r.travel);
  const home = C.REGIONS.filter((r) => r.home);
  return `
    <div class="regions">${travel.map((r) => regionCard(r, state)).join('')}</div>
    <details class="card folded">
      <summary>Home regions <span class="muted small">(folded for your travel week)</span></summary>
      <div class="regions">${home.map((r) => regionCard(r, state)).join('')}</div>
    </details>`;
}

function logHTML(state) {
  const recent = state.log.slice(0, 20);
  if (!recent.length) return '';
  return `
    <details class="card quest-log">
      <summary>Quest log <span class="muted small">(${plural(state.log.length, 'entry')})</span></summary>
      <ul class="list-plain">
        ${recent.map((e) => `
          <li class="log-row" data-id="${esc(e.id)}">
            <span class="muted small log-date">${esc(shortLabel(e.date))}</span>
            <span class="grow">${esc(e.name)}${e.gym ? ` <span class="muted small">· ${esc(e.gym)}</span>` : ''}${e.note ? ` <span class="muted small">· ${esc(e.note)}</span>` : ''}</span>
            <span class="xp-chip">+${C.entryXp(e)}</span>
            <button class="icon-btn" data-act="undo" aria-label="Remove ${esc(e.name)}">${ICONS.x}</button>
          </li>`).join('')}
      </ul>
    </details>`;
}

/* ---------- Pop-ups for the reward and race date ---------- */

async function rewardDialog(redraw) {
  const campaign = await C.getCampaign();
  const dlg = openDialog(`
    <form class="dlg" id="reward-form">
      <h2>Choose your reward</h2>
      <p class="muted">Every XP you earn is also 1 gold. Name something you'll treat yourself to, and its price in gold.</p>
      <label class="field">Reward <input type="text" name="rewardName" value="${esc(campaign.reward.name)}" placeholder="New running shoes" required></label>
      <label class="field">Price in gold <input type="number" name="price" min="1" step="1" inputmode="numeric" value="${campaign.reward.price}" required></label>
      <p class="muted small">About 250 gold is a solid week of quests.</p>
      <div class="dlg-actions"><span class="spacer"></span>
        <button type="button" class="btn" data-act="cancel">Cancel</button>
        <button type="submit" class="btn primary">Save reward</button>
      </div>
    </form>`);
  const form = dlg.querySelector('#reward-form');
  form.querySelector('[data-act="cancel"]').addEventListener('click', closeDialog);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    campaign.reward = { name: form.rewardName.value.trim(), price: Math.max(1, Math.round(Number(form.price.value) || 500)) };
    await C.saveCampaign(campaign);
    closeDialog();
    toast('Reward set');
    redraw();
  });
}

async function raceDateDialog(redraw) {
  const campaign = await C.getCampaign();
  const dlg = openDialog(`
    <form class="dlg" id="race-form">
      <h2>Race day</h2>
      <p class="muted">The 5K track takes about 9 weeks at 3 runs a week. Pick a race at least that far out.</p>
      <label class="field">Date <input type="date" name="race" value="${campaign.raceDate || ''}" required></label>
      <div class="dlg-actions">
        ${campaign.raceDate ? '<button type="button" class="btn danger" data-act="clear">Clear date</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="cancel">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>`);
  const form = dlg.querySelector('#race-form');
  form.querySelector('[data-act="cancel"]').addEventListener('click', closeDialog);
  form.querySelector('[data-act="clear"]')?.addEventListener('click', async () => {
    campaign.raceDate = null;
    await C.saveCampaign(campaign);
    closeDialog();
    redraw();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    campaign.raceDate = form.race.value || null;
    await C.saveCampaign(campaign);
    closeDialog();
    toast('Race day set');
    redraw();
  });
}

/* ---------- Draw the screen ---------- */

export async function render(main) {
  const state = await C.loadState();
  const redraw = () => render(main);

  main.innerHTML = `
    <div class="quests-screen">
      <header class="screen-head"><h1>Quests</h1></header>
      <div class="quests-grid">
        <div class="col">
          ${heroCard(state)}
          ${weekCard(state)}
        </div>
        <div class="col">
          ${bossCard(state)}
        </div>
      </div>
      ${regionsHTML(state)}
      ${logHTML(state)}
    </div>`;

  main.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'quest') doQuest(btn.dataset.id, redraw);
    else if (act === 'run') doRun(redraw);
    else if (act === 'boss') {
      if (!(await confirmBox('Did you run the 5K? This defeats the boss.', 'Yes, I ran it'))) return;
      const before = await C.loadState();
      const entry = await C.logBoss();
      celebrate(entry, before, redraw);
    } else if (act === 'travel') {
      await C.setTravelWeek(!state.travel);
      toast(state.travel ? 'Travel week off' : 'Travel week on. Outpost and Healer quests are up top.');
      redraw();
    } else if (act === 'repeat-stage') {
      if (!(await confirmBox(`Start stage ${state.track.stage} over? XP you've earned stays.`, 'Repeat stage'))) return;
      await C.repeatStage();
      redraw();
    } else if (act === 'back-stage') {
      if (!(await confirmBox('Go back one stage? Good after time off. XP you\'ve earned stays.', 'Back a stage'))) return;
      await C.stepBackStage();
      redraw();
    } else if (act === 'race-date') raceDateDialog(redraw);
    else if (act === 'reward') rewardDialog(redraw);
    else if (act === 'claim') {
      const name = state.campaign.reward.name;
      if (!(await confirmBox(`Spend ${state.campaign.reward.price} gold on "${name}"? Enjoy it.`, 'Claim reward'))) return;
      await C.claimReward();
      toast(`Claimed: ${name}. Pick your next reward.`);
      redraw();
    } else if (act === 'undo') {
      const id = btn.closest('[data-id]').dataset.id;
      const entry = await db.get('questLog', id);
      if (!(await confirmBox(`Remove "${entry.name}" (${C.entryXp(entry)} XP) from your log?`, 'Remove', 'Keep it', true))) return;
      await C.undoEntry(id);
      redraw();
    }
  };
}
