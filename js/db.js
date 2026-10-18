// db.js — the on-device database (IndexedDB).
//
// Think of it like SQL tables. Each "store" is a table, and each row is
// a JavaScript object. The keyPath is the primary key column.
//
//   items      key: id     the pantry items
//   days       key: date   one row per day: meals + water, energy, focus
//   groceries  key: id     the shopping list
//   recipes    key: id     recipe cards
//   prep       key: id     weekly prep checklist
//   settings   key: key    one row per setting: profile, targets, rules, campaign, ...
//   quests     key: id     fitness campaign: the quests you can log
//   questLog   key: id     fitness campaign: one row per quest done
//
// IndexedDB's own API is callback-based and wordy, so this file wraps it
// in a few small async functions: getAll, get, put, remove, replaceAll.

const DB_NAME = 'pantry-meals';
const DB_VERSION = 2; // bump this only if the table list below changes (2 = campaign tables)

export const STORES = {
  items: 'id',
  days: 'date',
  groceries: 'id',
  recipes: 'id',
  prep: 'id',
  settings: 'key',
  quests: 'id',
  questLog: 'id',
};

let dbPromise = null;

/** Open the database once and reuse it. Creates the tables on first run. */
export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, keyPath] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// Turn one IndexedDB request into a promise we can await.
function requestDone(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Wait for a whole transaction to finish (like COMMIT).
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** SELECT * FROM store */
export async function getAll(store) {
  const db = await openDB();
  return requestDone(db.transaction(store).objectStore(store).getAll());
}

/** SELECT * FROM store WHERE key = ? (undefined if missing) */
export async function get(store, key) {
  const db = await openDB();
  return requestDone(db.transaction(store).objectStore(store).get(key));
}

/** INSERT OR REPLACE one row */
export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await transactionDone(tx);
  return value;
}

/** DELETE FROM store WHERE key = ? */
export async function remove(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await transactionDone(tx);
}

/** Settings are stored as { key, value } rows. */
export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  return put('settings', { key, value });
}

/** True once data has been imported (or the app was started empty). */
export async function hasData() {
  return Boolean(await get('settings', 'meta'));
}

/**
 * Wipe every table and load new rows, all in ONE transaction.
 * If anything fails, nothing changes (it rolls back), so a bad import
 * can never leave you with half your data.
 *
 * rows = { items: [...], days: [...], groceries: [...], recipes: [...], prep: [...], settings: [...] }
 */
export async function replaceAll(rows) {
  const db = await openDB();
  const names = Object.keys(STORES);
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const store = tx.objectStore(name);
    store.clear();
    for (const row of rows[name] || []) store.put(row);
  }
  await transactionDone(tx);
}
