import assert from 'node:assert/strict'
import { fireView,fireOpacity } from '../public/js/regional-fire-view.js'
const now=Date.parse('2026-10-23T06:00Z'),stamp=new Date(now).toISOString()
const input={available:true,checked_at:stamp,evaluated_at:stamp,latest_acquisition_at:stamp,feeds_current:2,feeds_expected:3,cells:[{detections:4,last_observed_at:stamp},{detections:7,last_observed_at:'2026-10-20T00:00Z'}]}
assert.equal(fireView(input,now).detections,4);assert.equal(fireView(input,now).partial,true)
for(const patch of [{available:false},{latest_acquisition_at:'2026-10-20T00:00Z'},{checked_at:null},{evaluated_at:'2026-10-23T05:00Z'},{feeds_current:0}])assert.deepEqual(fireView({...input,...patch},now).cells,[])
assert.equal(fireView(input,now+31*60000).available,false,'old aggregate expires even if browser refresh failed')
assert.equal(fireView({...input,cells:[]},now).available,true,'a current empty feed differs from unavailable')
assert.deepEqual([1,2,5,6,20,21].map(fireOpacity),[.35,.5,.5,.65,.65,.8])
console.log('PASS regional fire acquisition/aggregate age gates, partial coverage, empty versus unavailable and legend bins')
