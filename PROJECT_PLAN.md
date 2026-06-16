# LIBRAIN: Project Plan

> **Multi-Agent RAG System for Scientific Discovery**
> Built in .NET 10 with Anthropic Claude, OpenAI Embeddings, and Qdrant Cloud (Frankfurt).

This document is the single source of truth for the LIBRAIN MVP. It defines scope, architecture, technical decisions, and execution phases. Cursor agents and the developer should read this before making any structural decisions.

---

## 1. Vision

LIBRAIN is a multi-agent system that ingests scientific papers from arXiv, builds a semantically-searchable knowledge base, and generates citation-grounded research hypotheses with self-evaluation. The MVP demonstrates production-grade RAG patterns implemented in .NET, a deliberately under-served area in the AI ecosystem dominated by Python.

**This is a portfolio project optimized for:**
1. Demonstrating senior-level .NET + AI engineering to international recruiters
2. Aligning with Microsoft AI-200 (Azure AI Cloud Developer) certification syllabus
3. Producing a companion preprint that reinforces research/engineering signal

**This is NOT:**
- A research platform competing with Elicit, Consensus, or Scite
- A general-purpose chatbot
- A scalability showcase (it runs on serverless, single-region, single-tenant)

---

## 2. Locked Tech Stack

These choices are **final**. Do not propose alternatives during implementation.

| Layer | Choice | Reason |
|---|---|---|
| Runtime | **.NET 10** | Newest LTS-track, native AOT possible, modern minimal APIs |
| Web framework | **ASP.NET Core Minimal APIs** | Less ceremony, easier for portfolio readability |
| API docs UI | **Scalar.AspNetCore** on top of `Microsoft.AspNetCore.OpenApi` | Native fit with .NET 10's built-in OpenAPI support; modern alternative to Swashbuckle; polished UI for the portfolio demo |
| LLM (reasoning) | **Anthropic Claude** via `Anthropic.SDK` NuGet | Developer already familiar; high-quality reasoning; cheap with Haiku |
| LLM (embeddings) | **OpenAI `text-embedding-3-small`** via official SDK | Anthropic doesn't ship embeddings; this model is industry-standard, cheap |
| Orchestration patterns | **Microsoft Semantic Kernel** | Microsoft-blessed agent abstractions, AI-200 syllabus alignment |
| Vector store (dev) | **Qdrant** via local Docker | Zero-cost MVP iteration; works on Apple Silicon; no Azure subscription required |
| Vector store (production hosting) | **Qdrant Cloud free tier** (AWS Frankfurt; 0.5 vCPU, 1 GB RAM, 4 GB disk) | Same vector engine as local development; 218-chunk corpus well within the 250K-vector free-tier ceiling; auto-selected via `Qdrant:ApiKey` presence in user-secrets. Azure Cosmos DB target was retired post-Phase 2.5 after the local-vs-cloud parity removed the only reason to migrate. |
| PDF parsing | **PdfPig** | Pure managed, no native deps, works on Apple Silicon. NuGet ID is now `PdfPig` (formerly `UglyToad.PdfPig`; same library, same maintainers, same repo: github.com/UglyToad/PdfPig) |
| Observability | **Application Insights** + structured logging | Azure native, zero-config, AI-200 aligned |
| Secrets (dev) | **`dotnet user-secrets`** | No secrets in repo, no extra service |
| Hosting (later) | **Azure Container Apps** | Serverless containers, scale-to-zero, low cost |

### What we are NOT using (and why)
- **Pinecone, Weaviate**: managed vector DB services. Qdrant Cloud was originally evaluated alongside these; it became the production hosting after Phase 2.5 due to local-cloud parity (same engine, same schema, zero migration). Pinecone and Weaviate remain rejected: no parity advantage over the existing Qdrant deployment.
- **LangChain, LlamaIndex**: Python-centric, weakens the .NET-first narrative.
- **Entity Framework**: overkill for a vector-document store.
- **MediatR, AutoMapper, FluentValidation**: premature abstraction for a 3-month MVP.
- **Cosmos emulator on macOS ARM**: unstable. The original "no Docker for local dev" rule was Cosmos-emulator-specific; Qdrant's ARM image is stable and is the dev vector store.
- **Azure Cosmos DB** (production target): retired post-Phase 2.5. The original macOS-emulator pivot moved development off Cosmos; the Qdrant Cloud free tier then closed the cost gap in production, leaving no remaining reason to migrate back.
- **gRPC, GraphQL** (for the public HTTP API): REST + JSON is sufficient and recruiter-readable. Internally, the Qdrant client uses gRPC; that's an implementation detail.

