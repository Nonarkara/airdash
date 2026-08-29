// Shared renderers for the gap engines (WHY causes / WHAT patterns).
// Used by ranking.js (cause chip), detail.js (province patterns + cause
// evidence) and analytics.js (national patterns). Vanilla DOM via el(),
// bilingual via tr()/L, zero deps. Every block is honest about its
// heuristic nature — the server method_* strings travel with the data.
import { tr } from '../i18n.js?v=2.4.17'
import { fmtNum, el } from '../fmt.js?v=2.4.17'
import { getJson } from '../cache.js?v=2.4.17'

// One icon per cause hypothesis id (server/causes.js vocabulary).
export const CAUSE_ICON = {
  burning: '🔥',
  transboundary: '🌏',
  traffic: '🚗',
  industry: '🏭',
  desert_dust: '🏜',
  stagnation: '🌫',
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const CAUSES_TTL = 5 * 60_000
const PATTERNS_TTL = 30 * 60_000

/** Compact "WHY" chip for a ranking row / card: "🔥 การเผาในที่โล่ง 70%". */
export function causeChip(cause) {
  if (!cause?.primary) return null
  const icon = CAUSE_ICON[cause.primary] ?? '·'
  const pct = Number.isFinite(cause.confidence) ? `${Math.round(cause.confidence * 100)}%` : ''
  return el('span', {
    class: `cause-chip cause-${cause.primary}`,
    title: tr('สมมติฐานสาเหตุจากหลักฐานแวดล้อม — ไม่ใช่การตรวจวัดทางเคมี',
      'cause hypothesis from circumstantial evidence — not chemical measurement'),
  }, `${icon} ${tr(cause.label_th, cause.label_en)}${pct ? ` ${pct}` : ''}`)
}

/** Cached /api/causes lookup: province_code -> full entry (with evidence). */
export async function causesByProvince() {
  const data = await getJson('/api/causes', CAUSES_TTL).catch(() => null)
  const map = new Map()
  for (const p of data?.provinces ?? []) map.set(p.province_code, p)
  return map
}

/** Evidence block for the expanded province card: ranked hypotheses with
 *  the actual numbers that produced them. */
export function causeEvidenceBlock(entry) {
  if (!entry?.causes?.length) return null
  const rows = []
  for (const c of entry.causes.slice(0, 3)) {
    rows.push(el('div', { class: 'cause-ev-head' },
      el('span', { class: `cause-chip cause-${c.id}` },
        `${CAUSE_ICON[c.id] ?? '·'} ${tr(c.label_th, c.label_en)} ${Math.round(c.confidence * 100)}%`)))
    for (const ev of (c.evidence ?? []).slice(0, 3)) {
      rows.push(el('div', { class: 'cause-ev-line' }, `· ${tr(ev.th, ev.en)}`))
    }
  }
  return el('div', { class: 'cause-evidence' },
    el('div', { class: 'eyebrow' }, tr('ทำไมฝุ่นถึงสูงที่นี่ · สมมติฐาน', 'WHY IS THE AIR BAD HERE · HYPOTHESES')),
    ...rows,
    el('div', { class: 'cause-method' },
      tr('จากหลักฐานแวดล้อม (ฤดูกาล ภูมิภาค สัดส่วนฝุ่น ข่าว การระบายอากาศ) — ไม่ใช่การตรวจวัดองค์ประกอบทางเคมี',
        'from circumstantial evidence (season, region, particle ratios, news, ventilation) — not chemical source apportionment')))
}

/** 24-bar hour-of-day strip with the peak window highlighted. */
export function hourStrip(hourly, peak) {
  if (!hourly?.length) return null
  const byHour = new Map(hourly.map((h) => [h.hour, h]))
  const max = Math.max(...hourly.map((h) => h.avg ?? 0), 1)
  const inPeak = (h) => {
    if (!peak) return false
    const { start, end } = peak
    return start <= end ? (h >= start && h <= end) : (h >= start || h <= end) // midnight wrap
  }
  const bars = []
  for (let h = 0; h < 24; h++) {
    const v = byHour.get(h)?.avg ?? null
    const pct = v === null ? 4 : Math.max(6, Math.round((v / max) * 100))
    bars.push(el('div', {
      class: `pat-hbar${inPeak(h) ? ' pat-hbar-peak' : ''}${v === null ? ' pat-hbar-empty' : ''}`,
      title: `${String(h).padStart(2, '0')}:00 · ${v === null ? '—' : fmtNum(v, 1) + ' µg/m³'}`,
    }, el('div', { class: 'pat-hbar-fill', style: `height:${pct}%` })))
  }
  return el('div', { class: 'pat-hours' },
    el('div', { class: 'pat-row-head' },
      tr('ฝุ่นรายชั่วโมง (เฉลี่ยจากข้อมูลจริง)', 'PM2.5 BY HOUR OF DAY (observed avg)'),
      peak ? el('span', { class: 'pat-peak-lbl' },
        ` · ${tr('พีค', 'peak')} ${peak.label} (${fmtNum(peak.avg, 0)} µg)`) : null),
    el('div', { class: 'pat-hbar-row' }, ...bars),
    el('div', { class: 'pat-hbar-axis' },
      el('span', {}, '00'), el('span', {}, '06'), el('span', {}, '12'),
      el('span', {}, '18'), el('span', {}, '23')))
}

/** Weekday vs weekend delta line — the traffic fingerprint. */
export function weekdayLine(weekday) {
  if (!weekday || weekday.weekday_avg === null || weekday.weekend_avg === null) return null
  const drop = weekday.weekend_drop_pct
  const dropTxt = drop === null ? '' :
    drop >= 0
      ? tr(` — สุดสัปดาห์ลดลง ${fmtNum(drop, 0)}%`, ` — weekends drop ${fmtNum(drop, 0)}%`)
      : tr(` — สุดสัปดาห์สูงขึ้น ${fmtNum(Math.abs(drop), 0)}%`, ` — weekends up ${fmtNum(Math.abs(drop), 0)}%`)
  return el('div', { class: 'pat-weekday' },
    `${tr('วันธรรมดา', 'weekday')} ${fmtNum(weekday.weekday_avg, 1)} µg · ` +
    `${tr('สุดสัปดาห์', 'weekend')} ${fmtNum(weekday.weekend_avg, 1)} µg${dropTxt}`)
}

/** 12-month climatology mini-chart; prior-only months are dimmed; the worst
 *  observed month gets a callout. */
export function monthChart(monthly) {
  if (!monthly?.length) return null
  const observed = monthly.filter((m) => m.source === 'observed' && m.avg !== null)
  if (!observed.length) return null
  const max = Math.max(...observed.map((m) => m.avg), 1)
  const worst = observed.reduce((w, m) => (!w || m.avg > w.avg ? m : w), null)
  const bars = monthly.map((m) => {
    const isPrior = m.source !== 'observed' || m.avg === null
    const pct = m.avg === null ? 4 : Math.max(6, Math.round((m.avg / max) * 100))
    return el('div', {
      class: `pat-mcol${isPrior ? ' pat-mcol-prior' : ''}${worst && m.month === worst.month && !isPrior ? ' pat-mcol-worst' : ''}`,
      title: `${tr(TH_MONTHS[m.month - 1], EN_MONTHS[m.month - 1])} · ${m.avg === null ? tr('ไม่มีข้อมูล (ความรู้ตีพิมพ์)', 'no data (published prior)') : fmtNum(m.avg, 1) + ' µg/m³'}`,
    },
      el('div', { class: 'pat-mbar' }, el('div', { class: 'pat-mbar-fill', style: `height:${pct}%` })),
      el('div', { class: 'pat-mlbl' }, tr(TH_MONTHS[m.month - 1], EN_MONTHS[m.month - 1]).slice(0, 3)))
  })
  return el('div', { class: 'pat-months' },
    el('div', { class: 'pat-row-head' },
      tr('ภูมิอากาศฝุ่นรายเดือน', 'MONTH CLIMATOLOGY'),
      worst ? el('span', { class: 'pat-worst-lbl' },
        ` · ${tr('เดือนแย่สุด', 'worst month')}: ${tr(TH_MONTHS[worst.month - 1], EN_MONTHS[worst.month - 1])} ${fmtNum(worst.avg, 0)} µg`) : null),
    el('div', { class: 'pat-mrow' }, ...bars))
}

export function insightLines(insights) {
  if (!insights?.length) return null
  return el('div', { class: 'pat-insights' },
    ...insights.map((i) => el('div', { class: 'pat-insight' }, `💡 ${tr(i.th, i.en)}`)))
}

/** Async PATTERNS block for one province. Returns a container immediately
 *  (with a loading line) and fills itself when /api/patterns answers. */
export function provincePatternsBlock(provinceCode) {
  const wrap = el('div', { class: 'detail-block pat-block' },
    el('div', { class: 'eyebrow' }, tr('รูปแบบฝุ่นในพื้นที่ · จากประวัติจริง', 'PATTERNS · WHAT HISTORY TEACHES')),
    el('div', { class: 'pat-loading' }, tr('กำลังโหลดรูปแบบ…', 'loading patterns…')))
  getJson(`/api/patterns?province=${encodeURIComponent(provinceCode)}`, PATTERNS_TTL)
    .then((p) => {
      const parts = [
        hourStrip(p.hourly, p.peak_hours),
        weekdayLine(p.weekday),
        monthChart(p.monthly),
        insightLines(p.insights),
        el('div', { class: 'pat-method' }, tr(p.method_th, p.method_en)),
      ].filter(Boolean)
      wrap.replaceChildren(
        el('div', { class: 'eyebrow' }, tr('รูปแบบฝุ่นในพื้นที่ · จากประวัติจริง', 'PATTERNS · WHAT HISTORY TEACHES')),
        ...(parts.length > 1 ? parts : [el('div', { class: 'pat-loading' },
          tr('ยังมีข้อมูลไม่พอสำหรับจังหวัดนี้', 'not enough history for this province yet'))]))
    })
    .catch(() => {
      wrap.querySelector('.pat-loading')?.replaceChildren(
        document.createTextNode(tr('โหลดรูปแบบไม่สำเร็จ', 'failed to load patterns')))
    })
  return wrap
}

/** Async national PATTERNS card for the analytics (OVERVIEW) panel. */
export function nationalPatternsBlock() {
  const wrap = el('div', { class: 'ana-card pat-block' },
    el('div', { class: 'ana-card-head' },
      el('div', { class: 'ana-card-title' }, tr('รูปแบบฝุ่นทั้งประเทศ · จากประวัติจริง', 'NATIONAL PATTERNS · WHAT HISTORY TEACHES'))),
    el('div', { class: 'pat-loading' }, tr('กำลังโหลดรูปแบบ…', 'loading patterns…')))
  getJson('/api/patterns', PATTERNS_TTL)
    .then((p) => {
      const regionRows = (p.regions ?? []).map((r) => el('div', { class: 'pat-region-row' },
        el('span', { class: 'pat-region-name' }, tr(r.label_th, r.label_en)),
        el('span', { class: 'pat-region-val' },
          r.worst_month
            ? `${tr('เดือนแย่สุด', 'worst')}: ${tr(TH_MONTHS[r.worst_month.month - 1], EN_MONTHS[r.worst_month.month - 1])} · ${fmtNum(r.worst_month.avg, 1)} µg`
            : '—')))
      const parts = [
        hourStrip(p.hourly, p.peak_hours),
        weekdayLine(p.weekday),
        regionRows.length ? el('div', { class: 'pat-regions' },
          el('div', { class: 'pat-row-head' }, tr('เดือนแย่สุดรายภูมิภาค', 'WORST MONTH BY REGION')),
          ...regionRows) : null,
        insightLines(p.insights),
        el('div', { class: 'pat-method' }, tr(p.method_th, p.method_en)),
      ].filter(Boolean)
      wrap.replaceChildren(
        el('div', { class: 'ana-card-head' },
          el('div', { class: 'ana-card-title' }, tr('รูปแบบฝุ่นทั้งประเทศ · จากประวัติจริง', 'NATIONAL PATTERNS · WHAT HISTORY TEACHES'))),
        ...parts)
    })
    .catch(() => {
      wrap.querySelector('.pat-loading')?.replaceChildren(
        document.createTextNode(tr('โหลดรูปแบบไม่สำเร็จ', 'failed to load patterns')))
    })
  return wrap
}

/** One-line relief ETA ("ฝนช่วยล้างฝุ่นพรุ่งนี้ · washout rain tomorrow,
 *  8mm @98%") for a washout entry; null when there is nothing to say. */
export function reliefEtaLine(entry, { alwaysShow = false } = {}) {
  const eta = entry?.relief_eta
  if (!eta) return null
  if (eta.day === null && !alwaysShow) return null
  const detail = eta.day !== null && eta.mm !== null
    ? `, ${fmtNum(eta.mm, 0)}${tr('มม.', 'mm')}${eta.prob !== null ? ` @${fmtNum(eta.prob, 0)}%` : ''}`
    : ''
  return el('div', { class: `relief-eta${eta.day === null ? ' relief-eta-none' : ''}` },
    `${eta.day === null ? '☁' : '🌧'} ${tr(eta.label_th, eta.label_en)}${detail}`)
}

/** "Worse before better" warning chip — CAMS says the air worsens >25%
 *  before the washout rain arrives. */
export function worseBeforeBetterChip(entry) {
  if (!entry?.worse_before_better) return null
  return el('span', {
    class: 'worse-chip',
    title: tr('พยากรณ์ CAMS ชี้ว่าฝุ่นจะสูงขึ้น >25% ก่อนฝนล้างฝุ่นจะมาถึง',
      'CAMS forecast: PM2.5 worsens >25% before the washout rain arrives'),
  }, `⚠ ${tr('แย่ลงก่อนดีขึ้น', 'worse before better')}`)
}
