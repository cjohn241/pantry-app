// ui.js — small helpers every screen uses: escaping text, dates,
// the pop-up dialog, the toast message, tag chips and the jar gauge.

import { rules } from './rules.js';

/**
 * Make text safe to drop into HTML. ALWAYS wrap data in esc(...) when
 * building HTML strings, so a name like "Tom & Jerry's <best>" can't
 * break the page.
 */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** A new unique id for a row. */
export function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ---------- Dates ----------
   Days are stored as 'YYYY-MM-DD' text in the tablet's local time,
   the same way the data file writes them.                          */

export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** "Sat, Oct 17" */
export function shortLabel(key) {
  return keyToDate(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Saturday, October 17" */
export function longLabel(key) {
  return keyToDate(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** 1556 -> "1,556". null -> "—" (unknown, not zero). */
export function fmt(n) {
  return n == null ? '—' : Math.round(n).toLocaleString();
}

/* ---------- Toast: a short message at the bottom ---------- */

let toastTimer = null;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- Dialog (pop-up) ----------
   There is one <dialog> in index.html. openDialog fills it with HTML
   and shows it. Tapping the dark area outside closes it.            */

const dialog = () => document.getElementById('dialog');

export function openDialog(html) {
  const dlg = dialog();
  dlg.returnValue = '';
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  return dlg;
}

export function closeDialog() {
  const dlg = dialog();
  if (dlg.open) dlg.close();
}

// Close when tapping the backdrop (the click lands on <dialog> itself).
document.addEventListener('click', (e) => {
  if (e.target === dialog()) closeDialog();
});

/** Ask a yes/no question. Resolves true if OK was tapped. */
export function confirmBox(message, okLabel = 'OK', cancelLabel = 'Cancel', danger = false) {
  return new Promise((resolve) => {
    const dlg = openDialog(`
      <div class="dlg">
        <p class="dlg-msg">${esc(message)}</p>
        <div class="dlg-actions">
          <span class="spacer"></span>
          <button type="button" class="btn" data-answer="no">${esc(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-answer="yes">${esc(okLabel)}</button>
        </div>
      </div>`);
    // The buttons answer directly. If the pop-up is closed some other way
    // (back button, tapping outside), that counts as Cancel.
    let answered = false;
    const answer = (yes) => {
      if (answered) return;
      answered = true;
      closeDialog();
      resolve(yes);
    };
    dlg.querySelectorAll('[data-answer]').forEach((b) =>
      b.addEventListener('click', () => answer(b.dataset.answer === 'yes')));
    dlg.addEventListener('close', () => answer(false), { once: true });
  });
}

/* ---------- Tag chips ---------- */

const OCCASIONAL_FLAGS = ['Occasional use', 'Animal rennet', 'Likely animal rennet'];
const USE_FIRST_FLAGS = ['Use first', 'Finish first'];

/** The CSS class that colors a tag chip. */
function chipClass(flag) {
  if (rules.notMineFlags.includes(flag)) return 'not-mine';
  if (flag === 'Vegetarian' || flag === 'Vegan') return 'veg';
  if (OCCASIONAL_FLAGS.includes(flag)) return 'occasional';
  if (USE_FIRST_FLAGS.includes(flag)) return 'usefirst';
  if (flag === 'Homemade') return 'homemade';
  return '';
}

export function chip(flag) {
  return `<span class="chip ${chipClass(flag)}">${esc(flag)}</span>`;
}

export function locationChip(location) {
  return `<span class="chip loc">${esc(location)}</span>`;
}

/* ---------- Jar fill gauge ---------- */

/** A little jar filled to `fill` percent. null = unknown, shows "?". */
export function gauge(fill, large = false) {
  const known = fill != null;
  const pct = known ? Math.max(0, Math.min(100, fill)) : 0;
  const level = !known ? 'unknown' : pct <= 25 ? 'low' : pct <= 50 ? 'mid' : 'ok';
  const label = known ? `${pct}% full` : 'Fill unknown';
  return `
    <span class="jar ${level} ${large ? 'large' : ''}" role="img" aria-label="${label}">
      <span class="jar-lid"></span>
      <span class="jar-body">
        <span class="jar-fill" style="height:${pct}%"></span>
        ${known ? '' : '<span class="jar-q">?</span>'}
      </span>
    </span>`;
}

/** "85%" or "?" */
export function pctText(fill) {
  return fill == null ? '?' : `${fill}%`;
}

/* ---------- Small icons used in a few places ---------- */

export const ICONS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h11l2-8H6.2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
};
