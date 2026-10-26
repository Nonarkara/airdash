import assert from 'node:assert/strict'
import {setImmediate as turn} from 'node:timers/promises'
import {createRegionalOverviewReader,REGION_CACHE_KEY} from '../server/regionalOverviewCache.js'
let now=Date.parse('2026-10-23T08:00:00Z'),stored=null,calls=0,fail=false
const db={kvGet:key=>key===REGION_CACHE_KEY?stored:null,kvSet:(key,value)=>{assert.equal(key,REGION_CACHE_KEY);stored=value}}
const build=async()=>{calls++;if(fail)throw Error('provider failure');return {generated_at:new Date(now).toISOString(),regional_wind:{available:false},fires:{available:false},observations:[]}}
let read=createRegionalOverviewReader(db,build,()=>now)
const [a,b]=await Promise.all([read(),read()]);assert.equal(calls,1);assert.deepEqual(a,b)
now+=60000;read=createRegionalOverviewReader(db,build,()=>now);assert.equal((await read()).generated_at,a.generated_at);assert.equal(calls,1)
now+=5*60000
let release
const slowRead=createRegionalOverviewReader(db,()=>{calls++;return new Promise(r=>{release=r})},()=>now)
const [c,d]=await Promise.all([slowRead(),slowRead()])
assert.equal(c.generated_at,a.generated_at,'last known timestamp is never freshened')
assert.equal(c.overview_status,'refreshing');assert.deepEqual(c,d)
assert.equal(calls,1,'slow rebuild does not start before stale response resolves')
await turn();assert.equal(calls,2,'one deferred refresh for simultaneous readers')
release({...a,generated_at:new Date(now).toISOString()});await turn()
assert.equal((await slowRead()).overview_status,undefined,'successful rebuild clears last-known status')
now+=6*60000;fail=true
const old=JSON.parse(stored)
const failed=await read();assert.equal(failed.overview_status,'refreshing');await turn()
assert.equal((await read()).overview_status,'refresh_failed');assert.equal(calls,3)
await read();await turn();assert.equal(calls,3,'failed background rebuild has a one-minute cooldown')
now+=61000;fail=false;await read();await turn();assert.equal(calls,4)
now+=21*60000;fail=true;await assert.rejects(read(),/provider failure/)
assert.ok(now-Date.parse(old.generated_at)>20*60000)
fail=false;stored=JSON.stringify({...a,generated_at:new Date(now+60000).toISOString()});await read();assert.equal(calls,6,'future cache never displayed')
stored='{bad';await read();assert.equal(calls,7,'corrupt cache rejected')
console.log('PASS coalesced rebuilds, persisted restart reuse, bounded labelled last-known data, original timestamp, deferred CPU work, failure cooldown, expiry and future/corrupt rejection')
