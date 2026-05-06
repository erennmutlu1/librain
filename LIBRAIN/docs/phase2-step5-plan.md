# Phase 2 Step 5 — Evaluator Agent

## Context

Phase 2 Step 4 (SynthesisAgent) shipped today: 411b127 → e5add10 → 7956a71, pushed to origin/main. 13/13 tests green. Pattern locked in: skeleton → SDK wrapper (commit 1, already in place from Step 4) → agent + records + co-located helper → pure-helper tests.

Step 5 (this plan) layers an **LLM-as-a-Judge** on top of synthesis: given a query, the hypothesis SynthesisAgent produced, and the same retrieved chunks, ask Claude **Haiku 4.5** to score and critique the hypothesis. The agent **returns** a score; it does **not** gate. The `/api/query` orchestrator (Step 6, next session) decides whether to surface, suppress, or retry based on the score — that policy is a Step 6 concern, not Step 5's.

Existing skeleton at [LIBRAIN/Agents/EvaluatorAgent.cs](LIBRAIN/Agents/EvaluatorAgent.cs) is the same 6-line placeholder. `AnthropicChatClient` is already singleton-registered from commit 411b127 — Step 5 just consumes it. So this step is **2 commits**, not 3 (no SDK wrapper to add).

## Pre-flight verification (done)

**Haiku 4.5 model constant** — probe-compiled against `~/.nuget/packages/anthropic.sdk/5.10.0/`:

| Check | Result |
|-------|--------|
| Symbol `Anthropic.SDK.Constants.AnthropicModels.Claude45Haiku` exists | ✅ confirmed via XML doc + probe build |
| Runtime string value | `"claude-haiku-4-5-20251001"` (Oct 2025 release, matches Haiku 4.5) |
| SDK version supports the model | Yes — no fallback to Haiku 3.5 needed, no SDK upgrade required |
| Naming convention | `Claude45Haiku` (matches `Claude46Sonnet` pattern from Step 4) — NOT `ClaudeHaiku45` or date-suffixed |

Use `AnthropicModels.Claude45Haiku` constant in code, not the raw string.

## Design

### 1. `EvaluatorAgent` class structure

Mirrors [LIBRAIN/Agents/SynthesisAgent.cs](LIBRAIN/Agents/SynthesisAgent.cs) exactly — sealed, primary ctor, BeginScope on entry, Stopwatch, `res.Usage.*Tokens` logged. Optional `correlationId` parameter so the Step 6 orchestrator can flow ONE id across reader/synth/evaluator log lines.

```csharp
public sealed class EvaluatorAgent(
    ILogger<EvaluatorAgent> logger,
    AnthropicChatClient claude)
{
    public async Task<EvaluationResult> EvaluateAsync(
        string query,
        string hypothesis,
        IReadOnlyList<SearchHit> chunks,
        Guid? correlationId = null,
        CancellationToken ct = default);
}
```

