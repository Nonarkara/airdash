import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
const src=readFileSync('public/js/panels/hazePlan.js','utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
const ctx=vm.createContext({store:{lang:'en'},console,AbortSignal,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;')})
vm.runInContext(src,ctx)
let n=0
for(const [label,expr,want] of [
 ['north wind blows south','windTowards(0)',180],['east wind blows west','windTowards(90)',270],['south wind blows north','windTowards(180)',0],
 ['missing wind stays unknown','windTowards(null)',null],['invalid wind rejected','windTowards(-5)',null],
 ['measured elevated PM leads despite rain/low model','planningState(50,10,0)','protect'],
 ['model elevated triggers preparation','planningState(10,45,0)','prepare'],
 ['upwind detections trigger watch not exposure prediction','planningState(10,10,3)','watch'],
 ['missing forecast cannot be all clear','planningState(10,null,0)','unknown'],
 ['missing measurement cannot be all clear','planningState(null,10,0)','unknown'],
 ['zero observed PM stays a measured value','planningState(0,0,0)','monitor'],
]) {assert.equal(vm.runInContext(expr,ctx),want);console.log('PASS',label);n++}
console.log(`${n} passed, 0 failed`)
const {DatabaseSync}=await import('node:sqlite')
const {computeSmoke}=await import('../server/smoke.js')
const db=new DatabaseSync(':memory:')
db.exec(`CREATE TABLE ingest_runs(id INTEGER,source TEXT,ok INTEGER,started_at TEXT);
CREATE TABLE regional_hotspots(lat REAL,lng REAL,frp REAL,in_thailand INTEGER,acq_date TEXT,acq_time TEXT);
CREATE TABLE latest(source TEXT,station_key TEXT,metric TEXT,value REAL,obs_time TEXT);
CREATE TABLE stations(source TEXT,station_key TEXT,lat REAL,lng REAL,province_th TEXT,province_en TEXT);`)
db.prepare('INSERT INTO ingest_runs VALUES(1,?,1,?)').run('firms_regional',new Date().toISOString())
for(const ago of [1,47,49,-6]) {
 const at=new Date(Date.now()-ago*3600000).toISOString()
 db.prepare('INSERT INTO regional_hotspots VALUES(18,99,10,1,?,?)').run(at.slice(0,10),at.slice(11,16).replace(':',''))
}
for(const time of [null,'','oops']) db.prepare('INSERT INTO regional_hotspots VALUES(18,99,10,1,?,?)').run(new Date().toISOString().slice(0,10),time)
const smoke=computeSmoke({all:(sql,...args)=>db.prepare(sql).all(...args)})
assert.equal(smoke.available,true)
assert.equal(smoke.fires_48h,2)
assert.equal(smoke.fire_cells.reduce((sum,c)=>sum+c.detections,0),2)
assert.equal(smoke.fire_grid_degrees,0.25)
db.close()
console.log('PASS actual SQL excludes older-than-48h and future fire detections; grid counts reconcile')
// Exercise the actual asynchronous panel and button handlers, without upstream calls.
const controls = new Map()
const mapButtons=['pollution','transport','rain'].map(view=>({dataset:{view}}))
const host={isConnected:true,innerHTML:'',querySelector:sel=>{
 if(!controls.has(sel))controls.set(sel,{})
 return controls.get(sel)
},querySelectorAll:()=>mapButtons}
const events=[]
ctx.host=host
ctx.snapshot={risk:{provinces:[{province_code:'50',province_th:'เชียงใหม่',province_en:'Chiang Mai',lat:18.8,lng:99,pm25:12,pm25_source:'air4thai',wind_fc_kmh:10}]}}
ctx.fetch=async url=>({ok:true,json:async()=>url.includes('smoke')?{available:true,provinces:[{code:'50',from_deg:270,upwind_fires:3,wind_basis:'tomorrow-forecast'}],fire_cells:[{lat:18,lng:98,detections:3}]}:url.includes('forecast')?{provinces:[{code:'50',forecast:{pm25_d0:15,pm25_d1:45,pm25_d2:30}}]}:{provinces:[]}})
ctx.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail}}
ctx.window={dispatchEvent:e=>events.push(e),matchMedia:()=>({matches:false})}
await vm.runInContext('load(host,snapshot)',ctx)
assert.match(host.innerHTML,/data-state="prepare"/)
assert.match(host.innerHTML,/15 → 45 → 30/)
assert.match(host.innerHTML,/Wind from 270° → blows towards 90°/)
assert.equal(events[0].detail.fireCells[0].detections,3)
mapButtons[1].onclick()
assert.equal(events.at(-1).detail.view,'transport')
console.log('PASS rendered panel keeps measured PM, model, wind direction and rain gaps separate; transport button dispatches correct map preset')
