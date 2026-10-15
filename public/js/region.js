import { escapeHtml as esc } from './fmt.js?v=2.4.89'
import { readPreference, writePreference } from './preferences.js?v=2.4.89'
let lang=readPreference('ad_lang')==='th'?'th':'en'
const tr=(th,en)=>lang==='th'?th:en
const whole=[[-11,92],[28,142]]
const map=L.map('regional-map',{minZoom:3,maxZoom:12,preferCanvas:true}).fitBounds(whole)
map.attributionControl.setPrefix(false)
L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxNativeZoom:16,attribution:'Esri, HERE, Garmin · © OpenStreetMap'}).addTo(map)
const pm=L.layerGroup().addTo(map),fire=L.layerGroup().addTo(map)
L.rectangle([[4,92],[29,110]],{weight:1,dashArray:'6 6',color:'#86551c',fill:false,interactive:false}).addTo(map)
let data=null,imagery=null,loading=false,lastError=false
const byId=id=>document.getElementById(id)
function clock(time){const date=new Date(time);return Number.isFinite(date.getTime())?date.toLocaleString(lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok',hour12:false})+' ICT':'—'}
function translate(){document.documentElement.lang=lang;for(const n of document.querySelectorAll('[data-t]')){const [th,en]=n.dataset.t.split('|');n.textContent=tr(th,en)}byId('language').textContent=lang==='th'?'EN':'ไทย';paint();setImagery()}
byId('language').onclick=()=>{lang=lang==='th'?'en':'th';writePreference('ad_lang',lang);translate()}
byId('reset-map').onclick=()=>map.fitBounds(whole)
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
byId('imagery').onchange=setImagery
function paint(){
 if(!data)return
 pm.clearLayers();fire.clearLayers()
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
translate();load()
// Only reclassify age between explicit refreshes; no background upstream loop.
setInterval(()=>{if(data&&!document.hidden)paint()},60000)
