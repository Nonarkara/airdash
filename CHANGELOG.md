# Changelog

All notable changes to AirDash. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Read this when you ask "what's the current state of the system?"** —
> every shipped feature is documented here with its purpose and the problem
> it solved. If a feature is in the code but not in this log, it is in the
> wrong place.

---

## [2.4.76] — 2026-10-12 — the encrypted offsite backup had never once run on its own, and nothing would have told you

Ops-only; no file under `public/` changed, so the asset token stays at 2.4.74.

The 2026-10-11 entry said the first unattended offsite run was unobserved. It was worse than unobserved — **it had already failed.**

- **The 03:50 job died before uploading a byte.** `mkdir '/.wrangler/cache'`. launchd gives a LaunchAgent a working directory of `/` unless its plist declares `WorkingDirectory`, and wrangler puts its cache in `process.cwd()/.wrangler/cache`. Auth was fine — it had already fetched the account when it died. Fixed in both layers: the plist now declares `WorkingDirectory` (and explicit `HOME`/`PATH`), and the script `cd`s itself so it stays correct even if that key is lost again.
- **Verified by running the job the way launchd runs it**, not by hand: `launchctl kickstart` uploaded 165,362,854 bytes as `daily/airdash-2026-10-12.db.gz.age`, exit code 0. The object was then fetched back and its first bytes read — `age-encryption.org/v1`, an X25519 recipient stanza. The bucket holds ciphertext, never the database.
- **The failure was invisible, and that is the part that mattered.** The watchdog's 48-hour receipt guard covers the *local* archive — `data/.archive-receipt.json`, a file the offsite job never touches. So the offsite copy could stop entirely while every health number stayed green. A failed run raised only a desktop notification, at 03:50, which is exactly when nobody is at the machine. The watchdog now also checks that a successful upload is recorded in `logs/offsite.log` within 30 hours — one missed run is not alarming, two consecutive misses means the only surviving data sits on the SSD the copy existed to protect from. It treats "log exists but never recorded a success" and "timestamp unparseable" as failures, not passes.
- **The pre-upload bucket-size read, shipped yesterday, proved itself here.** On the failed run it logged `WARN: bucket size unreadable` and **kept the previous reading instead of writing a zero** — precisely the failure it was added to prevent, on the very next execution.
- `OLLAMA_KEEP_ALIVE` was `-1` — *never unload* — set globally by `org.nonarkara.setenv-ollama-keepalive` to keep `claude-mem-observer` warm. That is not "warm", it is "pinned for the life of the process": every model any client loads stays resident forever. On a 16 GB machine that is what held `gemma3:4b`'s 3.7 GB indefinitely, and the resulting swap pressure is what produced the intermittent 502/504s. Now `30m`, which gives the same warmth for an active session's gaps and still lets an idle model be evicted. The `LLM_TIMEOUT_MS` fix remains the real safety net, as that plist's own comment said.
- Two new guards, 31 checks, wired into `npm test`. The freshness block is **executed** against synthetic logs rather than pattern-matched, because the properties that matter are behavioural: a fresh upload is silent, a stale one is not, and a log that exists but never recorded a success is a failure. **Four planted bugs turn it red** — removing `WorkingDirectory`, removing the script's `cd`, widening the 30-hour limit to 720, and dropping the `problems` increment.

## [2.4.75] — 2026-10-11 — the R2 cost guard was watching a bucket that already held 159 MB

Ops-only; no file under `public/` changed, so the asset token stays at 2.4.74.

`ops/offsite-r2.sh` records the R2 bucket size into `logs/.r2-bucket-bytes`, and `ops/health-watchdog.sh` alerts when that exceeds 9 GB against Cloudflare's 10 GB free tier. The guard was structurally incapable of firing.

- On its first run — bucket created 17:24:54 local — the script pushed a 159 MB object at 17:27:24 and queried `bucket_size` at 17:27:26. **R2 answered `0 B`.** That zero was recorded faithfully, so the cost guard watched a bucket that already held 159 MB and would have reported no growth indefinitely.
- The parsing was never wrong. R2's `bucket_size` is eventually consistent, so a query issued in the same second as the PUT measures *propagation*, not storage. The same command run minutes later answers `159 MB`. The size is now read **before** the upload, which also measures what the guard is actually for — the bucket as it stood — rather than racing the object the run just added. Lagging by one run costs nothing against a 9 GB ceiling; reading zero costs everything.
- A size that cannot be parsed no longer overwrites the last good reading, and is logged as a WARN. A future wrangler that renames the field would otherwise reset the guard to zero — the same silent failure arriving by a different route. A genuinely empty bucket still records `0`, because that is a real reading, not an error.
- `logs/.r2-bucket-bytes` refreshed from the stale `0` to the true `166723584`.
- `scripts/test-offsite-bucket-size.mjs`, 14 checks, wired into `npm test`. Unit parsing is executed by lifting the zsh function out of the script and running it against a stubbed `wrangler`; the ordering property is asserted on the source, since it is a fact about where a line sits. **Four planted bugs turn it red**: moving the query back after the upload, removing the unreadable guard, and corrupting the GB and TB multipliers.

**Still unobserved, and honestly so:** the offsite job has only ever run by hand. The log contains exactly one entry, at 17:27 on 2026-10-11 — a manual run — and no 03:50 entry, because the whole R2 setup is less than a day old and the 03:50 slot had already passed when the bucket was created. The first genuinely unattended run is tomorrow morning. That is the honest limit of the restore evidence so far.

## [2.4.74] — 2026-10-11 — two features that were built but never switched on, and 17 dead exports

Front-end and backend. Asset token 2.4.74 (the service-worker cache moves with it, `airdash-v92`).

**Two features were 90% built and had no edge into them. Both are now live.**

- **The RECENT places strip could never populate.** `public/js/panels/search.js` rendered a RECENT list, read it out of local storage, and shipped an empty state promising *"recent opens appear here after your first search"* — but `rememberRecent()` had no caller, so nothing was ever written. Every visitor saw that empty state forever. The fix is one line in `selectResult()`, which is the single funnel every path into a place goes through: a search hit, a RECENT button, a `?city=` boot link, and the saved-city boot. Recorded there deliberately — putting it on any one of those four paths would leave the other three unrecorded.
- **The share button's ✓ flash was a partial copy.** `shareFeedback()` existed and was correct, so `citizen.js` inlined a worse version of it that handled only `copied`, never reported a failure (so a failed copy left the button looking untouched), and hardcoded a Thai label in a bilingual panel. The inline copy is gone; `citizen.js` now calls the helper with `tr()`-supplied labels, so a failure says so.
- `scripts/test-deadcode-wiring.mjs`, 26 checks, wired into `npm test`. The recorder's dedup, its cap, its newest-first ordering and its private-mode safety are *executed* — the two module-private functions are lifted out of the source and run against a stub preference layer, because the module itself touches `document` at import time and cannot be imported in node. Only the wiring itself is pattern-matched. **Eleven planted bugs turn it red**, including dropping the `rememberRecent` call, disabling dedup, removing the cap, removing the no-coordinates guard, removing the private-mode `try`, reverting to the inline flash, dropping the import, and reversing the ordering.

**Removed — 17 exports referenced nowhere in the repository, verified one at a time:**

