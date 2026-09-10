// Boot + service-worker shell migration.
//
// WHY THIS IS A FILE AND NOT AN INLINE <script> IN ops.html:
// it used to be inline, and on 2026-09-10 the v2.4.22 CSP
// (`script-src 'self' https://static.cloudflareinsights.com`, set in
// public/_headers) blocked it outright. This module holds the ONLY
// `import('/js/main.js')` in the page — there is no <script src>
// fallback — so blocking it meant the app never booted and every
// visitor sat on the "CONNECTING LIVE PIPELINES" splash forever. The
// whole dashboard was dark and the origin looked healthy the entire
// time, because the failure was 100% client-side.
//
// Do NOT move this back inline. A CSP hash would work today and break
// on the next release: `npm run bump` rewrites both the shell name and
// the ?v= token BELOW, which changes the hash and re-breaks the site.
// An external file under 'self' needs no hash and no 'unsafe-inline'.
//
// The FloodDash-era shell (and any older AirDash shell) must be cleared
// once so returning users never run old flood-era language or removed
// map layers during the service-worker handover. The shell name must
// match the CACHE name in sw.js so the migration only runs when the SW
// itself is upgrading — scripts/check-consistency.mjs enforces that.
//
// Defensive timeout (2026-09-10 fix): `navigator.serviceWorker.getRegistrations()`
// can hang indefinitely on some Chrome configurations (notably headless
// and some Linux distros with strict SW permissions). The previous
// version awaited it with no timeout, which meant main.js was never
// imported and the page sat on the boot screen forever. The fix: race
// every SW API call against a 1.5s ceiling, and proceed to the main.js
// import either way. A user without SW never waits; a user with a
// hung SW gets the new code within 1.5s instead of never.
const shell = 'airdash-v42'
const migrated = `ad-shell-ready:${shell}`

// Promise.race wrapper: resolve with the SW value, or with the
// fallback after `ms` if the SW call hangs. Returns the fallback
// rather than throwing so the rest of the boot can proceed.
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((r) => setTimeout(() => r(fallback), ms)),
  ])
}

let registrations = []
try {
  if ('serviceWorker' in navigator) {
    registrations = await withTimeout(navigator.serviceWorker.getRegistrations(), 1500, [])
  }
} catch { registrations = [] }

let cacheNames = []
try {
  if ('caches' in window) {
    cacheNames = await withTimeout(caches.keys(), 1500, [])
  }
} catch { cacheNames = [] }

const hasOldShell = cacheNames.some((name) =>
  (name.startsWith('flooddash-') || name.startsWith('airdash-')) && name !== shell)

if (!sessionStorage.getItem(migrated) && (registrations.length || hasOldShell)) {
  sessionStorage.setItem(migrated, '1')
  // The migration is best-effort: even if unregister/delete hangs,
  // the new shell is what we just deployed, and it self-heals on the
  // next page load. Don't block the user waiting for the cleanup.
  try {
    await withTimeout(
      Promise.all(registrations.map((registration) => registration.unregister())),
      2000, null,
    )
    await withTimeout(
      Promise.all(cacheNames
        .filter((name) => (name.startsWith('flooddash-') || name.startsWith('airdash-')) && name !== shell)
        .map((name) => caches.delete(name))),
      2000, null,
    )
  } catch {}
  location.reload()
} else {
  // Always import main.js — the whole point of this file. Never let
  // any of the above paths block this.
  await import('/js/main.js?v=2.4.24')
}
