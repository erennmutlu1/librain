---
title: 'LIBRAIN: An auditable multi-agent retrieval-augmented generation system for scientific hypothesis discovery in .NET'
tags:
  - retrieval-augmented generation
  - large language models
  - multi-agent systems
  - scientific discovery
  - hypothesis generation
  - observability
  - C#
  - .NET
authors:
  - name: Eren Mutlu
    orcid: 0009-0003-1888-4035
    affiliation: 1
affiliations:
  - name: Independent Researcher
    index: 1
date: 17 June 2026
bibliography: paper.bib
---

# Summary

LIBRAIN is an open-source, auditable multi-agent retrieval-augmented generation (RAG)
system for scientific hypothesis discovery, implemented end to end on .NET 10. It ingests
open-access scientific PDFs into a Qdrant vector index and runs three pipelines over that
index: a citation-grounded synthesis pipeline, an extrapolative Discovery Mode that fences
the speculative portion of each hypothesis into a labelled `novelClaim` field, and two
ablation baselines for controlled comparison. A structural citation-validation contract
resolves every cited chunk against the actual retrieval set in code, so fabricated chunk
references are dropped by construction rather than discouraged by prompting. Every stage
emits structured audit events keyed by a correlation identifier, so any output is traceable
back to the exact retrieval set, prompts, and per-axis judgments that produced it. The
repository ships a reproducible experiment suite (a console CLI plus committed result data)
and a unit-test suite over the load-bearing pure functions.

# Statement of need

LLM-based systems for literature synthesis and hypothesis generation typically optimise for
automation over observability: a reviewer cannot easily verify what evidence an output used
or which claims are grounded versus generated [@lewis2020rag; @bran2023chemcrow]. For
settings where reproducibility, citation discipline, and post-hoc verification matter, this
is a gap. LIBRAIN treats observability as a first-class design constraint and packages three
elements that are rare in combination: a structural citation-validation contract, an explicit
speculation fence (`novelClaim`) with per-sentence factuality scoring, and a correlation-ID
audit trail across every stage.

The software is useful to three audiences. Practitioners get a reusable reference
implementation of citation-grounded, auditable RAG on a mainstream enterprise stack, which
also demonstrates that this class of agent design does not require Python-centric tooling.
Researchers get a controlled testbed: the same topic pairs run through three configurations,
and every result is reproducible from committed data via the documented CLI. Educators get a
transparent worked example of retrieval grounding, speculation fencing, and LLM evaluation.

# State of the field

Retrieval-augmented generation [@lewis2020rag] is the standard pattern for grounding
language-model output in external documents, and several systems apply it to scientific work.
Domain agents such as ChemCrow [@bran2023chemcrow] couple language models with external tools
for chemistry tasks. Scientific question-answering systems such as PaperQA [@lala2023paperqa]
and SciRAG [@tay2025scirag] retrieve over research corpora and present citation-backed answers
with provenance display. Widely-used hosted tools, including Elicit, Consensus, and Scite,
offer citation-grounded literature answers through closed services.

These systems target answer quality and provenance display. LIBRAIN differs on three points.
First, citation validity is enforced structurally in code: every cited chunk is resolved
against the actual retrieval set and unresolved citations are dropped by construction, rather
than being discouraged through prompting. Second, the speculative portion of each hypothesis
is isolated in a named `novelClaim` field that is scored separately for per-sentence
factuality, so extrapolation is visible rather than blended into grounded text. Third, every
stage is replayable from a correlation-ID audit trail that records the retrieval set, prompts,
token usage, and per-axis judgments behind any output. LIBRAIN is also an open, self-hostable
reference implementation with built-in ablation baselines, which makes it usable as a
controlled research testbed rather than only as an end-user service.

# Software design

LIBRAIN is an ASP.NET Core minimal API on .NET 10, organised as three projects: the service,
a unit-test suite, and a console experiment runner. A Reader component extracts and chunks PDF
text, embeds each chunk with OpenAI `text-embedding-3-small`, and persists it in Qdrant with
deterministic UUIDv5 identifiers so re-ingestion is idempotent. The synthesis pipeline
(`POST /api/query`) prompts Claude Sonnet 4.6 for a citation-grounded hypothesis and drops any
citation that does not resolve to the retrieval set. Discovery Mode (`POST /api/discover`)
invites extrapolation, returns the speculative portion as a separate `novelClaim`, and fans
the output via `Task.WhenAll` to a deterministic novelty scorer, an LLM-as-a-judge evaluator
(Claude Haiku 4.5), and a per-sentence claim validator. Two baseline endpoints
(`/api/naive-rag`, `/api/single-llm`) share the evaluator, isolating the contribution of
pipeline structure from retrieval and from the underlying model.

Two design decisions support auditability and testing. Every request carries a correlation
identifier that flows through all stages and, when configured, into Application Insights,
recording chunk counts, token usage, citation-validation outcomes, and per-axis scores.
Scoring, citation validation, and chunking are implemented as pure functions separated from
the agents that call them, so the load-bearing logic is unit-tested without network access or
API keys. All language-model agents enable Anthropic prompt caching for the static system
prompt and tool schema. The accompanying CLI reproduces the companion study's controlled
comparison, robustness sweeps, a cross-provider fabrication-rate study, real Discovery
ranking, judge substitution, novelty-metric validation, and inter-rater agreement.

# Research impact statement

LIBRAIN lowers the barrier to studying auditable, citation-grounded generation. Because the
full pipeline, the ablation baselines, and the evaluation harness are open and reproducible
from committed data, researchers can replicate the companion study or substitute their own
corpora, models, and judges without rebuilding the surrounding infrastructure. The structural
citation contract gives a concrete, testable mechanism for reducing fabricated references: in
the included cross-provider study the naive baseline surfaced 67 fabricated citations while
LIBRAIN surfaced none, because unresolved citations are removed in code. As a self-hostable
reference implementation on a mainstream enterprise stack, the software also serves
practitioners who need provenance and post-hoc verification, and educators who need a
transparent worked example of retrieval grounding, speculation fencing, and language-model
evaluation.

# AI usage disclosure

The software uses large language models as core runtime components: Claude Sonnet 4.6 for
synthesis and Discovery, Claude Haiku 4.5 for evaluation and claim validation, and OpenAI
embedding and chat models, as described above. In addition, generative AI tools, including
Anthropic's Claude through Claude Code, were used to assist with software development, test
authoring, documentation, and preparation of this manuscript. The author reviewed and
verified all code, experimental results, and text, and takes full responsibility for the
content. All reported results were produced by the software and are reproducible from
committed data.

# Acknowledgements

The author received no funding for this work and declares no competing interests.

# References
