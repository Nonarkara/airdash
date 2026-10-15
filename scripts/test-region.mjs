import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COUNTRIES, singaporeRows, thailandRows, observationStatus, createSingaporeReader } from '../server/region.js'
const now=Date.parse('2026-10-15T12:00:00Z')
const payload={code:0,data:{regionMetadata:[{name:'north',labelLocation:{latitude:1.4,longitude:103.8}},{name:'south',labelLocation:{latitude:1.2,longitude:103.8}}],items:[{timestamp:'2026-10-15T19:30:00+08:00',readings:{pm25_one_hourly:{north:0,south:null}}}]}}
assert.equal(COUNTRIES.length,11);assert.equal(new Set(COUNTRIES.map(c=>c.code)).size,11)
assert.equal(observationStatus('bad',now),'invalid')
assert.equal(observationStatus('2026-10-16T12:00:00Z',now),'invalid')
assert.equal(observationStatus('2026-10-15T08:00:00Z',now),'stale')
let rows=singaporeRows(payload,now);assert.equal(rows.length,1);assert.equal(rows[0].pm25,0);assert.equal(rows[0].averaging_period,'1 hour');assert.equal(rows[0].status,'current')
const wrongUnit=structuredClone(payload);wrongUnit.data.items[0].readings={psi:{north:22}};assert.equal(singaporeRows(wrongUnit,now).length,0)
const future=structuredClone(payload);future.data.items[0].timestamp='2026-10-16T19:30:00+08:00';assert.equal(singaporeRows(future,now).length,0)
const th=thailandRows([{station_key:'test',lat:13,lng:100,pm25:12,obs_time:'2026-10-15 19:00:00'}],now)
assert.equal(th[0].status,'current');assert.equal(Date.parse(th[0].observed_at),now)
assert.equal(thailandRows([{lat:13,lng:100,pm25:null,obs_time:'bad'}],now).length,0)
let calls=0,t=now,fail=false
const reader=createSingaporeReader(async()=>{calls++;await Promise.resolve();return {ok:!fail,json:async()=>payload}},()=>t)
await Promise.all([reader(),reader(),reader()]);assert.equal(calls,1)
await reader();assert.equal(calls,1)
t+=16*60000;fail=true;assert.equal((await reader()).available,false);assert.equal(calls,2)
assert.deepEqual((await reader()).readings,[]);assert.equal(calls,2)
t+=6*60000;fail=false;assert.equal((await reader()).available,true);assert.equal(calls,3)
const page=readFileSync('public/region.html','utf8'),redirects=readFileSync('public/_redirects','utf8')
assert.match(page,/Return to Thailand dashboard/);assert.match(redirects,/\/region\s+\/region\s+200/)
assert.match(readFileSync('public/js/map.js','utf8'),/link.href='\/region'/)
console.log('PASS 11 countries, timezone and age gates, null/unit rejection, regional observations, coalesced caching, failure cooldown and navigation wiring')
