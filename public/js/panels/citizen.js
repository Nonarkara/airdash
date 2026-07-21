// Citizen-mode panel — what ordinary people need to see in 30 seconds.
// Surfaces the four questions that matter during a dust episode:
//   1. Am I safe right now?          → JMA verb at the top
//   2. What do I do?                  → per-band health advice (N95, windows,
//                                      purifier, sensitive groups)
//   3. What am I breathing?           → 3 nearest AQ stations with live PM2.5
//   4. How do I tell my family?       → share-status via LINE / SMS
//
// Citizen mode also pins the user's "My Province" — saved to localStorage
// so the dashboard defaults to the user's location on every visit. The
// "เปลี่ยนจังหวัด" button opens a searchable province picker.
import { on, store, emit } from '../state.js?v=2.0.0-fresh1'
import { tr, BAND } from '../i18n.js?v=2.0.0-fresh1'
import { el, fmtNum, ago } from '../fmt.js?v=2.0.0-fresh1'
import { getJson } from '../cache.js?v=2.0.0-fresh1'
import { flyToProvince } from '../map.js?v=2.0.0-fresh1'
import { reliefEtaLine, worseBeforeBetterChip } from './patterns-ui.js?v=2.0.0-fresh1'

const MY_PROVINCE_KEY = 'ad_my_province'

// Per-band health advice — the "what do I do" layer for ordinary people.
// One line per audience: everyone, then sensitive groups.
const HEALTH_ADVICE = {
  normal: [
    { th: 'อากาศดี ใช้ชีวิตกลางแจ้งได้ตามปกติ', en: 'Good air — outdoor life as usual' },
    { th: 'เปิดหน้าต่างระบายอากาศได้', en: 'Fine to open windows and ventilate' },
  ],
  watch: [
    { th: 'กลุ่มเสี่ยง (เด็ก ผู้สูงอายุ โรคปอด/หัวใจ หญิงตั้งครรภ์) ลดกิจกรรมกลางแจ้งหนัก ๆ', en: 'Sensitive groups (kids, elderly, lung/heart disease, pregnant) limit heavy outdoor exertion' },
    { th: 'เช็กค่าฝุ่นก่อนออกกำลังกายกลางแจ้ง', en: 'Check PM2.5 before outdoor exercise' },
  ],
  elevated: [
    { th: 'ลดกิจกรรมกลางแจ้ง — สวมหน้ากาก N95 เมื่อออกนอกบ้าน', en: 'Limit outdoor time — wear an N95 outside' },
    { th: 'ปิดหน้าต่าง เปิดเครื่องฟอกอากาศถ้ามี', en: 'Close windows, run an air purifier if you have one' },
    { th: 'กลุ่มเสี่ยงอยู่ในอาคารให้มากที่สุด', en: 'Sensitive groups stay indoors as much as possible' },
  ],
  high: [
    { th: 'งดกิจกรรมกลางแจ้งทั้งหมด — N95 ทุกครั้งที่ต้องออกนอกบ้าน', en: 'Avoid all outdoor activity — N95 whenever you must go out' },
    { th: 'ปิดบ้านให้มิดชิด เปิดเครื่องฟอกอากาศ', en: 'Seal the house, run the purifier' },
    { th: 'มีอาการแน่นหน้าอก/หอบ ให้พบแพทย์ หรือโทร 1669', en: 'Chest tightness or wheezing → see a doctor or call 1669' },
  ],
}

