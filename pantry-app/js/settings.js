// settings.js — targets, diet rules, backup (export / import).

import * as db from './db.js';
import { esc, toast, confirmBox } from './ui.js';
import { downloadExport, shareExport, canShareFiles, importFile, num, APP_VERSION } from './data.js';
import { loadRules } from './rules.js';

const TARGET_FIELDS = [
  { key: 'calories', label: 'Calories' },
  { key: 'protein_g', label: 'Protein g' },
  { key: 'carbs_g', label: 'Carbs g' },
  { key: 'fat_g', label: 'Fat g' },
];

function when(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const splitList = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);

export async function render(main) {
  const [targets, rulesSaved, meta, profile] = await Promise.all([
    db.getSetting('targets', {}),
    db.getSetting('rules', { notMineFlags: [], neverInMeals: [] }),
    db.getSetting('meta', {}),
    db.getSetting('profile', {}),
  ]);
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const redraw = () => render(main);

  main.innerHTML = `
    <header class="screen-head"><h1>Settings</h1></header>

    <section class="card">
      <h2>Daily targets</h2>
      <form id="targets-form">
        <div class="grid-4">
          ${TARGET_FIELDS.map((f) => `
            <label class="field">${f.label}
              <input type="number" inputmode="decimal" min="0" step="any" name="${f.key}" value="${targets[f.key] ?? ''}" required>
            </label>`).join('')}
        </div>
        ${targets.stepBonus ? `<p class="muted small" style="margin-top:10px">${esc(targets.stepBonus)}</p>` : ''}
        <div class="dlg-actions"><span class="spacer"></span><button class="btn primary" type="submit">Save targets</button></div>
      </form>
    </section>

    <section class="card">
      <h2>Backup</h2>
      <p>Last export: <b>${esc(when(meta.lastExport))}</b></p>
      <p class="muted small" style="margin:6px 0 14px">Your data lives only on this tablet. Export now and then, and keep the file somewhere safe (Google Drive works). To have Claude update your data, give it the exported file, then import the file it gives back.</p>
      <div class="btn-row">
        <button class="btn primary" data-act="export">Export to Downloads</button>
        ${canShareFiles() ? '<button class="btn" data-act="share">Share backup…</button>' : ''}
        <label class="btn file-btn">Import a file…<input type="file" id="import-file" accept=".json,application/json"></label>
      </div>
      <p class="muted small" style="margin-top:12px">Import replaces everything on this tablet with the file's contents.</p>
    </section>

    <section class="card">
      <h2>Diet rules</h2>
      <form id="rules-form" style="display:grid;gap:12px">
        <label class="field">Tags for food that isn't mine
          <span class="hint">Shown in the pantry, greyed out, never in Use first. Separate with commas.</span>
          <input type="text" name="notMine" value="${esc(rulesSaved.notMineFlags.join(', '))}">
        </label>
        <label class="field">Never in my meals
          <span class="hint">The meal editor warns if one of these words shows up.</span>
          <input type="text" name="never" value="${esc(rulesSaved.neverInMeals.join(', '))}">
        </label>
        ${profile.cheeseRule ? `<p class="muted small">${esc(profile.cheeseRule)}</p>` : ''}
        <div class="dlg-actions"><span class="spacer"></span><button class="btn primary" type="submit">Save rules</button></div>
      </form>
    </section>

    <section class="card">
      <h2>About</h2>
      <p class="muted small">Version ${APP_VERSION}. Imported ${esc(when(meta.importedAt))}.
      Storage: ${persisted ? 'protected (the tablet won\'t clear it when space is low)' : 'not protected yet. The tablet may clear it if space runs very low, so keep exporting.'}</p>
    </section>`;

  main.querySelector('#targets-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const updated = { ...targets };
    for (const f of TARGET_FIELDS) updated[f.key] = num(e.target[f.key].value) ?? targets[f.key];
    await db.setSetting('targets', updated);
    toast('Targets saved');
  });

  main.querySelector('#rules-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.setSetting('rules', {
      notMineFlags: splitList(e.target.notMine.value),
      neverInMeals: splitList(e.target.never.value).map((w) => w.toLowerCase()),
    });
    await loadRules();
    toast('Rules saved');
  });

  main.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // so picking the same file again still works
    if (!file) return;
    if (!(await confirmBox(`Replace everything on this tablet with "${file.name}"?`, 'Replace', 'Cancel', true))) return;
    try {
      const counts = await importFile(file);
      toast(`Imported ${counts.items} items and ${counts.days} days`);
      redraw();
    } catch (err) {
      toast(err.message);
    }
  });

  main.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    try {
      if (btn.dataset.act === 'export') {
        const name = await downloadExport();
        toast(`Saved ${name}`);
        redraw();
      } else if (btn.dataset.act === 'share') {
        await shareExport();
        redraw();
      }
    } catch (err) {
      if (err.name !== 'AbortError') toast(`Couldn't export: ${err.message}`);
    }
  };
}
