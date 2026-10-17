// recipes.js — recipe cards and the weekly prep checklist.

import * as db from './db.js';
import { esc, uid, fmt, confirmBox, toast, ICONS } from './ui.js';

function recipeCard(r) {
  const facts = [
    r.servings != null ? `${r.servings} serving${r.servings === 1 ? '' : 's'}` : '',
    r.kcal != null ? `${fmt(r.kcal)} kcal` : '',
    r.protein != null ? `${fmt(r.protein)} g protein` : '',
  ].filter(Boolean).join(' · ');

  return `
    <article class="card">
      <h2>${esc(r.name)}</h2>
      ${facts ? `<p class="muted">${facts}</p>` : ''}
      ${r.ingredients.length ? `<h3>Ingredients</h3><ul>${r.ingredients.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      ${r.steps.length ? `<h3>Steps</h3><ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      ${r.note ? `<p class="note" style="margin-top:12px">${esc(r.note)}</p>` : ''}
    </article>`;
}

export async function render(main) {
  const [recipes, prep] = await Promise.all([db.getAll('recipes'), db.getAll('prep')]);
  prep.sort((a, b) => a.order - b.order);
  recipes.sort((a, b) => a.order - b.order);
  const doneCount = prep.filter((p) => p.done).length;
  const redraw = () => render(main);

  main.innerHTML = `
    <header class="screen-head"><h1>Recipes and prep</h1></header>

    <section class="card">
      <div class="card-head">
        <h2>Weekly prep</h2>
        <span class="muted">${doneCount} of ${prep.length} done</span>
        <span class="spacer"></span>
        <button class="btn small" data-act="reset" ${doneCount ? '' : 'disabled'}>New week</button>
      </div>
      ${prep.map((p) => `
        <div class="g-row ${p.done ? 'checked' : ''}" data-id="${esc(p.id)}">
          <button class="tick" data-act="tick" aria-pressed="${p.done}" aria-label="${p.done ? 'Untick' : 'Tick'}">${ICONS.check}</button>
          <span class="grow g-name">${esc(p.text)}</span>
          <button class="icon-btn" data-act="remove" aria-label="Remove task">${ICONS.x}</button>
        </div>`).join('')}
      <form class="add-row" id="prep-add" style="margin-top:12px">
        <input type="text" name="taskText" placeholder="Add a prep task" autocomplete="off" aria-label="New prep task">
        <button class="btn" type="submit">${ICONS.plus} Add</button>
      </form>
    </section>

    <div class="recipe-grid">
      ${recipes.length ? recipes.map(recipeCard).join('') : '<p class="muted">No recipes yet.</p>'}
    </div>`;

  main.querySelector('#prep-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = e.target.taskText.value.trim();
    if (!text) return;
    const order = prep.length ? Math.max(...prep.map((p) => p.order)) + 1 : 0;
    await db.put('prep', { id: uid(), text, done: false, order });
    redraw();
  });

  main.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset.id;

    if (btn.dataset.act === 'tick') {
      const task = await db.get('prep', id);
      task.done = !task.done;
      await db.put('prep', task);
      redraw();
    } else if (btn.dataset.act === 'remove') {
      if (!(await confirmBox('Remove this prep task?', 'Remove', 'Keep it', true))) return;
      await db.remove('prep', id);
      redraw();
    } else if (btn.dataset.act === 'reset') {
      if (!(await confirmBox('Untick every prep task for a new week?', 'New week'))) return;
      for (const task of prep) await db.put('prep', { ...task, done: false });
      toast('Fresh week');
      redraw();
    }
  };
}
