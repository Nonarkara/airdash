// Behavioral gates for missing data, current hazards, and inference failures.
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {createScience} from '../server/science.js'
import {CONFIG} from '../server/config.js'
import {createDanger} from '../server/danger.js'
import {createHarm} from '../server/harm.js'
import {createRag} from '../server/rag.js'
import {buildRoutes} from '../server/api.js'
import {sendFile} from '../server/http.js'
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Writable} from 'node:stream'
let passed=0
const test=async(name,fn)=>{await fn();console.log('PASS',name);passed++}
const row=(metric,value)=>({metric,value,province_code:'10',province_th:'กรุงเทพมหานคร',province_en:'Bangkok'})
function danger(pm,rain=0,forecast=0,cams){return createDanger({all(sql,source,...args){if(!sql.includes('MAX(l.value)'))return [];if(source==='air4thai')return pm==null?[]:[row('pm25',pm)];if(source==='thaiwater_rain')return [row('rain_24h',rain)];if(source==='openmeteo')return args.includes('temp_c')?[row('temp_c',25),row('rh_pct',50)]:[row('precip_fc_d0',forecast),row('precip_prob_24h',100)];return []}},{riskEngine:{get:()=>({provinces:cams===undefined?[]:[{province_code:'10',pm25_fc_24h:cams}]})}}).get()[0]}
await test('weather without PM never labels danger as safe',()=>{const d=danger(null,30);assert.equal(d.score,null);assert.equal(d.pm_base,null);assert.equal(d.band,'unknown');assert.equal(d.trend_24h,null)})
await test('yesterday’s rain cannot reduce current measured PM danger',()=>{const d=danger(100,100);assert.equal(d.score,90);assert.equal(d.measured_pm_floor,90)})
await test('tomorrow’s rain cannot reduce current measured PM danger',()=>assert.equal(danger(100,0,100).score,90))
await test('a real zero PM observation remains distinguishable from missing',()=>assert.equal(danger(0,0).score,0))
await test('a real zero CAMS forecast remains a valid forecast',()=>assert.equal(danger(100,0,0,0).score_forecast,0))
await test('missing CAMS yields unknown forecast/trend, not fabricated persistence',()=>{const d=danger(50);assert.equal(d.score_forecast,null);assert.equal(d.trend_24h,null)})
await test('a computed watch score without any current PM cannot become live harm',()=>{const h=createHarm({riskEngine:{get:()=>({updated:'x',provinces:[{province_code:'10',score:10,pm25:null}]})}}).forProvince('10');assert.equal(h.score,null);assert.equal(h.watch_live,false)})
await test('fractional limits become bounded integers before SQLite LIMIT',async()=>{let got;const routes=buildRoutes({db:{all(sql,...args){got=args.at(-1);return []}}});const res={req:{headers:{}},writeHead(code){this.code=code},end(){}};await routes['GET /api/alerts']({},res,new URL('https://test/api/alerts?limit=1.5'));assert.equal(res.code,200);assert.equal(got,1)})
await test('personal lookup preserves a missing province reading instead of substituting national PM',()=>{const science=createScience({CONFIG,db:{all(sql,source){return source==='air4thai'?[row('pm25',30)]:[]}}});assert.equal(science.personal({province:'10'}).resolved.pm25,30);const missing=science.personal({province:'50'});assert.equal(missing.resolved.pm25,null);assert.equal(missing.dose_ug,null);assert.equal(missing.resolved.source,'province-unavailable');assert.equal(science.personal({}).resolved.pm25,30);assert.equal(missing.play_budget_is_safety_limit,false)})
await test('story fallback uses one hour, retains missing local PM and never substitutes a sample value',()=>{const context=vm.createContext({localStorage:{getItem:()=>null},store:{lang:'en'},on(){},window:{matchMedia:()=>({matches:false})},document:{querySelector:()=>null}});const src=readFileSync('public/js/story.js','utf8').replace(/^import .*$/gm,'').replace(/boot\(\)\s*$/,'');vm.runInContext(src+"\nscience={national:{pm25:44},provinces:[{code:'50',pm25:null}],profiles:{kid:{ventilation:{moderate:1}}}};this.getFallback=fallbackPersonal;this.setProvince=(p)=>province=p",context);const oneHour=context.getFallback();assert.equal(oneHour.dose_ug,44);assert.ok(Math.abs(oneHour.cigs_equiv-44/22/24)<.00001);context.setProvince('50');const missing=context.getFallback();assert.equal(missing.dose_ug,null);assert.equal(missing.cigs_equiv,null);assert.equal(missing.play_budget_min,null)})
await test('story science outage has no invented observations or safe-looking band',()=>{
 const context=vm.createContext({localStorage:{getItem:()=>null},store:{lang:'en'},on(){},window:{matchMedia:()=>({matches:false})},document:{querySelector:()=>null}})
 const src=readFileSync('public/js/story.js','utf8').replace(/^import .*$/gm,'').replace(/boot\(\)\s*$/,'')
 const i18n=readFileSync('public/js/i18n.js','utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'')
 vm.runInContext(i18n+'\n'+src+"\nscience=FALLBACK_SCIENCE;this.offlineScience=science;this.getLevel=currentLevel;this.getLabel=()=>bandLabel(currentLevel());this.getFallback=fallbackPersonal;this.getPm=currentPm25;this.setProvince=p=>province=p",context)
 for(const key of ['pm25','population','cigs_per_day','life_minutes_per_day','excess_mortality_pct','aqli_years_lost','attributable_deaths_per_day','daily_cost_million_thb','haze_tax_thb_per_person','visibility_km']) assert.equal(context.offlineScience.national[key],null,key)
 assert.equal(context.offlineScience.provinces.length,0)
 assert.equal(context.getLevel(),null)
 assert.match(context.getLabel(),/No current PM reading/)
 assert.equal(context.getFallback().dose_ug,null)
 vm.runInContext('science={national:{pm25:44},provinces:[]}',context)
 context.setProvince('50')
 assert.equal(context.getPm(),null)
 assert.equal(context.getFallback().dose_ug,null)
})

const risk={updated:'test',national:{band:'unknown',data_available:false,bandCounts:{},dustSampledCount:0},provinces:[]}
const db={kvGet:key=>key==='nim_api_key'?'test-only-key':null,all:()=>[]}
const makeRag=()=>createRag({db,riskEngine:{get:()=>risk}})
const realFetch=globalThis.fetch
try{
 await test('catalog HTTP 200 does not conceal retired chat and embedding endpoints',async()=>{globalThis.fetch=async url=>String(url).endsWith('/models')?Response.json({data:[]}):new Response('retired',{status:410});const r=makeRag(),s=await r.probe(true);assert.equal(s.reachable,false);assert.equal(s.hasChat,false);assert.equal(s.hasEmbed,false)})
 await test('chat and embedding health are checked independently',async()=>{globalThis.fetch=async url=>String(url).endsWith('/models')?Response.json({data:[]}):String(url).endsWith('/embeddings')?Response.json({data:[{index:0,embedding:[1,2]}]}):new Response('retired',{status:410});const s=await makeRag().probe(true);assert.equal(s.hasEmbed,true);assert.equal(s.hasChat,false)})
 await test('embedding batches retain input order even when provider reorders rows',async()=>{globalThis.fetch=async()=>Response.json({data:[{index:1,embedding:[3,4]},{index:0,embedding:[1,2]}]});assert.deepEqual(await makeRag().embed(['a','b']),[[1,2],[3,4]])})
 await test('missing/malformed embedding rows are rejected',async()=>{globalThis.fetch=async()=>Response.json({data:[{index:0,embedding:[1,null]}]});await assert.rejects(makeRag().embed(['a']),/invalid vector batch/)})
 await test('a transport failure during chat returns the factual fallback',async()=>{globalThis.fetch=async url=>String(url).endsWith('/models')?Response.json({data:[]}):String(url).endsWith('/embeddings')?Response.json({data:[{index:0,embedding:[1,2]}]}):Response.json({choices:[]});const r=makeRag();await r.probe(true);globalThis.fetch=async()=>{throw new Error('test connection failure')};const res={writeHead(code){this.code=code},end(body){this.body=JSON.parse(body)}};await r.chat({req:{headers:{}},message:'Air quality',lang:'en',res});assert.equal(res.code,200);assert.equal(res.body.offline,true);assert.match(res.body.facts,/No current PM data/);assert.equal(r.status().hasChat,false)})
 await test('missing ENSO never becomes a fabricated neutral ONI reading',()=>assert.doesNotMatch(makeRag().buildFacts('air'),/ONI 0\.0/))
}finally{globalThis.fetch=realFetch}
await test('file removed between stat and open cannot crash the process',async()=>{const folder=mkdtempSync(join(tmpdir(),'airdash-file-'));try{const file=join(folder,'sample.txt');writeFileSync(file,'sample');const res=new Writable({write(c,e,cb){cb()}});res.writeHead=()=>{};const closed=new Promise(resolve=>res.on('close',resolve));assert.equal(sendFile(res,file),true);unlinkSync(file);await closed;assert.equal(sendFile(res,folder),false)}finally{rmdirSync(folder)}})
console.log(`\n${passed} passed, 0 failed`)
