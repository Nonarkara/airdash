# AirDash frontend audit — 2.4.69

2026-10-04, Asia/Bangkok. Baseline f08988e / 2.4.68. Scope: home, dashboard, place selection, phone navigation, camera/information dialogs, chat, install entry points, storage and network recovery, asset deployment.

## Confirmed defects and repairs

Search API results existed but the dropdown was only 3px high: its top plus bottom consumed the entire viewport. Bounds now provide usable width/height and account for the visual viewport. Request generations prevent old searches from replacing newer results, or reopening after Escape/clear/outside dismissal. Failure messages offer recovery.

Phone search selection triggered Leaflet `Invalid LatLng (NaN, NaN)` during a flight while the map sheet was hidden. Movement now stops the existing animation, rejects nonfinite coordinates, uses an immediate view for zero-size maps and respects reduced motion. City detail and periodic refresh results also require the active selection generation.

Direct localStorage reads/writes could interrupt module initialization and user actions. A shared preference adapter catches unavailable/full storage and preserves current-visit choices. Story profiles validate saved identifiers. Browser-storage failures are covered behaviorally.

Camera dialogs lacked a keyboard Tab boundary and return focus. Shared containment restores scrolling and opening focus, filters unavailable controls and cycles Tab/Shift-Tab. Camera request responses target their original dialog instance; closing during a failed Window request cannot dereference a removed overlay. More navigation supports Escape. Current mobile destination uses aria-current.

Chat and JSON requests have bounded deadlines. Send is disabled while busy and restored on failure; the chat log exposes its busy state. Example questions update when changing language. Startup recovery uses plain connection guidance. Phone text inputs/selectors use 16px text and the custom search clear button has a 44px target; native duplicate search clear is hidden.

## Evidence

- Full `npm test` run: exit 0, 1,010 custom checks plus 14 TAP tests, no failures. Thirteen new behavioral UX checks cover search bounds, keyboard viewport, competing requests, dismissal, network failure, storage, map movement, reduced motion, dialog focus, corrupt profiles and close-during-request.
- Final phone-style changes: header layout 23/23, consistency 14/14, UX 13/13 passed separately. Deployment also runs syntax, consistency and version gates.
- Live baseline phone audit exercised overview, washout, history, signals, news, tap, sources and library; panels rendered and captured console errors were empty.
- Repaired search preview: 17 actual Bangkok results, 420px dropdown, keyboard ArrowDown/Enter opened the Bangkok card, document width matched the 390px viewport. That flow exposed the hidden-map error repaired above.
- Subsequent local browser verification was interrupted by backend/preview connection stalls. The existing backend was restarted and an HTTP probe returned 200. Do not describe those interrupted browser runs as successful checks.
- Asset deployment probes include canonical/custom hashes for preferences, dialog focus, map movement, search, Window and chat alongside existing shell/panel probes.

## Limits

No performance trace tool was available; no Lighthouse, Core Web Vitals, physical-iPhone keyboard or screen-reader certification is claimed. Browser checks and regression tests reduce known defects; they do not prove absence of every possible glitch. One live backend and same-machine USB archive remain the operational failure domain documented in prior audits. Third-party cameras, data feeds and AI services can still fail; the interface must represent those states honestly.
