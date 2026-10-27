// Preparation aid: observed/estimated PM, model outlook and upwind-fire evidence
// stay separate. No smoke arrival time or clean-air destination is invented.
import { store } from '../state.js?v=2.4.130'
import { escapeHtml as esc } from '../fmt.js?v=2.4.130'
import { windBasisLabel, windRowText } from '../wind.js?v=2.4.130'
const tr = (th,en) => store.lang === 'th' ? th : en
const num = v => Number.isFinite(v) ? v.toLocaleString('en-GB',{maximumFractionDigits:1}) : '—'
export function planningState(pm, forecast, fires) {
  if (Number.isFinite(pm) && pm >= 37.5) return 'protect'
  if (Number.isFinite(forecast) && forecast >= 37.5) return 'prepare'
  if (Number.isFinite(fires) && fires > 0) return 'watch'
  if (!Number.isFinite(pm) || !Number.isFinite(forecast)) return 'unknown'
  return 'monitor'
}
const labels = {
  protect:['ลดการรับฝุ่นตอนนี้','Reduce exposure now'], prepare:['เตรียมรับค่าฝุ่นสูงในแบบจำลอง','Prepare: modelled PM elevated'],
  watch:['มีไฟในแนวเหนือลม — ติดตาม','Upwind fires: keep watch'], unknown:['ข้อมูลยังไม่พอ','Incomplete evidence'], monitor:['ติดตามต่อ — ไม่ใช่การรับรองว่าปลอดภัย','Keep monitoring; not a safety clearance'],
}
// Strict cache: failed refreshes never silently reuse old planning evidence.
let evidence = null, evidenceAt = 0, pending = null
async function planningEvidence() {
  if (evidence && Date.now()-evidenceAt < 300000) return evidence
  if (pending) return pending
  pending = Promise.allSettled(['/api/smoke','/api/forecast','/api/washout'].map(async url=>{
    const res=await fetch(url,{signal:AbortSignal.timeout(15000)})
    if (!res.ok) throw new Error('Planning evidence unavailable')
    return res.json()
  })).then(results=>{evidence=results;evidenceAt=Date.now();return results}).finally(()=>{pending=null})
  return pending
}
let selected = ''
// ── Aerosol size: what the particles actually ARE ────────────────────────
// Particle size does not establish respirator effectiveness or personal exposure.
// Optical evidence must keep its national scope and must not override PM advice.
//
// AERONET measures optical depth at seven wavelengths, so the Angstrom
// exponent — the aerosol-size indicator since 1929 — answers it. Deliberately
// a SEPARATE loader with its own cache: it is a daily regional aggregate that
// is often empty or a day stale, and it must never delay or blank the
// province plan above it.
let aero = null, aeroAt = 0, aeroPending = null
const AERO_TTL = 6 * 3600e3
async function aerosolEvidence() {
  if (aero && Date.now() - aeroAt < (aero.empty_note ? 5*60e3 : AERO_TTL)) return aero
  if (aeroPending) return aeroPending
  aeroPending = fetch('/api/aeronet', { signal: AbortSignal.timeout(15000) })
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
    .then(d => { aero = d; aeroAt = Date.now(); return d })
    .catch(() => { aero = { empty_note: 'unavailable' }; aeroAt = Date.now(); return aero })
    .finally(() => { aeroPending = null })
  return aeroPending
}

