const CACHE_NAME = 'jambeacon-site-v8';
const STATIC = [
  '/site.css?v=2',
  '/site.js?v=2',
  '/app/',
  '/assets/index-DK0d-042.js',
  '/assets/index-CSLys_NW.css',
  '/avatar-male.png',
  '/avatar-female.png',
  '/tx-hippie-child.png',
  '/jam-chat-scene.png',
  '/jambeacon-icon.svg',
  '/audio/loops/texas-rock-120bpm.mp3',
  '/audio/loops/funky-road-100bpm.mp3',
  '/audio/loops/hip-hop-pocket-90bpm.mp3',
  '/audio/loops/odd-time-breakbeat-135bpm.mp3'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => {
    const network = fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
