import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
// The REAL wind renderer, not a stub. The panel used to carry its own copy of
// the "which way does the wind blow" formula; the formula now lives on the
// server and the browser only draws what the server published, so a stubbed
// windRowText here would prove nothing about what a reader sees.
//
// The asset token is read from the source, not hardcoded: a hardcoded
// `?v=` becomes a DIFFERENT module instance from the one the panel imports
// after the next `npm run bump`, and the two instances then disagree about
// the language while the test still reports green.
const TOKEN=readFileSync('public/ops.html','utf8').match(/\?v=(\d+\.\d+\.\d+)/)?.[1]??''
const Q=TOKEN?`?v=${TOKEN}`:''
const {store: realStore} = await import(`../public/js/state.js${Q}`)
realStore.lang='en'
const {windRowText, windBasisLabel} = await import(`../public/js/wind.js${Q}`)
const src=readFileSync('public/js/panels/hazePlan.js','utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
const ctx=vm.createContext({store:{lang:'en'},console,AbortSignal,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),
  windRowText,windBasisLabel})
vm.runInContext(src,ctx)
let n=0
for(const [label,expr,want] of [
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
ctx.snapshot={risk:{provinces:[{province_code:'50',province_th:'เชียงใหม่',province_en:'Chiang Mai',lat:18.8,lng:99,pm25:12,pm25_source:'air4thai',wind_fc_kmh:10,wind_dir_deg:270,wind_from_th:'ตะวันตก',wind_from_en:'W',wind_towards_deg:90,wind_towards_th:'ตะวันออก',wind_towards_en:'E',wind_basis:'tomorrow-forecast',wind_updated_at:'2026-10-18T00:00'}]}}
ctx.fetch=async url=>({ok:true,json:async()=>url.includes('smoke')?{available:true,provinces:[{code:'50',wind_dir_deg:270,wind_from_th:'ตะวันตก',wind_from_en:'W',wind_towards_deg:90,wind_towards_th:'ตะวันออก',wind_towards_en:'E',upwind_fires:3,wind_basis:'tomorrow-forecast',wind_updated_at:'2026-10-18T00:00'}],fire_cells:[{lat:18,lng:98,detections:3}]}:url.includes('forecast')?{provinces:[{code:'50',forecast:{pm25_d0:15,pm25_d1:45,pm25_d2:30}}]}:{provinces:[]}})
ctx.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail}}
ctx.window={dispatchEvent:e=>events.push(e),matchMedia:()=>({matches:false})}
await vm.runInContext('load(host,snapshot)',ctx)
assert.match(host.innerHTML,/data-state="prepare"/)
assert.match(host.innerHTML,/15 → 45 → 30/)
// The wind line comes from the RISK row now — the canonical contract, with
// the speed the risk payload carries and the smoke engine does not.
assert.match(host.innerHTML,/W → E · 10 km\/h/)
assert.equal(events[0].detail.fireCells[0].detections,3)
// JSON comparison, not deepEqual: the array was built inside the vm context,
// so its prototype is the vm's Array, not the host's, and a strict deep
// comparison would fail on structure that is identical.
assert.equal(JSON.stringify(events[0].detail.fires),JSON.stringify([['50',3]]))
mapButtons[1].onclick()
assert.equal(events.at(-1).detail.view,'transport')
console.log('PASS rendered panel keeps measured PM, model, wind direction and rain gaps separate; transport button dispatches correct map preset')
