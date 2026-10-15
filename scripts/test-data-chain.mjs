import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { SOURCES, DATA_CHAIN, EXPORT_INFO } from '../server/sources-catalog.js'
const ids = new Set(SOURCES.map(s=>s.id))
assert.equal(ids.size,SOURCES.length)
for (const p of DATA_CHAIN.products) for(const input of p.inputs) assert.ok(ids.has(input), `${p.id}: missing lineage source ${input}`)
assert.deepEqual(DATA_CHAIN.stages.map(s=>s.id), ['source','checked','cooked','action'])
assert.match(EXPORT_INFO.method_en,/not original vendor payloads/)
assert.ok(SOURCES.find(s=>s.id==='waqi').stored === false)
// Exercise actual rendering in both languages; this catches reference portals
// being misrepresented as live layers and a missing data-chain renderer.
for (const lang of ['en','th']) {
 const host={replaceChildren(){this.children=[]},append(...children){this.children.push(...children)}}
 const el=(tag,attrs,...children)=>({tag,attrs,children,removeAttribute(key){delete this.attrs[key]}})
 const code=readFileSync('public/js/panels/sources.js','utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
 const ctx=vm.createContext({el,store:{lang},tr:(th,en)=>lang==='th'?th:en,document:{getElementById:id=>id==='sources'?host:null},SOURCES,DATA_CHAIN})
 vm.runInContext(code+"\ncatalog={pipelines:SOURCES.filter(s=>s.kind==='pipeline'),remote:SOURCES.filter(s=>s.kind!=='pipeline'),data_chain:DATA_CHAIN};paint()",ctx)
 const flatten=node=>typeof node==='string'?node:node?.children?.map(flatten).join(' ')??''
 const text=host.children.map(flatten).join(' ')
 assert.match(text, lang==='en'?/Raw data → evidence → preparation/:/จากข้อมูลดิบ → หลักฐาน → การเตรียมตัว/)
 const openaq=host.children.find(c=>flatten(c).includes('OpenAQ open air-quality API')||flatten(c).includes('OpenAQ — API'))
 assert.ok(openaq)
 assert.match(flatten(openaq),lang==='en'?/reference; not ingested/:/อ้างอิง ยังไม่ดึงเข้า/)
 assert.doesNotMatch(flatten(openaq),/map overlay only/)
}
console.log('PASS lineage inputs resolve, stage order is explicit, raw storage is honest, reference cards and evidence chain render in Thai and English')
