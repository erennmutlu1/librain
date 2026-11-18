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
date: 18 November 2026
bibliography: paper.bib
---

# Summary

LIBRAIN is an open-source, auditable multi-agent retrieval-augmented generation (RAG)
system for scientific hypothesis discovery, implemented end to end on .NET 10. It indexes
open-access scientific PDFs in Qdrant and runs three pipelines over them: citation-grounded
synthesis, an extrapolative Discovery Mode that fences the speculative portion of each
hypothesis into a labelled `novelClaim` field, and two ablation baselines. A citation-validation
contract resolves every cited chunk against the retrieval set in code, so fabricated references
are dropped by construction rather than discouraged by prompting, and every stage is logged
under a correlation identifier. The repository includes a reproducible experiment suite, a web
interface that shows the verdict for every speculative sentence, and tests that replay every
committed Discovery result through the current code.

# Statement of need

LLM-based systems for literature synthesis and hypothesis generation typically optimise for
automation over observability: a reviewer cannot easily verify what evidence an output used
or which claims are grounded versus generated [@lewis2020rag; @bran2023chemcrow]. For
settings where reproducibility, citation discipline, and post-hoc verification matter, this
is a gap. LIBRAIN treats observability as a first-class design constraint and packages three
elements that are rare in combination: a structural citation-validation contract, an explicit
speculation fence (`novelClaim`) with per-sentence factuality scoring, and a correlation-ID
audit trail across every stage.

The software serves three audiences: practitioners who want a reusable, auditable RAG
implementation on a mainstream enterprise stack, without Python-centric tooling; researchers
who want a controlled testbed, since the same topic pairs run through three configurations and
every result is reproducible from committed data; and educators who want a transparent worked
example of retrieval grounding, speculation fencing, and LLM evaluation.

# State of the field

Retrieval-augmented generation [@lewis2020rag] is the standard pattern for grounding
language-model output in external documents, and several systems apply it to scientific work.
Domain agents such as ChemCrow [@bran2023chemcrow] couple language models with external tools
for chemistry tasks. Scientific question-answering systems such as PaperQA [@lala2023paperqa]
and SciRAG [@tay2025scirag] retrieve over research corpora and present citation-backed answers
with provenance display. Widely-used hosted tools, including Elicit, Consensus, and Scite,
offer citation-grounded literature answers through closed services.

These systems target answer quality and provenance display. LIBRAIN differs in three ways:
citation validity is enforced in code, so unresolved citations are dropped by construction
rather than discouraged by prompting; the speculative portion of each hypothesis is isolated in
`novelClaim` and scored sentence by sentence, so extrapolation stays visible; and every output
can be traced through a correlation-ID audit trail to the retrieval set, prompts, token usage,
and judgments behind it. It is also self-hostable and ships its own ablation baselines, so it
can serve as a controlled testbed rather than only as an end-user service.

# Software design

LIBRAIN is an ASP.NET Core minimal API on .NET 10 with a test project, a console experiment
runner, and a React web interface. A Reader component chunks PDF text, embeds each chunk with
OpenAI `text-embedding-3-small`, and stores it in Qdrant under deterministic UUIDv5
identifiers; re-ingesting a paper overwrites its chunks and removes any left over from a longer
earlier version. Papers can also be ingested by arXiv identifier, in which case title, authors
and year come from the arXiv API instead of the PDF metadata, which is usually empty. The
synthesis pipeline (`POST /api/query`) asks Claude Sonnet 4.6 for a citation-grounded
hypothesis and drops any citation that does not resolve to the retrieval set. Discovery Mode
(`POST /api/discover`) invites extrapolation, returns the speculative portion as `novelClaim`,
and passes it in parallel to a deterministic novelty scorer, an LLM-as-a-judge evaluator
(Claude Haiku 4.5), and a per-sentence claim validator. These checks fail closed: a validator
reply with no usable verdict is marked as failed with maximum risk, and a missing judge score
is an error, not a zero. Two baseline endpoints (`/api/naive-rag`, `/api/single-llm`) share
the evaluator, isolating the effect of pipeline structure from retrieval and from the model.

The agents depend on narrow interfaces for the language model, the embedding model and the
vector store, so the Anthropic and OpenAI paths share one implementation of the citation and
extrapolation contract, and the whole pipeline runs in tests against fakes. Every request
carries a correlation identifier through all stages and, when configured, into Application
Insights; completed runs are stored in SQLite under that identifier, which serves as an audit
lookup, and long runs stream their progress as server-sent events. Scoring, citation
validation and chunking are pure functions, unit-tested without network access or API keys,
and the tests replay all 30 committed Discovery outputs through the current pipeline to check
that their scores are reproduced. Prompt caching covers the static system prompt and tool
schema, but in the runs reported below it applied only to the generation call (11% of its
prompt tokens); the judge prompts are shorter than the minimum length the API caches. The web
interface links each citation to its passage, colours each `novelClaim` sentence by verdict,
and compares the three systems; Docker Compose starts the whole stack. The CLI reproduces every
experiment in the companion study.

# Research impact statement

Because the pipeline, baselines and evaluation harness are open and reproducible from committed
data, researchers can replicate the companion study or swap in their own corpora, models and
judges without rebuilding the infrastructure. The citation contract is a concrete, testable
mechanism against fabricated references: in the cross-provider study the naive baseline
surfaced 65 to 67 fabricated citations and LIBRAIN none. (Two counted citations echoed the
prompt's source-header format, and whether they resolved was not recorded.)

The software has since been run on 46 new topic pairs from nine fields, including football
analytics, sports injury prediction, web development, code translation and labour-market
studies, after adding 14 arXiv papers to the corpus. All 46 runs completed, all 246 cited
passages resolved, every hypothesis drew on at least two papers, and the validator flagged 4
of 73 speculative sentences as risky, at about US$0.07 per run. This shows that outputs pass
LIBRAIN's checks, not that any hypothesis is correct; that needs experimental testing.

# AI usage disclosure

The software uses large language models at runtime, as described above. Generative AI tools,
including Anthropic's Claude through Claude Code, also assisted with software development,
tests, documentation, and this manuscript. The author reviewed and
verified all code, experimental results, and text, and takes full responsibility for the
content. All reported results were produced by the software and are reproducible from
committed data.

# Acknowledgements

The author received no funding for this work and declares no competing interests.

# References
