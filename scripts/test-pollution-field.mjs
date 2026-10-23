import assert from 'node:assert/strict'
import { interpolatePm, concentrationColor } from '../public/js/layers/pollution-field.js'
import { forecastBias } from '../server/forecastBias.js'
import { pollutionOutlook } from '../server/pollutionOutlook.js'
const pts=[{lat:13,lng:100,pm25:10},{lat:13.1,lng:100,pm25:30},{lat:13,lng:100.1,pm25:20}]
assert.equal(interpolatePm(13,100,pts).value,10)
const mid=interpolatePm(13.04,100.04,pts);assert.ok(mid.value>10&&mid.value<30)
assert.equal(interpolatePm(20,110,pts),null)
assert.equal(interpolatePm(13,100,pts.slice(0,2)),null)
assert.equal(interpolatePm(13,100,[...pts.slice(0,2),{lat:13,lng:100.1,pm25:null}]),null)
assert.equal(concentrationColor(null),null);assert.equal(concentrationColor(-1),null)
assert.ok(concentrationColor(300).every(v=>Number.isInteger(v)&&v>=0&&v<=255))
assert.deepEqual(concentrationColor(500),concentrationColor(300))
const now=Date.parse('2026-10-15T12:00:00Z'),bias={adjust:(_,v)=>v*2}
const stored={issued_at:'2026-10-15T11:00:00Z',start_local:'2026-10-15T00:00',byCode:{'50':Array.from({length:72},(_,i)=>i===20?null:10)}}
const db={kvGet:()=>JSON.stringify(stored)}
const out=pollutionOutlook(db,bias,now)
assert.equal(out.available,true);assert.equal(out.points[0].values[19],20);assert.equal(out.points[0].values[20],null)
assert.equal(out.frames[0].index,18);assert.equal(Date.parse(out.frames[0].time),now-3600000)
assert.ok(out.frames.every(f=>Date.parse(f.time)<=now+48*3600000))
assert.equal(pollutionOutlook(db,bias,now+14*3600000).available,false)
assert.equal(pollutionOutlook({kvGet:()=>'{bad'},bias,now).available,false)
const raw=pollutionOutlook(db,null,now)
assert.equal(raw.available,true);assert.equal(raw.calibration,'raw-model');assert.equal(raw.points[0].values[19],10);assert.equal(raw.points[0].values[20],null)
assert.equal(forecastBias({all(){throw Error('Historical query must not run')}},{cachedOnly:true}),null)
console.log('PASS bounded numerical PM interpolation, unsupported gaps, concentration palette, real hourly model indexing, bias/null preservation and stale rejection')
