// Province Social Load proxies — STATIC, curated, not live census pulls.
//
// Each component is 0–100 (higher = more social vulnerability to the same
// ambient plume). Used by server/harm.js to form Effective Harm =
// watch_score × (0.55 + 0.45 × social_load/100).
//
// EPISTEMIC STATUS — read before editing.
// These are rounded proxies synthesised from publicly reported patterns
// (NSO Labour Force Survey informal/ag employment by region, NESDC GPP
// per capita rankings, DOPA age-structure sketches, urbanization /
// highland remoteness literature). They are NOT exact census cells and
// must never be quoted as "X% of Chiang Mai is informal." Rank order and
// regional contrast are the product; false decimals are not.
//
// Components:
//   outdoor_labor     — share of work that keeps people outdoors (ag,
//                       construction, street vending, tourism outdoors)
//   income_strain     — inverse economic capacity to stop work / filter air
//   sensitivity       — young + elderly share / dependent-age pressure
//   adaptive_deficit  — weak indoor shelter, filtration, urban services
//
// Keyed by DOPA province code (string), matching server/provinces.js.

/** @typedef {{ outdoor_labor: number, income_strain: number, sensitivity: number, adaptive_deficit: number }} SocialLoadRow */

/** Clamp helper used when composing rows. */
function c(n) {
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Build a row from four components.
 * @returns {SocialLoadRow}
 */
function row(outdoor, strain, sens, adapt) {
  return {
    outdoor_labor: c(outdoor),
    income_strain: c(strain),
    sensitivity: c(sens),
    adaptive_deficit: c(adapt),
  }
}

// Regional baselines, then per-province overrides for known outliers.
const METRO = row(22, 28, 42, 18)          // BKK + vicinity: indoor work, capacity
const NORTH_BASIN = row(72, 58, 48, 62)    // basin + burn season outdoor work
const NORTH_HIGHLAND = row(78, 72, 52, 78) // Mae Hong Son / remote highland
const NORTH_OTHER = row(68, 55, 48, 55)
const NORTHEAST = row(74, 62, 50, 58)      // broad farmland, outdoor labor
const CANE_BELT = row(70, 52, 46, 48)
const CENTRAL = row(55, 45, 46, 42)
const EAST_COAST = row(48, 40, 44, 38)     // industry + tourism mix
const SOUTH = row(52, 48, 48, 45)
const SOUTH_BORDER = row(58, 68, 52, 60)   // higher strain, outdoor work
const ISLAND_TOURISM = row(55, 38, 40, 35) // outdoor tourism, more cash economy

/** @type {Record<string, SocialLoadRow>} */
export const PROVINCE_SOCIAL = {
  // ── Bangkok Metropolitan Region ──────────────────────────────────────
  '10': { ...METRO, outdoor_labor: 25, income_strain: 26, adaptive_deficit: 16 }, // Bangkok
  '11': { ...METRO, outdoor_labor: 30, income_strain: 32 }, // Samut Prakan
  '12': { ...METRO, outdoor_labor: 24, income_strain: 24, adaptive_deficit: 15 }, // Nonthaburi
  '13': { ...METRO, outdoor_labor: 28, income_strain: 30 }, // Pathum Thani
  '73': { ...METRO, outdoor_labor: 32, income_strain: 30, adaptive_deficit: 20 }, // Nakhon Pathom
  '74': { ...METRO, outdoor_labor: 42, income_strain: 38, adaptive_deficit: 28 }, // Samut Sakhon (industry + migrant outdoor)

  // ── Central plains ───────────────────────────────────────────────────
  '14': { ...CENTRAL, outdoor_labor: 58, income_strain: 48 }, // Ayutthaya
  '15': { ...CANE_BELT }, // Ang Thong
  '16': { ...CANE_BELT, outdoor_labor: 68 }, // Lopburi
  '17': { ...CANE_BELT }, // Sing Buri
  '18': { ...CANE_BELT }, // Chai Nat
  '19': { ...CANE_BELT, outdoor_labor: 62, adaptive_deficit: 45 }, // Saraburi (quarry + ag)
  '26': { ...CENTRAL, outdoor_labor: 50 }, // Nakhon Nayok
  '60': { ...NORTH_OTHER, outdoor_labor: 65 }, // Nakhon Sawan
  '61': { ...NORTH_OTHER }, // Uthai Thani
  '62': { ...NORTH_OTHER, outdoor_labor: 70 }, // Kamphaeng Phet
  '64': { ...NORTH_OTHER }, // Sukhothai
  '65': { ...NORTH_OTHER, outdoor_labor: 60, income_strain: 50 }, // Phitsanulok
  '66': { ...NORTH_OTHER, outdoor_labor: 72 }, // Phichit
  '67': { ...NORTH_OTHER, outdoor_labor: 70 }, // Phetchabun
  '70': { ...CANE_BELT }, // Ratchaburi
  '71': { ...CANE_BELT, outdoor_labor: 72, adaptive_deficit: 52 }, // Kanchanaburi
  '72': { ...CANE_BELT }, // Suphan Buri
  '75': { ...CENTRAL, outdoor_labor: 48, income_strain: 42 }, // Samut Songkhram
  '76': { ...CANE_BELT, outdoor_labor: 58 }, // Phetchaburi
  '77': { ...CENTRAL, outdoor_labor: 55, income_strain: 48 }, // Prachuap Khiri Khan

  // ── East ─────────────────────────────────────────────────────────────
  '20': { ...EAST_COAST, outdoor_labor: 45, income_strain: 35, adaptive_deficit: 32 }, // Chonburi
  '21': { ...EAST_COAST, outdoor_labor: 50, income_strain: 36 }, // Rayong (industry)
  '22': { ...EAST_COAST, outdoor_labor: 55 }, // Chanthaburi
  '23': { ...EAST_COAST, outdoor_labor: 58, income_strain: 48, adaptive_deficit: 48 }, // Trat
  '24': { ...EAST_COAST, outdoor_labor: 52 }, // Chachoengsao
  '25': { ...EAST_COAST, outdoor_labor: 55, income_strain: 45 }, // Prachinburi
  '27': { ...EAST_COAST, outdoor_labor: 60, income_strain: 55, adaptive_deficit: 52 }, // Sa Kaeo

  // ── Northeast ────────────────────────────────────────────────────────
  '30': { ...NORTHEAST, outdoor_labor: 70, income_strain: 55 }, // Nakhon Ratchasima
  '31': { ...NORTHEAST }, // Buriram
  '32': { ...NORTHEAST }, // Surin
  '33': { ...NORTHEAST }, // Sisaket
  '34': { ...NORTHEAST, outdoor_labor: 72 }, // Ubon Ratchathani
  '35': { ...NORTHEAST, income_strain: 65 }, // Yasothon
  '36': { ...NORTHEAST }, // Chaiyaphum
  '37': { ...NORTHEAST, income_strain: 66, adaptive_deficit: 62 }, // Amnat Charoen
  '38': { ...NORTHEAST, outdoor_labor: 76, income_strain: 68, adaptive_deficit: 65 }, // Bueng Kan
  '39': { ...NORTHEAST, income_strain: 66 }, // Nong Bua Lamphu
  '40': { ...NORTHEAST, outdoor_labor: 65, income_strain: 52, adaptive_deficit: 48 }, // Khon Kaen (regional hub)
  '41': { ...NORTHEAST, outdoor_labor: 68, income_strain: 54 }, // Udon Thani
  '42': { ...NORTHEAST, outdoor_labor: 72, adaptive_deficit: 60 }, // Loei
  '43': { ...NORTHEAST, outdoor_labor: 70 }, // Nong Khai
  '44': { ...NORTHEAST }, // Maha Sarakham
  '45': { ...NORTHEAST }, // Roi Et
  '46': { ...NORTHEAST }, // Kalasin
  '47': { ...NORTHEAST, outdoor_labor: 75 }, // Sakon Nakhon
  '48': { ...NORTHEAST, outdoor_labor: 76, income_strain: 66, adaptive_deficit: 64 }, // Nakhon Phanom
  '49': { ...NORTHEAST, outdoor_labor: 74, income_strain: 65, adaptive_deficit: 62 }, // Mukdahan

  // ── North ────────────────────────────────────────────────────────────
  '50': { ...NORTH_BASIN, outdoor_labor: 68, income_strain: 48, adaptive_deficit: 52 }, // Chiang Mai (basin + tourism capacity mix)
  '51': { ...NORTH_BASIN }, // Lamphun
  '52': { ...NORTH_BASIN }, // Lampang
  '53': { ...NORTH_OTHER }, // Uttaradit
  '54': { ...NORTH_BASIN, outdoor_labor: 74, income_strain: 62 }, // Phrae
  '55': { ...NORTH_BASIN, outdoor_labor: 76, income_strain: 64, adaptive_deficit: 68 }, // Nan
  '56': { ...NORTH_BASIN, outdoor_labor: 74 }, // Phayao
  '57': { ...NORTH_BASIN, outdoor_labor: 74, income_strain: 58, adaptive_deficit: 60 }, // Chiang Rai
  '58': { ...NORTH_HIGHLAND }, // Mae Hong Son — highest social load archetype
  '63': { ...NORTH_HIGHLAND, outdoor_labor: 76, income_strain: 70, adaptive_deficit: 72 }, // Tak (border + highland)

  // ── South ────────────────────────────────────────────────────────────
  '80': { ...SOUTH, outdoor_labor: 55 }, // Nakhon Si Thammarat
  '81': { ...ISLAND_TOURISM, outdoor_labor: 60 }, // Krabi
  '82': { ...ISLAND_TOURISM, outdoor_labor: 62, adaptive_deficit: 42 }, // Phang Nga
  '83': { ...ISLAND_TOURISM, outdoor_labor: 50, income_strain: 32, adaptive_deficit: 28 }, // Phuket
  '84': { ...SOUTH, outdoor_labor: 52, income_strain: 42 }, // Surat Thani
  '85': { ...SOUTH, outdoor_labor: 58, income_strain: 55, adaptive_deficit: 55 }, // Ranong
  '86': { ...SOUTH, outdoor_labor: 56 }, // Chumphon
  '90': { ...SOUTH, outdoor_labor: 50, income_strain: 42, adaptive_deficit: 38 }, // Songkhla (hub)
  '91': { ...SOUTH, outdoor_labor: 58, income_strain: 55 }, // Satun
  '92': { ...SOUTH }, // Trang
  '93': { ...SOUTH }, // Phatthalung
  '94': { ...SOUTH_BORDER }, // Pattani
  '95': { ...SOUTH_BORDER }, // Yala
  '96': { ...SOUTH_BORDER, income_strain: 70 }, // Narathiwat
}

export const SOCIAL_LOAD_WEIGHTS = {
  outdoor_labor: 0.35,
  income_strain: 0.30,
  sensitivity: 0.20,
  adaptive_deficit: 0.15,
}

export const SOCIAL_LOAD_METHOD = {
  th: 'ภาระทางสังคมจากตัวแทนเชิงโครงสร้าง (แรงงานกลางแจ้ง 35% · ความตึงเครียดทางรายได้ 30% · ความเปราะบางตามวัย 20% · ข้อจำกัดในการปรับตัว 15%) — ตัวแทนโดยประมาณ ไม่ใช่สำมะโนรายจังหวัด',
  en: 'Social Load from structural proxies (outdoor labor 35% · income strain 30% · age sensitivity 20% · adaptive deficit 15%) — rounded proxies, not per-province census cells',
}
