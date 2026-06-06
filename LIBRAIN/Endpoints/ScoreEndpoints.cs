using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Generation;
using LIBRAIN.Storage;

namespace LIBRAIN.Endpoints;

// Score an ARBITRARY hypothesis on the four-axis rubric using OpenAI only — cosine
// novelty (OpenAI embeddings) + plausibility/structural-coherence (OpenAI judge).
// Lets us score outputs not produced by LIBRAIN (PaperQA, Task 2) and run the
// scale-up (Task 3) with zero Anthropic dependency. NOTE: GPT-judged plausibility/
// coherence are NOT comparable to the pre-registered Haiku-judged tables; they are a
// self-consistent OpenAI-family scoring track.
public sealed record ScoreRequest(
    string Provider,        // "openai"
    string Model,           // judge model, e.g. "gpt-4o-mini"
    string Hypothesis,
    string? NovelClaim,
    string TopicA,
    string? TopicB,
    int? TopK);

public sealed record ScoreResponse(
    Guid CorrelationId,
    string Provider,
    string Model,
    DiscoveryEvaluation Evaluation,
    string Rationale);

public static class ScoreEndpoints
{
    private const int DefaultTopK = 5;

    private const string JudgeSystem = """
        You are an impartial scientific reviewer. Score the hypothesis on two
        independent 0.0–1.0 axes:
        - plausibility: does the claim follow logically from the supporting evidence and
          reasonable corpus context? 0.0 contradicts/unanchored, 1.0 tight inferential
          bridge, 0.5 borderline.
        - structural_coherence: is it a well-formed, testable, falsifiable statement?
          0.0 vague/untestable, 1.0 precise and experiment-ready.
        Be strict; use the full continuous range. Respond with ONLY a JSON object:
        {"plausibility": 0.0, "structural_coherence": 0.0, "rationale": "1-2 sentences"}
        """;

    public static void MapScoreEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/score", HandleAsync);
    }

    private static async Task<IResult> HandleAsync(
        ScoreRequest req,
        OpenAIEmbeddingClient embeddings,
        QdrantPaperRepository repo,
        NoveltyScorer noveltyScorer,
        OpenAIChatClient openai,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Hypothesis))
            return Results.Problem(title: "hypothesis is required", statusCode: StatusCodes.Status400BadRequest);
        if (!string.Equals(req.Provider, "openai", StringComparison.OrdinalIgnoreCase))
            return Results.Problem(title: "unsupported provider", detail: "score supports provider='openai'.",
                statusCode: StatusCodes.Status400BadRequest);

        var corrId = Guid.NewGuid();
        var topK = req.TopK ?? DefaultTopK;
        var topicA = req.TopicA.Trim();
        var topicB = string.IsNullOrWhiteSpace(req.TopicB) ? null : req.TopicB!.Trim();
        var novelClaim = string.IsNullOrWhiteSpace(req.NovelClaim) ? req.Hypothesis : req.NovelClaim!;

        var sw = Stopwatch.StartNew();
        try
        {
            // Novelty: deterministic cosine distance to the corpus (OpenAI embeddings).
            var novelty = await noveltyScorer.ScoreAsync(novelClaim, ct);

            // Retrieve evidence context for the judge.
            var topicTexts = topicB is null ? new[] { topicA } : new[] { topicA, topicB };
            var emb = await embeddings.GenerateAsync(topicTexts, ct);
            var hitsA = await repo.VectorSearchAsync(emb[0], topK, ct);
            var hitsB = topicB is null ? Array.Empty<SearchHit>() : await repo.VectorSearchAsync(emb[1], topK, ct);
            var seen = new HashSet<(string, int)>();
            var dedup = new List<SearchHit>();
            foreach (var h in hitsA) if (seen.Add((h.PaperId, h.ChunkIndex))) dedup.Add(h);
            foreach (var h in hitsB) if (seen.Add((h.PaperId, h.ChunkIndex))) dedup.Add(h);

            var (text, _, _) = await openai.CompleteAsync(JudgeSystem, BuildJudgePrompt(req.Hypothesis, novelClaim, dedup), req.Model, 0.0f, ct);
            var node = NaiveRagCitations.ExtractJsonObject(text) is string js ? JsonNode.Parse(js) : null;
            var plausibility = EvaluationScoring.Clamp01(node?["plausibility"]?.GetValue<double>());
            var coherence = EvaluationScoring.Clamp01(node?["structural_coherence"]?.GetValue<double>());
            var rationale = node?["rationale"]?.GetValue<string>() ?? string.Empty;

            var eval = DiscoveryScoring.Aggregate(novelty, plausibility, coherence);
            logger.LogInformation(
                "Score ({Model}): novelty={N:F4} plausibility={P:F2} coherence={C:F2} quality={Q:F4} in {Ms}ms (corr={Corr})",
                req.Model, eval.NoveltyScore, eval.PlausibilityScore, eval.StructuralCoherenceScore, eval.QualityScore, sw.ElapsedMilliseconds, corrId);

            return Results.Ok(new ScoreResponse(corrId, req.Provider, req.Model, eval, rationale));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Score failed ({Type}) in {Ms}ms", ex.GetType().Name, sw.ElapsedMilliseconds);
            return Results.Problem(title: "score failed", detail: $"{ex.GetType().Name}: {ex.Message}",
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    private static string BuildJudgePrompt(string hypothesis, string novelClaim, IReadOnlyList<SearchHit> chunks)
    {
        var sb = new StringBuilder();
        sb.Append("HYPOTHESIS: ").AppendLine(hypothesis);
        sb.AppendLine();
        sb.Append("NOVEL CLAIM: ").AppendLine(novelClaim);
        sb.AppendLine();
        sb.AppendLine("SUPPORTING EVIDENCE:");
        for (int i = 0; i < chunks.Count; i++)
        {
            var c = chunks[i];
            sb.Append('[').Append(i + 1).Append("] ").Append(c.PaperId);
            if (c.Section is not null) sb.Append(" | ").Append(c.Section);
            sb.AppendLine();
            sb.AppendLine(c.Content);
            sb.AppendLine();
        }
        return sb.ToString();
    }
}
