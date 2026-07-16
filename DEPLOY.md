# Deploying FloodDash

FloodDash has two halves that deploy differently:

| Half | What | Where it runs |
|------|------|---------------|
| **Backend** | Node server: SQLite + 9 live pipelines + SSE + local Ollama chat | **This Mac, 24/7** (it is inherently stateful and uses a local LLM — it cannot run on serverless edge) |
| **Frontend** | Static UI (`public/`) + a tiny `/api/*` proxy Function | **Cloudflare Pages** → `flood.pages.dev` / `flood.nonarkara.org` |

The public page reaches the live Mac backend through a **named Cloudflare Tunnel**
(`api-flood.nonarkara.org`). The Pages Function in `functions/api/[[path]].js`
proxies `/api/*` (including the SSE tap and streaming chat) to that tunnel, so
the frontend stays same-origin with no CORS.

```
Browser → flood.nonarkara.org (Cloudflare Pages: static UI)
            └─ /api/* → Pages Function → api-flood.nonarkara.org
                                           └─ Cloudflare Tunnel → localhost:8340 (this Mac)
```

## 1. Frontend → Cloudflare Pages

```bash
bash setup.sh                      # ensure public/vendor + public/fonts exist
npx wrangler pages deploy public --project-name flood
```

First run creates the `flood` project (URL `flood.pages.dev`). Add the custom
domain once (dashboard: Pages → flood → Custom domains → `flood.nonarkara.org`,
or via API). Redeploy anytime by re-running the deploy command.

## 2. Backend tunnel (one-time, needs your browser)

```bash
cloudflared tunnel login           # opens browser — pick the nonarkara.org zone
bash ops/setup-tunnel.sh           # creates tunnel, DNS, and a 24/7 launchd service
```

This maps `https://api-flood.nonarkara.org → http://localhost:8340` and installs
`com.flooddash.tunnel` so it restarts on boot/crash — matching the
`com.flooddash.server` service.

## 3. Verify

```bash
curl https://api-flood.nonarkara.org/api/health   # backend via tunnel
open https://flood.nonarkara.org                  # full dashboard, live
```

## Notes

- The Mac must stay awake for live data (System Settings → keep awake on power).
- No secrets anywhere — every data source is keyless.
- If you ever want a fully edge-hosted variant, the backend would need a rewrite
  (D1 for storage, Cron-triggered Workers for pipelines, Durable Objects for SSE,
  Workers AI in place of local Ollama). That abandons the "runs on my Mac with a
  local LLM" design, so the tunnel approach is the right fit here.

## Optional integrations (each = one free token, one command)

| Feature | Get the token | Activate |
|---|---|---|
| AI chat + semantic search (NVIDIA NIM) | build.nvidia.com → API key | `node scripts/set-llm-key.mjs nvapi-…` |
| Satellite rain (NASA GPM IMERG) | urs.earthdata.nasa.gov → approve "NASA GESDISC DATA ARCHIVE" app → Generate Token | `node scripts/set-earthdata-token.mjs <token>` |
| LINE OA alert broadcasts | developers.line.biz → Messaging API channel → channel access token | `node scripts/set-line-token.mjs <token>` |

Every feature degrades gracefully when its token is absent: chat falls back
to a structured live-data summary, the imerg source skips quietly, LINE
pushes are a no-op. Tokens live in the SQLite kv table — never in git.
