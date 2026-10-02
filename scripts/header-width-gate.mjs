// The top bar, measured across real widths with a real browser.
//
// WHY THIS IS A SCRIPT AND NOT A TEST IN `npm test`
//   It needs Playwright, which is not a dependency of this project (which
//   has none) and cannot become one. So it is kept out of `npm test` and
//   run on demand against localhost BEFORE a deploy and against the public
//   URL AFTER one. The static half of this — the four structural causes —
//   IS in `npm test`, as scripts/test-header-layout.mjs.
//
// WHAT IT CATCHES, AND WHAT IT DID NOT CATCH THE FIRST TIME
//   The obvious checks (nothing clipped, nothing crushed) both passed while
//   the bar was wrapping to two rows on the commonest laptop widths, and
//   while a verdict chip was painted underneath the camera chip. A wrapped
//   bar has nothing clipped, and a crushed one is legal CSS.
//
//   So this also checks the bar's HEIGHT. The top bar is 69px on one line.
//   Above the phone breakpoint anything taller means the zones wrapped —
//   which looks tidy in a screenshot and pushes the map down on exactly the
//   screen sizes operators use.
//
//   And it checks HIERARCHY, not just size: the verdict must be at least as
//   wide as the Danger Score beside it. Measured, the Danger Score once grew
//   to 249px while the verdict sat at 20px — every clipping check green,
//   and the one loud thing on the bar was the quietest.
//
// USAGE
//   node scripts/header-width-gate.mjs                      # localhost
//   QA_URL=https://air.nonarkara.org/ops.html node scripts/header-width-gate.mjs
//   QA_SHOT=1 node scripts/header-width-gate.mjs            # also save PNGs
//
// Exits 0 when every width is clean, 1 otherwise. Skips (exit 0) when no
// Playwright is available, so it never becomes a false failure on a machine
// that has not run `npx playwright install`.

import { writeFileSync } from 'node:fs'

const URL = process.env.QA_URL || 'http://localhost:28341/ops.html'
const SHOT = process.env.QA_SHOT === '1'
const WIDTHS = [1920, 1800, 1750, 1700, 1650, 1600, 1500, 1440, 1400, 1300, 1280, 1201, 1200, 1101, 1100, 900, 768, 480, 414]

let chromium
try {
  ;({ chromium } = await import(process.env.PLAYWRIGHT_PATH
    || '/Users/axiom/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'))
} catch {
  console.log('SKIP: no Playwright at ' + (process.env.PLAYWRIGHT_PATH || 'the npx cache path'))
  console.log('      run `npx playwright install chromium`, or set PLAYWRIGHT_PATH')
  process.exit(0)
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1920, height: 900 } })
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
// Wait for real data: with the placeholders in place the verdict is an
// em-dash and the bar is narrower than it will ever be in use, so a sweep
// run against a skeleton proves nothing about the real layout.
await page.waitForFunction(() => {
  const el = document.getElementById('danger-num')
  return el && /^\d/.test(el.textContent)
}, { timeout: 45000 }).catch(() => console.log('WARN: danger-num never rendered — widths are provisional'))
const danger = await page.evaluate(() => document.getElementById('danger-num')?.textContent)
console.log(`url=${URL}  danger-num=${danger}\n`)

let problems = 0
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 })
  await page.waitForTimeout(450)
  const res = await page.evaluate(() => {
    const out = []
    const visible = (el) => el && el.offsetParent !== null && getComputedStyle(el).display !== 'none'
    const q = (s) => document.querySelector(s)

    // 1. ONE ROW where the bar claims to be one row. Below 1100 the phone
    //    grid is legitimately multi-row, so this only applies above it.
    if (window.innerWidth > 1100) {
      const h = Math.round(q('header').getBoundingClientRect().height)
      if (h > 80) out.push(`BAR WRAPPED to ${h}px (>80)`)
    }
    // 2. HIERARCHY: the verdict is the headline and must outrank the score.
    const nat = q('header .hd-data .national')
    const hero = document.getElementById('danger-hero')
    const nw = visible(nat) ? nat.getBoundingClientRect().width : 0
    const hw = visible(hero) ? hero.getBoundingClientRect().width : 0
    if (visible(nat) && nw < 150) out.push(`verdict CRUSHED (${Math.round(nw)}px < 150)`)
    if (visible(hero) && visible(nat) && hw > nw + 20) out.push(`HIERARCHY INVERTED (danger ${Math.round(hw)} > verdict ${Math.round(nw)})`)
    // 3. CLIPPED: content wider than its box.
    for (const sel of ['.hd-tools', '.hd-data', '#danger-hero', '.hd-data .national']) {
      const el = q(`header ${sel}`) || q(sel)
      if (!visible(el)) continue
      if (el.scrollWidth > el.clientWidth + 2) out.push(`${sel} CLIPPED (${el.scrollWidth}>${el.clientWidth})`)
    }
    // 4. Every visible control still has a real hit target.
    for (const el of document.querySelectorAll('header .hd-tools > *')) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) out.push(`control crushed: ${el.id || el.className}`)
    }
    return out
  })
  if (res.length) { problems += res.length; console.log(`${String(w).padStart(5)}px  FAIL  ${res.join(' | ')}`) }
  else console.log(`${String(w).padStart(5)}px  ok`)
  if (SHOT) {
    const h = w > 1100 ? 76 : 150
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } })
    writeFileSync(`/tmp/header-gate-${w}.png`, buf)
  }
}

console.log(problems === 0 ? '\nALL WIDTHS OK' : `\n${problems} problems`)
await browser.close()
process.exit(problems ? 1 : 0)
