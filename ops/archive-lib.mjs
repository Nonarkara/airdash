// Pure helpers for ops/archive-longterm.mjs, split out so they can be unit
// tested (scripts/test-archive-longterm.mjs) without a database or the
// external volume. Nothing in here touches the filesystem.

export function parseMode(argv) {
  if (argv.includes('--stats')) return 'stats'
  if (argv.includes('--verify')) return 'verify'
  return 'run'
}

/**
 * What to do about an existing lock file.
 *   { action: 'acquire' }                       no lock, or it is ours
 *   { action: 'skip', pid, startedAt }          a live run holds it — do nothing
 *   { action: 'takeover', reason }              stale (owner dead) or unreadable
 */
export function lockDecision({ existing, isAlive, selfPid }) {
  if (!existing) return { action: 'acquire' }
  const pid = Number(existing.pid)
  if (!Number.isInteger(pid) || pid <= 0) return { action: 'takeover', reason: 'unreadable lock file' }
  if (pid === selfPid) return { action: 'acquire' }
  if (isAlive(pid)) return { action: 'skip', pid, startedAt: existing.startedAt ?? 'unknown' }
  return { action: 'takeover', reason: `stale lock left by pid ${pid} (no longer running)` }
}

export const fmtInt = (n) => Number(n ?? 0).toLocaleString('en-US')

export function fmtRate(rows, ms) {
  const min = Math.max(ms, 1) / 60_000
  return `${fmtInt(rows)} rows in ${min.toFixed(1)} min (${fmtInt(Math.round(rows / min))}/min)`
}

/** One coverage line: how far the archive watermark trails the live max id. */
export function lagLine(system, table, watermark, liveMax) {
  const behind = Math.max(0, (liveMax ?? 0) - (watermark ?? 0))
  const status = behind ? `${fmtInt(behind)} behind` : 'caught up'
  return `  ${`${system}.${table}`.padEnd(22)} archived to id ${fmtInt(watermark)} / live ${fmtInt(liveMax)} → ${status}`
}

/** Hours between the last successful finish and now; null if there never was one. */
export function staleHours(lastOkFinishedAt, nowMs) {
  if (!lastOkFinishedAt) return null
  const t = Date.parse(lastOkFinishedAt)
  if (!Number.isFinite(t)) return null
  return (nowMs - t) / 3_600_000
}
