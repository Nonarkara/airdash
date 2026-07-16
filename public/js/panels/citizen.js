// Citizen-mode panel — what ordinary people need to see in 30 seconds.
// Surfaces the four questions that matter during a flood:
//   1. Am I safe right now?          → JMA verb at the top
//   2. What do I do?                  → checklist (already in the
//                                      national action card, surfaced bigger here)
//   3. Where do I go?                 → 3 nearest shelters + one-tap
//                                      Google Maps navigate
//   4. How do I tell my family?       → share-status via LINE / SMS
//
// Citizen mode also pins the user's "My Province" — saved to localStorage
// so the dashboard defaults to the user's location on every visit. The
// "เปลี่ยนจังหวัด" button opens a searchable province picker.
import { on, store, emit } from '../state.js?v=2.0.0-final'
import { tr, BAND } from '../i18n.js?v=2.0.0-final'
import { el, escapeHtml } from '../fmt.js?v=2.0.0-final'
import { fetchNearestShelters } from '../layers/shelters.js?v=2.0.0-final'
import { flyToProvince } from '../map.js?v=2.0.0-final'

const MY_PROVINCE_KEY = 'fd_my_province'

// All 77 provinces of Thailand (TH + EN) for the picker. Hardcoded because
// the snapshot only includes the 78 that have stations; some border-area
// provinces might not. We cross-reference with the snapshot on render.
let PROVINCE_INDEX = []

export function initCitizen() {
  const box = document.getElementById('citizen')
  if (!box) return
  // Province index gets populated on first snapshot
  on('snapshot', (s) => {
    if (!PROVINCE_INDEX.length) {
      PROVINCE_INDEX = (s?.risk?.provinces ?? []).map((p) => ({
        th: p.province_th, en: p.province_en, code: p.province_code,
        score: p.score, band: p.band, lat: p.lat, lng: p.lng,
      }))
    }
    // URL ?city= deep link: someone shared a link to "your city's dashboard".
    // Pin that province on first snapshot arrival (not on init, because the
    // index isn't populated yet) so the citizen panel auto-loads with
    // JMA verb + shelters + share without any clicks.
    const urlCity = new URLSearchParams(location.search).get('city')?.trim()
    if (urlCity && !readMyProvince() && PROVINCE_INDEX.length) {
      const match = matchProvinceFromQuery(urlCity)
      if (match) {
        setMyProvince(match)
        // Switch to the citizen tab so the card is visible immediately.
        try {
          const tab = document.getElementById('tab-citizen')
          tab?.click()
          // Also auto-fly the map to that province.
          if (match.lat != null && match.lng != null) {
            import('../map.js?v=2.0.0-final').then(({ flyToProvince }) => flyToProvince(match)).catch(() => {})
          }
        } catch {}
      }
    }
    paint(box)
  })
  on('lang', () => paint(box))
  on('my-province-changed', () => paint(box))
  paint(box)

  // Geolocation default — if the user has no saved province AND the
  // browser grants geolocation, find the nearest province from the
  // snapshot and pin it. This is the "the dashboard just knows where I
  // am" experience: the citizen opens the page, sees their province's
  // JMA verb, and never had to click anything.
  if (!readMyProvince()) tryGeolocate()
}

// URL ?city= matching. Accepts the Thai name, English name, or province
// code. The province index is loaded from the risk snapshot so we have
// lat/lng + band data attached.
function matchProvinceFromQuery(q) {
  const norm = (s) => (s ?? '').toString().trim().toLowerCase()
  const qn = norm(q)
  // Exact match (Thai or English, case-insensitive)
  let m = PROVINCE_INDEX.find((p) => norm(p.th) === qn || norm(p.en) === qn)
  if (m) return m
  // Code match (2-digit)
  m = PROVINCE_INDEX.find((p) => p.code === q || p.code === String(parseInt(q, 10)).padStart(2, '0'))
  if (m) return m
  // Substring fallback — "trat" inside "stratford" is unlikely but "หาดใหญ่" inside "สงขลา" might be
  m = PROVINCE_INDEX.find((p) => norm(p.th).includes(qn) || norm(p.en).includes(qn))
  return m ?? null
}

