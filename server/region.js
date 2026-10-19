// Regional overview: direct official concentrations remain separate from
// national indices and satellite context. No invented country-wide averages.
export const COUNTRIES = [
  ['TH','Thailand','ไทย',15.4,101,'PCD / Air4Thai','https://air4thai.pcd.go.th/','connected','Source-reported station PM2.5; averaging window not supplied in our normalized rows.'],
  ['SG','Singapore','สิงคโปร์',1.35,103.82,'NEA / data.gov.sg','https://data.gov.sg/datasets?query=pm2.5','connected','Five regional one-hour PM2.5 readings, not five individual monitor locations.'],
  ['ID','Indonesia','อินโดนีเซีย',-2.5,118,'Ministry of Environment / PPMU','https://ppmu.kemenlh.go.id/portal/','reference','Official ISPU portal; automated access not verified. ISPU is not a concentration.'],
  ['MY','Malaysia','มาเลเซีย',4.2,108,'Department of Environment / APIMS','https://apims.doe.gov.my/','reference','Official API index portal; numeric ingestion not connected. API here means Air Pollutant Index.'],
  ['VN','Vietnam','เวียดนาม',16,107.5,'Centre for Environmental Monitoring / VN Air','https://cem.gov.vn/','reference','Official monitoring portal; machine-readable national feed not verified.'],
  ['PH','Philippines','ฟิลิปปินส์',12,123,'DENR / EMB NCR','https://ncr.emb.gov.ph/realtimeairmonitoring/','reference','Official regional live monitoring exists; no unified national feed connected.'],
  ['KH','Cambodia','กัมพูชา',12.6,105,'Ministry of Environment / NCSD','https://ncsd.moe.gov.kh/dcc/data-portal','reference','Monitoring platform reference; current numerical feed and reuse terms not verified.'],
  ['LA','Laos','ลาว',18,103,'MONRE / NRERI air monitoring','https://aqm-monre.gov.la/monre/Home?lang=en','reference','Official table includes 24-hour PM and mixed-age records. Not connected; check each observation time.'],
  ['MM','Myanmar','เมียนมา',20,96,'MONREC','https://www.monrec.gov.mm/','reference','Agency reference; no current official machine-readable concentration feed verified.'],
  ['BN','Brunei Darussalam','บรูไน',4.8,114.7,'JASTRe','https://www.env.gov.bn/','reference','Official PSI updates are published as imagery; no concentration feed connected.'],
  ['TL','Timor-Leste','ติมอร์-เลสเต',-8.8,126,'DNMG','https://www.dnmg.gov.tl/en/','reference','Official weather and air-quality advisories; no numerical PM feed connected.'],
].map(([code,name_en,name_th,lat,lng,agency,url,integration,note_en])=>({code,name_en,name_th,lat,lng,agency,url,integration,note_en}))