---

## 3. Architecture

### 3.1 Agents (simplified from paper's 4-agent design)

The original paper describes Reader, Hypothesis, Evaluator, Archivist agents. The MVP collapses this to three logical components plus a cross-cutting logger:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Reader Agent   │ ──► │ Synthesis Agent │ ──► │ Evaluator Agent │
│                 │     │                 │     │                 │
│ Ingest → Chunk  │     │ Retrieve →      │     │ LLM-as-a-Judge  │
│ → Embed → Store │     │ Generate        │     │ Score & Filter  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Audit Logger        │
                    │ (App Insights +       │
                    │  structured events)   │
                    └───────────────────────┘
```

The "Archivist" from the paper becomes a **cross-cutting concern** (Application Insights + custom event logging), not a separate agent. This is a deliberate simplification.

`AddApplicationInsightsTelemetry()` registration is **config-gated** in `Program.cs` on `ApplicationInsights:ConnectionString` being non-empty. The 3.x SDK is built on Azure Monitor / OpenTelemetry and throws `InvalidOperationException` at host start when the connection string is missing; the legacy 2.x silent-no-op is gone. The gate lives at the composition root only; agent and service registrations stay unconditional.

**Vector store dev → production parity.** The vector store is Qdrant in both modes: a local Docker container during development and the Qdrant Cloud free tier (AWS Frankfurt) for production hosting. Both modes hold the same logical data (chunk content + 1536-dim embedding + metadata) and use the same UUIDv5 chunk IDs and cosine distance metric. The single repository class auto-selects between the two based on the presence of `Qdrant:ApiKey` in user-secrets; promotion from dev to production is a configuration change, not a migration. Schema specifics in Section 4.2.

### 3.2 Data Flow

1. **Ingest**: User drops a PDF in `data/papers/` OR provides an arXiv ID
2. **Read**: Reader Agent extracts text, chunks it, embeds chunks, persists to the vector store
3. **Query**: User submits a research question via API
4. **Retrieve**: Synthesis Agent vector-searches Qdrant, gets top-K chunks
5. **Generate**: Synthesis Agent prompts Claude with retrieved context, gets candidate hypotheses
6. **Evaluate**: Evaluator Agent scores each hypothesis on plausibility, novelty, clarity
7. **Return**: Final response includes hypotheses + scores + citation chunks + audit trail ID
8. **Log**: Every step emits a structured event to Application Insights

### 3.3 API Surface (v1)

```
POST /api/papers/ingest
  Body: { "arxivId": "2503.08979" } OR multipart PDF upload
  Returns: { "paperId": "...", "chunkCount": N, "status": "ingested" }

POST /api/query
  Body: { "question": "...", "topK": 5, "hypothesisCount": 3 }
  Returns: { 
    "queryId": "...",
    "hypotheses": [
      { "text": "...", "scores": {...}, "citations": [...] }
    ],
    "auditTrailId": "..."
  }

GET /api/papers
  Returns: list of ingested papers with metadata

GET /api/audit/{auditTrailId}
  Returns: full reasoning chain for one query
```

No authentication for MVP. Add it only if hosted publicly.

### 3.4 Discovery Mode (Phase 2.5 extension)

The Phase 2 pipeline (`POST /api/query` → Synthesis → Evaluator) answers questions from retrieved evidence. By design it is grounded and conservative: `SynthesisAgent`'s system prompt forbids any claim not directly supported by a cited source. That is correct behavior for citation-grounded QA, but it cannot demonstrate the *discovery* claim the companion paper makes for LIBRAIN: a grounded synthesis can never propose a connection not already in the corpus.

Discovery Mode is a **separate** endpoint with the opposite job:

- Input: one topic (single-topic extrapolation) or two topics (cross-context bridge), plus a `noveltyTarget` knob.
- Action: retrieve top-K chunks per topic, then prompt Claude with a prompt that *explicitly invites extrapolation*, with no "stay grounded" guardrail.
- Output: a hypothesis, the chunks that ground its supported parts, and a flagged `novelClaim` field containing the part NOT supported by any retrieved chunk. **The unsupported portion is the discovery, not a hallucination; flagging it explicitly is the contract.**

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│ Retrieval    │ ──► │ DiscoveryAgent   │ ──► │ Discovery Evaluator  │
│ (per topic,  │     │ (Sonnet 4.6,     │     │ (Haiku 4.5 +         │
│  topK each)  │     │  extrapolation)  │     │  NoveltyScorer)      │
└──────────────┘     └──────────────────┘     └──────────────────────┘
```

