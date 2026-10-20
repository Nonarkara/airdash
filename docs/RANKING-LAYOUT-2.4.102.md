# Ranking layout repair — 2026-10-20

User screenshot showed a long province explanation beside a non-wrapping flex summary. Browser reproduction at390px measured84px explanation width and956px expanded-row height, with summary vertically centered in the empty slab.

Explicit grid tracks now separate ordinal, PM, name and danger; social load and supplementary metrics occupy their own rows. Explanation spans all tracks, uses14px body copy and max65ch, without nested background/dashed action ornament. Scoped Jost/Prompt. At390px the populated expanded row measured399px high with354px-wide explanation and no horizontal overflow. At1024px explanation546px; at1440px263px within291px rail.

Independent review rejected the first desktop screenshot because ranking was invisible. Diagnosis: forecast and rain scenario panels squeezed ranking to0.945px. Desktop ranking now reserves min(240px,30vh); auxiliary panels allow shrinking. Live populated review measured240px ranking height. Its own scroller retains access to all60 reported provinces and expanded content.

Header-layout, frontend-UX, frontend syntax, consistency and release-token checks passed. Populated screenshots at390/1024/1440 reviewed independently. This fixes ranking layout; it does not claim a complete redesign of all legacy Ops panels.
