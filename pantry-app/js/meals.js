// meals.js — everything about days and meals that Today and Week share:
// loading/saving a day, adding up macros, the meal editor pop-up,
// copying a day, and applying the ideal-day template.

import * as db from './db.js';
import { esc, uid, openDialog, closeDialog, confirmBox, toast, shortLabel, addDays, dateKey } from './ui.js';
import { mealWarnings } from './rules.js';
import { normalizeMeal, num } from './data.js';

/** Meals are shown in this order. Anything else goes at the end. */
export const SLOT_ORDER = ['Logged', 'Breakfast', 'Lunch', 'Afternoon', 'Dinner', 'Snack', 'Evening'];

export const KINDS = [
  { value: 'meal', label: 'Meal' },
  { value: 'drink', label: 'Drink' },
  { value: 'supplement', label: 'Supplement' },
];

/** The four bars. `target` is the matching field in your targets. */
export const MACROS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', target: 'calories' },
  { key: 'protein', label: 'Protein', unit: 'g', target: 'protein_g' },
  { key: 'carbs', label: 'Carbs', unit: 'g', target: 'carbs_g' },
  { key: 'fat', label: 'Fat', unit: 'g', target: 'fat_g' },
];

/* ---------- Loading and saving a day ---------- */

export function blankDay(date) {
  return { date, note: '', meals: [], water_oz: 0, energy: null, focus: null };
}

export async function getDay(date) {
  return (await db.get('days', date)) || blankDay(date);
}

export async function saveDay(day) {
  day.meals = sortMeals(day.meals);
  return db.put('days', day);
}

/** Sort by slot (Breakfast, Lunch, ...) but keep the order within a slot. */
export function sortMeals(meals) {
  const rank = (slot) => {
    const i = SLOT_ORDER.indexOf(slot);
    return i < 0 ? 99 : i;
  };
  return meals
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m.slot) - rank(b.m.slot) || a.i - b.i)
    .map((x) => x.m);
}

/* ---------- Adding up macros ----------
   null means "unknown", never zero. The one exception: a 0-calorie row
   (tea, creatine) must have 0 g carbs, fat and protein, so those count
   as 0 instead of making the total "unknown".                         */

export function macroValue(meal, key) {
  if (meal[key] != null) return meal[key];
  if (key !== 'kcal' && meal.kcal === 0) return 0;
  return null;
}

/** For each macro: { sum, unknown } where unknown = rows with no number. */
export function totals(meals) {
  const result = {};
  for (const { key } of MACROS) {
    let sum = 0;
    let unknown = 0;
    for (const meal of meals) {
      const v = macroValue(meal, key);
      if (v == null) unknown += 1;
      else sum += v;
    }
    result[key] = { sum, unknown };
  }
  return result;
}

/** "1,537", "42+" (some rows unknown), or "—" (nothing known). */
export function totalText(t) {
  if (t.unknown > 0 && t.sum === 0) return '—';
  return Math.round(t.sum).toLocaleString() + (t.unknown > 0 ? '+' : '');
}

/* ---------- Meal editor pop-up ---------- */

function warningsHTML(text) {
  return mealWarnings(text)
    .map((w) => `<div class="warn ${w.level}">${esc(w.msg)}</div>`)
    .join('');
}

const numVal = (v) => (v == null ? '' : v);

/**
 * Open the editor for one meal. mealId = null adds a new one.
 * onSaved() runs after Save or Delete so the screen can redraw.
 */
