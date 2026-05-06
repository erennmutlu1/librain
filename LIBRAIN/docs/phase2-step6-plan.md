# Phase 2 Step 6 — POST /api/query

## Context

Phase 2 Steps 4 & 5 shipped: SynthesisAgent (411b127, e5add10, 7956a71) and EvaluatorAgent (7f7c54e, d1268ae) with bridge `docs:` commits. Both agents are storage-agnostic — they consume `IReadOnlyList<SearchHit>` and emit structured records. No live API call has run yet.

Step 6 (this plan) is the **final Phase 2 step**: the orchestrator that wires `embed → vector search → synthesize → evaluate → return` behind `POST /api/query`. It's also the **first live Anthropic API call** in the project, so the smoke test is the real Phase 2 acceptance gate.

**Note on the user's reference to "existing PaperEndpoints.cs (Phase 1)"**: that file does not exist. All current endpoints live inline in [Program.cs:66-88](LIBRAIN/Program.cs#L66-L88). The `/api/query` endpoint is non-trivial enough (~60 lines with pipeline, validation, error mapping) that **inlining it in Program.cs would crowd out the bootstrap**. This plan proposes extracting to a `LIBRAIN/Endpoints/QueryEndpoints.cs` class — a one-time, scoped extraction for the new endpoint only. Existing paper endpoints stay inline in Program.cs. No retroactive refactor.

## Design

### 1. Endpoint file location

```
LIBRAIN/Endpoints/QueryEndpoints.cs
```

A `public static class QueryEndpoints` with:
- A single `MapQueryEndpoints(this IEndpointRouteBuilder app)` extension method
- DTOs co-located in the same file (small enough — ~25 lines for three records)

[Program.cs](LIBRAIN/Program.cs) gets one new line: `app.MapQueryEndpoints();` near line 89, after the existing inline endpoints. New `using LIBRAIN.Endpoints;` at the top.

### 2. DTOs

All co-located in `QueryEndpoints.cs`:

```csharp
public sealed record QueryRequest(
    string Query,
    int? TopK);   // nullable; defaults to 5 in handler

public sealed record EvaluationSummary(
    float QualityScore,
    float GroundednessScore,
    float RelevanceScore,
    float CompletenessScore,
    string Critique,
    IReadOnlyList<string> UnsupportedClaims,
    IReadOnlyList<string> MissingEvidence);

public sealed record QueryResponse(
    Guid CorrelationId,
    string Hypothesis,
    IReadOnlyList<SynthesisCitation> Citations,
    float? SynthesisConfidence,
    EvaluationSummary Evaluation);
```

**Why `EvaluationSummary` separate from `EvaluationResult`**:
- `EvaluationResult` carries its own `CorrelationId`, but the API response has ONE correlation id at the top level. Dropping the duplicate avoids confusion if they ever diverge.
- API DTO decoupled from internal agent record → can evolve independently (e.g., add `EvaluationResult.RawScores` later without leaking it to the API surface).

`SynthesisCitation` is reused directly from [LIBRAIN/Agents/SynthesisResult.cs](LIBRAIN/Agents/SynthesisResult.cs) — already a clean DTO shape with no internal-only fields. No duplicate "summary" record needed.

### 3. DI dependencies (already registered, all consumed via parameter injection)