`__clearAirStationsCache`, `resolveName`, `slugFor`, `purgeRejected`, `provinceQuality`, `__resetForTests`, `nearestCams`, `__clearCacheForTests`, `_resetProvinceIndex`, `prefetch`, `forecastCi`, `pm25Ci`, `riseCi`, `fmtUg`, `initCitizenPersona`, `focusAreas`, `KOSCHMIEDER_C`. Four of them (`__clear*`, `_reset*`) were test-reset hooks that no test ever called.

Seven private symbols went with them, having been left orphaned: `trName` (only `resolveName` called it), `REJECTED_RETENTION_DAYS`, `resetProvinceIndex` (only its own dead alias called it), the write-only `_slugByRef` map, the three now-unused sigma constants behind `forecastCi`/`pm25Ci`/`riseCi`, and the `on` import in `citizenLife.js`.

**Three comments that were simply wrong:**

- `purgeRejected()` claimed rejected LINE reports were auto-deleted after 7 days. Nothing has ever called it — and there is no delete route either, so rejected reports were permanent while the comment said otherwise. Removed, because `pruneReports()` already caps the report *directory* on disk and the only thing left ungoverned was a few hundred bytes per rejected row. (The table held **1 row in total, 0 rejected**, at audit time.)
- `nearestCams()` was documented as "used by `/api/decision?` and the citizen card". **`/api/decision` does not exist**, and the citizen card's "nearest" logic is about AQ stations, not cameras. Removed.
- `KOSCHMIEDER_C = 0.05` sat above `darkChannel()` with a comment explaining it as the constant in Koschmieder's equation. The code implements `t = 1 − ω(dark/I)` with `ω = 0.95`, averaged in log space — a dark-channel/log-ATM formulation, not the classical `I = J₀·e^(−c·d)`. The two are not interchangeable, so the constant and its comment are gone and a note says so, to stop someone reintroducing `c=0.05` expecting the same numbers.

**Kept deliberately:** the Telegram province index stays memoized for the life of the process. It is built from the same risk snapshot the dashboard renders, so freezing it is what guarantees `/province` answers with the province list the user is actually looking at. Its reset function was vestigial and is gone; the comment now explains that there is deliberately no reset.

Also: a stale 34 MB copy of the whole repo was living at `.claude/worktrees/nifty-curran-b1d3e5` as a registered git worktree pinned to an August commit — fully superseded by `main`, holding no unique file, and silently corrupting repository-wide greps. Removed and pruned. `.claude/` was listed twice in `.gitignore`; now once.

**How this was checked.** A repository-wide scan of 476 exported symbols across 149 modules now reports **0 referenced nowhere else**, and 1093 checks pass with 0 failures. The scan itself was wrong three times before it was right — it resolved import paths without a base, mixed relative and absolute entry paths, ignored `?v=` cache-busting tokens, and finally iterated a joined string character-by-character so live exports looked dead. Every finding was confirmed by hand before anything was deleted; seven of the eight it last reported were in fact referenced by tests and were left alone.

## [2.4.73] — 2026-10-11 — the camera health probe can no longer take the site down for nine minutes

Backend-only; no file under `public/` changed, so the asset token stays at 2.4.72.

- `cctvHealth` measured **410–497 seconds per pass** on four consecutive runs. 806 cameras, 12 in flight, an 8-second per-probe timeout, and roughly 457 of them already dead — so most of the pass was spent waiting on sockets that would never answer. The probe runs inside the HTTP event loop, and for those nine minutes the server could not answer `/api/ping` and the public site returned **504**.
- The pass now has a wall-clock ceiling of **25 seconds**, deliberately below Cloudflare's 30-second origin timeout — a 90-second ceiling would still hand every visitor a 504, only a shorter one. A camera the pass never reaches keeps the verdict it already had. It is not marked failing, because that would hide a working camera, and not marked passing, because that would un-hide a dead one: both are silent lies about a camera on a public map.
- Because the queue is cut short, it now starts at a **rotating offset** each pass. Without that the same prefix would be probed every cycle and the tail of the catalog never examined at all.
- Per-probe timeout 8 s → 5 s and overall concurrency 12 → 24. An HLS `#EXTM3U` header that has not arrived in five seconds is not going to.
- `scripts/test-cctv-probe-budget.mjs`, 24 checks, wired into `npm test`. All five planted bugs turn it red, including a 90-second budget, a removed ceiling, a skipped camera marked live, a skipped camera marked dead, and rotation removed.

**Not fixed, and worth knowing:** the probe still runs on the event loop. The ceiling bounds the damage; it does not remove the cause. Moving the pass to a worker thread, or not re-probing cameras already known dead, is the real fix and is a larger change than a ceiling.

## [2.4.72] — 2026-10-11 — flood-wall cameras as haze eyes, and a repaired airport-visibility feed

Shipped as the frontend asset bump alongside the backend work below. This entry was missing until 2026-10-11: the `?v=` token had already reached 2.4.72 and been deployed, which is the second time a release has shipped undocumented. `scripts/check-bump.mjs` now refuses to deploy a token the changelog does not name.

- **Optical haze evidence, cooked into the verdict.** `server/vision/floodWall.js` builds a deterministic, health-checked panel from FloodDash's camera wall — up to 2 cameras per province across all 77, daylight only, hourly, at most 2 requests in flight per host, with failing cameras benched for a day. `server/vision/hazeEvidence.js` rolls each camera's own clear-day baseline up per province, adds humidity and airport visibility, and names fog as the likelier cause when the air is saturated. Exposed at `/api/haze-evidence`.
- **Cameras never produce a PM2.5 number.** They can raise a province to at least WATCH in exactly one case: no ground station is reporting there and widespread non-fog haze is seen. At audit time that condition was reachable by only the 6 provinces whose PM2.5 comes from the GISTDA satellite estimate, and 72 of 75 provinces with camera frames were still below the two-judged-camera minimum, so the path was inert.
- **METAR airport visibility was unreadable for two weeks.** Its timestamps were stored as raw epoch seconds, which SQLite sorts below every date string, so every freshness-filtered reader saw the feed as stale. Existing rows were converted, all 28 stations now carry a province, and `insertReading` rejects any non-date `obs_time` from any source. The rejection counter is surfaced in `/api/health`, and callers already branch on the return value, so a repeat is visible in three places rather than silent for a fortnight.
- **DustBoy and IMERG no longer report healthy while doing nothing.** Neither has an API key; both are now listed under `unconfigured` and excluded from the fresh-data count.
- A daily-series query parameter could force a full database scan on every request; fixed. The hourly watchdog now refreshes the Cloudflare edge mirror and reports swap pressure above 80%, naming the largest memory users.
- **Encrypted offsite backup to Cloudflare R2.** `ops/offsite-r2.sh` age-encrypts the nightly database on this Mac before upload, so the bucket only ever holds ciphertext, refuses files over 500 MB and refuses a backup older than 26 hours. Retention is enforced by bucket lifecycle rules. No credential is committed: the API token is read from `~/.zshrc` and the age key lives outside the repo. The watchdog alerts above 9 GB against the 10 GB free-tier ceiling.


## [2.4.71] — 2026-10-07

- Outage mirrors now accept only canonical requests without query parameters. Filtered requests cannot overwrite or consume a different selection's cached data.
- New mirror namespace discards older entries that may have mixed filtered and canonical responses. Parameterized reads return explicit unavailability during an outage rather than unrelated data.
- Behavioral regression verifies canonical fallback, filtered cache isolation, bounded entry count and rejection of legacy entries.