// ── The MEASURED particle size, per province ──────────────────────────────
//
// AERONET above answers "what is the aerosol regime?" for the whole
// country. It cannot answer "what are the particles IN this province?".
// Air4Thai can: it publishes PM10 as well as PM2.5, so the coarse fraction
// of PM10 (1 − PM2.5/PM10) is a DIRECT measurement at a ground station,
// published with its station and its time.
//
// The two are DIFFERENT measurements and are never shown as two answers to
// the same question. Where the province has a measured size, THAT is the
// strip; where it does not, the national optical signal stands in and says
// so. One question, one answer, always labelled with where it came from.
//
// A separate loader with its own cache and its own failure handling: a
// science outage must degrade to the optical signal, never blank the
// province plan.
let science = null, scienceAt = 0, sciencePending = null
const SCIENCE_TTL = 10 * 60e3
async function scienceEvidence() {
  if (science && Date.now() - scienceAt < SCIENCE_TTL) return science
  if (sciencePending) return sciencePending
  sciencePending = fetch('/api/science', { signal: AbortSignal.timeout(15000) })
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
    .then(d => { science = d; scienceAt = Date.now(); return d })
    .catch(() => { science = { provinces: [] }; scienceAt = Date.now(); return science })
    .finally(() => { sciencePending = null })
  return sciencePending
}
const MODE_LABEL = {
  coarse: ['สัญญาณเชิงแสงเด่นทางอนุภาคหยาบ', 'Coarse-dominated optical signal'],
  mixed:  ['สัญญาณเชิงแสงแบบผสม', 'Mixed optical signal'],
  fine:   ['สัญญาณเชิงแสงเด่นทางอนุภาคละเอียด', 'Fine-dominated optical signal'],
}
function ageText(h) {
  if (!Number.isFinite(h)) return ''
  return h < 48 ? tr(`อ่านล่าสุด ${h} ชม.ที่แล้ว`, `read ${h} h ago`)
    : tr(`อ่านล่าสุด ${Math.round(h / 24)} วันที่แล้ว (AERONET เผยแพร่ค่าวันรวมล่าช้า)`, `read ${Math.round(h / 24)} days ago — AERONET publishes daily aggregates with a lag`)
}
async function aerosolStrip() {
  const d = await aerosolEvidence()
  const stations = Object.entries(d?.aerosol ?? {}).filter(([, p]) => {
    const age = Date.now() - Date.parse(p?.observed_at)
    return MODE_LABEL[p?.mode] && Number.isFinite(p.alpha) && p.alpha >= 0 && Number.isFinite(p.load) && p.load >= 0 && Number.isFinite(age) && age >= -300000 && age <= 7*86400000
  })
  if (!stations.length) {
    return `<aside class="haze-plan-aerosol" data-state="unavailable">
      <h4>${esc(tr('บริบทเชิงแสง · ยังไม่มีค่าที่ใช้ได้', 'Optical context · no usable reading'))}</h4>
      <p>${esc(tr('สถานีวัดอาร์โรซอลยังไม่ได้รายงานค่าที่ใช้บอกขนาดอนุภาคได้ — คำแนะนำด้านบนยังใช้ตามค่าฝุ่น PM2.5 ได้ตามปกติ',
        'No aerosol station has reported a usable size reading yet. The advice above still stands on PM2.5.'))}</p></aside>`
  }
  const [station, mode] = stations.reduce((a, b) => (b[1].load > a[1].load ? b : a))
  const ageH = Math.round((Date.now() - Date.parse(mode.observed_at))/3600000)
  const g = mode.guidance
  const label = MODE_LABEL[mode.mode] ?? ['', '']
  // Name the stations so the reader knows this is five instruments, not a
  // province-wide measurement.
  const where = station.replace(/_/g, ' ')
  return `<aside class="haze-plan-aerosol" data-source="optical" data-state="${esc(mode.mode)}">
    <h4>${esc(tr('บริบทเชิงแสงระดับประเทศ — ไม่มีค่าขนาดฝุ่นที่วัดในจังหวัดนี้', 'National optical context — no measured particle size for this province'))}</h4>
    <p class="haze-plan-aerosol-verdict"><strong>${esc(tr(...label))}</strong> · α = ${mode.alpha} <span class="muted">(${esc(mode.alpha_pair ?? '')})</span></p>
    <p>${esc(tr(g?.act_th ?? '', g?.act_en ?? ''))}</p>
    ${mode.mode === 'coarse' ? `<p class="haze-plan-aerosol-warn">${esc(tr('ขนาดอนุภาคระดับประเทศไม่ใช้ตัดสินว่าหน้ากากได้ผลหรือไม่ หน้ากาก N95 ที่ได้รับการรับรองและแนบสนิทช่วยกรองอนุภาคทั้งละเอียดและหยาบ แต่ไม่กรองก๊าซหรือไอระเหย',
      'National particle-size evidence cannot determine respirator effectiveness. A well-fitting, approved N95 filters both fine and coarse particles; it does not filter gases or vapours.'))} <a href="https://www.cdc.gov/niosh/ppe/php/community-respirators-masks/" target="_blank" rel="noopener">NIOSH</a></p>` : ''}
    <p class="muted">${esc(tr('วัดที่', 'Measured at'))}: ${esc(where)} · ${esc(mode.observed_at)} · ${esc(ageText(ageH))}</p>
    <p class="muted">${esc(tr('นี่คือขนาดอนุภาคเชิงคุณภาพ ไม่ใช่ค่าความเข้มข้น µg/m³ — ค่าฝุ่นยังมาจากสถานีพื้นดิน และเป็นสัญญาณระดับประเทศ ไม่ใช่รายจังหวัด',
      'This is a qualitative particle size, not a µg/m³ concentration — the concentration still comes from the ground stations. This is a national-scale signal from a few instruments, not a per-province measurement.'))}</p>
  </aside>`
}

