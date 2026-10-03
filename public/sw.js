/**
 * AirDash Service Worker
 *
 * CRITICAL: This dashboard streams live air-quality data. The service worker
 * deliberately NEVER caches /api/ endpoints or SSE streams (/api/tap).
 * Live data integrity is non-negotiable.
 *
 * Phone-reliability notes:
 *   - skipWaiting() + clients.claim() so a new SW takes over on the very
 *     next navigation, no "close all tabs" needed.
 *   - Navigation is NETWORK-FIRST. A broken cached HTML can never win over
 *     a reachable network. Stale caches are only the offline fallback.
 *   - `?forceReload=N` query string bypasses the cache entirely for the
 *     navigation request. The boot screen's stuck-escape-hatch uses this
 *     when the user taps "clear cache & reload".
 *   - Caches older than the current CACHE name are deleted on activate
 *     so a stale airdash-v3 / v4 / ... cache can never serve broken JS.
 */

const CACHE = 'airdash-v86';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/ops.html',
  '/install.html',
  '/css/brand.css?v=2.4.68',
  '/img/brand/airdash-signal-color.png',
  '/img/brand/airdash-signal-black.png',
  '/img/brand/airdash-signal-white.png',
  '/css/tokens.css?v=2.4.68',
  '/css/layout.css?v=2.4.68',
  '/css/components.css?v=2.4.68',
  '/css/city-dashboard.css?v=2.4.68',
  '/css/story.css?v=2.4.68',
  '/css/witness.css?v=2.4.68',
  '/js/witness.js?v=2.4.68',
  '/js/boot.js?v=2.4.68',
  '/js/panels/burning.js?v=2.4.68',
  '/js/main.js?v=2.4.68',

  '/js/feedAge.js?v=2.4.68',
  '/js/story.js?v=2.4.68',
  // The life-saving citizen panel additions (persona selector, action
  // timeline, mask guide, symptom checker, migrant phrases, time-of-day
  // forecast). Precache so the citizen panel works offline — the user
  // reading "ถ้าเจ็บหน้าอก โทร 1669" needs that line to work even
  // when the cellular drops.
  '/js/panels/citizenLife.js?v=2.4.68',
  // New modules added in Phase 1. The SW does NOT precache every panel
  // (the install event is fragile if any 404s), but the runtime cache
  // picks them up on first load via stale-while-revalidate.
];

/**
 * Install: precache the app shell, but fail gracefully if any asset is missing.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      // Try to cache each URL, but don't let one failure block the others
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          fetch(url).then((response) => {
            if (response.ok) {
              return cache.put(url, response);
            }
          }).catch(() => {
            // Silently skip failed precache entries
          })
        )
      );
    }).then(() => {
      // Take over from the old SW immediately, no second refresh needed.
      self.skipWaiting();
    })
  );
});

/**
 * Activate: clean up old caches and claim all clients.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Wipe any cache name that isn't the current one — this is what
    // makes a deploy bulletproof: even if a user was on airdash-v3 from
    // weeks ago, the very next visit installs this SW, activates it,
    // and deletes v3's cache. No manual intervention.
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE && (name.startsWith('airdash-') || name.startsWith('flooddash-')))
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of every open tab so the new SW handles their
      // next fetch (not the next page load — the next fetch).
      return self.clients.claim();
    })
  );
});

/**
 * Fetch: smart caching strategy per request type.
 *
 * Rules:
 * 1. Only handle same-origin GET requests; ignore everything else.
 * 2. NEVER cache /api/ endpoints — always hit the network.
 * 3. Navigation requests: network-first, fall back to cached /index.html offline.
 *    `?forceReload=N` bypasses the cache for one navigation.
 * 4. Static assets: stale-while-revalidate (serve from cache, update in background).
 */
// Clone before returning the response: the browser can consume its body
// while caches.open is pending. Keep the write alive for the fetch event.
function cacheResponse(event, request, response) {
  if (!response.ok || response.type !== 'basic') return
  const copy = response.clone()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}))
}

function offlineDocument(pathname) {
  if (pathname === '/install' || pathname === '/install.html') return '/install.html'
  if (pathname === '/' || pathname === '/index.html') return '/index.html'
  return '/ops.html' // Mission Control and /<place> deep links
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  const forceReload = url.searchParams.has('forceReload')

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (!forceReload) cacheResponse(event, request, response)
      return response
    }).catch(async () => {
      if (!forceReload) {
        const cached = await caches.match(request) || await caches.match(offlineDocument(url.pathname))
        // Pages canonicalizes .html URLs. Their cached responses retain a
        // redirected URL list, which navigation's manual redirect mode rejects.
        // Return the saved document body without that network redirect history.
        if (cached) return new Response(cached.body, {
          status: cached.status, statusText: cached.statusText, headers: cached.headers,
        })
      }
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>AirDash · offline</title>' +
        '<body style="font-family:system-ui;padding:40px;text-align:center">' +
        '<h1>AirDash is offline</h1><p>Check your connection and try again.</p></body>',
        { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
      )
    }))
    return
  }

  // ES modules use mode=cors, so checking only no-cors silently left the
  // dashboard's entire import graph uncached. Handle all same-origin assets.
  const update = () => fetch(request).then((response) => {
    cacheResponse(event, request, response)
    return response
  })
  event.respondWith((async () => {
    const cached = forceReload ? null : await caches.match(request)
    if (cached) {
      event.waitUntil(update().catch(() => {}))
      return cached
    }
    return update().catch(() => new Response('Offline', { status: 503 }))
  })())
})
