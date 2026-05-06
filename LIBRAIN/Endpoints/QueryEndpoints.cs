using System.Diagnostics;
using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Storage;

namespace LIBRAIN.Endpoints;

public sealed record QueryRequest(
    string Query,
    int? TopK);

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

public static class QueryEndpoints
{
    private const int DefaultTopK = 5;
    private const int MinTopK = 1;
    private const int MaxTopK = 20;

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
        ILogger<Program> logger,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Query))
        {
            return Results.Problem(
                title: "Query is required",
                detail: "The 'query' field must be a non-empty string.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var topK = req.TopK ?? DefaultTopK;
        if (topK < MinTopK || topK > MaxTopK)
        {
            return Results.Problem(
                title: "topK out of range",
                detail: $"The 'topK' field must be between {MinTopK} and {MaxTopK}.",
                statusCode: StatusCodes.Status400BadRequest);
        }

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
            {
                logger.LogWarning("Vector search returned 0 hits");
                return Results.Problem(
                    title: "No relevant sources found",
                    detail: "Vector search returned no chunks for this query.",
                    statusCode: StatusCodes.Status404NotFound,
                    extensions: new Dictionary<string, object?> { ["correlationId"] = correlationId });
            }

            var synthesis = await synth.SynthesizeAsync(req.Query, hits, correlationId, ct);
            var evaluation = await eval.EvaluateAsync(req.Query, synthesis.Hypothesis, hits, correlationId, ct);

            logger.LogInformation(
                "Query handled (hits={HitCount}, quality={QualityScore:F2}) in {ElapsedMs}ms",
                hits.Count,
                evaluation.QualityScore,
                sw.ElapsedMilliseconds);

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
                "Query pipeline failed (elapsed={ElapsedMs}ms, exceptionType={ExceptionType})",
                sw.ElapsedMilliseconds,
                ex.GetType().Name);
            return Results.Problem(
                title: "Upstream API error",
                detail: $"The query pipeline failed: {ex.GetType().Name}",
                statusCode: StatusCodes.Status502BadGateway,
                extensions: new Dictionary<string, object?> { ["correlationId"] = correlationId });
        }
    }
}
