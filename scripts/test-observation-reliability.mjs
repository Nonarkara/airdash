import assert from 'node:assert/strict'
import { summarizePmCoverage, pmObservationCoverage } from '../server/observationCoverage.js'
import { createScheduler } from '../server/scheduler.js'
import dustboy from '../server/sources/dustboy.js'
import { CONFIG } from '../server/config.js'
const now=Date.parse('2026-10-15T15:00:00Z')
const rows=[{source:'pcd',value:12,obs_time:'2026-10-15T22:00'},{source:'pcd',value:0,obs_time:'2026-10-15T21:00'},{source:'pcd',value:55,obs_time:'2026-10-15T19:00'},{source:'pcd',value:10,obs_time:'bad'},{source:'pcd',value:10,obs_time:'2026-10-16T22:00'},{source:'model',value:20,obs_time:'2026-10-15T14:45:00Z'}]
let result=summarizePmCoverage(rows,now)
assert.deepEqual(result.sources.pcd,{total:5,current:2,stale:1,invalid:2,newest_at:'2026-10-15T15:00:00.000Z'})
assert.equal(result.sources.model.current,1)
assert.deepEqual(summarizePmCoverage([],now).sources,{})
pmObservationCoverage({all:sql=>{assert.match(sql,/FROM latest/);assert.doesNotMatch(sql,/FROM readings/);return rows}},now)
assert.ok(CONFIG.intervals.air4thai<=15*60000)
const kv=new Map(),runs=[]
const db={kvGet:k=>kv.get(k),kvSet:(k,v)=>kv.set(k,v),get:()=>({started_at:new Date().toISOString()}),recordRun:r=>runs.push(r)}
const source={name:'optional',enabled:true,label_en:'Optional',intervalMs:3600000,isConfigured:({db})=>!!db.kvGet('key'),run:async()=>({skipped_no_token:!kv.get('key'),seen:0,added:0})}
const scheduler=createScheduler({db,bus:{publish(){}},alerts:{},sources:[source]})
scheduler.start()
assert.equal(scheduler.health().optional.unconfigured,true)
assert.equal(scheduler.health().optional.lastOk,null) // Hydrated old "success" is not live.
await scheduler.runOnce('optional')
assert.equal(scheduler.health().optional.lastOk,null)
kv.set('key','test-fixture')
await scheduler.runOnce('optional')
assert.equal(scheduler.health().optional.unconfigured,false)
assert.ok(scheduler.health().optional.lastOk)
const originalFetch=globalThis.fetch,priorToken=process.env.DUSTBOY_TOKEN
process.env.DUSTBOY_TOKEN='test-fixture'
let inserts=0
const sensorDb={kvGet:()=>null,tx:f=>f(),upsertStation(){},insertReading(){inserts++;return true}}
try{
 globalThis.fetch=async()=>({ok:true,json:async()=>({data:[{id:'s',pm25:25,lat:18,lng:99}]})})
 await assert.rejects(dustboy.run({db:sensorDb}),/observation timestamps/)
 assert.equal(inserts,0)
 globalThis.fetch=async()=>({ok:true,json:async()=>({data:[{id:'s',pm25:25,lat:18,lng:99,timestamp:'2026-10-15 22:00'}]})})
 const ingestion=await dustboy.run({db:sensorDb});assert.equal(ingestion.added,1);assert.equal(inserts,1)
 globalThis.fetch=async()=>({ok:true,json:async()=>({data:[]})})
 await assert.rejects(dustboy.run({db:sensorDb}),/no usable/)
}finally{globalThis.fetch=originalFetch;if(priorToken===undefined)delete process.env.DUSTBOY_TOKEN;else process.env.DUSTBOY_TOKEN=priorToken}
console.log('PASS provider observation coverage, staggered-feed cadence, missing-key health after reboot, and no fabricated DustBoy measurement times')