## [2.4.69] — 2026-10-04 — frontend interaction recovery

Entry recovered 2026-10-11 from `docs/FRONTEND-AUDIT-2.4.69.md`; the release was deployed and audited but never added here. That is the third undocumented release, and it is why `scripts/check-bump.mjs` now refuses to deploy a token the changelog does not name.

- Search results existed but the dropdown was three pixels tall — its top and bottom consumed the entire viewport. Bounds now provide usable width and height against the visual viewport, request generations stop a stale search from replacing a newer one or reopening after Escape, and failures offer recovery.
- Choosing a search result on a phone raised `Invalid LatLng (NaN, NaN)` in Leaflet while the map sheet was hidden. Movement now stops any running animation, rejects non-finite coordinates, uses an immediate view for a zero-size map and respects reduced-motion.
- Direct `localStorage` access could interrupt module initialisation and user actions; a shared preference adapter now catches unavailable or full storage and preserves choices for the current visit.
- Camera dialogs gained a keyboard Tab boundary, focus return on close and Escape support; a response can no longer dereference an overlay removed while a window request was in flight.
- Chat and JSON requests have bounded deadlines, send is disabled while busy and restored on failure, and example questions follow the language. Phone inputs use 16px text with 44px touch targets.
- 1,010 custom checks plus 14 TAP tests, no failures. Full evidence, including the interrupted browser runs that were not counted as passes, is in `docs/FRONTEND-AUDIT-2.4.69.md`.

No Lighthouse, Core Web Vitals or screen-reader certification is claimed.

## [2.4.70] — 2026-10-04

- Recovered backend hardening: PM2.5 warnings escalate when readings gradually cross 75; Telegram `/start` restores stopped subscriptions; bot authentication failures preserve subscribers.
- Scheduled and immediate LINE/Telegram pushes reserve the same notification slot before sending, preventing concurrent duplicates. Failed sends restore the prior cooldown timestamp for retry.
- Restrict forwarded visitor identities to signed requests or local tunnel connections; canonicalize outage mirror cache keys; limit archive downloads and omit internal export build errors/paths from public status.
- Added behavioral checks for gradual alert escalation, concurrent delivery, direct-client forwarding forgery, and failed-send eligibility. Full release tests and deployment verification are recorded in the release audit.

## 2.4.69 — frontend usability and recovery (2026-10-04)

- Repaired the place-search dropdown collapsing to three pixels. It now fits the visual viewport, including keyboard space, and stale queries cannot overwrite new results or reopen dismissed search. Failures explain how to retry.
- Province/city selection no longer animates a zero-sized hidden phone map. Invalid coordinates are rejected and reduced-motion preferences respected. Late city details and refreshes cannot replace a newer selection.
- Browser storage failures no longer stop startup, language, mode, basemap, area or persona choices. Session choices work without persistent storage; invalid saved story profiles recover.
- Camera and information dialogs contain keyboard focus and restore their opener. Closed/replaced camera requests cannot paint into another dialog. More navigation closes with Escape and exposes the current destination accessibly.
- Chat requests and general JSON fetching have deadlines. Send disables while busy and recovers; example chips update with the language; connection errors use plain guidance. Phone inputs use readable text and search has one clear button with a full touch target.
- Added 13 behavioral UX checks. Full test command passed 1,024 checks; follow-up header and consistency checks passed after final phone styles. The archive interruption fixture now waits for its actual readiness lock rather than signalling during startup after 15 seconds.
- Deployment probes verify the changed search/chat/dialog/preference modules on canonical and custom hosts before completing.

## [2.4.68] — 2026-10-03 — local fire briefings, honest burn comparisons and reference-grounded retrieval
- Replaced the fixed 2025/26 agricultural-burning calendar with selectable province and season briefings. Current reported maximum PM and upwind fire context are separate from historical Sentinel-2 agricultural scars. All 77 provinces are selectable even when a province has no published scars. A footer entry works on phones, and the dialog supports Escape, focus return and keyboard containment. CSV briefings include source dates, coverage and comparison exclusions.
- Season comparisons use only matching province/month cells with complete crop observations; absent crops remain unknown rather than zero. Source coverage is explicit: the current national publication has 62 provinces (372 of 462 possible province-month cells), not full Thailand coverage. Both DOPA and TH-prefixed codes are accepted, and malformed/nonconsecutive seasons are rejected. Upstream monthly download failures now surface as source failures while preserving successfully ingested months.
- Smoke transport requires a successful regional fire-feed ingest within 12 hours; missing/stale input no longer looks like zero fire potential. The API exposes source-check time and whether the wind is today's or tomorrow's forecast. It remains an upwind indicator, not a terrain-resolved trajectory or measured concentration.
- Deployment verifies both new briefing modules' contents. Behavioral regressions cover unmatched coverage, missing crop values, real zero, province aliases, source outages, satellite-source labelling and CSV formula safety.

- New `knowledge/gov-citizen-apps.md` catalogues Thai government- and university-operated public monitoring dashboards that citizens open without a login — currently **ตามรอยเผา** (HII + Kasetsart, NRCT-funded) and **WARROOM ชุมชน** (warroom.pro). Each entry records who operates it *and the evidence for that claim*, what it measures, whether anything is machine-readable, its licence, its refresh cadence, and where it is honest about its limits and where it is not. The file is an open registry with a fixed entry template, built to be appended to. It carries three findings with immediate product consequences: ตามรอยเผา republishes GISTDA MODIS hotspots and provincial PM2.5 as plain CSVs and added a 7-day burn-monitoring product whose second band counts satellite overpasses, which bounds how many separate burns a cell saw; its SAVI L2 layer publishes monthly fuel load, the only forward-looking input in the Thai open burn picture; and warroom.pro publishes a versioned, licensed, leave-one-out validated 24-hour rainfall manifest under CC BY 4.0.
- **ตามรอยเผa's forest products are now recorded as self-declared defective and formally unvalidated.** The site states that processing errors persist under closed canopy and that no formal accuracy assessment exists for forest areas, while the agricultural products carry one. The two must not be presented as equivalent, and the warning is quoted with its date rather than paraphrased.
- Corrected a stale claim: the note that no GeoTIFF download URL could be found is false after the site's 2026 rebuild. `/product/*` is an open directory listing and the files download. `knowledge/README.md` now lists all sixteen notes rather than eleven.
- **The RAG indexer no longer stores a chunk the embedder only partly reads.** `chunkMarkdown` emitted whole H2 sections regardless of size while the embedder cut at 4000 characters, so any section over that limit was stored in full, embedded in part, and could be returned to a reader as a citation whose text the retrieval had never matched. Chunks are now capped at the embedder's limit and split at heading, blank-line and list boundaries instead of truncated, and the two sides share one exported constant rather than two literals. Oversized sections in `agri-burning.md`, `burning-hotspots.md` and `paper.md` had the same defect and are fixed with it.
- Chunking is now lossless. A size floor was deleting a 34-character fragment that held the only copy of a section's heading, taking three words with it; the filter now drops only pure markdown scaffolding. Break points are recomputed at each split rather than cached, because a stale index cut list items in half.
- Re-chunking leaves orphans behind: `rag.js` ranks every embedded row and nothing removed stale ones, so an old chunking of a file kept competing with the current text forever. Rows for a file that the current chunking no longer produces are now pruned, scoped to that file's own prefix so Air Library chunks are untouched.
- `scripts/test-knowledge-chunking.mjs` (72 checks) asserts the cap, losslessness, unique keys, structural break quality, the single-limit constant and the prune behaviourally. All eight bugs it exists for were re-planted and each one turns it red; two of its own checks were corrected first, one of which was passing over a fixture small enough never to split.

