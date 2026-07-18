# AirDash Audit — UX/UI + Accessibility · Navigation & State Flow

Audited live at http://localhost:8341 (desktop light + dark, mobile 375×812, TH + EN, EASY + FULL).
Everything below was reproduced in the running app unless marked (code-read).
Ordered by how much it hurts a citizen during a real haze event.

Severity counts: **3 CRITICAL · 6 HIGH · 12 MEDIUM · 5 LOW**

---

## CRITICAL

### C1 · The entire city-focus system is dead — `initFocus` is imported but never called
- **Where:** `public/js/main.js:21` imports `initFocus` from `panels/focus.js`; the `boot()` list (`main.js:314–348`) never invokes it. A stale comment at `main.js:338` ("initFocus is async…") sits where the call used to be — it now refers to `initCityDashboard` instead.
- **What a user experiences:**
  - The header focus dropdown (`#focus-select`, `index.html:166`) renders as a **visible empty select** — verified live: `optionCount: 0`.
  - `?city=chiangmai` / `?city=bangkok` (the focus-ID deep links the city-picker grid generates at `city-dashboard.js:224`) never load a city dashboard.
  - The "pick a city" landing grid (`city-dashboard.js:199`) **never renders** — it only draws on a `focus` event, and nothing ever emits one. Verified live: `#city-dashboard` stays `display:none`, 0 children.
  - Consequently the whole City Dashboard panel (367 lines: identity plate, pollutant strip, danger/washout scores, city hotlines, seasonal notes) is **unreachable by any user action**, and `store.activeArea` is never set, so the top-bar Danger chip never city-scopes (`header.js:129–135`).
  - `/api/focus` works fine (returns 8 areas) — this is purely a frontend boot regression.
- **Fix:** add `safeInit('focus', () => initFocus(map))` after `initMap()` in `boot()`. Then reconcile with C6/H6 below (two `?city=` vocabularies).

### C2 · Dark mode: light text on hardcoded white — the "what to do" layer is illegible at night
- **Where:** `components.css` has ~52 hardcoded white/near-white backgrounds paired with `color: var(--ink)`; dark tokens (`tokens.css:196`) flip `--ink` to light teal `#B8D4E0` but these backgrounds never flip. Verified computed styles in dark mode:
  - `.rnc-action` (`components.css:563–570`): the national action line "▶ เช็กค่าฝุ่นจังหวัดตัวเอง…" renders `rgb(184,212,224)` on `rgba(255,255,255,0.75)` ≈ **1.5:1 contrast**.
  - `.rnc-toggle` "ทำอะไรดี? / What to do?" (`components.css:542–553`): same light-on-white.
  - `.citizen-pick-row` (`components.css:783`): province rows in the EASY-mode "pick your province" picker are `#fff` background with light-teal text — verified `rowBg: rgb(255,255,255)`, `nameColor: rgb(184,212,224)`. **This is the first mandatory interaction of citizen mode.**
  - `.citizen-band-score` (25/100 chip), `.rnc-window`, `.rx-detail-btn` (`:628`), `.chat-example-chip`, boot sponsor chips (`:1176`), and every other `rgba(255,255,255,…)` in the file.
- **What a user experiences:** at night (OS dark mode is automatic — there is no in-app toggle), the highest-stakes strings — the national "do this now" instruction and the citizen onboarding list — are white boxes with ghost text. Light mode is fine (verified).
- **Fix:** replace hardcoded whites with a token (e.g. `--chip-bg: rgba(255,255,255,0.7)` overridden to a dark well in the dark block), or add a dark-mode override section like `city-dashboard.css:395` already does.

### C3 · ASK AI is a dead button in EASY mode — and leaves a blank screen on mobile
- **Where:** `layout.css:1180` — `body.mode-citizen #pane-chat { display:none !important }`. The prominent green ASK AI header chip stays visible in citizen mode and still calls `selectPane('chat')` (`main.js:306–312`).
- **What a user experiences:** verified live — in EASY mode the tap marks the chat pane `.active` but computed `display:none`. Desktop: nothing happens. **Mobile: the active sheet becomes the hidden chat pane, so the whole area below the sheet tabs goes blank** (screenshot-verified: MY AREA sheet highlighted, content region empty until another sheet tab is tapped).
- **Fix:** either hide `#ask-btn` in citizen mode (add to the `layout.css:1153` hide list), or let citizen mode show the chat pane. Guard `selectPane()` against selecting a pane whose tab is hidden.