// All 77 provinces of Thailand (TH + EN) for the picker, populated from the
// first risk snapshot so lat/lng + band data come attached.
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
    // JMA verb + nearest AQ stations + share without any clicks.
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
            import('../map.js?v=2.0.0-fresh1').then(({ flyToProvince }) => flyToProvince(match)).catch(() => {})
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
  // Space-insensitive so the FOCUS-ID vocabulary ("chiangmai",
  // "khonkaen" — city-dashboard/focus deep links) resolves to the same
  // province as the spelled-out name ("Chiang Mai"). One shared ?city=
  // now lands SOMEWHERE sensible in every mode.
  const norm = (s) => (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, '')
  const qn = norm(q)
  // Exact match (Thai or English, case/space-insensitive)
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
  if (sessionStorage.getItem('ad_geo_asked')) return
  sessionStorage.setItem('ad_geo_asked', '1')
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
      tr('เพื่อดูสถานีวัดฝุ่นใกล้บ้าน + ระดับเสี่ยงเฉพาะพื้นที่',
         'See AQ stations near you + local risk level')),
    renderPicker(),
    // On phones the header's #about-btn is hidden to save space. Surface
    // the link inside the citizen panel so the project info is still
    // reachable from the dashboard without scrolling the header.
    el('a', {
      class: 'phone-about-link',
      href: '#', onclick: (e) => {
        e.preventDefault()
        document.getElementById('about-btn')?.click()
      },
    }, 'ⓘ ' + tr('เกี่ยวกับโครงการนี้', 'About this project')),
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

  // WHEN does relief come — the province's washout relief timeline
  // ("ฝนช่วยล้างฝุ่นพรุ่งนี้ · washout rain tomorrow, 8mm @98%") plus the
  // honest "worse before better" warning when CAMS says so. Filled async;
  // the empty div costs nothing when there is nothing to say.
  const reliefWrap = el('div', { class: 'citizen-relief' })
  getJson('/api/washout', 60_000).then((w) => {
    const entry = (w?.provinces ?? []).find((x) =>
      (province.code && x.province_code === province.code) ||
      (province.th && x.province_th === province.th)) ?? null
    if (!entry) return
    const line = reliefEtaLine(entry, { alwaysShow: (entry.pm25 ?? 0) >= 25 })
    const worse = worseBeforeBetterChip(entry)
    const kids = [line, worse].filter(Boolean)
    if (kids.length) reliefWrap.replaceChildren(...kids)
  }).catch(() => {})

  // "What do I do" — health advice for the current band.
  const adviceHead = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('😷 คำแนะนำสุขภาพวันนี้', '😷 health advice today')))
  const advice = el('div', { class: 'citizen-advice' },
    ...(HEALTH_ADVICE[band] ?? HEALTH_ADVICE.normal).map((a) =>
      el('div', { class: 'citizen-advice-row' }, `· ${tr(a.th, a.en)}`)))

  // "What am I breathing" — three nearest AQ stations (loaded async below)
  const stationHead = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('🌫 สถานีวัดฝุ่นใกล้คุณ', '🌫 AQ stations near you')))
  // Show a "looking up..." placeholder so the section never looks broken.
  const stationList = el('div', { class: 'citizen-shelter-list' },
    el('div', { class: 'citizen-loading' },
      el('span', { class: 'citizen-loading-dot' }),
      el('span', { class: 'citizen-loading-dot' }),
      el('span', { class: 'citizen-loading-dot' }),
      el('span', { class: 'citizen-loading-text' },
        tr('กำลังค้นหาสถานีวัดฝุ่นใกล้คุณ…', 'Looking up AQ stations near you…'))))
  // Render shell first, fill in async so the page is interactive immediately
  const out = [head, reliefWrap, adviceHead, advice, stationHead, stationList]
  if (province.lat != null && province.lng != null) {
    getJson(`/api/stations/nearest?lat=${province.lat}&lng=${province.lng}&limit=3`, 60_000)
      .then((data) => {
        const rows = data?.stations ?? []
        if (!rows.length) {
          stationList.replaceChildren(el('div', { class: 'citizen-empty-sub' },
            tr('ไม่พบสถานีวัดฝุ่นใกล้จังหวัดนี้', 'no AQ stations found near this province')))
          return
        }
        stationList.replaceChildren(...rows.map(stationCard))
      })
      .catch(() => {})
  } else {
    stationList.replaceChildren(el('div', { class: 'citizen-empty-sub' },
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

  // LINE opt-in — follow the AirDash Official Account for dust alerts
  // (PROTECT NOW and above). One honest, low-friction route; no personal
  // token field and no promise of province-specific delivery.
  const lineHead = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('📲 รับแจ้งเตือนฝุ่นทาง LINE', '📲 dust alerts on LINE')))
  const lineCard = el('a', {
    class: 'citizen-line-follow', href: 'https://line.me/R/ti/p/@630xxaki',
    target: '_blank', rel: 'noopener',
  },
    el('span', { class: 'citizen-line-mark' }, 'LINE'),
    el('span', {}, tr('เพิ่มเพื่อน @630xxaki — แจ้งเตือนเมื่อฝุ่นถึงขั้นต้องป้องกัน', 'Add @630xxaki — alerts when dust hits PROTECT NOW')),
    el('span', { 'aria-hidden': 'true' }, '→'),
  )

  // Per-token push (LINE Notify) — typed by the user, scoped to their
  // selected province, throttled to ≤1 push per 3 h, with a one-tap cancel
  // link inside the push itself. The OA follow above is broader (every
  // follower gets every severe alert, no targeting); this is the targeted
  // version for someone who only wants their own province.
  const notifyForm = renderNotifyForm(province)

  // Telegram bot (@AirDash_bot) — second push channel. Citizens /start the
  // bot to link their chat, then bind province + language. Telegram is
  // free + effectively unlimited, so it's the recommended channel for
  // anyone who can install Telegram. The form below auto-generates a
  // 6-char binding code, watches for the /start, then asks for the
  // province choice.
  const telegramForm = renderTelegramForm(province)

  // "I need help" — one-tap hotlines
  const helpHead = el('div', { class: 'citizen-section-head' },
    el('span', {}, tr('🆘 สายด่วน', '🆘 hotlines')))
  const helpRow = el('div', { class: 'citizen-help-row' },
    el('a', { class: 'citizen-help-btn', href: 'tel:1650' },
      el('div', { class: 'citizen-help-num' }, '1650'),
      el('div', { class: 'citizen-help-lbl' }, tr('มลพิษ (คพ.)', 'pollution (PCD)'))),
    el('a', { class: 'citizen-help-btn', href: 'tel:1422' },
      el('div', { class: 'citizen-help-num' }, '1422'),
      el('div', { class: 'citizen-help-lbl' }, tr('กรมควบคุมโรค', 'DDC health'))),
    el('a', { class: 'citizen-help-btn', href: 'tel:1669' },
      el('div', { class: 'citizen-help-num' }, '1669'),
      el('div', { class: 'citizen-help-lbl' }, tr('กู้ชีพ ฉุกเฉิน', 'EMS'))),
    // About link — only on phones (the header's about-btn is hidden
    // there to save space). On desktop the header has its own button.
    el('a', {
      class: 'citizen-help-btn phone-about-link',
      href: '#',
      onclick: (e) => {
        e.preventDefault()
        document.getElementById('about-btn')?.click()
      },
    },
      el('div', { class: 'citizen-help-num' }, 'ⓘ'),
      el('div', { class: 'citizen-help-lbl' }, tr('เกี่ยวกับ', 'About'))),
  )

  return [...out, shareHead, shareRow, lineHead, lineCard, notifyForm, telegramForm, helpHead, helpRow, renderPickerCollapsed()]
}