export async function editMeal(date, mealId, onSaved, defaultSlot = 'Snack') {
  const day = await getDay(date);
  const existing = day.meals.find((m) => m.id === mealId);
  const meal = existing || normalizeMeal({ slot: defaultSlot, kind: 'meal', optional: false });

  const slots = SLOT_ORDER.includes(meal.slot) ? SLOT_ORDER : [...SLOT_ORDER, meal.slot];

  const dlg = openDialog(`
    <form class="dlg" id="meal-form">
      <h2>${existing ? 'Edit' : 'Add'} · ${esc(shortLabel(date))}</h2>
      <label class="field">Name
        <input type="text" name="mealName" value="${esc(meal.name)}" required>
      </label>
      <label class="field">Details
        <textarea name="detail" rows="3">${esc(meal.detail)}</textarea>
      </label>
      <div id="meal-warn">${warningsHTML(`${meal.name} ${meal.detail}`)}</div>
      <div class="grid-2">
        <label class="field">When
          <select name="slot">${slots.map((s) => `<option ${s === meal.slot ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        </label>
        <label class="field">Type
          <select name="kind">${KINDS.map((k) => `<option value="${k.value}" ${k.value === meal.kind ? 'selected' : ''}>${k.label}</option>`).join('')}</select>
        </label>
      </div>
      <div class="grid-4">
        <label class="field">Calories <input type="number" inputmode="decimal" min="0" step="any" name="kcal" value="${numVal(meal.kcal)}" placeholder="—"></label>
        <label class="field">Protein g <input type="number" inputmode="decimal" min="0" step="any" name="protein" value="${numVal(meal.protein)}" placeholder="—"></label>
        <label class="field">Carbs g <input type="number" inputmode="decimal" min="0" step="any" name="carbs" value="${numVal(meal.carbs)}" placeholder="—"></label>
        <label class="field">Fat g <input type="number" inputmode="decimal" min="0" step="any" name="fat" value="${numVal(meal.fat)}" placeholder="—"></label>
      </div>
      <p class="muted small">Leave a number blank if you don't know it. Blank shows as a dash, not zero.</p>
      <label class="check"><input type="checkbox" name="optional" ${meal.optional ? 'checked' : ''}> Optional (only some days)</label>
      <div class="dlg-actions">
        ${existing ? '<button type="button" class="btn danger" data-act="delete">Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="cancel">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>`);

  const form = dlg.querySelector('#meal-form');

  // Re-check the rules as you type.
  form.addEventListener('input', (e) => {
    if (e.target.name === 'mealName' || e.target.name === 'detail') {
      form.querySelector('#meal-warn').innerHTML = warningsHTML(`${form.mealName.value} ${form.detail.value}`);
    }
  });

  form.querySelector('[data-act="cancel"]').addEventListener('click', closeDialog);

  const del = form.querySelector('[data-act="delete"]');
  if (del) {
    del.addEventListener('click', async () => {
      if (!(await confirmBox(`Delete "${meal.name}"?`, 'Delete', 'Keep it', true))) return;
      const fresh = await getDay(date);
      fresh.meals = fresh.meals.filter((m) => m.id !== mealId);
      await saveDay(fresh);
      toast('Deleted');
      onSaved();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updated = {
      ...meal,
      name: form.mealName.value.trim(),
      detail: form.detail.value.trim(),
      slot: form.slot.value,
      kind: form.kind.value,
      kcal: num(form.kcal.value),
      protein: num(form.protein.value),
      carbs: num(form.carbs.value),
      fat: num(form.fat.value),
      optional: form.optional.checked,
    };
    const fresh = await getDay(date);
    const i = fresh.meals.findIndex((m) => m.id === meal.id);
    if (i >= 0) fresh.meals[i] = updated;
    else fresh.meals.push(updated);
    await saveDay(fresh);
    closeDialog();
    toast('Saved');
    onSaved();
  });
}

/* ---------- Ideal day and copying ---------- */

/**
 * Your usual drink and supplement rows (Monster, tea, creatine, ...),
 * taken from the most recent day that has them. Optional ones are
 * left out. Nothing is hard-coded here.
 */
async function usualExtras() {
  const days = (await db.getAll('days')).sort((a, b) => b.date.localeCompare(a.date));
  for (const day of days) {
    const extras = day.meals.filter((m) => m.kind !== 'meal' && !m.optional);
    if (extras.length) return extras;
  }
  return [];
}

function copyMeal(m) {
  return { ...m, id: uid(), eaten: false };
}

/** Replace a day's meals with the ideal-day template plus your usual drinks. */
export async function applyIdealDay(date) {
  const template = await db.getSetting('idealDayTemplate', []);
  if (!template.length) {
    toast('No ideal-day template in your data.');
    return false;
  }
  const day = await getDay(date);
  if (day.meals.length && !(await confirmBox(`Replace the ${day.meals.length} rows on ${shortLabel(date)} with your ideal day?`, 'Replace'))) {
    return false;
  }
  const meals = template.map((t) => normalizeMeal({
    slot: t.slot,
    kind: 'meal',
    name: `Ideal ${String(t.slot).toLowerCase()}`,
    detail: t.items,
    kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat,
    eaten: false,
    optional: false,
  }));
  const extras = (await usualExtras()).map(copyMeal);
  day.meals = [...meals, ...extras];
  await saveDay(day);
  toast(`Ideal day added to ${shortLabel(date)}`);
  return true;
}

/** Copy meals (unticked) and the note from one day to another. */
export async function copyDay(fromDate, toDate) {
  const from = await getDay(fromDate);
  const to = await getDay(toDate);
  if (to.meals.length && !(await confirmBox(`${shortLabel(toDate)} already has ${to.meals.length} rows. Replace them?`, 'Replace'))) {
    return false;
  }
  to.meals = from.meals.map(copyMeal);
  to.note = from.note;
  await saveDay(to);
  toast(`Copied ${shortLabel(fromDate)} to ${shortLabel(toDate)}`);
  return true;
}

/**
 * Pop-up to pick the other day for a copy.
 *  - direction 'to':   copy `date` onto a day you pick (next 14 days)
 *  - direction 'from': copy a day you pick (any day with meals) onto `date`
 */
export async function copyDialog(date, direction, onDone) {
  let options;
  if (direction === 'to') {
    options = Array.from({ length: 14 }, (_, i) => addDays(date, i + 1));
  } else {
    options = (await db.getAll('days'))
      .filter((d) => d.meals.length && d.date !== date)
      .map((d) => d.date)
      .sort((a, b) => b.localeCompare(a));
    if (!options.length) {
      toast('No other days have meals to copy yet.');
      return;
    }
  }

  const title = direction === 'to' ? `Copy ${shortLabel(date)} to…` : `Copy a day onto ${shortLabel(date)}`;
  const dlg = openDialog(`
    <form class="dlg" id="copy-form">
      <h2>${esc(title)}</h2>
      <label class="field">${direction === 'to' ? 'Copy onto' : 'Copy from'}
        <select name="other">${options.map((d) => `<option value="${d}">${esc(shortLabel(d))}${d === dateKey() ? ' (today)' : ''}</option>`).join('')}</select>
      </label>
      <p class="muted small">Meals come over unticked. Water and scores are not copied.</p>
      <div class="dlg-actions">
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="cancel">Cancel</button>
        <button type="submit" class="btn primary">Copy</button>
      </div>
    </form>`);
  const form = dlg.querySelector('#copy-form');
  form.querySelector('[data-act="cancel"]').addEventListener('click', closeDialog);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const other = form.other.value;
    closeDialog();
    const ok = direction === 'to' ? await copyDay(date, other) : await copyDay(other, date);
    if (ok) onDone();
  });
}
