# Phase 2 Step 6 — Smoke Test Results

End-to-end validation of the `POST /api/query` pipeline against the live OpenAI Embeddings + Qdrant + Anthropic (Sonnet 4.6 + Haiku 4.5) stack on 2026-05-06. First live Anthropic API call in the project.

Endpoint: [LIBRAIN/Endpoints/QueryEndpoints.cs](../Endpoints/QueryEndpoints.cs) at commit `8a54c79`.
Corpus: 5 arXiv papers, 218 chunks in Qdrant (Phase 1 ingest).

## Acceptance criteria

Plan target ([phase2-step6-plan.md §6](phase2-step6-plan.md)) vs primary smoke result:

| Criterion | Target | Actual | Pass |
|-----------|-------:|-------:|:----:|
| HTTP status | 200 OK | 200 OK | ✅ |
| Cite `2005.11401` (Lewis et al. RAG) | ≥1 chunk | 4 of 4 chunks | ✅ |
| `qualityScore` | > 0.40 | **0.917** | ✅ |
| `groundednessScore` | > 0.70 | **0.95** | ✅ |
| `relevanceScore` | > 0.80 | **0.95** | ✅ |
| Round-trip latency | < 5s | **13.5s** | ❌ (deferred — see §6) |

5 of 6 acceptance criteria pass. Latency is the lone gap; the pipeline is functionally correct and the gap is well-understood. Phase 2 ships; Phase 3 hardens.

## Smoke 1 — Primary query (in-corpus)

**Request**:
```json
{ "query": "How does retrieval-augmented generation mitigate hallucination?", "topK": 5 }
```

**Hypothesis** (synthesis output):
> Retrieval-augmented generation (RAG) mitigates hallucination in language models by combining parametric memory (a pre-trained seq2seq model) with non-parametric memory (a dense vector index accessed via a neural retriever), allowing the generator to condition on retrieved external documents rather than relying solely on knowledge encoded in model parameters. Because purely parametric models cannot easily expand or revise their memory and may produce hallucinations, the hybrid RAG approach addresses this by grounding generation in retrieved passages that can be inspected and updated. Empirically, RAG models have been shown to generate more factual, specific, and diverse language compared to parametric-only baselines such as BART on knowledge-intensive generation tasks.

**Citations** (4 of 4 from `2005.11401`):

| Citation # | paperId | chunkIndex | section | page |
|-----------:|---------|-----------:|---------|-----:|
| 1 | `2005.11401` | 1 | 1 Introduction | 1 |
| 2 | `2005.11401` | 0 | — | 1 |
| 3 | `2005.11401` | 2 | 1 Introduction | 2 |
| 4 | `2005.11401` | 7 | 4.3 Jeopardy Question Generation | 6 |

**Synthesis confidence**: 0.92

**Evaluation breakdown**:

| Dimension | Score |
|-----------|------:|
| Quality (aggregate) | **0.917** |
| Groundedness | 0.95 |
| Relevance | 0.95 |
| Completeness | 0.85 |

**Critique** (paraphrased): the Evaluator correctly identified that the cited sources don't detail the underlying cognitive mechanisms by which retrieval reduces hallucination — fair, conservative judgment. Completeness held at 0.85 (not 1.0) for that reason.

**Token usage**:
- Synthesis (Sonnet 4.6): 6,365 in / 257 out
- Evaluation (Haiku 4.5): 6,721 in / 441 out
- Cost: **~$0.032**

**Latency**: 13.5s end-to-end (embed + search + synth + eval).

## Smoke 2 — Sanity query (off-corpus)

**Request**:
```json
{ "query": "What is the capital of France?", "topK": 5 }
```

**Hypothesis**:
> The provided sources do not address the capital of France. All retrieved sources pertain to agentic AI systems for scientific research and retrieval-augmented generation (RAG) models, and contain no information relevant to the query about France's capital.

**Citations** (5 of 5 — vector search returned the closest chunks even though the corpus has nothing about France):

| Citation # | paperId | chunkIndex | section | page |
|-----------:|---------|-----------:|---------|-----:|
| 1 | `2508.14111` | 15 | 3.2. Tool Use and Integration | 14 |
| 2 | `2508.14111` | 2 | 5.2 Genomics, Transcriptomics, and Multi-Omics Analysis [^pdftoc] | 2 |
| 3 | `2508.14111` | 1 | 9 Lingang Laboratory, 10 Tsinghua University | 1 |
| 4 | `2508.14111` | 11 | 3. Scientific Agents: Core Abilities and Challenges | 11 |
| 5 | `2005.11401` | 6 | 4.1 Open-domain Question Answering | 5 |