// Thai AQI 2023 colour anchor for a PM2.5 value (µg/m³).
function pm25Color(v) {
  if (v === null || v === undefined) return '#B7AFA3'
  if (v >= 75) return '#A51931'
  if (v >= 37.5) return '#E86A10'
  if (v >= 25) return '#F0B400'
  return '#00933C'
}

function stationCard(s) {
  const km = s.distance_km?.toFixed?.(1) ?? '?'
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
  const freshness = s.pm25_time ? ago(s.pm25_time) : tr('ไม่มีข้อมูลล่าสุด', 'no recent data')
  return el('a', { class: 'citizen-shelter citizen-station', href: gmaps, target: '_blank', rel: 'noopener' },
    el('div', { class: 'citizen-shelter-name' },
      el('span', { class: 'citizen-station-dot', style: `display:inline-block;width:10px;height:10px;margin-right:6px;background:${pm25Color(s.pm25)}` }),
      tr(s.name_th, s.name_en) || '—'),
    el('div', { class: 'citizen-shelter-meta' },
      s.pm25 !== null && s.pm25 !== undefined
        ? `PM2.5 ${fmtNum(s.pm25, 0)} µg/m³ · ${freshness}`
        : freshness,
      ` · ${tr('ห่าง', '~')} ${km} ${tr('กม.', 'km')}`,
    ),
    el('div', { class: 'citizen-shelter-cta' }, `🧭 ${tr('นำทางไปสถานี', 'navigate')}`),
  )
}

