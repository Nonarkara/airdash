// The headline geotagger, stolen from FloodDash after it lied in production:
// one match per story, and Thai words that only look like place names.
import test from 'node:test'
import assert from 'node:assert/strict'
import { matchNewsPlaces, geotagHeadline } from '../server/newsPlaces.js'

test('ฉับพลัน does not match Phon district', () => {
  const places = matchNewsPlaces('ประกาศเตือนภัยน้ำท่วมฉับพลันในพื้นที่จังหวัดกวางตรี')
  assert.equal(places.find((p) => p.name_th === 'พล'), undefined)
})

test('เลย as a particle does not match Loei', () => {
  for (const t of ['ฝนตกหนักเลยทำให้ถนนลื่น', 'เช็กเลยจังหวัดไหนบ้าง']) {
    assert.equal(matchNewsPlaces(t).find((p) => p.name_th === 'เลย'), undefined, t)
  }
})

test('ตาก as a verb does not match Tak', () => {
  assert.equal(
    matchNewsPlaces('ตากแดดตากลมมานาน ผลผลิตเสียหาย').find((p) => p.name_th === 'ตาก'),
    undefined)
})

test('an explicit cue still admits Loei', () => {
  assert.ok(matchNewsPlaces('จ.เลย ฝุ่นคลุมเมือง').some((p) => p.name_th === 'เลย'))
})

test('every province in a multi-province haze headline is returned', () => {
  const names = matchNewsPlaces('ฝุ่นพุ่ง เชียงราย แม่ฮ่องสอน บึงกาฬ ค่า PM2.5 เกินเกณฑ์').map((p) => p.name_th)
  for (const n of ['เชียงราย', 'แม่ฮ่องสอน', 'บึงกาฬ']) assert.ok(names.includes(n), n)
})

test('an explicit district beats its province', () => {
  const places = matchNewsPlaces('ฝุ่นหนา อ.สีคิ้ว จ.นครราชสีมา')
  assert.equal(places[0].kind, 'district')
  assert.equal(places[0].name_th, 'สีคิ้ว')
  assert.equal(places[0].province_th, 'นครราชสีมา')
  assert.equal(places[0].coord, 'place')
})

test('สอง inside อ.สองแคว must not light up Phrae', () => {
  const places = matchNewsPlaces('อ.สองแคว จ.น่าน หมอกควันปิดภูเขา')
  assert.ok(places.some((p) => p.name_th === 'สองแคว' && p.province_code === '55'))
  assert.equal(places.find((p) => p.name_th === 'สอง'), undefined)
})

test('district followed by จ.Province needs no อ. cue', () => {
  const places = matchNewsPlaces('เวียงสา จ.น่าน ค่าฝุ่นพุ่ง')
  assert.equal(places[0].name_th, 'เวียงสา')
  assert.equal(places[0].province_code, '55')
})

test('Bangkok aliases and bare khet names', () => {
  const codes = (t) => [...new Set(matchNewsPlaces(t).map((p) => p.province_code))]
  assert.deepEqual(codes('กทม. ฝุ่น PM2.5 เกินมาตรฐานหลายเขต'), ['10'])
  assert.deepEqual(codes('กรุงเทพฯ ค่าฝุ่นเช้านี้'), ['10'])
  const names = matchNewsPlaces('ฝุ่นคลุม หลักสี่-ดอนเมือง').map((p) => p.name_th)
  assert.ok(names.includes('หลักสี่') && names.includes('ดอนเมือง'))
})

test('a bare khet name does not pin Bangkok when another province is named', () => {
  const codes = matchNewsPlaces('นายวัฒนา ชาวบ้าน จ.ลำปาง เผยฝุ่นหนา').map((p) => p.province_code)
  assert.ok(!codes.includes('10'), `got ${codes}`)
  assert.ok(!matchNewsPlaces('ฝุ่นคลุมพระนครศรีอยุธยา').some((p) => p.province_code === '10'))
})

test('a landmark inside a named province pins there, and nowhere if the province is absent', () => {
  const at = (t) => matchNewsPlaces(t).map((p) => `${p.kind}:${p.name_th}`)
  assert.deepEqual(at('ชลบุรีอ่วม ฝุ่นคลุม แหลมฉบัง'), ['landmark:แหลมฉบัง'])
  assert.deepEqual(at('ฝุ่นคลุมแหลมฉบัง'), [])
})

test('geotagHeadline stores the province of the first place and every place named', () => {
  const g = geotagHeadline('ฝุ่นพุ่งเชียงใหม่และลำปาง')
  assert.equal(g.province_code, g.places[0].province_code)
  assert.ok(g.places.length >= 2)
  assert.ok(g.province_th)
})
