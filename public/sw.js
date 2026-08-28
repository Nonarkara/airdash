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

const CACHE = 'airdash-v31';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/ops.html',
  '/css/tokens.css?v=2.4.15',
  '/css/layout.css?v=2.4.15',
  '/css/components.css?v=2.4.15',
  '/css/city-dashboard.css?v=2.4.15',
  '/css/story.css?v=2.4.15',
  '/js/main.js?v=2.4.15',
  '/js/story.js?v=2.4.15',
  // The life-saving citizen panel additions (persona selector, action
  // timeline, mask guide, symptom checker, migrant phrases, time-of-day
  // forecast). Precache so the citizen panel works offline — the user
  // reading "ถ้าเจ็บหน้าอก โทร 1669" needs that line to work even
  // when the cellular drops.
  '/js/panels/citizenLife.js?v=2.4.15',
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
          .filter((name) => name !== CACHE)
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
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { url, method, mode } = request;

  // Only handle same-origin GET requests
  if (method !== 'GET' || !url.startsWith(self.location.origin)) {
    return;
  }

  // Parse the URL
  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    return;
  }

  // CRITICAL: Never cache API endpoints or live streams
  if (urlObj.pathname.startsWith('/api/')) {
    return;
  }

  // Force-reload bypass: ?forceReload=N was added by the stuck-on-boot
  // escape hatch. Strip the parameter from the cache lookup and serve
  // straight from network so a broken cached HTML is never returned.
  const forceReload = urlObj.searchParams.has('forceReload');

  // Navigation requests (page loads, link clicks)
  if (mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response.ok && !forceReload) {
            const cache = caches.open(CACHE).then((c) => {
              c.put(request, response.clone());
            });
            return response;
          }
          return response;
        })
        .catch(() => {
          if (forceReload) {
            // Network really is down — return a clear offline hint.
            return new Response(
              '<!doctype html><meta charset="utf-8"><title>AirDash · offline</title>' +
              '<body style="font-family:system-ui;padding:40px;text-align:center">' +
              '<h1>AirDash is offline</h1>' +
              '<p>No network, no cached page. Check your connection and try again.</p></body>',
              { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }
            )
          }
          // Network failed; serve cached /index.html
          return caches.match('/index.html')
            .then((cachedResponse) => {
              return cachedResponse || new Response('Offline', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
    return;
  }

  // Static assets: stale-while-revalidate
  if (mode === '' || mode === 'no-cors') {
    // Bypass cache entirely on forceReload so the new file wins.
    if (forceReload) {
      event.respondWith(
        fetch(request).then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const responseToCache = response.clone()
            caches.open(CACHE).then((cache) => {
              cache.put(request, responseToCache)
            })
          }
          return response
        }).catch(() => new Response('Offline', { status: 503 }))
      )
      return
    }
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Return cached response immediately if available
        if (cachedResponse) {
          // Update the cache in the background
          fetch(request)
            .then((networkResponse) => {
              // Only cache successful, non-opaque responses
              if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
                caches.open(CACHE).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {
              // Network failed; stick with cached version
            });
          return cachedResponse;
        }

        // Not in cache; fetch from network
        return fetch(request)
          .then((networkResponse) => {
            // Only cache successful, basic-type responses
            if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Network failed and not in cache; return a fallback
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
    );
    return;
  }
});