DI registration is already in place at [Program.cs:54](LIBRAIN/Program.cs#L54) (`AddScoped<EvaluatorAgent>()`) — no change.

### 2. Prompt strategy — what makes a good hypothesis judge

Standard LLM-as-a-Judge wisdom (RAGAS, TruLens, Anthropic's eval cookbook): **multi-dimensional scoring beats single-number scoring**. A judge asked for one global "quality" tends to halo-effect (good prose → high score even if claims are wrong). Forcing the judge to score independent dimensions reduces this.

Three dimensions, each independent and observable from the inputs:

| Dimension | Question the judge answers |
|-----------|----------------------------|
| **groundedness** | Are the claims in the hypothesis traceable to the cited sources, or fabricated? |
| **relevance** | Does the hypothesis answer the user's query, or drift to an adjacent topic? |
| **completeness** | Does the hypothesis integrate the relevant sources, or cherry-pick one and ignore others? |

**Aggregate** `quality_score = mean(groundedness, relevance, completeness)` — computed deterministically by the agent in C#, **NOT by Claude**. LLMs are bad at meta-aggregation; deterministic aggregation gives reproducible scores across runs and isolates each dimension for debugging when a hypothesis scores low.

**System prompt** (draft):

```
You are an evaluator for a research-synthesis system. You will be given a user
query, a hypothesis the system produced, and the source excerpts the system was
allowed to use. Your job is to score the hypothesis on three independent
dimensions, each on a 0.0–1.0 scale:

- groundedness: Does every claim in the hypothesis trace back to one of the
  cited sources? 1.0 = fully supported. 0.0 = fabricated or contradicted by
  sources. List specific unsupported claims in `unsupported_claims`.
- relevance: Does the hypothesis answer the user's query? 1.0 = directly
  addresses the question. 0.0 = drifts to an unrelated topic.
- completeness: Does the hypothesis integrate the available sources, or
  cherry-pick one and ignore others? 1.0 = uses all relevant sources well.
  0.0 = ignores most of the evidence. List missing evidence in
  `missing_evidence` (what would strengthen the hypothesis).

Be a strict, fair judge. A confident-sounding hypothesis with one fabricated
claim should score below 0.5 on groundedness regardless of how it reads.

Always call the `submit_evaluation` tool. Do not respond in plain text.
```

**User prompt template** — same numbered SOURCES format as SynthesisAgent so both agents see the same structure:

```
QUERY: {query}

HYPOTHESIS: {hypothesis}

SOURCES:
[1] {paperId} | {section} | p.{page}
{content}

[2] ...
```

Few-shot examples deferred until after Step 6 smoke testing surfaces a real failure mode worth shaping (premature optimization otherwise).

### 3. Tool schema — `submit_evaluation`

Same raw-JSON-schema approach as SynthesisAgent (Property type still has no Items field for arrays in 5.10):

```jsonc
{
  "type": "object",
  "properties": {
    "groundedness_score": { "type": "number", "description": "0.0 to 1.0. Are the hypothesis's claims supported by the cited sources?" },
    "relevance_score":    { "type": "number", "description": "0.0 to 1.0. Does the hypothesis answer the user's query?" },
    "completeness_score": { "type": "number", "description": "0.0 to 1.0. Does the hypothesis integrate the available sources?" },
    "critique":           { "type": "string", "description": "One paragraph qualitative summary of strengths and weaknesses." },
    "unsupported_claims": { "type": "array",  "items": { "type": "string" }, "description": "Specific claims in the hypothesis not backed by any cited source." },
    "missing_evidence":   { "type": "array",  "items": { "type": "string" }, "description": "What additional evidence would strengthen the hypothesis." }
  },
  "required": ["groundedness_score", "relevance_score", "completeness_score", "critique", "unsupported_claims", "missing_evidence"]
}
```

`ToolChoice = new ToolChoice { Type = ToolChoiceType.Tool, Name = "submit_evaluation" }`.

**Model + parameters** (verified):
- `Model = AnthropicModels.Claude45Haiku` — resolves to `"claude-haiku-4-5-20251001"`, confirmed by probe-compile
- `Temperature = 0.0m` — judging should be near-deterministic across runs (Synthesis was 0.2m for some creativity)
- `MaxTokens = 1024` — matches Synthesis; critique + scores fit easily

### 4. `EvaluationResult` record shape

New file [LIBRAIN/Agents/EvaluationResult.cs](LIBRAIN/Agents/EvaluationResult.cs), sibling to [SynthesisResult.cs](LIBRAIN/Agents/SynthesisResult.cs):

```csharp
public sealed record EvaluationResult(
    float QualityScore,         // mean of three sub-scores, [0,1]
    float GroundednessScore,    // [0,1]
    float RelevanceScore,       // [0,1]
    float CompletenessScore,    // [0,1]
    string Critique,
    IReadOnlyList<string> UnsupportedClaims,
    IReadOnlyList<string> MissingEvidence,
    Guid CorrelationId);
```

`QualityScore` is exposed at the top of the record because most callers will want the headline number; the three sub-scores are below it for inspection. This shape mirrors `SynthesisResult` (headline string + structured details + correlation id).

### 5. `EvaluationScoring` pure helper — the testable nub

Following the [SynthesisCitations](LIBRAIN/Agents/SynthesisAgent.cs#L168) precedent: **co-located in `EvaluatorAgent.cs`, public static**, so tests in `LIBRAIN.Tests` can reach it without `InternalsVisibleTo`. Two functions:

```csharp
public static class EvaluationScoring
{
    // Maps a raw JSON number (potentially null, NaN, out of range) to a [0,1] float.
    public static float Clamp01(double? raw);

    // Mean of three sub-scores. Each sub-score is assumed already clamped.
    public static float Aggregate(float groundedness, float relevance, float completeness);
}
```

Why `Clamp01` is non-trivial enough to test: Claude can return `1.5`, `-0.2`, or omit the field. A naïve `(float)raw.Value` blows up on null and silently propagates out-of-range values. The helper unifies that contract — and the contract is exactly what we want tests to pin.

**Test plan** (6 tests, mirror SynthesisCitations style):
1. `Clamp01_InRange_PassesThrough` — 0.0, 0.5, 1.0 round-trip
2. `Clamp01_BelowZero_ClampsToZero` — `-0.1` → `0f`
3. `Clamp01_AboveOne_ClampsToOne` — `1.5` → `1f`
4. `Clamp01_Null_ReturnsZero` — defensive default for a missing field
5. `Clamp01_NaN_ReturnsZero` — JSON `NaN` is non-conforming but defensive
6. `Aggregate_ThreeScores_ReturnsMean` — `(0.6, 0.9, 0.3)` → `0.6f` (within tolerance)

That's **19/19** tests at end of Step 5 (13 existing + 6 new).

### 6. Integration with Step 6 orchestrator

Step 6 (next session) will own this pipeline inside the `/api/query` handler:

```csharp
var correlationId = Guid.NewGuid();
var queryEmbedding = await embeddings.GenerateAsync(new[] { query }, ct);
var hits = await repo.VectorSearchAsync(queryEmbedding[0], topK, ct);
var synth = await synthesisAgent.SynthesizeAsync(query, hits, correlationId, ct);
var eval = await evaluatorAgent.EvaluateAsync(query, synth.Hypothesis, hits, correlationId, ct);
return new QueryResponse(synth, eval, correlationId);
```

**Key contract decisions Step 5 must commit to so Step 6 can wire cleanly**:
- Both agents accept the **same `correlationId`** parameter — confirmed (already in `SynthesisAgent.SynthesizeAsync`).
- Both agents see the **same `IReadOnlyList<SearchHit>`** — confirmed (Step 6 retrieves once and passes to both).
- Evaluator does **not** mutate or re-rank chunks — pure consumer.
- Evaluator does **not** call SynthesisAgent — they're peers, not nested. Step 6 owns the composition.

### 7. Error handling

| Case | Behaviour |
|------|-----------|
| `string.IsNullOrWhiteSpace(hypothesis)` | Return `EvaluationResult(0f, 0f, 0f, 0f, "No hypothesis to evaluate.", [], [], corrId)`, no Claude call, log Warning |
| `chunks.Count == 0` | Return `EvaluationResult(0f, 0f, 0f, 0f, "No sources provided to evaluate against.", [], [], corrId)`, no Claude call, log Warning. Defensive — Step 6 should have short-circuited upstream. |
| Anthropic API exception | Bubble up; `AnthropicChatClient` already logs `(model, exceptionType)` — Step 6 endpoint maps to 502 |
| No `ToolUseContent` in `res.Content` | Throw `InvalidOperationException` with correlationId; log `res.StopReason` at Warning (matches Synthesis precedent) |
| Score field missing or out of range | `EvaluationScoring.Clamp01` handles silently. Log Information if any sub-score was clamped (helps detect prompt-engineering regressions). |
| Empty `critique` string | Accept it. Don't fail — judging is best-effort and an empty critique is rare but legitimate. |
| Malformed `unsupported_claims` / `missing_evidence` array entries | Skip null/empty entries; keep valid strings (matches Synthesis precedent for `unsupported_claims`) |

`CancellationToken` threaded through to `claude.ChatAsync`.

## Critical files

| File | Change |
|------|--------|
| [LIBRAIN/Agents/EvaluatorAgent.cs](LIBRAIN/Agents/EvaluatorAgent.cs) | Replace skeleton with full agent + prompt + tool schema + co-located `EvaluationScoring` |
| [LIBRAIN/Agents/EvaluationResult.cs](LIBRAIN/Agents/EvaluationResult.cs) | New file, single record (sibling to `SynthesisResult.cs`) |
| [LIBRAIN.Tests/Agents/EvaluationScoringTests.cs](LIBRAIN.Tests/Agents/EvaluationScoringTests.cs) | New file, 6 tests on `EvaluationScoring.Clamp01` + `Aggregate` |

Reused without change: [AnthropicChatClient](LIBRAIN/Agents/AnthropicChatClient.cs) (singleton from commit 411b127), [SearchHit](LIBRAIN/Storage/SearchHit.cs), [SynthesisAgent](LIBRAIN/Agents/SynthesisAgent.cs) (precedent for prompt builder, tool definition pattern, error handling).

## Commit plan (atomic, build + tests green between each)

Two commits — `AnthropicChatClient` already exists, so no SDK-wrapper commit needed:

1. **`feat: implement EvaluatorAgent with tool-use scoring`**
   - New file `LIBRAIN/Agents/EvaluationResult.cs`
   - Replace `LIBRAIN/Agents/EvaluatorAgent.cs` skeleton with full agent + `EvaluationScoring` helper co-located
   - `dotnet build` clean (0/0); 13/13 tests still green (no new tests yet — proven by commit 2)

2. **`test: cover evaluation scoring`**
   - New file `LIBRAIN.Tests/Agents/EvaluationScoringTests.cs`, 6 tests
   - `dotnet test` shows **19/19** passing

Pre-commit pause for sign-off on every commit (twice — once on diff, once on summary), per Phase 1 working agreement. No `Co-Authored-By` trailers. Bare conventional subjects.

## Verification

Same gates as Step 4 — TDD covers the scoring helper only; the agent itself is orchestration and gets manual smoke after Step 6 wires `/api/query`.

1. **`dotnet build`** at HEAD of each commit — must be clean (0/0).
2. **`dotnet test`** at HEAD of each commit — final count **19/19** (7 chunker + 6 citation + 6 scoring).
3. **No live Anthropic API calls in this step.** Live smoke happens after Step 6 lands. At that point: query "How does RAG mitigate hallucination?" returns synthesis + non-zero evaluation; manually verify the three sub-scores look defensible (groundedness should be high since the synth cites the Lewis et al. RAG paper that's actually in Qdrant).
4. **Cost-telemetry log line** appears after first real call: `Evaluated hypothesis (q={QualityScore:F2} g={Groundedness:F2} r={Relevance:F2} c={Completeness:F2}; input={…} output={…} tokens) in {…}ms`.

## Time estimate

Plan is reviewable in ~5 min. Implementation tomorrow, two atomic commits with dual sign-offs each, similar pacing to Step 4 — ~30 min wall-clock for the coding session.
