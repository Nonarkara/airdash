// City Dashboard panel — the morphed experience when a focus area is selected.
// When the user picks a city (or arrives via ?city=X), this panel fetches the
// full city profile from /api/focus/:id and renders it as a dedicated
// dashboard: city identity plate, multi-metric pollutant strip, danger score,
// washout outlook, nearest stations, seasonal context, and city-specific
// hotlines/links. This replaces the generic ranking rail with a *city story*.
//
// The panel is injected into the left rail (#rail-left) below the place card,
// and auto-refreshes every 5 minutes. It degrades gracefully — if the city
// detail fetch fails, it shows the blurb from the manifest and nothing else.
import { store, on, emit } from '../state.js?v=2.4.15'
import { tr } from '../i18n.js?v=2.4.15'
import { getJson } from '../cache.js?v=2.4.15'
import { fmtNum } from '../fmt.js?v=2.4.15'
import { riskCi } from '../confidence.js?v=2.4.15'
import { focusById } from './focus.js?v=2.4.15'

const REFRESH_MS = 5 * 60_000
const FETCH_TTL = 60_000 // city detail cache — 1 min (data moves on ingest cadence)

// Pollutant metadata: thresholds (Thai AQI 2023), labels, units.
// Used to color the multi-metric tiles. O3/NO2/SO2 in ppb, CO in ppm, PM in µg/m³.
const POLLUTANT_META = {
  pm25: { th: 'PM2.5', en: 'PM2.5', unit: 'µg/m³', thresholds: [15, 25, 37.5, 75], accent: true },
  pm10: { th: 'PM10', en: 'PM10', unit: 'µg/m³', thresholds: [50, 80, 120, 180] },
  o3:   { th: 'โอโซน', en: 'Ozone', unit: 'ppb', thresholds: [70, 100, 120, 150] },
  no2:  { th: 'NO₂', en: 'NO₂', unit: 'ppb', thresholds: [100, 170, 250, 999] },
  so2:  { th: 'SO₂', en: 'SO₂', unit: 'ppb', thresholds: [100, 200, 300, 999] },
  co:   { th: 'CO', en: 'CO', unit: 'ppm', thresholds: [9, 15, 30, 999] },
}

function bandForThreshold(value, thresholds) {
  if (value == null || !Number.isFinite(value)) return 'none'
  if (value >= thresholds[3]) return 'lv5'
  if (value >= thresholds[2]) return 'lv4'
  if (value >= thresholds[1]) return 'lv3'
  if (value >= thresholds[0]) return 'lv2'
  return 'lv1'
}

function bandColor(band) {
  return { lv1: '#2E8B57', lv2: '#C8B560', lv3: '#D8893A', lv4: '#C8453A', lv5: '#6B2D5C', none: '#7E8E9A' }[band] || '#7E8E9A'
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v
    else if (k === 'html') n.innerHTML = v
    else if (k === 'style') n.setAttribute('style', v)
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
    else n.setAttribute(k, v)
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue
    n.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return n
}

// Geography → label + accent path (from the manifest's geography field).
const GEO_LABELS = {
  basin: { th: 'แอ่ง / ลุ่มน้ำ', en: 'Basin' },
  plain: { th: 'ที่ราบ', en: 'Plain' },
  coastal: { th: 'ชายฝั่ง', en: 'Coastal' },
  metro: { th: 'มหานคร', en: 'Metropolis' },
  valley: { th: 'หุบเขา', en: 'Valley' },
  border: { th: 'ชายแดน', en: 'Border' },
}

const REGION_LABELS = {
  north: { th: 'ภาคเหนือ', en: 'Northern' },
  central: { th: 'ภาคกลาง', en: 'Central' },
  northeast: { th: 'ภาคตะวันออกเฉียงเหนือ', en: 'Northeastern' },
  south: { th: 'ภาคใต้', en: 'Southern' },
  bangkok: { th: 'กรุงเทพมหานคร', en: 'Bangkok' },
}

let activeAreaId = null
let refreshTimer = null

export function initCityDashboard() {
  // When the focus event fires (from focus.js selecting a city), show the panel.
  on('focus', (area) => {
    activeAreaId = area?.id ?? null
    renderCityPanel()
    if (refreshTimer) clearInterval(refreshTimer)
    if (activeAreaId && activeAreaId !== 'thailand') {
      refreshTimer = setInterval(renderCityPanel, REFRESH_MS)
    }
  })
}

