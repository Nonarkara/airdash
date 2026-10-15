// Observation timestamps, not ingest success, determine available PM coverage.
// Reads the small latest table only; never scans the multi-million-row history.
export function summarizePmCoverage(rows,now=Date.now()) {
 const sources={}
 for(const r of rows){
  const s=sources[r.source]??={total:0,current:0,stale:0,invalid:0,newest_at:null}
  s.total++
  const raw=r.obs_time??'',iso=/(?:Z|[+-]\d\d:\d\d)$/i.test(raw)?raw:raw.replace(' ','T')+'+07:00'
  const at=Date.parse(iso),age=now-at
  if(!Number.isFinite(r.value)||r.value<0||!Number.isFinite(at)||age< -300000){s.invalid++;continue}
  if(age<=90*60000)s.current++;else s.stale++
  if(!s.newest_at||at>Date.parse(s.newest_at))s.newest_at=new Date(at).toISOString()
 }
 return {metric:'pm25',fresh_window_minutes:90,checked_at:new Date(now).toISOString(),sources}
}
export function pmObservationCoverage(db,now=Date.now()) {
 return summarizePmCoverage(db.all("SELECT source,value,obs_time FROM latest WHERE metric='pm25'"),now)
}
