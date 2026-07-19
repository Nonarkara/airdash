// Data-source catalog panel — every pipeline, JAXA satellite layer, and export
// endpoint for researchers who want to reuse AirDash feeds.
import { getJson } from '../cache.js?v=2.0.0-bcast1'
import { on, store } from '../state.js?v=2.0.0-bcast1'
import { tr } from '../i18n.js?v=2.0.0-bcast1'
import { el, fmtNum } from '../fmt.js?v=2.0.0-bcast1'
import { refreshSensorHealth } from '../sensorHealth.js?v=2.0.0-bcast1'

const KIND_LABEL = {
  pipeline: { th: 'ท่อข้อมูล', en: 'pipeline' },
  satellite: { th: 'ดาวเทียม/เรดาร์', en: 'remote sensing' },
  reference: { th: 'อ้างอิง', en: 'reference' },
}

let catalog = null

export function initSources() {
  load()
  refreshSensorHealth().catch(() => {})
  on('sensor-health', paint)
  on('lang', paint)
}

async function load() {
  try {
    catalog = await getJson('/api/sources', 300_000)
    paint()
  } catch {
    const box = document.getElementById('sources')
    if (box) box.textContent = tr('โหลดแคตตาล็อกไม่สำเร็จ', 'failed to load catalog')
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
    box.textContent = tr('ไม่สามารถโหลดรายการวันได้', 'could not load day list')
  }
}

function todayLocal() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
}