No third-party product is endorsed, and no independent verification of either operator's stated accuracy was performed. warroom.pro's Chiang Mai University association comes from the owner and appears on the site only as a logo image.

## [2.4.67] — 2026-10-03 — the header stopped quietly crushing its own text

- The Danger chip's scope line — the text naming which province the 0–100 score belongs to — was being compressed to 40% of its height with Thai vowel marks shaved off. Nothing overflowed and nothing clipped, so no check saw it: a column flex box with the default `flex-shrink: 1` makes every row shorter and stays silent, because a shrunken box is legal CSS. Five pieces of content wanted about 70px in a 64px box. The number and its band now share a row inside one `.danger-main` element, and the chip is a grid whose rows size to content, so a future overflow is visible instead of silent. The wrapper was load-bearing: as siblings, the label and scope spanned the chip and distributed width across the tracks they spanned, inflating the number's track and pushing number and band to opposite sides.
- Four more defects found by a corrected browser audit. The search field was 88px wide from 1100px all the way down to a 390px phone, because a width ladder built to budget one field inside the desktop row was still applying after that field left the row — three leftover rules that were already dead on desktop were the only thing governing the phone. The magnifier icon sat on the placeholder's first letters at every phone width, and the same rule was duplicated in a stylesheet that loads later and silently overrode the corrected one. 44px touch targets sat inside 32px grid rows. At wide viewports the national headline verb received 84px of the 124px it needed.
- A browser gate now asks each chip what height it *would* need with nothing constraining it and fails if that differs from what it is given, plus a static layout check. The first version of the compression probe was wrong twice — computed `height` is never `"auto"`, and summing children's `scrollHeight` double-counts a shared row. Re-planting the original defect fails both checks. Verified at nineteen widths, in both themes and both languages, on localhost and live.

## [2.4.66] — 2026-10-02 — honest outages and archive-gated pruning

- Air Story no longer substitutes sample pollution, health, mortality, population or economic figures when `/api/science` fails. It shows unknown readings with a neutral band and retries automatically. Personal estimates wait for measured science data; an unavailable selected province cannot inherit national PM. Missing stagnation observations are excluded rather than counted as zero wind risk.
- Hot-tier raw-data pruning now checks that the archive exists on the external device before deleting archived rows. A fresh receipt cannot authorize deletion while the drive is unavailable. Existing hourly aggregation and ordinary retention remain unchanged.
- Regression checks cover the outage shell, missing provincial PM and preservation of all hot-tier rows when archive storage is unavailable. An optional browser gate exercises science failure and automatic recovery using live data.

Offsite recovery and a second live backend remain unresolved infrastructure gaps.

## [2.4.65] — 2026-10-02 — fail-closed verification and visible score meaning

- Audited MiniMax's `6bbd98a` gate fix. Missing Playwright and navigation failures now exit 2 as unmeasurable, and the data wait uses Playwright's actual timeout argument. Both numeric danger and a rendered verdict are required. An optional real-browser regression script verifies that placeholders and a missing dependency cannot print success.
- Deployment verifies the layout stylesheet, story script and camera-wall script contents in addition to the existing asset checks. Thai and English header geometry is verified separately; small phones use a two-line score, and the desktop data zone uses a bounded flex basis so translated text cannot push controls onto a second row. Unknown scores use neutral colours. Danger Score carries a visible non-clinical label in the header, rankings, city card and formula breakdown. Camera scores are explicitly relative visual triage, never PM2.5 concentrations. A camera-count fallback no longer claims that the air is broadly fine. METAR pins identify airport visibility observations, and unreported/non-aerosol causes no longer prove that dust is absent.
- The ops sentinel checks external archive storage at boot and every five minutes, independently of the 48-hour receipt-age alarm. It exposes a timestamped storage result in `/api/health` and flags missing storage, a same-disk mount directory, a misplaced archive file and a stalled probe. This verifies availability, not integrity or offsite recovery.
- Nightly backup mode checks device identity before treating a writable directory as off-device storage. A same-disk directory falls back to the verified local compressed backup.
- Test counts include Node TAP assertions: the prior release had 886 custom checks plus 14 TAP tests = 900. This release adds five storage checks and five visibility-marker checks; the optional browser gate, sparse-camera UI check and backup fixture are reported separately.

Offsite storage and a second live backend are still unprovisioned. No superiority or clinical-validation claim is established by these changes.

---

## [2.4.60] — 2026-10-02 — release audit and repairs

- Missing observations now remain unknown in Danger Score, harm ranking, personal guidance and AI facts. Current measured PM is the minimum Danger Score baseline; past or forecast rain cannot erase it. Missing CAMS stays unknown, while a genuine zero forecast remains valid.
- Replaced two retired NVIDIA inference models and verify chat and embeddings independently with inference requests. Invalid/reordered vectors are checked, model changes invalidate old embeddings, and chat transport failure returns a factual fallback.
- Corrected the Pages root rewrite: `/` must serve the Air Story, not silently fall through to the operator dashboard. Repaired library retries, keyboard reading/focus, stale async results, mobile citizen-persona API wiring and reserved search routes. Story data refreshes on visibility and every minute; its fallback uses one-hour exposure. Outdoor time is explicitly dose equivalence, not a medically validated safe duration. Display ranges are explicitly assumed, not calibrated confidence intervals.
- Public exports write bulk CSV directly to disk, count rows within each table's read transaction, fail on dump errors, and publish the compressed archive atomically. Failed rebuilds preserve the previous archive. The edge proxy limits download header wait without aborting a large streamed body at the JSON deadline. File streaming handles client disconnects and file-removal races.
- Validation: automated regression suite; live chat; 57 API read routes; browser retries, keyboard access, mobile persona and story refresh; production desktop/mobile rendering and header width checks; a read-only SQLite restore drill. A real public export produced 4.35 million raw observations in 22 seconds. See DEPLOY.md for backup and deployment procedures.

Remaining operational limits: one live backend, no automatic live failover and no offsite backup. The external-disk backup is recoverable but shares the physical location. Camera haze and composite scores remain screening heuristics; these checks do not establish clinical accuracy or superiority over competing products.

---

## [Unreleased] — webhook authenticity: the two inbound endpoints now prove who is speaking

Both webhooks take commands from the internet and neither proved who was speaking. Fixed fail-closed:

