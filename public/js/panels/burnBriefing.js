// Operational context beside historical agricultural scars. A wind/fire
// indicator never becomes a measured PM concentration or a terrain simulation.
import { store } from '../state.js?v=2.4.71'
import { escapeHtml } from '../fmt.js?v=2.4.71'
const tr = (th, en) => store.lang === 'th' ? th : en
const esc = escapeHtml
const n = value => Number.isFinite(value) ? value.toLocaleString(store.lang === 'th' ? 'th-TH' : 'en-GB', { maximumFractionDigits: 1 }) : '—'
const date = value => value ? esc(value) : '—'
let season = '', province = '', request = 0, controller
function prior(value) { const year = Number(value.slice(0, 4)); return `${year - 1}/${String(year % 100).padStart(2, '0')}` }
async function json(url, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
function csvCell(value) {
  const text = value == null ? '' : String(value)
  return `"${(typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`
}
function exportBriefing(payload, live, smoke) {
  const rows = [['AirDash local fire briefing', new Date().toISOString()], ['scope', province || 'published provincial coverage'],
    ['historical season', payload.season], ['burn source', payload.source.url], ['burn fetched UTC', payload.source.fetched_at],
    ['PM context generated UTC', live?.now ?? null], ['fire source checked UTC', smoke?.fire_source_checked_at ?? null],
    ['limitations', 'Historical agricultural scars; matched-coverage comparison; wind/fire indicator is not measured PM or a smoke trajectory.'],
    ['province', 'month', 'rice rai', 'sugarcane rai', 'maize rai', 'mixed rai', 'total rai', 'fetched UTC'],
    ...payload.rows.map(row => [row.province_code,row.yyyymm,row.paddy_rai,row.cane_rai,row.corn_rai,row.mixed_rai,row.total_rai,row.fetched_at])]
  const c = payload.comparison
  if (c) rows.push(['comparison season', c.season], ['paired province-month cells', c.paired_cells],
    ['current matched rai',c.current_rai],['previous matched rai',c.previous_rai],['matched change percent',c.change_pct],
    ['excluded current cells',c.excluded_current_cells],['excluded previous cells',c.excluded_previous_cells])
  const p = live?.risk?.provinces?.find(p => `TH${p.province_code}` === province)
  const pm = province ? p?.pm25 : live?.risk?.national?.worstPm25?.ug
  const pmRow = province ? p : live?.risk?.provinces?.find(p => p.pm25 === pm)
  rows.push(['latest maximum PM2.5 ug/m3',pm ?? null],['PM source',pmRow?.pm25_source ?? null])
  const s = smoke?.provinces?.find(p => `TH${p.code}` === province)
  if (province) rows.push(['upwind detection count',s?.upwind_fires ?? null],['wind basis',s?.wind_basis ?? null],['wind updated local',s?.wind_updated_at ?? null])
  const blob = new Blob(['\uFEFF'+rows.map(row => row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = `airdash-burning-${province || 'published-coverage'}-${payload.season.replace('/','-')}.csv`
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000)
}
function contextHtml(live, smoke) {
  const p = live?.risk?.provinces?.find(p => `TH${p.province_code}` === province)
  const s = smoke?.available ? smoke.provinces?.find(p => `TH${p.code}` === province) : null
  const value = province ? p?.pm25 : live?.risk?.national?.worstPm25?.ug
  const stations = live?.air?.filter(a => Number.isFinite(a.pm25) && (!province || `TH${a.province_code}` === province)) ?? []
  const station = stations.find(a => a.pm25 === value)
  const pmName = province ? tr('ค่าฝุ่นล่าสุดสูงสุดในจังหวัด', 'Latest provincial maximum PM2.5') : tr('ค่าฝุ่นล่าสุดสูงสุดที่รายงานทั่วประเทศ', 'Latest reported national maximum PM2.5')
  const source = province ? p?.pm25_source : live?.risk?.provinces?.find(p => p.pm25 === value)?.pm25_source
  const sourceLabel = source === 'gistda_satellite' ? tr('ค่าประมาณ GISTDA', 'GISTDA estimate') : source === 'air4thai' ? 'PCD / Air4Thai' : '—'
  const smokeText = !province ? tr('เลือกจังหวัดเพื่อดูไฟเหนือลม', 'Select a province for upwind fire context')
    : !s ? tr('ยังไม่มีข้อมูลไฟหรือลมที่ใหม่พอ', 'Recent fire or wind data unavailable')
    : tr(`ตรวจพบ ${n(s.upwind_fires)} จุดในแนวเหนือลม · ลมจาก${s.from_th}`, `${n(s.upwind_fires)} detections upwind · wind from ${s.from_en}`)
  return `<div class="bn-brief-grid"><div><h3>${pmName}</h3><strong>${n(value)} µg/m³</strong><p>${esc(sourceLabel)} · ${tr('เวลาสถานี', 'Station time')} (Asia/Bangkok): ${date(station?.obs_time)}</p></div>
    <div><h3>${tr('ศักยภาพควันพัดมา', 'Potential smoke transport')}</h3><strong>${esc(smokeText)}</strong><p>${tr('ตรวจแหล่งไฟ (UTC)', 'Fire source checked (UTC)')}: ${date(smoke?.fire_source_checked_at)}<br>${tr('ลมพยากรณ์', 'Forecast wind')}: ${s ? (s.wind_basis === 'tomorrow-forecast' ? tr('ทิศลมหลักพรุ่งนี้ · Open-Meteo', 'Tomorrow’s dominant wind · Open-Meteo') : tr('ทิศลมหลักวันนี้ · Open-Meteo', 'Today’s dominant wind · Open-Meteo')) : '—'} · ${date(s?.wind_updated_at)} (Asia/Bangkok)</p></div></div>
    <p class="bn-brief-note">${tr('ตัวชี้ไฟเหนือลม ไม่ใช่ความเข้มข้นฝุ่น ไม่ใช่เส้นทางควันที่จำลองภูเขา และไม่ยืนยันว่าฝุ่นมาจากไฟเหล่านี้', 'Upwind fire indicator, not a PM concentration, terrain-resolved smoke trajectory, or proof these fires caused the measured pollution.')}</p>
    <p>${tr('สร้างบริบทปัจจุบัน (UTC)', 'Current context generated (UTC)')}: ${date(live?.now)}</p>`
}
function historyHtml(payload) {
  const c = payload.comparison, coverage = payload.coverage
  const total = n(payload.total_rai)
  const compareText = c?.paired_cells ? tr(
    `เทียบ ${c.season}: ${n(c.current_rai)} กับ ${n(c.previous_rai)} ไร่ · เปลี่ยน ${n(c.change_pct)}% · เฉพาะ ${c.paired_cells} คู่จังหวัด–เดือนที่มีข้อมูลตรงกัน`,
    `Compared with ${c.season}: ${n(c.current_rai)} versus ${n(c.previous_rai)} rai · change ${n(c.change_pct)}% · ${c.paired_cells} matched province–month cells`)
    : tr('ไม่มีข้อมูลตรงกันเพียงพอสำหรับเทียบฤดูก่อน', 'No matching observations for a prior-season comparison')
  const rows = payload.months.map(m => `<tr><th scope="row">${esc(m.yyyymm.slice(0,4)+'-'+m.yyyymm.slice(4))}</th>${['paddy_rai','cane_rai','corn_rai','mixed_rai','total_rai'].map(k=>`<td>${n(m[k])}</td>`).join('')}<td>${m.complete_rows}/${coverage.scope_provinces}</td></tr>`).join('')
  return `<h3>${tr('รอยเผาภาคเกษตรย้อนหลัง', 'Historical agricultural burn scars')} · ${esc(payload.season)}</h3>
    <p class="rp-lead">${total} ${tr('ไร่ที่มีข้อมูลเผยแพร่', 'rai in published coverage')}</p>
    <p>${tr('ความครบถ้วน', 'Coverage')}: ${coverage.complete_cells}/${coverage.expected_cells} ${tr('จังหวัด–เดือน', 'province–month cells')} · ${coverage.months.length}/6 ${tr('เดือน', 'months')}. ${tr('นอกพื้นที่หรือเดือนที่ไม่มีข้อมูล ไม่ได้แปลว่าไม่มีการเผา', 'Unreported areas or months do not mean no burning.')}</p>
    <p class="bn-callout">${esc(compareText)}</p>
    ${c ? `<p>${tr('ข้อมูลที่ไม่เข้าคู่', 'Excluded unmatched/incomplete cells')}: ${c.excluded_current_cells} / ${c.excluded_previous_cells} (${esc(payload.season)} / ${esc(c.season)})</p>` : ''}
    <div class="bn-brief-table" tabindex="0" role="region" aria-label="${tr('พื้นที่เผารายเดือน', 'Monthly burned area')}"><table><caption>${tr('พื้นที่เผารายเดือน หน่วยไร่', 'Monthly burned area, rai')}</caption><thead><tr><th>${tr('เดือน', 'Month')}</th><th>${tr('ข้าว', 'Rice')}</th><th>${tr('อ้อย', 'Cane')}</th><th>${tr('ข้าวโพด', 'Maize')}</th><th>${tr('พืชผสม', 'Mixed')}</th><th>${tr('รวม', 'Total')}</th><th>${tr('ครอบคลุม', 'Coverage')}</th></tr></thead><tbody>${rows || `<tr><td colspan="7">${tr('ไม่มีข้อมูลในขอบเขตนี้', 'No published data for this scope')}</td></tr>`}</tbody></table></div>
    <p>${tr('ดึงข้อมูล (UTC)', 'Publication fetched (UTC)')}: ${date(payload.source.fetched_at)} · <a href="https://tamroypao.hii.or.th/#dashboard" target="_blank" rel="noopener">${tr('ตามรอยเผา สสน./ม.เกษตรศาสตร์', 'Tam Roy Pao, HII/KU')}</a></p>`
}
export function mountBurnBriefing(host) {
  if (!host) return
  async function load() {
    const token = ++request; controller?.abort(); controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)])
    const button = host.querySelector('[data-burn-refresh]'); if (button) button.disabled = true
    const exportButton = host.querySelector('[data-burn-export]'); if (exportButton) exportButton.disabled = true
    host.querySelector('[data-burn-live]')?.replaceChildren()
    host.querySelector('[data-burn-history]')?.replaceChildren()
    const status = host.querySelector('[role="status"]')
    if (status) status.textContent = tr('กำลังโหลด…', 'Loading…')
    try {
      if (!season) { const index = await json('/api/burn-area',signal); season = index.seasons[0] ?? ''; if (!season) throw new Error('No published seasons') }
      const query = new URLSearchParams({season,compare:prior(season)})
      if (province) query.set('province',province)
      const [history,live,smoke] = await Promise.allSettled([json(`/api/burn-area?${query}`,signal),json('/api/snapshot',signal),json('/api/smoke',signal)])
      if (token !== request || !host.isConnected) return
      if (history.status !== 'fulfilled') throw history.reason
      const data = history.value, snapshot = live.status === 'fulfilled' ? live.value : null, fires = smoke.status === 'fulfilled' ? smoke.value : null
      const selectSeason = host.querySelector('#burn-season'), selectProvince = host.querySelector('#burn-province')
      if (!selectSeason) {
        host.innerHTML = `<div class="bn-brief-controls"><label>${tr('ฤดู', 'Season')}<select id="burn-season">${data.seasons.map(s=>`<option value="${esc(s)}" ${s===season?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
          <label>${tr('จังหวัด', 'Province')}<select id="burn-province"><option value="">${tr('ทั่วประเทศ — เฉพาะพื้นที่ที่เผยแพร่', 'National — published coverage')}</option>${data.provinces.map(p=>`<option value="${esc(p.code)}" ${p.code===province?'selected':''}>${esc(store.lang==='th'?p.th:p.en)}</option>`).join('')}</select></label>
          <button type="button" data-burn-refresh>${tr('อัปเดต', 'Refresh')}</button><button type="button" data-burn-export>${tr('ดาวน์โหลดสรุป CSV', 'Download CSV briefing')}</button></div><p role="status" aria-live="polite"></p><div data-burn-live></div><div data-burn-history></div>`
        host.querySelector('#burn-season').addEventListener('change',e=>{season=e.target.value;load()})
        host.querySelector('#burn-province').addEventListener('change',e=>{province=e.target.value;load()})
        host.querySelector('[data-burn-refresh]').onclick = load
      } else { selectSeason.value = season; selectProvince.value = province }
      host.querySelector('[data-burn-live]').innerHTML = contextHtml(snapshot,fires)
      host.querySelector('[data-burn-history]').innerHTML = historyHtml(data)
      host.querySelector('[data-burn-export]').onclick = () => exportBriefing(data,snapshot,fires)
      host.querySelector('[role="status"]').textContent = live.status === 'rejected' || smoke.status === 'rejected' ? tr('บริบทปัจจุบันบางส่วนไม่พร้อม — รอยเผาย้อนหลังยังแสดงได้', 'Some current context unavailable; historical scars remain available') : ''
    } catch (error) {
      if (token !== request || !host.isConnected || error.name === 'AbortError') return
      // Keep controls for retry; never retain a previous province's measurements.
      host.querySelector('[data-burn-live]')?.replaceChildren()
      host.querySelector('[data-burn-history]')?.replaceChildren()
      if (!host.querySelector('[role="status"]')) host.innerHTML = `<p role="status" aria-live="polite"></p><button type="button" data-burn-refresh>${tr('ลองอีกครั้ง', 'Retry')}</button>`
      host.querySelector('[role="status"]').textContent = tr('ข้อมูลไม่พร้อม ลองอีกครั้งได้ — ไม่ใช้ตัวเลขตัวอย่าง', 'Data unavailable. Retry; no sample readings substituted.')
      host.querySelector('[data-burn-refresh]').onclick = load
      const exportButton = host.querySelector('[data-burn-export]'); if (exportButton) exportButton.disabled = true
    } finally {
      if (token === request && host.isConnected) {
        const button = host.querySelector('[data-burn-refresh]'); if (button) button.disabled = false
        const exportButton = host.querySelector('[data-burn-export]'); if (exportButton && host.querySelector('[data-burn-history]')?.children.length) exportButton.disabled = false
      }
    }
  }
  host.innerHTML = `<p role="status" aria-live="polite">${tr('กำลังโหลด…', 'Loading…')}</p>`
  load()
}
