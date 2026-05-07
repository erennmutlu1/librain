# Discovery Mode — Phase 2.5 Smoke

**Status**: Validation protocol executed 2026-05-07 (Step 2b₁). Gate **FAIL**, `noveltyTarget` DROP triggered. End-to-end smoke pairs (in-corpus / off-corpus primary results table) still pending Step 2b₂.

End-to-end validation of the `POST /api/discover` pipeline against the live OpenAI Embeddings + Qdrant Cloud + Anthropic (Sonnet 4.6 + Haiku 4.5) stack. Mirrors the Phase 2 acceptance pattern in [phase2-step6-smoke.md](phase2-step6-smoke.md), with a Discovery-specific rubric (novelty, plausibility, structural coherence) and a `noveltyTarget` validation gate.

Endpoint: [DiscoveryEndpoints.cs](../Endpoints/DiscoveryEndpoints.cs).
Corpus: 5 arXiv papers, 218 chunks in Qdrant Cloud (Phase 1 ingest).

## Locked query pairs

These pairs do not change between draft and final smoke. The off-corpus pair specifically tests the novelty-differential success criterion in PROJECT_PLAN.md §5 Phase 2.5.

### In-corpus pair

- **topicA**: `"retrieval-augmented generation"`
- **topicB**: `"hypothesis generation in scientific discovery"`
- **Expected**: lower `noveltyScore` (both topics are present in the 5-paper corpus); `supportingEvidence` non-empty for both topics; `novelClaim` should propose a connection that goes a step beyond what's directly stated.

### Off-corpus pair

- **topicA**: `"retrieval-augmented generation"`
- **topicB**: `"protein folding dynamics"`
- **Expected**: `noveltyScore` materially higher than the in-corpus pair (topicB is absent from the corpus); `supportingEvidence` may be limited to topicA-derived chunks; `novelClaim` is doing the heavy lifting.

## `noveltyTarget` validation gate (Step 2c precondition)

`noveltyTarget` was kept in `DiscoverRequest` after Step 2a articulation passed (PROJECT_PLAN.md §3.4 / §4.6). The gate is empirical: it must produce a measurable `noveltyScore` differential between low and high targets, or it gets dropped in Step 2c as a vanity knob.

### Protocol

Run **two** Discovery calls against the **in-corpus pair**, varying ONLY `noveltyTarget`. Same `topicA`, same `topicB`, same `topK`, same retrieval intent — `noveltyTarget` is the only independent variable.

```bash
# Call A — low novelty target
curl -sS -X POST http://localhost:5099/api/discover \
  -H "Content-Type: application/json" \
  -d '{
    "topicA":"retrieval-augmented generation",
    "topicB":"hypothesis generation in scientific discovery",
    "topK":5,
    "noveltyTarget":0.2
  }'

# Call B — high novelty target
curl -sS -X POST http://localhost:5099/api/discover \
  -H "Content-Type: application/json" \
  -d '{
    "topicA":"retrieval-augmented generation",
    "topicB":"hypothesis generation in scientific discovery",
    "topK":5,
    "noveltyTarget":0.9
  }'
```

Record `evaluation.noveltyScore` from each response: `nA` (from `noveltyTarget=0.2`) and `nB` (from `noveltyTarget=0.9`).

### Decision rule

| Differential `nB − nA` | Verdict | Action in Step 2c |
|---|---|---|
| ≥ 0.05 | Knob produces measurable shift | **Keep**: ship `noveltyTarget` as documented in §3.4 / §4.6. Record actual differential here. |
| < 0.05 | Vanity knob | **Drop**: remove `NoveltyTarget` from `DiscoverRequest`; remove the validation block in `DiscoveryEndpoints`; remove the `noveltyTarget` sentence from the Discovery system prompt; one-line note in §3.4 documenting the empirical drop. |

The 0.05 threshold is intentionally low — at that magnitude the model is responding to the prompt at all, above zero-effect noise. A larger threshold would over-claim what a single-shot LLM can deliver.

### Robustness rules

- **Borderline runs** (differential in [0.03, 0.07]) — re-run the pair once and average. Single-shot LLM variance can flip a borderline case; don't ship a Drop/Keep verdict on one observation when the result is near the threshold.
- **Floor / ceiling collapse** — if both `nA` and `nB` land near 0.0 (claim almost identical to corpus) or near 1.0 (claim wildly out-of-corpus), the in-corpus pair is not a useful gate. Switch to the off-corpus pair as the gate input and document the swap. (Should not happen on the 218-chunk corpus; document if it does.)
- **Sequential, not parallel** — run Call A first, then Call B. Avoids any concurrency artifacts in Qdrant Cloud free tier or Anthropic rate-limit interactions confounding the differential.

### Step 2b₁ execution — 2026-05-07

Stronger statistical protocol than the single-pair version above: **3 runs at each target** (6 total), `mean ± std` per target, gate with `2σ` band.

**Determinism check**: PASSED. All 7 retrievals (1 sanity run at `noveltyTarget=0.5` + the 6 protocol runs) returned the **identical** dedup'd chunk-ID list, in the same first-seen order:

```
2005.11401:1, 2005.11401:0, 2005.11401:2, 2005.11401:9, 2005.11401:10,
2505.04651:23, 2504.05496:0, 2505.04651:0, 2505.04651:14, 2504.05496:2
```