---

## HIGH

### H1 · NEWS tab is empty in English mode — headlines vanish, only "7h ago" rows remain
- **Where:** `feeds.js:47` — `const title = tr(n.title, n.title_en)`. Google-News-TH items have `title_en: null`, so in EN the anchor renders with no text. Verified live: `<a href="https://www.khaosod.co.th/…"></a>` + "7h ago", 15 items, all blank.
- **Fix:** `tr(n.title, n.title_en ?? n.title)` — the ticker already does exactly this (`main.js:249`).

### H2 · Both compare overlays are unreachable — 800+ lines of feature with no entry point
- **Where:** `split.js:56` needs `#split-btn`; `compare.js:32` needs `#compare-btn`; neither exists in `index.html` (grep-verified). Both init functions early-return, so `#places-overlay` (`index.html:214`) and `#compare-overlay` (`index.html:655`) are dead markup.
- **What a user experiences:** the "Compare Places" experience described in the markup comments (data bar, 2/3/4 panes, per-place verdicts) simply does not exist for any user. Silent feature loss from the top-bar v2 redesign.
- **Fix:** re-add one trigger (a header chip or an OVERVIEW-panel button) wired to `split.js`'s `open()`, and delete the older `compare.js`/`#compare-overlay` twin.

### H3 · `?city=` has three competing meanings; the shared "city link" often shows nothing to its recipient
- **Where:**
  - `focus.js` expects focus IDs (`chiangmai`) — dead (C1), but `city-dashboard.js:224` still *writes* these IDs into the URL if the grid ever renders.
  - `search.js:219/227–237` writes/reads Thai place names (`?city=ศูนย์ราชการจังหวัดเชียงใหม่`) → left-rail place card.
  - `citizen.js:62–77` matches the value against **province** names only.
  - First-time visitors with any `?city=` default to citizen mode (`main.js:127–128`), and on desktop ≥1101px citizen mode hides the whole left rail (`layout.css:1190`) — where the place card lives.
- **What a user experiences:** a mayor shares "ลิงก์เมืองนี้" for a district office. The recipient (first visit → EASY mode) gets: no place card (left rail hidden), no MY AREA pin (not an exact province name), no fly-to. `?city=chiangmai` (grid/focus vocabulary) half-works only because full-text search happens to resolve it to a Chiang Mai station — the title becomes "ศูนย์ราชการจังหวัดเชียงใหม่", not the promised city dashboard. Verified both live.
- **Fix:** one canonical `?city=` resolver at boot: try focus ID → province → place search, then route to the *visible* surface for the current mode (pin MY AREA in EASY; place card/city dashboard in FULL).

### H4 · Mobile 375px header: the hero verb — the one thing that must dominate — is truncated
- **Where:** header layout at ≤~430px; `#national-th` at 13.5px, `scrollWidth > clientWidth` (verified: "ติดตามสถานกา…"). Meanwhile the search box overlaps the brand row and the ASK AI chip is clipped off the right edge (screenshot-verified).
- **What a user experiences:** during an episode the phone header shows a truncated verb and an intact "DANGER 62 Dangerous" — the actionable instruction ("ลดกิจกรรมกลางแจ้ง", "ป้องกันทันที") is the casualty. On the `high` band this is the JMA-style verb citizens are supposed to read first.
- **Fix:** at mobile widths give the verb its own full-width row (it already has `.sub-short` treatment for the brand), allow wrap to 2 lines, and drop the decorative brand instead.

### H5 · Danger 62 "Dangerous" chip contradicts every calm signal next to it, and its explanation is hover-only
- **Where:** `header.js:120–179`; `index.html:127–135`. The chip shows the **worst province's** composite, but the scope ("Samut Prakan", the formula breakdown) lives only in `title=` tooltips — unreachable on touch and keyboard (`#danger-hero` is a div, not focusable). Ranking-row danger chips (`ranking.js:151–160`) have the same title-only pattern.
- **What a user experiences:** top bar simultaneously says **DANGER 62 (red)**, hero verb "STAY INFORMED (watch)", national score **10/100 (green)**, and OVERVIEW's SEVERE NOW strip says "No station above the health line right now". A citizen on a phone cannot discover that 62 is a heat/humidity-amplified worst-province composite. In a real episode this either causes panic or — worse — teaches users to ignore the red number.
- **Fix:** render the scoped province name inside the chip (not the tooltip), make the chip a `<button>` opening the same breakdown the province detail panel shows (`detail.js` already renders it), and visually subordinate it to the hero verb.

