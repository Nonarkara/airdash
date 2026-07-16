/**
 * AirDash Service Worker
 *
 * CRITICAL: This dashboard streams live air-quality data. The service worker
 * deliberately NEVER caches /api/ endpoints or SSE streams (/api/tap).
 * Live data integrity is non-negotiable.
 */

const CACHE = 'airdash-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/tokens.css?v=2.0.0-final',
  '/css/layout.css?v=2.0.0-final',
  '/css/components.css?v=2.0.0-final',
  '/js/main.js?v=2.0.0-final'
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
      self.skipWaiting();
    })
  );
});

/**
 * Activate: clean up old caches and claim all clients.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
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

  // Navigation requests (page loads, link clicks)
  if (mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response.ok) {
            const cache = caches.open(CACHE).then((c) => {
              c.put(request, response.clone());
            });
            // Return the response while caching happens in the background
            return response;
          }
          return response;
        })
        .catch(() => {
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
