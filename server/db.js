// SQLite storage — zero dependencies via node:sqlite. WAL for 24/7 concurrency.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { CONFIG } from './config.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stations (
  source       TEXT NOT NULL,
  station_key  TEXT NOT NULL,
  name_th      TEXT,
  name_en      TEXT,
  province_th  TEXT,
  province_en  TEXT,
  province_code TEXT,
  region_th    TEXT,
  region_en    TEXT,
  basin_th     TEXT,
  basin_en     TEXT,
  lat          REAL,
  lng          REAL,
  meta_json    TEXT,
  first_seen   TEXT NOT NULL,
  last_seen    TEXT NOT NULL,
  PRIMARY KEY (source, station_key)
);
-- Drives the place-card nearest-station lookups (bbox on lat/lng). Without it,
-- those queries scan the latest table and seek stations per row — hundreds of
-- random cold-disk reads that froze the event loop for tens of seconds on the
-- first /api/place after a cache eviction.
CREATE INDEX IF NOT EXISTS idx_stations_geo ON stations(lat, lng);

CREATE TABLE IF NOT EXISTS readings (
  id          INTEGER PRIMARY KEY,
  source      TEXT NOT NULL,
  station_key TEXT NOT NULL,
  metric      TEXT NOT NULL,
  value       REAL NOT NULL,
  obs_time    TEXT NOT NULL,
  fetched_at  TEXT NOT NULL,
  UNIQUE (source, station_key, metric, obs_time)
);
CREATE INDEX IF NOT EXISTS idx_readings_lookup ON readings(source, station_key, metric, obs_time DESC);
CREATE INDEX IF NOT EXISTS idx_readings_time ON readings(obs_time);
-- Serves every metric+time-window analytics query as a COVERING index:
--   /api/series/daily   WHERE metric=? AND obs_time>=?            (day GROUP BY)
--   sensors flatline    ... AND source=? GROUP BY station_key     (MIN/MAX value)
--   sensors mismatch    ... AND source=? GROUP BY station_key/province
--   insights compound   ... AND source=? GROUP BY station_key     (rise per 6h)
-- All five columns live in the index, so these scans never touch the huge
-- readings table itself. That matters: a query that filters or groups on a
-- column OUTSIDE the index (an earlier version omitted source/station_key)
-- does one random table seek per matched row — thousands of cold-page disk
-- reads that froze the synchronous event loop for 25s+ per call.
-- (Supersedes the two earlier, narrower indexes; drop them if present.)
DROP INDEX IF EXISTS idx_readings_metric_time;
DROP INDEX IF EXISTS idx_readings_metric_value;
CREATE INDEX IF NOT EXISTS idx_readings_metric_cover
  ON readings(metric, obs_time, source, station_key, value);

-- Latest value per (source, station, metric) — O(1) snapshots for UI/risk/RAG.
CREATE TABLE IF NOT EXISTS latest (
  source      TEXT NOT NULL,
  station_key TEXT NOT NULL,
  metric      TEXT NOT NULL,
  value       REAL NOT NULL,
  obs_time    TEXT NOT NULL,
  PRIMARY KEY (source, station_key, metric)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS readings_hourly (
  source      TEXT NOT NULL,
  station_key TEXT NOT NULL,
  metric      TEXT NOT NULL,
  hour        TEXT NOT NULL,
  v_min REAL, v_max REAL, v_avg REAL, n INTEGER,
  PRIMARY KEY (source, station_key, metric, hour)
);

-- The running tap, persisted. events.id doubles as the SSE event id.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY,
  ts          TEXT NOT NULL,
  kind        TEXT NOT NULL,       -- batch|datum|alert|news|status|system
  source      TEXT,
  station_key TEXT,
  severity    INTEGER DEFAULT 0,   -- 0 info, 1 notable, 2 warning, 3 critical
  title_th    TEXT,
  title_en    TEXT,
  payload_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY,
  ts          TEXT NOT NULL,
  rule        TEXT NOT NULL,
  source      TEXT,
  station_key TEXT,
  province_th TEXT,
  province_en TEXT,
  severity    INTEGER NOT NULL,
  value       REAL,
  prev_value  REAL,
  message_th  TEXT,
  message_en  TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts DESC);

