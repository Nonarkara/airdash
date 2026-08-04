// Data-source catalog panel — every pipeline, JAXA satellite layer, and export
// endpoint for researchers who want to reuse AirDash feeds.
import { getJson } from '../cache.js?v=2.4.3'
import { on, store } from '../state.js?v=2.4.3'
import { tr } from '../i18n.js?v=2.4.3'
import { el, fmtNum } from '../fmt.js?v=2.4.3'
import { refreshSensorHealth } from '../sensorHealth.js?v=2.4.3'

const KIND_LABEL = {
  pipeline: { th: 'ท่อข้อมูล', en: 'pipeline' },
  satellite: { th: 'ดาวเทียม/เรดาร์', en: 'remote sensing' },
  reference: { th: 'อ้างอิง', en: 'reference' },
}

// Per-pipeline freshness band thresholds. The default cadence for most
// pipelines is 10–60 min, so a pipeline that hasn't updated in 2× its
// interval is "stale" by definition; <1× is healthy; between is aging.
// The /api/snapshot payload already gives us the source's intervalMs
// (so we don't hardcode cadences here), but the bands are kept simple:
//   <1× interval  → fresh
//   1–2× interval → aging
//   >2× interval  → stale
const BAND = { ok: 'ok', warn: 'warn', stale: 'stale' }

let catalog = null

export function initSources() {
  load()
  refreshSensorHealth().catch(() => {})
  on('sensor-health', paint)
  on('snapshot', paint)   // re-paint when a new snapshot arrives so the
                          // "last update X min ago" line stays current
  on('lang', paint)
}

async function load() {
  try {
    catalog = await getJson('/api/sources', 300_000)
    paint()
  } catch {
    const box = document.getElementById('sources')
    if (!box) return
    box.innerHTML = `
      <div class="src-error">
        <div class="src-error-msg">${tr('โหลดรายการแหล่งข้อมูลไม่สำเร็จ', "Couldn't load the data sources list")}</div>
        <button class="src-retry" type="button">${tr('ลองอีกครั้ง', 'Try again')}</button>
      </div>`
    box.querySelector('.src-retry')?.addEventListener('click', () => load())
  }
}