- **`POST /api/telegram/webhook` authenticated NOBODY** — the route parsed the body and called `processTelegramUpdate` directly: no secret token, no HMAC. A forged `/start` (or plain province message) inserted an arbitrary `chat_id` into `telegram_subs` — a third party subscribed to alert pushes. The webhook is now registered with Telegram's `secret_token` (`server/telegram.js` `registerWebhook` generates + stores `telegram_webhook_secret` in kv, never printed), and the route validates `X-Telegram-Bot-Api-Secret-Token` timing-safe: 503 while unprovisioned, 401 on mismatch, 200 only with the registered secret. **After deploying, run `node scripts/set-telegram-token.mjs --reregister` once** (reads the token from the DB; generates + registers the secret) or a webhook that works will start 503ing.
- **`POST /api/line/webhook` failed open when unconfigured** — `if (secret && !verifySignature(...))` processed unauthenticated bodies whenever `line_channel_secret` was unset. Now 503 (fail closed), and auth runs BEFORE any DB write. Admin GET `/api/admin/telegram-config` exposes `has_webhook_secret` (boolean only, never the secret).
- **`/api/health` no longer reports a stale version** — the version was read from ops.html once at boot into a const, so frontend-only deploys left the health endpoint reporting the old number forever; `currentAppVersion()` (twin.js) re-reads with a 60s TTL.

Pin: `scripts/test-webhook-auth.mjs` (23 assertions, in-memory DB, no network).

---

## [Unreleased] — **Vision coverage: which cameras we can actually see**

The ask was to run computer vision over *all* the cameras. Measured against the live catalogue of 1,369, that turns out to mean 362 — and the difference is worth writing down rather than hiding behind the word "embed".

**Two URL bugs were marking live cameras dead.** `resolveHls` prefixed an already-absolute iTIC URL a second time (`…/hls/https://camerai1…/ccs22.m3u8`), which 404s — 115 cameras. Repaired and re-probed with ffmpeg, **57 came back genuinely live**. Separately, relative HLS paths resolved against `camera1.iticfoundation.org`, but the feed actually serves `camerai1` (with the "i"); the host recogniser asked for `camera\d`, which `camerai1` does not match, so every relative path fell through to a 404 default. Verified: `camera1/…/ccs30.m3u8` → 404, `camerai1/…/ccs30.m3u8` → 200. A 404 is indistinguishable from dead hardware to the health probe, so this read as a catalogue of broken cameras.

**`stream_kind` replaces the single `embed` bucket** with five measured classes. 572 BMA cameras serve a real image endpoint, but it measures mean 255 / stddev 0.000 — a pure white placeholder, no scene. 208 NST embeds are MediaMTX WHEP (WebRTC): RTSP 8554 refused, SRT absent, no HLS on the web port, so a browser plays them but ffmpeg cannot. iTIC's 27 `mjpeg2.php` streams *are* readable by ffmpeg, and 6 answered. `grab_url` now points the sampler at whichever URL actually works.

**The collector samples everything reachable**, not a 40-camera prefix: all live HLS plus a rotating MJPEG probe (for MJPEG the grab *is* the probe — an endless multipart body has no HEAD to check). `server/vision/coverage.js` publishes the per-class accounting with a bilingual reason per class, and `/api/haze-vision` returns it. A blank frame still yields a *withheld* score, never 0 — the corridor detector refuses a frame with no line-of-sight structure, which is what stops 572 white rectangles from being reported as "clear air".

## [Unreleased] — **The Window**

Cameras, credited reports, and headlines already existed as three separate FloodDash-shaped layers. They now answer one question together. **หน้าต่างฟ้า / The Window** (header, and the map’s layer menu) shows the camera facing the worst air, the credited reports for that province, approved LINE notes, and the headlines that name the place. One picture plays. On a clean day it says the air is broadly fine and shows the cameras nearest the highest readings.

News geotagging is FloodDash’s matcher: every place in a headline, with the Thai words that only look like provinces (เลย, ตาก, พล) refused unless the headline says จังหวัด. District dots use real centroids. A story about three provinces pins three places. The citizen layer also draws approved LINE notes that carry a location; the photo and the sender stay private.

## [3.3.2] — 2026-09-27 · backend only · **AirDash on the external disk: a real page cache, and the archive off the evening peak**

**What was wrong.** The live DB moved to the external USB disk on 26 Sep (it is a spinning drive, a Seagate One Touch). With SQLite's default ~2 MB page cache every request went back to the disk head, and the shared archive job (`com.dash.archive`) ran at 20:00 — Thai evening peak — copying into its 11 GB archive on the same disk. On 27 Sep the server sat in uninterruptible I/O from ~20:00 for over an hour; `api-air` answered nothing. The archive was also still reading the old `~/AirDash/data/airdash.db` path ("live DB missing — skipped").

**Fixed.** `openDb` sets a 192 MB page cache (`AIRDASH_DB_CACHE_MB`), `mmap_size = 0` (a page fault on a busy USB disk is the same uninterruptible wait) and in-memory temp tables. The archive runs at 02/05/11/15 (never 17–23 or 06–09) and reads AirDash's DB from `DASH_ARCHIVE_AIRDASH_DB` on the external disk. The data stays on the external disk.

## [3.3.1] — 2026-09-20 · token 2.4.33 · **Camera video was blocked by the page's own security policy**

**What was wrong.** 3.3.0 shipped camera video that played in local tests and could not play on the live site.
AirDash's Content-Security-Policy lives only in `public/_headers` (Cloudflare Pages) — the local server sets none — so a
local test cannot see it. The live policy did not allow hls.js to load (`script-src` lacked `cdn.jsdelivr.net`), the
camera servers (`connect-src`), MSE playback from a `blob:` URL (`media-src` was absent, so `default-src 'self'`
blocked it) or the NST iframes (`frame-src`). The same gap had silently broken FloodDash's cameras since they were
added (FloodDash 4.34.2).

**Fixed.** `script-src` += `https://cdn.jsdelivr.net`; `connect-src` and `media-src` += `*.iticfoundation.org`,
`*.nakhoncity.org`, `*.highwaytraffic.go.th`; `media-src` += `blob:`; `frame-src https://nstcctv.nakhoncity.org`.
`scripts/test-csp-cctv.mjs` (15 checks, in `npm test`) reads `_headers` and fails if any of them goes missing.

## [3.3.0] — 2026-09-20 · token 2.4.32 · **Cameras that show the air**

**The idea.** A PM2.5 number is abstract; a camera looking at the same place is not. AirDash now carries FloodDash's
national CCTV catalog (GISTDA + iTIC + NST, 1,380 cameras) and pairs every camera with the nearest fresh PM2.5 reading.

**Only cameras that work.** A sample of the catalog found ~28 % of GISTDA and ~44 % of iTIC streams serving a
playlist while all were flagged "online". `cctvHealth` (copied from FloodDash 4.34) probes all 561 HLS streams every
30 min (12 in flight, 3 per server, 8 s): a 404 hides a stream at once, a timeout needs two strikes. First cycle: **137
live · 177 dead · 247 awaiting a second look.** The map shows proven-live streams and NST embeds only (348 pins).
One-at-a-time tests confirm the live ones deliver video; 40 at once time out — these are small municipal servers.

**Added**
- **CCTV layer** (Ground observations → "CCTV"): pin ring colour = PM2.5 at the nearest station (Thai AQI 2023
  bands), pulsing above 75; popup = the reading first, then the picture, then attribution and "not an official
  announcement".
- **Haze eyes** (layers panel → 👁): the working cameras facing the worst air right now, ranked by PM2.5. When nothing
  is above 25 µg/m³ (most of the wet season) it shows the cameras near the highest readings instead and says so.
  Only 4 streams autoplay; the rest have a play button.
- `GET /api/cctv/all` (each camera carries `air`; `?live=1`, `?near=lat,lng`) and `GET /api/cctv/haze-eyes`.
  Both rate-limited (30/min).