| Service | Registration | Lifetime |
|---------|--------------|----------|
| [OpenAIEmbeddingClient](LIBRAIN/Embeddings/OpenAIEmbeddingClient.cs) | [Program.cs:48](LIBRAIN/Program.cs#L48) | Scoped |
| [QdrantPaperRepository](LIBRAIN/Storage/QdrantPaperRepository.cs) | [Program.cs:49](LIBRAIN/Program.cs#L49) | Scoped |
| [SynthesisAgent](LIBRAIN/Agents/SynthesisAgent.cs) | [Program.cs:53](LIBRAIN/Program.cs#L53) | Scoped |
| [EvaluatorAgent](LIBRAIN/Agents/EvaluatorAgent.cs) | [Program.cs:54](LIBRAIN/Program.cs#L54) | Scoped |
| `ILogger<QueryEndpoints>` | DI built-in | per-handler |

**No new DI registration needed.** Step 4 already registered `AnthropicChatClient` as singleton. Step 6 only consumes existing services.

### 4. Pipeline code (sketch — full code in commit-1 inline diff)

```csharp
public static class QueryEndpoints
{
    public static void MapQueryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/query", HandleAsync);
    }

    private static async Task<IResult> HandleAsync(
        QueryRequest req,
        OpenAIEmbeddingClient embeddings,
        QdrantPaperRepository repo,
        SynthesisAgent synth,
        EvaluatorAgent eval,
        ILogger<QueryEndpoints> logger,
        CancellationToken ct)
    {
        // 1. Validation (no Claude calls if these fire)
        if (string.IsNullOrWhiteSpace(req.Query))
            return Results.Problem(title: "Query is required",
                detail: "The 'query' field must be a non-empty string.",
                statusCode: StatusCodes.Status400BadRequest);

        var topK = req.TopK ?? 5;
        if (topK < 1 || topK > 20)
            return Results.Problem(title: "topK out of range",
                detail: "The 'topK' field must be between 1 and 20.",
                statusCode: StatusCodes.Status400BadRequest);

        // 2. Correlation id flows across all three agents
        var correlationId = Guid.NewGuid();
        using var scope = logger.BeginScope(new Dictionary<string, object>
        {
            ["correlationId"] = correlationId,
        });
        var sw = Stopwatch.StartNew();

        try
        {
            var queryEmbedding = await embeddings.GenerateAsync(new[] { req.Query }, ct);
            var hits = await repo.VectorSearchAsync(queryEmbedding[0], topK, ct);

            if (hits.Count == 0)
                return Results.Problem(title: "No relevant sources found",
                    detail: "Vector search returned no chunks for this query.",
                    statusCode: StatusCodes.Status404NotFound,
                    extensions: new Dictionary<string, object?> { ["correlationId"] = correlationId });

            var synthesis = await synth.SynthesizeAsync(req.Query, hits, correlationId, ct);
            var evaluation = await eval.EvaluateAsync(req.Query, synthesis.Hypothesis, hits, correlationId, ct);

            logger.LogInformation(
                "Query handled (hits={HitCount}, quality={QualityScore:F2}) in {ElapsedMs}ms",
                hits.Count, evaluation.QualityScore, sw.ElapsedMilliseconds);

            return Results.Ok(new QueryResponse(
                CorrelationId: correlationId,
                Hypothesis: synthesis.Hypothesis,
                Citations: synthesis.Citations,
                SynthesisConfidence: synthesis.Confidence,
                Evaluation: new EvaluationSummary(
                    QualityScore: evaluation.QualityScore,
                    GroundednessScore: evaluation.GroundednessScore,
                    RelevanceScore: evaluation.RelevanceScore,
                    CompletenessScore: evaluation.CompletenessScore,
                    Critique: evaluation.Critique,
                    UnsupportedClaims: evaluation.UnsupportedClaims,
                    MissingEvidence: evaluation.MissingEvidence)));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex,
                "Query pipeline failed (elapsed={ElapsedMs}ms)", sw.ElapsedMilliseconds);
            return Results.Problem(title: "Upstream API error",
                detail: $"The query pipeline failed: {ex.GetType().Name}",
                statusCode: StatusCodes.Status502BadGateway,
                extensions: new Dictionary<string, object?> { ["correlationId"] = correlationId });
        }
    }
}
```

### 5. Error handling table

| Case | Status | ProblemDetails title | Detail |
|------|--------|----------------------|--------|
| `query` empty or whitespace | **400** | "Query is required" | "The 'query' field must be a non-empty string." |
| `topK` out of `[1, 20]` | **400** | "topK out of range" | "The 'topK' field must be between 1 and 20." |
| Vector search returns 0 hits | **404** | "No relevant sources found" | "Vector search returned no chunks for this query." + correlationId |
| OpenAI embedding failure | **502** | "Upstream API error" | exception type + correlationId |
| Anthropic synthesis failure | **502** | "Upstream API error" | exception type + correlationId |
| Anthropic evaluation failure | **502** | "Upstream API error" | exception type + correlationId |
| `OperationCanceledException` (client disconnect) | (no response) | — | excluded from catch, propagates |
| Synthesis returns "Insufficient sources to form a hypothesis." | **200** | — | normal response with low confidence; Evaluator will score it. |
| Evaluator returns 0/0/0 (defensive sentinel) | **200** | — | normal response with quality=0; client decides what to do |

`ProblemDetails` `extensions` carries `correlationId` on every error response so the user can grep server logs for the same id.

### 6. Smoke test plan + capture format

**Setup (all already in place — verify first)**:
- Docker: `librain-qdrant` container running on 6334
- 5 arXiv papers ingested (218 chunks total)
- `dotnet user-secrets`: `OpenAI:ApiKey`, `Anthropic:ApiKey`, `Qdrant:Host=localhost`

**Smoke command**:
```bash
dotnet run --project LIBRAIN  # starts on https://localhost:7XXX (or http://localhost:5XXX)
```

In a second terminal:
```bash
curl -k -s -w "\n--- HTTP %{http_code} in %{time_total}s ---\n" \
  -X POST https://localhost:7XXX/api/query \
  -H "Content-Type: application/json" \
  -d '{"query":"How does retrieval-augmented generation mitigate hallucination?","topK":5}' \
  | tee /tmp/step6-smoke.json
```

**Acceptance criteria** (from session brief):
- HTTP 200 OK
- `citations[]` includes at least one chunk from `paperId="2005.11401"` (Lewis et al. RAG paper)
- `evaluation.qualityScore > 0.4`
- `evaluation.groundednessScore > 0.7`
- `evaluation.relevanceScore > 0.8`
- Total round-trip < 5s (`time_total` from curl)

**Capture format** (paste in conversation, NOT committed unless we want evidence):
```
HTTP 200 in 3.2s
correlationId: abc-…
hypothesis: "Retrieval-augmented generation mitigates hallucination by …"
citations: [
  { index: 1, paperId: "2005.11401", chunkIndex: 12, section: "Methods", pageNumber: 3 },
  ...
]
evaluation:
  qualityScore: 0.78
  groundedness: 0.85, relevance: 0.92, completeness: 0.58
  critique: "…"
```

If the smoke result is interesting (e.g. unexpectedly high/low scores, or a surprising critique), we may capture as `LIBRAIN/docs/phase2-step6-smoke.md` in a follow-up commit. Not part of the implementation commit plan.

### 7. What to log + cost telemetry

Each agent already logs `input/output tokens` per call. The orchestrator adds **one summary line** at the end:

```
Query handled (hits=5, quality=0.78) in 3214ms
```

Per-call cost calculator (manual, not coded):
- 1 embedding call: ~50 tokens × $0.02/1M = ~$0.000001
- 1 synthesis call (Sonnet 4.6): ~3000 input + 400 output → 3000×$3/1M + 400×$15/1M = $0.015
- 1 evaluation call (Haiku 4.5): ~3500 input + 300 output → 3500×$1/1M + 300×$5/1M = $0.005
- **Total: ~$0.02 per query**, well under the $20 hard limit.

## Critical files

| File | Change |
|------|--------|
| [LIBRAIN/Endpoints/QueryEndpoints.cs](LIBRAIN/Endpoints/QueryEndpoints.cs) | New file. Three records + `MapQueryEndpoints` extension method |
| [LIBRAIN/Program.cs](LIBRAIN/Program.cs) | Add `using LIBRAIN.Endpoints;` (top); add `app.MapQueryEndpoints();` near line 89 |

Reused without change:
- [SynthesisAgent](LIBRAIN/Agents/SynthesisAgent.cs), [EvaluatorAgent](LIBRAIN/Agents/EvaluatorAgent.cs), [SynthesisCitation](LIBRAIN/Agents/SynthesisResult.cs) — agent + DTO surface
- [OpenAIEmbeddingClient](LIBRAIN/Embeddings/OpenAIEmbeddingClient.cs) — single-string embed via existing `GenerateAsync(new[] { query }, ct)` form
- [QdrantPaperRepository.VectorSearchAsync](LIBRAIN/Storage/QdrantPaperRepository.cs) — already returns `IReadOnlyList<SearchHit>` matching agent input

## Commit plan (atomic, build + tests green between each)

**3 commits total** (bridge + implementation + push):

1. **`docs: phase 2 step 6 plan`** — bridge commit. Saves this plan into the repo at `LIBRAIN/docs/phase2-step6-plan.md`. Mirrors Step 5's `32a447d` pattern.

2. **`feat: add POST /api/query endpoint with embed→search→synth→evaluate pipeline`**
   - New file `LIBRAIN/Endpoints/QueryEndpoints.cs` (records + extension)
   - Edit `Program.cs` (one using + one map call)
   - `dotnet build` 0/0
   - `dotnet test` 19/19 still green (no new tests — endpoint is orchestration; testing it would require mocking 3 agents, brittle)

   **DTOs and endpoint together in one commit**: separating them breaks build-green between commits since the endpoint references the DTOs.

3. **(after smoke passes) `git push`** — push to `origin/main`. Not a commit, but the natural Step 6 close.

**Smoke result is paste-only** (in conversation), not a commit, unless the result is worth preserving as evidence.

Pre-commit pause for sign-off TWICE per commit (diff first, then build/test summary), per Phase 1 working agreement. No `Co-Authored-By` trailers. Bare conventional subjects.

## Verification

Per the working agreement, **no new automated tests** for the orchestrator — testing it would require mocking 3 agents, which produces brittle tests covering wiring rather than behavior. The two valuable test surfaces in Step 6 are:

1. **`dotnet build`** clean (0/0) at HEAD of each commit
2. **`dotnet test`** still 19/19 (no regressions)
3. **Live smoke test** against real Qdrant + real Anthropic API — the actual Phase 2 acceptance gate. Pass criteria in §6.

After commit 2 lands and smoke passes:
- Run a second smoke query that's **deliberately weak** (e.g. "What is the capital of France?") to verify the Evaluator drops `relevance` and `groundedness` scores correctly. Optional sanity check.

If the smoke uncovers a real defect (vs a tunable prompt issue), we fix in a follow-up commit. Tunable prompt issues are deferred to Phase 3 — Step 6 ships if the pipeline returns coherent output meeting the threshold.

## Time estimate

Plan is reviewable in ~5 min. Implementation ~30 min wall-clock for the coding session, plus ~10 min for smoke validation. Phase 2 close-out: ~45 min total.
