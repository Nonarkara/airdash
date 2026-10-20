# Palette instrument header — 2.4.103

## Brief
Person: Thai and English-speaking residents and operators checking conditions on phones and desktops.
One job: read the current status, score and geographic scope without losing map space.
Hierarchy: current condition; score with non-clinical qualifier and province; Find/Menu actions.
Constraints: real long Thai/English province names, unknown/loading data, 320px width, keyboard use,44px actions.
Direction: an instrument legend at the edge of a working map; aligned datum, restrained hardware, existing signal colours.

Compared compositions: a permanent information row plus a second full control row; versus one52px row with two explicit drawers. Chose drawers to preserve map space and touch targets. Search and Menu retain all previous working destinations/controls. Status copy is shortened without changing its level; long geographic scope can ellipsize, with full context in the score detail action. Non-clinical qualifier remains visible.

References reread: Non-Slop/AGENTS.md and Palette/AGENTS.md, bauhaus-human-design and bringhurst-contextual-type skills in /Users/axiom/Projects/_ruttl-bp. Their museum-hardware and communication rules are applied to AirDash; Wada colours are not substituted for functional air-quality signals.

Whole-public source scanner reports21points across legacy UI/content. This release targets the header and shared type tokens; it does not claim every legacy panel passed a complete redesign. Findings outside scope remain in /tmp/airdash-nonslop-before.txt.

## Verification

Full npm test passed (exit0; /tmp/airdash-palette-header-tests.log). New behavioural drawer guard exercises focus, exclusivity, Escape, outside dismissal and preserved tool IDs; it replaces the obsolete static test that certified the old oversized toolbar. The browser gate now checks one-line height at every width and44px primary targets, rather than requiring the old verdict-width ratios.

Populated Thai geometry measured52px height at320,360,390,480,600,900,1024,1100,1120,1250,1440,1600,1920. Status/score vertical-centre delta0px. English checked320,390,1024,1440; controls44px or larger. Search returned real Chiang Mai results; Escape restored trigger focus. Original screenshot capture loop occasionally returned the previous viewport frame; rejected those captures and took settled separate-turn screenshots, verified actual PNG dimensions390/1024/1440 before independent review. Reviewer caught a blank Ask AI label from an old!important rule; fixed and re-reviewed successfully.

Latest scalar refinement uses foreground ink for score/status contrast in both schemes; functional AQI stripe and condition labels remain. Full source timestamp remains available in Menu; the persistent ticker retains freshness state. Light/dark contrast follows the existing ink/paper tokens. No fluent-reader or human usability study is claimed. Existing Chinese support is not introduced by this scoped header change; AirDash remains its established Thai/English interface.

New header stylesheet Non-Slop scan:0points. Whole-public legacy scan:21points, including existing emoji and oversized images, retained as follow-up scope rather than claiming a clean whole-system result.
