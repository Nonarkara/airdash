// Connected-waterways model — the river network as a directed cascade graph.
//
// Each reach is a real GloFAS channel cell (coordinates grid-snapped to the
// max-discharge cell so the numbers reflect the main stem, not a dry tributary).
// `downstream` + `lagDays` encode flood-wave routing: discharge rising at an
// upstream reach today shows up downstream ~lagDays later. This is the physical
// basis of "connected waterways" — upstream rain becomes downstream flood.
//
// Discharge is fetched from the free Open-Meteo Flood API (GloFAS v4, 5 km,
// river_discharge in m³/s, 46-day forecast, no key).

/** @typedef {{ id:string, name_th:string, name_en:string, basin_th:string,
 *   basin_en:string, region_th:string, region_en:string, lat:number, lng:number,
 *   downstream:string|null, lagDays:number, watch:number, warning:number,
 *   emergency:number, note_th:string, note_en:string }} Reach */

// Per-reach discharge thresholds (m³/s). Scaled to each reach's channel size —
// a 3-order-of-magnitude range means one global threshold would be meaningless.
// watch = approx bankfull onset, emergency ≈ major-flood territory for that reach.
export const REACHES = [
  // ── Chao Phraya system (North → Central → Gulf) ─────────────────────────────
  { id: 'ping_tak',        name_th: 'ปิง ที่ตาก',            name_en: 'Ping at Tak',
    basin_th: 'ลุ่มน้ำปิง',  basin_en: 'Ping',   region_th: 'ภาคเหนือ', region_en: 'North',
    lat: 16.67, lng: 99.23,  downstream: 'cp_nakhonsawan', lagDays: 2.0,
    watch: 500, warning: 900, emergency: 1400,
    note_th: 'ท้ายเขื่อนภูมิพล', note_en: 'below Bhumibol Dam' },

  { id: 'yom_sukhothai',   name_th: 'ยม ที่สุโขทัย',          name_en: 'Yom at Sukhothai',
    basin_th: 'ลุ่มน้ำยม',   basin_en: 'Yom',    region_th: 'ภาคเหนือ', region_en: 'North',
    lat: 17.16, lng: 100.02, downstream: 'cp_nakhonsawan', lagDays: 1.5,
    watch: 400, warning: 700, emergency: 1100,
    note_th: 'ยมไม่มีเขื่อนใหญ่ — ท่วมสุโขทัยบ่อย', note_en: 'unregulated — floods Sukhothai often' },

  { id: 'nan_phitsanulok', name_th: 'น่าน ที่พิษณุโลก',      name_en: 'Nan at Phitsanulok',
    basin_th: 'ลุ่มน้ำน่าน', basin_en: 'Nan',    region_th: 'ภาคเหนือ', region_en: 'North',
    lat: 16.63, lng: 100.16, downstream: 'cp_nakhonsawan', lagDays: 1.0,
    watch: 500, warning: 900, emergency: 1400,
    note_th: 'ท้ายเขื่อนสิริกิติ์', note_en: 'below Sirikit Dam' },

  { id: 'cp_nakhonsawan',  name_th: 'เจ้าพระยา ที่นครสวรรค์', name_en: 'Chao Phraya at Nakhon Sawan',
    basin_th: 'ลุ่มเจ้าพระยา', basin_en: 'Chao Phraya', region_th: 'ภาคเหนือ', region_en: 'North',
    lat: 15.63, lng: 100.02, downstream: 'cp_chainat', lagDays: 1.0,
    watch: 2000, warning: 3500, emergency: 5000,
    note_th: 'จุดบรรจบปิง-น่าน (C.2) — ตัวชี้วัดหลักของลุ่มเจ้าพระยา',
    note_en: 'Ping–Nan confluence (C.2) — the master gauge for the Chao Phraya' },

  { id: 'cp_chainat',      name_th: 'เจ้าพระยา ที่ชัยนาท',   name_en: 'Chao Phraya at Chai Nat',
    basin_th: 'ลุ่มเจ้าพระยา', basin_en: 'Chao Phraya', region_th: 'ภาคกลาง', region_en: 'Central',
    lat: 15.22, lng: 100.03, downstream: 'cp_ayutthaya', lagDays: 1.5,
    watch: 1800, warning: 2800, emergency: 3500,
    note_th: 'เขื่อนเจ้าพระยา — ประตูควบคุมน้ำเข้าที่ราบภาคกลาง',
    note_en: 'Chao Phraya Dam — the gate controlling the central plain' },

  { id: 'cp_ayutthaya',    name_th: 'เจ้าพระยา ที่อยุธยา',    name_en: 'Chao Phraya at Ayutthaya',
    basin_th: 'ลุ่มเจ้าพระยา', basin_en: 'Chao Phraya', region_th: 'ภาคกลาง', region_en: 'Central',
    lat: 14.25, lng: 100.5,  downstream: 'cp_bangkok', lagDays: 1.5,
    watch: 1500, warning: 2500, emergency: 3200,
    note_th: 'เมืองมรดกโลก — ท่วมหนักปี 2554', note_en: 'World Heritage city — inundated in 2011' },

  { id: 'cp_bangkok',      name_th: 'เจ้าพระยา ที่กรุงเทพฯ',  name_en: 'Chao Phraya at Bangkok',
    basin_th: 'ลุ่มเจ้าพระยา', basin_en: 'Chao Phraya', region_th: 'ภาคกลาง', region_en: 'Central',
    lat: 13.87, lng: 100.45, downstream: null, lagDays: 0,
    watch: 1500, warning: 2500, emergency: 3000,
    note_th: 'ปลายน้ำ — เมืองหลวง 10 ล้านคน', note_en: 'the outlet — a 10-million capital' },

  // ── Chi–Mun system (Northeast → Mekong) ─────────────────────────────────────
  { id: 'chi_chaiyaphum',  name_th: 'ชี ที่ชัยภูมิ',          name_en: 'Chi at Chaiyaphum',
    basin_th: 'ลุ่มน้ำชี',   basin_en: 'Chi',    region_th: 'ภาคอีสาน', region_en: 'Northeast',
    lat: 15.75, lng: 102.18, downstream: 'chi_mahasarakham', lagDays: 1.5,
    watch: 150, warning: 300, emergency: 500,
    note_th: 'ต้นน้ำชี', note_en: 'upper Chi' },

  { id: 'chi_mahasarakham', name_th: 'ชี ที่มหาสารคาม',       name_en: 'Chi at Maha Sarakham',
    basin_th: 'ลุ่มน้ำชี',   basin_en: 'Chi',    region_th: 'ภาคอีสาน', region_en: 'Northeast',
    lat: 16.18, lng: 103.55, downstream: 'mun_ubon', lagDays: 2.0,
    watch: 400, warning: 700, emergency: 1100,
    note_th: 'ชีตอนกลาง', note_en: 'middle Chi' },

  { id: 'mun_korat',       name_th: 'มูล ที่โคราช',           name_en: 'Mun at Nakhon Ratchasima',
    basin_th: 'ลุ่มน้ำมูล',  basin_en: 'Mun',    region_th: 'ภาคอีสาน', region_en: 'Northeast',
    lat: 15.22, lng: 102.35, downstream: 'mun_ubon', lagDays: 2.0,
    watch: 200, warning: 400, emergency: 700,
    note_th: 'ต้นน้ำมูล', note_en: 'upper Mun' },

  { id: 'mun_ubon',        name_th: 'มูล ที่อุบลราชธานี',     name_en: 'Mun at Ubon Ratchathani',
    basin_th: 'ลุ่มน้ำมูล',  basin_en: 'Mun',    region_th: 'ภาคอีสาน', region_en: 'Northeast',
    lat: 15.33, lng: 105.11, downstream: null, lagDays: 0,
    watch: 800, warning: 1600, emergency: 2500,
    note_th: 'จุดบรรจบชี-มูล ก่อนลงโขง (M.7) — ท่วมอุบลปี 2562',
    note_en: 'Chi–Mun outlet to the Mekong (M.7) — flooded Ubon in 2019' },

  // ── Southern basins (flash-flood dominated) ─────────────────────────────────
  { id: 'utaphao_hatyai',  name_th: 'คลองอู่ตะเภา ที่หาดใหญ่', name_en: 'Khlong U-Taphao at Hat Yai',
    basin_th: 'ลุ่มน้ำทะเลสาบสงขลา', basin_en: 'Songkhla Lake', region_th: 'ภาคใต้', region_en: 'South',
    lat: 7.21, lng: 100.42, downstream: null, lagDays: 0,
    watch: 120, warning: 250, emergency: 400,
    note_th: 'คลองผ่านหาดใหญ่ — ลุ่มน้ำเล็ก น้ำมาเร็ว ท่วมฉับพลัน',
    note_en: 'the canal through Hat Yai — a small, flashy catchment' },

  { id: 'tapi_surat',      name_th: 'ตาปี ที่สุราษฎร์ธานี',   name_en: 'Tapi at Surat Thani',
    basin_th: 'ลุ่มน้ำตาปี', basin_en: 'Tapi',   region_th: 'ภาคใต้', region_en: 'South',
    lat: 9.19, lng: 99.33,  downstream: null, lagDays: 0,
    watch: 400, warning: 800, emergency: 1300,
    note_th: 'แม่น้ำใหญ่สุดของภาคใต้', note_en: "the South's largest river" },

  { id: 'pattani_river',   name_th: 'ปัตตานี ที่ปัตตานี',     name_en: 'Pattani at Pattani',
    basin_th: 'ลุ่มน้ำปัตตานี', basin_en: 'Pattani', region_th: 'ภาคใต้', region_en: 'South',
    lat: 6.82, lng: 101.2,  downstream: null, lagDays: 0,
    watch: 150, warning: 300, emergency: 500,
    note_th: 'ท้ายเขื่อนบางลาง', note_en: 'below Bang Lang Dam' },

  // ── East ────────────────────────────────────────────────────────────────────
  { id: 'bangpakong',      name_th: 'บางปะกง ที่ฉะเชิงเทรา',  name_en: 'Bang Pakong at Chachoengsao',
    basin_th: 'ลุ่มน้ำบางปะกง', basin_en: 'Bang Pakong', region_th: 'ภาคตะวันออก', region_en: 'East',
    lat: 13.59, lng: 101.02, downstream: null, lagDays: 0,
    watch: 200, warning: 400, emergency: 650,
    note_th: 'ที่ราบลุ่มภาคตะวันออก', note_en: 'the eastern lowland river' },
]

export const REACH_BY_ID = new Map(REACHES.map((r) => [r.id, r]))

/** discharge (m³/s) → risk band for a specific reach's thresholds. */
export function dischargeBand(reach, q) {
  if (q === null || q === undefined) return 'unknown'
  if (q >= reach.emergency) return 'emergency'
  if (q >= reach.warning) return 'warning'
  if (q >= reach.watch) return 'watch'
  return 'normal'
}

/** Upstream reaches that flow INTO the given reach id. */
export function upstreamOf(id) {
  return REACHES.filter((r) => r.downstream === id)
}

/** The full downstream chain from a reach to the sea/outlet, with cumulative lag. */
export function downstreamChain(id) {
  const chain = []
  let cur = REACH_BY_ID.get(id)
  let cumLag = 0
  while (cur) {
    chain.push({ reach: cur, cumLagDays: cumLag })
    if (!cur.downstream) break
    cumLag += cur.lagDays
    cur = REACH_BY_ID.get(cur.downstream)
  }
  return chain
}