function paint() {
  const box = document.getElementById('sources')
  if (!box || !catalog) return
  box.replaceChildren()

  const health = store.sensorHealth
  if (health) {
    const s = health.summary ?? {}
    const score = health.quality_score ?? 0
    const band = score >= 90 ? 'ok' : score >= 70 ? 'warn' : 'bad'
    box.append(el('div', { class: `src-health ${band}` },
      el('div', { class: 'eyebrow' }, tr('คุณภาพข้อมูลเซ็นเซอร์ · SENSOR HEALTH', 'SENSOR DATA QUALITY')),
      el('div', { class: 'src-health-score' },
        el('span', { class: 'src-health-num' }, String(score)),
        el('span', { class: 'src-health-of' }, '/100')),
      el('p', {},
        tr(
          `สแกน ${fmtNum(s.total_stations)} สถานี — เงียบ ${s.stale ?? 0} · ค้าง ${s.flatline ?? 0} · ผิดปกติ ${s.outlier ?? 0} · ไม่สอดคล้อง ${s.mismatch ?? 0}`,
          `${fmtNum(s.total_stations)} stations scanned — stale ${s.stale ?? 0} · flatline ${s.flatline ?? 0} · outlier ${s.outlier ?? 0} · mismatch ${s.mismatch ?? 0}`,
        )),
      el('div', { class: 'src-links' },
        link('/api/sensors/health', 'GET /api/sensors/health'))))
  }

  // JAXA research note
  if (catalog.jaxa) {
    box.append(el('div', { class: 'src-jaxa' },
      el('div', { class: 'eyebrow' }, 'JAXA · สำนักงานวิจัยอวกาศญี่ปุ่น'),
      el('p', {}, tr(catalog.jaxa.note_th, catalog.jaxa.note_en)),
      el('div', { class: 'src-links' },
        link(catalog.jaxa.portal, tr('แคตตาล็อกข้อมูล JAXA', 'JAXA data catalog')),
        link(catalog.jaxa.api, 'JAXA Earth API'),
        link(catalog.jaxa.ptree, tr('Himawari P-Tree', 'Himawari P-Tree')),
      )))
  }

  // Pipelines
  box.append(sectionHead(tr('ท่อข้อมูลที่เก็บใน SQLite', 'STORED PIPELINES (SQLite)')))
  for (const s of catalog.pipelines ?? []) box.append(sourceCard(s))

  // Remote sensing
  box.append(sectionHead(tr('ชั้นภาพระยะไกล (ไม่เก็บในฐานข้อมูล)', 'REMOTE LAYERS (not stored)')))
  for (const s of catalog.remote ?? []) box.append(sourceCard(s))

  // Export / historical download
  if (catalog.export) {
    box.append(sectionHead(tr('ดาวน์โหลดข้อมูลที่เรารวบรวม', 'DOWNLOAD OUR COLLECTED DATA')))
    box.append(el('div', { class: 'src-export' },
      el('p', {}, tr(catalog.export.method_th, catalog.export.method_en)),
      el('div', { class: 'src-links' },
        link('/api/export/days', 'GET /api/export/days'),
        link(`/api/export/daily?date=${todayLocal()}&format=json`, tr('ตัวอย่าง JSON วันนี้', 'today JSON sample')),
        link(`/api/export/daily?date=${todayLocal()}&format=csv`, tr('ดาวน์โหลด CSV วันนี้', 'download today CSV')),
      ),
      el('div', { class: 'src-days', id: 'export-days' }, tr('กำลังโหลดรายการวัน…', 'loading available days…')),
    ))
    loadDays()
  }
}

function sectionHead(title) {
  return el('div', { class: 'src-section' }, title)
}

// Plain-language age string used in the source card's "last update" line.
// Mirrors the format the dataFreshness module uses so the operator sees
// the same wording in the header pill and the source card.
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
  return lang === 'th' ? `${h} ชม. ที่แล้ว` : `${h} h ago`
}

// Per-pipeline freshness band — uses the source's own intervalMs from
// the snapshot payload so a 1h pipeline and a 10-min pipeline share the
// same band semantics (1× the cadence is the threshold, not 15 minutes).
function pipelineBand(ageSec, intervalMs) {
  if (ageSec == null || !Number.isFinite(ageSec)) return 'unknown'
  if (!intervalMs) return ageSec < 15 * 60 ? 'ok' : ageSec < 60 * 60 ? 'warn' : 'stale'
  if (ageSec < intervalMs / 1000) return 'ok'
  if (ageSec < 2 * intervalMs / 1000) return 'warn'
  return 'stale'
}

