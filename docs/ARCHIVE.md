# Long-term archive — AirDash + FloodDash

The permanent research record for both dashboards, on the 8 TB external
volume. One database, both systems, nothing ever deleted.

- **Database:** `/Volumes/Data/dash-archive/dash-archive.db` (SQLite, WAL)
- **Log:** `/Volumes/Data/dash-archive/archive.log`
- **Script:** `ops/archive-longterm.mjs`
- **Schedule:** `ops/com.dash.archive.plist` — 02:00, 08:00, 14:00, 20:00

## Why it exists

Both live systems keep raw readings for 90 days
(`CONFIG.retention.rawDays`), then roll them into hourly means and **delete
the raw rows**. `events` and `ingest_runs` are deleted outright at 90 days
with no rollup at all.

That is the correct policy for the live dashboards — a small database is a
fast database, and speed on the alert path is a life-safety property. But it
means sub-hourly detail and the entire operational history evaporate on a
rolling 90-day window. Questions worth asking after a year or two need
exactly that detail:

- How did the 2027 burning season compare with 2026, hour by hour?
- Which sensors fail first as an episode builds — and how early?
- Does washout-grade rain actually clear the air the way `washout.js` predicts?
- Do escalations cluster at night (when nobody is watching) more than by day?
- Which ingest pipelines degrade before a data gap becomes visible?

The archive copies the append-only streams out **before** retention destroys
them. The 02:00 run exists specifically because retention runs at 03:00.

> If you change `CONFIG.retention.runAtHour`, change the archive schedule
> too, or the margin disappears.

## Safety contract

This runs beside a system people rely on during haze and flood emergencies.

1. **Live databases are opened read-only** (`file:…?mode=ro`). The archiver
   cannot write to, lock-for-write, or corrupt production data — not through
   a bug, not through a bad query.
2. **Separate process, never in the server event loop.** A slow archive can
   never delay an alert.
3. **Batched with a yield** between batches (20k rows, 25 ms) plus
   `LowPriorityIO` and `Nice 10`, so it never competes with an ingest for
   disk.
4. **Fails soft.** Volume unmounted or unwritable → log and `exit 0`. A
   missing archive is an inconvenience; a crash-looping job that fills the
   internal disk is an outage. Never trade the second for the first.
5. **Idempotent.** Watermark-driven + `INSERT OR IGNORE`. Safe to run twice,
   safe to interrupt, safe to re-run after failure.
6. **No DELETE path exists anywhere in the script.** That is the point.

## Usage

```bash
node ops/archive-longterm.mjs           # incremental (what the schedule runs)
node ops/archive-longterm.mjs --stats   # what's in there; copies nothing
node ops/archive-longterm.mjs --verify  # integrity_check + coverage
```

## Install the schedule

```bash
cp ops/com.dash.archive.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dash.archive.plist
```

> **Full Disk Access is required.** macOS TCC blocks launchd agents from
> writing to external volumes by default. Without it the job runs, detects
> it cannot write, logs the reason and exits 0 — the archive silently stops
> updating. This is not hypothetical: FloodDash's backup job has been in
> `internal-fallback` for exactly this reason.
>
> Grant it: **System Settings → Privacy & Security → Full Disk Access →**
> add `/opt/homebrew/bin/node`. Then confirm:
>
> ```bash
> launchctl kickstart -k gui/$(id -u)/com.dash.archive
> tail -5 /Volumes/Data/dash-archive/archive.log
> ```
>
> A line reading `archive run complete` means it is working. A line about
> Full Disk Access means it is not.

## Schema

Every table carries a `system` column (`airdash` | `flooddash`) and
`src_id` (the row's id in its source database).

| Table | Contents |
|---|---|
| `readings` | Every raw reading, full resolution, forever |
| `alerts` | Alert history (what was sent, when, how severe) |
| `events` | The operational tap — deleted upstream at 90 days |
| `ingest_runs` | Per-pipeline reliability history — deleted upstream at 90 days |
| `news_items` | Fire/pollution/flood news context |
| `wq_readings` | Water quality (FloodDash) |
| `escalations` | Band transitions (FloodDash) |
| `stations` | Station metadata, refreshed each run |
| `archive_meta` | Per-table watermarks |
| `archive_runs` | Audit trail: every run, rows copied, errors |

### Indexing note

`readings` is keyed `(system, src_id)` — monotonic, so inserts append to
the end of the B-tree. Two earlier designs were rejected under measurement:

- `PRIMARY KEY (system, source, station_key, metric, obs_time) WITHOUT ROWID`
  — rows arrive in source-id order, which does not match that sort order, so
  every insert split pages. Throughput collapsed from ~100k to ~8k rows/min
  as the table grew.
- Keeping the wide per-series **index** live during the bulk load moved the
  same problem from the table into the index, with the same collapse.

The wide index is now built once, after the copy pass
(`ensureAnalysisIndexes`). Sustained load rate is ~700k rows/min.

## Example queries

```sql
-- Hourly PM2.5 for one station across the whole archive
SELECT substr(obs_time,1,13) AS hour, AVG(value)
FROM readings
WHERE system='airdash' AND metric='pm25' AND station_key=?
GROUP BY hour ORDER BY hour;

-- Which pipelines fail most, by month
SELECT substr(started_at,1,7) AS month, source,
       SUM(ok=0) AS failures, COUNT(*) AS runs
FROM ingest_runs GROUP BY month, source
HAVING failures > 0 ORDER BY month, failures DESC;

-- Did rain actually cut PM2.5? Join air readings to rain readings by hour.
-- (Both systems in one database is what makes this join possible at all.)
```