-- province_code/th/en + lat/lng: best-effort geotag (province-name substring
-- match against the headline, see server/provinces.js matchProvinceInText)
-- so fire/pollution news can be pinned on the map next to the AQ reading for
-- that same place. is_fire flags headlines naming open burning / wildfire /
-- hotspots specifically, for the red map marker treatment. All nullable —
-- most headlines don't name a single province and that's fine, they just
-- don't get a map pin.
CREATE TABLE IF NOT EXISTS news_items (
  id           INTEGER PRIMARY KEY,
  feed         TEXT NOT NULL,
  guid         TEXT NOT NULL UNIQUE,
  title        TEXT,
  link         TEXT,
  published_at TEXT,
  fetched_at   TEXT,
  province_code TEXT,
  province_th   TEXT,
  province_en   TEXT,
  lat           REAL,
  lng           REAL,
  is_fire       INTEGER DEFAULT 0
);
-- idx_news_province is created in migrate() below, not here: on a pre-
-- existing DB this CREATE TABLE is a no-op (the table already exists
-- without these columns), so an index on province_code run at this point,
-- before migrate() adds the column, fails with "no such column".

CREATE TABLE IF NOT EXISTS rag_docs (
  id         INTEGER PRIMARY KEY,
  doc_key    TEXT NOT NULL UNIQUE,
  title      TEXT,
  lang       TEXT,
  content    TEXT NOT NULL,
  content_hash TEXT,
  embedding  BLOB,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id         INTEGER PRIMARY KEY,
  source     TEXT NOT NULL,
  started_at TEXT NOT NULL,
  dur_ms     INTEGER,
  ok         INTEGER,
  rows_seen  INTEGER,
  rows_new   INTEGER,
  error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingest_runs ON ingest_runs(source, started_at DESC);

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);

-- ── Chat telemetry — every question the operator asks is logged here so we
-- can build a FAQ over time. ip_hash is the SHA-256 of the client IP so
-- the table is usable for analytics without storing PII.
CREATE TABLE IF NOT EXISTS chat_logs (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  ip_hash TEXT,
  lang TEXT,
  message TEXT NOT NULL,
  facts_len INTEGER,
  knowledge_titles TEXT,    -- JSON array
  latency_ms INTEGER,
  served_from TEXT,         -- 'llm' | 'faq' | 'fallback'
  faq_id INTEGER,           -- if served from faq
  faq_score REAL,
  response_len INTEGER,
  feedback INTEGER           -- 1 = 👍, -1 = 👎, NULL = none yet
);
CREATE INDEX IF NOT EXISTS idx_chat_logs_ts ON chat_logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_served ON chat_logs(served_from, ts DESC);

-- ── FAQ cache — clustered from chat_logs when ≥ 3 similar questions in 7d
-- arrive with the same answer pattern. cosine centroid stored as BLOB
-- (Float32Array). served_count tracks reuses.
CREATE TABLE IF NOT EXISTS chat_faq (
  id INTEGER PRIMARY KEY,
  cluster_key TEXT UNIQUE,
  pattern TEXT NOT NULL,        -- canonical Thai / English pattern
  pattern_th TEXT,
  pattern_en TEXT,
  lang TEXT,
  count INTEGER DEFAULT 0,
  example_msg TEXT,
  response_template TEXT NOT NULL,
  centroid BLOB,
  approved INTEGER DEFAULT 0,   -- 0 = draft, 1 = approved for auto-serve
  created_at TEXT,
  updated_at TEXT,
  served_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_faq_lang ON chat_faq(lang, approved, served_count DESC);

`

// Additive column migrations for tables that predate a field — CREATE TABLE
// IF NOT EXISTS never touches a table that already exists, so a new column
// needs an explicit, idempotent ALTER TABLE guarded by what's already there.
function migrate(db) {
  const news_items = db.prepare("PRAGMA table_info(news_items)").all().map((c) => c.name)
  const addCol = (table, name, decl) => {
    if (!news_items.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`)
  }
  addCol('news_items', 'province_code', 'TEXT')
  addCol('news_items', 'province_th', 'TEXT')
  addCol('news_items', 'province_en', 'TEXT')
  addCol('news_items', 'lat', 'REAL')
  addCol('news_items', 'lng', 'REAL')
  addCol('news_items', 'is_fire', 'INTEGER DEFAULT 0')
  // Safe to run every boot regardless of whether the columns above were
  // just added or already existed — the columns are guaranteed present now.
  db.exec('CREATE INDEX IF NOT EXISTS idx_news_province ON news_items(province_code, fetched_at DESC)')
}

export function openDb(path = CONFIG.dbPath) {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA synchronous=NORMAL')
  db.exec('PRAGMA busy_timeout=5000')
  db.exec(SCHEMA)
  migrate(db)
  return wrap(db)
}

