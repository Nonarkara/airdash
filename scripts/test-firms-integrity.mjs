import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import source,{ detectionKey,parseCsv,migrateDetectionKeys } from '../server/sources/firms-regional.js'
import { regionalFires } from '../server/regionalFires.js'
const a={lat:20.001,lng:96.001,acq_date:'2026-10-23',acq_time:'430',satellite:'N'}
const b={...a,lat:20.004,lng:96.004}
assert.notEqual(detectionKey(a),detectionKey(b),'nearby native pixels must survive separately')
assert.equal(detectionKey(a),detectionKey({...a,acq_time:'0430',lat:'20.0010'}),'representation changes are not new observations')
const raw=new DatabaseSync(':memory:')
raw.exec(`CREATE TABLE regional_hotspots(detection_key TEXT PRIMARY KEY,lat REAL,lng REAL,acq_date TEXT,acq_time TEXT,satellite TEXT,frp REAL,confidence TEXT,in_thailand INTEGER,province_th TEXT,province_en TEXT,fetched_at TEXT); CREATE TABLE ingest_runs(id INTEGER,source TEXT,ok INTEGER,started_at TEXT)`)
const add=(key,r)=>raw.prepare('INSERT INTO regional_hotspots(detection_key,lat,lng,acq_date,acq_time,satellite) VALUES(?,?,?,?,?,?)').run(key,r.lat,r.lng,r.acq_date,r.acq_time,r.satellite)
add('old',a);add(detectionKey(a),a);add('another-old',b)
let receipt
const db={all:(s,...p)=>raw.prepare(s).all(...p),run:(s,...p)=>raw.prepare(s).run(...p),tx:fn=>{raw.exec('BEGIN');try{fn();raw.exec('COMMIT')}catch(e){raw.exec('ROLLBACK');throw e}},kvGet:()=>JSON.stringify(receipt),kvSet:(_,v)=>{receipt=JSON.parse(v)}}
await migrateDetectionKeys(db);await migrateDetectionKeys(db)
assert.equal(db.all('SELECT * FROM regional_hotspots').length,2,'migration resumes without duplicates or lost pixels')
const now=Date.parse('2026-10-23T06:00:00Z')
const feed={fetched_at:new Date(now).toISOString(),newest_acquisition_at:new Date(now-3600000).toISOString()}
receipt={bounds:[-11,92,29,142],key_version:2,fetched_at:new Date(now).toISOString(),feeds_ok:3,feeds:[feed,{...feed,newest_acquisition_at:'2026-10-20T00:00:00Z'},{...feed,error:true}]}
let result=regionalFires(db,now)
assert.equal(result.feeds_current,1);assert.equal(result.available,true);assert.equal(result.cells[0].detections,2)
receipt.feeds=[{...feed,newest_acquisition_at:'2026-10-20T00:00:00Z'}]
result=regionalFires(db,now);assert.equal(result.available,false,'successful old downloads cannot certify current acquisition coverage');assert.deepEqual(result.cells,[])
receipt.feeds=[{...feed,newest_acquisition_at:'2026-10-24T00:00:00Z'}]
assert.equal(regionalFires(db,now).available,false,'future timestamps cannot certify freshness')
const header='latitude,longitude,acq_date,acq_time,satellite,confidence,frp'
const report={now};assert.deepEqual(parseCsv(header+'\n40,-100,2026-10-23,0500,N,high,10',report),[])
assert.equal(report.newest_acquisition_at,'2026-10-23T05:00:00Z','fresh global feed can confirm acquisition availability even with no regional detections')
assert.equal(parseCsv(header+'\n20,96,2026-02-31,0430,N,high,10').length,0,'invalid calendar days rejected')
const original=globalThis.fetch
try{
 globalThis.fetch=async()=>({ok:true,text:async()=>header+'\n20.001,96.001,2026-10-23,0430,N,high,10\n20.004,96.004,2026-10-23,0430,N,high,20'})
 const time=new Date().toISOString();const current=header+`\n20.001,96.001,${time.slice(0,10)},${time.slice(11,13)+time.slice(14,16)},N,high,10\n20.004,96.004,${time.slice(0,10)},${time.slice(11,13)+time.slice(14,16)},N,high,20`
 globalThis.fetch=async()=>({ok:true,text:async()=>current})
 raw.exec('DELETE FROM regional_hotspots')
 await source.run({db});await source.run({db})
 assert.equal(db.all('SELECT * FROM regional_hotspots').length,2,'repeated feed fetches preserve exact pixels without double counting')
 globalThis.fetch=async()=>({ok:true,text:async()=>header+'\n20,96,2000-01-01,0430,N,high,1'})
 await assert.rejects(source.run({db}),/no recent upstream acquisitions/)
 assert.equal(receipt.feeds.length,3);assert.equal(receipt.key_version,2)
}finally{globalThis.fetch=original;raw.close()}
console.log('PASS native pixel identity, resumable migration, acquisition freshness, global zero-region receipts and idempotent ingestion')
