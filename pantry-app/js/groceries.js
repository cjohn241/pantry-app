// groceries.js — the shopping list. Type to add, tick while shopping,
// "Done shopping" clears ticked items and can mark them Full in the
// pantry. Suggestions are pantry items at 25% or less.

import * as db from './db.js';
import { esc, uid, gauge, pctText, chip, locationChip, openDialog, closeDialog, toast, ICONS } from './ui.js';
import { isLow, isNotMine, rules, LOW_FILL } from './rules.js';

// Standing reminder for the tortoise. Edit the wording here if it changes.
const PET_ITEMS = [
  'Tortoise greens: collard, turnip, or mustard (1 head)',
  'Tortoise: yellow squash or zucchini (1)',
];

/**
 * Add something to the list. itemId links it to a pantry item.
 * Returns false if it's already on the list (unticked).
 */
export async function addGrocery(name, itemId = null) {
  const list = await db.getAll('groceries');
  const clean = name.trim();
  if (!clean) return false;

  // Typed text that exactly matches a pantry item gets linked to it.
  if (!itemId) {
    const items = await db.getAll('items');
    const match = items.find((i) => i.name.toLowerCase() === clean.toLowerCase());
    if (match) itemId = match.id;
  }

  const already = list.some((g) => !g.checked && (
    (itemId && g.itemId === itemId) || g.name.toLowerCase() === clean.toLowerCase()));
  if (already) return false;

  await db.put('groceries', { id: uid(), name: clean, itemId, checked: false, addedAt: Date.now() });
  return true;
}

function groceryRow(g, item) {
  return `
    <div class="g-row ${g.checked ? 'checked' : ''}" data-id="${esc(g.id)}">
      <button class="tick" data-act="check" aria-pressed="${g.checked}" aria-label="${g.checked ? 'Untick' : 'Tick'} ${esc(g.name)}">${ICONS.check}</button>
      <span class="grow">
        <span class="g-name">${esc(g.name)}</span>
        ${item ? `<span class="chips">${locationChip(item.location)}<span class="chip">${pctText(item.fill)} left</span>${isNotMine(item) ? item.flags.filter((f) => rules.notMineFlags.includes(f)).map(chip).join('') : ''}</span>` : ''}
      </span>
      <button class="icon-btn" data-act="remove" aria-label="Remove ${esc(g.name)}">${ICONS.x}</button>
    </div>`;
}

