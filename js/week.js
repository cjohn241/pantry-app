// week.js — 7 day cards with meals and totals. Tap a meal to edit it.
// Each card can copy itself to another day, take the ideal-day
// template, or be cleared.

import * as db from './db.js';
import { esc, dateKey, addDays, shortLabel, fmt, ICONS, confirmBox, toast } from './ui.js';
import { getDay, saveDay, blankDay, totals, totalText, MACROS, editMeal, applyIdealDay, copyDialog } from './meals.js';

// The first day shown. Kept outside render() so it survives a redraw.
let startDate = null;

const SHORT = { kcal: 'kcal', protein: 'protein', carbs: 'carbs', fat: 'fat' };

function dayCard(day, targets, isToday) {
  const t = totals(day.meals);

  const totalsHTML = MACROS.map((m) => {
    const over = t[m.key].sum > targets[m.target];
    return `<div class="day-total ${over ? 'over' : ''}"><b>${totalText(t[m.key])}</b><span>${SHORT[m.key]}</span></div>`;
  }).join('');

  const mealsHTML = day.meals.map((m) => `
    <li class="${m.kind === 'meal' ? '' : 'extra'}">
      <button class="row-btn" data-act="edit" data-id="${esc(m.id)}">
        <span class="slot">${esc(m.slot)}</span>
        <span class="grow">${esc(m.name)}${m.optional ? ' <span class="muted small">(optional)</span>' : ''}</span>
        <span class="muted small">${m.kcal ? fmt(m.kcal) : ''}</span>
      </button>
    </li>`).join('');

  return `
    <article class="card day-card ${isToday ? 'is-today' : ''}" data-date="${day.date}">
      <header>
        <h2>${esc(shortLabel(day.date))}</h2>
        ${isToday ? '<span class="today-badge">Today</span>' : ''}
      </header>
      <div class="day-totals">${totalsHTML}</div>
      ${day.meals.length
        ? `<ul class="list-plain day-meals">${mealsHTML}</ul>`
        : '<p class="muted">Nothing planned.</p>'}
      ${day.note ? `<p class="note">${esc(day.note)}</p>` : ''}
      <div class="day-actions">
        <button class="btn small" data-act="add">${ICONS.plus} Meal</button>
        ${day.meals.length
          ? '<button class="btn small" data-act="copy-to">Copy to…</button>'
          : '<button class="btn small" data-act="copy-from">Copy from…</button>'}
        <button class="btn small" data-act="ideal">Ideal day</button>
        ${day.meals.length ? '<button class="btn small" data-act="clear">Clear</button>' : ''}
      </div>
    </article>`;
}

export async function render(main) {
  const today = dateKey();
  if (!startDate) startDate = today;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const [days, targets] = await Promise.all([
    Promise.all(dates.map((d) => getDay(d))),
    db.getSetting('targets', {}),
  ]);
  const redraw = () => render(main);

  main.innerHTML = `
    <header class="screen-head">
      <h1>Week</h1>
      <span class="spacer"></span>
      <button class="icon-btn" data-act="prev" aria-label="Previous 7 days">${ICONS.left}</button>
      <button class="btn" data-act="now" ${startDate === today ? 'disabled' : ''}>From today</button>
      <button class="icon-btn" data-act="next" aria-label="Next 7 days">${ICONS.right}</button>
      <p class="sub">${esc(shortLabel(dates[0]))} to ${esc(shortLabel(dates[6]))}. Tap a meal to edit it.</p>
    </header>
    <div class="week-grid">
      ${days.map((d) => dayCard(d, targets, d.date === today)).join('')}
    </div>`;

  main.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const date = btn.closest('.day-card')?.dataset.date;

    if (act === 'prev') { startDate = addDays(startDate, -7); redraw(); }
    else if (act === 'next') { startDate = addDays(startDate, 7); redraw(); }
    else if (act === 'now') { startDate = today; redraw(); }
    else if (act === 'edit') editMeal(date, btn.dataset.id, redraw);
    else if (act === 'add') editMeal(date, null, redraw);
    else if (act === 'copy-to') copyDialog(date, 'to', redraw);
    else if (act === 'copy-from') copyDialog(date, 'from', redraw);
    else if (act === 'ideal') { if (await applyIdealDay(date)) redraw(); }
    else if (act === 'clear') {
      if (!(await confirmBox(`Remove all meals from ${shortLabel(date)}?`, 'Clear day', 'Cancel', true))) return;
      const day = await getDay(date);
      await saveDay({ ...blankDay(date), water_oz: day.water_oz, energy: day.energy, focus: day.focus });
      toast('Day cleared');
      redraw();
    }
  };
}