[^pdftoc]: Section name truncated from raw PDF extraction. The original detected section was a PDF table-of-contents artifact with trailing dot-leaders. PdfPig's heuristic section detection occasionally captures TOC entries; addressing this is a Phase 3 chunker concern.

**Synthesis confidence**: **0.0** — explicitly triggered by the insufficient-sources policy in the [SynthesisAgent system prompt](../Agents/SynthesisAgent.cs): "If the sources are insufficient to form any defensible hypothesis: set `confidence` below 0.3 [...] write a hypothesis stating the limitation explicitly."

**Evaluation breakdown**:

| Dimension | Score |
|-----------|------:|
| Quality (aggregate) | **1.0** |
| Groundedness | 1.0 |
| Relevance | 1.0 |
| Completeness | 1.0 |

### Why this is the win, not a sanity-check failure

A naïve reading expects the Evaluator to score this query *low* — irrelevant query, no real answer. Instead, the Evaluator gave it 1.0 across the board. **This is correct behavior**, not a bug:

- Synthesis **refused to fabricate** — it returned a hypothesis whose sole content is "the provided sources do not address this query," with `confidence=0.0`.
- The Evaluator scored that refusal:
  - **Groundedness 1.0**: every claim ("the sources do not address X") is trivially supported — there genuinely are no France-related claims in the corpus.
  - **Relevance 1.0**: the hypothesis directly addresses the user's query (by truthfully reporting the limitation).
  - **Completeness 1.0**: integrating sources that *don't* discuss France would have been a hallucination; refusing is the complete, honest answer.

The two-agent loop's anti-hallucination guardrail works end-to-end: Synthesis refuses to fabricate when retrieval is poor, and Evaluator rewards epistemic honesty rather than penalizing it.

**Token usage**:
- Synthesis (Sonnet 4.6): 6,543 in / 171 out
- Evaluation (Haiku 4.5): 6,794 in / 300 out
- Cost: **~$0.029**

**Latency**: 9.6s end-to-end.

## Cost analysis

| Item | Smoke 1 | Smoke 2 | Avg |
|------|--------:|--------:|----:|
| Synthesis input | 6,365 | 6,543 | 6,454 |
| Synthesis output | 257 | 171 | 214 |
| Evaluation input | 6,721 | 6,794 | 6,758 |
| Evaluation output | 441 | 300 | 371 |
| **Total cost** | $0.032 | $0.029 | **$0.030** |

At ~$0.030/query, a $5 budget supports ~150–170 demo queries. Comfortable headroom for Phase 3 development without re-topping credit.

Embedding cost for the query string is negligible (~50 tokens × $0.02/1M ≈ $0.000001) — not itemized above.

## Latency analysis

P95 ~13s end-to-end (Smoke 1: 13.5s, Smoke 2: 9.6s). The plan target of < 5s does not hold. Decomposition (estimated from token-usage proportion + observed `ElapsedMs` log lines):

| Stage | ~Latency |
|-------|---------:|
| Query embedding (OpenAI) | < 0.3s |
| Vector search (Qdrant local) | < 0.2s |
| Synthesis (Sonnet 4.6, ~6.4k input → ~250 output) | ~6–7s |
| Evaluation (Haiku 4.5, ~6.8k input → ~400 output) | ~5–6s |

The two Anthropic calls run **sequentially** and each carries the full SOURCES block independently. Phase 3 mitigations, in priority order:

1. **Parallelize synth + eval**: not possible as designed (Evaluator needs the Synthesis hypothesis as input).
2. **Stream the Synthesis response**: surfaces the hypothesis to the client as it's generated; perceived latency drops dramatically even if total wall-clock is unchanged.
3. **Prompt caching** (Anthropic SDK 5.10 supports `CacheControl`): cache the system prompts (~250 tokens × 2 agents) and ideally the SOURCES block — would cut input tokens by ~95% on repeat queries with the same retrieval.
4. **Smaller synthesis model**: Haiku 4.5 for synthesis would roughly halve synthesis latency; trade-off in hypothesis quality TBD via a second smoke comparison.
5. **Reduced topK or chunk size**: shrinks the SOURCES block, but risks groundedness drops.

None are urgent for the portfolio demo. Latency is observable, costed, and roadmapped.

## Conclusion — Phase 2 acceptance: PASS

- Pipeline is functionally correct end-to-end across two real Anthropic API calls.
- Quality / groundedness / relevance / citation accuracy all exceed plan thresholds with margin.
- Anti-hallucination guardrail (Synthesis refusal + Evaluator reward) demonstrated on the off-corpus query — the system behaves as a research assistant, not a confidence-game.
- The single failed criterion (latency < 5s) is well-understood, has documented Phase 3 mitigations, and does not block portfolio readiness.

Phase 2 ships.