- `server/airCctv.js` (pure: `pm25Band`, `pairAir`, `hazeEyes`) + `scripts/test-cctv-air.mjs` (16 checks, in `npm test`).

**Found while building it**
- Chrome now reports native HLS support, but its demuxer failed on these streams (`DEMUXER_ERROR_COULD_NOT_PARSE`).
  The player uses **hls.js first**, native HLS only where hls.js cannot run (iPhone).
- AirDash's global `article` / `header` CSS turned the wall cards into a 2-column grid. The cards are plain `div`s.

## [3.2.1] — 2026-09-19 · **Port hijack: a 20-hour API outage behind a healthy-looking site, and the watchdog that made it worse**

**What broke.** From 02:49 to ~23:05 (ICT) every `/api/*` request returned a plain-text 404 while the static
shell loaded fine. A second launchd service (the Sikhio CCTV relay) defaulted to port 8341 and bound
`127.0.0.1:8341`; AirDash was bound to `*:8341`. On macOS a specific-address bind beats a wildcard bind for loopback
traffic and both binds succeed, so the Cloudflare tunnel's `localhost:8341` silently reached the wrong process.

**Two components turned it into a 20-hour outage instead of a blip:**
- The edge proxy called any non-5xx a healthy backend (`status >= 500`), so it passed the stranger's 404 through for
  `/api/snapshot` and never used the stale mirror that exists precisely for outages.
- The watchdog read "unreachable", blamed our own healthy server, and killed + restarted it **every hour (22 times)**,
  never noticing the real cause. It also located "our" PID with `pgrep -f "node server/index.js"`, which matches
  FloodDash and DND too — a latent way to kill the wrong project.

**Fixed.**
- AirDash moved to **28341** (outside the 83xx/87xx/88xx dev-default cluster, below the ephemeral range).
- Every response carries `x-service: airdash` (set once at the top of the request handler, so raw `writeHead`
  paths — SSE tap, chat, exports — are covered). The edge proxy treats any response without it as backend-down: serves
  the stale mirror, else an honest 502; never caches or relays a stranger's body.
- Watchdog: probes require the identity header; PID comes from launchd; if another process holds our port it
  **reports who** (pid, start time, command) and refuses to kill or restart anything; a circuit breaker stops
  restart loops after two consecutive failed recoveries.
- The server self-probes its own port at boot and every 5 min and logs `PORT HIJACK` to the error log if the answer
  isn't ours.
- `scripts/test-port-hijack.mjs` (13 checks; the 6 incident cases fail against the pre-fix proxy).

**Found in the same health sweep — backups had silently stopped for 3+ days.** No nightly backup completed after
2026-09-16 and nothing said so. The backup destination is a USB *spinning* drive (~2 MB/s under load, shared with your other
jobs). `PRAGMA integrity_check` on the 3.7 GB snapshot *on that drive* took 7 h on 09-16 and never finished on 09-18 (44 h in
uninterruptible I/O); launchd won't start a second instance of a job that is still running, so every later night was skipped.
- `ops/backup-db.sh` redesigned: **VACUUM INTO the SSD → `quick_check` on the SSD (34 s) → `cp` to the USB drive as `.partial` →
  `cmp` against the verified SSD file → atomic rename → gzip from the SSD.** Only big sequential streams touch the HDD. Every stage has a hard
  ceiling; a failed or timed-out run publishes nothing and prunes nothing. Falls back (loudly) to direct-to-USB if the SSD lacks room.
  Superseded internal fallback snapshots are removed once a newer verified off-device one exists.
- Fixed a `set -e` bug in the earlier VACUUM INTO change: `cmd; RC=$?` exits before `RC=$?` runs, so the FATAL log and partial-file cleanup were unreachable.
- Watchdog: new **backup-freshness** alarm — no *completed* backup for ≥ 36 h → notification (once/day).

## [3.2.0] — 2026-09-17 · **Weather a person plans a day on, the first skill measurement, and an honesty pass**

> Asset token `?v=2.4.31` · service-worker cache `airdash-v49`.

### Added

* **TMD weather everywhere a place is shown** (`d7c4819`) — `sources/tmd-relay.js`
  copies FloodDash's `/api/weather` (TMD's 7-day forecast for 77 provinces +
  Pattaya, Hua Hin, Ko Samui, Hat Yai; 125 synoptic stations 3-hourly) into
  kv every 15 min: one ingestion, two dashboards. `server/weather.js` joins a
  point to five upcoming days and the nearest station ≤ 80 km / ≤ 6 h old with
  name, distance and age. `GET /api/weather` (edge-mirrored), `GET /api/weather/at`,
  `weather` on `/api/place`; `weatherStrip.js` renders the strip on the place
  card and the citizen page. Landmarks (12,854 OSM places) in search, with the
  same destination rule as FloodDash — **"Khao Yai" now means the national
  park**, not the Cha-Am tambon.
* **The promise, measured** (`0df920f`) — `risk_history` records every
  province's score hourly (from 2026-09-16 17:00 UTC); `GET /api/skill` replays
  the CAMS 24-h forecast and the score band against real ≥ 37.5 µg/m³ station
  crossings, with POD / FAR and an honest "not measurable yet" state. **First
  replay, 60 days: 18 events, 0 caught; 81 alarms, none verified.** The wet
  season's crossings are single-station industrial spikes (Rayong ×9,
  Chonburi, Ayutthaya) that a 0.4° CAMS field cannot see. Published as-is,
  with the per-province breakdown; the dust season is the real test and the
  ledger now exists to run it.

### Fixed (honesty audit, 25 findings across both twins)

* The Wallet chapter printed "0.0 million school lunches … every kid gets 0
  each" when national PM2.5 sat below the WHO line; it now says what ฿0 means.
  "Damaged crops" removed from a caption whose formula never computed crops.
* "The live map, 4,400+ stations" plotted 174 — copy now says ~170 AQ stations
  + ~1,900 rain gauges live (5,300+ registered), in both pages.
* "What's driving it right now" was a permanent heading over "no data" for
  71 % of provinces on a clean day — hidden when there is nothing to say.
* LINE copy said "national-level severe haze episode"; the trigger is any
  station over 37.5 µg/m³ — copy now says so.
* `/api/danger` carries `method_*` / `disclaimer_*` and states that the heat
  amplifier is 0 outside the hot season and noise covers 9 provinces.

### Known and not fixed today

* `top_stations` is `[]` and `region_th/en` null for all 77 provinces in
  `/api/risk` (air4thai.js never fills region); the burn-area panel shows
  off-season data without a "last published month" header; washout relief
  is a four-step literature lookup, not locally calibrated.

## [3.1.0] — 2026-09-16 · **The twins finally speak — CORS, the Twin API, explainable bands**

> Asset token `?v=2.4.30` · service-worker cache `airdash-v48`. Audit of both twin systems with FloodDash the same day; five commits, each one shippable on its own.

### Fixed

* **No CORS at all** — AirDash sent no `Access-Control-*` header on any
  route, so no browser on another origin (the user's other dashboards,
  the FloodDash twin) could read a byte of `/api/`. Ports the FloodDash
  public-read policy: read-only `/api/` answers `*`, preflight → 204
  before the rate limiter; `/api/admin/`, `/api/telegram/`, `/api/line/`,
  chat logs + FAQ moderation and export builds never get CORS from any
  origin. (`564a013`)
