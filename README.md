# LIBRAIN

> **A multi-agent RAG system that reads scientific papers and proposes new hypotheses — built in .NET 10.**

![.NET](https://img.shields.io/badge/.NET-10.0-512BD4)
![Anthropic](https://img.shields.io/badge/Anthropic-Claude-D97757)
![Qdrant](https://img.shields.io/badge/Vector%20Store-Qdrant-DC382D)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-Phase%202.5%20shipped-brightgreen)

LIBRAIN ingests open-access scientific papers from arXiv, builds a semantically-searchable knowledge base using vector embeddings, and uses a multi-agent reasoning pipeline to generate citation-grounded research hypotheses. Every output is auditable: from the retrieved excerpts to the LLM-as-a-Judge evaluation scores.

---

## What It Does

```
   ┌──────────┐    ┌──────────┐    ┌────────────┐    ┌────────────┐
   │ arXiv    │───►│ Reader   │───►│ Synthesis  │───►│ Evaluator  │
   │ papers   │    │ Agent    │    │ Agent      │    │ Agent      │
   └──────────┘    └──────────┘    └────────────┘    └────────────┘
                        │                │                  │
                        ▼                ▼                  ▼
                   ┌─────────────────────────────────────────┐
                   │  Qdrant           +  Application Insights│
                   │  (vector store)      (audit trail)       │
                   └─────────────────────────────────────────┘
```

1. **Reader Agent** — Extracts text from arXiv PDFs, chunks it semantically, embeds chunks via OpenAI `text-embedding-3-small`, persists to Qdrant with metadata.
2. **Synthesis Agent** — On a user query, retrieves top-K chunks via vector search, prompts Anthropic Claude to generate citation-grounded hypotheses connecting concepts across papers.
3. **Evaluator Agent** — Uses LLM-as-a-Judge with a fixed rubric (plausibility, novelty, clarity) to score and filter hypotheses, reducing hallucinations.
4. **Discovery Mode** (Phase 2.5) — A separate `POST /api/discover` endpoint takes one or two topics, retrieves evidence per topic, and asks Claude to propose a hypothesis that goes BEYOND the cited sources — the unsupported portion is flagged as `novelClaim` (the discovery, not a hallucination). Scored on a multi-axis rubric: deterministic novelty (cosine distance to nearest existing chunk), LLM-judged plausibility, and structural coherence.
5. **Audit Trail** — Every step (retrieval, generation, evaluation) is logged to Application Insights with a correlation ID, enabling full reproducibility of any output.

> Discovery Mode runs as a parallel pipeline off the same retrieval layer; it does not replace the Synthesis → Evaluator path.

---

## Why This Project

Most RAG and agent tutorials are written in Python. LIBRAIN explores what production-grade agent architectures look like in **.NET 10** using Microsoft Semantic Kernel patterns and Anthropic's official .NET SDK. It's a deliberate counter-example to the "AI = Python only" assumption.

The companion technical paper (`docs/architecture.pdf`) describes the original four-agent design and the simplifications made for the MVP. A revised preprint with implementation results will be posted to arXiv when the MVP is complete.

---

## Engineering Challenges

### Cosmos DB cost → Qdrant

The original plan targeted Azure Cosmos DB for NoSQL with its DiskANN vector index for an Azure-native production story. Cost modeling killed it: provisioned throughput plus storage put even modest demo workloads at a price point unsuitable for an open portfolio project. We pivoted to Qdrant for both dev and production. The repository pattern in `LIBRAIN/Storage/` made the move a single-class replacement (`CosmosPaperRepository` → `QdrantPaperRepository`) with no agent-layer changes.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | .NET 10, ASP.NET Core Minimal APIs |
| API docs | Scalar.AspNetCore on top of `Microsoft.AspNetCore.OpenApi` |
| LLM (reasoning) | Anthropic Claude Sonnet 4.6 (synthesis), Haiku 4.5 (evaluation) via Anthropic.SDK 5.10 |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) |
| Vector store | Qdrant 1.17 (local Docker in dev; production hosting Phase 3) |
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

Real output from the Phase 2 smoke test (full capture in [`LIBRAIN/docs/phase2-step6-smoke.md`](LIBRAIN/docs/phase2-step6-smoke.md)):

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
- [x] **Phase 2.5**: Discovery Mode — `POST /api/discover` with novel-claim flagging + multi-axis evaluation (May 2026)
- [ ] **Phase 3**: Frontend, deployment, prompt caching, response streaming, AI-200 alignment

See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) for detailed scope.

---

## Performance (Phase 2 baseline)

- Papers ingested: 5 (218 chunks total)
- Retrieval latency (p95): < 200 ms (Qdrant local, top-5)
- End-to-end query latency (p95): ~13s synthesis path, ~16s discovery path (sequential synth + eval; Phase 3 will add streaming + prompt caching)
- Cost per query: ~$0.030 synthesis, ~$0.05 discovery (Sonnet synth + Haiku eval, dual-topic retrieval)
- Tests: 30/30 passing (chunker, citation validation, evaluation scoring, novelty scoring, discovery scoring)

---

## Project Structure

```
librain/
├── LIBRAIN/                # ASP.NET Core Web API
│   ├── Agents/             # Reader, Synthesis, Evaluator
│   ├── Embeddings/         # OpenAI client wrapper
│   ├── Storage/            # Qdrant repository
│   ├── Models/             # DTOs, domain types
│   └── Program.cs
├── docs/
│   ├── architecture.pdf    # Original research paper
│   └── SETUP.md
├── data/
│   └── papers/             # Local PDFs for ingestion (gitignored)
├── PROJECT_PLAN.md         # Single source of truth for scope
└── README.md
```

---

## Author

**Eren Mutlu** — Full-Stack Developer (.NET, Node.js, Microservices)
- Website: [erenmutlu.me](https://erenmutlu.me)
- LinkedIn: [linkedin.com/in/erennmutlu](https://linkedin.com/in/erennmutlu)
- Email: erennmutlu@outlook.com

---

## License

MIT — see [`LICENSE`](LICENSE).

---

*This is a portfolio project. Issues and discussions welcome; PRs accepted for clearly-scoped improvements.*