Two papers per topic (2005.11401 dominates topicA's RAG retrieval; 2505.04651 / 2504.05496 dominate topicB's hypothesis-generation retrieval). 5 topicA hits + 5 topicB hits, no overlap, 10 unique chunks. The validation runs are comparable.

#### Per-run results

| target | run | noveltyScore | elapsed (curl-side) | chunk-ID set |
|--------|-----|-------------:|--------------------:|:-------------|
| 0.2 | 1 | 0.4022 | 10s | identical (see above) |
| 0.2 | 2 | 0.3494 | 12s | identical |
| 0.2 | 3 | 0.4104 | 11s | identical |
| 0.9 | 1 | 0.3330 | 14s | identical |
| 0.9 | 2 | 0.3991 | 11s | identical |
| 0.9 | 3 | 0.3746 | 14s | identical |

#### Statistic

| | mean | std (sample, N=3) |
|---|------:|------------------:|
| target=0.2 | **0.3873** | 0.0331 |
| target=0.9 | **0.3689** | 0.0334 |

- `\|Δmean\|` = `\|0.3689 − 0.3873\|` = **0.0184**
- `2 × max(std)` = **0.0668**
- `\|Δmean\| / 2σ` = **0.276** (27.6% of the threshold)

**Gate: FAIL.** `\|Δmean\|` is well below `2σ`. Worse, the **direction is inverted**: at `noveltyTarget=0.9` the produced novel claims are *less* novel by cosine distance than at `0.2`, the opposite of the calibration sentence's intent.

#### Tokens and cost

- Total input: 6 × 10,939 = **65,634 tokens**
- Total output: 464 + 506 + 504 + 669 + 491 + 727 = **3,361 tokens**
- Sonnet 4.6 cost: 65,634 × $3/M + 3,361 × $15/M = $0.197 + $0.050 = **$0.247** (slightly over the $0.20 budget; embedding + Qdrant costs are negligible).

#### Qualitative `novel_claim` samples

**`noveltyTarget = 0.2`, run 1** (lower target — "stay close to evidence"):

> Extending this architecture with hypothesis-quality filters (novelty and feasibility scoring) applied at retrieval time could enable a self-improving discovery loop, where only passages supporting sufficiently novel and feasible candidate hypotheses are retained for generation.

**`noveltyTarget = 0.9`, run 1** (higher target — "substantial extrapolation"):

> RAG-based hypothesis engines could autonomously satisfy novelty and feasibility thresholds by grounding generated hypotheses in the most current literature, effectively bypassing the information-overload and disciplinary-fragmentation bottlenecks that currently limit human and LLM-only hypothesis generation.

Subjectively, the 0.9 claim is more *ambitious* (sweeping, declarative) than the 0.2 claim. But cosine similarity — the deterministic measure that the gate uses — disagrees: the 0.9 claim is closer to the corpus center, because Claude reaches for more domain vocabulary when asked to extrapolate ("autonomously satisfy", "bypassing the information-overload bottlenecks") and that vocabulary is itself in the retrieved chunks. Tone/ambition does not translate to embedding-space distance on this corpus.

#### Conclusion — `noveltyTarget` DROP triggered

The knob does not produce a measurable shift in the metric the gate uses. Neither magnitude nor direction matches expectation. Per the gate's decision rule and PROJECT_PLAN.md §3.4 / §4.6 directive, `noveltyTarget` is dropped from the request shape.

**Execution of the DROP** is its own atomic commit (Step 2c), not part of Step 2b₁:
- Remove `NoveltyTarget` from `DiscoverRequest` ([DiscoveryEndpoints.cs](../Endpoints/DiscoveryEndpoints.cs)).
- Remove the `noveltyTarget` validation block in `DiscoveryEndpoints.HandleAsync`.
- Remove the calibration sentence + `{{NOVELTY_TARGET}}` substitution from `DiscoveryAgent.SystemPromptTemplate` ([DiscoveryAgent.cs](../Agents/DiscoveryAgent.cs)).
- Update PROJECT_PLAN.md §3.4 / §4.6 with a one-line note that the knob was dropped after Step 2b₁'s empirical gate failed.

## Acceptance criteria (Phase 2.5 ship gate)

Mirrors PROJECT_PLAN.md §5 Phase 2.5 success criteria.

| Criterion | Target | In-corpus | Off-corpus |
|-----------|--------|-----------|------------|
| HTTP status | 200 OK | _TBD_ | _TBD_ |
| `novelClaim` | Non-empty | _TBD_ | _TBD_ |
| `supportingEvidence[].(paperId, chunkIndex)` | All resolve to retrieved set | _TBD_ | _TBD_ |
| `noveltyScore` (off-corpus − in-corpus) | ≥ 0.10 | n/a | _TBD_ |
| `qualityScore` | In `[0, 1]` | _TBD_ | _TBD_ |
| Round-trip latency | < 20s (Phase 3 will optimize) | _TBD_ | _TBD_ |

## Step 2b results

_To be filled when DiscoveryAgent and Discovery Evaluator are live. For each pair (in-corpus, off-corpus, plus the two `noveltyTarget` validation calls), capture: full response JSON, latency, token usage (synth + eval), per-axis scores, and the `noveltyScore` for the validation gate._
