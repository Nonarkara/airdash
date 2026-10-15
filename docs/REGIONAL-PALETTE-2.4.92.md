# Regional Palette alignment — 2.4.92

User requested the Southeast Asia view follow the existing Palette design core rather than a separate generic dashboard style.

- `region.html` imports the same `tokens.css` and `brand.css` used by the system. Uses existing transparent brand variants.
- Regional CSS consumes shared paper/well/rule/ink/teal/sage, control radius and font tokens. OS light/dark behavior follows the same core; it no longer defines a permanent dark palette.
- Manrope titles, Sarabun interface text, JetBrains Mono values and timestamps. Smaller heading and quiet ruled status strip.
- Replaced repeated rounded country cards with ruled directory rows; source list also uses rows. Phone breakpoints stack row content; map/control minimum hit areas remain 44 px.
- Hover explicitly keeps normal ink on pale surfaces, avoiding the global primary-button inverse-ink rule in light mode.
- No source, forecast, concentration or transport calculations changed by the styling release.

Validation: regional fixtures and pollution-field/model fixtures passed; frontend syntax and consistency checks passed after the final bump. Native Chrome verified the actual shared styling, successful regional data load, hourly-model selector and working slider advancing to a real stored hourly date. A prior Mac lock temporarily blocked the first field release's visual check; the Mac subsequently became available and both field and presentation were inspected here.

2.4.90 backend/API verification: cached hourly CAMS was available, issued 2026-10-15 10:22:11 UTC, 49 displayed hourly frames and 77 province samples; 77 daily wind records. Full test suite passed (`/tmp/airdash-field-tests.log`), deployed/pushed as ed165f4. Hourly frames are not fire-specific smoke ETA, and no AQI-arrival forecast is claimed.

Final production verification appended below.

Production confirmed 2.4.92 on both domains (HTML and deploy asset probes), digest `ce59ff638e0a`. Additional direct byte checks matched region.css, region.js and pollution-field.js on both hosts. Native Chrome loaded the final public page with shared typography/theme and current data; screenshot `/tmp/airdash-regional-palette-2.4.92.png`. No full physical-phone matrix is claimed. Presentation commits b152bc8 and 1523da5; no backend restart needed for these styling changes.
