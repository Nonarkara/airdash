# Regional map composition — 2.4.93

User repeated the Palette request after 2.4.92: the previous pass changed tokens and card styling, while the page still opened as a large editorial header followed by rows of controls. This pass changes the composition.

## References actually read

Local Palette reference export:
- `/Users/axiom/Documents/Codex/2026-10-02/task-5/palette-reference/PALETTE-FIELD-GUIDE.md`
- `/Users/axiom/Documents/Codex/2026-10-02/task-5/palette-reference/DESIGN-FIELD-GUIDE.md`

Applied: let the object dominate, quiet labels, hierarchy through position/proportion, preserve cockpit signal semantics and actual functionality. A Wada exhibition chord is not a reason to recolour health signals. This release uses AirDash's existing Palette-derived tokens.

## Human task and alternatives

Person: a resident or operator checking nearby and cross-border haze. Main obstacle: sparse coverage and too much interface between them and the map. Primary job: operate/explore evidence.

Two compositions considered with the same content: (1) editorial overview with a hero and full directories below; (2) map-led instrument with a compact rail and on-demand reference material. The second serves the user's stated visualization task and matches the existing operator system. The hero, prose and repeated containers no longer occupy the opening view.

- Map is the dominant field directly below compact identity/scope strips.
- View controls and reporting coverage share one quieter instrument rail.
- PM legend remains visible on the map without covering zoom controls, and hides when the PM layer is off.
- Source/country/method material preserved behind a native disclosure. Header “Sources & coverage” opens it before scrolling; country focus and upstream links remain functional.
- Phone CSS places map before the rail; directory rows reflow. No new colour-only status semantics.
- Wind glyphs smaller and decluttered to one existing province direction per 1.5° display cell. This is display sampling, not interpolated meteorology or a change to calculations.
- Popups and map attribution follow shared theme ink/background.

## Gates

Passed: existing regional data/navigation fixtures; existing field/hourly-model fixtures; frontend syntax and consistency; whitespace/diff checks. Native Chrome inspected actual opening pixels and verified the source-directory action reveals country/provider links. No source ingestion, model calculation, quota, backend process or scoring changes.

Unverified: complete 375/768/1280 viewport and 200%-zoom matrix; browser service request-header-policy dependency failed with 403, while native Chrome remained usable. No uninstructed older-user walkthrough or fluent-human Thai review occurred. Do not report them as passed or claim that automation establishes human taste.

Production evidence follows after deployment.

Production: 2.4.93 verified on canonical Pages and custom domain; deployment asset digest `32222442c479`. Additional exact-byte probes matched regional CSS/JS on both domains, and both route HTML responses include the new instrument rail and directory disclosure. Native Chrome verified the final public route and controls, and captured `/tmp/airdash-region-composition-2.4.93.png`. Main implementation commit `2ce7327` pushed. This is a composition pass, not only a token recolour.
