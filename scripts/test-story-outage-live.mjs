// Optional browser gate: npm test has no browser dependency.
// QA_URL may target localhost or the deployed site; PLAYWRIGHT_PATH overrides discovery.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/Users/axiom/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs')
const base = process.env.QA_URL || 'http://localhost:28341'
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const context = await browser.newContext({ viewport: { width: 414, height: 896 }, serviceWorkers: 'block' })
  await context.addInitScript(() => localStorage.setItem('ad_lang', 'en'))
  const page = await context.newPage(), errors = []
  let unavailable = true, personalRequests = 0
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/science/personal') personalRequests++ })
  await page.route('**/api/science', route => unavailable
    ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue())
  await page.route('**/api/snapshot', route => unavailable
    ? route.fulfill({ json: { risk: { national: {}, provinces: [{ stagnation_comp: null }, {}] } } }) : route.continue())
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#persona-card .dose .n')
  for (const selector of ['#hero-pm', '#cig-num', '#life-min', '#bill-num', '#tax-num', '#vis-km', '#persona-card .dose .n']) {
    assert.equal((await page.locator(selector).innerText()).trim(), '—', selector)
  }
  assert.match(await page.locator('#bandchip').innerText(), /No current PM reading/)
  assert.match(await page.locator('#offline-banner').innerText(), /unavailable/)
  assert.match(await page.locator('#sky-trap').innerText(), /Waiting for wind/)
  assert.equal(personalRequests, 0, 'offline shell cannot ask for national estimates with no measurement')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  unavailable = false
  await page.evaluate(() => {
    const now = Date.now
    Date.now = () => now() + 65_000
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForFunction(() => /^\d/.test(document.querySelector('#hero-pm')?.textContent ?? ''), null, { timeout: 45_000 })
  await page.waitForFunction(() => document.querySelector('#offline-banner')?.hidden, null, { timeout: 45_000 })
  await page.waitForFunction(() => /^\d/.test(document.querySelector('#persona-card .dose .n')?.textContent ?? ''), null, { timeout: 45_000 })
  assert.ok(personalRequests > 0)
  assert.deepEqual(errors, [])
  console.log('PASS science outage: unknown readings, no invented wind/health estimates, automatic live recovery, mobile layout')
} finally { await browser.close() }
