# knowledge/ — bilingual reference & research paper

Short, focused reference notes embedded into the RAG index (via
`nomic-embed-text` through the local Ollama endpoint) so the
Ask-AI panel can answer from the system's own terminology and
methodology, in both Thai and English.

## Files

| File | Purpose | Primary reader |
|------|---------|----------------|
| `paper.md` | **Full research paper** — methodology, sources, user manual, references, acknowledgements. This is the canonical citation for AirDash. | Researchers, partner agencies, audit reviewers |
| `rain-washout.md` | The Rain-Washout model — wet deposition, the relief curve, probability weighting, the Greenfield gap. | Atmospheric scientists, operators |
| `data-sources.md` | All seven pipelines with cadences, units, and field-level provenance. | Data engineers, auditors |
| `score-method.md` | The Air Watch Score formula, sub-score curves, bands, honest limitations. | Anyone reading the ranking rail |
| `dust-seasonality.md` | The Dec–Apr window, northern burning season, inversions, ENSO modulation. | Planning, year-over-year comparison |
| `historical-haze.md` | Major episodes (2019 Bangkok smog, Chiang Mai 2019/2023, 2015 southern haze) and their lessons. | Researchers, journalists |
| `aqi-bands.md` | Thai AQI bands and the 2023 PM2.5 breakpoints (15/25/37.5/75). | New users, operators |
| `pollutant-standards.md` | Thai standards per pollutant (PM2.5/PM10/O3/NO2/SO2/CO) and how the score uses them. | Operators |
| `glossary.md` | TH–EN air-quality terms and agency acronyms. | New users |
| `project-vision.md` | Why AirDash exists, the working method, the toolbox pattern, what's missing. | Contributors, next agents |

## How the index is built

`server/knowledge.js` calls Ollama's `/api/embeddings` with
`nomic-embed-text` (1536-dim, keyless, on-device) once per day. Embeddings
are stored in the `rag_docs` table. The first index run is scheduled 10
seconds after boot and re-attempted every 24 hours so that adding a
`*.md` to this folder is enough — no code change required.
