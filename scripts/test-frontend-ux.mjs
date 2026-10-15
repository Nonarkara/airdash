import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log('PASS', name) }
const source = path => readFileSync(path, 'utf8').replace(/^import .*$/gm, '').replace(/\bexport /g, '')
function element() {
  return { style: {}, dataset: {}, children: [], attrs: {}, innerHTML: '',
    classList: { add() {}, remove() {}, contains() { return false }, toggle() {} },
    setAttribute(k,v) { this.attrs[k]=v }, removeAttribute(k) { delete this.attrs[k] },
    addEventListener() {}, replaceChildren(...children) { this.children=children; this.innerHTML='' },
    appendChild(e) { this.children.push(e) }, querySelector() { return null } }
}
const input=element(), results=element(), pending=new Map()
const ctx=vm.createContext({ console, clearTimeout, clearInterval, setTimeout, setInterval, URLSearchParams,
  bandColor:()=>'', tr:(th,en)=>en, escapeHtml:s=>String(s??''), store:{lang:'en'}, on(){}, emit(){},
  document:{createElement:element,addEventListener(){},body:element()},
  window:{matchMedia:()=>({matches:false})},
  getJson:url=>url.startsWith('/geo/')?Promise.resolve([]):new Promise((resolve,reject)=>pending.set(url,{resolve,reject})), input, results })
