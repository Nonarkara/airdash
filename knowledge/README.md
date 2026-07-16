# knowledge/ — bilingual reference & research paper

Short, focused reference notes embedded into the RAG index (via
`nomic-embed-text` through the local Ollama endpoint) so the
Ask-AI panel can answer from the system's own terminology and
methodology, in both Thai and English.

## Files

| File | Purpose | Primary reader |
|------|---------|----------------|
| `paper.md` | **Full research paper** — methodology, sources, user manual, references, acknowledgements. This is the canonical citation for FloodDash. | Researchers, partner agencies, audit reviewers |
| `connected-waterways.md` | The Chao Phraya cascade, flood-wave travel time, the directed-graph model. | Hydrologists, EOC operators |
| `data-sources.md` | All nine pipelines with cadences, records, and field-level provenance. | Data engineers, auditors |
| `risk-method.md` | The watch-score formula, bands, honest limitations. | Anyone reading the ranking rail |
| `flood-seasonality.md` | Thailand wet/dry season timing by region; ENSO as a seasonal modulator. | Planning, year-over-year comparison |
| `historical-floods.md` | Major events (2011 Great Flood, 2019 Ubon, 2025 Hat Yai) for the historical-floods map layer. | Researchers, journalists |
| `situation-levels.md` | HII levels 1–5 — what they mean and what to do at each. | Operators |
| `soil-wetness.md` | API definition, decay constant, bands — why two provinces with equal rain are not equal. | Hydrologists |
| `rain-bands.md` | Rain-rate categories used by the alert engine. | Operators |
| `glossary.md` | TH–EN terms and agency acronyms. | New users |

## How the index is built

`server/knowledge.js` calls Ollama's `/api/embeddings` with
`nomic-embed-text` (1536-dim, keyless, on-device) once per day. Embeddings
are stored in the `rag_docs` table. The first index run is scheduled 10
seconds after boot and re-attempted every 24 hours so that adding a
`*.md` to this folder is enough — no code change required.
