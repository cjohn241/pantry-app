// app.js — starts the app.
//  1. Registers the service worker (offline support).
//  2. On first launch, shows the "import your data" welcome screen.
//  3. Otherwise shows the screen named in the address (#today, #week, ...).

import * as db from './db.js';
import { esc, dateKey, toast } from './ui.js';
import { loadRules } from './rules.js';
import { importFile, startEmpty } from './data.js';
import { ensureCampaign } from './campaign.js';
import * as today from './today.js';
import * as quests from './quests.js';
import * as week from './week.js';
import * as pantry from './pantry.js';
import * as groceries from './groceries.js';
import * as recipes from './recipes.js';
import * as settings from './settings.js';

const SCREENS = { today, quests, week, pantry, groceries, recipes, settings };

const main = document.getElementById('screen');
let currentScreen = null;
let shownDate = dateKey();

/** Draw the screen named in the URL after the # sign. */
async function show() {
  if (!(await db.hasData())) {
    renderWelcome();
    return;
  }

  const name = SCREENS[location.hash.slice(1)] ? location.hash.slice(1) : 'today';
  const changed = name !== currentScreen;
  currentScreen = name;
  shownDate = dateKey();

  document.querySelectorAll('#tabs a').forEach((a) => {
    const active = a.dataset.screen === name;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.getElementById('tabs').classList.remove('hidden');

  try {
    await SCREENS[name].render(main);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p></div>`;
  }
  if (changed) window.scrollTo(0, 0);
}

/** First launch: no data yet. */
function renderWelcome() {
  document.getElementById('tabs').classList.add('hidden');
  main.onclick = null;
  main.innerHTML = `
    <div class="welcome card">
      <h1>Pantry &amp; Meals</h1>
      <p>Your data stays on this tablet. To start, pick your <b>pantry-data.json</b> file. It's probably in Downloads.</p>
      <div class="btn-row">
        <label class="btn primary big file-btn">Import my data file<input type="file" id="first-import" accept=".json,application/json"></label>
      </div>
      <p style="margin-top:24px"><button class="btn small" id="start-empty">Start empty instead</button></p>
    </div>`;

  main.querySelector('#first-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const counts = await importFile(file);
      toast(`Loaded ${counts.items} items and ${counts.days} days`);
      location.hash = '#today';
      show();
    } catch (err) {
      toast(err.message);
    }
  });

  main.querySelector('#start-empty').addEventListener('click', async () => {
    await startEmpty();
    show();
  });
}

window.addEventListener('hashchange', show);

// If the tablet sat overnight with the app open, move Today to the new day.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && dateKey() !== shownDate) show();
});

async function start() {
  await loadRules();
  // Data from before the campaign existed gets its starting quests here.
  if (await db.hasData()) await ensureCampaign();
  await show();

  // Ask the browser not to clear our data when storage gets tight.
  // Installed apps usually get this automatically.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  // Offline support. Only works over https (or localhost).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker failed', err));
  }
}

start();