// The MEASURED strip for one province. Same question as the optical strip
// above, answered from a ground station instead of from five instruments.
//
// The label, the bands and the precautions all come from the server with
// the measurement — this function only lays them out. It never computes a
// band, never invents a concentration, and says nothing about where the
// dust came from: a mass ratio cannot tell mineral dust from biomass salt
// from resuspended road grit.
function measuredSizeStrip(pa) {
  // A station is REQUIRED. The fraction is the station's measurement, so a
  // row without one is not a measurement anyone can check — and a bare
  // "coarse 56%" with nothing behind it is exactly the kind of number that
  // should not be published. A province with no usable row falls back to
  // the optical signal, which says what it is.
  if (!pa || !pa.mode || !pa.station) return ''
  const th = store.lang === 'th'
  const label = th ? pa.label_th : pa.label_en
  const act = th ? pa.act_th : pa.act_en
  if (!label || !act) return ''
  const coarse = Number.isFinite(pa.coarse_fraction) ? Math.round(pa.coarse_fraction * 100) : null
  // The two numbers the fraction was made from, and the ratio between
  // them — shown ONLY because a station actually measured them.
  const measured = (pa.station && Number.isFinite(pa.pm10) && Number.isFinite(pa.ratio))
    ? (th
        ? `PM10 ${num(pa.pm10)} µg/m³ = ${num(pa.ratio)}× PM2.5`
        : `PM10 ${num(pa.pm10)} µg/m³ = ${num(pa.ratio)}× PM2.5`)
    : ''
  const where = pa.station
    ? (th ? `วัดที่สถานีพื้นดิน ${pa.station}` : `measured at ground station ${pa.station}`)
    : ''
  const when = pa.observed_at
    ? (th ? `เมื่อ ${String(pa.observed_at).replace('T', ' ')}` : `at ${String(pa.observed_at).replace('T', ' ')}`)
    : ''
  const meta = [where, when].filter(Boolean).join(' · ')
  return `<aside class="haze-plan-aerosol" data-state="${esc(pa.mode)}" data-source="measured">
    <h4>${esc(tr('อนุภาคในอากาศ — วัดที่สถานีพื้นดินในจังหวัดนี้', 'Particle size — measured at a ground station in this province'))}</h4>
    <p class="haze-plan-aerosol-verdict"><strong>${esc(label)}</strong>${coarse === null ? '' : ` · ${esc(tr('สัดส่วนฝุ่นหยาบ', 'coarse fraction'))} ${coarse}%`}</p>
    ${measured ? `<p>${esc(measured)}</p>` : ''}
    <p>${esc(act)}</p>
    ${meta ? `<p class="muted">${esc(meta)}</p>` : ''}
    <p class="muted">${esc(tr('นี่คือสัดส่วนของมวลฝุ่นหยาบที่วัดได้จากสถานีพื้นดินที่รายงานทั้ง PM2.5 และ PM10 — ไม่ใช่ค่าความเข้มข้นเฉลี่ยของจังหวัด และไม่ได้บอกที่มาของฝุ่น',
      'This is the fraction of coarse particulate MASS measured at a ground station reporting both PM2.5 and PM10 — not a provincial average concentration, and it does not say where the dust came from'))}</p>
  </aside>`
}
export function hazePlanBlock(snapshot) {
  const host = document.createElement('section')
  host.className='haze-plan'
  host.innerHTML=`<h3>${tr('เตรียมรับหมอกควัน · พื้นที่ไหนควรติดตาม','Haze preparation · areas to watch')}</h3><p role="status">${tr('กำลังเชื่อมไฟ ลม ฝน และค่าฝุ่น…','Joining fire, wind, rain and pollution evidence…')}</p>`
  load(host,snapshot)
  return host
}
async function load(host,snapshot) {
  const lang=store.lang
  // The science payload carries the measured particle size per province.
  // It is fetched alongside the province evidence but is NOT part of it:
  // its failure must not make the panel declare its evidence incomplete,
  // and it must never delay the province plan above it.
  const [results,sci]=await Promise.all([planningEvidence(),scienceEvidence()])
  if (!host.isConnected || store.lang!==lang) return
  const [smoke,forecast,rain]=results.map(r=>r.status==='fulfilled'?r.value:null)
  const measuredByCode=new Map((sci?.provinces??[]).filter(p=>p?.particle).map(p=>[p.code,p.particle]))
  const sm=new Map((smoke?.available ? smoke.provinces : []).map(p=>[p.code,p]))
  const fc=new Map((forecast?.provinces??[]).map(p=>[p.code,p]))
  const rn=new Map((rain?.provinces??[]).map(p=>[p.province_code,p]))
  const rows=(snapshot.risk.provinces??[]).filter(p=>/^\d{2}$/.test(p.province_code)).map(p=>{
    const f=fc.get(p.province_code),s=sm.get(p.province_code)
    const values=[f?.forecast?.pm25_d0,f?.forecast?.pm25_d1,f?.forecast?.pm25_d2].filter(Number.isFinite)
    const max=values.length?Math.max(...values):null
    return {p,f,s,r:rn.get(p.province_code),max,state:planningState(p.pm25,max,s?.upwind_fires)}
  })
  const order={protect:0,prepare:1,watch:2,unknown:3,monitor:4}
  rows.sort((a,b)=>order[a.state]-order[b.state] || (b.max??-1)-(a.max??-1))
  if (!rows.some(r=>r.p.province_code===selected)) selected=rows[0]?.p.province_code??''
  // The map paints the wind field from the RISK payload — the bearing exists
  // for all 77 provinces whether or not anything is burning upwind. This event
  // therefore carries only what the smoke engine alone knows: how many fire
  // detections sit upwind of each province, plus the rain and fire-cell
  // overlays that have no home in the risk payload.
  const windFires=rows.filter(r=>Number.isFinite(r.s?.upwind_fires)&&r.s.upwind_fires>0).map(r=>[r.p.province_code,r.s.upwind_fires])
  window.dispatchEvent(new CustomEvent('airdash:haze-wind',{detail:{fires:windFires,rain:rows.filter(r=>r.r?.forecast_available && Number.isFinite(r.r?.fc_days?.[0]?.mm) && Number.isFinite(r.r?.fc_days?.[0]?.prob) && Number.isFinite(r.p.lat??r.f?.lat) && Number.isFinite(r.p.lng??r.f?.lng)).map(r=>({lat:r.p.lat??r.f.lat,lng:r.p.lng??r.f.lng,mm:r.r.fc_days[0].mm,prob:r.r.fc_days[0].prob,name:store.lang==='th'?r.p.province_th:r.p.province_en})),fireCells:smoke?.available?smoke.fire_cells??[]:[]}}))
  const draw=async()=>{
    const row=rows.find(r=>r.p.province_code===selected)
    if (!row) {host.innerHTML=`<p>${tr('ยังไม่มีข้อมูลจังหวัด','Province data unavailable')}</p>`;return}
    const {p,f,s,r,max,state}=row
    const name=store.lang==='th'?p.province_th:p.province_en
    const source=p.pm25_source==='air4thai'?'PCD / Air4Thai':p.pm25_source==='gistda_satellite'?tr('ค่าประมาณ GISTDA','GISTDA estimate'):tr('ไม่ทราบแหล่ง','Source unspecified')
    // The wind comes from the RISK row and the fires from the SMOKE row. Both
    // engines read the same Open-Meteo column for the same province, and the
    // agreement is asserted live (77/77) by scripts/test-wind-direction.mjs.
    const windTxt=windRowText(p)
    const options=rows.map(row=>`<option value="${row.p.province_code}" ${selected===row.p.province_code?'selected':''}>${esc(store.lang==='th'?row.p.province_th:row.p.province_en)} · ${esc(tr(...labels[row.state]))}</option>`).join('')
    host.innerHTML=`<h3>${tr('เตรียมรับหมอกควัน · พื้นที่ไหนควรติดตาม','Haze preparation · areas to watch')}</h3>
      <label>${tr('เลือกจังหวัด (เรียงตามสัญญาณที่ควรติดตาม)','Province (ordered by preparation signals)')}<select data-plan-province>${options}</select></label>
      <p class="haze-plan-verdict" data-state="${state}">${esc(name)} · ${esc(tr(...labels[state]))}</p>
      <div class="haze-plan-grid">
      <article><h4>1 · ${tr('ฝุ่นที่มีอยู่','Pollution now')}</h4><strong>${num(p.pm25)} µg/m³</strong><p>${esc(source)} · ${tr('ค่าสูงสุดในจังหวัด ไม่ใช่ทุกจุด','Provincial maximum; not every location')}</p></article>
      <article><h4>2 · ${tr('แบบจำลองฝุ่น','PM model outlook')}</h4><strong>${num(f?.forecast?.pm25_d0)} → ${num(f?.forecast?.pm25_d1)} → ${num(f?.forecast?.pm25_d2)}</strong><p>µg/m³ · ${tr('วันนี้ / พรุ่งนี้ / มะรืน · CAMS ปรับอคติ','Today / tomorrow / following day · bias-adjusted CAMS')}</p><details><summary>${tr('ข้อมูลต้นทาง → ค่าที่ปรับแล้ว','Source model → adjusted outlook')}</summary><p>${tr('CAMS ต้นทาง','Source CAMS')}: ${num(f?.forecast?.cams_raw_d0)} → ${num(f?.forecast?.cams_raw_d1)} → ${num(f?.forecast?.cams_raw_d2)} µg/m³<br>${tr('ตัวคูณปรับอคติ','Bias multiplier')}: ${num(f?.forecast?.bias_ratio)} · ${esc(f?.forecast?.bias_scope??'—')}</p><p>${tr('ค่าต้นทางนี้ยังเป็นแบบจำลอง ไม่ใช่ค่าตรวจวัด การปรับด้วยสถานีไม่ได้ทำให้เป็นหลักฐานอิสระ','The source values are already modelled, not measurements. Station adjustment does not make an independent observation.')}</p></details></article>
      <article><h4>3 · ${tr('ไฟและลม','Fire and wind')}</h4><strong>${num(s?.upwind_fires)} ${tr('จุดเหนือลม','upwind detections')}</strong><p>${windTxt?esc(windTxt):tr('ลมไม่พร้อม','Wind unavailable')} · ${esc(windBasisLabel(p.wind_basis))}</p><p>${tr('ไฟย้อนหลัง 48 ชม. ภายใน 500 กม. ไม่ใช่ขนาดพื้นที่เผา หรือเวลาควันมาถึง','48-hour detections within 500 km; not burned area or smoke arrival time')}</p></article>
      <article><h4>4 · ${tr('ฝนที่อาจช่วย','Possible rain relief')}</h4><strong>${num(r?.fc_days?.[0]?.mm)} mm · ${num(r?.fc_days?.[0]?.prob)}%</strong><p>${tr('ฝนรวม / โอกาสฝนวันนี้ ไม่ระบุเวลาหรือทุกจุด','Today’s total / chance; not exact timing or every location')}</p><p>${tr('วัดฝุ่นซ้ำหลังฝน — ไม่หักฝนจากค่าฝุ่นที่วัดอยู่','Recheck PM after rain; measured pollution is not cancelled by rain')}</p></article></div>
      <div class="haze-plan-maps"><button type="button" data-view="pollution">${tr('แผนที่ฝุ่นตอนนี้','Pollution now map')}</button><button type="button" data-view="transport">${tr('สัญญาณไฟเหนือลม + ลม','Upwind fire signals + wind')}</button><button type="button" data-view="rain">${tr('แผนที่ฝน','Rain map')}</button></div>
      <div data-aerosol-slot></div>
      <p>${state==='protect'?tr('ลดกิจกรรมกลางแจ้ง เตรียมห้องอากาศสะอาดและเครื่องกรอง HEPA ใช้หน้ากากกรองอนุภาคที่กระชับเมื่อจำเป็นต้องออกนอกอาคาร','Reduce outdoor exertion; use a cleaner-air room and HEPA filtration. Use a well-fitting particulate respirator when outdoor exposure is unavoidable.'):tr('เตรียมเครื่องกรองและหน้ากาก ตรวจค่าฝุ่นก่อนเดินทาง หากคิดย้ายที่พัก ให้ตรวจค่าฝุ่นปัจจุบันและพยากรณ์ที่ปลายทางด้วย ไม่ใช้ลูกศรลมตัดสินเพียงอย่างเดียว','Prepare filtration and respirators; check readings before travel. If considering another location, check its current PM and forecast too. Wind arrows alone cannot establish a cleaner destination.')}</p>
      <details><summary>${tr('จัดห้องอากาศสะอาดอย่างไร','Prepare a cleaner-air room')}</summary><p>${tr('เลือกห้องที่ทุกคนพักได้ ปิดประตูหน้าต่างช่วงอากาศข้างนอกแย่ หากยังรักษาอุณหภูมิที่ปลอดภัยได้ ใช้เครื่องกรอง HEPA ขนาดเหมาะกับห้อง ไม่ผลิตโอโซน งดสูบบุหรี่ ธูป และการทำอาหารที่เกิดควันในห้อง อย่าปิดทางออกฉุกเฉิน ถ้าบ้านร้อนหรือควันเข้ามาก ให้หาพื้นที่พักที่เย็นและอากาศสะอาดกว่า', 'Choose a room everyone can use. Close windows and doors while outdoor air is poor, provided indoor heat stays safe. Run a room-sized HEPA cleaner that does not produce ozone. Avoid smoking, incense and smoky cooking indoors; keep exits clear. If the home becomes too hot or smoky, seek a cooler, cleaner-air space.')}</p><a href="https://www.epa.gov/wildfires/how-create-cleaner-air-room-home" target="_blank" rel="noopener">${tr('คู่มือห้องอากาศสะอาด · US EPA','Cleaner-air room guide · US EPA')}</a></details>
      <details><summary>${tr('อ่านหลักฐานอย่างไร / เวลาและข้อจำกัด','How to read this / times and limits')}</summary><p>${tr('จุดความร้อนดาวเทียมไม่ใช่พื้นที่เผา รอยเผาเป็นประวัติ ฝุ่นดาวเทียม AOD เป็นทั้งเสาอากาศ ไม่ใช่ PM2.5 ที่พื้น ลม 10 เมตรรายวันไม่จำลองหุบเขา การยกตัว หรือเวลาถึง ไม่มีเรดาร์ที่วัดมลพิษทุกจุด','Satellite hot spots are detections, not burned area. Scars are historical. AOD measures the atmospheric column, not surface PM2.5. Daily 10-m wind cannot resolve valleys, plume rise or arrival time. There is no radar measuring pollution at every point.')}</p><p>${tr('ตรวจไฟ (UTC)','Fire source checked (UTC)')}: ${esc(smoke?.fire_source_checked_at??'—')}<br>${tr('ข้อมูลลม (เวลาไทย)','Wind input (ICT)')}: ${esc(s?.wind_updated_at??'—')}<br>${tr('ดึงข้อมูลพยากรณ์ (UTC)','Forecast retrieved (UTC)')}: ${esc(forecast?.fetched_at??'—')}<br>${tr('ค่าฝุ่นล่าสุดของสถานีดูได้จากหมุดแผนที่ ตรวจประกาศทางการก่อนตัดสินใจ','Check station times on map markers and official guidance before decisions.')}</p><p>${tr('เกณฑ์ 37.5 ใช้คัดกรองเพื่อเตรียมตัว ไม่ใช่ตัดสินว่าค่ารายชั่วโมงเกินมาตรฐานเฉลี่ย 24 ชั่วโมง','37.5 is a preparation screening reference here, not an hourly test of 24-hour regulatory compliance.')}</p></details>
      ${results.some(r=>r.status==='rejected')?`<p role="status">${tr('หลักฐานบางส่วนไม่พร้อม ไม่แปลว่าปลอดภัย','Some evidence unavailable; this does not mean safe')}</p>`:''}`
    // ORDER MATTERS. The handlers below must be wired synchronously with the
    // paint, or the province dropdown and the three map buttons stay dead for
    // as long as aerosolStrip() takes — and that is a 15 s fetch timeout. The
    // aerosol slot is filled LAST, after every listener is attached.
    host.querySelector('[data-plan-province]').onchange=e=>{selected=e.target.value;draw()}
    for(const button of host.querySelectorAll('[data-view]')) button.onclick=()=>{
      window.dispatchEvent(new CustomEvent('airdash:haze-view',{detail:{view:button.dataset.view,lat:p.lat??f?.lat,lng:p.lng??f?.lng}}))
      if (window.matchMedia('(max-width: 1100px)').matches) document.querySelector('#sheettabs button[data-sheet="map"]')?.click()
    }
    // Last, and off the critical path: a slow or empty AERONET can never delay
    // or blank the province plan above it.
    //
    // ONE particle-size answer, never two. Where the province has a measured
    // size (PM10 against PM2.5 at its own ground station) that is the strip,
    // because it is a measurement OF this province. Where it does not, the
    // national optical signal stands in and says so. The two are different
    // quantities, so showing both would be two answers to one question.
    const slot = host.querySelector('[data-aerosol-slot]')
    if (slot) slot.outerHTML = measuredSizeStrip(measuredByCode.get(selected)) || await aerosolStrip()
  }
  draw()
}
