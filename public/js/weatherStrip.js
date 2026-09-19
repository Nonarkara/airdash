// TMD weather strip — five day cells + the nearest station's "now" line.
// One renderer for the place card (panels/search.js) and the citizen page
// (panels/citizen.js). Input is the `weather` object from /api/place or
// /api/weather/at (server/weather.js): TMD's own forecast and station,
// relayed from the FloodDash twin. Absent data renders nothing — a silent
// station is not "calm". Added 2026-09-17.
import { store } from './state.js?v=2.4.33'
import { escapeHtml } from './fmt.js?v=2.4.33'

const tr = (th, en) => (store.lang === 'th' ? th : en)
const COND_ICON = [
  [/ฝนฟ้าคะนอง|thunder/i, '⛈'], [/ฝนตกหนัก|heavy rain/i, '🌧'], [/ฝน|rain|shower/i, '🌦'],
  [/มีเมฆมาก|cloudy|overcast/i, '☁️'], [/มีเมฆบางส่วน|partly/i, '⛅'], [/แจ่มใส|clear|sunny|fair/i, '☀️'], [/หมอก|fog|haze/i, '🌫'],
]
const condIcon = (th, en) => (COND_ICON.find(([re]) => re.test(`${th ?? ''} ${en ?? ''}`))?.[1] ?? '🌤')
const DOW = { th: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }
function dayLabel(iso, i) {
  if (i === 0) return tr('วันนี้', 'today')
  if (i === 1) return tr('พรุ่งนี้', 'tomorrow')
  const d = new Date(`${iso}T00:00:00+07:00`)
  return `${DOW[store.lang === 'th' ? 'th' : 'en'][d.getUTCDay()] ?? ''} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}
const hhmm = (iso) => (typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : '')

/** HTML for the strip, or '' when there is nothing honest to show. */
export function weatherStripHtml(w, { compact = false } = {}) {
  if (!w || (!w.forecast?.days?.length && !w.station)) return ''
  const st = w.station
  const now = st ? `
    <div class="wx-now">
      <span class="wx-temp">${st.temp_c != null ? `${Math.round(st.temp_c)}°` : '—'}</span>
      <span class="wx-nowmeta">
        ${st.rh_pct != null ? `💧 ${Math.round(st.rh_pct)}%` : ''}
        ${st.wind_kmh != null ? ` · 🌬 ${Math.round(st.wind_kmh)} ${tr('กม./ชม.', 'km/h')}` : ''}
        ${st.visibility_km != null ? ` · 👁 ${st.visibility_km} ${tr('กม.', 'km')}` : ''}
        ${st.rain_24h_mm != null ? ` · ☔ ${st.rain_24h_mm} ${tr('มม./24 ชม.', 'mm/24h')}` : ''}
        ${st.tmax_c != null && st.tmin_c != null ? `<br>${tr('วันนี้สูงสุด', 'today max')} ${Math.round(st.tmax_c)}° · ${tr('ต่ำสุด', 'min')} ${Math.round(st.tmin_c)}°` : ''}
      </span>
    </div>
    <div class="wx-basis">📡 ${escapeHtml(tr(st.name_th, st.name_en ?? st.name_th))} · ${st.distance_km} ${tr('กม.', 'km')} · ${hhmm(st.obs_time)}${st.age_h != null ? ` (${tr(`${st.age_h} ชม. ที่แล้ว`, `${st.age_h} h ago`)})` : ''}</div>`
    : `<div class="wx-basis">${tr('ไม่มีสถานีตรวจอากาศของกรมอุตุฯ ที่รายงานสดในรัศมี 80 กม.', 'no TMD weather station reporting within 80 km')}</div>`
  const days = (w.forecast?.days ?? []).map((d, i) => `
    <div class="wx-day" title="${escapeHtml(tr(d.cond_th ?? '', d.cond_en ?? ''))}">
      <div class="wx-dl">${dayLabel(d.date, i)}</div>
      <div class="wx-ic">${condIcon(d.cond_th, d.cond_en)}</div>
      <div class="wx-t"><b>${d.tmax != null ? Math.round(d.tmax) : '–'}°</b><span class="wx-dim">/${d.tmin != null ? Math.round(d.tmin) : '–'}°</span></div>
      <div class="wx-r">${d.rain_pct != null ? `☔ ${Math.round(d.rain_pct)}%` : ''}</div>
      ${compact ? '' : `<div class="wx-c">${escapeHtml(tr(d.cond_th ?? '', d.cond_en ?? ''))}</div>`}
    </div>`).join('')
  const forLabel = w.forecast ? escapeHtml(tr(w.forecast.for_th, w.forecast.for_en ?? w.forecast.for_th)) : ''
  return `
    <div class="place-section wx">
      <div class="eyebrow">🌤 ${tr('อากาศ 5 วัน — กรมอุตุนิยมวิทยา', 'WEATHER, 5 DAYS — TMD')}${forLabel ? ` · ${forLabel}` : ''}</div>
      ${now}
      ${days ? `<div class="wx-days">${days}</div>` : ''}
      <div class="wx-basis">${tr('พยากรณ์ของกรมอุตุนิยมวิทยาโดยตรง', "TMD's own forecast")}${w.forecast?.build_date ? ` · ${tr('ออกเมื่อ', 'issued')} ${escapeHtml(String(w.forecast.build_date).slice(0, 16))}` : ''}</div>
    </div>`
}
