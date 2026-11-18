// The top-bar headline: one measured number, in the country's own words.
//
// WHY (2026-11-18). The chip used to lead with the Danger research composite
// (PM2.5 × heat × humidity × noise × rain relief) and its own band words. On
// 18 Nov it read "49 · Dangerous · Highest: Nakhon Pathom" while Nakhon
// Pathom measured 35 µg/m³ — under the 37.5 standard — and the panel beside it
// said "no station above the health line". Three surfaces, three answers; a
// reader cannot act on that. The headline is now the measured PM2.5 of the
// worst province (the same number and order as the ranking's first column)
// with its Thai AQI 2023 level name, so the top bar, the ranking and "severe
// now" agree by construction. The composite stays one tap away (tooltip and
// the province card), labelled as research.
import { pm25Level, LEVEL_NAME } from './i18n.js?v=2.4.139'

// Thai AQI level → the band classes the chip already knows how to colour.
export const LEVEL_BAND = { 1: 'normal', 2: 'normal', 3: 'watch', 4: 'elevated', 5: 'high' }

/** Pure: the province the headline speaks for, and what it says.
 *  provinces: risk rows ({province_code, pm25, pm25_source, danger}); scopedCode: a focused province or null. */
export function headlineReading(provinces, scopedCode = null) {
  const rows = (provinces ?? []).filter((p) => Number.isFinite(p?.pm25))
  const scoped = scopedCode ? rows.find((p) => p.province_code === scopedCode) : null
  const worst = rows.reduce((w, p) => (!w || p.pm25 > w.pm25 || (p.pm25 === w.pm25 && (p.danger?.score ?? -1) > (w.danger?.score ?? -1)) ? p : w), null)
  const p = scoped ?? worst
  if (!p) return null
  const level = pm25Level(p.pm25)
  return {
    province: p,
    scoped: !!scoped,
    pm25: p.pm25,
    level,
    band: LEVEL_BAND[level] ?? 'unknown',
    name: LEVEL_NAME[level] ?? null,
    estimated: p.pm25_source !== 'air4thai',
    overStandard: p.pm25 > 37.5,
  }
}