### H6 · Mobile FULL mode cannot reach OVERVIEW, HISTORY, SIGNALS or NEWS at all
- **Where:** `#sheettabs` (`index.html:305–314`) has 8 buttons, but at 375px three of them are CSS-hidden even in FULL mode (`tap`, `sources`, `library` measured `offsetWidth: 0` live), and the nav has **no buttons at all** for `analytics` (OVERVIEW), `history`, `insights` (SIGNALS) or `news`.
- **What a user experiences:** an operator on a phone has MY AREA / RISK / WASHOUT / ALERTS / ASK only. The OVERVIEW pane — SEVERE NOW strip, worst-PM tiles, top-5 lists, 14-day chart — is desktop-only. The severity-first "worst readings dominate" surface doesn't exist on mobile.
- **Fix:** add an OVERVIEW sheet button (highest priority), and make `#sheettabs` horizontally scrollable rather than silently dropping panes.

---

## MEDIUM

### M1 · Two different 0–100 scales side-by-side in every ranking row
`ranking.js:162–183`: each row shows watch score (badge, e.g. **25**) and danger chip (e.g. **44 ระวัง**) with no visible label distinguishing them. Bangkok reads "25 … 44" — which number do I trust? The distinction (watch vs acute composite) is tooltip-only. Label the chips inline (e.g. tiny "เฝ้าระวัง"/"อันตราย" captions) or show danger only when it exceeds the band threshold.

### M2 · Alert list: good news dressed as bad news, no severity ordering, no SR announcement
`feeds.js:32–43`: rain-washout alerts ("Rain 15 mm — washing dust out locally" — *relief*) get the same red-family chevron badge as "PM2.5 at 50 µg/m³ — starting to affect health". List is insertion-ordered, not severity-ordered. No `aria-live` on `#alerts` or the ticker — `announceReady` (`main.js:262`) is the only live region in the app, so a SEVERE alert arriving over SSE is silent for screen-reader users. Style washout alerts with the rain palette, sort severity-first, add a polite live region for severity ≥2.

### M3 · Chat pane never repaints on language switch
`chat.js` registers no `on('lang')` handler: greeting, example chips and the status line stay in the boot language until reload (verified: Thai UI showing "● model offline — live-data summary fallback"). Also the model-offline state is honest but EN-leaning. Re-render greeting/examples/status on `lang`.

### M4 · What-if slider: 80% of its travel does nothing
`whatif.js:71` — range 0–200 mm, but the washout relief curve caps at ~40% at 35 mm (per DESIGN-AIRDASH). Verified: 115 mm shows the same ~40% as 40 mm; 36–200 mm is a dead zone. 200 mm/24h is also flood-scale framing (FloodDash residue). Cap the slider at ~50 mm with band ticks (1/5/15/35), or show "maximum washout reached" feedback.

### M5 · Deep links can't carry language or tab; reload loses your tab
There is no `?lang=` param anywhere (grep-verified) — a Thai grandmother receiving a link from an EN-configured phone gets whatever `ad_lang` her browser has; a fresh browser gets Thai. Active right-rail tab isn't in the URL either: reload mid-WASHOUT returns to OVERVIEW. Add `?lang=` (read at boot, write on toggle) and optionally `?tab=`.

### M6 · Back button and overlays: replaceState-only means Android back exits the app
All URL writes are `history.replaceState` (`search.js`, `focus.js`, `city-dashboard.js`); overlays (library reader, About, TV mode, place card) push nothing. On mobile, pressing back inside the full-screen library reader or About closes the *site*, not the overlay. Push a history entry when opening full-screen overlays and close them on `popstate`.

