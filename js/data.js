// data.js — Import and Export.
//
// Export writes ONE JSON file in the same shape as pantry-data.json,
// plus your logs (eaten ticks, water, energy, focus, prep ticks).
// Import reads either that export or the original pantry-data.json.
// Because both directions use the same shape, Claude can read an
// export, change it, and hand it back for you to import.

import * as db from './db.js';
import { uid, dateKey, shortLabel } from './ui.js';
import { guessKind, guessOptional, deriveRules, loadRules } from './rules.js';

export const SCHEMA_VERSION = 1;   // shape of the data file
export const APP_VERSION = '1.0.0'; // shown in Settings. Keep in step with CACHE_NAME in sw.js

export const DEFAULT_LOCATIONS = [
  'Pantry', 'Spice drawer', 'Sauce cabinet', 'Dinner cabinet', 'Fridge', 'Freezer', 'Deep freeze',
];

// Used only when starting empty. Your real targets come from your data file.
const DEFAULT_TARGETS = { calories: 2000, protein_g: 100, carbs_g: 225, fat_g: 65 };

/** Turn anything into a number, or null if it's blank or not a number. */
export function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const isDateKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));

/* ---------- Clean up each kind of row ----------
   These make sure every row has every field, with the right type,
   no matter which file it came from. Running them twice changes
   nothing, so export -> import gives back exactly the same data.    */

export function normalizeMeal(m) {
  return {
    id: m.id || uid(),
    slot: m.slot || 'Snack',
    kind: m.kind || guessKind(m.name || ''),
    name: m.name || '',
    detail: m.detail || '',
    kcal: num(m.kcal),
    protein: num(m.protein),
    carbs: num(m.carbs),
    fat: num(m.fat),
    // Rows in the "Logged" slot were already eaten when they were written.
    eaten: m.eaten !== undefined ? Boolean(m.eaten) : m.slot === 'Logged',
    optional: m.optional !== undefined ? Boolean(m.optional) : guessOptional(m),
  };
}

function normalizeItem(it) {
  return {
    id: it.id || uid(),
    name: it.name || 'Unnamed item',
    category: it.category || 'Other',
    location: it.location || 'Pantry',
    detail: it.detail || '',
    notes: it.notes || '',
    fill: num(it.fill),
    flags: Array.isArray(it.flags) ? it.flags.map(String) : [],
    order: num(it.order) ?? 999,
  };
}

function normalizeDay(d) {
  return {
    date: d.date || d.id,
    note: d.note || '',
    meals: (d.meals || []).map(normalizeMeal),
    water_oz: num(d.water_oz) ?? 0,
    energy: num(d.energy),
    focus: num(d.focus),
  };
}

function normalizeGrocery(g, index) {
  if (typeof g === 'string') return { id: uid(), name: g, itemId: null, checked: false, addedAt: index };
  return {
    id: g.id || uid(),
    name: g.name || g.text || '',
    itemId: g.itemId || null,
    checked: Boolean(g.checked),
    addedAt: num(g.addedAt) ?? index, // keeps the list in the order things were added
  };
}

function normalizeRecipe(r, index) {
  return {
    id: r.id || uid(),
    order: index,
    name: r.name || 'Recipe',
    servings: num(r.servings),
    kcal: num(r.kcal),
    protein: num(r.protein),
    ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(String) : [],
    steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
    note: r.note || '',
  };
}

function normalizePrep(p, index) {
  if (typeof p === 'string') return { id: uid(), text: p, done: false, order: index };
  return { id: p.id || uid(), text: p.text || '', done: Boolean(p.done), order: index };
}

function normalizeTargets(t) {
  const src = t || {};
  return {
    ...src, // keeps extra notes like "source" and "stepBonus"
    calories: num(src.calories) ?? DEFAULT_TARGETS.calories,
    protein_g: num(src.protein_g) ?? DEFAULT_TARGETS.protein_g,
    carbs_g: num(src.carbs_g) ?? DEFAULT_TARGETS.carbs_g,
    fat_g: num(src.fat_g) ?? DEFAULT_TARGETS.fat_g,
  };
}

