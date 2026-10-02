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
//   QA_LANG=en QA_URL=https://air.nonarkara.org/ops node scripts/header-width-gate.mjs
//   QA_SHOT=1 node scripts/header-width-gate.mjs            # also save PNGs
//
// Exits 0 only after measuring rendered data, 1 for geometry problems,
// and 2 when prerequisites fail. Fails closed when no
// Playwright is available: no measurement is possible on a machine
// that has not run `npx playwright install`; that run cannot certify layout.

import { writeFileSync } from 'node:fs'

const URL = process.env.QA_URL || 'http://localhost:28341/ops.html'
const SHOT = process.env.QA_SHOT === '1'
const WIDTHS = [1920, 1800, 1750, 1700, 1650, 1600, 1500, 1440, 1400, 1300, 1280, 1201, 1200, 1101, 1100, 900, 768, 480, 414]

let chromium
try {
  ;({ chromium } = await import(process.env.PLAYWRIGHT_PATH
    || '/Users/axiom/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'))
} catch {
  console.log('FATAL: no Playwright at ' + (process.env.PLAYWRIGHT_PATH || 'the npx cache path'))
  console.log('      Install/configure Playwright, or set PLAYWRIGHT_PATH; no widths were measured.')
  process.exit(2)
}

let browser, page
try {
  browser = await chromium.launch({ channel: 'chrome' })
  page = await browser.newPage({ viewport: { width: 1920, height: 900 } })
  await page.addInitScript(lang => localStorage.setItem('ad_lang', lang), process.env.QA_LANG === 'en' ? 'en' : 'th')
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
} catch (error) {
  console.log(`FATAL: browser/page setup failed: ${error.message}`)
  await browser?.close(); process.exit(2)
}
// Wait for real data. This is not a nicety: with the placeholders in place
// the verdict is an em-dash, the data zone is narrower than it will ever be
// in use, and every width below is measured against a bar that does not
// exist in production. A sweep on a skeleton is a green light on nothing.
//
// And if the wait times out this gate FAILS rather than continuing. An
// earlier version logged a warning and carried on to print "ALL WIDTHS
// OK" — which is the worst possible outcome, because the reassuring
// sentence is exactly what a reader would quote. It happened: a run
// reported `danger-num=–` and still passed all 19 widths, and only the
// value printed on the summary line revealed it.
const RENDERED = await page.waitForFunction(() => {
  const el = document.getElementById('danger-num')
  const verdict = document.querySelector('.national .verb-th') || document.getElementById('national-th')
  const hero = document.getElementById('danger-hero')
  const national = document.querySelector('header .national')
  const painted = node => node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0
  return painted(hero) && painted(national) && el && /^\d{1,3}$/.test(el.textContent.trim()) && Number(el.textContent) <= 100
    && verdict && verdict.textContent.trim() && !/LOADING|กำลังโหลด|^[–—]$/i.test(verdict.textContent.trim())
}, null, { timeout: Number(process.env.QA_READY_TIMEOUT_MS) || 45000 }).then(() => true).catch(() => false)
const danger = await page.evaluate(() => document.getElementById('danger-num')?.textContent)
if (!RENDERED) {
  console.log(`FATAL: danger-num never rendered (got ${JSON.stringify(danger)}).`)
  console.log('       The bar is narrower than production, so every width below')
  console.log('       would be measured against a skeleton. Refusing to certify it.')
  await browser.close()
  process.exit(2)
}
console.log(`url=${URL}  danger-num=${danger}  (real data)\n`)
// Production fonts can finish after the data. Measure the final typography,
// since a fallback font can hide a wrap at the narrowest desktop width.
await page.evaluate(() => document.fonts.ready)

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
    // 5. THE DANGER CHIP FITS ITS OWN BOX.
    //
    //    This is the check that was missing while a real defect was live.
    //    The chip is a fixed-height box holding five pieces of content
    //    (label, "not a clinical index", number, band, scope). When they
    //    wanted more room than the box had, a column flex with the
    //    default `flex-shrink: 1` did not overflow and did not clip — it
    //    quietly made every row shorter: label 17→16.2, number 30→26,
    //    band 13→12.6, and the scope line 10→6.2, which shaved the top of
    //    its Thai vowel marks and the bottom off the chip entirely.
    //
    //    Every existing check passed throughout, and so did the whole test
    //    suite, because a shrunken box is legal CSS: there is no overflow
    //    to detect and nothing to assert against. The one honest signal is
    //    arithmetic — does the content the chip WANTS still fit the box it
    //    has? Sum the children's natural heights and compare with the
    //    content box. On the broken bar that was 70px of content in 64px
    //    of box; it now measures ~59px in 64px.
    //
    //    Deliberately NOT a threshold on the rendered heights: those are
    //    the crushed numbers, so testing them would test the bug. And
    //    deliberately not `scrollHeight > clientHeight` on every child,
    //    because a 24px numeral in a 1.05 line box reports 3px of
    //    "overflow" forever with `overflow: visible` and nothing is
    //    actually cut — a check that fires on a non-problem is a check
    //    people learn to skip.
    const heroEl = document.getElementById('danger-hero')
    if (visible(heroEl)) {
      const hbox = heroEl.getBoundingClientRect()
      // Ask the box what height it would need if nothing were constraining
      // it, then compare that with the height it was actually given. This
      // is the one measurement that needs no assumptions about the
      // internal layout — column, row, one track or two — and it is the
      // only one that is not fooled by its own probe.
      //
      // Two things that looked like answers and are not:
      //   * `getComputedStyle(el).height === 'auto'` — the computed value
      //     ALWAYS resolves to pixels, so this is never true and the check
      //     silently ran against every box including the auto-height ones.
      //   * comparing children's scrollHeight to clientHeight — a 24px
      //     numeral in a 1.05 line box reports 3px of "overflow" forever
      //     with overflow:visible and nothing is cut, while the real
      //     defect (10→6) is an integer-quantised 4. One false positive
      //     trains you to skip the check, which is worse than no check.
      //
      // Relaxing the height is a probe, not a change: it is restored on the
      // next line and nothing is painted or measured in between.
      const prevHeight = heroEl.style.height
      heroEl.style.height = 'auto'
      const needed = heroEl.scrollHeight
      heroEl.style.height = prevHeight
      if (needed > hbox.height + 1) {
        out.push(`danger chip COMPRESSED (needs ${needed}px, given ${Math.round(hbox.height)}px)`)
      }
      // ...and nothing inside it is hiding overflow of its own.
      for (const c of heroEl.querySelectorAll('*')) {
        const cs = getComputedStyle(c)
        if (cs.overflowY !== 'hidden' && cs.overflowY !== 'clip') continue
        if (c.scrollHeight > c.clientHeight + 1) {
          out.push(`danger chip row CLIPPED: ${c.className || c.tagName} (${c.scrollHeight}>${c.clientHeight})`)
        }
      }
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
