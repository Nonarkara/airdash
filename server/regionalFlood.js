import { readFloodReports } from './sources/gdacs-flood.js'
import { readTwinFlood } from './sources/twin-flood.js'
// Reuse the existing relay; never make another request to FloodDash here.
export function regionalFlood(db, now=Date.now()) {
  const relay=readTwinFlood(db,now)
  const age=value=>now-Date.parse(value)
  const fresh=value=>Number.isFinite(age(value))&&age(value)>=-300000&&age(value)<=3600000
  const available=!!relay&&fresh(relay.fetched_at)&&fresh(relay.updated)
  return {...readFloodReports(db,now),thailand:{available,updated_at:relay?.updated??null,
    warnings:available?(relay.provinces??[]).filter(p=>['prepare','protect','evacuate'].includes(p.level)).map(p=>({code:p.code,name_th:p.th,name_en:p.en,level:p.level,head_th:p.head_th,head_en:p.head_en})):[],
    url:'https://flood.nonarkara.org/'}}
}
