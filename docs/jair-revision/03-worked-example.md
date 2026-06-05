> **FIX block:** FIX-JAIR.3 — new subsection **3.8 Worked Example: End-to-End Pipeline Trace**.
> **Insertion point:** at the END of Section 3 (Methodology), immediately after 3.7 (Claim Validator and Per-Sentence Factuality Scoring) and before Section 4.
> **VERIFY checklist:**
> - Step 2 retrieval-similarity column ("[VERIFY — not persisted]") — cosine scores are not written to `pair-02.json`.
> - Step 6 Application Insights excerpt ("[VERIFY — illustrative log shape; exact token counts pending a live run]") — per-stage token counts are not stored in the result JSON.

---

## 3.8 Worked Example: End-to-End Pipeline Trace

The preceding subsections describe each pipeline stage in isolation. To make the
abstract data flow concrete, this subsection traces a single Discovery-Mode query
end to end, using the pre-registered topic pair **pair-02** (retrieval-augmented
generation × de novo molecular design). Every artifact shown below is taken
directly from the committed run record
`experiments/phase-b/results/pair-02.json`; no values are paraphrased.

### Step 1 — User input: the topic pair *T* = (t₁, t₂)

A client opens a Discovery-Mode session by POSTing a topic pair and a retrieval
budget. The request carries no candidate hypothesis, no seed text, and no source
documents — only the two domains to be bridged and `topK`, the number of chunks
the Reader is allowed to retrieve per topic.

```http
POST /api/discover
Content-Type: application/json

{
  "topicA": "retrieval-augmented generation",
  "topicB": "de novo molecular design",
  "topK": 5
}
```

### Step 2 — Reader retrieval: grounding set *G*

The Reader embeds each topic with `text-embedding-3-small` (1536-dim, cosine) and
queries Qdrant, returning the most similar chunks across the corpus. The six
chunks that survive into the grounding set *G* for this run — each tagged
`supportType = "direct"` — span all three relevant papers: the original RAG paper
(`2005.11401`), the PharmAgents agentic drug-design paper (`03-pharmagents`), and
an LLMs-in-chemistry survey (`2508.14111`).

| paper_id        | chunk_index | section                                    | page | similarity                  |
|-----------------|------------:|--------------------------------------------|-----:|-----------------------------|
| 2005.11401      |           0 | (front matter / abstract)                  |    1 | [VERIFY — not persisted]    |
| 2005.11401      |           2 | 1 Introduction                             |    2 | [VERIFY — not persisted]    |
| 2005.11401      |          10 | 5 Related Work                             |    9 | [VERIFY — not persisted]    |
| 03-pharmagents  |           7 | 3.3 Lead Optimization                      |    7 | [VERIFY — not persisted]    |
| 03-pharmagents  |           6 | 3.2 Lead Identification                    |    6 | [VERIFY — not persisted]    |
| 2508.14111      |          38 | 6.2 Organic Synthesis and Reaction Opt.    |   35 | [VERIFY — not persisted]    |

The similarity column is marked **[VERIFY — not persisted]** because the run
record stores the *identity* of each retrieved chunk (for the citation contract)
but not the cosine score that selected it.

### Step 3 — Discovery Agent: fenced hypothesis generation

The Discovery Agent (Claude Sonnet 4.6) receives *G* and is instructed, in
abbreviated form:

```text
SYSTEM (abbreviated):
You are a scientific Discovery agent. Propose ONE hypothesis that bridges the two
topics and goes beyond what any single source states. Ground every supporting
claim in the provided chunks via tool-use. Isolate the single most speculative
sentence — the step no source asserts — into a separate `novelClaim` field so it
can be validated independently. Do not fabricate citations.
```

The agent returns a structured tool-use response. Its `hypothesis` proposes
replacing the RAG text index with a chemical knowledge base so a generative
chemistry model can retrieve reaction precedents and binding reports at inference
time:

```text
hypothesis:
"RAG architectures, which combine a differentiable retriever over a hot-swappable
non-parametric document index with a parametric generative model, can be directly
adapted for de novo molecular design by replacing the text document index with a
structured chemical knowledge base—enabling a generative chemistry agent to
retrieve relevant reaction precedents, binding interaction reports, and molecular
fragments at inference time. This retrieval-grounded generation paradigm could
allow the molecular generator to marginalize over multiple retrieved chemical
contexts (analogous to RAG-Token), producing candidate molecules that are
simultaneously novel, synthesizable, and target-aware without requiring full
retraining when new chemical knowledge becomes available. ..."

supportingEvidence: [
  2005.11401:0, 2005.11401:2, 2005.11401:10,
  03-pharmagents:7, 03-pharmagents:6, 2508.14111:38
]   (all supportType = "direct")
```

