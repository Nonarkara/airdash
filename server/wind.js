// Wind direction, stated the same way everywhere.
//
// WHY THIS IS SHARED. `server/smoke.js` had its own private compass table and
// turned `wind_dir_d0` / `wind_dir_d1` into a labelled "from" bearing. The risk
// engine fetched `wind_fc_kmh` for the same 77 provinces and never asked for
// direction at all — so /api/risk published a wind SPEED with no idea which way
// the air was moving, for every province. Speed without a bearing is close to
// useless for the question people actually ask in the dry season: is this wind
// bringing dust in from the north-west, or clearing it out to sea? Two features
// answering that question differently is worse than one of them not answering
// it, so the table and the labelling live here and both engines import them.
//
// WHAT IT MAY CLAIM. This is a forecast DOMINANT direction from Open-Meteo, not
// an observation and not a trajectory. Daily 10 m data cannot resolve valleys,
// plume rise or arrival time — the hazard plan already says so where it matters.
// `wind_basis` is always published so a reader can tell today from tomorrow.

export const COMPASS_TH = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ']
export const COMPASS_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** 16-point compass index (0..7) for a bearing, or null when there is none. */
export function compassIndex(deg) {
  if (!Number.isFinite(deg) || deg < 0 || deg > 360) return null
  return Math.round((deg % 360) / 45) % 8
}

/** Where the wind is going. Direction is meteorological: it names where the air comes FROM. */
export const towardsDeg = (fromDeg) => (Number.isFinite(fromDeg) && fromDeg >= 0 && fromDeg <= 360)
  ? Math.round(((fromDeg + 180) % 360) * 10) / 10 : null

/**
 * A wind bearing as publishable fields. Returns every field null when there is
 * no usable direction, so a caller can never half-render a compass: an absent
 * wind must read as absent, not as "N".
 *
 * @param dirDeg    meteorological direction the wind comes FROM, 0–360.
 * @param opts.basis      'today-forecast' | 'tomorrow-forecast'
 * @param opts.updatedAt  ISO time of the reading the bearing came from
 */
export function describeWind(dirDeg, { basis = null, updatedAt = null } = {}) {
  const k = compassIndex(dirDeg)
  if (k === null) {
    return {
      wind_dir_deg: null, wind_from_th: null, wind_from_en: null,
      wind_towards_deg: null, wind_basis: null, wind_updated_at: null,
    }
  }
  return {
    wind_dir_deg: Math.round(dirDeg) % 360,
    wind_from_th: COMPASS_TH[k],
    wind_from_en: COMPASS_EN[k],
    wind_towards_deg: towardsDeg(dirDeg),
    wind_basis: basis,
    wind_updated_at: updatedAt,
  }
}

/**
 * Pick the bearing to publish from a province's two forecast days, preferring
 * tomorrow when it exists — tomorrow is the day a person is preparing for.
 * Mirrors the precedence server/smoke.js already used so the two cannot drift.
 */
export function pickWindDir(d0, d1, d1UpdatedAt, d0UpdatedAt) {
  if (Number.isFinite(d1)) {
    return describeWind(d1, { basis: 'tomorrow-forecast', updatedAt: d1UpdatedAt ?? null })
  }
  if (Number.isFinite(d0)) {
    return describeWind(d0, { basis: 'today-forecast', updatedAt: d0UpdatedAt ?? null })
  }
  return describeWind(null)
}