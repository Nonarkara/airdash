# Contributing to AirDash

> **Every contribution ships to real Thai provinces.** What you push here
> will be used by parents in Chiang Mai, commuters in Bangkok, and
> district officials during the next burning season. That is the bar.

AirDash is a public-interest system. There is no fee, no data sale, no
ads. The work is funded by a small depa budget and the team's own time.
Every contribution is welcome, but please read this before opening a PR.

## What we welcome (and what we don't)

| Welcome | Less welcome |
|---|---|
| Bug fixes with a reproduction | "It would be cool if…" features |
| Performance improvements | A new framework / dep |
| Accessibility fixes (TH/EN labels, ARIA, keyboard) | A new logo / theme without a use case |
| New data sources with a stable API | Mock data, anywhere, ever |
| Translations (TH/EN/ZH/LA/MY) | New dashboard colors that don't tie to a band |
| Per-city or per-region specializations | Hard-coded province-specific layouts |
| Documentation improvements (bilingual!) | Comments in any language other than TH/EN |
| A research-backed coefficient change (with the paper) | A new coefficient "because I like it" |

## The bar for a code PR

1. **No mock data.** Every figure must come from a real source. If you
   add a new data feed, the server must hit it and persist the result.
2. **No silent failures.** If a feed is down, log it (`console.error` in
   the panel, `last_error` in the `sources_state` table). The hero
   should never be a lie.
3. **Bilingual labels.** Every user-facing string needs `data-th` and
   `data-en` (or `tr('...thai...', '...english...')` in JS). If you
   add a string with only one language, the lang toggle will show an
   ugly fallback.
4. **Touch first.** Every interactive element must work on a phone
   (no hover-only behavior, no tiny tap targets). Test in gstack with
   viewport 375x667 (iPhone SE) before opening a PR.
5. **Boot must not regress.** Every panel init is wrapped in
   `safeInit(name, fn)`. A single broken panel should never block the
   rest of the dashboard. Don't un-wrap the safety net.

## The bar for a data PR

A new data source needs:

1. A `public/js/sources/<name>.js` adapter that exports `{ id, label_th, label_en, intervalMs, fetch, parse }`.
2. An entry in `server/config.js` `sources` map.
3. A SQLite migration (the schema is in [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-the-sqlite-schema-the-data-layer)).
4. A test on a Thai network (the deployments run from a Bangkok Mac).
5. A citation in the air library explaining the source's authority.

If the source requires an API key, **provide a free tier path** — the
system should still work for someone who can't or won't sign up.

## The bar for a translation PR

* The dashboard supports `th` and `en` as the primary pair.
* Other languages are welcome (zh, la, my, etc.) but the TH/EN pair must
  stay intact.
* New translations should be added as both:
  - `data-th` and `data-en` (or `data-XX` for new langs) on HTML elements
  - A new key in the `tr()` calls in JS
* Use a single source of truth where possible (e.g. the boot screen
  explainer has a single `data-th` and `data-en` for both languages).

## The bar for a documentation PR

* Match the existing bilingual structure (TH and EN side by side).
* Diagrams should be either SVG (for static) or mermaid (for GitHub-native
  rendering). Place in `docs/diagrams/`.
* Link the new doc from both README.md and README.th.md.

## How to run locally

```bash
git clone https://github.com/Nonarkara/airdash.git
cd airdash
npm install                          # Node 18+ required
node server/index.js                # backend, listens :8341
# In another terminal:
npx wrangler pages dev public --port 8788
# → open http://localhost:8788
```

The `wrangler pages dev` command auto-starts the Pages Function that
proxies `/api/*` to your local `:8341`. You should see the boot
screen, then the dashboard, in under 2 seconds.

## How to deploy

The deployment is two-step (frontend on Cloudflare, backend on the
Mac). For your own fork:

1. **Frontend:** fork the repo, connect it to Cloudflare Pages, set the
   build command to none and the output directory to `public/`. Cloudflare
   auto-deploys on push to main.
2. **Backend:** run the Mac server (or a VM), point a Cloudflare Tunnel
   at it, add a Pages Function in `functions/api/[[path]].js` to proxy
   `/api/*` to the tunnel.

A working single-VPS alternative:

```bash
# On the VPS
git clone https://github.com/YOU/airdash.git /opt/airdash
cd /opt/airdash
npm install
NODE_ENV=production node server/index.js &

# Frontend (Cloudflare Pages in front of it)
npx wrangler pages deploy public --project-name your-airdash
```

## Code of conduct

* Be kind. Most contributors are volunteers.
* Be specific. "It doesn't work" is not a bug report. "Tapping the retry
  button on the boot screen reloads to the same state on Chrome 119
  Android" is.
* Be patient. Reviews may take a few days — the team is small and the
  goal is to ship a reliable public-interest system, not to maximize
  commit velocity.

## Questions?

Open a [discussion](https://github.com/Nonarkara/airdash/discussions).
For security issues, email nonsmartcity@gmail.com rather than filing a
public issue.

— Dr Non and the AirDash team
