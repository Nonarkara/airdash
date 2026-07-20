// Offline validation of the Science engine against the live DB (read-only).
import { openDb } from '../server/db.js'
import { CONFIG } from '../server/config.js'
import { createScience } from '../server/science.js'

const db = openDb()
const science = createScience({ db, CONFIG })

const t0 = Date.now()
const snap = science.get()
console.log('compute ms:', Date.now() - t0)
console.log('national:', JSON.stringify(snap.national, null, 1))
console.log('provinces:', snap.provinces.length)
console.log('with pm25:', snap.provinces.filter((p) => p.pm25 !== null).length)
console.log('top3:', snap.provinces.slice(0, 3).map((p) => [p.code, p.name_en, p.pm25, p.pm25_source, p.band]))
console.log('codes ok:', snap.provinces.every((p) => Number(p.code) >= 10 && Number(p.code) <= 96))
console.log('aot40 sample:', snap.provinces.filter((p) => p.o3_aot40_week !== null).slice(0, 5).map((p) => [p.code, p.o3_aot40_week]))
console.log('formulas:', snap.meta.formulas.map((f) => f.id).join(', '))
console.log('profiles:', Object.keys(snap.profiles).join(', '))

const card = science.personal({ province: '50', profile: 'kid', outdoorMin: 120, activity: 'moderate' })
console.log('personal:', JSON.stringify(card, null, 1))

const card2 = science.personal({ pm25: 55, profile: 'asthma', outdoorMin: 30, activity: 'heavy' })
console.log('personal2:', JSON.stringify({ pm: card2.resolved, dose: card2.dose_ug, cigs: card2.cigs_equiv, band: card2.band, guidance: card2.guidance }))
process.exit(0)
