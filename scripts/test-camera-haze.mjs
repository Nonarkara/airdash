import assert from 'node:assert/strict'
import { readFrame, darkChannel, solidFrame, FRAME_W, FRAME_H, FRAME_BYTES } from '../server/vision/hazeRead.js'
import { frameIdentity, assessHaze, daylightInThailand } from '../server/vision/hazeSignal.js'
import { parseLongdoCameras } from '../server/sources/iticCctv.js'
import { mergeCams } from '../server/sources/cctvRegistry.js'
import { coverageReport } from '../server/vision/coverage.js'
import { describeVision, pictureFlags } from '../server/vision/visionLook.js'
import { previewPath } from '../server/vision/frameStore.js'
import { openDb } from '../server/db.js'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let passed = 0
function test(name, fn) { fn(); passed++; console.log('PASS', name) }
const now = '2026-10-02T03:00:00.000Z'
const scene = Buffer.alloc(FRAME_BYTES)
for (let y=0;y<FRAME_H;y++) for(let x=0;x<FRAME_W;x++) {
 const value=30+x/FRAME_W*100+((Math.floor(x/8)+Math.floor(y/8))%2)*90
 for(let c=0;c<3;c++) scene[(y*FRAME_W+x)*3+c]=value
}
const reading=readFrame(scene), identity=frameIdentity(scene)
const history=Array.from({length:3},(_,i)=>({ obs_time:new Date(Date.parse(now)-(i+1)*30*60_000).toISOString(),
 contrast:reading.features.contrast,mean_luma:reading.features.meanLuma,dark_normalized:reading.features.darkChannelNorm,
 frame_hash:'distinct-reference-'+i,view_signature:JSON.stringify(identity.signature),haze_status:'baseline-needed' }))

test('the dark channel includes blue, not just red and green',()=>assert.equal(darkChannel(solidFrame(255,255,0)).dark,0))
test('bright streetlit night frames are withheld',()=>assert.equal(assessHaze(reading,identity,history,'2026-10-02T13:00:00Z').status,'low-light'))
test('daylight is conservative at Thai dawn and dusk',()=>{assert.ok(daylightInThailand(now));assert.equal(daylightInThailand('2026-10-02T11:00:00Z'),false)})
test('white placeholders cannot be labelled clear or haze',()=>{const b=solidFrame(255,255,255);assert.equal(assessHaze(readFrame(b),frameIdentity(b),history,now).status,'blank')})
test('underexposed frames are withheld even in daytime',()=>assert.equal(assessHaze({...reading,features:{...reading.features,meanLuma:20}},identity,history,now).status,'low-light'))
test('no reference means no air-quality claim',()=>assert.equal(assessHaze(reading,identity,[],now).status,'baseline-needed'))
test('duplicate reference hashes do not count as three samples',()=>assert.equal(assessHaze(reading,identity,history.map(r=>({...r,frame_hash:'same'})),now).baselineSamples,1))
test('a matched camera scene can report no substantial change',()=>assert.equal(assessHaze(reading,identity,history,now).status,'unchanged'))
test('synthetic airlight and lost contrast trigger possible haze on the same scene',()=>{
 const b=Buffer.from(scene.map(v=>.45*v+.55*220)),r=readFrame(b)
 const signal=assessHaze(r,frameIdentity(b),history,now)
 assert.equal(signal.status,'possible-haze');assert.ok(signal.contrastLoss>=25)
})
test('an exposure gain alone is not haze',()=>{
 const b=Buffer.from(scene.map(v=>v*1.1))
 assert.equal(assessHaze(readFrame(b),frameIdentity(b),history,now).status,'unchanged')
})
test('unchanged pixels over time are flagged as a potentially frozen feed',()=>assert.equal(assessHaze(reading,identity,[{...history[0],frame_hash:identity.hash}],now).status,'frozen'))
test('a changed viewpoint is withheld and can acquire a new reference',()=>{
 const changed={...identity,signature:identity.signature.map(v=>-v)}
 assert.equal(assessHaze(reading,changed,history,now).status,'changed-view')
 const fresh=history.map((r,i)=>({...r,frame_hash:'new-view-'+i,haze_status:'changed-view',view_signature:JSON.stringify(changed.signature)}))
 assert.equal(assessHaze(reading,changed,[...history,...fresh],now).status,'unchanged')
})
test('published named iTIC snapshot IDs survive URL validation and registry normalization',()=>{
 const xml='<item><title>Road camera</title><latitude>13.9</latitude><longitude>100.6</longitude><camid>CAM1</camid><motion>Y</motion><imgurl>https://camear3.iticfoundation.org/jpeg.cgi?camid=PER-3-008_2</imgurl><hls_url>ccs30.m3u8</hls_url></item>'
 const c=parseLongdoCameras(xml)[0]
 assert.match(c.upstream_still_url,/camera3\.iticfoundation/)
 assert.equal(c.hls_url,'https://camerai1.iticfoundation.org/hls/ccs30.m3u8')
 const merged=mergeCams([{source:{id:'itic'},cams:[{...c,hls_url:null}]}])[0]
 assert.equal(merged.stream_kind,'snapshot');assert.equal(merged.grab_url,c.upstream_still_url)
})
test('one decoded frame does not certify every camera in its class',()=>{
 const cams=Array.from({length:9},(_,i)=>({source:'itic',id:String(i),stream_kind:'hls',stream_status:'live'}))
 assert.equal(coverageReport(cams,{grabbedKeys:new Set(['itic:0'])}).available,1)
 assert.equal(coverageReport(cams).available,0)
})
test('unpaired possible-haze samples can be shown without fabricating station readings',()=>{
 const r={camera_key:'itic:1',haze_status:'possible-haze',contrast_loss:40,has_preview:1,obs_time:now,pm25:null}
 const v=describeVision(r);assert.equal(v.look,'haze-like');assert.equal(v.pm25_at_sample,null);assert.equal(v.calibrated,false)
 assert.equal(pictureFlags([{source:'itic',id:'1',stream_status:'down'}],new Map([['itic:1',r]])).length,1)
 assert.equal(describeVision({...r,haze_status:'low-light'}).look,'unclear')
})
test('preview filenames are generated internally, including for path-like camera keys',()=>assert.ok(!previewPath('../../secret').includes('../')))
test('frame schema migration is idempotent and collector inserts all new fields',()=>{
 const directory=mkdtempSync(join(tmpdir(),'airdash-camera-test-'))
 try {
  const path=join(directory,'test.db');let db=openDb(path);db.raw.close();db=openDb(path)
  const source=readFileSync('server/vision/hazeVision.js','utf8')
  const sql=source.match(/`(INSERT INTO cctv_haze_frames[\s\S]*?)`/)[1]
  const values=new Array(26).fill(null);values[0]='itic:1';values[4]=now
  db.run(sql,...values)
  assert.equal(db.get('SELECT camera_key FROM cctv_haze_frames').camera_key,'itic:1');db.raw.close()
 } finally {rmSync(directory,{recursive:true,force:true})}
})
console.log(`\n${passed} passed, 0 failed`)
