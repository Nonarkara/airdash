# knowledge/ — bilingual reference & research paper

Short, focused reference notes embedded into the RAG index (via
NVIDIA NIM’s configured embedding model) so the
Ask-AI panel can answer from the system's own terminology and
methodology, in both Thai and English.

## Files

| File | Purpose | Primary reader |
|------|---------|----------------|
| `paper.md` | **Full research paper** — methodology, sources, user manual, references, acknowledgements. This is the canonical citation for AirDash. | Researchers, partner agencies, audit reviewers |
| `rain-washout.md` | The Rain-Washout model — wet deposition, the relief curve, probability weighting, the Greenfield gap. | Atmospheric scientists, operators |
| `data-sources.md` | Source pipelines with cadences, units, and field-level provenance. | Data engineers, auditors |
| `score-method.md` | The Air Watch Score formula, sub-score curves, bands, honest limitations. | Anyone reading the ranking rail |
| `dust-seasonality.md` | The Dec–Apr window, northern burning season, inversions, ENSO modulation. | Planning, year-over-year comparison |
| `historical-haze.md` | Major episodes (2019 Bangkok smog, Chiang Mai 2019/2023, 2015 southern haze) and their lessons. | Researchers, journalists |
| `aqi-bands.md` | Thai AQI bands and the 2023 PM2.5 breakpoints (15/25/37.5/75). | New users, operators |
| `pollutant-standards.md` | Thai standards per pollutant (PM2.5/PM10/O3/NO2/SO2/CO) and how the score uses them. | Operators |
| `glossary.md` | TH–EN air-quality terms and agency acronyms. | New users |
| `project-vision.md` | Why AirDash exists, the working method, the toolbox pattern, what's missing. | Contributors, next agents |
| `gov-citizen-apps.md` | **Registry of Thai government/university-operated public monitoring apps** citizens actually use — ตามรอยเผา, warroom.pro. How to add an entry, what each publishes machine-readably, and where each is honest about its limits. Open — more expected. | Contributors, source negotiators, next agents |
| `agri-burning.md` | Crop-residue burning: physiology, the Gal Embodiment crop calendar, economics, enforcement, and every open burn-area source including ตามรอยเผา. | Atmospheric scientists, local officers, DoA |
| `burning-hotspots.md` | Hotspot detections and burned area as downloaded figures — national VIIRS volumes, provincial rankings, seasonal timing, warroom.pro. | Researchers, journalists, enforcement |
| `forest-fire-haze.md` | Northern forest fire, transboundary haze transport, and the Thailand–Cambodia–Laos–Myanmar burn season. | Atmospheric scientists, regional planners |
| `aq-monitoring-network.md` | How Air4Thai's ~200 stations are laid out, what they measure, and where the network is blind. | Data engineers, auditors |
| `health-science.md` | The exposure-response evidence behind PM2.5 harm, and the honest limits of what a dashboard can say about it. | Anyone writing health copy |

## How the index is built

`server/knowledge.js` calls NVIDIA NIM's `/v1/embeddings` using the model
configured in `server/config.js`. Production currently uses
`nvidia/nemotron-3-embed-1b` (2048 dimensions, authenticated). Changing the
configured model invalidates the stored document and FAQ vectors before
reindexing. Embeddings live in `rag_docs`; failed inference leaves lexical
retrieval available. Indexing starts after boot and is retried daily.
