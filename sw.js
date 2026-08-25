const CACHE_NAME = "jambeacon-rockmania-v12";
const APP_SHELL = [
  "/",
  "/app/",
  "/manifest.webmanifest",
  "/jambeacon-icon.svg",
  "/avatar-male.webp",
  "/avatar-female.webp",
  "/avatar-road-dog.webp",
  "/avatar-blue-king.webp",
  "/avatar-neon-nova.webp",
  "/avatar-thunder.webp",
  "/tx-hippie-child.webp",
  "/jam-chat-scene.webp",
  "/audio/loops-v2/texas-thunder-120bpm.mp3",
  "/audio/loops-v2/lone-star-shuffle-105bpm.mp3",
  "/audio/loops-v2/funk-highway-102bpm.mp3",
  "/audio/loops-v2/garage-stomp-128bpm.mp3",
  "/audio/loops-v2/midnight-pocket-92bpm.mp3",
  "/audio/loops-v2/arena-drive-135bpm.mp3",
  "/audio/loops-v2/blues-six-84bpm.mp3",
  "/audio/loops-v2/southern-halftime-76bpm.mp3",
  "/audio/loops-v2/neon-punk-172bpm.mp3",
  "/audio/loops-v2/heavy-crown-145bpm.mp3",
  "/audio/loops-v2/desert-reggae-88bpm.mp3",
  "/audio/loops-v2/breakbeat-chase-110bpm.mp3"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
