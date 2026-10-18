// settings.js — targets, diet rules, backup (export / import).

import * as db from './db.js';
import { esc, toast, confirmBox } from './ui.js';
import { downloadExport, shareExport, canShareFiles, importFile, num, APP_VERSION } from './data.js';
import { loadRules } from './rules.js';
import { getCampaign, saveCampaign, regionById } from './campaign.js';
import { heroSVG, SKIN, HAIR, CLOAK } from './sprite.js';

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

/* ---------- Campaign settings ---------- */

/** A row of color swatches that work like radio buttons. */
function swatches(name, options, current) {
  return `<div class="swatches" role="radiogroup" aria-label="${name}">
    ${Object.entries(options).map(([key, color]) => `
      <label class="swatch" title="${key}">
        <input type="radio" name="${name}" value="${key}" ${key === current ? 'checked' : ''}>
        <span style="background:${Array.isArray(color) ? color[0] : color}"></span>
        <span class="sr-only">${key}</span>
      </label>`).join('')}
  </div>`;
}

function campaignSection(campaign, quests) {
  const hero = campaign.hero;
  return `
    <section class="card">
      <h2>Quests and your hero</h2>
      <form id="campaign-form" style="display:grid;gap:14px">
        <div class="hero-edit">
          <div class="hero-sprite" id="hero-preview">${heroSVG(hero, 5)}</div>
          <div style="display:grid;gap:10px;flex:1;min-width:220px">
            <div class="grid-2">
              <label class="field">Name <input type="text" name="heroName" value="${esc(hero.name)}" required></label>
              <label class="field">Class <input type="text" name="heroClass" value="${esc(hero.cls)}" required></label>
            </div>
            <div class="field">Skin ${swatches('skin', SKIN, hero.skin)}</div>
            <div class="field">Hair ${swatches('hair', HAIR, hero.hair)}</div>
            <div class="field">Cloak ${swatches('cloak', CLOAK, hero.cloak)}</div>
          </div>
        </div>
        <div class="grid-2">
          <label class="field">Training days a week
            <select name="daysPerWeek">${[2, 3, 4, 5, 6].map((n) => `<option ${n === campaign.daysPerWeek ? 'selected' : ''}>${n}</option>`).join('')}</select>
          </label>
          <label class="field">5K race day <input type="date" name="raceDate" value="${campaign.raceDate || ''}"></label>
        </div>
        <div class="grid-2">
          <label class="field">Reward <input type="text" name="rewardName" value="${esc(campaign.reward.name)}" placeholder="New running shoes"></label>
          <label class="field">Price in gold <input type="number" name="rewardPrice" min="1" step="1" inputmode="numeric" value="${campaign.reward.price}"></label>
        </div>
        <details>
          <summary class="link-btn">Quest names and XP</summary>
          <div style="display:grid;gap:8px;margin-top:10px">
            ${quests.map((q) => `
              <div class="quest-edit" data-id="${esc(q.id)}">
                <span class="muted small">${esc(regionById(q.region)?.name || '')}</span>
                <input type="text" name="qname-${esc(q.id)}" value="${esc(q.name)}" aria-label="Quest name">
                <input type="number" name="qxp-${esc(q.id)}" value="${q.xp}" min="0" step="5" inputmode="numeric" aria-label="XP">
              </div>`).join('')}
          </div>
        </details>
        ${campaign.rewardsClaimed.length ? `<p class="muted small">Rewards claimed: ${campaign.rewardsClaimed.map((r) => esc(r.name)).join(', ')}</p>` : ''}
        <div class="dlg-actions"><span class="spacer"></span><button class="btn primary" type="submit">Save</button></div>
      </form>
    </section>`;
}

function wireCampaignForm(main, campaign, quests) {
  const form = main.querySelector('#campaign-form');
  const pick = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
  const heroFromForm = () => ({
    ...campaign.hero,
    name: form.heroName.value.trim() || campaign.hero.name,
    cls: form.heroClass.value.trim() || campaign.hero.cls,
    skin: pick('skin'), hair: pick('hair'), cloak: pick('cloak'),
  });

  // Redraw the hero as you pick colors.
  form.addEventListener('change', (e) => {
    if (['skin', 'hair', 'cloak'].includes(e.target.name)) {
      form.querySelector('#hero-preview').innerHTML = heroSVG(heroFromForm(), 5);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fresh = await getCampaign(); // keep anything logged meanwhile
    fresh.hero = heroFromForm();
    fresh.daysPerWeek = Number(form.daysPerWeek.value) || 3;
    fresh.raceDate = form.raceDate.value || null;
    fresh.reward = {
      name: form.rewardName.value.trim(),
      price: Math.max(1, Math.round(Number(form.rewardPrice.value) || 500)),
    };
    await saveCampaign(fresh);
    for (const q of quests) {
      const name = form.querySelector(`[name="qname-${q.id}"]`).value.trim() || q.name;
      const xp = Math.max(0, Math.round(Number(form.querySelector(`[name="qxp-${q.id}"]`).value) || 0));
      if (name !== q.name || xp !== q.xp) await db.put('quests', { ...q, name, xp });
    }
    toast('Saved');
  });
}

export async function render(main) {
  const [targets, rulesSaved, meta, profile, campaign, quests] = await Promise.all([
    db.getSetting('targets', {}),
    db.getSetting('rules', { notMineFlags: [], neverInMeals: [] }),
    db.getSetting('meta', {}),
    db.getSetting('profile', {}),
    getCampaign(),
    db.getAll('quests'),
  ]);
  quests.sort((a, b) => a.order - b.order);
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

    ${campaignSection(campaign, quests)}

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

  wireCampaignForm(main, campaign, quests);

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