Discovery Mode runs in parallel with the existing synthesis pipeline, **not as a replacement**. `SynthesisAgent` is not refactored. Premature DRY between the two is rejected: similar shape, different intent (see Section 6).

Citation validation applies the same guardrail as `SynthesisAgent` (every chunk index in `supportingEvidence` must exist in the retrieved set) but is applied **only** to the supported portion. `novelClaim` is exempt by design.

The new `POST /api/discover` request and response shapes are documented under Section 4.6.

**Empirical update (2026-05-07, Step 2c):** the `noveltyTarget` knob was empirically dropped after the Step 2b₁ validation protocol failed (|Δmean| 0.0184 vs 2σ 0.0668; gate threshold requires Δmean > 2σ). The protocol additionally observed an inverted direction: higher `noveltyTarget` produced *lower* cosine-distance novelty, because high-target prompts elicited domain-vocabulary-rich hypotheses that landed nearer the corpus center. Full numbers are documented in the companion paper (`docs/architecture.pdf` Section 6.5).

---

## 4. Critical Technical Decisions (LOCKED)

### 4.1 Chunking Strategy

- **Chunk size**: 512 tokens (~2000 chars) target, 1024 max
- **Overlap**: 15% (~75 tokens) to preserve context across boundaries
- **Boundary preference**: paragraph > sentence > hard cut
- **Metadata per chunk**: `paperId`, `arxivId`, `title`, `authors[]`, `year`, `section` (best-effort), `chunkIndex`, `pageNumber`

Use a recursive splitter: try paragraph splits first, fall back to sentence splits if a paragraph exceeds 1024 tokens, fall back to hard cuts only as last resort.

### 4.2 Vector Store Schema

#### Dev: Qdrant (current)

Collection: `librain_chunks`
Vector size: **1536** (from `text-embedding-3-small`)
Distance: **Cosine**

Per-chunk point:
```json
{
  "id": "<UUID v5 derived from (namespace, '{paperId}-{chunkIndex}')>",
  "vector": [0.012, -0.045, /* ... 1536 floats ... */],
  "payload": {
    "paperId": "2503.08979",
    "chunkIndex": 0,
    "content": "...",
    "title": "...",
    "authors": ["..."],
    "year": 2025,
    "section": "Introduction",
    "pageNumber": 1,
    "ingestedAt": "2026-05-05T..."
  }
}
```

Deterministic UUID v5 IDs mean re-ingesting the same paper upserts cleanly (no duplicates). Paper listing is implemented by `Scroll` over the chunks collection and in-memory dedupe by `payload.paperId`. Sub-second at MVP scale (~30 papers, ~1500 points). Revisit if listing latency exceeds 500ms.

#### Production hosting: Qdrant Cloud (current)

Production runs on Qdrant Cloud free tier (AWS Frankfurt; 0.5 vCPU, 1 GB RAM, 4 GB disk). Same vector engine, same dimension (1536), same distance metric (cosine), same UUIDv5 chunk IDs, same single-repository-class abstraction as local development. The 218-chunk Phase 2 corpus uses well under 1% of the free-tier 250K-vector ceiling. The .NET configuration auto-selects between local and cloud based on the presence of `Qdrant:ApiKey` in user-secrets; promotion from dev to production is a one-line change, not a migration.

### 4.3 Prompt Design

**Synthesis prompt** (system message, locked structure):
```
You are a scientific reasoning assistant. Given retrieved excerpts from research papers, 
generate {N} novel hypotheses that:
1. Are grounded in the provided excerpts (cite specific chunk IDs)
2. Connect ideas across multiple papers when possible
3. Are testable, falsifiable scientific statements (not platitudes)

Output strict JSON: { "hypotheses": [{ "text": "...", "citations": ["chunk-id-1", ...] }] }

Do not invent citations. Do not reference excerpts not provided. If excerpts are 
insufficient, return fewer hypotheses with explanation in a "note" field.
```

