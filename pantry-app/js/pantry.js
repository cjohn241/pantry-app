// pantry.js — every item grouped by category with a jar gauge.
// Search, filter by location, "Low and out", tap to change fill,
// one tap to add to groceries, and add / edit / delete items.

import * as db from './db.js';
import { esc, uid, gauge, pctText, chip, locationChip, openDialog, closeDialog, confirmBox, toast, ICONS } from './ui.js';
import { isUseFirst, isNotMine, isLow, LOW_FILL, rules } from './rules.js';
import { addGrocery } from './groceries.js';

// Filters stay set while you move between screens.
const filters = { q: '', location: 'All', lowOnly: false };

// Quick fill buttons in the item pop-up.
const QUICK_FILLS = [
  { label: 'Full', value: 100 },
  { label: 'Most', value: 75 },
  { label: 'Half', value: 50 },
  { label: 'Low', value: 25 },
  { label: 'Out', value: 0 },
];

// Tags offered as tick boxes when editing an item.
const KEY_TAGS = ['Vegetarian', 'Use first', 'Homemade', 'Occasional use'];

/* ---------- Filtering and grouping ---------- */

function matches(item) {
  if (filters.location !== 'All' && item.location !== filters.location) return false;
  if (filters.lowOnly && !isLow(item)) return false;
  if (filters.q) {
    const hay = `${item.name} ${item.detail} ${item.notes} ${item.category} ${item.flags.join(' ')}`.toLowerCase();
    // Every word you type must appear somewhere.
    if (!filters.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

const byOrderThenName = (a, b) => a.order - b.order || a.name.localeCompare(b.name);

/** [{ title, items }] with "Use first" on top and other people's food last. */
function groupItems(items) {
  const groups = [];
  const useFirst = items.filter(isUseFirst).sort(byOrderThenName);
  if (useFirst.length) groups.push({ title: 'Use first', items: useFirst });

  const byCategory = new Map();
  for (const item of items.filter((i) => !isUseFirst(i))) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  // A category where every item isn't yours (someone else's meat, say) goes last.
  const allNotMine = (list) => list.every(isNotMine);
  const categories = [...byCategory.keys()].sort((a, b) =>
    allNotMine(byCategory.get(a)) - allNotMine(byCategory.get(b)) || a.localeCompare(b));
  for (const c of categories) groups.push({ title: c, items: byCategory.get(c).sort(byOrderThenName) });
  return groups;
}

function itemRow(item, onList) {
  return `
    <div class="item ${isNotMine(item) ? 'not-mine' : ''}" data-id="${esc(item.id)}">
      <button class="item-main" data-act="open">
        ${gauge(item.fill)}
        <span class="item-text">
          <span class="item-name">${esc(item.name)}</span>
          ${item.detail ? `<span class="item-detail">${esc(item.detail)}</span>` : ''}
          <span class="chips">${locationChip(item.location)}${item.flags.map(chip).join('')}</span>
        </span>
        <span class="item-pct">${pctText(item.fill)}</span>
      </button>
      <button class="icon-btn ${onList ? 'on' : ''}" data-act="cart"
        aria-label="${onList ? 'On the grocery list' : 'Add to groceries'}">${onList ? ICONS.check : ICONS.cart}</button>
    </div>`;
}

/* ---------- Draw the screen ---------- */

export async function render(main) {
  const locations = await db.getSetting('locations', []);
  const redrawList = () => renderList(main.querySelector('#pantry-list'));

  main.innerHTML = `
    <header class="screen-head">
      <h1>Pantry</h1>
      <span class="spacer"></span>
      <button class="btn primary" data-act="add">${ICONS.plus} Add item</button>
    </header>
    <div class="pantry-controls">
      <div class="top">
        <input type="search" id="pantry-q" placeholder="Search" value="${esc(filters.q)}" aria-label="Search the pantry">
        <button class="btn" data-act="low" aria-pressed="${filters.lowOnly}">Low and out</button>
      </div>
      <div class="seg scroll" role="group" aria-label="Location">
        ${['All', ...locations].map((l) => `<button data-act="loc" data-loc="${esc(l)}" aria-pressed="${filters.location === l}">${esc(l)}</button>`).join('')}
      </div>
    </div>
    <div id="pantry-list"></div>`;

  // "Low and out" shows pressed like the location buttons.
  const lowBtn = main.querySelector('[data-act="low"]');
  const paintLow = () => {
    lowBtn.classList.toggle('primary', filters.lowOnly);
    lowBtn.setAttribute('aria-pressed', filters.lowOnly);
  };
  paintLow();

  // Typing only redraws the list, so the search box keeps focus.
  main.querySelector('#pantry-q').addEventListener('input', (e) => {
    filters.q = e.target.value.trim();
    redrawList();
  });

  main.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.closest('.item')?.dataset.id;

    if (act === 'loc') {
      filters.location = btn.dataset.loc;
      main.querySelectorAll('[data-act="loc"]').forEach((b) => b.setAttribute('aria-pressed', b === btn));
      redrawList();
    } else if (act === 'low') {
      filters.lowOnly = !filters.lowOnly;
      paintLow();
      redrawList();
    } else if (act === 'add') {
      editItemDialog(null, redrawList);
    } else if (act === 'open') {
      openItemDialog(id, redrawList);
    } else if (act === 'cart') {
      const item = await db.get('items', id);
      const added = await addGrocery(item.name, item.id);
      toast(added ? `Added ${item.name} to groceries` : `${item.name} is already on the list`);
      redrawList();
    }
  };

  await redrawList();
}

async function renderList(el) {
  const [items, groceries] = await Promise.all([db.getAll('items'), db.getAll('groceries')]);
  const onList = new Set(groceries.filter((g) => !g.checked).map((g) => g.itemId));
  const shown = items.filter(matches);
  const groups = groupItems(shown);

  el.innerHTML = `
    <p class="muted">Showing ${shown.length} of ${items.length} items${filters.lowOnly ? ` at ${LOW_FILL}% or less` : ''}.</p>
    ${groups.map((g) => `
      <div class="group-head"><h2>${esc(g.title)}</h2><span class="count">${g.items.length}</span></div>
      <div class="items">${g.items.map((i) => itemRow(i, onList.has(i.id))).join('')}</div>
    `).join('')}
    ${shown.length ? '' : '<div class="empty"><p class="muted">Nothing matches.</p></div>'}`;
}

/* ---------- Item pop-up: change fill ---------- */

/** Open an item to change its fill. onChange() redraws whatever is behind. */
export async function openItemDialog(id, onChange) {
  const item = await db.get('items', id);
  if (!item) return;

  const dlg = openDialog(`
    <div class="dlg">
      <h2>${esc(item.name)}</h2>
      ${item.detail ? `<p class="muted">${esc(item.detail)}</p>` : ''}
      ${item.notes ? `<p>${esc(item.notes)}</p>` : ''}
      <div class="chips">${locationChip(item.location)}${item.flags.map(chip).join('')}</div>
      <div class="fill-now"><span id="fill-gauge">${gauge(item.fill, true)}</span><b id="fill-num">${pctText(item.fill)}</b></div>
      <div class="seg" role="group" aria-label="Quick fill">
        ${QUICK_FILLS.map((q) => `<button data-fill="${q.value}" aria-pressed="${item.fill === q.value}">${q.label}</button>`).join('')}
      </div>
      <input type="range" id="fill-range" min="0" max="100" step="5" value="${item.fill ?? 50}" aria-label="Fill percent">
      <div class="dlg-actions">
        <button class="btn" data-act="cart">${ICONS.cart} Add to groceries</button>
        <button class="btn" data-act="edit">Edit</button>
        <span class="spacer"></span>
        <button class="btn primary" data-act="done">Done</button>
      </div>
    </div>`);

  const show = (fill) => {
    dlg.querySelector('#fill-gauge').innerHTML = gauge(fill, true);
    dlg.querySelector('#fill-num').textContent = pctText(fill);
    dlg.querySelectorAll('[data-fill]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.fill) === fill));
  };

  // Each change saves right away, so closing the pop-up never loses it.
  const save = async (fill) => {
    item.fill = fill;
    show(fill);
    await db.put('items', item);
    onChange();
  };

  dlg.querySelectorAll('[data-fill]').forEach((b) => b.addEventListener('click', () => {
    const value = Number(b.dataset.fill);
    dlg.querySelector('#fill-range').value = value;
    save(value);
  }));
  const range = dlg.querySelector('#fill-range');
  range.addEventListener('input', () => show(Number(range.value)));
  range.addEventListener('change', () => save(Number(range.value)));

  dlg.querySelector('[data-act="done"]').addEventListener('click', closeDialog);
  dlg.querySelector('[data-act="edit"]').addEventListener('click', () => editItemDialog(item, onChange));
  dlg.querySelector('[data-act="cart"]').addEventListener('click', async () => {
    const added = await addGrocery(item.name, item.id);
    toast(added ? 'Added to groceries' : 'Already on the list');
    onChange();
  });
}

/* ---------- Item pop-up: add or edit details ---------- */

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
}

/** item = null adds a new one. */
export async function editItemDialog(item, onChange) {
  const [locations, allItems] = await Promise.all([db.getSetting('locations', []), db.getAll('items')]);
  const categories = [...new Set(allItems.map((i) => i.category))].sort();
  const isNew = !item;
  const it = item || { id: '', name: '', category: '', location: locations[0] || 'Pantry', detail: '', notes: '', fill: 100, flags: [], order: 999 };

  // The tick-box tags, plus "not mine" tags from your rules.
  const tickTags = [...new Set([...KEY_TAGS, ...rules.notMineFlags])];
  const otherTags = it.flags.filter((f) => !tickTags.includes(f));

  const dlg = openDialog(`
    <form class="dlg" id="item-form">
      <h2>${isNew ? 'Add an item' : 'Edit item'}</h2>
      <label class="field">Name <input type="text" name="itemName" value="${esc(it.name)}" required></label>
      <div class="grid-2">
        <label class="field">Category
          <input type="text" name="category" value="${esc(it.category)}" list="category-list" required>
          <datalist id="category-list">${categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        </label>
        <label class="field">Location
          <select name="location">${locations.map((l) => `<option ${l === it.location ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        </label>
      </div>
      <label class="field">Details <span class="hint">Size, brand, how much is left</span>
        <input type="text" name="detail" value="${esc(it.detail)}">
      </label>
      <label class="field">Notes <textarea name="notes" rows="2">${esc(it.notes)}</textarea></label>
      <label class="field">Fill % <input type="number" name="fill" min="0" max="100" step="1" inputmode="numeric" value="${it.fill ?? ''}" placeholder="? (unknown)"></label>
      <fieldset class="field" style="border:0;padding:0;margin:0">
        <legend style="font-weight:600;font-size:16px;margin-bottom:4px">Tags</legend>
        <div class="grid-2">
          ${tickTags.map((t) => `<label class="check"><input type="checkbox" name="tag" value="${esc(t)}" ${it.flags.includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}
        </div>
      </fieldset>
      <label class="field">Other tags <span class="hint">Separate with commas</span>
        <input type="text" name="otherTags" value="${esc(otherTags.join(', '))}">
      </label>
      <div class="dlg-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" data-act="delete">Delete</button>'}
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="cancel">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>`);

  const form = dlg.querySelector('#item-form');
  form.querySelector('[data-act="cancel"]').addEventListener('click', closeDialog);

  const del = form.querySelector('[data-act="delete"]');
  if (del) {
    del.addEventListener('click', async () => {
      if (!(await confirmBox(`Delete "${it.name}" from the pantry?`, 'Delete', 'Keep it', true))) return;
      await db.remove('items', it.id);
      toast('Deleted');
      onChange();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticked = [...form.querySelectorAll('input[name="tag"]:checked')].map((c) => c.value);
    const typed = form.otherTags.value.split(',').map((s) => s.trim()).filter(Boolean);
    const fillText = form.fill.value.trim();
    const saved = {
      ...it,
      id: it.id || `${slug(form.itemName.value) || 'item'}-${uid().slice(0, 6)}`,
      name: form.itemName.value.trim(),
      category: form.category.value.trim() || 'Other',
      location: form.location.value,
      detail: form.detail.value.trim(),
      notes: form.notes.value.trim(),
      fill: fillText === '' ? null : Math.max(0, Math.min(100, Number(fillText))),
      flags: [...new Set([...ticked, ...typed])],
    };
    await db.put('items', saved);
    closeDialog();
    toast(isNew ? 'Item added' : 'Saved');
    onChange();
  });
}
