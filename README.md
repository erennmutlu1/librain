# LIBRAIN

> **A multi-agent RAG system that reads scientific papers and proposes new hypotheses, built in .NET 10.**

![.NET](https://img.shields.io/badge/.NET-10.0-512BD4)
![Anthropic](https://img.shields.io/badge/Anthropic-Claude-D97757)
![Qdrant](https://img.shields.io/badge/Vector%20Store-Qdrant-DC382D)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-Phase%203.A.5%20shipped-brightgreen)

LIBRAIN ingests open-access scientific papers from arXiv, builds a semantically-searchable knowledge base using vector embeddings, and uses a multi-agent reasoning pipeline to generate citation-grounded research hypotheses. Every output is auditable: from the retrieved excerpts to the LLM-as-a-Judge evaluation scores.

---

## What It Does

```
  ┌──────────┐    ┌──────────┐    ┌─────────────────────────┐
  │  arXiv   │───►│  Reader  │───►│        Qdrant           │
  │  papers  │    │  Agent   │    │     (vector store)      │
  └──────────┘    └──────────┘    └────┬────────────────┬───┘
                                       │                │
                                       ▼                ▼
                             ┌──────────────┐  ┌──────────────────┐
  /api/query    ────────────►│  Synthesis   │  │   Discovery      │◄──── /api/discover
                             │    Agent     │  │     Agent        │
                             └──────┬───────┘  └────────┬─────────┘
                                    ▼                   ▼
                             ┌──────────────┐  ┌────────────────────┐
                             │  Evaluator   │  │ NoveltyScorer +    │
                             │    Agent     │  │ Discovery Eval. +  │
                             │              │  │ ClaimValidator     │
                             │              │  │  (Task.WhenAll)    │
                             └──────┬───────┘  └────────┬───────────┘
                                    │                   │
                                    └─────────┬─────────┘
                                              ▼
                                 ┌─────────────────────────┐
                                 │  Application Insights   │
                                 │     (audit trail)       │
                                 └─────────────────────────┘
```

1. **Reader Agent.** Extracts text from arXiv PDFs, chunks it semantically, embeds chunks via OpenAI `text-embedding-3-small`, persists to Qdrant with metadata.
2. **Synthesis Agent.** On a user query, retrieves top-K chunks via vector search, prompts Anthropic Claude to generate citation-grounded hypotheses connecting concepts across papers.
3. **Evaluator Agent.** Uses LLM-as-a-Judge with a fixed rubric (plausibility, novelty, clarity) to score and filter hypotheses, reducing hallucinations.
4. **Discovery Mode** (Phase 2.5). A separate `POST /api/discover` endpoint takes one or two topics, retrieves evidence per topic, and asks Claude to propose a hypothesis that goes BEYOND the cited sources; the unsupported portion is flagged as `novelClaim` (the discovery, not a hallucination). Scored on a multi-axis rubric: deterministic novelty (cosine distance to nearest existing chunk), LLM-judged plausibility, and structural coherence. A cross-run consistency study (N=5) validates plausibility as the discriminating axis across hypotheses, while structural coherence functions as a well-formedness baseline.
5. **Claim-Level Validation** (Phase 3.A.5). The `extrapolation_basis` schema field plus a secondary `ClaimValidatorAgent` (Haiku 4.5) classify each sentence of `novelClaim` as `GROUNDED`, `EXTRAPOLATED`, or `RISKY` against the retrieved chunks. Addresses the companion paper's finding that 3 of 5 LIBRAIN outputs were rater-flagged for factually-framed speculation inside the `novelClaim` body. The validator runs in parallel with `Discovery Evaluator` (`Task.WhenAll`) so the extra pass costs roughly one Haiku call's latency, not three.
6. **Baseline Agents** (Phase 3.A). `NaiveRagAgent` (retrieval plus structured tool-use without a citation contract) and `SingleLlmAgent` (no retrieval, plain text) ship as ablation conditions for the companion paper's three-system comparison. Both reuse the same `Discovery Evaluator` and `NoveltyScorer` so cross-system scoring isolates pipeline structure from evaluator implementation.
7. **Audit Trail.** Every step (retrieval, generation, evaluation, claim validation) is logged to Application Insights with a correlation ID, enabling full reproducibility of any output. Every Anthropic call also records `cacheRead` + `cacheCreate` token counts so prompt-cache effectiveness is observable per request.

> Discovery Mode runs as a parallel pipeline off the same retrieval layer; it does not replace the Synthesis → Evaluator path.

---

## Why This Project

Most RAG and agent tutorials are written in Python. LIBRAIN explores what production-grade agent architectures look like in **.NET 10** using Microsoft Semantic Kernel patterns and Anthropic's official .NET SDK. It's a deliberate counter-example to the "AI = Python only" assumption.

The companion technical paper (`docs/architecture.pdf`) describes the original four-agent design, the simplifications made for the MVP, and the empirical results from the Phase B baseline experiment and the AFTER-FIX human-evaluation pilot. The paper is currently in revision; an arXiv preprint and a peer-reviewed venue submission are both in preparation.

---

## Engineering Challenges

### Cosmos DB → Qdrant (twice)

The original plan targeted Azure Cosmos DB for NoSQL with its DiskANN vector index for an Azure-native production story. Phase 1 pivoted away from Cosmos for two reasons: the emulator was unstable on macOS Apple Silicon, and a paid managed service offered no learning advantage over a free local alternative for a prototype. We shipped against Qdrant in local Docker, with all data access confined to a single repository class so the swap remained a one-file change.

Phase 2.5 retired the Cosmos plan entirely. Qdrant Cloud's free tier (AWS Frankfurt; 0.5 vCPU, 1 GB RAM, 4 GB disk) accommodates the 218-chunk Phase 1 corpus comfortably and absorbed the Phase B expansion to 610 chunks (and later the 1,351-chunk, 24-paper corpus) without operator intervention. It runs the same engine as local development, uses the same vector dimension, distance metric, and UUIDv5 IDs, and auto-selects between local and cloud via API key presence in user-secrets. There is no schema migration between dev and production: they are the same engine on the same code path.

### noveltyTarget knob retirement (Phase 2.5)

An early `noveltyTarget` request parameter was wired into the Discovery Agent's system prompt as a soft calibration instruction on a 0-to-1 scale. Before exposing it to callers, a pre-deployment validation protocol ran three calls at `noveltyTarget = 0.2` and three at `noveltyTarget = 0.9`, retrieval held identical across all six runs. The measured mean novelty differential was 0.0184 against a 2-sigma noise band of 0.0668, and the direction inverted. The knob did not steer model behaviour in the intended way and was retired before reaching production users. The Discovery prompt now invites extrapolation unconditionally and the deterministic NoveltyScorer measures the result. Cosine-distance novelty is treated as a measurement surface, not a control surface.

### ClaimValidator and the AFTER-FIX pilot (Phase 3.A.5)

A single-rater blinded pilot in Phase 3.A flagged 3 of 5 LIBRAIN outputs for factual hallucination inside `novelClaim` text. The flagged content sat in the speculative body of the hypothesis, not in the citations, so the existing citation-validation contract did not catch it by construction. Phase 3.A.5 added a per-sentence `ClaimValidatorAgent` that labels each `novelClaim` sentence `GROUNDED`, `EXTRAPOLATED`, or `RISKY` with a hallucination probability, aggregated halo-resistant via the max rule in C#. The AFTER-FIX rerun under the same blinded protocol moved the flag count from 3 of 5 to 0 of 5, with `novelClaim` novelty rising from 4.00 to 4.40 on the rater's 1-to-5 scale.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | .NET 10, ASP.NET Core Minimal APIs |
| API docs | Scalar.AspNetCore on top of `Microsoft.AspNetCore.OpenApi` |
| LLM (reasoning) | Anthropic Claude Sonnet 4.6 (synthesis), Haiku 4.5 (evaluation) via Anthropic.SDK 5.10 |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) |
| Vector store | Qdrant 1.17 (local Docker in dev, Qdrant Cloud free tier in production, AWS Frankfurt) |
| Orchestration | Microsoft Semantic Kernel patterns |
| PDF parsing | PdfPig |
| Observability | Application Insights, structured logging |
| Hosting | Azure Container Apps (API), Azure Static Web Apps (frontend) |

---

## Quick Start

```bash
# Clone
git clone https://github.com/erennmutlu1/librain.git
cd librain

# Configure secrets (one-time)
dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-..." --project LIBRAIN
dotnet user-secrets set "OpenAI:ApiKey" "sk-..." --project LIBRAIN
dotnet user-secrets set "Qdrant:Host" "localhost" --project LIBRAIN

# Start the dev vector store (Qdrant)
docker run -d --name librain-qdrant -p 6333:6333 -p 6334:6334 \
  -v ~/qdrant-data:/qdrant/storage qdrant/qdrant

# Run
dotnet run --project LIBRAIN
```

Once the API is up:

```bash
# Ingest a paper (drop a PDF in data/papers/ first)
curl -k -X POST https://localhost:7XXX/api/papers/ingest \
  -F "file=@data/papers/2005.11401.pdf"

# Run a query
curl -k -X POST https://localhost:7XXX/api/query \
  -H "Content-Type: application/json" \
  -d '{"query":"How does retrieval-augmented generation mitigate hallucination?","topK":5}'
```

(Replace 7XXX with the port from the dotnet run startup log.)

---

## Example query result

Real output from the Phase 2 smoke test:

```jsonc
{
  "hypothesis": "Retrieval-augmented generation (RAG) mitigates 
                 hallucination by combining parametric memory with 
                 non-parametric memory (a dense vector index)…",
  "citations": [
    { "paperId": "2005.11401", "section": "1 Introduction", "pageNumber": 1 },
    { "paperId": "2005.11401", "section": "4.3 Jeopardy Question Generation", "pageNumber": 6 }
  ],
  "synthesisConfidence": 0.92,
  "evaluation": {
    "qualityScore": 0.917,
    "groundednessScore": 0.95,
    "relevanceScore": 0.95,
    "completenessScore": 0.85
  }
}
```

All four citations resolved to chunks from `2005.11401` (Lewis et al., the RAG paper). The Evaluator deducted 0.15 from completeness for a real gap in the cited evidence rather than rubber-stamping the answer.

---

## Roadmap

- [x] Project plan & architecture (May 2026)
- [x] **Phase 1**: Reader Agent + ingestion pipeline (May 2026)
- [x] **Phase 2**: Synthesis & Evaluator agents + `POST /api/query` (May 2026)
- [x] **Phase 2.5**: Discovery Mode, `POST /api/discover` with novel-claim flagging + multi-axis evaluation (May 2026)
- [x] **Phase 3.A**: Three-system baseline (`NaiveRagAgent`, `SingleLlmAgent`), claim-level validation (`extrapolation_basis` + `ClaimValidatorAgent`), prompt caching across all agents, parallelized scoring (`Task.WhenAll`), `LIBRAIN.Experiments` CLI for paper reproduction (May 2026)
- [x] **Robustness analysis**: config-driven synthesis model (`Models:SynthesisModel`) + a `robustness` subcommand (topK sensitivity, Sonnet→Haiku substitution, adversarial prompting) over an expanded 24-paper corpus; citation contract holds (zero fabricated citations) across every configuration
- [ ] **Phase 3.B**: Frontend demo, Azure deployment (Container Apps + Static Web Apps), response streaming, two-rater human eval follow-up

See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) for detailed scope.

---

## Performance

- Papers ingested: 24 (1,351 chunks total). The original 5-paper seed plus a multi-domain expansion spanning RAG/agentic methods, drug discovery & proteins, weather/climate/energy, agriculture, clinical trials, and cognition/neuroscience. (The pre-registered companion-paper results in [Reproducing Paper Numbers](#reproducing-paper-numbers) use the original 13-paper Phase B corpus and are unchanged.)
- Retrieval latency (p95): < 200 ms (Qdrant local, top-5).
- End-to-end query latency: ~13s synthesis path; Discovery + claim validation + evaluation now run via `Task.WhenAll` so the post-synthesis stage is bounded by the slowest single Haiku call instead of three sequential round-trips.
- Robustness: across `topK ∈ {3,5,7,10}`, a Sonnet 4.6 → Haiku 4.5 synthesis swap, and an adversarial prompt explicitly demanding out-of-corpus citations, the citation-validation contract admitted **zero** fabricated citations in every configuration — a by-construction guarantee, not a model-dependent one. Reproduce with `dotnet run --project LIBRAIN.Experiments -- robustness`.
- Anthropic prompt caching: enabled on all seven LLM-backed agents via `MessageParameters.PromptCaching = PromptCacheType.AutomaticToolsAndSystem`. Audit log shows `cacheRead`/`cacheCreate` token counts per call; within a 5-minute TTL repeated runs reuse ~80% of the system+tool prefix tokens.
- Cost per query: ~$0.030 synthesis, ~$0.04 discovery (Sonnet synth + Haiku eval + Haiku claim-validation, cached prefix).
- Tests: **62/62 passing** (chunker, citation validation, evaluation/novelty/discovery scoring, claim-validation scoring, baseline fabrication counting, single-LLM no-retrieval contract, synthesis-model resolution, robustness-CSV formatting).

---

## Reproducing Paper Numbers

Every numeric claim in the companion paper is backed by a runnable command + a committed CSV. The reproduction tooling lives in `LIBRAIN.Experiments`; raw responses and aggregates live in `experiments/`.

| Paper artifact | Command (from repo root) | Output |
|---|---|---|
| **Table 5** Phase B 10-pair scores | `dotnet run --project LIBRAIN.Experiments -- phase-b` | `experiments/phase-b/results/{pair-*.json, aggregate.csv}` |
| **Table 7** Three-system aggregate means | `dotnet run --project LIBRAIN.Experiments -- baseline` | `experiments/baseline-comparison/results/{librain,naive-rag,single-llm}/*.json` + `aggregate.csv` |
| **Table 8** Naive-RAG citation fabrication | (produced by `baseline`) | `experiments/baseline-comparison/results/fabrication-counts.csv` |
| **Table 9** Per-system human-eval descriptives | `dotnet run --project LIBRAIN.Experiments -- analyze` | `experiments/human-eval-pilot/analysis.csv` |
| **Spearman ρ** (rater vs LLM-as-Judge, per axis) | (produced by `analyze` once baseline is run) | `experiments/human-eval-pilot/spearman.csv` |
| **Experiment 8** Hallucination mitigation pilot (Phase 3.A.5) | `dotnet run --project LIBRAIN.Experiments -- hallucination-pilot` | `experiments/hallucination-pilot/{results/, ratings-template.csv, unblind-key.csv}` |
| **§7.10 Robustness** (topK + model-swap + adversarial, on the expanded corpus) | `dotnet run --project LIBRAIN.Experiments -- robustness` (Haiku leg: `--model-label haiku-4.5` after restarting the API with `Models__SynthesisModel` set) | `experiments/robustness/{results.csv, *.json}` |
| **Cross-run consistency study** (Phase 2.5, N=5) | `scripts/cross-run-study.sh --runs 5` | stdout (per-axis mean ± std + classification verdict) |

### Prerequisites

- LIBRAIN dev server running locally: `dotnet run --project LIBRAIN`
- Anthropic + OpenAI + Qdrant Cloud keys configured via `dotnet user-secrets` (see [Quick Start](#quick-start)).
- The **pre-registered 13-paper Phase B corpus** ingested into the Qdrant collection (Phase 1 seed + Phase 2.5 expansion). This is distinct from the 24-paper live corpus used for the §7.10 robustness sweep; the committed paper numbers below are tied to the original 13-paper set.

### Full reproduction sequence + cost estimate (~$1.24)

```bash
# 1. Discovery on all 10 pre-registered pairs → Table 5 + reused as LIBRAIN baseline column.
dotnet run --project LIBRAIN.Experiments -- phase-b              # ~$0.30 · ~15 min

# 2. Naive-RAG + Single-LLM on the same 10 pairs → Table 7 + 8.
dotnet run --project LIBRAIN.Experiments -- baseline             # ~$0.45 · ~20 min

# 3. Crunch everything that's currently on disk → Table 5/7/8/9 + Spearman ρ.
dotnet run --project LIBRAIN.Experiments -- analyze              # offline · seconds

# 4. Stage the 5 human-eval pairs + new Latin-square unblind key for rater re-scoring.
dotnet run --project LIBRAIN.Experiments -- hallucination-pilot  # offline · seconds
#    Rater fills experiments/hallucination-pilot/ratings-template.csv,
#    then re-runs `analyze` to compute the after-fix table.

# 5. (Optional) Phase 2.5 consistency study, 5 runs × 2 locked pairs.
scripts/cross-run-study.sh --runs 5                              # ~$0.40 · ~5 min
```

Anthropic prompt caching (auto-enabled across all agents) means the second pair onward in each run reuses ~80% of the system + tool prefix tokens, so the dollar figures above are upper bounds rather than typical.

The human-eval rater 1 CSV and unblind key are already committed (`experiments/human-eval-pilot/`), so step 3 reproduces the companion paper's per-system descriptives (`LIBRAIN 4.00/3.40/3-of-5, Naive-RAG 2.40/4.80/0, Single-LLM 2.40/4.60/0`) without any API calls.

---

## Project Structure

```
librain/
├── LIBRAIN/                     # ASP.NET Core Web API
│   ├── Agents/                  # Reader, Synthesis, Evaluator, Discovery,
│   │                            # DiscoveryEvaluator, NoveltyScorer,
│   │                            # ClaimValidator, NaiveRag, SingleLlm,
│   │                            # ModelSelection (config-driven synthesis model)
│   ├── Endpoints/               # /api/papers, /api/query, /api/discover,
│   │                            # /api/naive-rag, /api/single-llm
│   ├── Embeddings/              # OpenAI client wrapper
│   ├── Storage/                 # Qdrant repository
│   ├── Models/                  # DTOs, domain types
│   ├── Reading/                 # PDF extraction + chunking
│   └── Program.cs
├── LIBRAIN.Tests/               # 62 xUnit unit tests
├── LIBRAIN.Experiments/         # .NET CLI: phase-b, baseline, robustness,
│                                # hallucination-pilot, analyze,
│                                # generate-unblind-key
├── experiments/                 # Pre-registered topic pairs + raw run outputs
│   ├── topic-pairs.json
│   ├── phase-b/results/
│   ├── baseline-comparison/results/{librain,naive-rag,single-llm}/
│   ├── human-eval-pilot/        # rater 1 data, rubric, unblind key
│   ├── hallucination-pilot/     # Phase 3.A.5 RQ4 re-scoring artifacts
│   └── robustness/              # §7.10 topK/model-swap/adversarial sweep outputs
├── scripts/
│   └── cross-run-study.sh       # Phase 2.5 N=5 consistency study
├── docs/
│   └── architecture.pdf         # Companion paper
├── data/papers/                 # Local PDFs for ingestion (gitignored)
├── PROJECT_PLAN.md              # Single source of truth for scope
└── README.md
```

---

## Author

**Eren Mutlu**, Full-Stack Developer (.NET, Node.js, Microservices)
- Website: [erenmutlu.me](https://erenmutlu.me)
- LinkedIn: [linkedin.com/in/erennmutlu](https://linkedin.com/in/erennmutlu)
- Email: erennmutlu@outlook.com

---

## License

MIT, see [`LICENSE`](LICENSE).

---

*This is a portfolio project. Issues and discussions welcome; PRs accepted for clearly-scoped improvements.*
