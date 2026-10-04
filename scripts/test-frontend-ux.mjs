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
console.log(`\n${passed} passed, 0 failed`)
