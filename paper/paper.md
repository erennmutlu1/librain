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
    orcid: 0000-0000-0000-0000
    affiliation: 1
affiliations:
  - name: Independent Researcher
    index: 1
date: 16 June 2026
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
audit trail across every stage. Neighbouring grounded-RAG systems such as PaperQA
[@lala2023paperqa] and SciRAG [@tay2025scirag] target answer quality and provenance display;
LIBRAIN's distinct contribution is enforced citation resolution combined with a named,
separately scored speculation field and an end-to-end replayable audit log.

The software is useful to three audiences. Practitioners get a reusable reference
implementation of citation-grounded, auditable RAG on a mainstream enterprise stack, which
also demonstrates that this class of agent design does not require Python-centric tooling.
Researchers get a controlled testbed: the same topic pairs run through three configurations,
and every result is reproducible from committed data via the documented CLI. Educators get a
transparent worked example of retrieval grounding, speculation fencing, and LLM evaluation.

# Design and functionality

A Reader component extracts and chunks PDF text, embeds each chunk with OpenAI
`text-embedding-3-small`, and persists it in Qdrant with deterministic UUIDv5 identifiers so
re-ingestion is idempotent. The synthesis pipeline (`POST /api/query`) prompts Claude Sonnet
4.6 for a citation-grounded hypothesis and drops any citation that does not resolve to the
retrieval set. Discovery Mode (`POST /api/discover`) invites extrapolation, returns the
speculative portion as a separate `novelClaim`, and fans the output via `Task.WhenAll` to a
deterministic novelty scorer, an LLM-as-a-judge evaluator (Claude Haiku 4.5), and a
per-sentence claim validator. Two baseline endpoints (`/api/naive-rag`, `/api/single-llm`)
share the evaluator, isolating the contribution of pipeline structure from retrieval and from
the underlying model. Every request carries a correlation identifier that flows through all
stages and, when configured, into Application Insights, recording chunk counts, token usage,
citation-validation outcomes, and per-axis scores. The accompanying CLI reproduces the
companion study's controlled comparison, robustness sweeps, a cross-provider fabrication-rate
study, real Discovery ranking, judge substitution, novelty-metric validation, and inter-rater
agreement.

# Acknowledgements

The author received no funding for this work and declares no competing interests.

# References
