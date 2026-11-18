# Cross-field discoveries (batch 3, recorded 18 November 2026)

Goal: new discoveries rated above 7.8 / 10 on the Explore scale (the best of the 46 earlier runs).

## Method
1. **Candidates.** A Claude Fable 5.2 helper read the library (title page of each of the 55 papers) and the
   46 earlier runs with their scores, and proposed 70 ranked topic pairs (applied paper with distinctive
   vocabulary × a method from an unrelated field, qualitative bridges to keep claim risk low).
   No model API was called for this step.
2. **Pre-screen.** Each topic was embedded (OpenAI `text-embedding-3-small`, under one cent in total) and
   searched in the library: 68 of 70 retrieved their intended papers; 2 did not and were dropped.
   Calibrated on the 46 earlier runs, cheap proxies predict novelty only weakly (topic-to-topic
   similarity vs novelty: Spearman -0.30), so the order stayed Fable's; at most 3 runs per paper.
3. **Runs.** The top 24 pairs ran through the unchanged pipeline (`scripts/run_discoveries.py`, API at
   commit `94aeb84`, Claude Sonnet 4.6 generation, Claude Haiku 4.5 judge and validator, topK 5,
   public library on Qdrant Cloud, read-only). Cap US$2.50.

## Result
- All 24 runs succeeded. Cost US$1.598 (`runs/ledger.json`), US$0.058-0.076 per run.
- **None rated above 7.8** on the combined scale of 70 runs (novelty range 0.262-0.541).
  Best: X17 7.7, X01 7.6, X25 6.8, X23 6.6, X09 6.6.
- Batch medians equal the earlier 46 (plausibility 0.62, coherence 0.75, novelty 0.359, claim risk 0.25):
  the candidate selection did not shift the distribution.
- Why 7.8 is hard here: the judge has never given plausibility above 0.72 or coherence above 0.82, so
  above 7.8 needs those maxima together with claim risk near 0.05 and novelty near 0.50.

Files: `pairs.json` (the 24 pairs run), `runs/X*.json` (one per run: request, status, costUsd,
response), `runs/ledger.json`, `ranking.csv` (rated on the combined 70-run scale).