async function renderCityPanel() {
  const host = document.getElementById('city-dashboard')
  if (!host) return

  // All-Thailand selected → show the "pick a city" landing grid instead
  // of nothing. Lets the user see all 7 focus cities without scrolling
  // back to the header dropdown, and previews each city's personality
  // accent SVG + blurb before they commit.
  if (!activeAreaId || activeAreaId === 'thailand') {
    await renderCityPicker(host)
    return
  }

  let data
  try {
    data = await getJson(`/api/focus/${activeAreaId}`, FETCH_TTL)
  } catch {
    host.style.display = 'none'
    return
  }

  host.style.display = ''
  const isEn = store.lang === 'en'
  const L = (th, en) => (isEn ? en : th)
  const a = data.area

  host.replaceChildren(
    // ── City identity plate ─────────────────────────────────────────
    el('div', { class: 'cd-plate' },
      // City "personality" accent SVG — a subtle silhouette behind the name
      a.accent_svg
        ? el('svg', { class: 'cd-accent', viewBox: '0 0 80 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
            el('path', { d: a.accent_svg, fill: 'currentColor' }))
        : null,
      el('div', { class: 'cd-eyebrow' },
        L('แดชบอร์ดเมือง', 'CITY DASHBOARD')),
      el('div', { class: 'cd-name display' }, L(a.name_th, a.name_en)),
      // Geography + region + population context line
      el('div', { class: 'cd-context' },
        a.geography ? L(GEO_LABELS[a.geography]?.th ?? '', GEO_LABELS[a.geography]?.en ?? '') : null,
        a.geography ? ' · ' : null,
        a.region_code ? L(REGION_LABELS[a.region_code]?.th ?? '', REGION_LABELS[a.region_code]?.en ?? '') : null,
        a.population ? ' · ' + fmtNum(a.population, 0) + ' ' + L('คน', 'pop.') : null,
      ),
      el('div', { class: 'cd-blurb' }, L(a.blurb_th, a.blurb_en)),
    ),

    // ── City verdict + danger score (if we have risk data) ──────────
    data.risk ? cityScoreRow(data, L) : null,

    // ── Multi-metric pollutant strip ─────────────────────────────────
    data.multi_metrics ? multiMetricStrip(data.multi_metrics, data.weather, data.forecast, L) : null,

    // ── Nearest stations ─────────────────────────────────────────────
    data.stations?.length ? nearestStations(data.stations, L) : null,

    // ── Seasonal note ────────────────────────────────────────────────
    (a.seasonal_note_th || a.seasonal_note_en)
      ? el('div', { class: 'cd-section cd-seasonal' },
          el('div', { class: 'cd-section-head' }, L('คาดการณ์ตามฤดู', 'SEASONAL CONTEXT')),
          el('p', { class: 'cd-seasonal-note' }, L(a.seasonal_note_th, a.seasonal_note_en)),
        )
      : null,

    // ── City-specific hotlines + links ───────────────────────────────
    (a.hotlines?.length || a.custom_links?.length)
      ? el('div', { class: 'cd-section cd-resources' },
          el('div', { class: 'cd-section-head' }, L('สายด่วนและแหล่งข้อมูล', 'HOTLINES & RESOURCES')),
          el('div', { class: 'cd-resources-grid' },
            // National hotlines first
            ...[
              { num: '1650', label_th: 'มลพิษ คพ.', label_en: 'PCD Pollution' },
              { num: '1422', label_th: 'สุขภาพ กอ.', label_en: 'DDC Health' },
              { num: '1669', label_th: 'ฉุกเฉิน', label_en: 'EMS' },
            ].map((h) => hotlineChip(h, L)),
            // City-specific hotlines
            ...(a.hotlines ?? []).map((h) => hotlineChip(h, L)),
          ),
          a.custom_links?.length
            ? el('div', { class: 'cd-links' },
                ...a.custom_links.map((l) =>
                  el('a', { class: 'cd-link', href: l.url, target: '_blank', rel: 'noopener' },
                    '→ ', L(l.label_th, l.label_en))))
            : null,
        )
      : null,

    // ── Recent alerts for this city ──────────────────────────────────
    data.alerts?.length
      ? el('div', { class: 'cd-section cd-alerts' },
          el('div', { class: 'cd-section-head' }, L('แจ้งเตือนล่าสุด', 'RECENT ALERTS')),
          ...data.alerts.map((al) =>
            el('div', { class: 'cd-alert' },
              el('span', { class: 'cd-alert-time' }, (al.ts ?? '').slice(0, 16).replace('T', ' ')),
              el('span', { class: 'cd-alert-msg' }, L(al.message_th ?? '', al.message_en ?? al.message_th ?? '')),
            )),
        )
      : null,
  )
}

/** Render the "pick a city" landing grid when the user has All Thailand
 *  selected. Lists all 7 focus cities with their accent SVG, blurb, and a
 *  one-click handler that fires the same 'focus' event the dropdown uses.
 *  Pulls the manifest from cache so the grid is in sync with whatever the
 *  user sees in the focus dropdown. */
async function renderCityPicker(host) {
  host.style.display = ''
  const isEn = store.lang === 'en'
  const L = (th, en) => (isEn ? en : th)
  let areas = []
  try {
    const data = await getJson('/api/focus', 3600_000)
    areas = (data.areas ?? []).filter((a) => a.id !== 'thailand')
  } catch {
    host.replaceChildren(el('div', { class: 'cd-pick-error' }, L('ไม่สามารถโหลดเมือง', 'Failed to load cities')))
    return
  }
  const tiles = areas.map((a) =>
    el('button', {
      class: `cd-pick-tile geo-${a.geography ?? 'plain'}`,
      // The blurb no longer renders inside the tile (the compact grid
      // keeps only name + terrain line) — it lives in the tooltip, and
      // the full story appears in the city dashboard after the tap.
      title: L(a.blurb_th, a.blurb_en),
      // focusById is the SAME path the header dropdown takes: it flies
      // the map, scopes the rails, and syncs the dropdown + ?city= URL.
      // The old handler emitted the bare 'focus' event, which notified
      // panels but never called map.flyTo — "tap a city to fly there"
      // loaded the dashboard while the camera never moved.
      onclick: () => focusById(a.id),
    },
      a.accent_svg
        ? el('svg', { class: 'cd-pick-accent', viewBox: '0 0 80 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
            el('path', { d: a.accent_svg, fill: 'currentColor' }))
        : null,
      el('div', { class: 'cd-pick-name display' }, L(a.name_th, a.name_en)),
      el('div', { class: 'cd-pick-geo' },
        a.geography ? L(GEO_LABELS[a.geography]?.th ?? '', GEO_LABELS[a.geography]?.en ?? '') : null,
        a.region_code ? ' · ' + L(REGION_LABELS[a.region_code]?.th ?? '', REGION_LABELS[a.region_code]?.en ?? '') : null,
      ),
    ))
  host.replaceChildren(
    el('div', { class: 'cd-pick-head' },
      el('div', { class: 'cd-pick-eyebrow' }, L('เลือกเมือง', 'PICK A CITY')),
      el('div', { class: 'cd-pick-hint' }, L('แตะเพื่อบินไปยังเมืองที่สนใจ', 'Tap a city to fly there and load its dashboard.')),
    ),
    el('div', { class: 'cd-pick-grid' }, ...tiles),
  )
}

function cityScoreRow(data, L) {
  const r = data.risk
  const d = data.danger
  const w = data.washout

  // Map the watch-score band onto our 1–5 level palette so the same colour
  // convention used by the top-bar danger chip and the levelcounts chips
  // carries through. Reusing bandColor keeps the design vocabulary tight.
  const watchBand =
    r.band === 'normal' ? 'lv1' :
    r.band === 'watch' ? 'lv2' :
    r.band === 'elevated' ? 'lv3' :
    r.band === 'high' ? 'lv4' : 'lv1'

  // Confidence interval for the watch score — same riskCi() the top bar
  // uses so a reader gets the same trust signal in both places. Falls
  // back to nothing when the score is missing.
  const ci = r.score != null ? riskCi(r.score) : null

  return el('div', { class: 'cd-scores' },
    // Air Watch Score + verb
    el('div', { class: 'cd-score-card' },
      el('div', { class: 'cd-score-label' }, L('คะแนนเฝ้าระวัง', 'WATCH SCORE')),
      el('div', { class: 'cd-score-value mono', style: `color:${bandColor(watchBand)}` },
        r.score != null ? `${r.score}/100` : '—'),
      el('div', { class: 'cd-score-sub' },
        ci ? `±${ci.sigma}` : '',
        r.pm25 != null ? ` · PM2.5 ${fmtNum(r.pm25, 0)} µg` : ''),
    ),
    // Danger score
    d
      ? el('div', { class: 'cd-score-card' },
          el('div', { class: 'cd-score-label' }, L('ดัชนีอันตราย', 'DANGER SCORE')),
          el('div', { class: 'cd-score-value mono', style: `color:${d.band_color}` },
            `${d.score}/100`),
          el('div', { class: 'cd-score-sub' }, L(d.label_th, d.label_en)),
        )
      : null,
    // Washout — show 0% when band is none, not '—'. The washout module
    // always returns a band, so the original `w && w.band` guard was
    // never falsy and the 0% case rendered as '—' instead of a number.
    w
      ? el('div', { class: 'cd-score-card' },
          el('div', { class: 'cd-score-label' }, L('ฝนล้างฝุ่น', 'WASHOUT')),
          el('div', { class: 'cd-score-value mono', style: 'color:var(--rain)' },
            w.expected_relief_pct != null ? `${w.expected_relief_pct}%` : '0%'),
          el('div', { class: 'cd-score-sub' },
            w.band === 'strong' ? L('ฝนล้างฝุ่นได้มาก', 'Strong washout')
            : w.band === 'moderate' ? L('ฝนช่วยได้', 'Moderate')
            : w.band === 'light' ? L('ช่วยเล็กน้อย', 'Light')
            : L('ไม่มีฝนช่วย', 'No rain relief')),
        )
      : null,
  )
}

function multiMetricStrip(mm, weather, forecast, L) {
  const tiles = []
  // Pollutants
  for (const [key, meta] of Object.entries(POLLUTANT_META)) {
    const val = mm?.[key]
    if (val == null || !Number.isFinite(val)) continue
    const band = bandForThreshold(val, meta.thresholds)
    tiles.push(el('div', { class: `cd-metric-tile ${band}` },
      el('div', { class: 'cd-metric-label' }, meta.en),
      el('div', { class: 'cd-metric-value mono', style: `color:${bandColor(band)}` },
        fmtNum(val, meta.unit === 'ppm' ? 1 : 0)),
      el('div', { class: 'cd-metric-unit' }, meta.unit),
    ))
  }
  // Weather: temp, humidity, wind
  if (weather) {
    if (weather.temp_c != null) tiles.push(weatherTile('TEMP', `${fmtNum(weather.temp_c, 0)}°C`, L('อุณหภูมิ', 'Temperature')))
    if (weather.rh_pct != null) tiles.push(weatherTile('RH', `${fmtNum(weather.rh_pct, 0)}%`, L('ความชื้น', 'Humidity')))
    if (weather.wind_fc_kmh != null) tiles.push(weatherTile('WIND', `${fmtNum(weather.wind_fc_kmh, 0)} km/h`, L('ลม', 'Wind')))
    if (weather.precip_prob_24h != null) tiles.push(weatherTile('RAIN%', `${fmtNum(weather.precip_prob_24h, 0)}%`, L('โอกาสฝน 24 ชม.', 'Rain chance 24h')))
  }
  // CAMS forecast
  if (forecast) {
    if (forecast.pm25_fc_24h != null) tiles.push(weatherTile('FC 24h', `${fmtNum(forecast.pm25_fc_24h, 0)} µg`, L('พยากรณ์ PM2.5 24 ชม.', 'PM2.5 forecast 24h')))
    if (forecast.pm25_fc_48h != null) tiles.push(weatherTile('FC 48h', `${fmtNum(forecast.pm25_fc_48h, 0)} µg`, L('พยากรณ์ 48 ชม.', 'Forecast 48h')))
  }

  if (!tiles.length) return null

  return el('div', { class: 'cd-section cd-metrics' },
    el('div', { class: 'cd-section-head' }, L('ค่ามลพิษและสภาพอากาศ', 'POLLUTANTS & WEATHER')),
    el('div', { class: 'cd-metric-grid' }, ...tiles),
  )
}

function weatherTile(label, value, tooltip) {
  return el('div', { class: 'cd-metric-tile cd-metric-weather', title: tooltip },
    el('div', { class: 'cd-metric-label' }, label),
    el('div', { class: 'cd-metric-value mono' }, value),
  )
}

function nearestStations(stations, L) {
  return el('div', { class: 'cd-section cd-stations' },
    el('div', { class: 'cd-section-head' }, L('สถานีวัดใกล้สุด', 'NEAREST STATIONS')),
    ...stations.map((s) => {
      const chip = el('div', { class: 'cd-station-row' },
        el('span', { class: 'cd-station-pm mono', style: s.pm25 != null ? `color:${bandColor(bandForThreshold(s.pm25, POLLUTANT_META.pm25.thresholds))}` : '' },
          s.pm25 != null ? fmtNum(s.pm25, 0) : '—'),
        el('span', { class: 'cd-station-name' }, L(s.name_th, s.name_en ?? s.name_th)),
        el('span', { class: 'cd-station-dist mono' }, s.distance_km != null ? `${s.distance_km} km` : ''),
      )
      chip.addEventListener('click', () => emit('station-select', { source: 'air4thai', station: s }))
      chip.style.cursor = 'pointer'
      return chip
    }),
  )
}

function hotlineChip(h, L) {
  return el('a', { class: 'cd-hotline', href: `tel:${h.num.replace(/[^0-9]/g, '')}` },
    el('span', { class: 'cd-hotline-num mono' }, h.num),
    el('span', { class: 'cd-hotline-label' }, L(h.label_th ?? '', h.label_en ?? '')),
  )
}