export const REGIONAL_RESOURCES = [
  {name:'GDACS flood episodes',url:'https://www.gdacs.org/',role:'Connected: 14-day reported flood episodes, refreshed every 30 minutes. Centroids are not flood footprints. Alert colour describes humanitarian impact, not street-level danger.'},
  {name:'FloodDash Thailand',url:'https://flood.nonarkara.org/',role:'Thailand river, rainfall and flood assessments. Separate operational system; regional GDACS reports do not replace its gauges or local warnings.'},
  {name:'Mekong River Commission',url:'https://www.mrcmekong.org/',role:'Reference: Lower Mekong river monitoring and forecasting. Not an automated feed in this regional view.'},
  {name:'AHA Centre / ADINet',url:'https://adinet.ahacentre.org/',role:'Reference: ASEAN disaster reports. Reporting delays and uneven coverage; not a live inundation layer.'},
  {name:'ASMC haze, fires, wind and rain',url:'https://asmc.asean.org/asmc-gis-portal/',role:'Official regional context portal; linked, not scraped. Hotspots can be missed under cloud. Maps carry use restrictions.'},
  {name:'ASEAN transboundary haze coordination',url:'https://asean.org/speechandstatement/information-on-fire-and-haze/',role:'Policy and coordination reference, not an operational PM feed.'},
  {name:'OpenAQ v3',url:'https://docs.openaq.org/',role:'Candidate multi-country station access; key required, coverage and original provider identities must be checked. Not connected here.'},
  {name:'WHO annual city concentrations',url:'https://www.who.int/data/gho/data/themes/air-pollution/who-air-quality-database',role:'Historical city annual means, not live data. WHO cautions against country comparisons and city rankings.'},
  {name:'Copernicus CAMS',url:'https://atmosphere.copernicus.eu/global-forecast-plots',role:'Regional model context; this page does not run regional dispersion or trajectory forecasts.'},
  {name:'NASA FIRMS',url:'https://firms.modaps.eosdis.nasa.gov/',role:'AirDash detection archive covers 11°S–29°N, 92–142°E, including Myanmar and Indonesia; repeated satellite detections are not unique fires or burned area.'},
  {name:'ADB regional air-quality assessment',url:'https://www.adb.org/sites/default/files/publication/1136306/air-quality-southeast-asia.pdf',role:'Monitoring and metadata assessment; not a live feed.'},
  {name:'AirGradient public networks',url:'https://www.airgradient.com/',role:'Supplementary low-cost sensors need explicit calibration, indoor/outdoor and license labels. Not connected here.'},
  {name:'WAQI / AQICN',url:'https://aqicn.org/api/',role:'Reference only: national/index systems differ; API terms prohibit cached or archived redistribution. No mirrored values ingested.'},
]
export function observationStatus(time, now=Date.now()) {
  const at=Date.parse(time)
  return !Number.isFinite(at)||at>now+300000?'invalid':now-at>90*60000?'stale':'current'
}
export function singaporeRows(payload,now=Date.now()) {
  if(payload?.code!==0 || !Array.isArray(payload.data?.items) || !Array.isArray(payload.data?.regionMetadata)) throw new Error('Invalid NEA payload')
  const item=[...payload.data.items].filter(i=>Number.isFinite(Date.parse(i.timestamp))).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp))[0]
  if(!item) throw new Error('NEA observation time unavailable')
  return payload.data.regionMetadata.flatMap(region=>{
    const value=item.readings?.pm25_one_hourly?.[region.name]
    const {latitude:lat,longitude:lng}=region.labelLocation??{}
    if(!Number.isFinite(value)||value<0||value>1500||!Number.isFinite(lat)||!Number.isFinite(lng)||lat<0.9||lat>1.6||lng<103.5||lng>104.2) return []
    const status=observationStatus(item.timestamp,now)
    if(status==='invalid') return []
    return [{id:`SG:${region.name}`,country:'SG',name:region.name,lat,lng,pm25:value,unit:'µg/m³',observed_at:item.timestamp,updated_at:item.updatedTimestamp??null,averaging_period:'1 hour',source:'NEA / data.gov.sg',source_type:'government regional reading',status}]
  })
}
// One shared demand-driven request per 15 minutes; failures park for five
// minutes and do not reuse old values as fresh. No polling job or new schedule.
export function createSingaporeReader(fetcher=fetch,clock=Date.now) {
  let cached=null,until=0,pending=null
  return async()=>{
    if(cached&&clock()<until)return cached
    if(pending)return pending
    pending=(async()=>{
      const fetched_at=new Date(clock()).toISOString()
      try {
        const res=await fetcher('https://api-open.data.gov.sg/v2/real-time/api/pm25',{signal:AbortSignal.timeout(10000)})
        if(!res.ok)throw new Error(`NEA HTTP ${res.status}`)
        const readings=singaporeRows(await res.json(),clock())
        if(!readings.length)throw new Error('No usable NEA readings')
        cached={available:true,fetched_at,readings,error:null}
        until=clock()+15*60000
      }catch{cached={available:false,fetched_at,readings:[],error:'Official Singapore feed unavailable; retry after cooldown'};until=clock()+5*60000}
      return cached
    })().finally(()=>{pending=null})
    return pending
  }
}
export const readSingapore=createSingaporeReader()
export function thailandRows(rows,now=Date.now()) {
  return rows.flatMap(r=>{
    const time=/[zZ]|[+-]\d\d:\d\d$/.test(r.obs_time??'')?r.obs_time:`${r.obs_time?.replace(' ','T')}+07:00`
    const status=observationStatus(time,now)
    if(status==='invalid'||!Number.isFinite(r.pm25)||r.pm25<0||r.pm25>1500||!Number.isFinite(r.lat)||!Number.isFinite(r.lng))return []
    return [{id:`TH:${r.station_key}`,country:'TH',name:r.name_en??r.name_th??r.station_key,lat:r.lat,lng:r.lng,pm25:r.pm25,unit:'µg/m³',observed_at:time,averaging_period:'source-reported; not retained',source:'PCD / Air4Thai',source_type:'government station',status}]
  })
}