* **Bands with no reasons** — 60 % of the Air Watch Score (pollutants,
  trend, forecast, stagnation) could move a province to `watch` while
  `provinceVerdict()` returned zero reasons, because each component only
  spoke at its ALARM threshold while the score ladder starts far lower.
  Every component now has a mid-tier line keyed to the ladder; moderate
  PM2.5 (25–37.5) is named; the cap is 5 and `risk.js` no longer trims
  the list to 2. (`594b357`)
* **Citizen page discarded the server card** — it rendered band + score +
  a client-side advice table. A "why this band · evidence" block now
  shows the card's reasons, action and disclaimer.
* **Undefined CSS tokens** — `--lv1..5`, `--bg-soft`, `--card`,
  `--font-en`, `--r-sm/md/lg` were used 26× and defined nowhere; the
  UNHEALTHY / VERY UNHEALTHY station badges rendered with no colour.
* `max_province_score` was `list[0]` of a list sorted by PM2.5; LINE
  cancel-alerts line was in the wrong language.

### Added

* **`GET /api/twin`** — one compact, keyless per-province summary
  (`code`, `score`, `band`, `level`, bilingual headline + top reason,
  `pm25`, `aqi`, `pm25_fc_24h`, `washout_*`, `danger_*`) in the shape
  FloodDash publishes too. Contract in `docs/TWIN-API.md`; 30 s prebuilt
  cache; edge-mirrored with `x-airdash-stale-seconds`.
* **`version` in `/api/health`**, read once at boot from the `ops.html`
  asset token — the one source of truth `scripts/bump-version.mjs` keeps.
* **API reference tab** ("API · FOR DEVELOPERS" in About) — 7 groups, 59
  endpoints, every parameter one the handler reads, hotlines 1650 / 1422
  / 1669 and the PCD / MoPH duty block. `scripts/check-api-docs.mjs`
  fails the build on a documented route that is not served and on a
  public route that is not documented. (`92ba6d5`)
* **FloodDash twin relay** — `server/sources/twin-flood.js` polls
  FloodDash `/api/twin` every 10 min; `p.flood` on every province (never
  scored); two verdict reasons: the flood verdict when FloodDash has the
  province at prepare/danger, and *"the rain that may clear the dust may
  also raise the rivers here"* when `washout_helps` and the flood side is
  at watch or above. (`5e22ff8`)
* Four new test scripts in `npm test` (explainability 18, twin/CORS 26,
  API-docs coverage 61, twin-flood 21); the older scripts now import
  relatively instead of via `/Users/axiom/AirDash/…`.

## [3.0.0] — 2026-07-24

### AirDash 3.0 — communication facelift + overlap-free layout

The same 2.0 instrument, restyled to communicate better. No science or
data-layer changes.

#### Fixed

