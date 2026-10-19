import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import source,{floodEvents,readFloodReports,FLOOD_KEY} from '../server/sources/gdacs-flood.js'
import {regionalFlood} from '../server/regionalFlood.js'
const now=Date.parse('2026-10-19T12:00:00Z')
const feature=(changes={},geometry={type:'Point',coordinates:[101,4]})=>({type:'Feature',geometry,properties:{eventtype:'FL',eventid:1,iso3:'MYS',affectedcountries:[],name:'Malaysia flood',fromdate:'2026-10-15T01:00:00',todate:'2026-10-17T01:00:00',datemodified:'2026-10-18T01:00:00',alertlevel:'Green',...changes}})
const collection=features=>({type:'FeatureCollection',features})
let parsed=floodEvents(collection([feature(),feature({eventid:2,iso3:'IDN'}),feature({eventid:3,iso3:'MMR'}),feature({eventid:4,iso3:'IND'}),feature({eventid:5,fromdate:'2026-09-01',todate:'2026-09-02'}),feature({eventid:6,datemodified:'2026-10-20T00:00:00'}),feature({eventid:7},{type:'Point',coordinates:[101,NaN]})]),now)
assert.equal(parsed.events.length,3);assert.equal(parsed.rejected,2)
assert.equal(parsed.events[0].period_start,'2026-10-15T01:00:00Z','GDACS timestamps normalized as UTC, never local time')
assert.equal(parsed.events[0].alert,'Green','green report remains a flood report, never normal water')
const cross=floodEvents(collection([feature({iso3:'IND',affectedcountries:[{iso3:'MMR'}]},{type:'Point',coordinates:[90,20]})]),now)
assert.equal(cross.events.length,1,'affected SEA country retained even with a cross-border centroid')
assert.throws(()=>floodEvents({features:[]}),/FeatureCollection/)
const dedup=floodEvents(collection([feature(),feature({datemodified:'2026-10-18T02:00:00',name:'New episode'})]),now)
assert.equal(dedup.events.length,1);assert.equal(dedup.events[0].name,'New episode')
assert.ok(dedup.events[0].url.startsWith('https://www.gdacs.org/report.aspx?eventid=1&'))
const cache={...parsed,fetched_at:new Date(now).toISOString(),pagination_complete:true}
let twin={updated:new Date(now-7200000).toISOString(),fetched_at:new Date(now).toISOString(),provinces:[{code:'55',en:'Nan',level:'evacuate'}]}
const db={kvGet:key=>JSON.stringify(key===FLOOD_KEY?cache:twin)}
assert.equal(readFloodReports(db,now).available,true)
assert.equal(readFloodReports(db,now+7*3600000).available,false)
assert.deepEqual(readFloodReports(db,now+7*3600000).events,[])
assert.equal(readFloodReports(db,now-600000).available,false,'future receipt cannot certify a healthy feed')
assert.equal(regionalFlood(db,now).thailand.available,false,'fresh retrieval cannot refresh stale FloodDash source time')
twin.updated=new Date(now).toISOString()
assert.equal(regionalFlood(db,now).thailand.warnings[0].level,'evacuate')
assert.equal(readFloodReports({kvGet:()=>'{bad'},now).available,false)
const original=globalThis.fetch
try{
 let requested=[],written=null
 globalThis.fetch=async url=>{requested.push(new URL(url));return {ok:true,json:async()=>collection([])}}
 await source.run({db:{kvSet:(_k,v)=>{written=JSON.parse(v)}}})
 assert.equal(requested[0].searchParams.get('alertlevel'),'red;orange;green')
 assert.equal(written.pagination_complete,true);assert.deepEqual(written.events,[])
 globalThis.fetch=async()=>({ok:true,json:async()=>({maintenance:true})})
 await assert.rejects(source.run({db:{kvSet(){assert.fail('malformed response must not refresh receipt')}}}),/FeatureCollection/)
 requested=[]
 globalThis.fetch=async url=>{requested.push(url);return {ok:true,json:async()=>collection(Array.from({length:100},()=>feature()))}}
 await source.run({db:{kvSet:(_k,v)=>{written=JSON.parse(v)}}})
 assert.equal(requested.length,5,'pagination is bounded');assert.equal(written.pagination_complete,false,'truncated global feed never certified complete')
}finally{globalThis.fetch=original}
// Exercise actual UI renderer: stale pages clear markers, warnings retain action,
// and upstream strings are escaped before entering a popup or event list.
const js=fs.readFileSync('public/js/region.js','utf8'),slots={}
let markers=0
const popups=[]
const context={Date:class extends Date{static now(){return now}},data:{flood:{...cache,available:true,checked_at:cache.fetched_at,thailand:{available:true,updated_at:new Date(now).toISOString(),warnings:[{code:'55',name_en:'Nan',level:'evacuate'}]}}},lang:'en',tr:(_th,en)=>en,clock:t=>t??'—',esc:s=>String(s??'').replaceAll('<','&lt;'),byId:id=>slots[id]??(slots[id]={}),floods:{clearLayers(){markers=0}},L:{divIcon:x=>x,marker(){markers++;return {bindPopup(html){popups.push(html);return this},addTo(){return this}}}}}
context.data.flood.events[0].name='<img src=x onerror=alert(1)>'
vm.createContext(context)
const code=js.slice(js.indexOf('function paintFlood(){'),js.indexOf('async function load()'))
vm.runInContext(code+'\npaintFlood()',context)
assert.equal(markers,3);assert.doesNotMatch(slots['flood-events'].innerHTML,/<img/);assert.match(popups[0],/&lt;img/);assert.match(slots['thai-flood'].innerHTML,/Nan.*Evacuate/)
context.data.flood.checked_at=new Date(now-7*3600000).toISOString()
vm.runInContext('paintFlood()',context);assert.equal(markers,0);assert.match(slots['flood-status'].textContent,/unavailable or stale/)
console.log('PASS regional flood country/time gates, UTC periods, green reports, deduplication, bounded pagination, outage handling, source freshness and UI action labels')
