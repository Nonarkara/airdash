// Shared page-state probes for the visual drivers.
//
// WHY A HELPER
// "The boot element is gone" is NOT readiness. The dashboard's own failure
// state — "ยังโหลดข้อมูลสดไม่ได้" / "could not load live data" — also removes
// the boot splash, so a driver that waits only for the boot element to
// disappear happily measures an ERROR PAGE and reports it as a result. One
// run did exactly that and produced "arrows: 0", which read like a broken
// feature rather than a broken fetch.
//
// Readiness therefore needs three things at once: the boot splash gone, the
// failure banner absent, and actual data on the page.

export const APP_STATE = `JSON.stringify({
  booting: !!document.getElementById('boot'),
  failed: /ยังโหลดข้อมูลสดไม่ได้|could not load live data|ตรวจการเชื่อมต่อ|โหลดภาพรวมไม่สำเร็จ|Regional evidence unavailable/i.test(document.body.innerText),
  // Which text actually matched, so a failure report names a cause instead
  // of asking the reader to guess which string tripped it.
  failureText: (document.body.innerText.match(/[^\\n]*(?:ยังโหลดข้อมูลสดไม่ได้|could not load live data|ตรวจการเชื่อมต่อ|โหลดภาพรวมไม่สำเร็จ|Regional evidence unavailable)[^\\n]*/i) || [''])[0].trim().slice(0, 120),
  // A container that matched but held nothing does not count as data. An
  // earlier run measured a right rail that was 18.5KB of markup with
  // scrollHeight 2556 and looked empty in the photograph; "the element
  // exists" is not "the element has content".
  //
  // The regional page (https://air.nonarkara.org/region) has no #boot
  // splash and no .rank-row, so this list once could not see it at all:
  // a driver measuring that page reported "never showed live data" for
  // 300 seconds and learned nothing. Its own markers are here now.
  data: [...document.querySelectorAll('.rank-row, .places-card, .citizen-wind, .ana-head, .wind-arrow, .wind-grid-label, .wind-hour-mark, #wind-steps li, .region-card, .country-card')]
    .filter(e => (e.textContent || '').trim().length > 0 || e.querySelector('svg, img, canvas')).length,
  // The regional page reports its own load state in #status.
  status: (document.getElementById('status')?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
  stillLoading: /กำลังโหลด|Loading evidence/i.test(document.getElementById('status')?.textContent || ''),
})`

/**
 * Wait until the page is genuinely live.
 * Returns { ok, reason, waited_ms } — a failure is reported, never swallowed.
 */
export async function waitForLiveData(evaluate, sleep, { tries = 150, gap = 2000 } = {}) {
  const t0 = Date.now()
  let last = null
  for (let i = 0; i < tries; i++) {
    await sleep(gap)
    try { last = JSON.parse(await evaluate(APP_STATE)) } catch { continue }
    if (last.failed) return { ok: false, reason: `the page showed its data-failure banner: "${last.failureText}"`, state: last, waited_ms: Date.now() - t0 }
    if (!last.booting && last.data > 0 && !last.stillLoading) return { ok: true, state: last, waited_ms: Date.now() - t0 }
  }
  return { ok: false, reason: 'the page never showed live data', state: last, waited_ms: Date.now() - t0 }
}