function wrap(db) {
  const stmts = new Map()
  const prep = (sql) => {
    let s = stmts.get(sql)
    if (!s) { s = db.prepare(sql); stmts.set(sql, s) }
    return s
  }

  return {
    raw: db,
    prep,
    get: (sql, ...args) => prep(sql).get(...args),
    all: (sql, ...args) => prep(sql).all(...args),
    run: (sql, ...args) => prep(sql).run(...args),
    exec: (sql) => db.exec(sql),
    tx(fn) {
      db.exec('BEGIN')
      try { const r = fn(); db.exec('COMMIT'); return r }
      catch (e) { db.exec('ROLLBACK'); throw e }
    },

    upsertStation(s) {
      prep(`INSERT INTO stations (source, station_key, name_th, name_en, province_th, province_en,
              province_code, region_th, region_en, basin_th, basin_en, lat, lng, meta_json, first_seen, last_seen)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(source, station_key) DO UPDATE SET
              name_th=excluded.name_th, name_en=excluded.name_en,
              province_th=excluded.province_th, province_en=excluded.province_en,
              province_code=excluded.province_code, region_th=excluded.region_th, region_en=excluded.region_en,
              basin_th=excluded.basin_th, basin_en=excluded.basin_en,
              lat=excluded.lat, lng=excluded.lng, meta_json=excluded.meta_json,
              last_seen=excluded.last_seen`)
        .run(s.source, s.station_key, s.name_th, s.name_en, s.province_th, s.province_en,
             s.province_code ?? null, s.region_th ?? null, s.region_en ?? null,
             s.basin_th ?? null, s.basin_en ?? null, s.lat ?? null, s.lng ?? null,
             s.meta_json ?? null, s.now, s.now)
    },

    /** Returns true when the row is genuinely new (dedupe via UNIQUE constraint). */
    insertReading(r) {
      const res = prep(`INSERT OR IGNORE INTO readings (source, station_key, metric, value, obs_time, fetched_at)
                        VALUES (?,?,?,?,?,?)`)
        .run(r.source, r.station_key, r.metric, r.value, r.obs_time, r.fetched_at)
      if (res.changes > 0) {
        prep(`INSERT INTO latest (source, station_key, metric, value, obs_time) VALUES (?,?,?,?,?)
              ON CONFLICT(source, station_key, metric) DO UPDATE SET
                value=excluded.value, obs_time=excluded.obs_time
              WHERE excluded.obs_time >= latest.obs_time`)
          .run(r.source, r.station_key, r.metric, r.value, r.obs_time)
        return true
      }
      return false
    },

    insertEvent(e) {
      const res = prep(`INSERT INTO events (ts, kind, source, station_key, severity, title_th, title_en, payload_json)
                        VALUES (?,?,?,?,?,?,?,?)`)
        .run(e.ts, e.kind, e.source ?? null, e.station_key ?? null, e.severity ?? 0,
             e.title_th ?? null, e.title_en ?? null, e.payload_json ?? null)
      return Number(res.lastInsertRowid)
    },

    insertAlert(a) {
      const res = prep(`INSERT INTO alerts (ts, rule, source, station_key, province_th, province_en,
                          severity, value, prev_value, message_th, message_en)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(a.ts, a.rule, a.source, a.station_key, a.province_th ?? null, a.province_en ?? null,
             a.severity, a.value ?? null, a.prev_value ?? null, a.message_th, a.message_en)
      return Number(res.lastInsertRowid)
    },

    /** Returns true when the item is new. */
    insertNews(n) {
      const res = prep(`INSERT OR IGNORE INTO news_items
                          (feed, guid, title, link, published_at, fetched_at,
                           province_code, province_th, province_en, lat, lng, is_fire)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(n.feed, n.guid, n.title, n.link, n.published_at, n.fetched_at,
             n.province_code ?? null, n.province_th ?? null, n.province_en ?? null,
             n.lat ?? null, n.lng ?? null, n.is_fire ? 1 : 0)
      return res.changes > 0
    },

    recordRun(r) {
      prep(`INSERT INTO ingest_runs (source, started_at, dur_ms, ok, rows_seen, rows_new, error)
            VALUES (?,?,?,?,?,?,?)`)
        .run(r.source, r.started_at, r.dur_ms, r.ok ? 1 : 0, r.rows_seen ?? 0, r.rows_new ?? 0, r.error ?? null)
    },

    kvGet(key) {
      return prep('SELECT value FROM kv WHERE key = ?').get(key)?.value ?? null
    },
    kvSet(key, value) {
      prep('INSERT INTO kv (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .run(key, value)
    },
  }
}
