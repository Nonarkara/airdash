// Data freshness pill — the user's honest "is what I'm looking at actually
// current?" signal. Two questions, one element:
//
//   1. When was the live data last refreshed?
//      Answer = max(source.lastOk) across all pipelines. Different sources
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
import { on, store } from './state.js?v=2.4.0'
import { tr } from './i18n.js?v=2.4.0'

const TICK_MS = 30_000  // re-evaluate freshness every 30s
// Asia/Bangkok = UTC+7. We compute the local time string from the source
// lastOk timestamp so the source clock and the shown clock share a
// timezone, instead of mixing browser-local with server-UTC.
const BKK_OFFSET_MIN = 7 * 60
const AGE_OK_MAX_S = 15 * 60
const AGE_WARN_MAX_S = 30 * 60

let pillEl = null
let lastSourceOk = null  // Date | null — most recent source.lastOk we've seen

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
  if (ageSec == null || !Number.isFinite(ageSec)) return 'unknown'
  if (ageSec < AGE_OK_MAX_S) return 'ok'
  if (ageSec < AGE_WARN_MAX_S) return 'warn'
  return 'stale'
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
    ? tr('สด (อายุ < 15 นาที)', 'live (< 15 min)')
    : band === 'warn'
      ? tr('เริ่มเก่า (15–30 นาที)', 'aging (15–30 min)')
      : tr('เก่า (> 30 นาที)', 'stale (> 30 min)')
  pillEl.title = lang === 'th'
    ? `อัปเดตล่าสุด: ${clock} น. (${date} เวลาไทย) — ${bandLabel}`
    : `last refresh: ${clock} BKK (${date}) — ${bandLabel}`
}

function captureFromSnapshot(snap) {
  // Sources can be either an object (newer) or an array (older). The
  // snapshot endpoint returns it as an object keyed by source name; each
  // value has lastOk / lastRun / lastError. We pick the freshest lastOk
  // across sources — that's the most-recent real data the system has.
  const sources = snap?.sources
  if (!sources) return
  let best = null
  if (Array.isArray(sources)) {
    for (const s of sources) {
      const t = s?.lastOk
      if (!t) continue
      const d = new Date(t)
      if (!Number.isFinite(d.getTime())) continue
      if (!best || d > best) best = d
    }
  } else if (typeof sources === 'object') {
    for (const k of Object.keys(sources)) {
      const s = sources[k]
      const t = s?.lastOk
      if (!t) continue
      const d = new Date(t)
      if (!Number.isFinite(d.getTime())) continue
      if (!best || d > best) best = d
    }
  }
  lastSourceOk = best
}

export function initDataFreshness() {
  pillEl = pillNode()
  if (!pillEl) return
  on('snapshot', (snap) => { captureFromSnapshot(snap); paint() })
  on('lang', paint)
  setInterval(paint, TICK_MS)
  paint()
}
