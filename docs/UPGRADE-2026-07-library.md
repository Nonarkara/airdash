# Upgrade plan — The Flood Library (ห้องสมุดน้ำท่วม) + audit fixes

> **Provenance note (AirDash):** this document is inherited from FloodDash
> and kept verbatim as the historical design record of the Library / FTS5 /
> bilingual-bible architecture that AirDash reuses. In AirDash the library
> is the **Air Bible** (`corpus/bible/sec00–10`, air-quality methodology);
> the mechanics described here (FTS5 trigram search, boot-time ingest,
> `validate-bible.mjs` parity checks) apply unchanged.

Planned by Fable 5 from `Kimi_Agent_Thailand Flood Dashboard Blueprint` (the
11-section "Flood Bible", ~42,000 words EN, plus 24 research files). Executed by
an Opus 4.8 orchestrator with a Sonnet/Haiku agent swarm.

## Goals

1. **The Flood Library** — the Bible + FloodDash's knowledge notes, searchable
   from the dashboard with a search bar, **fully bilingual TH/EN** (the Bible is
   English-only today → the swarm translates all 11 sections to Thai).
2. **Audit fixes from Bible §8/§5** (chosen for value/risk):
   - gzip JSON API responses (the ~1.2 MB snapshot → ~200 KB) — §8.2.1
   - Risk score v2: add catchment wetness (API) + rate-of-rise (dWL/dt) factors
     and province trend arrows — §5.4.1, §8.3.2
   - Minimal PWA (manifest + conservative service worker) — §8.4.1
3. **Corpus housekeeping** — move the 5.9 MB blueprint folder out of `public/`
   (it must not ship in the Pages bundle); `.docx` stay untracked.

## Verified foundations (do not re-litigate)

- `node:sqlite` has **FTS5 with the `trigram` tokenizer** — verified: Thai
  substring match + highlight() and case-insensitive English both work.
- Bible sections live at `corpus/bible/secNN.en.md` (split already exists as
  `flood-bible_secNN.md`); Thai goes to `corpus/bible/secNN.th.md`.
- Existing bilingual `knowledge/*.md` (9 docs) join the library corpus.
- Serving: library content is served from SQLite via the tunnel API — the Pages
  bundle barely grows.

## Architecture

- `server/library.js` — boot-time ingest (hash-guarded like knowledge.js):
  parse corpus → chunk by `##` heading → render minimal safe HTML server-side →
  `library_docs` (key, section, ord, lang, title, html, plain) + FTS5 trigram
  index on (title, plain). Search returns snippet()/highlight() results.
- Routes (in `server/api.js`): `GET /api/library/toc?lang`,
  `GET /api/library/search?q&lang&limit`, `GET /api/library/doc?key&lang`.
- UI: **LIBRARY / ห้องสมุด** tab (right rail + mobile sheet) with search bar,
  highlighted snippets, TOC browsing; full-screen **reader overlay** (pattern:
  compare overlay) with section TOC; language follows the global toggle with
  graceful fallback. Wetness panel links to the soil-moisture explainer.

## Swarm task breakdown (disjoint file ownership)

| # | Task | Model | Owns files |
|---|------|-------|-----------|
| T1 | Corpus restructure (`git mv` blueprint → `corpus/kimi-blueprint/`, create `corpus/bible/secNN.en.md`, gitignore `*.docx`) | haiku | corpus/, .gitignore |
| T2–T7 | Translate Bible sections EN→TH (2 sections per agent, 6 agents) | sonnet | corpus/bible/secNN.th.md |
| T8 | Translation validator script + run (`scripts/validate-bible.mjs`: heading/code-fence/table-row counts + number multiset must match EN↔TH) | sonnet | scripts/ |
| T9 | Backend: `server/library.js` + routes | sonnet | server/library.js, server/api.js |
| T10 | Frontend: `panels/library.js`, reader overlay, tab wiring incl. i18n paintChrome maps + SW/manifest links | sonnet | public/js/panels/library.js, public/index.html, public/js/i18n.js, public/js/main.js, public/css/components.css |
| T11 | Risk v2: weights 40/25/15/10/10 (water/rain/forecast/wetness/rise-rate), method strings, trend arrows, knowledge/risk-method.md v2 | sonnet | server/risk.js, public/js/panels/ranking.js, knowledge/risk-method.md, server/config.js |
| T12 | gzip JSON API (use `res.req` — zero call-site changes) | haiku | server/http.js |
| T13 | PWA files only (manifest.webmanifest + sw.js; **no index.html edits** — T10 adds the links) | haiku | public/manifest.webmanifest, public/sw.js |

**Integration edits the orchestrator makes itself** (shared-file conflicts):
`server/index.js` (wire library ingest; pass wetness into createRisk).

## Translation rules (T2–T7)

Natural professional Thai (duty-officer register, matching FloodDash), NOT
machine-literal. Keep intact: all numbers/units, URLs, code blocks, table
structure, API names, product names. Technical terms: Thai first with English
in parentheses on first use. Headings translated. Do not add or drop content.

## Verification (orchestrator, before reporting back)

- `node --check` every changed JS file; import-smoke the server modules.
- Standalone ingest test against a **temp DB path** — assert docs ingested and
  FTS search hits for "เจ้าพระยา" (TH) and "Manning" (EN).
- `scripts/validate-bible.mjs` passes for all 11 section pairs.
- **Forbidden to agents**: restarting launchd services, git push, deploying,
  touching `data/flooddash.db`, editing files outside the ownership table.

## Ship (Fable, after swarm)

Review diff → restart `com.flooddash.server` → live-verify TH/EN search,
reader, risk v2, PWA on desktop + mobile → spot-check translation quality →
commit (include the pre-existing uncommitted sources/export work) → push →
`wrangler pages deploy`.
