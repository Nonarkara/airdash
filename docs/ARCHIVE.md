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
   `Nice 10`, so it never competes with an ingest for CPU. It is
   deliberately **not** `LowPriorityIO` — see *Why a run stalls* below.
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
node ops/archive-longterm.mjs --verify  # integrity_check + coverage + staleness
```

`--verify` exits 0 when the file is intact and a run succeeded in the last
24 h, 2 when the archive is stale, 1 when `integrity_check` fails. A run
ends with `flooddash: done` and `archive run complete`, followed by a
coverage block (archive watermark vs live max id per table). The full
row-count report only runs for `--stats` / `--verify` — counting 38 M rows
takes minutes and used to sit inside every scheduled run.

A run takes `/Volumes/Data/dash-archive/.archive.lock` (pid + start time).
A second run started while it is held logs `another archive run is still
in progress` and exits 0; a lock whose pid is dead is taken over.
`SIGTERM`/`SIGINT` stop a run cleanly at the next batch boundary and record
`interrupted` in `archive_runs`; the next run resumes from the watermark.

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
> launchctl kickstart gui/$(id -u)/com.dash.archive   # -k would kill a run in progress
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
(`ensureAnalysisIndexes`). Sustained load rate is ~700k rows/min on the
initial backfill. Incremental runs maintain that index; the archive
connection uses a 256 MB page cache (`PRAGMA cache_size`, default is 2 MB)
so the hot leaf per active series stays in memory instead of being a USB
read per insert, and `wal_autocheckpoint` is raised to 20k pages so
successive batches re-dirtying the same pages cost one checkpoint write,
not one per batch.

## Why a run stalls (post-mortem, 2026-09-16)

Symptom: the log showed `airdash: done` but never `flooddash: done`, and
nothing at all for later slots. Cause, in order:

1. `LowPriorityIO` in the plist is `IOPOL_THROTTLE`: the kernel sleeps the
   process on every disk I/O while any other process uses the same device,
   and the archive shares the USB volume with the NSP rsync loops. Measured
   on the archive file: 0.7 MB/s throttled vs 20 MB/s normal — about 1.4 s
   per I/O. Recovering a 94 MB WAL frame-by-frame after a reboot took hours
   before the first row was copied (and held the recovery lock, so even
   read-only queries saw `database is locked`); the FloodDash phase then ran
   at ~500 rows/min.
2. Every run also ended with a full-table stats report whose span query
   scanned the whole series index — 3.5 to 8.5 h per run.
3. launchd never starts a second instance while one is running, so the
   02:00 / 08:00 / 14:00 slots were skipped silently until a reboot or a
   volume unmount killed the run mid-FloodDash. Watermarks are per batch,
   so no data was lost — only the `done` line.

The script also relaunches itself once under `taskpolicy -d default`
(`DASH_ARCHIVE_UNTHROTTLED=1` marks the child). Tested: that escapes a
throttle set with `taskpolicy -d throttle`. **Not verified:** that launchd's
`LowPriorityIO` is the same knob — so do not rely on it instead of
reloading the plist. The per-stream `rows/min` lines in the first
launchd-started run are the check (hundreds/min = still throttled).

Fixes: `LowPriorityIO` removed (Nice stays), big page cache, cheap
coverage block instead of the scan in run mode, lock file so overlapping
runs are visible in the log, graceful SIGTERM, `ExitTimeOut 60`. If a
throttled instance from before the fix is still running, only killing it
(`launchctl kickstart -k`) ends it; `taskpolicy -B -p <pid>` was tested and
does not lift the throttle.

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