### M7 · Library rows aren't keyboard-accessible
`library.js:64` (`.lib-toc-row`) and `:102` (`.lib-result-row`) are `div onclick` — no tab stop, no Enter/Space, no role. The reader overlay has no Escape handler (TV mode does, `search.js:566`). Convert rows to `<button>`, add `keydown Escape` in `initReader`.

### M8 · Top-5 tiles and ticker truncate province names to uselessness
OVERVIEW top-5 chips render "กรุง… 25/100", "Sam… 32 µg" (screenshot-verified at default rail width). The name is the payload — a reader can't tell Samut Prakan from Samut Songkhram. Let names wrap, or drop the "/100".

### M9 · Mobile z-index collision: layers panel vs RADAR chip; layers covers header controls
Screenshot-verified at 375px: the open layers dropdown is overlapped by the RADAR timeline chip (occluding the MODIS row), and the dropdown extends under/over header controls so taps aimed at EASY/FULL hit the layers list. Raise the dropdown's z-index above the radar chip and close it on outside tap.

### M10 · Thai microcopy below the 11px floor
`.rnc-disclaimer` 9.5px (`components.css:577`) carries a full Thai disclaimer sentence; `.appfooter-line` drops to 9.5px on mobile (`layout.css:431`); `.forecast-method` 10px Thai (`components.css:34`). Thai glyphs with stacked vowels/tone marks are unreadable at these sizes. Keep sub-11px for EN mono eyebrows only.

### M11 · FloodDash residue in state + palettes
- Checklist ticks stored under `fd-check-*` (`search.js:310`) while everything else is `ad_*` (`ad_lang`, `ad_mode`, `ad_my_province`) — verified in localStorage. Old FloodDash keys will also never be cleaned up.
- Place-card rain bars use flood thresholds/colors (`search.js:302–304`: 10/35/90 mm, flood navy `#0039A6`) though the washout story bands at 1/5/15/35 mm.
- Prepare icon "🎒" (`search.js:294` VICON) is evacuation-bag flood language, odd for dust.

### M12 · EASY mode still leaks operator chrome
In citizen mode the DANGER composite chip stays in the header (see H5) and the RISK sheet on mobile shows the full 60-province ranking with method-note jargon ("PM2.5 40% · other pollutants 10% · …indicator, not a prediction") as its lead. For the stated audience (non-technical Thai reader) the essential set is: verb, advice, stations, share, hotlines — all present and good — plus one number too many. Consider hiding the danger chip in EASY and simplifying the RISK method note.

---

## LOW

- **L1 · Radar clock stuck at "--:--"** the whole session (screenshot-verified) — if RainViewer frames fail, hide the chip instead of showing a permanently empty clock.
- **L2 · Map markers are canvas circles with no accessible alternative** — `main#map` has an aria-label but stations/provinces are invisible to SR users; the ranking list is the fallback, which is acceptable, but note it.
- **L3 · `#sheettabs` buttons lack `aria-pressed`/tab semantics** (plain buttons + `.active` class), unlike the properly ARIA-fied `#righttabs` (`main.js:140–194`, which is genuinely good: roving tabindex, arrow keys, Home/End all verified in code).
- **L4 · Empty visible `#focus-select`** — even after C1 is fixed, at 1101–1280px the dropdown truncates city names at 110px (`layout.css:1226`); consider min-width.
- **L5 · `waterways` naming residue** — tab `data-pane="waterways"`, `initWaterways`, `#waterways` for the washout panel; harmless but confusing for maintainers.

---

## What's genuinely good (keep)
- Right-rail tabs implement the full WAI-ARIA tabs pattern (roving tabindex, arrows, Home/End, `hidden` sync) — `main.js:140–194`.
- Honest empty states: SEVERE NOW "No station above the health line (37.5 µg/m³) right now"; sensor-health "7 suspicious stations — stale 7"; chat's "model offline — live-data summary fallback".
- `tel:` hotlines everywhere they matter (`citizen.js:281–289`), share via LINE/SMS/copy with province-scoped text, one-tap navigate-to-station links.
- Boot retry with backoff + manual retry error state (`main.js:55–84`); `safeInit` isolation.
- Light mode visual hierarchy is strong; province detail panel's danger-formula breakdown is exemplary transparency.
- Reduced-motion handling for the ticker (`tokens.css`), `aria-live` boot status, and the ready announcement carrying the national verb.
