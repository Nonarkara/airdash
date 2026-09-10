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
const shell = 'airdash-v41'
const migrated = `ad-shell-ready:${shell}`
const registrations = 'serviceWorker' in navigator
  ? await navigator.serviceWorker.getRegistrations()
  : []
const cacheNames = 'caches' in window ? await caches.keys() : []
const hasOldShell = cacheNames.some((name) =>
  (name.startsWith('flooddash-') || name.startsWith('airdash-')) && name !== shell)

if (!sessionStorage.getItem(migrated) && (registrations.length || hasOldShell)) {
  sessionStorage.setItem(migrated, '1')
  await Promise.all(registrations.map((registration) => registration.unregister()))
  await Promise.all(cacheNames
    .filter((name) => (name.startsWith('flooddash-') || name.startsWith('airdash-')) && name !== shell)
    .map((name) => caches.delete(name)))
  location.reload()
} else {
  await import('/js/main.js?v=2.4.23')
}