function buildShareText(province, band, score) {
  const verb = (BAND[band] ?? BAND.normal)
  const link = `${location.origin}/?city=${encodeURIComponent(province.en || province.th)}`
  return tr(
    `[AirDash] สถานการณ์ฝุ่น${province.th} (${province.en}): ${verb.th} · ${score}/100\nดูสด: ${link}`,
    `[AirDash] ${province.en} air status: ${verb.en} · ${score}/100\nLive: ${link}`,
  )
}

function lineButton(province, band, score) {
  const text = encodeURIComponent(buildShareText(province, band, score))
  return el('a', { class: 'citizen-share-btn line', href: `https://line.me/R/msg/text/?${text}`, target: '_blank', rel: 'noopener' }, 'LINE')
}

// Per-token LINE Notify subscribe form. Shows:
//   - a "Get a LINE Notify token" link to notify-bot.line.me
//   - a token input
//   - the user's selected province (read-only, from the citizen panel)
//   - language toggle (TH / EN — same as the dashboard)
//   - Subscribe button → POST /api/line/subscribe
//   - Status line (success / error)
// State is intentionally not persisted across paints — re-entering the
// panel from another province is a fresh "I want to subscribe" moment.
function renderNotifyForm(province) {
  const tokenInput = el('input', {
    class: 'citizen-line-token',
    type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false',
    placeholder: tr('วาง LINE Notify token …', 'Paste LINE Notify token …'),
  })
  // Province comes from the panel's current selection — non-editable, so
  // the user can never subscribe to a different province than the one
  // they're reading about. The hidden field is what the API actually
  // receives; the visible pill is just for the user's confidence.
  const provinceHidden = el('input', { type: 'hidden', value: province.th })
  const provinceEnHidden = el('input', { type: 'hidden', value: province.en ?? '' })
  const provinceCodeHidden = el('input', { type: 'hidden', value: province.code ?? '' })
  const langHidden = el('input', { type: 'hidden', value: store.lang || 'th' })
  const provincePill = el('div', { class: 'citizen-line-province' },
    el('span', { class: 'citizen-line-province-label' }, tr('จังหวัด', 'Province')),
    el('span', { class: 'citizen-line-province-name' }, tr(province.th, province.en ?? province.th)),
  )
  const helpLink = el('a', {
    class: 'citizen-line-help',
    href: 'https://notify-bot.line.me/en/',
    target: '_blank', rel: 'noopener',
    'data-i18n': 'ขอ token จาก LINE Notify →|Get a token from LINE Notify →',
  }, tr('ขอ token จาก LINE Notify →', 'Get a token from LINE Notify →'))
  const status = el('div', { class: 'citizen-line-status' })
  const submit = el('button', {
    class: 'citizen-line-submit', type: 'button',
    onclick: async (e) => {
      e.preventDefault()
      const token = tokenInput.value.trim()
      if (token.length < 8) {
        status.replaceChildren(el('span', { class: 'citizen-line-err' },
          tr('โปรดวาง token ก่อน', 'Please paste a token first')))
        return
      }
      submit.disabled = true
      submit.textContent = tr('กำลังเชื่อมต่อ…', 'Connecting…')
      try {
        const res = await fetch('/api/line/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token,
            province_th: province.th,
            province_en: province.en,
            province_code: province.code,
            lat: province.lat,
            lng: province.lng,
            lang: store.lang || 'th',
          }),
          signal: AbortSignal.timeout(15_000),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok) {
          status.replaceChildren(
            el('span', { class: 'citizen-line-ok' },
              tr('✅ เชื่อมต่อสำเร็จ · จะส่งแจ้งเตือนเมื่อฝุ่นถึงขั้นต้องป้องกัน (สูงสุด 1 ครั้ง/3 ชม.)',
                 '✅ connected · you\'ll get a push when dust hits protect-now (max 1/3h)')),
          )
          submit.textContent = tr('เชื่อมต่อแล้ว ✓', 'Connected ✓')
          tokenInput.value = ''
        } else {
          status.replaceChildren(el('span', { class: 'citizen-line-err' },
            body?.error ? tr(`LINE ปฏิเสธ token · ${body.error}`, `LINE rejected the token · ${body.error}`) :
              tr('LINE ปฏิเสธ token โปรดลองใหม่', 'LINE rejected the token — please try again')))
          submit.disabled = false
          submit.textContent = tr('เชื่อมต่อ', 'Connect')
        }
      } catch (err) {
        status.replaceChildren(el('span', { class: 'citizen-line-err' },
          tr('เครือข่ายมีปัญหา · ลองอีกครั้ง', 'Network error · try again')))
        submit.disabled = false
        submit.textContent = tr('เชื่อมต่อ', 'Connect')
      }
    },
  }, tr('เชื่อมต่อ', 'Connect'))
  const form = el('form', {
    class: 'citizen-line-form',
    onsubmit: (e) => { e.preventDefault(); submit.click() },
  },
    el('div', { class: 'citizen-line-head' },
      el('span', { class: 'citizen-line-head-icon' }, '🔔'),
      el('div', { class: 'citizen-line-head-text' },
        el('div', { class: 'citizen-line-head-th' },
          tr('แจ้งเตือน "ฝุ่นถึงขั้นป้องกัน" เฉพาะจังหวัดนี้',
             '"protect now" alerts for this province only')),
        el('div', { class: 'citizen-line-head-en' },
          tr('รับเฉพาะจังหวัดที่เลือก · ยกเลิกได้ทุกเมื่อ · ไม่เก็บข้อมูลส่วนตัว',
             'this province only · cancel anytime · no personal data stored')),
      ),
    ),
    tokenInput,
    provincePill,
    provinceHidden, provinceEnHidden, provinceCodeHidden, langHidden,
    el('div', { class: 'citizen-line-actions' }, submit, helpLink),
    status,
  )
  return el('div', { class: 'citizen-line-subscribe' }, form)
}

