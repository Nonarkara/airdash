// Regional reported flood episodes, not flood extent or a street-level forecast.
export const FLOOD_KEY = 'regional_gdacs_flood_v1'
const SEA = new Set(['THA','MMR','IDN','MYS','SGP','VNM','KHM','LAO','PHL','BRN','TLS'])
export const FLOOD_AGE_MS = 6 * 3600000
export const utc = value => typeof value === 'string' && value.trim()
  ? (/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : value + 'Z') : null
export function floodEvents(payload, now = Date.now()) {
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features)) throw Error('Invalid GDACS FeatureCollection')
  const events = new Map()
  let rejected = 0
  for (const feature of payload.features) {
    const p = feature?.properties
    if (p?.eventtype !== 'FL') continue
    const countries = [...new Set([p.iso3, ...(p.affectedcountries ?? []).map(c => c.iso3)].filter(c => SEA.has(c)))]
    if (!countries.length) continue
    const [lng,lat] = feature.geometry?.type === 'Point' ? feature.geometry.coordinates ?? [] : []
    const start = utc(p.fromdate), end = utc(p.todate), updated = utc(p.datemodified)
    if (!/^\d+$/.test(String(p.eventid)) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180
      || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end)<Date.parse(start)
      || Date.parse(start)>now+300000 || (updated && (!Number.isFinite(Date.parse(updated)) || Date.parse(updated)>now+300000))) { rejected++; continue }
    if (Date.parse(end)<now-14*86400000) continue
    const event = {id:String(p.eventid),lat,lng,countries,name:String(p.name ?? p.description ?? 'Flood report').slice(0,240),
      alert:['Green','Orange','Red'].includes(p.alertlevel)?p.alertlevel:'Unknown',
      period_start:start,period_end:end,updated_at:updated,
      provider_current:p.iscurrent===true||p.iscurrent==='true',
      url:`https://www.gdacs.org/report.aspx?eventid=${p.eventid}&eventtype=FL`}
    const prior = events.get(event.id)
    if (!prior || Date.parse(event.updated_at ?? event.period_end)>Date.parse(prior.updated_at ?? prior.period_end)) events.set(event.id,event)
  }
  return {events:[...events.values()].sort((a,b)=>b.period_end.localeCompare(a.period_end)),rejected}
}
export function readFloodReports(db, now=Date.now()) {
  let cached = null
  try { cached=JSON.parse(db.kvGet(FLOOD_KEY)??'null') } catch {}
  const age=now-Date.parse(cached?.fetched_at)
  const available=Number.isFinite(age)&&age>=-300000&&age<=FLOOD_AGE_MS&&Array.isArray(cached?.events)
  return {available,checked_at:cached?.fetched_at??null,window_days:14,pagination_complete:available?(cached.pagination_complete??cached.complete??false):false,
    rejected:cached?.rejected??null,events:available?cached.events.filter(e=>Date.parse(e.period_end)>=now-14*86400000):[],
    source:'Global Disaster Awareness and Coordination System, GDACS',url:'https://www.gdacs.org/',
    method:'Reported flood episodes. Locations are event centroids, not inundation boundaries. Native GDACS alert levels describe potential humanitarian impact, not local water depth. No report is not an all-clear.'}
}
export default {
  name:'gdacs_flood',label_th:'รายงานน้ำท่วมภูมิภาค GDACS',label_en:'GDACS regional flood reports',intervalMs:30*60000,enabled:true,
  async run({db}) {
    const now=Date.now(),features=[]
    let complete=false
    for(let page=1;page<=5;page++) {
      const url=new URL('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH')
      // Omission of alertlevel silently excluded Green reports in live checks.
      for(const [key,value] of Object.entries({eventlist:'FL',fromdate:new Date(now-14*86400000).toISOString().slice(0,10),todate:new Date(now+86400000).toISOString().slice(0,10),alertlevel:'red;orange;green',pagesize:'100',pagenumber:String(page)}))url.searchParams.set(key,value)
      const res=await fetch(url,{signal:AbortSignal.timeout(20000)})
      if(!res.ok)throw Error(`GDACS HTTP ${res.status}`)
      const body=await res.json()
      if(body?.type!=='FeatureCollection'||!Array.isArray(body.features))throw Error('Invalid GDACS FeatureCollection')
      features.push(...body.features)
      if(body.features.length<100){complete=true;break}
    }
    const parsed=floodEvents({type:'FeatureCollection',features},now)
    db.kvSet(FLOOD_KEY,JSON.stringify({...parsed,pagination_complete:complete,fetched_at:new Date(now).toISOString()}))
    return {seen:features.length,added:parsed.events.length}
  },
}
