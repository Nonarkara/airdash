# Regional page design audit — 2026-10-19

Scope: `/region`, English and Thai. Applied the anti-slop-design skill and the existing Palette colour roles. This does not certify every other AirDash page.

| Rule | Finding | Resolution |
|---|---|---|
| Content-fit controls | Boxed navigation, full-width reset, large numeric counts for station coverage | Plain44px navigation targets, content-width reset link, restrained inline counts |
| Balanced composition | Heavy shaded, scrolling rail; legend box obscured the map | Single map/rail grid, open rail on the same ground, legend below geography |
| Line length | Long map caption across the full viewport | Caption bounded to65ch, paired with its colour scale; stacked on mobile |
| Typography | Mixed Manrope/Sarabun/monospace, repeated9–12px microtype | Jost and Prompt only within this page, self-hosted with OFL licences; labels/status/captions14–16px |
| Ornament | Repeated bars, boxed legend, excess separators | Retained only input boundaries, navigation state, disclosure markers and functional pollution scale |
| Hierarchy | Microtype headings, repeated AIR·DASH eyebrow, pseudo-KPI reporting counts | Regional title, map, then controls; removed redundant eyebrow, enlarged headings, reduced count emphasis |
| Generic dashboard patterns | Equal muted text, accumulated breakpoint overrides | One stylesheet replaces the conflicting cascade; grouped method disclosures and explicit evidence hierarchy |

Independent review caught and verified fixes for44px navigation targets and desktop status ordering. Independent screenshots passed1440,1024 and390px. Thai phone layout was checked separately. Hover and links use normal ink on a neutral background rather than the shared inverse sage state.

Verification: frontend syntax65/65; regional behavioural/wiring checks; consistency14/14; version/release gate. Existing acquisition timestamps, coverage boundaries, interpolation and wind limitations are retained. No backend/service restart is required.
