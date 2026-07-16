// ENSO state (El Niño / La Niña) as a seasonal flood-risk modulator.
// Source: NOAA CPC Oceanic Niño Index (ONI) — public domain, keyless, tiny.
// La Niña (ONI ≤ −0.5) meaningfully raises Thailand's wet-season/flood odds
// (clearest in the Northeast and at annual scale); the 2011 Great Flood was a
// La Niña compound event. This is a PRIOR, not a predictor — surfaced as
// context, never folded into a station's live score.
import { CONFIG } from '../config.js'
import { fetchText, num } from '../util.js'

const URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt'

export function classifyOni(anom) {
  if (anom === null) return { phase: 'unknown', th: 'ไม่ทราบ', en: 'Unknown' }
  if (anom >= 1.5) return { phase: 'el_nino_strong', th: 'เอลนีโญกำลังแรง', en: 'Strong El Niño' }
  if (anom >= 0.5) return { phase: 'el_nino', th: 'เอลนีโญ', en: 'El Niño' }
  if (anom <= -1.5) return { phase: 'la_nina_strong', th: 'ลานีญากำลังแรง', en: 'Strong La Niña' }
  if (anom <= -0.5) return { phase: 'la_nina', th: 'ลานีญา', en: 'La Niña' }
  return { phase: 'neutral', th: 'ปกติ (เป็นกลาง)', en: 'Neutral' }
}

export default {
  name: 'enso',
  label_th: 'ดัชนีเอลนีโญ/ลานีญา',
  label_en: 'ENSO (ONI)',
  intervalMs: CONFIG.intervals.enso,
  enabled: true,

  async run({ db, bus }) {
    const text = await fetchText(URL, { timeoutMs: 15_000 })
    // Whitespace columns, no header: SEAS YR TOTAL ANOM
    const rows = text.trim().split('\n')
      .map((l) => l.trim().split(/\s+/))
      .filter((c) => c.length >= 4 && /^\d{4}$/.test(c[1]))
    if (rows.length === 0) throw new Error('ONI parse produced no rows')

    const last = rows.at(-1)
    const anom = num(last[3])
    const season = `${last[0]} ${last[1]}`
    if (anom === null) throw new Error('ONI latest anomaly not numeric')

    const cls = classifyOni(anom)
    const prevPhase = db.kvGet('enso_phase')
    db.kvSet('enso_phase', cls.phase)
    db.kvSet('enso_anom', String(anom))
    db.kvSet('enso_season', season)

    // Keep a small time series of the index for pattern history.
    const obs_time = `${last[1]}-${seasonMonth(last[0])}`
    const isNew = db.insertReading({
      source: 'enso', station_key: 'oni', metric: 'oni_anom',
      value: anom, obs_time, fetched_at: new Date().toISOString(),
    })
    db.upsertStation({
      source: 'enso', station_key: 'oni',
      name_th: 'ดัชนี ONI (Niño 3.4)', name_en: 'ONI (Niño 3.4)',
      province_th: null, province_en: null, region_th: null, region_en: null,
      basin_th: null, basin_en: null, lat: null, lng: null,
      meta_json: null, now: new Date().toISOString(),
    })

    if (isNew || prevPhase !== cls.phase) {
      bus.publish({
        kind: 'status', source: 'enso',
        severity: cls.phase.startsWith('la_nina') ? 1 : 0,
        title_th: `สถานะมหาสมุทร: ${cls.th} (ONI ${anom > 0 ? '+' : ''}${anom.toFixed(1)}, ${season})${cls.phase.startsWith('la_nina') ? ' — เพิ่มโอกาสฝนมาก' : ''}`,
        title_en: `Ocean state: ${cls.en} (ONI ${anom > 0 ? '+' : ''}${anom.toFixed(1)}, ${season})${cls.phase.startsWith('la_nina') ? ' — raises wet-season odds' : ''}`,
        payload: { anom, phase: cls.phase, season },
      })
    }

    return { seen: rows.length, added: isNew ? 1 : 0 }
  },
}

// ONI seasons are 3-month running means labeled by the middle month.
const SEASON_MID = {
  DJF: '01', JFM: '02', FMA: '03', MAM: '04', AMJ: '05', MJJ: '06',
  JJA: '07', JAS: '08', ASO: '09', SON: '10', OND: '11', NDJ: '12',
}
function seasonMonth(seas) { return SEASON_MID[seas] ?? '01' }