/** Try the browser's geolocation. On success: nearest province. On
 *  failure (denied, unavailable, timeout): no-op. We never pester the
 *  user with permission dialogs more than once per session. */
function tryGeolocate() {
  if (!('geolocation' in navigator)) return
  // Throttle so we don't re-prompt on every navigation
  if (sessionStorage.getItem('fd_geo_asked')) return
  sessionStorage.setItem('fd_geo_asked', '1')
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      // Wait for the province index to populate (snapshot might still be loading)
      const tryPick = () => {
        if (!PROVINCE_INDEX.length) return setTimeout(tryPick, 500)
        const nearest = nearestProvince(lat, lng)
        if (nearest) setMyProvince(nearest)
      }
      tryPick()
    },
    () => { /* denied or failed — that's fine, citizen can still pick */ },
    { timeout: 8000, maximumAge: 60_000 },
  )
}

function nearestProvince(lat, lng) {
  if (!PROVINCE_INDEX.length) return null
  let best = null
  let bestD = Infinity
  for (const p of PROVINCE_INDEX) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2
    if (d < bestD) { bestD = d; best = p }
  }
  return best
}

function paint(box) {
  const province = readMyProvince()
  box.replaceChildren(...render(province))
}

function readMyProvince() {
  try {
    const raw = localStorage.getItem(MY_PROVINCE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

export function setMyProvince(p) {
  if (!p) {
    localStorage.removeItem(MY_PROVINCE_KEY)
  } else {
    localStorage.setItem(MY_PROVINCE_KEY, JSON.stringify(p))
  }
  // Use the internal pub/sub (state.js) so listeners registered via
  // `on('my-province-changed', ...)` actually fire. A window.CustomEvent
  // would be ignored — they're disconnected channels.
  emit('my-province-changed', p)
}

/** Render the full citizen panel. Compact by design — no scrolling needed
 *  on a phone; everything fits in a single screen view. */
function render(province) {
  if (!province) return renderEmpty()
  return renderForProvince(province)
}

function renderEmpty() {
  const intro = el('div', { class: 'citizen-empty' },
    el('h3', {}, tr('เลือกจังหวัดของคุณ', 'Pick your province')),
    el('p', { class: 'citizen-empty-sub' },
      tr('เพื่อดูศูนย์พักพิงใกล้บ้าน + ระดับเสี่ยงเฉพาะพื้นที่',
         'See shelters near you + local risk level')),
    renderPicker(),
  )
  return [intro]
}

function renderForProvince(province) {
  const snap = store.snapshot
  const live = snap?.risk?.provinces?.find((p) =>
    (province.code && p.province_code === province.code) ||
    (province.th && p.province_th === province.th) ||
    (province.en && p.province_en === province.en)) ?? null
  const band = live?.band ?? province.band ?? 'normal'
  const score = live?.score ?? province.score ?? 0
  const verb = BAND[band] ?? BAND.normal

  const head = el('div', { class: 'citizen-head' },
    el('div', { class: 'citizen-pin' },
      el('span', { class: 'citizen-pin-icon' }, '📍'),
      el('div', { class: 'citizen-pin-text' },
        el('div', { class: 'citizen-province-th' }, tr(province.th, province.en)),
        el('div', { class: 'citizen-province-en' }, tr(province.en, province.th)),
      ),
      el('button', { class: 'citizen-change', type: 'button',
        title: tr('เปลี่ยนจังหวัด', 'change province'),
        onclick: () => showPicker() }, '✎'),
    ),
    el('div', { class: `citizen-band b-${band}` },
      el('div', { class: 'citizen-band-verb' }, tr(verb.th, verb.en)),
      el('div', { class: 'citizen-band-score' }, `${score}/100`),
    ),
  )

  // "Where do I go" — three nearest shelters (loaded async below)
  const shelterHead = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('📍 ศูนย์พักพิงใกล้คุณ', '📍 shelters near you')))
  // Show a "looking up..." placeholder so the section never looks broken
  // — shelters take ~5s to compute across 10,399 DDPM records.
  const shelterList = el('div', { class: 'citizen-shelter-list' },
    el('div', { class: 'citizen-loading' },
      el('span', { class: 'citizen-loading-dot' }),
      el('span', { class: 'citizen-loading-dot' }),
      el('span', { class: 'citizen-loading-dot' }),
      el('span', { class: 'citizen-loading-text' },
        tr('กำลังค้นหาศูนย์พักพิงใกล้คุณ…', 'Looking up shelters near you…'))))
  // Render shell first, fill in async so the page is interactive immediately
  const out = [head, shelterHead, shelterList]
  if (province.lat != null && province.lng != null) {
    fetchNearestShelters(province.lat, province.lng, 3, province.th)
      .then((rows) => {
        if (!rows.length) {
          shelterList.replaceChildren(el('div', { class: 'citizen-empty-sub' },
            tr('ไม่พบศูนย์พักพิงในจังหวัดนี้', 'no shelters found in this province')))
          return
        }
        shelterList.replaceChildren(...rows.map(shelterCard))
      })
      .catch(() => {})
  } else {
    shelterList.replaceChildren(el('div', { class: 'citizen-empty-sub' },
      tr('กำลังโหลดพิกัดจังหวัด…', 'loading province coords…')))
  }

  // "How do I tell my family" — share via LINE / SMS / copy
  const shareHead = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('📤 แจ้งสถานะให้ครอบครัว', '📤 share your status')))
  const shareRow = el('div', { class: 'citizen-share-row' },
    lineButton(province, band, score),
    smsButton(province, band, score),
    copyButton(province, band, score),
  )

  // LINE Notify was retired in 2025. Keep one honest, low-friction route:
  // follow the FloodDash Official Account. No personal token field, no dead
  // onboarding flow, and no promise of province-specific delivery.
  const lineHead = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('📲 ติดตาม FloodDash บน LINE', '📲 follow FloodDash on LINE')))
  const lineCard = el('a', {
    class: 'citizen-line-follow', href: 'https://line.me/R/ti/p/@flooddash',
    target: '_blank', rel: 'noopener',
  },
    el('span', { class: 'citizen-line-mark' }, 'LINE'),
    el('span', {}, tr('เพิ่มเพื่อน @flooddash', 'Add @flooddash')),
    el('span', { 'aria-hidden': 'true' }, '→'),
  )

  // "I need help" — one-tap hotline
  const helpHead = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('🆘 ขอความช่วยเหลือ', '🆘 get help')))
  const helpRow = el('div', { class: 'citizen-help-row' },
    el('a', { class: 'citizen-help-btn', href: 'tel:1784' },
      el('div', { class: 'citizen-help-num' }, '1784'),
      el('div', { class: 'citizen-help-lbl' }, tr('ปภ. (ตลอด 24 ชม.)', 'DDPM (24/7)'))),
    el('a', { class: 'citizen-help-btn', href: 'tel:1669' },
      el('div', { class: 'citizen-help-num' }, '1669'),
      el('div', { class: 'citizen-help-lbl' }, tr('กู้ชีพ ฉุกเฉิน', 'EMS'))),
    el('a', { class: 'citizen-help-btn', href: 'tel:191' },
      el('div', { class: 'citizen-help-num' }, '191'),
      el('div', { class: 'citizen-help-lbl' }, tr('ตำรวจฉุกเฉิน', 'police emergency'))),
  )

  return [...out, shareHead, shareRow, lineHead, lineCard, helpHead, helpRow, renderPickerCollapsed()]
}

