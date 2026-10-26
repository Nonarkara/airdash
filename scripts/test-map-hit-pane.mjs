// Wire interactive paths into one canvas so transparent upper canvases cannot
// swallow lower province clicks. Actual hit-testing is also checked in the browser.
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const file=new URL('../public/js/layers/province-boundaries.js',import.meta.url)
const source=readFileSync(file,'utf8').replace(/^import .*$/gm,'').replace('export function','function')
async function verify(src){
 const panes=[],handlers={},popups=[],made=[],order=['station'];let back=0,attached=true
 const p={pro_th:'ลำปาง',pro_en:'Lampang'},row={province_th:'ลำปาง',province_en:'Lampang',score:6,band:'normal'}
 const ctx=vm.createContext({
  L:{layerGroup:()=>({clearLayers(){while(order.includes('province'))order.splice(order.indexOf('province'),1)},addLayer(layer){made.push(layer);if(attached)layer.attach()}}),geoJSON:(feature,opts)=>{panes.push(opts.pane);opts.onEachFeature(feature,{bindTooltip(){},bindPopup(fn){popups.push(fn)},on(){}});const hooks={};return{on(name,fn){hooks[name]=fn},attach(){if(order.includes('province'))order.splice(order.indexOf('province'),1);order.push('province');hooks.add?.()},bringToBack(){back++;order.splice(order.indexOf('province'),1);order.unshift('province')}}}},
  getJson:async()=>({features:[{properties:p}]}),store:{snapshot:{risk:{provinces:[row]}}},on:(key,fn)=>{handlers[key]=fn},tr:(th,en)=>en,escapeHtml:String,bandColor:()=>'',provinceCard:r=>r.province_en,zoneStyle:()=>({}),outlookByProvince:()=>new Map(),stateLabel:String,
 })
 vm.runInContext(src,ctx);ctx.createProvinceBoundariesLayer()
 for(let i=0;i<10;i++)await Promise.resolve()
 assert.deepEqual(panes,['data']);assert.equal(back,1);assert.equal(popups[0](),'Lampang')
 handlers.snapshot();assert.equal(back,2,'redraw also returns province fills behind station hit targets')
 assert.equal(order.at(-1),'station','station keeps the highest hit priority')
 made.at(-1).attach();assert.equal(back,3,'off/on attachment restores backdrop order')
 assert.equal(order.at(-1),'station','station hit priority survives reattachment')
 attached=false;handlers.snapshot();assert.equal(back,3,'detached draw has no renderer to reorder')
 attached=true;made.at(-1).attach();assert.equal(back,4,'later attachment orders a detached draw')
 assert.equal(order.at(-1),'station')
}
await verify(source)
for(const bad of [source.replace("pane: 'data'","pane: 'vectors'"),source.replace('layer.bringToBack()','void 0')]){
 let caught=false;try{await verify(bad)}catch{caught=true}assert.ok(caught,'pane/ordering mutation must fail')
}
for(const path of ['../public/js/map.js','../public/js/layers/osm-buildings.js'])assert.ok(!/pane:\s*['"]vectors['"]/.test(readFileSync(new URL(path,import.meta.url),'utf8')),'interactive optional paths share the same hit-test canvas')
console.log('PASS shared interactive canvas, province backdrop ordering and popup binding; pane/order mutations caught')
