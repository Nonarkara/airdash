import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
class Node {
  children = []; dataset = {}; hidden = false; attrs = {};
  classList = { toggle() {} };
  constructor(tag, attrs = {}, children = []) { this.tag = tag; this.attrs = attrs; this.id = attrs.id; this.hidden = attrs.hidden ?? false; this.append(...children) }
  append(...children) { this.children.push(...children.flat().filter(x => x != null)) }
  prepend(...children) { this.children.unshift(...children) }
  replaceChildren(...children) { this.children = children }
  setAttribute(key, value) { this.attrs[key] = value }
  get textContent() { return this.children.map(x => x instanceof Node ? x.textContent : String(x)).join('') }
}
const root = new Node('div')
const context = vm.createContext({
  document: { getElementById: () => root },
  el: (tag, attrs, ...children) => new Node(tag, attrs, children),
  tr: (th, en) => en, store: { lang: 'en' },
  fmtNum: value => String(Math.round(value)),
  BAND: { normal: { en: 'Normal' }, watch: { en: 'Watch' } },
  pm25Level: () => 'good', LEVEL_NAME: { good: { en: 'Good' } },
  causeChip: () => null, causesByProvince: async () => new Map(), causeEvidenceBlock: () => null,
  flyToProvince() {}, showProvinceDetail() {},
})
const source = readFileSync(new URL('../public/js/panels/ranking.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace('export function initRanking', 'function initRanking')
vm.runInContext(source + '\nglobalThis.paint = (snapshot, mode) => { rankMode = mode; render(snapshot) }', context)
const fixture = { risk: { provinces: [
  { province_code: '01', province_th: 'ก', province_en: 'Known', pm25: 27, score: 14, harm: { score: 20, social_load: 62, band: 'watch' }, danger: { score: 35 } },
  { province_code: '02', province_th: 'ข', province_en: 'Unknown', pm25: null, score: null },
  { province_code: '03', province_th: 'ค', province_en: 'PM only', pm25: 18, score: 10 },
] } }
const rows = () => root.children.filter(x => x.attrs?.class?.startsWith('rank-row '))
context.paint(fixture, 'worst')
assert.equal(rows().length, 3)
assert.equal(rows()[0].children[0].tag, 'button', 'row uses native keyboard activation')
assert.deepEqual(rows()[0].children[0].children.slice(1).map(x => x.textContent), ['27', '14', '62', '35'])
assert.deepEqual(rows()[2].children[0].children.slice(1).map(x => x.textContent), ['–', '–', '–', '–'], 'missing data never becomes zero')
const [summary, detail] = rows()[0].children
assert.equal(detail.hidden, true)
summary.attrs.onclick()
assert.equal(detail.hidden, false)
assert.equal(summary.attrs['aria-expanded'], 'true')
summary.attrs.onclick()
assert.equal(detail.hidden, true)
context.paint(fixture, 'harm')
assert.equal(rows()[0].children[0].children[1].textContent, '20')
assert.equal(rows().find(r => r.children[0].attrs['aria-label'].includes('PM only')).children[0].children[1].textContent, '–', 'missing harm never falls back to a PM value under a Harm label')
console.log('PASS ranking metric alignment, unknown values, mode units and native disclosure state')