function shelterCard(s) {
  const km = s.distance_km?.toFixed(1) ?? '?'
  const phone = s.phone ? `<a href="tel:${escapeHtml(s.phone)}">📞 ${escapeHtml(s.phone)}</a>` : ''
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
  return el('a', { class: 'citizen-shelter', href: gmaps, target: '_blank', rel: 'noopener' },
    el('div', { class: 'citizen-shelter-name' }, s.place ?? '—'),
    el('div', { class: 'citizen-shelter-meta' },
      `${tr('ห่าง', '~')} ${km} ${tr('กม.', 'km')} · ${tr('รองรับ', 'cap.')} ${s.capacity ?? '—'} ${tr('คน', 'ppl')}`,
    ),
    el('div', { class: 'citizen-shelter-contact', dangerouslySetInnerHTML: phone }),
    el('div', { class: 'citizen-shelter-cta' }, `🧭 ${tr('นำทาง', 'navigate')}`),
  )
}

function buildShareText(province, band, score) {
  const verb = (BAND[band] ?? BAND.normal)
  return tr(
    `[FloodDash] สถานการณ์${province.th} (${province.en}): ${verb.th} · ${score}/100\nดูสด: https://flood.nonarkara.org/?city=${encodeURIComponent(province.en || province.th)}`,
    `[FloodDash] ${province.en} status: ${verb.en} · ${score}/100\nLive: https://flood.nonarkara.org/?city=${encodeURIComponent(province.en || province.th)}`,
  )
}