// Per-pipeline "last update" line. Pipeline sources have a runtime
// status (lastOk / failures) from /api/snapshot; remote/reference
// sources don't, so we only show the line for pipelines.
function freshnessLine(sourceId) {
  if (!store.snapshot?.sources) return null
  const live = store.snapshot.sources[sourceId]
  if (!live) return null
  const lang = store.lang
  const intervalMs = live.intervalMs
  const lastOkStr = live.lastOk
  if (!lastOkStr) {
    return el('div', { class: 'src-fresh src-fresh--unknown' },
      tr('ยังไม่เคยอัปเดต', 'never updated'))
  }
  const lastOk = new Date(lastOkStr)
  if (!Number.isFinite(lastOk.getTime())) return null
  const ageSec = (Date.now() - lastOk.getTime()) / 1000
  const band = pipelineBand(ageSec, intervalMs)
  const failures = Number(live.failures ?? 0)
  const parts = []
  parts.push(tr('อัปเดต', 'updated'))
  parts.push(ageText(ageSec, lang))
  if (failures > 0) {
    parts.push(tr(`ผิดพลาด ${failures} ครั้งล่าสุด`, `${failures} recent failure${failures > 1 ? 's' : ''}`))
  }
  // Long hover truth: the source's local timestamp, the band, and the
  // last error message if there is one. Operators investigating "why is
  // this data old" can hover to see the actual error string instead of
  // having to dig through the logs.
  const clock = lastOk.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const bandLabel = band === 'ok'
    ? tr('สด', 'live')
    : band === 'warn'
      ? tr('เริ่มเก่า', 'aging')
      : tr('เก่า', 'stale')
  const hover = lang === 'th'
    ? `อัปเดตล่าสุด ${clock} น. (เวลาไทย) — ${bandLabel}${live.lastError ? '\nข้อผิดพลาด: ' + live.lastError : ''}`
    : `last refresh ${clock} BKK — ${bandLabel}${live.lastError ? '\nlast error: ' + live.lastError : ''}`
  return el('div', { class: `src-fresh src-fresh--${band}`, title: hover },
    '🕒 ', parts.join(' · '))
}

function sourceCard(s) {
  const kind = KIND_LABEL[s.kind] ?? KIND_LABEL.pipeline
  return el('div', { class: 'src-card' },
    el('div', { class: 'src-head' },
      el('span', { class: `src-kind ${s.kind}` }, tr(kind.th, kind.en)),
      el('span', { class: 'src-stored' }, s.stored
        ? tr('● เก็บใน SQLite', '● stored in SQLite')
        : tr('○ แสดงบนแผนที่เท่านั้น', '○ map overlay only')),
    ),
    el('div', { class: 'src-name th' }, tr(s.name_th, s.name_en)),
    el('div', { class: 'src-agency' }, tr(s.agency_th, s.agency_en)),
    el('div', { class: 'src-meta' },
      el('span', {}, tr('ความถี่', 'cadence'), ': ', tr(s.cadence_th, s.cadence_en)),
      s.metrics?.length ? el('span', {}, ' · ', s.metrics.join(', ')) : null,
    ),
    // Per-pipeline freshness line — shows the last successful ingest
    // for this specific source, color-coded against the source's own
    // cadence. Remote / reference sources (no runtime status) skip it.
    freshnessLine(s.id),
    el('div', { class: 'src-note' }, tr(s.note_th, s.note_en)),
    el('div', { class: 'src-links' },
      link(s.url, tr('แหล่งต้นทาง', 'upstream')),
      s.api?.startsWith('http') ? link(s.api, 'API') : el('code', { class: 'src-api' }, s.api),
    ),
  )
}

function link(href, label) {
  const a = el('a', { href, target: '_blank', rel: 'noopener' }, label)
  if (href.startsWith('/api/')) a.removeAttribute('target')
  return a
}

async function loadDays() {
  const box = document.getElementById('export-days')
  if (!box) return
  try {
    const j = await getJson('/api/export/days?limit=14', 60_000)
    const days = j.days ?? []
    box.replaceChildren(
      el('span', { class: 'src-days-lbl' }, tr('วันที่มีข้อมูล (14 วันล่าสุด): ', 'days with data (latest 14): ')),
      ...days.map((d) => el('a', {
        href: `/api/export/daily?date=${d}&format=csv`,
        class: 'src-day',
        title: tr(`ดาวน์โหลด CSV ${d}`, `download CSV ${d}`),
      }, d)),
    )
  } catch {
    box.innerHTML = `
      <div class="src-days-err">
        ${tr('โหลดรายการวันไม่สำเร็จ', "Couldn't load the day list")} ·
        <button class="src-days-retry" type="button">${tr('ลองอีกครั้ง', 'Try again')}</button>
      </div>`
    box.querySelector('.src-days-retry')?.addEventListener('click', () => loadDays())
  }
}

function todayLocal() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
}
