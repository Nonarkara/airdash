import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import source, { parseCsv } from '../server/sources/firms-regional.js'
import { regionalFires } from '../server/regionalFires.js'
const header='latitude,longitude,acq_date,acq_time,satellite,confidence,frp'
const csv=header+'\n-2,113,2026-10-19,0430,N,nominal,20\n20,96,2026-10-19,0430,J1,high,30\n-12,113,2026-10-19,0430,N,high,10\n1,103,2026-10-19,2460,N,high,10\n'
assert.equal(parseCsv(csv).length,2,'Indonesia and Myanmar retained, out-of-bounds and bad time rejected')
assert.throws(()=>parseCsv(''),/required columns/)
assert.throws(()=>parseCsv('<html>Maintenance</html>'),/required columns/)
assert.deepEqual(parseCsv(header),[])
assert.throws(()=>parseCsv('latitude,longitude\n1,100'),/required columns/)
const raw=new DatabaseSync(':memory:')
raw.exec('CREATE TABLE ingest_runs(id INTEGER,source TEXT,ok INTEGER,started_at TEXT); CREATE TABLE regional_hotspots(lat REAL,lng REAL,frp REAL,acq_date TEXT,acq_time TEXT)')
const now=Date.parse('2026-10-19T12:00:00Z')
raw.prepare('INSERT INTO ingest_runs VALUES(1,?,?,?)').run('firms_regional',1,new Date(now).toISOString())
const insert=raw.prepare('INSERT INTO regional_hotspots VALUES(?,?,?,?,?)')
for(const row of [[-2.1,113,20,'2026-10-19','430'],[20,96,30,'2026-10-19','430'],[20,96,30,'2026-10-16','430'],[20,96,30,'2026-10-20','430'],[20,96,30,'2026-10-19','2460']])insert.run(...row)
let coverage=JSON.stringify({bounds:[-11,92,29,142],fetched_at:new Date(now).toISOString(),feeds_ok:2,key_version:2,feeds:[{fetched_at:new Date(now).toISOString(),newest_acquisition_at:new Date(now-3600000).toISOString()},{fetched_at:new Date(now).toISOString(),newest_acquisition_at:new Date(now-3600000).toISOString()}]})
const db={kvGet:()=>coverage,all:(sql,...args)=>raw.prepare(sql).all(...args)}
const result=regionalFires(db,now)
assert.equal(result.available,true);assert.equal(result.cells.length,2)
assert.equal(result.cells.reduce((n,c)=>n+c.detections,0),2,'old/future/malformed acquisitions excluded')
assert.equal(result.cells.find(c=>c.lat<0).lat,-2.125,'negative latitude grid uses floor')
assert.equal(Date.parse(result.cells[0].last_observed_at),Date.parse('2026-10-19T04:30:00Z'))
assert.equal(regionalFires(db,now+13*3600000).available,false)
assert.deepEqual(regionalFires(db,now+13*3600000).cells,[])
coverage=null;assert.equal(regionalFires(db,now).available,false,'legacy mainland success must not certify maritime coverage')
raw.close()
const originalFetch=globalThis.fetch
try {
  globalThis.fetch=async()=>({ok:true,text:async()=>'<html>Maintenance</html>'})
  await assert.rejects(source.run({db:{}}),/all feeds failed/,'HTTP200 HTML must fail ingestion')
  const time=new Date().toISOString(); const freshCsv=csv.replaceAll('2026-10-19',time.slice(0,10)).replaceAll(',0430,',','+time.slice(11,13)+time.slice(14,16)+',')
  let call=0,receipt=null
  globalThis.fetch=async()=>({ok:true,text:async()=>++call===2?'':freshCsv})
  await source.run({db:{kvGet:()=>null,all:()=>[],tx:fn=>fn(),run:()=>({changes:1}),kvSet:(_key,value)=>{receipt=JSON.parse(value)}}})
  assert.equal(receipt.feeds_ok,2,'partial satellite failure is reported')
  assert.deepEqual(receipt.bounds,[-11,92,29,142])
  const large=header+'\n'+Array.from({length:501},(_,i)=>`-2,${110+i/1000},${time.slice(0,10)},${time.slice(11,13)+time.slice(14,16)},N,high,20`).join('\n')
  let inTransaction=0,largestBatch=0,batchRows=0,yielded=false
  globalThis.fetch=async()=>({ok:true,text:async()=>large})
  const immediate=setImmediate(()=>{yielded=true})
  await source.run({db:{kvGet:()=>null,all:()=>[],tx(fn){inTransaction++;batchRows=0;fn();largestBatch=Math.max(largestBatch,batchRows);inTransaction--},run(sql){if(sql.includes('INSERT')){assert.equal(inTransaction,1);batchRows++}return {changes:1}},kvSet(){assert.equal(yielded,true,'collector yields before certifying a large run')}}})
  clearImmediate(immediate)
  assert.equal(largestBatch,500,'large ingestion has bounded transactions')
} finally { globalThis.fetch=originalFetch }

console.log('PASS regional archive bounds, schema rejection, UTC windows, negative grid, acquisition timestamps, stale collector gate')
