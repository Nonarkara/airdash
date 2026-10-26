// Exercise restored controls against the real wind controller, without a browser or provider calls.
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../public/js/regional-wind-view.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export function','function')
function verify(src){
 const nodes=new Map(),calls=[]
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:true,attrs:{},setAttribute(k,v){this.attrs[k]=v},focus(){}});return nodes.get(id)}
 el('wind-origin').value='-2,103';el('wind-level').value='aloft';el('wind-hour').value='3'
 const layer=()=>({addTo(){return this},clearLayers(){},bindTooltip(){return this}})
 const map={on(){},setView(){},latLngToContainerPoint(){return{x:0,y:0}}}
 let available=true
 const context=vm.createContext({document:{getElementById:el,querySelector:()=>({parentElement:{prepend(){}}})},L:{layerGroup:layer,control:()=>({addTo(){this.onAdd()}}),DomUtil:{create:()=>({})},circleMarker:layer},Date,Number,Math,
  windAt:(data,lat,lng,start,level)=>{calls.push({lat,lng,start,level});return available?{speed:10,towards:90,rain:0}:null},
  airPath:(data,origin,start)=>({points:[{...origin,time:start,hours:0}],distance:0,complete:true}),
  windArrowSvg:()=>'<svg/>',esc:x=>x,HOUR_STEPS:[1,3,6],clusterMarks:()=>[],matchMedia:()=>({matches:false})})
 vm.runInContext(src,context)
 const view=context.createRegionalWindView({map,tr:(th,en)=>en,clock:String})
 view.update({points:[]})
 assert.deepEqual({lat:calls[0].lat,lng:calls[0].lng,level:calls[0].level},{lat:-2,lng:103,level:'aloft'})
 assert.match(el('wind-position').textContent,/-2.00°, 103.00°/)
 assert.match(el('wind-reading').attrs['aria-label'],/850 hPa/)
 assert.ok(calls[0].start>Date.now()+2.9*3600000,'restored time offset is applied')
 view.select(18,99);view.update({points:[]})
 assert.match(el('wind-position').textContent,/18.00°, 99.00°/,'custom map point survives refresh')
 available=false;view.update({points:[]})
 assert.equal(el('wind-reading').attrs['aria-label'],'Wind details · unavailable','old wind value must not survive in accessible label')
}
verify(source)
let caught=false;try{verify(source.replace('data=value;readControls();draw()','data=value;draw()'))}catch{caught=true}
assert.ok(caught,'removing control restoration must fail')
console.log('PASS restored origin, wind level, release time, custom point, unavailable label; restoration mutation caught')