**Evaluation prompt** (LLM-as-a-Judge):
```
You are an impartial scientific reviewer. Score this hypothesis on three axes (1-5):

- Plausibility: 1 = contradicts established science, 5 = fully supported by citations
- Novelty: 1 = direct restatement of source, 5 = connects previously unrelated ideas  
- Clarity: 1 = vague/ungrammatical, 5 = precise testable statement

Hypothesis: "{hypothesis}"
Cited excerpts: {excerpts}

Output strict JSON: { "plausibility": N, "novelty": N, "clarity": N, "reasoning": "..." }
```

Both prompts use **temperature 0.2 for synthesis, 0.0 for evaluation** (the shipped values; an earlier draft of this plan said 0.3 / 0.1). Lock these in code, do not parametrize until MVP works.

### 4.4 Citation Tracking

- Every chunk has a deterministic `id` (`chunk-{paperId}-{chunkIndex}`)
- Synthesis Agent receives chunks with their IDs in the prompt context
- LLM is instructed to cite chunk IDs in output JSON
- Backend validates citations: every cited ID must exist in retrieved set
- Invalid citations → reject hypothesis, log violation, regenerate (max 1 retry)

### 4.5 Hallucination Mitigation

Three layers:
1. **Retrieval grounding**: synthesis prompt includes only retrieved chunks, never web search
2. **Citation validation**: post-hoc check that all cited IDs are real
3. **Evaluator filter**: hypotheses scoring <3 on plausibility are dropped from final response

Track baseline hallucination rate (manual review of first 50 hypotheses) and rate after evaluator filter. This gives the CV bullet "reduced hallucination rate from X% to Y%".

### 4.6 Discovery Prompt & Rubric (Phase 2.5)

**Discovery synthesis prompt** (system message; tool-use, `submit_discovery`):

The Discovery prompt mirrors `SynthesisAgent`'s tool-use shape but inverts its guardrail. It explicitly invites extrapolation: given retrieved excerpts on one or two topics, propose a connection or hypothesis that **need not** be directly stated in any cited chunk. The model returns:

- `hypothesis`: the full claim, including the novel part.
- `supporting_evidence[]`: chunk references whose `support_type` is `"direct"` (chunk states this part) or `"analogous"` (chunk supports an analogous mechanism).
- `novel_claim`: the substring of the hypothesis NOT supported by any retrieved chunk. This is the discovery.
- `reasoning`: the chain that connects supporting evidence to the novel claim.

Permissiveness was originally tuned by a `noveltyTarget` request knob, dropped in Step 2c after empirical validation failed. The prompt now invites extrapolation unconditionally; novelty is measured (not steered) post-hoc by `NoveltyScorer`. Model: **Claude Sonnet 4.6**, temperature **0.2** (matches existing `SynthesisAgent`).

**Discovery evaluation rubric** (LLM-as-a-Judge, separate from Phase 2 Evaluator):

