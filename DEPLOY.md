# Deploying AirDash

AirDash has two halves that deploy differently:

| Half | What | Where it runs |
|------|------|---------------|
| **Backend** | Node server: SQLite + 7 live pipelines + SSE + chat | **This Mac, 24/7** (it is inherently stateful — it cannot run on serverless edge) |
| **Frontend** | Static UI (`public/`) + a tiny `/api/*` proxy Function | **Cloudflare Pages** → `airdash.pages.dev` / `air.nonarkara.org` |

The public page reaches the live Mac backend through a **named Cloudflare Tunnel**
(`api-air.nonarkara.org`). The Pages Function in `functions/api/[[path]].js`
proxies `/api/*` (including the SSE tap and streaming chat) to that tunnel, so
the frontend stays same-origin with no CORS.

```
Browser → air.nonarkara.org (Cloudflare Pages: static UI)
            └─ /api/* → Pages Function → api-air.nonarkara.org
                                           └─ Cloudflare Tunnel → localhost:8341 (this Mac)
```

## 1. Frontend → Cloudflare Pages

```bash
bash setup.sh                      # ensure public/vendor + public/fonts exist
npx wrangler pages deploy public --project-name airdash
```

First run creates the `airdash` project (URL `airdash.pages.dev`). Add the
custom domain once (dashboard: Pages → airdash → Custom domains →
`air.nonarkara.org`, or via API). Redeploy anytime by re-running the deploy
command.

## 2. Backend tunnel (one-time, needs your browser)

```bash
cloudflared tunnel login           # opens browser — pick the nonarkara.org zone
bash ops/setup-tunnel.sh           # creates tunnel, DNS, and a 24/7 launchd service
```

This maps `https://api-air.nonarkara.org → http://localhost:8341` and installs
`com.airdash.tunnel` so it restarts on boot/crash — matching the
`com.airdash.server` service.

## 3. Verify

```bash
curl https://api-air.nonarkara.org/api/health     # backend via tunnel
curl https://api-air.nonarkara.org/api/washout    # the signature feature
open https://air.nonarkara.org                    # full dashboard, live
```

## Notes

- The Mac must stay awake for live data (System Settings → keep awake on power).
- Almost no secrets — every core data source is keyless (only the optional
  NASA Earthdata token for IMERG, stored in the SQLite kv table).
- The Air Library (`corpus/bible/`) is ingested at **boot**; after editing
  bible or knowledge markdown, restart the server service to refresh it.
- If you ever want a fully edge-hosted variant, the backend would need a rewrite
  (D1 for storage, Cron-triggered Workers for pipelines, Durable Objects for SSE).
  That abandons the "runs on my Mac" design, so the tunnel approach is the
  right fit here.

## Optional integrations (each = one free token, one command)

| Feature | Get the token | Activate |
|---|---|---|
| AI chat + semantic search (NVIDIA NIM) | build.nvidia.com → API key | `node scripts/set-llm-key.mjs nvapi-…` |
| Satellite rain (NASA GPM IMERG) | urs.earthdata.nasa.gov → approve "NASA GESDISC DATA ARCHIVE" app → Generate Token | `node scripts/set-earthdata-token.mjs <token>` |
| LINE OA alert broadcasts | developers.line.biz → Messaging API channel → channel access token | `node scripts/set-line-token.mjs <token>` |

Every feature degrades gracefully when its token is absent: chat falls back
to a structured live-data summary, the imerg source skips quietly, LINE
pushes are a no-op. Tokens live in the SQLite kv table — never in git.

## Backups & recovery

A nightly LaunchAgent (`com.airdash.backup`, installed from
`ops/com.airdash.backup.plist`) runs `ops/backup-db.sh` every day at **03:17**.
It uses SQLite's online backup API (`sqlite3 data/airdash.db ".backup …"`),
which is safe against the live WAL-mode database — the server does **not**
need to stop. Each run:

1. Writes a timestamped snapshot to `data/backups/airdash-YYYYMMDD-HHMM.db`.
2. Verifies it with `PRAGMA integrity_check;` (a failed snapshot is kept
   for forensics and the job exits non-zero, logged loudly).
3. Keeps the **last 7** snapshots; older ones are deleted.
4. Refreshes `data/backups/airdash-latest.db.gz` (gzip -9 of the newest
   snapshot, swapped in atomically) — a single stable filename an offsite
   sync can grab later.

Progress and errors go to `logs/backup.log` (stderr to
`logs/backup.err.log`). To run one manually: `bash ops/backup-db.sh`.

**Restore:** stop the server (`launchctl unload ~/Library/LaunchAgents/com.airdash.server.plist`),
copy the chosen snapshot back over `data/airdash.db` (remove any stale
`data/airdash.db-wal`/`-shm` first), then start it again
(`launchctl load ~/Library/LaunchAgents/com.airdash.server.plist`).

**Known gap:** backups live on the same disk as the database — they protect
against corruption and bad writes, not against disk/machine loss. Offsite
sync of `data/backups/airdash-latest.db.gz` is a planned future step.