// Telegram bot (@AirDash_bot) — second push channel. UX is auto-bind:
//   1. Tap "Connect on Telegram" → opens t.me/AirDash_bot?start=<code>
//   2. The user hits Start in the bot, bot stores chat_id + code
//   3. Dashboard polls every 3s for the /start to land
//   4. Once the chat is detected, the province picker appears
//   5. User confirms province + language → /api/telegram/bind
//   6. Bot greets the user in their chosen language
//
// Three states the form cycles through:
//   A) idle: "Connect on Telegram" button with deeplink
//   B) waiting: "Waiting for you to tap Start in the bot…"
//   C) ready: province picker + Bind button
function renderTelegramForm(province) {
  const status = el('div', { class: 'citizen-tg-status' })
  const actions = el('div', { class: 'citizen-tg-actions' })
  const provinceRow = el('div', { class: 'citizen-tg-province', hidden: true })
  const bindBtn = el('button', {
    class: 'citizen-tg-bind', type: 'button', hidden: true,
    onclick: async () => {
      bindBtn.disabled = true
      bindBtn.textContent = tr('กำลังเชื่อมต่อ…', 'Linking…')
      try {
        const res = await fetch('/api/telegram/bind', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: state.chatId,
            province_th: province.th,
            province_en: province.en,
            province_code: province.code,
            lang: store.lang || 'th',
          }),
          signal: AbortSignal.timeout(15_000),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok) {
          status.replaceChildren(el('span', { class: 'citizen-tg-ok' },
            tr('✅ เชื่อมต่อสำเร็จ — บอท Air จะส่งข้อความยืนยันใน Telegram ของคุณ',
               '✅ linked — the bot Air will send a confirmation message in your Telegram')))
          bindBtn.textContent = tr('เชื่อมต่อแล้ว ✓', 'Linked ✓')
          stopPolling()
        } else {
          status.replaceChildren(el('span', { class: 'citizen-tg-err' },
            body?.error ? tr(`เชื่อมต่อไม่สำเร็จ · ${body.error}`, `Link failed · ${body.error}`) :
              tr('เชื่อมต่อไม่สำเ็จ โปรดลองอีกครั้ง', 'Link failed — please try again')))
          bindBtn.disabled = false
          bindBtn.textContent = tr('เชื่อมต่อจังหวัดนี้', 'Link this province')
        }
      } catch (err) {
        status.replaceChildren(el('span', { class: 'citizen-tg-err' },
          tr('เครือข่ายมีปัญหา · ลองอีกครั้ง', 'Network error · try again')))
        bindBtn.disabled = false
        bindBtn.textContent = tr('เชื่อมต่อจังหวัดนี้', 'Link this province')
      }
    },
  }, tr('เชื่อมต่อจังหวัดนี้', 'Link this province'))

  const state = { code: null, deeplink: null, chatId: null, pollTimer: null }
  const openLink = el('a', {
    class: 'citizen-tg-open', target: '_blank', rel: 'noopener',
    onclick: () => { setTimeout(() => enterWaiting(), 600) },
  }, tr('เปิด Telegram →', 'Open Telegram →'))
  openLink.href = '#'

  const enterIdle = () => {
    state.code = null
    state.chatId = null
    status.replaceChildren()
    actions.replaceChildren(openLink)
    provinceRow.hidden = true
    bindBtn.hidden = true
  }
  const enterWaiting = () => {
    actions.replaceChildren(
      el('span', { class: 'citizen-tg-waiting' },
        el('span', { class: 'citizen-tg-pulse' }),
        tr('รอคุณกด Start ในบอท…', 'waiting for you to tap Start in the bot…')))
    startPolling()
  }
  const enterReady = (chatId) => {
    state.chatId = chatId
    stopPolling()
    status.replaceChildren(el('span', { class: 'citizen-tg-ok' },
      tr('เห็นบอทแล้ว — เลือกจังหวัดเพื่อเริ่มรับแจ้งเตือน',
         'bot connected — pick the province to start receiving alerts')))
    provinceRow.hidden = false
    bindBtn.hidden = false
    bindBtn.disabled = false
    actions.replaceChildren(
      el('span', { class: 'citizen-tg-state' },
        tr('พร้อมเชื่อมต่อแล้ว — กดปุ่มด้านล่าง', 'ready — tap the button below')))
  }
  const startPolling = () => {
    if (state.pollTimer) return
    let attempts = 0
    const poll = async () => {
      attempts++
      try {
        const r = await fetch(`/api/telegram/stats?_t=${Date.now()}`, { cache: 'no-store' })
        // The stats endpoint doesn't tell us WHICH chat landed, but
        // it's a cheap liveness probe. The real detection happens in
        // the bot webhook → bind endpoint. We poll up to 60× (3 min)
        // before giving up.
        if (attempts > 60) { stopPolling(); return }
        // Ask the server whether this code has a chat bound. We do
        // that by hitting a tiny diagnostic that returns the chat_id
        // for a code (only when the chat is waiting for binding).
        const cr = await fetch(`/api/telegram/code-status?code=${encodeURIComponent(state.code || '')}`, { cache: 'no-store' })
        if (cr.ok) {
          const body = await cr.json()
          if (body?.chat_id) {
            enterReady(body.chat_id)
            return
          }
        }
      } catch {}
      state.pollTimer = setTimeout(poll, 3000)
    }
    state.pollTimer = setTimeout(poll, 1500)
  }
  const stopPolling = () => {
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null }
  }

  // Initial: ask the server for a binding code.
  const init = async () => {
    try {
      const r = await fetch('/api/telegram/binding-code', { cache: 'no-store' })
      if (!r.ok) {
        // Bot not configured → silent no-op (the section is hidden).
        wrap.hidden = true
        return
      }
      const body = await r.json()
      state.code = body.code
      state.deeplink = body.deeplink
      openLink.href = body.deeplink
      enterIdle()
    } catch {
      wrap.hidden = true
    }
  }

  const wrap = el('div', { class: 'citizen-tg-subscribe', hidden: true },
    el('div', { class: 'citizen-tg-head' },
      el('span', { class: 'citizen-tg-head-icon' }, '✈️'),
      el('div', { class: 'citizen-tg-head-text' },
        el('div', { class: 'citizen-tg-head-th' },
          tr('แจ้งเตือนผ่าน Telegram (ฟรี ไม่จำกัดข้อความ)',
             'Alerts via Telegram (free, no message cap)')),
        el('div', { class: 'citizen-tg-head-en' },
          tr('แตะปุ่มเพื่อเปิด @AirDash_bot แล้วกด Start · แนะนำสำหรับคนที่ใช้ Telegram',
             'Tap to open @AirDash_bot and hit Start · recommended if you use Telegram')),
      ),
    ),
    actions,
    provinceRow,
    bindBtn,
    status,
  )
  // Bind cleanup so we don't leak the poll timer when the panel re-paints.
  wrap.addEventListener('cleanup', stopPolling, { once: true })
  init()
  return wrap
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
