import vm from 'node:vm'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../public/js/region.js',import.meta.url),'utf8')
const start=source.indexOf('async function load()'),end=source.indexOf('translate();load()',start)
assert.ok(start>0&&end>start)
async function run(states){
 let calls=0;const timers=[],nodes={refresh:{},status:{},resources:{}}
 const ctx=vm.createContext({loading:false,data:null,lastError:false,refreshFollowups:0,refreshFollowupTimer:null,byId:id=>nodes[id],paint(){},tr:(th,en)=>en,AbortSignal,
  setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},
  fetch:async url=>{assert.equal(url,'/api/region');calls++;return{ok:true,json:async()=>({overview_status:states[Math.min(calls-1,states.length-1)]})}}
 })
 vm.runInContext(source.slice(start,end),ctx)
 await ctx.load()
 let steps=0
 while(timers.length){assert.ok(++steps<8,'unbounded refresh loop');timers.shift()();for(let i=0;i<20;i++)await Promise.resolve()}
 return calls
}
assert.equal(await run(['refreshing','refreshing',undefined]),3,'completed rebuild reaches the open page')
assert.equal(await run(['refreshing']),4,'stalled rebuild produces at most three follow-up reads')
assert.equal(await run(['refresh_failed']),1,'failure respects server cooldown without polling')
console.log('PASS bounded follow-up reads replace last-known evidence, stalled refresh stops, failed refresh does not poll')
