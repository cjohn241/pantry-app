// sw.js — the service worker. It saves a copy of every app file on the
// tablet, so the app opens with no internet.
//
// WHEN YOU CHANGE ANY APP FILE: bump CACHE_NAME (v1 -> v2). The tablet
// then downloads the new files the next time it's online, and uses
// them from the next launch. Your data (in IndexedDB) is not touched.

const CACHE_NAME = 'pantry-meals-v2';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/data.js',
  './js/rules.js',
  './js/ui.js',
  './js/meals.js',
  './js/today.js',
  './js/week.js',
  './js/pantry.js',
  './js/groceries.js',
  './js/recipes.js',
  './js/settings.js',
  './js/campaign.js',
  './js/quests.js',
  './js/sprite.js',
  './fonts/cinzel-latin.woff2',
  './fonts/ebgaramond-latin.woff2',
  './fonts/ebgaramond-italic-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

// Install: download and save every app file.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete copies from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Fetch: answer from the saved copy first; fall back to the network.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((saved) => saved || fetch(event.request))
  );
});
