// Find a Chrome binary for the visual-check drivers.
//
// The drivers in this folder photograph the real page and measure its
// geometry over the Chrome DevTools Protocol. They need a browser but must
// not add a dependency to the project (AirDash installs no npm packages), so
// they use whatever Chrome is on the machine and say so plainly when there
// is none.
//
// The first candidate that exists wins. Set CHROME_BIN to override.
import { existsSync } from 'node:fs'
import { globSync } from 'node:fs'

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/private/tmp/pw-mavis/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell',
]

/** Playwright-style cache directories, newest first. */
function fromPlaywrightCache() {
  const roots = [
    '/Users/axiom/Library/Caches/ms-playwright',
    '/private/tmp/pw-mavis',
  ]
  const found = []
  for (const root of roots) {
    for (const dir of globSync(`${root}/*`)) {
      found.push(
        `${dir}/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
        `${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
        `${dir}/chrome-mac/Chromium.app/Contents/MacOS/Chromium`,
      )
    }
  }
  return found
}

export function findChrome() {
  for (const c of [...CANDIDATES, ...fromPlaywrightCache()]) {
    if (c && existsSync(c)) return c
  }
  return null
}

/**
 * Exit cleanly when there is no browser. A visual check that cannot run must
 * say so — it must never look like a pass.
 */
export function requireChrome() {
  const bin = findChrome()
  if (!bin) {
    console.log('SKIP — no Chrome on this machine; the visual check cannot run.')
    console.log('       Set CHROME_BIN to a browser binary to enable it.')
    process.exit(0)
  }
  return bin
}
