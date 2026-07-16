# FloodDash v2.0 Human Audit

Date: 2026-07-16
Production baseline: `c8e7509`
Audit viewports: 1440×900, 1024×768, 390×844
Modes: Thai and English; Citizen (Easy) and Operator (Full)

## Audit question

Can a resident, city officer, or reporter answer these questions without
learning the interface first?

1. Is my area affected?
2. What should I do now?
3. Where can I go for help?
4. What evidence supports the status?
5. How do I reach the deeper operator tools without losing context?

## Findings and v2.0 decisions

| Priority | Human confusion observed | v2.0 decision |
|---|---|---|
| P0 | A score of 74/100 rendered “EVACUATE NOW,” while the detailed card said to follow official orders and prepare to evacuate only in a risk zone. | The heuristic now tops out at **ACT NOW**. The national hero uses **CHECK YOUR AREA NOW**. Only authorities issue evacuation orders. |
| P0 | Switching to English overwrote the live critical hero with “Loading… / ALL CLEAR.” | Dynamic hero nodes are no longer repainted as static chrome; language switching preserves the live state. |
| P0 | At phone width, the national status and controls overflowed off-screen beneath the AI bar. | Compact header is now a two-row constraint: status + mode, then place search + language. |
| P0 | Citizen mode on mobile opened the national ranking; “my area,” shelters, sharing, and hotlines were unreachable. | Added a **MY AREA** sheet and made it the citizen default. Compact Citizen navigation now exposes My Area, Risk, and Alerts; desktop Easy mode keeps My Area and Alerts. |
| P0 | The citizen panel asked for a LINE Notify token even though LINE ended that service on 2025-03-31. | Removed the dead UI, API routes, scheduler, schema, and module. Kept a simple LINE Official Account follow link and the working Messaging API broadcast integration. |
| P1 | The 191 hotline was labeled “tourist police.” | Corrected to **police emergency**; tourist police is not 191. |
| P1 | The 1024px layout squeezed three columns into unreadable 29px tabs and a 424px map. | The compact map + focused-sheet layout now starts at 1100px. |
| P1 | Full mode could retain the Citizen tab, so “Full” appeared to change nothing. | Full mode now opens Overview; Easy mode opens My Area. |
| P1 | Eleven operator tabs were squeezed into one row at 29–33px each. | Reordered by human priority and split into a six-column, two-row grid. |
| P1 | The map opened with seven overlapping layers, a large legend, and an expanded layer menu. | Defaults are now radar + water + province risk. Layers and legend start collapsed. |
| P1 | Fifteen unrelated TV streams loaded inside the map control, including sports and education channels. | Removed the TV wall and the third-party HLS dependency. |
| P1 | Place-search results were clickable `div`s; Arrow selection was ignored by Enter. | Results are semantic buttons/options with `aria-expanded`, active-descendant state, and correct Enter behavior. |
| P2 | Share previews and search discoverability lacked basic metadata and page semantics. | Added canonical, description, Open Graph, Twitter Card, JSON-LD, one `h1`, a `main` map landmark, and control labels. |
| P2 | Motion had no reduced-motion fallback. | Added a reduced-motion contract for ticker and UI animation. |

## Scope restraint

v2.0 does not redesign hydrological models, add new data sources, or create a
new framework. Existing live pipelines, place comparison, history, library,
AI, exports, shelter lookup, and LINE Official Account broadcasting remain.
The release changes meaning, reachability, defaults, and dead features—the
parts humans encounter before any advanced analysis.

## Release checks

- JavaScript syntax for all server, public, function, and script modules
- Server boot and `/api/health`
- Desktop, compact-laptop, and phone screenshots
- Citizen/Operator mode switching
- Thai/English live-status consistency
- Mobile My Area access
- Search keyboard and result semantics
- Compare Places open/close and cards
- Production Cloudflare Pages URL and proxied API health