vm.runInContext(source('public/js/panels/search.js')+'\nsearchInput=input;searchResults=results;',ctx)
await test('dropdown fits phone viewport and leaves room for actual results',()=>{
  const r=vm.runInContext('searchBounds({left:8,bottom:122,width:290},{width:390,height:844})',ctx)
  assert.equal(r.top,126);assert.equal(r.height,420);assert.ok(r.width>=340);assert.ok(r.left+r.width<=382)
})
await test('dropdown respects keyboard and visual-viewport offsets',()=>{
  const r=vm.runInContext('searchBounds({left:8,bottom:122,width:290},{width:320,height:300,offsetTop:20})',ctx)
  assert.equal(r.height,186);assert.ok(r.left+r.width<=312)
})
await test('a slower old query cannot replace a newer result',async()=>{
  input.value='old';const old=vm.runInContext("doSearch('old')",ctx)
  input.value='new';const next=vm.runInContext("doSearch('new')",ctx)
  pending.get('/api/search?q=new&limit=20').resolve({results:[{name_en:'Newest',type:'province'}]});await next
  pending.get('/api/search?q=old&limit=20').resolve({results:[{name_en:'Older',type:'province'}]});await old
  assert.ok(results.children[0].innerHTML.includes('Newest'))
})
await test('dismissed search stays closed when an outstanding request resolves',async()=>{
  input.value='later';const p=vm.runInContext("doSearch('later')",ctx);vm.runInContext('hideResults()',ctx)
  pending.get('/api/search?q=later&limit=20').resolve({results:[{name_en:'Late'}]});await p
  assert.equal(results.style.display,'none');assert.equal(input.attrs['aria-expanded'],'false')
})
await test('search failure explains recovery rather than silently disappearing',async()=>{
  input.value='fail';const p=vm.runInContext("doSearch('fail')",ctx)
  pending.get('/api/search?q=fail&limit=20').reject(new Error('offline'));await p
  assert.ok(results.innerHTML.includes('check your connection'))
})
await test('blocked storage preserves language and area choices for this visit',()=>{
  const s=vm.createContext({localStorage:{getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}}})
  vm.runInContext(source('public/js/preferences.js'),s)
  assert.equal(vm.runInContext("readPreference('lang')",s),null)
  vm.runInContext("writePreference('lang','en');writePreference('area','50')",s)
  assert.equal(vm.runInContext("readPreference('lang')",s),'en');assert.equal(vm.runInContext("readPreference('area')",s),'50')
  vm.runInContext("removePreference('area')",s);assert.equal(vm.runInContext("readPreference('area')",s),null)
})
await test('available storage persists choices normally',()=>{
  const values=new Map([['lang','th']]);const s=vm.createContext({localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}})
  vm.runInContext(source('public/js/preferences.js'),s);assert.equal(vm.runInContext("readPreference('lang')",s),'th')
  vm.runInContext("writePreference('lang','en')",s);assert.equal(values.get('lang'),'en')
})
await test('hidden map changes view without an invalid flight animation',()=>{
  const calls=[];const s=vm.createContext({window:{matchMedia:()=>({matches:false})}, map:{getSize:()=>({x:0,y:0}),stop:()=>calls.push('stop'),setView:()=>calls.push('set'),flyTo:()=>calls.push('fly')}})
  vm.runInContext(source('public/js/mapView.js')+'\nmoveMap(map,[13.7,100.5],11,{duration:.8})',s)
  assert.deepEqual(calls,['stop','set'])
})
await test('visible map animates valid coordinates and rejects missing ones',()=>{
  const calls=[];const s=vm.createContext({window:{matchMedia:()=>({matches:false})},map:{getSize:()=>({x:500,y:600}),stop(){},setView:()=>calls.push('set'),flyTo:()=>calls.push('fly')}})
  vm.runInContext(source('public/js/mapView.js')+'\nmoveMap(map,[13.7,100.5],11,{duration:.8});moveMap(map,[undefined,undefined],11)',s)
  assert.deepEqual(calls,['fly'])
})
await test('reduced-motion preference disables map flights',()=>{
  const calls=[];const s=vm.createContext({window:{matchMedia:()=>({matches:true})},map:{getSize:()=>({x:500,y:600}),stop(){},setView:()=>calls.push('set'),flyTo:()=>calls.push('fly')}})
  vm.runInContext(source('public/js/mapView.js')+'\nmoveMap(map,[13.7,100.5],11,{duration:.8})',s);assert.deepEqual(calls,['set'])
})
await test('dialog cycles focus and restores opener and page scrolling',()=>{
  const opener={isConnected:true,focus(){doc.activeElement=this}}, first={tabIndex:0,getClientRects:()=>[1],focus(){doc.activeElement=this}},last={tabIndex:0,getClientRects:()=>[1],focus(){doc.activeElement=this}}
  let handler;const doc={activeElement:opener,body:{style:{overflow:'auto'}}}
  const dialog={querySelectorAll:()=>[first,last],contains:e=>e===first||e===last,addEventListener:(t,f)=>handler=f,removeEventListener:()=>{handler=null}}
  const s=vm.createContext({document:doc,dialog});vm.runInContext(source('public/js/dialogFocus.js')+'\nvar release=containDialog(dialog)',s)
  let prevented=false;doc.activeElement=last;handler({key:'Tab',preventDefault(){prevented=true}});assert.equal(doc.activeElement,first);assert.ok(prevented)
  handler({key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(doc.activeElement,last)
  vm.runInContext('release()',s);assert.equal(doc.activeElement,opener);assert.equal(doc.body.style.overflow,'auto');assert.equal(handler,null)
})
await test('a corrupt saved story profile falls back to a valid profile',()=>{
  const s=vm.createContext({readPreference:k=>k==='ad_story_persona'?'broken-profile':null,store:{lang:'en'},on(){},window:{matchMedia:()=>({matches:false})},document:{querySelector:()=>null}})
  vm.runInContext(source('public/js/story.js').replace(/boot\(\)\s*$/,'')+'\nthis.profile=persona',s)
  assert.equal(s.profile,'kid')
})
await test('closing the Window during a failed request cannot update a removed dialog',async()=>{
  let reject;const panel={innerHTML:'',focus(){}}
  const dialog={...element(),querySelector:()=>panel,remove(){this.removed=true}}
  const s=vm.createContext({AbortSignal,tr:(th,en)=>en,containDialog:()=>()=>{},stopVideos(){},
    document:{createElement:()=>dialog,body:{appendChild(){}},addEventListener(){},removeEventListener(){}},
    fetch:()=>new Promise((a,b)=>{reject=b})})
  vm.runInContext(source('public/js/witness.js'),s)
  const p=vm.runInContext('openWindow()',s);vm.runInContext('closeWindow()',s);reject(Error('offline'));await p
  assert.equal(panel.innerHTML,'');assert.equal(dialog.removed,true)
})
// ── The hero verdict (story.js) ────────────────────────────────────────────
// It answers "can I go outside?" above the fold, using the server's own
// guidance sentence. Three properties are worth pinning, because each one
// silently turns into a lie if it regresses:
//   1. no reading → no advice (the page's standing rule);
//   2. the headline IS the server sentence, so chapter 1 cannot disagree;
//   3. a persona-specific sentence survives (asthma gets its own escalation).
{
  const science = {
    generated_at: new Date(Date.now() - 3 * 60000).toISOString(),
    national: { pm25: 20 },
    provinces: [], profiles: {},
  }
  const guide = [
    { maxPm25: 15, th: 'ดีมาก', en: 'Very good air' },
    { maxPm25: 25, th: 'ปานกลาง', en: 'Outside is fine' },
    { maxPm25: null, th: 'อันตราย', en: 'Hazardous' },
  ]
  science.profiles = { kid: { label_en: 'Child', guidance: guide },
                      asthma: { label_en: 'Asthma', guidance: guide } }

  const mk = () => {
    const box = element()
    // Count real writes so "was this live region mutated?" is answerable —
    // an unchanged innerHTML string cannot tell a guarded no-op from an
    // unguarded reassignment.
    let html = ''
    box.writes = 0
    Object.defineProperty(box, 'innerHTML', {
      get: () => html,
      set: (v) => { html = String(v); box.writes++ },
    })
    const s = vm.createContext({
      console, tr: (th, en) => en, escapeHtml: (x) => String(x ?? ''),
      store: { lang: 'en' },
      document: { createElement: element, addEventListener() {}, documentElement: { style: { setProperty() {} } } },
      window: { matchMedia: () => ({ matches: false }) },
      getJson: () => Promise.resolve(null), Math, Date, Number, Array, Object,
      readPreference: () => null, writePreference() {}, removePreference() {},
      setLang() {}, emit() {}, on() {},
      pm25Level: (v) => (v <= 15 ? 1 : v <= 25 ? 2 : v <= 37.5 ? 3 : v <= 75 ? 4 : 5),
      LEVEL_NAME: { 1: { th: 'ดี', en: 'Good' }, 5: { th: 'อันตราย', en: 'Hazardous' } },
      fmtNum: (v) => String(v), bandColor: () => '',
      navigator: {}, paintChrome() {}, initDataFreshness() {},
      setInterval: () => 0, setTimeout: () => 0, clearInterval() {}, clearTimeout() {},
      performance: { now: () => 0 }, requestAnimationFrame() {},
      document_element: null,
    })
    s.document.getElementById = (id) => (id === 'verdict' ? box : null)
    s.document.querySelector = (sel) => (sel === '#verdict' ? box : null)
    vm.runInContext(source('public/js/story.js'), s)
    // `science` and `persona` are module-scoped lets, so they can only be set
    // from inside the context once the module body has run.
    s.__SCIENCE__ = science
    vm.runInContext('science = __SCIENCE__; persona = "kid"; province = null; offline = false', s)
    return { s, box }
  }

  await test('verdict stays silent about advice when there is no reading', () => {
    const { s, box } = mk()
    vm.runInContext('renderVerdict(null)', s)
    assert.equal(box.dataset.state, 'unknown')
    // No guidance sentence may leak into the unknown state.
    assert.ok(!box.innerHTML.includes('Outside is fine') && !box.innerHTML.includes('Very good air'))
  })

  await test('verdict headline is the server guidance sentence, not a local one', () => {
    const { s, box } = mk()
    vm.runInContext('renderVerdict(20)', s)
    assert.equal(box.dataset.state, 'live')
    assert.ok(box.innerHTML.includes('Outside is fine'), 'uses the server step verbatim')
  })

  await test('verdict keeps the persona escalation and names who it is for', () => {
    const { s, box } = mk()
    vm.runInContext('persona="asthma";renderVerdict(120)', s)
    assert.ok(box.innerHTML.includes('Hazardous'), 'falls through to the open-ended step')
    assert.ok(box.innerHTML.includes('Asthma'), 'names the persona it is answering for')
  })

  await test('verdict shows when the reading was taken', () => {
    const { s, box } = mk()
    vm.runInContext('renderVerdict(20)', s)
    assert.ok(box.innerHTML.includes('as of'), 'a number carries its clock')
  })

  // refresh() re-renders every 60 s. Assigning identical HTML into an
  // aria-live region is still a mutation, so a screen reader would otherwise
  // be re-announced the verdict every minute through hours of unchanged air.
  await test('an unchanged verdict is not rewritten into its live region', () => {
    const { s, box } = mk()
    vm.runInContext('renderVerdict(20)', s)
    const after = box.writes
    vm.runInContext('renderVerdict(20); renderVerdict(20)', s)
    assert.equal(box.writes, after, 'two identical renders wrote nothing')
  })

  await test('a changed verdict IS rewritten, so the guard never silences a real change', () => {
    const { s, box } = mk()
    vm.runInContext('renderVerdict(20)', s)
    const after = box.writes
    vm.runInContext('renderVerdict(60)', s)
    assert.equal(box.writes, after + 1, 'a genuine change still reaches the reader')
    assert.ok(box.innerHTML.includes('Hazardous'))
  })

  // Adding a persona to PERSONA_ORDER without adding it to
  // PERSONA_FALLBACK_LABEL throws a TypeError on the SAME render — the chip
  // builder and renderVerdict both destructure that map unguarded — so the
  // chips and the verdict disappear together and nothing renders. That is not
  // visible from either list alone, and nobody finds out until someone adds a
  // persona in production. The two lists must carry the same keys.
  await test('PERSONA_FALLBACK_LABEL covers every persona in PERSONA_ORDER', () => {
    const { s } = mk()
    // Spread into host-realm arrays: values that came out of a vm context have
    // that realm's Array.prototype, and deepStrictEqual compares prototypes —
    // so an unmapped-but-equal pair would fail here for a reason that has
    // nothing to do with the labels.
    const order = [...vm.runInContext('PERSONA_ORDER', s)]
    const labels = [...vm.runInContext('Object.keys(PERSONA_FALLBACK_LABEL)', s)]
    const missing = order.filter((k) => !labels.includes(k))
    const extra = labels.filter((k) => !order.includes(k))
    assert.deepEqual(missing, [], `personas with no fallback label: ${missing.join(', ')}`)
    assert.deepEqual(extra, [], `fallback labels for personas that do not exist: ${extra.join(', ')}`)
  })

  // Both call sites destructure the same map; assert the destructuring is
  // total for every real persona, which is the property above protects.
  await test('every persona resolves to a non-empty fallback label pair', () => {
    const { s } = mk()
    const bad = [...vm.runInContext(
      'PERSONA_ORDER.filter(id => { const p = PERSONA_FALLBACK_LABEL[id]; return !p || p.length !== 2 || !p[0] || !p[1] })',
      s)]
    assert.deepEqual(bad, [], `personas whose fallback label is not a [th, en] pair: ${bad.join(', ')}`)
  })
}

console.log(`\n${passed} passed, 0 failed`)