/* ---------- Import ---------- */

/**
 * Replace everything on the device with the contents of `json`.
 * Returns counts so the screen can say what was loaded.
 */
export async function importJSON(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.items)) {
    throw new Error("This file doesn't look like pantry data. It has no \"items\" list.");
  }

  const rows = {
    items: json.items.map(normalizeItem),
    days: (json.mealPlan || []).map(normalizeDay).filter((d) => isDateKey(d.date)),
    groceries: (json.grocery || []).map(normalizeGrocery).filter((g) => g.name),
    recipes: (json.recipes || []).map(normalizeRecipe),
    prep: (json.weeklyPrep || []).map(normalizePrep),
    settings: [
      { key: 'profile', value: json.profile || {} },
      { key: 'targets', value: normalizeTargets(json.targets) },
      { key: 'locations', value: Array.isArray(json.locations) && json.locations.length ? json.locations : DEFAULT_LOCATIONS },
      { key: 'idealDayTemplate', value: Array.isArray(json.idealDayTemplate) ? json.idealDayTemplate : [] },
      { key: 'notes', value: Array.isArray(json.notes) ? json.notes : [] },
      { key: 'rules', value: json.rules || deriveRules(json) },
      {
        key: 'meta',
        value: {
          schemaVersion: SCHEMA_VERSION,
          importedAt: new Date().toISOString(),
          // An exported file is itself a backup, so count it as the last export.
          lastExport: json.app === 'pantry-meals' ? json.exportedAt || null : null,
        },
      },
    ],
  };

  await db.replaceAll(rows);
  await loadRules();
  return { items: rows.items.length, days: rows.days.length };
}

/** Start with no pantry data (still lets you use the app). */
export function startEmpty() {
  return importJSON({ items: [] });
}

/** Read a File the user picked, then import it. */
export async function importFile(file) {
  const text = await file.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON. Pick the .json file you exported or downloaded.");
  }
  return importJSON(json);
}

/* ---------- Export ---------- */

export async function buildExport() {
  const [items, days, groceries, recipes, prep, settingRows] = await Promise.all([
    db.getAll('items'), db.getAll('days'), db.getAll('groceries'),
    db.getAll('recipes'), db.getAll('prep'), db.getAll('settings'),
  ]);
  const s = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

  return {
    app: 'pantry-meals',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    notes: s.notes || [],
    profile: s.profile || {},
    targets: s.targets,
    rules: s.rules,
    locations: s.locations,
    items: items.sort((a, b) => a.id.localeCompare(b.id)),
    grocery: groceries,
    mealPlan: days
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ id: d.date, label: shortLabel(d.date), ...d })),
    recipes: recipes.sort((a, b) => a.order - b.order),
    weeklyPrep: prep.sort((a, b) => a.order - b.order).map(({ text, done }) => ({ text, done })),
    idealDayTemplate: s.idealDayTemplate || [],
  };
}

function exportFileName() {
  return `pantry-data-${dateKey()}.json`;
}

async function markExported(exportedAt) {
  const meta = await db.getSetting('meta', {});
  await db.setSetting('meta', { ...meta, lastExport: exportedAt });
}

/** Save the export as a file in Downloads. */
export async function downloadExport() {
  const data = await buildExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  await markExported(data.exportedAt);
  return a.download;
}

/** True if this tablet can share files (to Drive, email, etc.). */
export function canShareFiles() {
  try {
    const test = new File(['{}'], 'x.json', { type: 'application/json' });
    return Boolean(navigator.canShare && navigator.canShare({ files: [test] }));
  } catch {
    return false;
  }
}

/** Open the Android share sheet with the export file. */
export async function shareExport() {
  const data = await buildExport();
  const file = new File([JSON.stringify(data, null, 2)], exportFileName(), { type: 'application/json' });
  await navigator.share({ files: [file], title: 'Pantry & Meals backup' });
  await markExported(data.exportedAt);
}
