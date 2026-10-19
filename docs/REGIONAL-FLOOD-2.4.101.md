# Regional flood watch — 2.4.101

GDACS flood reports now accompany regional air/fire/wind evidence. Existing source scheduler collects every 30 minutes, at most five 100-record pages. All three native alert colours are requested explicitly: a live query without this filter returned only one India event, while the explicit filter returned Southeast Asian reports. Pagination completeness is separate from geographic coverage.

Reports use a rolling 14-day event window and six-hour retrieval gate. Native impact colours describe humanitarian impact, not flood depth. FL markers locate reported events, not inundation boundaries, current flooding or arrival predictions. Empty/stale coverage never means safe. Official event links use validated numeric identifiers. Thailand warnings reuse FloodDash cache, require retrieval and upstream timestamps within one hour, and preserve Prepare/Protect/Evacuate. No blended air/water score.

Live collection 2026-10-19 14:55:07 UTC: four reports (MYS, IDN, VNM, THA), no rejected features, pagination complete. These reports include past event periods. MRC and ADINet remain explicitly reference-only.

## Verification

Full npm test passed (log /tmp/airdash-flood-tests-final.log); subsequent flood behaviour, research chart, frontend syntax, consistency, route documentation and release-token checks passed. Tests cover UTC interpretation, country/time/coordinate gates, deduplication, safe links, pagination, outages, stale receipts, UI escaping and warning action labels.

Design review: regional map retains visual priority; proportional controls and native disclosures; prose measure limited; Jost/Prompt; no new ornamental cards or severity badges; air, fire and flood symbols distinguish evidence types. Research contents collapsed instead of a large sticky box; prose/figures simplified. Existing version-comparison table remains meaningfully grouped. Independent reviewer checked desktop and genuine 1024/390 captures. Initial native screenshots ignored a background-tab viewport override and were rejected; corrected selected-tab DOM widths were 1024 and390 with no horizontal overflow.

## Sources

- https://www.gdacs.org/Documents/2025/GDACS_API_quickstart_v2.pdf
- https://gdacs.org/Knowledge/models_fl.aspx
- https://www.gdacs.org/documents/2025/GDACS_MHEWS_guide.pdf

The research section documents raw reports, validation/freshness, presentation and local-action limits in Thai and English.
