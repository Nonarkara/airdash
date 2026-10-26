// Public, unfiltered overview only. Retain generated_at; retrieval is not freshness.
export const REGION_CACHE_KEY='regional_overview_v1'
const FRESH_MS=5*60000
const LAST_KNOWN_MS=20*60000
export function createRegionalOverviewReader(db,build,clock=Date.now){
 let pending=null,failedUntil=0
 function refresh(deferred=false){
  if(pending)return pending
  // Defer background CPU/SQLite work until the previous overview's HTTP
  // response can flush. An already-resolved provider promise otherwise runs
  // its heavy continuation before the route can send that previous overview.
  pending=(deferred?new Promise(resolve=>setImmediate(resolve)):Promise.resolve())
   .then(build)
   .then(payload=>{db.kvSet(REGION_CACHE_KEY,JSON.stringify(payload));failedUntil=0;return payload})
   .catch(error=>{failedUntil=clock()+60000;throw error})
   .finally(()=>{pending=null})
  return pending
 }
 return async()=>{
  let cached=null,age=Infinity
  try{
   const value=JSON.parse(db.kvGet(REGION_CACHE_KEY)??'null')
   const elapsed=clock()-Date.parse(value?.generated_at)
   if(Number.isFinite(elapsed)&&elapsed>=0&&value?.regional_wind&&value?.fires&&Array.isArray(value?.observations)){cached=value;age=elapsed}
  }catch{}
  if(cached&&age<FRESH_MS)return cached
  if(cached&&age<LAST_KNOWN_MS){
   if(clock()>=failedUntil)void refresh(true).catch(()=>{})
   return {...cached,overview_status:clock()<failedUntil?'refresh_failed':'refreshing'}
  }
  // Do not invent a last-known picture when no recent valid one exists.
  return refresh()
 }
}
