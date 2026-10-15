import { createPollutionField } from './layers/pollution-field.js?v=2.4.95'
import { createWindFlowLayer } from './layers/wind-flow.js?v=2.4.95'
import { createHazeDriftLayer } from './layers/haze-drift.js?v=2.4.95'
import { AIR_COPY } from './layers/wind-math.js?v=2.4.95'
import { escapeHtml as esc } from './fmt.js?v=2.4.95'
import { readPreference, writePreference } from './preferences.js?v=2.4.95'
let lang=readPreference('ad_lang')==='th'?'th':'en'
const tr=(th,en)=>lang==='th'?th:en
const whole=[[-11,92],[28,142]]
const map=L.map('regional-map',{minZoom:3,maxZoom:12,preferCanvas:true}).fitBounds(whole)
map.attributionControl.setPrefix(false)
L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:16,attribution:'Esri, HERE, Garmin · © OpenStreetMap'}).addTo(map)
const pm=L.layerGroup().addTo(map),fire=L.layerGroup().addTo(map)
if(!map.getPane('heatmap')){const pane=map.createPane('heatmap');pane.style.zIndex=320;pane.style.pointerEvents='none'}
const field=createPollutionField({pane:'heatmap'}).addTo(map)
const flow=createWindFlowLayer().addTo(map)
const drift=createHazeDriftLayer().addTo(map)
const wind=L.layerGroup().addTo(map)
byWindInit()
function byWindInit(){document.getElementById('wind').onchange=()=>document.getElementById('wind').checked?wind.addTo(map):map.removeLayer(wind)}
L.rectangle([[4,92],[29,110]],{weight:1,dashArray:'6 6',color:'#86551c',fill:false,interactive:false}).addTo(map)
let data=null,imagery=null,loading=false,lastError=false
const byId=id=>document.getElementById(id)
function clock(time){const date=new Date(time);return Number.isFinite(date.getTime())?date.toLocaleString(lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok',hour12:false})+' ICT':'—'}
function translate(){document.documentElement.lang=lang;for(const n of document.querySelectorAll('[data-t]')){const [th,en]=n.dataset.t.split('|');n.textContent=tr(th,en)}byId('language').textContent=lang==='th'?'EN':'ไทย';flow.syncLang?.();drift.syncLang?.();paintAirCaption();paint();setImagery()}
function paintAirCaption(){const note=document.getElementById('air-legend');if(note)note.textContent=tr(AIR_COPY.credit_th,AIR_COPY.credit_en)}
byId('language').onclick=()=>{lang=lang==='th'?'en':'th';writePreference('ad_lang',lang);translate()}
byId('reset-map').onclick=()=>map.fitBounds(whole)
byId('open-directory').onclick=()=>{byId('country-directory').open=true}
byId('fires').onchange=()=>{byId('fires').checked?fire.addTo(map):map.removeLayer(fire)}
function setImagery(){if(imagery)map.removeLayer(imagery);imagery=null
 const id=byId('imagery').value,date=new Date(Date.now()-86400000).toISOString().slice(0,10)
 const products={aod:['MODIS_Combined_Value_Added_AOD',6],colour:['MODIS_Terra_CorrectedReflectance_TrueColor',9],rain:['IMERG_Precipitation_Rate',6]}
 byId('layer-note').textContent=id==='none'?tr('ไม่มีภาพทับซ้อน ตรวจเวลาแต่ละหมุด','No imagery overlay. Inspect observation times on each pin.'):`${date} UTC · NASA GIBS · ${tr('ภาพรายวัน ไม่ใช่สภาพสดทุกจุด มีช่องว่างได้','Daily context, not live conditions at every point; gaps possible')}${id==='rain'?' · '+tr('อัตราฝน mm/h ไม่ใช่ฝนคาดการณ์หรือฝนสะสม','Rain rate mm/h, not forecast or accumulated rainfall'):''}`
 byId('imagery-legend').hidden=true
 if(!products[id])return
 const legend=byId('imagery-legend')
 const legendName=id==='aod'?'MODIS_Combined_Value_Added_AOD_H':id==='rain'?'GPM_Precipitation_Rate_H':null
 legend.hidden=!legendName
 if(legendName){legend.src=`https://gibs.earthdata.nasa.gov/legends/${legendName}.svg`;legend.alt=id==='aod'?'NASA AOD dimensionless colour scale':'NASA precipitation rate colour scale (mm/h)'}
 const [product,zoom]=products[id]
 imagery=L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product}/default/${date}/GoogleMapsCompatible_Level${zoom}/{z}/{y}/{x}.png`,{maxNativeZoom:zoom,maxZoom:12,opacity:.72,attribution:'NASA GIBS'}).addTo(map)
 imagery.on('tileerror',()=>{byId('layer-note').textContent=`${date} UTC · ${tr('ภาพบางส่วนโหลดไม่ได้ ข้อมูลขาดไม่ใช่อากาศสะอาด','Some imagery unavailable; a gap does not mean clean air')}`})
}
byId('imagery').onchange=()=>{if(byId('imagery').value!=='none'){byId('field-mode').value='off';paintField()}setImagery()}
function paintField(){
 const mode=byId('field-mode').value,outlook=data?.pollution_outlook
 document.querySelector('.pm-scale').hidden=mode==='off'
 byId('time-control').hidden=mode!=='model'
 let points=[],note=''
 if(mode==='observed'){
  points=(data?.observations??[]).filter(r=>r.status==='current'&&Date.now()-Date.parse(r.observed_at)<=90*60000)
  note=tr('ค่าระหว่างจุดเป็นการประมาณ ไม่ใช่ค่าตรวจวัด: ต้องมีอย่างน้อย 3 จุดใน 60 กม. และห่างจุดใกล้สุดไม่เกิน 30 กม. ช่องว่างไม่ใช่อากาศสะอาด ช่วงเฉลี่ยไทย/สิงคโปร์ต่างกัน','Estimated between reports, not measured everywhere: at least 3 points within 60 km and a point within 30 km. Blank means unsupported, not clean. Thai/Singapore averaging periods differ.')
 }else if(mode==='model'){
  const fresh=outlook?.available&&Date.now()-Date.parse(outlook.issued_at)<=13*3600000
  byId('field-time').disabled=!fresh
  byId('field-time').max=Math.max(0,(outlook?.frames?.length??0)-1)
  const frame=outlook?.frames?.[Number(byId('field-time').value)]
  if(fresh&&frame){points=outlook.points.map(p=>({...p,pm25:p.values[frame.index]})).filter(p=>Number.isFinite(p.pm25));byId('field-clock').textContent=clock(frame.time)}else byId('field-clock').textContent='—'
  note=fresh?tr('แบบจำลอง CAMS ปรับด้วยสถานี เฉพาะประเทศไทย ปรุงเป็นพื้นผิวจากจุดกึ่งกลางจังหวัด ไม่ใช่กริดต้นฉบับหรือเวลาควันมาถึง','Station-adjusted CAMS, Thailand only. Surface estimated from province centroids, not the native model grid or smoke arrival time.')+' · '+tr('ดึงโมเดล','Model retrieved')+' '+clock(outlook.issued_at):tr('โมเดลรายชั่วโมงไม่พร้อมหรือเก่า ไม่สร้างภาพอนาคตขึ้นเอง','Hourly model unavailable or stale; no future field invented.')
  note+=' · '+tr('หมุดคือค่ารายงานปัจจุบัน ไม่ใช่ค่าในเวลาพยากรณ์','Pins remain current reports, not observations at the forecast time.')
 }else note=tr('ซ่อนพื้นผิว แสดงหมุดต้นทาง','Field hidden; source pins remain visible.')
 field.setData(points,mode==='model'?{radiusKm:160,nearestKm:80,minPoints:3}:{radiusKm:60,nearestKm:30,minPoints:3})
 byId('field-note').textContent=note
}
byId('field-mode').onchange=()=>{if(byId('field-mode').value!=='off'){byId('imagery').value='none';setImagery()}paintField()}
byId('field-time').oninput=paintField
function paint(){
 if(!data)return
 paintField()
 pm.clearLayers();fire.clearLayers();wind.clearLayers()
 drift.setStations((data.observations??[]).filter(r=>r.status!=='stale'&&Date.now()-Date.parse(r.observed_at)<=90*60000))
 drift.setFires(data.fires?.available?data.fires.cells??[]:[])
 const windSeen=new Set()
 for(const r of data.wind??[]){
  const stamp=r.wind_updated_at,iso=/[zZ]|[+-]\d\d:\d\d$/.test(stamp??'')?stamp:`${stamp?.replace(' ','T')}+07:00`,age=Date.now()-Date.parse(iso)
  if(!Number.isFinite(r.from_deg)||!Number.isFinite(r.lat)||!Number.isFinite(r.lng)||!Number.isFinite(age)||age< -300000||age>26*3600000)continue
  const cell=`${Math.floor(r.lat/1.5)}:${Math.floor(r.lng/1.5)}`
  if(windSeen.has(cell))continue
  windSeen.add(cell)
  const to=(r.from_deg+180)%360
  L.marker([r.lat,r.lng],{icon:L.divIcon({className:'regional-wind',iconSize:[26,26],html:`<span style="transform:rotate(${to}deg)">↑</span>`})}).bindTooltip(esc(`${r.province_en} · ${tr('ทิศลมหลักรายวัน ไม่ใช่เส้นทางควัน','Daily dominant forecast, not smoke trajectory')} · ${r.wind_basis} · ${r.from_deg}° → ${to}° · ${clock(iso)}`)).addTo(wind)
 }
 const now=Date.now(),obs=data.observations.map(r=>({...r,status:now-Date.parse(r.observed_at)>90*60000?'stale':r.status}))
 for(const r of obs){const stale=r.status!=='current';L.circleMarker([r.lat,r.lng],{radius:r.country==='SG'?9:5,color:stale?'#636e75':'#086a8c',weight:2,fillOpacity:stale?.25:.7})
 .bindPopup(`<strong>${esc(r.name)} · ${esc(r.country)}</strong><br>${r.pm25} µg/m³ PM2.5<br>${esc(r.averaging_period)}<br>${esc(r.source)} · ${esc(r.source_type)}<br>${esc(clock(r.observed_at))}<br>${esc(stale?tr('ข้อมูลเก่า ไม่ใช่สภาพปัจจุบัน','Stale; not current conditions'):tr('ค่ารายงานล่าสุด ไม่ใช่การรับรองความแม่นยำ','Recent report; not a certification of accuracy'))}`).addTo(pm)}
 for(const c of data.fires?.cells??[]){L.circleMarker([c.lat,c.lng],{radius:3+Math.min(6,Math.sqrt(c.detections)),color:'#a44216',weight:1,fillOpacity:.6}).bindPopup(`${c.detections} ${tr('จุดตรวจจับ / 48 ชม. · จุดกลางกริด 0.25° ไม่ใช่พื้นที่เผา','detections / 48h · 0.25° cell centroid, not burned area')}`).addTo(fire)}
 const current=obs.filter(r=>r.status==='current')
 byId('status').textContent=lastError?tr('โหลดใหม่ไม่สำเร็จ แสดงข้อมูลครั้งก่อนพร้อมเวลาเดิม','Refresh failed; showing previous evidence with its original times'):`${tr('ข้อมูล PM สดเชื่อมต่อ','Current PM feeds connected')}: ${new Set(current.map(r=>r.country)).size} / ${data.countries.length} ${tr('ประเทศ','countries')} · ${tr('สร้างภาพรวม','Overview generated')} ${clock(data.generated_at)}`
 byId('coverage').innerHTML=['TH','SG'].map(code=>{const rows=obs.filter(r=>r.country===code),fresh=rows.filter(r=>r.status==='current');return `<div class="reading"><h3>${code==='TH'?tr('ประเทศไทย','Thailand'):tr('สิงคโปร์','Singapore')}</h3><strong>${fresh.length}</strong> ${tr('จุดรายงานสด','current reporting locations')} / ${rows.length}<p>${code==='SG'?tr('PM2.5 เฉลี่ย 1 ชั่วโมง / 5 ภูมิภาค ไม่ใช่ตำแหน่งเซ็นเซอร์','One-hour PM2.5 / five regions, not individual monitor locations'):tr('ค่าตรวจวัด Air4Thai ช่วงเฉลี่ยไม่ถูกเก็บในตารางปัจจุบัน','Air4Thai reported values; averaging window not retained in our normalized table')}</p>${code==='SG'&&!data.singapore.available?`<p class="stale">${tr('แหล่งสิงคโปร์ไม่พร้อม','Singapore feed unavailable')}</p>`:''}</div>`}).join('')+`<p>${tr('ตรวจแหล่งไฟ','Fire source checked')}: ${esc(clock(data.fires?.checked_at))} · ${data.fires?.available?tr('มีข้อมูลเฉพาะขอบเขตเส้นประ','Available inside dashed coverage box only'):tr('ไม่พร้อมหรือเก่า','Unavailable or stale')}</p><details><summary>${tr('ค่ารายภูมิภาคของสิงคโปร์','Singapore regional readings')}</summary>${obs.filter(r=>r.country==='SG').map(r=>`<p>${esc(r.name)}: <strong>${r.pm25} µg/m³</strong><br>${esc(clock(r.observed_at))} · ${esc(r.status)}</p>`).join('')||tr('ไม่มีข้อมูล','No readings')}</details>`
 byId('countries').innerHTML=data.countries.map(c=>{const rows=obs.filter(r=>r.country===c.code);return `<article><button data-country="${c.code}">${esc(lang==='th'?c.name_th:c.name_en)}</button><p class="status-label">${rows.length?`${rows.filter(r=>r.status==='current').length} ${tr('จุดสด','current')} / ${rows.length} ${tr('จุดรายงาน','reporting locations')}`:tr('ยังไม่เชื่อมต่อค่าตัวเลข','Numeric feed not connected')}</p><p>${esc(c.note_en)}</p><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.agency)} ↗</a></article>`}).join('')
 for(const b of document.querySelectorAll('[data-country]'))b.onclick=()=>{const c=data.countries.find(c=>c.code===b.dataset.country);map.setView([c.lat,c.lng],c.code==='SG'?10:c.code==='ID'?4:6);byId('regional-map').scrollIntoView({block:'center',behavior:'instant'})}
 byId('resources').innerHTML=data.resources.map(r=>`<article><h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)} ↗</a></h3><p>${esc(r.role)}</p></article>`).join('')
}
async function load(){if(loading)return;loading=true;byId('refresh').disabled=true
 try{const res=await fetch('/api/region',{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!res.ok)throw Error();data=await res.json();lastError=false;paint()}
 catch{lastError=true;if(data)paint();else byId('status').textContent=tr('โหลดภาพรวมไม่สำเร็จ ลองอีกครั้งหรือเปิด ASMC / หน่วยงานต้นทาง','Regional evidence unavailable. Retry or open ASMC / official providers.');if(!data)byId('resources').innerHTML='<a href="https://asmc.asean.org/asmc-gis-portal/">ASMC haze information portal ↗</a>'}
 finally{loading=false;byId('refresh').disabled=false}
}
byId('refresh').onclick=load
function airToggle(id, th, en, layer){
 const host=document.querySelector('.map-tools')
 if(!host||document.getElementById(id))return
 const label=document.createElement('label')
 const input=document.createElement('input')
 input.id=id;input.type='checkbox';input.checked=true
 const span=document.createElement('span')
 span.dataset.t=`${th}|${en}`
 span.textContent=tr(th,en)
 label.append(input,span)
 input.onchange=()=>{input.checked?layer.addTo(map):map.removeLayer(layer)}
 host.appendChild(label)
}
airToggle('wind-flow','ลมปัจจุบัน · กริด Open-Meteo','Current wind · Open-Meteo grid',flow)
airToggle('haze-drift','ลมพัดหมอกควันไปทางนี้ ไม่ใช่พยากรณ์','Wind carries haze this way, not a forecast',drift)
const stage=document.querySelector('.map-stage')
if(stage&&!document.getElementById('air-legend')){
 const note=document.createElement('p')
 note.id='air-legend'
 note.className='caption air-copy'
 stage.appendChild(note)
}
paintAirCaption()
translate();load()
// Only reclassify age between explicit refreshes; no background upstream loop.
setInterval(()=>{if(data&&!document.hidden)paint()},60000)
