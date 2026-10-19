import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const code=readFileSync('server/index.js','utf8')
const start=code.indexOf('  const base = `http://127.0.0.1:${CONFIG.port}`')
const end=code.indexOf('\n}\n\nbus.publish',start)
assert.ok(start>0&&end>start)
const timers=[],requests=[]
const context={CONFIG:{port:1},AbortSignal,setTimeout:fn=>{timers.push({fn,ms:12000});return {unref(){}}},setInterval:(fn,ms)=>{timers.push({fn,ms});return {unref(){}}},fetch:url=>new Promise(resolve=>{requests.push({url,resolve})})}
vm.runInNewContext('{'+code.slice(start,end)+'\n}',context)
const boot=timers.find(t=>t.ms===12000).fn,hot=timers.find(t=>t.ms===8000).fn,all=timers.find(t=>t.ms===45000).fn
const pass=boot()
assert.equal(requests.length,1)
hot();all();assert.equal(requests.length,1,'overlapping ticks do not add requests during a cold pass')
for(let i=0;i<7;i++){
  assert.equal(requests.length,i+1,'full pass is sequential')
  requests[i].resolve({arrayBuffer:async()=>new ArrayBuffer(0)})
  for(let j=0;j<10;j++)await Promise.resolve()
}
await pass
hot();assert.equal(requests.length,8,'hot snapshot resumes after full pass')
requests[7].resolve({arrayBuffer:async()=>new ArrayBuffer(0)})
console.log('PASS cache warming serializes cold queries, coalesces periodic ticks and resumes hot snapshots')
