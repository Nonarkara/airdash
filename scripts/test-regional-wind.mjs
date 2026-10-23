import assert from 'node:assert/strict'
import { WIND_POINTS, parseRegionalWind, regionalWind } from '../server/sources/regional-wind.js'
import { windAt, airPath } from '../public/js/wind-transport.js'
const now=Date.parse('2026-10-23T07:30:00Z'),base=Math.floor(now/3600000)*3600000
const fixture=WIND_POINTS.map(p=>({...p,latitude:p.lat,longitude:p.lng,elevation:0,hourly_units:{time:'unixtime',wind_speed_10m:'km/h',wind_direction_10m:'°',wind_speed_850hPa:'km/h',wind_direction_850hPa:'°',precipitation:'mm',geopotential_height_850hPa:'m'},hourly:{time:Array.from({length:24},(_,i)=>(base+i*3600000)/1000),wind_speed_10m:Array(24).fill(36),wind_direction_10m:Array(24).fill(270),wind_speed_850hPa:Array(24).fill(72),wind_direction_850hPa:Array(24).fill(180),precipitation:Array(24).fill(0),geopotential_height_850hPa:Array(24).fill(1500)}}))
let parsed=parseRegionalWind(fixture,new Date(now).toISOString()),data={...parsed,available:true}
assert.equal(parsed.points.length,63)
let w=windAt(data,16,100,now,'surface',now);assert.ok(Math.abs(w.speed-36)<.0001);assert.equal(w.towards,90);assert.equal(w.rain,0)
let path=airPath(data,{lat:16,lng:100},now,'surface',6,now)
assert.equal(path.complete,true);assert.equal(path.points.filter(p=>p.hours>0&&Number.isInteger(p.hours)).length,6);assert.equal(path.points.at(-1).time,now+6*3600000);assert.ok(Math.abs(path.distance-216)<.001);assert.ok(path.points.at(-1).lng>102);assert.equal(path.points.at(-1).lat,16)
path=airPath(data,{lat:16,lng:100},now,'aloft',1,now);assert.ok(path.points.at(-1).lat>16.6);assert.ok(Math.abs(path.distance-72)<.001)
assert.equal(airPath(data,{lat:30,lng:100},now,'surface',6,now).points.length,0)
assert.equal(windAt(data,60,100,now,'surface',now),null)
assert.equal(windAt(data,16,100,now,'surface',now+10*3600000),null)
assert.equal(windAt({...data,fetched_at:new Date(now+3600000).toISOString()},16,100,now,'surface',now),null)
const missing=structuredClone(data);for(const p of missing.points)p.hours[1].surface=[null,null]
path=airPath(missing,{lat:16,lng:100},now,'surface',6,now);assert.equal(path.complete,false);assert.equal(path.points.at(-1).time,base+3600000);assert.ok(Math.abs(path.distance-18)<.001)
const calm=structuredClone(data);for(const p of calm.points)for(const h of p.hours)h.surface=[0,0]
assert.equal(windAt(calm,16,100,now,'surface',now).speed,0);assert.equal(airPath(calm,{lat:16,lng:100},now,'surface',6,now).distance,0)
const crossing=structuredClone(data);for(const p of crossing.points)for(const h of p.hours)h.surface=[30,p.lng<100?359:1]
w=windAt(crossing,16,100,now,'surface',now);assert.ok(w.north< -29);assert.ok(Math.abs(w.east)<1)
const wrong=structuredClone(fixture);wrong[0].hourly_units.wind_speed_10m='m/s';assert.throws(()=>parseRegionalWind(wrong,new Date(now).toISOString()),/units/)
const old=structuredClone(fixture);for(const p of old)p.hourly.time=p.hourly.time.map(t=>t-48*3600);assert.throws(()=>parseRegionalWind(old,new Date(now).toISOString()),/current-hour/)
const moved=structuredClone(fixture);moved[0].latitude+=6;assert.throws(()=>parseRegionalWind(moved,new Date(now).toISOString()),/coordinate/)
const gaps=structuredClone(fixture);gaps[0].hourly.time.splice(1,1);assert.throws(()=>parseRegionalWind(gaps,new Date(now).toISOString()),/hourly slots/)
const mountain=structuredClone(fixture);mountain[0].elevation=1800;assert.deepEqual(parseRegionalWind(mountain,new Date(now).toISOString()).points[0].hours[0].aloft,[null,null])
assert.equal(regionalWind({kvGet:()=>JSON.stringify(parsed)},now).available,true)
assert.equal(regionalWind({kvGet:()=>JSON.stringify(parsed)},now+10*3600000).available,false)
console.log('PASS regional hourly wind: units, real time slots, native axes, pressure/terrain masking, calm/missing/stale, partial-hour integration, vector wrap and bounds')
