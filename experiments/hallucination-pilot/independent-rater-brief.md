# Independent Rater Brief: LIBRAIN AFTER-FIX Pilot

## Hello and thank you

You have agreed to score 15 outputs from a research pipeline. You will spend about 90 minutes total. Your scores combine with two others to compute Cohen's kappa, which is the test of whether the rubric produces consistent judgments across raters who did not design it.

## What you do

| Step | Time | File |
|---|---|---|
| 1. Read the scoring rubric | 15 min | `rubric.md` |
| 2. Read 15 hypothesis outputs | 45 min | `outputs-for-rater.md` |
| 3. Fill the rating CSV | 30 min | `ratings-rater2.csv` or `ratings-rater3.csv` |

No background reading required. The rubric is self-contained.

## Three scores per output

For each output you assign three scores:

1. **Novelty** (1 to 5 ordinal). How original is the bridge between the two topics?
2. **Plausibility** (1 to 5 ordinal). How defensible is the bridge given the cited evidence?
3. **Hallucination** (0 or 1 binary). Does the output contain a specific factually-wrong claim stated as fact? Speculative claims framed as hypotheses do NOT count. Only false factual statements do.

Full definitions and a "watch-out" section that explains the highly-speculative-versus-factually-wrong distinction are in `rubric.md`. Read it before scoring.

## The 15 outputs

Use this table to track progress. Topic hints are the public topic-pair names; you will see the full hypothesis text in `outputs-for-rater.md`. Within each topic, three outputs come from three different systems (LIBRAIN, Naive-RAG, Single-LLM). You do not know which is which. Do not try to guess. Rate what you read.

| output_id | topic hint |
|---|---|
| 01 | large language models × drug-target interaction prediction |
| 02 | large language models × drug-target interaction prediction |
| 03 | large language models × drug-target interaction prediction |
| 04 | retrieval-augmented generation × de novo molecular design |
| 05 | retrieval-augmented generation × de novo molecular design |
| 06 | retrieval-augmented generation × de novo molecular design |
| 07 | weather foundation models × renewable energy planning |
| 08 | weather foundation models × renewable energy planning |
| 09 | weather foundation models × renewable energy planning |
| 10 | protein folding × weather forecasting |
| 11 | protein folding × weather forecasting |
| 12 | protein folding × weather forecasting |
| 13 | drug discovery × climate adaptation |
| 14 | drug discovery × climate adaptation |
| 15 | drug discovery × climate adaptation |

## Blinding rule

The repo contains a file `unblind-key.csv` that maps `output_id` to system. **Do NOT open it until your CSV is filled and submitted.** Looking at it before scoring invalidates the kappa computation and the rater 1 data with it.

## How to fill the CSV

Open your assigned file (`ratings-rater2.csv` for rater 2 or `ratings-rater3.csv` for rater 3). It has 15 rows pre-filled with `output_id` 01 to 15 and empty score columns. Fill `novelty`, `plausibility`, and `hallucination` for each row. Use `rater_note` for a one-line free-text justification when a score is borderline. Otherwise leave it blank.

CSV header: `output_id,novelty,plausibility,hallucination,rater_note`

## Submission

Send the filled CSV back via email or chat. The file will be committed to the public repo under your assigned rater number.

## Attribution

By default your ratings appear in the public repo anonymously as "rater 2" or "rater 3". If you want named attribution in the paper's acknowledgements, say so when you submit.

## Questions

If anything in the rubric is ambiguous, note your interpretation in the `rater_note` column for that output and rate accordingly. Do not message me to clarify the rubric definitions during scoring. Clarifying definitions mid-scoring biases the rating set. Disagreements with the rubric, recorded in `rater_note`, are themselves a useful finding.
