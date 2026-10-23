import { allProvinces } from './provinces.js'
import { CAMS_HOURLY_KEY } from './sources/openmeteo-aq.js'
// Expose already-ingested hourly model values; never fetch upstream here.
export function pollutionOutlook(db,bias,now=Date.now()){
 const empty={available:false,reason:'Hourly CAMS unavailable or older than 13 hours',frames:[],points:[]}
 try{
  const h=JSON.parse(db.kvGet(CAMS_HOURLY_KEY)??'null'),age=now-Date.parse(h?.issued_at)
  if(!Number.isFinite(age)||age< -300000||age>13*3600000)return empty
  const start=Date.parse(`${h.start_local}+07:00`)
  if(!Number.isFinite(start))return empty
  const points=allProvinces().filter(p=>Array.isArray(h.byCode?.[p.province_code])).map(p=>({code:p.province_code,name:p.province_en,lat:p.lat,lng:p.lng,values:h.byCode[p.province_code].map(v=>Number.isFinite(v)&&v>=0?(bias?bias.adjust(p.province_code,v):v):null)}))
  const frames=Array.from({length:Math.min(72,Math.max(0,...points.map(p=>p.values.length)))},(_,i)=>({index:i,time:new Date(start+i*3600000).toISOString()})).filter(f=>Date.parse(f.time)>=now-3600000&&Date.parse(f.time)<=now+48*3600000)
  return frames.length&&points.length?{available:true,issued_at:h.issued_at,frames,points,calibration:bias?'station-adjusted':'raw-model',source:bias?'CAMS via Open-Meteo, station bias-adjusted':'CAMS via Open-Meteo, unadjusted model',method:'Hourly province-centroid model output. Display interpolation is not a native model grid, source attribution, smoke arrival prediction or validated local AQI.'}:empty
 }catch{return empty}
}
