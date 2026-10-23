import assert from 'node:assert/strict'
import {createRegionalOverviewReader,REGION_CACHE_KEY} from '../server/regionalOverviewCache.js'
let now=Date.parse('2026-10-23T08:00:00Z'),stored=null,calls=0,fail=false
const db={kvGet:key=>key===REGION_CACHE_KEY?stored:null,kvSet:(key,value)=>{assert.equal(key,REGION_CACHE_KEY);stored=value}}
const build=async()=>{calls++;await Promise.resolve();if(fail)throw Error('provider failure');return {generated_at:new Date(now).toISOString(),regional_wind:{available:false},fires:{available:false},observations:[]}}
let read=createRegionalOverviewReader(db,build,()=>now)
const [a,b]=await Promise.all([read(),read()]);assert.equal(calls,1);assert.deepEqual(a,b)
now+=60000;read=createRegionalOverviewReader(db,build,()=>now);assert.equal((await read()).generated_at,a.generated_at);assert.equal(calls,1)
now+=5*60000;const c=await read();assert.equal(calls,2);assert.notEqual(c.generated_at,a.generated_at)
stored=JSON.stringify({...c,generated_at:new Date(now+60000).toISOString()});await read();assert.equal(calls,3)
stored='{bad';await read();assert.equal(calls,4)
now+=6*60000;fail=true;await assert.rejects(read(),/provider failure/);assert.equal(calls,5)
fail=false;await read();assert.equal(calls,6)
console.log('PASS public regional cache: coalesced misses, persisted restart reuse, original timestamp, expiry, future/corrupt rejection and failed refresh recovery')
