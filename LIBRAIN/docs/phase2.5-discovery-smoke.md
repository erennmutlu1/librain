# Discovery Mode — Phase 2.5 Smoke

**Status**: Stub. Locked-in protocol; results filled by Step 2b.

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
