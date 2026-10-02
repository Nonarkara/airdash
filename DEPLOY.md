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
                                           └─ Cloudflare Tunnel → localhost:28341 (this Mac)
```

## 1. Frontend → Cloudflare Pages

```bash
npm run deploy                    # version/syntax guards + canonical-first verification
```

Or the manual steps (only if you know the poison-window rules below):

```bash
bash setup.sh
npx wrangler pages deploy public --project-name airdash
```

> **`git push` does NOT deploy the frontend.** This is a Pages
> *direct-upload* project. Use `scripts/deploy-frontend.sh`.

> **Do not verify a new `?v=` URL on `air.nonarkara.org` until the
> canonical alias shows the new build.** After a successful deploy the
> custom domain can keep serving the PREVIOUS deployment for several
> minutes. Anything that requests a new versioned asset in that window
> caches the OLD bytes under the NEW key. Check in this order:
>
> ```bash
> curl -s https://airdash.pages.dev/ | grep -o 'v=[0-9.]*' | sort -u
> curl -s https://air.nonarkara.org/ | grep -o 'v=[0-9.]*' | sort -u
> ```
>
> `_headers` caps `/js/*` and `/css/*` at 7 days without `immutable` so
> any repeat of that poison self-heals in days, not a year.

First run creates the `airdash` project (URL `airdash.pages.dev`). Add the
custom domain once (dashboard: Pages → airdash → Custom domains →
`air.nonarkara.org`, or via API). Redeploy anytime by re-running the deploy
command.

The Pages proxy signs visitor IPs for backend rate limiting. Production uses
the Pages secret `AIRDASH_PROXY_SECRET`, matching `data/.proxy-secret` on the
backend (a private, ignored file, mode 0600). `AIRDASH_PROXY_SECRET` in the
backend environment can override the file. Provision the same key on every
backend; rotate both sides together, redeploy Pages, and restart each backend.
Without a matching key the backend uses the Cloudflare connection IP, so
Pages visitors share a rate-limit bucket. Never commit or print the key.

Live failover requires a provisioned second server and a Pages
`AIRDASH_BACKUP` binding containing its HTTPS origin. No live backup is
configured by default; the former `api2-air.nonarkara.org` hostname does not
resolve. The stale edge mirror remains the last fallback for supported reads.

## 2. Backend tunnel (one-time, needs your browser)

```bash
cloudflared tunnel login           # opens browser — pick the nonarkara.org zone
bash ops/setup-tunnel.sh           # creates tunnel, DNS, and a 24/7 launchd service
```

This maps `https://api-air.nonarkara.org → http://localhost:28341` and installs
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
It creates a consistent live WAL-mode snapshot with `VACUUM INTO`, then runs a
bounded `PRAGMA quick_check` on the compacted snapshot. Production backups go
to `/Volumes/Data/DBBackups/airdash`, on a separate physical drive. Each run:

1. Stages on the internal SSD when space allows, verifies there, copies to the
   external drive, compares bytes, and atomically publishes the verified copy.
2. Keeps the last seven external snapshots. If the external drive is unavailable,
   keeps two internal fallback snapshots and logs the degraded recovery mode.
3. Refreshes `data/backups/airdash-latest.db.gz` atomically on the internal disk.
4. Bounds snapshot, verification, copy and compression stages so a hung disk
   cannot prevent the following night's job.

Progress and errors go to `logs/backup.log` (stderr to
`logs/backup.err.log`). To run one manually: `bash ops/backup-db.sh`.

**Restore:** stop the server (`launchctl unload ~/Library/LaunchAgents/com.airdash.server.plist`),
copy the chosen snapshot back over `data/airdash.db` (remove any stale
`data/airdash.db-wal`/`-shm` first), then start it again
(`launchctl load ~/Library/LaunchAgents/com.airdash.server.plist`).

**Known gap:** the external drive is separate from the boot disk but remains
attached to the same machine/site. Offsite sync is not configured. A real second
backend is also not configured; an edge mirror is stale read availability, not
live failover.

### Archive availability monitoring

`/api/health` exposes `archive.storage.available`, `reason`, and `checked_at`.
The sentinel probes at boot and every five minutes; a recent archive receipt
does not suppress a missing-drive alarm. Availability means the archive file
is present on a device distinct from the live DB, not that its contents have
passed an integrity check. An unmounted directory on the internal disk is
rejected, and nightly backup selection also checks device identity. The
external archive and nightly snapshots are separate from offsite recovery.

The header width gate exits 0 only after live values and a verdict render,
1 for measured geometry failures, and 2 for an unmeasurable run. Missing
Playwright must never be treated as a successful release check.