export async function render(main) {
  const [list, items] = await Promise.all([db.getAll('groceries'), db.getAll('items')]);
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const redraw = () => render(main);

  list.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  const toBuy = list.filter((g) => !g.checked);
  const inCart = list.filter((g) => g.checked);

  const onListIds = new Set(list.map((g) => g.itemId).filter(Boolean));
  const suggested = items
    .filter((i) => isLow(i) && !onListIds.has(i.id))
    .sort((a, b) => a.fill - b.fill || a.name.localeCompare(b.name));

  const petMissing = PET_ITEMS.filter((f) => !toBuy.some((g) => g.name === f));

  main.innerHTML = `
    <header class="screen-head"><h1>Groceries</h1></header>

    <form class="add-row card" id="g-add">
      <input type="text" name="itemText" placeholder="Add an item" autocomplete="off" list="pantry-names" aria-label="Item to add">
      <datalist id="pantry-names">${items.map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist>
      <button class="btn primary" type="submit">${ICONS.plus} Add</button>
    </form>

    <section class="card pet-card">
      <div class="card-head">
        <h2>For the tortoise</h2>
        <span class="spacer"></span>
        ${petMissing.length
          ? `<button class="btn small" data-act="pet">${ICONS.plus} Add to list</button>`
          : '<span class="small">On the list</span>'}
      </div>
      <p>1 head of greens (collard, turnip, or mustard, whichever looks nicest) and 1 yellow squash or zucchini.</p>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>To buy</h2><span class="muted">${toBuy.length}</span>
      </div>
      ${toBuy.length ? toBuy.map((g) => groceryRow(g, itemsById.get(g.itemId))).join('') : '<p class="muted">The list is empty.</p>'}
      ${inCart.length ? `
        <div class="slot-head" style="margin-top:18px">In the cart · ${inCart.length}</div>
        ${inCart.map((g) => groceryRow(g, itemsById.get(g.itemId))).join('')}` : ''}
      <div style="margin-top:16px">
        <button class="btn primary big wide" data-act="done" ${inCart.length ? '' : 'disabled'}>Done shopping</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Suggested</h2>
        <span class="muted">${suggested.length} at ${LOW_FILL}% or less</span>
      </div>
      ${suggested.length ? `<ul class="list-plain">${suggested.map((i) => `
        <li class="g-row ${isNotMine(i) ? 'not-mine' : ''}" data-item="${esc(i.id)}">
          ${gauge(i.fill)}
          <span class="grow">
            <span class="g-name">${esc(i.name)}</span>
            <span class="chips">${locationChip(i.location)}${i.flags.filter((f) => rules.notMineFlags.includes(f)).map(chip).join('')}</span>
          </span>
          <span class="item-pct">${pctText(i.fill)}</span>
          <button class="btn small" data-act="suggest">${ICONS.plus} Add</button>
        </li>`).join('')}</ul>` : '<p class="muted">Nothing is running low.</p>'}
    </section>`;

  main.querySelector('#g-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.itemText;
    const text = input.value.trim();
    if (!text) return;
    const added = await addGrocery(text);
    if (!added) toast('Already on the list');
    await redraw();
    main.querySelector('#g-add input').focus(); // ready for the next item
  });

  main.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.closest('.g-row')?.dataset.id;

    if (act === 'check') {
      const g = await db.get('groceries', id);
      g.checked = !g.checked;
      await db.put('groceries', g);
      redraw();
    } else if (act === 'remove') {
      await db.remove('groceries', id);
      redraw();
    } else if (act === 'suggest') {
      const item = itemsById.get(btn.closest('[data-item]').dataset.item);
      await addGrocery(item.name, item.id);
      toast(`Added ${item.name}`);
      redraw();
    } else if (act === 'pet') {
      for (const name of petMissing) await addGrocery(name);
      redraw();
    } else if (act === 'done') {
      doneShopping(inCart, itemsById, redraw);
    }
  };
}

/** Clear ticked items; offer to mark the linked pantry items Full. */
function doneShopping(inCart, itemsById, redraw) {
  const linked = inCart.filter((g) => itemsById.has(g.itemId));

  const finish = async (markIds) => {
    for (const itemId of markIds) {
      const item = itemsById.get(itemId);
      await db.put('items', { ...item, fill: 100 });
    }
    for (const g of inCart) await db.remove('groceries', g.id);
    closeDialog();
    toast(markIds.length ? `Cleared. ${markIds.length} pantry items marked Full.` : 'List cleared');
    redraw();
  };

  if (!linked.length) {
    finish([]);
    return;
  }

  const dlg = openDialog(`
    <form class="dlg" id="done-form">
      <h2>Mark these Full in the pantry?</h2>
      <p class="muted">Untick anything you didn't actually get.</p>
      <div>
        ${linked.map((g) => `<label class="check"><input type="checkbox" name="mark" value="${esc(g.itemId)}" checked> ${esc(itemsById.get(g.itemId).name)}</label>`).join('')}
      </div>
      ${inCart.length > linked.length ? `<p class="muted small">${inCart.length - linked.length === 1 ? '1 other ticked item is' : `${inCart.length - linked.length} other ticked items are`} not in the pantry and will just be cleared. Add new things on the Pantry screen if you want to track them.</p>` : ''}
      <div class="dlg-actions">
        <button type="button" class="btn" data-act="just-clear">Just clear the list</button>
        <span class="spacer"></span>
        <button type="submit" class="btn primary">Mark Full and clear</button>
      </div>
    </form>`);

  const form = dlg.querySelector('#done-form');
  form.querySelector('[data-act="just-clear"]').addEventListener('click', () => finish([]));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    finish([...form.querySelectorAll('input[name="mark"]:checked')].map((c) => c.value));
  });
}
