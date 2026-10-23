// Coarse hourly meteorological context. No emissions or dispersion calculation.
import { fetchJson } from '../util.js'
export const WIND_KEY='regional_wind_v1'
export const WIND_POINTS=[]
for(let lat=-8;lat<=28;lat+=6)for(let lng=94;lng<=142;lng+=6)WIND_POINTS.push({lat,lng})
const fields=['wind_speed_10m','wind_direction_10m','wind_speed_850hPa','wind_direction_850hPa','precipitation','geopotential_height_850hPa']
export function parseRegionalWind(json, fetchedAt=new Date().toISOString()){
 const rows=Array.isArray(json)?json:[json]
 if(rows.length!==WIND_POINTS.length)throw Error('Regional wind response location count mismatch')
 const points=rows.map((r,i)=>{
  const h=r?.hourly,u=r?.hourly_units
  if(!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude)||Math.abs(r.latitude-WIND_POINTS[i].lat)>2||Math.abs(r.longitude-WIND_POINTS[i].lng)>2)throw Error('Regional wind model coordinate mismatch')
  if(!h||u?.time!=='unixtime'||fields.some(f=>u[f]!== (f.startsWith('wind_speed')?'km/h':f.startsWith('wind_direction')?'°':f==='precipitation'?'mm':'m')))throw Error('Regional wind missing or unexpected units')
  if(!Array.isArray(h.time)||h.time.length<7||h.time.some((t,k)=>!Number.isFinite(t)||(k>0&&t-h.time[k-1]!==3600)))throw Error('Regional wind missing hourly slots')
  const valid=(v,max)=>Number.isFinite(v)&&v>=0&&v<=max?v:null
  return {...WIND_POINTS[i],model_lat:r.latitude,model_lng:r.longitude,hours:h.time.map((time,k)=>({time:new Date(time*1000).toISOString(),surface:[valid(h.wind_speed_10m?.[k],300),valid(h.wind_direction_10m?.[k],360)],aloft:Number.isFinite(r.elevation)&&Number.isFinite(h.geopotential_height_850hPa?.[k])&&h.geopotential_height_850hPa[k]>r.elevation+100?[valid(h.wind_speed_850hPa?.[k],500),valid(h.wind_direction_850hPa?.[k],360)]:[null,null],rain_mm:valid(h.precipitation?.[k],500)}))}
 })
 const now=Date.parse(fetchedAt),hour=Math.floor(now/3600000)*3600000
 const usable=points.filter(p=>p.hours.some(h=>Date.parse(h.time)===hour&&[h.surface,h.aloft].some(v=>v.every(Number.isFinite))))
 if(usable.length<points.length*.8)throw Error('Regional wind lacks current-hour coverage')
 return {fetched_at:fetchedAt,grid_degrees:6,provider:'Open-Meteo best-match forecast',points,method:'Hourly forecast, 6° sampling. 10 m above ground or 850 hPa (~1.5 km above sea level; may be below terrain). Not plume height, smoke dispersion, concentration or arrival forecast.'}
}
export function regionalWind(db,now=Date.now()){
 let data=null;try{data=JSON.parse(db.kvGet(WIND_KEY)??'null')}catch{}
 const age=now-Date.parse(data?.fetched_at),hour=Math.floor(now/3600000)*3600000
 const available=Number.isFinite(age)&&age>=-300000&&age<=9*3600000&&data?.points?.some(p=>p.hours?.some(h=>Date.parse(h.time)===hour))
 return {...(data??{}),available:Boolean(available),points:available?data.points:[],reason:available?null:'Regional hourly winds unavailable or stale'}
}
export default {name:'regional_wind',version:1,label_th:'ลมรายชั่วโมงระดับภูมิภาค',label_en:'Regional hourly wind forecasts',intervalMs:6*3600000,enabled:true,
 async run({db}){
  const url=new URL('https://api.open-meteo.com/v1/forecast')
  for(const [key,value] of Object.entries({latitude:WIND_POINTS.map(p=>p.lat).join(','),longitude:WIND_POINTS.map(p=>p.lng).join(','),hourly:fields.join(','),forecast_hours:24,timezone:'GMT',timeformat:'unixtime',wind_speed_unit:'kmh'}))url.searchParams.set(key,value)
  const data=parseRegionalWind(await fetchJson(url.href,{timeoutMs:60000}))
  db.kvSet(WIND_KEY,JSON.stringify(data));return {seen:data.points.length,added:data.points.length}
 }}
