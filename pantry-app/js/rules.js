// rules.js — the diet rules, in one place.
//
// The personal parts (whose food is whose, what you never eat) are NOT
// written in this code. They come from your data file and are saved in
// the 'rules' setting, so nothing personal ends up in the public repo.
// You can see and edit them on the Settings screen.

import * as db from './db.js';

/** The live rules. app.js fills this from the database at startup. */
export const rules = {
  notMineFlags: [],   // tags meaning "not for my meals", e.g. a partner's food
  neverInMeals: [],   // words that should never appear in a meal
};

export const OCCASIONAL_FLAG = 'Occasional use';
export const USE_FIRST_FLAG = 'Use first';
export const LOW_FILL = 25; // "Low and out" means 25% or less

/** Load the rules from the database into the `rules` object. */
export async function loadRules() {
  const saved = await db.getSetting('rules', {});
  rules.notMineFlags = saved.notMineFlags || [];
  rules.neverInMeals = saved.neverInMeals || [];
}

/**
 * Work out starting rules from an imported data file:
 *  - tags that start with "Not ..." or end in "'s" (like a name) mark
 *    food that isn't yours
 *  - the first word(s) of each item in profile.dislikes are banned words
 */
export function deriveRules(json) {
  const allFlags = new Set((json.items || []).flatMap((i) => i.flags || []));
  const notMineFlags = [...allFlags].filter((f) => /^not\b/i.test(f) || /['’]s$/.test(f));
  const neverInMeals = ((json.profile && json.profile.dislikes) || [])
    .map((d) => String(d).split(/[(.,;]/)[0].trim().toLowerCase())
    .filter(Boolean);
  return { notMineFlags, neverInMeals };
}

/* ---------- Item checks ---------- */

export const isNotMine = (item) => item.flags.some((f) => rules.notMineFlags.includes(f));
export const isOccasional = (item) => item.flags.includes(OCCASIONAL_FLAG);
export const isUseFirst = (item) => item.flags.includes(USE_FIRST_FLAG);
export const isLow = (item) => item.fill != null && item.fill <= LOW_FILL;

/* ---------- Meal checks ---------- */

/** Is this row a meal, a drink or a supplement? Guessed from its name. */
export function guessKind(name) {
  const n = String(name).toLowerCase();
  if (/\b(creatine|magnesium|tincture|vitamin|supplement|capsule|calm)\b/.test(n)) return 'supplement';
  if (/\b(tea|coffee|soda|beer|seltzer|juice|monster|red bull|white claw|light sky|lipton|energy drink|kombucha)\b/.test(n)) return 'drink';
  return 'meal';
}

/** Rows that only apply some days (e.g. "optional", "on days 1 to 3"). */
export function guessOptional(meal) {
  return /\boptional\b|\bdays \d+ to \d+\b/i.test(`${meal.name || ''} ${meal.detail || ''}`);
}

// Plant-based brand names are stripped first, so "Beyond steak tips"
// or "MorningStar sausage" don't trip the meat check.
const PLANT_PHRASES = /\b(beyond|gardein|morningstar|imitation|plant[- ]based|vegan|veggie|meatless|house-autry)\b(\s+[\w']+){0,2}/gi;
const MEAT_WORDS = /\b(beef|steak|chicken|pork|bacon|ham|sausage|turkey|shrimp|fish|tuna|salmon|anchov\w*|lard|gelatin|bonito|meat)\b/i;
const RENNET_CHEESES = /\b(parmesan|parmigiano|romano|asiago|velveeta|pecorino|gruyere)\b/i;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check a meal's text against the rules. Returns a list of
 * { level: 'stop' | 'note', msg } to show in the meal editor.
 * The app warns; it never blocks you from saving.
 */
export function mealWarnings(text) {
  const warnings = [];
  const t = String(text || '');

  for (const word of rules.neverInMeals) {
    if (new RegExp(`\\b${escapeRegex(word)}`, 'i').test(t)) {
      warnings.push({ level: 'stop', msg: `Mentions ${word}. That's on your never list.` });
    }
  }

  const meat = t.replace(PLANT_PHRASES, '').match(MEAT_WORDS);
  if (meat) {
    warnings.push({ level: 'stop', msg: `"${meat[0]}" sounds like meat. Is this a plant-based version?` });
  }

  if (RENNET_CHEESES.test(t)) {
    warnings.push({ level: 'note', msg: 'This cheese likely uses animal rennet. Keep it a small topping, not the base of the meal.' });
  }

  return warnings;
}
