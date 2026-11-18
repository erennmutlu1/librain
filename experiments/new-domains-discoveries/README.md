# New-domain discoveries (batch 4, recorded 18 November 2026)

Goal: discoveries rated above 7.8 / 10, after batch 3 (24 cross-field pairs from the existing
library) produced none. Batch 2 had shown that papers in new areas produce the most novel
hypotheses, so this batch first extends the library.

## Method
1. **Areas and papers.** A Claude Fable 5.2 helper proposed three areas with distinctive vocabulary
   that the library did not cover (AI × music, AI × law, AI × wildlife and nature conservation) and four arXiv papers for each; all 12
   were checked against arxiv.org. LegalBench (143 pages) was swapped for LexGLUE, which is shorter, so
   one paper would not crowd the legal region. See `papers-added.json`.
2. **Ingest.** The 12 papers went into the public library (Qdrant Cloud) through `POST /api/papers/arxiv`
   on a local API with the write key: 55 → 67 papers, 2,210 → 2,470 passages. Each ingest stored its
   chunks and then returned 502, because the cloud collection had no payload index on `paperId`
   (strict mode); the indexes were added and the repository now creates them (commit `0d643fc`).
   Embedding cost: not logged; about US$0.005 (260 passages at most about 1,000 tokens each, at
   US$0.02 per million).
3. **Runs.** 18 pairs, each a new paper's topic × an existing method or survey in the library (the
   recipe of the earlier top runs), ran through the unchanged pipeline (`scripts/run_discoveries.py`,
   Claude Sonnet 4.6 generation, Claude Haiku 4.5 judge and validator, topK 5). Cap US$1.80.

## Result
- All 18 runs succeeded. Cost US$1.230 (`runs/ledger.json`).
- **E5 rated 8.10** on the combined scale of 88 runs (animal movement tracking with bio-logging
  devices and drones × learned physics simulators with graph networks: plausibility 0.72, coherence
  0.78, novelty 0.555, claim risk 0.25). Its novelty is the new maximum, so the scale moved: W5 and S3,
  7.8 before, are now 7.76 and 7.68, and E5 is the only run above 7.8.
- Next best in the batch: E6 7.2, M5 6.94, M4 6.83.
- Batch medians were a little higher than before (plausibility 0.65 vs 0.62, coherence 0.765 vs 0.75,
  novelty 0.367 vs 0.359; claim risk 0.25 both). Every run cited at least one of the new papers.
- Caution: E5 is one run, and batch 3's retries showed a single rating can be off by about a point
  either way. It was not re-run and nothing was picked from several attempts.

Files: `pairs.json` (ids M = music, L = law, E = wildlife), `papers-added.json`, `runs/*.json`,
`runs/ledger.json`, `ranking.csv` (rated on the combined 88-run scale).
