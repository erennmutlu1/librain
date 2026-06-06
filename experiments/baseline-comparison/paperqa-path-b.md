# Task 2 — PaperQA comparison (Path B: documented, not live-rescored)

**System:** PaperQA (Lala et al., 2023; Future-House/paper-qa), a grounded
retrieval-augmented generative *agent* for scientific QA — iterative
retrieve-then-read over a paper corpus with passage-level provenance.

## Why Path B (live run attempted, blocked)

A live Path-A run was attempted: paper-qa 2026.3.18 was installed and pointed at
the same corpus PDFs, configured OpenAI-only (gpt-4o-mini + text-embedding-3-small),
with the intent to answer each of the 10 pre-registered topic pairs and re-score the
outputs through `/api/score`. It did not complete cleanly within this revision:

- paper-qa's indexing (document *enrichment* during `aadd`) issues large, bursty
  LLM calls. On this OpenAI account these exhausted the per-minute token limits —
  first the **gpt-4o 30K-TPM** tier (the default enrichment model), and after
  forcing all models to gpt-4o-mini, the **gpt-4o-mini 200K-TPM** tier — and
  litellm's 3 internal retries were insufficient, so most papers failed to index.
- Two PDFs also need image-extraction deps / hit pypdf decompression limits.

This is the "infeasible within this revision" condition the revision plan
anticipated for Path A. The tooling is committed and ready
(`/tmp/run_paperqa.py`, `/api/score`, the `score-systems` command), so a live
4th-system run is a drop-in once a higher OpenAI rate tier (or a
`SEMANTIC_SCHOLAR_API_KEY` + raised TPM) is available.

## Characteristic comparison (drop-in for §2.5 matrix)

| Characteristic | PaperQA | LIBRAIN |
|---|---|---|
| Retrieval grounding | Iterative retrieve-then-read over a paper corpus | Top-k dense retrieval per topic, deduplicated, dispatched to a multi-agent pipeline |
| Citation validation | Answers cite passages; provenance shown, **no enforced structural resolution contract** | Structural contract: `supportingEvidence` chunks must resolve to the retrieval set in C#; `novelClaim` exempt by design |
| Speculation handling | Implicit; speculative content not separable from grounded content | Explicit `novelClaim` field + per-sentence ClaimValidator |
| Agent decomposition | Agentic retrieve-read-cite loop | Reader → Synthesis/Discovery → Evaluator + ClaimValidator |
| Audit/observability | Not reported as correlation-id audit logging | Application Insights events keyed by correlation ID, per-stage token/cache fields |
| Task framing | Question answering over literature | Cross-domain hypothesis generation with novelty/plausibility separation |

## Published reference points (fill before submission)

PaperQA reports `[VERIFY — insert PaperQA's headline metric, e.g. LitQA accuracy,
from Lala et al. 2023]`. These are **not directly comparable** to our four-axis
rubric (novelty / plausibility / structural coherence / quality) — they index QA
correctness on a different benchmark, not cross-domain hypothesis quality — but
they situate LIBRAIN against a recognized grounded-RAG system. The
RQ3 fabrication result already shows the contribution that distinguishes LIBRAIN
from provenance-only RAG: a *structural* citation contract that removes
fabrications PaperQA-style provenance does not prevent.
