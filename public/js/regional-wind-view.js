import { windAt, airPath } from './wind-transport.js?v=2.4.130'
import { windArrowSvg } from './wind.js?v=2.4.130'
import { escapeHtml as esc } from './fmt.js?v=2.4.130'
import { HOUR_STEPS, MARK_SEPARATION_PX, CHIP_HEIGHT_PX, clusterMarks, minSeparationPx, zoomForSeparation, focusZoom } from './hour-marks.js?v=2.4.130'
export function createRegionalWindView({map,tr,clock}){
 const vectors=L.layerGroup().addTo(map),track=L.layerGroup().addTo(map)
 let data=null,origin={lat:20,lng:98},offset=0,level='surface',lastPath=[],focusActive=false
 const key=L.control({position:'bottomleft'});let keyNode;key.onAdd=()=>{keyNode=L.DomUtil.create('div','wind-map-key');return keyNode};key.addTo(map)
 const el=id=>document.getElementById(id)
 const instrument=document.querySelector('.wind-instrument'),home=instrument.parentElement,dialog=el('wind-dialog')
 el('wind-reading').onclick=()=>{if(matchMedia('(max-width:700px)').matches){el('wind-dialog-content').appendChild(instrument);dialog.showModal()}else el('wind-origin').focus()}
 dialog.onclose=()=>home.prepend(instrument)
 map.on('resize',()=>{if(dialog.open&&!matchMedia('(max-width:700px)').matches)dialog.close()})
 const compass=d=>['N','NE','E','SE','S','SW','W','NW'][Math.round(d/45)%8]
 function draw(){
  vectors.clearLayers();track.clearLayers();lastPath=[]
  const keyBase=(level==='surface'?'10 m · ':'850 hPa · ')+tr('ลูกศร → ทิศที่ลมไป · ตัวเลข km/h · เส้น +h เป็นสถานการณ์สมมุติ','Arrows → air movement · numbers km/h · +h path is a scenario')+'\n'+tr('ช่องส้ม: จำนวนตรวจไฟ 48 ชม. ไม่ใช่พื้นที่เผาหรือควัน','Orange cells: 48h fire counts, not burned area or smoke')
  keyNode.textContent=keyBase
  const now=Date.now(),start=Math.floor(now/60000)*60000+offset*3600000
  el('wind-time-label').textContent=clock(start)
  const w=windAt(data,origin.lat,origin.lng,start,level,now)
  el('wind-receipt').textContent=data?.fetched_at?tr('ดึงพยากรณ์','Forecast retrieved')+' '+clock(data.fetched_at):tr('ยังไม่มีลมรายชั่วโมง','No hourly wind receipt')
  el('wind-level-note').textContent=level==='surface'?tr('10 ม. เหนือพื้นดิน · กริดห่าง 6° ไม่เห็นลมหุบเขา','10 m above ground · 6° samples cannot resolve valley winds'):tr('850 hPa ≈ 1.5 กม. เหนือทะเล อาจอยู่ใต้ภูเขา ไม่ใช่ความสูงควัน','850 hPa ≈ 1.5 km above sea level; may intersect terrain. Not smoke height.')
  el('wind-position').textContent=`${origin.lat.toFixed(2)}°, ${origin.lng.toFixed(2)}°`
  if(!w){el('wind-reading').setAttribute('aria-label',tr('รายละเอียดลม · ไม่มีข้อมูล','Wind details · unavailable'));el('wind-rain').textContent='';el('wind-reading').textContent=tr('ไม่มีลมรายชั่วโมง','Wind unavailable');el('wind-path-summary').textContent=tr('ไม่วาดเส้นทางเมื่อข้อมูลขาดหรือเก่า','No path drawn with missing or stale winds');el('wind-steps').innerHTML='';return}
  el('wind-reading').setAttribute('aria-label',tr('รายละเอียดลม','Wind details')+` · ${Math.round(w.speed)} km/h · ${w.speed<.5?tr('ลมสงบ','calm'):compass(w.towards)+' '+Math.round(w.towards)+'°'} · ${level==='surface'?'10 m':'850 hPa'}`)
  el('wind-reading').innerHTML=w.speed<.5?`<strong>0 <small>km/h</small></strong><span>${tr('ลมสงบ','Calm')}</span>`:`${windArrowSvg(w.towards,{size:32})}<strong>${Math.round(w.speed)} <small>km/h</small></strong><span>→ ${compass(w.towards)} <small>${Math.round(w.towards)}°</small></span>`
  if(el('wind').checked)for(const p of data.points){const v=windAt(data,p.lat,p.lng,start,level,now);if(!v||v.speed<.5)continue
   L.marker([p.lat,p.lng],{interactive:false,icon:L.divIcon({className:'wind-grid-label',iconSize:[46,40],iconAnchor:[23,20],html:`${windArrowSvg(v.towards,{size:24})}<span>${Math.round(v.speed)}</span>`})}).addTo(vectors)
  }
  el('wind-rain').textContent=Number.isFinite(w.rain)?tr('ฝนคาดการณ์ชั่วโมงนี้','Forecast rain this hour')+`: ${w.rain.toFixed(1)} mm`:tr('ไม่มีข้อมูลฝนชั่วโมงนี้','Hourly rain unavailable')
  const path=airPath(data,origin,start,level,6,now)
  L.circleMarker([origin.lat,origin.lng],{radius:6,color:'#075672',fillColor:'#fff',fillOpacity:1,weight:3}).bindTooltip(tr('จุดเริ่มสมมุติ','Scenario release point')).addTo(track)
  if(path.points.length>1)L.polyline(path.points.map(p=>[p.lat,p.lng]),{color:'#075672',weight:4}).addTo(track)
  lastPath=path.points
  const steps=path.points.filter(p=>p.hours>0&&Math.abs(p.hours-Math.round(p.hours))<.0001)
  // The hour marks. They are never dropped: marks too close to read apart
  // are clustered into one chip that names every hour it covers, so a
  // reader is never left believing a step does not exist.
  const marks=steps.filter(p=>HOUR_STEPS.includes(p.hours)).map(p=>{const pt=map.latLngToContainerPoint([p.lat,p.lng]);return {hours:p.hours,x:pt.x,y:pt.y,time:p.time}})
  const groups=clusterMarks(marks)
  for(const g of groups){
   const tip=g.hours.length===1?clock(g.times[0]):g.hours.map((h,i)=>`+${h}h ${clock(g.times[i])}`).join(' · ')
   L.marker(map.containerPointToLatLng([g.x,g.y]),{icon:L.divIcon({className:'wind-hour-mark',iconSize:[g.width,CHIP_HEIGHT_PX],iconAnchor:[g.width/2,CHIP_HEIGHT_PX/2],html:`<span>${g.label}</span>`})}).bindTooltip(tip).addTo(track)
  }
  // When the marks cannot be read apart, the map says so instead of
  // pretending there is only one of them.
  if(marks.length&&groups.length<marks.length){
   const sepAtMax=minSeparationPx(marks)*2**(map.getMaxZoom()-map.getZoom())
   keyNode.textContent=keyBase+'\n'+(sepAtMax>=MARK_SEPARATION_PX
    ?tr('ป้ายเวลาทับกันที่ซูมนี้ — ซูมเข้าเพื่อแยก','Hour marks overlap at this zoom — zoom to separate.')
    :tr(`เส้นทางนี้ยาวเพียง ${Math.round(path.distance??0)} กม. — แยกป้ายเวลาที่นี่ไม่ได้`,`This path is only ${Math.round(path.distance??0)} km — the hour marks cannot be separated here.`))
  }
  const last=path.points.at(-1)
  el('wind-path-summary').textContent=`${tr('เส้นทางอากาศสมมุติ','Air-movement scenario')} · ${last.hours.toFixed(1)} h · ${Math.round(path.distance??0)} km${path.complete?'':' · '+tr('หยุดเมื่อข้อมูลขาด/พ้นกริด','stopped at data/grid gap')}`
  el('wind-steps').innerHTML=steps.filter(p=>HOUR_STEPS.includes(p.hours)).map(p=>`<li><time>+${p.hours}h</time><span>${esc(new Date(p.time).toLocaleTimeString('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'})+' ICT'+(new Date(p.time+7*3600000).toISOString().slice(0,10)!==new Date(start+7*3600000).toISOString().slice(0,10)?' '+new Date(p.time+7*3600000).toISOString().slice(5,10):''))}</span><span>${p.lat.toFixed(2)}°, ${p.lng.toFixed(2)}°</span></li>`).join('')
 }
 function select(lat,lng){focusActive=false;origin={lat,lng};el('wind-origin').value='custom';draw()}
 map.on('click',e=>select(e.latlng.lat,e.latlng.lng))
 // "Zoom to +hour path" has to deliver what it promises: a view where the
 // three hour marks can be read apart. The old cap of zoom 8 put an 18 km
 // path at about 30 px — smaller than the separation — so the marks could
 // never come apart and the button was a promise the map could not keep.
 // The zoom is computed from the geometry and the map's own maximum.
 function focusPath(){
  focusActive=true
  if(dialog.open)dialog.close()
  if(!lastPath.length)return
  const bounds=L.latLngBounds(lastPath.map(p=>[p.lat,p.lng]))
  const z0=map.getZoom()
  const projected=lastPath.filter(p=>HOUR_STEPS.includes(p.hours)).map(p=>map.project([p.lat,p.lng],z0))
  const z=focusZoom({fitZoom:map.getBoundsZoom(bounds.pad(0.15)),sepZoom:zoomForSeparation(z0,minSeparationPx(projected)),maxZoom:map.getMaxZoom(),minZoom:map.getMinZoom()})
  map.setView(bounds.getCenter(),z,{animate:false})
 }
 el('focus-wind').onclick=focusPath
 map.on('zoomend',draw)
 el('wind-hour').oninput=()=>{offset=Number(el('wind-hour').value);draw()}
 el('wind-level').onchange=()=>{level=el('wind-level').value;draw()}
 el('wind').onchange=draw
 el('wind-origin').onchange=()=>{const coords=el('wind-origin').value.split(',').map(Number);if(coords.length===2&&coords.every(Number.isFinite)){focusActive=false;origin={lat:coords[0],lng:coords[1]};el('watch-area').value=coords[0]<6?'indonesia':coords[0]===20?'myanmar':'mainland';map.setView([origin.lat,origin.lng],6,{animate:false});draw()}}
 // Browsers restore form values on navigation. Read those same values when
 // evidence arrives so the selected level/origin never labels a different path.
 function readControls(){
  level=el('wind-level').value==='aloft'?'aloft':'surface'
  offset=Math.max(0,Math.min(12,Number(el('wind-hour').value)||0))
  const coords=el('wind-origin').value.split(',').map(Number)
  if(coords.length===2&&coords.every(Number.isFinite))origin={lat:coords[0],lng:coords[1]}
 }
 return {isFocused:()=>focusActive,focus:focusPath,unfocus(){focusActive=false},update(value){data=value;readControls();draw()},select,draw}
}
