import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import { burnAreaPayload } from '../server/burnArea.js'
import { parseCsv } from '../server/sources/burn-area.js'
import { computeSmoke } from '../server/smoke.js'
let passed = 0
function test(name, fn) { fn(); passed++; console.log('PASS', name) }
const row = (province_code, yyyymm, total, missing = false) => ({province_code,yyyymm,paddy_rai:total,cane_rai:0,corn_rai:0,mixed_rai:missing?null:0,total_rai:total,fetched_at:'2026-10-01T00:00:00Z'})
const data = [row('TH10','202501',100),row('TH50','202501',400),row('TH10','202601',120),row('TH50','202602',1000)]
const db = {all:()=>data}
test('province aliases select the same local history, never national totals',()=>{
 const a=burnAreaPayload(db,{season:'2025/26',province:'10'}),b=burnAreaPayload(db,{season:'2025/26',province:'TH10'})
 assert.equal(a.total_rai,120);assert.deepEqual(a.rows,b.rows);assert.equal(a.coverage.expected_cells,6)
})
test('comparison excludes unmatched provinces and months on both sides',()=>{
 const c=burnAreaPayload(db,{season:'2025/26',compare:'2024/25'}).comparison
 assert.equal(c.paired_cells,1);assert.equal(c.current_rai,120);assert.equal(c.previous_rai,100);assert.equal(c.change_pct,20)
 assert.equal(c.excluded_current_cells,1);assert.equal(c.excluded_previous_cells,1)
})
test('missing crop remains unknown despite a legacy zero total',()=>{
 const d=burnAreaPayload({all:()=>[row('TH10','202601',0,true)]},{season:'2025/26'})
 assert.equal(d.total_rai,null);assert.equal(d.months[0].total_rai,null);assert.equal(d.coverage.complete_cells,0)
})
test('real zero survives without inventing a percent change from zero baseline',()=>{
 const d=burnAreaPayload({all:()=>[row('TH10','202501',0),row('TH10','202601',0)]},{season:'2025/26',compare:'2024/25'})
 assert.equal(d.total_rai,0);assert.equal(d.comparison.paired_cells,1);assert.equal(d.comparison.change_pct,null)
})
test('no paired data yields unknown, not an apparent decrease',()=>{
 const d=burnAreaPayload({all:()=>[row('TH10','202601',10)]},{season:'2025/26',compare:'2024/25'})
 assert.equal(d.comparison.current_rai,null);assert.equal(d.comparison.change_pct,null)
})
test('malformed or nonconsecutive season and foreign province are rejected',()=>{
 for(const season of ['2025/99','2025/25','2025/27','0000/01']) assert.throws(()=>burnAreaPayload(db,{season}))
 assert.throws(()=>burnAreaPayload(db,{province:'10499'}));assert.throws(()=>burnAreaPayload(db,{compare:'2024/25'}))
})
test('CSV missing and negative crop values do not become zero observations',()=>{
 const r=parseCsv(',province_code,month,Paddy,Sugarcane,Mixed,Corn\n0,TH10,202601,   ,0,0,0\n1,TH50,202601,-1,0,0,0\n2,TH25,202601,0,0,0,0')
 assert.equal(r[0].total_rai,null);assert.equal(r[1].total_rai,null);assert.equal(r[2].total_rai,0)
})
function smokeDb(checkedAt){return {all:sql=>sql.includes('ingest_runs')?(checkedAt?[{started_at:checkedAt}]:[]):sql.includes('regional_hotspots')?[]:[{code:'10',lat:13.7,lng:100.5,metric:'wind_dir_d1',value:270,obs_time:'2026-10-03T00:00'}]}}
test('missing or stale fire ingest cannot assert zero fire potential',()=>{
 for(const date of [null,'2020-01-01T00:00:00Z']){const s=computeSmoke(smokeDb(date));assert.equal(s.available,false);assert.equal(s.fires_48h,null);assert.equal(s.provinces.length,0)}
})
test('successful recent empty ingest distinguishes observed zero from missing',()=>{
 const s=computeSmoke(smokeDb(new Date().toISOString()));assert.equal(s.available,true);assert.equal(s.fires_48h,0)
 assert.equal(s.provinces[0].level,'none');assert.equal(s.provinces[0].wind_basis,'tomorrow-forecast')
})
const context = vm.createContext({ store: {lang:'en'}, console })
const fmt = readFileSync('public/js/fmt.js','utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')
const ui = readFileSync('public/js/panels/burnBriefing.js','utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')
vm.runInContext(fmt+'\n'+ui+'\nthis.renderContext=contextHtml;this.renderHistory=historyHtml;this.csv=csvCell;this.selectProvince=p=>province=p',context)
test('national satellite maximum is labelled an estimate rather than a ground reading',()=>{
 const html=context.renderContext({risk:{national:{worstPm25:{ug:50}},provinces:[{pm25:50,pm25_source:'gistda_satellite'}]}},null)
 assert.match(html,/GISTDA estimate/);assert.doesNotMatch(html,/PCD \/ Air4Thai/)
})
test('missing local air and smoke cannot borrow national PM or imply no fires',()=>{
 context.selectProvince('TH90')
 const html=context.renderContext({risk:{national:{worstPm25:{ug:50}},provinces:[]}}, {available:false,provinces:[]})
 assert.match(html,/— µg/);assert.match(html,/unavailable/);assert.doesNotMatch(html,/50 µg|0 detections/)
})
test('CSV neutralizes formula text while preserving numeric negative changes',()=>{
 assert.equal(context.csv('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"')
 assert.equal(context.csv(-20),'"-20"')
})
console.log(`\n${passed} passed, 0 failed`)