* **Header verdict crush** — on 1101–1560px viewports the national
  verdict block (the header's headline message) was squeezed to 29px
  wide and the data-freshness pill to 14px, both unreadable, because
  they were the only flexible items in the header row. Both now hold
  min-widths, and a **shed ladder** at the end of layout.css releases
  space instead: partner marks → partner plate + focus dropdown →
  compare button → nav-button labels (icon-only), decorations before
  functions. Nothing clips off-screen at any width.
* **Phone freshness pill overlap** — the pill's fixed offset used
  `--header-h` (64px), but the phone header's px-fixed rows deliberately
  overflow to y≈125 and the map's layers control sits right under them;
  the pill was covering the search box and the ไทย/EN toggle (measured
  79×17px overlap). Now anchored at 174px, clear of the whole stack.

#### Changed

* **3.0 surface language** — removed tokens.css's universal
  `border-radius: 0 !important; box-shadow: none !important` reset,
  which had silently killed every authored radius and shadow in the
  codebase. Added radius/elevation/motion tokens (`--r-ctl`, `--r-card`,
  `--elev-1/2`, `--motion`) and a surface layer at the end of
  components.css: rounded header controls and nav, elevated map-floating
  controls (legend, radar, layer picker), rounded rail/overlay cards and
  search dropdown, smooth hover transitions, and a consistent
  `:focus-visible` ring. Dense data tables stay square.
* Product generation 2.0 → **3.0** across the brand badge, boot screen,
  titles / OG cards, PWA manifest, READMEs, and the research-paper
  masthead (with an honest one-paragraph 3.0 note in the "What Changed"
  section). SW shell `airdash-v24` → `airdash-v25`.

---

## [2.0.0] — 2026-07-24

### Generation release — the product is now "AirDash 2.0"

Marks the accumulated 1.x work (science engine, Air Story front door,
life-safety alert pipeline, data-honesty layer, ops hardening) as the
second product generation, and makes the generation visible in the UI.

#### Added

* **"2.0" version badge** on the Mission Control brand (`AIR·DASH 2.0`),
  the Air Story chrome, the boot screen, page titles / OG cards, the
  PWA manifest, and both READMEs — the visible answer to "am I on the
  new version?".
* **Header partner-logo plate** on Mission Control — the same mark set
  FloodDash carries (depa · Smart City Thailand Office · Axiom+ReTL ·
  SLIC · RCAD) on one solid white plate, shedding progressively on
  narrow viewports (full credits remain on the boot screen and About
  panel at every width).
* **Research paper: "AirDash 2.0 — What Changed Since 1.0"** — an
  unnumbered generation section between the hero and §1 with a
  six-axis v1.0 → v2.0 comparison table (science layer, two-audience
  architecture, alert pipeline, data honesty, operational resilience,
  decision ergonomics); paper masthead now reads v2.0.

#### Changed

* Service-worker shell bumped `airdash-v23` → `airdash-v24` so
  returning visitors flush the old-brand shell cleanly.

---

## [1.1.0] — 2026-07-21

### Air Story front door + Science engine

The front page becomes a story, the dashboard becomes Mission Control,
and every µg/m³ gets translated into human units — with receipts.

#### Added

* **Air Story** (`public/index.html` + `public/css/story.css` +
  `public/js/story.js`) — a scroll-based bilingual narrative front door
  for smart kids and curious adults: a breathing full-viewport hero
  circle tinted by the live Thai AQI band carrying a giant
  cigarette-equivalents number (22 µg/m³·day ≈ 1 cigarette, Berkeley
  Earth rule); a 7-persona selector (kid / teen / adult / athlete /
  senior / pregnant / asthma, kid default) driving personalized dose,
  play budget, and guidance from `/api/science/personal`; a body-journey
  SVG; **The Wallet** (daily national haze bill via VSL, per-person
  "haze tax", 3 freakonomics cards — the externality of field burning,
  the information asymmetry of invisible PM2.5, present bias); **The
  Sky** (Koschmieder visibility estimate + stagnation explainer + cause
  chips); **The Forest** (AOT40-style ozone crop stress); a **Science
  Receipts** formula wall rendered from `/api/science` `meta.formulas`;
  and an **ACT** chapter (band-aware checklist, LINE OA / LINE Notify /
  Telegram signup, link to Mission Control).
* **Science engine** (`server/science.js`, `createScience` factory,
  60 s TTL cache) — the health-translation layer: cigarette-equivalents,
  life-minutes, excess mortality, AQLI life-expectancy years, the
  national haze bill + per-person haze tax, Koschmieder visibility, and
  AOT40-style ozone crop stress. New endpoints `GET /api/science`
  (national + 77 provinces + persona profiles + `meta.formulas`
  receipts) and `GET /api/science/personal?pm25|province&profile&outdoorMin&activity`.
  Constants in `CONFIG.science`; citations include WHO 2021, Liu et al.
  2019 (NEJM), Burnett et al. 2018 (GEMM), AQLI / EPIC U. Chicago,
  Müller & Müller (Berkeley Earth), Koschmieder 1924, and Spiegelhalter
  microlives.
* **`server/populations.js`** — 77 DOPA province populations for the
  per-capita haze economics.
* **`server/washout-curve.js`** — the ONE shared rain-relief curve
  (1–5 mm → 8% · 5–15 → 20% · 15–35 → 30% · 35+ → 40%), now used by
  both `danger.js` and `washout.js` so every engine agrees.
* **`knowledge/health-science.md`** — full formula documentation; feeds
  the in-app Air Library via the `knowledge/*.md → rag_docs` convention.

#### Changed

* **Operator dashboard preserved at `/ops.html`** ("Mission Control") —
  the former index.html (header + ranking rail + Leaflet map + 11-tab
  right rail + ticker) with a หน้าแรก/Home chip back to `/`. Chart and
  analytics palettes de-FloodDashed to the AirDash tokens.
* **Palette rebrand** — the FloodDash palette (warm paper `#F6F4EF`,
  navy `#241E4E`, Thai-flag red `#A51931`, IBM Plex Mono) is replaced by
  light sky paper `#F4F8FB`, deep-teal ink `#0E4A5E`, sage `#3A8A6E`,
  ochre `#D8893A`, brick `#C8453A`, purple `#6B2D5C`, and the Thai-AQI
  5-band severity palette; Sarabun + Manrope + JetBrains Mono. Sharp
  corners, no shadows, full automatic dark mode, and
  `prefers-reduced-motion` support throughout.

#### Fixed

* TMD rain thresholds added (10 / 35 / 90 mm).
* One shared washout relief curve (8 / 20 / 30 / 40 %) across the
  danger, washout, forecast, and what-if engines.
* Danger-score forecast base reconciled.
* Non-Thai province codes filtered (78 → 77 provinces; Myanmar gauge
  excluded).
* Sensor freshness map completed (gistda_pm25 3 h, pcd_noise 36 h,
  openmeteo_aq_hist 7 d).
* Rate-limit keys computed on the last untrusted XFF hop (Cloudflare
  Pages proxy topology).

---

## [1.0.0] — 2026-07-16

### AirDash born from the FloodDash backbone

AirDash is a full transformation of the FloodDash codebase (Thailand flood
watch) into a Thailand air-quality / PM2.5 dust watch. Same single-process
Node ≥ 22.5 architecture, zero npm dependencies, SQLite WAL storage, SSE
tap, bilingual TH/EN frontend — refocused on the hazard Thais face five
months of every year.

#### Added

* **Air4Thai as the primary pipeline** — PCD ground AQI network (~200
  stations, hourly): PM2.5, PM10, O3, NO2, SO2, CO, AQI, matched to
  provinces via the gazetteer.
* **CAMS air-quality forecast pipeline** (`openmeteo_aq`, 3-hourly) —
  PM2.5/PM10/dust outlook to 72 h per province centroid.
* **Air Watch Score** (`server/risk.js`) — `0.40·pm25 + 0.10·pollutants +
  0.15·trend + 0.20·forecast + 0.15·stagnation`, sub-score curves anchored
  on the Thai AQI 2023 PM2.5 breakpoints (15/25/37.5/75 µg/m³). Bands and
  JMA-style verbs: GOOD AIR / STAY INFORMED / LIMIT OUTDOOR TIME /
  PROTECT NOW.
* **Rain-Washout engine** (`server/washout.js`) — the signature feature.
  Per province: forecast rain amount × probability → `relief_if_rain_pct`
  (≥5 mm ≈ 20%, ≥15 mm ≈ 30%, ≥35 mm ≈ 40%), `expected_relief_pct`,
  `projected_pm25`, band none/light/moderate/strong, `helps_dust` flag.
  New endpoint `GET /api/washout`; `GET /api/wetness` kept as a
  back-compat alias.
* **Dust-season override** — window 1 Dec – 30 Apr; national `dustLoadPct`
  (% provinces with worst PM2.5 ≥ 25 µg/m³); at ≥30% inside the window, a
  "normal" national band renders as LOW — STAY INFORMED.
* **Stagnation sub-score** — ventilation proxy from forecast wind + rain
  probability; zeroed by observed rain >10 mm.
* **WHAT-IF rain simulator** — `GET /api/whatif?rain=X`: "if X mm falls in
  24 h" → projected PM2.5 per province through the washout curve.
* **Citizen panel, air edition** — hotlines 1650 (PCD) / 1422 (DDC) /
  1669 (EMS), per-band health checklists (N95, windows, clean room,
  sensitive groups), 3 nearest AQ stations via
  `GET /api/stations/nearest`, share/LINE.
* **The Air Bible** (`corpus/bible/sec00–10`, 22 bilingual files) — the
  in-app methodology library: Thai AQI 2023 standard, data sources, score
  derivation, washout science, dust seasonality, ventilation, sensor
  health, action framework, historical episodes (2019 Bangkok, Chiang Mai
  2019/2023, 2015 southern haze), limitations & ethics. Validated by
  `scripts/validate-bible.mjs` (all 11 EN/TH pairs pass).
* **Knowledge notes rewritten for air** (`knowledge/*.md`) — paper.md
  (bilingual research paper), rain-washout.md, score-method.md,
  aqi-bands.md, pollutant-standards.md, dust-seasonality.md,
  historical-haze.md, data-sources.md, glossary.md, project-vision.md.

#### Changed

* Identity: port 8340 → **8341**, DB `data/flooddash.db` →
  `data/airdash.db`, launchd `com.flooddash.*` → `com.airdash.*`,
  Pages project `flood` → `airdash`, tunnel `api-flood` → `api-air`,
  live URL flood.nonarkara.org → **air.nonarkara.org**.
* Risk payload keys: `soilSaturationPct→dustLoadPct`,
  `wetSaturatedCount→dustyProvinceCount`, `soilSampledCount→dustSampledCount`,
  `floodSeason→dustSeason`.
* Map: AQ stations are the primary markers (PM2.5-coloured); RainViewer
  radar and NASA GIBS stay (they now serve the washout story).
* News pipeline keywords: น้ำท่วม/อุทกภัย → ฝุ่น/PM2.5/หมอกควัน.
* Design language unchanged (paper ground, navy chrome, squares, Sarabun +
  IBM Plex Mono); Thai-flag red `#A51931` still reserved for genuine danger.

#### Removed

* Flood-only modules: `rivers.js` (cascade), `wetness.js` (soil API),
  `shelters.js`; endpoints `/api/rivers`, `/api/shelters*`.
* Flood-only pipelines: `thaiwater-level`, `thaiwater-dam`,
  `rid-reservoir`, `glofas`.
* Flood knowledge notes: connected-waterways, soil-wetness, rain-bands,
  situation-levels, flood-seasonality, historical-floods, risk-method
  (replaced by air equivalents).

---

**Live:** [air.nonarkara.org](https://air.nonarkara.org)
