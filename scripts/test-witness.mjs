import test from 'node:test'
import assert from 'node:assert/strict'
import { composeWitness } from '../server/witness.js'

const eye = (code, th, pm) => ({
  rank: 1,
  air: { province_code: code, province_th: th, pm25: pm, band: 'sensitive' },
  camera: { id: 'c1', source: 'gistda', name_th: 'กล้อง' },
})

test('reports and headlines join the camera only for the same province', () => {
  const out = composeWitness({
    eyes: [eye('50', 'เชียงใหม่', 80), eye('10', 'กรุงเทพมหานคร', 40)],
    press: [
      { id: 'a', credit_line: 'Thai PBS', title_raw: 'ฝุ่นเชียงใหม่', province_code: '50', source_url: 'https://example.com/a', claims: { smoke: true } },
      { id: 'b', credit_line: 'Nation', title_raw: 'กรุงเทพ', province_code: '10', source_url: 'javascript:alert(1)' },
    ],
    street: [
      { id: 3, kind: 'haze', message: 'มองไม่เห็นดอย', province_code: '50', has_image: 1 },
      { id: 4, kind: 'other', message: 'bangkok', province_code: 10 },
    ],
    news: [
      { title: 'ไฟป่าเชียงใหม่', link: 'https://news.example/x', province_code: '50', is_fire: 1, places: [{ province_code: '50' }] },
      { title: 'นโยบายระดับชาติ', link: 'http://news.example/y', province_code: null, places: [] },
    ],
  })
  assert.equal(out.count, 2)
  const cm = out.places[0]
  assert.equal(cm.heard.length, 1)
  assert.equal(cm.heard[0].source_url, 'https://example.com/a')
  assert.equal(cm.street.length, 1)
  assert.equal(cm.street[0].has_image, true)
  assert.equal(cm.street[0].message, 'มองไม่เห็นดอย')
  assert.equal(cm.said.length, 1)
  assert.equal(cm.said[0].is_fire, true)
  const bk = out.places[1]
  assert.equal(bk.heard[0].source_url, null)
  assert.equal(bk.street.length, 1)
  assert.equal(bk.said.length, 0)
})

test('a headline that names the province among others still joins', () => {
  const out = composeWitness({
    eyes: [eye('52', 'ลำปาง', 60)],
    press: [],
    street: [],
    news: [{ title: 'ฝุ่นสามจังหวัด', link: 'https://n.example/z', places: [{ province_code: '50' }, { province_code: '52' }] }],
  })
  assert.equal(out.places[0].said.length, 1)
  assert.equal(out.places[0].said[0].link, 'https://n.example/z')
})
