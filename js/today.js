// today.js — the home screen: macro bars, today's meals with tick boxes,
// water, energy/focus scores, and "use first" pantry items.

import * as db from './db.js';
import { esc, dateKey, longLabel, fmt, ICONS, pctText, locationChip } from './ui.js';
import { getDay, saveDay, totals, totalText, MACROS, editMeal, applyIdealDay, copyDialog } from './meals.js';
import { isUseFirst, isNotMine } from './rules.js';
import { openItemDialog } from './pantry.js';
import * as C from './campaign.js';
import { heroCard, doQuest, doRun } from './quests.js';

/** "Today's quest": your hero, the next quest in this week's plan, and the 5K run. */
function questCard(state) {
  const today = dateKey();
  const next = C.weekPlan(state).find((slot) => !slot.done && slot.suggest);
  const ranToday = state.log.some((e) => e.questId === 'c25k' && e.date === today);
  const rows = [];
  if (next) {
    rows.push(`
      <div class="quest-row">
        <span class="grow">${esc(next.suggest.name)}<br><span class="muted small">${esc(next.label)}</span></span>
        <span class="xp-chip">${next.suggest.xp} XP</span>
        <button class="btn small quest-done" data-act="quest" data-id="${esc(next.suggest.id)}">Done</button>
      </div>`);
  }
  if (!state.track.done && !ranToday) {
    rows.push(`
      <div class="quest-row">
        <span class="grow">5K stage ${state.track.stage}, run ${state.track.run}<br><span class="muted small">${esc(state.track.text)}</span></span>
        <span class="xp-chip">${C.RUN_XP} XP</span>
        <button class="btn small quest-done" data-act="run">Done</button>
      </div>`);
  }
  return `
    ${heroCard(state, true)}
    <section class="card today-quest">
      <div class="card-head">
        <h2>Today's quest</h2>
        <span class="spacer"></span>
        <a class="btn small" href="#quests">All quests</a>
      </div>
      ${rows.length ? rows.join('') : '<p class="muted">This week\'s quests are done. Rest counts too.</p>'}
    </section>`;
}

