import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
const callbacks={}, requests=[], focused=[]
function node(tag){return{tag,nodeType:1,children:[],style:{},attrs:{},listeners:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this.listeners[k]=v},append(n){this.children.push(n)}}}
const host=node('host');let paints=0
host.replaceChildren=(...n)=>{host.children=n;paints++}
const store={lang:'en'}
const context=vm.createContext({store,on:(event,fn)=>{callbacks[event]=fn},emit(){},tr:(a,b)=>store.lang==='en'?b:a,getJson:()=>new Promise(resolve=>requests.push(resolve)),focusById:id=>focused.push(id),setInterval:()=>1,clearInterval(){},document:{getElementById:()=>host,createElement:node,createElementNS:(_,tag)=>node(tag),createTextNode:text=>({nodeType:3,text})}})
const src=readFileSync(new URL('../public/js/panels/city-dashboard.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
vm.runInContext(src+'\ninitCityDashboard()',context)
callbacks.focus({id:'thailand'})
store.lang='th';callbacks.lang()
const manifest={areas:[{id:'thailand'},{id:'chiangmai',name_th:'เชียงใหม่',name_en:'Chiang Mai'}]}
requests[1](manifest);await new Promise(setImmediate)
assert.ok(JSON.stringify(host.children).includes('เชียงใหม่'))
const count=paints
requests[0](manifest);await new Promise(setImmediate)
assert.equal(paints,count,'late previous-language request must not repaint')
const choice=host.children[0].children[1]
choice.listeners.change({target:{value:'chiangmai'}})
assert.deepEqual(focused,['chiangmai'])
assert.equal(choice.attrs.id,'city-watch-select')
assert.equal(host.children[0].children[0].attrs.for,'city-watch-select')
console.log('PASS city choice language refresh, late response rejection, label and focus action')
