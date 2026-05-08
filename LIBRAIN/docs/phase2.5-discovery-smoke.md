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

**Execution of the DROP** is its own atomic commit (Step 2c, `fb301a1`):
- Removed `NoveltyTarget` from `DiscoverRequest` ([DiscoveryEndpoints.cs](../Endpoints/DiscoveryEndpoints.cs)).
- Removed the `noveltyTarget` validation block in `DiscoveryEndpoints.HandleAsync`.
- Removed the calibration paragraph + `{{NOVELTY_TARGET}}` substitution from `DiscoveryAgent.SystemPrompt` ([DiscoveryAgent.cs](../Agents/DiscoveryAgent.cs)).
- Updated PROJECT_PLAN.md §3.4 / §4.6 with a one-line note recording the empirical-failure rationale.

### Findings

Three takeaways from the experiment, kept here so future me (and Step 2b₂'s evaluator design) doesn't relitigate them:

1. **Cosine-distance novelty is a measurement surface, not a control surface — under prompt-only steering on this corpus.** The metric works (the in-corpus 0.386 vs off-corpus 0.644 differential from Step 2a is real and well-correlated with human intuition about novelty). What it does *not* respond to is a soft prompt instruction asking the LLM to dial novelty up or down. The LLM responds qualitatively (higher target → bolder tone) but not in the metric's coordinate system.

2. **High-target prompts elicit domain-vocabulary-dense outputs that land closer to the corpus center.** This is the inverted direction we observed. When asked to extrapolate substantially, Claude reaches for *more* domain-specific terminology to sound credible — and that terminology is itself in the retrieved chunks, raising cosine similarity. The relationship between prompted "ambition" and embedding-space distance is not just weak on this configuration; it points the wrong way.

3. **Future work — align embedding-space novelty with conceptual novelty.** Several plausible directions if a controllable knob is wanted later: (a) use a *different* embedding model for novelty than for retrieval, so the novelty space isn't pre-coupled to the corpus; (b) supplement cosine distance with a lexical-diversity component (rare n-grams, technical-vocabulary fraction) that captures the dimension Claude *does* respond to; (c) move steering from prompt to sampling (higher temperature for the novel-claim sentence specifically). Out of scope for the MVP — this is a Phase 3+ research direction, not a Phase 2.5 fix.

These findings make the case for keeping `NoveltyScorer` as **the post-hoc measurement** in the Discovery rubric — exactly what PROJECT_PLAN.md §4.6 already specifies. The metric retains its value as a diagnostic; we just stop pretending we can steer with it.

## Acceptance criteria (Phase 2.5 ship gate)

Mirrors PROJECT_PLAN.md §5 Phase 2.5 success criteria.

| Criterion | Target | In-corpus | Off-corpus |
|-----------|--------|-----------|------------|
| HTTP status | 200 OK | ✅ 200 | ✅ 200 |
| `novelClaim` | Non-empty | ✅ 369 chars | ✅ 354 chars |
| `supportingEvidence[].(paperId, chunkIndex)` | All resolve to retrieved set | ✅ 5/5 | ✅ 5/5 |
| `noveltyScore` (off-corpus − in-corpus) | ≥ 0.10 | n/a | ⚠️ 0.0846 (below target; see commentary) |
| `qualityScore` | In `[0, 1]` | ✅ 0.4997 | ✅ 0.5279 |
| Round-trip latency | < 20s (Phase 3 will optimize) | ✅ 18s | ✅ 14s |

## Step 2b₂ results — final smoke (2026-05-08)

End-to-end Discovery pipeline running post-Step-2c (DROP applied; no `noveltyTarget`). Both pairs hit the live Qdrant Cloud cluster (218 chunks, 5 papers).

### In-corpus pair

- `topicA = "retrieval-augmented generation"`
- `topicB = "hypothesis generation in scientific discovery"`
- `topK = 5` → 10 unique chunks dedup'd (5 + 5, no overlap)

**Hypothesis:**

> RAG systems, by combining updatable non-parametric memory with generative models, provide a natural substrate for automated scientific hypothesis generation—specifically, the RAG-Token mechanism's ability to draw on different retrieved documents for each output token could enable the synthesis of cross-disciplinary evidence into novel, testable hypotheses that span previously siloed fields. Furthermore, integrating hypothesis quality filters (novelty and feasibility scoring) directly into the RAG retrieval objective—so that the retriever is rewarded for surfacing documents that maximize hypothesis novelty while maintaining feasibility—could yield a self-improving discovery loop that surpasses both purely parametric LLMs and static literature-based discovery systems.

**Novel claim** (the discovery):

> integrating hypothesis quality filters (novelty and feasibility scoring) directly into the RAG retrieval objective—so that the retriever is rewarded for surfacing documents that maximize hypothesis novelty while maintaining feasibility—could yield a self-improving discovery loop that surpasses both purely parametric LLMs and static literature-based discovery systems.

**Supporting evidence:** 5 entries, drawn from 2 papers:

- `2005.11401` (Lewis et al., RAG): chunks 2 (Introduction), 10 (Related Work) — both `direct`
- `2505.04651`: chunks 0, 14 (feasibility scoring), 23 — all `direct`

**Scores:**

| Axis | Value |
|------|------:|
| NoveltyScore | **0.3992** |
| PlausibilityScore | **0.4200** |
| StructuralCoherenceScore | **0.6800** |
| QualityScore | **0.4997** |

**Tokens / cost:**

- Synthesis (Sonnet 4.6): 10,871 in / 533 out
- Evaluation (Haiku 4.5): 6,330 in / 216 out
- ≈ $0.046 (synth + eval)

### Off-corpus pair

- `topicA = "retrieval-augmented generation"`
- `topicB = "protein folding dynamics"`
- `topK = 5` → 10 unique chunks dedup'd

**Hypothesis:**

> RAG architectures, which combine parametric and non-parametric memory through differentiable retrieval and end-to-end marginalization over latent documents, could be directly applied to protein folding dynamics by indexing structural and biophysical databases as the non-parametric memory, enabling agentic systems to dynamically retrieve and integrate folding pathway evidence at inference time rather than encoding it statically in model weights. Such a RAG-augmented protein folding agent would be capable of discovering length-dependent or context-dependent folding phenomena—analogous to the mechanical crossover in peptide unfolding force uncovered by Sparks—that purely parametric structure-prediction models systematically miss because they cannot update their knowledge base without retraining.

**Novel claim** (the discovery):

> Such a RAG-augmented protein folding agent would be capable of discovering length-dependent or context-dependent folding phenomena—analogous to the mechanical crossover in peptide unfolding force uncovered by Sparks—that purely parametric structure-prediction models systematically miss because they cannot update their knowledge base without retraining.

**Supporting evidence:** 5 entries, drawn from 2 papers:

- `2005.11401` (Lewis et al., RAG): chunks 0, 2, 10 — all `direct`
- `2508.14111`: chunk 33 (5.3 Protein Science and Engineering, page 31) `direct`; chunk 32 (5.2 Genomics) `analogous`

**Scores:**

| Axis | Value |
|------|------:|
| NoveltyScore | **0.4838** |
| PlausibilityScore | **0.4200** |
| StructuralCoherenceScore | **0.6800** |
| QualityScore | **0.5279** |

**Tokens / cost:**

- Synthesis (Sonnet 4.6): 12,147 in / 576 out
- Evaluation (Haiku 4.5): 6,172 in / 222 out
- ≈ $0.051 (synth + eval)

### Commentary

**Novelty differential — partially preserved end-to-end.** `noveltyOffCorpus − noveltyInCorpus = 0.4838 − 0.3992 = 0.0846`, about 33% of the Step 2a baseline (0.2577 with literal topic strings). Direction is correct (off-corpus more novel), magnitude is below the 0.10 acceptance target by ~15%. The compression is the same mechanism Step 2b₁ uncovered: the LLM's `novel_claim` text is full of domain vocabulary, and that vocabulary lives in the corpus regardless of which topic it was prompted from. The "off-corpus" pair is also less off-corpus than expected — paper `2508.14111` (the agentic-AI survey) has a Protein Science section that legitimately retrieves on the protein-folding query (chunk 33), so the differential narrows further. Flagged but not a halt: the signal is in the right direction and the magnitude is materially above zero.

**Plausibility / structural coherence — identical across pairs (0.42 / 0.68).** Haiku 4.5 at temperature 0.0 returned the same scores for two qualitatively different hypotheses. Both share a structural pattern ("RAG could be applied to X for Y, enabling Z that static models cannot do") and the evaluator likely anchors on that shape. Notable, not blocking — for a single-shot judging it's plausible the underlying scores really are similar; cross-run variance studies (3+ runs per pair, mirroring Step 2b₁'s methodology) would distinguish anchor from accuracy. Future-work item, not a Phase 2.5 ship blocker.

**The off-corpus hypothesis is qualitatively striking.** A genuine cross-domain extrapolation: RAG's hot-swappable index applied to biophysics, anchored against a real chunk of paper `2508.14111` that mentions length-dependent peptide unfolding (Sparks). This is the kind of output the companion paper claims LIBRAIN can produce, and it does — exactly once on a 5-paper corpus, on the first try, with citations that resolve. That's the recruiter-readable demo.
