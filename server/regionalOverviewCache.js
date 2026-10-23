// Public, unfiltered overview only. Retain generated_at; retrieval is not freshness.
export const REGION_CACHE_KEY='regional_overview_v1'
export function createRegionalOverviewReader(db,build,clock=Date.now){
 let pending=null
 return async()=>{
  try{const cached=JSON.parse(db.kvGet(REGION_CACHE_KEY)??'null'),age=clock()-Date.parse(cached?.generated_at)
   if(Number.isFinite(age)&&age>=0&&age<5*60000&&cached?.regional_wind&&cached?.fires&&Array.isArray(cached?.observations))return cached
  }catch{}
  if(pending)return pending
  pending=(async()=>{const payload=await build();db.kvSet(REGION_CACHE_KEY,JSON.stringify(payload));return payload})().finally(()=>{pending=null})
  return pending
 }
}
