// Dump the canonical source catalog + configured polling intervals for the paper.
import { SOURCES } from '../../server/sources-catalog.js'
import { CONFIG } from '../../server/config.js'
import { writeFileSync, readdirSync, readFileSync } from 'node:fs'
const loc = {}
for (const f of readdirSync(new URL('../../server/sources/', import.meta.url))) {
  if (f.endsWith('.js')) loc[f.replace('.js', '')] = readFileSync(new URL('../../server/sources/' + f, import.meta.url), 'utf8').split('\n').length
}
const out = { intervals_ms: CONFIG.intervals, adapter_lines: loc, sources: SOURCES.map(s => ({
  id: s.id, kind: s.kind, stored: !!s.stored, name_en: s.name_en, agency_en: s.agency_en, cadence_en: s.cadence_en, url: s.url, metrics: s.metrics ?? [] })) }
writeFileSync(new URL('../data/catalog.json', import.meta.url), JSON.stringify(out, null, 1))
console.log(out.sources.length, 'catalog entries;', Object.keys(loc).length, 'adapter files;', Object.values(loc).reduce((a, b) => a + b, 0), 'adapter lines')
console.log(out.sources.map(s => `${s.kind}:${s.id}=${s.agency_en}`).join('\n'))
