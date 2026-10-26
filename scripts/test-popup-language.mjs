import vm from 'node:vm'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../public/js/paint.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
const store={lang:'en'},escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const context=vm.createContext({store,tr:(th,en)=>store.lang==='th'?th:en,escapeHtml,bandColor:()=>'',pmColorFor:()=>'',fmtNum:v=>Number.isFinite(v)?String(Math.round(v)):'—',windRowText:()=>null,BAND:{normal:{th:'ปกติ',en:'Normal'},unknown:{th:'ไม่ทราบ',en:'Unknown'}}})
vm.runInContext(src,context)
const province={province_th:'เชียงใหม่',province_en:'Chiang Mai',score:42,band:'normal',pm25:20,pm25_fc_48h:22,precip_prob_24h:50}
for(const lang of ['th','en']){
 store.lang=lang
 const html=context.provinceCard(province),heading=html.match(/class="pop-name">(.*?)<\/div>/)[1]
 assert.ok(heading.includes(lang==='en'?'Chiang Mai':'เชียงใหม่'))
 assert.ok(heading.includes('42/100'),'selected-language heading retains province score')
 assert.ok(html.includes(lang==='en'?'rain chance 24h':'โอกาสฝน 24 ชม.'))
 const station=context.popupHtml(lang==='en'?'Station English':'สถานีไทย',lang==='en'?'สถานีไทย':'Station English',[])
 assert.ok(station.startsWith(`<div class="pop-name">${lang==='en'?'Station English':'สถานีไทย'}</div>`))
}
assert.ok(!context.provinceCard({...province,score:null,band:'unknown'}).includes('null/100'))
const unsafe=context.popupHtml('<script>','<img>',[['value','<svg>']])
assert.ok(!unsafe.includes('<script>')&&!unsafe.includes('<img>')&&!unsafe.includes('<svg>'))
console.log('PASS TH/EN province score headings, station headings, unknown score and escaped popup content')
