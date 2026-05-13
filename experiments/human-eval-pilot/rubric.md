# Human Evaluation Pilot: Rubric

Used for the Section 6.7 single-rater pilot (15 outputs across 5 topic pairs × 3 systems). The same rubric will be re-used unchanged for the planned two-rater follow-up.

## Scoring axes

### Novelty (1–5, ordinal)

| Score | Meaning |
|-------|---------|
| 1 | Trivial or well-known. The hypothesis restates established knowledge. |
| 2 | Familiar combination. The pair has been studied many times in this exact framing. |
| 3 | Moderately novel. A specific bridge that has been hinted at in adjacent work but not stated this way. |
| 4 | Substantially novel. The bridge is non-obvious to a specialist in either source domain. |
| 5 | Genuinely novel research direction. A specialist would consider the framing worth pursuing. |

### Plausibility (1–5, ordinal)

| Score | Meaning |
|-------|---------|
| 1 | Fundamentally implausible. Violates established mechanism or scope. |
| 2 | Implausible without major qualification. The bridge requires multiple unstated jumps. |
| 3 | Plausible but speculative. The inferential bridge is reasonable but unsupported. |
| 4 | Defensible. The bridge is supported by the cited evidence and reasonable extrapolation. |
| 5 | Publishable. A specialist would defend the hypothesis as a testable research question. |

### Hallucination (binary, 0 or 1)

The single binary measurement that drove the Section 7.7.3 finding. **Definition from paper Section 6.7 (verbatim):**

> Does the hypothesis contain at least one specific factually wrong claim (for example, a wrong attribution, a fabricated statistic, or a false mechanism stated as established). Speculative claims framed as hypotheses do NOT count as hallucinations. Only false factual statements do.

**0 = No.** Speculative content is fine if it is framed as a hypothesis ("X could enable Y", "this suggests Y", "future work may show Y"). Hedged language is the signal.

**1 = Yes.** A specific factual statement (mechanism, quantity, named entity, date, attribution) is stated as if it were established knowledge, AND that statement is either contradicted by the retrieved evidence or unsupportable on common-knowledge grounds.

### Watch-out: distinguishing "highly speculative" from "factually wrong"

A common rater drift is to flag any sufficiently ambitious cross-domain bridge as `hallucination = 1` because it sounds far-fetched. The paper definition is narrower:

- "Drug discovery agents could read climate forecasts to anticipate emerging disease patterns" → **0** (hedged, hypothesis-framed)
- "Drug discovery pipelines are updated near-real-time from weather model outputs" → **1** (specific process claim stated as fact, contradicts known 10-year drug development timelines)
- "EEG biomarkers could plausibly inform drug-target prioritization" → **0** (hedged)
- "EEG biomarkers determine drug-target binding in real time" → **1** (specific mechanism stated as fact, no retrieval support)

If a hypothesis would survive a peer-review reframing of "this is speculative because X" without removing factual content, it scores **0**. If removing the false-fact element would gut the claim, it scores **1**.

## Blinding protocol

1. `scripts/generate-unblind-key.py` produces `unblind-key.csv` with `output_id → (pair_id, system)` mapping under a Latin-square arrangement so each system appears at each position exactly once across the 5 pairs.
2. Rater is given a `ratings-template.csv` with only `output_id` column visible (and the hypothesis text).
3. Rater scores all 15 outputs without opening `unblind-key.csv`.
4. After scoring is locked, `scripts/analyze-results.py` joins ratings with the unblind key and computes:
   - Per-system descriptive statistics (mean novelty, mean plausibility, hallucination flag rate)
   - Per-axis Spearman rho between rater scores and LLM-as-Judge scores
   - For two-rater follow-up: Cohen's κ on each axis (not yet computed; rater 2 pending)

## Inter-rater design (planned, not yet executed)

Rater 1 = first author (Eren), already completed (data in `ratings-rater1.csv`). The 15-row scores reproduce the Section 7.7.3 finding: outputs 01, 09, and 10 (LIBRAIN system; the EEG / protein-weather / drug-climate hypotheses) carry `hallucination = 1` and the remaining 12 carry `0`. Mean novelty 4.00 for LIBRAIN versus 2.40 for the two baselines.

Rater 2 = independent collaborator (TBD). Will receive the same `ratings-template.csv` and rubric without seeing rater 1's scores. Cohen's κ on the hallucination column will be the headline inter-rater metric; the paper Section 7.7 abstract placeholder fills in when this lands.
