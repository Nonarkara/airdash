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