function lineButton(province, band, score) {
  const text = encodeURIComponent(buildShareText(province, band, score))
  return el('a', { class: 'citizen-share-btn line', href: `https://line.me/R/msg/text/?${text}`, target: '_blank', rel: 'noopener' }, 'LINE')
}
function smsButton(province, band, score) {
  const text = encodeURIComponent(buildShareText(province, band, score))
  return el('a', { class: 'citizen-share-btn sms', href: `sms:?body=${text}` }, 'SMS')
}
function copyButton(province, band, score) {
  const text = buildShareText(province, band, score)
  const btn = el('button', { class: 'citizen-share-btn copy', type: 'button',
    onclick: async (e) => {
      e.preventDefault()
      try { await navigator.clipboard.writeText(text) } catch {}
      btn.textContent = tr('คัดลอกแล้ว ✓', 'Copied ✓')
      setTimeout(() => { btn.textContent = tr('คัดลอก', 'Copy') }, 2000)
    }
  }, tr('คัดลอก', 'Copy'))
  return btn
}

function renderPickerCollapsed() {
  const wrap = el('div', { class: 'citizen-picker-wrap', id: 'citizen-picker-wrap', hidden: true })
  wrap.append(...renderPicker())
  return wrap
}

function renderPicker() {
  const search = el('input', { class: 'citizen-picker-search', type: 'search',
    placeholder: tr('ค้นหาจังหวัด…', 'Search province…'),
    oninput: (e) => filterPicker(e.target.value),
  })
  const list = el('div', { class: 'citizen-picker-list' })
  populatePickerList(list, '')
  return [search, list]
}

function populatePickerList(container, query) {
  container.replaceChildren()
  const q = query.trim().toLowerCase()
  const rows = PROVINCE_INDEX.filter((p) => !q ||
    (p.th && p.th.toLowerCase().includes(q)) ||
    (p.en && p.en.toLowerCase().includes(q)))
  if (!rows.length) {
    container.append(el('div', { class: 'citizen-empty-sub' },
      tr('ไม่พบจังหวัด', 'no provinces match')))
    return
  }
  for (const p of rows.slice(0, 100)) {
    const band = p.band ?? 'normal'
    const score = p.score ?? 0
    container.append(el('button', {
      class: `citizen-pick-row b-${band}`, type: 'button',
      onclick: () => {
        setMyProvince({ th: p.th, en: p.en, code: p.code, lat: p.lat, lng: p.lng, band, score })
        // Auto-fly to the province so the user immediately sees their area
        if (p.lat != null && p.lng != null) {
          flyToProvince(p)
        }
      },
    },
      el('div', { class: 'citizen-pick-name' }, tr(p.th, p.en)),
      el('div', { class: 'citizen-pick-meta' }, `${score}/100`),
    ))
  }
}

function filterPicker(q) {
  const wrap = document.getElementById('citizen-picker-wrap')
  if (!wrap) return
  populatePickerList(wrap.querySelector('.citizen-picker-list'), q)
}

function showPicker() {
  const wrap = document.getElementById('citizen-picker-wrap')
  if (wrap) wrap.hidden = !wrap.hidden
}