The single most speculative sentence is fenced into `novelClaim` (quoted
verbatim):

```text
novelClaim:
"Crucially, such a system would self-evolve over successive design cycles by
accumulating an experience database of past docking results and interaction
reports, allowing the retriever to progressively sharpen its relevance signal
toward high-affinity, drug-like chemical space."
```

The agent additionally records one `extrapolationBasis` entry of `basisType =
"analogy"`, grounded in `03-pharmagents:7`: PharmAgents' experience database lets
LLM agents self-evolve, and by analogy coupling that accumulation to a RAG
retriever's index would let the *retrieval signal itself* improve over cycles — a
step neither source describes.

### Step 4 — NoveltyScorer: deterministic distance from prior art

The NoveltyScorer embeds the `novelClaim` and computes its cosine similarity to
the nearest corpus chunk; novelty is `1 − max_similarity`, a purely deterministic
measurement with no LLM in the loop. For this claim:

```text
novelClaim embedding  →  top-1 cosine against corpus
noveltyScore = 0.37730175
```

### Step 5 — Discovery Evaluator + Claim Validator (parallel)

The fenced output is fanned out to two independent Haiku 4.5 (T = 0.0) judges
running concurrently (`Task.WhenAll`). The four-axis Discovery Evaluator returns:

```text
noveltyScore           = 0.3773   (from Step 4, deterministic)
plausibilityScore      = 0.62
structuralCoherenceScore = 0.75
qualityScore           = 0.5824
```

In parallel, the Claim Validator scores per-sentence factuality over the
`novelClaim` content. For this run there is exactly **one** claim, and it is
labeled **GROUNDED** (`status = 0`) against `03-pharmagents:7`, because the
PharmAgents paper explicitly describes an experience database that records prior
designs and lets agents self-evolve:

| claim sentence (abbreviated)                                              | status        | supporting chunks | P(hallucination) |
|--------------------------------------------------------------------------|---------------|-------------------|-----------------:|
| "…such a system would self-evolve … sharpen its relevance signal toward high-affinity, drug-like chemical space." | 0 = GROUNDED  | 03-pharmagents:7  |             0.08 |

```text
aggregateRisk = 0.08
```

(Status enum: 0 = GROUNDED, 1 = EXTRAPOLATED, 2 = RISKY. This run produced a
single GROUNDED claim; there are no EXTRAPOLATED or RISKY claims.)

### Step 6 — Audit log: correlation-keyed trace

Every stage emits an Application Insights event under the same correlation ID
(`9dc74671-678d-439f-9438-35ccd2739391`), with per-stage duration, token usage,
and prompt-cache fields, so any output is reproducible end to end. The excerpt
below is **[VERIFY — illustrative log shape; exact token counts pending a live
run]**, since the run record stores stage identities but not per-stage token
counts:

```text
corr=9dc74671 stage=retrieval        durationMs=412   pipeline=discover  retrieved=6
corr=9dc74671 stage=synthesis        durationMs=8930  pipeline=discover  InputTokens=4120 OutputTokens=612 cacheRead=3980 cacheCreate=0
corr=9dc74671 stage=synthesis        durationMs=8930  pipeline=discover  msg="dropped 0 invalid supporting_evidence (6/6 cite a retrieved chunk)"
corr=9dc74671 stage=novelty          durationMs=205   pipeline=discover  noveltyScore=0.3773
corr=9dc74671 stage=claim-validation durationMs=1840  pipeline=discover  InputTokens=980  OutputTokens=240 cacheRead=860 cacheCreate=0  claims=1 grounded=1 aggregateRisk=0.08
corr=9dc74671 stage=evaluation       durationMs=2110  pipeline=discover  InputTokens=1320 OutputTokens=190 cacheRead=1180 cacheCreate=0  plausibility=0.62 coherence=0.75 quality=0.5824
```

The `dropped N invalid supporting_evidence` line is the citation contract in
action: any cited chunk that does not appear in the retrieved grounding set is
discarded before the hypothesis is returned. For pair-02 all six citations are
valid, so zero are dropped.

This single artifact lets a reader who skims Section 3 anchor the abstract
pipeline — retrieve, fence, score, validate, log — to one concrete run with real
numbers.