| Axis | Source | Description |
|---|---|---|
| Novelty | **Deterministic** (`NoveltyScorer`) | `1 - cosine_similarity(embedding(novelClaim), nearest_existing_chunk_embedding)`. Pure math, no LLM. |
| Plausibility | LLM (Haiku 4.5, temp 0.0) | Does `novelClaim` follow logically from `supportingEvidence`, even if not stated directly? |
| StructuralCoherence | LLM (Haiku 4.5, temp 0.0) | Is the hypothesis a well-formed, testable scientific statement? |
| QualityScore | **Deterministic** (C# arithmetic mean of the three) | Computed in C#, NOT delegated to the LLM. Same halo-effect mitigation as the existing `EvaluationScoring.Aggregate`. |

The LLM-judged axes (plausibility, structural coherence) live in the same Discovery Evaluator call (Haiku 4.5, temp 0.0, forced tool use). Novelty is computed deterministically from embeddings before the LLM sees the hypothesis. The mean is computed in C#. This mirrors Section 4.3's existing halo-resistance pattern.

`POST /api/discover` request shape:

```json
{
  "topicA": "...",
  "topicB": "...",
  "topK": 5
}
```

Response shape:

```json
{
  "correlationId": "...",
  "hypothesis": "...",
  "supportingEvidence": [
    { "paperId": "...", "chunkIndex": 0, "section": "...", "pageNumber": 1, "supportType": "direct" }
  ],
  "novelClaim": "...",
  "reasoning": "...",
  "evaluation": {
    "noveltyScore": 0.0,
    "plausibilityScore": 0.0,
    "structuralCoherenceScore": 0.0,
    "qualityScore": 0.0
  }
}
```

---

## 5. Phases

### Phase 1: Reader Agent (Weeks 1-4, May)

**Goal**: Functional ingestion pipeline. Drop a PDF, get vectorized chunks in Qdrant.

Deliverables:
- [ ] Solution scaffold (1 Web API project, no premature splitting)
- [ ] PDF parsing service (PdfPig)
- [ ] Recursive text chunker with overlap
- [ ] OpenAI embeddings client wrapper
- [ ] Qdrant client + repository
- [ ] `POST /api/papers/ingest` endpoint (PDF upload + arXiv ID flow)
- [ ] `GET /api/papers` endpoint
- [ ] Application Insights wired
- [ ] 30 papers manually downloaded from arXiv (LLM agents / RAG / agentic AI domain), ingested

Success criteria:
- A vector search query returns semantically relevant chunks (manual eyeball)
- Qdrant shows ~500-1500 chunks across 30 papers
- Application Insights shows ingestion events with timing data

### Phase 2: Synthesis & Evaluation (Weeks 5-8, June)

**Goal**: Full query flow with self-evaluation.

Deliverables:
- [ ] Anthropic Claude client wrapper (Haiku for cost, Sonnet for quality)
- [ ] Synthesis Agent: retrieve → prompt → parse → validate citations
- [ ] Evaluator Agent: LLM-as-a-Judge with structured rubric
- [ ] `POST /api/query` endpoint with full pipeline
- [ ] Citation validation logic
- [ ] Hypothesis filtering by score
- [ ] Audit trail logging (correlation ID across all steps)
- [ ] `GET /api/audit/{id}` endpoint
- [ ] Manual evaluation: 50 sample hypotheses, label hallucination rate before/after evaluator

Success criteria:
- 70%+ of generated hypotheses pass citation validation on first try
- Evaluator drops at least 20% of hypotheses on plausibility/clarity
- Sub-second p50 latency for retrieval, sub-5-second p50 for full query

### Phase 2.5: Discovery Mode (extension; non-blocking for MVP)

**Goal**: A separate `/api/discover` endpoint that proposes hypotheses extrapolating beyond the corpus, with novel claims explicitly flagged.

**Status**: Scope extension added 2026-05-07. Does NOT block Section 7 Definition of Done.

Deliverables:
- [ ] `DiscoveryAgent` (parallel to `SynthesisAgent`, no shared base class)
- [ ] `NoveltyScorer` (deterministic; cosine similarity vs. nearest existing chunk embedding)
- [ ] Discovery Evaluator (Haiku 4.5, plausibility + structural coherence; novelty from `NoveltyScorer`; quality mean in C#)
- [ ] `POST /api/discover` endpoint (single-topic extrapolation OR cross-context bridge)
- [ ] DTOs: `DiscoverRequest`, `DiscoverResponse`, `SupportingEvidence`, `DiscoveryEvaluation`
- [ ] Citation validation on `supportingEvidence` (novelClaim exempt)
- [ ] Audit-trail logging via correlationId on every retrieve / synthesize / score step
- [ ] Unit tests for `NoveltyScorer` math (same category as chunker / citation validator / scoring per Section 6.4)
- [ ] Smoke artifact documenting end-to-end run (results captured in companion paper Section 5.4)

Success criteria:
- A live `/api/discover` call against the existing 218-chunk Qdrant Cloud cluster returns a hypothesis with non-empty `novelClaim`, `supportingEvidence` chunk IDs validated against the retrieved set, and a `qualityScore` in [0, 1].
- For an in-corpus topic vs. an off-corpus topic pair, `noveltyScore` for the off-corpus run is materially higher than for the in-corpus run (sanity check that the novelty signal is real).
- Response shape matches the spec in Section 3.4 / Section 4.6.

### Phase 3: Polish & Showcase (Weeks 9-12, July)

**Goal**: Public-ready, recruiter-readable, paper updated.

Deliverables:
- [ ] Minimal Next.js frontend (single page: query input + results display + citations)
- [ ] Frontend deployed to Azure Static Web Apps
- [ ] API deployed to Azure Container Apps
- [ ] README polished with architecture diagram, demo GIF, performance numbers
- [ ] Loom demo video (3-5 min walkthrough)
- [ ] Blog post on personal site or Medium: *"Building a Multi-Agent RAG System in .NET 10"*
- [ ] Companion paper updated with implementation results, posted to arXiv as preprint
- [ ] AI-200 certification exam scheduled and taken
- [ ] CV updated with final bullets and live links

Success criteria:
- A recruiter can read the README in 60 seconds and understand the project
- Demo video shows end-to-end query flow with real output
- arXiv preprint live with link in CV

---

## 6. Cursor Constraints

When using Cursor agent mode (Cmd+I) or chat (Cmd+L), enforce these rules:

1. **Single project**: One ASP.NET Core Web API project. No Core/Data/Tests splitting until project exceeds 5000 LOC.
2. **Stack is locked**: Do not propose alternative libraries. If Cursor suggests one, reject.
3. **No premature abstraction**: Don't write interfaces unless 2+ implementations exist. Don't write generic repositories. Don't add MediatR.
4. **Tests only where they matter**: Write unit tests only for the chunker, citation validator, and evaluator scoring logic. No tests for endpoints, DTOs, or simple repositories.
5. **Commits are atomic**: One logical change per commit. No "huge initial commit" with 30 files.
6. **Logging is mandatory**: Every agent operation must emit a structured event with correlation ID. No silent failures.
7. **Configuration via `appsettings.json` + user-secrets only**: No env vars during dev, no Key Vault yet.
8. **Code style**: nullable enabled, file-scoped namespaces, primary constructors where natural, `record` for DTOs, `ILogger<T>` always injected.
9. **No comments unless essential**: Self-documenting names > comments. Comment only for non-obvious decisions ("// 0.3 temp chosen empirically, see PROJECT_PLAN.md Section 4.3").
10. **Ask before changing scope**: If the user asks for something outside this plan, Cursor must surface the conflict before implementing.

---

## 7. Definition of Done (MVP)

The MVP is **done** when all of these are true:

- [ ] 30+ papers ingested in Qdrant Cloud
- [ ] `POST /api/query` returns ≥3 hypotheses with valid citations within 5 seconds (p95)
- [ ] Evaluator demonstrably filters out plausibility-failing hypotheses (logged metrics)
- [ ] Application Insights shows full audit trail for any query
- [ ] Frontend deployed and reachable on a public URL
- [ ] README has: architecture diagram, demo GIF, tech stack, performance numbers, paper link
- [ ] Blog post published
- [ ] Repository is clean: no commented-out code, no `TODO`s, README is current
- [ ] CV updated with real numbers (chunk count, latency, hallucination delta)

If any of these is missing, the project is not done, regardless of how much code exists.

### 7.1 Discovery extension (Phase 2.5): non-blocking

The MVP DoD checklist above is **the** definition of done. Discovery Mode is a Phase 2.5 scope extension and does NOT block any item above. The Discovery extension has its own acceptance criteria, tracked separately so it cannot quietly slip into the MVP gate:

- [ ] `POST /api/discover` returns a hypothesis + flagged `novelClaim` + per-axis evaluation against the live cluster
- [ ] `NoveltyScorer` unit tests green (deterministic cosine math)
- [ ] Smoke artifact shows in-corpus vs. off-corpus novelty differential (captured in companion paper Section 5.4)
- [ ] README mentions Discovery Mode under "What It Does" and the roadmap

If Phase 3 deadlines pressure the schedule, Discovery extension is the first thing cut. The MVP ships without it.

---

## 8. What Comes After MVP (Out of Scope for July)

These are explicitly **deferred**, listed only to prevent scope creep:

- Multi-tenancy / user accounts
- Streaming responses (SSE)
- Cross-domain corpus (biology + CS)
- Fine-tuned embeddings
- Re-ranking with a separate model
- Agentic browsing (Reader Agent doesn't crawl arXiv autonomously yet)
- Caching layer (Redis)
- Rate limiting
- Auth (OAuth/JWT)
- CI/CD beyond GitHub Actions for build verification

If recruiters ask "what would you do next", these are the answers.

---

## 9. References

- Companion paper: `docs/architecture.pdf` (in repo)
- Microsoft Semantic Kernel docs: https://learn.microsoft.com/semantic-kernel
- Anthropic API reference: https://docs.claude.com/en/api
- Qdrant Cloud documentation: https://qdrant.tech/documentation/cloud/
- AI-200 study guide: https://learn.microsoft.com/credentials/certifications/ai-200

---

*Last updated: May 7, 2026. Version 1.1 (Discovery Mode Phase 2.5 extension added).*
