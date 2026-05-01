# LIBRAIN

> **A multi-agent RAG system that reads scientific papers and proposes new hypotheses — built in .NET 10.**

![.NET](https://img.shields.io/badge/.NET-10.0-512BD4?logo=dotnet)
![Anthropic](https://img.shields.io/badge/Anthropic-Claude-D97757)
![Azure](https://img.shields.io/badge/Azure-Cosmos%20DB-0078D4?logo=microsoftazure)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-in%20development-yellow)

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
                   │  Azure Cosmos DB  +  Application Insights│
                   │  (vector store)      (audit trail)       │
                   └─────────────────────────────────────────┘
```

1. **Reader Agent** — Extracts text from arXiv PDFs, chunks it semantically, embeds chunks via OpenAI `text-embedding-3-small`, persists to Cosmos DB with metadata.
2. **Synthesis Agent** — On a user query, retrieves top-K chunks via vector search, prompts Anthropic Claude to generate citation-grounded hypotheses connecting concepts across papers.
3. **Evaluator Agent** — Uses LLM-as-a-Judge with a fixed rubric (plausibility, novelty, clarity) to score and filter hypotheses, reducing hallucinations.
4. **Audit Trail** — Every step (retrieval, generation, evaluation) is logged to Application Insights with a correlation ID, enabling full reproducibility of any output.

---

## Why This Project

Most RAG and agent tutorials are written in Python. LIBRAIN explores what production-grade agent architectures look like in **.NET 10** using Microsoft Semantic Kernel patterns and Azure-native services. It's a deliberate counter-example to the "AI = Python only" assumption.

The companion technical paper (`docs/architecture.pdf`) describes the original four-agent design and the simplifications made for the MVP. A revised preprint with implementation results will be posted to arXiv when the MVP is complete.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | .NET 10, ASP.NET Core Minimal APIs |
| API docs | Scalar.AspNetCore on top of `Microsoft.AspNetCore.OpenApi` |
| LLM (reasoning) | Anthropic Claude (Sonnet for synthesis, Haiku for evaluation) |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) |
| Vector store | Azure Cosmos DB for NoSQL, DiskANN vector index |
| Orchestration | Microsoft Semantic Kernel patterns |
| PDF parsing | PdfPig |
| Observability | Application Insights, structured logging |
| Hosting | Azure Container Apps (API), Azure Static Web Apps (frontend) |

---

## Quick Start

> Setup instructions are filled in as the project progresses. Currently in Phase 1.

```bash
# Clone
git clone https://github.com/erennmutlu1/librain.git
cd librain

# Configure secrets (one-time)
dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-..."
dotnet user-secrets set "OpenAI:ApiKey" "sk-..."
dotnet user-secrets set "Cosmos:Endpoint" "https://....documents.azure.com:443/"
dotnet user-secrets set "Cosmos:Key" "..."

# Run
dotnet run --project LIBRAIN
```

Full setup guide: see [`docs/SETUP.md`](docs/SETUP.md) *(coming soon)*

---

## Roadmap

- [x] Project plan & architecture (May 2026)
- [ ] **Phase 1**: Reader Agent + ingestion pipeline (May 2026)
- [ ] **Phase 2**: Synthesis & Evaluator agents (June 2026)
- [ ] **Phase 3**: Frontend, deployment, demo, paper update (July 2026)

See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) for detailed scope.

---

## Performance (filled as MVP completes)

- Papers ingested: *TBD*
- Total chunks: *TBD*
- Retrieval latency (p95): *TBD*
- End-to-end query latency (p95): *TBD*
- Hallucination rate (pre-evaluator → post-evaluator): *TBD*

---

## Project Structure

```
librain/
├── LIBRAIN/                # ASP.NET Core Web API
│   ├── Agents/             # Reader, Synthesis, Evaluator
│   ├── Embeddings/         # OpenAI client wrapper
│   ├── Storage/            # Cosmos repository
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