const WATER_STEP = 8; // ounces per tap

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`;

/* ---------- Pieces of the screen ---------- */

function macroBar(macro, eaten, planned, target) {
  const unit = macro.unit;
  const nothingKnown = eaten.unknown > 0 && eaten.sum === 0;
  const widthOf = (v) => (target ? Math.min(100, (v / target) * 100) : 0);

  let sub;
  if (nothingKnown) {
    sub = `Not known for ${plural(eaten.unknown, 'ticked row')}`;
  } else {
    const left = target - eaten.sum;
    sub = left >= 0 ? `${fmt(left)} ${unit} left` : `${fmt(-left)} ${unit} over`;
    if (eaten.unknown) sub += ` · ${plural(eaten.unknown, 'ticked row')} unknown`;
  }

  return `
    <div class="macro" style="--c: var(--${macro.key})">
      <div class="macro-top">
        <span class="macro-label">${macro.label}</span>
        <span class="macro-num"><b>${nothingKnown ? '—' : fmt(eaten.sum)}</b> / ${fmt(target)} ${unit}</span>
      </div>
      <div class="bar" role="progressbar" aria-label="${macro.label}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.round(eaten.sum)}">
        <div class="bar-plan" style="width:${widthOf(planned.sum)}%"></div>
        <div class="bar-fill" style="width:${widthOf(eaten.sum)}%"></div>
      </div>
      <div class="macro-sub">${sub} · planned ${totalText(planned)}</div>
    </div>`;
}

function mealRow(m) {
  const kindTag = m.kind === 'meal' ? '' : `<span class="kind-tag">${m.kind}${m.optional ? ' · optional' : ''}</span>`;
  const optionalTag = m.kind === 'meal' && m.optional ? '<span class="kind-tag">optional</span>' : '';
  const nums = m.kind === 'meal' || m.kcal
    ? `<span class="meal-nums"><b>${fmt(m.kcal)}</b> kcal<br>${fmt(m.protein)} g protein</span>`
    : '';
  return `
    <div class="meal-row kind-${m.kind} ${m.eaten ? 'eaten' : ''}" data-id="${esc(m.id)}">
      <button class="tick" data-act="tick" aria-pressed="${m.eaten}" aria-label="${m.eaten ? 'Untick' : 'Tick'} ${esc(m.name)}">${ICONS.check}</button>
      <button class="meal-body" data-act="edit">
        ${kindTag}${optionalTag}
        <span class="meal-name">${esc(m.name)}</span>
        ${m.detail ? `<span class="meal-detail">${esc(m.detail)}</span>` : ''}
      </button>
      ${nums}
    </div>`;
}

function mealsList(meals) {
  let html = '';
  let lastSlot = null;
  for (const m of meals) {
    if (m.slot !== lastSlot) {
      html += `<div class="slot-head">${esc(m.slot)}</div>`;
      lastSlot = m.slot;
    }
    html += mealRow(m);
  }
  return html;
}

function scoreRow(label, field, value) {
  const buttons = [1, 2, 3, 4, 5]
    .map((n) => `<button data-act="score" data-field="${field}" data-value="${n}" aria-pressed="${value === n}">${n}</button>`)
    .join('');
  return `<div class="score-row"><span class="score-label">${label}</span><div class="seg" role="group" aria-label="${label} 1 to 5">${buttons}</div></div>`;
}

/* ---------- Draw the screen ---------- */

export async function render(main) {
  const date = dateKey();
  const [day, targets, items, questState] = await Promise.all([
    getDay(date),
    db.getSetting('targets', {}),
    db.getAll('items'),
    C.loadState(),
  ]);
  const redraw = () => render(main);

  const eatenTotals = totals(day.meals.filter((m) => m.eaten));
  const plannedTotals = totals(day.meals);

  const required = day.meals.filter((m) => !m.optional);
  const doneCount = required.filter((m) => m.eaten).length;

  const useFirst = items
    .filter((i) => isUseFirst(i) && !isNotMine(i))
    .sort((a, b) => (a.fill ?? 101) - (b.fill ?? 101));

  main.innerHTML = `
    <header class="screen-head">
      <h1>${esc(longLabel(date))}</h1>
      ${day.note ? `<p class="note sub">${esc(day.note)}</p>` : ''}
    </header>

    <div class="today-grid">
      <div class="col">
        ${questCard(questState)}

        <section class="card" aria-label="Today's totals">
          ${MACROS.map((m) => macroBar(m, eatenTotals[m.key], plannedTotals[m.key], targets[m.target])).join('')}
        </section>

        <section class="card">
          <h2>Water</h2>
          <div class="water">
            <button class="icon-btn" data-act="water" data-step="-${WATER_STEP}" aria-label="Remove ${WATER_STEP} ounces">${ICONS.minus}</button>
            <div class="water-num"><b>${day.water_oz}</b> oz<br><span class="muted small">${plural(Math.round(day.water_oz / WATER_STEP), 'glass')}</span></div>
            <button class="btn primary big" data-act="water" data-step="${WATER_STEP}">+ ${WATER_STEP} oz</button>
          </div>
        </section>

        <section class="card">
          <h2>How's today?</h2>
          ${scoreRow('Energy', 'energy', day.energy)}
          ${scoreRow('Focus', 'focus', day.focus)}
        </section>
      </div>

      <div class="col">
        <section class="card">
          <div class="card-head">
            <h2>Meals</h2>
            <span class="muted">${required.length ? `${doneCount} of ${required.length} ticked` : ''}</span>
            <span class="spacer"></span>
            <button class="btn small" data-act="add">${ICONS.plus} Add</button>
          </div>
          ${day.meals.length ? mealsList(day.meals) : `
            <div class="empty">
              <p class="muted">Nothing planned for today yet.</p>
              <div class="btn-row">
                <button class="btn primary" data-act="ideal">Use ideal day</button>
                <button class="btn" data-act="copy">Copy a day…</button>
              </div>
            </div>`}
        </section>

        ${useFirst.length ? `
        <section class="card">
          <h2>Use first</h2>
          <ul class="list-plain">
            ${useFirst.map((i) => `
              <li><button class="row-btn" data-act="item" data-id="${esc(i.id)}">
                <span class="grow"><b>${esc(i.name)}</b> ${locationChip(i.location)}</span>
                <span class="item-pct">${pctText(i.fill)}</span>
              </button></li>`).join('')}
          </ul>
        </section>` : ''}
      </div>
    </div>`;

  // One click handler for the whole screen. Each button says what it
  // does with data-act="...".
  main.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const mealId = btn.closest('.meal-row')?.dataset.id;

    if (act === 'tick') {
      const fresh = await getDay(date);
      const meal = fresh.meals.find((m) => m.id === mealId);
      meal.eaten = !meal.eaten;
      await saveDay(fresh);
      redraw();
    } else if (act === 'edit') {
      editMeal(date, mealId, redraw);
    } else if (act === 'add') {
      editMeal(date, null, redraw);
    } else if (act === 'water') {
      const fresh = await getDay(date);
      fresh.water_oz = Math.max(0, fresh.water_oz + Number(btn.dataset.step));
      await saveDay(fresh);
      redraw();
    } else if (act === 'score') {
      const fresh = await getDay(date);
      const value = Number(btn.dataset.value);
      // Tapping the chosen number again clears it.
      fresh[btn.dataset.field] = fresh[btn.dataset.field] === value ? null : value;
      await saveDay(fresh);
      redraw();
    } else if (act === 'ideal') {
      if (await applyIdealDay(date)) redraw();
    } else if (act === 'copy') {
      copyDialog(date, 'from', redraw);
    } else if (act === 'item') {
      openItemDialog(btn.dataset.id, redraw);
    } else if (act === 'quest') {
      doQuest(btn.dataset.id, redraw);
    } else if (act === 'run') {
      doRun(redraw);
    }
  };
}
